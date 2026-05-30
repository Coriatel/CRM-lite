import { describe, it, expect } from "vitest";
import { buildResumePrompt } from "./OpsPage";

describe("buildResumePrompt", () => {
  const c = {
    id: "mn-os-owner-control-panel",
    owner_user: "elrondev",
    status: "ACTIVE",
    last_terminal_state: "HANDOFF_READY",
    lane_field: "lane-a",
    handoff_dir: "/home/elrondev/work/handoffs/mn-os-owner-control-panel",
    current_handoff: "CURRENT.md",
  };

  it("includes id, lane, handoff path, status, and reasoning", () => {
    const p = buildResumePrompt(c);
    expect(p).toContain("Resume MN-OS campaign: mn-os-owner-control-panel");
    expect(p).toContain("Lane: lane-a");
    expect(p).toContain("/home/elrondev/work/handoffs/mn-os-owner-control-panel/CURRENT.md");
    expect(p).toContain("Status: ACTIVE (HANDOFF_READY)");
    expect(p).toContain("Reasoning level: high.");
    expect(p).toContain("Run session-orient");
  });

  it("honors a custom reasoning level", () => {
    expect(buildResumePrompt(c, "medium")).toContain("Reasoning level: medium.");
  });

  it("defaults the handoff filename and tolerates missing fields", () => {
    const p = buildResumePrompt({ id: "x", handoff_dir: "/h/x" });
    expect(p).toContain("/h/x/CURRENT.md");
    expect(p).toContain("Owner: —");
    expect(p).not.toContain("Lane:"); // omitted when lane_field absent
  });

  it("notes when no handoff is recorded", () => {
    expect(buildResumePrompt({ id: "x" })).toContain("(no handoff recorded)");
  });
});
