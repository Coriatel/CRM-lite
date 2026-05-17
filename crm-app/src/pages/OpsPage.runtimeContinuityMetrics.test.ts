import { describe, it, expect } from "vitest";
import { runtimeContinuityMetrics } from "./OpsPage";

describe("runtimeContinuityMetrics", () => {
  it("null doc → hasData=false, zero counts, default 7-day window", () => {
    const m = runtimeContinuityMetrics(null);
    expect(m.hasData).toBe(false);
    expect(m.sessions).toBe(0);
    expect(m.continuations).toBe(0);
    expect(m.stops).toBe(0);
    expect(m.ownerGates).toBe(0);
    expect(m.possibleFalseStops).toBe(0);
    expect(m.windowDays).toBe(7);
    expect(m.generatedAt).toBeNull();
    expect(m.topStopReason).toBeNull();
    expect(m.topOwnerGateType).toBeNull();
  });

  it("doc with totals → maps counts and hasData=true", () => {
    const m = runtimeContinuityMetrics({
      _meta: { ts: "2026-05-17T05:33:30Z", window_days: 7 },
      totals: {
        sessions: 4,
        continuation_decisions: 12,
        stops: 3,
        owner_gates: 1,
        shipped: 2,
      },
    });
    expect(m.hasData).toBe(true);
    expect(m.sessions).toBe(4);
    expect(m.continuations).toBe(12);
    expect(m.stops).toBe(3);
    expect(m.ownerGates).toBe(1);
    expect(m.shipped).toBe(2);
    expect(m.windowDays).toBe(7);
    expect(m.generatedAt).toBe("2026-05-17T05:33:30Z");
  });

  it("picks the most frequent stop reason and owner-gate type", () => {
    const m = runtimeContinuityMetrics({
      totals: { stops: 5, owner_gates: 3 },
      stops_by_reason: { authority_gate: 3, other: 2 },
      owner_gates_by_type: { merge_authority: 2, credential_or_secret: 1 },
    });
    expect(m.topStopReason).toEqual({ reason: "authority_gate", count: 3 });
    expect(m.topOwnerGateType).toEqual({
      type: "merge_authority",
      count: 2,
    });
  });

  it("possible_false_stops alone is enough to surface (hasData=true)", () => {
    const m = runtimeContinuityMetrics({
      possible_false_stops: [
        { session_id: "s1", ts: "2026-05-17T05:00:00Z", reason: "natural checkpoint", metric_cited: false },
      ],
    });
    expect(m.hasData).toBe(true);
    expect(m.possibleFalseStops).toBe(1);
    expect(m.sessions).toBe(0);
  });

  it("missing totals and empty rollups → hasData=false (no spurious card)", () => {
    const m = runtimeContinuityMetrics({
      _meta: { ts: "2026-05-17T05:33:30Z" },
      totals: {},
      stops_by_reason: {},
      owner_gates_by_type: {},
      possible_false_stops: [],
    });
    expect(m.hasData).toBe(false);
    expect(m.generatedAt).toBe("2026-05-17T05:33:30Z");
  });
});
