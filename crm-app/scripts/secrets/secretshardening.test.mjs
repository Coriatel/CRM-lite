// Hardening acceptance for the Secrets MVP.
//
// Everything here is adversarial: each test states an attack or a failure and
// asserts the store refuses it. Synthetic values only — every value in this
// file is generated at run time and never leaves the temp store.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  wrapKeyForRecovery,
  unwrapRecoveryKey,
  decryptValue,
  encryptValue,
  generateKeyHex,
  isEnvelope,
  loadKey,
  assertKeyUsable,
  SecretDecryptError,
  SecretKeyError,
} from "./secretcrypto.mjs";
import { audit, auditPath, auditRecord } from "./secretaudit.mjs";
import { BrokerError, invokeCapability, listCapabilities, capabilitiesPath } from "./secretbroker.mjs";
import { createBackup, readBackup, restoreBackup, writeBackup } from "./secretsbackup.mjs";
import {
  addSecret,
  assertStoreSeparation,
  disableSecret,
  productionStoreRoot,
  readSecretValue,
  removeSecret,
  replaceSecret,
  storeRoot,
  valuesDir,
  __faultHooks,
} from "./secretstore.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CTL = join(HERE, "secretsctl.mjs");

let tmp;
let keyFile;
let canary;

function meta(name, over = {}) {
  return {
    name,
    type: "other",
    purpose: "hardening test",
    consumer: "test",
    owner: "owner@example.test",
    expiry: null,
    ...over,
  };
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "secrets-harden-"));
  process.env.SECRET_STORE_ROOT = tmp;
  keyFile = join(tmp, "test.key");
  writeFileSync(keyFile, generateKeyHex() + "\n", { mode: 0o400 });
  process.env.SECRET_KEY_FILE = keyFile;
  canary = `SYNTHETIC-${Math.random().toString(36).slice(2)}-${Date.now()}`;
});

afterEach(() => {
  delete process.env.SECRET_STORE_ROOT;
  delete process.env.SECRET_KEY_FILE;
  __faultHooks.beforeRegistryWrite = null;
  __faultHooks.afterRegistryWrite = null;
  rmSync(tmp, { recursive: true, force: true });
});

// --- F1: the two containment guards the delete PR left mutation-invisible ----
//
// Both were proven load-bearing by the independent review yet survived the
// suite. These are the tests that close that gap.

describe("F1 containment — guards that were previously untested", () => {
  it("refuses to delete through a symlinked values directory (assertNoSymlinkEscape)", () => {
    addSecret(meta("keep-me"), canary);

    // Attacker redirects the values directory at a tree they control.
    const elsewhere = mkdtempSync(join(tmpdir(), "secrets-elsewhere-"));
    const target = join(elsewhere, "victim.txt");
    writeFileSync(target, "do not delete me");
    const realValues = valuesDir();
    const stash = join(tmp, "values-real");
    spawnSync("mv", [realValues, stash]);
    symlinkSync(elsewhere, realValues);

    expect(() => removeSecret("victim.txt", { mustExist: false })).toThrow(
      /invalid secret name|escapes|symlink/i,
    );
    // The canary here is the FILE, not a value: it must survive.
    expect(existsSync(target)).toBe(true);

    rmSync(realValues);
    spawnSync("mv", [stash, realValues]);
    rmSync(elsewhere, { recursive: true, force: true });
  });

  it("refuses a value file that is a FIFO or a hardlink (assertSafeTargetFile)", () => {
    addSecret(meta("fifo-target"), canary);
    const p = join(valuesDir(), "fifo-target");

    // A FIFO in place of the value file: without the guard, copyFileSync blocks
    // forever WHILE HOLDING THE STORE LOCK — a self-inflicted denial of service
    // on every subsequent secret operation, not merely a bad read.
    rmSync(p);
    expect(spawnSync("mkfifo", ["-m", "600", p]).status).toBe(0);
    expect(() => removeSecret("fifo-target", { mustExist: true })).toThrow(/regular file|refusing/i);
    rmSync(p, { force: true });

    // A hardlink: deleting our name would leave the attacker's link holding the
    // same inode, and replacing through it would write into their file.
    addSecret(meta("link-target"), canary);
    const lp = join(valuesDir(), "link-target");
    const attacker = join(tmp, "attacker-link");
    linkSync(lp, attacker);
    expect(() => removeSecret("link-target", { mustExist: true })).toThrow(/link count|refusing/i);
    expect(existsSync(attacker)).toBe(true);
  });
});

// --- Encryption at rest ------------------------------------------------------

