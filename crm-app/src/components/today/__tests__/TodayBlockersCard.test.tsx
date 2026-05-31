import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TodayBlockersCard } from "../TodayBlockersCard";

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TodayBlockersCard", () => {
  it("renders owner-curated blockers from the shared attention_synthesis feed", async () => {
    mockFetchOnce(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              { id: "b1", title: "חסם של הבעלים", source: "blockers", rank_score: 9 },
              { id: "r1", title: "פער ריצה", source: "runtime-issues", rank_score: 4 },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    render(<TodayBlockersCard />);
    await waitFor(() => expect(screen.getByTestId("today-blockers")).toBeTruthy());
    expect(screen.getByText("חסם של הבעלים")).toBeTruthy();
    expect(screen.getByText("פער ריצה")).toBeTruthy();
  });

  it("renders an honest error state when the feed is unavailable", async () => {
    mockFetchOnce(() => Promise.resolve(new Response("nope", { status: 404 })));
    render(<TodayBlockersCard />);
    await waitFor(() =>
      expect(screen.getByTestId("today-blockers-error")).toBeTruthy(),
    );
  });
});
