import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AttentionQueueCard } from "../dashboard/AttentionQueueCard";
import type {
  AttentionItem,
  AttentionStatus,
} from "../../data/amutaAttention";

function makeItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: "att-test-1",
    title: "פריט לדוגמה",
    owner: "elron",
    urgency: "normal",
    status: "open",
    domain: "people",
    next_action: "לבצע פעולה",
    ...overrides,
  };
}

function renderCard(item: AttentionItem) {
  return render(
    <MemoryRouter>
      <ul>
        <AttentionQueueCard item={item} />
      </ul>
    </MemoryRouter>,
  );
}

describe("AttentionQueueCard status pill", () => {
  it("renders no status pill for 'open' items (default actionable state)", () => {
    renderCard(makeItem({ status: "open" }));
    expect(screen.queryByTestId("attention-status-blocked")).toBeNull();
    expect(screen.queryByTestId("attention-status-waiting")).toBeNull();
    expect(screen.queryByTestId("attention-status-stale")).toBeNull();
  });

  it("renders 'חסום' pill for blocked items", () => {
    renderCard(makeItem({ status: "blocked" }));
    const pill = screen.getByTestId("attention-status-blocked");
    expect(pill.textContent).toBe("חסום");
    expect(pill.getAttribute("title")).toContain("חסום");
    expect(pill.getAttribute("aria-label")).toContain("חסום");
  });

  it("renders 'ממתין' pill for waiting items", () => {
    renderCard(makeItem({ status: "waiting" }));
    const pill = screen.getByTestId("attention-status-waiting");
    expect(pill.textContent).toBe("ממתין");
    expect(pill.getAttribute("title")).toContain("גורם חיצוני");
  });

  it("renders 'ישן' pill for stale items", () => {
    renderCard(makeItem({ status: "stale" }));
    const pill = screen.getByTestId("attention-status-stale");
    expect(pill.textContent).toBe("ישן");
    expect(pill.getAttribute("title")).toContain("זמן רב");
  });

  it("does not render any status pill for 'done' items", () => {
    // 'done' items are filtered out of buckets upstream, but the card
    // should still render gracefully without a status pill if one slips through.
    renderCard(makeItem({ status: "done" }));
    expect(screen.queryByTestId("attention-status-blocked")).toBeNull();
    expect(screen.queryByTestId("attention-status-waiting")).toBeNull();
    expect(screen.queryByTestId("attention-status-stale")).toBeNull();
  });

  it("keeps urgency label rendered alongside the status pill", () => {
    renderCard(
      makeItem({ status: "blocked", urgency: "critical" }),
    );
    expect(screen.getByTestId("attention-status-blocked")).toBeTruthy();
    expect(screen.getByText("דחוף מאוד")).toBeTruthy();
  });

  it("renders all distinguishable statuses with distinct Hebrew labels", () => {
    // Sanity guard: if someone collapses two statuses to the same copy,
    // operator can no longer distinguish them at a glance.
    const labels = new Set<string>();
    const statuses: AttentionStatus[] = ["blocked", "waiting", "stale"];
    for (const status of statuses) {
      const { unmount } = renderCard(makeItem({ status }));
      const pill = screen.getByTestId(`attention-status-${status}`);
      labels.add(pill.textContent ?? "");
      unmount();
    }
    expect(labels.size).toBe(statuses.length);
  });
});
