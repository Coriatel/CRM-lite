import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DecisionInboxView, DecisionInboxPage } from "./DecisionInboxPage";
import { hasIdentifier, type DecisionInboxPacket, type PortfolioPacket } from "./decisionTypes";

const PORTFOLIO: PortfolioPacket = {
  _meta: { writer: "test", computed_at: "2026-06-18T00:00:00Z", read_only: true, freshness: "DEGRADED" },
  header: { systems_total: 5, needs_you_systems: 3, unknown_systems: 0, needs_me_total: 18 },
  systems: [],
};

// Evidence carries technical identifiers on purpose — they must stay OUT of the
// default-view DOM (hidden) and only appear once disclosed.
const FIXTURE: DecisionInboxPacket = {
  _meta: { writer: "test", computed_at: "2026-06-18T00:00:00Z", read_only: true, freshness: "DEGRADED", stale_sources: ["owner_gate_status.json"] },
  header: { needs_you_count: 16, oldest_age_days: 44.8, any_stale: true },
  requires_decision: [
    {
      id: "wm.tuesday",
      category: "D5",
      title: "החלטת כיוון: תזכורת שיעור יום שלישי",
      why_it_matters: "תהליך אוטומטי בחשד לתקלה — דרושה הכרעה אם לתקן או להשבית.",
      recommendation: "החלט אם לתקן או להשבית את התזכורת",
      urgency: "high",
      confidence: "נמוך",
      evidence_refs: ["/srv/ops-vault/state/owner-gates.json", "runner/tg_format.py"],
      age_days: 44.8,
      route: "/ops#owner-gates",
    },
  ],
  blocked_waiting: [
    {
      id: "mayenotecha-pr2",
      category: "D2",
      title: "סגור שינוי ממתין",
      why_it_matters: "שינוי פתוח כבר זמן רב וממתין להכרעה.",
      recommendation: "מזג, סנכרן או סגור את השינוי",
      urgency: "high",
      confidence: "נמוך",
      evidence_refs: ["blockers.json #42"],
      age_days: 42.8,
      route: "/ops/blockers/mayenotecha-pr2",
    },
  ],
  high_risk: [
    {
      id: "agent-registry",
      category: "D3",
      title: "חסם זיהוי סשנים פעילים",
      why_it_matters: "מרשם הסשנים מתיישן ועלול לחסום בדיקה מקדימה גלובלית.",
      recommendation: "בדיקה ידנית של מצב המרשם",
      urgency: "high",
      confidence: "נמוך",
      evidence_refs: ["sha 4b9c490abc1234"],
      age_days: 9.8,
      route: "/ops/issues/agent-registry",
    },
  ],
  recommended_next: {
    id: "crm-lite-slice4",
    category: "D1",
    title: "החל את שינוי המבנה שאושר",
    why_it_matters: "השינוי כבר מוכן וממוזג — נותר רק להחיל אותו על הסביבה החיה.",
    recommendation: "להחיל את השינוי שאושר על הסביבה החיה",
    if_ignored: "הסוגיה נשארת פתוחה וממשיכה לחסום עבודה תלויה.",
    urgency: "high",
    confidence: "גבוה",
    evidence_refs: ["apply.py", "/home/x/validate.py"],
    route: "/ops/blockers/crm-lite-slice4-apply",
  },
  alternatives: [],
  recently_resolved: [
    {
      id: "decision:pm2",
      category: "D0",
      title: "כיוון מוצרי",
      decision: "נדחה",
      decided_at: "2026-06-16T05:43:35Z",
      evidence_refs: ["owner_gate_decisions.json"],
    },
  ],
};

function renderView(doc: DecisionInboxPacket | null = FIXTURE) {
  return render(
    <MemoryRouter>
      <DecisionInboxView doc={doc} portfolio={PORTFOLIO} />
    </MemoryRouter>,
  );
}

describe("DecisionInboxView", () => {
  it("leads with the single recommended action (what/why/recommendation)", () => {
    renderView();
    const reco = screen.getByTestId("recommendation-card");
    expect(within(reco).getByTestId("card-title").textContent).toContain("החל את שינוי המבנה");
    expect(within(reco).getByTestId("card-why").textContent).toContain("מוכן וממוזג");
    // recommendation text surfaces as the dominant CTA
    expect(within(reco).getByTestId("reco-cta").textContent).toContain("להחיל את השינוי");
  });

  it("shows the one-glance owner hero with three metrics", () => {
    renderView();
    const hero = screen.getByTestId("owner-hero");
    expect(within(hero).getAllByTestId("hero-metric").length).toBe(3);
    expect(within(hero).getByText("החלטות ממתינות", { exact: false })).toBeTruthy();
    expect(within(hero).getByText("מערכות דורשות אותך", { exact: false })).toBeTruthy();
  });

  it("hides evidence by default and reveals it on disclosure", () => {
    renderView();
    expect(screen.queryByTestId("evidence-list")).toBeNull();
    const firstToggle = screen.getAllByTestId("evidence-toggle")[0];
    fireEvent.click(firstToggle);
    expect(screen.getAllByTestId("evidence-list").length).toBeGreaterThan(0);
  });

  it("contains ZERO technical identifiers in the default view (One Rule)", () => {
    const { container } = renderView();
    expect(hasIdentifier(container.textContent ?? "")).toBe(false);
  });

  it("does not duplicate the recommended item inside the priority list", () => {
    renderView();
    const titles = screen.getAllByTestId("card-title").map((n) => n.textContent);
    const recoTitle = "החל את שינוי המבנה שאושר";
    expect(titles.filter((t) => t === recoTitle).length).toBe(1);
  });
});

describe("DecisionInboxPage (flag gate)", () => {
  it("renders nothing when VITE_DECISIONS_ENABLED is OFF (default)", () => {
    const { container } = render(
      <MemoryRouter>
        <DecisionInboxPage />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe("");
  });
});
