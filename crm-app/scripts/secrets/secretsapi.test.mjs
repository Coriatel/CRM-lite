// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createHandler, projectMetadata, MAX_VALUE_BYTES } from "./secretsapi.mjs";
import { addSecret, readRegistry, readSecretValue, registryPath, valuesDir } from "./secretstore.mjs";

// Synthetic throughout. No real credential is used, read or asserted against.
//
// The sentinels deliberately start with an uppercase run that shares no prefix
// with any metadata field: that makes "no prefix of the value leaks" a real
// assertion rather than one that trips over the secret's own name, and makes
// the sentinel an invalid secret name so it can double as bad input.
const SYNTHETIC = "Qx7z-synthetic-api-value-0001";
const SYNTHETIC_2 = "Wy8v-synthetic-api-replacement-0002";

const OWNER = "owner@example.test";
const NOT_OWNER = "someone-else@example.test";
const ORIGIN = "https://crmphone.example.test";
const EVIL_ORIGIN = "https://attacker.example.test";

const HERE = dirname(fileURLToPath(import.meta.url));

// A stand-in for Directus. Tokens map to identities; anything else is a 401,
// which is exactly how a revoked or expired session presents.
const SESSIONS = {
  "owner-token": { id: "u1", email: OWNER },
  "other-token": { id: "u2", email: NOT_OWNER },
  // Deliberately absent: "expired-token".
};

function fakeDirectus(calls = []) {
  return async (url, init) => {
    calls.push(url);
    const auth = String(init?.headers?.Authorization ?? "");
    const token = auth.replace(/^Bearer\s+/, "");
    const session = SESSIONS[token];
    if (!session) {
      return { ok: false, status: 401, json: async () => ({ errors: [{ message: "invalid" }] }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: session }) };
  };
}

