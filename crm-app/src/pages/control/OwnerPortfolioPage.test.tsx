import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OwnerPortfolioView, OwnerPortfolioPage } from "./OwnerPortfolioPage";
import { hasIdentifier, type PortfolioPacket } from "./decisionTypes";

const FIXTURE: PortfolioPacket = {
  _meta: { writer: "test", computed_at: "2026-06-18T00:00:00Z", read_only: true, freshness: "DEGRADED" },
  header: { systems_total: 3, needs_you_systems: 1, unknown_systems: 0, needs_me_total: 4 },
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
      evidence_refs: ["telegram-bridge/telegram_readiness.json"],
    },
    {
      system: "Storage",
      label: "אחסון",
      status: "בעבודה",
      headline: "שטח בשימוש 87%.",
      needs_me: 0,
      risk: "שטח האחסון בשימוש 87% — כדאי לפנות מקום.",
      next_action: null,
      recommendation: null,
      evidence_refs: ["storage_health.json"],
    },
    {
      system: "ControlTower",
      label: "מגדל בקרה",
      status: "דורש אותך",
      headline: "יש פריטים הממתינים להכרעתך.",
      needs_me: 14,
      risk: "מקורות לא עדכניים מסומנים כלא ידוע.",
      next_action: "עבור ל-החלטות והכרע בפריטים הפתוחים",
      recommendation: { title: "התחל מההמלצה המובילה", recommendation: "התחל מההמלצה המובילה", confidence: "נמוך" },
      evidence_refs: ["control_tower_packet.json"],
    },
  ],
};

function renderView(doc: PortfolioPacket | null = FIXTURE) {
  return render(
    <MemoryRouter>
      <OwnerPortfolioView doc={doc} />
    </MemoryRouter>,
  );
}

describe("OwnerPortfolioView", () => {
  it("shows a health summary first, then one card per system", () => {
    renderView();
    const summary = screen.getByTestId("portfolio-summary");
    expect(within(summary).getByTestId("sum-attention").textContent).toContain("1");
    expect(within(summary).getByTestId("sum-warning").textContent).toContain("1");
    expect(within(summary).getByTestId("sum-healthy").textContent).toContain("1");
    expect(screen.getAllByTestId("portfolio-card").length).toBe(3);
  });

  it("orders attention systems first", () => {
    renderView();
    const cards = screen.getAllByTestId("portfolio-card");
    expect(within(cards[0]).getByTestId("portfolio-label").textContent).toBe("מגדל בקרה");
  });

  it("shows needs_me collapsed and reveals next-action/risk on expand (progressive disclosure)", () => {
    renderView();
    // collapsed: the needs-you count is visible immediately
    expect(screen.getByText("14 פריטים דורשים אותך", { exact: false })).toBeTruthy();
    // next action is hidden by default, revealed on tap
    expect(screen.queryByText("עבור ל-החלטות", { exact: false })).toBeNull();
    const attentionCard = screen.getAllByTestId("portfolio-card")[0];
    fireEvent.click(attentionCard);
    expect(within(attentionCard).getByText("עבור ל-החלטות", { exact: false })).toBeTruthy();
  });

  it("contains ZERO technical identifiers in the default view (One Rule)", () => {
    const { container } = renderView();
    expect(hasIdentifier(container.textContent ?? "")).toBe(false);
  });
});

describe("OwnerPortfolioPage (flag gate)", () => {
  it("renders nothing when the flag is OFF (default)", () => {
    const { container } = render(
      <MemoryRouter>
        <OwnerPortfolioPage />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe("");
  });
});
