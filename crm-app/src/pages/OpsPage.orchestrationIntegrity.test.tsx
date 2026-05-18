import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  OrchestrationIntegrityCard,
  orchestrationIntegrityDisplayState,
  isOrchestrationIntegrityMissing,
  type OrchestratorIntegrityDoc,
} from "./OrchestrationIntegrityCard";

// Envelope per /srv/ops-vault/state/orchestrator_integrity.schema.json (v0).
const defaultEnvelope: OrchestratorIntegrityDoc = {
  _meta: {
    schema_version: "v0",
    writer: "scripts/sync-ops-data.mjs",
    source: "missing — vault projection not synced",
    generated_at: "2026-05-18T16:53:05.983Z",
    generated_default: true,
    note: "Safe-empty default envelope.",
  },
  registry: {
    canonical_readable: false,
    canonical_mtime: null,
    canonical_age_seconds: null,
    heartbeat_ttl_seconds: 300,
    canonical_stale: true,
    derived_projection_present: false,
    derived_mtime: null,
    derived_age_seconds: null,
    derived_provenance: null,
    fallback_used: false,
  },
  sessions: {
    active_count: 0,
    stale_count: 0,
    ownerless_count: 0,
    ownerless_stale_count: 0,
    stale_ids: [],
  },
  merger: {
    timer_active: false,
    last_health_ts: null,
    last_health_age_seconds: null,
    last_applied: 0,
    last_rejected: 0,
    spool_depth_after: 0,
    last_error: null,
    merger_healthy: false,
  },
  projection_drift: {
    meta_manifest_regenerated_at: null,
    meta_manifest_age_seconds: null,
    meta_manifest_stale: true,
    drift_threshold_seconds: 3600,
    drifted_files: [],
  },
  runtime_issues: { open_count: 0, by_severity: {}, by_class: {} },
  safe_parallelism: { confidence: "unknown", reasons: ["projection_not_synced"] },
  integrity_status: { status: "red", reasons: ["projection_not_synced"] },
};

const greenLive: OrchestratorIntegrityDoc = {
  _meta: {
    schema_version: "v0",
    writer: "build-orchestrator-integrity.py",
    source: "read-only probe of state/*.json",
    generated_at: "2026-05-18T16:24:55Z",
    generated_default: false,
    note: "live",
  },
  registry: {
    canonical_readable: false,
    canonical_mtime: "2026-05-18T16:21:45Z",
    canonical_age_seconds: 190,
    heartbeat_ttl_seconds: 300,
    canonical_stale: false,
    derived_projection_present: true,
    derived_mtime: "2026-05-18T16:24:30Z",
    derived_age_seconds: 25,
    derived_provenance: "derived",
    fallback_used: true,
  },
  sessions: {
    active_count: 2,
    stale_count: 0,
    ownerless_count: 2,
    ownerless_stale_count: 0,
    stale_ids: [],
  },
  merger: {
    timer_active: true,
    last_health_ts: "2026-05-18T16:24:55Z",
    last_health_age_seconds: 0,
    last_applied: 0,
    last_rejected: 0,
    spool_depth_after: 0,
    last_error: null,
    merger_healthy: true,
  },
  projection_drift: {
    meta_manifest_regenerated_at: "2026-05-18T16:24:50Z",
    meta_manifest_age_seconds: 5,
    meta_manifest_stale: false,
    drift_threshold_seconds: 3600,
    drifted_files: [],
  },
  runtime_issues: { open_count: 0, by_severity: {}, by_class: {} },
  safe_parallelism: { confidence: "high", reasons: [] },
  integrity_status: { status: "green", reasons: [] },
};

