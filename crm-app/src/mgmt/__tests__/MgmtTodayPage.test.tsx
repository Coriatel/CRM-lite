import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MgmtTodayPage } from "../MgmtTodayPage";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const NOW = new Date(2026, 10, 12, 12, 0);
const t = (id: string, due: string | null) => ({
  id, kind: "call", status: "open", priority: 3, due_at: due, notes: `משימה ${id}`, subject_contact_id: null,
});
let tasks = [t("late", "2026-11-09T08:00:00"), t("now", "2026-11-12T16:00:00"), t("week", "2026-11-16T08:00:00")];
let tasksStatus = 200;
let latest: { date: string }[] = [{ date: "2026-09-24T06:00:00.000Z" }];

function mount() {
  return render(
    <MemoryRouter>
      <MgmtTodayPage />
    </MemoryRouter>,
  );
}

describe("MgmtTodayPage", () => {
  beforeEach(() => {
    tasks = [t("late", "2026-11-09T08:00:00"), t("now", "2026-11-12T16:00:00"), t("week", "2026-11-16T08:00:00")];
    tasksStatus = 200;
    latest = [{ date: "2026-09-24T06:00:00.000Z" }];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("/items/tasks"))
        return jsonResponse(tasksStatus === 200 ? { data: tasks } : { errors: [] }, tasksStatus);
      return jsonResponse({ data: latest });
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows late tasks first, then today's, and leaves the rest to the tasks screen", async () => {
    mount();
    await screen.findByText("משימה late");
    expect(within(screen.getByLabelText("משימות באיחור")).getByText("משימה late")).toBeTruthy();
    expect(within(screen.getByLabelText("משימות להיום")).getByText("משימה now")).toBeTruthy();
    expect(screen.queryByText("משימה week")).toBeNull();
    expect(screen.getByText(/2 משימות מחכות/)).toBeTruthy();
    expect(screen.getByText("לכל המשימות (עוד 1 בהמשך)").getAttribute("href")).toBe("/m/tasks");
  });

  it("says plainly when nothing is waiting", async () => {
    tasks = [t("week", "2026-11-16T08:00:00")];
    mount();
    await screen.findByText("אין משימות באיחור ואין משימות להיום.");
    expect(screen.getByText(/אין משימות שמחכות/)).toBeTruthy();
  });

  it("reports donation data as stale instead of presenting it as live", async () => {
    mount();
    const panel = await screen.findByLabelText("מצב נתוני התרומות");
    const line = await within(panel).findByText(/נתונים עד 24\.9\.2026 · לא התעדכנו מאז \(49 ימים\)/);
    expect(line.className).toContain("mg-stale");
  });

  it("handles a database with no income records at all", async () => {
    latest = [];
    mount();
    const panel = await screen.findByLabelText("מצב נתוני התרומות");
    await within(panel).findByText("אין נתונים");
  });

  it("still shows the donation status when tasks are refused", async () => {
    tasksStatus = 403;
    mount();
    await screen.findByText(/אין לך הרשאה/);
    await screen.findByText(/נתונים עד 24\.9\.2026/);
  });
});
