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
// What this file deliberately does NOT do: restart a container or a systemd
// unit. Both are owner actions on these hosts (the harness denies them to
// agents), so restart-compose and restart-systemd steps return the exact
// command for the owner and change nothing. A pm2 restart under the same
// account IS performed, because the agent may.
//
// Every secret names the ONE host it rotates on (`host`). rotate() refuses on
// any other host before it reads the vault or touches anything: the same map
// is deployed to srv and to mn-home, and a step aimed at a consumer that lives
// elsewhere must fail loudly, not write a stale file or a live service across
// a bridge.

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
import { hostname as osHostname } from "node:os";

import { addSecret, isValidSecretName, listSecrets, readSecretValue, removeSecret, replaceSecret, storeRoot } from "./secretstore.mjs";
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

// A value created inside this process for a secret WE own (a database role, an
// admin password), so nobody has to type, paste or see it: it goes from
// randomBytes to the targets and the vault and nowhere else. base64url is
// inside the value allowlist below and needs no quoting in a .env or a DSN.
// A provider-issued key (Takbull, GitHub, Google...) cannot be generated here;
// only a map entry that declares `generate` accepts it.
export const GENERATE_MIN_BYTES = 16;
export const GENERATE_MAX_BYTES = 64;
export function generateValue(bytes) {
  return randomBytes(bytes).toString("base64url");
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
// Owner commands are pasted into a shell, so every word in them is a plain
// token: no spaces, quotes, `$`, `;` or a leading dash.
const PLAIN_PATH_RE = /^\/[A-Za-z0-9._/-]+$/;
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const UNIT_RE = /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$/;
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/;

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

// The password inside the one DSN for `user`, decoded. Throws like
// substituteDsnPassword when the DSN is absent or appears more than once.
export function dsnPassword(contents, user) {
  const m = [...String(contents).matchAll(new RegExp(`://${user}:([^@\\s"']*)@`, "g"))];
  if (m.length === 0) throw new RotateError(`no DSN for user "${user}" found`, "dsn_not_found");
  if (m.length > 1) throw new RotateError(`DSN for user "${user}" appears ${m.length} times; refusing to guess`, "dsn_ambiguous");
  try {
    return decodeURIComponent(m[0][1]);
  } catch {
    return m[0][1];
  }
}

// The value of the ONE `VAR=` line, unquoted; null when it is absent or
// assigned more than once (compose takes the last, a reader the first).
function readAssignment(contents, envVar) {
  const lines = contents.split("\n").filter((l) => l.startsWith(`${envVar}=`));
  if (lines.length !== 1) return null;
  let v = lines[0].slice(envVar.length + 1).replace(/\r$/, "");
  if (v.length > 1 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
  return v;
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
    return execFileSync(file, args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 });
  },
};

function psql(container, superuser, sql, { db = "postgres" } = {}) {
  // SQL on stdin, never argv. ON_ERROR_STOP so a failed ALTER is a non-zero
  // exit, not a silent success. Statement logging is off for this session so
  // a failed ALTER never writes a SCRAM verifier to the server log, and a
  // failure is reported by exit status only: psql echoes the failing
  // statement on stderr, and error text travels to the journal and the app.
  const quiet = "SET log_min_error_statement = panic;\nSET log_statement = 'none';\n";
  try {
    return execHooks.run("docker", ["exec", "-i", container, "psql", "-U", superuser, "-d", db, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: quiet + sql });
  } catch (e) {
    throw new RotateError(`psql failed in container ${container} (exit ${e.status ?? "?"})`, "psql_failed");
  }
}

function roleHolds(p, value) {
  const stored = psql(p.container, p.superuser, `select rolpassword from pg_authid where rolname='${p.role}';\n`).trim();
  return scramMatches(stored, value);
}

async function httpJson(url, { method = "GET", token = null, body = null } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body === null ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty or non-json body */
  }
  return { status: res.status, ok: res.ok, json };
}

// Windmill variable holding a DSN: read the live value, splice only the
// password in, write it back. Values stay in this process.
async function windmillGet(p, token) {
  const r = await httpJson(`${p.base_url}/api/w/${p.workspace}/variables/get_value/${p.path}`, { token });
  if (!r.ok) throw new RotateError(`windmill read failed (${r.status})`, "windmill_failed");
  return typeof r.json === "string" ? r.json : String(r.json?.value ?? "");
}

