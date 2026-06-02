import { describe, expect, it } from "vitest";
import {
  ENVELOPE_DEFAULT_FILES,
  envelopeDefault,
  missingDefaultBytes,
} from "./sync-ops-data.mjs";
import { parseReceipts } from "../src/pages/OpsPage";

const FIXED_ISO = "2026-05-17T14:00:00.000Z";

describe("missingDefaultBytes", () => {
  it("returns bare '{}' for legacy files (unchanged behavior)", () => {
    expect(missingDefaultBytes("projects.json", FIXED_ISO)).toBe("{}");
    expect(missingDefaultBytes("queue_routes.json", FIXED_ISO)).toBe("{}");
    expect(missingDefaultBytes("operational_queue.json", FIXED_ISO)).toBe("{}");
  });

  it("returns truthful empty envelope for queue_plan.json", () => {
    const bytes = missingDefaultBytes("queue_plan.json", FIXED_ISO);
    const doc = JSON.parse(bytes);
    expect(doc).toMatchObject({
      _meta: {
        source: "missing",
        executor_inactive: true,
        generated_default: true,
        generated_at: FIXED_ISO,
        file: "queue_plan.json",
        writer: "scripts/sync-ops-data.mjs",
      },
      receipts: [],
    });
  });

  it("returns truthful empty envelope for queue_receipts.json", () => {
    const bytes = missingDefaultBytes("queue_receipts.json", FIXED_ISO);
    const doc = JSON.parse(bytes);
    expect(doc._meta.executor_inactive).toBe(true);
    expect(doc._meta.generated_default).toBe(true);
    expect(doc._meta.file).toBe("queue_receipts.json");
    expect(Array.isArray(doc.receipts)).toBe(true);
    expect(doc.receipts).toHaveLength(0);
  });
});

describe("envelopeDefault wire contract", () => {
  it("is consumed by OpsPage.parseReceipts as an empty receipts list", () => {
    const doc = envelopeDefault("queue_plan.json", FIXED_ISO);
    expect(parseReceipts(doc)).toEqual([]);
  });

  it("does not imply automation: receipts is empty, executor_inactive is true", () => {
    const doc = envelopeDefault("queue_receipts.json", FIXED_ISO);
    expect(doc.receipts).toEqual([]);
    expect(doc._meta.executor_inactive).toBe(true);
  });

  it("preserves explicit nowIso for deterministic output", () => {
    const a = envelopeDefault("queue_plan.json", FIXED_ISO);
    const b = envelopeDefault("queue_plan.json", FIXED_ISO);
    expect(a).toEqual(b);
  });
});

describe("ENVELOPE_DEFAULT_FILES", () => {
  it("covers the queue + management cockpit + safe swarm + orchestrator integrity envelope files", () => {
    expect(ENVELOPE_DEFAULT_FILES.has("queue_plan.json")).toBe(true);
    expect(ENVELOPE_DEFAULT_FILES.has("queue_receipts.json")).toBe(true);
    expect(ENVELOPE_DEFAULT_FILES.has("management_cockpit.json")).toBe(true);
    expect(ENVELOPE_DEFAULT_FILES.has("safe_swarm.json")).toBe(true);
    expect(ENVELOPE_DEFAULT_FILES.has("orchestrator_integrity.json")).toBe(true);
    expect(ENVELOPE_DEFAULT_FILES.has("queue_routes.json")).toBe(false);
    expect(ENVELOPE_DEFAULT_FILES.has("operational_queue.json")).toBe(false);
  });

  it("covers the Phase G Ops Center projection files (G1/G2/G5)", () => {
    expect(ENVELOPE_DEFAULT_FILES.has("run_history.json")).toBe(true);
    expect(ENVELOPE_DEFAULT_FILES.has("run_status.json")).toBe(true);
    expect(ENVELOPE_DEFAULT_FILES.has("run_governance.json")).toBe(true);
  });
});

describe("management_cockpit.json envelope", () => {
  it("returns the v0 safe-empty shape with source_missing and zero counts", () => {
    const doc = envelopeDefault("management_cockpit.json", FIXED_ISO);
    expect(doc._meta).toMatchObject({
      schema_version: "v0",
      source_missing: true,
      generated_default: true,
      automation_active: false,
      updated_at: null,
      file: "management_cockpit.json",
    });
    expect(doc.groups).toEqual([]);
    expect(doc.inbox).toEqual([]);
    expect(doc.owner_gates).toEqual([]);
    expect(doc.summary).toEqual({
      groups: 0,
      open_items: 0,
      blocked: 0,
      needs_owner: 0,
      needs_rabbi: 0,
    });
  });

  it("never implies automation in the default value", () => {
    const doc = envelopeDefault("management_cockpit.json", FIXED_ISO);
    expect(doc._meta.automation_active).toBe(false);
    expect(doc._meta.source_missing).toBe(true);
  });

  it("does not collide with the queue envelope shape", () => {
    const mc = envelopeDefault("management_cockpit.json", FIXED_ISO);
    const qp = envelopeDefault("queue_plan.json", FIXED_ISO);
    expect("receipts" in mc).toBe(false);
    expect("groups" in qp).toBe(false);
  });
});

