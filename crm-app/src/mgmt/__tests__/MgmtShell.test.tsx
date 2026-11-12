import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u", email: "x@example.org", displayName: "יעל בדויה", role: "Administrator" } }),
}));

import { MgmtShell, MG_NAV } from "../MgmtShell";

afterEach(cleanup);

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="m" element={<MgmtShell />}>
          <Route path="people" element={<p>תוכן אנשי קשר</p>} />
          <Route path="people/:id" element={<p>כרטיס</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("MgmtShell", () => {
  it("renders the page inside the shell with the signed-in name", () => {
    mount("/m/people");
    expect(screen.getByText("תוכן אנשי קשר")).toBeTruthy();
    expect(screen.getByText("יעל בדויה")).toBeTruthy();
    expect(screen.getByText("מרחב הניהול")).toBeTruthy();
  });

  it("lists every screen once in the side rail and once in the phone bar", () => {
    mount("/m/people");
    const navs = screen.getAllByRole("navigation", { name: "ניווט ניהול" });
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
      for (const item of MG_NAV) expect(hrefs).toContain(item.to);
    }
  });

  it("marks the current section, also on a person page under it", () => {
    mount("/m/people/abc");
    const current = document.querySelectorAll('a[aria-current="page"]');
    expect(current.length).toBe(2);
    current.forEach((a) => expect(a.getAttribute("href")).toBe("/m/people"));
  });

  it("gives a way back to the existing screens", () => {
    mount("/m/people");
    expect(screen.getByText("למסכים הקודמים").getAttribute("href")).toBe("/");
  });
});
