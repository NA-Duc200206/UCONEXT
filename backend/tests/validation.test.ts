import http from 'http';
import { AddressInfo } from 'net';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import app from '../src/server';
import { productService } from '../src/services/productService';
import { registerSchema, loginSchema } from '../src/schemas/auth';
import { createOrderSchema } from '../src/schemas/order';
import { validateCouponSchema } from '../src/schemas/coupon';
import { createProductSchema, listProductsQuerySchema } from '../src/schemas/product';
import { addReviewSchema } from '../src/schemas/review';
import { addAddressSchema } from '../src/schemas/address';
import { aiChatSchema } from '../src/schemas/ai';
import { syncCartSchema } from '../src/schemas/cart';

const VALID_OID = new Types.ObjectId().toString();

describe('Zod boundary validation & safe 500 error responses', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await clearTestDB();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectTestDB();
  });

  it('validates auth, order, coupon, product, review, address, ai, and cart schemas with strict limits', () => {
    // auth
    expect(registerSchema.safeParse({ name: 'Alice', email: 'a@b.vn', password: 'StrongPassword1' }).success).toBe(true);
    expect(registerSchema.safeParse({ name: 'A'.repeat(81), email: 'a@b.vn', password: 'StrongPassword1' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: `${'a'.repeat(250)}@b.vn`, password: 'x' }).success).toBe(false);

    // order
    expect(
      createOrderSchema.safeParse({
        items: [{ productId: VALID_OID, quantity: 2, color: 'Black', size: 'M' }],
        shippingAddress: '123 Nguyen Hue, District 1, HCMC',
        paymentMethod: 'cod',
      }).success
    ).toBe(true);
    expect(
      createOrderSchema.safeParse({
        items: [{ productId: VALID_OID, quantity: 100 }],
        shippingAddress: '123 Nguyen Hue',
      }).success
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        items: Array.from({ length: 51 }, () => ({ productId: VALID_OID, quantity: 1 })),
        shippingAddress: '123 Nguyen Hue',
      }).success
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        items: [{ productId: VALID_OID, quantity: 1, color: 'C'.repeat(41) }],
        shippingAddress: '123 Nguyen Hue',
      }).success
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        items: [{ productId: VALID_OID, quantity: 1 }],
        shippingAddress: 'A'.repeat(501),
      }).success
    ).toBe(false);

    // coupon
    expect(validateCouponSchema.safeParse({ code: 'SAVE10', orderAmount: 500000 }).success).toBe(true);
    expect(validateCouponSchema.safeParse({ code: '', orderAmount: -1 }).success).toBe(false);

    // product (image URL & query limit)
    expect(
      createProductSchema.safeParse({
        name: 'Studio Monitor',
        price: 5000000,
        stock: 5,
        categoryId: VALID_OID,
        image: 'https://images.unsplash.com/photo-1',
      }).success
    ).toBe(true);
    expect(
      createProductSchema.safeParse({
        name: 'Studio Monitor',
        price: 5000000,
        stock: 5,
        categoryId: VALID_OID,
        image: '/uploads/product.webp',
      }).success
    ).toBe(true);
    expect(
      createProductSchema.safeParse({
        name: 'Studio Monitor',
        price: 5000000,
        stock: 5,
        categoryId: VALID_OID,
        image: 'javascript:alert(1)',
      }).success
    ).toBe(false);
    expect(listProductsQuerySchema.safeParse({ limit: '24' }).success).toBe(true);
    expect(listProductsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);

    // review
    expect(addReviewSchema.safeParse({ productId: VALID_OID, rating: 5, comment: 'Great!' }).success).toBe(true);
    expect(addReviewSchema.safeParse({ productId: VALID_OID, rating: 4.5, comment: 'Bad float' }).success).toBe(false);
    expect(addReviewSchema.safeParse({ productId: VALID_OID, rating: 5, comment: 'X'.repeat(2001) }).success).toBe(false);

    // address
    expect(
      addAddressSchema.safeParse({
        label: 'Office',
        fullName: 'Nguyen Van A',
        phone: '0901234567',
        address: '123 Le Loi, District 1, HCMC',
      }).success
    ).toBe(true);
    expect(
      addAddressSchema.safeParse({
        label: 'L'.repeat(41),
        fullName: 'Nguyen Van A',
        phone: '123',
        address: '123',
      }).success
    ).toBe(false);

    // ai
    expect(aiChatSchema.safeParse({ message: 'Recommend headphones under 2M' }).success).toBe(true);
    expect(aiChatSchema.safeParse({ message: 'M'.repeat(1001) }).success).toBe(false);

    // cart
    expect(
      syncCartSchema.safeParse({
        cart: [{ productId: VALID_OID, name: 'Headphones', price: 100000, quantity: 2 }],
      }).success
    ).toBe(true);
    expect(
      syncCartSchema.safeParse({
        cart: Array.from({ length: 51 }, () => ({
          productId: VALID_OID,
          name: 'Headphones',
          price: 100000,
          quantity: 1,
        })),
      }).success
    ).toBe(false);
  });

  it('returns 400 VALIDATION_ERROR on invalid HTTP payloads and masks internal 500 error messages', async () => {
    // Boundary validation over HTTP
    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: '' }),
    });
    expect(badLogin.status).toBe(400);
    const badLoginBody: any = await badLogin.json();
    expect(badLoginBody.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(badLoginBody.fields)).toBe(true);

    // Unhandled error without statusCode from service -> 500 INTERNAL_ERROR without leaking original message
    vi.spyOn(productService, 'getAll').mockRejectedValueOnce(
      new Error('MongoNetworkError: secret internal connection string mongodb+srv://admin:pwd@cluster')
    );

    const errRes = await fetch(`${baseUrl}/api/products`);
    expect(errRes.status).toBe(500);
    const errBody: any = await errRes.json();
    expect(errBody).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Đã có lỗi xảy ra.',
    });
    expect(JSON.stringify(errBody)).not.toContain('mongodb+srv');
    expect(JSON.stringify(errBody)).not.toContain('MongoNetworkError');
  });
});
