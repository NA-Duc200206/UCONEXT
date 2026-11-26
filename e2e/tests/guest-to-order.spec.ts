import { test, expect } from '@playwright/test';

test.describe('Guest cart merge to COD checkout flow', () => {
  test('guest adds product, registers, merges cart, applies coupon if available, and places COD order', async ({
    page,
    request,
  }) => {
    const uniqueEmail = `e2e.buyer.${Date.now()}@uconext.test`;

    // 1. Browse catalog as guest and add first product to cart
    await page.goto('/products');
    const firstProductLink = page.locator('a[href^="/product/"]').first();
    await expect(firstProductLink).toBeVisible();
    await firstProductLink.click();

    await expect(page).toHaveURL(/\/product\//);
    const addToCartBtn = page.getByRole('button', { name: /add to cart/i }).first();
    await expect(addToCartBtn).toBeVisible();
    await addToCartBtn.click();

    // 2. Navigate to cart and proceed to checkout (redirects guest to login)
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: /shopping cart/i })).toBeVisible();
    await page.getByRole('button', { name: /proceed to checkout/i }).click();
    await expect(page).toHaveURL(/\/login\?redirect=cart/);

    // 3. Register a new account preserving redirect=cart
    await page.goto('/register?redirect=cart');
    await page.locator('input[type="text"]').first().fill('E2E Shopper');
    await page.locator('input[type="email"]').fill(uniqueEmail);
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill('StrongPass123!');
    if ((await passwordInputs.count()) > 1) {
      await passwordInputs.nth(1).fill('StrongPass123!');
    }
    await page.getByRole('button', { name: /create account|sign up|register/i }).click();

    // 4. Guest cart item should be merged and visible on /cart
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByRole('button', { name: /proceed to checkout/i })).toBeVisible();

    // Apply an active coupon if one exists in the seeded store
    const activeCouponsRes = await request.get('/api/coupons/active');
    if (activeCouponsRes.ok()) {
      const data = await activeCouponsRes.json();
      const firstCoupon = Array.isArray(data?.coupons) ? data.coupons[0] : null;
      if (firstCoupon?.code) {
        const promoInput = page
          .locator('input[placeholder*="coupon" i], input[placeholder*="code" i]')
          .first();
        if (await promoInput.isVisible()) {
          await promoInput.fill(firstCoupon.code);
          await page.getByRole('button', { name: /apply/i }).first().click();
        }
      }
    }

    // 5. Complete COD checkout
    await page.getByRole('button', { name: /proceed to checkout/i }).click();
    await page.getByPlaceholder(/0912 345 678/i).fill('0901234567');
    await page.getByPlaceholder(/Hanoi \/ Ho Chi Minh City/i).fill('Ho Chi Minh City');
    await page.getByPlaceholder(/120 Tran Duy Hung/i).fill('88 Nguyen Hue, District 1');
    await page.getByRole('button', { name: /place order \(cod\)/i }).click();

    // 6. Verify payment result & order visibility on /orders
    await expect(page).toHaveURL(/\/payment-result\?method=cod&orderId=/);
    await expect(page.getByText(/order placed successfully/i)).toBeVisible();

    await page.getByRole('link', { name: /view my orders/i }).click();
    await expect(page).toHaveURL(/\/orders/);
    await expect(page.getByText(/pending/i).first()).toBeVisible();
  });
});
