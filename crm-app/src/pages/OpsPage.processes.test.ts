import { describe, it, expect } from "vitest";
import {
  actionableProcesses,
  classifyProcessesForOperator,
  PROCESS_VERDICT_LABEL_HE,
} from "./OpsPage";

describe("actionableProcesses", () => {
  it("returns [] for null doc", () => {
    expect(actionableProcesses(null)).toEqual([]);
  });
  it("returns [] when long_running_processes missing", () => {
    expect(actionableProcesses({})).toEqual([]);
  });
  it("filters out RESOLVED_NO_ACTION", () => {
    const doc = {
      long_running_processes: [
        { pid: 1, verdict: "RESOLVED_NO_ACTION" },
        { pid: 2, verdict: "KILL_LIKELY_SAFE" },
        { pid: 3, verdict: "NEEDS_ATTACH" },
      ],
    };
    expect(actionableProcesses(doc).map((p) => p.pid)).toEqual([2, 3]);
  });
  it("drops rows missing verdict", () => {
    const doc = { long_running_processes: [{ pid: 9 }] };
    expect(actionableProcesses(doc)).toEqual([]);
  });
});

describe("classifyProcessesForOperator", () => {
  it("returns null on empty rows", () => {
    expect(classifyProcessesForOperator([])).toBeNull();
  });

  it("any KILL_LIKELY_SAFE → action / kill_candidates", () => {
    const v = classifyProcessesForOperator([
      { pid: 1, verdict: "KILL_LIKELY_SAFE" },
      { pid: 2, verdict: "KEEP" },
    ])!;
    expect(v.severity).toBe("action");
    expect(v.topCategory).toBe("kill_candidates");
    expect(v.killCount).toBe(1);
    expect(v.keepCount).toBe(1);
    expect(v.total).toBe(2);
    expect(v.headline).toContain("(1)");
  });

  it("kill_candidates wins over NEEDS_ATTACH and OWNER_DECISION", () => {
    const v = classifyProcessesForOperator([
      { pid: 1, verdict: "NEEDS_ATTACH" },
      { pid: 2, verdict: "OWNER_DECISION" },
      { pid: 3, verdict: "KILL_LIKELY_SAFE" },
    ])!;
    expect(v.topCategory).toBe("kill_candidates");
    expect(v.severity).toBe("action");
  });

  it("NEEDS_ATTACH alone → watch / needs_attach_or_owner", () => {
    const v = classifyProcessesForOperator([
      { pid: 1, verdict: "NEEDS_ATTACH" },
      { pid: 2, verdict: "NEEDS_ATTACH" },
    ])!;
    expect(v.severity).toBe("watch");
    expect(v.topCategory).toBe("needs_attach_or_owner");
    expect(v.attachCount).toBe(2);
    expect(v.headline).toContain("(2)");
  });

  it("OWNER_DECISION alone → watch / needs_attach_or_owner", () => {
    const v = classifyProcessesForOperator([
      { pid: 1, verdict: "OWNER_DECISION" },
    ])!;
    expect(v.severity).toBe("watch");
    expect(v.topCategory).toBe("needs_attach_or_owner");
    expect(v.ownerDecisionCount).toBe(1);
  });

  it("NEEDS_ATTACH + OWNER_DECISION sum into headline", () => {
    const v = classifyProcessesForOperator([
      { pid: 1, verdict: "NEEDS_ATTACH" },
      { pid: 2, verdict: "OWNER_DECISION" },
    ])!;
    expect(v.headline).toContain("(2)");
  });

  it("only KEEP/IGNORE_OR_DELETE → info / background_only", () => {
    const v = classifyProcessesForOperator([
      { pid: 1, verdict: "KEEP" },
      { pid: 2, verdict: "IGNORE_OR_DELETE" },
    ])!;
    expect(v.severity).toBe("info");
    expect(v.topCategory).toBe("background_only");
    expect(v.keepCount).toBe(1);
    expect(v.ignoreCount).toBe(1);
  });

  it("unknown verdict value falls through to background_only", () => {
    const v = classifyProcessesForOperator([
      { pid: 1, verdict: "TOTALLY_NEW_VERDICT" },
    ])!;
    expect(v.severity).toBe("info");
    expect(v.topCategory).toBe("background_only");
    expect(v.total).toBe(1);
  });

  it("Hebrew strings present for every category", () => {
    const variants = [
      classifyProcessesForOperator([{ pid: 1, verdict: "KILL_LIKELY_SAFE" }])!,
      classifyProcessesForOperator([{ pid: 1, verdict: "NEEDS_ATTACH" }])!,
      classifyProcessesForOperator([{ pid: 1, verdict: "KEEP" }])!,
    ];
    for (const v of variants) {
      expect(v.headline.length).toBeGreaterThan(0);
      expect(v.meaning.length).toBeGreaterThan(0);
      expect(v.nextAction.length).toBeGreaterThan(0);
      expect(/[֐-׿]/.test(v.headline)).toBe(true);
      expect(/[֐-׿]/.test(v.meaning)).toBe(true);
      expect(/[֐-׿]/.test(v.nextAction)).toBe(true);
    }
  });
});

describe("PROCESS_VERDICT_LABEL_HE", () => {
  it("maps every known verdict to Hebrew", () => {
    for (const k of [
      "KILL_LIKELY_SAFE",
      "NEEDS_ATTACH",
      "OWNER_DECISION",
      "IGNORE_OR_DELETE",
      "KEEP",
    ]) {
      const label = PROCESS_VERDICT_LABEL_HE[k];
      expect(label).toBeTypeOf("string");
      expect(label!.length).toBeGreaterThan(0);
      expect(/[֐-׿]/.test(label!)).toBe(true);
    }
  });
});
