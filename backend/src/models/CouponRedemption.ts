import { Schema, model, Document, Types } from 'mongoose';

export interface ICouponRedemption extends Document {
  couponId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  slot?: number;
  createdAt: Date;
}

const CouponRedemptionSchema = new Schema<ICouponRedemption>(
  {
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    slot: { type: Number, min: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

CouponRedemptionSchema.index({ couponId: 1, userId: 1, orderId: 1 }, { unique: true });
CouponRedemptionSchema.index(
  { couponId: 1, userId: 1, slot: 1 },
  { unique: true, partialFilterExpression: { slot: { $exists: true } } }
);
CouponRedemptionSchema.index({ couponId: 1, userId: 1 });
CouponRedemptionSchema.index({ orderId: 1 });

export const CouponRedemption = model<ICouponRedemption>('CouponRedemption', CouponRedemptionSchema);
