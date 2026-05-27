import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttentionSynthesisCard, type AttentionSynthesisDoc } from "./AttentionSynthesisCard";

// Severity-quieting regression: per-row urgency/owner badges use the soft
// (outlined, white background) variant. Aggregate summary header badges
// stay bold so the single aggregate count remains a dominant signal.
// Prior behavior repeated saturated solid-red badges N× per "today" row,
// creating visual noise that pushed operators to ignore actual urgency.

const DOC: AttentionSynthesisDoc = {
  summary: { today: 2, this_week: 1, owner_gated: 1, total_items: 3 },
  items: [
    {
      id: "row-1",
      source: "blockers",
      title: "owner: TLS triage",
      urgency_band: "today",
      gate_role: "owner",
      rank_score: 90,
    },
    {
      id: "row-2",
      source: "issues",
      title: "stale-projection drift",
      urgency_band: "this_week",
      rank_score: 50,
    },
  ],
};

describe("AttentionSynthesisCard — severity quieting", () => {
  it("renders per-row urgency badges with a white background (soft variant)", () => {
    render(<AttentionSynthesisCard doc={DOC} />);
    const urgencyBadges = screen.getAllByTestId("attention-row-urgency");
    expect(urgencyBadges.length).toBe(2);
    for (const badge of urgencyBadges) {
      // Solid badges set `background-color: <tone>`; soft badges set white.
      expect(badge.style.background).toBe("rgb(255, 255, 255)");
      // The colored tone moves to text + border so urgency is still legible.
      expect(badge.style.border).not.toBe("");
    }
  });

  it("renders per-row owner-gate badge with the soft variant", () => {
    render(<AttentionSynthesisCard doc={DOC} />);
    const ownerBadge = screen.getByTestId("attention-row-owner-gate");
    expect(ownerBadge.style.background).toBe("rgb(255, 255, 255)");
    expect(ownerBadge.textContent).toBe("אונר");
  });

  it("keeps summary header today/owner counts as saturated badges (one dominant signal)", () => {
    render(<AttentionSynthesisCard doc={DOC} />);
    // Summary "היום 2" is the aggregate dominant signal; verifying it renders.
    expect(screen.getByText("היום 2")).toBeTruthy();
    expect(screen.getByText("השבוע 1")).toBeTruthy();
    expect(screen.getByText("אונר 1")).toBeTruthy();
  });

  it("does not regress to the loud per-row variant", () => {
    render(<AttentionSynthesisCard doc={DOC} />);
    for (const badge of screen.getAllByTestId("attention-row-urgency")) {
      // The previous loud variant filled the badge with the tone — assert NOT that.
      expect(badge.style.background).not.toBe("rgb(220, 38, 38)"); // #dc2626
      expect(badge.style.background).not.toBe("rgb(161, 98, 7)"); // #a16207
    }
  });
});
