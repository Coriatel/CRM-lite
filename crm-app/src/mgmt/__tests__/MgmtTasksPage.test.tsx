import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MgmtTasksPage } from "../MgmtTasksPage";
import { groupTasks, taskBucket, taskMeta, taskTitle } from "../tasks";
import type { MgTask } from "../../services/directus";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const NOW = new Date(2026, 10, 12, 12, 0);
const task = (id: string, due: string | null, extra: Partial<MgTask> = {}): MgTask => ({
  id,
  kind: "call",
  status: "open",
  priority: 3,
  due_at: due,
  notes: `משימה ${id}`,
  subject_contact_id: null,
  ...extra,
});
const TASKS = [
  task("late", "2026-11-09T08:00:00", {
    subject_contact_id: { id: "a", full_name: "נועה בדויה", phone_e164: "+972501234567" },
  }),
  task("today", "2026-11-12T16:00:00"),
  task("week", "2026-11-16T08:00:00"),
  task("nodate", null, { notes: null, kind: "admin" }),
];

let calls: { url: string; method: string; body: unknown }[] = [];
let getStatus = 200;
let writeStatus = 200;

function mount() {
  return render(
    <MemoryRouter>
      <MgmtTasksPage />
    </MemoryRouter>,
  );
}

describe("task helpers", () => {
  it("groups by due date in urgency order and drops empty groups", () => {
    const groups = groupTasks(TASKS, NOW);
    expect(groups.map((g) => g.label)).toEqual(["באיחור", "היום", "השבוע", "ללא תאריך"]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["late"]);
  });
  it("buckets by the local day, not by the UTC date in the timestamp", () => {
    // 22:30Z is already the next calendar day in Israel.
    const zoned = [task("z", "2026-11-11T22:30:00.000Z")];
    const local = new Date("2026-11-11T22:30:00.000Z");
    const sameLocalDay = local.getDate() === NOW.getDate();
    expect(groupTasks(zoned, NOW)[0].label).toBe(sameLocalDay ? "היום" : "באיחור");
    expect(taskBucket("2026-11-12T00:30:00", NOW)).toBe("today");
    expect(taskBucket(null, NOW)).toBe("none");
  });
  it("titles a task by its note, or by its kind when there is none", () => {
    expect(taskTitle(TASKS[0])).toBe("משימה late");
    expect(taskTitle(TASKS[3])).toBe("מנהלה");
  });
  it("says since when a task is late and does not repeat the kind as title", () => {
    expect(taskMeta(TASKS[0], "overdue")).toBe("מ־9.11.2026 · שיחה");
    expect(taskMeta(TASKS[1], "today")).toBe("שיחה");
    expect(taskMeta(TASKS[3], "none")).toBe("");
  });
});

describe("MgmtTasksPage", () => {
  beforeEach(() => {
    calls = [];
    getStatus = 200;
    writeStatus = 200;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      calls.push({
        url: decodeURIComponent(String(input)),
        method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (method === "GET") return jsonResponse(getStatus === 200 ? { data: TASKS } : { errors: [] }, getStatus);
      return jsonResponse(writeStatus === 200 ? { data: {} } : { errors: [] }, writeStatus);
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("asks the server for open tasks only and shows them by urgency", async () => {
    mount();
    await screen.findByText("משימה today");
    expect(calls[0].url).toContain("/items/tasks?");
    expect(calls[0].url).toContain("filter[status][_eq]=open");
    expect(screen.getByText("4 פתוחות")).toBeTruthy();
    const late = screen.getByLabelText("באיחור");
    expect(within(late).getByText("נועה בדויה").getAttribute("href")).toBe("/m/people/a");
    expect(within(late).getByText("חיוג").getAttribute("href")).toBe("tel:+972501234567");
    expect(within(late).getByText("מ־9.11.2026 · שיחה").className).toContain("mg-warn");
  });

  it("marks a task done on the server and lets it be undone", async () => {
    mount();
    await screen.findByText("משימה today");
    const box = screen.getByLabelText("סימון כבוצע: משימה today");
    fireEvent.click(box);
    await waitFor(() => expect(screen.getByText("בוצע")).toBeTruthy());
    expect(calls[1]).toMatchObject({ method: "PATCH", body: { status: "done" } });
    expect(calls[1].url).toContain("/items/tasks/today");
    fireEvent.click(box);
    await waitFor(() => expect(screen.queryByText("בוצע")).toBeNull());
    expect(calls[2]).toMatchObject({ method: "PATCH", body: { status: "open" } });
  });

  it("keeps the task open and says why when the server refuses the update", async () => {
    mount();
    await screen.findByText("משימה today");
    writeStatus = 403;
    fireEvent.click(screen.getByLabelText("סימון כבוצע: משימה today"));
    await screen.findByText(/אין לך הרשאה לעדכן משימות/);
    expect(screen.queryByText("בוצע")).toBeNull();
  });

  it("creates an open task and reloads the list", async () => {
    mount();
    await screen.findByText("משימה today");
    fireEvent.click(screen.getByRole("button", { name: "משימה חדשה" }));
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));
    await screen.findByText("כתבו מה צריך לעשות.");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("מה צריך לעשות"), { target: { value: "להתקשר" } });
    fireEvent.change(screen.getByLabelText("עד מתי"), { target: { value: "2026-11-20" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({
      status: "open",
      notes: "להתקשר",
      kind: "followup",
      due_at: new Date("2026-11-20T12:00:00").toISOString(),
      subject_contact_id: null,
    });
    await waitFor(() => expect(calls.filter((c) => c.method === "GET")).toHaveLength(2));
  });

  it("shows the no-permission notice and no create button when tasks are refused", async () => {
    getStatus = 403;
    mount();
    await screen.findByText(/אין לך הרשאה/);
    expect(screen.queryByRole("button", { name: "משימה חדשה" })).toBeNull();
  });
});
