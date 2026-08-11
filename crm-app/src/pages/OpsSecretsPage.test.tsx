import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  OpsSecretsPage,
  sanitizeSecret,
  statusLabel,
  statusColor,
} from "./OpsSecretsPage";

// Synthetic throughout. This sentinel stands in for a raw secret value; the
// suite asserts it never reaches the DOM by any route.
const SYNTHETIC_VALUE = "synthetic-value-must-never-render-0001";

const META = {
  name: "example-app-password",
  type: "password",
  purpose: "Synthetic fixture",
  consumer: "none (test fixture)",
  owner: "devuserp",
  created: "2026-08-11",
  expiry: "2027-01-01",
  status: "active",
};

function mockFetch(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OpsSecretsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch({ schema: 1, secrets: [] }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sanitizeSecret", () => {
  it("keeps only the metadata allowlist", () => {
    const out = sanitizeSecret({ ...META, value: SYNTHETIC_VALUE, path: "/home/x/.secrets/values/a" });
    expect(Object.keys(out).sort()).toEqual(
      ["consumer", "created", "expiry", "name", "owner", "purpose", "status", "type", "updated"],
    );
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
    const colors = new Set(["active", "disabled", "expired"].map((s) => statusColor(s as never)));
    expect(colors.size).toBe(3);
  });
});

describe("OpsSecretsPage empty state", () => {
  it("shows the empty state when the projection has no secrets", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-empty")).toBeTruthy());
    expect(screen.getByTestId("ops-secrets-empty").textContent).toContain("אין סודות רשומים עדיין");
  });

  it("shows the empty state — not an error — when the projection is absent (404)", async () => {
    vi.stubGlobal("fetch", mockFetch(null, 404));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-empty")).toBeTruthy());
    expect(screen.queryByTestId("ops-secrets-error")).toBeNull();
  });

  it("shows an error state when the fetch genuinely fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-error")).toBeTruthy());
  });
});

describe("OpsSecretsPage list", () => {
  it("renders metadata for each secret", async () => {
    vi.stubGlobal("fetch", mockFetch({ schema: 1, generated_at: "2026-08-11T00:00:00Z", secrets: [META] }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());
    const row = screen.getByTestId("ops-secret-row");
    expect(row.textContent).toContain("example-app-password");
    expect(row.textContent).toContain("Synthetic fixture");
    expect(row.textContent).toContain("devuserp");
    expect(row.textContent).toContain("2027-01-01");
    expect(screen.getByTestId("ops-secret-status").textContent).toBe("פעיל");
  });

  it("NEVER renders a raw value, even when the projection wrongly contains one", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ schema: 1, secrets: [{ ...META, value: SYNTHETIC_VALUE, secret: SYNTHETIC_VALUE }] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());
    expect(container.innerHTML).not.toContain(SYNTHETIC_VALUE);
    expect(document.body.innerHTML).not.toContain(SYNTHETIC_VALUE);
  });

  it("never renders the filesystem path of a secret", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ schema: 1, secrets: [{ ...META, path: "/home/devuserp/.secrets/values/example-app-password" }] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());
    expect(container.innerHTML).not.toContain("/.secrets/values");
  });

  it("marks disabled and expired secrets distinctly", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        schema: 1,
        secrets: [
          { ...META, name: "a", status: "disabled" },
          { ...META, name: "b", status: "expired" },
        ],
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("ops-secret-row")).toHaveLength(2));
    const labels = screen.getAllByTestId("ops-secret-status").map((e) => e.textContent);
    expect(labels).toEqual(["מושבת", "פג תוקף"]);
  });
});

describe("OpsSecretsPage write surface", () => {
  it("exposes no value input anywhere on the page", async () => {
    vi.stubGlobal("fetch", mockFetch({ schema: 1, secrets: [META] }));
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-list")).toBeTruthy());
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(0);
  });

  it("renders write actions as disabled chips naming the CLI verbs", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-actions")).toBeTruthy());
    const actions = screen.getByTestId("ops-secrets-actions");
    expect(actions.textContent).toContain("הוספת סוד");
    expect(actions.textContent).toContain("החלפת ערך");
    expect(actions.textContent).toContain("השבתה");
    expect(actions.querySelectorAll("button")).toHaveLength(0);
  });

  it("states that disable does not revoke at the provider", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("ops-secrets-actions")).toBeTruthy());
    expect(screen.getByTestId("ops-secrets-actions").textContent).toContain(
      "אינה מבטלת את האישור אצל הספק",
    );
  });
});

describe("OpsSecretsPage fetch contract", () => {
  it("reads only the metadata projection and never a value endpoint", async () => {
    const f = mockFetch({ schema: 1, secrets: [] });
    vi.stubGlobal("fetch", f);
    renderPage();
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("/ops-data/secrets.json");
  });
});
