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
});