let tmp;
let server;
let base;
let directusCalls;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "secretsapi-test-"));
  process.env.SECRET_STORE_ROOT = tmp;
  directusCalls = [];
  const handler = createHandler({
    directusUrl: "https://directus.example.test",
    ownerEmails: [OWNER],
    allowedOrigins: [ORIGIN],
    fetchImpl: fakeDirectus(directusCalls),
  });
  server = createServer((req, res) => {
    handler(req, res).catch(() => {
      res.writeHead(500);
      res.end("{}");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete process.env.SECRET_STORE_ROOT;
  rmSync(tmp, { recursive: true, force: true });
});

function call(path, { token = "owner-token", method = "GET", body, origin = ORIGIN, contentType = "application/json", headers = {} } = {}) {
  const h = { ...headers };
  if (token !== null) h.Authorization = `Bearer ${token}`;
  if (origin !== null) h.Origin = origin;
  if (contentType !== null) h["Content-Type"] = contentType;
  return fetch(`${base}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const CREATE_BODY = {
  name: "synthetic-token",
  type: "token",
  purpose: "Synthetic fixture for the API suite",
  consumer: "none (test fixture)",
  expiry: "2027-01-01",
  value: SYNTHETIC,
};

// --- H2: the whole owner flow, over real HTTP -------------------------------
describe("H2 — authenticated create -> list -> replace -> disable", () => {
  it("runs the complete flow and never returns the value", async () => {
    const created = await call("/api/secrets", { method: "POST", body: CREATE_BODY });
    expect(created.status).toBe(201);
    const createdJson = await created.json();
    expect(JSON.stringify(createdJson)).not.toContain(SYNTHETIC);
    expect(createdJson.secret.name).toBe("synthetic-token");

    // The value really was stored — the flow is functional, not decorative.
    expect(readSecretValue("synthetic-token")).toBe(SYNTHETIC);

    const listed = await call("/api/secrets");
    expect(listed.status).toBe(200);
    const listedJson = await listed.json();
    expect(listedJson.secrets).toHaveLength(1);
    expect(listedJson.secrets[0].status).toBe("active");
    expect(JSON.stringify(listedJson)).not.toContain(SYNTHETIC);

    const replaced = await call("/api/secrets/synthetic-token", {
      method: "PUT",
      body: { value: SYNTHETIC_2 },
    });
    expect(replaced.status).toBe(200);
    expect(JSON.stringify(await replaced.json())).not.toContain(SYNTHETIC_2);
    expect(readSecretValue("synthetic-token")).toBe(SYNTHETIC_2);

    const disabled = await call("/api/secrets/synthetic-token/disable", {
      method: "POST",
      body: {},
    });
    expect(disabled.status).toBe(200);
    expect((await disabled.json()).secret.status).toBe("disabled");

    const afterDisable = await call("/api/secrets");
    expect((await afterDisable.json()).secrets[0].status).toBe("disabled");
    expect(() => readSecretValue("synthetic-token")).toThrow(/not active/);
  });

  it("derives owner server-side and ignores anything the client claims", async () => {
    await call("/api/secrets", {
      method: "POST",
      body: { ...CREATE_BODY, owner: "attacker-claimed-owner", path: "/etc/passwd" },
    });
    const entry = readRegistry()[0];
    expect(entry.owner).toBe(OWNER);
    expect(entry.path).toBe(join(valuesDir(), "synthetic-token"));
    expect(entry.path).not.toContain("/etc/passwd");
  });

  it("rejects a duplicate name with 409 rather than overwriting", async () => {
    await call("/api/secrets", { method: "POST", body: CREATE_BODY });
    const again = await call("/api/secrets", {
      method: "POST",
      body: { ...CREATE_BODY, value: SYNTHETIC_2 },
    });
    expect(again.status).toBe(409);
    expect(readSecretValue("synthetic-token")).toBe(SYNTHETIC);
  });

  it("404s replace and disable for an unknown secret", async () => {
    expect((await call("/api/secrets/ghost", { method: "PUT", body: { value: SYNTHETIC } })).status).toBe(404);
    expect((await call("/api/secrets/ghost/disable", { method: "POST", body: {} })).status).toBe(404);
  });

  it("validates input without echoing it back", async () => {
    const bad = await call("/api/secrets", {
      method: "POST",
      body: { ...CREATE_BODY, name: SYNTHETIC },
    });
    expect(bad.status).toBe(400);
    const text = await bad.text();
    expect(text).not.toContain(SYNTHETIC);
    expect(text).toContain("invalid secret name");

    for (const patch of [{ type: "bogus" }, { purpose: "" }, { consumer: "" }, { expiry: "01/01/2027" }, { value: "" }]) {
      const res = await call("/api/secrets", { method: "POST", body: { ...CREATE_BODY, ...patch } });
      expect(res.status).toBe(400);
    }
  });

  it("caps the value size and the body size", async () => {
    const tooBig = await call("/api/secrets", {
      method: "POST",
      body: { ...CREATE_BODY, value: "x".repeat(MAX_VALUE_BYTES + 1) },
    });
    expect([400, 413]).toContain(tooBig.status);
    expect(readRegistry()).toHaveLength(0);
  });

  it("404s an unknown route", async () => {
    expect((await call("/api/secrets/a/b/c")).status).toBe(404);
    expect((await call("/api/anything-else")).status).toBe(404);
  });
});

// --- H1: authorisation, fail-closed -----------------------------------------
describe("H1 — server-side authentication and authorisation", () => {
  it("refuses an unauthenticated request", async () => {
    for (const path of ["/api/secrets"]) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(401);
      expect(JSON.stringify(await res.json())).not.toContain(SYNTHETIC);
    }
  });

  it("refuses an expired or revoked session", async () => {
    const res = await call("/api/secrets", { token: "expired-token" });
    expect(res.status).toBe(401);
    // The identity provider was actually consulted — expiry is authoritative
    // there, not inferred from a local claim.
    expect(directusCalls.length).toBeGreaterThan(0);
  });

  it("refuses an authenticated NON-owner with 403", async () => {
    expect((await call("/api/secrets", { token: "other-token" })).status).toBe(403);
    expect(
      (await call("/api/secrets", { token: "other-token", method: "POST", body: CREATE_BODY })).status,
    ).toBe(403);
    expect(readRegistry()).toHaveLength(0);
  });

  it("refuses a request whose only credential is a cookie — no ambient authority", async () => {
    const res = await fetch(`${base}/api/secrets`, {
      headers: { Cookie: "directus_refresh_token=whatever; session=whatever" },
    });
    expect(res.status).toBe(401);
  });

  it("refuses every mutation before authentication, so nothing is written", async () => {
    for (const [path, method] of [
      ["/api/secrets", "POST"],
      ["/api/secrets/synthetic-token", "PUT"],
      ["/api/secrets/synthetic-token/disable", "POST"],
    ]) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify(CREATE_BODY),
      });
      expect(res.status).toBe(401);
    }
    expect(readRegistry()).toHaveLength(0);
    // The store was never even initialised, let alone written to.
    expect(existsSync(valuesDir()) ? readdirSync(valuesDir()) : []).toEqual([]);
  });

  it("fails closed when the identity provider cannot be reached", async () => {
    const handler = createHandler({
      directusUrl: "https://directus.example.test",
      ownerEmails: [OWNER],
      allowedOrigins: [ORIGIN],
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    const s = createServer((req, res) => handler(req, res));
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    const port = s.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/secrets`, {
      headers: { Authorization: "Bearer owner-token" },
    });
    expect(res.status).toBe(503);
    await new Promise((r) => s.close(r));
  });
});

