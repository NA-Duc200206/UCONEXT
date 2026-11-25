import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';

import { connectDB } from './config/db';
import { connectRedis, redisClient } from './config/redis';
import { seedDatabase } from './config/seed';
import { configureSocketAuth, setIO } from './config/socket';
import { orderService } from './services/orderService';
import {
  isOriginAllowed,
  parseAllowedOrigins,
  shouldAutoSeed,
  validateProductionEnv,
} from './config/security';

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
import path from 'path';

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = parseAllowedOrigins();

if (isProduction) {
  app.set('trust proxy', 1);
}

const corsOriginValidator = (
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

// Security and Utility Middlewares
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: corsOriginValidator,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

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
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to UCONEXT Enterprise TS API Server', status: 'Running' });
});

app.get('/api/health', (req, res) => {
  const dbReadyState = mongoose.connection.readyState;
  const dbConnected = dbReadyState === 1;
  const statusCode = dbConnected ? 200 : 503;

  res.status(statusCode).json({
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

// Setup HTTP Server & Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOriginValidator,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  }
});
setIO(io);
configureSocketAuth(io);

// Expose Socket.io instance for other services
export { io };

let vnpayExpiryInterval: NodeJS.Timeout | null = null;

// Boot Server
const bootServer = async () => {
  try {
    const prodIssues = validateProductionEnv();
    if (prodIssues.length > 0) {
      throw new Error(`Invalid production configuration:\n- ${prodIssues.join('\n- ')}`);
    }

    await connectDB();
    await connectRedis();

    if (shouldAutoSeed()) {
      await seedDatabase();
    } else {
      console.log('ℹ️ Skipping automatic database seed (disabled in production unless AUTO_SEED=true).');
    }

    vnpayExpiryInterval = setInterval(() => {
      orderService.expireStaleVnpayOrders().catch((err) => {
        console.error('Failed to expire stale VNPAY orders:', err?.message || err);
      });
    }, 60_000);
    vnpayExpiryInterval.unref();

    server.listen(PORT, () => {
      console.log(`✔ Server is running on http://localhost:${PORT}`);
    });
  } catch (err: any) {
    console.error('❌ Failed to boot server:', err.message);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  console.log(`\n⏳ Received ${signal}. Shutting down gracefully...`);
  if (vnpayExpiryInterval) {
    clearInterval(vnpayExpiryInterval);
    vnpayExpiryInterval = null;
  }
  server.close(async () => {
    try {
      await mongoose.disconnect();
      if (redisClient.isOpen) {
        await redisClient.quit();
      }
    } catch {
      // Ignore cleanup errors during shutdown
    }
    process.exit(0);
  });
};

if (require.main === module && !process.env.VITEST) {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  bootServer();
}

export { bootServer, server };
export default app;
