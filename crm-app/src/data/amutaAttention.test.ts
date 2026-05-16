import { describe, it, expect } from "vitest";
import { bucketAttention, type AttentionItem } from "./amutaAttention";

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
