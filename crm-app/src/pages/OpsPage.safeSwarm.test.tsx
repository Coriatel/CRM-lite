import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  SafeSwarmCard,
  SAFE_SWARM_SUBSTRATE_KEYS,
  isSafeSwarmDefault,
  isSafeSwarmStale,
  safeSwarmAvailableCount,
  classifySafeSwarmForOperator,
  type SafeSwarmDoc,
} from "./SafeSwarmCard";

const FROZEN_NOW = new Date("2026-05-18T12:00:00Z");

const slotOn = { available: true, script_path: "scripts/x.py" };
const slotOff = { available: false, script_path: null };

const generatedDefault: SafeSwarmDoc = {
  _meta: {
    schema_version: "v0",
    writer: "scripts/sync-ops-data.mjs",
    source: "missing — vault projection not synced",
    generated_at: "2026-05-18T11:59:30Z",
    generated_default: true,
    note: "default",
  },
  substrate: {
    recommend: slotOff,
    claim: slotOff,
    materialize: slotOff,
    queue_audit: slotOff,
    validate_return: slotOff,
    validate_next: slotOff,
    preflight_collision: slotOff,
    spawn: slotOff,
  },
  gates: [],
  runtime_health: {
    merger_timer_active: null,
    last_health_ts: null,
    last_health_applied: null,
    last_health_rejected: null,
    last_health_error: null,
    spool_depth_after: null,
  },
  queue_snapshot: {
    queue_present: false,
    queue_item_count: null,
    routes_present: false,
    active_sessions_present: false,
    active_session_count: null,
  },
  next_slices: [],
  health: { status: "red", reasons: ["projection_not_synced"] },
};

// Yellow = substrate degraded, spawn permanently off in v0, merger timer not active.
const yellowDegraded: SafeSwarmDoc = {
  _meta: {
    schema_version: "v0",
    writer: "build-safe-swarm-projection.py",
    source: "filesystem probe",
    generated_at: "2026-05-18T11:58:00Z",
    generated_default: false,
    note: "live",
  },
  substrate: {
    recommend: slotOn,
    claim: slotOn,
    materialize: slotOn,
    queue_audit: slotOn,
    validate_return: slotOn,
    validate_next: slotOn,
    preflight_collision: slotOn,
    spawn: slotOff,
  },
  gates: [{ id: "autonomous_spawn", status: "blocked", reason: "owner gate #7" }],
  runtime_health: {
    merger_timer_active: false,
    last_health_ts: "2026-05-18T11:30:00Z",
    last_health_applied: 3,
    last_health_rejected: 0,
    last_health_error: null,
    spool_depth_after: 0,
  },
  queue_snapshot: {
    queue_present: true,
    queue_item_count: 4,
    routes_present: true,
    active_sessions_present: true,
    active_session_count: 2,
  },
  next_slices: [],
  health: { status: "yellow", reasons: ["merger_timer_inactive", "spawn_unavailable"] },
};

const greenLive: SafeSwarmDoc = {
  _meta: {
    schema_version: "v0",
    writer: "build-safe-swarm-projection.py",
    source: "filesystem probe",
    generated_at: "2026-05-18T11:59:30Z",
    generated_default: false,
    note: "live",
  },
  substrate: {
    recommend: slotOn,
    claim: slotOn,
    materialize: slotOn,
    queue_audit: slotOn,
    validate_return: slotOn,
    validate_next: slotOn,
    preflight_collision: slotOn,
    spawn: slotOff,
  },
  gates: [],
  runtime_health: {
    merger_timer_active: true,
    last_health_ts: "2026-05-18T11:59:00Z",
    last_health_applied: 7,
    last_health_rejected: 1,
    last_health_error: null,
    spool_depth_after: 0,
  },
  queue_snapshot: {
    queue_present: true,
    queue_item_count: 5,
    routes_present: true,
    active_sessions_present: true,
    active_session_count: 3,
  },
  next_slices: [],
  health: { status: "green", reasons: [] },
};