const redLive: OrchestratorIntegrityDoc = {
  _meta: {
    schema_version: "v0",
    writer: "build-orchestrator-integrity.py",
    source: "read-only probe of state/*.json",
    generated_at: "2026-05-18T16:24:55Z",
    generated_default: false,
    note: "live",
  },
  registry: greenLive.registry,
  sessions: greenLive.sessions,
  merger: {
    timer_active: true,
    last_health_ts: "2026-05-18T16:24:55Z",
    last_health_age_seconds: 0,
    last_applied: 0,
    last_rejected: 0,
    spool_depth_after: 0,
    last_error: "spool stuck",
    merger_healthy: false,
  },
  projection_drift: {
    meta_manifest_regenerated_at: "2026-05-14T06:43:11Z",
    meta_manifest_age_seconds: 380504,
    meta_manifest_stale: true,
    drift_threshold_seconds: 3600,
    drifted_files: [
      { file: "session_index.json", meta_mtime: "x", freshness_mtime: "y", delta_seconds: 380556 },
      { file: "health.json", meta_mtime: "x", freshness_mtime: "y", delta_seconds: 380421 },
    ],
  },
  runtime_issues: { open_count: 9, by_severity: { high: 1, medium: 2, low: 6 }, by_class: {} },
  safe_parallelism: {
    confidence: "degraded",
    reasons: ["_meta.json manifest age 380504s > threshold 86400s", "8 file(s) drifted"],
  },
  integrity_status: {
    status: "red",
    reasons: ["1 high/critical runtime-issue(s) open", "merger reports degraded"],
  },
};

describe("orchestrationIntegrityDisplayState", () => {
  it("returns not_published for null doc", () => {
    expect(orchestrationIntegrityDisplayState(null)).toBe("not_published");
  });

  it("returns default_envelope when _meta.generated_default is true", () => {
    expect(orchestrationIntegrityDisplayState(defaultEnvelope)).toBe("default_envelope");
  });

  it("returns live when _meta.generated_default is false", () => {
    expect(orchestrationIntegrityDisplayState(greenLive)).toBe("live");
    expect(orchestrationIntegrityDisplayState(redLive)).toBe("live");
  });
});

describe("isOrchestrationIntegrityMissing", () => {
  it("is true for null and default_envelope", () => {
    expect(isOrchestrationIntegrityMissing(null)).toBe(true);
    expect(isOrchestrationIntegrityMissing(defaultEnvelope)).toBe(true);
  });

  it("is false for live docs", () => {
    expect(isOrchestrationIntegrityMissing(greenLive)).toBe(false);
    expect(isOrchestrationIntegrityMissing(redLive)).toBe(false);
  });
});

describe("OrchestrationIntegrityCard — not_published (null doc, 404 in prod)", () => {
  it("renders the not_published empty state with PR #89 hint", () => {
    render(<OrchestrationIntegrityCard doc={null} />);
    const card = screen.getByTestId("orchestration-integrity-card");
    expect(card.getAttribute("data-display-state")).toBe("not_published");
    expect(card.getAttribute("data-integrity-status")).toBe("red");
    const empty = within(card).getByTestId("orchestration-integrity-empty");
    expect(empty.textContent).toContain("PR #89");
    expect(empty.textContent).toContain("orchestrator_integrity.json");
  });

  it("header count reads 'טרם פורסם'", () => {
    render(<OrchestrationIntegrityCard doc={null} />);
    const count = screen.getByTestId("orchestration-integrity-header-count");
    expect(count.textContent).toBe("טרם פורסם");
  });

  it("does not render live-state subsections", () => {
    render(<OrchestrationIntegrityCard doc={null} />);
    expect(screen.queryByTestId("orchestration-integrity-counts")).toBeNull();
    expect(screen.queryByTestId("orchestration-integrity-merger")).toBeNull();
  });
});

describe("OrchestrationIntegrityCard — default_envelope (build-time fallback)", () => {
  it("renders the default_envelope state, red palette, integrity-status=red", () => {
    render(<OrchestrationIntegrityCard doc={defaultEnvelope} />);
    const card = screen.getByTestId("orchestration-integrity-card");
    expect(card.getAttribute("data-display-state")).toBe("default_envelope");
    expect(card.getAttribute("data-integrity-status")).toBe("red");
    expect(screen.getByTestId("orchestration-integrity-default")).toBeTruthy();
  });

  it("header count reads 'ברירת מחדל · מקור חסר'", () => {
    render(<OrchestrationIntegrityCard doc={defaultEnvelope} />);
    const count = screen.getByTestId("orchestration-integrity-header-count");
    expect(count.textContent).toBe("ברירת מחדל · מקור חסר");
  });

  it("explains generated_default and that integrity_status is red", () => {
    render(<OrchestrationIntegrityCard doc={defaultEnvelope} />);
    const body = screen.getByTestId("orchestration-integrity-default");
    expect(body.textContent).toContain("generated_default");
    expect(body.textContent).toContain("red");
  });
});

