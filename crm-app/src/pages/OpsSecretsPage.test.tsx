import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { OpsSecretsPage, sanitizeSecret, statusLabel, statusColor } from "./OpsSecretsPage";

// Synthetic throughout. This sentinel stands in for a raw secret value; the
// point of most of these tests is that it never reaches the DOM or a request
// the page can be tricked into displaying.
const SYNTHETIC_VALUE = "Qx7z-synthetic-value-must-never-render-0001";

const META = {
  name: "example-app-password",
  type: "password",
  purpose: "Synthetic fixture",
  consumer: "none (test fixture)",
  owner: "owner@example.test",
  created: "2026-08-11",
  updated: "2026-08-11T05:00:00.000Z",
  expiry: "2027-01-01",
  status: "active",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const f = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal("fetch", f);
  return f;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OpsSecretsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.setItem("crm_access_token", "synthetic-session-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("sanitizeSecret", () => {
  it("keeps only the metadata allowlist", () => {
    const out = sanitizeSecret({ ...META, value: SYNTHETIC_VALUE, path: "/home/x/.secrets/values/a" });
    expect(out).not.toHaveProperty("value");
    expect(out).not.toHaveProperty("path");
    expect(JSON.stringify(out)).not.toContain(SYNTHETIC_VALUE);
    expect(JSON.stringify(out)).not.toContain(".secrets/values");
  });

  it("defaults an unknown status to active and a missing expiry to null", () => {
    expect(sanitizeSecret({ ...META, status: "bogus" }).status).toBe("active");
    expect(sanitizeSecret({ ...META, expiry: undefined }).expiry).toBeNull();
  });
});

describe("statusLabel / statusColor", () => {
  it("maps each status to a distinct Hebrew label and colour", () => {
    expect(statusLabel("active")).toBe("פעיל");
    expect(statusLabel("disabled")).toBe("מושבת");
    expect(statusLabel("expired")).toBe("פג תוקף");
    expect(new Set([statusColor("active"), statusColor("disabled"), statusColor("expired")]).size).toBe(3);
  });
});

// --- H1: the page must read an authenticated API, never a public static file --
describe("H1 — the page reads the authenticated API only", () => {
  it("fetches /api/secrets and never /ops-data", async () => {
    const f = mockFetch(() => jsonResponse({ secrets: [] }));
    renderPage();
    await waitFor(() => expect(f).toHaveBeenCalled());

    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toBe("/api/secrets");
    for (const u of urls) {
      expect(u).not.toContain("/ops-data");
    }
  });

  it("sends the session bearer token and never cookies", async () => {
    const f = mockFetch(() => jsonResponse({ secrets: [] }));
    renderPage();
    await waitFor(() => expect(f).toHaveBeenCalled());

    const init = f.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer synthetic-session-token");
    expect(init.credentials).toBe("omit");
  });

  it("shows an explicit unauthorised state on 401 and on 403", async () => {
    for (const status of [401, 403]) {
      mockFetch(() => jsonResponse({ error: "nope" }, status));
      const { unmount } = renderPage();
      await waitFor(() => expect(screen.getByTestId("ops-secrets-unauthorised")).toBeTruthy());
      // No create form is offered to someone the server refused.
      expect(screen.queryByTestId("ops-secrets-create-form")).toBeNull();
      unmount();
    }
  });

  it("shows an error state when the request genuinely fails", async () => {
    mockFetch(() => jsonResponse({ error: "boom" }, 500));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-error")).toBeTruthy());
  });
});

