import * as Sentry from '@sentry/node';
import { logger } from './logger';

let initialized = false;

export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) {
    return false;
  }
  if (initialized) {
    return true;
  }

  const rawRate = Number(env.SENTRY_TRACES_SAMPLE_RATE);
  const tracesSampleRate = Number.isFinite(rawRate) ? Math.min(Math.max(rawRate, 0), 1) : 0.1;

  Sentry.init({
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || 'development',
    release: env.APP_VERSION?.trim() || env.IMAGE_TAG?.trim() || undefined,
    tracesSampleRate,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  initialized = true;
  logger.info({ environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV }, 'Sentry error reporting initialized');
  return true;
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('app', context);
    }
    Sentry.captureException(error);
  });
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeoutMs);
}

export function resetSentryForTests(): void {
  initialized = false;
}
