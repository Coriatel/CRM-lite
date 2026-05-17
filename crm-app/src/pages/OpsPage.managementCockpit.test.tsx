import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  ManagementCockpitCard,
  formatManagementCockpitFreshness,
  isManagementCockpitDefault,
  isManagementCockpitGroupQueueConnected,
  managementCockpitDisplayState,
  managementCockpitGroupStatusLabel,
  managementCockpitSummary,
  type ManagementCockpitDoc,
} from "./OpsPage";

const FROZEN_NOW = new Date("2026-05-17T18:00:00Z");

const safeEmpty: ManagementCockpitDoc = {
  _meta: {
    schema_version: "v0",
    source: "ops-vault projections/management-cockpit",
    source_missing: true,
    generated_default: true,
    automation_active: false,
    updated_at: null,
  },
  groups: [],
  inbox: [],
  owner_gates: [],
  summary: { groups: 0, open_items: 0, blocked: 0, needs_owner: 0, needs_rabbi: 0 },
};

// Mirrors the current production payload at /ops-data/management_cockpit.json:
// owner-defined group identity, no queue wired, automation/executor off. The
// envelope is NOT generated_default — the writer ran intentionally.
const definedNoQueue: ManagementCockpitDoc = {
  _meta: {
    schema_version: "v0",
    source: "owner_defined_group_config",
    writer: "build-management-cockpit.py",
    source_missing: false,
    generated_default: false,
    automation_active: false,
    executor_active: false,
    generated_at: "2026-05-17T16:00:00Z",
    updated_at: null,
    note: "queue not wired yet",
  },
  groups: [
    {
      id: "second-group-pilot",
      display_name: "קבוצה שנייה — פיילוט",
      status: "defined",
      summary: { groups: 0, open_items: 0, blocked: 0, needs_owner: 0, needs_rabbi: 0 },
      last_activity_at: null,
      queue_membership: { mode: "not_configured" },
      operator: "אלרון",
    },
  ],
  inbox: [],
  owner_gates: [],
  summary: { groups: 1, open_items: 0, blocked: 0, needs_owner: 0, needs_rabbi: 0 },
};

describe("isManagementCockpitDefault", () => {
  it("treats a null doc as default (nothing fetched yet)", () => {
    expect(isManagementCockpitDefault(null)).toBe(true);
  });

  it("treats source_missing as default even without generated_default", () => {
    expect(
      isManagementCockpitDefault({ _meta: { source_missing: true } } as ManagementCockpitDoc),
    ).toBe(true);
  });

  it("treats generated_default as default even without source_missing", () => {
    expect(
      isManagementCockpitDefault({ _meta: { generated_default: true } } as ManagementCockpitDoc),
    ).toBe(true);
  });

  it("returns false for a real payload from a running writer", () => {
    expect(
      isManagementCockpitDefault({
        _meta: { source_missing: false, generated_default: false, automation_active: true },
        groups: [{ id: "g1", display_name: "Merkaz Neshama" }],
        summary: { groups: 1, open_items: 3, blocked: 1, needs_owner: 0, needs_rabbi: 1 },
      }),
    ).toBe(false);
  });
});

describe("managementCockpitSummary", () => {
  it("returns all-zero counts for a null doc (honesty default)", () => {
    expect(managementCockpitSummary(null)).toEqual({
      groups: 0,
      open_items: 0,
      blocked: 0,
      needs_owner: 0,
      needs_rabbi: 0,
    });
  });

  it("reads counts from doc.summary when present", () => {
    expect(
      managementCockpitSummary({
        summary: { groups: 2, open_items: 5, blocked: 1, needs_owner: 2, needs_rabbi: 1 },
      }),
    ).toEqual({ groups: 2, open_items: 5, blocked: 1, needs_owner: 2, needs_rabbi: 1 });
  });
});

