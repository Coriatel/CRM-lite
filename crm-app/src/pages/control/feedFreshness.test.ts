import { describe, it, expect } from "vitest";
import { classifyFeed, humanAgeHe } from "./feedFreshness";

const NOW = Date.parse("2026-06-05T12:00:00Z");
const iso = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();

describe("classifyFeed", () => {
  it("missing source is never trustworthy", () => {
    const f = classifyFeed({ present: false, slaSeconds: 600, nowMs: NOW });
    expect(f.level).toBe("missing");
    expect(f.trustworthy).toBe(false);
  });

  it("fresh content is live and trustworthy", () => {
    const f = classifyFeed({
      present: true,
      meta: { generated_at: iso(30) },
      slaSeconds: 600,
      nowMs: NOW,
    });
    expect(f.level).toBe("live");
    expect(f.trustworthy).toBe(true);
  });

  it("processes.json (22 days, advisory) is dead and NOT trustworthy — the core false-data fix", () => {
    const f = classifyFeed({
      present: true,
      meta: { last_verified: "2026-05-14T15:46Z", advisory: true },
      slaSeconds: 600,
      nowMs: NOW,
    });
    expect(f.level).toBe("dead");
    expect(f.trustworthy).toBe(false);
    expect(f.advisory).toBe(true);
    expect(f.reasonHe).toContain("ימים");
  });

  it("owner_gate_status (5 days, sla 1h) is dead, metric suppressed", () => {
    const f = classifyFeed({
      present: true,
      meta: { generated_at: "2026-05-31T05:52:29Z" },
      slaSeconds: 3600,
      nowMs: NOW,
    });
    expect(["stale", "dead"]).toContain(f.level);
    expect(f.trustworthy).toBe(false);
  });

  it("fresh FILE but stale upstream source is judged by the worst signal (active_sessions case)", () => {
    // file written 13s ago, but _meta.source_age_seconds = 10610 (~3h)
    const f = classifyFeed({
      present: true,
      meta: { ts: iso(13), source_age_seconds: 10610 },
      fileAgeSeconds: 13,
      slaSeconds: 600,
      nowMs: NOW,
    });
    // 10610 / 600 ≈ 17.7 → > 3×600 (stale), < 20×600 (dead) ⇒ stale, not live
    expect(f.level).toBe("stale");
    expect(f.trustworthy).toBe(false);
  });

  it("upstream source age drives the level, not the fresh file", () => {
    const f = classifyFeed({
      present: true,
      meta: { ts: iso(13), source_age_seconds: 10610 },
      fileAgeSeconds: 13,
      slaSeconds: 600,
      nowMs: NOW,
    });
    expect(f.trustworthy).toBe(false);
    expect(f.sourceAgeSeconds).toBe(10610);
  });

  it("present but undateable cannot be presented as live", () => {
    const f = classifyFeed({ present: true, meta: {}, slaSeconds: 600, nowMs: NOW });
    expect(f.trustworthy).toBe(false);
  });

  it("aging window still shows the value (trustworthy) with a warning", () => {
    const f = classifyFeed({
      present: true,
      meta: { generated_at: iso(900) }, // 1.5×sla
      slaSeconds: 600,
      nowMs: NOW,
    });
    expect(f.level).toBe("aging");
    expect(f.trustworthy).toBe(true);
  });

  it("_meta.error => dead", () => {
    const f = classifyFeed({
      present: true,
      meta: { generated_at: iso(10), error: "boom" },
      slaSeconds: 600,
      nowMs: NOW,
    });
    expect(f.level).toBe("dead");
    expect(f.trustworthy).toBe(false);
  });
});

describe("humanAgeHe", () => {
  it("formats buckets", () => {
    expect(humanAgeHe(null)).toBe("גיל לא ידוע");
    expect(humanAgeHe(30)).toBe("כעת");
    expect(humanAgeHe(600)).toContain("דק'");
    expect(humanAgeHe(7200)).toContain("שע'");
    expect(humanAgeHe(200000)).toContain("ימים");
  });
});
