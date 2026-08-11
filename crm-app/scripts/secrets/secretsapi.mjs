// Owner-authenticated HTTP API for the secret store.
//
// This exists because the independent review established that the browser was
// reading secret metadata from /ops-data/*, a Caddy static route with no
// authentication at all, on two public domains. There is now no static
// projection anywhere: metadata is reachable only through this API, and only
// for an authenticated request whose identity is on the owner allowlist.
//
// Authentication reuses the app's existing session mechanism rather than
// introducing a second one: the SPA already holds a Directus access token, and
// every request here is validated by asking Directus who the bearer is. An
// expired or revoked session fails at that check, closed.
//
// CSRF: authority comes ONLY from the Authorization header. Cookies are never
// read, so no request carries ambient authority and a cross-site form or
// <img> cannot act as the owner — browsers do not attach Authorization
// cross-site. On top of that, mutating requests must carry a JSON content type
// (which blocks simple cross-site form posts) and, when the browser sends an
// Origin, it must be on the allowlist.
//
// What never crosses this boundary, in either direction:
//   - a raw value out (accepted once on create/replace, never returned)
//   - any prefix, length, digest or other recoverable derivative of a value
//   - the filesystem path of the store
//   - a client-supplied owner or storage location (both derived server-side)
//   - a shell command: routes call the store library directly, never spawn.

import {
  SecretUnavailableError,
  SECRET_TYPES,
  addSecret,
  disableSecret,
  isValidSecretName,
  metadataList,
  replaceSecret,
} from "./secretstore.mjs";

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_VALUE_BYTES = 32 * 1024;

// The metadata allowlist that may leave this process. `path` is absent by
// construction, not by deletion.
const METADATA_FIELDS = [
  "name",
  "type",
  "purpose",
  "consumer",
  "owner",
  "created",
  "updated",
  "expiry",
  "status",
];

export function projectMetadata(entry) {
  const out = {};
  for (const f of METADATA_FIELDS) out[f] = entry[f] ?? null;
  return out;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new HttpError(413, "request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => reject(new HttpError(400, "malformed request")));
  });
}

function parseJson(raw) {
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    // Never echo the body: it may contain a value.
    throw new HttpError(400, "malformed request body");
  }
}

// Identity comes from the app's existing Directus session. We deliberately ask
// Directus rather than verifying a JWT locally: revocation and expiry are then
// authoritative, and no signing key has to live in this process.
export async function authenticate(req, { directusUrl, ownerEmails, fetchImpl }) {
  const header = req.headers?.authorization ?? "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (!match) throw new HttpError(401, "authentication required");

  let res;
  try {
    res = await fetchImpl(`${directusUrl}/users/me?fields=id,email`, {
      headers: { Authorization: `Bearer ${match[1]}` },
    });
  } catch {
    // Identity provider unreachable => cannot prove the caller is the owner.
    throw new HttpError(503, "cannot verify session");
  }
  if (!res.ok) throw new HttpError(401, "session is not valid");

  let email = "";
  let uid = "";
  try {
    const json = await res.json();
    email = String(json?.data?.email ?? "").toLowerCase();
    uid = String(json?.data?.id ?? "");
  } catch {
    throw new HttpError(401, "session is not valid");
  }
  if (!email) throw new HttpError(401, "session is not valid");
  if (!ownerEmails.includes(email)) throw new HttpError(403, "not authorised");
  return { email, uid };
}

// CSRF controls appropriate to a Bearer-token session (see header comment).
export function assertCsrfSafe(req, { allowedOrigins }) {
  const origin = req.headers?.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    throw new HttpError(403, "origin not allowed");
  }
  const contentType = String(req.headers?.["content-type"] ?? "");
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "expected application/json");
  }
}

function requireString(body, field, { maxLength = 200 } = {}) {
  const v = body[field];
  if (typeof v !== "string" || v.trim() === "") {
    throw new HttpError(400, `missing or empty field: ${field}`);
  }
  if (v.length > maxLength) throw new HttpError(400, `field too long: ${field}`);
  return v;
}

// The value is the one field whose content must never appear in an error.
function requireValue(body) {
  const v = body.value;
  if (typeof v !== "string" || v.length === 0) {
    throw new HttpError(400, "a non-empty value is required");
  }
  if (v.length > MAX_VALUE_BYTES) throw new HttpError(400, "value is too large");
  return v;
}

function requireName(raw) {
  if (typeof raw !== "string" || !isValidSecretName(raw)) {
    // Never echo the input — it may be a value pasted into the wrong field.
    throw new HttpError(400, "invalid secret name");
  }
  return raw;
}

