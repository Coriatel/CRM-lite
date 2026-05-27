import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  OpsWorkflowPage,
  findWorkflow,
  relatedWorkflows,
  workflowFamily,
} from "./OpsWorkflowPage";
import type { WorkflowsDoc } from "./OpsPage";

function doc(): WorkflowsDoc {
  return {
    workflows: [
      {
        workflow_key: "wm.media.lesson_pipeline_v2",
        name: "Lesson Media Pipeline v2",
        source_system: "windmill",
        enabled: true,
        owner: "elron",
        criticality: "production_critical",
        environment: "prod",
        health: "healthy",
        last_run_at: "2026-05-12T03:31",
        last_success_at: "2026-05-12T03:31",
        last_failure_at: "2026-05-11T19:53",
      },
      {
        workflow_key: "wm.media.renew_drive_watch",
        name: "Renew Drive watch",
        source_system: "windmill",
        enabled: true,
        owner: "elron",
        criticality: "production_critical",
        environment: "prod",
        health: "broken_confirmed",
        last_failure_at: "2026-05-20T01:00",
        last_run_at: "2026-05-20T01:00",
      },
      {
        workflow_key: "wm.distribution.tuesday_class_reminder",
        name: "Tuesday class reminder",
        source_system: "windmill",
        enabled: true,
        owner: "elron",
        criticality: "important",
        environment: "prod",
        health: "broken_suspected",
      },
      {
        workflow_key: "pm2.yafutzu_web_legacy",
        name: "Yafutzu legacy web",
        source_system: "pm2",
        enabled: false,
        owner: "elron",
        criticality: "low",
        environment: "prod",
        health: "broken_confirmed",
      },
      {
        workflow_key: "cron.qa_flow_snapshot",
        name: "QA flow snapshot",
        source_system: "cron",
        enabled: true,
        owner: "devuser",
        criticality: "low",
        health: "stale",
      },
    ],
  };
}

describe("workflowFamily", () => {
  it("groups 3+ dotted segments by their first two segments", () => {
    expect(workflowFamily("wm.media.lesson_pipeline_v2")).toBe("wm.media");
    expect(workflowFamily("wm.media.renew_drive_watch")).toBe("wm.media");
    expect(workflowFamily("wm.distribution.tuesday_class_reminder")).toBe(
      "wm.distribution",
    );
  });
  it("falls back to first segment for 2-part keys", () => {
    expect(workflowFamily("cron.qa_flow_snapshot")).toBe("cron");
    expect(workflowFamily("pm2.yafutzu_web_legacy")).toBe("pm2");
  });
  it("returns the key itself when there is no dot", () => {
    expect(workflowFamily("singletoken")).toBe("singletoken");
  });
});

describe("findWorkflow", () => {
  it("returns the matching workflow", () => {
    const w = findWorkflow(doc(), "wm.media.lesson_pipeline_v2");
    expect(w?.name).toBe("Lesson Media Pipeline v2");
  });
  it("returns null when missing", () => {
    expect(findWorkflow(doc(), "nope.nope")).toBeNull();
    expect(findWorkflow(null, "nope.nope")).toBeNull();
  });
});

