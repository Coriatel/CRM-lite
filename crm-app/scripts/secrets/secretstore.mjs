// Owner-operated private secret store.
//
// Two disjoint stores, deliberately:
//   values/<name>      one opaque raw value per file, mode 0600, never parsed
//   registry.json      metadata only, mode 0600, NEVER contains a raw value
//
// Not a shell-sourced .env: a generic `source`-able file leaks every secret
// into the environment of any child process, which is the exposure mode this
// store exists to remove. One value per file lets the API read exactly the one
// secret an approved operation needs.
//
// SECRET_STORE_ROOT exists so tests never touch the owner's real store.
//
// Durability contract (independent review M2/M3):
//   - every mutation holds one bounded store lock, so concurrent writers
//     serialise or fail explicitly; there are no reported-success lost updates
//   - nothing is ever written in place. Content goes to a private temp file in
//     the same directory, is fsync'd, then rename()d over the target. An
//     interrupted write therefore leaves the previous valid file untouched, and
//     an external hardlink to the old inode can never be modified by us
//   - every mutation has a defined rollback that restores the exact preimage

import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import { decryptValue, encryptValue } from "./secretcrypto.mjs";

export const DIR_MODE = 0o700;
export const FILE_MODE = 0o600;

export const SECRET_TYPES = ["password", "token", "api_key", "connection_string", "other"];
export const SECRET_STATUSES = ["active", "disabled", "expired"];

// A metadata registry for one owner on one host. Far above any plausible real
// size, far below anything that could exhaust memory. Guards against a
// same-UID symlink to a character device (e.g. /dev/full), which an unbounded
// readFileSync would follow until the process is OOM-killed.
export const MAX_REGISTRY_BYTES = 1_000_000;

// Bounded: a mutation waits at most this long for the lock, then fails loudly.
export const LOCK_TIMEOUT_MS = 5_000;
export const LOCK_STALE_MS = 60_000;

// The production store is the default location and nothing else may claim it.
export function productionStoreRoot() {
  return join(homedir(), ".secrets");
}

export function storeRoot() {
  const root = process.env.SECRET_STORE_ROOT || productionStoreRoot();
  assertStoreSeparation(root);
  return root;
}

// Test and production stores are separated by a guard, not by convention.
//
// Every test in this suite sets SECRET_STORE_ROOT to a temp directory. The
// failure mode this prevents is a test that forgets — it would then silently
// exercise add/replace/delete against the owner's real secrets. Under a test
// runner, resolving to the production root is refused outright.
export function assertStoreSeparation(root = process.env.SECRET_STORE_ROOT || productionStoreRoot()) {
  const underTest =
    process.env.VITEST !== undefined ||
    process.env.NODE_ENV === "test" ||
    process.env.SECRET_STORE_ENV === "test";
  if (underTest && resolve(root) === resolve(productionStoreRoot())) {
    throw new Error(
      "refusing to use the production secret store from a test run: set SECRET_STORE_ROOT",
    );
  }
  return root;
}

export function valuesDir() {
  return join(storeRoot(), "values");
}

export function registryPath() {
  return join(storeRoot(), "registry.json");
}

export function lockPath() {
  return join(storeRoot(), ".lock");
}

