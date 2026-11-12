import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MgmtPersonPage } from "../MgmtPersonPage";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const NOW = new Date(2026, 10, 12, 12, 0);
const PERSON = { id: "a", full_name: "נועה בדויה", phone_e164: "+972501234567", email: "noa@example.org", city: "חיפה", classification: "donor" };
const NOTES = [1, 2, 3, 4].map((n) => ({
  id: "i" + n, contact_id: "a", type: n === 1 ? "call" : "note", status: "done",
  summary: "אירוע " + n, created_at: `2026-11-0${n}T10:00:00`,
}));

let calls: { url: string; method: string; body: unknown }[] = [];
let tasksStatus = 200;
let personStatus = 200;
let noIncome = false;

function mount() {
  return render(
    <MemoryRouter initialEntries={["/m/people/a"]}>
      <Routes>
        <Route path="/m/people/:id" element={<MgmtPersonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MgmtPersonPage", () => {
  beforeEach(() => {
    calls = [];
    tasksStatus = 200;
    personStatus = 200;
    noIncome = false;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = decodeURIComponent(String(input));
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method !== "GET") return jsonResponse({ data: {} });
      if (url.includes("/items/contacts/a")) return jsonResponse(personStatus === 200 ? { data: PERSON } : { errors: [] }, personStatus);
      if (url.includes("/items/tasks")) {
        return jsonResponse(
          tasksStatus === 200
            ? { data: [{ id: "t1", kind: "call", status: "open", priority: 3, due_at: "2026-11-09T08:00:00", notes: "לחזור אליה", subject_contact_id: { id: "a", full_name: "נועה בדויה", phone_e164: "+972501234567" } }] }
            : { errors: [] },
          tasksStatus,
        );
      }
      if (url.includes("/items/interactions")) return jsonResponse({ data: NOTES });
      if (url.includes("/items/transactions") && url.includes("limit=1"))
        return jsonResponse({ data: [{ date: "2026-09-24T06:00:00.000Z" }] });
      if (url.includes("/items/transactions"))
        return jsonResponse({ data: noIncome ? [] : [{ id: "x1", amount: "360", date: "2026-09-24T06:00:00.000Z" }, { id: "x2", amount: 720, date: "2026-03-01T06:00:00.000Z" }] });
      return jsonResponse({ data: [] });
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows who the person is and how to reach them", async () => {
    mount();
    await screen.findByRole("heading", { name: "נועה בדויה" });
    expect(screen.getByText("תורם/ת · חיפה")).toBeTruthy();
    expect(screen.getByText("050-123-4567")).toBeTruthy();
    expect(screen.getByText("חיוג").getAttribute("href")).toBe("tel:+972501234567");
    expect(screen.getByText("‹ אנשי קשר").getAttribute("href")).toBe("/m/people");
  });

  it("lists only this person's open tasks, without repeating the name", async () => {
    mount();
    const panel = await screen.findByLabelText("משימות פתוחות");
    await within(panel).findByText("לחזור אליה");
    expect(within(panel).queryByText("נועה בדויה")).toBeNull();
    expect(calls.find((c) => c.url.includes("/items/tasks"))!.url).toContain("filter[subject_contact_id][_eq]=a");
  });

  it("shows the latest three timeline entries and the rest on request", async () => {
    mount();
    await screen.findByText(/אירוע 1/);
    expect(screen.queryByText(/אירוע 4/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "הצגת כל 4" }));
    expect(screen.getByText(/אירוע 4/)).toBeTruthy();
  });

  it("adds a note as an interaction on this person and reloads the timeline", async () => {
    mount();
    await screen.findByText(/אירוע 1/);
    fireEvent.change(screen.getByLabelText("הערה חדשה"), { target: { value: "ביקשה לחזור" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספה" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/items/interactions");
    expect(post.body).toEqual({ contact_id: "a", type: "note", summary: "ביקשה לחזור", status: "done" });
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "GET" && c.url.includes("/items/interactions"))).toHaveLength(2),
    );
  });

  it("shows donations with full dates and how current the data is", async () => {
    mount();
    const panel = await screen.findByLabelText("תרומות");
    await within(panel).findByText(/נתונים עד 24\.9\.2026 · לא התעדכנו מאז/);
    expect(panel.textContent).toContain("1,080 ₪ · 2 תרומות");
    expect(panel.textContent).toContain("360 ₪ · 24.9.2026");
    expect(panel.textContent).not.toMatch(/היום|אתמול/);
  });

  it("states data freshness also for a person with no recorded donations", async () => {
    noIncome = true;
    mount();
    const panel = await screen.findByLabelText("תרומות");
    await within(panel).findByText("לא נרשמו תרומות.");
    expect(within(panel).getByText(/נתונים עד 24\.9\.2026 · לא התעדכנו מאז/)).toBeTruthy();
  });

  it("keeps the rest of the card when tasks are refused, and offers no new task", async () => {
    tasksStatus = 403;
    mount();
    const panel = await screen.findByLabelText("משימות פתוחות");
    await within(panel).findByText(/אין לך הרשאה/);
    expect(screen.getByRole("heading", { name: "נועה בדויה" })).toBeTruthy();
    await screen.findByText(/אירוע 1/);
    expect(screen.queryByRole("button", { name: "משימה חדשה" })).toBeNull();
  });

  it("shows only the no-permission notice when the person is refused", async () => {
    personStatus = 403;
    mount();
    await screen.findByText(/אין לך הרשאה/);
    expect(screen.queryByLabelText("ציר זמן")).toBeNull();
  });
});
