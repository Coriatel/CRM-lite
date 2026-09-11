import { describe, it, expect } from "vitest";
import { findCampaign, goalChain } from "./OpsCampaignPage";
import type { CampaignsDoc } from "./OpsPage";

const doc: CampaignsDoc = {
  campaigns: [
    {
      id: "mn-os-operational-brain",
      owner_user: "devuser",
      status: "ACTIVE",
      last_terminal_state: "PHASE_E_SHIPPED",
      last_written_at: "2026-05-31T00:00:00Z",
      lane_field: "A",
      handoff_dir: "/home/devuser/work/handoffs/mn-os-operational-brain",
      current_handoff: "CURRENT.md",
    },
  ],
};

const goals = {
  system: { id: "mn-os", goal: "reduce operator bottleneck" },
  lanes: { A: { goal: "MN-OS Core", serves: "mn-os" } },
  campaigns: { "mn-os-operational-brain": { goal: "make runtime usable", serves: "A" } },
};

describe("findCampaign", () => {
  it("locates a campaign by id from the feed", () => {
    expect(findCampaign(doc, "mn-os-operational-brain")?.status).toBe("ACTIVE");
  });
  it("returns null for unknown id or null doc", () => {
    expect(findCampaign(doc, "nope")).toBeNull();
    expect(findCampaign(null, "mn-os-operational-brain")).toBeNull();
  });
});

describe("goalChain (consumes Mission Brain goals.json)", () => {
  it("walks campaign -> lane -> system when authored", () => {
    const chain = goalChain(goals, "mn-os-operational-brain");
    expect(chain).not.toBeNull();
    expect(chain).toHaveLength(3);
    expect(chain?.[0]).toBe("make runtime usable");
    expect(chain?.[1]).toContain("MN-OS Core");
    expect(chain?.[2]).toContain("reduce operator bottleneck");
  });
  it("returns null when goal not authored or goals missing", () => {
    expect(goalChain(goals, "unknown-campaign")).toBeNull();
    expect(goalChain(null, "mn-os-operational-brain")).toBeNull();
  });
});
