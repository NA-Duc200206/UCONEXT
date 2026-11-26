import express, { Express, Request } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import path from 'path';

import { createHttpLogger } from './config/logger';
import { redisClient } from './config/redis';
import { isOriginAllowed, parseAllowedOrigins } from './config/security';
import authRoutes from './routes/authRoutes';
import categoryRoutes from './routes/categoryRoutes';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import paymentRoutes from './routes/paymentRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import couponRoutes from './routes/couponRoutes';
import uploadRoutes from './routes/uploadRoutes';
import reviewRoutes from './routes/reviewRoutes';
import wishlistRoutes from './routes/wishlistRoutes';
import aiRoutes from './routes/aiRoutes';
import { errorHandler } from './middleware/errorHandler';
import { getTrustedClientIp, globalLimiter, parseTrustProxyHops } from './middleware/rateLimits';

export interface CreateAppOptions {
  disableRateLimit?: boolean;
}

function isInternalRequest(req: Request): boolean {
  const readyToken = process.env.HEALTH_READY_TOKEN?.trim();
  if (readyToken && req.headers['x-health-token'] === readyToken) {
    return true;
  }

  const ip = getTrustedClientIp(req);
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  ) {
    return true;
  }

  return false;
}

export function createCorsOriginValidator() {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = parseAllowedOrigins();

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    if (isOriginAllowed(origin, allowedOrigins, isProduction)) {
      return callback(null, true);
    }
    const error: any = new Error(`Origin "${origin}" is not allowed by CORS.`);
    error.statusCode = 403;
    return callback(error);
  };
}

export function createApp(opts: CreateAppOptions = {}): Express {
  const app = express();
  const corsOriginValidator = createCorsOriginValidator();

  const trustProxyHops = parseTrustProxyHops();
  if (trustProxyHops !== false) {
    app.set('trust proxy', trustProxyHops);
  }

  // Security and Utility Middlewares
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(
    cors({
      origin: corsOriginValidator,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(createHttpLogger());

  // Static files for uploads
  app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

  // Global API rate limit
  if (!opts.disableRateLimit) {
    app.use('/api', globalLimiter);
  }

  // Routing
  app.use('/api/auth', authRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/payment', paymentRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/coupons', couponRoutes);
  app.use('/api/media', uploadRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/wishlist', wishlistRoutes);
  app.use('/api/ai', aiRoutes);

  // Health checks
  app.get('/', (_req, res) => {
    res.json({ message: 'Welcome to UCONEXT Enterprise TS API Server', status: 'Running' });
  });

  // Public liveness/health probe (minimal surface — never exposes internal DB/Redis topology)
  app.get('/api/health', (_req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({
      status: dbConnected ? 'ok' : 'degraded',
    });
  });

  // Internal readiness probe with DB & Redis diagnostics (restricted to internal network or token in production)
  app.get('/api/health/ready', (req, res) => {
    if (process.env.NODE_ENV === 'production' && !isInternalRequest(req)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Internal readiness endpoint.' });
    }

    const dbReadyState = mongoose.connection.readyState;
    const dbConnected = dbReadyState === 1;
    const statusCode = dbConnected ? 200 : 503;

    return res.status(statusCode).json({
      status: dbConnected ? 'ok' : 'degraded',
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.round(process.uptime()),
      db: {
        connected: dbConnected,
        readyState: dbReadyState,
      },
      redis: {
        connected: Boolean(redisClient.isReady),
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Global Error Handler (must be registered after routes)
  app.use(errorHandler);

  return app;
}
