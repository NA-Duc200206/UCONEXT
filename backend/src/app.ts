import express, { Express, Request } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import fs from 'fs';
import helmet from 'helmet';
import mongoose from 'mongoose';
import path from 'path';
import swaggerUi from 'swagger-ui-express';

import { createHttpLogger } from './config/logger';
import { createOpenApiSpec } from './config/openapi';
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
  serveFrontendDistDir?: string;
}

function resolveFrontendDistDir(opts: CreateAppOptions): string | null {
  const explicitDir = opts.serveFrontendDistDir?.trim();
  const envFlag = (process.env.SERVE_FRONTEND_DIST || '').trim().toLowerCase();
  const enabledByEnv = envFlag === 'true' || envFlag === '1';

  const candidate = explicitDir || (enabledByEnv ? path.resolve(__dirname, '../../frontend/dist') : '');
  if (!candidate) return null;

  const indexPath = path.join(candidate, 'index.html');
  return fs.existsSync(indexPath) ? candidate : null;
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
      // Required so Firebase Google Sign-In popups keep window.opener when Express serves the SPA
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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

  // Interactive OpenAPI 3.0 documentation (set ENABLE_API_DOCS=false to disable)
  const apiDocsDisabled = ['false', '0'].includes((process.env.ENABLE_API_DOCS || '').trim().toLowerCase());
  if (!apiDocsDisabled) {
    const openApiSpec = createOpenApiSpec();
    app.get('/api/docs.json', (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(openApiSpec);
    });
    app.use(
      '/api/docs',
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, {
        customSiteTitle: 'UCONEXT API Docs',
        swaggerOptions: {
          persistAuthorization: true,
        },
      })
    );
  }

  const frontendDistDir = resolveFrontendDistDir(opts);

  // Root welcome endpoint (only when not serving the built SPA directly)
  if (!frontendDistDir) {
    app.get('/', (_req, res) => {
      res.json({ message: 'Welcome to UCONEXT Enterprise TS API Server', status: 'Running' });
    });
  }

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

  // Optional single-service SPA static hosting (e.g. Render Free Blueprint with SERVE_FRONTEND_DIST=true)
  if (frontendDistDir) {
    const indexHtmlPath = path.join(frontendDistDir, 'index.html');
    app.use(
      '/assets',
      express.static(path.join(frontendDistDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    app.use(
      express.static(frontendDistDir, {
        index: false,
        maxAge: '1h',
      })
    );
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/uploads') ||
        req.path.startsWith('/socket.io')
      ) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexHtmlPath);
    });
  }

  // Global Error Handler (must be registered after routes)
  app.use(errorHandler);

  return app;
}
