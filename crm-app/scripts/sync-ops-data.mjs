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
  "campaigns.json",
  "goals.json",
  "blockers.json",
  "session_index.json",
  "health.json",
  "lanes.json",
  "recent_merges.json",
  "processes.json",
  "runtime-issues.json",
  "automation_runtime_inventory.json",
  "attention_synthesis.json",
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
  "orchestrator_integrity.json",
  "harness_run.json",
  "producer_contract_violations.json",
  "owner_gate_status.json",
  "owner_gate_decisions.json",
  "inbound_messages.json",
  "global_next_action.json",
  "lesson_processing_runs.json",
  // Phase G Ops Center projections (harness trigger runtime — read-only visibility).
  "run_history.json",
  "run_status.json",
  "run_governance.json",
  // Automation Control Tower catalog — NESTED source, flat dest name (read-only).
  { src: "projections/control-tower/automation_catalog.json", dst: "automation_catalog.json" },
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
  "orchestrator_integrity.json",
  "harness_run.json",
  "run_history.json",
  "run_status.json",
  "run_governance.json",
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
  if (name === "orchestrator_integrity.json") {
    // Shape per /srv/ops-vault/state/orchestrator_integrity.schema.json (v0).
    // Honesty rule: generated_default=true ⇒ canonical_readable=false,
    // merger_healthy=false, integrity_status.status='red',
    // safe_parallelism.confidence='unknown' (per schema description on
    // _meta.generated_default + safe_parallelism.confidence enum docs).
    return {
      _meta: {
        schema_version: "v0",
        writer: "scripts/sync-ops-data.mjs",
        source: "missing — vault projection not synced",
        generated_at: nowIso,
        generated_default: true,
        note: "Safe-empty default envelope written by the CRM ops-data sync when /srv/ops-vault/state/orchestrator_integrity.json is unavailable. Mirrors the producer's generated_default contract; safe to parse before the ops-vault writer (PR #89) has shipped.",
      },
      registry: {
        canonical_readable: false,
        canonical_mtime: null,
        canonical_age_seconds: null,
        heartbeat_ttl_seconds: 300,
        canonical_stale: true,
        derived_projection_present: false,
        derived_mtime: null,
        derived_age_seconds: null,
        derived_provenance: null,
        fallback_used: false,
      },
      sessions: {
        active_count: 0,
        stale_count: 0,
        ownerless_count: 0,
        ownerless_stale_count: 0,
        stale_ids: [],
      },
      merger: {
        timer_active: false,
        last_health_ts: null,
        last_health_age_seconds: null,
        last_applied: 0,
        last_rejected: 0,
        spool_depth_after: 0,
        last_error: null,
        merger_healthy: false,
      },
      projection_drift: {
        meta_manifest_regenerated_at: null,
        meta_manifest_age_seconds: null,
        meta_manifest_stale: true,
        drift_threshold_seconds: 3600,
        drifted_files: [],
      },
      runtime_issues: {
        open_count: 0,
        by_severity: {},
        by_class: {},
      },
      safe_parallelism: {
        confidence: "unknown",
        reasons: ["projection_not_synced"],
      },
      integrity_status: {
        status: "red",
        reasons: ["projection_not_synced"],
      },
    };
  }
  if (name === "harness_run.json") {
    // Shape per /srv/ops-vault/state/harness_run.schema.json (v0). Mirrors the
    // build-harness-run.py --default envelope so /ops renders an honest "no run
    // yet" state before the campaign-advance loop has been run on a build host.
    // Honesty rule: generated_default=true ⇒ last_run/next_action null, health red.
    return {
      _meta: {
        schema_version: "v0",
        writer: "scripts/sync-ops-data.mjs",
        source: "missing — vault projection not synced",
        generated_at: nowIso,
        generated_default: true,
        note: "Safe-empty default envelope written by the CRM ops-data sync when /srv/ops-vault/state/harness_run.json is unavailable. Mirrors build-harness-run.py --default; no campaign-advance run has been observed.",
      },
      last_run: null,
      next_action: null,
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
  if (name === "run_history.json") {
    // Shape per automation-registry/scripts/build-run-history.py (Phase G1).
    // Honesty rule: generated_default=true ⇒ no runs, totals zero. read_only
    // mirrors the producer's _meta flag (this surface never writes runtime state).
    return {
      _meta: {
        schema_version: "v0",
        writer: "scripts/sync-ops-data.mjs",
        source: "missing — vault projection not synced",
        generated_at: nowIso,
        generated_default: true,
        read_only: true,
        total: 0,
        shown: 0,
        note: "Safe-empty default envelope written by the CRM ops-data sync when /srv/ops-vault/state/run_history.json is unavailable. Mirrors the Phase G1 build-run-history.py contract.",
      },
      runs: [],
    };
  }
  if (name === "run_status.json") {
    // Shape per automation-registry/scripts/build-run-status.py (Phase G2).
    // Honesty rule: generated_default=true ⇒ active/queued/done all empty, counts zero.
    return {
      _meta: {
        schema_version: "v0",
        writer: "scripts/sync-ops-data.mjs",
        source: "missing — vault projection not synced",
        generated_at: nowIso,
        generated_default: true,
        read_only: true,
        active_count: 0,
        queued_count: 0,
        done_count: 0,
        note: "Safe-empty default envelope written by the CRM ops-data sync when /srv/ops-vault/state/run_status.json is unavailable. Mirrors the Phase G2 build-run-status.py contract.",
      },
      active: [],
      queued: [],
      done: [],
    };
  }
  if (name === "run_governance.json") {
    // Shape per automation-registry/scripts/build-run-governance.py (Phase G5).
    // Honesty rule: generated_default=true ⇒ no gates/budget hits, all counts zero.
    return {
      _meta: {
        schema_version: "v0",
        writer: "scripts/sync-ops-data.mjs",
        source: "missing — vault projection not synced",
        generated_at: nowIso,
        generated_default: true,
        read_only: true,
        total_runs: 0,
        note: "Safe-empty default envelope written by the CRM ops-data sync when /srv/ops-vault/state/run_governance.json is unavailable. Mirrors the Phase G5 build-run-governance.py contract.",
      },
      owner_gates: { skipped_runs: [], pending_requests: [], count: 0 },
      budget_posture: { limit_reached_runs: [], count: 0 },
      runtime_posture: { by_status: {}, by_decision: {}, in_flight: 0, total_runs: 0 },
      stop_reasons: {},
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

  for (const entry of files) {
    // Bare string ⇒ flat copy state/<f> → ops-data/<f>. Object {src,dst} ⇒
    // nested source under state/, flat dest name (e.g. control-tower catalog).
    const srcRel = typeof entry === "string" ? entry : entry.src;
    const f = typeof entry === "string" ? entry : entry.dst;
    const src = `${vaultState}/${srcRel}`;
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
