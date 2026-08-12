// Encryption at rest for secret values.
//
// Threat model, stated plainly so nobody over-trusts this layer:
//
//   PROTECTS: a copy of the store that leaves the running host — a backup, a
//   snapshot, a stolen disk, a mis-scoped rsync, an accidental tarball. Those
//   carry ciphertext only, and the key is not in them.
//
//   DOES NOT PROTECT: a process already running as the store's own service
//   user. It can read the key file, so it can decrypt. Confidentiality against
//   local readers is an OS-permission property (dedicated service identity,
//   0700 store, 0400 key), not a cryptographic one. Encryption is the second
//   lock, not the first.
//
// Envelope: v1.<iv>.<ciphertext>.<tag>, all base64url, ASCII only, so every
// existing atomic-write/rename path keeps working unchanged.
//
// The secret's NAME is authenticated as AAD. Moving or renaming a value file to
// another name therefore fails to decrypt rather than silently returning the
// wrong secret — the file is bound to its registry identity.

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";

export const ENVELOPE_PREFIX = "v1.";
export const KEY_BYTES = 32;
const IV_BYTES = 12;

export class SecretKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = "SecretKeyError";
  }
}

export class SecretDecryptError extends Error {
  constructor(message) {
    super(message);
    this.name = "SecretDecryptError";
  }
}

// The key file is the whole custody story: 32 bytes as 64 hex characters, mode
// 0400, owned by the service identity. There is no passphrase and no KDF —
// a passphrase that must be typed on every restart is a passphrase that ends up
// in a systemd unit or a shell history.
export function keyFilePath() {
  return process.env.SECRET_KEY_FILE || "";
}

function readKeyFile(path) {
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st) throw new SecretKeyError("secret key file is missing");
  if (!st.isFile()) throw new SecretKeyError("secret key file is not a regular file");
  if (st.size > 4096) throw new SecretKeyError("secret key file is implausibly large");
  // Group/other must have nothing. A 0644 key is a key you must assume is known.
  if ((st.mode & 0o077) !== 0) {
    throw new SecretKeyError("secret key file is group/world accessible — refusing to use it");
  }
  return readFileSync(path, "utf8").trim();
}

export function loadKey() {
  const path = keyFilePath();
  if (!path) throw new SecretKeyError("SECRET_KEY_FILE is not configured");
  const hex = readKeyFile(path);
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    // Never quote the contents: a malformed key file may hold something else
    // entirely, and whatever it holds is not for a log line.
    throw new SecretKeyError("secret key file must contain 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function generateKeyHex() {
  return randomBytes(KEY_BYTES).toString("hex");
}

// Fail closed at startup rather than at first use: a service that boots happily
// and only discovers a broken key when the owner tries to read a secret has
// moved the failure to the worst possible moment.
export function assertKeyUsable() {
  const key = loadKey();
  const probe = "startup-self-test";
  const round = decryptValue(encryptValue(probe, "__startup__", key), "__startup__", key);
  if (!timingSafeEqual(Buffer.from(round), Buffer.from(probe))) {
    throw new SecretKeyError("secret key failed its startup self-test");
  }
  return true;
}

// --- Owner recovery artifact -------------------------------------------------
//
// The server key is automatically available to the service (a 0400 file the
// unit reads at start) so restarts need no human. That leaves one gap: if the
// host dies, the key dies with it and every backup is ciphertext forever.
//
// The recovery artifact closes exactly that gap and nothing else: the SAME
// server key, wrapped under an owner passphrase, in the SAME envelope format.
// It is not a second key, not a second store, and not a second recovery path —
// unwrapping it yields the one key the normal path already uses.
//
// scrypt with a per-artifact salt, so a weak passphrase costs an attacker real
// work. The passphrase is never stored, never logged, and never defaulted.

import { scryptSync } from "node:crypto";

export const RECOVERY_PREFIX = "recovery-v1.";
const SCRYPT_N = 1 << 15;
const SALT_BYTES = 16;

function deriveWrappingKey(passphrase, salt) {
  if (typeof passphrase !== "string" || passphrase.length < 12) {
    throw new SecretKeyError("recovery passphrase must be at least 12 characters");
  }
  return scryptSync(passphrase, salt, KEY_BYTES, { N: SCRYPT_N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function wrapKeyForRecovery(keyHex, passphrase) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(keyHex).trim())) {
    throw new SecretKeyError("refusing to wrap something that is not a 32-byte key");
  }
  const salt = randomBytes(SALT_BYTES);
  const wrapping = deriveWrappingKey(passphrase, salt);
  // AAD ties the ciphertext to this artifact format, so a wrapped key cannot be
  // replayed as a value envelope or vice versa.
  const inner = encryptValue(String(keyHex).trim(), "crm-secrets-recovery-v1", wrapping);
  return `${RECOVERY_PREFIX}${salt.toString("base64url")}.${inner}`;
}

export function unwrapRecoveryKey(artifact, passphrase) {
  if (typeof artifact !== "string" || !artifact.startsWith(RECOVERY_PREFIX)) {
    throw new SecretKeyError("not a recovery artifact");
  }
  const rest = artifact.slice(RECOVERY_PREFIX.length);
  const idx = rest.indexOf(".");
  if (idx <= 0) throw new SecretKeyError("malformed recovery artifact");
  const salt = Buffer.from(rest.slice(0, idx), "base64url");
  const wrapping = deriveWrappingKey(passphrase, salt);
  try {
    return decryptValue(rest.slice(idx + 1), "crm-secrets-recovery-v1", wrapping);
  } catch {
    // Wrong passphrase and corrupt artifact are the same message on purpose.
    throw new SecretKeyError("could not unwrap the recovery artifact");
  }
}

export function isEnvelope(text) {
  return typeof text === "string" && text.startsWith(ENVELOPE_PREFIX);
}

export function encryptValue(plaintext, name, key = loadKey()) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    ct.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptValue(envelope, name, key = loadKey()) {
  if (!isEnvelope(envelope)) {
    // A plaintext value file is a pre-encryption artifact or a tampered one.
    // Both are refused: silently accepting plaintext would let an attacker who
    // can write the values directory downgrade every secret to cleartext.
    throw new SecretDecryptError("value is not an encrypted envelope");
  }
  const parts = envelope.split(".");
  if (parts.length !== 4) throw new SecretDecryptError("malformed envelope");
  const [, ivB64, ctB64, tagB64] = parts;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
    decipher.setAAD(Buffer.from(name, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // One message for every failure mode — wrong key, wrong name, flipped bit.
    // Distinguishing them would tell an attacker which half to keep guessing.
    throw new SecretDecryptError("could not decrypt the stored value");
  }
}
