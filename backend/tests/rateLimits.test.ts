import http from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { createApp } from '../src/app';
import { User } from '../src/models';
import { getJwtSecret } from '../src/config/env';
import { redisClient } from '../src/config/redis';
import {
  getTrustedClientIp,
  parseTrustProxyHops,
  ResilientRedisStore,
} from '../src/middleware/rateLimits';
import { authenticateToken, isCustomer, optionalAuthenticateToken } from '../src/middleware/auth';
import rateLimit from 'express-rate-limit';

describe('Rate limiting, trusted proxy IP extraction, ResilientRedisStore, and auth middleware edge cases', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    await connectTestDB();
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await clearTestDB();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectTestDB();
  });

  it('rejects GET /api/products?limit=1200 with 400 VALIDATION_ERROR', async () => {
    const res = await fetch(`${baseUrl}/api/products?limit=1200`);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('ignores spoofed X-Forwarded-For headers when trust proxy hops are not satisfied', async () => {
    const testApp = express();
    testApp.set('trust proxy', false);
    const strictLimiter = rateLimit({
      windowMs: 60_000,
      limit: 2,
      keyGenerator: (req) => getTrustedClientIp(req),
      validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
    });
    testApp.get('/ping', strictLimiter, (req, res) => {
      res.json({ ip: getTrustedClientIp(req) });
    });

    const miniServer = http.createServer(testApp);
    await new Promise<void>((resolve) => miniServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (miniServer.address() as AddressInfo).port;

    try {
      const r1 = await fetch(`http://127.0.0.1:${port}/ping`, {
        headers: { 'X-Forwarded-For': '1.1.1.1' },
      });
      const r2 = await fetch(`http://127.0.0.1:${port}/ping`, {
        headers: { 'X-Forwarded-For': '2.2.2.2' },
      });
      const r3 = await fetch(`http://127.0.0.1:${port}/ping`, {
        headers: { 'X-Forwarded-For': '3.3.3.3' },
      });

      expect(r1.status).toBe(200);
      expect(((await r1.json()) as any).ip).toBe('127.0.0.1');
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => miniServer.close(() => resolve()));
    }
  });

  it('parses TRUST_PROXY_HOPS and strips IPv4-mapped IPv6 prefix', () => {
    expect(parseTrustProxyHops({ NODE_ENV: 'production' })).toBe(2);
    expect(parseTrustProxyHops({ NODE_ENV: 'development' })).toBe(false);
    expect(parseTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '1' })).toBe(1);
    expect(parseTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' })).toBe(false);
    expect(getTrustedClientIp({ ip: '::ffff:10.0.0.5' } as any)).toBe('10.0.0.5');
    expect(getTrustedClientIp({} as any)).toBe('unknown');
  });

  it('ResilientRedisStore handles memory fallback and Redis-ready / Redis-error transitions', async () => {
    const store = new ResilientRedisStore('rl:test:');
    store.init({ windowMs: 60_000 } as any);

    // Redis disconnected -> uses MemoryStore cleanly
    const mem1 = await store.increment('k1');
    expect(mem1.totalHits).toBe(1);
    await store.decrement('k1');
    await store.resetKey('k1');

    // Simulate Redis ready with sendCommand succeeding and then failing
    const isReadyGetter = vi.spyOn(redisClient, 'isReady', 'get').mockReturnValue(true);
    const sendCmdSpy = vi.spyOn(redisClient, 'sendCommand').mockImplementation(async (args: any) => {
      const cmd = String(args[0] || '').toUpperCase();
      if (cmd === 'SCRIPT') return 'mock-sha';
      if (cmd === 'EVALSHA') return [1, 60_000];
      return 1;
    });

    const redisRes = await store.increment('k2');
    expect(redisRes.totalHits).toBe(1);
    await store.decrement('k2');
    await store.resetKey('k2');

    // Redis errors mid-flight on increment/decrement/resetKey -> gracefully falls back to MemoryStore
    sendCmdSpy.mockImplementation(async (args: any) => {
      const cmd = String(args[0] || '').toUpperCase();
      if (cmd === 'SCRIPT') return 'mock-sha';
      throw new Error('Redis ECONNRESET');
    });
    const fallbackRes = await store.increment('k3');
    expect(fallbackRes.totalHits).toBe(1);
    await store.decrement('k3');
    await store.resetKey('k3');

    isReadyGetter.mockRestore();
  });

  it('covers authenticateToken, isCustomer, and optionalAuthenticateToken edge cases', async () => {
    const makeRes = () => {
      const res: any = { statusCode: 200, body: null };
      res.status = (code: number) => {
        res.statusCode = code;
        return res;
      };
      res.json = (payload: any) => {
        res.body = payload;
        return res;
      };
      return res;
    };

    // Invalid ObjectId inside valid JWT -> 401
    const badPayloadToken = jwt.sign({ id: 'not-an-object-id', tv: 0 }, getJwtSecret());
    const res1 = makeRes();
    await authenticateToken({ headers: { authorization: `Bearer ${badPayloadToken}` } } as any, res1, vi.fn());
    expect(res1.statusCode).toBe(401);

    // Valid ObjectId for deleted/nonexistent user -> 404
    const ghostToken = jwt.sign({ id: new Types.ObjectId().toString(), tv: 0 }, getJwtSecret());
    const res2 = makeRes();
    await authenticateToken({ headers: { authorization: `Bearer ${ghostToken}` } } as any, res2, vi.fn());
    expect(res2.statusCode).toBe(404);

    // isCustomer allows customer/admin and rejects warehouse/missing user
    const nextOk = vi.fn();
    isCustomer({ user: { role: 'customer' } } as any, makeRes(), nextOk);
    expect(nextOk).toHaveBeenCalledTimes(1);

    const res3 = makeRes();
    isCustomer({ user: { role: 'warehouse' } } as any, res3, vi.fn());
    expect(res3.statusCode).toBe(403);

    // optionalAuthenticateToken attaches user on valid token and ignores malformed token
    const user = await User.create({
      name: 'Opt Auth',
      email: 'opt@uconext.test',
      password: 'hashed_password',
      role: 'customer',
      tokenVersion: 1,
    });
    const validToken = jwt.sign({ id: user._id.toString(), tv: 1 }, getJwtSecret());
    const reqValid: any = { headers: { authorization: `Bearer ${validToken}` } };
    const nextOpt1 = vi.fn();
    await optionalAuthenticateToken(reqValid, makeRes(), nextOpt1);
    expect(nextOpt1).toHaveBeenCalledTimes(1);
    expect(String(reqValid.user?._id)).toBe(user._id.toString());

    const reqInvalid: any = { headers: { authorization: 'Bearer malformed.jwt' } };
    const nextOpt2 = vi.fn();
    await optionalAuthenticateToken(reqInvalid, makeRes(), nextOpt2);
    expect(nextOpt2).toHaveBeenCalledTimes(1);
    expect(reqInvalid.user).toBeUndefined();
  });
});
