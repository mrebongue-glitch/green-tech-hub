import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { auditLog, securityLog, logger } from '../config/logger';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler.middleware';
import type { PaymentMethod } from '@prisma/client';

const NOTCHPAY_API = 'https://api.notchpay.co';

const PLAN_PRICES: Record<string, number> = {
  BASIC: 5_000,
  PREMIUM: 15_000,
  ENTERPRISE: 50_000,
};

// ── Types internes ────────────────────────────────────────────────────────────

interface NotchpayTransaction {
  reference: string;
  status: 'pending' | 'complete' | 'failed' | 'canceled' | 'expired';
  amount: number;
  currency: string;
  channel?: string; // "cm.orange" | "cm.mtn" | "card"
  customer?: { email?: string; phone?: string };
  metadata?: Record<string, string>;
}

interface NotchpayWebhookPayload {
  event: string;
  data: NotchpayTransaction;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function notchpayFetch<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!env.NOTCHPAY_PUBLIC_KEY) {
    throw new AppError(503, 'Notchpay is not configured on this server');
  }

  const res = await fetch(`${NOTCHPAY_API}${path}`, {
    method,
    headers: {
      Authorization: env.NOTCHPAY_PUBLIC_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = (await res.json()) as T & { message?: string };
  if (!res.ok) {
    throw new AppError(502, `Notchpay: ${(json as { message?: string }).message ?? res.statusText}`);
  }
  return json;
}

// ── Normalise le numéro Cameroun vers 237XXXXXXXXX ───────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/^\+/, '').replace(/^0/, '237');
}

// Hint d'affichage — jamais stocker le numéro complet
function phoneHint(normalized: string): string {
  return `****${normalized.slice(-4)}`;
}

// ── Initialiser un paiement Mobile Money ─────────────────────────────────────

export async function initializeNotchpayPayment(params: {
  userId: string;
  plan: 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
  paymentMethod: 'ORANGE_MONEY' | 'MTN_MOBILE_MONEY';
  email: string;
  phone: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ authorizationUrl: string; paymentId: string }> {
  const { userId, plan, paymentMethod, email, phone, successUrl, cancelUrl } = params;

  const amountXaf = PLAN_PRICES[plan];
  if (!amountXaf) throw new AppError(400, 'Plan invalide');

  const normalized = normalizePhone(phone);

  // 1. Créer le Payment PENDING en base — son ID servira de référence traçable
  const payment = await prisma.payment.create({
    data: {
      userId,
      provider: 'NOTCHPAY',
      method: paymentMethod as PaymentMethod,
      amountXaf,
      phoneHint: phoneHint(normalized),
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    },
  });

  // 2. Appel Notchpay — référence unique basée sur notre ID interne
  const notchpayRef = `gmt-${payment.id}`;

  const response = await notchpayFetch<{
    status: string;
    transaction: NotchpayTransaction & { authorization_url: string };
  }>('POST', '/payments/initialize', {
    email,
    phone: normalized,
    currency: 'XAF',
    amount: amountXaf,
    description: `Green Market ${plan} — Abonnement mensuel`,
    reference: notchpayRef,
    // Notchpay envoie le webhook à cette URL après confirmation
    callback: `${env.BACKEND_URL}/webhook/notchpay`,
    return_url: successUrl,
    // Métadonnées transmises dans le webhook pour reconstituer l'abonnement
    metadata: { userId, plan, paymentId: payment.id },
  });

  // 3. Mettre à jour le Payment avec la référence Notchpay
  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerRef: response.transaction.reference },
  });

  auditLog('notchpay.payment.initialized', {
    userId,
    plan,
    paymentId: payment.id,
    notchpayRef: response.transaction.reference,
  });

  return {
    authorizationUrl: response.transaction.authorization_url,
    paymentId: payment.id,
  };
}

// ── Vérifier le statut d'un paiement (polling frontend) ──────────────────────

export async function verifyNotchpayPayment(reference: string): Promise<NotchpayTransaction> {
  const response = await notchpayFetch<{ status: string; transaction: NotchpayTransaction }>(
    'GET',
    `/payments/${reference}`
  );
  return response.transaction;
}

// ── Traiter le webhook Notchpay ───────────────────────────────────────────────

export async function handleNotchpayWebhook(rawBody: Buffer, signature: string): Promise<void> {
  if (!env.NOTCHPAY_HASH_KEY) {
    throw new AppError(503, 'Notchpay webhook secret not configured');
  }

  // Vérification HMAC-SHA256
  const expected = crypto
    .createHmac('sha256', env.NOTCHPAY_HASH_KEY)
    .update(rawBody)
    .digest('hex');

  const received = signature.replace(/^sha256=/, '');

  if (
    received.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
  ) {
    securityLog('notchpay.webhook.invalid_signature', { signaturePrefix: signature.slice(0, 20) });
    throw new AppError(400, 'Webhook signature invalide');
  }

  const payload = JSON.parse(rawBody.toString()) as NotchpayWebhookPayload;
  auditLog('notchpay.webhook.received', { event: payload.event, ref: payload.data.reference });

  const { event, data } = payload;

  if (event === 'payment.complete' && data.status === 'complete') {
    await handlePaymentSuccess(data);
  } else if (
    event === 'payment.failed' ||
    data.status === 'failed' ||
    data.status === 'canceled' ||
    data.status === 'expired'
  ) {
    await handlePaymentFailure(data);
  }
}

// ── Paiement confirmé → activer l'abonnement ─────────────────────────────────

async function handlePaymentSuccess(trx: NotchpayTransaction): Promise<void> {
  const { userId, plan, paymentId } = trx.metadata ?? {};

  if (!userId || !plan || !paymentId) {
    logger.warn('notchpay.webhook: métadonnées manquantes', { ref: trx.reference });
    return;
  }

  // Idempotence : ne pas créer deux fois si le webhook est rejoué
  const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (existing?.status === 'SUCCESS') {
    logger.info('notchpay.webhook: paiement déjà traité', { paymentId });
    return;
  }

  const method: PaymentMethod = trx.channel?.includes('orange')
    ? 'ORANGE_MONEY'
    : 'MTN_MOBILE_MONEY';

  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 1);

  // Créer l'abonnement ACTIVE
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      plan: plan as 'BASIC' | 'PREMIUM' | 'ENTERPRISE',
      status: 'ACTIVE',
      paymentMethod: method,
      notchpayRef: trx.reference,
      startDate: now,
      endDate,
      priceXaf: trx.amount,
    },
  });

  // Mettre à jour le Payment
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'SUCCESS',
      subscriptionId: subscription.id,
      providerRef: trx.reference,
      method,
      paidAt: now,
      webhookPayload: trx as object,
    },
  });

  auditLog('subscription.activated.notchpay', {
    userId,
    plan,
    subscriptionId: subscription.id,
    method,
  });
}

// ── Paiement échoué / annulé ──────────────────────────────────────────────────

async function handlePaymentFailure(trx: NotchpayTransaction): Promise<void> {
  const { paymentId } = trx.metadata ?? {};
  if (!paymentId) return;

  const statusMap: Record<string, 'FAILED' | 'CANCELLED' | 'EXPIRED'> = {
    failed: 'FAILED',
    canceled: 'CANCELLED',
    expired: 'EXPIRED',
  };

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: statusMap[trx.status] ?? 'FAILED',
      failureReason: `Notchpay status: ${trx.status}`,
      webhookPayload: trx as object,
    },
  });

  auditLog('notchpay.payment.failed', { paymentId, status: trx.status, ref: trx.reference });
}
