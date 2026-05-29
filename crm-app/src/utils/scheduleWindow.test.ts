import { describe, it, expect } from "vitest";
import {
  israelDateStr,
  agendaDayStrs,
  relativeDayKey,
  bucketByDay,
} from "./scheduleWindow";

describe("israelDateStr", () => {
  it("returns the local Israel calendar date as YYYY-MM-DD", () => {
    // 2026-05-29 10:00 UTC → 13:00 IDT (+03:00) → same day
    expect(israelDateStr(new Date("2026-05-29T10:00:00Z"))).toBe("2026-05-29");
  });

  it("rolls to the next day after local midnight (TZ-aware)", () => {
    // 2026-05-29 22:30 UTC → 01:30 IDT on 2026-05-30
    expect(israelDateStr(new Date("2026-05-29T22:30:00Z"))).toBe("2026-05-30");
  });
});

describe("agendaDayStrs", () => {
  it("returns `count` consecutive local day strings starting today", () => {
    const at = new Date("2026-05-29T10:00:00Z");
    expect(agendaDayStrs(3, at)).toEqual([
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
    ]);
  });

  it("rolls over month boundaries", () => {
    const at = new Date("2026-05-31T10:00:00Z");
    expect(agendaDayStrs(2, at)).toEqual(["2026-05-31", "2026-06-01"]);
  });
});

describe("relativeDayKey", () => {
  const today = "2026-05-29";
  it("classifies overdue, today, tomorrow, and upcoming", () => {
    expect(relativeDayKey("2026-05-28", today)).toBe("overdue");
    expect(relativeDayKey("2026-05-29", today)).toBe("today");
    expect(relativeDayKey("2026-05-30", today)).toBe("tomorrow");
    expect(relativeDayKey("2026-06-02", today)).toBe("upcoming");
  });
});

describe("bucketByDay", () => {
  const today = "2026-05-29";
  const days = ["2026-05-29", "2026-05-30", "2026-05-31"];
  const items = [
    { id: "a", scheduled_date: "2026-05-27" }, // overdue
    { id: "b", scheduled_date: "2026-05-29T00:00:00Z" }, // today (datetime form)
    { id: "c", scheduled_date: "2026-05-30" }, // tomorrow
    { id: "d", scheduled_date: "2026-06-10" }, // beyond window → dropped
    { id: "e", scheduled_date: undefined }, // no date → dropped
  ];

  it("splits items into an overdue bucket and per-day buckets", () => {
    const { overdue, byDay } = bucketByDay(items, days, today);
    expect(overdue.map((i) => i.id)).toEqual(["a"]);
    expect(byDay["2026-05-29"].map((i) => i.id)).toEqual(["b"]);
    expect(byDay["2026-05-30"].map((i) => i.id)).toEqual(["c"]);
    expect(byDay["2026-05-31"]).toEqual([]);
  });

  it("drops items outside the window and items without a date", () => {
    const { overdue, byDay } = bucketByDay(items, days, today);
    const allBucketed = [
      ...overdue,
      ...Object.values(byDay).flat(),
    ].map((i) => i.id);
    expect(allBucketed).not.toContain("d");
    expect(allBucketed).not.toContain("e");
  });
});
