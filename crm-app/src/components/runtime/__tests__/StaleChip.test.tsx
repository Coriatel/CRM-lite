import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaleChip } from "../StaleChip";

const NOW = new Date("2026-05-27T12:00:00Z").getTime();

describe("StaleChip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when fetchedAt is null", () => {
    const { container } = render(<StaleChip fetchedAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when fetchedAt is invalid", () => {
    const { container } = render(<StaleChip fetchedAt="not-a-date" />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when age is below threshold", () => {
    const fresh = new Date(NOW - 5 * 60_000).toISOString(); // 5 min ago, threshold = 10 min
    const { container } = render(<StaleChip fetchedAt={fresh} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders minutes label when stale by minutes", () => {
    const stale = new Date(NOW - 15 * 60_000).toISOString();
    render(<StaleChip fetchedAt={stale} testId="stale" />);
    const chip = screen.getByTestId("stale");
    expect(chip.textContent).toBe("מידע מלפני 15 דק׳");
    expect(chip.getAttribute("data-stale-variant")).toBe("quiet");
  });

  it("renders hours label once age exceeds 60 minutes", () => {
    const stale = new Date(NOW - 3 * 60 * 60_000).toISOString();
    render(<StaleChip fetchedAt={stale} testId="stale" />);
    expect(screen.getByTestId("stale").textContent).toBe("מידע מלפני 3 שע׳");
  });

  it("renders days label once age exceeds 24 hours", () => {
    const stale = new Date(NOW - 2 * 24 * 60 * 60_000).toISOString();
    render(<StaleChip fetchedAt={stale} testId="stale" />);
    expect(screen.getByTestId("stale").textContent).toBe("מידע מלפני 2 ימים");
  });

  it("derives warn variant at >= 2× threshold", () => {
    const stale = new Date(NOW - 25 * 60_000).toISOString(); // 2.5× of 10 min
    render(<StaleChip fetchedAt={stale} testId="stale" />);
    expect(screen.getByTestId("stale").getAttribute("data-stale-variant")).toBe(
      "warn",
    );
  });

  it("derives alert variant at >= 6× threshold", () => {
    const stale = new Date(NOW - 90 * 60_000).toISOString(); // 9× of 10 min
    render(<StaleChip fetchedAt={stale} testId="stale" />);
    expect(screen.getByTestId("stale").getAttribute("data-stale-variant")).toBe(
      "alert",
    );
  });

  it("honours explicit variant override", () => {
    const stale = new Date(NOW - 11 * 60_000).toISOString();
    render(<StaleChip fetchedAt={stale} variant="alert" testId="stale" />);
    expect(screen.getByTestId("stale").getAttribute("data-stale-variant")).toBe(
      "alert",
    );
  });

  it("respects custom thresholdMs", () => {
    const at = new Date(NOW - 5 * 60_000).toISOString(); // 5 min ago
    // threshold = 1 minute → 5 min is stale
    render(<StaleChip fetchedAt={at} thresholdMs={60_000} testId="stale" />);
    expect(screen.getByTestId("stale")).toBeTruthy();
  });

  it("sets aria-label with minutes count", () => {
    const stale = new Date(NOW - 15 * 60_000).toISOString();
    render(<StaleChip fetchedAt={stale} testId="stale" />);
    expect(screen.getByTestId("stale").getAttribute("aria-label")).toBe(
      "מידע מלפני 15 דקות",
    );
  });
});
