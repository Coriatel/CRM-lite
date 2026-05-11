import { describe, it, expect } from "vitest";
import { relativeFromNow, clockIsrael } from "../relativeTime";

const NOW = new Date("2026-05-11T10:00:00Z");

describe("relativeFromNow", () => {
  it("returns empty string for undefined / invalid", () => {
    expect(relativeFromNow(undefined, NOW)).toBe("");
    expect(relativeFromNow("nope", NOW)).toBe("");
  });

  it("formats minutes in the past", () => {
    const out = relativeFromNow("2026-05-11T09:30:00Z", NOW);
    expect(out).toMatch(/דק/);
  });

  it("formats hours in the past", () => {
    const out = relativeFromNow("2026-05-11T05:00:00Z", NOW);
    expect(out).toMatch(/שע/);
  });

  it("formats days in the past for >24h", () => {
    const out = relativeFromNow("2026-05-09T10:00:00Z", NOW);
    // RTF with numeric:auto may return "שלשום" / "אתמול" / "לפני N ימים".
    expect(out).toMatch(/שלשום|אתמול|ימים|יומ/);
  });

  it("formats future minutes positively", () => {
    const out = relativeFromNow("2026-05-11T10:30:00Z", NOW);
    expect(out).toBeTruthy();
  });
});

describe("clockIsrael", () => {
  it("returns HH:MM in Israel time", () => {
    // 10:00 UTC = 13:00 IDT (summer)
    expect(clockIsrael("2026-05-11T10:00:00Z")).toBe("13:00");
  });

  it("returns empty for undefined / invalid", () => {
    expect(clockIsrael(undefined)).toBe("");
    expect(clockIsrael("bad")).toBe("");
  });
});
