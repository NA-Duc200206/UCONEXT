import pino, { LoggerOptions } from 'pino';
import pinoHttp from 'pino-http';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'authorization',
  'cookie',
  'password',
  'token',
  'refreshToken',
  'apiKey',
  'secret',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.token',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
];

export function createLoggerOptions(env: NodeJS.ProcessEnv = process.env): LoggerOptions {
  const isTest = env.NODE_ENV === 'test' || Boolean(env.VITEST);
  return {
    level: env.LOG_LEVEL?.trim() || (isTest ? 'silent' : 'info'),
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    base: {
      service: 'uconext-backend',
      env: env.NODE_ENV || 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

export const logger = pino(createLoggerOptions());

export function createHttpLogger() {
  return pinoHttp({
    logger,
    autoLogging: !(process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)),
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}
