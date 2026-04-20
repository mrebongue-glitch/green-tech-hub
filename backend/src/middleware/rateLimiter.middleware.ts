import rateLimit from 'express-rate-limit';

const createLimiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    skipSuccessfulRequests: false,
  });

// Strict limiter for auth endpoints (brute-force protection)
export const authLimiter = createLimiter(
  15 * 60 * 1000, // 15 minutes
  10,
  'Too many authentication attempts. Please try again in 15 minutes.'
);

// General API limiter
export const apiLimiter = createLimiter(
  60 * 1000,  // 1 minute
  60,
  'Too many requests. Please slow down.'
);

// Strict limiter for password reset
export const passwordResetLimiter = createLimiter(
  60 * 60 * 1000, // 1 hour
  5,
  'Too many password reset attempts. Please try again in 1 hour.'
);

// Strict limiter for checkout / payment initialization (anti-abuse, anti-enumeration)
export const checkoutLimiter = createLimiter(
  60 * 60 * 1000, // 1 hour
  5,
  'Too many payment attempts. Please try again in 1 hour.'
);

// Strict limiter for Notchpay payment status polling
export const verifyPaymentLimiter = createLimiter(
  60 * 1000, // 1 minute
  30,
  'Too many polling requests. Please slow down.'
);

// Stripe webhook: no rate limit (Stripe has its own retry logic)
