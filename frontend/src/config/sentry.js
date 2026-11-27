import * as Sentry from '@sentry/react';

let sentryReady = false;

export function initFrontendSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn || sentryReady) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'production',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
  sentryReady = true;
  return true;
}

export function captureFrontendException(error, extra) {
  if (!sentryReady) return;
  Sentry.withScope((scope) => {
    if (extra) {
      scope.setExtras(extra);
    }
    Sentry.captureException(error);
  });
}
