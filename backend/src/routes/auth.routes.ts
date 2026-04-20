import { Router } from 'express';
import {
  register,
  login,
  refreshTokens,
  logout,
  getMe,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter.middleware';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
} from '../schemas/auth.schema';

const router = Router();

// C3 — le refresh token est lu depuis le cookie httpOnly, aucun body schema requis
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/refresh', refreshTokens);        // lit req.cookies.refresh_token
router.post('/logout', authenticate, logout);  // efface le cookie + révoque en DB
router.get('/me', authenticate, getMe);

router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  (_req, res) =>
    res.json({ success: true, message: 'If that email exists, a reset link was sent' })
);

export default router;
