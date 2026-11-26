import { z } from 'zod';
import { objectIdSchema } from './common';

const PHONE_REGEX = /^[0-9+\-\s()]{8,20}$/;

export const addAddressSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(PHONE_REGEX, 'Please enter a valid phone number (8-20 characters).'),
  address: z.string().trim().min(5).max(300),
  isDefault: z.boolean().optional(),
});

export const updateAddressSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().regex(PHONE_REGEX, 'Please enter a valid phone number (8-20 characters).').optional(),
  address: z.string().trim().min(5).max(300).optional(),
  isDefault: z.boolean().optional(),
});

export const addressIdParamSchema = z.object({
  addressId: objectIdSchema,
});
