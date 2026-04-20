import winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp(), errors({ stack: true }), json()),
  defaultMeta: { service: 'green-market-api' },
  transports: [
    process.env.NODE_ENV === 'production'
      ? new winston.transports.Console()
      : new winston.transports.Console({
          format: combine(colorize(), simple()),
        }),
  ],
});

export const securityLog = (event: string, meta: Record<string, unknown>) =>
  logger.warn(`[SECURITY] ${event}`, meta);

export const auditLog = (event: string, meta: Record<string, unknown>) =>
  logger.info(`[AUDIT] ${event}`, meta);
