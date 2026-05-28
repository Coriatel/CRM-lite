import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { TodayPage } from "../TodayPage";
import type { AttentionBuckets } from "../../data/amutaAttention";

const mockAttentionState = {
  buckets: null as AttentionBuckets | null,
  source: null as string | null,
  error: null as string | null,
  loading: false,
  refresh: vi.fn(),
};

vi.mock("../../data/useAmutaAttention", () => ({
  useAmutaAttention: () => mockAttentionState,
}));

function renderTodayPage() {
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route element={<Outlet context={{ setAdvancedFilters: vi.fn() }} />}>
          <Route path="/today" element={<TodayPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const item = {
  id: "attn-1",
  title: "שרה כהן · אין קשר 21 ימים",
  owner: "elron" as const,
  urgency: "high" as const,
  status: "open" as const,
  domain: "people" as const,
  next_action: "הבנת מצב ופתיחת שיחה אישית",
  context: {
    why_now: "הקשר התקרר מעבר לסף שהוגדר לקהילה.",
  },
};

describe("TodayPage — MN-OS operational root", () => {
  beforeEach(() => {
    mockAttentionState.buckets = {
      needsElron: [item],
      needsRav: [],
      stuck: [],
    };
    mockAttentionState.error = null;
    mockAttentionState.loading = false;
    mockAttentionState.refresh.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Today as the operational root with one live attention workflow", () => {
    renderTodayPage();
    expect(screen.getByRole("heading", { name: /היום/ })).toBeTruthy();
    expect(screen.getByText("תשומת לב")).toBeTruthy();
    expect(screen.getByTestId("today-workflow-card")).toBeTruthy();
    expect(screen.getByText("שרה כהן · אין קשר 21 ימים")).toBeTruthy();
  });

  it("opens a folded L2 workflow sheet when tapping the card body", async () => {
    renderTodayPage();
    fireEvent.click(screen.getByTestId("today-workflow-card"));
    expect(await screen.findByTestId("today-workflow-sheet")).toBeTruthy();
    expect(screen.getByText("L2 · הקשר תפעולי")).toBeTruthy();
    expect(screen.getByText("למה זה כאן")).toBeTruthy();
    expect(screen.getAllByText("הקשר התקרר מעבר לסף שהוגדר לקהילה.").length).toBeGreaterThanOrEqual(1);
  });

  it("closes the L2 workflow sheet without mutating data", async () => {
    renderTodayPage();
    fireEvent.click(screen.getByTestId("today-workflow-card"));
    const close = await screen.findByRole("button", { name: "חזרה להיום" });
    fireEvent.click(close);
    expect(screen.queryByTestId("today-workflow-sheet")).toBeNull();
  });

  it("renders an honest empty state without fabricating cards", () => {
    mockAttentionState.buckets = { needsElron: [], needsRav: [], stuck: [] };
    renderTodayPage();
    expect(screen.getByTestId("today-attention-empty")).toBeTruthy();
    expect(screen.queryByTestId("today-workflow-card")).toBeNull();
  });

  it("renders an honest error state without falling back to /ops", () => {
    mockAttentionState.buckets = null;
    mockAttentionState.error = "boom";
    renderTodayPage();
    expect(screen.getByTestId("today-attention-error")).toBeTruthy();
    expect(screen.queryByText(/MN-OS · Ops/)).toBeNull();
  });
});