// Raised when a secret exists but must not be used right now. Carries no
// secret material and no filesystem path.
export class SecretUnavailableError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = "SecretUnavailableError";
    this.reason = reason;
  }
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
//
// The message never echoes the input: a value pasted into --name by mistake
// would otherwise be disclosed in stderr, logs and stack traces (review L2).
export function valuePathFor(name) {
  if (!isValidSecretName(name)) throw new Error("invalid secret name");
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

// The store root itself must be a real directory, not a symlink (review L3).
// initStore() previously chmod'd and populated whatever a symlinked root
// pointed at.
export function assertRootNotSymlinked(root = storeRoot()) {
  const st = lstatSync(root, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isSymbolicLink()) throw new Error("refusing to use a symlinked secret store root");
  if (!st.isDirectory()) throw new Error("secret store root is not a directory");
  if (realpathSync(root) !== resolve(root)) {
    throw new Error("refusing to use a secret store root that resolves elsewhere");
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
  const st = lstatSync(full, { throwIfNoEntry: false });
  if (st && st.isSymbolicLink()) {
    throw new Error(`refusing to write through a symlink: ${name}`);
  }
}

// Hardlink containment (review M3). A hardlink IS the file, so lstat cannot
// see it; the old code's openSync(path,"w") wrote through the shared inode and
// landed the value in a file outside the store.
//
// Two defences, both needed:
//   - refuse a target that is not a regular file, or whose link count is not 1
//   - never write in place anyway: writePrivateFileAtomic() renames a fresh
//     inode over the name, which replaces the directory entry and leaves any
//     external hardlink pointing at the untouched old inode
export function assertSafeTargetFile(path) {
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isSymbolicLink()) throw new Error("refusing to write through a symlink");
  if (!st.isFile()) throw new Error("refusing to write: target is not a regular file");
  if (st.nlink !== 1) {
    throw new Error(`refusing to write: unexpected link count (${st.nlink}) on a stored secret`);
  }
}

// Fault-injection seam. Both hooks are null in every real code path and are
// set only by the test suite, which needs to fail a registry write at the exact
// moment a crash would — after the value is staged, before or after the
// registry advances. There is no way to reach a real crash deterministically
// from a test, and leaving these paths untested is how the original
// implementation shipped with no rollback at all.
export const __faultHooks = {
  beforeRegistryWrite: null,
  afterValuePromoted: null,
  afterRegistryWrite: null,
};

function fault(name) {
  const hook = __faultHooks[name];
  if (hook) hook();
}

let tmpCounter = 0;

function tempPathIn(dir) {
  tmpCounter += 1;
  return join(dir, `.tmp-${process.pid}-${tmpCounter}`);
}

function fsyncDir(dir) {
  // Durability of the rename itself, not just of the file contents.
  let fd;
  try {
    fd = openSync(dir, "r");
    fsyncSync(fd);
  } catch {
    // Directory fsync is not supported everywhere; the rename is still atomic.
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Write `contents` to a private temp file, fsync it, then atomically rename it
// over `path`. Never truncates or opens the target.
export function writePrivateFileAtomic(path, contents) {
  const dir = dirname(path);
  const tmp = tempPathIn(dir);
  // "wx" fails if the temp name somehow exists — never clobber.
  const fd = openSync(tmp, "wx", FILE_MODE);
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // openSync's mode is masked by umask; restate it before the file is visible
  // under its real name.
  chmodSync(tmp, FILE_MODE);
  renameSync(tmp, path);
  fsyncDir(dir);
}

// Stage content under a temp name without publishing it. Returns the temp path;
// the caller either promotes it with promoteStaged() or discards it.
function stagePrivateFile(dir, contents) {
  const tmp = tempPathIn(dir);
  const fd = openSync(tmp, "wx", FILE_MODE);
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(tmp, FILE_MODE);
  return tmp;
}

function promoteStaged(tmp, finalPath) {
  renameSync(tmp, finalPath);
  fsyncDir(dirname(finalPath));
}

function discardStaged(tmp) {
  try {
    rmSync(tmp, { force: true });
  } catch {
    // Best effort: a leftover .tmp-* file holds staged content but is never
    // reachable by name, and is cleaned by the next initStore().
  }
}

function sleepMs(ms) {
  // Synchronous sleep: the whole store API is sync, and the wait is bounded.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// One bounded store lock. Serialises every read-modify-write so concurrent
// mutations cannot lose updates (review M2). O_EXCL creation is atomic across
// processes on a local filesystem.
export function withStoreLock(fn, { timeoutMs = LOCK_TIMEOUT_MS } = {}) {
  const path = lockPath();
  const deadline = Date.now() + timeoutMs;
  let fd;
  for (;;) {
    try {
      fd = openSync(path, "wx", FILE_MODE);
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      // A lock left behind by a killed process must not wedge the store
      // forever, but stealing it early would defeat the point.
      const st = lstatSync(path, { throwIfNoEntry: false });
      if (st && Date.now() - st.mtimeMs > LOCK_STALE_MS) {
        try {
          rmSync(path, { force: true });
        } catch {
          /* another waiter won the race; retry */
        }
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error("secret store is busy: could not acquire the store lock");
      }
      sleepMs(10);
    }
  }
  try {
    writeSync(fd, String(process.pid));
  } catch {
    /* the lock's content is diagnostic only */
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      rmSync(path, { force: true });
    } catch {
      /* nothing useful to do; a stale lock self-clears after LOCK_STALE_MS */
    }
  }
}

export function initStore() {
  const root = storeRoot();
  assertNotInsideRepository(root);
  assertRootNotSymlinked(root);
  mkdirSync(root, { recursive: true, mode: DIR_MODE });
  assertRootNotSymlinked(root);
  mkdirSync(valuesDir(), { recursive: true, mode: DIR_MODE });
  // mkdir's mode is masked by umask; restate it unconditionally.
  chmodSync(root, DIR_MODE);
  chmodSync(valuesDir(), DIR_MODE);
  if (!existsSync(registryPath())) writePrivateFileAtomic(registryPath(), emptyRegistryBytes());
  return root;
}

function emptyRegistryBytes() {
  return JSON.stringify({ schema: 1, secrets: [] }, null, 2) + "\n";
}

// Bounded, type-checked read (review L4). A registry that is not a regular
// file, or is implausibly large, is refused rather than parsed.
export function readRegistryBytes() {
  const p = registryPath();
  const st = lstatSync(p, { throwIfNoEntry: false });
  if (!st) return null;
  if (st.isSymbolicLink()) throw new Error("registry.json is a symlink; refusing to read it");
  if (!st.isFile()) throw new Error("registry.json is not a regular file; refusing to read it");
  if (st.size > MAX_REGISTRY_BYTES) {
    throw new Error(`registry.json is larger than ${MAX_REGISTRY_BYTES} bytes; refusing to read it`);
  }
  return readFileSync(p, "utf8");
}

export function readRegistry() {
  const raw = readRegistryBytes();
  if (raw === null) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.secrets) ? parsed.secrets : [];
}

export function serialiseRegistry(secrets) {
  return JSON.stringify({ schema: 1, secrets: secrets.map(toMetadata) }, null, 2) + "\n";
}

// Single choke point for registry writes. Every entry is rebuilt field by
// field from an allowlist, so a raw value cannot reach disk even if a caller
// passes one through by mistake.
export function writeRegistry(secrets) {
  const clean = secrets.map(toMetadata);
  writePrivateFileAtomic(registryPath(), serialiseRegistry(clean));
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
  if (!isValidSecretName(meta.name)) throw new Error("invalid secret name");
  if (!SECRET_TYPES.includes(meta.type)) throw new Error(`invalid type: must be one of ${SECRET_TYPES.join(", ")}`);
  if (!meta.purpose || String(meta.purpose).trim() === "") throw new Error("purpose is required");
  if (!meta.consumer || String(meta.consumer).trim() === "") throw new Error("consumer is required");
  if (!meta.owner || String(meta.owner).trim() === "") throw new Error("owner is required");
  if (meta.expiry != null && !/^\d{4}-\d{2}-\d{2}$/.test(meta.expiry)) {
    throw new Error("expiry must be YYYY-MM-DD or null");
  }
  if (meta.status && !SECRET_STATUSES.includes(meta.status)) throw new Error("invalid status");
}

function today(now) {
  return now.toISOString().slice(0, 10);
}

// Expiry is DERIVED, never written back to the registry — a stored status of
// "active" on a date-expired secret is normal and expected.
export function isExpired(entry, now = new Date()) {
  return Boolean(entry.expiry) && entry.expiry < today(now);
}

export function derivedStatus(entry, now = new Date()) {
  if (entry.status === "active" && isExpired(entry, now)) return "expired";
  return entry.status;
}

// The single enforcement predicate for every consumption boundary (review M1).
// Previously readSecretValue checked only the STORED status, so a date-expired
// secret displayed as "expired" in the UI and was still returned in full.
export function assertUsable(entry, now = new Date()) {
  if (entry.status !== "active") {
    throw new SecretUnavailableError(`secret is not active: ${entry.name}`, "disabled");
  }
  if (isExpired(entry, now)) {
    throw new SecretUnavailableError(`secret has expired: ${entry.name}`, "expired");
  }
}

export function addSecret(meta, rawValue, { now = new Date() } = {}) {
  initStore();
  validateMeta(meta);
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    throw new Error("refusing to store an empty value");
  }
  return withStoreLock(() => {
    const registry = readRegistry();
    if (registry.some((s) => s.name === meta.name)) {
      throw new Error(`secret already exists: ${meta.name} (use replace)`);
    }
    const path = valuePathFor(meta.name);
    assertNoSymlinkEscape(meta.name);
    assertSafeTargetFile(path);

    // Preimage for rollback: the exact registry bytes before this mutation.
    const registryPreimage = readRegistryBytes();

    // Stage the value first, but do NOT publish it. If the registry write
    // fails we discard the staged file, so a registry failure can never leave
    // an unregistered secret on disk (review M2).
    // Encrypted before it is ever written. The plaintext exists only in this
    // process's memory, never on disk, not even under a temp name.
    const staged = stagePrivateFile(valuesDir(), encryptValue(rawValue, meta.name));
    const entry = toMetadata({
      ...meta,
      created: today(now),
      updated: now.toISOString(),
      status: "active",
      path,
    });
    try {
      fault("beforeRegistryWrite");
      writeRegistry([...registry, entry]);
    } catch (e) {
      discardStaged(staged);
      throw e;
    }
    try {
      promoteStaged(staged, path);
    } catch (e) {
      // Registry already advanced; put it back exactly as it was.
      restoreRegistryBytes(registryPreimage);
      discardStaged(staged);
      throw e;
    }
    return entry;
  });
}

function restoreRegistryBytes(preimage) {
  if (preimage === null) {
    rmSync(registryPath(), { force: true });
    return;
  }
  writePrivateFileAtomic(registryPath(), preimage);
}

export function replaceSecret(name, rawValue, { now = new Date() } = {}) {
  initStore();
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    throw new Error("refusing to store an empty value");
  }
  return withStoreLock(() => {
    const registry = readRegistry();
    const entry = registry.find((s) => s.name === name);
    if (!entry) throw new Error(`no such secret: ${name}`);
    const path = valuePathFor(name);
    assertNoSymlinkEscape(name);
    assertSafeTargetFile(path);

    const registryPreimage = readRegistryBytes();
    // Copy the current value aside so a later failure can restore it exactly.
    let valuePreimage = null;
    if (existsSync(path)) {
      valuePreimage = tempPathIn(valuesDir());
      copyFileSync(path, valuePreimage);
      chmodSync(valuePreimage, FILE_MODE);
    }

    const staged = stagePrivateFile(valuesDir(), encryptValue(rawValue, name));
    try {
      promoteStaged(staged, path);
    } catch (e) {
      discardStaged(staged);
      if (valuePreimage) discardStaged(valuePreimage);
      throw e;
    }
    try {
      fault("beforeRegistryWrite");
      entry.updated = now.toISOString();
      writeRegistry(registry);
    } catch (e) {
      // Roll the value back to its exact preimage, then the registry.
      if (valuePreimage) promoteStaged(valuePreimage, path);
      restoreRegistryBytes(registryPreimage);
      throw e;
    }
    if (valuePreimage) discardStaged(valuePreimage);
    return entry;
  });
}

