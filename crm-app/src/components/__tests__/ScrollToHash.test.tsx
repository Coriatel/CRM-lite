import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScrollToHash } from "../ScrollToHash";

describe("ScrollToHash — cross-page hash scroll", () => {
  beforeEach(() => {
    // jsdom does not implement scrollIntoView — stub it so we can assert calls.
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("scrolls to the element matching the location hash", async () => {
    const target = document.createElement("div");
    target.id = "ops-card-blockers";
    document.body.appendChild(target);

    render(
      <MemoryRouter initialEntries={["/ops#ops-card-blockers"]}>
        <ScrollToHash />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });

  it("is a no-op when there is no hash", () => {
    const spy = vi.spyOn(document, "getElementById");
    render(
      <MemoryRouter initialEntries={["/ops"]}>
        <ScrollToHash />
      </MemoryRouter>,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