describe("safe_swarm.json envelope", () => {
  it("returns the v0 safe-empty shape — generated_default true, every substrate available=false, health red", () => {
    const doc = envelopeDefault("safe_swarm.json", FIXED_ISO);
    expect(doc._meta).toMatchObject({
      schema_version: "v0",
      writer: "scripts/sync-ops-data.mjs",
      generated_at: FIXED_ISO,
      generated_default: true,
    });
    expect(typeof doc._meta.source).toBe("string");
    expect(typeof doc._meta.note).toBe("string");
    const slots = [
      "recommend",
      "claim",
      "materialize",
      "queue_audit",
      "validate_return",
      "validate_next",
      "preflight_collision",
      "spawn",
    ];
    for (const k of slots) {
      expect(doc.substrate[k]).toEqual({ available: false, script_path: null });
    }
    expect(doc.health.status).toBe("red");
    expect(Array.isArray(doc.health.reasons)).toBe(true);
    expect(doc.health.reasons.length).toBeGreaterThan(0);
  });

  it("returns nullable runtime_health + queue_snapshot fields and empty arrays for gates/next_slices", () => {
    const doc = envelopeDefault("safe_swarm.json", FIXED_ISO);
    expect(doc.runtime_health).toEqual({
      merger_timer_active: null,
      last_health_ts: null,
      last_health_applied: null,
      last_health_rejected: null,
      last_health_error: null,
      spool_depth_after: null,
    });
    expect(doc.queue_snapshot).toEqual({
      queue_present: false,
      queue_item_count: null,
      routes_present: false,
      active_sessions_present: false,
      active_session_count: null,
    });
    expect(doc.gates).toEqual([]);
    expect(doc.next_slices).toEqual([]);
  });

  it("missingDefaultBytes emits the safe_swarm envelope as JSON", () => {
    const bytes = missingDefaultBytes("safe_swarm.json", FIXED_ISO);
    const doc = JSON.parse(bytes);
    expect(doc._meta.generated_default).toBe(true);
    expect(doc.health.status).toBe("red");
  });
});

describe("orchestrator_integrity.json envelope", () => {
  it("returns the v0 safe-empty shape — generated_default true, integrity_status red, safe_parallelism unknown", () => {
    const doc = envelopeDefault("orchestrator_integrity.json", FIXED_ISO);
    expect(doc._meta).toMatchObject({
      schema_version: "v0",
      writer: "scripts/sync-ops-data.mjs",
      generated_at: FIXED_ISO,
      generated_default: true,
    });
    expect(typeof doc._meta.source).toBe("string");
    expect(typeof doc._meta.note).toBe("string");
    expect(doc.integrity_status.status).toBe("red");
    expect(doc.safe_parallelism.confidence).toBe("unknown");
  });

  it("honesty rule: every readability/healthy boolean is false when generated_default", () => {
    const doc = envelopeDefault("orchestrator_integrity.json", FIXED_ISO);
    expect(doc.registry.canonical_readable).toBe(false);
    expect(doc.registry.canonical_stale).toBe(true);
    expect(doc.registry.derived_projection_present).toBe(false);
    expect(doc.registry.fallback_used).toBe(false);
    expect(doc.merger.timer_active).toBe(false);
    expect(doc.merger.merger_healthy).toBe(false);
    expect(doc.projection_drift.meta_manifest_stale).toBe(true);
  });

  it("reasons arrays carry the projection_not_synced signal", () => {
    const doc = envelopeDefault("orchestrator_integrity.json", FIXED_ISO);
    expect(doc.integrity_status.reasons).toContain("projection_not_synced");
    expect(doc.safe_parallelism.reasons).toContain("projection_not_synced");
  });

  it("required schema fields are all present (no schema break)", () => {
    const doc = envelopeDefault("orchestrator_integrity.json", FIXED_ISO);
    for (const k of [
      "_meta", "registry", "sessions", "merger",
      "projection_drift", "runtime_issues", "safe_parallelism", "integrity_status",
    ]) {
      expect(doc).toHaveProperty(k);
    }
    for (const k of [
      "schema_version", "writer", "source", "generated_at", "generated_default", "note",
    ]) {
      expect(doc._meta).toHaveProperty(k);
    }
    for (const k of [
      "canonical_readable", "canonical_mtime", "canonical_age_seconds",
      "heartbeat_ttl_seconds", "canonical_stale", "derived_projection_present",
      "derived_mtime", "derived_age_seconds", "derived_provenance", "fallback_used",
    ]) {
      expect(doc.registry).toHaveProperty(k);
    }
    for (const k of [
      "active_count", "stale_count", "ownerless_count",
      "ownerless_stale_count", "stale_ids",
    ]) {
      expect(doc.sessions).toHaveProperty(k);
    }
    for (const k of [
      "timer_active", "last_health_ts", "last_health_age_seconds",
      "last_applied", "last_rejected", "spool_depth_after",
      "last_error", "merger_healthy",
    ]) {
      expect(doc.merger).toHaveProperty(k);
    }
    for (const k of [
      "meta_manifest_regenerated_at", "meta_manifest_age_seconds",
      "meta_manifest_stale", "drift_threshold_seconds", "drifted_files",
    ]) {
      expect(doc.projection_drift).toHaveProperty(k);
    }
    expect(doc.runtime_issues).toMatchObject({
      open_count: 0,
      by_severity: {},
      by_class: {},
    });
  });

  it("missingDefaultBytes emits the orchestrator_integrity envelope as JSON", () => {
    const bytes = missingDefaultBytes("orchestrator_integrity.json", FIXED_ISO);
    const doc = JSON.parse(bytes);
    expect(doc._meta.generated_default).toBe(true);
    expect(doc.integrity_status.status).toBe("red");
    expect(doc.safe_parallelism.confidence).toBe("unknown");
  });

  it("does not collide with the management_cockpit or safe_swarm envelope shapes", () => {
    const oi = envelopeDefault("orchestrator_integrity.json", FIXED_ISO);
    expect("groups" in oi).toBe(false);
    expect("inbox" in oi).toBe(false);
    expect("substrate" in oi).toBe(false);
    expect("gates" in oi).toBe(false);
  });
});

