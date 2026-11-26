import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Category, Product, User } from '../src/models';
import { orderService } from '../src/services/orderService';
import { analyticsService } from '../src/services/analyticsService';
import { reviewService } from '../src/services/reviewService';
import { emailService } from '../src/services/emailService';

describe('analyticsService & reviewService', () => {
  beforeAll(async () => {
    await connectTestDB();
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

  it('keeps COD paymentStatus pending during shipping, marks paid on delivered, and excludes refunded/cancelled orders from revenue', async () => {
    const buyer = await User.create({
      name: 'Buyer One',
      email: 'buyer1@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const category = await Category.create({ name: 'Monitors, Desk', slug: 'monitors-desk' });
    const monitor = await Product.create({
      name: '4K Studio Display',
      slug: '4k-studio-display',
      price: 2000000,
      stock: 5,
      categoryId: category._id as any,
    });

    const codOrder = await orderService.createOrder(buyer._id.toString(), {
      items: [{ productId: monitor._id.toString(), quantity: 1 }],
      shippingAddress: '101 Dien Bien Phu, HCMC',
      paymentMethod: 'cod',
    });

    // Moving COD order through confirmed -> shipping MUST NOT mark it paid prematurely
    await orderService.updateOrderStatus(codOrder.id.toString(), 'confirmed');
    const shipped = await orderService.updateOrderStatus(codOrder.id.toString(), 'shipping');
    expect(shipped.status).toBe('shipping');
    expect(shipped.paymentStatus).toBe('pending');

    let dashboard = await analyticsService.getDashboardStats();
    expect(dashboard.stats.totalRevenue).toBe(0);

    // Delivering the COD order marks paymentStatus paid and counts toward revenue
    const delivered = await orderService.updateOrderStatus(codOrder.id.toString(), 'delivered');
    expect(delivered.paymentStatus).toBe('paid');

    dashboard = await analyticsService.getDashboardStats();
    expect(dashboard.stats.totalRevenue).toBe(2000000);
    expect(dashboard.bestSellers).toHaveLength(1);

    // Completing a refund restocks inventory and excludes the refunded order from net revenue
    await orderService.requestRefund(codOrder.id.toString(), buyer._id.toString(), 'Dead pixel');
    const refundDone = await orderService.updateOrderStatus(codOrder.id.toString(), 'refund_completed');
    expect(refundDone.status).toBe('refund_completed');
    expect((await Product.findById(monitor._id))?.stock).toBe(5);

    dashboard = await analyticsService.getDashboardStats();
    expect(dashboard.stats.totalRevenue).toBe(0);
    expect(dashboard.bestSellers).toHaveLength(0);
  });

  it('returns averageRating 0 when product has 0 reviews and flags verifiedPurchase accurately', async () => {
    const verifiedBuyer = await User.create({
      name: 'Verified Buyer',
      email: 'verified@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const casualVisitor = await User.create({
      name: 'Casual Visitor',
      email: 'visitor@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const category = await Category.create({ name: 'Fragrance', slug: 'fragrance' });
    const perfume = await Product.create({
      name: 'Cedar Eau de Parfum',
      slug: 'cedar-edp',
      price: 1500000,
      stock: 8,
      categoryId: category._id as any,
    });

    // Zero reviews => averageRating must be 0 (not 5.0)
    const emptyReviews = await reviewService.getProductReviews(perfume._id.toString());
    expect(emptyReviews.totalReviews).toBe(0);
    expect(emptyReviews.averageRating).toBe(0);

    // Verified buyer completes an order
    const order = await orderService.createOrder(verifiedBuyer._id.toString(), {
      items: [{ productId: perfume._id.toString(), quantity: 1 }],
      shippingAddress: '22 Hai Ba Trung, HCMC',
      paymentMethod: 'cod',
    });
    await orderService.updateOrderStatus(order.id.toString(), 'confirmed');
    await orderService.updateOrderStatus(order.id.toString(), 'shipping');
    await orderService.updateOrderStatus(order.id.toString(), 'delivered');
    await orderService.updateOrderStatus(order.id.toString(), 'completed');

    await reviewService.addReview(verifiedBuyer._id.toString(), perfume._id.toString(), 5, 'Long-lasting scent.');
    await reviewService.addReview(casualVisitor._id.toString(), perfume._id.toString(), 3, 'Tested in store.');

    const loaded = await reviewService.getProductReviews(perfume._id.toString());
    expect(loaded.totalReviews).toBe(2);
    expect(loaded.averageRating).toBe(4);

    const byEmailOrName = new Map(loaded.reviews.map((r: any) => [r.user?.name, r.verifiedPurchase]));
    expect(byEmailOrName.get('Verified Buyer')).toBe(true);
    expect(byEmailOrName.get('Casual Visitor')).toBe(false);
  });
});
