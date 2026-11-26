import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function formatZodIssues(err: ZodError) {
  return err.issues.map((issue) => ({
    path: issue.path.join('.') || 'root',
    message: issue.message,
  }));
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any;
      }
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        (req as any).query = parsedQuery;
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fields = formatZodIssues(err);
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: fields[0]?.message || 'Invalid request data.',
          fields,
        });
      }
      return next(err);
    }
  };
}
