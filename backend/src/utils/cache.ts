import { redisClient } from '../config/redis';

export function toSlug(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export const cacheService = {
  async get<T = any>(key: string): Promise<T | null> {
    if (!redisClient.isReady) return null;
    try {
      const raw = await redisClient.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    if (!redisClient.isReady) return;
    try {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // Non-fatal cache write failure
    }
  },

  async invalidateByPrefix(...prefixes: string[]): Promise<void> {
    if (!redisClient.isReady || prefixes.length === 0) return;
    try {
      for (const prefix of prefixes) {
        const keys = await redisClient.keys(`${prefix}*`);
        if (Array.isArray(keys) && keys.length > 0) {
          await redisClient.del(keys);
        }
      }
    } catch {
      // Non-fatal cache invalidation failure
    }
  },
};
