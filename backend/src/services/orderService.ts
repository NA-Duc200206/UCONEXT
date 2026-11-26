import { ClientSession, Types } from 'mongoose';
import { Order, Product, Coupon, CouponRedemption } from '../models';
import { withTransaction } from '../config/db';
import { emitOrderEvent } from '../config/socket';
import { emailService } from './emailService';
import { couponService } from './couponService';
import { cacheService } from '../utils/cache';
import { auditService } from './auditService';
import { getVnpayConfig } from '../config/env';
import { assertTransition, isRestockedStatus, OrderStatus } from './orderTransitions';

function createOrderError(message: string, statusCode = 400, code?: string) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

const DEFAULT_VNPAY_RESERVATION_MS = 15 * 60 * 1000;
export const COD_MAX_TOTAL_VND = 5_000_000;
export const COD_MAX_ACTIVE_ORDERS = 2;
const ACTIVE_COD_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'packaging', 'shipping'];

async function claimPerUserCouponSlot(params: {
  couponId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  perUserLimit: number;
  session: ClientSession | null;
}) {
  const { couponId, userId, orderId, perUserLimit, session } = params;
  const createOpts = session ? { session } : undefined;

  if (perUserLimit <= 0) {
    await CouponRedemption.create([{ couponId, userId, orderId }], createOpts);
    return;
  }

  const existingQuery = CouponRedemption.find({ couponId, userId }).select('slot');
  if (session) existingQuery.session(session);
  const existing = await existingQuery;
  const usedSlots = new Set(existing.map((r) => r.slot).filter((s): s is number => typeof s === 'number'));

  for (let slot = 0; slot < perUserLimit; slot += 1) {
    if (usedSlots.has(slot)) continue;
    try {
      await CouponRedemption.create([{ couponId, userId, orderId, slot }], createOpts);
      return;
    } catch (err: any) {
      if (err?.code === 11000) {
        // Concurrent request claimed this slot; try next slot if available
        continue;
      }
      throw err;
    }
  }

  throw createOrderError(
    `You have already reached the usage limit (${perUserLimit}) for this coupon.`,
    400
  );
}

async function restockOrderAndReleaseCoupon(
  order: { _id: any; items: Array<{ productId: any; quantity: number }>; couponCode?: string },
  session: ClientSession | null,
  releaseCoupon: boolean
) {
  const opts = session ? { session } : undefined;
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } }, opts);
  }
  if (releaseCoupon && order.couponCode) {
    await Coupon.updateOne(
      { code: order.couponCode, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
      opts
    );
    await CouponRedemption.deleteMany({ orderId: order._id }, opts);
  }
}

