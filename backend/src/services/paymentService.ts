import crypto from 'crypto';
import qs from 'qs';
import { Types } from 'mongoose';
import { Order, Product, Coupon } from '../models';
import { emitOrderEvent } from '../config/socket';
import { emailService } from './emailService';
import { getVnpayConfig } from '../config/env';

function createPaymentError(message: string, statusCode = 400) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function cancelAndRestockPendingVnpayOrder(orderId: any, txnRef: string, note: string): Promise<boolean> {
  const cancelledOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: 'pending',
      paymentStatus: { $ne: 'paid' },
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
    { returnDocument: 'after' }
  );

  if (!cancelledOrder) {
    return false;
  }

  for (const item of cancelledOrder.items) {
    await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
  }

  if (cancelledOrder.couponCode) {
    await Coupon.updateOne(
      { code: cancelledOrder.couponCode, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } }
    );
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
      paymentStatus: { $ne: 'paid' },
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
    const createDate = getVnpayDateFormat(now);
    const expireDate = getVnpayDateFormat(new Date(now.getTime() + 15 * 60 * 1000));
    const txnRef = `${order._id}-${now.getTime()}`;

    order.vnpayTxnRef = txnRef;
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
    const secureHash = vnp_Params['vnp_SecureHash'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    const rawTxnRef = typeof vnp_Params['vnp_TxnRef'] === 'string' ? vnp_Params['vnp_TxnRef'] : '';
    const rawResponseCode = typeof vnp_Params['vnp_ResponseCode'] === 'string' ? vnp_Params['vnp_ResponseCode'] : '';
    const rawAmount = vnp_Params['vnp_Amount'];

    vnp_Params = sortObject(vnp_Params);

    const secretKey = vnpayConfig.hashSecret;
    const signData = qs.stringify(vnp_Params, { encode: false });
    const checkHash = generateHmacSha512(secretKey, signData);

    if (!verifySecureHash(secureHash, checkHash)) {
      throw createPaymentError('Checksum verification failed.', 400);
    }

    const orderId = rawTxnRef.split('-')[0] || '';
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

    // Idempotent handling when order is already paid (e.g. IPN arrived before Return URL)
    if (order.paymentStatus === 'paid') {
      if (rawResponseCode === '00' && order.vnpayTxnRef === rawTxnRef) {
        return { success: true, orderId: order._id, message: 'Payment completed successfully.' };
      }
      throw createPaymentError('Order has already been paid; stale transaction callback rejected.', 400);
    }

    if (!order.vnpayTxnRef || order.vnpayTxnRef !== rawTxnRef) {
      throw createPaymentError('Invalid or superseded payment transaction reference.', 400);
    }

    if (rawResponseCode === '00') {
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
      `Payment failed (VNPAY code: ${rawResponseCode || 'unknown'}).`
    );
    return { success: false, orderId: order._id, message: 'Payment failed.' };
  },

  async handleIpn(queryParams: any) {
    const vnpayConfig = getVnpayConfig();
    if (!vnpayConfig) {
      return { RspCode: '99', Message: 'Payment gateway disabled' };
    }

    let vnp_Params: Record<string, any> = { ...(queryParams || {}) };
    const secureHash = vnp_Params['vnp_SecureHash'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    const rawTxnRef = typeof vnp_Params['vnp_TxnRef'] === 'string' ? vnp_Params['vnp_TxnRef'] : '';
    const rawResponseCode = typeof vnp_Params['vnp_ResponseCode'] === 'string' ? vnp_Params['vnp_ResponseCode'] : '';
    const rawAmount = vnp_Params['vnp_Amount'];

    vnp_Params = sortObject(vnp_Params);

    const secretKey = vnpayConfig.hashSecret;
    const signData = qs.stringify(vnp_Params, { encode: false });
    const checkHash = generateHmacSha512(secretKey, signData);

    if (!verifySecureHash(secureHash, checkHash)) {
      return { RspCode: '97', Message: 'Checksum failed' };
    }

    const orderId = rawTxnRef.split('-')[0] || '';
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

    if (order.paymentStatus === 'paid') {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    if (!order.vnpayTxnRef || order.vnpayTxnRef !== rawTxnRef) {
      return { RspCode: '01', Message: 'Transaction reference mismatch' };
    }

    if (rawResponseCode === '00') {
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
        `Payment failed via IPN callback (code: ${rawResponseCode || 'unknown'}).`
      );
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  },
};