describe("ManagementCockpitCard — honesty rendering", () => {
  it("renders the empty/default state when source is missing", () => {
    render(<ManagementCockpitCard doc={safeEmpty} />);
    expect(screen.getByText(/אין נתונים עדיין/)).toBeTruthy();
    expect(
      screen.getByTestId("management-cockpit-source-missing").textContent,
    ).toMatch(/אוטומציה: לא פעילה/);
  });

  it("renders the empty/default state when doc is null (404 / not fetched)", () => {
    render(<ManagementCockpitCard doc={null} />);
    expect(screen.getByText(/אין נתונים עדיין/)).toBeTruthy();
  });

  it("does NOT show numeric '0 open' framing in the default state (no false success)", () => {
    render(<ManagementCockpitCard doc={safeEmpty} />);
    // The count chip in the header must not show "0 פתוחים" — that framing
    // implies a writer ran and produced zero items, which is a lie.
    const card = screen.getByTestId("management-cockpit-card");
    expect(within(card).queryByText(/0 פתוחים/)).toBeNull();
  });

  it("renders summary counts and a group list when real data is present", () => {
    const real: ManagementCockpitDoc = {
      _meta: {
        schema_version: "v0",
        source: "ops-vault projections/management-cockpit",
        source_missing: false,
        generated_default: false,
        automation_active: true,
        updated_at: "2026-05-17T14:00:00Z",
      },
      groups: [
        {
          id: "merkaz-neshama",
          display_name: "מרכז נשמה",
          status: "active",
          summary: { groups: 0, open_items: 4, blocked: 1, needs_owner: 1, needs_rabbi: 0 },
        },
      ],
      inbox: [],
      owner_gates: [],
      summary: { groups: 1, open_items: 4, blocked: 1, needs_owner: 1, needs_rabbi: 0 },
    };
    render(<ManagementCockpitCard doc={real} />);
    expect(screen.queryByText(/אין נתונים עדיין/)).toBeNull();
    // "4 פתוחים" appears in both the header chip and the group row — both are real signals.
    expect(screen.getAllByText(/4 פתוחים/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/מרכז נשמה/)).toBeTruthy();
  });

  it("RTL: card section has Hebrew aria-label", () => {
    render(<ManagementCockpitCard doc={safeEmpty} />);
    expect(screen.getByLabelText("ניהול עמותה")).toBeTruthy();
  });
});

describe("isManagementCockpitGroupQueueConnected", () => {
  it("returns false for explicit queue_membership.mode = not_configured", () => {
    expect(
      isManagementCockpitGroupQueueConnected({
        id: "g",
        display_name: "g",
        queue_membership: { mode: "not_configured" },
      }),
    ).toBe(false);
  });

  it("returns true for queue_membership.mode = wired", () => {
    expect(
      isManagementCockpitGroupQueueConnected({
        id: "g",
        display_name: "g",
        queue_membership: { mode: "wired" },
      }),
    ).toBe(true);
  });

  it("returns true when queue_membership is absent (legacy / unknown)", () => {
    expect(
      isManagementCockpitGroupQueueConnected({ id: "g", display_name: "g" }),
    ).toBe(true);
  });

  it("returns false for null / undefined group", () => {
    expect(isManagementCockpitGroupQueueConnected(null)).toBe(false);
    expect(isManagementCockpitGroupQueueConnected(undefined)).toBe(false);
  });
});

describe("managementCockpitDisplayState", () => {
  it("returns no_source for null doc", () => {
    expect(managementCockpitDisplayState(null)).toBe("no_source");
  });

  it("returns no_source for source_missing", () => {
    expect(managementCockpitDisplayState(safeEmpty)).toBe("no_source");
  });

  it("returns no_source for generated_default even when source present", () => {
    expect(
      managementCockpitDisplayState({
        _meta: { generated_default: true, source_missing: false },
      }),
    ).toBe("no_source");
  });

  it("returns defined_no_queue for the current production shape", () => {
    expect(managementCockpitDisplayState(definedNoQueue)).toBe("defined_no_queue");
  });

  it("returns live when automation_active is true (regardless of queue wiring)", () => {
    expect(
      managementCockpitDisplayState({
        _meta: { automation_active: true },
        groups: [
          {
            id: "g",
            display_name: "g",
            queue_membership: { mode: "not_configured" },
          },
        ],
      }),
    ).toBe("live");
  });

  it("returns live when executor_active is true", () => {
    expect(
      managementCockpitDisplayState({
        _meta: { automation_active: false, executor_active: true },
        groups: [
          {
            id: "g",
            display_name: "g",
            queue_membership: { mode: "not_configured" },
          },
        ],
      }),
    ).toBe("live");
  });

  it("returns live when at least one group is wired (mixed groups)", () => {
    expect(
      managementCockpitDisplayState({
        _meta: { automation_active: false },
        groups: [
          { id: "a", display_name: "a", queue_membership: { mode: "wired" } },
          { id: "b", display_name: "b", queue_membership: { mode: "not_configured" } },
        ],
      }),
    ).toBe("live");
  });

  it("returns live for legacy groups with no queue_membership field", () => {
    expect(
      managementCockpitDisplayState({
        _meta: { automation_active: false },
        groups: [{ id: "g", display_name: "g" }],
      }),
    ).toBe("live");
  });

  it("returns live for an empty groups list (preserves prior summary-only display)", () => {
    expect(
      managementCockpitDisplayState({
        _meta: { automation_active: false },
        groups: [],
      }),
    ).toBe("live");
  });
});

