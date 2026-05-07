import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PeopleHubPage } from "../PeopleHubPage";
import { ProjectProvider } from "../../contexts/ProjectContext";
import { AuthProvider } from "../../contexts/AuthContext";
import type { AdvancedFilters } from "../../types";

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
    const filters: AdvancedFilters = {};
    render(
      <MemoryRouter initialEntries={["/people"]}>
        <AuthProvider>
          <ProjectProvider>
            <PeopleHubPage sortBy="full_name" advancedFilters={filters} />
          </ProjectProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    // Header title proves the new hub mounted (not the project-gated empty state).
    expect(
      await screen.findByRole("heading", { name: /אנשי קשר — כל הקהילה/ }),
    ).toBeTruthy();

    // The mocked contact appears (proves useContacts ran and fed the list).
    await waitFor(() =>
      expect(screen.getByText(/טסט קונטקט/)).toBeTruthy(),
    );
  });
});
