import { describe, it, expect } from "vitest";
import { runtimeContinuitySummary } from "./OpsPage";

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
