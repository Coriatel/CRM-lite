import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { AdvancedFilters } from "../../types";
import { TodayPage } from "../TodayPage";

// UX12 — Global Next Action sticky row tests. Focuses on the writer-fed
// surface that lives at the top of /today and reads
// /ops-data/global_next_action.json. The selection rule is enforced by the
// writer (see scripts/mn-os-writers/build-global-next-action.py); these
// tests cover the rendering contract per UX activation plan §15.2 (human-
// trust readability — rationale + alternatives must be auditable).

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function renderTodayPage(
  setAdvancedFilters: (f: AdvancedFilters) => void = () => {},
) {
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route element={<Outlet context={{ setAdvancedFilters }} />}>
          <Route path="/today" element={<TodayPage />} />
          <Route
            path="/ops/blockers/:id"
            element={<div data-testid="blocker-page" />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const FULL_DOC = {
  _meta: {
    writer: "mn-os-global-next-action-writer",
    computed_at: "2026-05-27T14:42:00Z",
    queue_item_count: 49,
  },
  next_action: {
    id: "blocker:couchdb-kmv8-elron-compaction",
    label: "owner: scheduled compaction window",
    rationale: "operational_priority=75 · weight=informational×0.8 · score=60.0 · מובחר מבין 49 פריטים פתוחים",
    downstream_impact: "projects/couchdb-compaction-proposal.md",
    route: "/ops/blockers/couchdb-kmv8-elron-compaction",
    computed_priority: 60.0,
    type: "blocker",
    severity: "high",
    lane: "D",
    owner_gate: false,
  },
  alternatives: [
    {
      id: "blocker:heshbonot-edge-000",
      label: "owner: Caddy/TLS triage",
      rationale: "operational_priority=75 · weight=informational×0.8 · score=60.0 · מובחר מבין 49 פריטים פתוחים",
      downstream_impact: "blockers.json · heshbonot-edge-000",
      route: "/ops/blockers/heshbonot-edge-000",
      computed_priority: 60.0,
      type: "blocker",
      severity: "high",
      lane: "A",
      owner_gate: false,
    },
  ],
};

const EMPTY_DOC = {
  _meta: { writer: "mn-os-global-next-action-writer", queue_item_count: 0 },
  next_action: null,
  alternatives: [],
  empty_reason: "no open queue items",
};

function fetchMock(globalNextAction: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/ops-data/global_next_action.json")) {
      return jsonResponse(globalNextAction, status);
    }
    return jsonResponse({ data: [] });
  });
}

describe("TodayPage — Global Next Action row (UX12)", () => {
  beforeEach(() => {
    // Default mock — overridden per test.
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ data: [] }),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the next-action label as a Link to the writer-supplied route", async () => {
    fetchMock(FULL_DOC);
    renderTodayPage();
    await waitFor(() =>
      expect(screen.getByTestId("global-next-action-label").textContent).toBe(
        "owner: scheduled compaction window",
      ),
    );
    expect(
      screen.getByTestId("global-next-action-link").getAttribute("href"),
    ).toBe("/ops/blockers/couchdb-kmv8-elron-compaction");
  });

  it("hides the rationale by default and reveals it on toggle", async () => {
    fetchMock(FULL_DOC);
    renderTodayPage();
    await waitFor(() =>
      expect(screen.getByTestId("global-next-action-why-toggle")).toBeTruthy(),
    );
    expect(screen.queryByTestId("global-next-action-rationale")).toBeNull();
    fireEvent.click(screen.getByTestId("global-next-action-why-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("global-next-action-rationale")).toBeTruthy(),
    );
    // Per §15.2 — rationale must explain WHY this surfaced.
    expect(
      screen.getByTestId("global-next-action-rationale").textContent ?? "",
    ).toMatch(/operational_priority=75/);
  });

  it("renders alternatives only after the rationale is revealed", async () => {
    fetchMock(FULL_DOC);
    renderTodayPage();
    await waitFor(() =>
      expect(screen.getByTestId("global-next-action-why-toggle")).toBeTruthy(),
    );
    expect(screen.queryByTestId("global-next-action-alternatives")).toBeNull();
    fireEvent.click(screen.getByTestId("global-next-action-why-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("global-next-action-alternatives")).toBeTruthy(),
    );
    const altLinks = screen.getAllByTestId(
      "global-next-action-alternative-link",
    );
    expect(altLinks.length).toBe(1);
    expect(altLinks[0].getAttribute("href")).toBe(
      "/ops/blockers/heshbonot-edge-000",
    );
  });

  it("renders calm empty state when the queue has no open items", async () => {
    fetchMock(EMPTY_DOC);
    renderTodayPage();
    await waitFor(() =>
      expect(screen.getByTestId("global-next-action-empty")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("global-next-action-empty").textContent ?? "",
    ).toMatch(/אין מהלך תפעולי דומיננטי כעת/);
    expect(screen.queryByTestId("global-next-action-label")).toBeNull();
  });

  it("renders calm empty state (no crash) when the projection is missing (404)", async () => {
    fetchMock({}, 404);
    renderTodayPage();
    await waitFor(() =>
      expect(screen.getByTestId("global-next-action-empty")).toBeTruthy(),
    );
    expect(screen.queryByTestId("global-next-action-label")).toBeNull();
  });

  // Writer cadence is 60s (mn-os-global-next-action-writer.timer). When the
  // producer goes silent the file persists; surfacing the action without a
  // staleness indicator would fabricate confidence in a recommendation that
  // may already be obsolete. STALE_THRESHOLD_MS (10 min, shared with the
  // attention header) is the operator-trust ceiling.
  it("surfaces a stale-data badge when _meta.computed_at is older than the threshold", async () => {
    const STALE_DOC = {
      ...FULL_DOC,
      _meta: {
        ...FULL_DOC._meta,
        // 15 minutes ago — beyond the 10-minute STALE_THRESHOLD_MS.
        computed_at: new Date(Date.now() - 15 * 60_000).toISOString(),
      },
    };
    fetchMock(STALE_DOC);
    renderTodayPage();
    await waitFor(() =>
      expect(screen.getByTestId("global-next-action-stale")).toBeTruthy(),
    );
    // Action label still renders — operator can audit, just with the stale
    // signal visible.
    expect(screen.getByTestId("global-next-action-label").textContent).toBe(
      "owner: scheduled compaction window",
    );
  });

  it("does not render the stale badge when _meta.computed_at is fresh", async () => {
    const FRESH_DOC = {
      ...FULL_DOC,
      _meta: {
        ...FULL_DOC._meta,
        computed_at: new Date(Date.now() - 30_000).toISOString(),
      },
    };
    fetchMock(FRESH_DOC);
    renderTodayPage();
    await waitFor(() =>
      expect(screen.getByTestId("global-next-action-label")).toBeTruthy(),
    );
    expect(screen.queryByTestId("global-next-action-stale")).toBeNull();
  });
});
