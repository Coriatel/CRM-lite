import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRabbiSchedule } from "../useRabbiSchedule";
import { israelDateStr, agendaDayStrs } from "../../utils/scheduleWindow";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("useRabbiSchedule", () => {
  const today = israelDateStr();
  const [d0, d1] = agendaDayStrs(2);

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      // Forward window query carries both _gte and _lt.
      if (
        url.includes("filter%5Bscheduled_date%5D%5B_gte%5D") &&
        url.includes("filter%5Bscheduled_date%5D%5B_lt%5D")
      ) {
        return jsonResponse({
          data: [
            { id: "u-today", status: "pending", priority: 2, scheduled_date: d0 },
            { id: "u-tom", status: "pending", priority: 2, scheduled_date: d1 },
          ],
        });
      }
      // Overdue query carries only _lt.
      if (url.includes("filter%5Bscheduled_date%5D%5B_lt%5D")) {
        return jsonResponse({
          data: [{ id: "o1", status: "pending", priority: 1, scheduled_date: "2020-01-01" }],
        });
      }
      return jsonResponse({ data: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buckets upcoming work by day and surfaces overdue separately", async () => {
    const { result } = renderHook(() => useRabbiSchedule(7, 50));
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    const s = result.current.schedule!;
    expect(s.todayStr).toBe(today);
    expect(s.overdue.map((i) => i.id)).toEqual(["o1"]);
    expect(s.days).toHaveLength(7);
    expect(s.days[0].items.map((i) => i.id)).toEqual(["u-today"]);
    expect(s.days[1].items.map((i) => i.id)).toEqual(["u-tom"]);
    expect(result.current.error).toBeNull();
  });

  it("exposes a refresh that re-runs the fetch", async () => {
    const { result } = renderHook(() => useRabbiSchedule(7, 50));
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .length;
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.schedule).not.toBeNull());
    const after = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .length;
    expect(after).toBeGreaterThan(before);
  });

  it("sets a Hebrew error on fetch failure", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ errors: [{ message: "boom" }] }, 500),
    );
    const { result } = renderHook(() => useRabbiSchedule(7, 50));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/שגיאה/);
  });
});
