import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Category, Coupon, Product, User } from '../src/models';
import { orderService } from '../src/services/orderService';
import { emailService } from '../src/services/emailService';
import * as socketConfig from '../src/config/socket';

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe('orderService', () => {
  beforeAll(async () => {
    await connectTestDB();
    vi.spyOn(socketConfig, 'emitEvent').mockImplementation(() => {});
    vi.spyOn(emailService, 'sendOrderConfirmation').mockResolvedValue(undefined as any);
    vi.spyOn(emailService, 'sendOrderStatusUpdate').mockResolvedValue(undefined as any);
  });

  afterEach(async () => {
    await clearTestDB();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await disconnectTestDB();
  });

  async function seedOrderFixtures() {
    const user = await User.create({
      name: 'Test Buyer',
      email: 'buyer@uconext.test',
      password: 'hashed_password_placeholder',
      role: 'customer',
    });

    const category = await Category.create({
      name: 'Audio',
      slug: 'audio',
    });

    const product = await Product.create({
      name: 'Studio Headphones',
      slug: 'studio-headphones',
      price: 600000,
      stock: 10,
      categoryId: category._id as any,
    });

    const coupon = await Coupon.create({
      code: 'WELCOME50K',
      discountType: 'fixed',
      discountValue: 50000,
      minOrderAmount: 500000,
      startDate: daysFromNow(-1),
      endDate: daysFromNow(10),
      usageLimit: 100,
      perUserLimit: 1,
    });

    return { user, category, product, coupon };
  }

  it('creates an order, deducts stock, applies shipping fee and coupon, and increments usedCount', async () => {
    const { user, product, coupon } = await seedOrderFixtures();

    const order = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 1 }],
      shippingAddress: '123 Nguyen Hue, HCMC',
      paymentMethod: 'cod',
      couponCode: 'WELCOME50K',
    });

    // subtotal = 600,000 (<= 1,000,000 => shippingFee = 30,000), discount = 50,000 => total = 580,000
    expect(order.status).toBe('pending');
    expect(order.couponCode).toBe('WELCOME50K');
    expect(order.discountAmount).toBe(50000);
    expect(order.totalAmount).toBe(580000);

    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct?.stock).toBe(9);

    const updatedCoupon = await Coupon.findById(coupon._id);
    expect(updatedCoupon?.usedCount).toBe(1);
  });

  it('waives shipping fee when subtotal exceeds 1,000,000 VND', async () => {
    const { user, product } = await seedOrderFixtures();

    const order = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 2 }],
      shippingAddress: '123 Nguyen Hue, HCMC',
      paymentMethod: 'cod',
    });

    // subtotal = 1,200,000 (> 1,000,000 => shippingFee = 0)
    expect(order.totalAmount).toBe(1200000);
    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct?.stock).toBe(8);
  });

  it('rejects order creation when cart is empty, address is missing, or stock is insufficient', async () => {
    const { user, product } = await seedOrderFixtures();

    await expect(
      orderService.createOrder(user._id.toString(), {
        items: [],
        shippingAddress: '123 St',
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      orderService.createOrder(user._id.toString(), {
        items: [{ productId: product._id.toString(), quantity: 1 }],
        shippingAddress: '',
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      orderService.createOrder(user._id.toString(), {
        items: [{ productId: product._id.toString(), quantity: 99 }],
        shippingAddress: '123 St',
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    // Stock remains untouched
    const freshProduct = await Product.findById(product._id);
    expect(freshProduct?.stock).toBe(10);
  });

  it('cancels a pending order, restores stock & coupon usage, and allows reusing perUserLimit coupon', async () => {
    const { user, product, coupon } = await seedOrderFixtures();

    const order = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 2 }],
      shippingAddress: '123 Nguyen Hue, HCMC',
      couponCode: 'WELCOME50K',
    });

    // Second order with same perUserLimit=1 coupon must fail before cancellation
    await expect(
      orderService.createOrder(user._id.toString(), {
        items: [{ productId: product._id.toString(), quantity: 1 }],
        shippingAddress: '123 Nguyen Hue, HCMC',
        couponCode: 'WELCOME50K',
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    const cancelled = await orderService.cancelOrder(order.id.toString(), user._id.toString());
    expect(cancelled.status).toBe('cancelled');

    const restoredProduct = await Product.findById(product._id);
    expect(restoredProduct?.stock).toBe(10);

    const restoredCoupon = await Coupon.findById(coupon._id);
    expect(restoredCoupon?.usedCount).toBe(0);

    // User can now reuse the coupon after cancelling
    const retryOrder = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 1 }],
      shippingAddress: '123 Nguyen Hue, HCMC',
      couponCode: 'WELCOME50K',
    });
    expect(retryOrder.couponCode).toBe('WELCOME50K');
  });

  it('prevents cancelling by another user or when order is no longer pending', async () => {
    const { user, product } = await seedOrderFixtures();
    const otherUserId = new Types.ObjectId().toString();

    const order = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 1 }],
      shippingAddress: '123 Nguyen Hue, HCMC',
    });

    await expect(orderService.cancelOrder(order.id.toString(), otherUserId)).rejects.toMatchObject({
      statusCode: 403,
    });

    await orderService.updateOrderStatus(order.id.toString(), 'confirmed');

    await expect(orderService.cancelOrder(order.id.toString(), user._id.toString())).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('handles admin status updates (restock on cancel, paid on completed) and customer refund requests', async () => {
    const { user, product, coupon } = await seedOrderFixtures();
    const otherUserId = new Types.ObjectId().toString();

    const order = await orderService.createOrder(user._id.toString(), {
      items: [{ productId: product._id.toString(), quantity: 1 }],
      shippingAddress: '123 Nguyen Hue, HCMC',
      couponCode: 'WELCOME50K',
    });

    // Cannot request refund while pending
    await expect(
      orderService.requestRefund(order.id.toString(), user._id.toString(), 'Changed mind')
    ).rejects.toMatchObject({ statusCode: 400 });

    // Admin marks completed => paymentStatus becomes paid
    const completed = await orderService.updateOrderStatus(order.id.toString(), 'completed');
    expect(completed.status).toBe('completed');
    expect(completed.paymentStatus).toBe('paid');

    // Non-owner cannot request refund
    await expect(
      orderService.requestRefund(order.id.toString(), otherUserId, 'Defective')
    ).rejects.toMatchObject({ statusCode: 403 });

    // Owner requests refund successfully
    const refunded = await orderService.requestRefund(
      order.id.toString(),
      user._id.toString(),
      'Item arrived damaged'
    );
    expect(refunded.status).toBe('refund_requested');
    expect(refunded.statusHistory.at(-1)?.note).toContain('Item arrived damaged');

    // Admin cancels => restocks product & restores coupon
    await orderService.updateOrderStatus(order.id.toString(), 'cancelled');
    expect((await Product.findById(product._id))?.stock).toBe(10);
    expect((await Coupon.findById(coupon._id))?.usedCount).toBe(0);
  });
});

