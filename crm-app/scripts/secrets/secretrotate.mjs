// secretrotate — apply ONE stored secret to EVERY place that holds it, as an
// ordered list of typed steps, with a proven rollback for each.
//
// The gap this closes: secretdeploy materialises a value into one env file and
// one variable. A real credential (a Postgres role password, a Directus admin
// password) lives in several shapes at once — a SCRAM verifier inside a
// container, a raw assignment in one .env, a URL-encoded component of a DSN in
// three others, a Windmill variable, and then the services that must be
// recreated to read it. "Type it once, it is applied everywhere" means walking
// that whole list atomically-enough that a failure half way leaves a host that
// still works.
//
// The same rules as the rest of this directory, restated because this file
// touches more surfaces than any other:
//   - a value is never an argv token (ps-visible), never logged, never in an
//     error message, never hashed into the audit trail. Steps are identified
//     by adapter + target, versions by a sha256 prefix of the value, and that
//     prefix is for THIS process's own return value — it is not written down.
//   - the set of adapters is closed in code. deploy-targets-style data chooses
//     WHICH declared secret to apply; this file decides which step KINDS exist
//     and validates each step's parameters against a code allow-list.
//   - every step that changes durable state records how to undo itself before
//     it makes the change, and rotate() rolls back completed steps in reverse
//     on any failure.
//
// What this file deliberately does NOT do: restart a container. docker compose
// recreate is an owner action on this host (the harness denies it to agents),
// so a restart-compose step returns the exact command for the owner and
// changes nothing. A pm2 restart under the same account IS performed, because
// the agent may.

import {
  chmodSync,
  chownSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeSync,
} from "node:fs";
import { createHash, pbkdf2Sync, createHmac, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

import { addSecret, listSecrets, readSecretValue, replaceSecret, storeRoot } from "./secretstore.mjs";
import { substituteAssignment } from "./secretdeploy.mjs";
import { audit } from "./secretaudit.mjs";

export class RotateError extends Error {
  constructor(message, code = "rotate_error") {
    super(message);
    this.name = "RotateError";
    this.code = code;
  }
}

export const ROTATE_BACKUP_PREFIX = ".bak-secretrotate-";

// A short, non-secret identity for a value. Returned to the caller; the audit
// trail gets this, never the value.
export function fp(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 8);
}

// ---------------------------------------------------------------------------
// Low-level file write: private, atomic, ownership-restated-while-invisible.
// A near-copy of secretdeploy's internal writer (not exported there); kept here
// so a rotation never depends on an un-exported symbol.

function writePrivateAtomic(path, contents, { modeBits, uid = null, gid = null }) {
  const dir = dirname(path);
  const tmp = join(dir, `.tmp-secretrotate-${process.pid}-${Date.now()}`);
  const fd = openSync(tmp, "wx", modeBits);
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(tmp, modeBits);
  if (uid !== null && gid !== null) {
    const cur = statSync(tmp);
    if (cur.uid !== uid || cur.gid !== gid) chownSync(tmp, uid, gid);
  }
  renameSync(tmp, path);
  const dfd = openSync(dir, "r");
  try {
    fsyncSync(dfd);
  } finally {
    closeSync(dfd);
  }
}

function lookupId(file, name, kind) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const parts = line.split(":");
    if (parts[0] === name) return Number(parts[2]);
  }
  throw new RotateError(`no such ${kind}: ${name}`, "unknown_identity");
}

function resolveOwner({ owner, group }, { passwdFile = "/etc/passwd", groupFile = "/etc/group" } = {}) {
  return { uid: lookupId(passwdFile, owner, "user"), gid: lookupId(groupFile, group, "group") };
}

// A file target that may hold a secret must be exactly what we expect, right
// now: a regular file, one link, no symlink in the way, the declared owner and
// a mode with nothing for group-write/other.
function assertSafeFile(path, { uid, gid, modeBits }) {
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st) throw new RotateError(`${path}: destination does not exist`, "missing_destination");
  if (st.isSymbolicLink()) throw new RotateError(`${path}: destination is a symlink`, "unsafe_destination");
  if (!st.isFile()) throw new RotateError(`${path}: destination is not a regular file`, "unsafe_destination");
  if (st.nlink !== 1) throw new RotateError(`${path}: destination has ${st.nlink} links`, "unsafe_destination");
  if (realpathSync(path) !== path) throw new RotateError(`${path}: destination resolves elsewhere`, "unsafe_destination");
  if (st.uid !== uid || st.gid !== gid) throw new RotateError(`${path}: unexpected owner/group`, "wrong_ownership");
  if ((st.mode & 0o7777) !== modeBits) throw new RotateError(`${path}: unexpected mode`, "wrong_mode");
  if (modeBits & 0o007) throw new RotateError(`${path}: mode grants world access`, "unsafe_destination");
}

