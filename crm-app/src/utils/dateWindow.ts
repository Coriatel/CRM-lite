// Tiny date-window helpers for Directus datetime filters.
//
// All Directus datetime columns are ISO strings (e.g. last_call_date is written
// via `new Date().toISOString()` in useContacts.ts). To filter "rows from a
// given local day", we need the UTC ISO instants that bracket that day in a
// specific timezone.
//
// Default zone is Asia/Jerusalem (the operational timezone for Merkaz Neshama).
// The standard offset is +02:00; with DST it becomes +03:00. We derive the
// offset from the runtime so the helper stays correct across the year without
// hardcoding a table.

export const ISRAEL_TZ = "Asia/Jerusalem";

// Returns the minutes offset (positive = ahead of UTC) for `tz` at instant `at`.
// Asia/Jerusalem returns 120 in standard time and 180 in DST.
export function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

// Returns the UTC ISO instant of `00:00:00.000` for the local day of `at` in `tz`.
// Example: tz=Asia/Jerusalem, at=2026-05-11T12:00:00Z (15:00 IDT) →
// "2026-05-10T21:00:00.000Z" (because midnight IDT on 2026-05-11 is 21:00 UTC the day before).
export function localDayStartIso(
  tz: string = ISRAEL_TZ,
  at: Date = new Date(),
): string {
  const offsetMin = tzOffsetMinutes(tz, at);
  // Wall clock in `tz` at `at`:
  const localMs = at.getTime() + offsetMin * 60000;
  const local = new Date(localMs);
  // Reset to local midnight by zeroing UTC-fields of the shifted instant:
  local.setUTCHours(0, 0, 0, 0);
  // Shift back to UTC:
  return new Date(local.getTime() - offsetMin * 60000).toISOString();
}

// Returns `localDayStartIso(tz, at + 1 local day)`. Use as the exclusive upper
// bound when filtering "today only" (filter[col][_gte]=start & [_lt]=end).
export function localDayEndIso(
  tz: string = ISRAEL_TZ,
  at: Date = new Date(),
): string {
  const start = new Date(localDayStartIso(tz, at));
  // Add 24 hours of wall time. DST transitions inside the window are rare for
  // a single-day signal and the consumer should accept a ±1 hour window twice
  // a year as acceptable for "calls today" UX.
  return new Date(start.getTime() + 24 * 60 * 60000).toISOString();
}

// Convenience: today's window in Israel time.
export function todayWindowIsrael(at: Date = new Date()): {
  startIso: string;
  endIso: string;
} {
  return {
    startIso: localDayStartIso(ISRAEL_TZ, at),
    endIso: localDayEndIso(ISRAEL_TZ, at),
  };
}
