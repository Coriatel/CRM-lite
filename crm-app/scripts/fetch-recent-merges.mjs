#!/usr/bin/env node
// Slice 8 (MN-OS /ops): fetch latest 5 PRs merged into main, write to
// /srv/ops-vault/state/recent_merges.json. Picked up by sync-ops-data at
// build time and live-served by Caddy from /srv/ops-vault/state.
//
// Read-only against GitHub. Requires `gh` CLI authenticated for repo.
// Falls back to writing an empty {} when gh is unavailable so the SPA
// renders its empty state instead of 404.

import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REPO = process.env.RECENT_MERGES_REPO ?? "Coriatel/CRM-lite";
const OUT = process.env.RECENT_MERGES_OUT ?? "/srv/ops-vault/state/recent_merges.json";
const LIMIT = 5;

mkdirSync(OUT.substring(0, OUT.lastIndexOf("/")), { recursive: true });

const api = `repos/${REPO}/pulls?state=closed&base=main&per_page=20&sort=updated&direction=desc`;
const jq = `[.[] | select(.merged_at != null) | {number, title, mergedAt:.merged_at, login:.user.login, url:.html_url}][:${LIMIT}]`;

try {
  const raw = execFileSync("gh", ["api", "-X", "GET", api, "--jq", jq], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const merges = JSON.parse(raw);
  const doc = { _meta: { fetched_at: new Date().toISOString(), repo: REPO }, merges };
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
  console.log(`[recent_merges] wrote ${merges.length} merges to ${OUT}`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[recent_merges] gh unavailable — wrote empty doc: ${msg}`);
  writeFileSync(OUT, JSON.stringify({ _meta: { error: msg }, merges: [] }, null, 2) + "\n");
}
