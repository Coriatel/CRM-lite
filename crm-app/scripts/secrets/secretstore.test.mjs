import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateKeyHex } from "./secretcrypto.mjs";
import {
  addSecret,
  assertNoSymlinkEscape,
  assertNotInsideRepository,
  assertRootNotSymlinked,
  assertSafeTargetFile,
  assertUsable,
  auditModes,
  copyValueAside,
  derivedStatus,
  disableSecret,
  isExpired,
  isValidSecretName,
  listSecrets,
  metadataList,
  readRegistry,
  readRegistryBytes,
  readSecretValue,
  registryPath,
  removeSecret,
  replaceSecret,
  restoreRegistryBytesPublic,
  restoreValueFrom,
  storeRoot,
  valuePathFor,
  valuesDir,
  withStoreLock,
  __faultHooks,
  DIR_MODE,
  FILE_MODE,
  MAX_REGISTRY_BYTES,
} from "./secretstore.mjs";

// Every value in this file is synthetic. No real credential is read, written,
// or asserted against anywhere in this suite.
const SYNTHETIC = "synthetic-value-not-a-real-credential-0001";
const SYNTHETIC_2 = "synthetic-replacement-value-0002";

const META = {
  name: "example-app-password",
  type: "password",
  purpose: "Synthetic fixture for the secret-store test suite",
  consumer: "none (test fixture)",
  owner: "devuserp",
  expiry: "2027-01-01",
};

const STORE_MODULE = join(dirname(fileURLToPath(import.meta.url)), "secretstore.mjs");

let tmp;
let keyFile;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "secretstore-test-"));
  process.env.SECRET_STORE_ROOT = tmp;
  keyFile = join(tmp, "test.key");
  writeFileSync(keyFile, generateKeyHex() + "\n", { mode: 0o400 });
  process.env.SECRET_KEY_FILE = keyFile;
});
afterEach(() => {
  delete process.env.SECRET_STORE_ROOT;
  delete process.env.SECRET_KEY_FILE;
  rmSync(tmp, { recursive: true, force: true });
});

// A byte-exact picture of the whole store, used to prove that a rollback
// restores the preimage rather than something merely equivalent.
function snapshotStore() {
  const snap = { registry: readRegistryBytes(), values: {} };
  if (existsSync(valuesDir())) {
    for (const f of readdirSync(valuesDir()).sort()) {
      snap.values[f] = readFileSync(join(valuesDir(), f), "utf8");
    }
  }
  return snap;
}

describe("isValidSecretName", () => {
  it("accepts lowercase kebab/dot/underscore names", () => {
    for (const n of ["windmill-token", "app.api_key", "a1", "x-1_2.3"]) {
      expect(isValidSecretName(n)).toBe(true);
    }
  });

  it("rejects path traversal in every spelling", () => {
    for (const n of ["..", "../etc/passwd", "a/../../b", "..foo", "foo..bar"]) {
      expect(isValidSecretName(n)).toBe(false);
    }
  });

  it("rejects separators, absolute paths and null bytes", () => {
    for (const n of ["a/b", "a\\b", "/etc/passwd", "a\0b", "./a"]) {
      expect(isValidSecretName(n)).toBe(false);
    }
  });

  it("rejects uppercase, spaces, empties and over-long names", () => {
    for (const n of ["Token", "my token", "", "a", "-lead", "x".repeat(65)]) {
      expect(isValidSecretName(n)).toBe(false);
    }
  });

  it("rejects non-strings", () => {
    for (const n of [null, undefined, 42, {}, ["a"]]) {
      expect(isValidSecretName(n)).toBe(false);
    }
  });
});

describe("valuePathFor", () => {
  it("resolves inside the values dir", () => {
    expect(valuePathFor("ok-name")).toBe(join(valuesDir(), "ok-name"));
  });

  it("throws rather than sanitising a traversal attempt", () => {
    expect(() => valuePathFor("../../etc/passwd")).toThrow(/invalid secret name/);
    expect(() => valuePathFor("/etc/passwd")).toThrow(/invalid secret name/);
  });

  // Review L2: the old message quoted the first 40 characters of the input, so
  // a value pasted into --name was disclosed in stderr and stack traces.
  it("never echoes any part of the rejected input", () => {
    const pasted = `${SYNTHETIC}-pasted-into-the-name-field`;
    try {
      valuePathFor(pasted);
      throw new Error("expected a rejection");
    } catch (e) {
      expect(e.message).toBe("invalid secret name");
      expect(e.message).not.toContain(SYNTHETIC);
      expect(e.stack ?? "").not.toContain(SYNTHETIC);
      for (const n of [8, 12, 20, 40]) {
        expect(e.message).not.toContain(pasted.slice(0, n));
      }
    }
  });
});

