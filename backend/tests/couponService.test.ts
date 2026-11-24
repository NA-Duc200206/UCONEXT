import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Coupon, Order } from '../src/models';
import { couponService } from '../src/services/couponService';

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe('couponService', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('calculates percentage discount and respects maxDiscountAmount cap', async () => {
    await Coupon.create({
      code: 'UCONEXT10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 200000,
      maxDiscountAmount: 300000,
      startDate: daysFromNow(-1),
      endDate: daysFromNow(10),
      usageLimit: 100,
      perUserLimit: 2,
    });

    const underCap = await couponService.validateCoupon(' uconext10 ', 1000000);
    expect(underCap.valid).toBe(true);
    expect(underCap.code).toBe('UCONEXT10');
    expect(underCap.discountAmount).toBe(100000);
    expect(underCap.finalAmount).toBe(900000);

    const overCap = await couponService.validateCoupon('UCONEXT10', 5000000);
    expect(overCap.discountAmount).toBe(300000);
    expect(overCap.finalAmount).toBe(4700000);
  });

  it('calculates fixed discount and never exceeds orderAmount', async () => {
    await Coupon.create({
      code: 'FLAT100K',
      discountType: 'fixed',
      discountValue: 100000,
      minOrderAmount: 0,
      startDate: daysFromNow(-1),
      endDate: daysFromNow(10),
      usageLimit: 50,
      perUserLimit: 1,
    });

    const normal = await couponService.validateCoupon('FLAT100K', 500000);
    expect(normal.discountAmount).toBe(100000);
    expect(normal.finalAmount).toBe(400000);

    const cappedToOrder = await couponService.validateCoupon('FLAT100K', 60000);
    expect(cappedToOrder.discountAmount).toBe(60000);
    expect(cappedToOrder.finalAmount).toBe(0);
  });

  it('rejects orders below minOrderAmount', async () => {
    await Coupon.create({
      code: 'WELCOME50K',
      discountType: 'fixed',
      discountValue: 50000,
      minOrderAmount: 500000,
      startDate: daysFromNow(-1),
      endDate: daysFromNow(10),
      usageLimit: 100,
      perUserLimit: 1,
    });

    await expect(couponService.validateCoupon('WELCOME50K', 450000)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects expired, future, exhausted, or deleted coupons', async () => {
    await Coupon.create([
      {
        code: 'EXPIRED',
        discountType: 'fixed',
        discountValue: 20000,
        minOrderAmount: 0,
        startDate: daysFromNow(-10),
        endDate: daysFromNow(-1),
        usageLimit: 10,
        perUserLimit: 1,
      },
      {
        code: 'FUTURE',
        discountType: 'fixed',
        discountValue: 20000,
        minOrderAmount: 0,
        startDate: daysFromNow(2),
        endDate: daysFromNow(10),
        usageLimit: 10,
        perUserLimit: 1,
      },
      {
        code: 'MAXED',
        discountType: 'fixed',
        discountValue: 20000,
        minOrderAmount: 0,
        startDate: daysFromNow(-1),
        endDate: daysFromNow(10),
        usageLimit: 5,
        usedCount: 5,
        perUserLimit: 1,
      },
      {
        code: 'DELETED',
        discountType: 'fixed',
        discountValue: 20000,
        minOrderAmount: 0,
        startDate: daysFromNow(-1),
        endDate: daysFromNow(10),
        usageLimit: 10,
        perUserLimit: 1,
        isDeleted: true,
      },
    ]);

    await expect(couponService.validateCoupon('EXPIRED', 500000)).rejects.toMatchObject({ statusCode: 400 });
    await expect(couponService.validateCoupon('FUTURE', 500000)).rejects.toMatchObject({ statusCode: 400 });
    await expect(couponService.validateCoupon('MAXED', 500000)).rejects.toMatchObject({ statusCode: 400 });
    await expect(couponService.validateCoupon('DELETED', 500000)).rejects.toMatchObject({ statusCode: 404 });
    await expect(couponService.validateCoupon('NO_SUCH_CODE', 500000)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('enforces perUserLimit and ignores cancelled orders', async () => {
    const userId = new Types.ObjectId();
    const productId = new Types.ObjectId();

    await Coupon.create({
      code: 'ONCEONLY',
      discountType: 'fixed',
      discountValue: 50000,
      minOrderAmount: 100000,
      startDate: daysFromNow(-1),
      endDate: daysFromNow(10),
      usageLimit: 100,
      perUserLimit: 1,
    });

    await Order.create({
      userId: userId as any,
      shippingAddress: '123 Test St',
      paymentMethod: 'cod',
      status: 'cancelled',
      couponCode: 'ONCEONLY',
      discountAmount: 50000,
      totalAmount: 200000,
      items: [{ productId: productId as any, name: 'Item', price: 250000, quantity: 1 }],
    });

    // Cancelled order should not block reuse
    const allowed = await couponService.validateCoupon('ONCEONLY', 250000, userId.toString());
    expect(allowed.valid).toBe(true);

    // Active (non-cancelled) order should block reuse
    await Order.create({
      userId: userId as any,
      shippingAddress: '123 Test St',
      paymentMethod: 'cod',
      status: 'pending',
      couponCode: 'ONCEONLY',
      discountAmount: 50000,
      totalAmount: 200000,
      items: [{ productId: productId as any, name: 'Item', price: 250000, quantity: 1 }],
    });

    await expect(
      couponService.validateCoupon('ONCEONLY', 250000, userId.toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns only active, non-deleted, under-limit coupons from getActiveCoupons', async () => {
    await Coupon.create([
      {
        code: 'ACTIVE1',
        discountType: 'percentage',
        discountValue: 10,
        minOrderAmount: 0,
        startDate: daysFromNow(-1),
        endDate: daysFromNow(5),
        usageLimit: 10,
        usedCount: 2,
      },
      {
        code: 'EXHAUSTED',
        discountType: 'percentage',
        discountValue: 10,
        minOrderAmount: 0,
        startDate: daysFromNow(-1),
        endDate: daysFromNow(5),
        usageLimit: 2,
        usedCount: 2,
      },
      {
        code: 'OLD',
        discountType: 'percentage',
        discountValue: 10,
        minOrderAmount: 0,
        startDate: daysFromNow(-10),
        endDate: daysFromNow(-2),
        usageLimit: 10,
        usedCount: 0,
      },
    ]);

    const active = await couponService.getActiveCoupons();
    expect(active).toHaveLength(1);
    expect(active[0].code).toBe('ACTIVE1');
  });

  it('rejects NaN or negative orderAmount and invalid coupon configuration values', async () => {
    await Coupon.create({
      code: 'VALID10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 100000,
      startDate: daysFromNow(-1),
      endDate: daysFromNow(5),
      usageLimit: 10,
      perUserLimit: 1,
    });

    await expect(couponService.validateCoupon('VALID10', NaN)).rejects.toMatchObject({ statusCode: 400 });
    await expect(couponService.validateCoupon('VALID10', -50000)).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      couponService.create({
        code: 'BADPCT',
        discountType: 'percentage',
        discountValue: 150,
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      couponService.create({
        code: 'BADDATE',
        discountType: 'fixed',
        discountValue: 50000,
        startDate: daysFromNow(5),
        endDate: daysFromNow(1),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