const ROUTE_LIST = /^\/api\/secrets\/?$/;
const ROUTE_ONE = /^\/api\/secrets\/([^/]+)$/;
const ROUTE_DISABLE = /^\/api\/secrets\/([^/]+)\/disable$/;

export function createHandler({
  directusUrl,
  ownerEmails,
  allowedOrigins = [],
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
}) {
  const owners = ownerEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean);

  async function route(req, url, identity) {
    const path = url.pathname;

    if (req.method === "GET" && ROUTE_LIST.test(path)) {
      return { status: 200, body: { secrets: metadataList({ now: now() }).map(projectMetadata) } };
    }

    if (req.method === "POST" && ROUTE_LIST.test(path)) {
      assertCsrfSafe(req, { allowedOrigins });
      const body = parseJson(await readBody(req));
      const name = requireName(body.name);
      const type = requireString(body, "type", { maxLength: 32 });
      if (!SECRET_TYPES.includes(type)) throw new HttpError(400, "invalid type");
      const purpose = requireString(body, "purpose", { maxLength: 500 });
      const consumer = requireString(body, "consumer", { maxLength: 200 });
      const expiry = body.expiry == null || body.expiry === "" ? null : String(body.expiry);
      if (expiry !== null && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        throw new HttpError(400, "expiry must be YYYY-MM-DD");
      }
      const value = requireValue(body);
      let entry;
      try {
        entry = addSecret(
          // owner and storage location are derived here, server-side. Anything
          // the client sent for either is discarded.
          { name, type, purpose, consumer, expiry, owner: identity.email },
          value,
          { now: now() },
        );
      } catch (e) {
        throw new HttpError(/already exists/.test(e.message) ? 409 : 400, safeStoreMessage(e));
      }
      return { status: 201, body: { secret: projectMetadata(entry) } };
    }

    const disableMatch = ROUTE_DISABLE.exec(path);
    if (req.method === "POST" && disableMatch) {
      assertCsrfSafe(req, { allowedOrigins });
      const name = requireName(decodeURIComponent(disableMatch[1]));
      let entry;
      try {
        entry = disableSecret(name, { now: now() });
      } catch (e) {
        throw new HttpError(/no such secret/.test(e.message) ? 404 : 400, safeStoreMessage(e));
      }
      return { status: 200, body: { secret: projectMetadata(entry) } };
    }

    const oneMatch = ROUTE_ONE.exec(path);
    if (req.method === "PUT" && oneMatch) {
      assertCsrfSafe(req, { allowedOrigins });
      const name = requireName(decodeURIComponent(oneMatch[1]));
      const body = parseJson(await readBody(req));
      const value = requireValue(body);
      let entry;
      try {
        entry = replaceSecret(name, value, { now: now() });
      } catch (e) {
        throw new HttpError(/no such secret/.test(e.message) ? 404 : 400, safeStoreMessage(e));
      }
      return { status: 200, body: { secret: projectMetadata(entry) } };
    }

    throw new HttpError(404, "not found");
  }

  return async function handler(req, res) {
    let url;
    try {
      url = new URL(req.url, "http://127.0.0.1");
    } catch {
      return send(res, 400, { error: "malformed request" });
    }
    try {
      const identity = await authenticate(req, {
        directusUrl,
        ownerEmails: owners,
        fetchImpl,
      });
      const result = await route(req, url, identity);
      return send(res, result.status, result.body);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof SecretUnavailableError) return send(res, 409, { error: e.message });
      // Never surface an unexpected message or stack: either could quote input.
      return send(res, 500, { error: "internal error" });
    }
  };
}

// Store errors are built from names and flags only, never from a value — but
// re-assert that here rather than trusting it, because this string is the one
// that reaches the browser.
function safeStoreMessage(e) {
  const m = String(e?.message ?? "");
  const allowed = [
    /^secret already exists: [a-z0-9][a-z0-9._-]*/,
    /^no such secret: [a-z0-9][a-z0-9._-]*/,
    /^invalid secret name$/,
    /^invalid type/,
    /^purpose is required$/,
    /^consumer is required$/,
    /^owner is required$/,
    /^expiry must be/,
    /^refusing to store an empty value$/,
    /^secret store is busy/,
    /^refusing to write/,
    /^registry\.json /,
    /^resolved secret path escapes/,
  ];
  return allowed.some((re) => re.test(m)) ? m : "request rejected";
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    // This response is per-session and must never be cached by a proxy or the
    // browser's back/forward cache.
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}
