import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { MoreSheet } from "../MoreSheet";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="probe">{loc.pathname}</div>;
}

function renderSheet(isOpen: boolean, onClose: () => void) {
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <MoreSheet isOpen={isOpen} onClose={onClose} />
      <LocationProbe />
      <Routes>
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MoreSheet", () => {
  it("renders nothing when closed", () => {
    renderSheet(false, vi.fn());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled dialog with secondary items when open", () => {
    renderSheet(true, vi.fn());
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("more-sheet-title");
    expect(screen.getByText("עוד")).toBeTruthy();
    expect(screen.getByRole("button", { name: /הגדרות/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /לוח בקרה/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ops/ })).toBeTruthy();
  });

  it("exposes the previously-hidden built pages", () => {
    renderSheet(true, vi.fn());
    for (const name of [/אנשים/, /שיחות היום/, /תור הרב/, /תור אלרון/]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("navigates to a previously-hidden page", () => {
    renderSheet(true, vi.fn());
    fireEvent.click(screen.getByRole("button", { name: /אנשים/ }));
    expect(screen.getByTestId("probe").textContent).toBe("/people");
  });

  it("clicking an item navigates and closes the sheet", () => {
    const onClose = vi.fn();
    renderSheet(true, onClose);
    fireEvent.click(screen.getByRole("button", { name: /הגדרות/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("probe").textContent).toBe("/settings");
  });

  it("clicking the close button fires onClose", () => {
    const onClose = vi.fn();
    renderSheet(true, onClose);
    fireEvent.click(screen.getByRole("button", { name: "סגור" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("pressing Escape fires onClose", () => {
    const onClose = vi.fn();
    renderSheet(true, onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
