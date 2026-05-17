import { describe, it, expect } from "vitest";
import {
  operationalQueueGroups,
  severityFromQueue,
  type OperationalQueueDoc,
  type OperationalQueueItem,
} from "./OpsPage";

function makeItem(over: Partial<OperationalQueueItem>): OperationalQueueItem {
  return {
    id: over.id ?? "runtime_issue:x",
    type: over.type ?? "runtime_issue",
    severity: over.severity ?? "medium",
    lane: over.lane ?? null,
    source: over.source ?? { producer: "runtime-issues.json", ref: "x", url: null },
    created_at: over.created_at ?? "2026-05-17T00:00:00Z",
    freshness: over.freshness ?? "fresh",
    retryable: over.retryable ?? false,
    owner_gate: over.owner_gate ?? false,
    owner_gate_kind: over.owner_gate_kind ?? null,
    continuation_candidate: over.continuation_candidate ?? true,
    blocker_type: over.blocker_type ?? null,
    suggested_action: over.suggested_action ?? "",
    assigned_agent: over.assigned_agent ?? null,
    session_reference: over.session_reference ?? null,
    repo_path: over.repo_path ?? null,
    reversibility: over.reversibility ?? "reversible",
    operational_priority: over.operational_priority ?? 50,
    summary: over.summary ?? "x",
  };
}

describe("severityFromQueue", () => {
  it("collapses critical → high and info → low", () => {
    expect(severityFromQueue("critical")).toBe("high");
    expect(severityFromQueue("high")).toBe("high");
    expect(severityFromQueue("medium")).toBe("medium");
    expect(severityFromQueue("low")).toBe("low");
    expect(severityFromQueue("info")).toBe("low");
  });
});

describe("operationalQueueGroups", () => {
  it("returns empty groups for null / no queue", () => {
    expect(operationalQueueGroups(null)).toEqual({
      actionable: [],
      awaitingOwner: [],
      total: 0,
    });
    expect(operationalQueueGroups({})).toEqual({
      actionable: [],
      awaitingOwner: [],
      total: 0,
    });
  });

  it("splits owner_gate=true into awaitingOwner, rest into actionable", () => {
    const doc: OperationalQueueDoc = {
      queue: [
        makeItem({ id: "a", owner_gate: false }),
        makeItem({ id: "b", owner_gate: true, owner_gate_kind: "product_direction" }),
        makeItem({ id: "c", owner_gate: false }),
      ],
    };
    const g = operationalQueueGroups(doc);
    expect(g.total).toBe(3);
    expect(g.actionable.map((i) => i.id).sort()).toEqual(["a", "c"]);
    expect(g.awaitingOwner.map((i) => i.id)).toEqual(["b"]);
  });

  it("within a group, sorts by priority desc then by id asc", () => {
    const doc: OperationalQueueDoc = {
      queue: [
        makeItem({ id: "low-z", operational_priority: 20 }),
        makeItem({ id: "high-a", operational_priority: 80 }),
        makeItem({ id: "high-b", operational_priority: 80 }),
        makeItem({ id: "mid", operational_priority: 50 }),
      ],
    };
    const g = operationalQueueGroups(doc);
    expect(g.actionable.map((i) => i.id)).toEqual([
      "high-a",
      "high-b",
      "mid",
      "low-z",
    ]);
  });

  it("drops stale items below fresh items within the same group", () => {
    const doc: OperationalQueueDoc = {
      queue: [
        makeItem({ id: "stale-high", operational_priority: 90, freshness: "stale" }),
        makeItem({ id: "fresh-low", operational_priority: 30, freshness: "fresh" }),
      ],
    };
    const g = operationalQueueGroups(doc);
    expect(g.actionable.map((i) => i.id)).toEqual(["fresh-low", "stale-high"]);
  });

  it("does not mutate the input array", () => {
    const items = [
      makeItem({ id: "a", operational_priority: 10 }),
      makeItem({ id: "b", operational_priority: 99 }),
    ];
    const doc: OperationalQueueDoc = { queue: items };
    operationalQueueGroups(doc);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
