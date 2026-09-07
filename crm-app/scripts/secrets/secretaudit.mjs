// Append-only audit trail for the secret store.
//
// One JSON object per line: who, what, which secret BY NAME, and what happened.
// A value never reaches this file — not raw, not truncated, not hashed. A hash
// of a low-entropy secret is a secret, and "just the first four characters" has
// leaked more credentials than any exploit.
//
// Writes are best-effort by design: an audit failure must never turn a
// successful, already-committed mutation into a reported failure. The store is
// the system of record; this is the trail.

import { appendFileSync, chmodSync, existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { FILE_MODE, storeRoot } from "./secretstore.mjs";

export const AUDIT_FIELDS = ["ts", "actor", "operation", "secret", "outcome", "reason"];

export function auditPath() {
  return join(storeRoot(), "audit.log");
}

// Everything that reaches the log is one of these. An unknown operation is
// recorded as "unknown" rather than passed through, so a caller cannot inject
// arbitrary text into the trail.
export const AUDIT_OPERATIONS = [
  "add",
  "replace",
  "disable",
  "delete",
  "list",
  "broker.invoke",
  // Materialising a stored value into a service's env file. The reason field
  // carries "<target-id>@<version-digest>", never the value.
  "deploy",
  "backup",
  "restore",
  "unknown",
];

function scrub(v, max = 200) {
  if (v == null) return null;
  // Strip newlines so one record can never forge another (log injection), and
  // bound the length so a pasted value cannot bloat the trail even by accident.
  return String(v).replace(/[\r\n]+/g, " ").slice(0, max);
}

export function auditRecord({ actor, operation, secret, outcome, reason = null, now = new Date() }) {
  return {
    ts: now.toISOString(),
    actor: scrub(actor) ?? "unknown",
    operation: AUDIT_OPERATIONS.includes(operation) ? operation : "unknown",
    secret: scrub(secret),
    outcome: outcome === "success" ? "success" : "failure",
    reason: scrub(reason),
  };
}

export function audit(entry) {
  const record = auditRecord(entry);
  try {
    const path = auditPath();
    const fresh = !existsSync(path);
    appendFileSync(path, JSON.stringify(record) + "\n", { mode: FILE_MODE });
    if (fresh) chmodSync(path, FILE_MODE);
  } catch {
    // See header: never fail a committed mutation because the trail could not
    // be written.
  }
  return record;
}

export function auditIsPrivate() {
  const path = auditPath();
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st) return true;
  return st.isFile() && (st.mode & 0o077) === 0;
}
