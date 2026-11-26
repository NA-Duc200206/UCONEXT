import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';

import { createApp, createCorsOriginValidator } from './app';
import { connectDB } from './config/db';
import { connectRedis, redisClient } from './config/redis';
import { seedDatabase } from './config/seed';
import { configureSocketAuth, setIO } from './config/socket';
import { orderService } from './services/orderService';
import { shouldAutoSeed, validateProductionEnv } from './config/security';

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

    if (process.env.NODE_ENV !== 'production' && shouldAutoSeed()) {
      await seedDatabase();
    } else {
      console.log('ℹ️ Skipping automatic database seed (use explicit CLI `npm run seed --workspace=backend`).');
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

export { bootServer, server, createApp };
export default app;