describe("run_history.json envelope (Phase G1)", () => {
  it("returns the v0 safe-empty shape — generated_default true, empty runs, zero totals", () => {
    const doc = envelopeDefault("run_history.json", FIXED_ISO);
    expect(doc._meta).toMatchObject({
      schema_version: "v0",
      writer: "scripts/sync-ops-data.mjs",
      generated_at: FIXED_ISO,
      generated_default: true,
      read_only: true,
      total: 0,
      shown: 0,
    });
    expect(typeof doc._meta.source).toBe("string");
    expect(typeof doc._meta.note).toBe("string");
    expect(Array.isArray(doc.runs)).toBe(true);
    expect(doc.runs).toHaveLength(0);
  });

  it("missingDefaultBytes emits the run_history envelope as JSON", () => {
    const doc = JSON.parse(missingDefaultBytes("run_history.json", FIXED_ISO));
    expect(doc._meta.generated_default).toBe(true);
    expect(doc.runs).toEqual([]);
  });
});

describe("run_status.json envelope (Phase G2)", () => {
  it("returns the v0 safe-empty shape — empty active/queued/done, zero counts", () => {
    const doc = envelopeDefault("run_status.json", FIXED_ISO);
    expect(doc._meta).toMatchObject({
      schema_version: "v0",
      generated_default: true,
      read_only: true,
      active_count: 0,
      queued_count: 0,
      done_count: 0,
    });
    expect(doc.active).toEqual([]);
    expect(doc.queued).toEqual([]);
    expect(doc.done).toEqual([]);
  });

  it("missingDefaultBytes emits the run_status envelope as JSON", () => {
    const doc = JSON.parse(missingDefaultBytes("run_status.json", FIXED_ISO));
    expect(doc._meta.generated_default).toBe(true);
    expect(doc.active).toEqual([]);
  });
});

describe("run_governance.json envelope (Phase G5)", () => {
  it("returns the v0 safe-empty shape — empty gates/budget, zero counts", () => {
    const doc = envelopeDefault("run_governance.json", FIXED_ISO);
    expect(doc._meta).toMatchObject({
      schema_version: "v0",
      generated_default: true,
      read_only: true,
      total_runs: 0,
    });
    expect(doc.owner_gates).toEqual({ skipped_runs: [], pending_requests: [], count: 0 });
    expect(doc.budget_posture).toEqual({ limit_reached_runs: [], count: 0 });
    expect(doc.runtime_posture).toMatchObject({ by_status: {}, by_decision: {}, in_flight: 0, total_runs: 0 });
    expect(doc.stop_reasons).toEqual({});
  });

  it("missingDefaultBytes emits the run_governance envelope as JSON", () => {
    const doc = JSON.parse(missingDefaultBytes("run_governance.json", FIXED_ISO));
    expect(doc._meta.generated_default).toBe(true);
    expect(doc.owner_gates.count).toBe(0);
  });

  it("does not collide with the run_history or run_status envelope shapes", () => {
    const gov = envelopeDefault("run_governance.json", FIXED_ISO);
    expect("runs" in gov).toBe(false);
    expect("active" in gov).toBe(false);
    expect("queued" in gov).toBe(false);
  });
});
