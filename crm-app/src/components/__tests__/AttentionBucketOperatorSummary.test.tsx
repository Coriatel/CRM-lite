import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttentionBucketOperatorSummary } from "../dashboard/AttentionBucketOperatorSummary";
import type {
  AttentionItem,
  AttentionStatus,
  AttentionUrgency,
} from "../../data/amutaAttention";

function item(
  over: Partial<AttentionItem> & {
    urgency: AttentionUrgency;
    status: AttentionStatus;
  },
): AttentionItem {
  return {
    id: over.id ?? `att-${Math.random().toString(36).slice(2, 8)}`,
    title: over.title ?? "פריט",
    owner: over.owner ?? "elron",
    domain: over.domain ?? "tasks",
    next_action: over.next_action ?? "פעולה",
    urgency: over.urgency,
    status: over.status,
  };
}

describe("AttentionBucketOperatorSummary", () => {
  it("renders the severity pill, headline, meaning, and next-action sections", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[item({ urgency: "normal", status: "open" })]}
        testIdPrefix="t1"
      />,
    );
    expect(screen.getByTestId("t1-operator-severity")).toBeTruthy();
    expect(screen.getByTestId("t1-operator-headline")).toBeTruthy();
    expect(screen.getByTestId("t1-operator-meaning")).toBeTruthy();
    expect(screen.getByTestId("t1-operator-next-action")).toBeTruthy();
  });

  it("uses the action severity label for a critical bucket", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[item({ urgency: "critical", status: "open" })]}
        testIdPrefix="t-action"
      />,
    );
    expect(screen.getByTestId("t-action-operator-severity").textContent).toBe(
      "דורש פעולה",
    );
    expect(
      screen.getByTestId("t-action-operator-headline").textContent,
    ).toContain("דחופות מאוד");
  });

  it("uses the watch severity label when waiting items dominate", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[
          item({ urgency: "normal", status: "waiting" }),
          item({ urgency: "normal", status: "waiting" }),
          item({ urgency: "normal", status: "open" }),
        ]}
        testIdPrefix="t-watch"
      />,
    );
    expect(screen.getByTestId("t-watch-operator-severity").textContent).toBe(
      "במעקב",
    );
    expect(
      screen.getByTestId("t-watch-operator-headline").textContent,
    ).toContain("ממתינות לאישור (2/3)");
  });

  it("uses the info severity label for a healthy actionable bucket", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[item({ urgency: "normal", status: "open" })]}
        testIdPrefix="t-info"
      />,
    );
    expect(screen.getByTestId("t-info-operator-severity").textContent).toBe(
      "תקין",
    );
  });

  it("namespaces all four data-testids by the given prefix", () => {
    const { container } = render(
      <AttentionBucketOperatorSummary
        items={[item({ urgency: "normal", status: "blocked" })]}
        testIdPrefix="elron-queue"
      />,
    );
    const ids = Array.from(
      container.querySelectorAll<HTMLElement>("[data-testid]"),
    ).map((el) => el.dataset.testid);
    expect(ids.sort()).toEqual(
      [
        "elron-queue-operator-headline",
        "elron-queue-operator-meaning",
        "elron-queue-operator-next-action",
        "elron-queue-operator-severity",
      ].sort(),
    );
  });

  it("always renders both labels (מה זה אומר / מה ניתן לעשות)", () => {
    render(
      <AttentionBucketOperatorSummary
        items={[item({ urgency: "normal", status: "stale" })]}
        testIdPrefix="labels"
      />,
    );
    expect(
      screen.getByTestId("labels-operator-meaning").textContent,
    ).toContain("מה זה אומר:");
    expect(
      screen.getByTestId("labels-operator-next-action").textContent,
    ).toContain("מה ניתן לעשות:");
  });
});
