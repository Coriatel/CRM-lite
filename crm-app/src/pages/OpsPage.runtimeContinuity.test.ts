import { describe, it, expect } from "vitest";
import { runtimeContinuitySummary, bucketTerminalState } from "./OpsPage";

const entry = (overrides: Record<string, unknown>) => ({
  handoff_path: "/home/x/work/handoffs/a.md",
  ...overrides,
});

describe("runtimeContinuitySummary", () => {
  it("empty doc → health=empty, totals 0", () => {
    const s = runtimeContinuitySummary(null);
    expect(s.health).toBe("empty");
    expect(s.total).toBe(0);
    expect(s.latestWrittenAt).toBeNull();
  });

  it("all ok/ancestor → health=ok", () => {
    const s = runtimeContinuitySummary({
      entries: [
        entry({ verifier_status: "ok", written_at: "2026-05-14T09:00:00Z" }),
        entry({ verifier_status: "ancestor", written_at: "2026-05-15T03:00:00Z" }),
      ],
    });
    expect(s.health).toBe("ok");
    expect(s.ok).toBe(2);
    expect(s.total).toBe(2);
    expect(s.latestWrittenAt).toBe("2026-05-15T03:00:00Z");
  });

  it("drift present without error → health=warn", () => {
    const s = runtimeContinuitySummary({
      entries: [
        entry({ verifier_status: "ok" }),
        entry({ verifier_status: "drift" }),
      ],
    });
    expect(s.health).toBe("warn");
    expect(s.drift).toBe(1);
  });

  it("error dominates drift → health=fail", () => {
    const s = runtimeContinuitySummary({
      entries: [
        entry({ verifier_status: "drift" }),
        entry({ verifier_status: "error" }),
      ],
    });
    expect(s.health).toBe("fail");
    expect(s.error).toBe(1);
    expect(s.drift).toBe(1);
  });

  it("missing_state/not_applicable count as missing, not failures", () => {
    const s = runtimeContinuitySummary({
      entries: [
        entry({ verifier_status: "missing_state" }),
        entry({ verifier_status: "not_applicable" }),
      ],
    });
    expect(s.missing).toBe(2);
    expect(s.health).toBe("ok");
  });

  it("absent verifier_status counts as unknown, not failure", () => {
    const s = runtimeContinuitySummary({
      entries: [entry({}), entry({ verifier_status: null })],
    });
    expect(s.unknown).toBe(2);
    expect(s.health).toBe("ok");
  });

  it("latestWrittenAt prefers written_at but falls back to mtime", () => {
    const s = runtimeContinuitySummary({
      entries: [
        entry({ verifier_status: "ok", mtime: "2026-05-13T00:00:00Z" }),
        entry({ verifier_status: "ok", written_at: "2026-05-14T00:00:00Z" }),
      ],
    });
    expect(s.latestWrittenAt).toBe("2026-05-14T00:00:00Z");
  });

  it("supports legacy `handoffs` field when `entries` absent", () => {
    const s = runtimeContinuitySummary({
      handoffs: [entry({ verifier_status: "ok" })],
    } as unknown as Parameters<typeof runtimeContinuitySummary>[0]);
    expect(s.total).toBe(1);
    expect(s.ok).toBe(1);
  });
});

