import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { Category, Order, Product, Review, User } from '../src/models';
import { productService } from '../src/services/productService';

describe('productService.getRecommended', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('returns non-personalized top-rated products for guests and falls back when all stock is zero', async () => {
    const user = await User.create({
      name: 'Rater',
      email: 'rater@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const catAudio = await Category.create({ name: 'Audio', slug: 'audio-rec' });
    const catDesk = await Category.create({ name: 'Desk', slug: 'desk-rec' });

    const topRated = await Product.create({
      name: 'Flagship DAC',
      slug: 'flagship-dac',
      price: 2500000,
      stock: 10,
      image: '/img/dac.jpg',
      categoryId: catAudio._id as any,
    });
    const unrated = await Product.create({
      name: 'Basic Mat',
      slug: 'basic-mat',
      price: 200000,
      stock: 3,
      image: '/img/mat.jpg',
      categoryId: catDesk._id as any,
    });

    await Review.create({
      productId: topRated._id as any,
      userId: user._id as any,
      rating: 5,
      comment: 'Crystal clear sound',
    });

    const guestRecs = await productService.getRecommended(undefined, 2);
    expect(guestRecs.personalized).toBe(false);
    expect(guestRecs.products).toHaveLength(2);
    expect(String(guestRecs.products[0].id)).toBe(topRated._id.toString());

    // Zero stock fallback still returns catalog items
    await Product.updateMany({}, { $set: { stock: 0 } });
    const zeroStockRecs = await productService.getRecommended(undefined, 2);
    expect(zeroStockRecs.products).toHaveLength(2);
    expect(zeroStockRecs.products.map((p: any) => String(p.id))).toContain(unrated._id.toString());
  });

  it('personalizes rankings by preferences, wishlist, recentlyViewed, and demotes bought non-consumables', async () => {
    const catAudio = await Category.create({ name: 'Audio', slug: 'audio-p' });
    const catSkincare = await Category.create({ name: 'Skincare', slug: 'skincare-p' });
    const catOther = await Category.create({ name: 'Lighting', slug: 'lighting-p' });

    const boughtHeadphone = await Product.create({
      name: 'Bought Studio Headphones',
      slug: 'bought-studio-headphones',
      price: 3000000,
      stock: 10,
      image: '/img/hp1.jpg',
      categoryId: catAudio._id as any,
    });
    const freshHeadphone = await Product.create({
      name: 'Fresh Studio Earbuds',
      slug: 'fresh-studio-earbuds',
      price: 1500000,
      stock: 8,
      image: '/img/hp2.jpg',
      categoryId: catAudio._id as any,
    });
    const boughtSerum = await Product.create({
      name: 'Vitamin C Serum',
      slug: 'vitamin-c-serum',
      price: 450000,
      stock: 20,
      image: '/img/serum.jpg',
      categoryId: catSkincare._id as any,
    });
    const lamp = await Product.create({
      name: 'Desk Lamp',
      slug: 'desk-lamp',
      price: 700000,
      stock: 12,
      image: '/img/lamp.jpg',
      categoryId: catOther._id as any,
    });

    const shopper = await User.create({
      name: 'Personalized Shopper',
      email: 'pers@uconext.test',
      password: 'hashed_password',
      role: 'customer',
      preferredCategories: [catAudio._id as any],
      wishlist: [boughtSerum._id as any],
      recentlyViewed: [{ productId: freshHeadphone._id as any, viewedAt: new Date() }],
    });

    await Order.create({
      userId: shopper._id as any,
      items: [
        { productId: boughtHeadphone._id as any, name: boughtHeadphone.name, price: 3000000, quantity: 1 },
        { productId: boughtSerum._id as any, name: boughtSerum.name, price: 450000, quantity: 1 },
      ],
      totalAmount: 3450000,
      shippingAddress: '100 Nguyen Hue, HCMC',
      status: 'delivered',
      paymentMethod: 'cod',
      paymentStatus: 'paid',
    });

    const result = await productService.getRecommended(shopper, 4);
    expect(result.personalized).toBe(true);
    expect(result.matchedCategories).toEqual(expect.arrayContaining(['Audio', 'Skincare']));
    expect(result.products).toHaveLength(4);

    // Fresh Audio + consumable Skincare should rank ahead of already-bought non-consumable headphone
    const ids = result.products.map((p: any) => String(p.id));
    expect(ids.indexOf(freshHeadphone._id.toString())).toBeLessThan(ids.indexOf(boughtHeadphone._id.toString()));
    expect(ids.indexOf(boughtSerum._id.toString())).toBeLessThan(ids.indexOf(boughtHeadphone._id.toString()));
    expect(ids).toContain(lamp._id.toString());
  });

  it('covers productService CRUD validation, filtering, and rating/price/name sort modes', async () => {
    const user = await User.create({
      name: 'Catalog Tester',
      email: 'catalog.tester@uconext.test',
      password: 'hashed_password',
      role: 'customer',
    });
    const catA = await Category.create({ name: 'Monitors', slug: 'monitors-crud' });
    const catB = await Category.create({ name: 'Keyboards', slug: 'keyboards-crud' });

    // Create validation failures
    await expect(productService.create({ name: '', price: 100, stock: 1, categoryId: '' })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      productService.create({ name: 'Bad Cat', price: 100, stock: 1, categoryId: 'not-valid' })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      productService.create({
        name: 'Missing Cat',
        price: 100,
        stock: 1,
        categoryId: '507f1f77bcf86cd799439011',
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    const p1 = await productService.create({
      name: 'Alpha Monitor',
      price: 3000000,
      stock: 5,
      description: '4K display',
      categoryId: catA._id.toString(),
    });
    // Duplicate slug name creates suffixed slug cleanly
    const p2 = await productService.create({
      name: 'Alpha Monitor',
      price: 1200000,
      stock: 0,
      categoryId: catB._id.toString(),
    });
    const p3 = await productService.create({
      name: 'Zeta Keyboard',
      price: 2000000,
      stock: 8,
      categoryId: catB._id.toString(),
    });

    await Review.create({ productId: p1._id as any, userId: user._id as any, rating: 5, comment: 'Sharp' });
    await Review.create({ productId: p3._id as any, userId: user._id as any, rating: 3, comment: 'Okay' });

    // Invalid categoryId returns empty list
    const emptyRes = await productService.getAll({ categoryId: 'invalid-id' });
    expect(emptyRes.totalProducts).toBe(0);

    // Multi-category + search + inStock + price range + sort modes
    const multiCat = await productService.getAll({
      categoryId: `${catA._id.toString()},${catB._id.toString()}`,
      inStock: 'true',
      minPrice: 1000000,
      maxPrice: 3500000,
      sort: 'price_asc',
    });
    expect(multiCat.products.map((p: any) => p.name)).toEqual(['Zeta Keyboard', 'Alpha Monitor']);

    expect((await productService.getAll({ sort: 'price_desc' })).products[0].price).toBe(3000000);
    expect((await productService.getAll({ sort: 'name_asc' })).products[0].name).toBe('Alpha Monitor');
    expect((await productService.getAll({ sort: 'name_desc' })).products[0].name).toBe('Zeta Keyboard');

    // Rating filter + rating sort branches
    const topRated = await productService.getAll({ minRating: 4, sort: 'rating_desc' });
    expect(topRated.totalProducts).toBe(1);
    expect(String(topRated.products[0].id)).toBe(p1._id.toString());
    await productService.getAll({ minRating: 1, sort: 'price_asc' });
    await productService.getAll({ minRating: 1, sort: 'price_desc' });
    await productService.getAll({ minRating: 1, sort: 'name_asc' });
    await productService.getAll({ minRating: 1, sort: 'name_desc' });

    // getById / update / delete error & success paths
    await expect(productService.getById('bad-id')).rejects.toMatchObject({ statusCode: 404 });
    await expect(productService.getById('507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 404 });
    expect((await productService.getById(p1._id.toString())).name).toBe('Alpha Monitor');

    await expect(productService.update('bad-id', { price: 10 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(productService.update('507f1f77bcf86cd799439011', { price: 10 })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(productService.update(p1._id.toString(), { categoryId: 'bad' })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      productService.update(p1._id.toString(), { categoryId: '507f1f77bcf86cd799439011' })
    ).rejects.toMatchObject({ statusCode: 400 });

    const updated = await productService.update(p1._id.toString(), {
      name: 'Zeta Keyboard',
      price: 2900000,
      stock: 4,
      description: 'Updated desc',
      image: '/img/updated.webp',
      options: { colors: ['Silver'], sizes: [] },
      categoryId: catB._id.toString(),
    });
    expect(updated.price).toBe(2900000);

    await expect(productService.delete('bad-id')).rejects.toMatchObject({ statusCode: 404 });
    await expect(productService.delete('507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 404 });
    expect(await productService.delete(p2._id.toString())).toBe(true);
    await expect(productService.delete(p2._id.toString())).rejects.toMatchObject({ statusCode: 404 });
  });
});
