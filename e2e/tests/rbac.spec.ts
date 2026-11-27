import { test, expect } from '@playwright/test';

test.describe('Role-based access control', () => {
  test('blocks customer from /admin routes and rejects admin API calls with 403', async ({
    page,
    request,
  }) => {
    const email = `e2e.rbac.${Date.now()}@uconext.test`;
    const password = 'StrongPass123!';

    const regRes = await request.post('/api/auth/register', {
      data: { name: 'Standard Customer', email, password },
    });
    expect(regRes.status()).toBe(201);
    const { token } = await regRes.json();

    // Backend RBAC check
    const dashRes = await request.get('/api/analytics/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dashRes.status()).toBe(403);

    // Frontend RouteGuard check
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/Admin Dashboard/i)).toHaveCount(0);

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/$/);
  });
});