describe("H1 — CSRF controls appropriate to a bearer session", () => {
  it("rejects a mutation from a foreign origin", async () => {
    const res = await call("/api/secrets", { method: "POST", body: CREATE_BODY, origin: EVIL_ORIGIN });
    expect(res.status).toBe(403);
    expect(readRegistry()).toHaveLength(0);
  });

  it("rejects a cross-site form content type", async () => {
    for (const ct of ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"]) {
      const res = await call("/api/secrets", { method: "POST", body: CREATE_BODY, contentType: ct });
      expect(res.status).toBe(415);
    }
    expect(readRegistry()).toHaveLength(0);
  });

  it("allows the app's own origin", async () => {
    const res = await call("/api/secrets", { method: "POST", body: CREATE_BODY, origin: ORIGIN });
    expect(res.status).toBe(201);
  });
});

// --- M1 at the API boundary --------------------------------------------------
describe("M1 — expiry is enforced, not merely displayed", () => {
  it("shows expired in the metadata AND refuses the value at the consumption boundary", async () => {
    addSecret(
      {
        name: "expired-token",
        type: "token",
        purpose: "synthetic",
        consumer: "none",
        owner: OWNER,
        expiry: "2020-01-01",
      },
      SYNTHETIC,
    );
    // The stored status is still "active" — this is the exact state the old
    // code handed the value out for.
    expect(readRegistry()[0].status).toBe("active");

    const listed = await call("/api/secrets");
    const json = await listed.json();
    expect(json.secrets[0].status).toBe("expired");
    expect(JSON.stringify(json)).not.toContain(SYNTHETIC);

    expect(() => readSecretValue("expired-token")).toThrow(/expired/);
  });
});

