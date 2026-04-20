import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { logger } from './config/logger';
import { apiLimiter } from './middleware/rateLimiter.middleware';
import { errorHandler } from './middleware/errorHandler.middleware';

import authRoutes from './routes/auth.routes';
import productRoutes from './routes/products.routes';
import orderRoutes from './routes/orders.routes';
import subscriptionRoutes from './routes/subscriptions.routes';
import adminRoutes from './routes/admin.routes';

const app = express();

// M1 — trust proxy : req.ip retourne l'IP réelle derrière Nginx/ALB
// (indispensable pour que le rate limiter par IP soit efficace)
app.set('trust proxy', 1);

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  ...env.CORS_ORIGINS.split(',').map((o) => o.trim()),
  ...(env.BASE44_FRONTEND_URL ? [env.BASE44_FRONTEND_URL] : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin && env.NODE_ENV === 'development') return callback(null, true);
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    credentials: true, // requis pour les cookies httpOnly cross-origin
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Cookie Parser (C3 — httpOnly refresh token) ─────────────────────────────
app.use(cookieParser());

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// Stripe webhooks nécessitent le body brut — avant express.json()
app.use('/api/v1/orders/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Global Rate Limiting ─────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Health Check (M8 — ne pas exposer NODE_ENV) ─────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/admin', adminRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start + Graceful Shutdown (M10) ─────────────────────────────────────────
const server = app.listen(env.PORT, () => {
  logger.info(`Green Market API running on port ${env.PORT}`, { env: env.NODE_ENV });
});

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Server closed, DB disconnected');
    process.exit(0);
  });
  // Force exit si les connexions ne se ferment pas dans les 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