describe("OrchestrationIntegrityCard — live green", () => {
  it("renders green palette and high confidence", () => {
    render(<OrchestrationIntegrityCard doc={greenLive} />);
    const card = screen.getByTestId("orchestration-integrity-card");
    expect(card.getAttribute("data-display-state")).toBe("live");
    expect(card.getAttribute("data-integrity-status")).toBe("green");
    const count = screen.getByTestId("orchestration-integrity-header-count");
    expect(count.textContent).toContain("תקין");
    expect(count.textContent).toContain("גבוהה");
  });

  it("does not render the reasons list when status=green", () => {
    render(<OrchestrationIntegrityCard doc={greenLive} />);
    expect(screen.queryByTestId("orchestration-integrity-reasons")).toBeNull();
  });

  it("renders the counts grid with live values", () => {
    render(<OrchestrationIntegrityCard doc={greenLive} />);
    const counts = screen.getByTestId("orchestration-integrity-counts");
    expect(counts.textContent).toContain("2"); // active_count
    expect(counts.textContent).toContain("פעילים");
    expect(counts.textContent).toContain("0"); // ownerless_stale_count
  });

  it("merger line shows timer pעיל and healthy", () => {
    render(<OrchestrationIntegrityCard doc={greenLive} />);
    const merger = screen.getByTestId("orchestration-integrity-merger-timer");
    expect(merger.textContent).toContain("פעיל");
    expect(merger.textContent).toContain("תקין");
  });
});

describe("OrchestrationIntegrityCard — live red", () => {
  it("renders red palette and shows reasons + parallelism reasons", () => {
    render(<OrchestrationIntegrityCard doc={redLive} />);
    const card = screen.getByTestId("orchestration-integrity-card");
    expect(card.getAttribute("data-display-state")).toBe("live");
    expect(card.getAttribute("data-integrity-status")).toBe("red");
    const reasons = screen.getByTestId("orchestration-integrity-reasons");
    expect(reasons.textContent).toContain("1 high/critical runtime-issue(s) open");
    const parallelism = screen.getByTestId("orchestration-integrity-parallelism-reasons");
    expect(parallelism.textContent).toContain("8 file(s) drifted");
    expect(parallelism.textContent).toContain("ירודה");
  });

  it("merger line shows healthy=ירוד and last_error", () => {
    render(<OrchestrationIntegrityCard doc={redLive} />);
    const merger = screen.getByTestId("orchestration-integrity-merger-timer");
    expect(merger.textContent).toContain("ירוד");
    const err = screen.getByTestId("orchestration-integrity-merger-error");
    expect(err.textContent).toContain("spool stuck");
  });

  it("drift count comes from drifted_files.length", () => {
    render(<OrchestrationIntegrityCard doc={redLive} />);
    const counts = screen.getByTestId("orchestration-integrity-counts");
    expect(counts.textContent).toContain("drift");
    // drift has 2 drifted_files
    const numbers = Array.from(counts.querySelectorAll("span")).map((el) => el.textContent);
    expect(numbers).toContain("2");
  });

  it("runtime_issues.open_count surfaces", () => {
    render(<OrchestrationIntegrityCard doc={redLive} />);
    const counts = screen.getByTestId("orchestration-integrity-counts");
    expect(counts.textContent).toContain("9"); // runtime_issues.open_count
    expect(counts.textContent).toContain("issues");
  });
});

describe("OrchestrationIntegrityCard — accessibility + RTL", () => {
  it("aria-label is 'Orchestrator Integrity'", () => {
    render(<OrchestrationIntegrityCard doc={null} />);
    expect(screen.getByLabelText("Orchestrator Integrity")).toBeTruthy();
  });

  it("freshness line surfaces _meta.generated_at when present", () => {
    render(<OrchestrationIntegrityCard doc={greenLive} />);
    const freshness = screen.getByTestId("orchestration-integrity-freshness");
    expect(freshness.textContent).toContain("generated:");
  });

  it("freshness line says unknown when generated_at absent (null doc)", () => {
    render(<OrchestrationIntegrityCard doc={null} />);
    const freshness = screen.getByTestId("orchestration-integrity-freshness");
    expect(freshness.textContent).toContain("unknown");
  });
});