describe("encryption at rest", () => {
  it("never writes a plaintext value to disk", () => {
    addSecret(meta("enc-1"), canary);
    const onDisk = readFileSync(join(valuesDir(), "enc-1"), "utf8");
    expect(isEnvelope(onDisk)).toBe(true);
    expect(onDisk).not.toContain(canary);
    // And the round trip still returns exactly what went in.
    expect(readSecretValue("enc-1")).toBe(canary);
  });

  it("binds a value to its name, so a moved value file will not decrypt", () => {
    addSecret(meta("bound-a"), canary);
    addSecret(meta("bound-b"), `${canary}-other`);
    const a = readFileSync(join(valuesDir(), "bound-a"), "utf8");
    writeFileSync(join(valuesDir(), "bound-b"), a, { mode: 0o600 });
    // Without AAD this would silently return secret A under name B.
    expect(() => readSecretValue("bound-b")).toThrow(SecretDecryptError);
  });

  it("refuses a downgraded plaintext value file", () => {
    addSecret(meta("downgrade"), canary);
    writeFileSync(join(valuesDir(), "downgrade"), "plain-text-now", { mode: 0o600 });
    expect(() => readSecretValue("downgrade")).toThrow(/not an encrypted envelope/);
  });

  it("refuses a tampered envelope rather than returning garbage", () => {
    addSecret(meta("tamper"), canary);
    const p = join(valuesDir(), "tamper");
    const env = readFileSync(p, "utf8");
    const parts = env.split(".");
    parts[2] = Buffer.from("attacker-chosen").toString("base64url");
    writeFileSync(p, parts.join("."), { mode: 0o600 });
    expect(() => readSecretValue("tamper")).toThrow(SecretDecryptError);
  });

  it("fails closed when the key is missing, malformed, or world-readable", () => {
    delete process.env.SECRET_KEY_FILE;
    expect(() => loadKey()).toThrow(SecretKeyError);

    const bad = join(tmp, "bad.key");
    writeFileSync(bad, "not-hex", { mode: 0o400 });
    process.env.SECRET_KEY_FILE = bad;
    expect(() => loadKey()).toThrow(/64 hex/);

    const loose = join(tmp, "loose.key");
    writeFileSync(loose, generateKeyHex(), { mode: 0o644 });
    process.env.SECRET_KEY_FILE = loose;
    expect(() => loadKey()).toThrow(/group\/world/);

    process.env.SECRET_KEY_FILE = keyFile;
    expect(assertKeyUsable()).toBe(true);
  });

  it("never quotes key material in an error", () => {
    const bad = join(tmp, "quote.key");
    writeFileSync(bad, "SUPERSECRETKEYMATERIAL", { mode: 0o400 });
    process.env.SECRET_KEY_FILE = bad;
    try {
      loadKey();
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.message).not.toContain("SUPERSECRETKEYMATERIAL");
    }
  });
});

describe("owner recovery artifact", () => {
  it("round-trips the SAME server key under a passphrase", () => {
    const keyHex = readFileSync(keyFile, "utf8").trim();
    const artifact = wrapKeyForRecovery(keyHex, "correct horse battery");
    expect(artifact.startsWith("recovery-v1.")).toBe(true);
    expect(artifact).not.toContain(keyHex);
    expect(unwrapRecoveryKey(artifact, "correct horse battery")).toBe(keyHex);
  });

  it("is useless without the passphrase", () => {
    const artifact = wrapKeyForRecovery(readFileSync(keyFile, "utf8").trim(), "correct horse battery");
    expect(() => unwrapRecoveryKey(artifact, "wrong passphrase here")).toThrow(/could not unwrap/);
  });

  it("refuses a weak passphrase and a non-key input", () => {
    const keyHex = readFileSync(keyFile, "utf8").trim();
    expect(() => wrapKeyForRecovery(keyHex, "short")).toThrow(/at least 12/);
    expect(() => wrapKeyForRecovery("not-a-key", "correct horse battery")).toThrow(/not a 32-byte key/);
  });

  it("recovers a real backup end to end after total key loss", () => {
    addSecret(meta("survivor"), canary);
    const bundle = join(tmp, "bundle.json");
    writeBackup(bundle, createBackup());
    const artifact = wrapKeyForRecovery(readFileSync(keyFile, "utf8").trim(), "correct horse battery");

    // Simulate losing the host: new store, and the key file is gone.
    const newHost = mkdtempSync(join(tmpdir(), "secrets-newhost-"));
    const rebuiltKey = join(newHost, "rebuilt.key");
    writeFileSync(rebuiltKey, unwrapRecoveryKey(artifact, "correct horse battery") + "\n", { mode: 0o400 });
    process.env.SECRET_STORE_ROOT = newHost;
    process.env.SECRET_KEY_FILE = rebuiltKey;
    restoreBackup(readBackup(bundle));
    expect(readSecretValue("survivor")).toBe(canary);
    rmSync(newHost, { recursive: true, force: true });
    process.env.SECRET_STORE_ROOT = tmp;
    process.env.SECRET_KEY_FILE = keyFile;
  });

  it("cannot be replayed as a value envelope", () => {
    const artifact = wrapKeyForRecovery(readFileSync(keyFile, "utf8").trim(), "correct horse battery");
    addSecret(meta("replay"), canary);
    writeFileSync(join(valuesDir(), "replay"), artifact.slice("recovery-v1.".length).split(".").slice(1).join("."), { mode: 0o600 });
    expect(() => readSecretValue("replay")).toThrow(SecretDecryptError);
  });
});

