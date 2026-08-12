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

import { existsSync, lstatSync, readFileSync } from "node:fs";

import { audit } from "./secretaudit.mjs";
import {
  FILE_MODE,
  initStore,
  listSecrets,
  readSecretEnvelope,
  registryPath,
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
export function restoreBackup(bundle, { actor = "owner" } = {}) {
  initStore();
  const names = bundle.registry.secrets.map((s) => s.name);
  for (const name of names) {
    const envelope = bundle.values?.[name];
    if (typeof envelope !== "string") {
      throw new Error(`backup bundle is missing a value for: ${name}`);
    }
    // writeSecretEnvelope refuses anything that is not an envelope, so a
    // tampered bundle cannot inject plaintext during a restore.
    writeSecretEnvelope(name, envelope);
  }
  writePrivateFileAtomic(registryPath(), JSON.stringify(bundle.registry, null, 2) + "\n");
  audit({ actor, operation: "restore", secret: null, outcome: "success", reason: `${names.length} entries` });
  return { restored: names.length, names };
}
