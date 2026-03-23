import { test, expect } from './fixtures/auth';

test.describe('系统设置', () => {
  test('系统设置页面可访问', async ({ adminPage: page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(10);
  });

  test('系统设置页面无JS报错', async ({ adminPage: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });
});
