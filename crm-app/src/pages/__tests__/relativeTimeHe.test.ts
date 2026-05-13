import { describe, it, expect } from "vitest";
import { relativeTimeHe } from "../OpsPage";

const NOW = new Date("2026-05-13T04:00:00Z");

describe("relativeTimeHe", () => {
  it("returns 'עכשיו' for under a minute ago", () => {
    expect(relativeTimeHe("2026-05-13T03:59:50Z", NOW)).toBe("עכשיו");
  });
  it("returns minutes for under an hour", () => {
    expect(relativeTimeHe("2026-05-13T03:45:00Z", NOW)).toBe("לפני 15 דק'");
  });
  it("returns hours for under a day", () => {
    expect(relativeTimeHe("2026-05-13T01:00:00Z", NOW)).toBe("לפני 3 שע'");
  });
  it("returns days for under a week", () => {
    expect(relativeTimeHe("2026-05-10T04:00:00Z", NOW)).toBe("לפני 3 ימים");
  });
  it("falls back to ISO date for older than a week", () => {
    expect(relativeTimeHe("2026-04-01T12:00:00Z", NOW)).toBe("2026-04-01");
  });
  it("returns raw input on invalid date", () => {
    expect(relativeTimeHe("not-a-date", NOW)).toBe("not-a-date");
  });
});
