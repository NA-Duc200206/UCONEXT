import { z } from 'zod';
import { objectIdSchema } from './common';

export const toggleWishlistBodySchema = z.object({
  productId: objectIdSchema,
});

export const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  action: z.string().trim().max(80).optional(),
  targetType: z.string().trim().max(80).optional(),
});
