import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addSecret,
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
      ["consumer", "created", "expiry", "name", "owner", "purpose", "status", "type"],
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

describe("readSecretValue", () => {
  it("is the only path that returns secret material, and needs an active secret", () => {
    addSecret(META, SYNTHETIC);
    expect(readSecretValue(META.name)).toBe(SYNTHETIC);
    expect(() => readSecretValue("ghost")).toThrow(/no such secret/);
  });
});
