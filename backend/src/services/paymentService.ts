import crypto from 'crypto';
import qs from 'qs';
import { Types } from 'mongoose';
import { Order, Product, Coupon, CouponRedemption, PaymentTransaction } from '../models';
import { withTransaction } from '../config/db';
import { emitOrderEvent, getIO } from '../config/socket';
import { emailService } from './emailService';
import { getVnpayConfig } from '../config/env';
import { auditService } from './auditService';

const DEFAULT_PAYMENT_WINDOW_MS = 15 * 60 * 1000;
const MIN_REMAINING_PAYMENT_WINDOW_MS = 2 * 60 * 1000;

function createPaymentError(message: string, statusCode = 400) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function logPaymentTransaction(entry: {
  orderId?: any;
  txnRef: string;
  source: 'ipn' | 'return';
  rawQuery: Record<string, any>;
  rspCode: string;
  transactionStatus?: string;
  amount?: number;
  verified: boolean;
}) {
  try {
    await PaymentTransaction.create({
      orderId: entry.orderId && Types.ObjectId.isValid(String(entry.orderId)) ? entry.orderId : undefined,
      txnRef: entry.txnRef || 'unknown',
      source: entry.source,
      rawQuery: entry.rawQuery || {},
      rspCode: entry.rspCode || '',
      transactionStatus: entry.transactionStatus,
      amount: Number.isFinite(entry.amount) ? entry.amount : undefined,
      verified: entry.verified,
    });
  } catch (err: any) {
    console.error('Failed to log PaymentTransaction:', err?.message || err);
  }
}

async function cancelAndRestockPendingVnpayOrder(orderId: any, txnRef: string, note: string): Promise<boolean> {
  const cancelledOrder = await withTransaction(async (session) => {
    const findOpts = session ? { session } : undefined;
    const atomic = await Order.findOneAndUpdate(
      {
        _id: orderId,
        status: 'pending',
        paymentStatus: { $nin: ['paid', 'review'] },
        vnpayTxnRef: txnRef,
      },
      {
        $set: {
          paymentStatus: 'failed',
          status: 'cancelled',
        },
        $push: {
          statusHistory: { status: 'cancelled', timestamp: new Date(), note },
        },
      },
      { returnDocument: 'after', ...(findOpts || {}) }
    );

    if (!atomic) return null;

    for (const item of atomic.items) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } }, findOpts);
    }

    if (atomic.couponCode) {
      await Coupon.updateOne(
        { code: atomic.couponCode, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } },
        findOpts
      );
      await CouponRedemption.deleteMany({ orderId: atomic._id }, findOpts);
    }

    return atomic;
  });

  if (!cancelledOrder) {
    return false;
  }

  const populated = await Order.findById(cancelledOrder._id)
    .populate('userId', 'name email')
    .populate('items.productId', 'name image');
  const obj = populated ? (populated as any).toObject() : cancelledOrder.toObject();
  emitOrderEvent('order:cancelled', { ...obj, id: obj._id });

  return true;
}

async function confirmPaidVnpayOrder(orderId: any, txnRef: string, note: string) {
  const confirmedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: 'pending',
      paymentStatus: { $nin: ['paid', 'review'] },
      vnpayTxnRef: txnRef,
    },
    {
      $set: {
        paymentStatus: 'paid',
        status: 'confirmed',
      },
      $push: {
        statusHistory: { status: 'confirmed', timestamp: new Date(), note },
      },
    },
    { returnDocument: 'after' }
  );

  if (!confirmedOrder) {
    return null;
  }

  const populated = await Order.findById(confirmedOrder._id)
    .populate('userId', 'name email')
    .populate('items.productId', 'name image');
  const obj = populated ? (populated as any).toObject() : confirmedOrder.toObject();
  emitOrderEvent('order:updated', { ...obj, id: obj._id });

  if (populated && (populated as any).userId?.email) {
    emailService.sendOrderStatusUpdate((populated as any).userId.email, obj._id.toString(), 'confirmed');
  }

  return confirmedOrder;
}

