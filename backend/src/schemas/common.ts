import { z } from 'zod';

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

export const objectIdSchema = z
  .string()
  .trim()
  .regex(OBJECT_ID_REGEX, 'Invalid identifier format.');

export function isSafeImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length > 500) return false;
  if (trimmed.startsWith('/uploads/')) {
    return !trimmed.includes('..');
  }
  const r2PublicBase = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (r2PublicBase && trimmed.startsWith(`${r2PublicBase}/`)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const safeImageUrlSchema = z
  .string()
  .trim()
  .max(500, 'Image URL must be at most 500 characters.')
  .refine((v) => isSafeImageUrl(v), {
    message: 'Image URL must use https:// or /uploads/ path.',
  });

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Email is required.')
  .max(254, 'Email must be at most 254 characters.')
  .email('Invalid email address.');

export const idParamSchema = z.object({
  id: objectIdSchema,
});
