// Owner-operated private secret store (MVP).
//
// Two disjoint stores, deliberately:
//   values/<name>      one opaque raw value per file, mode 0600, never parsed
//   registry.json      metadata only, mode 0600, NEVER contains a raw value
//
// Not a shell-sourced .env: a generic `source`-able file leaks every secret
// into the environment of any child process, which is the exposure mode this
// store exists to remove. One value per file lets a future launcher read
// exactly the one secret its approved operation needs.
//
// SECRET_STORE_ROOT exists so tests never touch the owner's real store.

import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

export const DIR_MODE = 0o700;
export const FILE_MODE = 0o600;

export const SECRET_TYPES = ["password", "token", "api_key", "connection_string", "other"];
export const SECRET_STATUSES = ["active", "disabled", "expired"];

export function storeRoot() {
  return process.env.SECRET_STORE_ROOT || join(homedir(), ".secrets");
}

export function valuesDir() {
  return join(storeRoot(), "values");
}

export function registryPath() {
  return join(storeRoot(), "registry.json");
}

// Conservative allowlist. Anything outside it is rejected outright rather
// than sanitised — a name that needs rewriting is a name the owner mistyped.
const NAME_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function isValidSecretName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name)) return false;
  // NAME_RE already excludes "/" and "\", but ".." is spellable within it.
  if (name.split(".").some((seg) => seg === "") || name.includes("..")) return false;
  return true;
}

// Defence in depth: even for a name that passed the regex, prove the resolved
// path stays inside values/. Belt and braces, because the cost of being wrong
// here is writing a secret to an attacker-chosen path.
export function valuePathFor(name) {
  if (!isValidSecretName(name)) {
    throw new Error(`invalid secret name: ${JSON.stringify(String(name).slice(0, 40))}`);
  }
  const dir = resolve(valuesDir());
  const full = resolve(dir, name);
  if (full !== join(dir, name) || !full.startsWith(dir + sep)) {
    throw new Error("resolved secret path escapes the value store");
  }
  return full;
}

