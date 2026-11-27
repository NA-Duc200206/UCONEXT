import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';

import { createApp, createCorsOriginValidator } from './app';
import { connectDB } from './config/db';
import { logger } from './config/logger';
import { connectRedis, redisClient } from './config/redis';
import { seedDatabase } from './config/seed';
import { flushSentry, initSentry } from './config/sentry';
import { configureSocketAuth, setIO } from './config/socket';
import { shouldAutoSeed, validateProductionEnv } from './config/security';
import { emailQueue } from './jobs/emailQueue';
import { createScheduledJob } from './jobs/scheduler';
import { deliverMailNow } from './services/emailService';
import { orderService } from './services/orderService';

const PORT = process.env.PORT || 5000;
const app = createApp();
const corsOriginValidator = createCorsOriginValidator();

// Setup HTTP Server & Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOriginValidator,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
});
setIO(io);
configureSocketAuth(io);

export { io };

const vnpayExpiryJob = createScheduledJob({
  name: 'expire-stale-vnpay-orders',
  intervalMs: 60_000,
  lockTtlMs: 50_000,
  run: () => orderService.expireStaleVnpayOrders(),
});

// Boot Server
const bootServer = async () => {
  try {
    initSentry();

    const prodIssues = validateProductionEnv();
    if (prodIssues.length > 0) {
      throw new Error(`Invalid production configuration:\n- ${prodIssues.join('\n- ')}`);
    }

    await connectDB();
    await connectRedis();

    const allowProdSeed = ['true', '1'].includes((process.env.ALLOW_PROD_SEED || '').trim().toLowerCase());
    if (shouldAutoSeed() && (process.env.NODE_ENV !== 'production' || allowProdSeed)) {
      await seedDatabase();
    } else {
      logger.info('Skipping automatic database seed (use explicit CLI `npm run seed --workspace=backend`)');
    }

    vnpayExpiryJob.start();
    emailQueue.startWorker(deliverMailNow);

    server.listen(PORT, () => {
      logger.info({ port: PORT }, 'API server is listening');
    });
  } catch (err: any) {
    logger.fatal({ err }, 'Failed to boot server');
    await flushSentry();
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Received shutdown signal; closing server gracefully');
  vnpayExpiryJob.stop();
  emailQueue.stopWorker();

  server.close(async () => {
    try {
      await mongoose.disconnect();
      if (redisClient.isOpen) {
        await redisClient.quit();
      }
      await flushSentry();
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

export { bootServer, server, createApp };
export default app;
