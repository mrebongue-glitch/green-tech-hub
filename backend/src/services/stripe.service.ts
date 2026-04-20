import Stripe from 'stripe';
import { prisma } from '../config/prisma';
import { auditLog, securityLog } from '../config/logger';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler.middleware';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const SUBSCRIPTION_PRICES: Record<string, { xaf: number }> = {
  BASIC: { xaf: 5000 },
  PREMIUM: { xaf: 15000 },
  ENTERPRISE: { xaf: 50000 },
};

export async function createCheckoutSession(
  userId: string,
  plan: 'BASIC' | 'PREMIUM' | 'ENTERPRISE',
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const planConfig = SUBSCRIPTION_PRICES[plan];
  if (!planConfig) throw new AppError(400, 'Invalid plan');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: 'xaf',
            // XAF est une devise zéro-décimale chez Stripe — pas de conversion en centimes
            unit_amount: planConfig.xaf,
            recurring: { interval: 'month' },
            product_data: {
              name: `Green Market ${plan} Plan`,
              description: `Monthly ${plan.toLowerCase()} subscription`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { userId, plan },
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    // M2 — idempotency key : évite les sessions dupliquées en cas de retry
    { idempotencyKey: `checkout_${userId}_${plan}_${new Date().toISOString().slice(0, 7)}` }
  );

  auditLog('stripe.checkout.created', { userId, plan, sessionId: session.id });
  return session.url!;
}

// Subscription payment via Stripe Elements (formulaire embarqué — pas de redirection)
export async function createSubscriptionPaymentIntent(
  userId: string,
  plan: 'BASIC' | 'PREMIUM' | 'ENTERPRISE'
): Promise<{ clientSecret: string }> {
  const planConfig = SUBSCRIPTION_PRICES[plan];
  if (!planConfig) throw new AppError(400, 'Invalid plan');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: planConfig.xaf,
      currency: 'xaf',
      receipt_email: user.email,
      // M2 — type 'subscription' pour différencier dans le webhook
      metadata: { userId, plan, type: 'subscription' },
      description: `Green Market ${plan} Plan — Abonnement mensuel`,
    },
    // M2 — même PaymentIntent si retry dans le même mois
    { idempotencyKey: `sub_elements_${userId}_${plan}_${new Date().toISOString().slice(0, 7)}` }
  );

  auditLog('stripe.subscription_payment_intent.created', {
    userId,
    plan,
    paymentIntentId: paymentIntent.id,
  });

  return { clientSecret: paymentIntent.client_secret! };
}

export async function createPaymentIntent(
  orderId: string,
  requestingUserId: string // C4 — ownership obligatoire
): Promise<{ clientSecret: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });
  if (!order) throw new AppError(404, 'Order not found');

  // C4 — vérification IDOR : l'utilisateur ne peut payer que ses propres commandes
  if (order.userId !== requestingUserId) {
    securityLog('stripe.idor_attempt', {
      requestingUserId,
      orderId,
      orderOwnerId: order.userId,
    });
    throw new AppError(403, 'You do not own this order');
  }

  if (order.paymentStatus === 'PAID') throw new AppError(400, 'Order already paid');

  // M9 — XAF est zéro-décimale : pas de conversion en centimes
  const amountXaf = Math.round(Number(order.totalAmount));

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountXaf,
      currency: order.currency.toLowerCase(),
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
      receipt_email: order.user.email,
    },
    // M2 — idempotency key : un seul PaymentIntent par commande, même en cas de retry
    { idempotencyKey: `order_pay_${order.id}` }
  );

  await prisma.order.update({
    where: { id: orderId },
    data: { stripePaymentId: paymentIntent.id },
  });

  auditLog('stripe.payment_intent.created', {
    orderId,
    userId: requestingUserId,
    amount: amountXaf,
    currency: order.currency,
  });

  return { clientSecret: paymentIntent.client_secret! };
}

export async function handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    securityLog('stripe.webhook.invalid_signature', { signaturePrefix: signature.slice(0, 20) });
    throw new AppError(400, 'Webhook signature verification failed');
  }

  auditLog('stripe.webhook.received', { type: event.type, id: event.id });

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;

      if (pi.metadata?.type === 'subscription') {
        // Paiement d'abonnement via Stripe Elements
        const { userId, plan } = pi.metadata;
        if (userId && plan) {
          // M2 — idempotence : ne pas créer deux fois si webhook rejoué
          const existing = await prisma.payment.findUnique({ where: { providerRef: pi.id } });
          if (!existing) {
            const now = new Date();
            const endDate = new Date(now);
            endDate.setMonth(endDate.getMonth() + 1);
            const amountXaf = SUBSCRIPTION_PRICES[plan]?.xaf ?? 0;

            const subscription = await prisma.subscription.create({
              data: {
                userId,
                plan: plan as 'BASIC' | 'PREMIUM' | 'ENTERPRISE',
                status: 'ACTIVE',
                paymentMethod: 'CARD',
                startDate: now,
                endDate,
                priceXaf: amountXaf,
              },
            });

            await prisma.payment.create({
              data: {
                userId,
                subscriptionId: subscription.id,
                provider: 'STRIPE',
                method: 'CARD',
                amountXaf,
                providerRef: pi.id,
                status: 'SUCCESS',
                paidAt: now,
                webhookPayload: { paymentIntentId: pi.id } as object,
              },
            });

            auditLog('subscription.activated.stripe.elements', {
              userId,
              plan,
              subscriptionId: subscription.id,
            });
          }
        }
      } else {
        // Paiement de commande classique
        await prisma.order.updateMany({
          where: { stripePaymentId: pi.id },
          data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
        });
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (!pi.metadata?.type) {
        await prisma.order.updateMany({
          where: { stripePaymentId: pi.id },
          data: { paymentStatus: 'FAILED' },
        });
      }
      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const { userId, plan } = session.metadata ?? {};
      if (userId && plan) {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        const amountXaf = SUBSCRIPTION_PRICES[plan].xaf;

        const subscription = await prisma.subscription.create({
          data: {
            userId,
            plan: plan as 'BASIC' | 'PREMIUM' | 'ENTERPRISE',
            status: 'ACTIVE',
            paymentMethod: 'CARD',
            stripeSubId: session.subscription as string,
            startDate: now,
            endDate,
            priceXaf: amountXaf,
          },
        });

        await prisma.payment.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            provider: 'STRIPE',
            method: 'CARD',
            amountXaf,
            providerRef: session.id,
            providerSubRef: session.subscription as string,
            status: 'SUCCESS',
            paidAt: now,
            webhookPayload: { sessionId: session.id } as object,
          },
        });

        auditLog('subscription.activated.stripe', { userId, plan, subscriptionId: subscription.id });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubId: sub.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      break;
    }
  }
}
