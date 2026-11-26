import { test, expect } from '@playwright/test';

test.describe('Stale chunk preload recovery', () => {
  test('recovers cleanly via reload when a lazy route JS chunk returns 404 after a deploy', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    let failedOnce = false;
    await page.route('**/assets/*.js', async (route) => {
      if (!failedOnce) {
        failedOnce = true;
        await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Chunk not found' });
        return;
      }
      await route.continue();
    });

    // Navigate to a lazy-loaded route to trigger chunk preload failure -> reload recovery
    const shopLink = page.locator('a[href="/products"]').first();
    if (await shopLink.isVisible()) {
      await shopLink.click();
    } else {
      await page.goto('/products');
    }

    await expect(page).toHaveURL(/\/products/);
    await expect(page.getByRole('heading', { name: /all products/i })).toBeVisible();
  });
});
