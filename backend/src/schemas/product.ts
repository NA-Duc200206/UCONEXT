import { z } from 'zod';
import { objectIdSchema, safeImageUrlSchema } from './common';

export const listProductsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  categoryId: z.string().trim().max(500).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1.').max(100, 'Limit cannot exceed 100.').optional(),
  sort: z.string().trim().max(40).optional(),
});

export const recommendedProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const productOptionsSchema = z
  .object({
    colors: z.array(z.string().trim().max(40)).max(20).optional(),
    sizes: z.array(z.string().trim().max(40)).max(20).optional(),
  })
  .optional();

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional(),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0),
  categoryId: objectIdSchema,
  image: safeImageUrlSchema.optional().or(z.literal('')),
  images: z.array(safeImageUrlSchema).max(12).optional(),
  options: productOptionsSchema,
  specs: z.record(z.string(), z.string().max(500)).optional(),
});

export const updateProductSchema = createProductSchema.partial();
