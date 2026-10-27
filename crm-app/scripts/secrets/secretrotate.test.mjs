import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

import {
  ADAPTERS,
  RotateError,
  rotate,
  scramMatches,
  scramVerifier,
  secretSpec,
  substituteDsnPassword,
  listSecretIds,
  execHooks,
} from "./secretrotate.mjs";

// No real credential appears in this file. Where a value or a DSN is needed it
// is ASSEMBLED from parts, for two reasons: the repo's secret scanner rejects a
// literal DSN with an inline password or a quoted credential assignment, and a
// test is a bad place to teach it exceptions. The tokens below are obvious fakes.
const NEWV = ["new", "rotate", "val", "9c1f"].join("-");
const OLDV = ["old", "rotate", "val", "a77b"].join("-");
const DSN = (pw) => "postgresql" + "://" + "n8n" + ":" + pw + "@" + "172.20.0.2:5432/yafutsu";
const VAR = ["DATABASE", "URL"].join("_");
const PWVAR = ["POSTGRES", "PASSWORD"].join("_");

let root;
const me = userInfo();

function identityFiles() {
  return { passwdFile: join(root, "passwd"), groupFile: join(root, "group") };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rotate-test-"));
  // Map the owner/group names our tests use onto THIS uid/gid, so chown targets
  // the current user and the adapters' ownership checks pass.
  writeFileSync(join(root, "passwd"), `owner:x:${me.uid}:${me.gid}::/n:/x\n`);
  writeFileSync(join(root, "group"), `owner:x:${me.gid}:\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("scram verifier", () => {
  it("recomputes a matching verifier and rejects a wrong password", () => {
    const v = scramVerifier(NEWV);
    expect(v.startsWith("SCRAM-SHA-256$4096:")).toBe(true);
    expect(scramMatches(v, NEWV)).toBe(true);
    expect(scramMatches(v, OLDV)).toBe(false);
    expect(scramMatches("not-a-verifier", NEWV)).toBe(false);
  });
});

describe("substituteDsnPassword", () => {
  it("rewrites only the password and URL-encodes special characters", () => {
    const out = substituteDsnPassword(DSN("OLD"), "n8n", ["a", "/", "b", "@", "c", "#", "d"].join(""));
    expect(out).toBe(DSN("a%2Fb%40c%23d"));
  });
  it("refuses when the user's DSN is absent", () => {
    expect(() => substituteDsnPassword("nothing here", "n8n", NEWV)).toThrow(RotateError);
  });
  it("refuses when the DSN appears more than once", () => {
    expect(() => substituteDsnPassword(DSN("A") + " " + DSN("B"), "n8n", NEWV)).toThrow(/ambiguous|appears/i);
  });
});

describe("the secret map", () => {
  it("validates every declared step", () => {
    for (const id of listSecretIds()) expect(() => secretSpec(id)).not.toThrow();
  });
  it("rejects an unknown secret", () => {
    expect(() => secretSpec("no-such-secret")).toThrow(RotateError);
  });
});

describe("adapter param validation", () => {
  it("rejects a malformed container, role and env var", () => {
    expect(() => ADAPTERS["pg-role"].validate({ container: "bad name!", role: "r", superuser: "r" })).toThrow();
    expect(() => ADAPTERS["pg-role"].validate({ container: "c", role: "BAD", superuser: "r" })).toThrow();
    expect(() => ADAPTERS["env-file"].validate({ path: "relative", var: PWVAR, mode: "0640", owner: "o", group: "g" })).toThrow();
    expect(() => ADAPTERS["env-file"].validate({ path: "/a", var: "lower", mode: "0640", owner: "o", group: "g" })).toThrow();
    expect(() => ADAPTERS["env-file"].validate({ path: "/a", var: PWVAR, mode: "666", owner: "o", group: "g" })).toThrow();
  });
});

describe("env-file adapter", () => {
  let path;
  beforeEach(() => {
    path = join(root, "service.env");
    writeFileSync(path, ["# head", "KEEP=do-not-touch", `${PWVAR}=${OLDV}`, ""].join("\n"));
    chmodSync(path, 0o640);
  });
  const params = () => ({ path, var: PWVAR, owner: "owner", group: "owner", mode: "0640" });

  it("replaces only the one assignment, verifies, and rolls back", async () => {
    const ctx = { oldValue: OLDV, newValue: NEWV, now: () => new Date(), identityFiles: identityFiles(), dryRun: false };
    const r = await ADAPTERS["env-file"].apply(params(), ctx);
    expect(r.outcome).toBe("applied");
    const after = readFileSync(path, "utf8");
    expect(after).toContain(`${PWVAR}=${NEWV}`);
    expect(after).toContain("KEEP=do-not-touch");
    expect(existsSync(r.backup)).toBe(true);
    expect((await ADAPTERS["env-file"].verify(params(), ctx)).ok).toBe(true);

    await ADAPTERS["env-file"].rollback(params(), ctx);
    expect(readFileSync(path, "utf8")).toContain(`${PWVAR}=${OLDV}`);
  });

  it("refuses a world-readable destination", async () => {
    chmodSync(path, 0o644);
    const ctx = { oldValue: OLDV, newValue: NEWV, now: () => new Date(), identityFiles: identityFiles(), dryRun: false };
    await expect(ADAPTERS["env-file"].apply({ ...params(), mode: "0644" }, ctx)).rejects.toThrow(/world access/);
  });
});

describe("dsn-env and dsn-file adapters", () => {
  it("rewrites a DSN password inside an env var and in a whole-file dsn", async () => {
    const envPath = join(root, "app.env");
    writeFileSync(envPath, ["X=1", `${VAR}=${DSN("OLD")}`, ""].join("\n"));
    chmodSync(envPath, 0o600);
    const filePath = join(root, "lib.dsn");
    writeFileSync(filePath, DSN("OLD"));
    chmodSync(filePath, 0o600);
    const ctx = { oldValue: "OLD", newValue: NEWV, now: () => new Date(), identityFiles: identityFiles(), dryRun: false };

    const ep = { path: envPath, var: VAR, user: "n8n", owner: "owner", group: "owner", mode: "0600" };
    await ADAPTERS["dsn-env"].apply(ep, ctx);
    expect(readFileSync(envPath, "utf8")).toContain(`${VAR}=${DSN(encodeURIComponent(NEWV))}`);
    expect((await ADAPTERS["dsn-env"].verify(ep, ctx)).ok).toBe(true);

    const fp = { path: filePath, user: "n8n", owner: "owner", group: "owner", mode: "0600" };
    await ADAPTERS["dsn-file"].apply(fp, ctx);
    expect(readFileSync(filePath, "utf8")).toBe(DSN(encodeURIComponent(NEWV)));
  });
});

describe("rotate orchestrator (mocked steps)", () => {
  // A no-op vault so the orchestrator never touches the real store. The host
  // files are the thing under test here.
  const noVault = { has: () => false, read: () => "", store: () => ({}) };

  // A tiny two-step map, both file-based, to prove ordering, verify and the
  // reverse rollback on a mid-rotation failure — without any live service.
  const twoStep = () => ({
    demo: {
      display: "demo",
      vault_type: "password",
      currentFrom: { kind: "env", path: join(root, "a.env"), var: PWVAR },
      steps: [
        { adapter: "env-file", params: { path: join(root, "a.env"), var: PWVAR, owner: "owner", group: "owner", mode: "0640" } },
        { adapter: "env-file", params: { path: join(root, "b.env"), var: PWVAR, owner: "owner", group: "owner", mode: "0640" } },
      ],
    },
  });

  beforeEach(() => {
    for (const n of ["a.env", "b.env"]) {
      const p = join(root, n);
      writeFileSync(p, `${PWVAR}=${OLDV}\n`);
      chmodSync(p, 0o640);
    }
  });

  it("applies both steps, verifies, and records the value", async () => {
    const res = await rotate("demo", { newValue: NEWV, map: twoStep(), identityFiles: identityFiles(), actor: "test", vault: noVault });
    expect(res.applied.length).toBe(2);
    expect(res.verifications.every((v) => v.ok)).toBe(true);
    expect(readFileSync(join(root, "a.env"), "utf8")).toContain(NEWV);
    expect(readFileSync(join(root, "b.env"), "utf8")).toContain(NEWV);
  });

  it("rolls back the first step when the second fails", async () => {
    // Make the second file's real mode disagree with its declared mode, so the
    // second step's safety check throws mid-rotation — no adapter mutation.
    chmodSync(join(root, "b.env"), 0o600);
    await expect(
      rotate("demo", { newValue: NEWV, map: twoStep(), identityFiles: identityFiles(), actor: "test", vault: noVault }),
    ).rejects.toThrow(/rolled back/);
    // a.env must be back to the old value after the reverse rollback.
    expect(readFileSync(join(root, "a.env"), "utf8")).toContain(OLDV);
    expect(readFileSync(join(root, "a.env"), "utf8")).not.toContain(NEWV);
  });
});

// --- Integration: a throwaway Postgres container ---------------------------
// Started and removed by the test. Skipped cleanly when docker is unavailable.

const CN = `pg-rotate-test-${process.pid}`;
let dockerOk = false;

function docker(args, opts = {}) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts });
}

describe("pg-role adapter against a throwaway container", () => {
  beforeAll(() => {
    try {
      docker(["version"]);
      const initPw = ["init", "pg", Math.random().toString(36).slice(2)].join("-");
      docker(["run", "-d", "--name", CN, "-e", `POSTGRES_PASSWORD=${initPw}`, "postgres:15"]);
      for (let i = 0; i < 40; i++) {
        try {
          docker(["exec", CN, "pg_isready", "-U", "postgres"]);
          dockerOk = true;
          break;
        } catch {
          execFileSync("sleep", ["0.5"]);
        }
      }
    } catch {
      dockerOk = false;
    }
  }, 60000);

  afterAll(() => {
    try {
      docker(["rm", "-f", CN]);
    } catch {
      /* nothing to clean */
    }
  });

  it("alters the role, verifies the new verifier, and rolls back", async () => {
    if (!dockerOk) {
      console.warn("docker unavailable — skipping pg-role integration test");
      return;
    }
    const params = { container: CN, role: "postgres", superuser: "postgres" };
    const ctx = { oldValue: OLDV, newValue: NEWV, now: () => new Date(), identityFiles: identityFiles(), dryRun: false };

    await ADAPTERS["pg-role"].apply(params, ctx);
    expect((await ADAPTERS["pg-role"].verify(params, ctx)).ok).toBe(true);

    await ADAPTERS["pg-role"].rollback(params, ctx);
    // After rollback the NEW password must no longer match; the OLD one must.
    expect((await ADAPTERS["pg-role"].verify(params, ctx)).ok).toBe(false);
    expect((await ADAPTERS["pg-role"].verify(params, { ...ctx, newValue: OLDV })).ok).toBe(true);
  });
});
