import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DailyAgenda, AgendaItem, AgendaBucket } from "../../data/dailyAgenda";

const useDailyAgenda = vi.fn();
vi.mock("../../data/useDailyAgenda", () => ({
  useDailyAgenda: () => useDailyAgenda(),
}));

import { RabbiDayCard } from "../dashboard/RabbiDayCard";

function aitem(id: string, bucket: AgendaBucket, due: string, title = id): AgendaItem {
  return { id, kind: "follow_up", title, due, bucket, contact_id: id };
}

function agenda(over: Partial<DailyAgenda> = {}): DailyAgenda {
  const overdue = over.overdue ?? [];
  const today = over.today ?? [];
  const upcoming = over.upcoming ?? [];
  return {
    date: "2026-05-29",
    overdue,
    today,
    upcoming,
    counts: {
      overdue: overdue.length,
      today: today.length,
      upcoming: upcoming.length,
      total: overdue.length + today.length + upcoming.length,
    },
    generated_at: "2026-05-29T09:00:00.000Z",
    source: "substrate-derived",
    ...over,
  };
}

beforeEach(() => useDailyAgenda.mockReset());

describe("RabbiDayCard", () => {
  it("shows loading state", () => {
    useDailyAgenda.mockReturnValue({ agenda: null, loading: true, error: null, refresh: () => {} });
    render(<RabbiDayCard />);
    expect(screen.getByTestId("rabbi-day-loading")).toBeTruthy();
  });

  it("shows error state", () => {
    useDailyAgenda.mockReturnValue({ agenda: null, loading: false, error: "שגיאה", refresh: () => {} });
    render(<RabbiDayCard />);
    expect(screen.getByTestId("rabbi-day-error").textContent).toContain("שגיאה");
  });

  it("shows empty state when no items", () => {
    useDailyAgenda.mockReturnValue({ agenda: agenda(), loading: false, error: null, refresh: () => {} });
    render(<RabbiDayCard />);
    expect(screen.getByTestId("rabbi-day-empty")).toBeTruthy();
  });

  it("renders counts and most-urgent items (overdue first, capped at 5)", () => {
    const a = agenda({
      overdue: [aitem("o1", "overdue", "2026-05-27"), aitem("o2", "overdue", "2026-05-28")],
      today: [aitem("t1", "today", "2026-05-29")],
      upcoming: [
        aitem("u1", "upcoming", "2026-05-30"),
        aitem("u2", "upcoming", "2026-05-31"),
        aitem("u3", "upcoming", "2026-06-01"),
      ],
    });
    useDailyAgenda.mockReturnValue({ agenda: a, loading: false, error: null, refresh: () => {} });
    render(<RabbiDayCard />);
    expect(screen.getByTestId("rabbi-day-count-overdue").textContent).toContain("2");
    expect(screen.getByTestId("rabbi-day-count-today").textContent).toContain("1");
    expect(screen.getByTestId("rabbi-day-count-upcoming").textContent).toContain("3");
    // 6 items total, capped at 5
    const rows = screen.getAllByTestId("rabbi-day-item");
    expect(rows.length).toBe(5);
    // most-urgent ordering: first row is an overdue item
    expect(rows[0].textContent).toContain("o1");
  });
});
