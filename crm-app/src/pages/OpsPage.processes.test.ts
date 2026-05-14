import { describe, it, expect } from "vitest";
import { actionableProcesses } from "./OpsPage";

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
