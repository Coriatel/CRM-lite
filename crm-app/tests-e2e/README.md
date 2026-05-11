# Mobile smoke (Playwright)

Smallest reversible Playwright harness for the live mobile surface.
Mobile viewport only (Pixel 7 device profile). No production data mutation; navigation + visibility only.

## Files

- `playwright.config.ts` — single project `mobile-chrome`, `Pixel 7` device, baseURL from env.
- `tests-e2e/mobile-smoke.spec.ts` — two describe blocks: pre-auth surface (always runs) and authenticated flow (skipped without creds).

## Credential wiring (shape only — no values in repo)

Set via environment, never committed:

| Variable | Purpose |
|---|---|
| `CRM_SMOKE_BASE_URL` | Target origin (`https://crmphone.merkazneshama.co.il` for prod smoke; `http://127.0.0.1:5173` for dev). Default: `http://127.0.0.1:5173`. |
| `CRM_SMOKE_EMAIL` | Account email for the authenticated describe. **Currently unused** — login is Google OAuth (see Auth-mode gap below). Placeholder for the path the team picks. |
| `CRM_SMOKE_PASSWORD` | Account password for the authenticated describe. Same caveat as above. |

Local example: `cp .env.example .env`, then export `CRM_SMOKE_*` from your shell (not from `.env`, which is bundled by Vite into the browser).

## Test command

```
npm run test:mobile-smoke
```

Override target:
```
CRM_SMOKE_BASE_URL=https://crmphone.merkazneshama.co.il npm run test:mobile-smoke
```

## Auth-mode gap (open owner decision)

`src/pages/LoginPage.tsx` exposes **Google OAuth only** (or auto-login in `AUTH_MODE=static`/`demo`). There is no email/password form. The authenticated describe is therefore **skipped by default** and three follow-up paths exist:

1. **Static / demo mode for smoke** — set `VITE_AUTH_MODE=static` (or equivalent) in the smoke build. CRM_SMOKE_EMAIL/PASSWORD become unused; no real creds needed. Cheapest, least realistic.
2. **Token bypass** — pre-set a Directus token in `localStorage`/cookie via `page.addInitScript`. Skips the OAuth UI entirely. Needs a long-lived test token (rotate; scope read-only).
3. **OAuth via stored auth state** — manual one-time `playwright codegen` login with a dedicated test Google account, persist `storageState.json`, reload between runs. Standard Playwright pattern; requires test Google account creds.

Pick one before wiring `CRM_SMOKE_EMAIL`/`CRM_SMOKE_PASSWORD` to a real flow. The current spec keeps the env-var names reserved so the chosen path drops in without renames.

## What the spec currently asserts

Three checks, all unconditional (work against current prod build where `AUTH_MODE` auto-logs the user in):

1. App shell responds at `baseURL` (HTTP < 400).
2. Landed view renders — either the OAuth Google button OR the auto-logged-in app header (`משפחה מאנ"ש` / search box). Resilient to AUTH_MODE flips.
3. `/today` renders the three live cards: `אנשים/חיזוק`, `שיחות להיום`, `תורמים קבועים`.

**Deferred:** card-level deep-link assertions. CTAs (e.g. RecurringDonorsCard → `/people` filter) are **data-conditional** — when the underlying count is `0`, no link is rendered, so the assertion flaps. Deep-link integration belongs in a seeded e2e tier with fixture data, not in mobile-smoke.

Verified against `https://crmphone.merkazneshama.co.il` 2026-05-11: **3 passed (2.3s)**.

## Out of scope (explicit non-goals)

- No production data mutation.
- No real Directus writes.
- No destructive actions.
- No real credentials in repo; `.env.example` placeholders only.
- No Playwright browser auto-download in CI yet — see install gate below.

## Install gate

`@playwright/test` is not yet in `package.json`. To enable:

```
cd crm-app
npm install -D @playwright/test
npx playwright install chromium
```

Cost: ~70-100 MB Chromium download + ~40 MB Playwright npm package. Risk: low (test-only devDependency, no runtime impact on `dist-prod`). Reversible via `npm uninstall -D @playwright/test`.

Until installed, `npm run test:mobile-smoke` will fail with "cannot find module @playwright/test". The config + spec are inert without the dep — committing them does not affect build, `dist-prod`, or production.
