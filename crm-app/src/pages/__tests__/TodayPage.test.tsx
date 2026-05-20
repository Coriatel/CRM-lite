import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { AdvancedFilters } from "../../types";
import { TodayPage } from "../TodayPage";

function renderTodayPage(
  setAdvancedFilters: (f: AdvancedFilters) => void = () => {},
) {
  function LocationProbe() {
    const loc = useLocation();
    return <div data-testid="loc-pathname">{loc.pathname}</div>;
  }
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route element={<Outlet context={{ setAdvancedFilters }} />}>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/people" element={<LocationProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

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
    renderTodayPage();
    expect(screen.getByText(/מרכז נשמה — היום/)).toBeTruthy();
    expect(screen.getByText(/כסף קריטי/)).toBeTruthy();
    expect(screen.getByText(/הקבוצה הבאה/)).toBeTruthy();
    expect(screen.getByText(/שיעורים היום/)).toBeTruthy();
    expect(screen.getByText(/תכנים/)).toBeTruthy();
  });

  it("renders live People counts from server", async () => {
    renderTodayPage();
    await waitFor(() => {
      expect(screen.getByText(/ממתינות למעקב חוזר היום/)).toBeTruthy();
      expect(screen.getByText(/לא דיברנו איתן עדיין/)).toBeTruthy();
    });
  });

  it("renders recurring donors count and queries Directus with donation_type=recurring", async () => {
    renderTodayPage();
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
    renderTodayPage();
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
    renderTodayPage();
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
    renderTodayPage();
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
    renderTodayPage();
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
    renderTodayPage();
    await waitFor(() => {
      expect(screen.getByText("שגיאה בטעינת תור השיחות")).toBeTruthy();
    });
  });

  it("CallsTodayCard refresh button re-runs the call_queue fetch", async () => {
    renderTodayPage();
    await waitFor(() => screen.getByLabelText("רענן שיחות"));
    const before = urls.filter((u) => u.includes("/items/call_queue")).length;
    (await screen.findByLabelText("רענן שיחות")).click();
    await waitFor(() => {
      const after = urls.filter((u) => u.includes("/items/call_queue")).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("clicking the followUpDue line sets followUpBefore filter and navigates to /", async () => {
    const setFilters = vi.fn();
    renderTodayPage(setFilters);
    const btn = await screen.findByRole("button", {
      name: "הצג אנשים שממתינים למעקב חוזר היום",
    });
    fireEvent.click(btn);
    expect(setFilters).toHaveBeenCalledTimes(1);
    const call = setFilters.mock.calls[0][0] as AdvancedFilters;
    expect(call.followUpBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => {
      expect(screen.getByTestId("loc-pathname").textContent).toBe("/people");
    });
  });

  it("clicking the neverCalled line sets neverCalled filter and navigates to /", async () => {
    const setFilters = vi.fn();
    renderTodayPage(setFilters);
    const btn = await screen.findByRole("button", {
      name: "הצג אנשי קשר שלא דיברנו איתם עדיין",
    });
    fireEvent.click(btn);
    expect(setFilters).toHaveBeenCalledTimes(1);
    expect(setFilters.mock.calls[0][0]).toEqual({ neverCalled: true });
    await waitFor(() => {
      expect(screen.getByTestId("loc-pathname").textContent).toBe("/people");
    });
  });

  it("clicking the recurring-donors count sets donationType filter and navigates to /", async () => {
    const setFilters = vi.fn();
    renderTodayPage(setFilters);
    const btn = await screen.findByRole("button", {
      name: "הצג תורמים קבועים",
    });
    fireEvent.click(btn);
    expect(setFilters).toHaveBeenCalledTimes(1);
    expect(setFilters.mock.calls[0][0]).toEqual({ donationType: "recurring" });
    await waitFor(() => {
      expect(screen.getByTestId("loc-pathname").textContent).toBe("/people");
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
    renderTodayPage();
    await waitFor(() => {
      expect(screen.getByText("שגיאה בטעינת נתוני תורמים")).toBeTruthy();
    });
  });

  // Provenance pills (operational-model.md §5.3) — every data card surfaces
  // its source and recency so a stale card cannot masquerade as real.

  it("PeopleCareCard renders a provenance pill after Directus fetch resolves", async () => {
    renderTodayPage();
    // header for the card whose pill we're checking
    await screen.findByRole("heading", { name: "אנשים / חיזוק" });
    await waitFor(() => {
      // Multiple pills land on the page (one per data card); confirm at least one
      const pills = screen.queryAllByText(/מקור: Directus · עכשיו/);
      expect(pills.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("RecurringDonorsCard renders a provenance pill after fetch resolves", async () => {
    renderTodayPage();
    await screen.findByRole("heading", { name: /תורמים קבועים/ });
    await waitFor(() => {
      const pills = screen.queryAllByText(/מקור: Directus · עכשיו/);
      expect(pills.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("CallsTodayCard renders a provenance pill alongside the refresh button", async () => {
    renderTodayPage();
    await screen.findByRole("heading", { name: "שיחות להיום" });
    await waitFor(() => {
      const pills = screen.queryAllByText(/מקור: Directus · עכשיו/);
      // 3 cards × 1 pill each on success; calls is one of them
      expect(pills.length).toBeGreaterThanOrEqual(1);
    });
    // refresh button still present
    expect(await screen.findByLabelText("רענן שיחות")).toBeTruthy();
  });

  it("TopDonorsCard renders donor rows + anonymous disclosure when transactions return data", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/items/transactions")) {
        return jsonResponse({
          data: [
            {
              id: "t1",
              amount: "300",
              date: "2026-04-10T00:00:00Z",
              contact_id: {
                id: "donor-1",
                full_name: "אלישבע גרין",
              },
            },
            {
              id: "t2",
              amount: "100",
              date: "2026-03-01T00:00:00Z",
              contact_id: {
                id: "donor-1",
                full_name: "אלישבע גרין",
              },
            },
            {
              id: "t3",
              amount: "150",
              date: "2026-04-20T00:00:00Z",
              contact_id: { id: "donor-2", full_name: "יעקב כהן" },
            },
            {
              id: "t4-anon",
              amount: "999",
              date: "2026-04-25T00:00:00Z",
              contact_id: null,
            },
          ],
        });
      }
      return jsonResponse({ data: [] });
    });
    renderTodayPage();
    await screen.findByRole("heading", { name: /תורמים מובילים השנה/ });
    await waitFor(() => {
      expect(screen.getByText("אלישבע גרין")).toBeTruthy();
      expect(screen.getByText("יעקב כהן")).toBeTruthy();
    });
    const disclosure = await screen.findByTestId(
      "top-donors-anonymous-disclosure",
    );
    expect(disclosure.textContent || "").toMatch(/1 תרומות אנונימיות/);
  });

  it("TopDonorsCard shows empty-state copy when transactions returns no rows", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ data: [] }),
    );
    renderTodayPage();
    await screen.findByRole("heading", { name: /תורמים מובילים השנה/ });
    await waitFor(() => {
      expect(screen.getByText("עוד אין תרומות מיוחסות השנה")).toBeTruthy();
    });
    expect(
      screen.queryByTestId("top-donors-anonymous-disclosure"),
    ).toBeNull();
  });

  it("TopDonorsCard surfaces an error when transactions fetch rejects", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/items/transactions")) {
        return jsonResponse({ errors: [{ message: "boom" }] }, 500);
      }
      return jsonResponse({ data: [] });
    });
    renderTodayPage();
    await waitFor(() => {
      expect(screen.getByText("שגיאה בטעינת נתוני תרומות")).toBeTruthy();
    });
  });

  it("provenance pill switches to error variant when fetch fails", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("filter%5Bdonation_type%5D%5B_eq%5D=recurring")) {
        return jsonResponse({ errors: [{ message: "boom" }] }, 500);
      }
      return jsonResponse({ data: [] });
    });
    renderTodayPage();
    await waitFor(() => {
      // donors error variant pill
      const errorPills = screen.queryAllByText(/מקור: Directus · שגיאה/);
      expect(errorPills.length).toBeGreaterThanOrEqual(1);
    });
  });
});
