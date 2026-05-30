import { describe, it, expect } from "vitest";
import {
  israelDateStr,
  agendaDayStrs,
  relativeDayKey,
  bucketByDay,
  assembleSchedule,
  addDays,
} from "./scheduleWindow";

describe("addDays", () => {
  it("adds days and rolls over month/year boundaries", () => {
    expect(addDays("2026-05-29", 1)).toBe("2026-05-30");
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-05-29", 0)).toBe("2026-05-29");
  });
});

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

describe("assembleSchedule", () => {
  const at = new Date("2026-05-29T10:00:00Z");
  const upcoming = [
    { id: "u1", scheduled_date: "2026-05-29" }, // today
    { id: "u2", scheduled_date: "2026-05-30" }, // tomorrow
    { id: "u3", scheduled_date: "2026-06-01" }, // upcoming
  ];
  const overdueItems = [{ id: "o1", scheduled_date: "2026-05-20" }];

  it("returns todayStr, the passed overdue list, and labelled day buckets", () => {
    const s = assembleSchedule(upcoming, overdueItems, 4, at);
    expect(s.todayStr).toBe("2026-05-29");
    expect(s.overdue.map((i) => i.id)).toEqual(["o1"]);
    expect(s.days.map((d) => d.dateStr)).toEqual([
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
    ]);
    expect(s.days.map((d) => d.key)).toEqual([
      "today",
      "tomorrow",
      "upcoming",
      "upcoming",
    ]);
    expect(s.days[0].items.map((i) => i.id)).toEqual(["u1"]);
    expect(s.days[1].items.map((i) => i.id)).toEqual(["u2"]);
    expect(s.days[2].items).toEqual([]);
    expect(s.days[3].items.map((i) => i.id)).toEqual(["u3"]);
  });
});
