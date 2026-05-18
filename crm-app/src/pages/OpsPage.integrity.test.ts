import { describe, it, expect } from "vitest";
import { summarizeOrchestratorIntegrity, type OrchestratorIntegrityDoc } from "./OpsPage";

describe("summarizeOrchestratorIntegrity", () => {
  it("returns null for null doc", () => {
    expect(summarizeOrchestratorIntegrity(null)).toBeNull();
  });

  it("returns conservative summary for empty doc (defensive against missing fields)", () => {
    const s = summarizeOrchestratorIntegrity({});
    expect(s).not.toBeNull();
    expect(s!.status).toBe("unknown");
    expect(s!.confidence).toBe("unknown");
    expect(s!.reasons).toEqual([]);
    expect(s!.staleSessions).toBe(0);
    expect(s!.ownerlessStaleSessions).toBe(0);
    expect(s!.driftedFiles).toBe(0);
    expect(s!.mergerHealthy).toBe(false);
    expect(s!.fallbackUsed).toBe(false);
    expect(s!.highSeverityIssues).toBe(0);
  });

  it("extracts status + confidence + reasons (truncated to 6) from full doc", () => {
    const doc: OrchestratorIntegrityDoc = {
      integrity_status: {
        status: "red",
        reasons: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"],
      },
      safe_parallelism: { confidence: "degraded", reasons: ["r1"] },
    };
    const s = summarizeOrchestratorIntegrity(doc)!;
    expect(s.status).toBe("red");
    expect(s.confidence).toBe("degraded");
    expect(s.reasons).toHaveLength(6);
    expect(s.reasons[0]).toBe("r1");
    expect(s.reasons[5]).toBe("r6");
  });

  it("counts stale sessions and ownerless-stale (orphan candidates)", () => {
    const s = summarizeOrchestratorIntegrity({
      sessions: { active_count: 3, stale_count: 2, ownerless_stale_count: 1, stale_ids: ["a", "b"] },
    })!;
    expect(s.staleSessions).toBe(2);
    expect(s.ownerlessStaleSessions).toBe(1);
  });

  it("counts drifted files by array length, not by a separate count field", () => {
    const s = summarizeOrchestratorIntegrity({
      projection_drift: {
        meta_manifest_stale: true,
        drifted_files: [
          { file: "lanes.json", delta_seconds: 99999 },
          { file: "blockers.json", delta_seconds: 50000 },
          { file: "projects.json", delta_seconds: 12345 },
        ],
      },
    })!;
    expect(s.driftedFiles).toBe(3);
  });

  it("surfaces mergerHealthy = false when writer reports degraded pipeline", () => {
    const healthy = summarizeOrchestratorIntegrity({
      merger: { merger_healthy: true, timer_active: true, spool_depth_after: 0, last_error: null },
    })!;
    expect(healthy.mergerHealthy).toBe(true);

    const degraded = summarizeOrchestratorIntegrity({
      merger: { merger_healthy: false, timer_active: true, spool_depth_after: 7, last_error: "x" },
    })!;
    expect(degraded.mergerHealthy).toBe(false);
  });

  it("captures fallbackUsed signal (canonical ACL-blocked → derived used)", () => {
    const s = summarizeOrchestratorIntegrity({
      registry: { canonical_readable: false, fallback_used: true, canonical_stale: false },
    })!;
    expect(s.fallbackUsed).toBe(true);
  });

  it("rolls high + critical runtime-issue severities into highSeverityIssues", () => {
    const s = summarizeOrchestratorIntegrity({
      runtime_issues: { open_count: 9, by_severity: { low: 5, medium: 2, high: 1, critical: 1 } },
    })!;
    expect(s.highSeverityIssues).toBe(2);
  });

  it("defaults missing severity buckets to 0 (no NaN)", () => {
    const s = summarizeOrchestratorIntegrity({
      runtime_issues: { open_count: 5, by_severity: { low: 5 } },
    })!;
    expect(s.highSeverityIssues).toBe(0);
  });

  it("default envelope from sync-ops-data shape yields status=red + confidence=unknown", () => {
    // Mirrors envelopeDefault('orchestrator_integrity.json') in
    // crm-app/scripts/sync-ops-data.mjs — drift here is a contract break.
    const defaultEnvelope: OrchestratorIntegrityDoc = {
      _meta: { generated_default: true },
      registry: { canonical_readable: false, fallback_used: false, canonical_stale: true },
      sessions: { active_count: 0, stale_count: 0, ownerless_count: 0, ownerless_stale_count: 0, stale_ids: [] },
      merger: { merger_healthy: false, timer_active: false, spool_depth_after: 0, last_error: null },
      projection_drift: { meta_manifest_stale: true, drifted_files: [] },
      runtime_issues: { open_count: 0, by_severity: {} },
      safe_parallelism: { confidence: "unknown", reasons: ["projection_not_synced"] },
      integrity_status: { status: "red", reasons: ["projection_not_synced"] },
    };
    const s = summarizeOrchestratorIntegrity(defaultEnvelope)!;
    expect(s.status).toBe("red");
    expect(s.confidence).toBe("unknown");
    expect(s.mergerHealthy).toBe(false);
    expect(s.fallbackUsed).toBe(false);
    expect(s.reasons).toEqual(["projection_not_synced"]);
  });
});