const redError: SafeSwarmDoc = {
  _meta: {
    schema_version: "v0",
    writer: "build-safe-swarm-projection.py",
    source: "filesystem probe",
    generated_at: "2026-05-18T11:59:30Z",
    generated_default: false,
    note: "probe failed",
  },
  substrate: {
    recommend: slotOff,
    claim: slotOff,
    materialize: slotOff,
    queue_audit: slotOff,
    validate_return: slotOff,
    validate_next: slotOff,
    preflight_collision: slotOff,
    spawn: slotOff,
  },
  gates: [
    { id: "registry_write_side", status: "observed_violation", reason: "merger crash" },
  ],
  runtime_health: {
    merger_timer_active: false,
    last_health_ts: "2026-05-18T11:00:00Z",
    last_health_applied: 0,
    last_health_rejected: 2,
    last_health_error: "spool unreadable",
    spool_depth_after: null,
  },
  queue_snapshot: {
    queue_present: false,
    queue_item_count: null,
    routes_present: false,
    active_sessions_present: false,
    active_session_count: null,
  },
  next_slices: [],
  health: {
    status: "red",
    reasons: ["probe_failed", "merger_observed_violation"],
  },
};

describe("isSafeSwarmDefault", () => {
  it("returns true for null", () => {
    expect(isSafeSwarmDefault(null)).toBe(true);
  });

  it("returns true when _meta.generated_default is true", () => {
    expect(isSafeSwarmDefault(generatedDefault)).toBe(true);
  });

  it("returns false for a live writer envelope", () => {
    expect(isSafeSwarmDefault(yellowDegraded)).toBe(false);
  });
});

describe("safeSwarmAvailableCount", () => {
  it("returns 0/8 for a fully-off envelope (default)", () => {
    expect(safeSwarmAvailableCount(generatedDefault)).toEqual({
      available: 0,
      total: 8,
    });
  });

  it("returns 7/8 when all primitives except spawn are available", () => {
    expect(safeSwarmAvailableCount(greenLive)).toEqual({
      available: 7,
      total: 8,
    });
  });

  it("returns 0/8 for null doc", () => {
    expect(safeSwarmAvailableCount(null)).toEqual({ available: 0, total: 8 });
  });
});

describe("isSafeSwarmStale", () => {
  it("returns true when generated_at is absent", () => {
    expect(isSafeSwarmStale({ _meta: {} } as SafeSwarmDoc, FROZEN_NOW)).toBe(true);
  });

  it("returns true for a doc older than 5 minutes", () => {
    expect(
      isSafeSwarmStale(
        { _meta: { generated_at: "2026-05-18T11:50:00Z" } } as SafeSwarmDoc,
        FROZEN_NOW,
      ),
    ).toBe(true);
  });

  it("returns false for a doc within 5 minutes", () => {
    expect(
      isSafeSwarmStale(
        { _meta: { generated_at: "2026-05-18T11:58:00Z" } } as SafeSwarmDoc,
        FROZEN_NOW,
      ),
    ).toBe(false);
  });
});

describe("SAFE_SWARM_SUBSTRATE_KEYS", () => {
  it("includes all eight v0 primitives in stable order with spawn last", () => {
    expect(SAFE_SWARM_SUBSTRATE_KEYS).toEqual([
      "recommend",
      "claim",
      "materialize",
      "queue_audit",
      "validate_return",
      "validate_next",
      "preflight_collision",
      "spawn",
    ]);
  });
});

