// system-panel-api: the read-only, owner-only source of the nihul "מערכת" tab.
//
// GET /api/system/ok | map | permissions | security  — nothing else, no writes.
// The files come from the published snapshot (scripts/system-map/publish_snapshot.sh in ops-vault).
// They list ports, findings and permission gaps, so every route answers the owner alone:
// 401 without a valid Directus session, 403 for anyone else (server-side; the tab hiding is cosmetic).
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

export const FILES = { map: "SYSTEM_MAP.json", permissions: "permissions_map.json", security: "security_map.json" };
const KEEP_MS = 60_000;        // how long a "this token is / is not the owner" answer is reused
const PER_MIN = 120;           // requests per token per minute

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const sha = (s) => createHash("sha256").update(s).digest("hex");

export function createHandler({ dataDir, directusUrl, ownerEmails, fetchImpl = fetch, now = () => Date.now() }) {
  if (!ownerEmails?.length) throw new Error("ownerEmails is required");
  const known = new Map();      // sha256(token) -> { until, owner }
  const hits = new Map();       // sha256(token) -> { min, n }

  // Ask Directus rather than trusting the token: revocation and expiry stay authoritative.
  async function isOwner(token, key) {
    const k = known.get(key);
    if (k && k.until > now()) return k.owner;
    let res;
    try {
      res = await fetchImpl(`${directusUrl}/users/me?fields=id,email`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new HttpError(503, "cannot verify session");
    }
    if (!res.ok) throw new HttpError(401, "session is not valid");
    let email = "";
    try { email = String((await res.json())?.data?.email ?? "").toLowerCase(); } catch { /* invalid below */ }
    if (!email) throw new HttpError(401, "session is not valid");
    const owner = ownerEmails.includes(email);
    if (known.size > 200) known.clear();
    known.set(key, { until: now() + KEEP_MS, owner });
    return owner;
  }

  function limit(key) {
    const min = Math.floor(now() / 60_000), h = hits.get(key);
    if (!h || h.min !== min) { if (hits.size > 500) hits.clear(); hits.set(key, { min, n: 1 }); return; }
    if (++h.n > PER_MIN) throw new HttpError(429, "too many requests");
  }

  async function body(name, accept) {
    let raw;
    try { raw = await readFile(join(dataDir, "current", name)); } catch { throw new HttpError(503, "snapshot not available"); }
    const etag = `"${sha(raw).slice(0, 32)}"`;
    const gz = /\bgzip\b/.test(accept || "");
    return { etag, gz, data: gz ? gzipSync(raw) : raw };
  }

  return async function handle(req, res) {
    const send = (status, obj, extra = {}) => {
      const data = obj === null ? "" : JSON.stringify(obj);
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", ...extra });
      res.end(data);
    };
    try {
      const m = /^Bearer\s+(\S+)$/.exec(req.headers?.authorization ?? "");
      if (!m) throw new HttpError(401, "authentication required");
      const key = sha(m[1]);
      limit(key);
      if (!(await isOwner(m[1], key))) throw new HttpError(403, "not authorised");
      if (req.method !== "GET") throw new HttpError(405, "read only");
      const path = new URL(req.url, "http://127.0.0.1").pathname.replace(/\/+$/, "");
      if (path === "/api/system/ok") {
        let at = null;
        try { at = (await readFile(join(dataDir, "current", "published_at"), "utf8")).trim(); } catch { /* no snapshot yet */ }
        return send(200, { ok: true, published_at: at });
      }
      const which = /^\/api\/system\/(map|permissions|security)$/.exec(path)?.[1];
      if (!which) throw new HttpError(404, "not found");
      const b = await body(FILES[which], req.headers?.["accept-encoding"]);
      if (req.headers?.["if-none-match"] === b.etag) return send(304, null, { ETag: b.etag });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", ETag: b.etag, Vary: "Accept-Encoding", ...(b.gz ? { "Content-Encoding": "gzip" } : {}) });
      res.end(b.data);
    } catch (e) {
      // Never echo internals: a status and a short fixed message only.
      const status = e instanceof HttpError ? e.status : 500;
      send(status, { error: e instanceof HttpError ? e.message : "internal error" }, status === 405 ? { Allow: "GET" } : {});
    }
  };
}
