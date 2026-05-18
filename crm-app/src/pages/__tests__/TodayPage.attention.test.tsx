/**
 * Focused tests for TodayPage attention-queue degraded/empty/error/stale states.
 *
 * These cover the operator-facing improvements introduced in
 * feat(today): honest attention-queue degraded/empty/error/stale states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import type { AdvancedFilters } from "../../types";
import { TodayPage } from "../TodayPage";

// Mock the useAmutaAttention hook so we control its state directly
// without depending on the fetch/mock-fallback chain.
const mockRefresh = vi.fn();
const mockAttentionState = {
  buckets: null as import("../../data/amutaAttention").AttentionBuckets | null,
  source: null as string | null,
  error: null as string | null,
  loading: false,
  refresh: mockRefresh,
};

vi.mock("../../data/useAmutaAttention", () => ({
  useAmutaAttention: () => mockAttentionState,
}));

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
            path="/calls-today"
            element={<div data-testid="calls-today-page" />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// Stub out all Directus fetches — not the focus of these tests.
function stubDirectusFetches() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    jsonResponse({ data: [] }),
  );
}

describe("TodayPage — attention queue empty state", () => {
  beforeEach(() => {
    stubDirectusFetches();
    mockAttentionState.buckets = {
      needsElron: [],
      needsRav: [],
      stuck: [],
    };
    mockAttentionState.error = null;
    mockAttentionState.loading = false;
    mockRefresh.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows friendly empty copy when needsElron bucket is empty", async () => {
    renderTodayPage();
    await waitFor(() => {
      // Multiple cards may show this copy; all-by is correct
      const hints = screen.queryAllByText(/אין פריטים שדורשים תשומת לב עכשיו/);
      expect(hints.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders a link to /calls-today in the needsElron empty hint", async () => {
    renderTodayPage();
    const link = await screen.findByRole("link", {
      name: /עבור לשיחות המתוכננות להיום/,
    });
    expect(link).toBeTruthy();
    expect((link as HTMLAnchorElement).href).toMatch(/\/calls-today$/);
  });

  it("shows friendly empty copy when stuck bucket is empty", async () => {
    renderTodayPage();
    await waitFor(() => {
      expect(
        screen.getByText(/אין פריטים תקועים — הכל זורם/),
      ).toBeTruthy();
    });
  });
});

describe("TodayPage — attention queue error state", () => {
  beforeEach(() => {
    stubDirectusFetches();
    mockAttentionState.buckets = null;
    mockAttentionState.error = "שגיאה בטעינת מוקדי תשומת לב";
    mockAttentionState.loading = false;
    mockRefresh.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows honest error copy when attention hook fails", async () => {
    renderTodayPage();
    const errorMsgs = await screen.findAllByText(
      /לא הצלחנו לטעון תור תשומת-לב/,
    );
    expect(errorMsgs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a retry button in the error state", async () => {
    renderTodayPage();
    const retryBtns = await screen.findAllByRole("button", {
      name: "נסה שוב לטעון תור תשומת לב",
    });
    expect(retryBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("clicking retry calls the hook's refresh function", async () => {
    renderTodayPage();
    // There are 3 attention cards; all show the same retry button — click one.
    const retryBtns = await screen.findAllByRole("button", {
      name: "נסה שוב לטעון תור תשומת לב",
    });
    fireEvent.click(retryBtns[0]);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("TodayPage — attention queue stale state", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    mockAttentionState.buckets = null;
    mockAttentionState.error = null;
    mockAttentionState.loading = false;
  });

  it("does not show stale pill when data just loaded", async () => {
    stubDirectusFetches();
    mockAttentionState.buckets = { needsElron: [], needsRav: [], stuck: [] };
    mockAttentionState.error = null;
    mockAttentionState.loading = false;

    renderTodayPage();

    // Wait for the section header to appear
    await screen.findByRole("button", { name: "ריענון מוקדי תשומת לב" });

    // Fresh data — no stale pill (fetchedAt was just set, 0 minutes elapsed)
    expect(screen.queryByLabelText(/מידע מלפני \d+ דקות/)).toBeNull();
  });
});
