import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { DailyAgenda, AgendaItem, AgendaBucket, AgendaItemKind } from "../../data/dailyAgenda";

const useDailyAgenda = vi.fn();
vi.mock("../../data/useDailyAgenda", () => ({
  useDailyAgenda: () => useDailyAgenda(),
}));

const updateMeeting = vi.fn();
const updateReminder = vi.fn();
vi.mock("../../services/directus", () => ({
  updateMeeting: (...a: unknown[]) => updateMeeting(...a),
  updateReminder: (...a: unknown[]) => updateReminder(...a),
}));

import { RabbiDayCard } from "../dashboard/RabbiDayCard";

function aitem(
  id: string,
  bucket: AgendaBucket,
  due: string,
  title = id,
  kind: AgendaItemKind = "follow_up",
): AgendaItem {
  return { id, kind, title, due, bucket, contact_id: id };
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

beforeEach(() => {
  useDailyAgenda.mockReset();
  updateMeeting.mockReset().mockResolvedValue({ id: "x" });
  updateReminder.mockReset().mockResolvedValue({ id: "x" });
});

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

  it("renders its own heading by default (standalone /rabbi)", () => {
    useDailyAgenda.mockReturnValue({ agenda: agenda(), loading: false, error: null, refresh: () => {} });
    render(<RabbiDayCard />);
    expect(screen.getByTestId("rabbi-day-header")).toBeTruthy();
  });

  it("suppresses its own heading when hideHeading (embedded in TodaySection on /today)", () => {
    useDailyAgenda.mockReturnValue({ agenda: agenda(), loading: false, error: null, refresh: () => {} });
    render(<RabbiDayCard hideHeading />);
    expect(screen.queryByTestId("rabbi-day-header")).toBeNull();
    // card body still renders
    expect(screen.getByTestId("rabbi-day-count-overdue")).toBeTruthy();
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

  it("shows a mark-done action only on meeting/reminder rows, not follow-up rows", () => {
    const a = agenda({
      today: [
        aitem("follow_up:c1", "today", "2026-05-29", "מעקב", "follow_up"),
        aitem("meeting:m1", "today", "2026-05-29", "פגישה", "meeting"),
        aitem("reminder:r1", "today", "2026-05-29", "תזכורת", "reminder"),
      ],
    });
    useDailyAgenda.mockReturnValue({ agenda: a, loading: false, error: null, refresh: () => {} });
    render(<RabbiDayCard />);
    // only the meeting + reminder rows expose the button (follow_up does not)
    expect(screen.getAllByTestId("rabbi-day-mark-done").length).toBe(2);
  });

  it("marks a meeting done via updateMeeting (raw id, status=done) then refreshes", async () => {
    const refresh = vi.fn();
    const a = agenda({
      today: [aitem("meeting:m-uuid", "today", "2026-05-29", "פגישה", "meeting")],
    });
    useDailyAgenda.mockReturnValue({ agenda: a, loading: false, error: null, refresh });
    render(<RabbiDayCard />);
    fireEvent.click(screen.getByTestId("rabbi-day-mark-done"));
    await waitFor(() => expect(updateMeeting).toHaveBeenCalledWith("m-uuid", { status: "done" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("marks a reminder done via updateReminder", async () => {
    const a = agenda({
      today: [aitem("reminder:r-uuid", "today", "2026-05-29", "תזכורת", "reminder")],
    });
    useDailyAgenda.mockReturnValue({ agenda: a, loading: false, error: null, refresh: () => {} });
    render(<RabbiDayCard />);
    fireEvent.click(screen.getByTestId("rabbi-day-mark-done"));
    await waitFor(() => expect(updateReminder).toHaveBeenCalledWith("r-uuid", { status: "done" }));
  });

  it("surfaces an error when the status update fails", async () => {
    updateMeeting.mockRejectedValueOnce(new Error("boom"));
    const a = agenda({
      today: [aitem("meeting:m1", "today", "2026-05-29", "פגישה", "meeting")],
    });
    useDailyAgenda.mockReturnValue({ agenda: a, loading: false, error: null, refresh: () => {} });
    render(<RabbiDayCard />);
    fireEvent.click(screen.getByTestId("rabbi-day-mark-done"));
    await waitFor(() => expect(screen.getByTestId("rabbi-day-action-error")).toBeTruthy());
  });
});
