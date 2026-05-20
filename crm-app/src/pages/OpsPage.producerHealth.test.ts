import { describe, it, expect } from "vitest";
import { summarizeProducerHealth } from "./OpsPage";

describe("summarizeProducerHealth", () => {
  it("returns null when doc is null", () => {
    expect(summarizeProducerHealth(null)).toBeNull();
  });

  it("tolerates the {} default envelope (vault absent at build)", () => {
    const s = summarizeProducerHealth({})!;
    expect(s.total).toBe(0);
    expect(s.writers).toBe(0);
    expect(s.actionable).toEqual([]);
    expect(s.withoutProducer).toEqual([]);
  });

  it("splits actionable (error/warn) from projection-without-producer", () => {
    const s = summarizeProducerHealth({
      manifest_writers: 12,
      violation_count: 3,
      by_severity: { error: 0, warn: 1, info: 2 },
      violations: [
        { code: "WARN_STALE", severity: "warn", writer: "mn-os-x", projection: "state/a.json", age_seconds: 4452 },
        { code: "PROJECTION_WITHOUT_PRODUCER", severity: "info", projection: "state/b.json" },
        { code: "PROJECTION_WITHOUT_PRODUCER", severity: "info", projection: "state/c.json" },
      ],
    })!;
    expect(s.writers).toBe(12);
    expect(s.total).toBe(3);
    expect(s.warn).toBe(1);
    expect(s.info).toBe(2);
    expect(s.actionable).toHaveLength(1);
    expect(s.actionable[0].projection).toBe("state/a.json");
    expect(s.withoutProducer).toHaveLength(2);
  });

  it("falls back to violations.length when violation_count is absent", () => {
    const s = summarizeProducerHealth({
      violations: [{ code: "WARN_STALE", severity: "warn" }],
    })!;
    expect(s.total).toBe(1);
  });
});
