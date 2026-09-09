// Materialise a stored secret into an environment file a service already reads.
//
// The gap this closes: secretsd is a vault, not a distributor. deploy-targets.json
// has existed since 2026-08-31 describing where the Deepgram key belongs, but
// NOTHING on the host ever read it — no code, no timer, no cron. It was a
// declaration with no engine. This is the engine.
//
// The rule the whole file exists to enforce: a value moves from the store to
// exactly one variable in exactly one allow-listed file, and appears nowhere
// else. Not in argv, not in an error message, not in the audit trail, not in a
// backup that outlives its file's permissions. Every identifier this module
// logs is a name or a version digest, never a value.
//
// Why a closed destination set in code rather than in the JSON: the JSON is
// data, and data is easier to edit than to review. A target that could name any
// path and any variable would let one compromised or careless edit write a
// secret over POSTGRES_PASSWORD, or into a world-readable file. The JSON says
// WHICH declared target to apply; this file says which are permissible at all.
// Adding a destination is a code change with a review, matching the capability
// broker's closed operation set.

import {
  chmodSync,
  chownSync,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";

import { audit } from "./secretaudit.mjs";
import { MAX_REGISTRY_BYTES, readSecretEnvelope, readSecretValue, storeRoot } from "./secretstore.mjs";

// Where the declarations live, alongside the store they draw from.
export const TARGETS_FILE = "deploy-targets.json";
export const STATE_FILE = "deploy-state.json";
export const BACKUP_PREFIX = ".bak-secretdeploy-";
export const KEEP_BACKUPS = 3;

// A variable name, conservatively. Shell-legal, upper snake case, bounded.
export const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

// The closed set. Each destination names the variables that may be written
// there — not just "this file", but "this file, this variable". Writing the
// SMTP password over POSTGRES_PASSWORD is refused by the same check that
// refuses writing it to /etc/shadow.
export const DESTINATIONS = Object.freeze({
  "/etc/ai-secrets/deepgram.env": Object.freeze({ vars: Object.freeze(["DEEPGRAM_API_KEY"]) }),
  "/opt/hoshen-yehuda/crm-stack/.env": Object.freeze({
    vars: Object.freeze(["DIRECTUS_EMAIL_SMTP_PASSWORD"]),
  }),
  // chagim-lead — the Holiday House lead form, first of the Merkaz Neshama
  // public sites. Three variables and no more: LEAD_WA_RECIPIENT is deliberately
  // absent because the canonical WhatsApp path (Directus flow -> Windmill
  // f/crm/notify_new_lead) hardcodes its own recipient and never reads it.
  //
  // Under /etc/ai-secrets and not the unit's home directory: secrets-materialize
  // hardcodes ALLOWED_DIR="/etc/ai-secrets/" and refuses anything else, so a
  // home-directory entry here would be a destination that can never be written.
  // The service reads it as a second EnvironmentFile via group aisecrets.
  "/etc/ai-secrets/chagim-lead.env": Object.freeze({
    vars: Object.freeze([
      "SMTP_PASS_PUBLIC_SITES",
      "DIRECTUS_PUBLIC_SITES_TOKEN",
      "LEAD_EMAIL_TO",
    ]),
  }),
});

export class DeployError extends Error {
  constructor(message, code = "deploy_error") {
    super(message);
    this.name = "DeployError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Identity resolution. Node has no getpwnam, and the alternative — declaring
// numeric ids in the JSON — would silently follow a renumbered account to the
// wrong owner. Names are resolved here and compared as ids.

function lookupId(file, name, kind) {
  const wanted = String(name);
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const parts = line.split(":");
    if (parts[0] === wanted) return Number(parts[2]);
  }
  // `kind` is passed in rather than inferred from the path: the test suite
  // supplies its own passwd/group files, and inferring made every failure
  // report "no such group" regardless of which lookup actually failed.
  throw new DeployError(`no such ${kind}: ${wanted}`, "unknown_identity");
}

export function resolveOwner({ owner, group }, { passwdFile = "/etc/passwd", groupFile = "/etc/group" } = {}) {
  return { uid: lookupId(passwdFile, owner, "user"), gid: lookupId(groupFile, group, "group") };
}

// ---------------------------------------------------------------------------
// Target validation. Every rejection below is a test in secretdeploy.test.mjs;
// none of them are theoretical.

export function validateTarget(target, { destinations = DESTINATIONS } = {}) {
  if (!target || typeof target !== "object") throw new DeployError("target is not an object", "bad_target");

  const id = target.id;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    throw new DeployError("target id is missing or malformed", "bad_target");
  }
  const secret = target.secret;
  if (typeof secret !== "string" || !secret) throw new DeployError(`${id}: no secret named`, "bad_target");

  const path = target.path;
  if (typeof path !== "string" || !isAbsolute(path) || normalize(path) !== path) {
    // normalize() !== path catches "/opt/x/../../etc/shadow" and "/opt//x"
    // before the allowlist is consulted, so a traversal can never be smuggled
    // through a key that would otherwise compare equal after resolution.
    throw new DeployError(`${id}: destination must be an absolute, normalised path`, "bad_destination");
  }
  const dest = Object.prototype.hasOwnProperty.call(destinations, path) ? destinations[path] : null;
  if (!dest) throw new DeployError(`${id}: destination is not allow-listed: ${path}`, "bad_destination");

  const envVar = target.env_var;
  if (typeof envVar !== "string" || !ENV_VAR_PATTERN.test(envVar)) {
    throw new DeployError(`${id}: env_var is missing or malformed`, "bad_variable");
  }
  if (!dest.vars.includes(envVar)) {
    throw new DeployError(`${id}: ${envVar} may not be written to ${path}`, "bad_variable");
  }

  const { owner, group, mode } = target;
  if (typeof owner !== "string" || !owner) throw new DeployError(`${id}: owner is required`, "bad_target");
  if (typeof group !== "string" || !group) throw new DeployError(`${id}: group is required`, "bad_target");
  if (typeof mode !== "string" || !/^0[0-7]{3}$/.test(mode)) {
    throw new DeployError(`${id}: mode must be a four-digit octal string like "0640"`, "bad_target");
  }
  const modeBits = parseInt(mode, 8);
  if (modeBits & 0o007) {
    // A secret-bearing file that any local account can read is not a secret.
    throw new DeployError(`${id}: mode ${mode} grants world access`, "bad_target");
  }

  return { id, secret, path, envVar, owner, group, mode, modeBits };
}

export function targetsPath(root = storeRoot()) {
  return join(root, TARGETS_FILE);
}

export function statePath(root = storeRoot()) {
  return join(root, STATE_FILE);
}

export function readTargets({ root = storeRoot(), destinations = DESTINATIONS } = {}) {
  const p = targetsPath(root);
  if (!existsSync(p)) return [];
  const st = lstatSync(p, { throwIfNoEntry: false });
  if (!st || st.isSymbolicLink() || !st.isFile()) {
    throw new DeployError("deploy-targets.json is not a regular file", "bad_targets_file");
  }
  if (st.size > MAX_REGISTRY_BYTES) throw new DeployError("deploy-targets.json is implausibly large", "bad_targets_file");
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    throw new DeployError("deploy-targets.json is not valid JSON", "bad_targets_file");
  }
  const list = Array.isArray(parsed?.targets) ? parsed.targets : [];
  return list.map((t) => validateTarget(t, { destinations }));
}

