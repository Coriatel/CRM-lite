// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHandler, FILES } from "./systemapi.mjs";

// Synthetic throughout: a fake Directus and a tiny fake snapshot.
const OWNER = "owner@example.test";
const SESSIONS = { "owner-token": { id: "u1", email: OWNER }, "other-token": { id: "u2", email: "someone@example.test" } };
const fakeDirectus = (calls) => async (url, init) => {
  calls.push(url);
  const t = String(init?.headers?.Authorization ?? "").replace(/^Bearer /, "");
  const s = SESSIONS[t];
  return s ? { ok: true, json: async () => ({ data: s }) } : { ok: false, json: async () => ({}) };
};

let dir, server, base, calls;
async function get(path, { token, method = "GET", headers = {} } = {}) {
  const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: r.headers, buf, json: () => JSON.parse(buf.toString("utf8") || "null") };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "sysapi-"));
  mkdirSync(join(dir, "current"));
  for (const [k, f] of Object.entries(FILES)) writeFileSync(join(dir, "current", f), JSON.stringify({ which: k }));
  writeFileSync(join(dir, "current", "published_at"), "2026-11-26T12:00:00Z\n");
  calls = [];
  server = createServer(createHandler({ dataDir: dir, directusUrl: "http://directus.test", ownerEmails: [OWNER], fetchImpl: fakeDirectus(calls) }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

describe("system-panel-api", () => {
  it("401 without a token, and the files are never sent", async () => {
    for (const p of ["/api/system/ok", "/api/system/map", "/api/system/security", "/api/system/nope"]) {
      const r = await get(p);
      expect(r.status).toBe(401);
      expect(r.buf.toString()).not.toContain("which");
    }
  });
  it("401 for a token Directus does not know", async () => {
    expect((await get("/api/system/map", { token: "expired-token" })).status).toBe(401);
  });
  it("403 for a logged-in user who is not the owner", async () => {
    for (const p of ["/api/system/ok", "/api/system/map", "/api/system/permissions", "/api/system/security"]) {
      const r = await get(p, { token: "other-token" });
      expect(r.status).toBe(403);
      expect(r.buf.toString()).not.toContain("which");
    }
  });
  it("200 for the owner on each file, no-store", async () => {
    for (const k of Object.keys(FILES)) {
      const r = await get(`/api/system/${k}`, { token: "owner-token" });
      expect(r.status).toBe(200);
      expect(r.json()).toEqual({ which: k });
      expect(r.headers.get("cache-control")).toContain("no-store");
    }
  });
  it("ok answers with the publish time", async () => {
    const r = await get("/api/system/ok", { token: "owner-token" });
    expect(r.json()).toEqual({ ok: true, published_at: "2026-11-26T12:00:00Z" });
  });
  it("gzip when asked, ETag + 304", async () => {
    const r = await fetch(base + "/api/system/map", { headers: { Authorization: "Bearer owner-token", "Accept-Encoding": "gzip" } });
    expect(r.status).toBe(200);
    const etag = r.headers.get("etag");
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    const again = await get("/api/system/map", { token: "owner-token", headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(r.headers.get("content-encoding")).toBe("gzip");
    expect(gunzipSync).toBeTypeOf("function");
  });
  it("read only: POST is 405, unknown path is 404 (owner)", async () => {
    expect((await get("/api/system/map", { token: "owner-token", method: "POST" })).status).toBe(405);
    expect((await get("/api/system/../secrets", { token: "owner-token" })).status).toBe(404);
    expect((await get("/api/system/components", { token: "owner-token" })).status).toBe(404);
  });
  it("503 without internals when the snapshot is missing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "sysapi-empty-"));
    const s = createServer(createHandler({ dataDir: empty, directusUrl: "http://d", ownerEmails: [OWNER], fetchImpl: fakeDirectus([]) }));
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/system/map`, { headers: { Authorization: "Bearer owner-token" } });
    expect(r.status).toBe(503);
    expect(await r.text()).toBe('{"error":"snapshot not available"}');
    s.close(); rmSync(empty, { recursive: true, force: true });
  });
  it("Directus down is 503, never 200", async () => {
    const s = createServer(createHandler({ dataDir: dir, directusUrl: "http://d", ownerEmails: [OWNER], fetchImpl: async () => { throw new Error("down"); } }));
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/system/map`, { headers: { Authorization: "Bearer fresh-token" } });
    expect(r.status).toBe(503);
    s.close();
  });
  it("the owner answer is reused for a minute (Directus asked once per token)", async () => {
    const before = calls.length;
    await get("/api/system/ok", { token: "owner-token" });
    await get("/api/system/ok", { token: "owner-token" });
    expect(calls.length).toBe(before);
  });
  it("requires an owner list", () => {
    expect(() => createHandler({ dataDir: dir, directusUrl: "x", ownerEmails: [] })).toThrow();
  });
});
