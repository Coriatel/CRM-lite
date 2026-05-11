import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { CallsTodayPage } from "../CallsTodayPage";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const CONTACT_A = {
  id: "c-a",
  full_name: "אסתר כהן",
  phone_e164: "+972501111111",
  status: "not_checked",
  call_status: "not_checked",
};
const CONTACT_B = {
  id: "c-b",
  full_name: "מרים לוי",
  phone_e164: "+972502222222",
  status: "not_checked",
  call_status: "not_checked",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/calls-today"]}>
      <Routes>
        <Route path="/calls-today" element={<CallsTodayPage />} />
        <Route
          path="/call/:contactId"
          element={<div data-testid="call-route" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CallsTodayPage", () => {
  let urls: string[] = [];
  let patches: Array<{ url: string; body: unknown }> = [];

  beforeEach(() => {
    urls = [];
    patches = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      urls.push(url);
      const method = init?.method ?? "GET";
      if (method === "PATCH" && url.includes("/items/call_queue/")) {
        patches.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return jsonResponse({ data: { id: "q-1", status: "completed" } });
      }
      if (
        url.includes("/items/call_queue") &&
        url.includes("filter%5Bscheduled_date%5D%5B_gte%5D")
      ) {
        return jsonResponse({
          data: [
            {
              id: "q-today",
              contact_id: "c-a",
              priority: 2,
              status: "pending",
              scheduled_date: "2026-05-11T10:00:00Z",
            },
          ],
        });
      }
      if (
        url.includes("/items/call_queue") &&
        url.includes("filter%5Bscheduled_date%5D%5B_lt%5D")
      ) {
        return jsonResponse({
          data: [
            {
              id: "q-overdue",
              contact_id: "c-b",
              priority: 1,
              status: "pending",
              scheduled_date: "2026-05-09T10:00:00Z",
            },
          ],
        });
      }
      if (url.includes("/items/contacts") && url.includes("filter%5Bid%5D%5B_in%5D")) {
        return jsonResponse({ data: [CONTACT_A, CONTACT_B] });
      }
      return jsonResponse({ data: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders overdue and today sections with contact names", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/שיחות באיחור/)).toBeTruthy();
      // Section title for today bucket lives in an h2; chip label also says להיום.
      expect(screen.getByRole("heading", { name: /להיום/ })).toBeTruthy();
      expect(screen.getByText("אסתר כהן")).toBeTruthy();
      expect(screen.getByText("מרים לוי")).toBeTruthy();
    });
  });

  it("queries call_queue with status=pending + the expected date filters", async () => {
    renderPage();
    await waitFor(() => screen.getByText("אסתר כהן"));
    const queueCalls = urls.filter((u) => u.includes("/items/call_queue"));
    expect(queueCalls.length).toBeGreaterThanOrEqual(2);
    expect(
      queueCalls.every((u) =>
        u.includes("filter%5Bstatus%5D%5B_eq%5D=pending"),
      ),
    ).toBe(true);
  });

  it("batch-hydrates contacts via filter[id][_in]", async () => {
    renderPage();
    await waitFor(() => screen.getByText("אסתר כהן"));
    expect(
      urls.some(
        (u) =>
          u.includes("/items/contacts") &&
          u.includes("filter%5Bid%5D%5B_in%5D="),
      ),
    ).toBe(true);
  });

  it("marks a row completed via PATCH and removes it from the list", async () => {
    renderPage();
    await waitFor(() => screen.getByText("אסתר כהן"));
    const completeButtons = screen.getAllByLabelText("סמן כהושלמה");
    fireEvent.click(completeButtons[0]);
    await waitFor(() => {
      expect(patches.length).toBe(1);
      expect((patches[0].body as { status: string }).status).toBe("completed");
    });
    await waitFor(() => {
      expect(screen.queryByText("מרים לוי")).toBeNull();
    });
  });

  it("skips a row via PATCH status=skipped", async () => {
    renderPage();
    await waitFor(() => screen.getByText("אסתר כהן"));
    const skipButtons = screen.getAllByLabelText("דחה");
    fireEvent.click(skipButtons[0]);
    await waitFor(() => {
      expect(patches.length).toBe(1);
      expect((patches[0].body as { status: string }).status).toBe("skipped");
    });
  });

  it("filter chip 'באיחור' hides today rows", async () => {
    renderPage();
    await waitFor(() => screen.getByText("אסתר כהן"));
    fireEvent.click(screen.getByRole("tab", { name: /באיחור/ }));
    await waitFor(() => {
      expect(screen.queryByText("אסתר כהן")).toBeNull();
      expect(screen.getByText("מרים לוי")).toBeTruthy();
    });
  });

  it("filter chip 'להיום' hides overdue rows", async () => {
    renderPage();
    await waitFor(() => screen.getByText("אסתר כהן"));
    fireEvent.click(screen.getByRole("tab", { name: /להיום/ }));
    await waitFor(() => {
      expect(screen.queryByText("מרים לוי")).toBeNull();
      expect(screen.getByText("אסתר כהן")).toBeTruthy();
    });
  });

  it("surfaces pending rows with no scheduled_date in an 'ללא תאריך' section", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.includes("/items/call_queue") &&
        url.includes("filter%5Bscheduled_date%5D%5B_null%5D=true")
      ) {
        return jsonResponse({
          data: [
            {
              id: "q-undated",
              contact_id: "c-a",
              priority: 3,
              status: "pending",
            },
          ],
        });
      }
      if (url.includes("/items/contacts")) {
        return jsonResponse({ data: [CONTACT_A] });
      }
      return jsonResponse({ data: [] });
    });
    render(
      <MemoryRouter initialEntries={["/calls-today"]}>
        <Routes>
          <Route path="/calls-today" element={<CallsTodayPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /ללא תאריך/ })).toBeTruthy();
      expect(screen.getByText("אסתר כהן")).toBeTruthy();
    });
  });

  it("shows filter-specific zero-state when buckets are filtered to empty", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.includes("/items/call_queue") &&
        url.includes("filter%5Bscheduled_date%5D%5B_gte%5D")
      ) {
        // Has 'today' rows only; overdue is empty.
        return jsonResponse({
          data: [
            {
              id: "q-today",
              contact_id: "c-a",
              priority: 2,
              status: "pending",
              scheduled_date: "2026-05-11T10:00:00Z",
            },
          ],
        });
      }
      if (url.includes("/items/contacts")) {
        return jsonResponse({ data: [CONTACT_A] });
      }
      return jsonResponse({ data: [] });
    });
    renderPage();
    await waitFor(() => screen.getByText("אסתר כהן"));
    fireEvent.click(screen.getByRole("tab", { name: /באיחור/ }));
    await waitFor(() => {
      expect(screen.getByText("אין שיחות באיחור")).toBeTruthy();
    });
  });

  it("refresh button refetches call_queue", async () => {
    renderPage();
    await waitFor(() => screen.getByText("אסתר כהן"));
    const before = urls.filter((u) => u.includes("/items/call_queue")).length;
    fireEvent.click(screen.getByLabelText("רענן"));
    await waitFor(() => {
      const after = urls.filter((u) => u.includes("/items/call_queue")).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("shows the queue row notes when present", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.includes("/items/call_queue") &&
        url.includes("filter%5Bscheduled_date%5D%5B_gte%5D")
      ) {
        return jsonResponse({
          data: [
            {
              id: "q-today",
              contact_id: "c-a",
              priority: 2,
              status: "pending",
              scheduled_date: "2026-05-11T10:00:00Z",
              notes: "להזכיר על השיעור של יום שלישי",
            },
          ],
        });
      }
      if (url.includes("/items/contacts")) {
        return jsonResponse({ data: [CONTACT_A] });
      }
      return jsonResponse({ data: [] });
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText("להזכיר על השיעור של יום שלישי"),
      ).toBeTruthy();
    });
  });

  it("shows zero-state when both buckets are empty", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ data: [] }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("אין שיחות פתוחות להיום")).toBeTruthy();
    });
  });

  it("shows error copy when call_queue fetch fails", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/items/call_queue")) {
        return jsonResponse({ errors: [{ message: "boom" }] }, 500);
      }
      return jsonResponse({ data: [] });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/שגיאה בטעינת תור השיחות/)).toBeTruthy();
    });
  });
});
