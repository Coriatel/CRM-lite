import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { PeopleHubPage } from "../PeopleHubPage";
import { ProjectProvider } from "../../contexts/ProjectContext";
import { AuthProvider } from "../../contexts/AuthContext";
import type { AdvancedFilters } from "../../types";

function renderPeopleHubPage(
  filters: AdvancedFilters,
  setFilters: (f: AdvancedFilters) => void = () => {},
) {
  return render(
    <MemoryRouter initialEntries={["/people"]}>
      <AuthProvider>
        <ProjectProvider>
          <Routes>
            <Route
              element={
                <Outlet context={{ setAdvancedFilters: setFilters }} />
              }
            >
              <Route
                path="/people"
                element={
                  <PeopleHubPage sortBy="full_name" advancedFilters={filters} />
                }
              />
            </Route>
          </Routes>
        </ProjectProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// Slice A smoke test:
// PeopleHubPage must render the contacts universe WITHOUT requiring an
// activeProject. Provider tree is mounted in default state (no project
// selected) — the page must NOT short-circuit to an empty project gate.

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
  first_name: "טסט",
  last_name: "קונטקט",
  phone_raw: "050-1234567",
  phone_e164: "+972501234567",
  email: null,
  status: "not_checked",
  city: null,
  address: null,
  notes: "",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  classification: null,
  call_status: null,
  follow_up_date: null,
  follow_up_note: null,
  interest_level: null,
  assigned_to: null,
  donation_type: null,
  monthly_donation: null,
  total_donation: null,
  last_call_date: null,
  original_note: null,
  receipt_confirmed: false,
  thank_you_sent: false,
  lifecycle_stage_id: null,
  tags: [],
  interactions: [],
};

describe("PeopleHubPage (Slice A)", () => {
  beforeEach(() => {
    localStorage.clear();
    // Mock the directus contact list endpoint and an empty projects list so
    // ProjectProvider initialises with NO active project.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/items/projects")) return jsonResponse({ data: [] });
      if (url.includes("/items/contacts")) return jsonResponse({ data: [CONTACT_ROW] });
      if (url.includes("/items/tags")) return jsonResponse({ data: [] });
      if (url.includes("/items/lifecycle_stages")) return jsonResponse({ data: [] });
      return jsonResponse({ data: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the contacts universe without an activeProject", async () => {
    renderPeopleHubPage({});
    expect(
      await screen.findByRole("heading", { name: /אנשי קשר — כל הקהילה/ }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/טסט קונטקט/)).toBeTruthy(),
    );
  });

  it("opens ContactDetailModal without crashing when activeProject is null", async () => {
    renderPeopleHubPage({});
    const card = await screen.findByText(/טסט קונטקט/);
    fireEvent.click(card);
    await waitFor(() =>
      expect(screen.getAllByText(/טסט קונטקט/).length).toBeGreaterThanOrEqual(1),
    );
  });

  it("renders no filter chips when advancedFilters is empty", async () => {
    renderPeopleHubPage({});
    await screen.findByRole("heading", { name: /אנשי קשר — כל הקהילה/ });
    expect(screen.queryByRole("list", { name: "מסננים פעילים" })).toBeNull();
  });

  it("renders one chip per active deep-link filter", async () => {
    renderPeopleHubPage({
      followUpBefore: "2026-05-11",
      neverCalled: true,
      donationType: "recurring",
    });
    await screen.findByRole("list", { name: "מסננים פעילים" });
    expect(screen.getByText(/מסונן: צריך חיזוק/)).toBeTruthy();
    expect(screen.getByText(/מסונן: לא נוצר קשר/)).toBeTruthy();
    expect(screen.getByText(/מסונן: תורמים קבועים/)).toBeTruthy();
  });

  it("clicking a chip × clears that filter only", async () => {
    const setFilters = vi.fn();
    renderPeopleHubPage(
      { neverCalled: true, donationType: "recurring" },
      setFilters,
    );
    const btn = await screen.findByRole("button", {
      name: "הסר סינון לא נוצר קשר",
    });
    fireEvent.click(btn);
    expect(setFilters).toHaveBeenCalledTimes(1);
    expect(setFilters.mock.calls[0][0]).toEqual({
      neverCalled: undefined,
      donationType: "recurring",
    });
  });

  it("ignores campaignStatus + hides its chip when no active project", async () => {
    renderPeopleHubPage({ campaignStatus: "paid" });
    await screen.findByRole("heading", { name: /אנשי קשר — כל הקהילה/ });
    // No project active ⇒ the campaign-status chip must not be offered, and the
    // (single) contact is shown unfiltered.
    expect(screen.queryByRole("list", { name: "מסננים פעילים" })).toBeNull();
    await waitFor(() => expect(screen.getByText(/טסט קונטקט/)).toBeTruthy());
  });
});

// P-B4: campaign-status filter — active-project scoped, in-memory.
const PROJECT_ID = "00000000-0000-4000-8000-0000000000aa";
const CONTACT_A = {
  ...CONTACT_ROW,
  id: "aaaaaaaa-0000-4000-8000-00000000aaaa",
  full_name: "פעיל בקמפיין",
};
const CONTACT_B = {
  ...CONTACT_ROW,
  id: "bbbbbbbb-0000-4000-8000-00000000bbbb",
  full_name: "מחוץ לקמפיין",
};

function renderWithActiveProject(
  filters: AdvancedFilters,
  setFilters: (f: AdvancedFilters) => void = () => {},
) {
  localStorage.setItem("crm_active_project", PROJECT_ID);
  return render(
    <MemoryRouter initialEntries={["/people"]}>
      <AuthProvider>
        <ProjectProvider>
          <Routes>
            <Route
              element={<Outlet context={{ setAdvancedFilters: setFilters }} />}
            >
              <Route
                path="/people"
                element={
                  <PeopleHubPage sortBy="full_name" advancedFilters={filters} />
                }
              />
            </Route>
          </Routes>
        </ProjectProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("PeopleHubPage — campaign-status filter (P-B4)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/items/projects"))
        return jsonResponse({
          data: [
            {
              id: PROJECT_ID,
              name: "קמפיין בדיקה",
              goal_amount: 1000,
              raised_amount: 0,
              status: "active",
              date_created: "2026-05-01T00:00:00Z",
            },
          ],
        });
      // Campaign-status source: only CONTACT_A holds status "paid" in project.
      if (url.includes("/items/project_contacts"))
        return jsonResponse({
          data: [
            {
              id: "pc-a",
              project_id: PROJECT_ID,
              contact_id: CONTACT_A,
              campaign_status: "paid",
              link_send_count: 0,
              date_created: "2026-05-01T00:00:00Z",
              date_updated: "2026-05-01T00:00:00Z",
            },
          ],
        });
      if (url.includes("/items/contacts"))
        return jsonResponse({ data: [CONTACT_A, CONTACT_B] });
      if (url.includes("/items/tags")) return jsonResponse({ data: [] });
      if (url.includes("/items/lifecycle_stages"))
        return jsonResponse({ data: [] });
      return jsonResponse({ data: [] });
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("narrows the list to contacts with the selected campaign status", async () => {
    renderWithActiveProject({ campaignStatus: "paid" });
    await waitFor(() => expect(screen.getByText(/פעיל בקמפיין/)).toBeTruthy());
    // CONTACT_B is not in the paid allow-set ⇒ filtered out.
    expect(screen.queryByText(/מחוץ לקמפיין/)).toBeNull();
  });

  it("renders a removable campaign-status chip showing the status label", async () => {
    const setFilters = vi.fn();
    renderWithActiveProject({ campaignStatus: "paid" }, setFilters);
    await screen.findByRole("list", { name: "מסננים פעילים" });
    expect(screen.getByText(/מסונן: סטטוס קמפיין: שילמו/)).toBeTruthy();
    const btn = screen.getByRole("button", {
      name: "הסר סינון סטטוס קמפיין: שילמו",
    });
    fireEvent.click(btn);
    expect(setFilters).toHaveBeenCalledTimes(1);
    expect(setFilters.mock.calls[0][0]).toEqual({ campaignStatus: undefined });
  });

  it("composes (AND) campaignStatus with an existing filter", async () => {
    renderWithActiveProject({
      campaignStatus: "paid",
      lifecycleStageSlug: "donor",
    });
    await screen.findByRole("list", { name: "מסננים פעילים" });
    expect(screen.getByText(/מסונן: סטטוס קמפיין: שילמו/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/פעיל בקמפיין/)).toBeTruthy());
    expect(screen.queryByText(/מחוץ לקמפיין/)).toBeNull();
  });
});