describe("bucketTerminalState", () => {
  it("null/empty/undefined → unknown", () => {
    expect(bucketTerminalState(null)).toBe("unknown");
    expect(bucketTerminalState(undefined)).toBe("unknown");
    expect(bucketTerminalState("")).toBe("unknown");
  });
  it("SHIPPED variants → shipped", () => {
    expect(bucketTerminalState("SHIPPED")).toBe("shipped");
    expect(bucketTerminalState("shipped")).toBe("shipped");
  });
  it("HANDOFF / HANDOFF_READY → handoff_pending", () => {
    expect(bucketTerminalState("HANDOFF")).toBe("handoff_pending");
    expect(bucketTerminalState("HANDOFF_READY")).toBe("handoff_pending");
    expect(bucketTerminalState("HANDOFF READY")).toBe("handoff_pending");
  });
  it("BLOCKED → blocked", () => {
    expect(bucketTerminalState("BLOCKED")).toBe("blocked");
  });
  it("ABANDONED variants → abandoned", () => {
    expect(bucketTerminalState("ABANDONED_SAFELY")).toBe("abandoned");
    expect(bucketTerminalState("ABANDONED-SAFELY")).toBe("abandoned");
    expect(bucketTerminalState("ABANDONED")).toBe("abandoned");
  });
  it("CHECKPOINT variants → checkpoint", () => {
    expect(bucketTerminalState("CHECKPOINT")).toBe("checkpoint");
    expect(bucketTerminalState("CLEAN_SLICE_BOUNDARY")).toBe("checkpoint");
    expect(bucketTerminalState("CLEAN_INVARIANT_BOUNDARY")).toBe("checkpoint");
  });
  it("unrecognized value → other (NOT unknown)", () => {
    expect(bucketTerminalState("USER_CLEAR_BEFORE_RESUME")).toBe("other");
    expect(bucketTerminalState("WIP")).toBe("other");
  });
});

describe("runtimeContinuitySummary: terminal_state buckets", () => {
  it("empty doc → all buckets 0, terminalDeclared=0, latestPerBucket empty", () => {
    const s = runtimeContinuitySummary(null);
    expect(s.terminalDeclared).toBe(0);
    expect(s.terminalBuckets.shipped).toBe(0);
    expect(s.latestPerBucket).toEqual({});
  });

  it("latestPerBucket tracks max written_at per bucket", () => {
    const s = runtimeContinuitySummary({
      entries: [
        entry({ terminal_state: "SHIPPED", written_at: "2026-05-14T09:00:00Z" }),
        entry({ terminal_state: "SHIPPED", written_at: "2026-05-15T05:00:00Z" }),
        entry({ terminal_state: "BLOCKED", written_at: "2026-05-13T10:00:00Z" }),
        entry({ terminal_state: "BLOCKED", mtime: "2026-05-14T11:00:00Z" }),
        entry({ terminal_state: null, written_at: "2026-05-15T06:00:00Z" }),
      ],
    });
    expect(s.latestPerBucket.shipped).toBe("2026-05-15T05:00:00Z");
    expect(s.latestPerBucket.blocked).toBe("2026-05-14T11:00:00Z");
    expect(s.latestPerBucket.unknown).toBe("2026-05-15T06:00:00Z");
  });

  it("latestPerBucket only set when entries have a timestamp", () => {
    const s = runtimeContinuitySummary({
      entries: [entry({ terminal_state: "SHIPPED" })],
    });
    expect(s.terminalBuckets.shipped).toBe(1);
    expect(s.latestPerBucket.shipped).toBeUndefined();
  });

  it("mixed terminal_state values bucket correctly and count declared", () => {
    const s = runtimeContinuitySummary({
      entries: [
        entry({ terminal_state: "SHIPPED" }),
        entry({ terminal_state: "SHIPPED" }),
        entry({ terminal_state: "HANDOFF_READY" }),
        entry({ terminal_state: "BLOCKED" }),
        entry({ terminal_state: "CLEAN_SLICE_BOUNDARY" }),
        entry({ terminal_state: "USER_CLEAR_BEFORE_RESUME" }),
        entry({ terminal_state: null }),
        entry({}),
      ],
    });
    expect(s.terminalBuckets.shipped).toBe(2);
    expect(s.terminalBuckets.handoff_pending).toBe(1);
    expect(s.terminalBuckets.blocked).toBe(1);
    expect(s.terminalBuckets.checkpoint).toBe(1);
    expect(s.terminalBuckets.other).toBe(1);
    expect(s.terminalBuckets.unknown).toBe(2);
    expect(s.terminalDeclared).toBe(6);
  });
});
