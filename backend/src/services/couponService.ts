import { Types } from 'mongoose';
import { Coupon, Order } from '../models';

function createCouponError(message: string, statusCode = 400) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertValidCouponValues(params: {
  discountType: string;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount?: number;
  startDate: Date;
  endDate: Date;
  usageLimit: number;
  perUserLimit: number;
}) {
  const {
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscountAmount,
    startDate,
    endDate,
    usageLimit,
    perUserLimit,
  } = params;

  if (discountType !== 'percentage' && discountType !== 'fixed') {
    throw createCouponError('Discount type must be "percentage" or "fixed".');
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw createCouponError('Discount value must be greater than 0.');
  }
  if (discountType === 'percentage' && discountValue > 100) {
    throw createCouponError('Percentage discount cannot exceed 100%.');
  }
  if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
    throw createCouponError('Minimum order amount cannot be negative.');
  }
  if (maxDiscountAmount !== undefined && (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount <= 0)) {
    throw createCouponError('Maximum discount amount must be greater than 0.');
  }
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    throw createCouponError('Coupon end date must be after start date.');
  }
  if (!Number.isInteger(usageLimit) || usageLimit < 1) {
    throw createCouponError('Usage limit must be an integer greater than or equal to 1.');
  }
  if (!Number.isInteger(perUserLimit) || perUserLimit < 0) {
    throw createCouponError('Per-user limit must be a non-negative integer.');
  }
}

export const couponService = {
  async getActiveCoupons() {
    const now = new Date();
    return Coupon.find({
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $expr: { $lt: ['$usedCount', '$usageLimit'] }
    }).select('-__v');
  },

  async validateCoupon(code: string, orderAmount: number, userId?: string) {
    if (!code || typeof code !== 'string' || !code.trim()) {
      throw createCouponError('Please enter a coupon code.', 400);
    }

    const numericOrderAmount = Number(orderAmount);
    if (!Number.isFinite(numericOrderAmount) || numericOrderAmount < 0) {
      throw createCouponError('Invalid order amount.', 400);
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode, isDeleted: false });

    if (!coupon) {
      throw createCouponError('Coupon code does not exist or has been removed.', 404);
    }

    const now = new Date();
    if (now < coupon.startDate) {
      throw createCouponError('Coupon is not yet active.', 400);
    }

    if (now > coupon.endDate) {
      throw createCouponError('Coupon has expired.', 400);
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      throw createCouponError('Coupon usage limit has been reached.', 400);
    }

    if (userId && coupon.perUserLimit > 0 && Types.ObjectId.isValid(userId)) {
      const userUsageCount = await Order.countDocuments({
        userId: new Types.ObjectId(userId) as any,
        couponCode: cleanCode,
        status: { $ne: 'cancelled' }
      });
      if (userUsageCount >= coupon.perUserLimit) {
        throw createCouponError(
          `You have already reached the usage limit (${coupon.perUserLimit}) for this coupon.`,
          400
        );
      }
    }

    if (numericOrderAmount < coupon.minOrderAmount) {
      throw createCouponError(
        `Order minimum of ${coupon.minOrderAmount.toLocaleString('en-US')} VND required for this coupon.`,
        400
      );
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = Math.round((numericOrderAmount * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else {
      discountAmount = coupon.discountValue;
    }

    if (discountAmount > numericOrderAmount) {
      discountAmount = numericOrderAmount;
    }

    return {
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount,
      finalAmount: numericOrderAmount - discountAmount,
      coupon: {
        id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscountAmount: coupon.maxDiscountAmount
      }
    };
  },

  async getAll() {
    return Coupon.find({ isDeleted: false }).sort({ createdAt: -1 });
  },

  async create(data: any) {
    const {
      code,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit,
      perUserLimit
    } = data || {};

    if (!code || !discountType || discountValue === undefined) {
      throw createCouponError('Coupon code, discount type, and value are required.', 400);
    }

    const cleanCode = String(code).trim().toUpperCase();
    const parsedStart = startDate ? new Date(startDate) : new Date();
    const parsedEnd = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const parsedDiscountValue = Number(discountValue);
    const parsedMinOrder = minOrderAmount !== undefined ? Number(minOrderAmount) : 0;
    const parsedMaxDiscount =
      maxDiscountAmount !== undefined && maxDiscountAmount !== '' && maxDiscountAmount !== null
        ? Number(maxDiscountAmount)
        : undefined;
    const parsedUsageLimit = usageLimit !== undefined ? Number(usageLimit) : 100;
    const parsedPerUserLimit = perUserLimit !== undefined ? Number(perUserLimit) : 1;

    assertValidCouponValues({
      discountType,
      discountValue: parsedDiscountValue,
      minOrderAmount: parsedMinOrder,
      maxDiscountAmount: parsedMaxDiscount,
      startDate: parsedStart,
      endDate: parsedEnd,
      usageLimit: parsedUsageLimit,
      perUserLimit: parsedPerUserLimit,
    });

    const existing = await Coupon.findOne({ code: cleanCode, isDeleted: false });
    if (existing) {
      throw createCouponError('A coupon with this code already exists.', 400);
    }

    return Coupon.create({
      code: cleanCode,
      discountType,
      discountValue: parsedDiscountValue,
      minOrderAmount: parsedMinOrder,
      maxDiscountAmount: parsedMaxDiscount,
      startDate: parsedStart,
      endDate: parsedEnd,
      usageLimit: parsedUsageLimit,
      perUserLimit: parsedPerUserLimit
    });
  },

  async update(id: string, data: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw createCouponError('Coupon not found.', 404);
    }
    const coupon = await Coupon.findById(id);
    if (!coupon || coupon.isDeleted) {
      throw createCouponError('Coupon not found.', 404);
    }

    if (data.code) coupon.code = String(data.code).trim().toUpperCase();
    if (data.discountType) coupon.discountType = data.discountType;
    if (data.discountValue !== undefined) coupon.discountValue = Number(data.discountValue);
    if (data.minOrderAmount !== undefined) coupon.minOrderAmount = Number(data.minOrderAmount);
    if (data.maxDiscountAmount !== undefined) {
      coupon.maxDiscountAmount = data.maxDiscountAmount ? Number(data.maxDiscountAmount) : undefined;
    }
    if (data.startDate) coupon.startDate = new Date(data.startDate);
    if (data.endDate) coupon.endDate = new Date(data.endDate);
    if (data.usageLimit !== undefined) coupon.usageLimit = Number(data.usageLimit);
    if (data.perUserLimit !== undefined) coupon.perUserLimit = Number(data.perUserLimit);

    assertValidCouponValues({
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minOrderAmount: coupon.minOrderAmount,
      maxDiscountAmount: coupon.maxDiscountAmount,
      startDate: coupon.startDate,
      endDate: coupon.endDate,
      usageLimit: coupon.usageLimit,
      perUserLimit: coupon.perUserLimit,
    });

    await coupon.save();
    return coupon;
  },

  async delete(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw createCouponError('Coupon not found.', 404);
    }
    const coupon = await Coupon.findById(id);
    if (!coupon || coupon.isDeleted) {
      throw createCouponError('Coupon not found.', 404);
    }
    coupon.isDeleted = true;
    await coupon.save();
    return true;
  }
};