// --- Non-disclosure ----------------------------------------------------------
describe("non-disclosure across the API boundary", () => {
  it("never returns path, value, prefix, length or digest", async () => {
    await call("/api/secrets", { method: "POST", body: CREATE_BODY });
    const json = await (await call("/api/secrets")).json();
    const entry = json.secrets[0];

    expect(Object.keys(entry).sort()).toEqual(
      ["consumer", "created", "expiry", "name", "owner", "purpose", "status", "type", "updated"],
    );
    for (const forbidden of ["path", "value", "secret", "digest", "hash", "prefix", "length", "bytes"]) {
      expect(entry).not.toHaveProperty(forbidden);
    }
    const serialised = JSON.stringify(json);
    expect(serialised).not.toContain(SYNTHETIC);
    // No prefix of the value leaks either.
    for (const n of [4, 8, 12, 16]) {
      expect(serialised).not.toContain(SYNTHETIC.slice(0, n));
    }
    expect(serialised).not.toContain(tmp);
    expect(serialised).not.toContain(".secrets");
  });

  it("keeps the value out of the registry file on disk", async () => {
    await call("/api/secrets", { method: "POST", body: CREATE_BODY });
    expect(readFileSync(registryPath(), "utf8")).not.toContain(SYNTHETIC);
  });

  it("marks every response uncacheable", async () => {
    const res = await call("/api/secrets");
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("projectMetadata drops anything outside the allowlist", () => {
    const out = projectMetadata({
      name: "x",
      type: "token",
      purpose: "p",
      consumer: "c",
      owner: "o",
      created: "2026-01-01",
      updated: "2026-01-01",
      expiry: null,
      status: "active",
      path: "/home/x/.secrets/values/x",
      value: SYNTHETIC,
    });
    expect(out).not.toHaveProperty("path");
    expect(out).not.toHaveProperty("value");
    expect(JSON.stringify(out)).not.toContain(SYNTHETIC);
  });
});

// --- Structural guarantees ---------------------------------------------------
describe("structural guarantees", () => {
  it("the API never spawns a shell or a child process", () => {
    const src = readFileSync(join(HERE, "secretsapi.mjs"), "utf8");
    for (const forbidden of ["child_process", "execSync", "execFile", "spawn(", "spawnSync"]) {
      expect(src).not.toContain(forbidden);
    }
  });

  it("no source file reads secret metadata from the public /ops-data route", () => {
    const roots = [join(HERE, ".."), join(HERE, "..", "..", "src")];
    const offenders = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(mjs|js|ts|tsx)$/.test(e.name)) continue;
        const src = readFileSync(p, "utf8");
        // Match a real fetch/URL usage, not the explanatory comments that say
        // why this route must never be used for secrets.
        if (/["'`]\/ops-data\/secrets\.json["'`]/.test(src)) offenders.push(p);
      }
    };
    for (const r of roots) walk(r);
    expect(offenders).toEqual([]);
  });

  it("the CLI no longer offers a publish verb that could write a public projection", () => {
    const src = readFileSync(join(HERE, "secretsctl.mjs"), "utf8");
    expect(src).not.toContain("public/ops-data");
    expect(src).not.toMatch(/^\s*publish\(/m);
  });
});

// --- DELETE: the canonical removal endpoint ---------------------------------
//
// Same authorisation as create/replace/disable. One named secret only: there is
// no bulk, wildcard, by-path or by-filter form, and none may be added.
describe("DELETE /api/secrets/:name", () => {
  async function seed(name = "synthetic-token") {
    const r = await call("/api/secrets", { method: "POST", body: { ...CREATE_BODY, name } });
    expect(r.status).toBe(201);
  }

  it("deletes an active secret and returns allowlisted metadata only", async () => {
    await seed();
    const res = await call("/api/secrets/synthetic-token", { method: "DELETE" });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(JSON.stringify(json)).not.toContain(SYNTHETIC);
    expect(Object.keys(json.deleted).sort()).toEqual(
      ["consumer", "created", "expiry", "name", "owner", "purpose", "status", "type", "updated"],
    );
    expect(json.deleted).not.toHaveProperty("path");

    // Gone from both sides of the store.
    expect(readRegistry()).toHaveLength(0);
    expect(readdirSync(valuesDir())).toHaveLength(0);

    const listed = await (await call("/api/secrets")).json();
    expect(listed.secrets).toHaveLength(0);
  });

  it("deletes a disabled secret", async () => {
    await seed();
    expect((await call("/api/secrets/synthetic-token/disable", { method: "POST", body: {} })).status).toBe(200);
    expect((await call("/api/secrets/synthetic-token", { method: "DELETE" })).status).toBe(200);
    expect(readRegistry()).toHaveLength(0);
  });

  it("404s on an unknown secret without changing the store", async () => {
    await seed();
    const res = await call("/api/secrets/no-such-secret", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(readRegistry()).toHaveLength(1);
  });

  it("refuses a non-owner with 403 and leaves the secret intact", async () => {
    await seed();
    const res = await call("/api/secrets/synthetic-token", { method: "DELETE", token: "other-token" });
    expect(res.status).toBe(403);
    expect(readRegistry()).toHaveLength(1);
    expect(readSecretValue("synthetic-token")).toBe(SYNTHETIC);
  });

  it("refuses an invalid/expired session with 401 and leaves the secret intact", async () => {
    await seed();
    for (const token of ["expired-token", null]) {
      const res = await call("/api/secrets/synthetic-token", { method: "DELETE", token });
      expect(res.status).toBe(401);
    }
    expect(readRegistry()).toHaveLength(1);
  });

  it("fails closed with 503 when the identity provider is unreachable", async () => {
    await seed();
    const offline = createHandler({
      directusUrl: "https://directus.example.test",
      ownerEmails: [OWNER],
      allowedOrigins: [ORIGIN],
      fetchImpl: async () => { throw new Error("network down"); },
    });
    const srv = createServer((req, res) => { offline(req, res).catch(() => { res.writeHead(500); res.end("{}"); }); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    try {
      const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/secrets/synthetic-token`, {
        method: "DELETE",
        headers: { Authorization: "Bearer owner-token", Origin: ORIGIN, "Content-Type": "application/json" },
      });
      expect(res.status).toBe(503);
    } finally {
      await new Promise((r) => srv.close(r));
    }
    expect(readRegistry()).toHaveLength(1);
  });

  it("refuses a cross-origin delete", async () => {
    await seed();
    const res = await call("/api/secrets/synthetic-token", { method: "DELETE", origin: EVIL_ORIGIN });
    expect(res.status).toBe(403);
    expect(readRegistry()).toHaveLength(1);
  });

  it("cannot be used as a generic filesystem removal", async () => {
    await seed();
    for (const bad of ["..%2F..%2Fetc%2Fpasswd", "%2Fetc%2Fpasswd", "..", "%2E%2E"]) {
      const res = await call(`/api/secrets/${bad}`, { method: "DELETE" });
      expect([400, 404]).toContain(res.status);
    }
    expect(readRegistry()).toHaveLength(1);
  });

  it("offers no bulk or wildcard delete", async () => {
    await seed();
    // The collection route has no DELETE handler at all.
    expect((await call("/api/secrets", { method: "DELETE" })).status).toBe(404);
    expect((await call("/api/secrets/", { method: "DELETE" })).status).toBe(404);
    expect(readRegistry()).toHaveLength(1);
  });
});
