import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@uconext.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminStrongPass123!';

test.describe('Admin order management with realtime customer update', () => {
  test('admin confirms an order and customer sees live status update without reload', async ({
    browser,
    baseURL,
  }) => {
    const customerEmail = `e2e.rt.${Date.now()}@uconext.test`;
    const customerPassword = 'StrongPass123!';

    const customerContext = await browser.newContext({ baseURL });
    const adminContext = await browser.newContext({ baseURL });

    try {
      const customerPage = await customerContext.newPage();
      const adminPage = await adminContext.newPage();

      // 1. Register customer and pick an in-stock product below the 5,000,000 VND COD cap
      const regRes = await customerContext.request.post('/api/auth/register', {
        data: { name: 'Realtime Buyer', email: customerEmail, password: customerPassword },
      });
      expect(regRes.status()).toBe(201);
      const { token: customerToken } = await regRes.json();

      const prodsRes = await customerContext.request.get(
        '/api/products?inStock=true&maxPrice=4000000&sort=price_asc&limit=5'
      );
      expect(prodsRes.ok()).toBe(true);
      const prodsJson = await prodsRes.json();
      const codEligible = (prodsJson.products || []).find(
        (p: any) => Number(p.stock) > 0 && Number(p.price) > 0 && Number(p.price) <= 4_000_000
      );
      const productId = codEligible?.id || codEligible?._id;
      expect(productId).toBeTruthy();

      const orderRes = await customerContext.request.post('/api/orders', {
        headers: { Authorization: `Bearer ${customerToken}` },
        data: {
          items: [{ productId, quantity: 1 }],
          shippingAddress: 'Realtime Buyer | 0901234567 | 12 Le Loi, HCMC',
          paymentMethod: 'cod',
        },
      });
      expect(orderRes.status(), await orderRes.text()).toBe(201);
      const orderJson = await orderRes.json();
      const orderId = String(orderJson.order.id || orderJson.order._id);

      // 2. Customer signs in through UI and opens /orders (connects Socket.IO)
      await customerPage.goto('/login');
      await customerPage.locator('input[type="email"]').fill(customerEmail);
      await customerPage.locator('input[type="password"]').fill(customerPassword);
      await customerPage.getByRole('button', { name: /sign in|log in/i }).click();
      await expect(customerPage).not.toHaveURL(/\/login/);

      await customerPage.goto('/orders');
      const customerOrderCard = customerPage
        .locator('.orders-surface', { hasText: `Order #${orderId}` })
        .first();
      await expect(customerOrderCard).toBeVisible();
      await expect(customerOrderCard.locator('.badge', { hasText: 'Pending' })).toBeVisible();

      // 3. Admin logs in and advances order status from pending -> confirmed
      await adminPage.goto('/login');
      await adminPage.locator('input[type="email"]').fill(ADMIN_EMAIL);
      await adminPage.locator('input[type="password"]').fill(ADMIN_PASSWORD);
      await adminPage.getByRole('button', { name: /sign in|log in/i }).click();
      await expect(adminPage).not.toHaveURL(/\/login/);

      await adminPage.goto('/admin/orders');
      const adminOrderCard = adminPage
        .locator('.admin-surface-elevated', { hasText: `Order #${orderId}` })
        .first();
      await expect(adminOrderCard).toBeVisible();
      await adminOrderCard.getByLabel('Update order status').selectOption('confirmed');

      // 4. Customer order card updates live to Processing via Socket.IO without reloading
      await expect(customerOrderCard.locator('.badge', { hasText: 'Processing' })).toBeVisible();
    } finally {
      await customerContext.close();
      await adminContext.close();
    }
  });
});
