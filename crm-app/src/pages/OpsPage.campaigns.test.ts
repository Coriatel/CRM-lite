import { describe, it, expect } from "vitest";
import {
  summarizeCampaigns,
  campaignStatusColor,
  goalChainForCampaign,
} from "./OpsPage";

const doc = {
  campaigns: [
    { id: "c-active-old", status: "ACTIVE", last_written_at: "2026-05-01T00:00:00Z" },
    { id: "c-active-new", status: "ACTIVE", last_written_at: "2026-05-30T00:00:00Z" },
    { id: "c-shipped", status: "SHIPPED", last_written_at: "2026-05-20T00:00:00Z" },
    { id: "c-blocked", status: "BLOCKED", last_written_at: "2026-05-10T00:00:00Z" },
    { id: "c-lower", status: "active", last_written_at: "2026-05-29T00:00:00Z" },
  ],
};

describe("summarizeCampaigns", () => {
  it("counts by upper-cased status", () => {
    const s = summarizeCampaigns(doc);
    expect(s.total).toBe(5);
    expect(s.counts.ACTIVE).toBe(3); // includes the lower-case 'active'
    expect(s.counts.SHIPPED).toBe(1);
    expect(s.counts.BLOCKED).toBe(1);
  });

  it("returns ACTIVE campaigns sorted by recency (newest first)", () => {
    const s = summarizeCampaigns(doc);
    expect(s.active.map((c) => c.id)).toEqual(["c-active-new", "c-lower", "c-active-old"]);
  });

  it("caps the shown list and reports overflow", () => {
    const s = summarizeCampaigns(doc, 2);
    expect(s.shown).toHaveLength(2);
    expect(s.overflow).toBe(1);
  });

  it("returns BLOCKED campaigns sorted by recency (newest first)", () => {
    const s = summarizeCampaigns({
      campaigns: [
        { id: "b-old", status: "BLOCKED", last_written_at: "2026-05-01T00:00:00Z" },
        { id: "b-new", status: "blocked", last_written_at: "2026-05-28T00:00:00Z" },
        { id: "a", status: "ACTIVE", last_written_at: "2026-05-30T00:00:00Z" },
      ],
    });
    expect(s.blocked.map((c) => c.id)).toEqual(["b-new", "b-old"]);
  });

  it("handles null / empty doc safely", () => {
    expect(summarizeCampaigns(null)).toMatchObject({ total: 0, active: [], blocked: [], overflow: 0 });
    expect(summarizeCampaigns({ campaigns: [] }).total).toBe(0);
  });
});

describe("goalChainForCampaign", () => {
  const goalsDoc = {
    system: { id: "mn-os", goal: "Reduce the operator bottleneck." },
    lanes: { A: { goal: "MN-OS Core lane.", serves: "mn-os" } },
    campaigns: {
      "authored-one": {
        goal: "Encode the goal chain as machine state.",
        serves: "A",
        source: "x.md",
      },
    },
  };

  it("returns the campaign goal + lane + lane/system goals for an authored campaign", () => {
    const chain = goalChainForCampaign(goalsDoc, "authored-one");
    expect(chain).toEqual({
      goal: "Encode the goal chain as machine state.",
      lane: "A",
      laneGoal: "MN-OS Core lane.",
      systemGoal: "Reduce the operator bottleneck.",
    });
  });

  it("returns null for an unauthored campaign (absence is not invalid)", () => {
    expect(goalChainForCampaign(goalsDoc, "not-authored")).toBeNull();
  });

  it("returns null for a null doc", () => {
    expect(goalChainForCampaign(null, "authored-one")).toBeNull();
  });
});

describe("campaignStatusColor", () => {
  it("maps known statuses to distinct colors and defaults to gray", () => {
    expect(campaignStatusColor("ACTIVE")).toBe("#16a34a");
    expect(campaignStatusColor("active")).toBe("#16a34a");
    expect(campaignStatusColor("BLOCKED")).toBe("#dc2626");
    expect(campaignStatusColor("SHIPPED")).toBe("#2563eb");
    expect(campaignStatusColor("ABANDONED")).toBe("#737373");
    expect(campaignStatusColor(undefined)).toBe("#737373");
  });
});