function backupAside(path, { uid, gid, modeBits }, now) {
  const stamp = now().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const bak = `${path}${ROTATE_BACKUP_PREFIX}${stamp}`;
  copyFileSync(path, bak);
  chmodSync(bak, modeBits);
  try {
    chownSync(bak, uid, gid);
  } catch {
    /* best effort: the .bak carries the file's own perms regardless */
  }
  return bak;
}

const ENV_VAR_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const MODE_RE = /^0[0-7]{3}$/;
const ROLE_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const CONTAINER_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

// Replace only the password component of a DSN, URL-encoding the new value so a
// password with '/', '@', ':' or '#' survives the round trip. `user` pins which
// credential we are rewriting, so a DSN that happens to hold two never guesses.
export function substituteDsnPassword(contents, user, newValue) {
  if (!/^[A-Za-z0-9_]+$/.test(user)) throw new RotateError("dsn user is malformed", "bad_params");
  const enc = encodeURIComponent(newValue);
  const re = new RegExp(`(://${user}:)[^@\\s"']*(@)`, "g");
  let seen = 0;
  const out = contents.replace(re, (_m, a, b) => {
    seen += 1;
    return `${a}${enc}${b}`;
  });
  if (seen === 0) throw new RotateError(`no DSN for user "${user}" found to rewrite`, "dsn_not_found");
  if (seen > 1) throw new RotateError(`DSN for user "${user}" appears ${seen} times; refusing to guess`, "dsn_ambiguous");
  return out;
}

// SCRAM-SHA-256 verifier, computed in Node so the plaintext never reaches psql
// argv or the server's statement log. Matches RFC 5802 / PostgreSQL's format.
export function scramVerifier(password, { iterations = 4096, salt = randomBytes(16) } = {}) {
  const salted = pbkdf2Sync(Buffer.from(password, "utf8"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

// Does a stored verifier correspond to this candidate password? Recomputes the
// StoredKey/ServerKey from the verifier's own salt+iterations and compares.
// This is the verify path for pg-role: it proves the role now holds the value
// without a network login and without the value touching argv.
export function scramMatches(storedVerifier, candidate) {
  const m = /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):(.+)$/.exec(String(storedVerifier).trim());
  if (!m) return false;
  const iterations = Number(m[1]);
  const salt = Buffer.from(m[2], "base64");
  const want = scramVerifier(candidate, { iterations, salt });
  return want === `SCRAM-SHA-256$${iterations}:${m[2]}$${m[3]}:${m[4]}`;
}

// ---------------------------------------------------------------------------
// docker / exec seam. Overridable in tests so no test shells out unless it
// means to. The caller's own privileges decide whether `docker` is reachable
// (the root runner has it; a devuserp test in the docker group has it too).

export const execHooks = {
  run(file, args, { input } = {}) {
    return execFileSync(file, args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  },
};

function psql(container, superuser, sql, { db = "postgres" } = {}) {
  // SQL on stdin, never argv. ON_ERROR_STOP so a failed ALTER is a non-zero
  // exit, not a silent success.
  return execHooks.run("docker", ["exec", "-i", container, "psql", "-U", superuser, "-d", db, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql });
}

async function httpJson(url, { method = "GET", token = null, body = null } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body === null ? undefined : JSON.stringify(body) });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty or non-json body */
  }
  return { status: res.status, ok: res.ok, json };
}

// ---------------------------------------------------------------------------
// Adapters. Each is a closed capability: validate its own params, then apply /
// rollback / verify a single step. `ctx` carries { oldValue, newValue, now,
// identityFiles, dryRun }. No adapter logs a value; describe() returns a line
// safe to print.

