import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { BottomNav } from "../BottomNav";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="probe">{loc.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
      <LocationProbe />
      <Routes>
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("renders all five primary tabs in order", () => {
    renderAt("/today");
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(labels).toEqual([
      "היום",
      "אנשי קשר",
      "לוח בקרה",
      "סינון",
      "עוד",
    ]);
  });

  it("the More tab fires onMoreClick and does not navigate", () => {
    const onMoreClick = vi.fn();
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <BottomNav onMoreClick={onMoreClick} />
        <LocationProbe />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /עוד/ }));
    expect(onMoreClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("probe").textContent).toBe("/today");
  });

  it("marks the Today tab active on /today", () => {
    renderAt("/today");
    const today = screen.getByRole("button", { name: /היום/ });
    expect(today.className).toMatch(/active/);
  });

  it("keeps the Today tab active on the /calls-today child route", () => {
    renderAt("/calls-today");
    const today = screen.getByRole("button", { name: /היום/ });
    expect(today.className).toMatch(/active/);
  });

  it("does not mark Contacts active on /today (avoids the / prefix trap)", () => {
    renderAt("/today");
    const contacts = screen.getByRole("button", { name: /אנשי קשר/ });
    expect(contacts.className).not.toMatch(/active/);
  });

  it("clicking Today navigates to /today", () => {
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: /היום/ }));
    expect(screen.getByTestId("probe").textContent).toBe("/today");
  });
});
