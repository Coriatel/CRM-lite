import { describe, it, expect } from "vitest";
import { sortByPriority, prominenceOf, bucketOf, rollupSystems, isSameItem } from "./decisionLogic";
import type { DecisionCard, PortfolioSystem } from "./decisionTypes";

const card = (id: string, urgency: string, age: number): DecisionCard => ({
  id,
  category: "D",
  title: id,
  why_it_matters: "",
  recommendation: "",
  urgency,
  confidence: "נמוך",
  evidence_refs: [],
  age_days: age,
});

describe("sortByPriority", () => {
  it("orders high→medium→low, then oldest first within a tier", () => {
    const out = sortByPriority([
      card("low", "low", 100),
      card("high-new", "high", 5),
      card("high-old", "high", 40),
      card("med", "medium", 10),
    ]);
    expect(out.map((c) => c.id)).toEqual(["high-old", "high-new", "med", "low"]);
  });
});

describe("isSameItem (route-aware dedup)", () => {
  const withRoute = (id: string, route?: string): DecisionCard => ({ ...card(id, "high", 1), route });
  it("matches on equal id", () => {
    expect(isSameItem(withRoute("x"), withRoute("x"))).toBe(true);
  });
  it("matches differently-prefixed ids that share a specific entity route", () => {
    const reco = withRoute("blocker:crm-lite-slice4-apply", "/ops/blockers/crm-lite-slice4-apply");
    const queued = withRoute("crm-lite-slice4-apply", "/ops/blockers/crm-lite-slice4-apply");
    expect(isSameItem(queued, reco)).toBe(true);
  });
  it("does NOT match distinct items that share a generic anchor route", () => {
    const a = withRoute("req-a", "/ops#owner-gates");
    const b = withRoute("req-b", "/ops#owner-gates");
    expect(isSameItem(a, b)).toBe(false);
  });
});

describe("prominenceOf", () => {
  it("maps urgency to a visual tier", () => {
    expect(prominenceOf("high")).toBe("critical");
    expect(prominenceOf("medium")).toBe("important");
    expect(prominenceOf("low")).toBe("info");
  });
});

const sys = (system: string, status: string, needs = 0): PortfolioSystem => ({
  system,
  label: system,
  status,
  headline: "",
  needs_me: needs,
  risk: null,
  next_action: null,
  recommendation: null,
  evidence_refs: [],
});

describe("bucketOf / rollupSystems", () => {
  it("buckets by status, unknown counts as attention", () => {
    expect(bucketOf("תקין")).toBe("healthy");
    expect(bucketOf("בעבודה")).toBe("warning");
    expect(bucketOf("דורש אותך")).toBe("attention");
    expect(bucketOf("לא ידוע")).toBe("attention");
  });

  it("rolls up counts and orders attention first", () => {
    const r = rollupSystems([
      sys("a", "תקין"),
      sys("b", "דורש אותך"),
      sys("c", "בעבודה"),
      sys("d", "לא ידוע"),
    ]);
    expect(r).toMatchObject({ healthy: 1, warning: 1, attention: 2 });
    expect(r.ordered.map((s) => s.system).slice(0, 2).sort()).toEqual(["b", "d"]);
    expect(r.ordered[r.ordered.length - 1].system).toBe("a"); // healthy last
  });
});
