import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { captureException } from '../config/sentry';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const INTERNAL_ERROR_MESSAGE = 'Đã có lỗi xảy ra.';

export function sendSafeError(
  res: Response,
  error: any,
  defaultStatus = 500,
  extra?: Record<string, unknown>
) {
  const statusCode =
    typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : defaultStatus;

  if (statusCode >= 500) {
    logger.error({ err: error, statusCode }, 'Unhandled internal error');
    captureException(error, { statusCode });
    return res.status(statusCode).json({
      code: 'INTERNAL_ERROR',
      message: INTERNAL_ERROR_MESSAGE,
      ...(extra || {}),
    });
  }

  return res.status(statusCode).json({
    code: error?.code,
    message: error?.message || 'Request failed.',
    ...(extra || {}),
  });
}

export const errorHandler = (err: AppError, req: Request, res: Response, _next: NextFunction) => {
  const statusCode =
    typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500;

  if (statusCode >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl, statusCode }, 'Request failed with 5xx');
    captureException(err, { method: req.method, url: req.originalUrl, statusCode });
    return res.status(statusCode).json({
      code: 'INTERNAL_ERROR',
      message: INTERNAL_ERROR_MESSAGE,
    });
  }

  logger.warn({ err, method: req.method, url: req.originalUrl, statusCode }, 'Request failed with 4xx');
  return res.status(statusCode).json({
    code: err.code,
    message: err.message || 'Request failed.',
  });
};
