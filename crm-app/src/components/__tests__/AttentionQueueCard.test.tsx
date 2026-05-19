import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AttentionQueueCard } from "../dashboard/AttentionQueueCard";
import type {
  AttentionDomain,
  AttentionItem,
  AttentionStatus,
  AttentionUrgency,
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

describe("AttentionQueueCard urgency-label tooltip", () => {
  const URGENCIES: AttentionUrgency[] = ["critical", "high", "normal", "low"];

  it("annotates every urgency label with a Hebrew title and matching aria-label", () => {
    for (const urgency of URGENCIES) {
      const { unmount } = renderCard(makeItem({ urgency }));
      const label = screen.getByTestId(`attention-urgency-${urgency}`);
      const title = label.getAttribute("title");
      const aria = label.getAttribute("aria-label");
      expect(title).toBeTruthy();
      expect(aria).toBe(title);
      expect(title!.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("uses a distinct tooltip per urgency level (operator can tell them apart)", () => {
    const titles = new Set<string>();
    for (const urgency of URGENCIES) {
      const { unmount } = renderCard(makeItem({ urgency }));
      const label = screen.getByTestId(`attention-urgency-${urgency}`);
      titles.add(label.getAttribute("title") ?? "");
      unmount();
    }
    expect(titles.size).toBe(URGENCIES.length);
  });

  it("keeps the visible urgency text unchanged by the tooltip addition", () => {
    const expected: Record<AttentionUrgency, string> = {
      critical: "דחוף מאוד",
      high: "דחוף",
      normal: "רגיל",
      low: "נמוך",
    };
    for (const urgency of URGENCIES) {
      const { unmount } = renderCard(makeItem({ urgency }));
      const label = screen.getByTestId(`attention-urgency-${urgency}`);
      expect(label.textContent).toBe(expected[urgency]);
      unmount();
    }
  });

  it("describes operational meaning, not just restating the label", () => {
    // Sanity guard against future regressions like setting title=label.
    // The tooltip is supposed to add information, not echo what's visible.
    for (const urgency of URGENCIES) {
      const { unmount } = renderCard(makeItem({ urgency }));
      const label = screen.getByTestId(`attention-urgency-${urgency}`);
      const title = label.getAttribute("title") ?? "";
      const text = label.textContent ?? "";
      expect(title).not.toBe(text);
      expect(title.length).toBeGreaterThan(text.length);
      unmount();
    }
  });
});

describe("AttentionQueueCard last-activity indicator", () => {
  it("renders a relative-time indicator when context.last_call_date exists", () => {
    const iso = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
    renderCard(makeItem({ context: { last_call_date: iso } }));
    const el = screen.getByTestId("attention-last-activity");
    expect(el).toBeTruthy();
    // Text contains a Hebrew relative-time string ("לפני ... " or "אתמול"
    // depending on the unit). Don't pin the exact form; just confirm Hebrew
    // content was produced rather than an empty span.
    expect((el.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("does not render the indicator when context is missing entirely", () => {
    renderCard(makeItem({ context: undefined }));
    expect(screen.queryByTestId("attention-last-activity")).toBeNull();
  });

  it("does not render the indicator when last_call_date is absent", () => {
    renderCard(makeItem({ context: { why_now: "x" } }));
    expect(screen.queryByTestId("attention-last-activity")).toBeNull();
  });

  it("does not render the indicator for an unparseable last_call_date", () => {
    renderCard(makeItem({ context: { last_call_date: "not-a-date" } }));
    expect(screen.queryByTestId("attention-last-activity")).toBeNull();
  });

  it("exposes the raw date in the title attribute for full-context hover", () => {
    const iso = "2026-04-12";
    renderCard(makeItem({ context: { last_call_date: iso } }));
    const el = screen.getByTestId("attention-last-activity");
    const title = el.getAttribute("title") ?? "";
    expect(title).toContain(iso);
    expect(title).toContain("שיחה אחרונה");
  });

  it("uses a subtle supporting color (color-text-secondary), not urgency or status color", () => {
    const iso = new Date().toISOString().slice(0, 10);
    renderCard(makeItem({ context: { last_call_date: iso } }));
    const el = screen.getByTestId("attention-last-activity");
    const style = el.getAttribute("style") ?? "";
    expect(style).toContain("--color-text-secondary");
  });
});

describe("AttentionQueueCard follow-up indicator", () => {
  it("renders a relative-time indicator for a future follow_up_date", () => {
    const iso = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
    renderCard(makeItem({ context: { follow_up_date: iso } }));
    const el = screen.getByTestId("attention-follow-up");
    expect(el).toBeTruthy();
    expect((el.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("does not render the indicator when context is missing entirely", () => {
    renderCard(makeItem({ context: undefined }));
    expect(screen.queryByTestId("attention-follow-up")).toBeNull();
  });

  it("does not render the indicator when follow_up_date is absent", () => {
    renderCard(makeItem({ context: { why_now: "x" } }));
    expect(screen.queryByTestId("attention-follow-up")).toBeNull();
  });

  it("does not render the indicator for an unparseable follow_up_date", () => {
    renderCard(makeItem({ context: { follow_up_date: "not-a-date" } }));
    expect(screen.queryByTestId("attention-follow-up")).toBeNull();
  });

  it("exposes the raw date in the title attribute with the יעד מעקב label", () => {
    const iso = "2026-06-30";
    renderCard(makeItem({ context: { follow_up_date: iso } }));
    const el = screen.getByTestId("attention-follow-up");
    const title = el.getAttribute("title") ?? "";
    expect(title).toContain(iso);
    expect(title).toContain("יעד מעקב");
  });

  it("renders alongside last-activity when both dates are present (time-axis pair)", () => {
    const past = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
    const future = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    renderCard(
      makeItem({ context: { last_call_date: past, follow_up_date: future } }),
    );
    expect(screen.getByTestId("attention-last-activity")).toBeTruthy();
    expect(screen.getByTestId("attention-follow-up")).toBeTruthy();
  });

  it("uses a subtle supporting color (color-text-secondary), not a warning color", () => {
    const iso = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    renderCard(makeItem({ context: { follow_up_date: iso } }));
    const el = screen.getByTestId("attention-follow-up");
    expect(el.getAttribute("style") ?? "").toContain("--color-text-secondary");
  });
});

describe("AttentionQueueCard interest-level dot-cluster", () => {
  it("renders 3 filled + 2 empty dots for interest_level=3", () => {
    renderCard(makeItem({ context: { interest_level: 3 } }));
    const el = screen.getByTestId("attention-interest-level");
    expect(el.textContent).toBe("●●●○○");
  });

  it("renders all-filled (5/5) for the maximum value", () => {
    renderCard(makeItem({ context: { interest_level: 5 } }));
    const el = screen.getByTestId("attention-interest-level");
    expect(el.textContent).toBe("●●●●●");
    expect(el.getAttribute("data-interest-level")).toBe("5");
  });

  it("renders 1 filled + 4 empty (1/5) for the minimum value", () => {
    renderCard(makeItem({ context: { interest_level: 1 } }));
    const el = screen.getByTestId("attention-interest-level");
    expect(el.textContent).toBe("●○○○○");
    expect(el.getAttribute("data-interest-level")).toBe("1");
  });

  it("rounds non-integer values to the nearest integer 1..5", () => {
    renderCard(makeItem({ context: { interest_level: 3.7 } }));
    const el = screen.getByTestId("attention-interest-level");
    expect(el.textContent).toBe("●●●●○");
    expect(el.getAttribute("data-interest-level")).toBe("4");
  });

  it("does not render the indicator when context is missing entirely", () => {
    renderCard(makeItem({ context: undefined }));
    expect(screen.queryByTestId("attention-interest-level")).toBeNull();
  });

  it("does not render the indicator when interest_level is absent", () => {
    renderCard(makeItem({ context: { why_now: "x" } }));
    expect(screen.queryByTestId("attention-interest-level")).toBeNull();
  });

  it("does not render the indicator for out-of-range values (0, 6+, NaN)", () => {
    for (const bad of [0, 6, 7, -1, Number.NaN]) {
      const { unmount } = renderCard(
        makeItem({ context: { interest_level: bad as number } }),
      );
      expect(screen.queryByTestId("attention-interest-level")).toBeNull();
      unmount();
    }
  });

  it("exposes רמת עניין: N/5 in the title attribute for hover context", () => {
    renderCard(makeItem({ context: { interest_level: 4 } }));
    const el = screen.getByTestId("attention-interest-level");
    expect(el.getAttribute("title")).toBe("רמת עניין: 4/5");
    expect(el.getAttribute("aria-label")).toBe("רמת עניין: 4/5");
  });

  it("uses a subtle supporting color (color-text-secondary)", () => {
    renderCard(makeItem({ context: { interest_level: 2 } }));
    const el = screen.getByTestId("attention-interest-level");
    expect(el.getAttribute("style") ?? "").toContain("--color-text-secondary");
  });

  it("renders alongside last-activity and follow-up when all three are present", () => {
    const past = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const future = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    renderCard(
      makeItem({
        context: {
          last_call_date: past,
          follow_up_date: future,
          interest_level: 3,
        },
      }),
    );
    expect(screen.getByTestId("attention-last-activity")).toBeTruthy();
    expect(screen.getByTestId("attention-follow-up")).toBeTruthy();
    expect(screen.getByTestId("attention-interest-level")).toBeTruthy();
  });
});
