import { describe, it, expect } from "vitest";
import { findQueueItem, resolveQueueItemCampaign } from "./OpsQueueItemPage";
import type { CampaignsDoc, GoalsDoc, OperationalQueueDoc } from "./OpsPage";

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

describe("resolveQueueItemCampaign", () => {
  const campaignsDoc: CampaignsDoc = {
    campaigns: [{ id: "crm-lite-a4", owner_user: "devuserp", status: "SHIPPED" }],
  };
  const goalsDoc: GoalsDoc = {
    campaigns: { "crm-lite-a4": { goal: "ship the rabbi daily agenda" } },
  };

  it("returns null when the item carries no campaign_id", () => {
    expect(resolveQueueItemCampaign(null, campaignsDoc, goalsDoc)).toBeNull();
    expect(resolveQueueItemCampaign(undefined, campaignsDoc, goalsDoc)).toBeNull();
  });

  it("resolves the campaign + authored goal when both feeds carry it", () => {
    const ctx = resolveQueueItemCampaign("crm-lite-a4", campaignsDoc, goalsDoc);
    expect(ctx?.id).toBe("crm-lite-a4");
    expect(ctx?.campaign).toEqual({ id: "crm-lite-a4", owner_user: "devuserp", status: "SHIPPED" });
    expect(ctx?.goalChain?.goal).toBe("ship the rabbi daily agenda");
  });

  it("safe fallback: campaign=null + goalChain=null when id absent from feeds (no broken link)", () => {
    const ctx = resolveQueueItemCampaign("mayenotecha", campaignsDoc, goalsDoc);
    expect(ctx).not.toBeNull();
    expect(ctx?.id).toBe("mayenotecha");
    expect(ctx?.campaign).toBeNull();
    expect(ctx?.goalChain).toBeNull();
  });

  it("is null-safe for null campaigns/goals docs (id preserved, no goal)", () => {
    const ctx = resolveQueueItemCampaign("crm-lite-a4", null, null);
    expect(ctx).toEqual({ id: "crm-lite-a4", campaign: null, goalChain: null });
  });
});