// ---------------------------------------------------------------------------
// Version identity. The digest is taken over the stored ENVELOPE — ciphertext,
// which secretstore.mjs already treats as non-secret without the key — so a
// version can be recorded, compared and audited without the plaintext ever
// being hashed, let alone written. It changes when the secret is replaced,
// which is exactly what "version" has to mean here.

export function versionIdFor(secretName, { readEnvelope = readSecretEnvelope } = {}) {
  return createHash("sha256").update(readEnvelope(secretName)).digest("hex").slice(0, 16);
}

export function readState({ root = storeRoot() } = {}) {
  const p = statePath(root);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return parsed && typeof parsed === "object" && parsed.applied ? parsed.applied : {};
  } catch {
    // A corrupt state file must not block a deploy: the destination file is the
    // real source of truth for whether the value is in place, and it is
    // compared directly below. State is an optimisation and an audit aid.
    return {};
  }
}

function writeState(applied, { root = storeRoot() }) {
  const p = statePath(root);
  writePrivateAtomic(p, JSON.stringify({ schema: 1, applied }, null, 1) + "\n", { modeBits: 0o600 });
}

// ---------------------------------------------------------------------------
// The write itself.

function writePrivateAtomic(path, contents, { modeBits, uid = null, gid = null }) {
  const dir = dirname(path);
  const tmp = join(dir, `.tmp-secretdeploy-${process.pid}-${Date.now()}`);
  const fd = openSync(tmp, "wx", modeBits);
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // openSync's mode is masked by umask; restate it, and set ownership, while
  // the file is still invisible under its temporary name. The destination is
  // never observed with the wrong permissions, not even briefly.
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

// Replace exactly one assignment, leaving every other byte of the file alone.
//
// Deliberately line-based rather than parse-and-reserialise: a .env round trip
// through any parser loses comment placement, blank lines, ordering and
// quoting, and this file is read by docker compose, which has its own opinions
// about all four. The only line that may differ afterwards is the one named.
export function substituteAssignment(contents, envVar, value) {
  const prefix = `${envVar}=`;
  const lines = contents.split("\n");
  let seen = 0;
  let quote = "";
  for (const line of lines) {
    if (!line.startsWith(prefix)) continue;
    seen += 1;
    const existing = line.slice(prefix.length).replace(/\r$/, "");
    if (existing.length > 1 && (existing[0] === '"' || existing[0] === "'") && existing[existing.length - 1] === existing[0]) {
      quote = existing[0];
    }
  }
  if (seen > 1) {
    // Ambiguous: compose takes the last, a reader may take the first. Refuse
    // rather than guess which one the service is actually using.
    throw new DeployError(`${envVar} is assigned ${seen} times; refusing to guess which is live`, "ambiguous_key");
  }
  if (/[\r\n]/.test(value)) throw new DeployError("secret value contains a newline; refusing to write it to an env file", "bad_value");
  if (quote && value.includes(quote)) {
    throw new DeployError("secret value contains the quote character used by the existing line", "bad_value");
  }
  if (!quote && (value !== value.trim() || value.includes("#"))) {
    // Unquoted values with surrounding space or a '#' change meaning on the way
    // back in. The value is never printed, so this reports only the shape.
    throw new DeployError("secret value needs quoting but the existing line is unquoted", "bad_value");
  }

  const replacement = `${prefix}${quote}${value}${quote}`;
  if (seen === 0) {
    // Appending is legitimate for a first deploy, but only at the end and only
    // once — never interleaved into someone else's grouping.
    const trailing = lines.length > 0 && lines[lines.length - 1] === "" ? lines.pop() : null;
    lines.push(replacement);
    if (trailing !== null) lines.push(trailing);
    return lines.join("\n");
  }
  return lines
    .map((line) => (line.startsWith(prefix) ? replacement + (line.endsWith("\r") ? "\r" : "") : line))
    .join("\n");
}

function pruneBackups(path, keep = KEEP_BACKUPS) {
  const dir = dirname(path);
  const stem = `${basename(path)}${BACKUP_PREFIX}`;
  const mine = readdirSync(dir)
    .filter((n) => n.startsWith(stem))
    .sort()
    .reverse();
  for (const stale of mine.slice(keep)) {
    try {
      rmSync(join(dir, stale), { force: true });
    } catch {
      // Best effort. A leftover backup is untidy, not unsafe: it carries the
      // permissions of the file it came from.
    }
  }
}

/**
 * Apply one declared target.
 *
 * Returns { id, secret, versionId, outcome } where outcome is:
 *   "unchanged"  the file already holds this exact value — nothing was written,
 *                no backup was taken, and the bytes are untouched
 *   "applied"    the variable was updated; a backup of the previous file sits
 *                beside it
 *   "would-apply" dryRun only
 *
 * Never returns, logs or throws the value.
 */
export function applyTarget(
  id,
  {
    root = storeRoot(),
    destinations = DESTINATIONS,
    actor = "secretdeploy",
    dryRun = false,
    readValue = readSecretValue,
    readEnvelope = readSecretEnvelope,
    identityFiles = {},
    now = () => new Date(),
  } = {},
) {
  const targets = readTargets({ root, destinations });
  const target = targets.find((t) => t.id === id);
  if (!target) throw new DeployError(`no such deploy target: ${id}`, "unknown_target");

  const fail = (reason, code) => {
    audit({ actor, operation: "deploy", secret: target.secret, outcome: "failure", reason: `${id}: ${reason}` });
    throw new DeployError(`${id}: ${reason}`, code);
  };

  // --- the destination must be exactly what was declared, right now ----------
  const st = lstatSync(target.path, { throwIfNoEntry: false });
  if (!st) fail("destination does not exist", "missing_destination");
  if (st.isSymbolicLink()) fail("destination is a symlink", "unsafe_destination");
  if (!st.isFile()) fail("destination is not a regular file", "unsafe_destination");
  if (st.nlink !== 1) fail(`destination has ${st.nlink} links`, "unsafe_destination");
  // realpath after lstat: a symlinked PARENT directory would pass the checks
  // above while resolving somewhere else entirely.
  if (realpathSync(target.path) !== target.path) fail("destination resolves elsewhere", "unsafe_destination");

  const { uid, gid } = resolveOwner(target, identityFiles);
  if (st.uid !== uid || st.gid !== gid) {
    fail(`destination owner/group is not ${target.owner}:${target.group}`, "wrong_ownership");
  }
  if ((st.mode & 0o7777) !== target.modeBits) {
    fail(`destination mode is not ${target.mode}`, "wrong_mode");
  }

  // A secret that has not been stored yet is the normal state before the owner
  // has entered it, not an internal error. Report it by name; the raw ENOENT
  // would print a store path and say nothing useful.
  let versionId;
  let value;
  try {
    versionId = versionIdFor(target.secret, { readEnvelope });
    value = readValue(target.secret);
  } catch (e) {
    if (/no such secret|ENOENT/.test(e.message)) {
      fail(`no stored secret named "${target.secret}" — store it first`, "secret_not_stored");
    }
    fail("stored secret could not be read", "secret_unreadable");
  }
  const before = readFileSync(target.path, "utf8");

  let after;
  try {
    after = substituteAssignment(before, target.envVar, value);
  } catch (e) {
    fail(e.message, e.code || "bad_value");
  }

  // Idempotence is decided on the file's own bytes, not on recorded state: a
  // state file that disagrees with reality must never suppress a real write.
  if (after === before) {
    audit({ actor, operation: "deploy", secret: target.secret, outcome: "success", reason: `${id}@${versionId} unchanged` });
    return { id, secret: target.secret, versionId, outcome: "unchanged", path: target.path };
  }
  if (dryRun) {
    return { id, secret: target.secret, versionId, outcome: "would-apply", path: target.path };
  }

  // --- rollback point, then the atomic swap --------------------------------
  const stamp = now().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const backup = `${target.path}${BACKUP_PREFIX}${stamp}`;
  writePrivateAtomic(backup, before, { modeBits: target.modeBits, uid, gid });
  writePrivateAtomic(target.path, after, { modeBits: target.modeBits, uid, gid });
  pruneBackups(target.path);

  const applied = readState({ root });
  applied[id] = {
    secret: target.secret,
    versionId,
    path: target.path,
    env_var: target.envVar,
    appliedAt: now().toISOString(),
    backup,
  };
  writeState(applied, { root });

  audit({ actor, operation: "deploy", secret: target.secret, outcome: "success", reason: `${id}@${versionId} applied` });
  return { id, secret: target.secret, versionId, outcome: "applied", path: target.path, backup };
}

/**
 * Undo the most recent apply for a target by restoring its backup.
 * Restores bytes, ownership and mode together; never inspects content.
 */
export function rollbackTarget(id, { root = storeRoot(), destinations = DESTINATIONS, actor = "secretdeploy", identityFiles = {} } = {}) {
  const target = readTargets({ root, destinations }).find((t) => t.id === id);
  if (!target) throw new DeployError(`no such deploy target: ${id}`, "unknown_target");
  const record = readState({ root })[id];
  if (!record?.backup) throw new DeployError(`${id}: no recorded backup to roll back to`, "no_rollback");
  if (!existsSync(record.backup)) throw new DeployError(`${id}: recorded backup is gone: ${record.backup}`, "no_rollback");

  const { uid, gid } = resolveOwner(target, identityFiles);
  writePrivateAtomic(target.path, readFileSync(record.backup, "utf8"), { modeBits: target.modeBits, uid, gid });

  // Record the reversal. Without this the state file keeps reporting
  // "applied version=X" after the value has been rolled back out of the
  // destination, so `deploy-status` asserts that production holds something it
  // demonstrably does not. A deployment record that survives its own undo is
  // worse than no record: it is a confident wrong answer.
  const all = readState({ root });
  all[id] = { ...record, rolledBackAt: new Date().toISOString(), rolledBackFrom: record.versionId };
  writeState(all, { root });

  audit({ actor, operation: "deploy", secret: target.secret, outcome: "success", reason: `${id} rolled back to ${basename(record.backup)}` });
  return { id, outcome: "rolled-back", path: target.path, from: record.backup };
}