describe("relatedWorkflows", () => {
  it("returns same-family workflows, excluding self", () => {
    const current = findWorkflow(doc(), "wm.media.lesson_pipeline_v2")!;
    const r = relatedWorkflows(doc(), current);
    expect(r.map((w) => w.workflow_key)).toEqual(["wm.media.renew_drive_watch"]);
  });
  it("returns [] when no siblings in family", () => {
    const current = findWorkflow(doc(), "cron.qa_flow_snapshot")!;
    expect(relatedWorkflows(doc(), current)).toEqual([]);
  });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ops/workflows/:workflow_key" element={<OpsWorkflowPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("<OpsWorkflowPage>", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("workflows.json")) {
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

  it("renders the 5 workflow sections for a known workflow_key", async () => {
    renderAt("/ops/workflows/wm.media.lesson_pipeline_v2");
    await waitFor(() =>
      expect(screen.getByTestId("ops-workflow-title").textContent).toMatch(
        /Lesson Media Pipeline v2/,
      ),
    );
    expect(screen.getByTestId("section-situation")).toBeTruthy();
    expect(screen.getByTestId("section-next-action")).toBeTruthy();
    expect(screen.getByTestId("section-assets")).toBeTruthy();
    expect(screen.getByTestId("section-related")).toBeTruthy();
    expect(screen.getByTestId("section-resolution")).toBeTruthy();
  });

  it("shows next-action text appropriate to the workflow health", async () => {
    renderAt("/ops/workflows/wm.media.renew_drive_watch");
    await waitFor(() => {
      const action = screen.getByTestId("section-next-action").textContent ?? "";
      expect(action).toMatch(/בדוק|לוגים|כשל/);
    });
  });

  it("lists same-family related workflows with links", async () => {
    renderAt("/ops/workflows/wm.media.lesson_pipeline_v2");
    await waitFor(() => {
      const links = screen.getAllByTestId("related-workflow-link");
      expect(links.length).toBe(1);
      expect(links[0].getAttribute("href")).toBe(
        "/ops/workflows/wm.media.renew_drive_watch",
      );
    });
  });

  it("renders the safe not-found fallback for an unknown workflow_key", async () => {
    renderAt("/ops/workflows/does.not.exist");
    await waitFor(() =>
      expect(screen.getByTestId("ops-workflow-not-found")).toBeTruthy(),
    );
    expect(screen.getByTestId("ops-workflow-back").getAttribute("href")).toBe(
      "/ops",
    );
  });

  it("decodes URL-encoded workflow_key before lookup", async () => {
    const encoded = encodeURIComponent("wm.media.lesson_pipeline_v2");
    renderAt(`/ops/workflows/${encoded}`);
    await waitFor(() =>
      expect(screen.getByTestId("ops-workflow-title").textContent).toMatch(
        /Lesson Media Pipeline v2/,
      ),
    );
  });

  it("renders all four closure-semantics fields for a broken_confirmed production_critical workflow", async () => {
    renderAt("/ops/workflows/wm.media.renew_drive_watch");
    await waitFor(() => {
      expect(screen.getByTestId("closure-done-criteria")).toBeTruthy();
      expect(screen.getByTestId("closure-pressure-retired")).toBeTruthy();
      expect(screen.getByTestId("closure-unblocks-downstream")).toBeTruthy();
      expect(screen.getByTestId("closure-risk-if-ignored")).toBeTruthy();
    });
    // broken_confirmed + production_critical → risk text mentions production
    expect(
      screen.getByTestId("closure-risk-if-ignored").textContent ?? "",
    ).toMatch(/פרודקשן|פגיעה|דממה|אילם/);
    // pressure-retired text mentions production
    expect(
      screen.getByTestId("closure-pressure-retired").textContent ?? "",
    ).toMatch(/פרודקשן|דממה/);
  });

  it("renders neutral closure-semantics for a healthy workflow", async () => {
    renderAt("/ops/workflows/wm.media.lesson_pipeline_v2");
    await waitFor(() => {
      expect(screen.getByTestId("closure-done-criteria")).toBeTruthy();
      expect(screen.getByTestId("closure-pressure-retired")).toBeTruthy();
      expect(screen.getByTestId("closure-unblocks-downstream")).toBeTruthy();
      expect(screen.getByTestId("closure-risk-if-ignored")).toBeTruthy();
    });
    // healthy → done-criteria is the informational/no-action variant
    expect(
      screen.getByTestId("closure-done-criteria").textContent ?? "",
    ).toMatch(/אין|אינפורמטיבי|תקין/);
    // healthy → risk is minimal
    expect(
      screen.getByTestId("closure-risk-if-ignored").textContent ?? "",
    ).toMatch(/נמוך|אינפורמטיבי|אין/);
  });

  it("surfaces resolution actions as disabled chips in v0", async () => {
    renderAt("/ops/workflows/wm.media.renew_drive_watch");
    await waitFor(() => {
      const resolution = screen.getByTestId("section-resolution");
      expect(resolution.textContent).toMatch(/קריאה-בלבד/);
    });
  });

  it("renders the error fallback when the projection fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    renderAt("/ops/workflows/wm.media.lesson_pipeline_v2");
    await waitFor(() =>
      expect(screen.getByTestId("ops-workflow-error")).toBeTruthy(),
    );
  });
});
