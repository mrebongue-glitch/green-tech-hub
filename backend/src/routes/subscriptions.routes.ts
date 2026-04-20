import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { z } from 'zod';
import { createCheckoutSession } from '../services/stripe.service';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler.middleware';
import { env } from '../config/env';

const router = Router();

router.use(authenticate);

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

router.post(
  '/checkout',
  validate(
    z.object({ body: z.object({ plan: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE']) }) })
  ),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { plan } = req.body as { plan: 'BASIC' | 'PREMIUM' | 'ENTERPRISE' };

      const existing = await prisma.subscription.findFirst({
        where: { userId: req.user!.sub, status: 'ACTIVE' },
      });
      if (existing) throw new AppError(409, 'You already have an active subscription');

      const origin = env.BASE44_FRONTEND_URL ?? env.CORS_ORIGINS.split(',')[0];
      const url = await createCheckoutSession(
        req.user!.sub,
        plan,
        `${origin}/subscription?success=true`,
        `${origin}/subscription?cancelled=true`
      );

      res.json({ success: true, data: { checkoutUrl: url } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
