import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  HybridBlockersCard,
  partitionHybridBlockers,
} from "./HybridBlockersCard";
import type {
  AttentionSynthItem,
  AttentionSynthesisDoc,
} from "./AttentionSynthesisCard";

function item(over: Partial<AttentionSynthItem> & { id: string }): AttentionSynthItem {
  return {
    id: over.id,
    source: over.source ?? "blockers",
    title: over.title ?? `title-${over.id}`,
    gate_role: over.gate_role,
    next_action: over.next_action,
    stale_days: over.stale_days,
    source_ref: over.source_ref,
    rank_score: over.rank_score,
    lifecycle: over.lifecycle,
  };
}

function doc(items: AttentionSynthItem[]): AttentionSynthesisDoc {
  return { items };
}

describe("partitionHybridBlockers", () => {
  it("routes by producer source — owner vs runtime, ignoring other sources", () => {
    const d = doc([
      item({ id: "o1", source: "blockers" }),
      item({ id: "r1", source: "governance-debt" }),
      item({ id: "r2", source: "runtime-issues" }),
      item({ id: "x1", source: "operational-queue" }),
      item({ id: "x2", source: "handoff-completeness" }),
    ]);
    const { ownerCurated, runtimeDerived } = partitionHybridBlockers(d);
    expect(ownerCurated.map((i) => i.id)).toEqual(["o1"]);
    expect(runtimeDerived.map((i) => i.id).sort()).toEqual(["r1", "r2"]);
  });

  it("sorts each lane by rank_score desc", () => {
    const d = doc([
      item({ id: "low", source: "blockers", rank_score: 10 }),
      item({ id: "high", source: "blockers", rank_score: 90 }),
    ]);
    expect(partitionHybridBlockers(d).ownerCurated.map((i) => i.id)).toEqual([
      "high",
      "low",
    ]);
  });

  it("returns empty lanes for null doc", () => {
    expect(partitionHybridBlockers(null)).toEqual({
      ownerCurated: [],
      runtimeDerived: [],
    });
  });
});

describe("HybridBlockersCard", () => {
  it("renders owner and runtime items in their separate lanes", () => {
    render(
      <HybridBlockersCard
        doc={doc([
          item({ id: "o1", source: "blockers", title: "owner blocker" }),
          item({ id: "r1", source: "governance-debt", title: "runtime gap" }),
        ])}
      />,
    );
    const ownerList = document.getElementById("hybrid-blockers-owner");
    const runtimeList = document.getElementById("hybrid-blockers-runtime");
    expect(within(ownerList as HTMLElement).getByText("owner blocker")).toBeTruthy();
    expect(within(runtimeList as HTMLElement).getByText("runtime gap")).toBeTruthy();
  });

  it("labels owner_required ONLY when gate_role is owner", () => {
    render(
      <HybridBlockersCard
        doc={doc([
          item({ id: "o1", source: "blockers", gate_role: "owner" }),
          item({ id: "r1", source: "runtime-issues", gate_role: undefined }),
        ])}
      />,
    );
    // exactly one "דרוש אונר" badge — never applied to the runtime item
    expect(screen.getAllByText("דרוש אונר")).toHaveLength(1);
  });

  it("surfaces evidence path and next_action", () => {
    render(
      <HybridBlockersCard
        doc={doc([
          item({
            id: "r1",
            source: "governance-debt",
            source_ref: "state/runtime_governance_debt.json#abc",
            next_action: "inspect read-only evidence",
          }),
        ])}
      />,
    );
    expect(
      screen.getByText("state/runtime_governance_debt.json#abc"),
    ).toBeTruthy();
    expect(screen.getByText(/inspect read-only evidence/)).toBeTruthy();
  });

  it("renders a graceful empty/null state without crashing", () => {
    render(<HybridBlockersCard doc={null} />);
    expect(screen.getByLabelText("חסמים — אונר מול ריצה")).toBeTruthy();
  });
});
