#!/usr/bin/env node
// secretsd — the owner-authenticated backend for /ops/secrets.
//
// Binds to loopback only. It is never exposed directly; a reverse proxy in
// front of it terminates TLS and forwards /api/secrets/*. Binding to 127.0.0.1
// means that even a misconfigured proxy cannot turn this into a public write
// surface by accident.
//
// Configuration is entirely environment-driven — no path, owner or store
// location is ever taken from a request:
//   SECRETS_API_PORT      default 8091
//   SECRETS_OWNER_EMAILS  comma-separated allowlist; REQUIRED, no default
//   SECRETS_ALLOWED_ORIGINS comma-separated; required for browser use
//   VITE_DIRECTUS_URL / DIRECTUS_URL  identity provider
//   SECRET_STORE_ROOT     store location (defaults to ~/.secrets)

import { createServer } from "node:http";

import { createHandler } from "./secretsapi.mjs";
import { assertKeyUsable, keyFilePath } from "./secretcrypto.mjs";
import { initStore, storeRoot } from "./secretstore.mjs";

const port = Number(process.env.SECRETS_API_PORT || 8091);
const host = "127.0.0.1";

const ownerEmails = String(process.env.SECRETS_OWNER_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const allowedOrigins = String(process.env.SECRETS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const directusUrl = (
  process.env.VITE_DIRECTUS_URL ||
  process.env.DIRECTUS_URL ||
  "https://crm.merkazneshama.co.il"
).replace(/\/+$/, "");

// Fail to start rather than start with an empty allowlist: an empty allowlist
// authorises nobody, but a future refactor that treats "empty" as "everyone"
// would be catastrophic and silent.
if (ownerEmails.length === 0) {
  console.error("error: SECRETS_OWNER_EMAILS is required and must list at least one owner address");
  process.exit(2);
}

// Startup failure posture: prove the key works BEFORE accepting a single
// request. A service that starts without a usable key would answer /ops
// normally and fail only when the owner tries to use a secret — the worst
// moment to discover it. A missing or unreadable key is a hard start failure,
// not a degraded mode, and the message never quotes the key file's contents.
try {
  assertKeyUsable();
} catch (e) {
  console.error(`error: secret encryption key is unusable — refusing to start (${e.message})`);
  console.error(`hint: SECRET_KEY_FILE=${keyFilePath() || "(unset)"}`);
  process.exit(3);
}

initStore();

const handler = createHandler({ directusUrl, ownerEmails, allowedOrigins });

const server = createServer((req, res) => {
  handler(req, res).catch(() => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    }
    res.end(JSON.stringify({ error: "internal error" }));
  });
});

server.listen(port, host, () => {
  // Metadata only: never the owner addresses, never the store contents.
  console.log(`secretsd listening on http://${host}:${port} (store: ${storeRoot()})`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