describe("SafeSwarmCard — render states", () => {
  it("renders the empty/default state when doc is generated_default", () => {
    render(<SafeSwarmCard doc={generatedDefault} />);
    const card = screen.getByTestId("safe-swarm-card");
    expect(card.getAttribute("data-display-state")).toBe("no_source");
    expect(screen.getByTestId("safe-swarm-empty")).toBeTruthy();
    expect(screen.getByTestId("safe-swarm-substrate").getAttribute("data-dim")).toBe(
      "true",
    );
    expect(screen.getByTestId("safe-swarm-header-count").textContent).toMatch(
      /projection not yet generated/,
    );
  });

  it("renders the empty/default state when doc is null", () => {
    render(<SafeSwarmCard doc={null} />);
    expect(screen.getByTestId("safe-swarm-card").getAttribute("data-display-state")).toBe(
      "no_source",
    );
    expect(screen.getByTestId("safe-swarm-empty")).toBeTruthy();
  });

  it("renders green/yellow/red status colors via data-display-state", () => {
    const { rerender } = render(<SafeSwarmCard doc={greenLive} />);
    expect(
      screen.getByTestId("safe-swarm-card").getAttribute("data-display-state"),
    ).toBe("green");
    rerender(<SafeSwarmCard doc={yellowDegraded} />);
    expect(
      screen.getByTestId("safe-swarm-card").getAttribute("data-display-state"),
    ).toBe("yellow");
    rerender(<SafeSwarmCard doc={redError} />);
    expect(
      screen.getByTestId("safe-swarm-card").getAttribute("data-display-state"),
    ).toBe("red");
  });

  it("renders all 8 substrate rows with correct available/unavailable indicator", () => {
    render(<SafeSwarmCard doc={greenLive} />);
    for (const k of SAFE_SWARM_SUBSTRATE_KEYS) {
      const row = screen.getByTestId(`safe-swarm-primitive-${k}`);
      const expected = k === "spawn" ? "false" : "true";
      expect(row.getAttribute("data-available")).toBe(expected);
    }
  });

  it("renders the substrate availability tally in the header", () => {
    render(<SafeSwarmCard doc={greenLive} />);
    expect(screen.getByTestId("safe-swarm-header-count").textContent).toMatch(
      /7\/8 substrate/,
    );
    expect(screen.getByTestId("safe-swarm-header-count").textContent).toMatch(
      /spawn=false/,
    );
  });

  it("renders health.reasons when status != green", () => {
    render(<SafeSwarmCard doc={yellowDegraded} />);
    const reasons = screen.getByTestId("safe-swarm-reasons");
    expect(within(reasons).getByText(/merger_timer_inactive/)).toBeTruthy();
    expect(within(reasons).getByText(/spawn_unavailable/)).toBeTruthy();
  });

  it("does NOT render reasons block when status is green", () => {
    render(<SafeSwarmCard doc={greenLive} />);
    expect(screen.queryByTestId("safe-swarm-reasons")).toBeNull();
  });

  it("renders live queue + active-session counts when present", () => {
    render(<SafeSwarmCard doc={yellowDegraded} />);
    const counts = screen.getByTestId("safe-swarm-counts");
    expect(within(counts).getByText("4")).toBeTruthy();
    expect(within(counts).getByText("2")).toBeTruthy();
    expect(within(counts).getByText("queue items")).toBeTruthy();
    expect(within(counts).getByText("active sessions")).toBeTruthy();
  });

  it("renders em-dash for null counts (red error state)", () => {
    render(<SafeSwarmCard doc={redError} />);
    const counts = screen.getByTestId("safe-swarm-counts");
    expect(within(counts).getAllByText("—").length).toBe(2);
  });

  it("renders the merger timer state (active/inactive/unknown)", () => {
    const { rerender } = render(<SafeSwarmCard doc={greenLive} />);
    expect(screen.getByTestId("safe-swarm-merger-timer").textContent).toMatch(/active/);
    rerender(<SafeSwarmCard doc={yellowDegraded} />);
    expect(screen.getByTestId("safe-swarm-merger-timer").textContent).toMatch(
      /inactive/,
    );
    rerender(<SafeSwarmCard doc={generatedDefault} />);
    expect(screen.getByTestId("safe-swarm-merger-timer").textContent).toMatch(
      /unknown/,
    );
  });

  it("renders the last merger error when present", () => {
    render(<SafeSwarmCard doc={redError} />);
    const err = screen.getByTestId("safe-swarm-merger-error");
    expect(err.textContent).toMatch(/spool unreadable/);
  });

  it("omits the merger-error row when last_health_error is null", () => {
    render(<SafeSwarmCard doc={greenLive} />);
    expect(screen.queryByTestId("safe-swarm-merger-error")).toBeNull();
  });

  it("renders the freshness line and marks it stale when older than 5 minutes", () => {
    const stale: SafeSwarmDoc = {
      ...yellowDegraded,
      _meta: { ...yellowDegraded._meta!, generated_at: "2026-05-18T00:00:00Z" },
    };
    render(<SafeSwarmCard doc={stale} />);
    const f = screen.getByTestId("safe-swarm-freshness");
    expect(f.textContent).toMatch(/stale \(>5min\)/);
  });

  it("omits the stale marker when generated_at is fresh", () => {
    // greenLive has generated_at within seconds of FROZEN_NOW conceptually; the
    // helper uses real `new Date()` so just verify the negative path: a doc whose
    // generated_at is the current wall clock is not flagged stale.
    const fresh: SafeSwarmDoc = {
      ...greenLive,
      _meta: { ...greenLive._meta!, generated_at: new Date().toISOString() },
    };
    render(<SafeSwarmCard doc={fresh} />);
    const f = screen.getByTestId("safe-swarm-freshness");
    expect(f.textContent).not.toMatch(/stale/);
  });

  it("aria-label is 'Safe Swarm'", () => {
    render(<SafeSwarmCard doc={greenLive} />);
    expect(screen.getByLabelText("Safe Swarm")).toBeTruthy();
  });

  it("renders operator-readable severity pill + headline + meaning + nextAction", () => {
    render(<SafeSwarmCard doc={generatedDefault} />);
    // no_source → info severity → "תקין" pill, headline names the missing source
    expect(screen.getByTestId("safe-swarm-operator-severity").textContent).toBe("תקין");
    expect(screen.getByTestId("safe-swarm-operator-headline").textContent).toContain("עדיין לא זמין");
    expect(screen.getByTestId("safe-swarm-operator-meaning").textContent).toContain("מה זה אומר");
    expect(screen.getByTestId("safe-swarm-operator-next-action").textContent).toContain("מה ניתן לעשות");
  });
});