describe("addSecret", () => {
  it("writes the value to its own file with 0600 and the store dirs 0700", () => {
    const entry = addSecret(META, SYNTHETIC);
    expect(existsSync(entry.path)).toBe(true);
    expect(statSync(entry.path).mode & 0o777).toBe(FILE_MODE);
    expect(statSync(storeRoot()).mode & 0o777).toBe(DIR_MODE);
    expect(statSync(valuesDir()).mode & 0o777).toBe(DIR_MODE);
    expect(statSync(registryPath()).mode & 0o777).toBe(FILE_MODE);
    expect(auditModes()).toEqual([]);
  });

  it("stores the value verbatim and opaquely — no parsing, no trimming", () => {
    const awkward = "  value with spaces\nand a newline  ";
    addSecret({ ...META, name: "awkward" }, awkward);
    expect(readSecretValue("awkward")).toBe(awkward);
  });

  it("NEVER writes the raw value into the registry", () => {
    addSecret(META, SYNTHETIC);
    const raw = readFileSync(registryPath(), "utf8");
    expect(raw).not.toContain(SYNTHETIC);
    expect(raw).toContain(META.name);
    for (const s of readRegistry()) expect(Object.keys(s)).not.toContain("value");
  });

  it("strips a value field even if a caller smuggles one into the metadata", () => {
    addSecret({ ...META, value: SYNTHETIC, secret: SYNTHETIC }, SYNTHETIC);
    const raw = readFileSync(registryPath(), "utf8");
    expect(raw).not.toContain(SYNTHETIC);
  });

  it("rejects a repeated save rather than silently overwriting", () => {
    addSecret(META, SYNTHETIC);
    expect(() => addSecret(META, SYNTHETIC_2)).toThrow(/already exists/);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC);
    expect(readRegistry()).toHaveLength(1);
  });

  it("refuses an empty value", () => {
    expect(() => addSecret(META, "")).toThrow(/empty value/);
    expect(() => addSecret(META, undefined)).toThrow(/empty value/);
  });

  it("validates type, purpose, consumer, owner and expiry format", () => {
    expect(() => addSecret({ ...META, type: "bogus" }, SYNTHETIC)).toThrow(/invalid type/);
    expect(() => addSecret({ ...META, purpose: "  " }, SYNTHETIC)).toThrow(/purpose/);
    expect(() => addSecret({ ...META, consumer: "" }, SYNTHETIC)).toThrow(/consumer/);
    expect(() => addSecret({ ...META, owner: "" }, SYNTHETIC)).toThrow(/owner/);
    expect(() => addSecret({ ...META, expiry: "01/01/2027" }, SYNTHETIC)).toThrow(/expiry/);
  });

  it("refuses to create a secret whose name traverses out of the store", () => {
    expect(() => addSecret({ ...META, name: "../escaped" }, SYNTHETIC)).toThrow(/invalid secret name/);
    expect(existsSync(join(tmp, "..", "escaped"))).toBe(false);
  });

  it("leaves no stray temp file behind on success", () => {
    addSecret(META, SYNTHETIC);
    expect(readdirSync(valuesDir())).toEqual([META.name]);
    expect(readdirSync(storeRoot()).filter((f) => f.startsWith(".tmp-"))).toEqual([]);
  });
});

describe("replaceSecret", () => {
  it("replaces the value, keeping 0600 and the metadata", () => {
    const before = addSecret(META, SYNTHETIC);
    replaceSecret(META.name, SYNTHETIC_2);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC_2);
    expect(statSync(before.path).mode & 0o777).toBe(FILE_MODE);
    expect(readRegistry()[0].created).toBe(before.created);
    expect(readFileSync(registryPath(), "utf8")).not.toContain(SYNTHETIC_2);
  });

  it("throws for an unknown secret instead of creating one", () => {
    expect(() => replaceSecret("ghost", SYNTHETIC)).toThrow(/no such secret/);
    expect(existsSync(join(valuesDir(), "ghost"))).toBe(false);
  });
});

describe("disableSecret", () => {
  it("flips status to disabled and blocks value reads", () => {
    addSecret(META, SYNTHETIC);
    disableSecret(META.name);
    expect(listSecrets()[0].status).toBe("disabled");
    expect(() => readSecretValue(META.name)).toThrow(/not active/);
  });

  it("is metadata-only — the value file survives for owner-side rotation", () => {
    const entry = addSecret(META, SYNTHETIC);
    disableSecret(META.name);
    expect(existsSync(entry.path)).toBe(true);
  });
});