describe("managementCockpitGroupStatusLabel", () => {
  it("maps known statuses to Hebrew", () => {
    expect(managementCockpitGroupStatusLabel("defined")).toBe("מוגדר");
    expect(managementCockpitGroupStatusLabel("active")).toBe("פעיל");
    expect(managementCockpitGroupStatusLabel("paused")).toBe("מושהה");
    expect(managementCockpitGroupStatusLabel("archived")).toBe("ארכיון");
  });

  it("falls back to מוגדר for undefined (no false-positive 'פעיל')", () => {
    expect(managementCockpitGroupStatusLabel(undefined)).toBe("מוגדר");
  });
});

describe("ManagementCockpitCard — defined_no_queue (production shape)", () => {
  it("tags the section with data-display-state=defined_no_queue", () => {
    render(<ManagementCockpitCard doc={definedNoQueue} />);
    const card = screen.getByTestId("management-cockpit-card");
    expect(card.getAttribute("data-display-state")).toBe("defined_no_queue");
  });

  it("renders 'תור לא מחובר' as the header chip — not vacuous '0 פתוחים'", () => {
    render(<ManagementCockpitCard doc={definedNoQueue} />);
    const card = screen.getByTestId("management-cockpit-card");
    expect(within(card).getByText(/תור לא מחובר/)).toBeTruthy();
    expect(within(card).queryByText(/0 פתוחים/)).toBeNull();
  });

  it("renders the three runtime flag chips (תור / אוטומציה / Executor)", () => {
    render(<ManagementCockpitCard doc={definedNoQueue} />);
    const flags = screen.getByTestId("management-cockpit-runtime-flags");
    expect(flags.textContent).toMatch(/תור:\s*לא מחובר/);
    expect(flags.textContent).toMatch(/אוטומציה:\s*לא פעילה/);
    expect(flags.textContent).toMatch(/Executor:\s*לא פעיל/);
  });

  it("renders the group row with display_name + operator + status, no vacuous counts", () => {
    render(<ManagementCockpitCard doc={definedNoQueue} />);
    const list = screen.getByTestId("management-cockpit-defined-groups");
    expect(within(list).getByText(/קבוצה שנייה — פיילוט/)).toBeTruthy();
    expect(within(list).getByText(/אלרון/)).toBeTruthy();
    expect(within(list).getByText(/מוגדר/)).toBeTruthy();
    // The legacy "0 פתוחים · 0 חסומים" row form must not appear in this state.
    expect(within(list).queryByText(/0 פתוחים/)).toBeNull();
    expect(within(list).queryByText(/חסומים/)).toBeNull();
  });

  it("does not render the metrics grid in defined_no_queue state", () => {
    render(<ManagementCockpitCard doc={definedNoQueue} />);
    const card = screen.getByTestId("management-cockpit-card");
    // The metric labels live only inside the live-state grid.
    expect(within(card).queryByText(/^קבוצות$/)).toBeNull();
    expect(within(card).queryByText(/^פתוחים$/)).toBeNull();
  });
});

describe("formatManagementCockpitFreshness", () => {
  it("returns null for a null doc", () => {
    expect(formatManagementCockpitFreshness(null, FROZEN_NOW)).toBeNull();
  });

  it("returns null when _meta is absent", () => {
    expect(formatManagementCockpitFreshness({}, FROZEN_NOW)).toBeNull();
  });

  it("returns null when _meta.generated_at is missing", () => {
    expect(
      formatManagementCockpitFreshness({ _meta: { schema_version: "v0" } }, FROZEN_NOW),
    ).toBeNull();
  });

  it("returns null when _meta.generated_at is null", () => {
    expect(
      formatManagementCockpitFreshness({ _meta: { generated_at: null } }, FROZEN_NOW),
    ).toBeNull();
  });

  it("returns null for an unparseable timestamp", () => {
    expect(
      formatManagementCockpitFreshness(
        { _meta: { generated_at: "not-a-date" } },
        FROZEN_NOW,
      ),
    ).toBeNull();
  });

  it("formats hours-old as 'מעודכן: לפני N שע''", () => {
    expect(
      formatManagementCockpitFreshness(
        { _meta: { generated_at: "2026-05-17T16:00:00Z" } },
        FROZEN_NOW,
      ),
    ).toBe("מעודכן: לפני 2 שע'");
  });

  it("formats minutes-old as 'מעודכן: לפני N דק''", () => {
    expect(
      formatManagementCockpitFreshness(
        { _meta: { generated_at: "2026-05-17T17:55:00Z" } },
        FROZEN_NOW,
      ),
    ).toBe("מעודכן: לפני 5 דק'");
  });

  it("formats just-now as 'מעודכן: עכשיו'", () => {
    expect(
      formatManagementCockpitFreshness(
        { _meta: { generated_at: "2026-05-17T17:59:55Z" } },
        FROZEN_NOW,
      ),
    ).toBe("מעודכן: עכשיו");
  });
});

