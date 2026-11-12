import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MgmtDonorsPage } from "../MgmtDonorsPage";
import { freshness } from "../format";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const NOW = new Date(2026, 10, 12, 12, 0);
const tx = (id: string, amount: number, date: string, who: [string, string] | null) => ({
  id,
  amount,
  date,
  contact_id: who ? { id: who[0], full_name: who[1] } : null,
});
const STALE_ROWS = [
  tx("t1", 360, "2026-09-24T06:00:00.000Z", ["a", "נועה בדויה"]),
  tx("t2", 720, "2026-03-01T06:00:00.000Z", ["a", "נועה בדויה"]),
  tx("t3", 500, "2025-05-01T06:00:00.000Z", ["b", "דוד בדוי"]),
  tx("t4", 100, "2026-02-01T06:00:00.000Z", null),
];

let rows: unknown[] = STALE_ROWS;
let status = 200;

function mount() {
  return render(
    <MemoryRouter>
      <MgmtDonorsPage />
    </MemoryRouter>,
  );
}

describe("freshness", () => {
  it("is judged from the newest record, not from the clock", () => {
    const f = freshness("2026-09-24T06:00:00.000Z", NOW);
    expect(f.stale).toBe(true);
    expect(f.label).toBe("נתונים עד 24.9.2026 · לא התעדכנו מאז (49 ימים)");
  });
  it("is quiet when the data is current", () => {
    const f = freshness("2026-11-10T06:00:00.000Z", NOW);
    expect(f.stale).toBe(false);
    expect(f.label).toBe("נתונים עד 10.11.2026");
  });
  it("says so when there is nothing at all", () => {
    expect(freshness(null, NOW)).toEqual({ until: "", stale: true, label: "אין נתונים" });
  });
});

describe("MgmtDonorsPage", () => {
  beforeEach(() => {
    rows = STALE_ROWS;
    status = 200;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse(status === 200 ? { data: rows } : { errors: [] }, status),
    );
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("states how old the donation data is, in warning style, when it stopped updating", async () => {
    mount();
    const label = await screen.findByText(/נתונים עד 24\.9\.2026 · לא התעדכנו מאז/);
    expect(label.className).toContain("mg-stale");
  });

  it("never words a donation date as today, yesterday or days ago", async () => {
    rows = [tx("t9", 50, "2026-11-12T06:00:00.000Z", ["c", "מיכל בדויה"])];
    mount();
    await screen.findByText("מיכל בדויה");
    expect(screen.getByText("12.11.2026")).toBeTruthy();
    const table = screen.getByLabelText("רשימת תורמים");
    expect(table.textContent).not.toMatch(/היום|אתמול|לפני/);
    expect(screen.getByText("נתונים עד 12.11.2026").className).not.toContain("mg-stale");
  });

  it("sums the year, counts donors and reports gifts without a contact", async () => {
    mount();
    await screen.findByText("נועה בדויה");
    const sum = screen.getByLabelText("סיכום 2026");
    expect(sum.textContent).toContain("1,080 ₪");
    expect(sum.textContent).toContain("תרומה אחת · 100 ₪");
    expect(sum.textContent).toContain("כל התנועות שנרשמו, לפני אימות");
    expect(screen.getByText("נועה בדויה").getAttribute("href")).toBe("/m/people/a");
  });

  it("dates the data by the newest gift even when it has no contact", async () => {
    rows = [...STALE_ROWS, tx("t5", 40, "2026-10-20T06:00:00.000Z", null)];
    mount();
    await screen.findByText(/נתונים עד 20\.10\.2026/);
  });

  it("filters the list by name", async () => {
    mount();
    await screen.findByText("נועה בדויה");
    fireEvent.change(screen.getByLabelText("חיפוש תורם/ת"), { target: { value: "דוד" } });
    expect(screen.queryByText("נועה בדויה")).toBeNull();
    expect(screen.getByText("דוד בדוי")).toBeTruthy();
  });

  it("says so when the server refuses", async () => {
    status = 403;
    mount();
    await screen.findByText(/אין לך הרשאה/);
  });
});
