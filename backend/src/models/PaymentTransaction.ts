import { Schema, model, Document, Types } from 'mongoose';

export interface IPaymentTransaction extends Document {
  orderId?: Types.ObjectId;
  txnRef: string;
  source: 'ipn' | 'return';
  rawQuery: Record<string, any>;
  rspCode: string;
  transactionStatus?: string;
  amount?: number;
  verified: boolean;
  createdAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    txnRef: { type: String, required: true, index: true },
    source: { type: String, enum: ['ipn', 'return'], required: true },
    rawQuery: { type: Schema.Types.Mixed, required: true },
    rspCode: { type: String, default: '' },
    transactionStatus: { type: String },
    amount: { type: Number },
    verified: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

PaymentTransactionSchema.index({ txnRef: 1, source: 1, createdAt: -1 });

export const PaymentTransaction = model<IPaymentTransaction>('PaymentTransaction', PaymentTransactionSchema);
