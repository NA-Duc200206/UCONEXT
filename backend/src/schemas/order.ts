import { z } from 'zod';
import { objectIdSchema } from './common';

const orderItemInputSchema = z.object({
  productId: objectIdSchema,
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.').max(99, 'Quantity cannot exceed 99 per line item.'),
  color: z.string().trim().max(40, 'Color must be at most 40 characters.').optional(),
  size: z.string().trim().max(40, 'Size must be at most 40 characters.').optional(),
});

const shippingAddressSchema = z.union([
  z.string().trim().min(5, 'Shipping address must be at least 5 characters.').max(500, 'Shipping address must be at most 500 characters.'),
  z
    .record(z.string(), z.any())
    .refine((obj) => Object.keys(obj).length > 0 && JSON.stringify(obj).length <= 500, {
      message: 'Shipping address object must be non-empty and at most 500 characters.',
    }),
]);

export const createOrderSchema = z.object({
  items: z
    .array(orderItemInputSchema)
    .min(1, 'Order must contain at least 1 item.')
    .max(50, 'Order can contain at most 50 items.'),
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(['cod', 'vnpay']).optional().default('cod'),
  couponCode: z.string().trim().max(40).optional(),
});

export const updateOrderStatusSchema = z
  .object({
    status: z
      .enum([
        'pending',
        'confirmed',
        'packaging',
        'shipping',
        'delivered',
        'completed',
        'cancelled',
        'refund_requested',
        'refund_completed',
      ])
      .optional(),
    paymentStatus: z.enum(['pending', 'paid', 'failed', 'review']).optional(),
  })
  .refine((v) => v.status !== undefined || v.paymentStatus !== undefined, {
    message: 'At least one of status or paymentStatus must be provided.',
  });

export const refundRequestSchema = z.object({
  reason: z.string().trim().max(500, 'Refund reason must be at most 500 characters.').optional(),
});
