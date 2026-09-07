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
    // The Google button is no longer unconditional: it renders only when the
    // Directus instance actually reports a provider, and this one reports
    // none. Anchoring the smoke on it asserted a control the product is
    // deliberately allowed not to have — it passed for weeks only because
    // production was serving a stale bundle, and failed the moment the
    // container was recreated onto the current one.
    //
    // What must be true instead: an unauthenticated visitor gets a usable way
    // in. The email form is that way, and it is present regardless of SSO.
    const emailSignIn = page.getByPlaceholder('אימייל');
    const oauthBtn = page.getByRole('button', { name: /Google/i });
    const landedHeader = page.getByText(/משפחה מאנ|חיפוש לפי שם או טלפון/);
    await expect(emailSignIn.or(oauthBtn).or(landedHeader).first()).toBeVisible({ timeout: 10_000 });
    await assertNoErrorSentinel(page);
  });

  test('the login screen always offers a way in and a way back', async ({ page }) => {
    // The failure this guards: shipping a login screen with no working path.
    // Whatever the SSO state, an unauthenticated visitor must be able to sign
    // in with an address and to recover a forgotten password.
    await page.goto('/');
    await expect(page.getByPlaceholder('אימייל').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder('סיסמה').first()).toBeVisible();
    await expect(page.getByText('שכחת סיסמה?').first()).toBeVisible();
  });

  test('/today returns 200 without error sentinel (auth-gated)', async ({ page }) => {
    // Prod build serves AUTH_MODE='oauth'; unauthenticated /today renders the
    // LoginPage. Smoke without OAuth credentials can only assert (a) the
    // route returns 200 and (b) the rendered page has no error sentinel.
    // Card-level rendering requires an authenticated Playwright session;
    // tracked as a follow-up (authenticated mobile-smoke tier).
    const resp = await page.goto('/today');
    expect(resp?.status(), `expected 200 from ${BASE_URL}/today`).toBe(200);
    await assertNoErrorSentinel(page);
  });
});
