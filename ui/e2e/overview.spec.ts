import { test, expect } from './fixtures/auth';

test.describe('总览仪表盘', () => {
  test('页面加载成功', async ({ adminPage: page }) => {
    await page.goto('/overview');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(10);
  });

  test('显示集群相关文字', async ({ adminPage: page }) => {
    await page.goto('/overview');
    await page.waitForLoadState('networkidle');

    const pageText = await page.textContent('body');
    expect(pageText).toBeTruthy();
    const hasClusterInfo = pageText!.includes('集群') || pageText!.includes('Cluster')
      || pageText!.includes('cluster') || pageText!.includes('总览') || pageText!.includes('Overview');
    expect(hasClusterInfo).toBe(true);
  });

  test('页面无JS报错', async ({ adminPage: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/overview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });
});
