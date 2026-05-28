import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OpsIssuePage } from "./OpsIssuePage";
import type { RuntimeIssuesDoc } from "./OpsPage";

function doc(): RuntimeIssuesDoc {
  return {
    issues: [
      {
        id: "lane-b-write-side-registration-blocked",
        file: "runtime-issues/lane-b-write-side-registration-blocked.md",
        title: "Lane B write blocked",
        date: "2026-05-16",
        severity: "high",
        disposition: "capture-and-stop",
      },
    ],
  };
}

type FetchCall = { url: string; init?: RequestInit };

function setupFetch(
  postHandler: (body: unknown) => { ok: boolean; status: number; body: unknown },
): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("runtime-issues.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => doc(),
        } as Response;
      }
      if (url.includes("/api/queue-actions")) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        const res = postHandler(body);
        return {
          ok: res.ok,
          status: res.status,
          json: async () => res.body,
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }),
  );
  return calls;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ops/issues/:id" element={<OpsIssuePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OpsIssuePage — resolution actions (S4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ack submits action=ack with runtime_issue: prefix and no fields", async () => {
    const calls = setupFetch(() => ({
      ok: true,
      status: 200,
      body: { accepted: true, merger: { code: 0 }, reducer: { code: 0 } },
    }));
    renderAt("/ops/issues/lane-b-write-side-registration-blocked");
    await waitFor(() => expect(screen.getByTestId("action-ack")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId("action-ack"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("action-success")).toBeTruthy(),
    );
    const post = calls.find((c) => c.url.includes("/api/queue-actions"));
    expect(post).toBeTruthy();
    const body = JSON.parse(String(post!.init!.body));
    expect(body.action).toBe("ack");
    expect(body.queue_item_id).toBe(
      "runtime_issue:lane-b-write-side-registration-blocked",
    );
    expect(body.fields).toBeUndefined();
  });

  it("snooze submits action=snooze with an until field in ISO Z form", async () => {
    const calls = setupFetch(() => ({
      ok: true,
      status: 200,
      body: { accepted: true },
    }));
    renderAt("/ops/issues/lane-b-write-side-registration-blocked");
    await waitFor(() =>
      expect(screen.getByTestId("action-snooze-open")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId("action-snooze-open"));
    await waitFor(() =>
      expect(screen.getByTestId("snooze-picker")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("snooze-preset-3d"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("snooze-submit"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("action-success")).toBeTruthy(),
    );
    const post = calls.find((c) => c.url.includes("/api/queue-actions"));
    const body = JSON.parse(String(post!.init!.body));
    expect(body.action).toBe("snooze");
    expect(typeof body.fields.until).toBe("string");
    expect(body.fields.until).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("dismiss submits action=dismiss with a reason field", async () => {
    const calls = setupFetch(() => ({
      ok: true,
      status: 200,
      body: { accepted: true },
    }));
    renderAt("/ops/issues/lane-b-write-side-registration-blocked");
    await waitFor(() =>
      expect(screen.getByTestId("action-dismiss-open")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTestId("action-dismiss-open"));
    await waitFor(() =>
      expect(screen.getByTestId("dismiss-form")).toBeTruthy(),
    );
    fireEvent.change(screen.getByTestId("dismiss-reason-input"), {
      target: { value: "duplicate of #42" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("dismiss-submit"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("action-success")).toBeTruthy(),
    );
    const post = calls.find((c) => c.url.includes("/api/queue-actions"));
    const body = JSON.parse(String(post!.init!.body));
    expect(body.action).toBe("dismiss");
    expect(body.fields.reason).toBe("duplicate of #42");
  });

  it("dismiss submit is disabled when reason is empty", async () => {
    setupFetch(() => ({ ok: true, status: 200, body: { accepted: true } }));
    renderAt("/ops/issues/lane-b-write-side-registration-blocked");
    await waitFor(() =>
      expect(screen.getByTestId("action-dismiss-open")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("action-dismiss-open"));
    await waitFor(() =>
      expect(screen.getByTestId("dismiss-submit")).toBeTruthy(),
    );
    const submit = screen.getByTestId("dismiss-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("renders an error chip on 4xx without retrying", async () => {
    let postCount = 0;
    setupFetch(() => {
      postCount += 1;
      return {
        ok: false,
        status: 400,
        body: { accepted: false, error: "queue_item_id must be a non-empty string" },
      };
    });
    renderAt("/ops/issues/lane-b-write-side-registration-blocked");
    await waitFor(() => expect(screen.getByTestId("action-ack")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId("action-ack"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("action-error")).toBeTruthy(),
    );
    expect(postCount).toBe(1);
    expect(screen.getByTestId("action-error").textContent).toMatch(
      /queue_item_id/,
    );
  });

  it("duplicate clicks during submit do not produce duplicate POSTs", async () => {
    let resolveFn: ((v: { ok: boolean; status: number; body: unknown }) => void) | null = null;
    const pending = new Promise<{ ok: boolean; status: number; body: unknown }>(
      (res) => {
        resolveFn = res;
      },
    );
    let postCount = 0;
    const calls: FetchCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("runtime-issues.json")) {
          return {
            ok: true,
            status: 200,
            json: async () => doc(),
          } as Response;
        }
        if (url.includes("/api/queue-actions")) {
          postCount += 1;
          const res = await pending;
          return {
            ok: res.ok,
            status: res.status,
            json: async () => res.body,
          } as Response;
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }),
    );

    renderAt("/ops/issues/lane-b-write-side-registration-blocked");
    await waitFor(() => expect(screen.getByTestId("action-ack")).toBeTruthy());

    fireEvent.click(screen.getByTestId("action-ack"));
    fireEvent.click(screen.getByTestId("action-ack"));
    fireEvent.click(screen.getByTestId("action-ack"));

    await act(async () => {
      resolveFn!({ ok: true, status: 200, body: { accepted: true } });
      await pending;
    });

    await waitFor(() =>
      expect(screen.getByTestId("action-success")).toBeTruthy(),
    );
    expect(postCount).toBe(1);
  });
});
