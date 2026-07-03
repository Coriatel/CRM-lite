import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ExecutiveDashboardView, ExecutiveDashboardPage } from "./ExecutiveDashboardPage";
import { hasIdentifier, type DecisionInboxPacket, type PortfolioPacket } from "./decisionTypes";

const INBOX: DecisionInboxPacket = {
  _meta: { writer: "test", computed_at: "2026-06-18T00:00:00Z", read_only: true, freshness: "DEGRADED" },
  header: { needs_you_count: 16, oldest_age_days: 44.8, any_stale: true },
  requires_decision: [
    {
      id: "wm.tuesday",
      category: "D5",
      title: "החלטת כיוון: תזכורת שיעור יום שלישי",
      why_it_matters: "תהליך אוטומטי בחשד לתקלה.",
      recommendation: "החלט אם לתקן או להשבית",
      urgency: "high",
      confidence: "נמוך",
      evidence_refs: ["owner-gates.json"],
      route: "/ops#owner-gates",
    },
  ],
  blocked_waiting: [],
  high_risk: [],
  recommended_next: {
    id: "crm-lite-slice4",
    category: "D1",
    title: "החל את שינוי המבנה שאושר",
    why_it_matters: "השינוי כבר מוכן וממוזג.",
    recommendation: "להחיל את השינוי שאושר על הסביבה החיה",
    if_ignored: "הסוגיה נשארת פתוחה.",
    urgency: "high",
    confidence: "גבוה",
    evidence_refs: ["apply.py"],
    route: "/ops/blockers/crm-lite-slice4-apply",
  },
  alternatives: [],
  recently_resolved: [],
};

const PORTFOLIO: PortfolioPacket = {
  _meta: { writer: "test", computed_at: "2026-06-18T00:00:00Z", read_only: true, freshness: "DEGRADED" },
  header: { systems_total: 2, needs_you_systems: 1, unknown_systems: 0, needs_me_total: 14 },
  systems: [
    {
      system: "Telegram",
      label: "טלגרם",
      status: "תקין",
      headline: "ערוץ הבקרה פעיל ותקין.",
      needs_me: 0,
      risk: null,
      next_action: null,
      recommendation: null,
      evidence_refs: ["telegram_readiness.json"],
    },
    {
      system: "ControlTower",
      label: "מגדל בקרה",
      status: "דורש אותך",
      headline: "יש פריטים הממתינים להכרעתך.",
      needs_me: 14,
      risk: null,
      next_action: "עבור ל-החלטות",
      recommendation: { title: "התחל מההמלצה המובילה", recommendation: "התחל מההמלצה המובילה", confidence: "נמוך" },
      evidence_refs: ["control_tower_packet.json"],
    },
  ],
};

function renderView() {
  return render(
    <MemoryRouter>
      <ExecutiveDashboardView inbox={INBOX} portfolio={PORTFOLIO} />
    </MemoryRouter>,
  );
}

describe("ExecutiveDashboardView", () => {
  it("leads with the next action (decision-first), then decisions, then a compact KPI strip", () => {
    const { container } = renderView();
    // the next move is the first card on the screen
    const reco = screen.getByTestId("recommendation-card");
    expect(within(reco).getByTestId("reco-cta").textContent).toContain("להחיל את השינוי");
    // recommendation appears before the KPI strip in DOM order (decision before metrics)
    const recoIdx = Array.from(container.querySelectorAll("[data-testid]")).findIndex((n) => n.getAttribute("data-testid") === "recommendation-card");
    const kpiIdx = Array.from(container.querySelectorAll("[data-testid]")).findIndex((n) => n.getAttribute("data-testid") === "kpi-strip");
    expect(recoIdx).toBeGreaterThanOrEqual(0);
    expect(recoIdx).toBeLessThan(kpiIdx);
    // top decisions + attention systems still present
    expect(screen.getAllByTestId("decision-card").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("portfolio-row")[0].textContent).toContain("מגדל בקרה");
  });

  it("shows metrics as a compact strip, not a tile stack", () => {
    renderView();
    const strip = screen.getByTestId("kpi-strip");
    expect(within(strip).getAllByTestId("kpi-item").length).toBe(3);
    expect(screen.queryByTestId("owner-hero")).toBeNull();
    expect(screen.queryByTestId("hero-action")).toBeNull();
  });

  it("contains ZERO technical identifiers in the default view (One Rule)", () => {
    const { container } = renderView();
    expect(hasIdentifier(container.textContent ?? "")).toBe(false);
  });
});

describe("ExecutiveDashboardPage (flag gate)", () => {
  it("renders nothing when the flag is OFF (default)", () => {
    const { container } = render(
      <MemoryRouter>
        <ExecutiveDashboardPage />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe("");
  });
});
