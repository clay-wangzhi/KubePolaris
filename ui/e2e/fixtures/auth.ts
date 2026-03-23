import { test as base, expect, type Page } from '@playwright/test';

const API_BASE = `http://localhost:${process.env.E2E_BACKEND_PORT || '8001'}/api/v1`;
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'KubePolaris@2026';

export async function loginViaAPI(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

export async function createUser(token: string, username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      username,
      password,
      email: `${username}@test.com`,
      display_name: `Test ${username}`,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Create user failed: ${res.status} ${body}`);
  }
}

async function injectToken(page: Page, token: string) {
  await page.goto('/login');
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
  }, token);
}

type AuthFixtures = {
  adminPage: Page;
};

export const test = base.extend<AuthFixtures>({
  adminPage: async ({ page }, use) => {
    const token = await loginViaAPI(ADMIN_USER, ADMIN_PASS);
    await injectToken(page, token);
    await page.goto('/overview');
    await page.waitForLoadState('networkidle');
    await use(page);
  },
});

export { expect };
