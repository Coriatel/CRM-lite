import { describe, it, expect } from "vitest";
import { render as rtlRender, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  OperationalQueueCard,
  OWNER_COLLAPSE_THRESHOLD,
  type OperationalQueueDoc,
  type OperationalQueueItem,
} from "./OpsPage";

const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

function makeItem(over: Partial<OperationalQueueItem> & { id: string }): OperationalQueueItem {
  return {
    id: over.id,
    type: over.type ?? "blocker",
    severity: over.severity ?? "medium",
    lane: over.lane ?? null,
    source: over.source ?? { producer: "blockers.json", ref: over.id, url: null },
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

function docWithOwner(count: number, actionableCount = 1): OperationalQueueDoc {
  const queue: OperationalQueueItem[] = [];
  for (let i = 0; i < actionableCount; i++) {
    queue.push(makeItem({ id: `auto-${i}`, owner_gate: false, summary: `auto ${i}` }));
  }
  for (let i = 0; i < count; i++) {
    queue.push(
      makeItem({
        id: `owner-${i}`,
        owner_gate: true,
        owner_gate_kind: "product_direction",
        summary: `owner-gated item ${i}`,
      }),
    );
  }
  return { queue };
}

describe("OperationalQueueCard owner-gated collapse", () => {
  it("renders all owner items when count <= threshold (no toggle)", () => {
    const doc = docWithOwner(OWNER_COLLAPSE_THRESHOLD);
    render(<OperationalQueueCard doc={doc} />);
    for (let i = 0; i < OWNER_COLLAPSE_THRESHOLD; i++) {
      expect(screen.getByText(`owner-gated item ${i}`)).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: /הצג הכל/ })).toBeNull();
  });

  it("collapses owner-gated list by default when count > threshold", () => {
    const doc = docWithOwner(OWNER_COLLAPSE_THRESHOLD + 3);
    render(<OperationalQueueCard doc={doc} />);
    const list = document.getElementById("ops-owner-gated-list");
    expect(list).toBeTruthy();
    const items = within(list as HTMLElement).getAllByRole("listitem");
    expect(items).toHaveLength(OWNER_COLLAPSE_THRESHOLD);
    const toggle = screen.getByRole("button", { name: /הצג הכל/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText(/\+ 3 מוסתרים/)).toBeTruthy();
  });

  it("keeps autonomous (actionable) items always visible regardless of collapse", () => {
    const doc = docWithOwner(OWNER_COLLAPSE_THRESHOLD + 10, 2);
    render(<OperationalQueueCard doc={doc} />);
    expect(screen.getByText("auto 0")).toBeTruthy();
    expect(screen.getByText("auto 1")).toBeTruthy();
  });

  it("expanding the toggle reveals hidden owner-gated items", () => {
    const doc = docWithOwner(OWNER_COLLAPSE_THRESHOLD + 3);
    render(<OperationalQueueCard doc={doc} />);
    fireEvent.click(screen.getByRole("button", { name: /הצג הכל/ }));
    const list = document.getElementById("ops-owner-gated-list");
    const items = within(list as HTMLElement).getAllByRole("listitem");
    expect(items).toHaveLength(OWNER_COLLAPSE_THRESHOLD + 3);
    const toggle = screen.getByRole("button", { name: /כווץ/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByText(/מוסתרים/)).toBeNull();
  });
});
