import { describe, it, expect } from "vitest";
import {
  classifyRuntimeOrchestrationForOperator,
  type OperationalQueueDoc,
  type QueueRoutesDoc,
} from "./OpsPage";

const HEBREW_RE = /[א-ת]/;

function makeRoutes(tierDist?: Partial<Record<"low" | "medium" | "high" | "max" | "none", number>>, summary?: Partial<Record<"autonomous" | "owner" | "escalate" | "defer", number>>): QueueRoutesDoc {
  return {
    _meta: {
      schema_version: 1,
      routed_at: "2026-05-26T00:00:00Z",
      item_count: 10,
      reasoning_tier_distribution: {
        low: 0,
        medium: 0,
        high: 0,
        max: 0,
        none: 0,
        ...tierDist,
      },
    },
    summary: { autonomous: 0, owner: 0, escalate: 0, defer: 0, ...summary },
    routes: {},
  };
}

function makeItem(overrides: Partial<OperationalQueueDoc extends { queue?: infer T } ? (T extends Array<infer I> ? I : never) : never> = {}) {
  return {
    id: "blocker:test",
    type: "blocker" as const,
    severity: "medium" as const,
    lane: null,
    source: { producer: "blockers.json", ref: "test", url: null },
    created_at: "2026-05-26T00:00:00Z",
    freshness: "fresh" as const,
    retryable: false,
    owner_gate: false,
    owner_gate_kind: null,
    continuation_candidate: true,
    blocker_type: "technical",
    suggested_action: "fix it",
    assigned_agent: null,
    session_reference: null,
    repo_path: null,
    reversibility: "reversible" as const,
    operational_priority: 50,
    summary: "test blocker",
    ...overrides,
  };
}

function makeQueue(items: ReturnType<typeof makeItem>[]): OperationalQueueDoc {
  return {
    _meta: {
      schema_version: 1,
      materialized_at: "2026-05-26T00:00:00Z",
      item_count: items.length,
    },
    queue: items,
  };
}