describe("classifySafeSwarmForOperator", () => {
  it("no_source for null doc", () => {
    const v = classifySafeSwarmForOperator(null, FROZEN_NOW);
    expect(v.topCategory).toBe("no_source");
    expect(v.severity).toBe("info");
  });

  it("no_source when _meta.generated_default is true (writer not yet live)", () => {
    const v = classifySafeSwarmForOperator(generatedDefault, FROZEN_NOW);
    expect(v.topCategory).toBe("no_source");
    expect(v.severity).toBe("info");
    expect(v.nextAction).toContain("אין צורך לפעול");
  });

  it("merger_unhealthy is highest-priority action when merger timer is inactive", () => {
    const doc: SafeSwarmDoc = {
      _meta: { generated_at: "2026-05-18T11:59:30Z", generated_default: false },
      runtime_health: {
        merger_timer_active: false,
        last_health_ts: null,
        last_health_applied: null,
        last_health_rejected: null,
        last_health_error: null,
        spool_depth_after: null,
      },
      health: { status: "red", reasons: ["x"] },
    };
    const v = classifySafeSwarmForOperator(doc, FROZEN_NOW);
    expect(v.topCategory).toBe("merger_unhealthy");
    expect(v.severity).toBe("action");
  });

  it("merger_unhealthy also fires on non-null last_health_error", () => {
    const doc: SafeSwarmDoc = {
      _meta: { generated_at: "2026-05-18T11:59:30Z", generated_default: false },
      runtime_health: {
        merger_timer_active: true,
        last_health_ts: "2026-05-18T11:59:00Z",
        last_health_applied: 0,
        last_health_rejected: 0,
        last_health_error: "spool write failed",
        spool_depth_after: 0,
      },
      health: { status: "green", reasons: [] },
    };
    const v = classifySafeSwarmForOperator(doc, FROZEN_NOW);
    expect(v.topCategory).toBe("merger_unhealthy");
  });

  it("swarm_red when health.status=red and merger is fine", () => {
    const doc: SafeSwarmDoc = {
      _meta: { generated_at: "2026-05-18T11:59:30Z", generated_default: false },
      runtime_health: {
        merger_timer_active: true,
        last_health_ts: "2026-05-18T11:59:00Z",
        last_health_applied: 0,
        last_health_rejected: 0,
        last_health_error: null,
        spool_depth_after: 0,
      },
      health: { status: "red", reasons: ["gate blocked"] },
    };
    const v = classifySafeSwarmForOperator(doc, FROZEN_NOW);
    expect(v.topCategory).toBe("swarm_red");
    expect(v.severity).toBe("action");
  });

  it("stale_projection when generated_at older than 5 min, merger fine, status green", () => {
    const doc: SafeSwarmDoc = {
      _meta: { generated_at: "2026-05-18T11:00:00Z", generated_default: false },
      runtime_health: {
        merger_timer_active: true,
        last_health_ts: "2026-05-18T11:00:00Z",
        last_health_applied: 1,
        last_health_rejected: 0,
        last_health_error: null,
        spool_depth_after: 0,
      },
      health: { status: "green", reasons: [] },
    };
    const v = classifySafeSwarmForOperator(doc, FROZEN_NOW);
    expect(v.topCategory).toBe("stale_projection");
    expect(v.severity).toBe("watch");
  });

  it("swarm_yellow when status=yellow and merger fine and not stale", () => {
    const doc: SafeSwarmDoc = {
      _meta: { generated_at: "2026-05-18T11:59:30Z", generated_default: false },
      runtime_health: {
        merger_timer_active: true,
        last_health_ts: "2026-05-18T11:59:00Z",
        last_health_applied: 0,
        last_health_rejected: 0,
        last_health_error: null,
        spool_depth_after: 0,
      },
      health: { status: "yellow", reasons: ["one indicator soft"] },
    };
    const v = classifySafeSwarmForOperator(doc, FROZEN_NOW);
    expect(v.topCategory).toBe("swarm_yellow");
    expect(v.severity).toBe("watch");
  });

  it("pending_v1 when green + spawn.available=false (the v0 baseline)", () => {
    const slotOnLive = { available: true, script_path: "scripts/x.py" };
    const slotOffLive = { available: false, script_path: null };
    const doc: SafeSwarmDoc = {
      _meta: { generated_at: "2026-05-18T11:59:30Z", generated_default: false },
      runtime_health: {
        merger_timer_active: true,
        last_health_ts: "2026-05-18T11:59:00Z",
        last_health_applied: 1,
        last_health_rejected: 0,
        last_health_error: null,
        spool_depth_after: 0,
      },
      substrate: {
        recommend: slotOnLive,
        claim: slotOnLive,
        materialize: slotOnLive,
        queue_audit: slotOnLive,
        validate_return: slotOnLive,
        validate_next: slotOnLive,
        preflight_collision: slotOnLive,
        spawn: slotOffLive,
      },
      health: { status: "green", reasons: [] },
    };
    const v = classifySafeSwarmForOperator(doc, FROZEN_NOW);
    expect(v.topCategory).toBe("pending_v1");
    expect(v.severity).toBe("info");
    expect(v.headline).toContain("v0");
  });

  it("all_clear when green + spawn.available=true", () => {
    const slotOnLive = { available: true, script_path: "scripts/x.py" };
    const doc: SafeSwarmDoc = {
      _meta: { generated_at: "2026-05-18T11:59:30Z", generated_default: false },
      runtime_health: {
        merger_timer_active: true,
        last_health_ts: "2026-05-18T11:59:00Z",
        last_health_applied: 1,
        last_health_rejected: 0,
        last_health_error: null,
        spool_depth_after: 0,
      },
      substrate: {
        recommend: slotOnLive,
        claim: slotOnLive,
        materialize: slotOnLive,
        queue_audit: slotOnLive,
        validate_return: slotOnLive,
        validate_next: slotOnLive,
        preflight_collision: slotOnLive,
        spawn: slotOnLive,
      },
      health: { status: "green", reasons: [] },
    };
    const v = classifySafeSwarmForOperator(doc, FROZEN_NOW);
    expect(v.topCategory).toBe("all_clear");
    expect(v.severity).toBe("info");
  });
});
