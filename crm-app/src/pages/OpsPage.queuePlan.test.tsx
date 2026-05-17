import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  OperationalQueueCard,
  type OperationalQueueDoc,
  type OperationalQueueItem,
  type QueueReceipt,
  type QueueReceiptDoc,
} from "./OpsPage";

function makeItem(over: Partial<OperationalQueueItem> & { id: string }): OperationalQueueItem {
  return {
    id: over.id,
    type: over.type ?? "runtime_issue",
    severity: over.severity ?? "medium",
    lane: over.lane ?? null,
    source: over.source ?? { producer: "runtime-issues.json", ref: over.id, url: null },
    created_at: over.created_at ?? "2026-05-17T00:00:00Z",
    freshness: over.freshness ?? "fresh",
    retryable: over.retryable ?? false,
    owner_gate: over.owner_gate ?? false,
    owner_gate_kind: over.owner_gate_kind ?? null,
    continuation_candidate: over.continuation_candidate ?? false,
    blocker_type: over.blocker_type ?? null,
    suggested_action: over.suggested_action ?? "",
    assigned_agent: over.assigned_agent ?? null,
    session_reference: over.session_reference ?? null,
    repo_path: over.repo_path ?? null,
    reversibility: over.reversibility ?? "reversible",
    operational_priority: over.operational_priority ?? 50,
    summary: over.summary ?? `summary-${over.id}`,
  };
}

function planned(item_id: string): QueueReceipt {
  return {
    id: `${item_id}@0`,
    item_id,
    outcome: "planned",
    retry_count: 0,
    dry_run: true,
    started_at: null,
    finished_at: null,
  };
}

function receipt(item_id: string, outcome: QueueReceipt["outcome"], retry_count = 0): QueueReceipt {
  return {
    id: `${item_id}@${retry_count}`,
    item_id,
    outcome,
    retry_count,
    dry_run: false,
    started_at: "2026-05-17T00:00:00Z",
    finished_at: "2026-05-17T00:01:00Z",
  };
}

const baseDoc: OperationalQueueDoc = {
  queue: [
    makeItem({ id: "a", summary: "item-a" }),
    makeItem({ id: "b", summary: "item-b" }),
    makeItem({ id: "c", summary: "item-c" }),
  ],
};

describe("OperationalQueueCard — plan & receipt visibility", () => {
  it("renders identically (no plan/receipt chrome) when both projections are missing", () => {
    render(<OperationalQueueCard doc={baseDoc} />);
    expect(screen.queryByText(/מתוכנן/)).toBeNull();
    expect(screen.queryByText(/הצליחו/)).toBeNull();
    expect(screen.queryByText(/נכשלו/)).toBeNull();
    expect(screen.queryByText(/מקסימום ניסיונות/)).toBeNull();
  });

  it("shows planned count in the header when queue_plan.json has planned receipts", () => {
    const plan: QueueReceiptDoc = { receipts: [planned("a"), planned("b")] };
    render(<OperationalQueueCard doc={baseDoc} plan={plan} />);
    // Header chip — count of distinct planned items.
    expect(screen.getByText(/מתוכנן 2/)).toBeTruthy();
    // Per-row indicator (label appears 2× — one per planned item).
    const rowChips = screen.getAllByText("מתוכנן");
    expect(rowChips.length).toBe(2);
  });

  it("shows execution-status counts when queue_receipts.json has outcomes", () => {
    const receipts: QueueReceiptDoc = {
      receipts: [
        receipt("a", "succeeded"),
        receipt("b", "failed", 1),
        receipt("c", "aborted"),
      ],
    };
    render(<OperationalQueueCard doc={baseDoc} receipts={receipts} />);
    expect(screen.getByText(/הצליחו 1/)).toBeTruthy();
    expect(screen.getByText(/נכשלו 1/)).toBeTruthy();
    expect(screen.getByText(/חסומים 1/)).toBeTruthy();
    // Per-row status indicators.
    expect(screen.getByText("הצליח")).toBeTruthy();
    expect(screen.getByText("נכשל")).toBeTruthy();
    expect(screen.getByText("חסום")).toBeTruthy();
  });

  it("surfaces a 'max retries' indicator for items with failed retry_count >= 3", () => {
    const receipts: QueueReceiptDoc = {
      receipts: [
        receipt("a", "failed", 1),
        receipt("a", "failed", 3),
        receipt("b", "succeeded"),
      ],
    };
    render(<OperationalQueueCard doc={baseDoc} receipts={receipts} />);
    expect(screen.getByText("מקסימום ניסיונות")).toBeTruthy();
  });

  it("suppresses the per-row planned chip when an execution receipt has already landed", () => {
    // If an item has both a planned and an execution receipt, the executed
    // status wins on the row (the planned chip would be stale).
    const plan: QueueReceiptDoc = { receipts: [planned("a")] };
    const receipts: QueueReceiptDoc = { receipts: [receipt("a", "succeeded")] };
    render(<OperationalQueueCard doc={baseDoc} plan={plan} receipts={receipts} />);
    expect(screen.getByText("הצליח")).toBeTruthy();
    // The label "מתוכנן" still appears in the HEADER chip (count of planned),
    // but should NOT appear as a row chip for item "a".
    const headerCount = screen.getByText(/מתוכנן 1/);
    expect(headerCount).toBeTruthy();
    // Only one "מתוכנן" element — the header — and no row-level one.
    const allPlannedTexts = screen.getAllByText(/מתוכנן/);
    expect(allPlannedTexts.length).toBe(1);
  });

  it("treats a bare-array receipt envelope the same as {receipts:[...]}", () => {
    const receipts: QueueReceiptDoc = [receipt("a", "succeeded")];
    render(<OperationalQueueCard doc={baseDoc} receipts={receipts} />);
    expect(screen.getByText(/הצליחו 1/)).toBeTruthy();
  });

  it("ignores malformed plan/receipt docs without erroring", () => {
    const bogus = { receipts: "not-an-array" } as unknown as QueueReceiptDoc;
    render(<OperationalQueueCard doc={baseDoc} plan={bogus} receipts={bogus} />);
    expect(screen.queryByText(/מתוכנן/)).toBeNull();
    expect(screen.queryByText(/הצליחו/)).toBeNull();
  });
});
