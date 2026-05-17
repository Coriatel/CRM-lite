#!/usr/bin/env node
// Slice 1 (MN-OS /ops): copy ops-vault state JSON into public/ops-data/ at build time.
// Exits 0 even when vault path is absent (CI without /srv/ops-vault) — writes empty arrays
// so the SPA fetch path renders its empty state instead of 404.

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "public", "ops-data");
const vaultState = "/srv/ops-vault/state";

const files = [
  "projects.json",
  "blockers.json",
  "session_index.json",
  "health.json",
  "lanes.json",
  "recent_merges.json",
  "processes.json",
  "runtime-issues.json",
  "active_sessions.json",
  "dependencies.json",
  "workflows.json",
  "handoffs_index.json",
  "_freshness.json",
  "_meta.json",
  "runtime-continuity.json",
  "operational_queue.json",
];

mkdirSync(out, { recursive: true });

for (const f of files) {
  const src = `${vaultState}/${f}`;
  const dst = `${out}/${f}`;
  if (existsSync(src)) {
    writeFileSync(dst, readFileSync(src));
    console.log(`[ops-data] copied ${f}`);
  } else {
    writeFileSync(dst, "{}");
    console.warn(`[ops-data] vault missing — wrote empty ${f}`);
  }
}

// push-isolation snapshot: derive latest record from monthly jsonl history.
const historyDir = `${vaultState}/push-isolation-history`;
const isoDst = `${out}/push-isolation-latest.json`;
try {
  if (existsSync(historyDir)) {
    const files = readdirSync(historyDir)
      .filter((n) => n.endsWith(".jsonl"))
      .sort();
    const newest = files.at(-1);
    if (newest) {
      const lines = readFileSync(`${historyDir}/${newest}`, "utf8")
        .split("\n")
        .filter((l) => l.trim());
      const last = lines.at(-1);
      if (last) {
        JSON.parse(last); // validate
        writeFileSync(isoDst, last);
        console.log(`[ops-data] copied push-isolation-latest from ${newest}`);
      } else {
        writeFileSync(isoDst, "{}");
      }
    } else {
      writeFileSync(isoDst, "{}");
    }
  } else {
    writeFileSync(isoDst, "{}");
    console.warn("[ops-data] vault missing — wrote empty push-isolation-latest.json");
  }
} catch (err) {
  writeFileSync(isoDst, "{}");
  console.warn(`[ops-data] push-isolation snapshot read failed: ${err.message}`);
}
