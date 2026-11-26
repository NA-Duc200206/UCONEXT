import { createClient } from 'redis';
import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const redisClient = createClient({
  url: redisUrl,
  socket: {
    connectTimeout: 2000,
    reconnectStrategy: (retries) => {
      const maxRetries = process.env.NODE_ENV === 'production' ? 5 : 2;
      if (retries > maxRetries) return false;
      return Math.min(retries * 200, 5000);
    },
  },
});

redisClient.on('error', (_err) => {
  // Silence repetitive reconnect noise during local fallback
});

export const connectRedis = async (): Promise<void> => {
  try {
    logger.info('Connecting to Redis');
    await redisClient.connect();
    logger.info('Connected to Redis');
  } catch (_err: any) {
    logger.warn('Redis connection failed; caching and locks will use local fallback');
  }
};
