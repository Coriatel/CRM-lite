import { describe, it, expect } from "vitest";
import {
  summarizeOrchestratorIntegrity,
  classifyIntegrityForOperator,
  type OrchestratorIntegrityDoc,
  type OrchestratorIntegritySummary,
} from "./OpsPage";

function summary(
  overrides: Partial<OrchestratorIntegritySummary> = {},
): OrchestratorIntegritySummary {
  return {
    status: "green",
    confidence: "high",
    reasons: [],
    staleSessions: 0,
    ownerlessStaleSessions: 0,
    driftedFiles: 0,
    mergerHealthy: true,
    fallbackUsed: false,
    highSeverityIssues: 0,
    ...overrides,
  };
}

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

describe("classifyIntegrityForOperator", () => {
  it("returns null for null summary", () => {
    expect(classifyIntegrityForOperator(null)).toBeNull();
  });

  it("all-clear when status=green and confidence=high", () => {
    const v = classifyIntegrityForOperator(summary())!;
    expect(v.topCategory).toBe("all_clear");
    expect(v.severity).toBe("info");
    expect(v.headline).toContain("תקינה");
  });

  it("safe_degraded when only signal is fallbackUsed and merger is healthy", () => {
    const v = classifyIntegrityForOperator(
      summary({ status: "red", confidence: "degraded", fallbackUsed: true }),
    )!;
    expect(v.topCategory).toBe("safe_degraded");
    expect(v.severity).toBe("info");
    expect(v.nextAction).toContain("אין צורך לפעול");
  });

  it("merger_unhealthy is highest-priority action category", () => {
    const v = classifyIntegrityForOperator(
      summary({
        status: "red",
        confidence: "degraded",
        mergerHealthy: false,
        fallbackUsed: true,
        driftedFiles: 3,
        ownerlessStaleSessions: 1,
        highSeverityIssues: 1,
      }),
    )!;
    expect(v.topCategory).toBe("merger_unhealthy");
    expect(v.severity).toBe("action");
    expect(v.categories).toContain("high_severity_issue");
    expect(v.categories).toContain("orphan_session");
    expect(v.categories).toContain("stale_projection");
  });

  it("high_severity_issue outranks orphan/stale/missing-source", () => {
    const v = classifyIntegrityForOperator(
      summary({
        status: "red",
        highSeverityIssues: 2,
        ownerlessStaleSessions: 1,
        driftedFiles: 5,
        fallbackUsed: true,
      }),
    )!;
    expect(v.topCategory).toBe("high_severity_issue");
    expect(v.severity).toBe("action");
  });

  it("stale_projection when only drifted files are present", () => {
    const v = classifyIntegrityForOperator(
      summary({ status: "yellow", confidence: "degraded", driftedFiles: 8 }),
    )!;
    expect(v.topCategory).toBe("stale_projection");
    expect(v.severity).toBe("watch");
    expect(v.meaning).toContain("לא רעננו");
  });

  it("missing_canonical_source when fallback is used alongside other watch signals", () => {
    const v = classifyIntegrityForOperator(
      summary({
        status: "red",
        confidence: "degraded",
        fallbackUsed: true,
        driftedFiles: 2,
      }),
    )!;
    // stale_projection comes before missing_canonical_source by priority, but
    // both are present in categories.
    expect(v.topCategory).toBe("stale_projection");
    expect(v.categories).toContain("missing_canonical_source");
    expect(v.categories).not.toContain("safe_degraded");
  });

  it("orphan_session is a watch, not an action (no auto-escalation)", () => {
    const v = classifyIntegrityForOperator(
      summary({ status: "yellow", confidence: "degraded", ownerlessStaleSessions: 1 }),
    )!;
    expect(v.topCategory).toBe("orphan_session");
    expect(v.severity).toBe("watch");
    expect(v.nextAction).toContain("7 ימים");
  });

  it("degraded_confidence shown when confidence is degraded but no concrete signal fired", () => {
    const v = classifyIntegrityForOperator(
      summary({ status: "yellow", confidence: "degraded" }),
    )!;
    expect(v.topCategory).toBe("degraded_confidence");
    expect(v.severity).toBe("watch");
  });

  it("unknown when both status and confidence are unknown (data missing)", () => {
    const v = classifyIntegrityForOperator(
      summary({ status: "unknown", confidence: "unknown", mergerHealthy: false }),
    )!;
    // mergerHealthy=false is suppressed when status=unknown — we don't have
    // signal to assert merger is broken vs missing data.
    expect(v.topCategory).toBe("unknown");
  });

  it("live production-shape doc resolves to a watch state, never silent", () => {
    // Mirror of the live JSON at session time: canonical not readable,
    // 1 ownerless stale session, 8 drifted files, merger healthy, fallback used.
    const v = classifyIntegrityForOperator(
      summary({
        status: "red",
        confidence: "degraded",
        ownerlessStaleSessions: 1,
        driftedFiles: 8,
        mergerHealthy: true,
        fallbackUsed: true,
        highSeverityIssues: 1,
      }),
    )!;
    expect(v.severity).toBe("action"); // high_severity_issue triggers action
    expect(v.topCategory).toBe("high_severity_issue");
  });
});