async function windmillSplice(p, password) {
  const token = readFileSync(p.auth_file, "utf8").trim();
  const current = await windmillGet(p, token);
  const value = substituteDsnPassword(current, p.user, password);
  if (value === current) return "unchanged";
  const r = await httpJson(`${p.base_url}/api/w/${p.workspace}/variables/update/${p.path}`, { method: "POST", token, body: { value } });
  if (!r.ok) throw new RotateError(`windmill update failed (${r.status})`, "windmill_failed");
  return "applied";
}

async function windmillHolds(p, value) {
  return dsnPassword(await windmillGet(p, readFileSync(p.auth_file, "utf8").trim()), p.user) === value;
}

// Directus steps whose password PATCH got no answer (timeout or network
// error): Directus may still commit it after any check we make now.
const directusUnanswered = new WeakSet();

// Log in and straight out again; true when the password works.
async function directusCanLogin(p, password) {
  const login = await httpJson(`${p.base_url}/auth/login`, { method: "POST", body: { email: p.email, password } });
  const token = login.json?.data?.access_token;
  if (token) await httpJson(`${p.base_url}/auth/logout`, { method: "POST", body: { refresh_token: login.json?.data?.refresh_token } });
  return Boolean(token);
}

function composeCommand(p) {
  if (!p.project) return `cd ${p.dir} && docker compose up -d --no-build`;
  // mn-home layout: the project name is not the directory name, and the
  // compose and env files are root-only, so everything is named and run as root.
  const words = ["sudo docker compose -p", p.project, "-f", p.file, "--project-directory", p.dir];
  if (p.env_file) words.push("--env-file", p.env_file);
  return [...words, "up -d --no-build"].join(" ");
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
    // ALTER back to the old value is harmless when the forward ALTER did not
    // land, so a step that failed mid-way is rolled back too (it may have).
    rollbackIfFailed: true,
    holds: async (p, ctx, value) => roleHolds(p, value),
    async verify(p, ctx) {
      return { ok: roleHolds(p, ctx.newValue), detail: "role verifier recomputed from salt" };
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
    holds: async (p, ctx, value) => readAssignment(readFileSync(p.path, "utf8"), p.var) === value,
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
    holds: async (p, ctx, value) => dsnPassword(readAssignment(readFileSync(p.path, "utf8"), p.var) ?? "", p.user) === value,
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
    holds: async (p, ctx, value) => dsnPassword(readFileSync(p.path, "utf8"), p.user) === value,
    async verify(p, ctx) {
      return { ok: readFileSync(p.path, "utf8").includes(encodeURIComponent(ctx.newValue)), detail: "DSN file carries the new password" };
    },
  },

  "windmill-variable": {
    // The stored value is a DSN. Only its password component is rewritten, in
    // whatever DSN the variable holds now: host, port and database differ per
    // host (mn-home's Windmill workers do not share n8n-postgres's network),
    // and a map entry must not guess them. No DSN literal appears here, so
    // there is nothing for the repo's secret scanner to object to either.
    validate(p) {
      if (!/^[a-zA-Z0-9_-]+$/.test(p.workspace || "")) throw new RotateError("windmill.workspace malformed", "bad_params");
      if (!/^[a-zA-Z0-9_/.-]+$/.test(p.path || "")) throw new RotateError("windmill.path malformed", "bad_params");
      if (!/^[A-Za-z0-9_]+$/.test(p.user || "")) throw new RotateError("windmill.user malformed", "bad_params");
      if (typeof p.base_url !== "string" || !/^https?:\/\/[A-Za-z0-9.:-]+$/.test(p.base_url)) throw new RotateError("windmill.base_url malformed", "bad_params");
      if (typeof p.auth_file !== "string" || !p.auth_file.startsWith("/")) throw new RotateError("windmill.auth_file must be absolute", "bad_params");
    },
    describe: (p) => `windmill-variable: ${p.workspace}:${p.path} (password of DSN user ${p.user})`,
    async apply(p, ctx) {
      if (ctx.dryRun) {
        if (!existsSync(p.auth_file)) throw new RotateError(`${p.auth_file}: windmill token file missing`, "missing_auth_file");
        return { outcome: "would-apply" };
      }
      return { outcome: await windmillSplice(p, ctx.newValue) };
    },
    async rollback(p, ctx) {
      if (ctx.oldValue == null) return { outcome: "skipped-no-old" };
      await windmillSplice(p, ctx.oldValue);
      return { outcome: "rolled-back" };
    },
    // The update may land although the reply is an error; splicing the old
    // password back is a no-op when it is still there.
    rollbackIfFailed: true,
    holds: async (p, ctx, value) => windmillHolds(p, value),
    async verify(p, ctx) {
      return { ok: await windmillHolds(p, ctx.newValue), detail: "windmill variable carries the new password" };
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
      directusUnanswered.delete(p);
      // Authenticate as the user with whichever password it currently has, then
      // set the new one on itself. Both passwords travel in the JSON body, never
      // argv. If old == new the login with new still succeeds (idempotent).
      const login = await httpJson(`${p.base_url}/auth/login`, { method: "POST", body: { email: p.email, password: ctx.oldValue ?? ctx.newValue } });
      const token = login.json?.data?.access_token;
      if (!token) throw new RotateError(`directus login failed (${login.status})`, "directus_login_failed");
      let patch;
      try {
        patch = await httpJson(`${p.base_url}/users/me`, { method: "PATCH", token, body: { password: ctx.newValue } });
      } catch {
        directusUnanswered.add(p);
        throw new RotateError("directus password change got no answer", "directus_patch_unanswered");
      }
      if (!patch.ok) throw new RotateError(`directus password change failed (${patch.status})`, "directus_patch_failed");
      return { outcome: "applied" };
    },
    async rollback(p, ctx) {
      if (ctx.oldValue == null) return { outcome: "skipped-no-old" };
      const login = await httpJson(`${p.base_url}/auth/login`, { method: "POST", body: { email: p.email, password: ctx.newValue } });
      const token = login.json?.data?.access_token;
      // The new password does not work: a step that failed mid-way never
      // landed. The preflight proved the old one worked; if it still does,
      // nothing changed. Unless the PATCH got no answer: it may land later.
      if (!token) {
        if (!(await directusCanLogin(p, ctx.oldValue))) return { outcome: "rollback-failed-login" };
        return { outcome: directusUnanswered.has(p) ? "rollback-unconfirmed" : "rolled-back" };
      }
      const patch = await httpJson(`${p.base_url}/users/me`, { method: "PATCH", token, body: { password: ctx.oldValue } });
      return { outcome: patch.ok ? "rolled-back" : "rollback-failed-patch" };
    },
    // The PATCH may land although its reply is an error or times out.
    rollbackIfFailed: true,
    holds: async (p, ctx, value) => directusCanLogin(p, value),
    async verify(p, ctx) {
      return { ok: await directusCanLogin(p, ctx.newValue), detail: "logged in with the new password" };
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
      if (typeof p.dir !== "string" || !PLAIN_PATH_RE.test(p.dir)) throw new RotateError("compose.dir must be an absolute plain path", "bad_params");
      if (p.project === undefined) {
        if (p.file !== undefined || p.env_file !== undefined) throw new RotateError("compose.file/env_file need compose.project", "bad_params");
        return;
      }
      if (typeof p.project !== "string" || !PROJECT_RE.test(p.project)) throw new RotateError("compose.project malformed", "bad_params");
      if (typeof p.file !== "string" || !PLAIN_PATH_RE.test(p.file)) throw new RotateError("compose.file must be an absolute plain path", "bad_params");
      if (p.env_file !== undefined && !PLAIN_PATH_RE.test(p.env_file)) throw new RotateError("compose.env_file must be an absolute plain path", "bad_params");
    },
    describe: (p) => `restart (owner): ${composeCommand(p)}`,
    async apply(p) {
      return { outcome: "owner-command", command: `! ${composeCommand(p)}` };
    },
    async rollback(p) {
      return { outcome: "owner-command", command: `! ${composeCommand(p)}` };
    },
    async verify() {
      return { ok: true, detail: "deferred to owner (not verified here)" };
    },
  },

  // Same contract for a systemd service that reads a rotated file at start
  // (mn-home's Itaruta is a unit, not pm2): the command for the owner, never
  // a systemctl call from here.
  "restart-systemd": {
    validate(p) {
      if (!UNIT_RE.test(p.unit || "")) throw new RotateError("systemd.unit malformed", "bad_params");
    },
    describe: (p) => `restart (owner): sudo systemctl restart ${p.unit}`,
    async apply(p) {
      return { outcome: "owner-command", command: `! sudo systemctl restart ${p.unit}` };
    },
    async rollback(p) {
      return { outcome: "owner-command", command: `! sudo systemctl restart ${p.unit}` };
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

const MNHOME = "mn-home";
const SRV = "srv1518109";
const ITARUTA_ENV = "/data/services/itaruta/credentials/transcriptor-api.env";

// mn-home paths, owners and modes below were checked on mn-home on 2026-10-27
// (names and metadata only). The n8n role password lives in TWO clusters
// there: n8n-postgres (n8n, Windmill reporting) and yafutsu-db (Itaruta),
// which W4 split off with the same role and password.
export const SECRET_MAP = Object.freeze({
  n8n_db_password: {
    generate: { bytes: 32 },
    display: "סיסמת מסד הנתונים של n8n",
    vault_type: "password",
    host: MNHOME,
    currentFrom: { kind: "env", path: "/data/services/n8n/.env", var: "POSTGRES_PASSWORD" },
    steps: [
      { adapter: "pg-role", params: { container: "n8n-postgres", role: "n8n", superuser: "n8n" } },
      { adapter: "pg-role", params: { container: "yafutsu-db", role: "n8n", superuser: "n8n" } },
      { adapter: "env-file", params: { path: "/data/services/n8n/.env", var: "POSTGRES_PASSWORD", owner: "root", group: "root", mode: "0600" } },
      { adapter: "env-file", params: { path: "/data/services/itaruta/db/.env", var: "POSTGRES_PASSWORD", owner: "root", group: "root", mode: "0600" } },
      { adapter: "dsn-env", params: { path: ITARUTA_ENV, var: "DATABASE_URL", user: "n8n", owner: "root", group: "root", mode: "0400" } },
      { adapter: "windmill-variable", params: { workspace: "admins", path: "f/reporting/n8n_db", user: "n8n", base_url: "http://127.0.0.1:8000", auth_file: "/etc/crm-secrets/windmill-rotate.token" } },
      { adapter: "restart-systemd", params: { unit: "transcriptor-api" } },
      // n8n reads the password at start. yafutsu-db is NOT recreated: postgres
      // ignores its init variable once initialised, and the ALTER above already
      // changed the live role; a recreate would only restart Itaruta's DB.
      { adapter: "restart-compose", params: { dir: "/data/services/n8n", project: "n8n", file: "/data/services/n8n/docker-compose.yml", env_file: "/data/services/n8n/.env" } },
    ],
  },
  directus_db_password: {
    generate: { bytes: 32 },
    display: "סיסמת מסד הנתונים של Directus (CRM)",
    vault_type: "password",
    host: MNHOME,
    currentFrom: { kind: "env", path: "/data/services/hycrm/.env", var: "POSTGRES_PASSWORD" },
    steps: [
      { adapter: "pg-role", params: { container: "hycrm-directus-db", role: "hycrm", superuser: "hycrm" } },
      { adapter: "env-file", params: { path: "/data/services/hycrm/.env", var: "POSTGRES_PASSWORD", owner: "root", group: "root", mode: "0600" } },
      { adapter: "restart-compose", params: { dir: "/data/services/hycrm", project: "crm-stack", file: "/data/services/hycrm/docker-compose.yml", env_file: "/data/services/hycrm/.env" } },
    ],
  },
  // Itaruta logs in to the CRM as this same admin (its DIRECTUS_EMAIL is this
  // account, checked value-blind), so its copy rotates in the same step list.
  directus_admin_password: {
    generate: { bytes: 32 },
    display: "סיסמת מנהל Directus (CRM)",
    vault_type: "password",
    host: MNHOME,
    currentFrom: { kind: "env", path: "/data/services/hycrm/.env", var: "DIRECTUS_ADMIN_PASSWORD" },
    steps: [
      { adapter: "directus-user", params: { base_url: "http://127.0.0.1:18055", email: "admin@crm.coriathost.cloud" } },
      { adapter: "env-file", params: { path: "/data/services/hycrm/.env", var: "DIRECTUS_ADMIN_PASSWORD", owner: "root", group: "root", mode: "0600" } },
      { adapter: "env-file", params: { path: ITARUTA_ENV, var: "DIRECTUS_PASSWORD", owner: "root", group: "root", mode: "0400" } },
      { adapter: "restart-systemd", params: { unit: "transcriptor-api" } },
    ],
  },
  // The one consumer is devuserp's Claude sessions on srv: ~/.local/bin/n8n-mcp
  // reads this file and starts supergateway. Running sessions keep the old
  // process until they restart; new sessions pick up the new token. The old
  // token is revoked by the owner in n8n only after this reports applied.
  // Stays on srv until an n8n-mcp wrapper exists on mn-home.
  n8n_mcp_token: {
    display: "טוקן MCP של n8n",
    vault_type: "token",
    host: SRV,
    currentFrom: { kind: "env", path: "/home/devuserp/.config/merkaz/n8n-mcp.env", var: "N8N_MCP_TOKEN" },
    steps: [
      { adapter: "env-file", params: { path: "/home/devuserp/.config/merkaz/n8n-mcp.env", var: "N8N_MCP_TOKEN", owner: "devuserp", group: "devuserp", mode: "0600" } },
    ],
  },
});

function stagedNameFor(secretId, at, suffix) {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z").toLowerCase();
  return `${secretId}.gen-${stamp}-${suffix}`;
}

export function secretSpec(secretId, { map = SECRET_MAP } = {}) {
  const spec = Object.hasOwn(map, secretId) ? map[secretId] : null;
  if (!spec) throw new RotateError(`no such secret in the rotation map: ${secretId}`, "unknown_secret");
  if (!HOST_RE.test(spec.host || "")) throw new RotateError(`${secretId}: the map entry names no valid host`, "bad_spec");
  if (spec.generate !== undefined) {
    const b = spec.generate?.bytes;
    if (!Number.isInteger(b) || b < GENERATE_MIN_BYTES || b > GENERATE_MAX_BYTES) {
      throw new RotateError(`${secretId}: generate.bytes must be an integer ${GENERATE_MIN_BYTES}-${GENERATE_MAX_BYTES}`, "bad_spec");
    }
    // Only a password we set ourselves; a provider-issued key is never one.
    if (spec.vault_type !== "password") throw new RotateError(`${secretId}: generate is allowed only for vault_type "password"`, "bad_spec");
    // Both names the run writes must be valid vault names, or every run would
    // fail at staging (before any change) or at recording (after the change).
    if (!isValidSecretName(secretId) || !isValidSecretName(stagedNameFor(secretId, new Date(0), "000000"))) {
      throw new RotateError(`${secretId}: id is not a valid vault name, or too long for a staged one`, "bad_spec");
    }
  }
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
  const v = currentFrom.kind === "env" ? readAssignment(contents, currentFrom.var) : contents.trim();
  return v ? v : null;
}

// Dry-run one step and, where the adapter can tell, check that its target
// holds the old value now: the only state a rollback can restore exactly.
async function checkStep(s, ctxBase) {
  const a = ADAPTERS[s.adapter];
  const r = await a.apply(s.params, { ...ctxBase, dryRun: true });
  if (a.holds && ctxBase.oldValue != null && !(await a.holds(s.params, ctxBase, ctxBase.oldValue))) {
    throw new RotateError(`${a.describe(s.params)}: does not hold the current value`, "old_value_mismatch");
  }
  return r;
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
 *   generate   — created here from randomBytes (only for a map entry that
 *                declares `generate`); never printed, returned or logged.
 *                Staged in the vault under <id>.gen-<stamp>-<rand> before the
 *                first change, recorded under <id> last, then the staged copy
 *                is removed. On any failure the staged copy is kept.
 *
 * On any step failure, completed steps are rolled back in reverse and the error
 * is rethrown. On success, and only when the value did not come from the vault,
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
  // A generated value is staged under its own name BEFORE any target changes,
  // create-only, so it can never be applied without a recoverable copy.
  stage: (name, value, spec) => addSecret({ name, type: spec.vault_type, purpose: `${spec.display} (generated, staged)`, consumer: name, owner: "owner", expiry: null }, value),
  discard: (name) => removeSecret(name, { mustExist: true }),
};

export async function rotate(
  secretId,
  { newValue = null, fromVault = false, generate = false, dryRun = false, actor = "secretrotate", map = SECRET_MAP, identityFiles = {}, now = () => new Date(), vault = defaultVault, hostname = osHostname } = {},
) {
  const spec = secretSpec(secretId, { map });
  const here = hostname();
  if (spec.host !== here) {
    throw new RotateError(`${secretId} rotates on host "${spec.host}", this is "${here}"; refusing, nothing was read or changed`, "wrong_host");
  }

  if (typeof fromVault !== "boolean" || typeof generate !== "boolean") {
    throw new RotateError("fromVault and generate must be booleans", "bad_args");
  }
  if ([newValue != null, fromVault, generate].filter(Boolean).length > 1) {
    throw new RotateError("give exactly one of newValue, fromVault or generate", "bad_args");
  }
  if (!fromVault && !generate && (typeof newValue !== "string" || newValue.length === 0)) {
    throw new RotateError("newValue is required unless fromVault or generate", "bad_args");
  }

  if (generate) {
    if (!spec.generate) {
      throw new RotateError(`${secretId} is issued by its provider and cannot be generated here; refusing, nothing was read or changed`, "not_generatable");
    }
    newValue = generateValue(spec.generate.bytes);
  }

  if (fromVault) {
    if (!vault.has(secretId)) throw new RotateError(`fromVault: no stored value for ${secretId}`, "secret_not_stored");
    newValue = vault.read(secretId);
  }
  // Checked after the vault read, so a browser-saved value gets the same
  // checks. An allowlist, not a denylist: compose interpolates `$`, systemd
  // unescapes backslashes, a quote unbalances an unquoted .env line (compose
  // then rejects the whole file while verify() still passes), and spaces or
  // shell metacharacters break or run code in a reader that sources the file.
  // Covers hex, base64/base64url and JWT values.
  if (typeof newValue !== "string" || newValue.length === 0) throw new RotateError("empty value", "bad_value");
  if (!/^[A-Za-z0-9._~+\/=@%:,^!*-]{1,1024}$/.test(newValue)) {
    throw new RotateError("value has a character outside [A-Za-z0-9._~+/=@%:,^!*-] (or is over 1024 chars); refusing", "bad_value");
  }

  const oldValue = readCurrent(spec.currentFrom);
  if (oldValue == null) {
    // Without the old value no step could be rolled back, and a half-applied
    // role password is an outage. Refuse before step one.
    const where = spec.currentFrom ? `${spec.currentFrom.var ?? "value"} in ${spec.currentFrom.path}` : "no currentFrom";
    throw new RotateError(`${secretId}: current value not readable (${where}); refusing, nothing was changed`, "no_current_value");
  }
  const ctxBase = { oldValue, newValue, now, identityFiles, dryRun };

  // Plan is always computed and returned, value-free.
  const plan = spec.steps.map((s) => ({ adapter: s.adapter, describe: ADAPTERS[s.adapter].describe(s.params) }));

  if (dryRun) {
    const results = [];
    for (const s of spec.steps) {
      let r;
      try {
        r = await checkStep(s, ctxBase);
      } catch (e) {
        r = { outcome: "would-fail", reason: e.code || e.message };
      }
      results.push({ adapter: s.adapter, describe: ADAPTERS[s.adapter].describe(s.params), ...r });
    }
    // A generated value is thrown away after a dry run; its fingerprint would
    // be mistaken for the version an apply will write.
    return { secretId, dryRun: true, generated: generate, newFp: generate ? null : fp(newValue), oldFp: oldValue == null ? null : fp(oldValue), plan: results, ownerCommands: results.filter((r) => r.command).map((r) => r.command) };
  }

  // Preflight: nothing changes unless every step would succeed and every
  // target that can be checked holds the old value.
  for (const s of spec.steps) {
    try {
      await checkStep(s, ctxBase);
    } catch (e) {
      throw new RotateError(`${secretId}: preflight failed at ${ADAPTERS[s.adapter].describe(s.params)} (${e.code || "error"}); nothing was changed`, "preflight_failed");
    }
  }

  // A generated value exists nowhere else, so it is staged in the vault before
  // the first change. If staging fails nothing is changed.
  let stagedName = null;
  if (generate) {
    const name = stagedNameFor(secretId, now(), randomBytes(3).toString("hex"));
    try {
      vault.stage(name, newValue, spec);
    } catch {
      throw new RotateError(`${secretId}: could not stage the generated value in the vault; refusing, nothing was changed`, "stage_failed");
    }
    stagedName = name;
    audit({ actor, operation: "deploy", secret: secretId, outcome: "success", reason: `generated value staged as ${name} @${fp(newValue)}` });
  }

  const completed = [];
  const ownerCommands = [];
  let inFlight = null;
  try {
    for (const s of spec.steps) {
      inFlight = s;
      const r = await ADAPTERS[s.adapter].apply(s.params, ctxBase);
      inFlight = null;
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
      let recorded = false;
      try {
        vault.store(secretId, newValue, spec);
        recorded = true;
      } catch (e) {
        // Only the error code: a store error is not trusted to be value-free.
        const why = typeof e?.code === "string" && /^[A-Za-z0-9_]{1,40}$/.test(e.code) ? e.code : "error";
        vaultWarning = stagedName
          ? `host rotated and verified, but recording the generated value under ${secretId} failed (${why}); it is kept in the vault as ${stagedName}`
          : `host rotated and verified, but recording the value in the vault failed (${why})`;
        audit({ actor, operation: "deploy", secret: secretId, outcome: "failure", reason: "vault record failed after successful host rotation" });
      }
      if (recorded && stagedName) {
        try {
          vault.discard(stagedName);
        } catch {
          vaultWarning = `rotation complete; the staged copy ${stagedName} could not be removed from the vault (it holds the current value; delete it with secretsctl delete)`;
        }
      }
    }

    audit({ actor, operation: "deploy", secret: secretId, outcome: "success", reason: `rotate complete @${fp(newValue)}${generate ? " (generated)" : ""}` });
    return { secretId, dryRun: false, generated: generate, newFp: fp(newValue), oldFp: oldValue == null ? null : fp(oldValue), applied: completed.map((c) => ({ adapter: c.step.adapter, outcome: c.result.outcome })), verifications, ownerCommands, vaultWarning };
  } catch (err) {
    const rolledBack = [];
    const undo = completed.reverse();
    if (inFlight && ADAPTERS[inFlight.adapter].rollbackIfFailed) undo.unshift({ step: inFlight });
    for (const c of undo) {
      try {
        const r = await ADAPTERS[c.step.adapter].rollback(c.step.params, ctxBase);
        rolledBack.push({ adapter: c.step.adapter, outcome: r.outcome });
      } catch (e) {
        rolledBack.push({ adapter: c.step.adapter, outcome: "rollback-threw", reason: e.code || e.message });
      }
    }
    const incomplete = rolledBack.filter((r) => r.outcome !== "rolled-back" && r.outcome !== "owner-command");
    audit({ actor, operation: "deploy", secret: secretId, outcome: "failure", reason: `rotate failed (${err.code || "error"}); rolled back ${rolledBack.length - incomplete.length}/${rolledBack.length} step(s)` });
    // A typed value is still known to the person who typed it; a generated one
    // only to the staged vault record. It is kept on EVERY failure: some
    // rollbacks (a timed-out HTTP or psql write) report success without
    // proof, and a late forward write would leave a target on a value nobody
    // has. A spare encrypted entry costs one `secretsctl delete`.
    const kept = stagedName ? ` The generated value is kept in the vault as ${stagedName}; delete it once the targets are confirmed on the old value.` : "";
    const e = incomplete.length
      ? new RotateError(`rotation of ${secretId} failed (${err.code || "error"}) and the rollback is INCOMPLETE: ${incomplete.map((r) => `${r.adapter}:${r.outcome}`).join(", ")}; check those by hand.${kept}`, "rollback_incomplete")
      : new RotateError(`rotation of ${secretId} failed and was rolled back: ${err.message}${kept}`, err.code || "rotate_failed");
    e.rolledBack = rolledBack;
    e.ownerCommands = ownerCommands;
    e.stagedName = stagedName;
    throw e;
  }
}
