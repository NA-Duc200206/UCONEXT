import { Schema, model, Document } from 'mongoose';

export interface IOrderItem {
  productId: Schema.Types.ObjectId;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  color?: string;
  size?: string;
}

export interface IOrderStatusHistory {
  status: string;
  timestamp: Date;
  note?: string;
}

export interface IOrder extends Document {
  userId: Schema.Types.ObjectId;
  shippingAddress: string;
  billingAddress?: string;
  paymentMethod: 'cod' | 'vnpay';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'review';
  status: 'pending' | 'confirmed' | 'packaging' | 'shipping' | 'delivered' | 'completed' | 'cancelled' | 'refund_requested' | 'refund_completed';
  items: IOrderItem[];
  couponCode?: string;
  discountAmount?: number;
  totalAmount: number;
  statusHistory: IOrderStatusHistory[];
  vnpayTxnRef?: string;
  paymentDeadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  color: { type: String },
  size: { type: String }
}, { _id: false });

const OrderStatusHistorySchema = new Schema<IOrderStatusHistory>({
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note: { type: String }
}, { _id: false });

const OrderSchema = new Schema<IOrder>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  shippingAddress: { type: String, required: true },
  billingAddress: { type: String },
  paymentMethod: { type: String, enum: ['cod', 'vnpay'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'review'], default: 'pending' },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'packaging', 'shipping', 'delivered', 'completed', 'cancelled', 'refund_requested', 'refund_completed'],
    default: 'pending'
  },
  items: { type: [OrderItemSchema], required: true },
  couponCode: { type: String },
  discountAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  statusHistory: { type: [OrderStatusHistorySchema], default: [] },
  vnpayTxnRef: { type: String },
  paymentDeadline: { type: Date }
}, {
  timestamps: true
});

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, paymentStatus: 1, createdAt: -1 });
OrderSchema.index({ paymentStatus: 1, status: 1, createdAt: -1 });
OrderSchema.index({ userId: 1, couponCode: 1 });
OrderSchema.index({ 'items.productId': 1, userId: 1, status: 1 });
OrderSchema.index(
  { paymentMethod: 1, paymentStatus: 1, paymentDeadline: 1 },
  { partialFilterExpression: { paymentMethod: 'vnpay', paymentStatus: 'pending' } }
);

export const Order = model<IOrder>('Order', OrderSchema);
