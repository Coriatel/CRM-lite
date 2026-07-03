import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MissionProgressView, type MissionProgressDoc } from "./MissionProgressSection";

const doc: MissionProgressDoc = {
  missions: [
    { campaign_id: "control-tower-product-v1", verdict: "ON_TRACK", slices: { done: 6, total: 12 }, freshness: { age_days: 0.1 } },
    { campaign_id: "yafutsu-campaign-distribution", verdict: "BLOCKED", slices: { done: 3, total: 9 }, freshness: { age_days: 1.0 } },
    { campaign_id: "mn-os-runtime-v1-10b6", verdict: "DONE", slices: { done: 6, total: 6 }, freshness: { age_days: 0.7 } },
  ],
  summary: { packaged: 3, unauthored_active: 224, by_verdict: { ON_TRACK: 1, BLOCKED: 1, DONE: 1, GATED: 0, STALLED: 0 } },
};

describe("MissionProgressView", () => {
  it("renders Hebrew verdict summary and per-mission rows", () => {
    render(<MissionProgressView doc={doc} />);
    expect(screen.getByText("מצב המשימות")).toBeTruthy();
    expect(screen.getByText(/3 משימות מנוהלות/)).toBeTruthy();
    expect(screen.getByText(/1 מתקדם/)).toBeTruthy();
    expect(screen.getByText(/1 תקוע/)).toBeTruthy();
    expect(screen.getByText("6 מתוך 12 שלבים")).toBeTruthy();
  });

  it("keeps raw identifiers out of the default view (owner-language)", () => {
    render(<MissionProgressView doc={doc} />);
    expect(screen.queryByText(/control-tower-product-v1/)).toBeNull();
    expect(screen.queryByText(/mn-os-runtime-v1/)).toBeNull();
  });

  it("reveals raw ids only under the מקור toggle", () => {
    render(<MissionProgressView doc={doc} />);
    fireEvent.click(screen.getByRole("button", { name: "הצג מקור" }));
    expect(screen.getByTestId("mission-source").textContent).toContain("control-tower-product-v1");
    expect(screen.getByTestId("mission-source").textContent).toContain("224 יוזמות פעילות ללא תוכנית ביצוע");
  });

  it("renders nothing when packet is absent or empty", () => {
    const { container } = render(<MissionProgressView doc={null} />);
    expect(container.firstChild).toBeNull();
    const empty = render(<MissionProgressView doc={{ missions: [], summary: { packaged: 0, unauthored_active: 0, by_verdict: {} } }} />);
    expect(empty.container.firstChild).toBeNull();
  });
});