describe("listSecrets / metadataList", () => {
  it("derives expired status from the expiry date without mutating the registry", () => {
    addSecret({ ...META, expiry: "2020-01-01" }, SYNTHETIC);
    expect(listSecrets()[0].status).toBe("expired");
    expect(readRegistry()[0].status).toBe("active");
  });

  it("omits the filesystem path from the API-facing metadata", () => {
    addSecret(META, SYNTHETIC);
    const list = metadataList();
    expect(list[0]).not.toHaveProperty("path");
    expect(Object.keys(list[0]).sort()).toEqual(
      ["consumer", "created", "expiry", "name", "owner", "purpose", "status", "type", "updated"],
    );
  });

  it("produces metadata containing no secret material at all", () => {
    addSecret(META, SYNTHETIC);
    addSecret({ ...META, name: "second" }, SYNTHETIC_2);
    const serialised = JSON.stringify(metadataList());
    expect(serialised).not.toContain(SYNTHETIC);
    expect(serialised).not.toContain(SYNTHETIC_2);
  });

  it("returns an empty list for a fresh store", () => {
    expect(listSecrets()).toEqual([]);
    expect(metadataList()).toEqual([]);
  });
});

// --- Review M1: expiry must be enforced, not merely displayed ---------------
describe("M1 — expiry enforcement at the consumption boundary", () => {
  const EXPIRED = { ...META, name: "expired-token", expiry: "2020-01-01" };

  it("refuses to return a date-expired value even though the registry says active", () => {
    addSecret(EXPIRED, SYNTHETIC);
    // Precondition: this is exactly the state the old code returned a value for.
    expect(readRegistry()[0].status).toBe("active");
    expect(listSecrets()[0].status).toBe("expired");

    expect(() => readSecretValue("expired-token")).toThrow(/expired/);
  });

  it("enforces against the CURRENT time, not the stored status", () => {
    addSecret({ ...META, name: "future-token", expiry: "2027-01-01" }, SYNTHETIC);
    expect(readSecretValue("future-token", { now: new Date("2026-01-01T00:00:00Z") })).toBe(SYNTHETIC);
    expect(() => readSecretValue("future-token", { now: new Date("2030-01-01T00:00:00Z") })).toThrow(
      /expired/,
    );
  });

  it("treats the expiry day itself as still valid, and the next day as expired", () => {
    addSecret({ ...META, name: "boundary", expiry: "2026-06-15" }, SYNTHETIC);
    expect(readSecretValue("boundary", { now: new Date("2026-06-15T23:59:59Z") })).toBe(SYNTHETIC);
    expect(() => readSecretValue("boundary", { now: new Date("2026-06-16T00:00:00Z") })).toThrow(/expired/);
  });

  it("still refuses a disabled secret, and a secret with no expiry never expires", () => {
    addSecret({ ...META, name: "no-expiry", expiry: null }, SYNTHETIC);
    expect(readSecretValue("no-expiry", { now: new Date("2099-01-01T00:00:00Z") })).toBe(SYNTHETIC);
    disableSecret("no-expiry");
    expect(() => readSecretValue("no-expiry")).toThrow(/not active/);
  });

  it("exposes one shared predicate so UI and enforcement cannot drift apart", () => {
    const entry = { name: "x", status: "active", expiry: "2020-01-01" };
    const now = new Date("2026-08-11T00:00:00Z");
    expect(isExpired(entry, now)).toBe(true);
    expect(derivedStatus(entry, now)).toBe("expired");
    expect(() => assertUsable(entry, now)).toThrow(/expired/);
  });

  it("never discloses the value in the refusal", () => {
    addSecret(EXPIRED, SYNTHETIC);
    try {
      readSecretValue("expired-token");
      throw new Error("expected a refusal");
    } catch (e) {
      expect(e.message).not.toContain(SYNTHETIC);
      expect(e.stack ?? "").not.toContain(SYNTHETIC);
    }
  });
});

