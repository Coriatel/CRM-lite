import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AttentionQueueCard } from "../dashboard/AttentionQueueCard";
import type {
  AttentionDomain,
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

describe("AttentionQueueCard domain icon", () => {
  const DOMAINS: AttentionDomain[] = [
    "people",
    "lessons",
    "tasks",
    "content",
    "finance",
    "automation",
    "runtime",
  ];

  it("renders a domain icon for every supported AttentionDomain value", () => {
    for (const domain of DOMAINS) {
      const { unmount } = renderCard(makeItem({ domain }));
      expect(screen.getByTestId(`attention-domain-${domain}`)).toBeTruthy();
      unmount();
    }
  });

  it("uses a distinct icon SVG per domain (operator can distinguish at a glance)", () => {
    // Render each domain card, snapshot its SVG `d` attribute(s), then check
    // that no two domains produced the same icon path. We do not assert
    // *which* icon — only that the mapping is one-to-one.
    const paths = new Map<AttentionDomain, string>();
    for (const domain of DOMAINS) {
      const { unmount } = renderCard(makeItem({ domain }));
      const wrapper = screen.getByTestId(`attention-domain-${domain}`);
      const svgD = Array.from(wrapper.querySelectorAll("path,line,circle,rect,polyline,polygon"))
        .map((el) => `${el.tagName}:${el.outerHTML}`)
        .join("|");
      paths.set(domain, svgD);
      unmount();
    }
    const uniquePaths = new Set(paths.values());
    expect(uniquePaths.size).toBe(DOMAINS.length);
  });

  it("annotates the icon with a Hebrew title and aria-label naming the domain", () => {
    renderCard(makeItem({ domain: "people" }));
    const wrapper = screen.getByTestId("attention-domain-people");
    expect(wrapper.getAttribute("title")).toContain("אנשים");
    expect(wrapper.getAttribute("aria-label")).toContain("אנשים");
  });

  it("renders the icon as a subtle supporting element (color-text-secondary)", () => {
    renderCard(makeItem({ domain: "finance" }));
    const wrapper = screen.getByTestId("attention-domain-finance");
    expect(wrapper.getAttribute("style") ?? "").toContain("--color-text-secondary");
  });
});
