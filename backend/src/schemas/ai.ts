import { z } from 'zod';
import { objectIdSchema } from './common';

const aiHistoryTurnSchema = z
  .object({
    role: z.enum(['user', 'assistant', 'system']),
    text: z.string().max(2000).optional(),
    content: z.string().max(2000).optional(),
  })
  .refine((turn) => typeof turn.text === 'string' || typeof turn.content === 'string', {
    message: 'History item must include text or content.',
  })
  .transform((turn) => ({
    role: turn.role,
    text: turn.text ?? turn.content ?? '',
    content: turn.content ?? turn.text ?? '',
  }));

export const aiChatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message is required.')
    .max(1000, 'Message must be at most 1000 characters.'),
  history: z.array(aiHistoryTurnSchema).max(20).optional(),
  context: z
    .object({
      page: z.string().max(200).optional(),
      currentPath: z.string().max(200).optional(),
      productId: objectIdSchema.nullish(),
    })
    .passthrough()
    .optional(),
});

export const aiProductParamSchema = z.object({
  productId: objectIdSchema,
});
