import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.CRM_SMOKE_BASE_URL ?? 'http://127.0.0.1:5173';

const ERROR_SENTINELS = [
  /Application error/i,
  /Internal Server Error/i,
  /Bad Gateway/i,
  /Service Unavailable/i,
  /Gateway Timeout/i,
  /404 Not Found/i,
  /something went wrong/i,
  /שגיאה בטעינת/,
  /אירעה שגיאה/,
];

async function assertNoErrorSentinel(page: Page) {
  const bodyText = await page.locator('body').innerText({ timeout: 5_000 });
  for (const re of ERROR_SENTINELS) {
    expect(bodyText, `error sentinel matched: ${re}`).not.toMatch(re);
  }
}

test.describe('mobile-smoke', () => {
  test('app shell returns 200 at baseURL', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status(), `expected 200 from ${BASE_URL}/, got ${resp?.status()}`).toBe(200);
  });

  test('landed view renders without error sentinel', async ({ page }) => {
    await page.goto('/');
    const oauthBtn = page.getByRole('button', { name: /Google/i });
    const landedHeader = page.getByText(/משפחה מאנ|חיפוש לפי שם או טלפון/);
    await expect(oauthBtn.or(landedHeader).first()).toBeVisible({ timeout: 10_000 });
    await assertNoErrorSentinel(page);
  });

  test('/today renders the 3 live cards without error sentinel', async ({ page }) => {
    const resp = await page.goto('/today');
    expect(resp?.status(), `expected 200 from ${BASE_URL}/today`).toBe(200);
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText(/אנשים.*חיזוק/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/שיחות.*להיום/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'תורמים קבועים' })).toBeVisible();
    await assertNoErrorSentinel(page);
  });

  // Deep-link verification deferred: card-level CTAs are data-conditional
  // (e.g. RecurringDonorsCard renders no link when 0 contacts marked recurring).
  // Smoke checks rendering only; deep-link integration belongs in a seeded e2e tier.
});
