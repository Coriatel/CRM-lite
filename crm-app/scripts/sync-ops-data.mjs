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
  "queue_routes.json",
  "queue_plan.json",
  "queue_receipts.json",
  "management_cockpit.json",
  "safe_swarm.json",
];

// Truthful empty envelope for files OpsPage consumes via parseReceipts or the
// management cockpit projection. Bare `{}` would parse identically empty but
// loses the fact that no writer has ever run; `_meta.executor_inactive` /
// `_meta.source_missing` keep the signal so a UI slice can surface inactivity
// without implying automation that does not exist yet.
export const ENVELOPE_DEFAULT_FILES = new Set([
  "queue_plan.json",
  "queue_receipts.json",
  "management_cockpit.json",
  "safe_swarm.json",
]);

export function envelopeDefault(name, nowIso = new Date().toISOString()) {
  if (name === "safe_swarm.json") {
    // Shape per /srv/ops-vault/state/safe_swarm.schema.json.
    // Honesty rule #1: generated_default=true ⇒ every substrate.*.available=false,
    // every gate 'blocked', health.status='red'. The spawn slot is permanently
    // {available:false, script_path:null} in v0 (karpathy §Authority gate #7).
    const slot = { available: false, script_path: null };
    return {
      _meta: {
        schema_version: "v0",
        writer: "scripts/sync-ops-data.mjs",
        source: "missing — vault projection not synced",
        generated_at: nowIso,
        generated_default: true,
        note: "Safe-empty default envelope written by the CRM ops-data sync when /srv/ops-vault/state/safe_swarm.json is unavailable.",
      },
      substrate: {
        recommend: slot,
        claim: slot,
        materialize: slot,
        queue_audit: slot,
        validate_return: slot,
        validate_next: slot,
        preflight_collision: slot,
        spawn: { available: false, script_path: null },
      },
      gates: [],
      runtime_health: {
        merger_timer_active: null,
        last_health_ts: null,
        last_health_applied: null,
        last_health_rejected: null,
        last_health_error: null,
        spool_depth_after: null,
      },
      queue_snapshot: {
        queue_present: false,
        queue_item_count: null,
        routes_present: false,
        active_sessions_present: false,
        active_session_count: null,
      },
      next_slices: [],
      health: {
        status: "red",
        reasons: ["projection_not_synced"],
      },
    };
  }
  if (name === "management_cockpit.json") {
    // Shape per projects/merkaz-neshama-os/lane-a/management-cockpit-v0.md §4.
    // Honesty rule §4.2.3: generated_default=true ⇒ all counts must be 0.
    return {
      _meta: {
        schema_version: "v0",
        source: "ops-vault projections/management-cockpit",
        source_missing: true,
        generated_default: true,
        automation_active: false,
        updated_at: null,
        generated_at: nowIso,
        file: name,
        writer: "scripts/sync-ops-data.mjs",
      },
      groups: [],
      inbox: [],
      owner_gates: [],
      summary: {
        groups: 0,
        open_items: 0,
        blocked: 0,
        needs_owner: 0,
        needs_rabbi: 0,
      },
    };
  }
  return {
    _meta: {
      source: "missing",
      executor_inactive: true,
      generated_default: true,
      generated_at: nowIso,
      file: name,
      writer: "scripts/sync-ops-data.mjs",
    },
    receipts: [],
  };
}

export function missingDefaultBytes(name, nowIso = new Date().toISOString()) {
  if (ENVELOPE_DEFAULT_FILES.has(name)) {
    return JSON.stringify(envelopeDefault(name, nowIso), null, 2);
  }
  return "{}";
}

function syncAll() {
  mkdirSync(out, { recursive: true });

  for (const f of files) {
    const src = `${vaultState}/${f}`;
    const dst = `${out}/${f}`;
    if (existsSync(src)) {
      writeFileSync(dst, readFileSync(src));
      console.log(`[ops-data] copied ${f}`);
    } else {
      writeFileSync(dst, missingDefaultBytes(f));
      const label = ENVELOPE_DEFAULT_FILES.has(f) ? "envelope default" : "empty";
      console.warn(`[ops-data] vault missing — wrote ${label} ${f}`);
    }
  }

  // push-isolation snapshot: derive latest record from monthly jsonl history.
  const historyDir = `${vaultState}/push-isolation-history`;
  const isoDst = `${out}/push-isolation-latest.json`;
  try {
    if (existsSync(historyDir)) {
      const histFiles = readdirSync(historyDir)
        .filter((n) => n.endsWith(".jsonl"))
        .sort();
      const newest = histFiles.at(-1);
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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncAll();
}
