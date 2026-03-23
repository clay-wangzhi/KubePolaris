import { test, expect } from './fixtures/auth';

test.describe('集群管理', () => {
  test('集群列表页正常渲染', async ({ adminPage: page }) => {
    await page.goto('/clusters');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(10);
    const hasContent = body!.includes('集群') || body!.includes('Cluster') || body!.includes('cluster')
      || body!.includes('导入') || body!.includes('Import') || body!.includes('暂无');
    expect(hasContent).toBe(true);
  });

  test('集群页面无JS报错', async ({ adminPage: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/clusters');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });

  test('集群导入页面可访问', async ({ adminPage: page }) => {
    await page.goto('/clusters/import');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(10);
  });
});
