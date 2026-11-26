import { z } from 'zod';
import { objectIdSchema, safeImageUrlSchema } from './common';

export const cartItemSchema = z.object({
  productId: objectIdSchema,
  name: z.string().trim().min(1).max(200),
  price: z.number().min(0),
  image: safeImageUrlSchema
    .or(z.literal(''))
    .nullish()
    .transform((v) => v ?? undefined),
  stock: z.coerce
    .number()
    .int()
    .min(0)
    .nullish()
    .transform((v) => v ?? undefined),
  quantity: z.coerce.number().int().min(1).max(99),
  color: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v || undefined),
  size: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v || undefined),
});

export const syncCartSchema = z.object({
  cart: z.array(cartItemSchema).max(50, 'Cart can contain at most 50 items.'),
});
