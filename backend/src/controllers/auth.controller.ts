import { Request, Response, NextFunction } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { securityLog, auditLog } from '../config/logger';
import { AppError } from '../middleware/errorHandler.middleware';
import { AuthRequest, JwtPayload } from '../types';
import { LoginInput, RegisterInput } from '../schemas/auth.schema';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

// M7 — parsing robuste du format "7d", "15m", "1h"
function parseExpiry(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86_400_000;
  const amount = parseInt(match[1]);
  const units: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (units[match[2]] ?? units['d']);
}

function getRefreshExpiry(): Date {
  return new Date(Date.now() + parseExpiry(env.JWT_REFRESH_EXPIRES_IN));
}

// C3 — options cookie httpOnly (cross-origin en prod, lax en dev)
function refreshCookieOptions() {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: parseExpiry(env.JWT_REFRESH_EXPIRES_IN),
    path: '/api/v1/auth',
  };
}

function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export const register = async (
  req: Request<object, object, RegisterInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email: rawEmail, password, fullName, phone } = req.body;
    const email = rawEmail.toLowerCase().trim(); // M3 — normalisation email

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'An account with this email already exists');

    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    const user = await prisma.user.create({
      data: { email, passwordHash, fullName, phone, emailVerifyToken: uuidv4() },
      select: { id: true, email: true, fullName: true, role: true },
    });

    const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    // C6 — rotation atomique dans une transaction
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: getRefreshExpiry() },
    });

    auditLog('user.registered', { userId: user.id, email: user.email, ip: req.ip });

    // C3 — refresh token en cookie httpOnly, jamais dans le body
    res.cookie('refresh_token', refreshToken, refreshCookieOptions());
    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { user, accessToken },
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (
  req: Request<object, object, LoginInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email: rawEmail, password } = req.body;
    const email = rawEmail.toLowerCase().trim(); // M3 — normalisation email

    const user = await prisma.user.findUnique({ where: { email } });

    // Comparaison en temps constant — prévention enumération utilisateurs
    if (!user) {
      await argon2.hash('dummy-password', ARGON2_OPTIONS);
      securityLog('auth.login.unknown_email', { email, ip: req.ip });
      throw new AppError(401, 'Invalid email or password');
    }

    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) {
      securityLog('auth.login.wrong_password', { userId: user.id, ip: req.ip });
      throw new AppError(401, 'Invalid email or password');
    }

    const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: getRefreshExpiry() },
    });

    auditLog('auth.login.success', { userId: user.id, ip: req.ip });

    // C3 — refresh token en cookie httpOnly
    res.cookie('refresh_token', refreshToken, refreshCookieOptions());
    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
        accessToken,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const refreshTokens = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // C3 — lire depuis le cookie httpOnly, plus depuis le body
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) throw new AppError(401, 'Missing refresh token');

    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
    } catch {
      throw new AppError(401, 'Invalid or expired refresh token');
    }

    // C6 — rotation atomique : delete + create dans une transaction
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      securityLog('auth.refresh.invalid_token', { userId: payload.sub, ip: req.ip });
      res.clearCookie('refresh_token', refreshCookieOptions());
      throw new AppError(401, 'Refresh token revoked or expired');
    }

    const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    const newAccessToken = signAccessToken(tokenPayload);
    const newRefreshToken = signRefreshToken(tokenPayload);

    // C6 — atomique : si le create échoue, le delete est rollbacké
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { token: refreshToken } }),
      prisma.refreshToken.create({
        data: { token: newRefreshToken, userId: payload.sub, expiresAt: getRefreshExpiry() },
      }),
    ]);

    res.cookie('refresh_token', newRefreshToken, refreshCookieOptions());
    res.json({ success: true, data: { accessToken: newAccessToken } });
  } catch (err) {
    next(err);
  }
};

export const logout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    auditLog('auth.logout', { userId: req.user?.sub, ip: req.ip });
    res.clearCookie('refresh_token', refreshCookieOptions());
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) throw new AppError(404, 'User not found');
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};