async function flagPaidAfterExpiryForReview(
  orderId: any,
  txnRef: string,
  amount: number,
  source: 'ipn' | 'return'
) {
  const flaggedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: 'cancelled',
      paymentStatus: { $nin: ['paid', 'review'] },
      vnpayTxnRef: txnRef,
    },
    {
      $set: {
        paymentStatus: 'review',
      },
      $push: {
        statusHistory: {
          status: 'cancelled',
          timestamp: new Date(),
          note: `Late VNPAY payment received via ${source.toUpperCase()} after order cancellation — flagged for admin reconciliation.`,
        },
      },
    },
    { returnDocument: 'after' }
  );

  if (!flaggedOrder) {
    return null;
  }

  await auditService.record({
    userId: String(flaggedOrder.userId),
    action: 'VNPAY_PAID_AFTER_EXPIRY',
    targetType: 'Order',
    targetId: String(flaggedOrder._id),
    oldValue: { status: 'cancelled', paymentStatus: 'failed' },
    newValue: { status: 'cancelled', paymentStatus: 'review', txnRef, amount, source },
  });

  const populated = await Order.findById(flaggedOrder._id)
    .populate('userId', 'name email')
    .populate('items.productId', 'name image');
  const obj = populated ? (populated as any).toObject() : flaggedOrder.toObject();
  const payload = { ...obj, id: obj._id };

  const io = getIO();
  if (io) {
    io.to('role:admin').emit('order:payment_review', payload);
  }
  emitOrderEvent('order:updated', payload);

  return flaggedOrder;
}

function sortObject(obj: Record<string, any>) {
  const sorted: Record<string, string> = {};
  const str: string[] = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (let i = 0; i < str.length; i++) {
    sorted[str[i]] = encodeURIComponent(obj[str[i]]).replace(/%20/g, '+');
  }
  return sorted;
}

function generateHmacSha512(secret: string, data: string) {
  const hmac = crypto.createHmac('sha512', secret);
  return hmac.update(Buffer.from(data, 'utf-8')).digest('hex');
}

