import { Types } from 'mongoose';
import { Order, Product, Coupon } from '../models';
import { emitOrderEvent } from '../config/socket';
import { emailService } from './emailService';
import { couponService } from './couponService';
import { cacheService } from '../utils/cache';
import { auditService } from './auditService';

function createOrderError(message: string, statusCode = 400) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const DEFAULT_VNPAY_RESERVATION_MS = 15 * 60 * 1000;

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

    // Validate item shapes & aggregate total quantity per productId across variants
    const qtyByProductId = new Map<string, number>();
    for (const item of items) {
      const pid = String(item?.productId || '').trim();
      if (!Types.ObjectId.isValid(pid)) {
        throw createOrderError('Invalid product identifier in cart.', 400);
      }

      const rawQty = typeof item?.quantity === 'string' && item.quantity.trim() !== ''
        ? Number(item.quantity)
        : item?.quantity;
      if (typeof rawQty !== 'number' || !Number.isInteger(rawQty) || rawQty < 1) {
        throw createOrderError('Item quantity must be a positive integer.', 400);
      }

      qtyByProductId.set(pid, (qtyByProductId.get(pid) || 0) + rawQty);
    }

    const uniqueProductIds = Array.from(qtyByProductId.keys());
    const products = await Product.find({
      _id: { $in: uniqueProductIds },
      isDeleted: { $ne: true },
    });
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

    // Validate & atomically reserve coupon usage if supplied
    let discountAmount = 0;
    let appliedCoupon: string | undefined = undefined;
    let reservedCouponId: any = null;

    if (couponCode) {
      const validation = await couponService.validateCoupon(couponCode, subtotal, userId);
      const reservedCoupon = await Coupon.findOneAndUpdate(
        {
          _id: validation.coupon.id,
          isDeleted: false,
          $expr: { $lt: ['$usedCount', '$usageLimit'] },
        },
        { $inc: { usedCount: 1 } },
        { returnDocument: 'after' }
      );

      if (!reservedCoupon) {
        throw createOrderError('Coupon usage limit has been reached.', 400);
      }

      discountAmount = validation.discountAmount;
      appliedCoupon = validation.code;
      reservedCouponId = reservedCoupon._id;
    }

    const shippingFee = subtotal > 1000000 ? 0 : 30000;
    const totalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

    // Atomically deduct stock per unique product; roll back on any concurrent shortage or write failure
    const deductedStock: Array<{ productId: string; qty: number }> = [];
    const rollbackReservations = async () => {
      for (const entry of deductedStock) {
        await Product.findByIdAndUpdate(entry.productId, { $inc: { stock: entry.qty } });
      }
      if (reservedCouponId) {
        await Coupon.updateOne({ _id: reservedCouponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
      }
    };

    try {
      for (const [pid, totalQty] of qtyByProductId.entries()) {
        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: pid,
            isDeleted: { $ne: true },
            stock: { $gte: totalQty },
          },
          { $inc: { stock: -totalQty } },
          { returnDocument: 'after' }
        );

        if (!updatedProduct) {
          const prodName = productMap.get(pid)?.name || 'Selected item';
          throw createOrderError(`Product "${prodName}" has insufficient stock.`, 400);
        }

        deductedStock.push({ productId: pid, qty: totalQty });
      }

      const order = await Order.create({
        userId,
        shippingAddress: normalizedAddress,
        paymentMethod: normalizedMethod,
        paymentStatus: 'pending',
        status: 'pending',
        items: orderItems as any,
        couponCode: appliedCoupon || undefined,
        discountAmount,
        totalAmount,
        statusHistory: [
          {
            status: 'pending',
            timestamp: new Date(),
            note: `Order placed successfully.${appliedCoupon ? ` (Coupon: ${appliedCoupon})` : ''}`,
          },
        ],
      } as any);

      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name email')
        .populate('items.productId', 'name image');

      const obj = populatedOrder ? (populatedOrder as any).toObject() : order.toObject();
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
    } catch (err) {
      await rollbackReservations();
      throw err;
    }
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

    const order = await Order.findById(id);
    if (!order) {
      throw createOrderError('Order does not exist.', 404);
    }

    const previousStatus = order.status;
    const previousPaymentStatus = order.paymentStatus;
    const isRestockedState = (s: string) => s === 'cancelled' || s === 'refund_completed';

    if (status) {
      order.status = status as any;
      order.statusHistory.push({
        status: status as any,
        timestamp: new Date(),
        note: 'Status updated by Admin.',
      });

      if (status === 'delivered' || status === 'completed') {
        order.paymentStatus = 'paid';
      }

      if (!isRestockedState(previousStatus) && isRestockedState(status)) {
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
        }
        if (status === 'cancelled' && order.couponCode) {
          await Coupon.updateOne({ code: order.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
        }
      } else if (isRestockedState(previousStatus) && !isRestockedState(status)) {
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } });
        }
        if (previousStatus === 'cancelled' && order.couponCode) {
          await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } });
        }
      }
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus as any;
    }

    await order.save();
    await cacheService.invalidateByPrefix('cache:products:', 'cache:analytics:');
    await auditService.record({
      userId: actorId,
      action: 'ORDER_STATUS_UPDATE',
      targetType: 'Order',
      targetId: String(order._id),
      oldValue: { status: previousStatus, paymentStatus: previousPaymentStatus },
      newValue: { status: order.status, paymentStatus: order.paymentStatus },
      ipAddress,
    });

    const populatedOrder = await Order.findById(id)
      .populate('userId', 'name email')
      .populate('items.productId', 'name image');

    const obj = populatedOrder ? (populatedOrder as any).toObject() : order.toObject();
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

    const order = await Order.findById(id);
    if (!order) {
      throw createOrderError('Order does not exist.', 404);
    }

    if (order.userId.toString() !== userId.toString()) {
      throw createOrderError('You do not have permission to cancel this order.', 403);
    }

    if (order.status !== 'pending') {
      throw createOrderError(`Cannot cancel order in "${order.status}" status.`, 400);
    }

    const cancelledOrder = await Order.findOneAndUpdate(
      { _id: id, status: 'pending' },
      {
        $set: { status: 'cancelled' },
        $push: {
          statusHistory: { status: 'cancelled', timestamp: new Date(), note: 'Order cancelled by customer.' },
        },
      },
      { returnDocument: 'after' }
    );

    if (!cancelledOrder) {
      throw createOrderError('Order can no longer be cancelled.', 400);
    }

    for (const item of cancelledOrder.items) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
    }
    if (cancelledOrder.couponCode) {
      await Coupon.updateOne({ code: cancelledOrder.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    }

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
    const cutoff = new Date(Date.now() - Math.max(60_000, maxAgeMs));
    const candidates = await Order.find({
      paymentMethod: 'vnpay',
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: { $lte: cutoff },
    }).select('_id');

    let expiredCount = 0;

    for (const candidate of candidates) {
      const expiredOrder = await Order.findOneAndUpdate(
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
        { returnDocument: 'after' }
      );

      if (!expiredOrder) continue;
      expiredCount += 1;

      for (const item of expiredOrder.items) {
        await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
      }
      if (expiredOrder.couponCode) {
        await Coupon.updateOne({ code: expiredOrder.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
      }

      const populated = await Order.findById(expiredOrder._id)
        .populate('userId', 'name email')
        .populate('items.productId', 'name image');
      const obj = populated ? (populated as any).toObject() : expiredOrder.toObject();
      emitOrderEvent('order:cancelled', { ...obj, id: obj._id });
    }

    return expiredCount;
  },
};
