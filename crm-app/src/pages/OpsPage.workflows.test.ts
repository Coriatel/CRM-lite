import { describe, it, expect } from "vitest";
import { classifyWorkflowsForOperator, workflowsAttention } from "./OpsPage";

describe("workflowsAttention", () => {
  it("returns empty buckets for null doc", () => {
    const r = workflowsAttention(null);
    expect(r.failing).toEqual([]);
    expect(r.stale).toEqual([]);
    expect(r.productionCriticalFailing).toBe(0);
    expect(r.total).toBe(0);
  });

  it("buckets failing/broken_confirmed/broken_suspected as failing", () => {
    const r = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "failing" },
        { workflow_key: "b", enabled: true, health: "broken_confirmed" },
        { workflow_key: "c", enabled: true, health: "broken_suspected" },
      ],
    });
    expect(r.failing.map((w) => w.workflow_key).sort()).toEqual(["a", "b", "c"]);
    expect(r.stale).toEqual([]);
  });

  it("buckets stale/unknown as stale, not failing", () => {
    const r = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "stale" },
        { workflow_key: "b", enabled: true, health: "unknown" },
      ],
    });
    expect(r.stale.map((w) => w.workflow_key).sort()).toEqual(["a", "b"]);
    expect(r.failing).toEqual([]);
  });

  it("excludes disabled / deprecated from failing+stale even when health is bad", () => {
    const r = workflowsAttention({
      workflows: [
        // health says failing but disabled — operator already silenced this
        { workflow_key: "a", enabled: false, health: "failing" },
        { workflow_key: "b", enabled: true, health: "deprecated" },
        // explicit "disabled" health value
        { workflow_key: "c", enabled: true, health: "disabled" },
      ],
    });
    expect(r.failing).toEqual([]);
    expect(r.stale).toEqual([]);
    expect(r.disabled).toBe(2);
    expect(r.deprecated).toBe(1);
  });

  it("counts production_critical failures separately", () => {
    const r = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "failing", criticality: "production_critical" },
        { workflow_key: "b", enabled: true, health: "failing", criticality: "important" },
        { workflow_key: "c", enabled: true, health: "broken_confirmed", criticality: "production_critical" },
      ],
    });
    expect(r.productionCriticalFailing).toBe(2);
    expect(r.failing.length).toBe(3);
  });

  it("sorts failing rows by criticality (prod-critical first) then workflow_key", () => {
    const r = workflowsAttention({
      workflows: [
        { workflow_key: "z", enabled: true, health: "failing", criticality: "low" },
        { workflow_key: "m", enabled: true, health: "failing", criticality: "production_critical" },
        { workflow_key: "a", enabled: true, health: "failing", criticality: "production_critical" },
        { workflow_key: "n", enabled: true, health: "failing", criticality: "important" },
      ],
    });
    expect(r.failing.map((w) => w.workflow_key)).toEqual(["a", "m", "n", "z"]);
  });

  it("counts healthy / disabled / deprecated for header context", () => {
    const r = workflowsAttention({
      workflows: [
        { workflow_key: "h1", enabled: true, health: "healthy" },
        { workflow_key: "h2", enabled: true, health: "healthy" },
        { workflow_key: "d1", enabled: false, health: "healthy" },
        { workflow_key: "x1", enabled: true, health: "deprecated" },
      ],
    });
    expect(r.healthy).toBe(2);
    expect(r.disabled).toBe(1);
    expect(r.deprecated).toBe(1);
  });

  it("handles enabled as string 'true'/'false'", () => {
    const r = workflowsAttention({
      workflows: [
        // string passthrough — defensive against CSV that didn't get type-coerced
        { workflow_key: "a", enabled: "true" as unknown as boolean, health: "failing" },
        { workflow_key: "b", enabled: "false" as unknown as boolean, health: "failing" },
      ],
    });
    expect(r.failing.map((w) => w.workflow_key)).toEqual(["a"]);
    expect(r.disabled).toBe(1);
  });
});

