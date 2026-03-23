import { test, expect } from './fixtures/auth';

test.describe('工作负载', () => {
  test('工作负载页面无JS报错', async ({ adminPage: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/workloads');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });

  test('工作负载页面可访问', async ({ adminPage: page }) => {
    await page.goto('/workloads');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(10);
  });
});
