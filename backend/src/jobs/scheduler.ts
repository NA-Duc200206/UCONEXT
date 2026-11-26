import crypto from 'crypto';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { captureException } from '../config/sentry';

export interface DistributedLockClient {
  isReady: boolean;
  set: (key: string, value: string, options: { NX: true; PX: number }) => Promise<string | null>;
  eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
}

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const localLocks = new Map<string, { holderId: string; expiresAt: number }>();

function getLockClient(override?: DistributedLockClient): DistributedLockClient | null {
  if (override) {
    return override.isReady ? override : null;
  }
  if (redisClient.isReady) {
    return {
      isReady: true,
      set: (key, value, options) => redisClient.set(key, value, options) as Promise<string | null>,
      eval: (script, options) => redisClient.eval(script, options),
    };
  }
  return null;
}

export async function acquireDistributedLock(
  lockKey: string,
  holderId: string,
  ttlMs: number,
  lockClient?: DistributedLockClient
): Promise<boolean> {
  const client = getLockClient(lockClient);
  if (client) {
    try {
      const result = await client.set(lockKey, holderId, { NX: true, PX: ttlMs });
      return result === 'OK';
    } catch (err) {
      logger.warn({ err, lockKey }, 'Redis lock acquisition failed; falling back to local lock');
    }
  }

  const now = Date.now();
  const existing = localLocks.get(lockKey);
  if (existing && existing.expiresAt > now) {
    return false;
  }
  localLocks.set(lockKey, { holderId, expiresAt: now + ttlMs });
  return true;
}

export async function releaseDistributedLock(
  lockKey: string,
  holderId: string,
  lockClient?: DistributedLockClient
): Promise<void> {
  const client = getLockClient(lockClient);
  if (client) {
    try {
      await client.eval(RELEASE_LOCK_LUA, { keys: [lockKey], arguments: [holderId] });
      return;
    } catch (err) {
      logger.warn({ err, lockKey }, 'Redis lock release failed');
    }
  }

  const existing = localLocks.get(lockKey);
  if (existing && existing.holderId === holderId) {
    localLocks.delete(lockKey);
  }
}

export interface RunLockOptions {
  lockClient?: DistributedLockClient;
  holderId?: string;
}

export async function runWithDistributedLock<T>(
  jobName: string,
  ttlMs: number,
  fn: () => Promise<T>,
  opts: RunLockOptions = {}
): Promise<{ executed: boolean; result?: T }> {
  const lockKey = `lock:${jobName}`;
  const holderId = opts.holderId || crypto.randomUUID();
  const acquired = await acquireDistributedLock(lockKey, holderId, ttlMs, opts.lockClient);

  if (!acquired) {
    logger.debug({ jobName, lockKey }, 'Skipped scheduled job because another instance holds the lock');
    return { executed: false };
  }

  try {
    const result = await fn();
    return { executed: true, result };
  } catch (err) {
    logger.error({ err, jobName }, 'Scheduled job execution failed');
    captureException(err, { jobName });
    throw err;
  } finally {
    await releaseDistributedLock(lockKey, holderId, opts.lockClient);
  }
}

export interface ScheduledJobConfig {
  name: string;
  intervalMs: number;
  lockTtlMs: number;
  run: () => Promise<unknown>;
  lockClient?: DistributedLockClient;
}

export function createScheduledJob(config: ScheduledJobConfig) {
  let timer: NodeJS.Timeout | null = null;

  const triggerOnce = async () => {
    try {
      return await runWithDistributedLock(config.name, config.lockTtlMs, config.run, {
        lockClient: config.lockClient,
      });
    } catch {
      return { executed: true, result: undefined };
    }
  };

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void triggerOnce();
      }, config.intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    triggerOnce,
  };
}

export function resetLocalLocksForTests(): void {
  localLocks.clear();
}
