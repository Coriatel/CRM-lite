import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  ManagementCockpitCard,
  isManagementCockpitDefault,
  managementCockpitSummary,
  type ManagementCockpitDoc,
} from "./OpsPage";

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
