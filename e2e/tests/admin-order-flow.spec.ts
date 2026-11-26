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

      // 1. Register customer and create a COD order via API in customerContext
      const regRes = await customerContext.request.post('/api/auth/register', {
        data: { name: 'Realtime Buyer', email: customerEmail, password: customerPassword },
      });
      expect(regRes.status()).toBe(201);
      const { token: customerToken } = await regRes.json();

      const prodsRes = await customerContext.request.get('/api/products?limit=1');
      expect(prodsRes.ok()).toBe(true);
      const prodsJson = await prodsRes.json();
      const productId = prodsJson.products[0]?.id || prodsJson.products[0]?._id;
      expect(productId).toBeTruthy();

      const orderRes = await customerContext.request.post('/api/orders', {
        headers: { Authorization: `Bearer ${customerToken}` },
        data: {
          items: [{ productId, quantity: 1 }],
          shippingAddress: 'Realtime Buyer | 0901234567 | 12 Le Loi, HCMC',
          paymentMethod: 'cod',
        },
      });
      expect(orderRes.status()).toBe(201);
      const orderJson = await orderRes.json();
      const orderId = String(orderJson.order.id || orderJson.order._id);
      const shortOrderId = orderId.slice(-6).toUpperCase();

      // 2. Customer signs in through UI and opens /orders (connects Socket.IO)
      await customerPage.goto('/login');
      await customerPage.locator('input[type="email"]').fill(customerEmail);
      await customerPage.locator('input[type="password"]').fill(customerPassword);
      await customerPage.getByRole('button', { name: /sign in|log in/i }).click();
      await customerPage.goto('/orders');
      await expect(customerPage.getByText(new RegExp(shortOrderId, 'i')).first()).toBeVisible();
      await expect(customerPage.getByText('Pending').first()).toBeVisible();

      // 3. Admin logs in and advances order status from pending -> confirmed
      await adminPage.goto('/login');
      await adminPage.locator('input[type="email"]').fill(ADMIN_EMAIL);
      await adminPage.locator('input[type="password"]').fill(ADMIN_PASSWORD);
      await adminPage.getByRole('button', { name: /sign in|log in/i }).click();
      await adminPage.goto('/admin/orders');

      const orderRow = adminPage
        .locator('tr, [data-order-id]', {
          hasText: new RegExp(shortOrderId, 'i'),
        })
        .first();
      await expect(orderRow).toBeVisible();
      await orderRow.locator('select').first().selectOption('confirmed');

      // 4. Customer page updates live to Processing via Socket.IO without reloading
      await expect(customerPage.getByText('Processing').first()).toBeVisible();
    } finally {
      await customerContext.close();
      await adminContext.close();
    }
  });
});
