import { test, expect } from '@playwright/test';

const BASE_URL = process.env.CRM_SMOKE_BASE_URL ?? 'http://127.0.0.1:5173';
const EMAIL = process.env.CRM_SMOKE_EMAIL;
const PASSWORD = process.env.CRM_SMOKE_PASSWORD;

test.describe('mobile-smoke (pre-auth surface)', () => {
  test('login screen renders on mobile viewport', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/.*/);
    const googleBtn = page.getByRole('button', { name: /Google/i });
    await expect(googleBtn).toBeVisible({ timeout: 10_000 });
  });

  test('app shell responds at baseURL', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status(), `expected 2xx from ${BASE_URL}/`).toBeLessThan(400);
  });
});

test.describe('mobile-smoke (authenticated)', () => {
  test.skip(
    !EMAIL || !PASSWORD,
    'CRM_SMOKE_EMAIL/CRM_SMOKE_PASSWORD missing — authenticated flow deferred until auth-mode decision (Google OAuth vs static/demo vs token-bypass). See tests-e2e/README.md.'
  );

  test('navigate to /today and verify 3 live cards + deep-link to /people', async ({ page }) => {
    await page.goto('/today');
    await expect(page).toHaveURL(/\/today/);

    const peopleCare = page.getByText(/אנשים.*חיזוק/);
    const callsToday = page.getByText(/שיחות.*להיום/);
    const recurring = page.getByText(/תורמים קבועים/);
    await expect(peopleCare).toBeVisible();
    await expect(callsToday).toBeVisible();
    await expect(recurring).toBeVisible();

    await recurring.click();
    await expect(page).toHaveURL(/\/people/);
    const activeFilter = page.getByText(/תורמים קבועים|donationType/i);
    await expect(activeFilter.first()).toBeVisible({ timeout: 5_000 });
  });
});
