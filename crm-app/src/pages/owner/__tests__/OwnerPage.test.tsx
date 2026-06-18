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
    label: "owner runs crm-app/scripts/slice4-schema/apply.py + validate.py",
    rationale: "operational_priority=75 · weight=informational×0.8 · score=60.0 · מובחר מבין 81 פריטים פתוחים",
    confidence: "FACT" as const,
    actions: ["continue", "inspect"],
    source: "global_next_action.json",
    route: "/ops/blockers/crm-lite-slice4-apply",
  },
  needs_you: {
    count: 16,
    gate_count: 13,
    oldest_age_days: 44.2,
    gates: [
      { id: "g1", kind: "session_launch", summary: "Session-launch run-request 'req-owner-x' parked", age_days: 44.2, reversibility: "risky", suggested_action: "owner: answer_owner_gate(decision=approved) to authorize" },
      { id: "g2", kind: "product_direction", summary: "תזכורת שיעור יום שלישי תקועה", age_days: 7 },
    ],
    owner_blockers: [{ id: "b1", summary: "PR #25 schema merged, not applied to production", needs: "להריץ את סקריפט ההחלה", age_days: 37 }],
  },
  next: { planned_total: 39, items: [{ label: "Prove a scoped dry-run campaign request flows" }] },
  health: { verdict: "DEGRADED", surfaces_total: 19, surfaces_fresh: 11, surfaces_degraded: 6, producer_violations: 70 },
};

describe("OwnerPage — executive readability layout", () => {
  beforeEach(() => {
    mockState.packet = fullPacket;
    mockState.fetchedAt = fullPacket._meta.computed_at;
    mockState.loading = false;
    mockState.unavailable = false;
  });

  it("renders the executive sections in Hebrew", () => {
    renderOwner();
    expect(screen.getByText("תמונת מצב")).toBeTruthy();
    expect(screen.getByText("מה אני ממליץ")).toBeTruthy();
    expect(screen.getByText("מה תקוע")).toBeTruthy();
    expect(screen.getByText("מה רץ עכשיו")).toBeTruthy();
    expect(screen.getByTestId("owner-status")).toBeTruthy();
  });

  it("humanizes the health verdict (no raw enum)", () => {
    renderOwner();
    expect(screen.getByTestId("owner-health").textContent).toBe("צריך בדיקה");
    expect(screen.queryByText("DEGRADED")).toBeNull();
  });

  it("strips scoring formulas and shell commands from the default view", () => {
    const { container } = renderOwner();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/operational_priority|score=|weight=/);
    expect(text).not.toMatch(/apply\.py|validate\.py/);
    // recommendation shows the humanized noun instead
    expect(screen.getAllByText("להחיל שינוי מאושר במערכת").length).toBeGreaterThan(0);
  });

  it("translates gate kinds — session_launch is no longer raw", () => {
    const { container } = renderOwner();
    expect(container.textContent).not.toMatch(/session_launch/);
    expect(screen.getByText("אישור הפעלת סשן")).toBeTruthy();
    expect(screen.getByText("לאשר את הבקשה")).toBeTruthy(); // humanized suggested_action
  });

  it("blocked section drills to real Ops anchors", () => {
    renderOwner();
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/ops#ops-card-blockers");
    expect(links).toContain("/ops#ops-card-owner-gates");
  });

  it("renders a safe empty state when the packet is unavailable", () => {
    mockState.packet = null;
    mockState.unavailable = true;
    renderOwner();
    expect(screen.getByTestId("owner-unavailable")).toBeTruthy();
    expect(screen.getByText("המידע אינו זמין כעת")).toBeTruthy();
  });
});
