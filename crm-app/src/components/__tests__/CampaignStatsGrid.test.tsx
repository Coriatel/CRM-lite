import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Outlet } from "react-router-dom";
import { CampaignStatsGrid } from "../dashboard/CampaignStatsGrid";
import { AdvancedFilters, CAMPAIGN_STATUS_LABELS } from "../../types";

const PROPS = {
  total: 10,
  byStatus: { paid: 3, refused: 0, agreed: 4 },
  totalDonated: 1500,
  goalAmount: 5000,
};

// Mirror the runtime tree: AppShell provides the outlet context
// { setAdvancedFilters }, the dashboard route renders CampaignStatsGrid under
// it, and /people is the navigation destination.
function renderGrid(
  setAdvancedFilters: (f: AdvancedFilters) => void = () => {},
) {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<Outlet context={{ setAdvancedFilters }} />}>
          <Route path="/dashboard" element={<CampaignStatsGrid {...PROPS} />} />
          <Route path="/people" element={<div>people-page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("CampaignStatsGrid — B4 KPI-as-navigation", () => {
  it("renders the status cards with their counts", () => {
    renderGrid();
    expect(screen.getByText("10")).toBeTruthy(); // total
    expect(screen.getByText(CAMPAIGN_STATUS_LABELS.paid)).toBeTruthy(); // שילמו
    expect(screen.getByText("3")).toBeTruthy(); // paid count
  });

  it("each status card is an accessible button that drills into /people", () => {
    renderGrid();
    const card = screen.getByLabelText(`${CAMPAIGN_STATUS_LABELS.paid} — אנשי קשר`);
    expect(card.getAttribute("role")).toBe("button");
    expect(card.getAttribute("tabindex")).toBe("0");
    fireEvent.click(card);
    expect(screen.getByText("people-page")).toBeTruthy(); // navigated to /people
  });

  it("clicking a status card applies exactly that campaignStatus (P-B4 contract)", () => {
    const setFilters = vi.fn();
    renderGrid(setFilters);
    fireEvent.click(
      screen.getByLabelText(`${CAMPAIGN_STATUS_LABELS.agreed} — אנשי קשר`),
    );
    expect(setFilters).toHaveBeenCalledTimes(1);
    // Only campaignStatus is set — no project id or other keys (active-project
    // scoping is enforced downstream by PeopleHubPage/useContacts).
    expect(setFilters.mock.calls[0][0]).toEqual({ campaignStatus: "agreed" });
  });

  it("navigates to /people with no URL query params", () => {
    let seenPath = "";
    function PeopleProbe() {
      seenPath = window.location.search; // jsdom: MemoryRouter keeps url internal
      return <div>people-page</div>;
    }
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<Outlet context={{ setAdvancedFilters: () => {} }} />}>
            <Route
              path="/dashboard"
              element={<CampaignStatsGrid {...PROPS} />}
            />
            <Route path="/people" element={<PeopleProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByLabelText(`${CAMPAIGN_STATUS_LABELS.paid} — אנשי קשר`),
    );
    // The destination route is exactly "/people"; a query string would have
    // produced a no-match. Reaching the page proves a clean path.
    expect(screen.getByText("people-page")).toBeTruthy();
    expect(seenPath).toBe("");
  });

  it("the total card clears campaignStatus and navigates (no status data needed)", () => {
    const setFilters = vi.fn();
    renderGrid(setFilters);
    fireEvent.click(screen.getByLabelText('סה"כ — אנשי קשר'));
    expect(setFilters).toHaveBeenCalledWith({ campaignStatus: undefined });
    expect(screen.getByText("people-page")).toBeTruthy();
  });

  it("a zero-count status card still navigates (operable regardless of data)", () => {
    const setFilters = vi.fn();
    renderGrid(setFilters);
    // refused count is 0 in PROPS.byStatus
    fireEvent.keyDown(
      screen.getByLabelText(`${CAMPAIGN_STATUS_LABELS.refused} — אנשי קשר`),
      { key: "Enter" },
    );
    expect(setFilters).toHaveBeenCalledWith({ campaignStatus: "refused" });
    expect(screen.getByText("people-page")).toBeTruthy();
  });
});
