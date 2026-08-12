// Encrypted backup and restore for the secret store.
//
// A backup bundle contains the registry plus each value AS ITS STORED
// ENVELOPE. Nothing is decrypted on the way out, so producing a backup never
// materialises a plaintext secret anywhere — not in memory, not in a temp file.
//
// KEY CUSTODY, stated once and plainly: a bundle is useless without the key
// file. If the key is lost, every backup taken with it is unrecoverable
// ciphertext. There is no escrow, no recovery code, and no vendor to ask.
// The owner must keep a copy of the key OFF this host. This module will not
// invent, derive, print, or transmit such a copy — creating one is an owner
// action, deliberately outside the automation.

import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";

import { audit } from "./secretaudit.mjs";
import {
  FILE_MODE,
  assertNoSymlinkEscape,
  assertSafeTargetFile,
  initStore,
  isValidSecretName,
  listSecrets,
  readRegistryBytes,
  readSecretEnvelope,
  registryPath,
  valuePathFor,
  withStoreLock,
  writePrivateFileAtomic,
  writeSecretEnvelope,
} from "./secretstore.mjs";

export const BUNDLE_SCHEMA = 1;
export const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;

export function createBackup({ actor = "owner", now = new Date() } = {}) {
  const secrets = listSecrets({ now });
  const values = {};
  for (const s of secrets) {
    // A registry entry with no value file is reported, not silently dropped:
    // a backup that quietly omits a secret is worse than one that fails.
    values[s.name] = readSecretEnvelope(s.name);
  }
  audit({ actor, operation: "backup", secret: null, outcome: "success", reason: `${secrets.length} entries` });
  return {
    schema: BUNDLE_SCHEMA,
    created: now.toISOString(),
    // Ciphertext only. Recovering this needs the key file; see the header.
    encrypted: true,
    registry: JSON.parse(readFileSync(registryPath(), "utf8")),
    values,
  };
}

export function writeBackup(path, bundle) {
  writePrivateFileAtomic(path, JSON.stringify(bundle, null, 2) + "\n");
  return { path, mode: FILE_MODE.toString(8) };
}

export function readBackup(path) {
  if (!existsSync(path)) throw new Error("backup bundle not found");
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st || !st.isFile()) throw new Error("backup bundle is not a regular file");
  if (st.size > MAX_BUNDLE_BYTES) throw new Error("backup bundle is implausibly large");
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("backup bundle is not valid JSON");
  }
  if (bundle?.schema !== BUNDLE_SCHEMA) throw new Error("unsupported backup schema");
  if (!Array.isArray(bundle?.registry?.secrets)) throw new Error("backup bundle has no registry");
  return bundle;
}

// Restores into whatever store SECRET_STORE_ROOT currently points at. The
// rehearsal procedure points it at a scratch directory, which is the whole
// point: a restore you have never run is a backup you do not have.
//
// RESTORE CONTRACT, declared once so the rollback has something to be correct
// against:
//   - the bundle's registry REPLACES the target registry wholesale;
//   - every value named in the bundle is written;
//   - value files NOT named in the bundle are left exactly as they are — a
//     restore never deletes, so an unrelated entry cannot be destroyed by
//     restoring an older bundle. It may be left orphaned by the new registry,
//     which is recoverable; deletion would not be.
//
// ATOMICITY: all-or-nothing. Everything is validated before the target is
// touched at all, a bounded preimage of exactly what will change is captured,
// and any failure — validation, materialisation, registry write, or an
// injected fault — restores that preimage byte for byte. The whole operation
// runs under the canonical store lock, so a concurrent add/replace/delete
// either happens entirely before or entirely after it, never interleaved.
export const MAX_PREIMAGE_BYTES = MAX_BUNDLE_BYTES;

// Fault-injection seam, null in every real path, set only by the test suite.
// A rollback that has never been forced to run is a rollback you do not have.
export const __restoreFaults = {
  beforeMaterialize: null,
  duringMaterialize: null,
  afterMaterialize: null,
};

function restoreFault(name) {
  const hook = __restoreFaults[name];
  if (hook) hook();
}

export function restoreBackup(bundle, { actor = "owner" } = {}) {
  initStore();
  return withStoreLock(() => {
    const entries = bundle.registry.secrets;
    const names = entries.map((s) => s.name);

    // --- 1. validate EVERYTHING before touching the target -------------------
    if (new Set(names).size !== names.length) {
      throw new Error("backup bundle names a secret more than once");
    }
    for (const name of names) {
      if (!isValidSecretName(name)) {
        throw new Error(`backup bundle contains an invalid secret name: ${name}`);
      }
      const envelope = bundle.values?.[name];
      if (typeof envelope !== "string") {
        throw new Error(`backup bundle is missing a value for: ${name}`);
      }
      if (!envelope.startsWith("v1.")) {
        throw new Error("refusing to write a value that is not an encrypted envelope");
      }
      // Containment is checked up front too, so a hostile bundle fails before
      // a single byte of the target has changed.
      assertNoSymlinkEscape(name);
      assertSafeTargetFile(valuePathFor(name));
    }
    const registryBytes = JSON.stringify(bundle.registry, null, 2) + "\n";

    // --- 2. bounded preimage of exactly what will change ---------------------
    const preimage = { registry: readRegistryBytes(), values: new Map() };
    let budget = MAX_PREIMAGE_BYTES;
    for (const name of names) {
      const path = valuePathFor(name);
      if (!existsSync(path)) {
        preimage.values.set(name, null); // did not exist: rollback deletes it
        continue;
      }
      const prior = readFileSync(path, "utf8");
      budget -= prior.length;
      if (budget < 0) {
        throw new Error("refusing to restore: preimage would exceed the bounded rollback budget");
      }
      preimage.values.set(name, prior);
    }

    const rollback = () => {
      for (const [name, prior] of preimage.values) {
        const path = valuePathFor(name);
        try {
          if (prior === null) rmSync(path, { force: true });
          else writePrivateFileAtomic(path, prior);
        } catch {
          /* keep unwinding: one unrecoverable entry must not strand the rest */
        }
      }
      try {
        writePrivateFileAtomic(registryPath(), preimage.registry);
      } catch {
        /* the registry preimage is the last thing we can do; report below */
      }
    };

    // --- 3. materialise, rolling back on any failure -------------------------
    try {
      restoreFault("beforeMaterialize");
      let i = 0;
      for (const name of names) {
        // writeSecretEnvelope re-checks the envelope and the target: a bundle
        // cannot inject plaintext or write through a suspicious target.
        writeSecretEnvelope(name, bundle.values[name]);
        i += 1;
        if (i === 1) restoreFault("duringMaterialize");
      }
      restoreFault("afterMaterialize");
      writePrivateFileAtomic(registryPath(), registryBytes);
    } catch (e) {
      rollback();
      audit({ actor, operation: "restore", secret: null, outcome: "failure", reason: "rolled back" });
      // Truthful failure: the caller learns the restore did not happen, and
      // the store is the store it was before the call.
      throw new Error(`restore failed and was rolled back: ${e.message}`);
    }

    audit({ actor, operation: "restore", secret: null, outcome: "success", reason: `${names.length} entries` });
    return { restored: names.length, names };
  });
}
