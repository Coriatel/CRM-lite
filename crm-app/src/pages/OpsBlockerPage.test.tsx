import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  OpsBlockerPage,
  blockerLaneFamily,
  findBlocker,
  relatedBlockers,
} from "./OpsBlockerPage";
import type { Blocker } from "./OpsPage";

function doc(): { blockers: Blocker[] } {
  return {
    blockers: [
      {
        id: "crm-lite-slice4-apply",
        lane: "A-or-owner",
        summary: "PR #25 schema not yet applied to production Directus.",
        needs: "owner runs crm-app/scripts/slice4-schema/apply.py + validate.py",
        ref: "sessions/2026-05-12-0810.md",
        since: "2026-05-12",
      },
      {
        id: "transcriptor-interaction-endpoints",
        lane: "B",
        summary: "Backend interaction edit/delete endpoints unclear.",
        needs: "owner: product direction",
        since: "open",
      },
      {
        id: "transcriptor-dist-backups",
        lane: "B-or-owner",
        summary: "47 dist.bak directories in transcriptor-api.",
        needs: "owner: safe to delete?",
        since: "2026-05-10",
      },
      {
        id: "couchdb-kmv8-elron-compaction",
        lane: "D",
        summary: "CouchDB compaction proposal pending.",
        needs: "owner: scheduled window",
        ref: "projects/couchdb-compaction-proposal.md",
      },
      {
        id: "yafutzu-web-flapping",
        lane: "owner",
        summary: "PM2 yafutzu-web with 763k+ restarts.",
        needs: "owner: delete or fix",
        since: "long-running",
      },
    ],
  };
}

describe("blockerLaneFamily", () => {
  it("normalises compound lanes to the leading lane letter", () => {
    expect(blockerLaneFamily("A-or-owner")).toBe("A");
    expect(blockerLaneFamily("B-or-owner")).toBe("B");
    expect(blockerLaneFamily("a-or-owner")).toBe("A");
  });
  it("returns the lane letter for single-letter lanes", () => {
    expect(blockerLaneFamily("B")).toBe("B");
    expect(blockerLaneFamily("D")).toBe("D");
  });
  it("returns 'owner' for owner-only lanes", () => {
    expect(blockerLaneFamily("owner")).toBe("owner");
    expect(blockerLaneFamily("OWNER")).toBe("owner");
  });
  it("returns 'unlabeled' for missing/empty lanes", () => {
    expect(blockerLaneFamily(undefined)).toBe("unlabeled");
    expect(blockerLaneFamily(null)).toBe("unlabeled");
    expect(blockerLaneFamily("")).toBe("unlabeled");
    expect(blockerLaneFamily("   ")).toBe("unlabeled");
  });
  it("falls through to the raw label for unknown shapes", () => {
    expect(blockerLaneFamily("infra-team")).toBe("infra-team");
  });
});

describe("findBlocker", () => {
  it("returns the matching blocker", () => {
    expect(findBlocker(doc(), "transcriptor-interaction-endpoints")?.lane).toBe(
      "B",
    );
  });
  it("returns null when missing", () => {
    expect(findBlocker(doc(), "nope")).toBeNull();
    expect(findBlocker(null, "nope")).toBeNull();
  });
});

describe("relatedBlockers", () => {
  it("groups B and B-or-owner under the same lane family", () => {
    const current = findBlocker(doc(), "transcriptor-interaction-endpoints")!;
    const r = relatedBlockers(doc(), current);
    expect(r.map((b) => b.id)).toEqual(["transcriptor-dist-backups"]);
  });
  it("excludes self from related list", () => {
    const current = findBlocker(doc(), "transcriptor-dist-backups")!;
    const r = relatedBlockers(doc(), current);
    expect(r.find((b) => b.id === "transcriptor-dist-backups")).toBeUndefined();
  });
  it("returns [] when no siblings exist in the same family", () => {
    const current = findBlocker(doc(), "couchdb-kmv8-elron-compaction")!;
    expect(relatedBlockers(doc(), current)).toEqual([]);
  });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ops/blockers/:id" element={<OpsBlockerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("<OpsBlockerPage>", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("blockers.json")) {
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

  it("renders the 5 workflow sections for a known blocker", async () => {
    renderAt("/ops/blockers/crm-lite-slice4-apply");
    await waitFor(() =>
      expect(screen.getByTestId("ops-blocker-title").textContent).toMatch(
        /PR #25 schema not yet applied/,
      ),
    );
    expect(screen.getByTestId("section-situation")).toBeTruthy();
    expect(screen.getByTestId("section-next-action")).toBeTruthy();
    expect(screen.getByTestId("section-assets")).toBeTruthy();
    expect(screen.getByTestId("section-related")).toBeTruthy();
    expect(screen.getByTestId("section-resolution")).toBeTruthy();
  });

  it("renders 'needs' as the next action", async () => {
    renderAt("/ops/blockers/crm-lite-slice4-apply");
    await waitFor(() =>
      expect(screen.getByTestId("section-next-action").textContent).toMatch(
        /owner runs crm-app\/scripts\/slice4-schema/,
      ),
    );
  });

  it("renders the ref path under Relevant Assets when present", async () => {
    renderAt("/ops/blockers/couchdb-kmv8-elron-compaction");
    await waitFor(() =>
      expect(screen.getByTestId("section-assets").textContent).toMatch(
        /projects\/couchdb-compaction-proposal\.md/,
      ),
    );
  });

  it("lists same-family related blockers as links", async () => {
    renderAt("/ops/blockers/transcriptor-interaction-endpoints");
    await waitFor(() => {
      const links = screen.getAllByTestId("related-blocker-link");
      expect(links.length).toBe(1);
      expect(links[0].getAttribute("href")).toBe(
        "/ops/blockers/transcriptor-dist-backups",
      );
    });
  });

  it("renders the safe not-found fallback for an unknown id", async () => {
    renderAt("/ops/blockers/does-not-exist");
    await waitFor(() =>
      expect(screen.getByTestId("ops-blocker-not-found")).toBeTruthy(),
    );
    expect(screen.getByTestId("ops-blocker-back").getAttribute("href")).toBe(
      "/ops",
    );
  });

  it("surfaces resolution actions as disabled chips in v0", async () => {
    renderAt("/ops/blockers/crm-lite-slice4-apply");
    await waitFor(() => {
      const resolution = screen.getByTestId("section-resolution");
      expect(resolution.textContent).toMatch(/סמן כפתור/);
      expect(resolution.textContent).toMatch(/קריאה-בלבד/);
    });
  });

  it("renders the error fallback when the projection fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    renderAt("/ops/blockers/crm-lite-slice4-apply");
    await waitFor(() =>
      expect(screen.getByTestId("ops-blocker-error")).toBeTruthy(),
    );
  });

  it("decodes URL-encoded ids before lookup", async () => {
    renderAt(
      "/ops/blockers/" + encodeURIComponent("crm-lite-slice4-apply"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("ops-blocker-title").textContent).toMatch(
        /PR #25 schema not yet applied/,
      ),
    );
  });
});
