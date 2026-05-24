import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  OpsGatePage,
  findGateByPlainText,
  gateTopic,
  relatedGates,
} from "./OpsGatePage";
import { plainifyGate } from "./OpsPage";

const RAW_GATES = [
  "**`crm-lite` slice 4 — approvals migration MERGED to main, NOT YET APPLIED (2026-05-12).** PR #25 admin-squashed → `30bf7b8`.",
  "`crm-lite` follow-up: rotate Directus admin token after schema apply.",
  "`mayenotecha` PR #2 — merge / rebase / close (branch-name reuse).",
  "`transcriptor-api` — backend interaction edit/delete endpoints; `recently_active=true` filter.",
  "CouchDB `kmv8-elron` compaction — see `projects/couchdb-compaction-proposal.md`.",
  "Drift-router shell-rc / git-hook enforcement — deferred to 2-week incident review.",
  "~~Resolved gate~~",
];

describe("gateTopic", () => {
  it("extracts the first backtick-wrapped project token", () => {
    expect(gateTopic(RAW_GATES[0])).toBe("crm-lite");
    expect(gateTopic(RAW_GATES[2])).toBe("mayenotecha");
    expect(gateTopic(RAW_GATES[3])).toBe("transcriptor-api");
  });
  it("falls back to the first word for gates without backticks", () => {
    expect(gateTopic(RAW_GATES[5])).toBe("drift-router");
  });
  it("returns 'unlabeled' for fully-empty input", () => {
    expect(gateTopic("")).toBe("unlabeled");
  });
  it("is case-insensitive on backtick tokens", () => {
    expect(gateTopic("`CRM-LITE` foo")).toBe("crm-lite");
  });
});

describe("findGateByPlainText", () => {
  it("returns the raw gate when plainified text matches", () => {
    const target = plainifyGate(RAW_GATES[2]);
    expect(findGateByPlainText(RAW_GATES, target)).toBe(RAW_GATES[2]);
  });
  it("returns null when no match", () => {
    expect(findGateByPlainText(RAW_GATES, "no-such-gate")).toBeNull();
  });
  it("returns null for empty id", () => {
    expect(findGateByPlainText(RAW_GATES, "")).toBeNull();
  });
  it("does not match a resolved (strikethrough → empty) gate", () => {
    expect(findGateByPlainText(RAW_GATES, "")).toBeNull();
    expect(findGateByPlainText(RAW_GATES, plainifyGate("~~Resolved gate~~"))).toBeNull();
  });
});

describe("relatedGates", () => {
  it("groups gates by backtick topic, excluding self", () => {
    const current = RAW_GATES[0];
    const r = relatedGates(RAW_GATES, current);
    expect(r.map((g) => g.plain)).toEqual([plainifyGate(RAW_GATES[1])]);
  });
  it("returns [] when only the current gate has its topic", () => {
    expect(relatedGates(RAW_GATES, RAW_GATES[2])).toEqual([]);
  });
  it("limits to `limit` entries", () => {
    const many = Array.from({ length: 8 }).map(
      (_, i) => `\`shared-topic\` decision ${i + 1}`,
    );
    expect(relatedGates(many, many[0], 3).length).toBe(3);
  });
  it("excludes resolved gates", () => {
    const withResolved = [
      "`topic-a` open",
      "~~`topic-a` resolved~~",
      "`topic-a` other",
    ];
    const r = relatedGates(withResolved, withResolved[0]);
    expect(r.map((g) => g.plain)).toEqual(["topic-a other"]);
  });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ops/gates/:id" element={<OpsGatePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("<OpsGatePage>", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("session_index.json")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ owner_gates: RAW_GATES }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the 5 workflow sections for a known gate", async () => {
    const plain = plainifyGate(RAW_GATES[2]);
    renderAt("/ops/gates/" + encodeURIComponent(plain));
    await waitFor(() =>
      expect(screen.getByTestId("ops-gate-title").textContent).toMatch(
        /mayenotecha PR #2/,
      ),
    );
    expect(screen.getByTestId("section-situation")).toBeTruthy();
    expect(screen.getByTestId("section-next-action")).toBeTruthy();
    expect(screen.getByTestId("section-assets")).toBeTruthy();
    expect(screen.getByTestId("section-related")).toBeTruthy();
    expect(screen.getByTestId("section-resolution")).toBeTruthy();
  });

  it("shows the topic in the header", async () => {
    const plain = plainifyGate(RAW_GATES[3]);
    renderAt("/ops/gates/" + encodeURIComponent(plain));
    await waitFor(() => {
      const header = screen.getByTestId("ops-gate-page");
      expect(header.textContent).toMatch(/transcriptor-api/);
    });
  });

  it("preserves the raw (markdown) text in Relevant Assets", async () => {
    const plain = plainifyGate(RAW_GATES[0]);
    renderAt("/ops/gates/" + encodeURIComponent(plain));
    await waitFor(() => {
      const assets = screen.getByTestId("section-assets");
      expect(assets.textContent).toMatch(/MERGED to main/);
      expect(assets.textContent).toMatch(/`30bf7b8`/);
    });
  });

  it("lists same-topic related gates as links", async () => {
    const plain = plainifyGate(RAW_GATES[0]);
    renderAt("/ops/gates/" + encodeURIComponent(plain));
    await waitFor(() => {
      const links = screen.getAllByTestId("related-gate-link");
      expect(links.length).toBe(1);
      expect(decodeURIComponent(links[0].getAttribute("href") ?? "")).toBe(
        "/ops/gates/" + plainifyGate(RAW_GATES[1]),
      );
    });
  });

  it("renders the safe not-found fallback for an unknown id", async () => {
    renderAt("/ops/gates/" + encodeURIComponent("does not exist"));
    await waitFor(() =>
      expect(screen.getByTestId("ops-gate-not-found")).toBeTruthy(),
    );
    expect(screen.getByTestId("ops-gate-back").getAttribute("href")).toBe(
      "/ops",
    );
  });

  it("surfaces resolution actions as disabled chips in v0", async () => {
    const plain = plainifyGate(RAW_GATES[2]);
    renderAt("/ops/gates/" + encodeURIComponent(plain));
    await waitFor(() => {
      const resolution = screen.getByTestId("section-resolution");
      expect(resolution.textContent).toMatch(/סמן כהוכרע/);
      expect(resolution.textContent).toMatch(/קריאה-בלבד/);
    });
  });

  it("renders the error fallback when the projection fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    const plain = plainifyGate(RAW_GATES[0]);
    renderAt("/ops/gates/" + encodeURIComponent(plain));
    await waitFor(() =>
      expect(screen.getByTestId("ops-gate-error")).toBeTruthy(),
    );
  });
});
