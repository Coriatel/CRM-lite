import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StatsGrid } from "../dashboard/StatsGrid";

function renderGrid() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <StatsGrid totalCalls={12} completed={5} remaining={7} raised={3400} />
          }
        />
        <Route path="/calls-today" element={<div>calls-today-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StatsGrid — KPI-as-navigation", () => {
  it("renders the four KPI values", () => {
    renderGrid();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("₪3,400")).toBeTruthy();
  });

  it("each KPI card is an accessible button that drills into /calls-today", () => {
    renderGrid();
    const card = screen.getByLabelText("שיחות היום — פתיחת שיחות היום");
    expect(card.getAttribute("role")).toBe("button");
    expect(card.getAttribute("tabindex")).toBe("0");
    fireEvent.click(card);
    expect(screen.getByText("calls-today-page")).toBeTruthy();
  });

  it("navigates on keyboard Enter (keyboard-operable)", () => {
    renderGrid();
    fireEvent.keyDown(screen.getByLabelText("הושלמו — פתיחת שיחות היום"), {
      key: "Enter",
    });
    expect(screen.getByText("calls-today-page")).toBeTruthy();
  });
});
