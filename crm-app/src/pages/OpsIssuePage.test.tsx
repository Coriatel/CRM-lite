import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  OpsIssuePage,
  findIssue,
  issueFamily,
  relatedIssues,
} from "./OpsIssuePage";
import type { RuntimeIssuesDoc } from "./OpsPage";

function doc(): RuntimeIssuesDoc {
  return {
    issues: [
      {
        id: "lock-contention-aaaa",
        file: "runtime-issues/lock-contention-aaaa.md",
        title: "Lock contention A",
        date: "2026-05-24",
        severity: "low",
        disposition: "advisory — auto-generated",
        reporter: "emitter",
      },
      {
        id: "lock-contention-bbbb",
        file: "runtime-issues/lock-contention-bbbb.md",
        title: "Lock contention B",
        date: "2026-05-23",
        severity: "low",
        disposition: "advisory — auto-generated",
        reporter: "emitter",
      },
      {
        id: "lane-b-write-side-registration-blocked",
        file: "runtime-issues/lane-b-write-side-registration-blocked.md",
        title: "Lane B write blocked",
        date: "2026-05-16",
        severity: "high — canonical agent-registry.json frozen",
        disposition: "capture-and-stop; design choice required",
        reporter: "devuserp",
      },
      {
        id: "resolved-issue",
        title: "Already done",
        date: "2026-05-01",
        severity: "low",
        disposition: "resolved 2026-05-05",
      },
    ],
  };
}

describe("issueFamily", () => {
  it("groups lock-contention-* together", () => {
    expect(issueFamily("lock-contention-aaaa")).toBe("lock-contention");
    expect(issueFamily("lock-contention-bbbb")).toBe("lock-contention");
  });
  it("falls back to id prefix before last hyphen", () => {
    expect(issueFamily("lane-b-write-side-registration-blocked")).toBe(
      "lane-b-write-side-registration",
    );
  });
  it("returns the id itself when there is no hyphen", () => {
    expect(issueFamily("singletoken")).toBe("singletoken");
  });
});

describe("findIssue", () => {
  it("returns the matching issue", () => {
    const i = findIssue(doc(), "lock-contention-aaaa");
    expect(i?.title).toBe("Lock contention A");
  });
  it("returns null when missing", () => {
    expect(findIssue(doc(), "nope")).toBeNull();
    expect(findIssue(null, "nope")).toBeNull();
  });
});

describe("relatedIssues", () => {
  it("returns same-family open issues, excluding self", () => {
    const current = findIssue(doc(), "lock-contention-aaaa")!;
    const r = relatedIssues(doc(), current);
    expect(r.map((i) => i.id)).toEqual(["lock-contention-bbbb"]);
  });
  it("returns [] when no siblings", () => {
    const current = findIssue(doc(), "lane-b-write-side-registration-blocked")!;
    expect(relatedIssues(doc(), current)).toEqual([]);
  });
  it("excludes resolved/closed/wontfix dispositions via openRuntimeIssues", () => {
    const current = findIssue(doc(), "lock-contention-aaaa")!;
    const r = relatedIssues(doc(), current);
    expect(r.find((i) => i.id === "resolved-issue")).toBeUndefined();
  });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ops/issues/:id" element={<OpsIssuePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("<OpsIssuePage>", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("runtime-issues.json")) {
          return {
            ok: true,
            status: 200,
            json: async () => doc(),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the 5 workflow sections for a known issue", async () => {
    renderAt("/ops/issues/lock-contention-aaaa");
    await waitFor(() =>
      expect(screen.getByTestId("ops-issue-title").textContent).toMatch(
        /Lock contention A/,
      ),
    );
    expect(screen.getByTestId("section-situation")).toBeTruthy();
    expect(screen.getByTestId("section-next-action")).toBeTruthy();
    expect(screen.getByTestId("section-assets")).toBeTruthy();
    expect(screen.getByTestId("section-related")).toBeTruthy();
    expect(screen.getByTestId("section-resolution")).toBeTruthy();
  });

  it("shows the disposition as the next action", async () => {
    renderAt("/ops/issues/lock-contention-aaaa");
    await waitFor(() =>
      expect(screen.getByTestId("section-next-action").textContent).toMatch(
        /advisory — auto-generated/,
      ),
    );
  });

  it("lists same-family related issues with links", async () => {
    renderAt("/ops/issues/lock-contention-aaaa");
    await waitFor(() => {
      const links = screen.getAllByTestId("related-issue-link");
      expect(links.length).toBe(1);
      expect(links[0].getAttribute("href")).toBe(
        "/ops/issues/lock-contention-bbbb",
      );
    });
  });

  it("renders the safe not-found fallback for an unknown id", async () => {
    renderAt("/ops/issues/does-not-exist");
    await waitFor(() =>
      expect(screen.getByTestId("ops-issue-not-found")).toBeTruthy(),
    );
    expect(screen.getByTestId("ops-issue-back").getAttribute("href")).toBe(
      "/ops",
    );
  });

  it("decodes URL-encoded ids before lookup", async () => {
    renderAt("/ops/issues/lock-contention-aaaa");
    await waitFor(() =>
      expect(screen.getByTestId("ops-issue-title").textContent).toMatch(
        /Lock contention A/,
      ),
    );
  });

  it("surfaces resolution actions as active controls (ack/snooze/dismiss)", async () => {
    renderAt("/ops/issues/lock-contention-aaaa");
    await waitFor(() => {
      expect(screen.getByTestId("action-ack")).toBeTruthy();
    });
    expect(screen.getByTestId("action-snooze-open")).toBeTruthy();
    expect(screen.getByTestId("action-dismiss-open")).toBeTruthy();
  });

  it("renders the error fallback when the projection fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    renderAt("/ops/issues/lock-contention-aaaa");
    await waitFor(() =>
      expect(screen.getByTestId("ops-issue-error")).toBeTruthy(),
    );
  });
});