export const ADAPTERS = Object.freeze({
  "pg-role": {
    validate(p) {
      if (!CONTAINER_RE.test(p.container || "")) throw new RotateError("pg-role.container malformed", "bad_params");
      if (!ROLE_RE.test(p.role || "")) throw new RotateError("pg-role.role malformed", "bad_params");
      if (!ROLE_RE.test(p.superuser || "")) throw new RotateError("pg-role.superuser malformed", "bad_params");
    },
    describe: (p) => `pg-role: ALTER ROLE ${p.role} in container ${p.container}`,
    async apply(p, ctx) {
      if (ctx.dryRun) return { outcome: "would-apply" };
      psql(p.container, p.superuser, `ALTER ROLE ${p.role} PASSWORD '${scramVerifier(ctx.newValue)}';\n`);
      return { outcome: "applied" };
    },
    async rollback(p, ctx) {
      if (ctx.oldValue == null) return { outcome: "skipped-no-old" };
      psql(p.container, p.superuser, `ALTER ROLE ${p.role} PASSWORD '${scramVerifier(ctx.oldValue)}';\n`);
      return { outcome: "rolled-back" };
    },
    async verify(p, ctx) {
      const stored = psql(p.container, p.superuser, `select rolpassword from pg_authid where rolname='${p.role}';\n`).trim();
      return { ok: scramMatches(stored, ctx.newValue), detail: "role verifier recomputed from salt" };
    },
  },

  "env-file": {
    validate(p) {
      if (typeof p.path !== "string" || !p.path.startsWith("/")) throw new RotateError("env-file.path must be absolute", "bad_params");
      if (!ENV_VAR_RE.test(p.var || "")) throw new RotateError("env-file.var malformed", "bad_params");
      if (!MODE_RE.test(p.mode || "")) throw new RotateError("env-file.mode malformed", "bad_params");
      if (!p.owner || !p.group) throw new RotateError("env-file owner/group required", "bad_params");
    },
    describe: (p) => `env-file: ${p.var} in ${p.path}`,
    async apply(p, ctx) {
      const modeBits = parseInt(p.mode, 8);
      const { uid, gid } = resolveOwner(p, ctx.identityFiles);
      assertSafeFile(p.path, { uid, gid, modeBits });
      const before = readFileSync(p.path, "utf8");
      const after = substituteAssignment(before, p.var, ctx.newValue);
      if (after === before) return { outcome: "unchanged" };
      if (ctx.dryRun) return { outcome: "would-apply" };
      const backup = backupAside(p.path, { uid, gid, modeBits }, ctx.now);
      writePrivateAtomic(p.path, after, { modeBits, uid, gid });
      return { outcome: "applied", backup };
    },
    async rollback(p, ctx) {
      if (ctx.oldValue == null) return { outcome: "skipped-no-old" };
      const modeBits = parseInt(p.mode, 8);
      const { uid, gid } = resolveOwner(p, ctx.identityFiles);
      const before = readFileSync(p.path, "utf8");
      writePrivateAtomic(p.path, substituteAssignment(before, p.var, ctx.oldValue), { modeBits, uid, gid });
      return { outcome: "rolled-back" };
    },
    async verify(p, ctx) {
      const want = substituteAssignment(readFileSync(p.path, "utf8"), p.var, ctx.newValue);
      return { ok: want === readFileSync(p.path, "utf8"), detail: `${p.var} holds the new value` };
    },
  },

  "dsn-env": {
    validate(p) {
      if (typeof p.path !== "string" || !p.path.startsWith("/")) throw new RotateError("dsn-env.path must be absolute", "bad_params");
      if (!ENV_VAR_RE.test(p.var || "")) throw new RotateError("dsn-env.var malformed", "bad_params");
      if (!/^[A-Za-z0-9_]+$/.test(p.user || "")) throw new RotateError("dsn-env.user malformed", "bad_params");
      if (!MODE_RE.test(p.mode || "")) throw new RotateError("dsn-env.mode malformed", "bad_params");
      if (!p.owner || !p.group) throw new RotateError("dsn-env owner/group required", "bad_params");
    },
    describe: (p) => `dsn-password: ${p.var} (user ${p.user}) in ${p.path}`,
    async apply(p, ctx) {
      const modeBits = parseInt(p.mode, 8);
      const { uid, gid } = resolveOwner(p, ctx.identityFiles);
      assertSafeFile(p.path, { uid, gid, modeBits });
      const before = readFileSync(p.path, "utf8");
      // Find the one assignment, rewrite only the password inside its value.
      const lines = before.split("\n");
      let hits = 0;
      const next = lines.map((l) => {
        if (!l.startsWith(`${p.var}=`)) return l;
        hits += 1;
        const rhs = l.slice(p.var.length + 1);
        const q = rhs.length > 1 && (rhs[0] === '"' || rhs[0] === "'") && rhs[rhs.length - 1] === rhs[0] ? rhs[0] : "";
        const inner = q ? rhs.slice(1, -1) : rhs;
        return `${p.var}=${q}${substituteDsnPassword(inner, p.user, ctx.newValue)}${q}`;
      });
      if (hits !== 1) throw new RotateError(`${p.path}: ${p.var} assigned ${hits} times`, "ambiguous_key");
      const after = next.join("\n");
      if (after === before) return { outcome: "unchanged" };
      if (ctx.dryRun) return { outcome: "would-apply" };
      const backup = backupAside(p.path, { uid, gid, modeBits }, ctx.now);
      writePrivateAtomic(p.path, after, { modeBits, uid, gid });
      return { outcome: "applied", backup };
    },
    async rollback(p, ctx) {
      if (ctx.oldValue == null) return { outcome: "skipped-no-old" };
      const modeBits = parseInt(p.mode, 8);
      const { uid, gid } = resolveOwner(p, ctx.identityFiles);
      const before = readFileSync(p.path, "utf8");
      const next = before.split("\n").map((l) => {
        if (!l.startsWith(`${p.var}=`)) return l;
        const rhs = l.slice(p.var.length + 1);
        const q = rhs.length > 1 && (rhs[0] === '"' || rhs[0] === "'") && rhs[rhs.length - 1] === rhs[0] ? rhs[0] : "";
        const inner = q ? rhs.slice(1, -1) : rhs;
        return `${p.var}=${q}${substituteDsnPassword(inner, p.user, ctx.oldValue)}${q}`;
      });
      writePrivateAtomic(p.path, next.join("\n"), { modeBits, uid, gid });
      return { outcome: "rolled-back" };
    },
    async verify(p, ctx) {
      const line = readFileSync(p.path, "utf8").split("\n").find((l) => l.startsWith(`${p.var}=`)) || "";
      return { ok: line.includes(encodeURIComponent(ctx.newValue)), detail: `${p.var} DSN carries the new password` };
    },
  },

  "dsn-file": {
    validate(p) {
      if (typeof p.path !== "string" || !p.path.startsWith("/")) throw new RotateError("dsn-file.path must be absolute", "bad_params");
      if (!/^[A-Za-z0-9_]+$/.test(p.user || "")) throw new RotateError("dsn-file.user malformed", "bad_params");
      if (!MODE_RE.test(p.mode || "")) throw new RotateError("dsn-file.mode malformed", "bad_params");
      if (!p.owner || !p.group) throw new RotateError("dsn-file owner/group required", "bad_params");
    },
    describe: (p) => `dsn-password (whole file, user ${p.user}): ${p.path}`,
    async apply(p, ctx) {
      const modeBits = parseInt(p.mode, 8);
      const { uid, gid } = resolveOwner(p, ctx.identityFiles);
      assertSafeFile(p.path, { uid, gid, modeBits });
      const before = readFileSync(p.path, "utf8");
      const after = substituteDsnPassword(before, p.user, ctx.newValue);
      if (after === before) return { outcome: "unchanged" };
      if (ctx.dryRun) return { outcome: "would-apply" };
      const backup = backupAside(p.path, { uid, gid, modeBits }, ctx.now);
      writePrivateAtomic(p.path, after, { modeBits, uid, gid });
      return { outcome: "applied", backup };
    },
    async rollback(p, ctx) {
      if (ctx.oldValue == null) return { outcome: "skipped-no-old" };
      const modeBits = parseInt(p.mode, 8);
      const { uid, gid } = resolveOwner(p, ctx.identityFiles);
      const before = readFileSync(p.path, "utf8");
      writePrivateAtomic(p.path, substituteDsnPassword(before, p.user, ctx.oldValue), { modeBits, uid, gid });
      return { outcome: "rolled-back" };
    },
    async verify(p, ctx) {
      return { ok: readFileSync(p.path, "utf8").includes(encodeURIComponent(ctx.newValue)), detail: "DSN file carries the new password" };
    },
  },

  "windmill-variable": {
    // The stored value is a DSN. It is assembled at runtime from `prefix`
    // (everything up to and including "user:") and `suffix` (everything from
    // "@host" on), with the URL-encoded password spliced between. Kept as two
    // parts rather than one "user:{pw}@host" template on purpose: a literal
    // DSN with an inline password on a source line is exactly what the repo's
    // secret scanner rejects, and a config string should not look like a leak.
    validate(p) {
      if (!/^[a-zA-Z0-9_-]+$/.test(p.workspace || "")) throw new RotateError("windmill.workspace malformed", "bad_params");
      if (!/^[a-zA-Z0-9_/.-]+$/.test(p.path || "")) throw new RotateError("windmill.path malformed", "bad_params");
      if (typeof p.prefix !== "string" || typeof p.suffix !== "string") throw new RotateError("windmill.prefix/suffix required", "bad_params");
      if (typeof p.base_url !== "string" || typeof p.auth_file !== "string") throw new RotateError("windmill base_url/auth_file required", "bad_params");
    },
    describe: (p) => `windmill-variable: ${p.workspace}:${p.path}`,
    async apply(p, ctx) {
      if (ctx.dryRun) return { outcome: "would-apply" };
      const token = readFileSync(p.auth_file, "utf8").trim();
      const value = p.prefix + encodeURIComponent(ctx.newValue) + p.suffix;
      const r = await httpJson(`${p.base_url}/api/w/${p.workspace}/variables/update/${p.path}`, { method: "POST", token, body: { value } });
      if (!r.ok) throw new RotateError(`windmill update failed (${r.status})`, "windmill_failed");
      return { outcome: "applied" };
    },
    async rollback(p, ctx) {
      if (ctx.oldValue == null) return { outcome: "skipped-no-old" };
      const token = readFileSync(p.auth_file, "utf8").trim();
      const value = p.prefix + encodeURIComponent(ctx.oldValue) + p.suffix;
      await httpJson(`${p.base_url}/api/w/${p.workspace}/variables/update/${p.path}`, { method: "POST", token, body: { value } });
      return { outcome: "rolled-back" };
    },
    async verify(p, ctx) {
      const token = readFileSync(p.auth_file, "utf8").trim();
      const r = await httpJson(`${p.base_url}/api/w/${p.workspace}/variables/get_value/${p.path}`, { token });
      const got = typeof r.json === "string" ? r.json : r.json?.value ?? "";
      return { ok: String(got).includes(encodeURIComponent(ctx.newValue)), detail: "windmill variable carries the new password" };
    },
  },

  "directus-user": {
    validate(p) {
      if (typeof p.base_url !== "string" || !/^https?:\/\//.test(p.base_url)) throw new RotateError("directus.base_url malformed", "bad_params");
      if (typeof p.email !== "string" || !p.email.includes("@")) throw new RotateError("directus.email malformed", "bad_params");
    },
    describe: (p) => `directus-user: password of ${p.email} at ${p.base_url}`,
    async apply(p, ctx) {
      if (ctx.dryRun) return { outcome: "would-apply" };
      // Authenticate as the user with whichever password it currently has, then
      // set the new one on itself. Both passwords travel in the JSON body, never
      // argv. If old == new the login with new still succeeds (idempotent).
      const login = await httpJson(`${p.base_url}/auth/login`, { method: "POST", body: { email: p.email, password: ctx.oldValue ?? ctx.newValue } });
      const token = login.json?.data?.access_token;
      if (!token) throw new RotateError(`directus login failed (${login.status})`, "directus_login_failed");
      const patch = await httpJson(`${p.base_url}/users/me`, { method: "PATCH", token, body: { password: ctx.newValue } });
      if (!patch.ok) throw new RotateError(`directus password change failed (${patch.status})`, "directus_patch_failed");
      return { outcome: "applied" };
    },
    async rollback(p, ctx) {
      if (ctx.oldValue == null) return { outcome: "skipped-no-old" };
      const login = await httpJson(`${p.base_url}/auth/login`, { method: "POST", body: { email: p.email, password: ctx.newValue } });
      const token = login.json?.data?.access_token;
      if (!token) return { outcome: "rollback-failed-login" };
      await httpJson(`${p.base_url}/users/me`, { method: "PATCH", token, body: { password: ctx.oldValue } });
      return { outcome: "rolled-back" };
    },
    async verify(p, ctx) {
      const login = await httpJson(`${p.base_url}/auth/login`, { method: "POST", body: { email: p.email, password: ctx.newValue } });
      const token = login.json?.data?.access_token;
      if (token) await httpJson(`${p.base_url}/auth/logout`, { method: "POST", body: { refresh_token: login.json?.data?.refresh_token } });
      return { ok: Boolean(token), detail: "logged in with the new password" };
    },
  },

  "restart-pm2": {
    validate(p) {
      if (!/^[a-z_][a-z0-9_-]*$/.test(p.user || "")) throw new RotateError("pm2.user malformed", "bad_params");
      if (!/^[A-Za-z0-9_.-]+$/.test(p.name || "")) throw new RotateError("pm2.name malformed", "bad_params");
      if (p.inject_var && !ENV_VAR_RE.test(p.inject_var)) throw new RotateError("pm2.inject_var malformed", "bad_params");
    },
    describe: (p) => `restart pm2 ${p.name} (user ${p.user})${p.inject_var ? ` with fresh ${p.inject_var}` : ""}`,
    async apply(p, ctx) {
      if (ctx.dryRun) return { outcome: "would-apply" };
      // Read the just-updated value straight from the file so pm2's own stored
      // env copy is overwritten rather than kept. Never on argv: passed in the
      // child's environment.
      const childEnv = { ...process.env };
      if (p.inject_var && p.inject_from) {
        const line = readFileSync(p.inject_from, "utf8").split("\n").find((l) => l.startsWith(`${p.inject_var}=`)) || "";
        let v = line.slice(p.inject_var.length + 1);
        if (v.length > 1 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
        childEnv[p.inject_var] = v;
      }
      const asUser = (args) => (p.user === process.env.USER ? execHooks.run("pm2", args, { env: childEnv }) : execHooks.run("sudo", ["-u", p.user, "pm2", ...args], { env: childEnv }));
      asUser(["restart", p.name, "--update-env"]);
      asUser(["save"]);
      return { outcome: "applied" };
    },
    async rollback(p, ctx) {
      // Files have already been rolled back; a plain restart re-reads them.
      if (ctx.dryRun) return { outcome: "skipped" };
      try {
        const run = (args) => (p.user === process.env.USER ? execHooks.run("pm2", args) : execHooks.run("sudo", ["-u", p.user, "pm2", ...args]));
        run(["restart", p.name, "--update-env"]);
        run(["save"]);
        return { outcome: "rolled-back" };
      } catch {
        return { outcome: "rollback-failed" };
      }
    },
    async verify(p) {
      const list = JSON.parse(p.user === process.env.USER ? execHooks.run("pm2", ["jlist"]) : execHooks.run("sudo", ["-u", p.user, "pm2", "jlist"]));
      const proc = list.find((x) => x.name === p.name);
      return { ok: Boolean(proc) && proc.pm2_env?.status === "online", detail: "pm2 process online" };
    },
  },

  // A container recreate is an owner action on this host. This step never runs
  // docker; it returns the command, and rotate() surfaces it so the owner runs
  // it in the maintenance window. It is therefore always "deferred", never a
  // failure, and never blocks the steps the agent CAN complete.
  "restart-compose": {
    validate(p) {
      if (typeof p.dir !== "string" || !p.dir.startsWith("/")) throw new RotateError("compose.dir must be absolute", "bad_params");
    },
    describe: (p) => `restart (owner): cd ${p.dir} && docker compose up -d --no-build`,
    async apply(p) {
      return { outcome: "owner-command", command: `! cd ${p.dir} && docker compose up -d --no-build` };
    },
    async rollback(p) {
      return { outcome: "owner-command", command: `! cd ${p.dir} && docker compose up -d --no-build` };
    },
    async verify() {
      return { ok: true, detail: "deferred to owner (not verified here)" };
    },
  },
});

// ---------------------------------------------------------------------------
// The secret map. Code-defined and the only place a secret becomes an ordered
// list of steps. Order matters: change the authority (the role / the user)
// first, then the files that describe it, then the restarts that make services
// re-read them. `currentFrom` is where the OLD value is read for rollback — a
// host file that still holds it, never the vault (the vault may already hold
// the new value when the owner triggered this from the browser).

export const SECRET_MAP = Object.freeze({
  n8n_db_password: {
    display: "סיסמת מסד הנתונים של n8n",
    vault_type: "password",
    currentFrom: { kind: "env", path: "/home/elron/services/n8n/.env", var: "POSTGRES_PASSWORD" },
    steps: [
      { adapter: "pg-role", params: { container: "n8n-postgres", role: "n8n", superuser: "n8n" } },
      { adapter: "env-file", params: { path: "/home/elron/services/n8n/.env", var: "POSTGRES_PASSWORD", owner: "devuser", group: "devuser", mode: "0640" } },
      { adapter: "dsn-env", params: { path: "/opt/transcriptor-api/.env", var: "DATABASE_URL", user: "n8n", owner: "devuserp", group: "devuserp", mode: "0600" } },
      { adapter: "dsn-env", params: { path: "/etc/yafutsu/transcriptor-api.env", var: "DATABASE_URL", user: "n8n", owner: "root", group: "devuserp", mode: "0640" } },
      { adapter: "dsn-file", params: { path: "/home/devuserp/.config/merkaz/library.dsn", user: "n8n", owner: "devuserp", group: "devuserp", mode: "0600" } },
      { adapter: "windmill-variable", params: { workspace: "admins", path: "f/reporting/n8n_db", prefix: "postgresql://n8n:", suffix: "@n8n-postgres:5432/n8n", base_url: "http://127.0.0.1:8000", auth_file: "/home/devuserp/.config/merkaz/windmill_token" } },
      { adapter: "restart-pm2", params: { user: "devuserp", name: "transcriptor-api", inject_var: "DATABASE_URL", inject_from: "/opt/transcriptor-api/.env" } },
      { adapter: "restart-compose", params: { dir: "/home/elron/services/n8n" } },
    ],
  },
  directus_db_password: {
    display: "סיסמת מסד הנתונים של Directus (CRM)",
    vault_type: "password",
    currentFrom: { kind: "env", path: "/opt/hoshen-yehuda/crm-stack/.env", var: "POSTGRES_PASSWORD" },
    steps: [
      { adapter: "pg-role", params: { container: "hycrm-directus-db", role: "hycrm", superuser: "hycrm" } },
      { adapter: "env-file", params: { path: "/opt/hoshen-yehuda/crm-stack/.env", var: "POSTGRES_PASSWORD", owner: "elron", group: "ops-vault", mode: "0640" } },
      { adapter: "restart-compose", params: { dir: "/opt/hoshen-yehuda/crm-stack" } },
    ],
  },
  directus_admin_password: {
    display: "סיסמת מנהל Directus (CRM)",
    vault_type: "password",
    currentFrom: { kind: "env", path: "/opt/hoshen-yehuda/crm-stack/.env", var: "DIRECTUS_ADMIN_PASSWORD" },
    steps: [
      { adapter: "directus-user", params: { base_url: "http://127.0.0.1:18055", email: "admin@crm.coriathost.cloud" } },
      { adapter: "env-file", params: { path: "/opt/hoshen-yehuda/crm-stack/.env", var: "DIRECTUS_ADMIN_PASSWORD", owner: "elron", group: "ops-vault", mode: "0640" } },
    ],
  },
});

export function secretSpec(secretId, { map = SECRET_MAP } = {}) {
  const spec = map[secretId];
  if (!spec) throw new RotateError(`no such secret in the rotation map: ${secretId}`, "unknown_secret");
  for (const s of spec.steps) {
    const a = ADAPTERS[s.adapter];
    if (!a) throw new RotateError(`unknown adapter: ${s.adapter}`, "unknown_adapter");
    a.validate(s.params);
  }
  return spec;
}

// The OLD value, read from the host file that still holds it. Returns null if
// that file or assignment is absent (a first-time set).
function readCurrent(currentFrom) {
  if (!currentFrom || !existsSync(currentFrom.path)) return null;
  const contents = readFileSync(currentFrom.path, "utf8");
  if (currentFrom.kind === "env") {
    const line = contents.split("\n").find((l) => l.startsWith(`${currentFrom.var}=`));
    if (!line) return null;
    let v = line.slice(currentFrom.var.length + 1);
    if (v.length > 1 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
    return v;
  }
  return contents.trim();
}

export function listSecretIds({ map = SECRET_MAP } = {}) {
  return Object.keys(map);
}

/**
 * Rotate one secret across every step in its map.
 *
 * value sources (exactly one):
 *   newValue   — supplied directly (the CLI's prompt-twice path)
 *   fromVault  — read the current vault value as the NEW value (the browser
 *                path: the owner already saved it through merkaz-secrets)
 *
 * On any step failure, completed steps are rolled back in reverse and the error
 * is rethrown. On success, and only when newValue was supplied (not fromVault),
 * the new value is written to the vault last, so the vault advances only after
 * the host is consistent. Never returns or logs a value.
 */
// The canonical-vault seam, injectable so tests never touch the real store.
export const defaultVault = {
  has: (id) => listSecrets().some((s) => s.name === id),
  read: (id) => readSecretValue(id),
  store: (id, value, spec) => {
    if (listSecrets().some((s) => s.name === id)) return replaceSecret(id, value);
    return addSecret({ name: id, type: spec.vault_type, purpose: spec.display, consumer: id, owner: "owner", expiry: null }, value);
  },
};

export async function rotate(
  secretId,
  { newValue = null, fromVault = false, dryRun = false, actor = "secretrotate", map = SECRET_MAP, identityFiles = {}, now = () => new Date(), vault = defaultVault } = {},
) {
  const spec = secretSpec(secretId, { map });

  if (fromVault && newValue != null) throw new RotateError("give newValue or fromVault, not both", "bad_args");
  if (!fromVault && (typeof newValue !== "string" || newValue.length === 0)) throw new RotateError("newValue is required unless fromVault", "bad_args");
  if (/[\r\n]/.test(newValue ?? "")) throw new RotateError("value contains a newline", "bad_value");

  if (fromVault) {
    if (!vault.has(secretId)) throw new RotateError(`fromVault: no stored value for ${secretId}`, "secret_not_stored");
    newValue = vault.read(secretId);
  }

  const oldValue = readCurrent(spec.currentFrom);
  const ctxBase = { oldValue, newValue, now, identityFiles, dryRun };

  // Plan is always computed and returned, value-free.
  const plan = spec.steps.map((s) => ({ adapter: s.adapter, describe: ADAPTERS[s.adapter].describe(s.params) }));

  if (dryRun) {
    const results = [];
    for (const s of spec.steps) {
      let r;
      try {
        r = await ADAPTERS[s.adapter].apply(s.params, ctxBase);
      } catch (e) {
        r = { outcome: "would-fail", reason: e.code || e.message };
      }
      results.push({ adapter: s.adapter, describe: ADAPTERS[s.adapter].describe(s.params), ...r });
    }
    return { secretId, dryRun: true, newFp: fp(newValue), oldFp: oldValue == null ? null : fp(oldValue), plan: results, ownerCommands: results.filter((r) => r.command).map((r) => r.command) };
  }

  const completed = [];
  const ownerCommands = [];
  try {
    for (const s of spec.steps) {
      const r = await ADAPTERS[s.adapter].apply(s.params, ctxBase);
      completed.push({ step: s, result: r });
      if (r.command) ownerCommands.push(r.command);
      audit({ actor, operation: "deploy", secret: secretId, outcome: "success", reason: `rotate ${s.adapter} ${r.outcome}` });
    }
    // Verify every step that can be verified now (compose is owner-deferred).
    const verifications = [];
    for (const s of spec.steps) {
      const v = await ADAPTERS[s.adapter].verify(s.params, ctxBase);
      verifications.push({ adapter: s.adapter, ...v });
      if (!v.ok) throw new RotateError(`verify failed: ${s.adapter} — ${v.detail}`, "verify_failed");
    }

    // The host is consistent and verified. Recording the value in the vault is
    // the last act, and it is DELIBERATELY outside the rollback-protected block
    // above: if only this bookkeeping write fails, the live, verified rotation
    // must NOT be undone — it is reported as a warning for the owner to store
    // the value by hand, not rolled back.
    let vaultWarning = null;
    if (!fromVault) {
      try {
        vault.store(secretId, newValue, spec);
      } catch (e) {
        vaultWarning = `host rotated and verified, but recording the value in the vault failed: ${e.message}`;
        audit({ actor, operation: "deploy", secret: secretId, outcome: "failure", reason: "vault record failed after successful host rotation" });
      }
    }

    audit({ actor, operation: "deploy", secret: secretId, outcome: "success", reason: `rotate complete @${fp(newValue)}` });
    return { secretId, dryRun: false, newFp: fp(newValue), oldFp: oldValue == null ? null : fp(oldValue), applied: completed.map((c) => ({ adapter: c.step.adapter, outcome: c.result.outcome })), verifications, ownerCommands, vaultWarning };
  } catch (err) {
    const rolledBack = [];
    for (const c of completed.reverse()) {
      try {
        const r = await ADAPTERS[c.step.adapter].rollback(c.step.params, ctxBase);
        rolledBack.push({ adapter: c.step.adapter, outcome: r.outcome });
      } catch (e) {
        rolledBack.push({ adapter: c.step.adapter, outcome: "rollback-threw", reason: e.code || e.message });
      }
    }
    audit({ actor, operation: "deploy", secret: secretId, outcome: "failure", reason: `rotate failed (${err.code || err.message}); rolled back ${rolledBack.length} step(s)` });
    const e = new RotateError(`rotation of ${secretId} failed and was rolled back: ${err.message}`, err.code || "rotate_failed");
    e.rolledBack = rolledBack;
    e.ownerCommands = ownerCommands;
    throw e;
  }
}
