import { describe, it, expect } from "vitest";
import {
  ISRAEL_TZ,
  tzOffsetMinutes,
  localDayStartIso,
  localDayEndIso,
  todayWindowIsrael,
} from "../dateWindow";

describe("dateWindow", () => {
  // 2026-05-11 falls inside Israel summer time (IDT, +03:00).
  // 2026-01-15 falls inside Israel standard time (IST, +02:00).
  const summerInstant = new Date("2026-05-11T12:00:00.000Z"); // 15:00 IDT
  const winterInstant = new Date("2026-01-15T12:00:00.000Z"); // 14:00 IST

  describe("tzOffsetMinutes", () => {
    it("returns +180 (DST) for Israel in May 2026", () => {
      expect(tzOffsetMinutes(ISRAEL_TZ, summerInstant)).toBe(180);
    });

    it("returns +120 (standard) for Israel in January 2026", () => {
      expect(tzOffsetMinutes(ISRAEL_TZ, winterInstant)).toBe(120);
    });

    it("returns 0 for UTC", () => {
      expect(tzOffsetMinutes("UTC", summerInstant)).toBe(0);
      expect(tzOffsetMinutes("UTC", winterInstant)).toBe(0);
    });
  });

  describe("localDayStartIso", () => {
    it("returns the UTC instant of midnight Israel summer time", () => {
      // Midnight 2026-05-11 IDT = 2026-05-10T21:00:00Z
      expect(localDayStartIso(ISRAEL_TZ, summerInstant)).toBe(
        "2026-05-10T21:00:00.000Z",
      );
    });

    it("returns the UTC instant of midnight Israel winter time", () => {
      // Midnight 2026-01-15 IST = 2026-01-14T22:00:00Z
      expect(localDayStartIso(ISRAEL_TZ, winterInstant)).toBe(
        "2026-01-14T22:00:00.000Z",
      );
    });

    it("returns the same UTC midnight for a UTC-zoned instant", () => {
      const utcNoon = new Date("2026-05-11T12:00:00.000Z");
      expect(localDayStartIso("UTC", utcNoon)).toBe("2026-05-11T00:00:00.000Z");
    });

    it("is stable when called right before local midnight", () => {
      // 2026-05-10T20:59:00Z = 2026-05-10T23:59:00 IDT — still 'today' (May 10) in Israel
      const justBefore = new Date("2026-05-10T20:59:00.000Z");
      expect(localDayStartIso(ISRAEL_TZ, justBefore)).toBe(
        "2026-05-09T21:00:00.000Z",
      );
    });

    it("rolls to next local day right at midnight Israel", () => {
      // 2026-05-10T21:00:00Z = 2026-05-11T00:00:00 IDT — now 'today' is May 11
      const atMidnight = new Date("2026-05-10T21:00:00.000Z");
      expect(localDayStartIso(ISRAEL_TZ, atMidnight)).toBe(
        "2026-05-10T21:00:00.000Z",
      );
    });
  });

  describe("localDayEndIso", () => {
    it("is exactly 24h after localDayStartIso for non-DST-transition days", () => {
      const start = localDayStartIso(ISRAEL_TZ, summerInstant);
      const end = localDayEndIso(ISRAEL_TZ, summerInstant);
      expect(new Date(end).getTime() - new Date(start).getTime()).toBe(
        24 * 60 * 60 * 1000,
      );
    });
  });

  describe("todayWindowIsrael", () => {
    it("returns a {startIso, endIso} pair bracketing the local Israeli day", () => {
      const { startIso, endIso } = todayWindowIsrael(summerInstant);
      expect(startIso).toBe("2026-05-10T21:00:00.000Z");
      expect(endIso).toBe("2026-05-11T21:00:00.000Z");
    });

    it("the input instant falls inside the returned window", () => {
      const at = summerInstant;
      const { startIso, endIso } = todayWindowIsrael(at);
      expect(at.getTime()).toBeGreaterThanOrEqual(new Date(startIso).getTime());
      expect(at.getTime()).toBeLessThan(new Date(endIso).getTime());
    });

    it("windows for consecutive Israeli midnights do not overlap", () => {
      const monday = new Date("2026-05-11T12:00:00.000Z");
      const tuesday = new Date("2026-05-12T12:00:00.000Z");
      const mon = todayWindowIsrael(monday);
      const tue = todayWindowIsrael(tuesday);
      expect(mon.endIso).toBe(tue.startIso);
    });
  });
});
