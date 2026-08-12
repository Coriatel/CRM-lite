// Capability broker: the only door an AI caller gets.
//
// The rule this file exists to enforce: an AI caller may ask for a named
// OPERATION to be performed with a secret. It may never ask for the secret.
// There is deliberately no verb here that returns, echoes, derives, or
// truncates a value — no "peek", no "prefix", no "length", no "fingerprint".
//
// Capabilities are declared by the owner in capabilities.json inside the store
// (0600, written by the owner, never by a caller). A caller names a capability
// id; the broker resolves it to a secret and a fixed operation. A caller cannot
// name a secret directly, so it cannot reach a secret the owner did not expose,
// and cannot widen its own access by guessing names.
//
// Operations are a closed set. Adding one is a deliberate code change with its
// own review — not a config edit.

import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { audit } from "./secretaudit.mjs";
import {
  MAX_REGISTRY_BYTES,
  SecretUnavailableError,
  readSecretValue,
  storeRoot,
} from "./secretstore.mjs";

export const BROKER_OPERATIONS = ["probe", "sign-challenge"];
export const MAX_CHALLENGE_BYTES = 4096;

export class BrokerError extends Error {
  constructor(message, code = "broker_error") {
    super(message);
    this.name = "BrokerError";
    this.code = code;
  }
}

export function capabilitiesPath() {
  return join(storeRoot(), "capabilities.json");
}

export function readCapabilities() {
  const path = capabilitiesPath();
  if (!existsSync(path)) return [];
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st || !st.isFile()) throw new BrokerError("capabilities file is not a regular file");
  if (st.size > MAX_REGISTRY_BYTES) throw new BrokerError("capabilities file is implausibly large");
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new BrokerError("capabilities file is not valid JSON");
  }
  const list = Array.isArray(parsed?.capabilities) ? parsed.capabilities : [];
  return list.filter(
    (c) =>
      c &&
      typeof c.id === "string" &&
      typeof c.secret === "string" &&
      BROKER_OPERATIONS.includes(c.operation),
  );
}

export function listCapabilities() {
  // What a caller is allowed to know about itself: which ids exist and what
  // each one DOES. The secret each one binds to is intentionally withheld —
  // knowing the mapping is a step toward requesting the secret elsewhere.
  return readCapabilities().map(({ id, operation, description = null }) => ({
    id,
    operation,
    description,
  }));
}

// The whole broker surface. `actor` identifies the caller for the audit trail
// and is never trusted for authorisation — authorisation is the capability's
// existence, which only the owner can grant.
export function invokeCapability(id, { actor = "ai-caller", challenge = null } = {}) {
  const cap = readCapabilities().find((c) => c.id === id);
  if (!cap) {
    // Same message whether the id is unknown or merely not granted: a caller
    // must not be able to enumerate the owner's capability list by probing.
    audit({ actor, operation: "broker.invoke", secret: null, outcome: "failure", reason: "unknown capability" });
    throw new BrokerError("unknown capability", "unknown_capability");
  }

  try {
    if (cap.operation === "probe") {
      // Proves the secret is present and usable. Returns a boolean, nothing else.
      readSecretValue(cap.secret);
      audit({ actor, operation: "broker.invoke", secret: cap.secret, outcome: "success", reason: "probe" });
      return { capability: id, operation: "probe", usable: true };
    }

    if (cap.operation === "sign-challenge") {
      // Proof of possession without disclosure: the caller supplies a
      // challenge, the broker returns HMAC-SHA256(secret, challenge). The
      // caller learns that the holder has the secret; it does not learn the
      // secret. This is the only operation whose output is derived from the
      // value, and it is a one-way derivation over caller-chosen input.
      if (typeof challenge !== "string" || challenge.length === 0) {
        throw new BrokerError("a non-empty challenge is required", "bad_request");
      }
      if (challenge.length > MAX_CHALLENGE_BYTES) {
        throw new BrokerError("challenge is too large", "bad_request");
      }
      const value = readSecretValue(cap.secret);
      const mac = createHmac("sha256", value).update(challenge, "utf8").digest("hex");
      audit({ actor, operation: "broker.invoke", secret: cap.secret, outcome: "success", reason: "sign-challenge" });
      return { capability: id, operation: "sign-challenge", mac };
    }

    throw new BrokerError("unsupported operation", "unsupported_operation");
  } catch (e) {
    if (e instanceof BrokerError) {
      audit({ actor, operation: "broker.invoke", secret: cap.secret, outcome: "failure", reason: e.code });
      throw e;
    }
    if (e instanceof SecretUnavailableError) {
      // Disabled or expired: refuse, and say only that much.
      audit({ actor, operation: "broker.invoke", secret: cap.secret, outcome: "failure", reason: e.reason });
      throw new BrokerError(`capability is not available: ${id}`, "unavailable");
    }
    // Anything else — missing secret, undecryptable value, missing key — is
    // collapsed to one opaque failure. The underlying message could name a
    // path or a key problem, and the caller is untrusted.
    audit({ actor, operation: "broker.invoke", secret: cap.secret, outcome: "failure", reason: "error" });
    throw new BrokerError(`capability is not available: ${id}`, "unavailable");
  }
}

// Exposed for tests that need to compare MACs without leaking timing.
export function macEquals(a, b) {
  const ba = Buffer.from(String(a), "hex");
  const bb = Buffer.from(String(b), "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
