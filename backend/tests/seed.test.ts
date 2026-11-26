import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Order, Product, User } from '../src/models';
import { seedDatabase } from '../src/config/seed';

describe('seedDatabase idempotency and non-destructive guarantees', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('never deletes existing orders when catalog has fewer than 10 products', async () => {
    const customer = await User.create({
      name: 'Existing Buyer',
      email: 'existing.buyer@uconext.test',
      password: 'hashed_password_placeholder',
      role: 'customer',
    });

    await Order.create({
      userId: customer._id as any,
      shippingAddress: '123 Nguyen Hue, HCMC',
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      status: 'pending',
      items: [
        {
          productId: new Types.ObjectId() as any,
          name: 'Legacy Item',
          price: 500000,
          quantity: 1,
        },
      ],
      totalAmount: 530000,
      statusHistory: [{ status: 'pending', timestamp: new Date(), note: 'Existing order' }],
    });

    await Product.deleteMany({});
    expect(await Product.countDocuments()).toBe(0);

    await seedDatabase();

    expect(await Order.countDocuments()).toBe(1);
    expect(await Product.countDocuments()).toBeGreaterThan(10);
  });

  it('is idempotent across two runs', async () => {
    await seedDatabase();
    const firstProductCount = await Product.countDocuments();
    const firstOrderCount = await Order.countDocuments();
    const firstUserCount = await User.countDocuments();

    await seedDatabase();
    expect(await Product.countDocuments()).toBe(firstProductCount);
    expect(await Order.countDocuments()).toBe(firstOrderCount);
    expect(await User.countDocuments()).toBe(firstUserCount);
  });

  it('requires explicit SEED_ADMIN_EMAIL and strong SEED_ADMIN_PASSWORD in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SEED_ADMIN_EMAIL', '');
    vi.stubEnv('SEED_ADMIN_PASSWORD', '');

    await expect(seedDatabase()).rejects.toThrow(/SEED_ADMIN_EMAIL/);

    vi.stubEnv('SEED_ADMIN_EMAIL', 'admin@uconext.vn');
    vi.stubEnv('SEED_ADMIN_PASSWORD', 'short123');
    await expect(seedDatabase()).rejects.toThrow(/12 characters/);

    vi.stubEnv('SEED_ADMIN_PASSWORD', 'VeryStrongProdAdminPass!2026');
    await seedDatabase();

    const prodAdmin = await User.findOne({ email: 'admin@uconext.vn' });
    expect(prodAdmin?.role).toBe('admin');
    // Demo customer and fake historical orders are NOT seeded in production
    expect(await User.findOne({ email: 'customer@glowstore.com' })).toBeNull();
    expect(await Order.countDocuments()).toBe(0);
  });
});
