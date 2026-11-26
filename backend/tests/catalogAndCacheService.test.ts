import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { AuditLog, Product, Review, User } from '../src/models';
import { categoryService } from '../src/services/categoryService';
import { productService } from '../src/services/productService';
import { couponService } from '../src/services/couponService';
import { analyticsService } from '../src/services/analyticsService';
import { redisClient } from '../src/config/redis';

describe('categoryService, productService, auditService & cacheService', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('normalizes Vietnamese category slugs, returns accurate productCount, blocks deleting populated categories, and soft-deletes products', async () => {
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@uconext.test',
      password: 'hashed_password',
      role: 'admin',
    });

    const cat: any = await (categoryService as any).create('Đồ Gia Dụng & Bếp', 'Thiết bị nhà bếp', admin._id.toString());
    expect(cat.slug).toBe('do-gia-dung-bep');

    // Duplicate category name/slug returns 400 instead of 500
    await expect(
      (categoryService as any).create('Đồ Gia Dụng & Bếp', 'Trùng lặp', admin._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });

    const prod: any = await (productService as any).create(
      {
        name: 'Precision Kettle',
        price: 1800000,
        stock: 4,
        categoryId: String(cat._id || cat.id),
      },
      admin._id.toString()
    );

    const allCats = await categoryService.getAll();
    const matchedCat: any = allCats.find((c: any) => String(c.id || c._id) === String(cat._id || cat.id));
    expect(matchedCat?.productCount).toBe(1);

    // Deleting a category that still has active products must fail with 400
    await expect((categoryService as any).delete(String(cat._id || cat.id), admin._id.toString())).rejects.toMatchObject({
      statusCode: 400,
    });

    // Deleting the product performs a soft-delete (document stays in DB with isDeleted: true)
    await (productService as any).delete(String(prod._id || prod.id), admin._id.toString());
    const rawInDb = await Product.findById(prod._id);
    expect(rawInDb).not.toBeNull();
    expect(rawInDb?.isDeleted).toBe(true);

    // Soft-deleted product is hidden from getById and category productCount drops to 0
    await expect(productService.getById(String(prod._id))).rejects.toMatchObject({ statusCode: 404 });
    const catsAfterDelete = await categoryService.getAll();
    const catAfter: any = catsAfterDelete.find((c: any) => String(c.id || c._id) === String(cat._id || cat.id));
    expect(catAfter?.productCount).toBe(0);

    // Empty category can now be deleted cleanly
    await expect((categoryService as any).delete(String(cat._id || cat.id), admin._id.toString())).resolves.toBe(true);

    // Admin actions were recorded in AuditLog
    const logs = await AuditLog.find({ userId: admin._id as any }).lean();
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining(['CATEGORY_CREATE', 'PRODUCT_CREATE', 'PRODUCT_DELETE', 'CATEGORY_DELETE'])
    );
  });

  it('supports server-side inStock, minRating, and rating_desc sorting in productService.getAll and reports global lowStockCount', async () => {
    const reviewer = await User.create({
      name: 'Reviewer',
      email: 'rev@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const cat: any = await categoryService.create('Audio');
    const catId = String(cat._id || cat.id);

    const pHigh = await Product.create({
      name: 'Reference Monitor Headphones',
      slug: 'reference-monitor-headphones',
      price: 3000000,
      stock: 5, // low stock (<= 10)
      categoryId: catId as any,
    });
    const pLow = await Product.create({
      name: 'Budget Earbuds',
      slug: 'budget-earbuds',
      price: 400000,
      stock: 25,
      categoryId: catId as any,
    });
    const pOutOfStock = await Product.create({
      name: 'Sold Out DAC',
      slug: 'sold-out-dac',
      price: 2500000,
      stock: 0, // low stock (<= 10)
      categoryId: catId as any,
    });

    await Review.create([
      { productId: pHigh._id as any, userId: reviewer._id as any, rating: 5, comment: 'Crisp soundstage' },
      { productId: pLow._id as any, userId: reviewer._id as any, rating: 3, comment: 'Average bass' },
      { productId: pOutOfStock._id as any, userId: reviewer._id as any, rating: 5, comment: 'Great when available' },
    ]);

    const filtered: any = await productService.getAll({
      inStock: 'true',
      minRating: '4',
      sort: 'rating_desc',
    } as any);

    expect(filtered.totalProducts).toBe(1);
    expect(filtered.products[0].name).toBe('Reference Monitor Headphones');
    expect(filtered.products[0].rating).toBe(5);
    expect(filtered.products[0].reviewCount).toBe(1);

    const dashboard: any = await analyticsService.getDashboardStats();
    expect(dashboard.stats.lowStockCount).toBe(2);
  });

  it('supports toggling Coupon isActive and blocks validation when paused', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin2@uconext.test',
      password: 'hashed_password',
      role: 'admin',
    });

    const created: any = await (couponService as any).create(
      {
        code: 'FLASH20',
        discountType: 'percentage',
        discountValue: 20,
        minOrderAmount: 200000,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
        usageLimit: 50,
        perUserLimit: 2,
      },
      admin._id.toString()
    );

    const paused: any = await (couponService as any).update(
      String(created._id),
      { isActive: false },
      admin._id.toString()
    );
    expect(paused.isActive).toBe(false);

    const activeList = await couponService.getActiveCoupons();
    expect(activeList.find((c: any) => c.code === 'FLASH20')).toBeUndefined();

    await expect(couponService.validateCoupon('FLASH20', 500000)).rejects.toMatchObject({
      statusCode: 400,
    });

    // Re-activating restores availability
    await (couponService as any).update(String(created._id), { isActive: true }, admin._id.toString());
    const validAgain = await couponService.validateCoupon('FLASH20', 500000);
    expect(validAgain.valid).toBe(true);
  });

  it('reads/writes through Redis cache when ready and invalidates cached keys on mutations', async () => {
    const store = new Map<string, string>();
    vi.spyOn(redisClient, 'isReady', 'get').mockReturnValue(true);
    vi.spyOn(redisClient, 'get').mockImplementation((async (key: string) => store.get(key) ?? null) as any);
    vi.spyOn(redisClient, 'setEx').mockImplementation((async (key: string, _ttl: number, val: string) => {
      store.set(key, val);
      return 'OK';
    }) as any);
    vi.spyOn(redisClient, 'keys').mockImplementation((async (pattern: string) => {
      const prefix = pattern.replace(/\*$/, '');
      return Array.from(store.keys()).filter((k) => k.startsWith(prefix));
    }) as any);
    vi.spyOn(redisClient, 'del').mockImplementation((async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach((k) => store.delete(k));
      return arr.length;
    }) as any);

    await categoryService.create('Watches');

    // First call populates Redis cache
    const first = await categoryService.getAll();
    expect(first).toHaveLength(1);
    expect(store.size).toBeGreaterThan(0);

    // Creating a new category invalidates the categories cache so the next getAll returns fresh data
    await categoryService.create('Skincare');
    const second = await categoryService.getAll();
    expect(second).toHaveLength(2);
  });
});