describe("classifyWorkflowsForOperator", () => {
  it("returns null when no failing and no stale rows", () => {
    const att = workflowsAttention({
      workflows: [
        { workflow_key: "h", enabled: true, health: "healthy" },
        { workflow_key: "x", enabled: true, health: "deprecated" },
      ],
    });
    expect(classifyWorkflowsForOperator(att)).toBeNull();
  });

  it("returns null for empty doc (card hidden upstream)", () => {
    expect(classifyWorkflowsForOperator(workflowsAttention(null))).toBeNull();
  });

  it("prod-critical failing → action severity + prod_critical_failing category", () => {
    const att = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "failing", criticality: "production_critical" },
        { workflow_key: "b", enabled: true, health: "failing", criticality: "normal" },
      ],
    });
    const v = classifyWorkflowsForOperator(att)!;
    expect(v.severity).toBe("action");
    expect(v.topCategory).toBe("prod_critical_failing");
    expect(v.productionCriticalFailing).toBe(1);
    expect(v.failingCount).toBe(2);
    expect(v.headline).toContain("(1)");
  });

  it("failing-only (no prod-critical) → action severity + failing_only category", () => {
    const att = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "failing", criticality: "important" },
        { workflow_key: "b", enabled: true, health: "broken_confirmed", criticality: "normal" },
      ],
    });
    const v = classifyWorkflowsForOperator(att)!;
    expect(v.severity).toBe("action");
    expect(v.topCategory).toBe("failing_only");
    expect(v.productionCriticalFailing).toBe(0);
    expect(v.failingCount).toBe(2);
    expect(v.headline).toContain("(2)");
  });

  it("stale-only → watch severity + stale_only category", () => {
    const att = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "stale" },
        { workflow_key: "b", enabled: true, health: "unknown" },
      ],
    });
    const v = classifyWorkflowsForOperator(att)!;
    expect(v.severity).toBe("watch");
    expect(v.topCategory).toBe("stale_only");
    expect(v.staleCount).toBe(2);
    expect(v.failingCount).toBe(0);
    expect(v.headline).toContain("(2)");
  });

  it("prod-critical wins over stale + non-critical failing", () => {
    const att = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "failing", criticality: "production_critical" },
        { workflow_key: "b", enabled: true, health: "failing", criticality: "low" },
        { workflow_key: "c", enabled: true, health: "stale" },
      ],
    });
    const v = classifyWorkflowsForOperator(att)!;
    expect(v.topCategory).toBe("prod_critical_failing");
    expect(v.severity).toBe("action");
  });

  it("failing rows beat stale rows when no prod-critical", () => {
    const att = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "failing", criticality: "normal" },
        { workflow_key: "b", enabled: true, health: "stale" },
        { workflow_key: "c", enabled: true, health: "unknown" },
      ],
    });
    const v = classifyWorkflowsForOperator(att)!;
    expect(v.topCategory).toBe("failing_only");
    expect(v.severity).toBe("action");
  });

  it("headline / meaning / nextAction are non-empty Hebrew strings", () => {
    const att = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "failing", criticality: "production_critical" },
      ],
    });
    const v = classifyWorkflowsForOperator(att)!;
    expect(v.headline.length).toBeGreaterThan(0);
    expect(v.meaning.length).toBeGreaterThan(0);
    expect(v.nextAction.length).toBeGreaterThan(0);
    // Hebrew chars present (Unicode block 0590–05FF)
    expect(/[֐-׿]/.test(v.headline)).toBe(true);
    expect(/[֐-׿]/.test(v.meaning)).toBe(true);
    expect(/[֐-׿]/.test(v.nextAction)).toBe(true);
  });

  it("disabled + deprecated alone do not trigger the card view", () => {
    const att = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: false, health: "failing" },
        { workflow_key: "b", enabled: true, health: "deprecated" },
        { workflow_key: "c", enabled: true, health: "disabled" },
      ],
    });
    expect(classifyWorkflowsForOperator(att)).toBeNull();
  });

  it("single prod-critical failure surfaces count of 1 in headline", () => {
    const att = workflowsAttention({
      workflows: [
        { workflow_key: "a", enabled: true, health: "broken_confirmed", criticality: "production_critical" },
      ],
    });
    const v = classifyWorkflowsForOperator(att)!;
    expect(v.headline).toContain("(1)");
    expect(v.productionCriticalFailing).toBe(1);
  });
});