export const orderService = {
  async createOrder(
    userId: string,
    data: { items: any[]; shippingAddress: any; paymentMethod?: string; couponCode?: string }
  ) {
    const { items, shippingAddress, paymentMethod, couponCode } = data || ({} as any);

    if (!Array.isArray(items) || items.length === 0) {
      throw createOrderError('Your cart is empty.', 400);
    }

    const normalizedAddress =
      typeof shippingAddress === 'object' && shippingAddress !== null
        ? JSON.stringify(shippingAddress)
        : typeof shippingAddress === 'string'
          ? shippingAddress.trim()
          : '';
    if (!normalizedAddress || normalizedAddress === '{}') {
      throw createOrderError('Shipping address is required.', 400);
    }

    const normalizedMethod = paymentMethod === 'vnpay' ? 'vnpay' : 'cod';
    if (normalizedMethod === 'vnpay' && !getVnpayConfig()) {
      throw createOrderError('VNPAY payment gateway is currently disabled.', 503);
    }

    // Validate item shapes & aggregate total quantity per productId across variants
    const qtyByProductId = new Map<string, number>();
    for (const item of items) {
      const pid = String(item?.productId || '').trim();
      if (!Types.ObjectId.isValid(pid)) {
        throw createOrderError('Invalid product identifier in cart.', 400);
      }

      const rawQty =
        typeof item?.quantity === 'string' && item.quantity.trim() !== ''
          ? Number(item.quantity)
          : item?.quantity;
      if (typeof rawQty !== 'number' || !Number.isInteger(rawQty) || rawQty < 1) {
        throw createOrderError('Item quantity must be a positive integer.', 400);
      }

      qtyByProductId.set(pid, (qtyByProductId.get(pid) || 0) + rawQty);
    }

    const uniqueProductIds = Array.from(qtyByProductId.keys());
    const userObjectId = new Types.ObjectId(userId);

    const createdOrderId = await withTransaction(async (session) => {
      const findOpts = session ? { session } : undefined;
      const productsQuery = Product.find({
        _id: { $in: uniqueProductIds },
        isDeleted: { $ne: true },
      });
      if (session) productsQuery.session(session);
      const products = await productsQuery;
      const productMap = new Map(products.map((p) => [p._id.toString(), p]));

      for (const [pid, totalRequestedQty] of qtyByProductId.entries()) {
        const product = productMap.get(pid);
        if (!product) {
          throw createOrderError('Product not found.', 400);
        }
        if (product.stock < totalRequestedQty) {
          throw createOrderError(
            `Product "${product.name}" has insufficient stock (available: ${product.stock}).`,
            400
          );
        }
      }

      let subtotal = 0;
      const orderItems = items.map((item) => {
        const pid = String(item.productId).trim();
        const product = productMap.get(pid)!;
        const itemQuantity = Number(item.quantity);
        const itemPrice = product.price;
        subtotal += itemPrice * itemQuantity;

        return {
          productId: product._id,
          name: product.name,
          price: itemPrice,
          image: product.image,
          quantity: itemQuantity,
          color: item.color || undefined,
          size: item.size || undefined,
        };
      });

      const orderObjectId = new Types.ObjectId();

      // Track reservations for standalone (non-transaction) manual rollback
      const deductedStock: Array<{ productId: string; qty: number }> = [];
      let reservedCouponId: Types.ObjectId | null = null;
      let createdRedemption = false;

      const manualRollback = async () => {
        if (session) return; // MongoDB transaction aborts automatically
        for (const entry of deductedStock) {
          await Product.findByIdAndUpdate(entry.productId, { $inc: { stock: entry.qty } });
        }
        if (createdRedemption) {
          await CouponRedemption.deleteMany({ orderId: orderObjectId });
        }
        if (reservedCouponId) {
          await Coupon.updateOne(
            { _id: reservedCouponId, usedCount: { $gt: 0 } },
            { $inc: { usedCount: -1 } }
          );
        }
      };

      try {
        let discountAmount = 0;
        let appliedCoupon: string | undefined = undefined;

        if (couponCode) {
          const validation = await couponService.validateCoupon(couponCode, subtotal, userId, session);
          const couponObjectId = new Types.ObjectId(String(validation.coupon.id));
          const perUserLimit =
            typeof validation.coupon.perUserLimit === 'number' ? validation.coupon.perUserLimit : 1;

          // Atomically claim per-user coupon slot first via unique index
          await claimPerUserCouponSlot({
            couponId: couponObjectId,
            userId: userObjectId,
            orderId: orderObjectId,
            perUserLimit,
            session,
          });
          createdRedemption = true;

          const reservedCoupon = await Coupon.findOneAndUpdate(
            {
              _id: couponObjectId,
              isDeleted: false,
              $expr: { $lt: ['$usedCount', '$usageLimit'] },
            },
            { $inc: { usedCount: 1 } },
            { returnDocument: 'after', ...(findOpts || {}) }
          );

          if (!reservedCoupon) {
            throw createOrderError('Coupon usage limit has been reached.', 400);
          }

          discountAmount = validation.discountAmount;
          appliedCoupon = validation.code;
          reservedCouponId = reservedCoupon._id as Types.ObjectId;
        }

        const shippingFee = subtotal > 1000000 ? 0 : 30000;
        const totalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

        // Enforce COD risk caps (Decision D3)
        if (normalizedMethod === 'cod') {
          if (totalAmount > COD_MAX_TOTAL_VND) {
            throw createOrderError(
              `COD orders are limited to ${COD_MAX_TOTAL_VND.toLocaleString('en-US')} VND. Please use VNPAY for higher-value orders.`,
              400,
              'COD_LIMIT_EXCEEDED'
            );
          }

          const activeCodQuery = Order.countDocuments({
            userId: userObjectId as any,
            paymentMethod: 'cod',
            status: { $in: ACTIVE_COD_STATUSES },
          });
          if (session) activeCodQuery.session(session);
          const activeCodCount = await activeCodQuery;

          if (activeCodCount >= COD_MAX_ACTIVE_ORDERS) {
            throw createOrderError(
              `You can have at most ${COD_MAX_ACTIVE_ORDERS} active undelivered COD orders at a time.`,
              400,
              'COD_ACTIVE_LIMIT_EXCEEDED'
            );
          }
        }

        for (const [pid, totalQty] of qtyByProductId.entries()) {
          const updatedProduct = await Product.findOneAndUpdate(
            {
              _id: pid,
              isDeleted: { $ne: true },
              stock: { $gte: totalQty },
            },
            { $inc: { stock: -totalQty } },
            { returnDocument: 'after', ...(findOpts || {}) }
          );

          if (!updatedProduct) {
            const prodName = productMap.get(pid)?.name || 'Selected item';
            throw createOrderError(`Product "${prodName}" has insufficient stock.`, 400);
          }

          deductedStock.push({ productId: pid, qty: totalQty });
        }

        const paymentDeadline =
          normalizedMethod === 'vnpay'
            ? new Date(Date.now() + DEFAULT_VNPAY_RESERVATION_MS)
            : undefined;

        const orderDoc = new Order({
          _id: orderObjectId,
          userId: userObjectId,
          shippingAddress: normalizedAddress,
          paymentMethod: normalizedMethod,
          paymentStatus: 'pending',
          status: 'pending',
          items: orderItems as any,
          couponCode: appliedCoupon || undefined,
          discountAmount,
          totalAmount,
          paymentDeadline,
          statusHistory: [
            {
              status: 'pending',
              timestamp: new Date(),
              note: `Order placed successfully.${appliedCoupon ? ` (Coupon: ${appliedCoupon})` : ''}`,
            },
          ],
        } as any);

        await orderDoc.save(findOpts);
        return orderDoc._id;
      } catch (err) {
        await manualRollback();
        throw err;
      }
    });

    const populatedOrder = await Order.findById(createdOrderId)
      .populate('userId', 'name email')
      .populate('items.productId', 'name image');

    const obj = populatedOrder ? (populatedOrder as any).toObject() : { _id: createdOrderId };
    const result = {
      ...obj,
      id: obj._id,
    };

    await cacheService.invalidateByPrefix('cache:products:', 'cache:analytics:');
    emitOrderEvent('order:created', result);
    if (populatedOrder && (populatedOrder as any).userId?.email) {
      emailService.sendOrderConfirmation({
        orderId: obj._id.toString(),
        customerEmail: (populatedOrder as any).userId.email,
        customerName: (populatedOrder as any).userId.name || 'Valued Customer',
        totalAmount: obj.totalAmount,
        items: obj.items,
        shippingAddress: obj.shippingAddress,
      });
    }

    return result;
  },

  async getMyOrders(userId: string) {
    const orders = await Order.find({ userId: userId as any })
      .populate('items.productId', 'name image')
      .sort({ createdAt: -1 });

    return orders.map((order) => {
      const obj = order.toObject();
      return {
        ...obj,
        id: obj._id,
      };
    });
  },

  async getOrderById(id: string, userId: string, userRole: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw createOrderError('Order does not exist.', 404);
    }

    const order = await Order.findById(id)
      .populate('userId', 'name email')
      .populate('items.productId', 'name image');

    if (!order) {
      throw createOrderError('Order does not exist.', 404);
    }

    const ownerId = (order.userId as any)?._id
      ? (order.userId as any)._id.toString()
      : order.userId.toString();

    if (ownerId !== userId.toString() && userRole !== 'admin') {
      throw createOrderError('You do not have permission to view this order.', 403);
    }

    const obj = order.toObject();
    return {
      ...obj,
      id: obj._id,
    };
  },

  async getAllOrders() {
    const orders = await Order.find()
      .populate('userId', 'name email')
      .populate('items.productId', 'name image')
      .sort({ createdAt: -1 });

    return orders.map((order) => {
      const obj = order.toObject();
      return {
        ...obj,
        id: obj._id,
        user: obj.userId,
      };
    });
  },

  async updateOrderStatus(
    id: string,
    status?: string,
    paymentStatus?: string,
    actorId?: string,
    ipAddress?: string
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw createOrderError('Order does not exist.', 404);
    }

    const { updatedOrder, previousStatus, previousPaymentStatus } = await withTransaction(
      async (session) => {
        const findOpts = session ? { session } : undefined;
        const orderQuery = Order.findById(id);
        if (session) orderQuery.session(session);
        const order = await orderQuery;

        if (!order) {
          throw createOrderError('Order does not exist.', 404);
        }

        const prevStatus = order.status as OrderStatus;
        const prevPaymentStatus = order.paymentStatus;

        if (status) {
          assertTransition(prevStatus, status);
        }

        const nextStatus = (status || prevStatus) as OrderStatus;
        let nextPaymentStatus = order.paymentStatus;
        if (status === 'delivered' || status === 'completed') {
          nextPaymentStatus = 'paid';
        }
        if (paymentStatus) {
          nextPaymentStatus = paymentStatus as any;
        }

        const updateDoc: any = {
          $set: {
            status: nextStatus,
            paymentStatus: nextPaymentStatus,
          },
        };
        if (status && status !== prevStatus) {
          updateDoc.$push = {
            statusHistory: {
              status: nextStatus,
              timestamp: new Date(),
              note: 'Status updated by Admin.',
            },
          };
        }

        const atomicOrder = await Order.findOneAndUpdate(
          { _id: id, status: prevStatus },
          updateDoc,
          { returnDocument: 'after', ...(findOpts || {}) }
        );

        if (!atomicOrder) {
          throw createOrderError(
            'Order status was modified concurrently. Please refresh and try again.',
            409,
            'CONCURRENT_ORDER_MODIFICATION'
          );
        }

        if (!isRestockedStatus(prevStatus) && isRestockedStatus(nextStatus)) {
          await restockOrderAndReleaseCoupon(
            atomicOrder as any,
            session,
            nextStatus === 'cancelled' || nextStatus === 'refund_completed'
          );
        }

        return {
          updatedOrder: atomicOrder,
          previousStatus: prevStatus,
          previousPaymentStatus: prevPaymentStatus,
        };
      }
    );

    await cacheService.invalidateByPrefix('cache:products:', 'cache:analytics:');
    await auditService.record({
      userId: actorId,
      action: 'ORDER_STATUS_UPDATE',
      targetType: 'Order',
      targetId: String(updatedOrder._id),
      oldValue: { status: previousStatus, paymentStatus: previousPaymentStatus },
      newValue: { status: updatedOrder.status, paymentStatus: updatedOrder.paymentStatus },
      ipAddress,
    });

    const populatedOrder = await Order.findById(id)
      .populate('userId', 'name email')
      .populate('items.productId', 'name image');

    const obj = populatedOrder ? (populatedOrder as any).toObject() : updatedOrder.toObject();
    const result = {
      ...obj,
      id: obj._id,
      user: obj.userId,
    };

    emitOrderEvent('order:updated', result);
    if (populatedOrder && (populatedOrder as any).userId?.email && status) {
      emailService.sendOrderStatusUpdate((populatedOrder as any).userId.email, obj._id.toString(), status);
    }

    return result;
  },

  async cancelOrder(id: string, userId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw createOrderError('Order does not exist.', 404);
    }

    const cancelledOrder = await withTransaction(async (session) => {
      const findOpts = session ? { session } : undefined;
      const orderQuery = Order.findById(id);
      if (session) orderQuery.session(session);
      const order = await orderQuery;

      if (!order) {
        throw createOrderError('Order does not exist.', 404);
      }

      if (order.userId.toString() !== userId.toString()) {
        throw createOrderError('You do not have permission to cancel this order.', 403);
      }

      if (order.paymentStatus === 'paid') {
        throw createOrderError('Cannot cancel an order that has already been paid.', 400);
      }

      if (order.status !== 'pending') {
        throw createOrderError(`Cannot cancel order in "${order.status}" status.`, 400);
      }

      const atomicCancelled = await Order.findOneAndUpdate(
        { _id: id, userId: order.userId, status: 'pending', paymentStatus: { $ne: 'paid' } },
        {
          $set: { status: 'cancelled' },
          $push: {
            statusHistory: { status: 'cancelled', timestamp: new Date(), note: 'Order cancelled by customer.' },
          },
        },
        { returnDocument: 'after', ...(findOpts || {}) }
      );

      if (!atomicCancelled) {
        throw createOrderError('Order can no longer be cancelled.', 400);
      }

      await restockOrderAndReleaseCoupon(atomicCancelled as any, session, true);
      return atomicCancelled;
    });

    const populatedOrder = await Order.findById(id)
      .populate('userId', 'name email')
      .populate('items.productId', 'name image');

    const obj = populatedOrder ? (populatedOrder as any).toObject() : cancelledOrder.toObject();
    const result = {
      ...obj,
      id: obj._id,
    };

    await cacheService.invalidateByPrefix('cache:products:', 'cache:analytics:');
    emitOrderEvent('order:cancelled', result);
    if (populatedOrder && (populatedOrder as any).userId?.email) {
      emailService.sendOrderStatusUpdate((populatedOrder as any).userId.email, obj._id.toString(), 'cancelled');
    }

    return result;
  },

  async requestRefund(id: string, userId: string, reason?: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw createOrderError('Order does not exist.', 404);
    }

    const order = await Order.findById(id);
    if (!order) {
      throw createOrderError('Order does not exist.', 404);
    }

    if (order.userId.toString() !== userId.toString()) {
      throw createOrderError('You do not have permission to request a refund for this order.', 403);
    }

    if (order.status !== 'delivered' && order.status !== 'completed') {
      throw createOrderError(`Cannot request refund for order in "${order.status}" status.`, 400);
    }

    const cleanReason = reason?.trim().slice(0, 500);
    const note = cleanReason
      ? `Refund requested by customer: ${cleanReason}`
      : 'Refund requested by customer.';

    const previousRefundBaseStatus = order.status;
    order.status = 'refund_requested';
    order.statusHistory.push({ status: 'refund_requested', timestamp: new Date(), note });
    await order.save();
    await cacheService.invalidateByPrefix('cache:products:', 'cache:analytics:');
    await auditService.record({
      userId,
      action: 'ORDER_REFUND_REQUEST',
      targetType: 'Order',
      targetId: String(order._id),
      oldValue: { status: previousRefundBaseStatus },
      newValue: { status: 'refund_requested', reason: cleanReason || '' },
    });

    const populatedOrder = await Order.findById(id)
      .populate('userId', 'name email')
      .populate('items.productId', 'name image');

    const obj = populatedOrder ? (populatedOrder as any).toObject() : order.toObject();
    const result = {
      ...obj,
      id: obj._id,
    };

    emitOrderEvent('order:updated', result);
    return result;
  },

  async expireStaleVnpayOrders(maxAgeMs: number = DEFAULT_VNPAY_RESERVATION_MS): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - Math.max(60_000, maxAgeMs));
    const candidates = await Order.find({
      paymentMethod: 'vnpay',
      status: 'pending',
      paymentStatus: 'pending',
      $or: [
        { paymentDeadline: { $lte: now } },
        { createdAt: { $lte: cutoff } },
      ],
    }).select('_id');

    let expiredCount = 0;

    for (const candidate of candidates) {
      const expiredOrder = await withTransaction(async (session) => {
        const findOpts = session ? { session } : undefined;
        const atomicExpired = await Order.findOneAndUpdate(
          {
            _id: candidate._id,
            paymentMethod: 'vnpay',
            status: 'pending',
            paymentStatus: 'pending',
          },
          {
            $set: { status: 'cancelled', paymentStatus: 'failed' },
            $push: {
              statusHistory: {
                status: 'cancelled',
                timestamp: new Date(),
                note: 'Order automatically cancelled after VNPAY payment reservation expired.',
              },
            },
          },
          { returnDocument: 'after', ...(findOpts || {}) }
        );

        if (!atomicExpired) return null;
        await restockOrderAndReleaseCoupon(atomicExpired as any, session, true);
        return atomicExpired;
      });

      if (!expiredOrder) continue;
      expiredCount += 1;

      const populated = await Order.findById(expiredOrder._id)
        .populate('userId', 'name email')
        .populate('items.productId', 'name image');
      const obj = populated ? (populated as any).toObject() : expiredOrder.toObject();
      emitOrderEvent('order:cancelled', { ...obj, id: obj._id });
    }

    return expiredCount;
  },
};
