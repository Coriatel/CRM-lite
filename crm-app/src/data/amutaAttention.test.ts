import { describe, it, expect } from "vitest";
import {
  bucketAttention,
  classifyAttentionBucketForOperator,
  type AttentionItem,
} from "./amutaAttention";

const item = (over: Partial<AttentionItem>): AttentionItem => ({
  id: "x",
  title: "t",
  owner: "elron",
  urgency: "normal",
  status: "open",
  domain: "tasks",
  next_action: "do",
  ...over,
});

describe("bucketAttention", () => {
  it("splits items by owner and excludes done", () => {
    const items = [
      item({ id: "a", owner: "elron" }),
      item({ id: "b", owner: "rav" }),
      item({ id: "c", owner: "elron", status: "done" }),
      item({ id: "d", owner: "system" }),
    ];
    const b = bucketAttention(items);
    expect(b.needsElron.map((i) => i.id)).toEqual(["a"]);
    expect(b.needsRav.map((i) => i.id)).toEqual(["b"]);
  });

  it("places blocked and stale items in stuck regardless of owner", () => {
    const items = [
      item({ id: "a", status: "blocked", owner: "system" }),
      item({ id: "b", status: "stale", owner: "elron" }),
      item({ id: "c", status: "open", owner: "rav" }),
    ];
    const b = bucketAttention(items);
    expect(b.stuck.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("sorts each bucket by urgency (critical first)", () => {
    const items = [
      item({ id: "low", urgency: "low", owner: "elron" }),
      item({ id: "crit", urgency: "critical", owner: "elron" }),
      item({ id: "norm", urgency: "normal", owner: "elron" }),
    ];
    const b = bucketAttention(items);
    expect(b.needsElron.map((i) => i.id)).toEqual(["crit", "norm", "low"]);
  });
});

describe("classifyAttentionBucketForOperator", () => {
  it("returns empty/info when the bucket has no items", () => {
    const v = classifyAttentionBucketForOperator([]);
    expect(v.topCategory).toBe("empty");
    expect(v.severity).toBe("info");
    expect(v.headline).toMatch(/אין כרגע משימות פתוחות/);
  });

  it("returns critical_present/action when any item is urgency=critical", () => {
    const v = classifyAttentionBucketForOperator([
      item({ id: "1", urgency: "critical", status: "open" }),
      item({ id: "2", urgency: "normal", status: "open" }),
    ]);
    expect(v.topCategory).toBe("critical_present");
    expect(v.severity).toBe("action");
    expect(v.headline).toMatch(/דחופות מאוד \(1\)/);
  });

  it("returns blocked_present/action when status=blocked and no critical", () => {
    const v = classifyAttentionBucketForOperator([
      item({ id: "1", urgency: "normal", status: "blocked" }),
      item({ id: "2", urgency: "normal", status: "open" }),
    ]);
    expect(v.topCategory).toBe("blocked_present");
    expect(v.severity).toBe("action");
    expect(v.headline).toMatch(/חסומות שדורשות טיפול \(1\)/);
  });

  it("prefers critical_present over blocked_present when both present", () => {
    const v = classifyAttentionBucketForOperator([
      item({ id: "1", urgency: "critical", status: "open" }),
      item({ id: "2", urgency: "normal", status: "blocked" }),
    ]);
    expect(v.topCategory).toBe("critical_present");
    expect(v.categories).toContain("blocked_present");
  });

  it("returns stale_present/watch when stale items exist and no action signals", () => {
    const v = classifyAttentionBucketForOperator([
      item({ id: "1", urgency: "normal", status: "stale" }),
      item({ id: "2", urgency: "normal", status: "open" }),
    ]);
    expect(v.topCategory).toBe("stale_present");
    expect(v.severity).toBe("watch");
    expect(v.headline).toMatch(/ישנות שכדאי לבדוק \(1\)/);
  });

  it("returns waiting_majority/watch when more than half the bucket is waiting", () => {
    const v = classifyAttentionBucketForOperator([
      item({ id: "1", urgency: "normal", status: "waiting" }),
      item({ id: "2", urgency: "normal", status: "waiting" }),
      item({ id: "3", urgency: "normal", status: "open" }),
    ]);
    expect(v.topCategory).toBe("waiting_majority");
    expect(v.severity).toBe("watch");
    expect(v.headline).toMatch(/ממתינות לאישור \(2\/3\)/);
  });

  it("does NOT classify as waiting_majority at exactly half waiting", () => {
    const v = classifyAttentionBucketForOperator([
      item({ id: "1", urgency: "normal", status: "waiting" }),
      item({ id: "2", urgency: "normal", status: "open" }),
    ]);
    expect(v.topCategory).toBe("actionable_ready");
  });

  it("returns actionable_ready/info for a healthy open queue", () => {
    const v = classifyAttentionBucketForOperator([
      item({ id: "1", urgency: "normal", status: "open" }),
      item({ id: "2", urgency: "high", status: "open" }),
    ]);
    expect(v.topCategory).toBe("actionable_ready");
    expect(v.severity).toBe("info");
    expect(v.headline).toMatch(/פתוחות לטיפול \(2\)/);
  });

  it("always returns non-empty meaning and nextAction across category space", () => {
    const buckets: AttentionItem[][] = [
      [],
      [item({ id: "1", urgency: "critical", status: "open" })],
      [item({ id: "1", urgency: "normal", status: "blocked" })],
      [item({ id: "1", urgency: "normal", status: "stale" })],
      [
        item({ id: "1", urgency: "normal", status: "waiting" }),
        item({ id: "2", urgency: "normal", status: "waiting" }),
        item({ id: "3", urgency: "normal", status: "open" }),
      ],
      [item({ id: "1", urgency: "normal", status: "open" })],
    ];
    for (const b of buckets) {
      const v = classifyAttentionBucketForOperator(b);
      expect(v.meaning.length).toBeGreaterThan(0);
      expect(v.nextAction.length).toBeGreaterThan(0);
    }
  });
});
