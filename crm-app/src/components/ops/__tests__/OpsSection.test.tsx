import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OpsSection } from "../OpsSection";

describe("OpsSection", () => {
  it("renders children when defaultOpen", () => {
    render(
      <OpsSection title="נדרש עכשיו" defaultOpen>
        <div>child-content</div>
      </OpsSection>,
    );
    expect(screen.getByText("child-content")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /נדרש עכשיו/ }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("hides children when defaultOpen is false, shows on toggle", () => {
    render(
      <OpsSection title="בריאות מערכת" defaultOpen={false}>
        <div>deep-infra</div>
      </OpsSection>,
    );
    expect(screen.queryByText("deep-infra")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /בריאות מערכת/ }));
    expect(screen.getByText("deep-infra")).toBeTruthy();
  });

  it("collapses an open section on toggle", () => {
    render(
      <OpsSection title="אוטומציות" defaultOpen>
        <div>tasks</div>
      </OpsSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: /אוטומציות/ }));
    expect(screen.queryByText("tasks")).toBeNull();
  });
});