describe("classifyRuntimeOrchestrationForOperator", () => {
  it("returns null when both inputs are null", () => {
    expect(classifyRuntimeOrchestrationForOperator(null, null)).toBeNull();
  });

  it("returns null when there are no items and no tier data", () => {
    const r = makeRoutes();
    const q = makeQueue([]);
    expect(classifyRuntimeOrchestrationForOperator(r, q)).toBeNull();
  });

  it("info severity on healthy mix", () => {
    const r = makeRoutes({ low: 20, medium: 10, high: 2 }, { autonomous: 28, owner: 4 });
    const q = makeQueue([
      makeItem({ id: "a", owner_gate: true, owner_gate_kind: "destructive" }),
      makeItem({ id: "b", owner_gate: true, owner_gate_kind: "credentials" }),
      makeItem({ id: "c", owner_gate: false }),
      makeItem({ id: "d", owner_gate: false }),
      makeItem({ id: "e", owner_gate: false }),
    ]);
    const v = classifyRuntimeOrchestrationForOperator(r, q)!;
    expect(v.severity).toBe("info");
    expect(v.tierTotal).toBe(32);
    expect(v.ownerGateCount).toBe(2);
    expect(v.ownerGateByKind).toEqual({ destructive: 1, credentials: 1 });
    expect(v.headline).toMatch(HEBREW_RE);
    expect(v.meaning).toMatch(HEBREW_RE);
    expect(v.nextAction).toMatch(HEBREW_RE);
  });

  it("watch severity when some items are unclassified (none > 0)", () => {
    const r = makeRoutes({ low: 5, medium: 3, none: 2 });
    const q = makeQueue([makeItem({ id: "a" })]);
    const v = classifyRuntimeOrchestrationForOperator(r, q)!;
    expect(v.severity).toBe("watch");
    expect(v.headline).toContain("ללא סיווג");
    expect(v.headline).toContain("2/10");
    expect(v.nextAction).toMatch(HEBREW_RE);
  });

  it("watch severity when owner share > 50%", () => {
    const r = makeRoutes({ low: 2, medium: 2 }, { autonomous: 2, owner: 3 });
    const items = [
      makeItem({ id: "a", owner_gate: true, owner_gate_kind: "product_direction" }),
      makeItem({ id: "b", owner_gate: true, owner_gate_kind: "product_direction" }),
      makeItem({ id: "c", owner_gate: true, owner_gate_kind: "destructive" }),
      makeItem({ id: "d", owner_gate: false }),
    ];
    const v = classifyRuntimeOrchestrationForOperator(r, makeQueue(items))!;
    expect(v.severity).toBe("watch");
    expect(v.ownerGateCount).toBe(3);
    expect(v.headline).toContain("3/4");
    expect(v.ownerGateByKind).toEqual({ product_direction: 2, destructive: 1 });
  });

  it("owner share watch DOES NOT fire when queue is small (<4 items)", () => {
    // Small queue (3 items, 2 owner-gated = 66%) should stay info to avoid noise.
    const r = makeRoutes({ low: 3 });
    const items = [
      makeItem({ id: "a", owner_gate: true, owner_gate_kind: "product_direction" }),
      makeItem({ id: "b", owner_gate: true, owner_gate_kind: "destructive" }),
      makeItem({ id: "c", owner_gate: false }),
    ];
    const v = classifyRuntimeOrchestrationForOperator(r, makeQueue(items))!;
    expect(v.severity).toBe("info");
  });

  it("none > 0 wins over owner-share watch (writer-gap takes precedence)", () => {
    const r = makeRoutes({ low: 1, none: 2 });
    const items = [
      makeItem({ id: "a", owner_gate: true, owner_gate_kind: "product_direction" }),
      makeItem({ id: "b", owner_gate: true, owner_gate_kind: "destructive" }),
      makeItem({ id: "c", owner_gate: true, owner_gate_kind: "credentials" }),
      makeItem({ id: "d", owner_gate: false }),
    ];
    const v = classifyRuntimeOrchestrationForOperator(r, makeQueue(items))!;
    expect(v.severity).toBe("watch");
    expect(v.headline).toContain("ללא סיווג");
  });

  it("handles missing tier distribution gracefully", () => {
    const r: QueueRoutesDoc = { _meta: { schema_version: 1 }, summary: { autonomous: 1, owner: 0, escalate: 0, defer: 0 }, routes: {} };
    const q = makeQueue([makeItem({ id: "a", owner_gate: false })]);
    const v = classifyRuntimeOrchestrationForOperator(r, q)!;
    expect(v.tierTotal).toBe(0);
    expect(v.severity).toBe("info");
  });

  it("Hebrew strings present on info severity", () => {
    const r = makeRoutes({ low: 1, high: 1, max: 1 });
    const q = makeQueue([makeItem({ id: "a" })]);
    const v = classifyRuntimeOrchestrationForOperator(r, q)!;
    expect(v.headline).toMatch(HEBREW_RE);
    expect(v.meaning).toMatch(HEBREW_RE);
    expect(v.nextAction).toMatch(HEBREW_RE);
    expect(v.headline).toContain("2 דורשים חשיבה גבוהה");
  });

  it("owner-gate kind aggregation counts duplicates", () => {
    const r = makeRoutes({ low: 5 });
    const items = [
      makeItem({ id: "a", owner_gate: true, owner_gate_kind: "product_direction" }),
      makeItem({ id: "b", owner_gate: true, owner_gate_kind: "product_direction" }),
      makeItem({ id: "c", owner_gate: true, owner_gate_kind: "product_direction" }),
      makeItem({ id: "d", owner_gate: true, owner_gate_kind: "credentials" }),
      makeItem({ id: "e", owner_gate: false }),
    ];
    const v = classifyRuntimeOrchestrationForOperator(r, makeQueue(items))!;
    expect(v.ownerGateByKind).toEqual({ product_direction: 3, credentials: 1 });
  });

  it("missing owner_gate_kind is bucketed as unspecified", () => {
    const r = makeRoutes({ low: 2 });
    const items = [
      makeItem({ id: "a", owner_gate: true, owner_gate_kind: null }),
      makeItem({ id: "b", owner_gate: true }),
    ];
    const v = classifyRuntimeOrchestrationForOperator(r, makeQueue(items))!;
    expect(v.ownerGateByKind).toEqual({ unspecified: 2 });
  });
});
