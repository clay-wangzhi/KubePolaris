import { test, expect } from '@playwright/test';

test.describe('认证流程', () => {
  test('未登录访问被重定向到登录页', async ({ page }) => {
    await page.goto('/overview');
    await expect(page).toHaveURL(/\/login/);
  });

  test('登录页正常渲染', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="text"], input#username, input[placeholder*="用户"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('错误密码显示错误提示', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input#username, input[placeholder*="用户"]').first().fill('admin');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.ant-message-error, .ant-message-notice-error').first()).toBeVisible({ timeout: 5000 });
  });

  test('正确登录后跳转到总览页', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input#username, input[placeholder*="用户"]').first().fill('admin');
    await page.locator('input[type="password"]').fill('KubePolaris@2026');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/overview/, { timeout: 10000 });
  });

  test('退出登录后回到登录页', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input#username, input[placeholder*="用户"]').first().fill('admin');
    await page.locator('input[type="password"]').fill('KubePolaris@2026');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/overview/, { timeout: 10000 });

    const avatar = page.locator('.ant-dropdown-trigger, .ant-avatar').first();
    if (await avatar.isVisible()) {
      await avatar.click();
      const logoutBtn = page.getByText('退出登录').or(page.getByText('Logout'));
      if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await logoutBtn.click();
        await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
      }
    }
  });
});
