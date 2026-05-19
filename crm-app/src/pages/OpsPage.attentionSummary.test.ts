import { describe, it, expect } from "vitest";
import {
  attentionSummary,
  type AttentionCategoryKey,
  type AttentionSummaryInput,
} from "./AttentionSummaryCard";

const CATEGORY_ORDER: AttentionCategoryKey[] = [
  "owner_required",
  "escalate",
  "autonomous_ready",
  "stale",
  "blockers",
];
import type {
  DependenciesDoc,
  FreshnessDoc,
  ProcessesDoc,
  QueueRoutesDoc,
  RuntimeIssuesDoc,
  WorkflowsDoc,
} from "./OpsPage";

function emptyInput(): AttentionSummaryInput {
  return {
    ownerGates: [],
    activeIncidents: [],
    blockers: [],
    freshness: null,
    runtimeIssues: null,
    pushIsolation: null,
    processes: null,
    dependencies: null,
    workflows: null,
    orchestratorIntegrity: null,
    queueRoutes: null,
  };
}

function findCat(
  res: ReturnType<typeof attentionSummary>,
  key: AttentionCategoryKey,
) {
  return res.categories.find((c) => c.key === key);
}

describe("attentionSummary — empty inputs", () => {
  it("flags hasAnyData=false when all sources are null/empty", () => {
    const r = attentionSummary(emptyInput());
    expect(r.hasAnyData).toBe(false);
    expect(r.hasAnyAttention).toBe(false);
    expect(r.totalAttentionCount).toBe(0);
  });

  it("always emits the same 5 categories in canonical order", () => {
    const r = attentionSummary(emptyInput());
    expect(r.categories.map((c) => c.key)).toEqual(CATEGORY_ORDER);
  });

  it("autonomous-ready reason explains missing routes data and is severity=watch", () => {
    const r = attentionSummary(emptyInput());
    const auto = findCat(r, "autonomous_ready");
    expect(auto?.count).toBe(0);
    expect(auto?.topReason).toMatch(/queue_routes\.json/);
    expect(auto?.hasData).toBe(false);
    // Severity must NOT be info when the producer is missing — otherwise the
    // "0 autonomous" reads as "no work" instead of "we don't know".
    expect(auto?.severity).toBe("watch");
  });

  it("stale reason explains missing freshness data and is severity=watch", () => {
    const r = attentionSummary(emptyInput());
    const stale = findCat(r, "stale");
    expect(stale?.count).toBe(0);
    expect(stale?.topReason).toMatch(/freshness\.json/);
    expect(stale?.hasData).toBe(false);
    expect(stale?.severity).toBe("watch");
  });
});

describe("attentionSummary — owner_required", () => {
  it("counts owner gates", () => {
    const input = emptyInput();
    input.ownerGates = ["secrets-rotation", "schema-migration"];
    const r = attentionSummary(input);
    const owner = findCat(r, "owner_required");
    expect(owner?.count).toBe(2);
    expect(owner?.severity).toBe("action");
    expect(owner?.topReason).toContain("secrets-rotation");
  });

  it("counts active incidents and prioritizes them in topReason", () => {
    const input = emptyInput();
    input.ownerGates = ["g1"];
    input.activeIncidents = ["INC-42 prod-down"];
    const r = attentionSummary(input);
    const owner = findCat(r, "owner_required");
    expect(owner?.count).toBe(2);
    expect(owner?.topReason).toContain("INC-42");
  });

  it("adds routed-owner queue count", () => {
    const input = emptyInput();
    const routes: QueueRoutesDoc = {
      summary: { autonomous: 0, owner: 3, escalate: 0, defer: 0 },
    };
    input.queueRoutes = routes;
    const r = attentionSummary(input);
    expect(findCat(r, "owner_required")?.count).toBe(3);
  });
});

describe("attentionSummary — escalate", () => {
  it("counts high-severity runtime issues only as escalations", () => {
    const input = emptyInput();
    const issues: RuntimeIssuesDoc = {
      issues: [
        { id: "a", severity: "high" },
        { id: "b", severity: "medium" },
        { id: "c", severity: "low" },
        { id: "d", severity: "critical" },
      ],
    };
    input.runtimeIssues = issues;
    const r = attentionSummary(input);
    const esc = findCat(r, "escalate");
    expect(esc?.count).toBe(2);
    expect(esc?.topReason).toContain("חמורה");
    expect(esc?.severity).toBe("action");
  });

  it("treats routed-escalate queue items as escalations", () => {
    const input = emptyInput();
    input.queueRoutes = {
      summary: { autonomous: 0, owner: 0, escalate: 4, defer: 0 },
    };
    const r = attentionSummary(input);
    expect(findCat(r, "escalate")?.count).toBe(4);
  });

  it("escalate severity is info when count is zero", () => {
    const input = emptyInput();
    const issues: RuntimeIssuesDoc = {
      issues: [{ id: "a", severity: "low" }],
    };
    input.runtimeIssues = issues;
    const r = attentionSummary(input);
    expect(findCat(r, "escalate")?.count).toBe(0);
    expect(findCat(r, "escalate")?.severity).toBe("info");
  });
});

