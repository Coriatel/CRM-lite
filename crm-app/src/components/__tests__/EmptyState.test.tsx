import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders default no-data variant with Hebrew copy", () => {
    render(<EmptyState />);
    const status = screen.getByRole("status");
    expect(status).toBeTruthy();
    expect(status.getAttribute("data-empty-variant")).toBe("no-data");
    expect(screen.getByText("אין נתונים להצגה")).toBeTruthy();
  });

  it("renders blocked-on-schema variant with requires chip", () => {
    render(
      <EmptyState
        variant="blocked-on-schema"
        requires="cohorts + cohort_members"
      />,
    );
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-empty-variant")).toBe("blocked-on-schema");
    expect(screen.getByText("cohorts + cohort_members")).toBeTruthy();
    expect(screen.getByText(/צריך/)).toBeTruthy();
  });

  it("renders coming-soon variant with default Hebrew title", () => {
    render(<EmptyState variant="coming-soon" />);
    expect(screen.getByText("בקרוב")).toBeTruthy();
  });

  it("renders error variant in danger tone", () => {
    render(<EmptyState variant="error" message="כשל בטעינה" />);
    expect(screen.getByText("שגיאה")).toBeTruthy();
    expect(screen.getByText("כשל בטעינה")).toBeTruthy();
  });

  it("renders custom title/message override", () => {
    render(<EmptyState title="ריק" message="בלי תוכן" />);
    expect(screen.getByText("ריק")).toBeTruthy();
    expect(screen.getByText("בלי תוכן")).toBeTruthy();
  });

  it("renders action when provided", () => {
    render(
      <EmptyState
        variant="error"
        action={<button type="button">נסה שוב</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "נסה שוב" })).toBeTruthy();
  });
});
