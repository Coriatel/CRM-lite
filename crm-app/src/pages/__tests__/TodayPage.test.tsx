import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayPage } from "../TodayPage";

// TodayPage smoke:
// - renders header, 4 owner-gated shells with explicit "צריך:" labels,
//   the live People care card, and the live Recurring Donors card.
// - Recurring donors fetch uses filter[donation_type][_eq]=recurring.

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const CONTACT_ROW = {
  id: "00000000-0000-4000-8000-000000000111",
  full_name: "טסט קונטקט",
  phone_e164: "+972501234567",
  status: "not_checked",
  call_status: "not_checked",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("TodayPage", () => {
  let urls: string[] = [];

  beforeEach(() => {
    urls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      urls.push(url);
      if (url.includes("filter%5Bdonation_type%5D%5B_eq%5D=recurring")) {
        return jsonResponse({ data: [CONTACT_ROW, CONTACT_ROW, CONTACT_ROW] });
      }
      if (url.includes("filter%5Bfollow_up_date%5D%5B_lte%5D")) {
        return jsonResponse({ data: [CONTACT_ROW] });
      }
      if (url.includes("filter%5Blast_call_date%5D%5B_null%5D")) {
        return jsonResponse({ data: [CONTACT_ROW, CONTACT_ROW] });
      }
      return jsonResponse({ data: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders shells with explicit owner-gated labels", async () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/מרכז נשמה — היום/)).toBeTruthy();
    expect(screen.getByText(/כסף קריטי/)).toBeTruthy();
    expect(screen.getByText(/הקבוצה הבאה/)).toBeTruthy();
    expect(screen.getByText(/שיעורים היום/)).toBeTruthy();
    expect(screen.getByText(/תכנים/)).toBeTruthy();
  });

  it("renders live People counts from server", async () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/ממתינות למעקב חוזר היום/)).toBeTruthy();
      expect(screen.getByText(/לא דיברנו איתן עדיין/)).toBeTruthy();
    });
  });

  it("renders recurring donors count and queries Directus with donation_type=recurring", async () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /תורמים קבועים/ })).toBeTruthy();
      expect(screen.getByText(/אנשי קשר מסומנים בכרטיס כתורמים קבועים/)).toBeTruthy();
    });
    expect(
      urls.some((u) =>
        u.includes("filter%5Bdonation_type%5D%5B_eq%5D=recurring"),
      ),
    ).toBe(true);
  });

  it("shows zero-state copy on the People card when both counts are 0", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ data: [] }),
    );
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("אין מעקבים חוזרים להיום")).toBeTruthy();
      expect(screen.getByText("דיברנו עם כל אנשי הקשר")).toBeTruthy();
    });
    expect(screen.queryByText(/ממתינות למעקב חוזר היום/)).toBeNull();
    expect(screen.queryByText(/לא דיברנו איתן עדיין/)).toBeNull();
  });

  it("shows error copy when Directus rejects the People queries", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("filter%5Bdonation_type%5D%5B_eq%5D=recurring")) {
        return jsonResponse({ data: [] });
      }
      return jsonResponse({ errors: [{ message: "boom" }] }, 500);
    });
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("שגיאה בטעינת נתוני אנשים")).toBeTruthy();
    });
  });

  it("renders calls-today counts and queries call_queue with status=pending + range filters", async () => {
    vi.restoreAllMocks();
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (!url.includes("/items/call_queue")) {
        return jsonResponse({ data: [] });
      }
      // Today window (has _gte + _lt) → 2 rows. Overdue (_lt only) → 1 row.
      if (
        url.includes("filter%5Bscheduled_date%5D%5B_gte%5D") &&
        url.includes("filter%5Bscheduled_date%5D%5B_lt%5D")
      ) {
        return jsonResponse({
          data: [
            { id: "a", status: "pending", priority: 1 },
            { id: "b", status: "pending", priority: 2 },
          ],
        });
      }
      if (url.includes("filter%5Bscheduled_date%5D%5B_lt%5D")) {
        return jsonResponse({
          data: [{ id: "c", status: "pending", priority: 1 }],
        });
      }
      return jsonResponse({ data: [] });
    });
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/שיחות מתוזמנות להיום/)).toBeTruthy();
      expect(screen.getByText(/שיחות באיחור/)).toBeTruthy();
    });
    expect(
      calls.some(
        (u) =>
          u.includes("/items/call_queue") &&
          u.includes("filter%5Bstatus%5D%5B_eq%5D=pending"),
      ),
    ).toBe(true);
  });

  it("shows zero-state copy on the Calls card when both counts are 0", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ data: [] }),
    );
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("אין שיחות פתוחות להיום")).toBeTruthy();
    });
  });

  it("shows error copy when Directus rejects the call_queue queries", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/items/call_queue")) {
        return jsonResponse({ errors: [{ message: "boom" }] }, 500);
      }
      return jsonResponse({ data: [] });
    });
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("שגיאה בטעינת תור השיחות")).toBeTruthy();
    });
  });

  it("CallsTodayCard refresh button re-runs the call_queue fetch", async () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByLabelText("רענן שיחות"));
    const before = urls.filter((u) => u.includes("/items/call_queue")).length;
    (await screen.findByLabelText("רענן שיחות")).click();
    await waitFor(() => {
      const after = urls.filter((u) => u.includes("/items/call_queue")).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("shows error copy when Directus rejects the donors query", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("filter%5Bdonation_type%5D%5B_eq%5D=recurring")) {
        return jsonResponse({ errors: [{ message: "boom" }] }, 500);
      }
      return jsonResponse({ data: [] });
    });
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("שגיאה בטעינת נתוני תורמים")).toBeTruthy();
    });
  });
});
