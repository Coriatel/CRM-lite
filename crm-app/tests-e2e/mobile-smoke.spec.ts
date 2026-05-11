import { test, expect } from '@playwright/test';

const BASE_URL = process.env.CRM_SMOKE_BASE_URL ?? 'http://127.0.0.1:5173';

test.describe('mobile-smoke', () => {
  test('app shell responds at baseURL', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status(), `expected 2xx from ${BASE_URL}/`).toBeLessThan(400);
  });

  test('landed view renders (auto-login OR oauth screen)', async ({ page }) => {
    await page.goto('/');
    const oauthBtn = page.getByRole('button', { name: /Google/i });
    const landedHeader = page.getByText(/משפחה מאנ|חיפוש לפי שם או טלפון/);
    await expect(oauthBtn.or(landedHeader).first()).toBeVisible({ timeout: 10_000 });
  });

  test('/today renders the 3 live cards', async ({ page }) => {
    await page.goto('/today');
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText(/אנשים.*חיזוק/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/שיחות.*להיום/)).toBeVisible();
    await expect(page.getByText(/תורמים קבועים/)).toBeVisible();
  });

  // Deep-link verification deferred: card-level CTAs are data-conditional
  // (e.g. RecurringDonorsCard renders no link when 0 contacts marked recurring).
  // Smoke checks rendering only; deep-link integration belongs in a seeded e2e tier.
});