// --- Test / production separation -------------------------------------------

describe("test and production stores are separate", () => {
  it("refuses to resolve the production store under a test runner", () => {
    const saved = process.env.SECRET_STORE_ROOT;
    delete process.env.SECRET_STORE_ROOT;
    // VITEST is set by the runner, so this is the real guard firing.
    expect(() => assertStoreSeparation()).toThrow(/production secret store/);
    expect(() => storeRoot()).toThrow(/production secret store/);
    process.env.SECRET_STORE_ROOT = saved;
    expect(storeRoot()).toBe(saved);
  });

  it("never points the test store at the production path", () => {
    expect(storeRoot()).not.toBe(productionStoreRoot());
    expect(storeRoot().startsWith(tmpdir())).toBe(true);
  });
});

// --- Capability broker -------------------------------------------------------

function grant(caps) {
  writeFileSync(capabilitiesPath(), JSON.stringify({ capabilities: caps }, null, 2), { mode: 0o600 });
}

describe("capability broker — an AI caller can act, never retrieve", () => {
  beforeEach(() => {
    addSecret(meta("broker-secret"), canary);
    grant([
      { id: "probe-it", secret: "broker-secret", operation: "probe", description: "liveness" },
      { id: "sign-it", secret: "broker-secret", operation: "sign-challenge" },
    ]);
  });

  it("exposes no verb that returns a value", () => {
    const probe = invokeCapability("probe-it");
    const sign = invokeCapability("sign-it", { challenge: "hello" });
    const blob = JSON.stringify({ probe, sign, caps: listCapabilities() });
    expect(blob).not.toContain(canary);
    expect(probe).toEqual({ capability: "probe-it", operation: "probe", usable: true });
    expect(sign.mac).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not reveal which secret a capability binds to", () => {
    const listed = JSON.stringify(listCapabilities());
    expect(listed).not.toContain("broker-secret");
  });

  it("cannot be pointed at an arbitrary secret by the caller", () => {
    addSecret(meta("not-exposed"), `${canary}-2`);
    // There is no id for it, and a caller cannot name a secret directly.
    expect(() => invokeCapability("not-exposed")).toThrow(BrokerError);
    expect(() => invokeCapability("broker-secret")).toThrow(/unknown capability/);
  });

  it("gives the same answer for unknown and ungranted ids (no enumeration)", () => {
    let a, b;
    try { invokeCapability("does-not-exist"); } catch (e) { a = e.message; }
    try { invokeCapability("not-exposed"); } catch (e) { b = e.message; }
    expect(a).toBe(b);
  });

  it("refuses a disabled secret and does not say why in detail", () => {
    disableSecret("broker-secret");
    expect(() => invokeCapability("probe-it")).toThrow(/not available/);
  });

  it("refuses a deleted secret", () => {
    removeSecret("broker-secret", { mustExist: true });
    expect(() => invokeCapability("probe-it")).toThrow(/not available/);
  });

  it("produces a stable MAC for a stable challenge and a different one otherwise", () => {
    const a = invokeCapability("sign-it", { challenge: "same" }).mac;
    const b = invokeCapability("sign-it", { challenge: "same" }).mac;
    const c = invokeCapability("sign-it", { challenge: "different" }).mac;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("bounds the challenge", () => {
    expect(() => invokeCapability("sign-it", { challenge: "" })).toThrow(/challenge/);
    expect(() => invokeCapability("sign-it", { challenge: "x".repeat(5000) })).toThrow(/too large/);
  });

  it("ignores a capabilities file that is not a regular file", () => {
    rmSync(capabilitiesPath());
    symlinkSync("/etc/passwd", capabilitiesPath());
    expect(() => listCapabilities()).toThrow(/not a regular file/);
  });
});

// --- Audit trail -------------------------------------------------------------

describe("audit trail", () => {
  it("records actor, operation, symbolic name and outcome — never a value", () => {
    addSecret(meta("audited"), canary);
    grant([{ id: "p", secret: "audited", operation: "probe" }]);
    invokeCapability("p", { actor: "ai@example.test" });
    const lines = readFileSync(auditPath(), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const rec = lines.at(-1);
    expect(rec.actor).toBe("ai@example.test");
    expect(rec.operation).toBe("broker.invoke");
    expect(rec.secret).toBe("audited");
    expect(rec.outcome).toBe("success");
    expect(readFileSync(auditPath(), "utf8")).not.toContain(canary);
  });

  it("is owner-only on disk", () => {
    audit({ actor: "o", operation: "list", secret: null, outcome: "success" });
    expect(statSync(auditPath()).mode & 0o077).toBe(0);
  });

  it("cannot be forged by newline injection or an invented operation", () => {
    const rec = auditRecord({
      actor: 'me"}\n{"actor":"root',
      operation: "sudo-everything",
      secret: "x",
      outcome: "success",
    });
    expect(rec.actor).not.toContain("\n");
    expect(rec.operation).toBe("unknown");
  });

  it("records failures too", () => {
    grant([]);
    try { invokeCapability("nope"); } catch { /* expected */ }
    const last = JSON.parse(readFileSync(auditPath(), "utf8").trim().split("\n").at(-1));
    expect(last.outcome).toBe("failure");
  });
});

// --- Backup + restore rehearsal ---------------------------------------------

describe("encrypted backup and a real restore rehearsal", () => {
  it("backs up ciphertext only", () => {
    addSecret(meta("b1"), canary);
    const out = join(tmp, "bundle.json");
    writeBackup(out, createBackup());
    const raw = readFileSync(out, "utf8");
    expect(raw).not.toContain(canary);
    expect(raw).toContain("v1.");
    expect(statSync(out).mode & 0o077).toBe(0);
  });

  it("restores into a SEPARATE store and the values decrypt with the same key", () => {
    addSecret(meta("b1"), canary);
    addSecret(meta("b2"), `${canary}-two`);
    disableSecret("b2");
    const out = join(tmp, "bundle.json");
    writeBackup(out, createBackup());

    // The rehearsal: a genuinely different store root, restored from the bundle.
    const rehearsal = mkdtempSync(join(tmpdir(), "secrets-restore-"));
    process.env.SECRET_STORE_ROOT = rehearsal;
    const res = restoreBackup(readBackup(out));
    expect(res.restored).toBe(2);
    expect(readSecretValue("b1")).toBe(canary);
    // Status survives the round trip, so a disabled secret does not come back live.
    expect(() => readSecretValue("b2")).toThrow(/not active/);
    rmSync(rehearsal, { recursive: true, force: true });
    process.env.SECRET_STORE_ROOT = tmp;
  });

  it("is unrecoverable with the wrong key — custody is the whole story", () => {
    addSecret(meta("b1"), canary);
    const out = join(tmp, "bundle.json");
    writeBackup(out, createBackup());

    const rehearsal = mkdtempSync(join(tmpdir(), "secrets-wrongkey-"));
    const otherKey = join(rehearsal, "other.key");
    writeFileSync(otherKey, generateKeyHex() + "\n", { mode: 0o400 });
    process.env.SECRET_STORE_ROOT = rehearsal;
    process.env.SECRET_KEY_FILE = otherKey;
    restoreBackup(readBackup(out));
    expect(() => readSecretValue("b1")).toThrow(SecretDecryptError);
    rmSync(rehearsal, { recursive: true, force: true });
    process.env.SECRET_STORE_ROOT = tmp;
    process.env.SECRET_KEY_FILE = keyFile;
  });

  it("refuses a bundle that tries to inject plaintext during restore", () => {
    addSecret(meta("b1"), canary);
    const out = join(tmp, "bundle.json");
    const bundle = createBackup();
    bundle.values.b1 = "plaintext-injection";
    writeBackup(out, bundle);
    const rehearsal = mkdtempSync(join(tmpdir(), "secrets-inject-"));
    process.env.SECRET_STORE_ROOT = rehearsal;
    expect(() => restoreBackup(readBackup(out))).toThrow(/not an encrypted envelope/);
    rmSync(rehearsal, { recursive: true, force: true });
    process.env.SECRET_STORE_ROOT = tmp;
  });
});

// --- Disclosure surfaces -----------------------------------------------------

describe("no disclosure through logs, errors, argv or environment", () => {
  it("keeps the value out of every CLI stream, and out of argv", () => {
    const res = spawnSync(process.execPath, [CTL, "add", "--name", "cli-1", "--type", "other",
      "--purpose", "p", "--consumer", "c"], {
      input: canary + "\n",
      encoding: "utf8",
      env: { ...process.env, SECRET_STORE_ROOT: tmp, SECRET_KEY_FILE: keyFile },
    });
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain(canary);
    expect(res.stderr).not.toContain(canary);

    const trail = spawnSync(process.execPath, [CTL, "trail"], {
      encoding: "utf8",
      env: { ...process.env, SECRET_STORE_ROOT: tmp, SECRET_KEY_FILE: keyFile },
    });
    expect(trail.stdout).toContain("cli-1");
    expect(trail.stdout).not.toContain(canary);
  });

  it("does not echo the value when a store error mentions the name", () => {
    addSecret(meta("dup"), canary);
    try {
      addSecret(meta("dup"), canary);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.message).toContain("dup");
      expect(e.message).not.toContain(canary);
    }
  });

  it("leaves no plaintext anywhere under the store root", () => {
    addSecret(meta("sweep"), canary);
    replaceSecret("sweep", `${canary}-rotated`);
    disableSecret("sweep");
    const files = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (f.isFile()) files.push(p);
      }
    };
    walk(tmp);
    for (const f of files) {
      if (f === keyFile) continue;
      expect(readFileSync(f, "utf8")).not.toContain(canary);
    }
    expect(files.length).toBeGreaterThan(1);
  });
});

