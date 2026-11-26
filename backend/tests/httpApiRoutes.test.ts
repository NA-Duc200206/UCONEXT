import fs from 'fs';
import http from 'http';
import path from 'path';
import { AddressInfo } from 'net';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { createApp } from '../src/app';
import { getIO } from '../src/config/socket';
import { Coupon, User } from '../src/models';
import { emailService } from '../src/services/emailService';

describe('Express HTTP routes, RBAC, CORS, domain endpoints, and upload security', () => {
  let server: http.Server;
  let baseUrl = '';
  const createdUploadFiles: string[] = [];

  beforeAll(async () => {
    await connectTestDB();
    vi.spyOn(emailService, 'sendOrderConfirmation').mockResolvedValue(true);
    vi.spyOn(emailService, 'sendOrderStatusUpdate').mockResolvedValue(true);

    const app = createApp({ disableRateLimit: true });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (mongoose.connection.readyState !== 1) {
      await connectTestDB();
    }
    await clearTestDB();
    while (createdUploadFiles.length > 0) {
      const relUrl = createdUploadFiles.pop();
      if (relUrl && relUrl.startsWith('/uploads/')) {
        const diskPath = path.join(__dirname, '../public', relUrl);
        if (fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
        }
      }
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectTestDB();
  });

  async function registerUser(name: string, email: string, promoteAdmin = false) {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: 'StrongPassword1' }),
    });
    expect(res.status).toBe(201);
    const data: any = await res.json();
    if (promoteAdmin) {
      await User.findByIdAndUpdate(data.user.id, { role: 'admin' });
    }
    return data as { token: string; user: { id: string; email: string } };
  }

  it('does not instantiate Socket.IO when importing createApp', () => {
    expect(getIO()).toBeNull();
  });

  it('reports healthy MongoDB readiness on GET /api/health and enforces CORS origins', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');

    const healthBody: any = await healthRes.json();
    expect(healthBody.status).toBe('ok');
    expect(healthBody.db.connected).toBe(true);

    // Disallowed third-party origin must be rejected by CORS middleware
    const blockedRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://malicious.example' },
    });
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('enforces JWT authentication and Admin RBAC across protected endpoints', async () => {
    const unauthOrders = await fetch(`${baseUrl}/api/orders/my-orders`);
    expect(unauthOrders.status).toBe(401);

    const badJwtOrders = await fetch(`${baseUrl}/api/orders/my-orders`, {
      headers: { Authorization: 'Bearer invalid.jwt.token' },
    });
    expect(badJwtOrders.status).toBe(401);

    const customer = await registerUser('HTTP Customer', 'customer.http@uconext.test');
    const myOrdersRes = await fetch(`${baseUrl}/api/orders/my-orders`, {
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    expect(myOrdersRes.status).toBe(200);

    const forbiddenDash = await fetch(`${baseUrl}/api/analytics/dashboard`, {
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    expect(forbiddenDash.status).toBe(403);

    const admin = await registerUser('HTTP Admin', 'admin.http@uconext.test', true);
    const createCatRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ name: 'Monitors, Desk', description: 'Pro displays' }),
    });
    expect(createCatRes.status).toBe(201);
    const createdCat: any = await createCatRes.json();
    const categoryId = createdCat.category.id || createdCat.category._id;

    const createProdRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        name: '27-inch Studio Monitor',
        price: 8500000,
        stock: 6,
        categoryId,
      }),
    });
    expect(createProdRes.status).toBe(201);

    const auditRes = await fetch(`${baseUrl}/api/analytics/audit-logs?limit=10`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    expect(auditRes.status).toBe(200);
    const auditBody: any = await auditRes.json();
    const actions = auditBody.logs.map((l: any) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['CATEGORY_CREATE', 'PRODUCT_CREATE']));
  });

  it('handles order, payment, coupon, review, wishlist, and AI HTTP routes end-to-end', async () => {
    const admin = await registerUser('Store Admin', 'admin.flow@uconext.test', true);
    const customer = await registerUser('Store Customer', 'cust.flow@uconext.test');

    // Create category + product
    const catRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ name: 'Audio', description: 'Audio gear' }),
    });
    const catJson: any = await catRes.json();
    const categoryId = catJson.category.id || catJson.category._id;

    const prodRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ name: 'Studio Mic', price: 1200000, stock: 10, categoryId }),
    });
    expect(prodRes.status).toBe(201);
    const prodJson: any = await prodRes.json();
    const productId = prodJson.product.id || prodJson.product._id;

    // Seed active coupon and verify /api/coupons/active + /api/coupons/validate
    await Coupon.create({
      code: 'SAVE100K',
      discountType: 'fixed',
      discountValue: 100000,
      minOrderAmount: 500000,
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
      usageLimit: 50,
      perUserLimit: 1,
      isActive: true,
    });

    const activeCouponsRes = await fetch(`${baseUrl}/api/coupons/active`);
    expect(activeCouponsRes.status).toBe(200);
    const activeCouponsBody: any = await activeCouponsRes.json();
    expect(activeCouponsBody.coupons.some((c: any) => c.code === 'SAVE100K')).toBe(true);

    const validateRes = await fetch(`${baseUrl}/api/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
      body: JSON.stringify({ code: 'SAVE100K', orderAmount: 1200000 }),
    });
    expect(validateRes.status).toBe(200);
    const validateBody: any = await validateRes.json();
    expect(validateBody.discountAmount).toBe(100000);

    // Wishlist toggle -> get -> delete
    const wlToggle = await fetch(`${baseUrl}/api/wishlist/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
      body: JSON.stringify({ productId }),
    });
    expect(wlToggle.status).toBe(200);
    expect(((await wlToggle.json()) as any).wishlisted).toBe(true);

    const wlGet = await fetch(`${baseUrl}/api/wishlist`, {
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    expect(wlGet.status).toBe(200);
    expect(((await wlGet.json()) as any).wishlist).toHaveLength(1);

    const wlDel = await fetch(`${baseUrl}/api/wishlist/${productId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    expect(wlDel.status).toBe(200);

    // Review add -> list -> delete
    const addRev = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
      body: JSON.stringify({ productId, rating: 5, comment: 'Crisp vocal capture!' }),
    });
    expect(addRev.status).toBe(201);
    const addRevBody: any = await addRev.json();
    const reviewId = addRevBody.review._id || addRevBody.review.id;

    const getRevs = await fetch(`${baseUrl}/api/reviews/product/${productId}`);
    expect(getRevs.status).toBe(200);
    expect(((await getRevs.json()) as any).totalReviews).toBe(1);

    const delRev = await fetch(`${baseUrl}/api/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    expect(delRev.status).toBe(200);

    // Payment methods (VNPAY disabled by default)
    const payMethodsRes = await fetch(`${baseUrl}/api/payment/methods`);
    expect(payMethodsRes.status).toBe(200);
    expect(((await payMethodsRes.json()) as any).vnpay).toBe(false);

    // Create COD order with coupon + admin status update
    const createOrderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
      body: JSON.stringify({
        items: [{ productId, quantity: 1 }],
        shippingAddress: '88 Nguyen Hue, District 1, HCMC',
        paymentMethod: 'cod',
        couponCode: 'SAVE100K',
      }),
    });
    expect(createOrderRes.status).toBe(201);
    const orderJson: any = await createOrderRes.json();
    const orderId = orderJson.order.id || orderJson.order._id;
    expect(orderJson.order.totalAmount).toBe(1100000);

    const statusRes = await fetch(`${baseUrl}/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ status: 'confirmed' }),
    });
    expect(statusRes.status).toBe(200);
    expect(((await statusRes.json()) as any).order.status).toBe('confirmed');

    // AI status + chat when unconfigured returns 503
    vi.stubEnv('AI_PROVIDER', 'auto');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');
    vi.stubEnv('AI_API_KEY', '');

    const aiStatusRes = await fetch(`${baseUrl}/api/ai/status`);
    expect(aiStatusRes.status).toBe(200);
    expect(((await aiStatusRes.json()) as any).configured).toBe(false);

    const aiChatRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Recommend headphones' }),
    });
    expect(aiChatRes.status).toBe(503);
  });

  it('rejects SVG avatar uploads with 400 and accepts valid PNG uploads over multipart HTTP', async () => {
    const { token } = await registerUser('Uploader', 'uploader@uconext.test');

    const svgForm = new FormData();
    svgForm.append(
      'image',
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], {
        type: 'image/svg+xml',
      }),
      'xss.svg'
    );
    const svgRes = await fetch(`${baseUrl}/api/media/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: svgForm,
    });
    expect(svgRes.status).toBe(400);

    const validPngBytes = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 36, g: 84, b: 244, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const pngForm = new FormData();
    pngForm.append('image', new Blob([new Uint8Array(validPngBytes)], { type: 'image/png' }), 'avatar.png');
    const pngRes = await fetch(`${baseUrl}/api/media/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: pngForm,
    });
    expect(pngRes.status).toBe(200);
    const pngBody: any = await pngRes.json();
    expect(pngBody.imageUrl).toMatch(/^\/uploads\/avatar\/[0-9a-f-]+\.webp$/);
    createdUploadFiles.push(pngBody.imageUrl);
  });

  it('returns 503 on GET /api/health when MongoDB is disconnected', async () => {
    await mongoose.disconnect();
    const degradedRes = await fetch(`${baseUrl}/api/health`);
    expect(degradedRes.status).toBe(503);
    const body: any = await degradedRes.json();
    expect(body.status).toBe('degraded');
    expect(body.db.connected).toBe(false);
  });
});
