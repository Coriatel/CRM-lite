import { describe, it, expect } from "vitest";
import {
  hasPushIsolationSnapshot,
  isPushIsolationStale,
  pushIsolationAgeHours,
  PUSH_ISOLATION_STALE_HOURS,
} from "./OpsPage";

const NOW = new Date("2026-05-16T12:00:00Z");

describe("push-isolation snapshot helpers", () => {
  it("treats null/empty as absent", () => {
    expect(hasPushIsolationSnapshot(null)).toBe(false);
    expect(hasPushIsolationSnapshot({})).toBe(false);
    expect(hasPushIsolationSnapshot({ ts: "" })).toBe(false);
  });

  it("recognizes a real snapshot", () => {
    expect(hasPushIsolationSnapshot({ ts: "2026-05-16T11:00:00Z" })).toBe(true);
  });

  it("computes age in hours", () => {
    const snap = { ts: "2026-05-16T10:00:00Z" };
    expect(pushIsolationAgeHours(snap, NOW)).toBeCloseTo(2, 5);
  });

  it("returns null age for missing/invalid ts", () => {
    expect(pushIsolationAgeHours(null, NOW)).toBeNull();
    expect(pushIsolationAgeHours({ ts: "not-a-date" }, NOW)).toBeNull();
  });

  it("flags stale when older than threshold", () => {
    const fresh = { ts: "2026-05-16T11:30:00Z" };
    const stale = { ts: "2026-05-16T09:30:00Z" };
    expect(isPushIsolationStale(fresh, NOW)).toBe(false);
    expect(isPushIsolationStale(stale, NOW)).toBe(true);
  });

  it("treats missing snapshot as stale", () => {
    expect(isPushIsolationStale(null, NOW)).toBe(true);
  });

  it("stale threshold is documented as 2h", () => {
    expect(PUSH_ISOLATION_STALE_HOURS).toBe(2);
  });
});
