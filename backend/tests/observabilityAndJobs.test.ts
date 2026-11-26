import { Writable } from 'stream';
import pino from 'pino';
import nodemailer from 'nodemailer';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

const { mockSentryInit, mockSentryCaptureException, mockSentryFlush } = vi.hoisted(() => ({
  mockSentryInit: vi.fn(),
  mockSentryCaptureException: vi.fn(),
  mockSentryFlush: vi.fn().mockResolvedValue(true),
}));

vi.mock('@sentry/node', () => ({
  init: mockSentryInit,
  captureException: mockSentryCaptureException,
  flush: mockSentryFlush,
  withScope: (fn: (scope: { setContext: (k: string, v: unknown) => void }) => void) =>
    fn({ setContext: vi.fn() }),
}));
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Category, Product, User } from '../src/models';
import { createLoggerOptions } from '../src/config/logger';
import {
  captureException,
  initSentry,
  isSentryEnabled,
  resetSentryForTests,
} from '../src/config/sentry';
import {
  createScheduledJob,
  DistributedLockClient,
  resetLocalLocksForTests,
  runWithDistributedLock,
} from '../src/jobs/scheduler';
import { EmailQueue, emailQueue } from '../src/jobs/emailQueue';
import { deliverMailNow, resetEmailTransporterForTests } from '../src/services/emailService';
import { orderService } from '../src/services/orderService';

function createFakeRedisLockClient(): DistributedLockClient {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    isReady: true,
    async set(key, value, options) {
      const now = Date.now();
      const existing = store.get(key);
      if (existing && existing.expiresAt > now && options.NX) {
        return null;
      }
      store.set(key, { value, expiresAt: now + options.PX });
      return 'OK';
    },
    async eval(_script, options) {
      const key = options.keys[0];
      const expected = options.arguments[0];
      const existing = store.get(key);
      if (existing && existing.value === expected) {
        store.delete(key);
        return 1;
      }
      return 0;
    },
  };
}

