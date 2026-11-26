import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Category, Coupon, CouponRedemption, Order, Product, User } from '../src/models';
import { orderService } from '../src/services/orderService';
import { emailService } from '../src/services/emailService';
import * as socketConfig from '../src/config/socket';

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe('orderIntegrity (transactions, concurrency, coupon redemptions, strict transitions & COD caps)', () => {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    process.env.PAYMENTS_VNPAY_ENABLED = 'true';
    process.env.VNPAY_TMN_CODE = 'TESTTMN1';
    process.env.VNPAY_HASH_SECRET = 'test_vnpay_secret_key_1234567890_secure';
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    // Ensure collections and unique indexes exist before starting multi-doc transactions
    await Promise.all([
      User.init(),
      Category.init(),
      Product.init(),
      Coupon.init(),
      CouponRedemption.init(),
      Order.init(),
    ]);
    vi.spyOn(socketConfig, 'emitOrderEvent').mockImplementation(() => {});
    vi.spyOn(emailService, 'sendOrderConfirmation').mockResolvedValue(undefined as any);
    vi.spyOn(emailService, 'sendOrderStatusUpdate').mockResolvedValue(undefined as any);
  }, 60_000);

  afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
    vi.clearAllMocks();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await mongoose.disconnect();
    if (replSet) {
      await replSet.stop();
    }
  });

  async function seedFixtures(overrides?: { stock?: number; price?: number; perUserLimit?: number; usageLimit?: number }) {
    const user = await User.create({
      name: 'Integrity Buyer',
      email: `buyer-${Date.now()}-${Math.random()}@uconext.test`,
      password: 'hashed_password_placeholder',
      role: 'customer',
    });
    const category = await Category.create({
      name: 'Electronics',
      slug: `electronics-${Date.now()}-${Math.random()}`,
    });
    const product = await Product.create({
      name: 'Mechanical Keyboard',
      slug: `mech-kb-${Date.now()}-${Math.random()}`,
      price: overrides?.price ?? 1_000_000,
      stock: overrides?.stock ?? 20,
      categoryId: category._id as any,
    });
    const coupon = await Coupon.create({
      code: 'ONCE100K',
      discountType: 'fixed',
      discountValue: 100_000,
      minOrderAmount: 500_000,
      startDate: daysFromNow(-1),
      endDate: daysFromNow(10),
      usageLimit: overrides?.usageLimit ?? 100,
      perUserLimit: overrides?.perUserLimit ?? 1,
    });
    return { user, category, product, coupon };
  }

  it('perUserLimit holds under concurrent orders', async () => {
    const { user, product, coupon } = await seedFixtures({ stock: 20, perUserLimit: 1 });

    // Launch 5 parallel createOrder calls with the same perUserLimit=1 coupon (vnpay to avoid COD count cap)
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, idx) =>
        orderService.createOrder(user._id.toString(), {
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: `Address #${idx + 1}, District 1, HCMC`,
          paymentMethod: 'vnpay',
          couponCode: 'ONCE100K',
        })
      )
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(4);

    const refreshedCoupon = await Coupon.findById(coupon._id);
    expect(refreshedCoupon?.usedCount).toBe(1);

    const redemptions = await CouponRedemption.countDocuments({ couponId: coupon._id, userId: user._id });
    expect(redemptions).toBe(1);

    const refreshedProduct = await Product.findById(product._id);
    expect(refreshedProduct?.stock).toBe(19);
  });

  it('concurrent admin+customer cancel restocks once', async () => {
    const { user, product, coupon } = await seedFixtures({ stock: 10 });

    const order = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 3 }],
      shippingAddress: '123 Le Loi, HCMC',
      paymentMethod: 'cod',
      couponCode: 'ONCE100K',
    });

    expect((await Product.findById(product._id))?.stock).toBe(7);

    const [adminRes, customerRes] = await Promise.allSettled([
      orderService.updateOrderStatus(order.id.toString(), 'cancelled'),
      orderService.cancelOrder(order.id.toString(), user._id.toString()),
    ]);

    const fulfilledCount = [adminRes, customerRes].filter((r) => r.status === 'fulfilled').length;
    expect(fulfilledCount).toBe(1);

    const finalProduct = await Product.findById(product._id);
    expect(finalProduct?.stock).toBe(10);

    const finalCoupon = await Coupon.findById(coupon._id);
    expect(finalCoupon?.usedCount).toBe(0);

    const redemptions = await CouponRedemption.countDocuments({ orderId: order.id });
    expect(redemptions).toBe(0);
  });

  it('admin cannot reactivate cancelled order', async () => {
    const { user, product } = await seedFixtures({ stock: 10 });
    const order = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 1 }],
      shippingAddress: '123 Le Loi, HCMC',
      paymentMethod: 'cod',
    });

    await orderService.updateOrderStatus(order.id.toString(), 'cancelled');

    await expect(
      orderService.updateOrderStatus(order.id.toString(), 'confirmed')
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_TRANSITION',
    });

    await expect(
      orderService.updateOrderStatus(order.id.toString(), 'pending')
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_TRANSITION',
    });

    // Stock remains 10 (never deducted again)
    expect((await Product.findById(product._id))?.stock).toBe(10);
  });

  it('failed order.save rolls back stock and coupon', async () => {
    const { user, product, coupon } = await seedFixtures({ stock: 10 });

    const saveSpy = vi.spyOn(Order.prototype, 'save').mockRejectedValueOnce(new Error('Simulated DB write failure'));

    await expect(
      orderService.createOrder(user._id.toString(), {
        items: [{ productId: product._id.toString(), quantity: 4 }],
        shippingAddress: '123 Le Loi, HCMC',
        paymentMethod: 'vnpay',
        couponCode: 'ONCE100K',
      })
    ).rejects.toThrow('Simulated DB write failure');

    saveSpy.mockRestore();

    // Transaction rolled back everything cleanly
    expect((await Product.findById(product._id))?.stock).toBe(10);
    expect((await Coupon.findById(coupon._id))?.usedCount).toBe(0);
    expect(await CouponRedemption.countDocuments({ couponId: coupon._id })).toBe(0);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('cancelOrder rejects paid orders', async () => {
    const { user, product } = await seedFixtures({ stock: 10 });
    const order = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 1 }],
      shippingAddress: '123 Le Loi, HCMC',
      paymentMethod: 'vnpay',
    });

    await Order.findByIdAndUpdate(order.id, { $set: { paymentStatus: 'paid' } });

    await expect(
      orderService.cancelOrder(order.id.toString(), user._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });

    expect((await Product.findById(product._id))?.stock).toBe(9);
  });

  it('caps pending COD orders per user at 2 and COD total at 5,000,000', async () => {
    const { user, product } = await seedFixtures({ stock: 20, price: 2_600_000 });

    // COD order exceeding 5,000,000 VND (2 * 2,600,000 = 5,200,000) -> rejected
    await expect(
      orderService.createOrder(user._id.toString(), {
        items: [{ productId: product._id.toString(), quantity: 2 }],
        shippingAddress: '123 Le Loi, HCMC',
        paymentMethod: 'cod',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'COD_LIMIT_EXCEEDED' });

    // Up to 2 active COD orders <= 5,000,000 succeed
    await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 1 }],
      shippingAddress: '123 Le Loi, HCMC',
      paymentMethod: 'cod',
    });
    await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 1 }],
      shippingAddress: '123 Le Loi, HCMC',
      paymentMethod: 'cod',
    });

    // 3rd active COD order -> rejected
    await expect(
      orderService.createOrder(user._id.toString(), {
        items: [{ productId: product._id.toString(), quantity: 1 }],
        shippingAddress: '123 Le Loi, HCMC',
        paymentMethod: 'cod',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'COD_ACTIVE_LIMIT_EXCEEDED' });

    // VNPAY order still allowed regardless of COD caps
    const vnpayOrder = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 2 }],
      shippingAddress: '123 Le Loi, HCMC',
      paymentMethod: 'vnpay',
    });
    expect(vnpayOrder.paymentMethod).toBe('vnpay');
    expect(vnpayOrder.totalAmount).toBe(5_200_000);
  });
});