// --- Review M2: atomicity, locking, rollback --------------------------------
describe("M2 — atomic writes and crash safety", () => {
  it("an interrupted registry write preserves the previous valid registry exactly", () => {
    addSecret({ ...META, name: "keep-me" }, SYNTHETIC);
    const preimage = snapshotStore();

    // Fail at the exact moment a crash would: value staged, registry about to
    // advance. This is the ordering that used to strand an unregistered secret.
    __faultHooks.beforeRegistryWrite = () => {
      throw new Error("simulated crash during the registry write");
    };
    let threw = false;
    try {
      addSecret({ ...META, name: "should-not-survive" }, SYNTHETIC_2);
    } catch {
      threw = true;
    } finally {
      __faultHooks.beforeRegistryWrite = null;
    }

    expect(threw).toBe(true);
    expect(snapshotStore()).toEqual(preimage);
    expect(() => readRegistry()).not.toThrow();
  });

  it("leaves NO unregistered secret when the registry write fails after staging", () => {
    addSecret({ ...META, name: "keep-me" }, SYNTHETIC);
    __faultHooks.beforeRegistryWrite = () => {
      throw new Error("simulated crash during the registry write");
    };
    try {
      addSecret({ ...META, name: "orphan-candidate" }, SYNTHETIC_2);
    } catch {
      /* expected */
    } finally {
      __faultHooks.beforeRegistryWrite = null;
    }

    // The old implementation left values/orphan-candidate on disk, invisible to
    // list/audit/readSecretValue.
    expect(existsSync(join(valuesDir(), "orphan-candidate"))).toBe(false);
    expect(readdirSync(valuesDir())).toEqual(["keep-me"]);
    expect(readRegistry().map((s) => s.name)).toEqual(["keep-me"]);

    // And no staged temp file is left holding secret material under a name
    // nothing will ever clean up.
    expect(readdirSync(valuesDir()).filter((f) => f.startsWith(".tmp-"))).toEqual([]);
    expect(readdirSync(storeRoot()).filter((f) => f.startsWith(".tmp-"))).toEqual([]);
  });

  it("a crash during replace restores the previous value byte for byte", () => {
    addSecret(META, SYNTHETIC);
    const preimage = snapshotStore();

    __faultHooks.beforeRegistryWrite = () => {
      throw new Error("simulated crash after the value was swapped");
    };
    let threw = false;
    try {
      replaceSecret(META.name, SYNTHETIC_2);
    } catch {
      threw = true;
    } finally {
      __faultHooks.beforeRegistryWrite = null;
    }

    expect(threw).toBe(true);
    expect(snapshotStore()).toEqual(preimage);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC);
    expect(readdirSync(valuesDir())).toEqual([META.name]);
  });

  it("survives a stray temp file from a killed writer — the registry stays valid", () => {
    addSecret(META, SYNTHETIC);
    const preimage = snapshotStore();
    writeFileSync(join(storeRoot(), ".tmp-99999-1"), "{ truncated jso", { mode: 0o600 });
    expect(() => readRegistry()).not.toThrow();
    expect(readRegistry()).toHaveLength(1);
    expect(readRegistryBytes()).toBe(preimage.registry);
  });

  it("refuses a registry that is not a regular file", () => {
    addSecret(META, SYNTHETIC);
    rmSync(registryPath());
    symlinkSync("/dev/null", registryPath());
    expect(() => readRegistry()).toThrow(/symlink/);
  });

  it("refuses an implausibly large registry rather than parsing it", () => {
    addSecret(META, SYNTHETIC);
    writeFileSync(registryPath(), "x".repeat(MAX_REGISTRY_BYTES + 1), { mode: 0o600 });
    expect(() => readRegistry()).toThrow(/larger than/);
  });

  it("serialises mutations behind one bounded lock", () => {
    addSecret(META, SYNTHETIC);
    // While the lock is held, a second acquisition with a tiny budget must fail
    // explicitly rather than proceed and lose an update.
    withStoreLock(() => {
      expect(() => withStoreLock(() => "inner", { timeoutMs: 50 })).toThrow(/busy/);
    });
    // The lock is released afterwards.
    expect(withStoreLock(() => "ok")).toBe("ok");
  });
});