describe('Observability (Pino redaction, Sentry) and resilient background jobs', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
    resetLocalLocksForTests();
    resetSentryForTests();
    emailQueue.resetForTests();
    resetEmailTransporterForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('redacts authorization, cookie, password, and token fields in structured Pino JSON output', () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });

    const opts = createLoggerOptions({ NODE_ENV: 'production', LOG_LEVEL: 'info' });
    const testLogger = pino(opts, sink);

    testLogger.info(
      {
        req: { headers: { authorization: 'Bearer super-secret-jwt', cookie: 'uc_rt=abc123' } },
        password: 'MyPassword123!',
        token: 'raw-access-token',
        nested: { refreshToken: 'raw-refresh-token' },
      },
      'Sensitive payload test'
    );

    const serialized = chunks.join('');
    expect(serialized).not.toContain('super-secret-jwt');
    expect(serialized).not.toContain('uc_rt=abc123');
    expect(serialized).not.toContain('MyPassword123!');
    expect(serialized).not.toContain('raw-access-token');
    expect(serialized).not.toContain('raw-refresh-token');
    expect(serialized).toContain('[REDACTED]');
  });

  it('initializes Sentry only when SENTRY_DSN is configured and captures exceptions safely', () => {
    mockSentryInit.mockReset();
    mockSentryCaptureException.mockReset();

    expect(initSentry({})).toBe(false);
    expect(isSentryEnabled()).toBe(false);
    captureException(new Error('ignored while disabled'));
    expect(mockSentryCaptureException).not.toHaveBeenCalled();

    expect(initSentry({ SENTRY_DSN: 'https://public@sentry.example/1', SENTRY_ENVIRONMENT: 'staging' })).toBe(
      true
    );
    expect(isSentryEnabled()).toBe(true);
    expect(mockSentryInit).toHaveBeenCalledTimes(1);

    // beforeSend strips authorization & cookie headers
    const initArgs: any = mockSentryInit.mock.calls[0][0];
    const scrubbed = initArgs.beforeSend({
      request: { headers: { authorization: 'Bearer x', cookie: 'uc_rt=y', accept: 'application/json' } },
    });
    expect(scrubbed.request.headers.authorization).toBeUndefined();
    expect(scrubbed.request.headers.cookie).toBeUndefined();
    expect(scrubbed.request.headers.accept).toBe('application/json');

    captureException(new Error('captured 500'), { route: '/api/orders' });
    expect(mockSentryCaptureException).toHaveBeenCalledTimes(1);
  });

  it('ensures two concurrent schedulers execute a locked job strictly once', async () => {
    const sharedRedis = createFakeRedisLockClient();
    let executions = 0;

    const jobFn = async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return 'done';
    };

    const schedulerA = createScheduledJob({
      name: 'expire-stale-vnpay-orders',
      intervalMs: 60_000,
      lockTtlMs: 5_000,
      run: jobFn,
      lockClient: sharedRedis,
    });
    const schedulerB = createScheduledJob({
      name: 'expire-stale-vnpay-orders',
      intervalMs: 60_000,
      lockTtlMs: 5_000,
      run: jobFn,
      lockClient: sharedRedis,
    });

    const [resA, resB] = await Promise.all([schedulerA.triggerOnce(), schedulerB.triggerOnce()]);
    expect(executions).toBe(1);
    expect([resA.executed, resB.executed].filter(Boolean)).toHaveLength(1);

    // After lock release, a subsequent run succeeds cleanly
    const resC = await runWithDistributedLock('expire-stale-vnpay-orders', 5_000, async () => {
      executions += 1;
      return 'next';
    }, { lockClient: sharedRedis });
    expect(resC.executed).toBe(true);
    expect(executions).toBe(2);
  });

  it('retries failed SMTP deliveries with exponential backoff and keeps checkout successful when SMTP fails', async () => {
    // 1. Dedicated EmailQueue retry test: fails twice, succeeds on attempt #3
    const testQueue = new EmailQueue({ maxAttempts: 5, baseBackoffMs: 15 });
    let attempts = 0;
    const flakyDeliver = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error(`SMTP temporary failure #${attempts}`);
      }
      return true;
    });

    testQueue.startWorker(flakyDeliver);
    await testQueue.enqueue({
      to: 'retry@uconext.test',
      subject: 'Order Confirmation',
      text: 'Confirmed',
      html: '<p>Confirmed</p>',
      consoleTag: 'ORDER CONFIRMATION',
      consoleLines: [],
    });

    // Wait for backoff retries (15ms + 30ms + scheduling overhead)
    await vi.waitFor(
      async () => {
        const stats = await testQueue.getStats();
        expect(stats.delivered).toBe(1);
      },
      { timeout: 2000 }
    );
    expect(attempts).toBe(3);
    expect((await testQueue.getStats()).dead).toBe(0);
    testQueue.stopWorker();

    // 2. Exhausting maxAttempts moves email to dead-letter queue
    const deadQueue = new EmailQueue({ maxAttempts: 2, baseBackoffMs: 10 });
    deadQueue.startWorker(async () => false);
    await deadQueue.enqueue({
      to: 'dead@uconext.test',
      subject: 'Permanent fail',
      text: 'Fail',
      html: '<p>Fail</p>',
      consoleTag: 'DEAD TEST',
      consoleLines: [],
    });
    await vi.waitFor(
      async () => {
        expect((await deadQueue.getStats()).dead).toBe(1);
      },
      { timeout: 2000 }
    );
    deadQueue.stopWorker();

    // 3. Real checkout succeeds even when SMTP throws continuously
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', 'smtp.broken.invalid');
    vi.stubEnv('SMTP_PORT', '465');
    vi.stubEnv('SMTP_USER', 'no-reply@uconext.vn');
    vi.stubEnv('SMTP_PASS', 'secret-smtp-pass');

    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('ENOTFOUND smtp.broken.invalid')),
    } as any);

    const buyer = await User.create({
      name: 'Resilient Buyer',
      email: 'resilient@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const cat = await Category.create({ name: 'Audio', slug: 'audio-resilient' });
    const prod = await Product.create({
      name: 'Studio Headphones',
      slug: 'studio-headphones-resilient',
      price: 900000,
      stock: 5,
      categoryId: cat._id as any,
    });

    const createdOrder = await orderService.createOrder(buyer._id.toString(), {
      items: [{ productId: prod._id.toString(), quantity: 1 }],
      shippingAddress: '10 Le Loi, District 1, HCMC',
      paymentMethod: 'cod',
    });

    expect(createdOrder.id).toBeTruthy();
    expect((await Product.findById(prod._id))?.stock).toBe(4);

    // Processing the queued email sees SMTP failure and schedules retry (never failing checkout)
    const outcome = await emailQueue.processNext(deliverMailNow);
    expect(outcome).toBe('retrying');
  });
});