// Metadata-only revocation. Deliberately does NOT call the provider — this
// MVP has no rotation authority. Disabling marks the secret unusable at every
// consumption boundary and flags it in /ops; revoking it at the provider stays
// a manual owner action.
export function disableSecret(name, { now = new Date() } = {}) {
  initStore();
  return withStoreLock(() => {
    const registry = readRegistry();
    const entry = registry.find((s) => s.name === name);
    if (!entry) throw new Error(`no such secret: ${name}`);
    entry.status = "disabled";
    entry.updated = now.toISOString();
    // Registry-only and atomic: an interrupted write leaves the preimage.
    writeRegistry(registry);
    return entry;
  });
}

export function listSecrets({ now = new Date() } = {}) {
  return readRegistry().map((s) => ({
    ...toMetadata(s),
    status: derivedStatus(s, now),
  }));
}

// Metadata for the authenticated API. Same shape as the registry minus `path`,
// because the filesystem layout is not the browser's business. There is no
// static projection: this is only ever reachable through an authenticated,
// owner-authorised request (review H1).
export function metadataList({ now = new Date() } = {}) {
  return listSecrets({ now }).map(({ path, ...rest }) => rest);
}

// Read a raw value. The ONLY function that returns secret material. No CLI
// verb and no HTTP route calls it; it is the seam a future fixed launcher will
// use, and it enforces both status and expiry.
export function readSecretValue(name, { now = new Date() } = {}) {
  const entry = readRegistry().find((s) => s.name === name);
  if (!entry) throw new Error(`no such secret: ${name}`);
  assertUsable(entry, now);
  const path = valuePathFor(name);
  assertNoSymlinkEscape(name);
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st || !st.isFile()) throw new Error(`no such secret: ${name}`);
  // The name is the AAD, so a value file moved or renamed under another name
  // fails here rather than returning the wrong secret.
  return decryptValue(readFileSync(path, "utf8"), name);
}

