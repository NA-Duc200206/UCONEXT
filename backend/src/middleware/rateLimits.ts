import { Request } from 'express';
import rateLimit, { MemoryStore, Options, Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../config/redis';

/**
 * Uses RedisStore whenever Redis is connected and ready, transparently falling
 * back to an in-memory store when Redis is unavailable so APIs stay resilient.
 */
export class ResilientRedisStore implements Store {
  public localKeys = false;
  public prefix: string;
  private memoryStore = new MemoryStore();
  private redisStore: RedisStore | null = null;
  private savedOptions: Options | null = null;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.savedOptions = options;
    this.memoryStore.init(options);
  }

  private getReadyRedisStore(): RedisStore | null {
    if (!redisClient.isReady) return null;
    if (!this.redisStore) {
      const store = new RedisStore({
        prefix: this.prefix,
        sendCommand: (...args: string[]) => redisClient.sendCommand(args) as any,
      });
      if (this.savedOptions) {
        store.init(this.savedOptions);
      }
      this.redisStore = store;
    }
    return this.redisStore;
  }

  async increment(key: string) {
    const store = this.getReadyRedisStore();
    if (store) {
      try {
        return await store.increment(key);
      } catch {
        this.redisStore = null;
      }
    }
    return this.memoryStore.increment(key);
  }

  async decrement(key: string) {
    const store = this.getReadyRedisStore();
    if (store) {
      try {
        await store.decrement(key);
        return;
      } catch {
        this.redisStore = null;
      }
    }
    await this.memoryStore.decrement(key);
  }

  async resetKey(key: string) {
    const store = this.getReadyRedisStore();
    if (store) {
      try {
        await store.resetKey(key);
        return;
      } catch {
        this.redisStore = null;
      }
    }
    await this.memoryStore.resetKey(key);
  }
}

export function getTrustedClientIp(req: Request): string {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function createLimiter(opts: {
  prefix: string;
  windowMs: number;
  max: number | ((req: Request) => number);
  keyGenerator?: (req: Request) => string;
  message: { code: string; message: string };
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new ResilientRedisStore(`rl:${opts.prefix}:`),
    keyGenerator: opts.keyGenerator || ((req) => getTrustedClientIp(req)),
    validate: {
      xForwardedForHeader: false,
      keyGeneratorIpFallback: false,
    },
    message: opts.message,
  });
}

// Global: 300 req / 5 min / IP
export const globalLimiter = createLimiter({
  prefix: 'global',
  windowMs: 5 * 60 * 1000,
  max: 300,
  message: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
});

// Auth: 10 req / 15 min / IP + email
export const authLimiter = createLimiter({
  prefix: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const ip = getTrustedClientIp(req);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email ? `${ip}:${email}` : ip;
  },
  message: { code: 'AUTH_RATE_LIMITED', message: 'Too many authentication attempts. Please try again in 15 minutes.' },
});

// Orders: 10 req / 10 min / user
export const orderLimiter = createLimiter({
  prefix: 'order',
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: (req: any) => (req.user?._id ? `user:${req.user._id}` : getTrustedClientIp(req)),
  message: { code: 'ORDER_RATE_LIMITED', message: 'Too many order requests. Please wait a few minutes.' },
});

// Coupon validate: 20 req / 10 min / IP
export const couponValidateLimiter = createLimiter({
  prefix: 'coupon',
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { code: 'COUPON_RATE_LIMITED', message: 'Too many coupon validation attempts. Please try again shortly.' },
});

// Refresh token: 30 req / 15 min / IP
export const refreshLimiter = createLimiter({
  prefix: 'refresh',
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { code: 'REFRESH_RATE_LIMITED', message: 'Too many session refresh attempts. Please try again shortly.' },
});

// AI chat: guest 5 / 15 min / IP, authenticated user 30 / 15 min / user
export const aiChatLimiter = createLimiter({
  prefix: 'ai-chat',
  windowMs: 15 * 60 * 1000,
  max: (req: any) => (req.user?._id ? 30 : 5),
  keyGenerator: (req: any) => (req.user?._id ? `user:${req.user._id}` : `guest:${getTrustedClientIp(req)}`),
  message: { code: 'AI_RATE_LIMITED', message: 'Too many AI assistant requests. Please try again in 15 minutes.' },
});

// AI product summary: 30 req / 15 min / IP
export const aiSummaryLimiter = createLimiter({
  prefix: 'ai-summary',
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { code: 'AI_RATE_LIMITED', message: 'Too many AI product insight requests. Please try again shortly.' },
});

// Upload: 20 req / 15 min / user or IP
export const uploadLimiter = createLimiter({
  prefix: 'upload',
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req: any) => (req.user?._id ? `user:${req.user._id}` : getTrustedClientIp(req)),
  message: { code: 'UPLOAD_RATE_LIMITED', message: 'Too many upload attempts. Please try again later.' },
});

export function parseTrustProxyHops(env: NodeJS.ProcessEnv = process.env): number | false {
  const raw = env.TRUST_PROXY_HOPS?.trim();
  if (raw !== undefined && raw !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed === 0 ? false : parsed;
    }
  }
  return env.NODE_ENV === 'production' ? 2 : false;
}