// A store inside a working tree is one `git add -A` away from committing every
// secret. This is not hypothetical on this host: /home/devuserp is itself a git
// repository, so ~/.secrets lives inside a working tree.
//
// Being inside a repo is therefore tolerated ONLY when git itself confirms the
// path is ignored — asked of `git check-ignore`, not inferred by reading
// .gitignore, so nested ignore files and negation rules are honoured. An
// unignored store inside a repo is refused outright.
export function assertNotInsideRepository(root = storeRoot()) {
  let dir = resolve(root);
  for (;;) {
    if (existsSync(join(dir, ".git"))) {
      const ignored = spawnSync("git", ["-C", dir, "check-ignore", "-q", resolve(root)], {
        stdio: "ignore",
      });
      if (ignored.status === 0) return;
      throw new Error(
        `refusing to use a secret store inside a git repository unless it is gitignored: ` +
        `${resolve(root)} is inside ${dir}. Add it to ${join(dir, ".gitignore")}.`,
      );
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

// Symlink escape: a value path that is (or sits behind) a symlink can redirect
// a 0600 write to somewhere world-readable, or to a file another account owns.
// Check the link itself and the realpath of its parent.
export function assertNoSymlinkEscape(name) {
  const dir = resolve(valuesDir());
  if (existsSync(dir)) {
    if (lstatSync(dir).isSymbolicLink()) {
      throw new Error("refusing to write: the values directory is a symlink");
    }
    if (realpathSync(dir) !== dir) {
      throw new Error("refusing to write: the values directory resolves elsewhere");
    }
  }
  const full = join(dir, name);
  if (existsSync(full) || lstatSync(full, { throwIfNoEntry: false })) {
    if (lstatSync(full).isSymbolicLink()) {
      throw new Error(`refusing to write through a symlink: ${name}`);
    }
  }
}

export function initStore() {
  const root = storeRoot();
  assertNotInsideRepository(root);
  mkdirSync(root, { recursive: true, mode: DIR_MODE });
  mkdirSync(valuesDir(), { recursive: true, mode: DIR_MODE });
  // mkdir's mode is masked by umask; restate it unconditionally.
  chmodSync(root, DIR_MODE);
  chmodSync(valuesDir(), DIR_MODE);
  if (!existsSync(registryPath())) writeRegistry([]);
  return root;
}

function writePrivateFile(path, contents) {
  // openSync + chmod rather than writeFileSync({mode}): the mode argument is
  // only honoured on creation and is masked by umask, so an existing file
  // could silently keep looser permissions.
  const fd = openSync(path, "w", FILE_MODE);
  try {
    writeSync(fd, contents);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, FILE_MODE);
}

export function readRegistry() {
  const p = registryPath();
  if (!existsSync(p)) return [];
  const parsed = JSON.parse(readFileSync(p, "utf8"));
  return Array.isArray(parsed?.secrets) ? parsed.secrets : [];
}

// Single choke point for registry writes. Every entry is rebuilt field by
// field from an allowlist, so a raw value cannot reach disk even if a caller
// passes one through by mistake.
export function writeRegistry(secrets) {
  const clean = secrets.map(toMetadata);
  writePrivateFile(
    registryPath(),
    JSON.stringify({ schema: 1, secrets: clean }, null, 2) + "\n",
  );
  return clean;
}

export function toMetadata(entry) {
  return {
    name: entry.name,
    type: entry.type,
    purpose: entry.purpose,
    consumer: entry.consumer,
    owner: entry.owner,
    created: entry.created,
    updated: entry.updated ?? entry.created,
    expiry: entry.expiry ?? null,
    status: entry.status,
    path: entry.path,
  };
}

function validateMeta(meta) {
  if (!isValidSecretName(meta.name)) throw new Error(`invalid secret name`);
  if (!SECRET_TYPES.includes(meta.type)) throw new Error(`invalid type: must be one of ${SECRET_TYPES.join(", ")}`);
  if (!meta.purpose || String(meta.purpose).trim() === "") throw new Error("purpose is required");
  if (!meta.consumer || String(meta.consumer).trim() === "") throw new Error("consumer is required");
  if (meta.expiry != null && !/^\d{4}-\d{2}-\d{2}$/.test(meta.expiry)) {
    throw new Error("expiry must be YYYY-MM-DD or null");
  }
  if (meta.status && !SECRET_STATUSES.includes(meta.status)) throw new Error("invalid status");
}

export function addSecret(meta, rawValue, { now = new Date() } = {}) {
  initStore();
  validateMeta(meta);
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    throw new Error("refusing to store an empty value");
  }
  const registry = readRegistry();
  if (registry.some((s) => s.name === meta.name)) {
    throw new Error(`secret already exists: ${meta.name} (use replace)`);
  }
  const path = valuePathFor(meta.name);
  assertNoSymlinkEscape(meta.name);
  writePrivateFile(path, rawValue);
  const entry = toMetadata({
    ...meta,
    created: now.toISOString().slice(0, 10),
    updated: now.toISOString(),
    status: "active",
    path,
  });
  writeRegistry([...registry, entry]);
  return entry;
}

export function replaceSecret(name, rawValue, { now = new Date() } = {}) {
  initStore();
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    throw new Error("refusing to store an empty value");
  }
  const registry = readRegistry();
  const entry = registry.find((s) => s.name === name);
  if (!entry) throw new Error(`no such secret: ${name}`);
  assertNoSymlinkEscape(name);
  writePrivateFile(valuePathFor(name), rawValue);
  entry.updated = now.toISOString();
  writeRegistry(registry);
  return entry;
}

// Metadata-only revocation. Deliberately does NOT call the provider — this
// MVP has no rotation authority. Disabling marks the secret unusable to the
// launcher contract and flags it in /ops; revoking it at the provider stays
// a manual owner action.
export function disableSecret(name, { now = new Date() } = {}) {
  initStore();
  const registry = readRegistry();
  const entry = registry.find((s) => s.name === name);
  if (!entry) throw new Error(`no such secret: ${name}`);
  entry.status = "disabled";
  entry.updated = now.toISOString();
  writeRegistry(registry);
  return entry;
}

export function listSecrets({ now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  return readRegistry().map((s) => ({
    ...toMetadata(s),
    status: s.status === "active" && s.expiry && s.expiry < today ? "expired" : s.status,
  }));
}

// Read a raw value. The ONLY function that returns secret material. No CLI
// verb and no /ops route calls it; it exists as the seam a future fixed
// launcher will use, and it is unit-tested in isolation.
export function readSecretValue(name) {
  const entry = readRegistry().find((s) => s.name === name);
  if (!entry) throw new Error(`no such secret: ${name}`);
  if (entry.status !== "active") throw new Error(`secret is not active: ${name}`);
  return readFileSync(valuePathFor(name), "utf8");
}

// Metadata-only projection for the read-only /ops page. Same shape as the
// registry minus `path`, because the filesystem layout is not the browser's
// business.
export function opsProjection({ now = new Date() } = {}) {
  return {
    schema: 1,
    generated_at: now.toISOString(),
    secrets: listSecrets({ now }).map(({ path, ...rest }) => rest),
  };
}

export function auditModes() {
  const problems = [];
  const check = (p, want) => {
    if (!existsSync(p)) return;
    const mode = statSync(p).mode & 0o777;
    if (mode !== want) problems.push({ path: p, mode: mode.toString(8), expected: want.toString(8) });
  };
  check(storeRoot(), DIR_MODE);
  check(valuesDir(), DIR_MODE);
  check(registryPath(), FILE_MODE);
  if (existsSync(valuesDir())) {
    for (const f of readdirSync(valuesDir())) check(join(valuesDir(), f), FILE_MODE);
  }
  return problems;
}

export function removeSecretForTest(name) {
  const p = valuePathFor(name);
  if (existsSync(p)) rmSync(p);
  writeRegistry(readRegistry().filter((s) => s.name !== name));
}
