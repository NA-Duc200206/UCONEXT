import http from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDB, disconnectTestDB } from './dbHelper';
import app from '../src/server';
import { getTrustedClientIp, parseTrustProxyHops } from '../src/middleware/rateLimits';
import rateLimit from 'express-rate-limit';

describe('Rate limiting, trusted proxy IP extraction, and list pagination caps', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
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
    // Direct connection (trust proxy = false, matching direct hit without trusted proxy hops)
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
      // Attacker sends a different spoofed X-Forwarded-For header on every request
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
      // 3rd request from same socket IP hits 429 despite spoofed X-Forwarded-For!
      expect(r3.status).toBe(429);
    } finally {
      await new Promise<void>((resolve) => miniServer.close(() => resolve()));
    }
  });

  it('parses TRUST_PROXY_HOPS correctly for production and explicit overrides', () => {
    expect(parseTrustProxyHops({ NODE_ENV: 'production' })).toBe(2);
    expect(parseTrustProxyHops({ NODE_ENV: 'development' })).toBe(false);
    expect(parseTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '1' })).toBe(1);
    expect(parseTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' })).toBe(false);
  });
});
