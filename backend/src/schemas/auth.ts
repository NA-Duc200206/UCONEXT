import { z } from 'zod';
import { emailSchema, objectIdSchema, safeImageUrlSchema } from './common';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.').max(128, 'Password is too long.'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80, 'Name must be at most 80 characters.'),
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password must be at most 128 characters.'),
});

export const firebaseLoginSchema = z.object({
  idToken: z.string().trim().min(10, 'Firebase ID token is required.').max(4096, 'Token is too long.'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(10, 'Reset token is required.').max(512, 'Reset token is invalid.'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password must be at most 128 characters.'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  avatar: safeImageUrlSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.').max(128),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(128),
});

export const updatePreferencesSchema = z.object({
  preferredCategories: z.array(objectIdSchema).max(5, 'You can select up to 5 preferred categories.'),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['customer', 'admin', 'warehouse', 'support']),
});
