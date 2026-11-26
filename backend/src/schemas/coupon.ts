import { z } from 'zod';

export const validateCouponSchema = z.object({
  code: z.string().trim().min(1, 'Coupon code is required.').max(40, 'Coupon code is too long.'),
  orderAmount: z.coerce.number().min(0, 'Order amount cannot be negative.'),
});

export const createCouponSchema = z.object({
  code: z.string().trim().min(2).max(40),
  description: z.string().trim().max(300).optional(),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.coerce.number().positive(),
  minOrderAmount: z.coerce.number().min(0).optional(),
  maxDiscountAmount: z.union([z.coerce.number().positive(), z.literal(''), z.null()]).optional(),
  startDate: z.string().or(z.date()).optional(),
  endDate: z.string().or(z.date()).optional(),
  usageLimit: z.coerce.number().int().min(1).optional(),
  perUserLimit: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateCouponSchema = createCouponSchema.partial();
