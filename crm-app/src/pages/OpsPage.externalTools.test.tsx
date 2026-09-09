import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExternalToolsCard } from "./OpsPage";

describe("ExternalToolsCard", () => {
  it("links to Merkaz Secrets and opens it in its own tab", () => {
    render(<ExternalToolsCard />);
    const link = screen.getByRole("link", { name: /מרכז סודות/ });
    expect(link.getAttribute("href")).toBe("https://secrets.merkazneshama.co.il/");
    expect(link.getAttribute("target")).toBe("_blank");
    // noreferrer also implies noopener: the opened page must not get a handle on
    // this window, and must not learn which cockpit page it came from.
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("points at the secrets UI instead of embedding it", () => {
    const { container } = render(<ExternalToolsCard />);
    // The whole design of Merkaz Secrets rests on a value never touching another
    // origin. An iframe here would put a page that handles secrets inside the
    // CRM's origin and give the CRM's XSS surface a path to it, so the card must
    // never grow one — not even "just to preview the status".
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("embed")).toBeNull();
    expect(container.querySelector("object")).toBeNull();
  });

  it("carries no secret value and no input of its own", () => {
    const { container } = render(<ExternalToolsCard />);
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});
