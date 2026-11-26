import { z } from 'zod';
import { objectIdSchema } from './common';

export const addReviewSchema = z.object({
  productId: objectIdSchema,
  rating: z.coerce.number().int('Rating must be an integer between 1 and 5.').min(1).max(5),
  comment: z.string().trim().min(1, 'Comment is required.').max(2000, 'Comment must be at most 2000 characters.'),
});

export const productIdParamSchema = z.object({
  productId: objectIdSchema,
});
