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

describe("TodayPage — pressure strip", () => {
  beforeEach(() => {
    mockAttentionState.error = null;
    mockAttentionState.loading = false;
    mockAttentionState.buckets = {
      needsElron: [
        {
          id: "a",
          title: "א",
          owner: "elron",
          urgency: "normal",
          status: "open",
          domain: "people",
          next_action: "לטפל",
        },
      ],
      needsRav: [
        {
          id: "b",
          title: "ב",
          owner: "rav",
          urgency: "low",
          status: "waiting",
          domain: "lessons",
          next_action: "להמתין",
        },
      ],
      stuck: [],
    };
  });

  it("renders compressed L0 pressure chips from the attention runtime", () => {
    renderTodayPage();
    expect(screen.getByText("אלרון")).toBeTruthy();
    expect(screen.getByText("הרב")).toBeTruthy();
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(2);
  });
});
