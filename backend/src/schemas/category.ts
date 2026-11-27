import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Category name must be at least 2 characters.').max(80, 'Category name must be at most 80 characters.'),
  description: z.string().trim().max(500).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
});
