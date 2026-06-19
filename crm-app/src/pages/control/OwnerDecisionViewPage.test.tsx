import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OwnerDecisionView } from "./OwnerDecisionViewPage";
import type { DecisionInboxPacket } from "./decisionTypes";

const DOC: DecisionInboxPacket = {
  _meta: { writer: "test", computed_at: "2026-06-18T00:00:00Z", read_only: true, freshness: "DEGRADED" },
  header: { needs_you_count: 1, oldest_age_days: 5, any_stale: true },
  requires_decision: [],
  blocked_waiting: [
    {
      id: "crm-lite-slice4-apply",
      category: "D1",
      title: "החל את שינוי המבנה שאושר",
      why_it_matters: "השינוי כבר מוכן וממוזג.",
      recommendation: "להחיל את השינוי שאושר על הסביבה החיה",
      if_ignored: "הסוגיה נשארת פתוחה.",
      urgency: "high",
      confidence: "גבוה",
      evidence_refs: ["apply.py"],
      age_days: 5,
      route: "/ops/blockers/crm-lite-slice4-apply",
    },
  ],
  high_risk: [],
  recommended_next: null,
  alternatives: [],
  recently_resolved: [],
};

function renderView(id = "crm-lite-slice4-apply") {
  return render(
    <MemoryRouter>
      <OwnerDecisionView doc={DOC} id={id} />
    </MemoryRouter>,
  );
}

describe("OwnerDecisionView", () => {
  it("renders the decision fields without entering Ops", () => {
    renderView();
    expect(screen.getByTestId("dv-title").textContent).toContain("החל את שינוי המבנה");
    expect(screen.getByTestId("dv-why").textContent).toContain("מוכן וממוזג");
    expect(screen.getByTestId("dv-impact").textContent).toContain("גבוהה");
    expect(screen.getByTestId("dv-recommendation").textContent).toContain("להחיל את השינוי");
    expect(screen.getByTestId("dv-ifignored").textContent).toContain("נשארת פתוחה");
    expect(screen.getByTestId("dv-system").textContent).toBe("CRM");
  });

  it("offers approve/reject placeholders that explain they are not wired", () => {
    renderView();
    fireEvent.click(screen.getByTestId("dv-approve"));
    expect(screen.getByTestId("dv-action-msg").textContent).toContain("אינה מבוצעת");
  });

  it("the ONLY /ops link is the explicit advanced-details link", () => {
    const { container } = renderView();
    const opsLinks = Array.from(container.querySelectorAll('a[href*="/ops"]'));
    expect(opsLinks.length).toBe(1);
    expect(opsLinks[0].getAttribute("data-testid")).toBe("dv-open-details");
  });

  it("handles an unknown id honestly (already-handled)", () => {
    renderView("does-not-exist");
    expect(screen.getByTestId("decision-view-missing")).toBeTruthy();
  });
});
