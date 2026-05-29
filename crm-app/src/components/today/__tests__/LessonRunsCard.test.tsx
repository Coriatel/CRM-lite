import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LessonRunsCard } from "../LessonRunsCard";

function mockFetch(doc: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        json: () => Promise.resolve(doc),
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LessonRunsCard — read-only lesson runtime projection", () => {
  it("shows honest 'not yet active' state when producer hasn't run (source=unavailable)", async () => {
    mockFetch({ _meta: { source: "unavailable" }, summary: { total_runs: 0 }, attention: [] });
    render(<LessonRunsCard />);
    expect(await screen.findByTestId("today-lessons-unavailable")).toBeTruthy();
  });

  it("renders run-state summary and attention items when populated", async () => {
    mockFetch({
      _meta: { source: "windmill_jobs_api+derived" },
      summary: { total_runs: 3, by_state: { published: 2, stalled: 1 }, attention_count: 1 },
      attention: [
        { kind: "lesson_stalled", severity: "high", state: "stalled", run_id: "j5", lesson: "shiur-stuck.mp4" },
      ],
    });
    render(<LessonRunsCard />);
    expect(await screen.findByTestId("today-lessons-card")).toBeTruthy();
    expect(screen.getByTestId("today-lessons-attention").textContent).toContain("shiur-stuck.mp4");
    expect(screen.getByText(/פורסם: 2/)).toBeTruthy();
  });

  it("shows quiet empty state when source present but zero runs", async () => {
    mockFetch({ _meta: { source: "windmill_jobs_api+derived" }, summary: { total_runs: 0, by_state: {} }, attention: [] });
    render(<LessonRunsCard />);
    expect(await screen.findByTestId("today-lessons-empty")).toBeTruthy();
  });

  it("shows honest error state when the projection file is missing", async () => {
    mockFetch({}, false);
    render(<LessonRunsCard />);
    expect(await screen.findByTestId("today-lessons-error")).toBeTruthy();
  });
});
