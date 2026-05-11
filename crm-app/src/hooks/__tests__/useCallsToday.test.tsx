import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCallsToday } from "../useCallsToday";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("useCallsToday", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.includes("filter%5Bscheduled_date%5D%5B_gte%5D") &&
        url.includes("filter%5Bscheduled_date%5D%5B_lt%5D")
      ) {
        return jsonResponse({
          data: [{ id: "t1", status: "pending", priority: 2 }],
        });
      }
      if (url.includes("filter%5Bscheduled_date%5D%5B_lt%5D")) {
        return jsonResponse({
          data: [
            { id: "o1", status: "pending", priority: 1 },
            { id: "o2", status: "pending", priority: 1 },
          ],
        });
      }
      return jsonResponse({ data: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns separated today + overdue buckets", async () => {
    const { result } = renderHook(() => useCallsToday(50));
    await waitFor(() => expect(result.current.buckets).not.toBeNull());
    expect(result.current.buckets?.today.length).toBe(1);
    expect(result.current.buckets?.overdue.length).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it("exposes a refresh that re-runs the fetch", async () => {
    const { result } = renderHook(() => useCallsToday(50));
    await waitFor(() => expect(result.current.buckets).not.toBeNull());
    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .length;
    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.buckets).not.toBeNull());
    const after = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .length;
    expect(after).toBeGreaterThan(before);
  });

  it("sets error on fetch failure", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ errors: [{ message: "boom" }] }, 500),
    );
    const { result } = renderHook(() => useCallsToday(50));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/שגיאה/);
  });
});