describe("ManagementCockpitCard — freshness signal rendering", () => {
  it("renders the freshness line in defined_no_queue state when generated_at is present", () => {
    render(<ManagementCockpitCard doc={definedNoQueue} />);
    const line = screen.getByTestId("management-cockpit-freshness");
    expect(line.textContent ?? "").toMatch(/^מעודכן: /);
  });

  it("omits the freshness line in defined_no_queue when generated_at is absent", () => {
    const withoutTs: ManagementCockpitDoc = {
      ...definedNoQueue,
      _meta: { ...definedNoQueue._meta, generated_at: null },
    };
    render(<ManagementCockpitCard doc={withoutTs} />);
    expect(screen.queryByTestId("management-cockpit-freshness")).toBeNull();
  });

  it("renders the freshness line in live state when generated_at is present", () => {
    const live: ManagementCockpitDoc = {
      _meta: {
        schema_version: "v0",
        source: "writer",
        source_missing: false,
        generated_default: false,
        automation_active: true,
        generated_at: "2026-05-17T17:55:00Z",
      },
      groups: [
        {
          id: "g",
          display_name: "קבוצה",
          status: "active",
          queue_membership: { mode: "wired" },
          summary: { groups: 0, open_items: 2, blocked: 0, needs_owner: 0, needs_rabbi: 0 },
        },
      ],
      summary: { groups: 1, open_items: 2, blocked: 0, needs_owner: 0, needs_rabbi: 0 },
    };
    render(<ManagementCockpitCard doc={live} />);
    const line = screen.getByTestId("management-cockpit-freshness");
    expect(line.textContent ?? "").toMatch(/^מעודכן: /);
  });

  it("does NOT render the freshness line in no_source state even if a timestamp leaked in", () => {
    const noSourceWithTs: ManagementCockpitDoc = {
      _meta: {
        source_missing: true,
        generated_default: true,
        generated_at: "2026-05-17T17:55:00Z",
      },
      groups: [],
    };
    render(<ManagementCockpitCard doc={noSourceWithTs} />);
    expect(screen.queryByTestId("management-cockpit-freshness")).toBeNull();
  });
});

describe("ManagementCockpitCard — live state with mixed queue wiring", () => {
  it("shows real counts for the wired group and 'אין תור מחובר' for the not_configured one", () => {
    const mixed: ManagementCockpitDoc = {
      _meta: {
        schema_version: "v0",
        source: "writer",
        source_missing: false,
        generated_default: false,
        automation_active: true,
      },
      groups: [
        {
          id: "wired",
          display_name: "קבוצה פעילה",
          status: "active",
          queue_membership: { mode: "wired" },
          summary: { groups: 0, open_items: 3, blocked: 1, needs_owner: 1, needs_rabbi: 0 },
        },
        {
          id: "pending",
          display_name: "קבוצה ממתינה",
          status: "defined",
          queue_membership: { mode: "not_configured" },
          summary: { groups: 0, open_items: 0, blocked: 0, needs_owner: 0, needs_rabbi: 0 },
          operator: "אלרון",
        },
      ],
      inbox: [],
      owner_gates: [],
      summary: { groups: 2, open_items: 3, blocked: 1, needs_owner: 1, needs_rabbi: 0 },
    };
    render(<ManagementCockpitCard doc={mixed} />);
    const card = screen.getByTestId("management-cockpit-card");
    expect(card.getAttribute("data-display-state")).toBe("live");
    expect(within(card).getByText(/3 פתוחים · 1 חסומים/)).toBeTruthy();
    expect(within(card).getByText(/מוגדר · אין תור מחובר/)).toBeTruthy();
    expect(within(card).getByText(/אלרון/)).toBeTruthy();
  });
});
