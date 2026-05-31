import { describe, it, expect } from "vitest";
import { findQueueItem } from "./OpsQueueItemPage";
import type { OperationalQueueDoc } from "./OpsPage";

const doc: OperationalQueueDoc = {
  queue: [
    {
      id: "q1",
      type: "blocker",
      severity: "high",
      lane: "lane-a",
      source: { producer: "p", ref: "r", url: "https://x" },
      created_at: "2026-05-31T00:00:00Z",
      freshness: "fresh",
      retryable: true,
      owner_gate: true,
      owner_gate_kind: "product_direction",
      continuation_candidate: false,
      suggested_action: "do the thing",
      reversibility: "reversible",
      operational_priority: 3,
      summary: "a blocked thing",
    },
  ],
};

describe("findQueueItem", () => {
  it("locates an item by id from the queue feed", () => {
    expect(findQueueItem(doc, "q1")?.summary).toBe("a blocked thing");
  });
  it("returns null for unknown id or null doc", () => {
    expect(findQueueItem(doc, "nope")).toBeNull();
    expect(findQueueItem(null, "q1")).toBeNull();
  });
});
