import { describe, it, expect } from "vitest";
import { buildRunRequestCommand } from "./OpsPage";

// Phase I: the Control Tower run-request affordance. Unlike buildHarnessPlayCommand
// (which invokes campaign_advance_loop.py directly and leaves no audit record), this
// produces an AUDITABLE run-request file via emit-run-request.py that the existing
// Phase F run_request_handler.py consumes. Copy-command only — the browser never
// writes the file and never holds a worker credential.
describe("buildRunRequestCommand", () => {
  it("defaults to a safe dry-run that produces an auditable run-request, never executing a worker", () => {
    const cmd = buildRunRequestCommand();
    // producer, not the raw loop — the request file is the audit record
    expect(cmd).toContain("emit-run-request.py");
    expect(cmd).not.toContain("campaign_advance_loop.py");
    expect(cmd).toContain("--dry-run");
    // safe local no-op worker, never a paid worker, in the default
    expect(cmd).toContain("--worker-cmd true");
    // canonical script + append-only request location (handler scans this dir)
    expect(cmd).toContain("/srv/ops-vault/automation-registry/scripts");
    // dry-run must NOT be owner-gated (nothing to gate; no state write)
    expect(cmd).not.toContain("--owner-gated");
  });

  it("uses a placeholder requested-by when none is given", () => {
    expect(buildRunRequestCommand()).toContain("<your-session-id>");
  });

  it("honors a provided requested-by", () => {
    const cmd = buildRunRequestCommand({ requestedBy: "control-tower-manual" });
    expect(cmd).toContain("--requested-by control-tower-manual");
    expect(cmd).not.toContain("<your-session-id>");
  });

  it("owner-gated mode records a gated real-run request and never hardcodes a paid worker", () => {
    const cmd = buildRunRequestCommand({ mode: "owner-gated", requestedBy: "x" });
    // the handler records owner_gated requests and SKIPS them until acked
    expect(cmd).toContain("--owner-gated");
    // operator must choose a worker — billing decision, never a paid default
    expect(cmd).toContain("<safe-local-worker-cmd>");
    expect(cmd).not.toContain("--worker-cmd true");
    // a gated real-run request is not a dry-run
    expect(cmd).not.toContain("--dry-run");
  });

  it("clamps max-iterations to a sane positive bound", () => {
    expect(buildRunRequestCommand({ maxIterations: 0 })).toContain("--max-iterations 1");
    expect(buildRunRequestCommand({ maxIterations: 99 })).toContain("--max-iterations 5");
    expect(buildRunRequestCommand({ maxIterations: 3 })).toContain("--max-iterations 3");
  });
});