describe("M2 — concurrency loses zero successful updates", () => {
  it("records every add that reported success", async () => {
    const N = 8;
    const barrier = join(tmp, "go");
    const script = `
      import { addSecret } from ${JSON.stringify(STORE_MODULE)};
      import { existsSync } from "node:fs";
      const name = process.env.SECRET_NAME;
      while (!existsSync(process.env.BARRIER)) {}
      addSecret({
        name, type: "token", purpose: "concurrency probe",
        consumer: "none", owner: "test", expiry: null,
      }, "synthetic-concurrent-" + name);
    `;
    const children = [];
    for (let i = 0; i < N; i++) {
      children.push(
        spawn(process.execPath, ["--input-type=module", "-e", script], {
          env: {
            ...process.env,
            SECRET_STORE_ROOT: tmp,
            SECRET_NAME: `concurrent-${String(i).padStart(2, "0")}`,
            BARRIER: barrier,
          },
          stdio: "ignore",
        }),
      );
    }
    writeFileSync(barrier, "go");
    const exits = await Promise.all(
      children.map((c) => new Promise((resolve) => c.once("close", (code) => resolve(code)))),
    );

    const succeeded = exits.filter((code) => code === 0).length;
    const registered = readRegistry().map((s) => s.name);

    // The contract is not "all 8 succeed" — it is "every success is durable".
    // The old unlocked read-modify-write reported 6 successes and kept 1.
    expect(registered).toHaveLength(succeeded);
    expect(new Set(registered).size).toBe(registered.length);
    expect(succeeded).toBeGreaterThan(1);
    // Nothing was corrupted along the way.
    expect(() => readRegistry()).not.toThrow();
  }, 30_000);
});

describe("M2 — defined rollback for create, replace and disable", () => {
  it("create rolls back to the exact preimage", () => {
    addSecret({ ...META, name: "pre-existing" }, SYNTHETIC);
    const preimage = snapshotStore();

    addSecret({ ...META, name: "added-then-rolled-back" }, SYNTHETIC_2);
    expect(snapshotStore()).not.toEqual(preimage);

    removeSecret("added-then-rolled-back");
    restoreRegistryBytesPublic(preimage.registry);
    expect(snapshotStore()).toEqual(preimage);
  });

  it("replace rolls back to the exact preimage", () => {
    addSecret(META, SYNTHETIC);
    const preimage = snapshotStore();
    const aside = join(tmp, "value-preimage");
    copyValueAside(META.name, aside);

    replaceSecret(META.name, SYNTHETIC_2);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC_2);

    restoreValueFrom(META.name, aside);
    restoreRegistryBytesPublic(preimage.registry);
    rmSync(aside);
    expect(snapshotStore()).toEqual(preimage);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC);
  });

  it("disable rolls back to the exact preimage", () => {
    addSecret(META, SYNTHETIC);
    const preimage = snapshotStore();

    disableSecret(META.name);
    expect(listSecrets()[0].status).toBe("disabled");

    restoreRegistryBytesPublic(preimage.registry);
    expect(snapshotStore()).toEqual(preimage);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC);
  });
});

// --- Review M3: hardlink containment ----------------------------------------
describe("M3 — hardlink escape is contained", () => {
  it("does not modify an external file hardlinked to a stored value", () => {
    addSecret(META, SYNTHETIC);
    const outside = join(tmp, "outside-hardlink-target");
    writeFileSync(outside, "outside-baseline", { mode: 0o600 });

    // Plant the hardlink exactly as the reviewer's probe did.
    rmSync(valuePathFor(META.name));
    linkSync(outside, valuePathFor(META.name));

    // Either the write is refused outright (link count check) or it goes
    // through a rename onto a fresh inode. Both outcomes leave `outside`
    // untouched; the old code wrote the value straight into it.
    try {
      replaceSecret(META.name, SYNTHETIC_2);
    } catch {
      /* refusal is an acceptable outcome */
    }
    expect(readFileSync(outside, "utf8")).toBe("outside-baseline");
    expect(readFileSync(outside, "utf8")).not.toContain(SYNTHETIC_2);
  });

  it("refuses a target whose link count is not 1", () => {
    addSecret(META, SYNTHETIC);
    const outside = join(tmp, "second-link");
    linkSync(valuePathFor(META.name), outside);
    expect(lstatSync(valuePathFor(META.name)).nlink).toBe(2);
    expect(() => assertSafeTargetFile(valuePathFor(META.name))).toThrow(/link count/);
    expect(() => replaceSecret(META.name, SYNTHETIC_2)).toThrow(/link count/);
  });

  it("refuses a target that is not a regular file", () => {
    mkdirSync(valuesDir(), { recursive: true, mode: DIR_MODE });
    mkdirSync(join(valuesDir(), "a-directory"), { mode: DIR_MODE });
    expect(() => assertSafeTargetFile(join(valuesDir(), "a-directory"))).toThrow(/not a regular file/);
  });

  it("writes a fresh inode on replace, so old hardlinks keep the old content", () => {
    addSecret(META, SYNTHETIC);
    const inodeBefore = statSync(valuePathFor(META.name)).ino;
    replaceSecret(META.name, SYNTHETIC_2);
    expect(statSync(valuePathFor(META.name)).ino).not.toBe(inodeBefore);
  });
});