describe("attentionSummary — autonomous_ready", () => {
  it("surfaces routed-autonomous count as watch when >0", () => {
    const input = emptyInput();
    input.queueRoutes = {
      summary: { autonomous: 7, owner: 0, escalate: 0, defer: 0 },
    };
    const r = attentionSummary(input);
    const auto = findCat(r, "autonomous_ready");
    expect(auto?.count).toBe(7);
    expect(auto?.severity).toBe("watch");
    expect(auto?.topReason).toMatch(/7 פריט/);
  });

  it("does not contribute to totalAttentionCount when severity=info", () => {
    const r1 = attentionSummary(emptyInput());
    expect(r1.totalAttentionCount).toBe(0);
  });
});

describe("attentionSummary — stale", () => {
  function fresh(files: Record<string, number>): FreshnessDoc {
    return {
      files: Object.fromEntries(
        Object.entries(files).map(([k, ageHours]) => [
          k,
          { mtime: "", age_seconds: ageHours * 3600 },
        ]),
      ),
    };
  }

  it("counts files older than 6h", () => {
    const input = emptyInput();
    input.freshness = fresh({
      "queue.json": 8,
      "routes.json": 2,
      "merges.json": 12,
    });
    const r = attentionSummary(input);
    const s = findCat(r, "stale");
    expect(s?.count).toBe(2);
    expect(s?.severity).toBe("watch");
    expect(s?.topReason).toMatch(/12 שע/);
  });

  it("escalates to action when oldest stale file is ≥48h", () => {
    const input = emptyInput();
    input.freshness = fresh({ "queue.json": 72 });
    const r = attentionSummary(input);
    expect(findCat(r, "stale")?.severity).toBe("action");
  });

  it("hasData=false when freshness is null", () => {
    const r = attentionSummary(emptyInput());
    expect(findCat(r, "stale")?.hasData).toBe(false);
  });
});

describe("attentionSummary — blockers", () => {
  it("counts explicit blockers and surfaces top summary", () => {
    const input = emptyInput();
    input.blockers = [
      { id: "crm-auth", summary: "auth gate pending" },
      { id: "n8n-quota", summary: "n8n quota" },
    ];
    const r = attentionSummary(input);
    const b = findCat(r, "blockers");
    expect(b?.count).toBe(2);
    expect(b?.topReason).toBe("auth gate pending");
    expect(b?.severity).toBe("action");
  });

  it("counts failing workflows", () => {
    const input = emptyInput();
    const workflows: WorkflowsDoc = {
      workflows: [
        {
          workflow_key: "deploy-crm",
          name: "Deploy CRM",
          enabled: true,
          health: "failing",
        },
        {
          workflow_key: "deploy-mn",
          name: "Deploy MN",
          enabled: true,
          health: "broken_confirmed",
        },
        {
          workflow_key: "deploy-other",
          name: "Other",
          enabled: true,
          health: "healthy",
        },
      ],
    };
    input.workflows = workflows;
    const r = attentionSummary(input);
    expect(findCat(r, "blockers")?.count).toBe(2);
  });

  it("counts dependency failures and collection errors", () => {
    const input = emptyInput();
    const deps: DependenciesDoc = {
      _meta: { errors: ["network: timeout"] },
      dependencies: [
        {
          repo: "x",
          pr_number: 1,
          checks_summary: { fail: 2, pass: 5, pending: 0 },
          resolved: false,
        } as never,
        {
          repo: "y",
          pr_number: 2,
          checks_summary: { fail: 0, pass: 5, pending: 0 },
          resolved: true,
        } as never,
      ],
    };
    input.dependencies = deps;
    const r = attentionSummary(input);
    // 1 failingCheck + 1 error
    expect(findCat(r, "blockers")?.count).toBe(2);
  });

  it("counts actionable processes (not RESOLVED_NO_ACTION)", () => {
    const input = emptyInput();
    const procs: ProcessesDoc = {
      long_running_processes: [
        { pid: 1234, verdict: "INVESTIGATING" },
        { pid: 5678, verdict: "RESOLVED_NO_ACTION" },
        { pid: 9012, verdict: "STOP_AND_ANALYZE" },
      ],
    };
    input.processes = procs;
    const r = attentionSummary(input);
    expect(findCat(r, "blockers")?.count).toBe(2);
    expect(findCat(r, "blockers")?.topReason).toMatch(/PID 1234/);
  });
});

describe("attentionSummary — totals + hasAnyAttention", () => {
  it("totalAttentionCount sums only non-info categories", () => {
    const input = emptyInput();
    input.ownerGates = ["g1"];
    input.blockers = [{ id: "b1", summary: "x" }];
    input.queueRoutes = {
      summary: { autonomous: 5, owner: 0, escalate: 0, defer: 0 },
    };
    const r = attentionSummary(input);
    // owner=1(action) + escalate=0(info, skipped) + autonomous=5(watch, counted)
    // + stale=0(info, skipped) + blockers=1(action) = 7
    expect(r.totalAttentionCount).toBe(7);
    expect(r.hasAnyAttention).toBe(true);
  });

  it("hasAnyAttention is false when all attention categories are zero/info", () => {
    const input = emptyInput();
    // Provide some doc to flip hasAnyData true but no attention items.
    input.freshness = { files: {} };
    const r = attentionSummary(input);
    expect(r.hasAnyData).toBe(true);
    expect(r.hasAnyAttention).toBe(false);
    expect(r.totalAttentionCount).toBe(0);
  });
});
