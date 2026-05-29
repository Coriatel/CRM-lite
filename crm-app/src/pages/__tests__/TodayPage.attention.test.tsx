import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("TodayPage — attention folding", () => {
  beforeEach(() => {
    mockAttentionState.error = null;
    mockAttentionState.loading = false;
  });

  it("prefers operator-owned attention before stuck and rabbi buckets", () => {
    mockAttentionState.buckets = {
      needsElron: [
        {
          id: "elron-1",
          title: "פריט אלרון",
          owner: "elron",
          urgency: "normal",
          status: "open",
          domain: "tasks",
          next_action: "לטפל",
        },
      ],
      stuck: [
        {
          id: "stuck-1",
          title: "פריט תקוע",
          owner: "system",
          urgency: "critical",
          status: "blocked",
          domain: "runtime",
          next_action: "לבדוק",
        },
      ],
      needsRav: [],
    };
    renderTodayPage();
    expect(screen.getByText("פריט אלרון")).toBeTruthy();
    expect(screen.queryByText("פריט תקוע")).toBeNull();
  });

  it("surfaces the stuck bucket when no operator-owned item exists", () => {
    mockAttentionState.buckets = {
      needsElron: [],
      stuck: [
        {
          id: "stuck-1",
          title: "פריט תקוע",
          owner: "system",
          urgency: "critical",
          status: "blocked",
          domain: "runtime",
          next_action: "לבדוק",
        },
      ],
      needsRav: [],
    };
    renderTodayPage();
    expect(screen.getByText("פריט תקוע")).toBeTruthy();
  });
});
