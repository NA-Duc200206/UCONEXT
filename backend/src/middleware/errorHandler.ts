import { Request, Response, NextFunction } from 'express';

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
    console.error('[InternalError]', error);
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
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);

  const statusCode =
    typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500;

  if (statusCode >= 500) {
    return res.status(statusCode).json({
      code: 'INTERNAL_ERROR',
      message: INTERNAL_ERROR_MESSAGE,
    });
  }

  return res.status(statusCode).json({
    code: err.code,
    message: err.message || 'Request failed.',
  });
};
