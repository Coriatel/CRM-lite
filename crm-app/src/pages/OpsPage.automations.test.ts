import { describe, it, expect } from "vitest";
import { summarizeAutomations, automationHealthColor } from "./OpsPage";
import { findAutomation, relatedAutomations } from "./OpsAutomationPage";

const doc = {
  _meta: {
    platform_counts: { cron: 2, n8n: 1 },
    health_counts: { healthy: 1, failing: 1, degraded: 1 },
  },
  automations: [
    { id: "n8n:a", name: "A", platform: "n8n", health_status: "healthy" },
    { id: "cron:b", name: "B", platform: "cron", health_status: "failing" },
    { id: "cron:c", name: "C", platform: "cron", health_status: "degraded" },
  ],
};

describe("summarizeAutomations", () => {
  it("uses _meta counts and surfaces severity-sorted attention", () => {
    const s = summarizeAutomations(doc);
    expect(s.total).toBe(3);
    expect(s.platformCounts.cron).toBe(2);
    expect(s.healthCounts.healthy).toBe(1);
    // failing ranks above degraded; healthy excluded from attention
    expect(s.attention.map((a) => a.id)).toEqual(["cron:b", "cron:c"]);
    expect(s.attentionTotal).toBe(2);
  });

  it("recomputes counts when _meta absent", () => {
    const s = summarizeAutomations({ automations: doc.automations });
    expect(s.platformCounts.cron).toBe(2);
    expect(s.healthCounts.failing).toBe(1);
  });

  it("caps attention and reports overflow via attentionTotal", () => {
    const s = summarizeAutomations(doc, 1);
    expect(s.attention).toHaveLength(1);
    expect(s.attentionTotal).toBe(2);
  });

  it("handles null doc", () => {
    expect(summarizeAutomations(null)).toMatchObject({ total: 0, attention: [], attentionTotal: 0 });
  });
});

describe("automationHealthColor", () => {
  it("reds for broken/failing, amber for degraded/stale, green healthy, gray default", () => {
    expect(automationHealthColor("failing")).toBe("#dc2626");
    expect(automationHealthColor("broken_suspected")).toBe("#dc2626");
    expect(automationHealthColor("degraded")).toBe("#a16207");
    expect(automationHealthColor("stale_or_unhit")).toBe("#a16207");
    expect(automationHealthColor("healthy")).toBe("#16a34a");
    expect(automationHealthColor("disabled")).toBe("#737373");
  });
});

describe("findAutomation / relatedAutomations", () => {
  it("finds by id and returns null when missing", () => {
    expect(findAutomation(doc, "cron:b")?.name).toBe("B");
    expect(findAutomation(doc, "nope")).toBeNull();
    expect(findAutomation(null, "x")).toBeNull();
  });

  it("relates by platform excluding self", () => {
    const cur = doc.automations[1]; // cron:b
    const rel = relatedAutomations(doc, cur);
    expect(rel.map((a) => a.id)).toEqual(["cron:c"]);
  });
});