describe("symlink escape", () => {
  it("refuses to write through a symlinked value file", () => {
    addSecret(META, SYNTHETIC);
    const target = join(tmp, "outside-target");
    writeFileSync(target, "pre-existing");
    rmSync(join(valuesDir(), META.name));
    symlinkSync(target, join(valuesDir(), META.name));
    expect(() => replaceSecret(META.name, SYNTHETIC_2)).toThrow(/symlink/);
    expect(readFileSync(target, "utf8")).toBe("pre-existing");
  });

  it("refuses when the values directory itself is a symlink", () => {
    const realRoot = mkdtempSync(join(tmpdir(), "secretstore-real-"));
    const elsewhere = mkdtempSync(join(tmpdir(), "secretstore-elsewhere-"));
    try {
      process.env.SECRET_STORE_ROOT = realRoot;
      mkdirSync(join(elsewhere, "values"), { recursive: true });
      symlinkSync(join(elsewhere, "values"), join(realRoot, "values"));
      expect(() => assertNoSymlinkEscape("x")).toThrow(/symlink/);
    } finally {
      process.env.SECRET_STORE_ROOT = tmp;
      rmSync(realRoot, { recursive: true, force: true });
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  // Review L3: initStore() used to follow a symlinked root, chmod the target to
  // 0700 and create registry.json inside it.
  it("refuses a symlinked store root outright", () => {
    const parent = mkdtempSync(join(tmpdir(), "secretstore-rootlink-"));
    try {
      const target = join(parent, "target");
      const link = join(parent, "store-link");
      mkdirSync(target, { mode: 0o755 });
      symlinkSync(target, link);
      process.env.SECRET_STORE_ROOT = link;

      expect(() => assertRootNotSymlinked(link)).toThrow(/symlink/);
      expect(() => addSecret(META, SYNTHETIC)).toThrow(/symlink/);

      // The target was not mutated.
      expect(statSync(target).mode & 0o777).toBe(0o755);
      expect(existsSync(join(target, "registry.json"))).toBe(false);
    } finally {
      process.env.SECRET_STORE_ROOT = tmp;
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("repository-path rejection", () => {
  it("refuses a store located inside a git working tree", () => {
    const repo = mkdtempSync(join(tmpdir(), "secretstore-repo-"));
    try {
      mkdirSync(join(repo, ".git"), { recursive: true });
      mkdirSync(join(repo, "nested", "deep"), { recursive: true });
      expect(() => assertNotInsideRepository(join(repo, "nested", "deep"))).toThrow(
        /inside a git repository/,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("accepts a store outside any repository", () => {
    expect(() => assertNotInsideRepository(tmp)).not.toThrow();
  });

  // The real store on this host lives inside the /home/devuserp repo, so the
  // gitignored escape hatch is load-bearing, not decorative.
  it("tolerates a store inside a repository when git confirms it is ignored", () => {
    const repo = mkdtempSync(join(tmpdir(), "secretstore-realrepo-"));
    try {
      spawnSync("git", ["init", "-q", repo]);
      const store = join(repo, ".secrets");
      mkdirSync(store, { recursive: true });

      expect(() => assertNotInsideRepository(store)).toThrow(/gitignored/);

      writeFileSync(join(repo, ".gitignore"), "/.secrets/\n");
      expect(() => assertNotInsideRepository(store)).not.toThrow();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("updated timestamp", () => {
  it("is set on create and advanced by replace and disable", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    addSecret(META, SYNTHETIC, { now: t0 });
    expect(readRegistry()[0].updated).toBe(t0.toISOString());

    const t1 = new Date("2026-02-02T00:00:00Z");
    replaceSecret(META.name, SYNTHETIC_2, { now: t1 });
    expect(readRegistry()[0].updated).toBe(t1.toISOString());
    expect(readRegistry()[0].created).toBe("2026-01-01");

    const t2 = new Date("2026-03-03T00:00:00Z");
    disableSecret(META.name, { now: t2 });
    expect(readRegistry()[0].updated).toBe(t2.toISOString());
  });
});

// Prove a synthetic value cannot surface on any operator-visible channel.
// stdout/stderr are captured rather than trusted by inspection.
describe("no synthetic value reaches an observable channel", () => {
  it("never appears in registry, metadata, or the store's own listing output", () => {
    addSecret(META, SYNTHETIC);
    expect(readFileSync(registryPath(), "utf8")).not.toContain(SYNTHETIC);
    expect(JSON.stringify(metadataList())).not.toContain(SYNTHETIC);
    expect(JSON.stringify(listSecrets())).not.toContain(SYNTHETIC);
  });

  it("never appears in an error message, even when the value causes the failure", () => {
    addSecret(META, SYNTHETIC);
    try {
      addSecret(META, SYNTHETIC);
      throw new Error("expected a duplicate-name rejection");
    } catch (e) {
      expect(e.message).not.toContain(SYNTHETIC);
      expect(e.stack ?? "").not.toContain(SYNTHETIC);
    }
  });

  it("is absent from this suite's own console output", () => {
    const seen = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...a) => seen.push(a.join(" "));
    console.error = (...a) => seen.push(a.join(" "));
    try {
      addSecret(META, SYNTHETIC);
      listSecrets();
      metadataList();
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    expect(seen.join("\n")).not.toContain(SYNTHETIC);
  });
});

describe("readSecretValue", () => {
  it("is the only path that returns secret material, and needs an active secret", () => {
    addSecret(META, SYNTHETIC);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC);
    expect(() => readSecretValue("ghost")).toThrow(/no such secret/);
  });
});

// --- delete: the canonical, supported removal verb ---------------------------
//
// Before this existed, a created secret could only be `disable`d — nothing in
// the CLI or API could remove it, so the first production acceptance test would
// have been irreversible through supported interfaces.
describe("removeSecret — canonical delete", () => {
  const OTHER = { ...META, name: "unrelated-secret", purpose: "must survive every delete" };

  function seedTwo() {
    addSecret(META, SYNTHETIC);
    addSecret(OTHER, SYNTHETIC_2);
    return readRegistryBytes();
  }

  function untouched(name) {
    return {
      inRegistry: readRegistry().some((s) => s.name === name),
      valueExists: existsSync(valuePathFor(name)),
    };
  }

  it("removes value file and registry entry, leaving the store empty", () => {
    addSecret(META, SYNTHETIC);
    expect(existsSync(valuePathFor(META.name))).toBe(true);

    const meta = removeSecret(META.name, { mustExist: true });
    expect(meta.name).toBe(META.name);

    expect(readRegistry()).toHaveLength(0);
    expect(existsSync(valuePathFor(META.name))).toBe(false);
    expect(readdirSync(valuesDir())).toHaveLength(0);
  });

  it("deletes a disabled secret", () => {
    addSecret(META, SYNTHETIC);
    disableSecret(META.name);
    expect(readRegistry()[0].status).toBe("disabled");

    removeSecret(META.name, { mustExist: true });
    expect(readRegistry()).toHaveLength(0);
    expect(readdirSync(valuesDir())).toHaveLength(0);
  });

  it("fails truthfully on an unknown secret and changes nothing", () => {
    const before = seedTwo();
    expect(() => removeSecret("no-such-name", { mustExist: true })).toThrow(/no such secret/);
    expect(readRegistryBytes()).toEqual(before);
    expect(readdirSync(valuesDir()).sort()).toHaveLength(2);
  });

  it("still tolerates an unknown name for the operator rollback path", () => {
    // mustExist defaults to false: `create` rollback calls this without knowing
    // how far the half-finished create actually got.
    expect(() => removeSecret("never-existed")).not.toThrow();
  });

  it("preserves unrelated secrets byte-for-byte", () => {
    seedTwo();
    const otherValueBefore = readFileSync(valuePathFor(OTHER.name));
    const otherEntryBefore = JSON.stringify(readRegistry().find((s) => s.name === OTHER.name));

    removeSecret(META.name, { mustExist: true });

    expect(readFileSync(valuePathFor(OTHER.name))).toEqual(otherValueBefore);
    expect(JSON.stringify(readRegistry().find((s) => s.name === OTHER.name))).toBe(otherEntryBefore);
    expect(readSecretValue(OTHER.name)).toBe(SYNTHETIC_2);
  });

  it("rolls back completely when the registry write fails (no split state)", () => {
    const before = seedTwo();
    __faultHooks.beforeRegistryWrite = () => { throw new Error("injected registry failure"); };
    try {
      expect(() => removeSecret(META.name, { mustExist: true })).toThrow(/injected/);
    } finally {
      __faultHooks.beforeRegistryWrite = null;
    }
    // Neither an orphan value nor orphan metadata: exactly the preimage.
    expect(readRegistryBytes()).toEqual(before);
    expect(existsSync(valuePathFor(META.name))).toBe(true);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC);
    expect(untouched(OTHER.name)).toEqual({ inRegistry: true, valueExists: true });
  });

  it("rolls back completely when finalisation fails after the registry write", () => {
    const before = seedTwo();
    __faultHooks.afterRegistryWrite = () => { throw new Error("injected finalisation failure"); };
    try {
      expect(() => removeSecret(META.name, { mustExist: true })).toThrow(/injected/);
    } finally {
      __faultHooks.afterRegistryWrite = null;
    }
    expect(readRegistryBytes()).toEqual(before);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC);
  });

  it("leaves no staged temp file behind on success or on failure", () => {
    addSecret(META, SYNTHETIC);
    removeSecret(META.name, { mustExist: true });
    expect(readdirSync(valuesDir()).filter((f) => f.startsWith(".tmp-"))).toHaveLength(0);

    addSecret(META, SYNTHETIC);
    __faultHooks.beforeRegistryWrite = () => { throw new Error("injected"); };
    try {
      expect(() => removeSecret(META.name, { mustExist: true })).toThrow();
    } finally {
      __faultHooks.beforeRegistryWrite = null;
    }
    expect(readdirSync(valuesDir()).filter((f) => f.startsWith(".tmp-"))).toHaveLength(0);
  });

  it("is not a generic filesystem removal: traversal and absolute names are refused", () => {
    addSecret(META, SYNTHETIC);
    const outside = join(tmp, "bystander-file");
    writeFileSync(outside, "must survive");

    // Asserted on BOTH paths. With mustExist the name must be rejected as an
    // invalid name, not merely as "no such secret" — otherwise the containment
    // guard would be unreachable whenever the registry lookup happens to miss.
    for (const bad of ["../bystander-file", "../../etc/passwd", "/etc/passwd", "a/b", "."]) {
      expect(() => removeSecret(bad, { mustExist: true })).toThrow(/invalid secret name|escapes/);
      expect(() => removeSecret(bad)).toThrow(/invalid secret name|escapes/);
    }
    expect(existsSync(outside)).toBe(true);
    expect(readRegistry()).toHaveLength(1);
  });

  it("refuses to delete through a symlink and leaves the target intact", () => {
    addSecret(META, SYNTHETIC);
    const outside = join(tmp, "outside-target");
    writeFileSync(outside, "must survive");

    // Plant a symlink where a secret's value file would live.
    const planted = "planted-link";
    symlinkSync(outside, join(valuesDir(), planted));

    expect(() => removeSecret(planted)).toThrow(/symlink/);
    expect(existsSync(outside)).toBe(true);
    expect(readFileSync(outside, "utf8")).toBe("must survive");
  });

  it("never returns or prints the deleted value", () => {
    addSecret(META, SYNTHETIC);
    const meta = removeSecret(META.name, { mustExist: true });
    expect(JSON.stringify(meta)).not.toContain(SYNTHETIC);
  });
});

// --- replace on a disabled secret: intentional, not accidental ---------------
describe("replace while disabled", () => {
  it("rotates the value, keeps the secret disabled, and keeps consumption refused", () => {
    addSecret(META, SYNTHETIC);
    disableSecret(META.name);

    const entry = replaceSecret(META.name, SYNTHETIC_2);

    // The value really did rotate...
    expect(entry.status).toBe("disabled");
    expect(readRegistry()[0].status).toBe("disabled");
    // ...but nothing may consume it while it is disabled. There is deliberately
    // no `enable` verb in this slice, so this is a one-way door until one exists.
    expect(() => readSecretValue(META.name)).toThrow(/not active/);
  });
});

// --- CLI: the delete verb exists and is wired to the same primitive ----------
describe("secretsctl delete", () => {
  const CLI = join(dirname(fileURLToPath(import.meta.url)), "secretsctl.mjs");

  function cli(args) {
    return spawnSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      env: { ...process.env, SECRET_STORE_ROOT: tmp },
    });
  }

  it("deletes a named secret and reports metadata only", () => {
    addSecret(META, SYNTHETIC);
    const r = cli(["delete", "--name", META.name]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`deleted: ${META.name}`);
    expect(r.stdout + r.stderr).not.toContain(SYNTHETIC);
    expect(readRegistry()).toHaveLength(0);
    expect(readdirSync(valuesDir())).toHaveLength(0);
  });

  it("fails on an unknown secret without touching the store", () => {
    addSecret(META, SYNTHETIC);
    const r = cli(["delete", "--name", "no-such-name"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no such secret/);
    expect(readRegistry()).toHaveLength(1);
  });

  it("rejects unknown flags and bulk-ish input", () => {
    expect(cli(["delete", "--all"]).status).toBe(1);
    expect(cli(["delete", META.name]).status).toBe(1); // positional not accepted
    expect(cli(["delete"]).status).toBe(1); // --name required
  });
});
