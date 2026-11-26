import { test, expect } from '@playwright/test';

test.describe('Guest cart merge to COD checkout flow', () => {
  test('guest adds product, registers, merges cart, applies coupon if available, and places COD order', async ({
    page,
    request,
  }) => {
    const uniqueEmail = `e2e.buyer.${Date.now()}@uconext.test`;

    // 1. Pick an in-stock product below the 5,000,000 VND COD cap and add to cart as guest
    const prodsRes = await request.get(
      '/api/products?inStock=true&maxPrice=4000000&sort=price_asc&limit=5'
    );
    expect(prodsRes.ok()).toBe(true);
    const prodsJson = await prodsRes.json();
    const chosenProduct = (prodsJson.products || []).find(
      (p: any) => Number(p.stock) > 0 && Number(p.price) > 0 && Number(p.price) <= 4_000_000
    );
    const productId = chosenProduct?.id || chosenProduct?._id;
    expect(productId).toBeTruthy();

    await page.goto(`/product/${productId}`);
    const addToCartBtn = page.getByRole('button', { name: /add to cart/i }).first();
    await expect(addToCartBtn).toBeVisible();
    await addToCartBtn.click();

    // 2. Navigate to cart and proceed to checkout (redirects guest to login)
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: /shopping cart/i })).toBeVisible();
    await page.getByRole('button', { name: /proceed to checkout/i }).click();
    await expect(page).toHaveURL(/\/login\?redirect=cart/);

    // 3. Register a new account preserving redirect=/cart
    await page.goto('/register?redirect=/cart');
    await page.locator('input[name="name"]').fill('E2E Shopper');
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[name="password"]').fill('StrongPass123!');
    await page.locator('input[name="confirmPassword"]').fill('StrongPass123!');
    await page.locator('input[type="checkbox"]').check();

    const submitBtn = page.getByRole('button', { name: /create account|sign up|register/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 4. Guest cart item should be merged and visible on /cart
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByRole('button', { name: /proceed to checkout/i })).toBeVisible();

    // Apply an active coupon if one is eligible for this item's subtotal
    const activeCouponsRes = await request.get('/api/coupons/active');
    if (activeCouponsRes.ok()) {
      const data = await activeCouponsRes.json();
      const eligibleCoupon = (Array.isArray(data?.coupons) ? data.coupons : []).find(
        (c: any) => Number(c.minOrderAmount || 0) <= Number(chosenProduct.price || 0)
      );
      if (eligibleCoupon?.code) {
        const promoInput = page
          .locator('input[placeholder*="coupon" i], input[placeholder*="code" i]')
          .first();
        if (await promoInput.isVisible()) {
          await promoInput.fill(eligibleCoupon.code);
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
    await expect(
      page.locator('.orders-surface .badge', { hasText: 'Pending' }).first()
    ).toBeVisible();
  });
});
