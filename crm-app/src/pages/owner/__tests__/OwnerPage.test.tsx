import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OwnerPage } from "../OwnerPage";
import type { ControlTowerPacketState } from "../../../hooks/useControlTowerPacket";

const mockState: ControlTowerPacketState = {
  packet: null,
  fetchedAt: null,
  loading: false,
  unavailable: false,
};

vi.mock("../../../hooks/useControlTowerPacket", async (orig) => {
  const actual = await orig<typeof import("../../../hooks/useControlTowerPacket")>();
  return { ...actual, useControlTowerPacket: () => mockState };
});

function renderOwner() {
  return render(
    <MemoryRouter initialEntries={["/owner"]}>
      <OwnerPage />
    </MemoryRouter>,
  );
}

const fullPacket = {
  _meta: { computed_at: "2026-06-18T05:38:32Z", freshness: "DEGRADED" },
  now: {
    label: "owner runs apply.py + validate.py",
    rationale: "operational_priority=75",
    confidence: "FACT" as const,
    actions: ["continue", "inspect"],
    source: "global_next_action.json",
  },
  needs_you: {
    count: 16,
    gate_count: 13,
    oldest_age_days: 44.2,
    route: "/ops#owner-gates",
    owner_blockers: [{ id: "a" }, { id: "b" }, { id: "c" }],
  },
  next: { planned_total: 39, items: [{ label: "prove dry-run" }], route: "/ops#operational-queue" },
  health: {
    verdict: "DEGRADED",
    surfaces_total: 19,
    surfaces_fresh: 11,
    producer_violations: 70,
    route: "/ops#producer-health",
  },
};

describe("OwnerPage — L0 + L1 over the folded packet", () => {
  beforeEach(() => {
    mockState.packet = fullPacket;
    mockState.fetchedAt = fullPacket._meta.computed_at;
    mockState.loading = false;
    mockState.unavailable = false;
  });

  it("renders the L0 NOW overview from the packet", () => {
    renderOwner();
    expect(screen.getByText(/מבט בעלים/)).toBeTruthy();
    expect(screen.getByTestId("owner-l0-now")).toBeTruthy();
    expect(screen.getByText(/owner runs apply\.py/)).toBeTruthy();
    expect(screen.getByText("המשך")).toBeTruthy(); // action verb continue → Hebrew
  });

  it("renders L1 domain portals with counts and the decisions/blockers split", () => {
    renderOwner();
    expect(screen.getByTestId("portal-needs-you")).toBeTruthy();
    expect(screen.getByText("16")).toBeTruthy(); // needs_you.count
    expect(screen.getByText(/החלטות 13 · חסימות 3/)).toBeTruthy();
    expect(screen.getByTestId("portal-health")).toBeTruthy();
    expect(screen.getByText(/11\/19 מקורות טריים · 70 חריגות/)).toBeTruthy();
  });

  it("every portal drills down to a route (no dead numbers)", () => {
    renderOwner();
    for (const id of [
      "portal-needs-you",
      "portal-decisions",
      "portal-blockers",
      "portal-next",
      "portal-campaigns",
      "portal-automations",
      "portal-health",
    ]) {
      const el = screen.getByTestId(id) as HTMLAnchorElement;
      expect(el.getAttribute("href")).toBeTruthy();
    }
    expect(
      (screen.getByTestId("portal-needs-you") as HTMLAnchorElement).getAttribute("href"),
    ).toContain("/ops");
    // blockers must target the REAL Ops card anchor (id="ops-card-blockers"), not #blockers
    expect(
      (screen.getByTestId("portal-blockers") as HTMLAnchorElement).getAttribute("href"),
    ).toBe("/ops#ops-card-blockers");
  });

  it("renders a safe empty state when the packet is unavailable (degraded/missing)", () => {
    mockState.packet = null;
    mockState.unavailable = true;
    renderOwner();
    expect(screen.getByTestId("owner-unavailable")).toBeTruthy();
    expect(screen.getByText("המידע אינו זמין כעת")).toBeTruthy();
  });
});
