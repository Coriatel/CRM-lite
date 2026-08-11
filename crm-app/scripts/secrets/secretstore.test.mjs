import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addSecret,
  assertNoSymlinkEscape,
  assertNotInsideRepository,
  auditModes,
  disableSecret,
  isValidSecretName,
  listSecrets,
  opsProjection,
  readRegistry,
  readSecretValue,
  registryPath,
  replaceSecret,
  storeRoot,
  valuePathFor,
  valuesDir,
  DIR_MODE,
  FILE_MODE,
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

let tmp;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "secretstore-test-"));
  process.env.SECRET_STORE_ROOT = tmp;
});
afterEach(() => {
  delete process.env.SECRET_STORE_ROOT;
  rmSync(tmp, { recursive: true, force: true });
});

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

  it("never leaks the attempted name in full in the error message", () => {
    const long = "/etc/" + "x".repeat(200);
    expect(() => valuePathFor(long)).toThrow();
    try {
      valuePathFor(long);
    } catch (e) {
      expect(e.message.length).toBeLessThan(80);
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

  it("validates type, purpose, consumer and expiry format", () => {
    expect(() => addSecret({ ...META, type: "bogus" }, SYNTHETIC)).toThrow(/invalid type/);
    expect(() => addSecret({ ...META, purpose: "  " }, SYNTHETIC)).toThrow(/purpose/);
    expect(() => addSecret({ ...META, consumer: "" }, SYNTHETIC)).toThrow(/consumer/);
    expect(() => addSecret({ ...META, expiry: "01/01/2027" }, SYNTHETIC)).toThrow(/expiry/);
  });

  it("refuses to create a secret whose name traverses out of the store", () => {
    expect(() => addSecret({ ...META, name: "../escaped" }, SYNTHETIC)).toThrow(/invalid secret name/);
    expect(existsSync(join(tmp, "..", "escaped"))).toBe(false);
  });
});

describe("replaceSecret", () => {
  it("overwrites the value in place, keeping 0600 and the metadata", () => {
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

describe("listSecrets / opsProjection", () => {
  it("derives expired status from the expiry date without mutating the registry", () => {
    addSecret({ ...META, expiry: "2020-01-01" }, SYNTHETIC);
    expect(listSecrets()[0].status).toBe("expired");
    expect(readRegistry()[0].status).toBe("active");
  });

  it("omits the filesystem path from the browser-facing projection", () => {
    addSecret(META, SYNTHETIC);
    const proj = opsProjection();
    expect(proj.secrets[0]).not.toHaveProperty("path");
    expect(Object.keys(proj.secrets[0]).sort()).toEqual(
      ["consumer", "created", "expiry", "name", "owner", "purpose", "status", "type", "updated"],
    );
  });

  it("produces a projection containing no secret material at all", () => {
    addSecret(META, SYNTHETIC);
    addSecret({ ...META, name: "second" }, SYNTHETIC_2);
    const serialised = JSON.stringify(opsProjection());
    expect(serialised).not.toContain(SYNTHETIC);
    expect(serialised).not.toContain(SYNTHETIC_2);
  });

  it("returns an empty list for a fresh store", () => {
    expect(listSecrets()).toEqual([]);
    expect(opsProjection().secrets).toEqual([]);
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

// Item 8: prove a synthetic value cannot surface on any operator-visible
// channel. stdout/stderr are captured rather than trusted by inspection.
describe("no synthetic value reaches an observable channel", () => {
  it("never appears in registry, projection, or the store's own listing output", () => {
    addSecret(META, SYNTHETIC);
    expect(readFileSync(registryPath(), "utf8")).not.toContain(SYNTHETIC);
    expect(JSON.stringify(opsProjection())).not.toContain(SYNTHETIC);
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
      opsProjection();
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