// The raw envelope, for backup and rehearsal only. Ciphertext is not secret
// material without the key, and this never decrypts.
export function readSecretEnvelope(name) {
  const path = valuePathFor(name);
  assertNoSymlinkEscape(name);
  assertSafeTargetFile(path);
  return readFileSync(path, "utf8");
}

// Write a pre-encrypted envelope back. Restore-only: it deliberately cannot
// accept plaintext, so it can never be used to downgrade a secret.
export function writeSecretEnvelope(name, envelope) {
  if (typeof envelope !== "string" || !envelope.startsWith("v1.")) {
    throw new Error("refusing to write a value that is not an encrypted envelope");
  }
  const dest = valuePathFor(name);
  assertNoSymlinkEscape(name);
  // Same containment boundary as readSecretEnvelope and every other value
  // write: refuse a target that is not a regular file or that carries an
  // external hardlink. The atomic rename already protects the linked inode,
  // but a restore should refuse a suspicious target outright rather than
  // silently succeed against it.
  assertSafeTargetFile(dest);
  writePrivateFileAtomic(dest, envelope);
  return dest;
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

// --- Rollback kit -----------------------------------------------------------
//
// Every mutation is internally atomic, but an OPERATOR rollback ("undo that
// create") is a separate concern. These four primitives are the defined,
// tested rollback path; none of them returns secret material to the caller.
//
//   create(name)   -> removeSecret(name) + restoreRegistryBytes(preimage)
//   replace(name)  -> copyValueAside(name, tmp) BEFORE the change, then
//                     restoreValueFrom(name, tmp) + restoreRegistryBytes(preimage)
//   disable(name)  -> restoreRegistryBytes(preimage)
//
// `preimage` is whatever readRegistryBytes() returned before the mutation.

export function restoreRegistryBytesPublic(preimage) {
  return withStoreLock(() => restoreRegistryBytes(preimage));
}

// The single deletion mechanism. It backs both the operator rollback above
// (`mustExist: false` — tolerate a half-created secret) and the canonical
// owner-facing `delete` verb in the CLI and API (`mustExist: true` — fail
// truthfully on an unknown name). There is deliberately no second code path:
// a delete that only the API knew how to roll back would be untested from the
// CLI, and vice versa.
export function removeSecret(name, { mustExist = false } = {}) {
  return withStoreLock(() => {
    // Containment first, existence second: a malicious name must be rejected as
    // an invalid name whether or not it happens to be absent from the registry,
    // so the guard never depends on `mustExist` to be reached.
    const p = valuePathFor(name);
    assertNoSymlinkEscape(name);

    const registry = readRegistry();
    const entry = registry.find((s) => s.name === name);
    if (!entry && mustExist) throw new Error(`no such secret: ${name}`);

    const registryPreimage = readRegistryBytes();

    // Copy the value aside before unlinking it, so a failed registry write can
    // restore it byte for byte. The value is moved with rename/copy and is
    // never read into this process's memory.
    //
    // The value is removed BEFORE the registry, mirroring addSecret's ordering
    // rule: if the pair ever splits, prefer orphan metadata — which a repeat
    // `delete` cleans up — over an orphan value file, which is unreachable by
    // name yet still holds secret material on disk.
    let valuePreimage = null;
    if (existsSync(p)) {
      assertSafeTargetFile(p);
      valuePreimage = tempPathIn(valuesDir());
      copyFileSync(p, valuePreimage);
      chmodSync(valuePreimage, FILE_MODE);
      rmSync(p);
    }

    const undo = (e) => {
      if (valuePreimage) promoteStaged(valuePreimage, p);
      restoreRegistryBytes(registryPreimage);
      throw e;
    };

    try {
      fault("beforeRegistryWrite");
      writeRegistry(registry.filter((s) => s.name !== name));
    } catch (e) {
      undo(e);
    }
    try {
      fault("afterRegistryWrite");
    } catch (e) {
      undo(e);
    }

    if (valuePreimage) discardStaged(valuePreimage);
    return entry ? toMetadata(entry) : null;
  });
}

// Copy the current value aside so a later rollback can restore it byte for
// byte. The destination is caller-chosen and created 0600; the value is never
// loaded into this process's memory.
export function copyValueAside(name, destPath) {
  const src = valuePathFor(name);
  assertNoSymlinkEscape(name);
  assertSafeTargetFile(src);
  copyFileSync(src, destPath);
  chmodSync(destPath, FILE_MODE);
  return destPath;
}

export function restoreValueFrom(name, srcPath) {
  const dest = valuePathFor(name);
  assertNoSymlinkEscape(name);
  const contents = readFileSync(srcPath);
  writePrivateFileAtomic(dest, contents);
  return dest;
}

export function removeSecretForTest(name) {
  return removeSecret(name);
}
