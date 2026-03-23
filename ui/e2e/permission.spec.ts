import { test as base, expect } from '@playwright/test';
import { loginViaAPI, createUser } from './fixtures/auth';

const test = base;

test.describe('权限控制', () => {
  let adminToken: string;
  const testUser = `e2euser_${Date.now()}`;
  const testPass = 'Test@2026';

  test.beforeAll(async () => {
    adminToken = await loginViaAPI('admin', 'KubePolaris@2026');
    await createUser(adminToken, testUser, testPass).catch(() => {});
  });

  test('普通用户登录后能看到页面内容', async ({ page }) => {
    const token = await loginViaAPI(testUser, testPass);

    await page.goto('/login');
    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await page.goto('/overview');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(10);
  });

  test('未认证用户被重定向到登录页', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.removeItem('token'));
    await page.goto('/clusters');
    await expect(page).toHaveURL(/\/login/);
  });
});