// --- H2: the real create -> list -> replace -> disable flow ------------------
describe("H2 — the owner flow works from the page", () => {
  it("creates a secret, sends the value exactly once, and clears it after", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    let created = false;
    const f = mockFetch((url, init) => {
      requests.push({ url, init });
      if (init?.method === "POST") {
        created = true;
        return jsonResponse({ secret: { ...META, name: "new-token" } }, 201);
      }
      return jsonResponse({ secrets: created ? [{ ...META, name: "new-token" }] : [] });
    });

    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-create-form")).toBeTruthy());

    fireEvent.change(screen.getByTestId("ops-secret-name"), { target: { value: "new-token" } });
    fireEvent.change(screen.getByTestId("ops-secret-purpose"), { target: { value: "synthetic" } });
    fireEvent.change(screen.getByTestId("ops-secret-consumer"), { target: { value: "none" } });
    fireEvent.change(screen.getByTestId("ops-secret-value"), { target: { value: SYNTHETIC_VALUE } });
    fireEvent.click(screen.getByTestId("ops-secret-create-submit"));

    await waitFor(() => expect(screen.getByTestId("ops-secrets-notice")).toBeTruthy());

    const posts = requests.filter((r) => r.init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(String(posts[0].init?.body)).toContain(SYNTHETIC_VALUE);
    // Exactly once: no other request carries the value.
    const others = requests.filter((r) => r.init?.method !== "POST");
    for (const r of others) expect(String(r.init?.body ?? "")).not.toContain(SYNTHETIC_VALUE);

    // The input is cleared, so the value is not sitting in the DOM afterwards.
    expect((screen.getByTestId("ops-secret-value") as HTMLInputElement).value).toBe("");
    expect(document.body.innerHTML).not.toContain(SYNTHETIC_VALUE);
    expect(f).toHaveBeenCalled();
  });

  it("replaces a value and clears the replace input", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    mockFetch((url, init) => {
      requests.push({ url, init });
      if (init?.method === "PUT") return jsonResponse({ secret: META });
      return jsonResponse({ secrets: [META] });
    });

    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());

    fireEvent.click(screen.getByTestId(`ops-secret-replace-${META.name}`));
    fireEvent.change(screen.getByTestId("ops-secret-replace-value"), {
      target: { value: SYNTHETIC_VALUE },
    });
    fireEvent.click(screen.getByTestId("ops-secret-replace-submit"));

    await waitFor(() => expect(screen.getByTestId("ops-secrets-notice")).toBeTruthy());
    const put = requests.find((r) => r.init?.method === "PUT");
    expect(put?.url).toBe(`/api/secrets/${META.name}`);
    expect(String(put?.init?.body)).toContain(SYNTHETIC_VALUE);
    expect(document.body.innerHTML).not.toContain(SYNTHETIC_VALUE);
  });

  it("disables a secret through the API", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    mockFetch((url, init) => {
      requests.push({ url, init });
      if (String(url).endsWith("/disable")) {
        return jsonResponse({ secret: { ...META, status: "disabled" } });
      }
      return jsonResponse({ secrets: [META] });
    });

    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());
    fireEvent.click(screen.getByTestId(`ops-secret-disable-${META.name}`));

    await waitFor(() => expect(screen.getByTestId("ops-secrets-notice")).toBeTruthy());
    expect(requests.some((r) => r.url === `/api/secrets/${META.name}/disable`)).toBe(true);
  });

  it("surfaces a server rejection without inventing success", async () => {
    mockFetch((_url, init) => {
      if (init?.method === "POST") return jsonResponse({ error: "invalid secret name" }, 400);
      return jsonResponse({ secrets: [] });
    });

    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-create-form")).toBeTruthy());
    fireEvent.change(screen.getByTestId("ops-secret-name"), { target: { value: "bad name" } });
    fireEvent.change(screen.getByTestId("ops-secret-purpose"), { target: { value: "x" } });
    fireEvent.change(screen.getByTestId("ops-secret-consumer"), { target: { value: "y" } });
    fireEvent.change(screen.getByTestId("ops-secret-value"), { target: { value: SYNTHETIC_VALUE } });
    fireEvent.click(screen.getByTestId("ops-secret-create-submit"));

    await waitFor(() => expect(screen.getByTestId("ops-secrets-action-error")).toBeTruthy());
    expect(screen.queryByTestId("ops-secrets-notice")).toBeNull();
    // Even on failure the value is dropped from component state.
    expect((screen.getByTestId("ops-secret-value") as HTMLInputElement).value).toBe("");
  });
});

describe("OpsSecretsPage list", () => {
  it("renders metadata for each secret", async () => {
    mockFetch(() => jsonResponse({ secrets: [META, { ...META, name: "second" }] }));
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("ops-secret-row")).toHaveLength(2));
    expect(screen.getByText(META.name)).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();
    expect(screen.getAllByText(/Synthetic fixture/)).toHaveLength(2);
  });

  it("NEVER renders a raw value, even when the response wrongly contains one", async () => {
    mockFetch(() =>
      jsonResponse({ secrets: [{ ...META, value: SYNTHETIC_VALUE, secret: SYNTHETIC_VALUE }] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());
    expect(container.innerHTML).not.toContain(SYNTHETIC_VALUE);
  });

  it("never renders the filesystem path of a secret", async () => {
    mockFetch(() =>
      jsonResponse({ secrets: [{ ...META, path: "/home/devuserp/.secrets/values/example-app-password" }] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());
    expect(container.innerHTML).not.toContain("/.secrets/values");
  });

  it("marks disabled and expired secrets distinctly", async () => {
    mockFetch(() =>
      jsonResponse({
        secrets: [
          { ...META, name: "a", status: "disabled" },
          { ...META, name: "b", status: "expired" },
        ],
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("ops-secret-status")).toHaveLength(2));
    const labels = screen.getAllByTestId("ops-secret-status").map((n) => n.textContent);
    expect(labels).toContain("מושבת");
    expect(labels).toContain("פג תוקף");
  });

  it("shows the empty state when there are no secrets", async () => {
    mockFetch(() => jsonResponse({ secrets: [] }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-empty")).toBeTruthy());
  });
});

describe("value input hygiene", () => {
  it("masks the value inputs and opts out of autofill", async () => {
    mockFetch(() => jsonResponse({ secrets: [META] }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());

    const create = screen.getByTestId("ops-secret-value") as HTMLInputElement;
    expect(create.type).toBe("password");
    expect(create.autocomplete).toBe("new-password");

    fireEvent.click(screen.getByTestId(`ops-secret-replace-${META.name}`));
    const replace = screen.getByTestId("ops-secret-replace-value") as HTMLInputElement;
    expect(replace.type).toBe("password");
    expect(replace.autocomplete).toBe("new-password");
  });

  it("states that disable does not revoke at the provider", async () => {
    mockFetch((url) => {
      if (String(url).endsWith("/disable")) return jsonResponse({ secret: { ...META, status: "disabled" } });
      return jsonResponse({ secrets: [META] });
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());
    fireEvent.click(screen.getByTestId(`ops-secret-disable-${META.name}`));
    await waitFor(() => expect(screen.getByTestId("ops-secrets-notice").textContent).toMatch(/הספק/));
  });
});
