import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AttentionItem } from "../../data/amutaAttention";
import { ElronQueuePage } from "../ElronQueuePage";

const useAmutaAttentionMock = vi.fn();
vi.mock("../../data/useAmutaAttention", () => ({
  useAmutaAttention: () => useAmutaAttentionMock(),
}));

function item(
  id: string,
  urgency: AttentionItem["urgency"],
  status: AttentionItem["status"],
): AttentionItem {
  return {
    id,
    title: `t-${id}`,
    owner: "elron",
    urgency,
    status,
    domain: "people",
    next_action: "step",
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/elron"]}>
      <ElronQueuePage />
    </MemoryRouter>,
  );
}

describe("ElronQueuePage — per-group operator summary", () => {
  beforeEach(() => {
    useAmutaAttentionMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders an operator summary inside each non-empty group", () => {
    useAmutaAttentionMock.mockReturnValue({
      buckets: {
        needsElron: [item("u1", "critical", "open"), item("o1", "normal", "open")],
        needsRav: [],
        stuck: [item("s1", "normal", "stale")],
      },
      source: "mock",
      error: null,
      loading: false,
      refresh: () => {},
    });

    renderPage();

    expect(
      screen.getByTestId("elron-group-urgent-operator-headline"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("elron-group-stuck-operator-headline"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("elron-group-open-operator-headline"),
    ).toBeTruthy();
  });

  it("omits the operator summary for empty groups", () => {
    useAmutaAttentionMock.mockReturnValue({
      buckets: {
        needsElron: [item("u1", "critical", "open")],
        needsRav: [],
        stuck: [],
      },
      source: "mock",
      error: null,
      loading: false,
      refresh: () => {},
    });

    renderPage();

    expect(
      screen.getByTestId("elron-group-urgent-operator-headline"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("elron-group-stuck-operator-headline"),
    ).toBeNull();
    expect(
      screen.queryByTestId("elron-group-open-operator-headline"),
    ).toBeNull();
  });

  it("keeps the page-level operator summary alongside the per-group ones", () => {
    useAmutaAttentionMock.mockReturnValue({
      buckets: {
        needsElron: [item("u1", "critical", "open")],
        needsRav: [],
        stuck: [item("s1", "normal", "stale")],
      },
      source: "mock",
      error: null,
      loading: false,
      refresh: () => {},
    });

    renderPage();

    expect(
      screen.getByTestId("elron-queue-operator-headline"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("elron-group-urgent-operator-headline"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("elron-group-stuck-operator-headline"),
    ).toBeTruthy();
  });
});
