import { describe, it, expect } from "vitest";
import { buildHarnessPlayCommand } from "./OpsPage";

describe("buildHarnessPlayCommand", () => {
  it("defaults to a safe dry-run that never dispatches a worker or mutates state", () => {
    const cmd = buildHarnessPlayCommand();
    expect(cmd).toContain("campaign_advance_loop.py");
    expect(cmd).toContain("--dry-run");
    // dry-run must NOT carry the canonical write-back flag
    expect(cmd).not.toContain("--state-update annotate");
    // safe local no-op worker, never a paid worker
    expect(cmd).toContain("--worker-cmd true");
    // run artifact path so the operator can read the summary
    expect(cmd).toContain("--summary-out");
    // canonical script location
    expect(cmd).toContain("/srv/ops-vault/automation-registry/scripts");
  });

  it("uses a placeholder claimant id when none is given", () => {
    expect(buildHarnessPlayCommand()).toContain("<your-session-id>");
  });

  it("honors a provided claimant id", () => {
    const cmd = buildHarnessPlayCommand({ claimantId: "control-tower-manual" });
    expect(cmd).toContain("--claimant-id control-tower-manual");
    expect(cmd).not.toContain("<your-session-id>");
  });

  it("annotate mode emits the canonical write-back and a worker placeholder (billing decision)", () => {
    const cmd = buildHarnessPlayCommand({ mode: "annotate", claimantId: "x" });
    expect(cmd).toContain("--state-update annotate");
    // never hardcodes a paid worker — operator must choose one
    expect(cmd).toContain("<safe-local-worker-cmd>");
    expect(cmd).not.toContain("--dry-run");
    // bounded to a single packet by default
    expect(cmd).toContain("--max-iterations 1");
  });

  it("clamps max-iterations to a sane positive bound", () => {
    expect(buildHarnessPlayCommand({ maxIterations: 0 })).toContain("--max-iterations 1");
    expect(buildHarnessPlayCommand({ maxIterations: 99 })).toContain("--max-iterations 5");
    expect(buildHarnessPlayCommand({ maxIterations: 3 })).toContain("--max-iterations 3");
  });
});