// --- Concurrency and interruption -------------------------------------------

describe("concurrent changes and recovery after interruption", () => {
  it("serialises a concurrent replace and delete without a split store", () => {
    addSecret(meta("race"), canary);
    // The lock is process-wide and synchronous, so the real proof is that a
    // second mutation attempted while the lock is held fails loudly rather than
    // interleaving. Simulated by holding the lock from inside a fault hook.
    let inner = null;
    __faultHooks.beforeRegistryWrite = () => {
      if (inner === null) {
        inner = "attempted";
        try {
          removeSecret("race", { mustExist: true });
          inner = "succeeded";
        } catch (e) {
          inner = e.message;
        }
      }
    };
    // The OUTER mutation completes normally — that is the point. The inner one,
    // attempted while the lock was held, was refused rather than interleaved.
    replaceSecret("race", `${canary}-2`);
    __faultHooks.beforeRegistryWrite = null;
    expect(inner).toMatch(/busy|lock/i);
    expect(inner).not.toBe("succeeded");
    // No split store: exactly one coherent outcome survived.
    expect(readSecretValue("race")).toBe(`${canary}-2`);
    // 15s budget: the inner mutation deliberately waits out the full 5s store
    // lock timeout before failing. That wait IS the property under test.
  }, 15_000);

  it("recovers to the exact preimage when a delete is interrupted mid-way", () => {
    addSecret(meta("interrupt"), canary);
    addSecret(meta("bystander"), `${canary}-b`);
    const before = readFileSync(join(valuesDir(), "bystander"), "utf8");

    __faultHooks.afterRegistryWrite = () => { throw new Error("power loss"); };
    expect(() => removeSecret("interrupt", { mustExist: true })).toThrow(/power loss/);
    __faultHooks.afterRegistryWrite = null;

    // Both secrets survive, the interrupted one is still usable, and the
    // bystander's ciphertext is byte-identical.
    expect(readSecretValue("interrupt")).toBe(canary);
    expect(readFileSync(join(valuesDir(), "bystander"), "utf8")).toBe(before);
    expect(readdirSync(valuesDir()).filter((f) => f.startsWith(".tmp-"))).toEqual([]);
  });

  it("leaves the store usable after an interrupted add", () => {
    __faultHooks.beforeRegistryWrite = () => { throw new Error("power loss"); };
    expect(() => addSecret(meta("ghost"), canary)).toThrow(/power loss/);
    __faultHooks.beforeRegistryWrite = null;
    expect(readdirSync(valuesDir())).toEqual([]);
    // The store still works afterwards.
    addSecret(meta("after"), canary);
    expect(readSecretValue("after")).toBe(canary);
  });
});
