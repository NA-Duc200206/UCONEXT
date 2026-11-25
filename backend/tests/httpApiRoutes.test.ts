import fs from 'fs';
import http from 'http';
import path from 'path';
import { AddressInfo } from 'net';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import app from '../src/server';
import { User } from '../src/models';

describe('Express HTTP routes, RBAC, CORS, and upload security', () => {
  let server: http.Server;
  let baseUrl = '';
  const createdUploadFiles: string[] = [];

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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectTestDB();
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
    // Unauthenticated access to protected route -> 401
    const unauthOrders = await fetch(`${baseUrl}/api/orders/my-orders`);
    expect(unauthOrders.status).toBe(401);

    // Malformed JWT -> 401
    const badJwtOrders = await fetch(`${baseUrl}/api/orders/my-orders`, {
      headers: { Authorization: 'Bearer invalid.jwt.token' },
    });
    expect(badJwtOrders.status).toBe(401);

    // Register customer via HTTP
    const regCustomerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'HTTP Customer',
        email: 'customer.http@uconext.test',
        password: 'StrongPassword1',
      }),
    });
    expect(regCustomerRes.status).toBe(201);
    const customerData: any = await regCustomerRes.json();
    const customerToken = customerData.token as string;

    // Customer can access /api/orders/my-orders (200) but NOT /api/analytics/dashboard (403)
    const myOrdersRes = await fetch(`${baseUrl}/api/orders/my-orders`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(myOrdersRes.status).toBe(200);

    const forbiddenDash = await fetch(`${baseUrl}/api/analytics/dashboard`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(forbiddenDash.status).toBe(403);

    // Register & promote admin user, then create category + product + inspect audit trail over HTTP
    const regAdminRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'HTTP Admin',
        email: 'admin.http@uconext.test',
        password: 'StrongPassword1',
      }),
    });
    const adminData: any = await regAdminRes.json();
    await User.findByIdAndUpdate(adminData.user.id, { role: 'admin' });
    const adminToken = adminData.token as string;

    const createCatRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
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
        Authorization: `Bearer ${adminToken}`,
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
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(auditRes.status).toBe(200);
    const auditBody: any = await auditRes.json();
    const actions = auditBody.logs.map((l: any) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['CATEGORY_CREATE', 'PRODUCT_CREATE']));
  });

  it('rejects SVG avatar uploads with 400 and accepts valid PNG uploads over multipart HTTP', async () => {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Uploader',
        email: 'uploader@uconext.test',
        password: 'StrongPassword1',
      }),
    });
    const { token }: any = await regRes.json();

    // SVG upload attempt -> 400
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

    // Valid PNG upload -> 200
    const pngHeaderBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const pngForm = new FormData();
    pngForm.append('image', new Blob([pngHeaderBytes], { type: 'image/png' }), 'avatar.png');
    const pngRes = await fetch(`${baseUrl}/api/media/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: pngForm,
    });
    expect(pngRes.status).toBe(200);
    const pngBody: any = await pngRes.json();
    expect(pngBody.imageUrl).toMatch(/^\/uploads\/prod_.*\.png$/);
    createdUploadFiles.push(pngBody.imageUrl);
  });
});
