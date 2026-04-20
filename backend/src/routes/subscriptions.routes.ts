import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { checkoutLimiter, verifyPaymentLimiter } from '../middleware/rateLimiter.middleware';
import { createSubscriptionPaymentIntent } from '../services/stripe.service';
import { initializeNotchpayPayment, verifyNotchpayPayment } from '../services/notchpay.service';
import { AppError } from '../middleware/errorHandler.middleware';
import { auditLog, securityLog } from '../config/logger';
import { AuthRequest } from '../types';
import { env } from '../config/env';

const router = Router();
router.use(authenticate);

const checkoutSchema = z.object({
  body: z
    .object({
      plan: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE']),
      paymentMethod: z.enum(['CARD', 'ORANGE_MONEY', 'MTN_MOBILE_MONEY']),
      phone: z
        .string()
        .regex(/^(\+?237)?6\d{8}$/, 'Numéro camerounais invalide (ex: 237671234567)')
        .optional(),
    })
    .refine(
      (d) => d.paymentMethod === 'CARD' || !!d.phone,
      { message: 'Le numéro de téléphone est requis pour Mobile Money', path: ['phone'] }
    ),
});

// GET /subscriptions/my
router.get('/my', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user!.sub, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: sub });
  } catch (err) {
    next(err);
  }
});

// POST /subscriptions/checkout
router.post(
  '/checkout',
  checkoutLimiter,
  validate(checkoutSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { plan, paymentMethod, phone } = req.body as {
        plan: 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
        paymentMethod: 'CARD' | 'ORANGE_MONEY' | 'MTN_MOBILE_MONEY';
        phone?: string;
      };

      auditLog('subscription.checkout.attempt', {
        userId: req.user!.sub,
        plan,
        paymentMethod,
        ip: req.ip,
      });

      const existing = await prisma.subscription.findFirst({
        where: { userId: req.user!.sub, status: 'ACTIVE' },
      });
      if (existing) throw new AppError(409, 'Vous avez déjà un abonnement actif');

      // Expire any stale PENDING payments for this user (timed out Mobile Money sessions)
      await prisma.payment.updateMany({
        where: {
          userId: req.user!.sub,
          status: 'PENDING',
          expiresAt: { lt: new Date() },
        },
        data: { status: 'EXPIRED' },
      });

      if (paymentMethod === 'CARD') {
        // Stripe Elements — formulaire embarqué, pas de redirection
        const { clientSecret } = await createSubscriptionPaymentIntent(req.user!.sub, plan);
        return res.json({ success: true, data: { clientSecret, provider: 'STRIPE' } });
      }

      const origin = env.BASE44_FRONTEND_URL ?? env.CORS_ORIGINS.split(',')[0].trim();
      const successUrl = `${origin}/#/subscription?success=true`;
      const cancelUrl  = `${origin}/#/subscription?cancelled=true`;

      const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
      if (!user) throw new AppError(404, 'Utilisateur introuvable');

      const { authorizationUrl, paymentId } = await initializeNotchpayPayment({
        userId: req.user!.sub,
        plan,
        paymentMethod,
        email: user.email,
        phone: phone!,
        successUrl,
        cancelUrl,
      });

      return res.status(201).json({
        success: true,
        data: { checkoutUrl: authorizationUrl, provider: 'NOTCHPAY', paymentId },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /subscriptions/verify-payment?paymentId=xxx
router.get('/verify-payment', verifyPaymentLimiter, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { paymentId } = req.query as { paymentId?: string };
    if (!paymentId) throw new AppError(400, 'paymentId requis');

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { subscription: true },
    });
    if (!payment) throw new AppError(404, 'Paiement introuvable');

    // C4 — IDOR: only the payment owner may query its status
    if (payment.userId !== req.user!.sub) {
      securityLog('subscription.verify_payment.idor_attempt', {
        requestingUserId: req.user!.sub,
        paymentId,
        paymentOwnerId: payment.userId,
        ip: req.ip,
      });
      throw new AppError(403, 'Accès refusé');
    }

    if (payment.status === 'PENDING' && payment.providerRef && payment.provider === 'NOTCHPAY') {
      try {
        const trx = await verifyNotchpayPayment(payment.providerRef);
        return res.json({
          success: true,
          data: {
            status: trx.status === 'complete' ? 'SUCCESS' : trx.status.toUpperCase(),
            subscription: payment.subscription,
          },
        });
      } catch { /* Notchpay unreachable — fall through to DB status */ }
    }

    res.json({ success: true, data: { status: payment.status, subscription: payment.subscription } });
  } catch (err) {
    next(err);
  }
});

// DELETE /subscriptions/cancel
router.delete('/cancel', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user!.sub, status: 'ACTIVE' },
    });
    if (!sub) throw new AppError(404, 'Aucun abonnement actif');

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    res.json({ success: true, message: 'Abonnement annulé' });
  } catch (err) {
    next(err);
  }
});

export default router;
