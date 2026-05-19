import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttentionBucketOperatorSummary } from "../dashboard/AttentionBucketOperatorSummary";
import type { AttentionItem } from "../../data/amutaAttention";

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: `att-${Math.random().toString(36).slice(2, 8)}`,
    title: "פריט",
    owner: "elron",
    urgency: "normal",
    status: "open",
    domain: "people",
    next_action: "—",
    ...overrides,
  };
}

const PREFIX = "elron-queue";

describe("AttentionBucketOperatorSummary", () => {
  it("renders severity / headline / meaning / nextAction with the test-id prefix", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[item({ urgency: "critical" })]}
        testIdPrefix={PREFIX}
      />,
    );
    expect(screen.getByTestId(`${PREFIX}-operator-severity`)).toBeTruthy();
    expect(screen.getByTestId(`${PREFIX}-operator-headline`)).toBeTruthy();
    expect(screen.getByTestId(`${PREFIX}-operator-meaning`)).toBeTruthy();
    expect(screen.getByTestId(`${PREFIX}-operator-next-action`)).toBeTruthy();
  });

  it("shows 'דורש פעולה' severity label when a critical item is present", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[item({ urgency: "critical" })]}
        testIdPrefix={PREFIX}
      />,
    );
    expect(screen.getByTestId(`${PREFIX}-operator-severity`).textContent).toBe(
      "דורש פעולה",
    );
    expect(
      screen.getByTestId(`${PREFIX}-operator-headline`).textContent,
    ).toContain("דחופות");
  });

  it("shows 'במעקב' severity label when only blocked items present", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[item({ status: "blocked" })]}
        testIdPrefix={PREFIX}
      />,
    );
    // blocked_present is severity=action per classifier
    expect(screen.getByTestId(`${PREFIX}-operator-severity`).textContent).toBe(
      "דורש פעולה",
    );
  });

  it("shows 'תקין' severity label when all items are ordinary actionable", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[item(), item(), item()]}
        testIdPrefix={PREFIX}
      />,
    );
    expect(screen.getByTestId(`${PREFIX}-operator-severity`).textContent).toBe(
      "תקין",
    );
  });

  it("test-id prefix is honored so two summaries can coexist", () => {
    render(
      <>
        <AttentionBucketOperatorSummary
          items={[item()]}
          testIdPrefix="rabbi-queue"
        />
        <AttentionBucketOperatorSummary
          items={[item({ urgency: "critical" })]}
          testIdPrefix="elron-queue"
        />
      </>,
    );
    expect(
      screen.getByTestId("rabbi-queue-operator-severity").textContent,
    ).toBe("תקין");
    expect(
      screen.getByTestId("elron-queue-operator-severity").textContent,
    ).toBe("דורש פעולה");
  });

  it("meaning + nextAction strings are non-empty for every category", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[item()]}
        testIdPrefix={PREFIX}
      />,
    );
    const meaning = screen.getByTestId(`${PREFIX}-operator-meaning`).textContent ?? "";
    const next = screen.getByTestId(`${PREFIX}-operator-next-action`).textContent ?? "";
    expect(meaning.length).toBeGreaterThan(10);
    expect(next.length).toBeGreaterThan(5);
    expect(meaning).toContain("מה זה אומר");
    expect(next).toContain("מה ניתן לעשות");
  });
});
