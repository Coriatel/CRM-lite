import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecurringPatternsCard, type RecurringPatternsDoc } from "./RecurringPatternsCard";

const RECURRING_DOC: RecurringPatternsDoc = {
  _meta: {
    schema_version: 1,
    generated_at: "2026-05-28T06:30:00Z",
    window_days: 7,
    min_snapshots: 10,
    min_span_days: 3,
    snapshot_count: 12,
    bootstrap: false,
    counts: { recurring: 2, episodic: 1, new: 5 },
  },
  items: [
    {
      domain: "blockers",
      id: "crm-lite-slice4-apply",
      title: "slice4 schema not applied to prod Directus",
      first_seen_at: "2026-05-21T00:00:00Z",
      last_seen_at: "2026-05-28T06:30:00Z",
      total_snapshots: 12,
      gap_days_max: 0.5,
      active_now: true,
      recurrence_status: "recurring",
    },
    {
      domain: "violations",
      id: "mn-os-attention-synthesis-writer:PRODUCER_WITHOUT_INSTALLER",
      title: "PRODUCER_WITHOUT_INSTALLER",
      first_seen_at: "2026-05-22T00:00:00Z",
      last_seen_at: "2026-05-28T06:00:00Z",
      total_snapshots: 11,
      gap_days_max: 0,
      active_now: false,
      recurrence_status: "recurring",
    },
    {
      domain: "runtime-issues",
      id: "issue-X",
      title: "old episodic",
      first_seen_at: "2026-05-26T00:00:00Z",
      last_seen_at: "2026-05-27T00:00:00Z",
      total_snapshots: 3,
      gap_days_max: 0,
      active_now: true,
      recurrence_status: "episodic",
    },
  ],
};

describe("RecurringPatternsCard", () => {
  it("renders safe-empty when doc is null", () => {
    render(<RecurringPatternsCard doc={null} />);
    expect(screen.getByText(/אין נתוני דפוסים/)).toBeTruthy();
  });

  it("renders bootstrap message when meta.bootstrap is true", () => {
    const doc: RecurringPatternsDoc = {
      _meta: { bootstrap: true, min_snapshots: 10, min_span_days: 3 },
      items: [],
    };
    render(<RecurringPatternsCard doc={doc} />);
    expect(screen.getByText(/איסוף ראשוני/)).toBeTruthy();
  });

  it("shows 'no recurring' message when items have no recurring entries", () => {
    const doc: RecurringPatternsDoc = {
      _meta: { counts: { recurring: 0, episodic: 1, new: 1 }, window_days: 7 },
      items: [
        {
          domain: "blockers", id: "ep", title: "ep",
          first_seen_at: "2026-05-26T00:00:00Z",
          last_seen_at: "2026-05-27T00:00:00Z",
          total_snapshots: 3, gap_days_max: 0, active_now: true,
          recurrence_status: "episodic",
        },
      ],
    };
    render(<RecurringPatternsCard doc={doc} />);
    expect(screen.getByText(/אין דפוסים חוזרים בחלון של 7 ימים/)).toBeTruthy();
  });

  it("lists only recurring items (filters out episodic and new)", () => {
    render(<RecurringPatternsCard doc={RECURRING_DOC} />);
    expect(screen.getByText(/slice4 schema not applied to prod Directus/))
      .toBeTruthy();
    expect(screen.getByText(/PRODUCER_WITHOUT_INSTALLER/)).toBeTruthy();
    // Episodic item should be filtered out of the row list.
    expect(screen.queryByText(/old episodic/)).not.toBeTruthy();
  });

  it("shows status + domain chips for each recurring row", () => {
    render(<RecurringPatternsCard doc={RECURRING_DOC} />);
    const statusChips = screen.getAllByTestId("recurring-row-status");
    expect(statusChips.length).toBe(2);
    for (const chip of statusChips) {
      expect(chip.textContent).toBe("חוזר");
      // Soft variant: white background, colored border.
      expect(chip.style.background).toBe("rgb(255, 255, 255)");
    }
    const domainChips = screen.getAllByTestId("recurring-row-domain");
    expect(domainChips.length).toBe(2);
    expect(domainChips.map((c) => c.textContent).sort())
      .toEqual(["הפרת חוזה", "חסם"]);
  });

  it("flags rows with active_now=false", () => {
    render(<RecurringPatternsCard doc={RECURRING_DOC} />);
    expect(screen.getByText(/לא פעיל כעת/)).toBeTruthy();
  });

  it("renders aggregate counts when present", () => {
    render(<RecurringPatternsCard doc={RECURRING_DOC} />);
    expect(screen.getByText(/חוזרים 2/)).toBeTruthy();
    expect(screen.getByText(/אפיזודיים 1/)).toBeTruthy();
  });
});
