import crypto from 'crypto';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { captureException } from '../config/sentry';

export interface EmailJobPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
  consoleTag: string;
  consoleLines: string[];
}

export interface QueuedEmailJob {
  id: string;
  payload: EmailJobPayload;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  lastError?: string;
}

export interface EmailQueueRedisAdapter {
  isReady: boolean;
  rPush: (key: string, value: string) => Promise<number>;
  lPop: (key: string) => Promise<string | null>;
  lLen: (key: string) => Promise<number>;
}

export interface EmailQueueOptions {
  pendingKey?: string;
  deadLetterKey?: string;
  maxAttempts?: number;
  baseBackoffMs?: number;
  pollIntervalMs?: number;
  redisAdapter?: EmailQueueRedisAdapter;
}

export type EmailDeliverFn = (payload: EmailJobPayload) => Promise<boolean>;

export class EmailQueue {
  private readonly pendingKey: string;
  private readonly deadLetterKey: string;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly pollIntervalMs: number;
  private readonly redisOverride?: EmailQueueRedisAdapter;

  private memoryPending: string[] = [];
  private memoryDead: string[] = [];
  private retryTimers = new Set<NodeJS.Timeout>();
  private pollTimer: NodeJS.Timeout | null = null;
  private deliverFn: EmailDeliverFn | null = null;
  private processing = false;
  private deliveredCount = 0;

  constructor(opts: EmailQueueOptions = {}) {
    this.pendingKey = opts.pendingKey || 'queue:email:pending';
    this.deadLetterKey = opts.deadLetterKey || 'queue:email:dead';
    this.maxAttempts = opts.maxAttempts ?? 5;
    this.baseBackoffMs = opts.baseBackoffMs ?? 2000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 3000;
    this.redisOverride = opts.redisAdapter;
  }

  private getRedis(): EmailQueueRedisAdapter | null {
    if (this.redisOverride) {
      return this.redisOverride.isReady ? this.redisOverride : null;
    }
    if (redisClient.isReady) {
      return {
        isReady: true,
        rPush: (key, value) => redisClient.rPush(key, value),
        lPop: (key) => redisClient.lPop(key),
        lLen: (key) => redisClient.lLen(key),
      };
    }
    return null;
  }

  private async pushRaw(key: string, raw: string, fallbackList: string[]): Promise<void> {
    const redis = this.getRedis();
    if (redis) {
      try {
        await redis.rPush(key, raw);
        return;
      } catch (err) {
        logger.warn({ err, key }, 'Redis email queue push failed; using in-memory fallback');
      }
    }
    fallbackList.push(raw);
  }

  private async popPendingRaw(): Promise<string | null> {
    const redis = this.getRedis();
    if (redis) {
      try {
        const val = await redis.lPop(this.pendingKey);
        if (val !== null) return val;
      } catch (err) {
        logger.warn({ err, key: this.pendingKey }, 'Redis email queue pop failed; checking memory queue');
      }
    }
    return this.memoryPending.shift() ?? null;
  }

  async enqueue(payload: EmailJobPayload): Promise<QueuedEmailJob> {
    const job: QueuedEmailJob = {
      id: crypto.randomUUID(),
      payload,
      attempt: 0,
      maxAttempts: this.maxAttempts,
      createdAt: new Date().toISOString(),
    };
    await this.pushRaw(this.pendingKey, JSON.stringify(job), this.memoryPending);

    if (this.deliverFn) {
      setImmediate(() => {
        void this.drain();
      });
    }
    return job;
  }

  async processNext(
    overrideDeliverFn?: EmailDeliverFn
  ): Promise<'empty' | 'delivered' | 'retrying' | 'dead'> {
    const deliver = overrideDeliverFn || this.deliverFn;
    if (!deliver) return 'empty';

    const raw = await this.popPendingRaw();
    if (!raw) return 'empty';

    let job: QueuedEmailJob;
    try {
      job = JSON.parse(raw) as QueuedEmailJob;
    } catch {
      logger.error({ rawLength: raw.length }, 'Discarded corrupted email queue entry');
      return 'dead';
    }

    job.attempt += 1;

    let delivered = false;
    let failureErr: unknown = null;
    try {
      delivered = await deliver(job.payload);
    } catch (err) {
      failureErr = err;
      delivered = false;
    }

    if (delivered) {
      this.deliveredCount += 1;
      return 'delivered';
    }

    job.lastError =
      failureErr instanceof Error
        ? failureErr.message
        : failureErr
          ? String(failureErr)
          : 'Email delivery returned false';

    if (job.attempt < job.maxAttempts) {
      const delayMs = this.baseBackoffMs * Math.pow(2, job.attempt - 1);
      logger.warn(
        {
          jobId: job.id,
          tag: job.payload.consoleTag,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          retryInMs: delayMs,
          reason: job.lastError,
        },
        'Email delivery failed; scheduling backoff retry'
      );

      const timer = setTimeout(() => {
        this.retryTimers.delete(timer);
        void this.pushRaw(this.pendingKey, JSON.stringify(job), this.memoryPending).then(() => {
          if (this.deliverFn) {
            void this.drain();
          }
        });
      }, delayMs);
      timer.unref();
      this.retryTimers.add(timer);
      return 'retrying';
    }

    logger.error(
      {
        jobId: job.id,
        tag: job.payload.consoleTag,
        attempts: job.attempt,
        reason: job.lastError,
      },
      'Email delivery exhausted retries; moved to dead-letter queue'
    );
    captureException(failureErr || new Error(job.lastError), {
      jobId: job.id,
      emailTag: job.payload.consoleTag,
      attempts: job.attempt,
    });
    await this.pushRaw(this.deadLetterKey, JSON.stringify(job), this.memoryDead);
    return 'dead';
  }

  async drain(overrideDeliverFn?: EmailDeliverFn): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (true) {
        const outcome = await this.processNext(overrideDeliverFn);
        if (outcome === 'empty') break;
      }
    } finally {
      this.processing = false;
    }
  }

  startWorker(deliverFn: EmailDeliverFn): void {
    this.deliverFn = deliverFn;
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.drain();
    }, this.pollIntervalMs);
    this.pollTimer.unref();
    void this.drain();
  }

  stopWorker(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const timer of this.retryTimers) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    this.deliverFn = null;
  }

  async getStats(): Promise<{ pending: number; dead: number; scheduledRetries: number; delivered: number }> {
    const redis = this.getRedis();
    let pending = this.memoryPending.length;
    let dead = this.memoryDead.length;
    if (redis) {
      try {
        pending += await redis.lLen(this.pendingKey);
        dead += await redis.lLen(this.deadLetterKey);
      } catch {
        // Fallback to in-memory counts
      }
    }
    return {
      pending,
      dead,
      scheduledRetries: this.retryTimers.size,
      delivered: this.deliveredCount,
    };
  }

  resetForTests(): void {
    this.stopWorker();
    this.memoryPending = [];
    this.memoryDead = [];
    this.deliveredCount = 0;
    this.processing = false;
  }
}

export const emailQueue = new EmailQueue();