function verifySecureHash(receivedHash: unknown, expectedHash: string): boolean {
  if (typeof receivedHash !== 'string' || !receivedHash) return false;
  const a = Buffer.from(receivedHash.trim().toLowerCase(), 'utf-8');
  const b = Buffer.from(expectedHash.trim().toLowerCase(), 'utf-8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * VNPAY requires timestamps formatted in Vietnam Standard Time (GMT+7 / Asia/Ho_Chi_Minh).
 */
export function getVnpayDateFormat(date: Date): string {
  const vnDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return (
    vnDate.getUTCFullYear().toString() +
    pad(vnDate.getUTCMonth() + 1) +
    pad(vnDate.getUTCDate()) +
    pad(vnDate.getUTCHours()) +
    pad(vnDate.getUTCMinutes()) +
    pad(vnDate.getUTCSeconds())
  );
}

function normalizeClientIp(rawIp: string | string[] | undefined): string {
  const firstEntry = Array.isArray(rawIp) ? rawIp[0] : rawIp || '127.0.0.1';
  const primary = String(firstEntry).split(',')[0].trim() || '127.0.0.1';
  return primary.includes('::ffff:') ? primary.replace('::ffff:', '') : primary;
}

export const paymentService = {
  getAvailableMethods() {
    return {
      cod: true,
      vnpay: Boolean(getVnpayConfig()),
    };
  },

  async createPaymentUrl(
    orderId: string,
    ipAddr: string | string[],
    requesterId?: string,
    requesterRole?: string
  ) {
    const vnpayConfig = getVnpayConfig();
    if (!vnpayConfig) {
      throw createPaymentError('VNPAY payment gateway is currently unavailable.', 503);
    }

    if (!Types.ObjectId.isValid(orderId)) {
      throw createPaymentError('Order does not exist.', 404);
    }

    if (!requesterId) {
      throw createPaymentError('Authentication required.', 401);
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw createPaymentError('Order does not exist.', 404);
    }

    if (order.userId.toString() !== requesterId.toString() && requesterRole !== 'admin') {
      throw createPaymentError('You do not have permission to initiate payment for this order.', 403);
    }

    if (order.paymentMethod !== 'vnpay') {
      throw createPaymentError('This order does not use VNPAY payment.', 400);
    }

    if (order.paymentStatus === 'paid') {
      throw createPaymentError('This order has already been paid.', 400);
    }

    if (order.status !== 'pending') {
      throw createPaymentError(`Cannot initiate payment for an order in "${order.status}" status.`, 400);
    }

    const { tmnCode, hashSecret: secretKey, url: vnpUrl, returnUrl } = vnpayConfig;
    const now = new Date();
    const orderDeadline =
      order.paymentDeadline || new Date(order.createdAt.getTime() + DEFAULT_PAYMENT_WINDOW_MS);
    const remainingMs = orderDeadline.getTime() - now.getTime();
    if (remainingMs < MIN_REMAINING_PAYMENT_WINDOW_MS) {
      throw createPaymentError(
        'Payment window has nearly expired. Please place a new order.',
        400
      );
    }

    const tmnCode = process.env.VNPAY_TMN_CODE || 'mock_tmn_code';
    const secretKey = process.env.VNPAY_HASH_SECRET || 'mock_hash_secret';
    const vnpUrl = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const returnUrl = process.env.VNPAY_RETURN_URL || 'http://localhost:3000/payment-result';

    const createDate = getVnpayDateFormat(now);
    const effectiveExpireMs = Math.min(now.getTime() + DEFAULT_PAYMENT_WINDOW_MS, orderDeadline.getTime());
    const expireDate = getVnpayDateFormat(new Date(effectiveExpireMs));
    const uniqueSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const txnRef = `${order._id}-${uniqueSuffix}`;

    order.vnpayTxnRef = txnRef;
    if (!order.paymentDeadline) {
      order.paymentDeadline = orderDeadline;
    }
    await order.save();

    const amount = Math.round(order.totalAmount * 100);
    const cleanIp = normalizeClientIp(ipAddr);

    let vnp_Params: Record<string, any> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'en',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Payment for order #${order._id}`,
      vnp_OrderType: 'other',
      vnp_Amount: amount,
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: cleanIp,
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    vnp_Params = sortObject(vnp_Params);

    const signData = qs.stringify(vnp_Params, { encode: false });
    const secureHash = generateHmacSha512(secretKey, signData);

    vnp_Params['vnp_SecureHash'] = secureHash;
    return `${vnpUrl}?${qs.stringify(vnp_Params, { encode: false })}`;
  },

  async verifyPayment(queryParams: any) {
    const vnpayConfig = getVnpayConfig();
    if (!vnpayConfig) {
      throw createPaymentError('VNPAY payment gateway is currently unavailable.', 503);
    }

    let vnp_Params: Record<string, any> = { ...(queryParams || {}) };
    const rawQuery: Record<string, any> = { ...(queryParams || {}) };
    let vnp_Params: Record<string, any> = { ...rawQuery };
    const secureHash = vnp_Params['vnp_SecureHash'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    const rawTxnRef = typeof vnp_Params['vnp_TxnRef'] === 'string' ? vnp_Params['vnp_TxnRef'] : '';
    const rawResponseCode = typeof vnp_Params['vnp_ResponseCode'] === 'string' ? vnp_Params['vnp_ResponseCode'] : '';
    const rawTransactionStatus =
      typeof vnp_Params['vnp_TransactionStatus'] === 'string' ? vnp_Params['vnp_TransactionStatus'] : '';
    const rawTmnCode = typeof vnp_Params['vnp_TmnCode'] === 'string' ? vnp_Params['vnp_TmnCode'] : '';
    const rawAmount = vnp_Params['vnp_Amount'];
    const orderId = rawTxnRef.split('-')[0] || '';

    vnp_Params = sortObject(vnp_Params);

    const secretKey = vnpayConfig.hashSecret;
    const expectedTmnCode = process.env.VNPAY_TMN_CODE || 'mock_tmn_code';
    const secretKey = process.env.VNPAY_HASH_SECRET || 'mock_hash_secret';
    const signData = qs.stringify(vnp_Params, { encode: false });
    const checkHash = generateHmacSha512(secretKey, signData);
    const hashValid = verifySecureHash(secureHash, checkHash);

    await logPaymentTransaction({
      orderId,
      txnRef: rawTxnRef,
      source: 'return',
      rawQuery,
      rspCode: rawResponseCode,
      transactionStatus: rawTransactionStatus,
      amount: Number(rawAmount),
      verified: hashValid,
    });

    if (!hashValid) {
      throw createPaymentError('Checksum verification failed.', 400);
    }

    if (!rawTmnCode || rawTmnCode !== expectedTmnCode) {
      throw createPaymentError('Merchant terminal code mismatch.', 400);
    }

    if (!Types.ObjectId.isValid(orderId)) {
      throw createPaymentError('Corresponding order not found.', 404);
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw createPaymentError('Corresponding order not found.', 404);
    }

    const callbackAmount = Number(rawAmount);
    const expectedAmount = Math.round(order.totalAmount * 100);
    if (!Number.isFinite(callbackAmount) || callbackAmount !== expectedAmount) {
      throw createPaymentError('Payment amount does not match order total.', 400);
    }

    const isSuccessfulPayment = rawResponseCode === '00' && rawTransactionStatus === '00';

    // Idempotent handling when order is already paid (e.g. IPN arrived before Return URL)
    if (order.paymentStatus === 'paid') {
      if (isSuccessfulPayment && order.vnpayTxnRef === rawTxnRef) {
        return { success: true, orderId: order._id, message: 'Payment completed successfully.' };
      }
      throw createPaymentError('Order has already been paid; stale transaction callback rejected.', 400);
    }

    if (!order.vnpayTxnRef || order.vnpayTxnRef !== rawTxnRef) {
      throw createPaymentError('Invalid or superseded payment transaction reference.', 400);
    }

    if (isSuccessfulPayment) {
      if (order.status === 'cancelled') {
        await flagPaidAfterExpiryForReview(order._id, rawTxnRef, callbackAmount, 'return');
        return {
          success: false,
          needsReview: true,
          orderId: order._id,
          message: 'Payment was received after order expiry and has been flagged for reconciliation.',
        };
      }

      const updated = await confirmPaidVnpayOrder(
        order._id,
        rawTxnRef,
        'Payment verified via frontend callback.'
      );
      if (!updated) {
        const refreshed = await Order.findById(order._id);
        if (refreshed?.paymentStatus === 'paid') {
          return { success: true, orderId: order._id, message: 'Payment completed successfully.' };
        }
        throw createPaymentError('Order is no longer eligible for payment confirmation.', 400);
      }
      return { success: true, orderId: order._id, message: 'Payment completed successfully.' };
    }

    await cancelAndRestockPendingVnpayOrder(
      order._id,
      rawTxnRef,
      `Payment failed (VNPAY code: ${rawResponseCode || 'unknown'}, txnStatus: ${rawTransactionStatus || 'unknown'}).`
    );
    return { success: false, orderId: order._id, message: 'Payment failed.' };
  },

  async handleIpn(queryParams: any) {
    const vnpayConfig = getVnpayConfig();
    if (!vnpayConfig) {
      return { RspCode: '99', Message: 'Payment gateway disabled' };
    }

    let vnp_Params: Record<string, any> = { ...(queryParams || {}) };
    const rawQuery: Record<string, any> = { ...(queryParams || {}) };
    let vnp_Params: Record<string, any> = { ...rawQuery };
    const secureHash = vnp_Params['vnp_SecureHash'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    const rawTxnRef = typeof vnp_Params['vnp_TxnRef'] === 'string' ? vnp_Params['vnp_TxnRef'] : '';
    const rawResponseCode = typeof vnp_Params['vnp_ResponseCode'] === 'string' ? vnp_Params['vnp_ResponseCode'] : '';
    const rawTransactionStatus =
      typeof vnp_Params['vnp_TransactionStatus'] === 'string' ? vnp_Params['vnp_TransactionStatus'] : '';
    const rawTmnCode = typeof vnp_Params['vnp_TmnCode'] === 'string' ? vnp_Params['vnp_TmnCode'] : '';
    const rawAmount = vnp_Params['vnp_Amount'];
    const orderId = rawTxnRef.split('-')[0] || '';

    vnp_Params = sortObject(vnp_Params);

    const secretKey = vnpayConfig.hashSecret;
    const expectedTmnCode = process.env.VNPAY_TMN_CODE || 'mock_tmn_code';
    const secretKey = process.env.VNPAY_HASH_SECRET || 'mock_hash_secret';
    const signData = qs.stringify(vnp_Params, { encode: false });
    const checkHash = generateHmacSha512(secretKey, signData);
    const hashValid = verifySecureHash(secureHash, checkHash);

    await logPaymentTransaction({
      orderId,
      txnRef: rawTxnRef,
      source: 'ipn',
      rawQuery,
      rspCode: rawResponseCode,
      transactionStatus: rawTransactionStatus,
      amount: Number(rawAmount),
      verified: hashValid,
    });

    if (!hashValid) {
      return { RspCode: '97', Message: 'Checksum failed' };
    }

    if (!rawTmnCode || rawTmnCode !== expectedTmnCode) {
      return { RspCode: '97', Message: 'Invalid TmnCode' };
    }

    if (!Types.ObjectId.isValid(orderId)) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    const callbackAmount = Number(rawAmount);
    const dbAmount = Math.round(order.totalAmount * 100);
    if (!Number.isFinite(callbackAmount) || callbackAmount !== dbAmount) {
      return { RspCode: '04', Message: 'Amount invalid' };
    }

    if (order.paymentStatus === 'paid' || order.paymentStatus === 'review') {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    if (!order.vnpayTxnRef || order.vnpayTxnRef !== rawTxnRef) {
      return { RspCode: '01', Message: 'Transaction reference mismatch' };
    }

    const isSuccessfulPayment = rawResponseCode === '00' && rawTransactionStatus === '00';

    if (isSuccessfulPayment) {
      if (order.status === 'cancelled') {
        await flagPaidAfterExpiryForReview(order._id, rawTxnRef, callbackAmount, 'ipn');
        return { RspCode: '00', Message: 'Confirm Success' };
      }

      const updated = await confirmPaidVnpayOrder(
        order._id,
        rawTxnRef,
        'Payment verified via IPN callback.'
      );
      if (!updated) {
        return { RspCode: '02', Message: 'Order already confirmed' };
      }
    } else {
      await cancelAndRestockPendingVnpayOrder(
        order._id,
        rawTxnRef,
        `Payment failed via IPN callback (code: ${rawResponseCode || 'unknown'}, txnStatus: ${rawTransactionStatus || 'unknown'}).`
      );
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  },
};
