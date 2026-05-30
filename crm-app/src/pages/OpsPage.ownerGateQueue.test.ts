import { describe, it, expect } from "vitest";
import { summarizeOwnerGates, ownerGateStatusColor } from "./OpsPage";

const statusDoc = {
  summary: { open_gates: 2, new_escalate: 2, must_reconfirm: 0, pre_decided_skip: 1, ledger_entries: 1 },
  gates: [
    { gate_id: "runtime_issue:x", gate_kind: "product_direction", summary: "X", status: "NEW_ESCALATE" },
    { gate_id: "blocker:y", gate_kind: "product_direction", summary: "Y", status: "NEW_ESCALATE" },
  ],
};

const decisionsDoc = {
  decisions: [
    { id: "d1", gate_id: "g1", decision: "approved", decided_at: "2026-05-20T00:00:00Z" },
    { id: "d2", gate_id: "g2", decision: "rejected", decided_at: "2026-05-29T00:00:00Z" },
    { id: "d3", gate_id: "g3", decision: "approved", decided_at: "2026-05-25T00:00:00Z" },
  ],
};

describe("summarizeOwnerGates", () => {
  it("reads summary counts and gate list", () => {
    const v = summarizeOwnerGates(statusDoc, decisionsDoc);
    expect(v.open).toBe(2);
    expect(v.newEscalate).toBe(2);
    expect(v.preDecidedSkip).toBe(1);
    expect(v.gates).toHaveLength(2);
  });

  it("sorts decisions newest-first and caps", () => {
    const v = summarizeOwnerGates(statusDoc, decisionsDoc, 2);
    expect(v.recentDecisions.map((d) => d.id)).toEqual(["d2", "d3"]);
  });

  it("falls back to gates.length when summary.open_gates absent", () => {
    const v = summarizeOwnerGates({ gates: statusDoc.gates }, null);
    expect(v.open).toBe(2);
    expect(v.recentDecisions).toEqual([]);
  });

  it("handles null docs", () => {
    const v = summarizeOwnerGates(null, null);
    expect(v).toMatchObject({ open: 0, gates: [], recentDecisions: [] });
  });
});

describe("ownerGateStatusColor", () => {
  it("maps statuses; defaults gray", () => {
    expect(ownerGateStatusColor("NEW_ESCALATE")).toBe("#dc2626");
    expect(ownerGateStatusColor("MUST_RECONFIRM")).toBe("#a16207");
    expect(ownerGateStatusColor("PRE_DECIDED_SKIP")).toBe("#16a34a");
    expect(ownerGateStatusColor(undefined)).toBe("#737373");
  });
});
