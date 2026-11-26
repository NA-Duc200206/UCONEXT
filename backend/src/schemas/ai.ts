import { z } from 'zod';
import { objectIdSchema } from './common';

export const aiChatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message is required.')
    .max(1000, 'Message must be at most 1000 characters.'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(2000),
      })
    )
    .max(20)
    .optional(),
  context: z
    .object({
      currentPath: z.string().max(200).optional(),
      productId: objectIdSchema.optional(),
    })
    .passthrough()
    .optional(),
});

export const aiProductParamSchema = z.object({
  productId: objectIdSchema,
});
