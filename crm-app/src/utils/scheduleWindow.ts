// Forward-looking schedule windowing for the Rabbi agenda (A4 Time Management).
//
// The call_queue `scheduled_date` column is a DATE (YYYY-MM-DD; see
// generateDailyQueue in useCallQueue.ts). Bucketing therefore works on the date
// portion of each value and compares date strings — this sidesteps instant/TZ
// edge cases entirely, since "which local day is this scheduled for" is already
// encoded in the stored date string.
//
// Day arithmetic for the agenda window uses UTC date math on the pure
// YYYY-MM-DD string, so it never drifts with the runtime timezone. Only the
// "what is today in Israel" anchor needs TZ awareness — that is israelDateStr.

import { ISRAEL_TZ } from "./dateWindow";

// Local Israel calendar date as YYYY-MM-DD for the instant `at`.
export function israelDateStr(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD; timeZone makes it the local Israel day.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

// `count` consecutive day strings starting at the local Israel day of `at`.
export function agendaDayStrs(count: number, at: Date = new Date()): string[] {
  const [y, m, d] = israelDateStr(at).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    // Date.UTC normalizes overflow (e.g. May 31 + 1 → June 1).
    out.push(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
  }
  return out;
}

export type DayKey = "overdue" | "today" | "tomorrow" | "upcoming";

// Classify a day string relative to today (both YYYY-MM-DD).
export function relativeDayKey(dayStr: string, todayStr: string): DayKey {
  if (dayStr < todayStr) return "overdue";
  if (dayStr === todayStr) return "today";
  const [y, m, d] = todayStr.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  if (dayStr === tomorrow) return "tomorrow";
  return "upcoming";
}

// Split scheduled items into an overdue bucket plus one bucket per agenda day.
// Items scheduled before today land in `overdue`; items within `days` land in
// `byDay[day]`; items beyond the window or without a date are dropped (the
// caller fetches only within the window, so out-of-window is defensive).
export function bucketByDay<T extends { scheduled_date?: string | null }>(
  items: T[],
  days: string[],
  todayStr: string,
): { overdue: T[]; byDay: Record<string, T[]> } {
  const byDay: Record<string, T[]> = {};
  for (const day of days) byDay[day] = [];
  const overdue: T[] = [];
  const dayset = new Set(days);

  for (const item of items) {
    const ds = (item.scheduled_date ?? "").slice(0, 10);
    if (!ds) continue;
    if (ds < todayStr) {
      overdue.push(item);
    } else if (dayset.has(ds)) {
      byDay[ds].push(item);
    }
    // else: beyond the agenda window — dropped.
  }
  return { overdue, byDay };
}
