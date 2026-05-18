import { describe, it, expect } from "vitest";
import {
  hasPushIsolationSnapshot,
  isPushIsolationStale,
  pushIsolationAgeHours,
  PUSH_ISOLATION_STALE_HOURS,
  classifyPushIsolationForOperator,
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

describe("classifyPushIsolationForOperator", () => {
  it("no_snapshot when snap is null/empty", () => {
    const v = classifyPushIsolationForOperator(null, NOW);
    expect(v.topCategory).toBe("no_snapshot");
    expect(v.severity).toBe("watch");
    expect(v.headline).toContain("אין נתוני");
  });

  it("stale_snapshot when ts is older than 2h", () => {
    const v = classifyPushIsolationForOperator(
      { ts: "2026-05-16T09:00:00Z", coverage_pct: 100 },
      NOW,
    );
    expect(v.topCategory).toBe("stale_snapshot");
    expect(v.severity).toBe("watch");
  });

  it("no_snapshot when fresh but coverage_pct missing", () => {
    const v = classifyPushIsolationForOperator({ ts: "2026-05-16T11:00:00Z" }, NOW);
    expect(v.topCategory).toBe("no_snapshot");
  });

  it("low_coverage when fresh and coverage < 50%", () => {
    const v = classifyPushIsolationForOperator(
      { ts: "2026-05-16T11:30:00Z", coverage_pct: 30 },
      NOW,
    );
    expect(v.topCategory).toBe("low_coverage");
    expect(v.severity).toBe("action");
    expect(v.nextAction).toContain("untrailed");
  });

  it("partial_coverage when fresh and 50% <= coverage < 100%", () => {
    const v = classifyPushIsolationForOperator(
      { ts: "2026-05-16T11:30:00Z", coverage_pct: 75 },
      NOW,
    );
    expect(v.topCategory).toBe("partial_coverage");
    expect(v.severity).toBe("watch");
  });

  it("partial_coverage at boundary (exactly 50%)", () => {
    const v = classifyPushIsolationForOperator(
      { ts: "2026-05-16T11:30:00Z", coverage_pct: 50 },
      NOW,
    );
    expect(v.topCategory).toBe("partial_coverage");
  });

  it("all_clear when fresh and coverage is 100%", () => {
    const v = classifyPushIsolationForOperator(
      { ts: "2026-05-16T11:30:00Z", coverage_pct: 100 },
      NOW,
    );
    expect(v.topCategory).toBe("all_clear");
    expect(v.severity).toBe("info");
    expect(v.nextAction).toContain("אין צורך");
  });

  it("low_coverage trumps fresh-but-incomplete data only when actually low", () => {
    // 49% just under threshold
    const v = classifyPushIsolationForOperator(
      { ts: "2026-05-16T11:30:00Z", coverage_pct: 49 },
      NOW,
    );
    expect(v.topCategory).toBe("low_coverage");
  });

  it("stale takes precedence over coverage (signal cannot be trusted)", () => {
    const v = classifyPushIsolationForOperator(
      { ts: "2026-05-16T09:00:00Z", coverage_pct: 10 },
      NOW,
    );
    expect(v.topCategory).toBe("stale_snapshot");
  });

  it("returns headline/meaning/nextAction strings for every category", () => {
    const fresh = { ts: "2026-05-16T11:30:00Z", coverage_pct: 100 };
    const v = classifyPushIsolationForOperator(fresh, NOW);
    expect(typeof v.headline).toBe("string");
    expect(v.headline.length).toBeGreaterThan(0);
    expect(typeof v.meaning).toBe("string");
    expect(v.meaning.length).toBeGreaterThan(0);
    expect(typeof v.nextAction).toBe("string");
    expect(v.nextAction.length).toBeGreaterThan(0);
  });
});
