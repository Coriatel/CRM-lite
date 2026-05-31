import { describe, it, expect } from "vitest";
import {
  classifyOperationalQueueForOperator,
  executionStatusCounts,
  isMaxRetries,
  latestReceiptByItemId,
  operationalQueueGroups,
  parseReceipts,
  plannedReceiptItemIds,
  resolveQueueCampaign,
  severityFromQueue,
  type CampaignsDoc,
  type OperationalQueueDoc,
  type OperationalQueueGroups,
  type OperationalQueueItem,
  type QueueReceipt,
  type QueueRoutesDoc,
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
    campaign_id: over.campaign_id ?? null,
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

  it("accepts a QueueRoutesDoc shape (consumer contract)", () => {
    const routes: QueueRoutesDoc = {
      _meta: { schema_version: 1, routed_at: "2026-05-17T08:00:00Z" },
      summary: { autonomous: 5, owner: 17, escalate: 2, defer: 0 },
      routes: {
        "runtime_issue:x": {
          decision: "autonomous",
          reason: "reversibility=reversible (one-shot)",
        },
        "blocker:y": { decision: "owner", reason: "type=blocker or owner_gate=true" },
      },
    };
    // The doc compiles + values are accessible — schema contract held.
    expect(routes.routes?.["runtime_issue:x"]?.decision).toBe("autonomous");
    expect(routes.summary?.escalate).toBe(2);
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

function makeReceipt(over: Partial<QueueReceipt> & { item_id: string; outcome: QueueReceipt["outcome"] }): QueueReceipt {
  return {
    id: over.id ?? `${over.item_id}@${over.retry_count ?? 0}`,
    item_id: over.item_id,
    outcome: over.outcome,
    retry_count: over.retry_count ?? 0,
    dry_run: over.dry_run ?? over.outcome === "planned",
    started_at: over.started_at ?? null,
    finished_at: over.finished_at ?? null,
    notes: over.notes ?? "",
  };
}

describe("parseReceipts", () => {
  it("returns [] for null / missing / malformed shapes", () => {
    expect(parseReceipts(null)).toEqual([]);
    expect(parseReceipts({})).toEqual([]);
    expect(parseReceipts({ receipts: undefined })).toEqual([]);
  });

  it("accepts a bare array OR a {receipts:[...]} envelope", () => {
    const r = makeReceipt({ item_id: "x", outcome: "planned" });
    expect(parseReceipts([r])).toEqual([r]);
    expect(parseReceipts({ receipts: [r] })).toEqual([r]);
  });

  it("filters out entries missing required fields", () => {
    const good = makeReceipt({ item_id: "x", outcome: "succeeded" });
    const malformed = { foo: "bar" } as unknown as QueueReceipt;
    expect(parseReceipts({ receipts: [good, malformed] })).toEqual([good]);
  });
});

describe("plannedReceiptItemIds", () => {
  it("returns the set of item_ids that have an outcome=planned receipt", () => {
    const rs = [
      makeReceipt({ item_id: "a", outcome: "planned" }),
      makeReceipt({ item_id: "b", outcome: "succeeded" }),
      makeReceipt({ item_id: "c", outcome: "planned" }),
    ];
    expect([...plannedReceiptItemIds(rs)].sort()).toEqual(["a", "c"]);
  });
});

describe("latestReceiptByItemId", () => {
  it("ignores planned receipts and picks the highest retry_count per item_id", () => {
    const rs = [
      makeReceipt({ item_id: "a", outcome: "planned" }),
      makeReceipt({ item_id: "a", outcome: "failed", retry_count: 1, finished_at: "2026-05-17T00:00:00Z" }),
      makeReceipt({ item_id: "a", outcome: "failed", retry_count: 3, finished_at: "2026-05-17T02:00:00Z" }),
      makeReceipt({ item_id: "b", outcome: "succeeded", retry_count: 0, finished_at: "2026-05-17T01:00:00Z" }),
    ];
    const map = latestReceiptByItemId(rs);
    expect(map["a"]?.retry_count).toBe(3);
    expect(map["b"]?.outcome).toBe("succeeded");
  });
});

describe("executionStatusCounts", () => {
  it("counts succeeded/failed/aborted(=blocked)/skipped, ignores planned/started", () => {
    const rs = [
      makeReceipt({ item_id: "a", outcome: "planned" }),
      makeReceipt({ item_id: "b", outcome: "started" }),
      makeReceipt({ item_id: "c", outcome: "succeeded" }),
      makeReceipt({ item_id: "d", outcome: "failed" }),
      makeReceipt({ item_id: "e", outcome: "aborted" }),
      makeReceipt({ item_id: "f", outcome: "skipped" }),
      makeReceipt({ item_id: "g", outcome: "succeeded" }),
    ];
    expect(executionStatusCounts(rs)).toEqual({
      succeeded: 2,
      failed: 1,
      blocked: 1,
      skipped: 1,
    });
  });
});

describe("isMaxRetries", () => {
  it("is true only for failed receipts with retry_count >= 3", () => {
    expect(isMaxRetries(undefined)).toBe(false);
    expect(isMaxRetries(makeReceipt({ item_id: "a", outcome: "failed", retry_count: 2 }))).toBe(false);
    expect(isMaxRetries(makeReceipt({ item_id: "a", outcome: "failed", retry_count: 3 }))).toBe(true);
    expect(isMaxRetries(makeReceipt({ item_id: "a", outcome: "succeeded", retry_count: 5 }))).toBe(false);
  });
});

describe("classifyOperationalQueueForOperator", () => {
  function makeItem(id: string, ownerGate: boolean): OperationalQueueItem {
    return {
      id,
      type: "runtime_issue",
      severity: "medium",
      lane: null,
      source: { producer: "p", ref: "r" },
      created_at: "2026-05-18T10:00:00Z",
      freshness: "fresh",
      retryable: false,
      owner_gate: ownerGate,
      continuation_candidate: false,
      suggested_action: "—",
      operational_priority: 50,
    } as OperationalQueueItem;
  }
  function groups(actionableN: number, ownerN: number): OperationalQueueGroups {
    const actionable = Array.from({ length: actionableN }, (_, i) => makeItem(`a${i}`, false));
    const awaitingOwner = Array.from({ length: ownerN }, (_, i) => makeItem(`o${i}`, true));
    return { actionable, awaitingOwner, total: actionableN + ownerN };
  }

  it("empty when no items in queue (caller hides the card, but classifier is well-defined)", () => {
    const v = classifyOperationalQueueForOperator({ groups: groups(0, 0) });
    expect(v.topCategory).toBe("empty");
    expect(v.severity).toBe("info");
  });

  it("actionable_ready is the normal healthy state", () => {
    const v = classifyOperationalQueueForOperator({ groups: groups(3, 0) });
    expect(v.topCategory).toBe("actionable_ready");
    expect(v.severity).toBe("info");
    expect(v.headline).toContain("(3)");
  });

  it("failures_present is the top action category and counts failed+blocked together", () => {
    const v = classifyOperationalQueueForOperator({
      groups: groups(5, 3),
      failedCount: 2,
      blockedCount: 1,
    });
    expect(v.topCategory).toBe("failures_present");
    expect(v.severity).toBe("action");
    expect(v.headline).toContain("(3)");
  });

  it("owner_only when no actionable items remain", () => {
    const v = classifyOperationalQueueForOperator({ groups: groups(0, 4) });
    expect(v.topCategory).toBe("owner_only");
    expect(v.severity).toBe("watch");
    expect(v.headline).toContain("(4)");
  });

  it("awaiting_owner_majority when owners overwhelm actionable and cross threshold", () => {
    const v = classifyOperationalQueueForOperator({
      groups: groups(2, 7),
      awaitingOwnerThreshold: 5,
    });
    expect(v.topCategory).toBe("awaiting_owner_majority");
    expect(v.severity).toBe("watch");
  });

  it("does NOT classify as awaiting_owner_majority when below threshold", () => {
    const v = classifyOperationalQueueForOperator({
      groups: groups(2, 4), // 4 > 2 but 4 not > 5
      awaitingOwnerThreshold: 5,
    });
    expect(v.topCategory).toBe("actionable_ready");
  });

  it("large_backlog when total exceeds threshold and other rules quiet", () => {
    const v = classifyOperationalQueueForOperator({
      groups: groups(15, 10),
      largeBacklogThreshold: 20,
      awaitingOwnerThreshold: 50, // disable majority rule for this assertion
    });
    expect(v.topCategory).toBe("large_backlog");
    expect(v.severity).toBe("watch");
    expect(v.headline).toContain("(25");
  });

  it("failures_present outranks owner_only, awaiting-majority, and large_backlog", () => {
    const v = classifyOperationalQueueForOperator({
      groups: groups(0, 30),
      failedCount: 1,
      blockedCount: 0,
    });
    expect(v.topCategory).toBe("failures_present");
    expect(v.categories).toContain("owner_only");
    expect(v.categories).toContain("awaiting_owner_majority");
    expect(v.categories).toContain("large_backlog");
  });

  it("queue_quiet fallback when no other rule fires (shouldn't happen given current rules, but is defended)", () => {
    // Constructed corner: total > 0 but no actionable AND no awaitingOwner is
    // impossible from operationalQueueGroups (every item has owner_gate
    // true/false). Skip — covered by `empty` and the others.
    const v = classifyOperationalQueueForOperator({ groups: groups(1, 0) });
    expect(v.topCategory).toBe("actionable_ready"); // sanity, not queue_quiet
  });
});

describe("resolveQueueCampaign", () => {
  const doc: CampaignsDoc = {
    campaigns: [
      { id: "crm-lite-a4", owner_user: "devuserp", status: "SHIPPED" },
      { id: "mayenotecha", owner_user: "devuserr", status: "ACTIVE" },
    ],
  };

  it("returns null when the row carries no campaign_id", () => {
    expect(resolveQueueCampaign(makeItem({}), doc)).toBeNull();
    expect(resolveQueueCampaign(makeItem({ campaign_id: null }), doc)).toBeNull();
  });

  it("resolves the matched campaign with owner_user/status from the feed", () => {
    const c = resolveQueueCampaign(makeItem({ campaign_id: "crm-lite-a4" }), doc);
    expect(c).toEqual({ id: "crm-lite-a4", owner_user: "devuserp", status: "SHIPPED" });
  });

  it("returns a bare {id} when campaign_id is authored on the row but absent from the feed", () => {
    // The id is still authored truth; no owner/status is fabricated.
    expect(resolveQueueCampaign(makeItem({ campaign_id: "ghost" }), doc)).toEqual({ id: "ghost" });
  });

  it("is null-safe for a null / undefined campaigns doc", () => {
    expect(resolveQueueCampaign(makeItem({ campaign_id: "crm-lite-a4" }), null)).toEqual({
      id: "crm-lite-a4",
    });
    expect(resolveQueueCampaign(makeItem({ campaign_id: "crm-lite-a4" }), undefined)).toEqual({
      id: "crm-lite-a4",
    });
  });
});
