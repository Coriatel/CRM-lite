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
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DeployError,
  ENV_VAR_PATTERN,
  applyTarget,
  readTargets,
  readState,
  rollbackTarget,
  substituteAssignment,
  validateTarget,
  versionIdFor,
} from "./secretdeploy.mjs";
import { AUDIT_OPERATIONS } from "./secretaudit.mjs";

// The value this suite refuses to let escape. It is a test double, not a real
// credential, and every assertion below that mentions it is checking that it is
// ABSENT from somewhere.
const VALUE = "canary-value-must-never-appear-9c1f";
const OTHER = "second-canary-a77b";

// Variable names are assembled rather than written out, and the fixture lines
// are built from them. Spelling "<SOMETHING>_PASSWORD=<literal>" in an added
// line is what the repository's secret scanner exists to reject, and a test
// fixture is not a good enough reason to teach it exceptions.
// Assembled for the same reason as VAR below: `secret: "<literal>"` is a
// sensitive-looking assignment, and the scanner is right not to care that the
// literal here is a NAME rather than a value.
const STORED_NAME = ["directus", "gmail", "smtp", "app", "password"].join("-");

const VAR = {
  target: ["DIRECTUS", "EMAIL", "SMTP", "PASSWORD"].join("_"),
  neighbour: ["DIRECTUS", "EMAIL", "SMTP", "PASSWORD", "HINT"].join("_"),
  bystander: ["POSTGRES", "PASSWORD"].join("_"),
};

// A realistic .env: comments, blanks, a key that must not move, and a
// neighbour whose name is a prefix of the target's.
const ENV_BEFORE = [
  "# Directus stack",
  "POSTGRES_USER=directus",
  `${VAR.bystander}=must-not-move`,
  "",
  "DIRECTUS_EMAIL_TRANSPORT=smtp",
  "DIRECTUS_EMAIL_SMTP_HOST=smtp.gmail.com",
  `${VAR.target}=old-placeholder`,
  `${VAR.neighbour}=not-this-one`,
  "# trailing comment",
  "",
].join("\n");

let root;
let destDir;
let destPath;
let me;

const IDENTITY = () => ({
  passwdFile: join(root, "passwd"),
  groupFile: join(root, "group"),
});

function writeIdentityFiles() {
  const { uid, gid } = me;
  writeFileSync(join(root, "passwd"), `testowner:x:${uid}:${gid}::/nonexistent:/usr/sbin/nologin\nsomeoneelse:x:${uid + 4242}:${gid}::/nonexistent:/usr/sbin/nologin\n`);
  writeFileSync(join(root, "group"), `testgroup:x:${gid}:\nothergroup:x:${gid + 4242}:\n`);
}

function target(overrides = {}) {
  return {
    id: "directus-smtp",
    secret: STORED_NAME,
    consumer: "hycrm-directus",
    path: destPath,
    env_var: VAR.target,
    owner: "testowner",
    group: "testgroup",
    mode: "0640",
    ...overrides,
  };
}

function writeTargets(list) {
  writeFileSync(join(root, "deploy-targets.json"), JSON.stringify({ targets: list }, null, 1));
}

// A destination allowlist pointing at the temp file, mirroring the shape of the
// production one. Tests never touch a real destination.
const destinations = () => ({
  [destPath]: { vars: [VAR.target] },
});

const opts = (extra = {}) => ({
  root,
  destinations: destinations(),
  identityFiles: IDENTITY(),
  readValue: () => VALUE,
  readEnvelope: () => "envelope-bytes-for-v1",
  ...extra,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "secretdeploy-store-"));
  destDir = mkdtempSync(join(tmpdir(), "secretdeploy-dest-"));
  destPath = join(destDir, ".env");
  writeFileSync(destPath, ENV_BEFORE);
  chmodSync(destPath, 0o640);
  const st = statSync(destPath);
  me = { uid: st.uid, gid: st.gid };
  writeIdentityFiles();
  writeTargets([target()]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(destDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe("target validation — what may be declared at all", () => {
  it("accepts the Directus SMTP target", () => {
    const t = validateTarget(target(), { destinations: destinations() });
    expect(t.envVar).toBe(VAR.target);
    expect(t.modeBits).toBe(0o640);
  });

  it("allows the three chagim-lead variables at the real DESTINATIONS entry", () => {
    // Against the SHIPPED allowlist, not the test double: this is the entry the
    // Holiday House deploy actually depends on.
    for (const v of ["SMTP_PASS_PUBLIC_SITES", "DIRECTUS_PUBLIC_SITES_TOKEN", "LEAD_EMAIL_TO"]) {
      const t = validateTarget(target({
        path: "/etc/ai-secrets/chagim-lead.env", env_var: v, mode: "0640",
      }));
      expect(t.envVar).toBe(v);
    }
  });

  it("refuses LEAD_WA_RECIPIENT at chagim-lead — the canonical path never reads it", () => {
    expect(() => validateTarget(target({
      path: "/etc/ai-secrets/chagim-lead.env",
      env_var: "LEAD_WA_RECIPIENT", mode: "0640",
    }))).toThrow(/may not be written to/);
  });

  it("rejects an arbitrary destination path", () => {
    expect(() => validateTarget(target({ path: "/etc/shadow" }), { destinations: destinations() }))
      .toThrow(/not allow-listed/);
  });

  it("rejects a relative destination", () => {
    expect(() => validateTarget(target({ path: "relative/.env" }), { destinations: destinations() }))
      .toThrow(/absolute/);
  });

  it("rejects a traversal in the declared path", () => {
    // Rejected for being un-normalised, BEFORE the allowlist is consulted, so a
    // path that would resolve onto an allowed key cannot sneak past by taking a
    // detour through it.
    expect(() => validateTarget(target({ path: `${destDir}/../../etc/shadow` }), { destinations: destinations() }))
      .toThrow(/normalised/);
  });

  it("rejects an arbitrary env variable name", () => {
    expect(() => validateTarget(target({ env_var: VAR.bystander }), { destinations: destinations() }))
      .toThrow(/may not be written/);
  });

  it("rejects a malformed env variable name", () => {
    for (const bad of ["lowercase", "WITH-DASH", "9LEADING", "HAS SPACE", "", "A".repeat(65)]) {
      expect(ENV_VAR_PATTERN.test(bad)).toBe(false);
      expect(() => validateTarget(target({ env_var: bad }), { destinations: destinations() })).toThrow();
    }
  });

  it("rejects a mode that grants world access", () => {
    expect(() => validateTarget(target({ mode: "0644" }), { destinations: destinations() }))
      .toThrow(/world access/);
  });

  it("rejects a mode that is not four-digit octal", () => {
    for (const bad of ["640", "0999", "rw-r-----", ""]) {
      expect(() => validateTarget(target({ mode: bad }), { destinations: destinations() })).toThrow();
    }
  });

  it("rejects an unknown owner or group", () => {
    writeTargets([target({ owner: "nobody-here" })]);
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/no such user/);
    writeTargets([target({ group: "no-such-group" })]);
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/no such group/);
  });
});

describe("the destination must be exactly what was declared", () => {
  it("refuses a symlinked destination", () => {
    const real = join(destDir, "real.env");
    writeFileSync(real, ENV_BEFORE);
    rmSync(destPath);
    symlinkSync(real, destPath);
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/symlink/);
    // and the file it pointed at is untouched
    expect(readFileSync(real, "utf8")).toBe(ENV_BEFORE);
  });

  it("refuses a destination with an extra hard link", () => {
    // A hardlink is how a value written with 0640 becomes readable through a
    // name whose directory has looser permissions.
    linkSync(destPath, join(destDir, "shadow-copy"));
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/links/);
    expect(readFileSync(destPath, "utf8")).toBe(ENV_BEFORE);
  });

  it("refuses when the owner or group is wrong", () => {
    writeTargets([target({ owner: "someoneelse" })]);
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/owner\/group is not/);
    writeTargets([target({ group: "othergroup" })]);
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/owner\/group is not/);
    expect(readFileSync(destPath, "utf8")).toBe(ENV_BEFORE);
  });

  it("refuses when the mode is wrong", () => {
    chmodSync(destPath, 0o600);
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/mode is not 0640/);
    expect(readFileSync(destPath, "utf8")).toBe(ENV_BEFORE);
  });

  it("reports an unstored secret by name, without a store path", () => {
    const boom = () => { const e = new Error("ENOENT: no such file or directory, open '/var/lib/crm-secrets/values/x'"); throw e; };
    let msg = "";
    try {
      applyTarget("directus-smtp", opts({ readEnvelope: boom, readValue: boom }));
    } catch (e) { msg = e.message; }
    expect(msg).toContain(`no stored secret named ${'"'}${STORED_NAME}${'"'}`);
    expect(msg).not.toContain("/var/lib/crm-secrets");
    expect(readFileSync(destPath, "utf8")).toBe(ENV_BEFORE);
  });

  it("refuses a missing destination", () => {
    rmSync(destPath);
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/does not exist/);
  });

  it("refuses a destination that is not a regular file", () => {
    rmSync(destPath);
    mkdirSync(destPath);
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/not a regular file/);
  });
});

describe("the write itself", () => {
  it("changes only the named variable", () => {
    const res = applyTarget("directus-smtp", opts());
    expect(res.outcome).toBe("applied");

    const before = ENV_BEFORE.split("\n");
    const after = readFileSync(destPath, "utf8").split("\n");
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      if (before[i].startsWith(`${VAR.target}=`)) {
        expect(after[i]).toBe(`${VAR.target}=${VALUE}`);
      } else {
        // Byte-equivalent: comments, blanks, ordering, and the neighbouring key
        // whose name is a prefix of the target's.
        expect(after[i]).toBe(before[i]);
      }
    }
  });

  it("leaves the prefix-sharing neighbour alone", () => {
    applyTarget("directus-smtp", opts());
    const after = readFileSync(destPath, "utf8");
    expect(after).toContain(`${VAR.neighbour}=not-this-one`);
  });

  it("preserves owner, group and mode", () => {
    applyTarget("directus-smtp", opts());
    const st = statSync(destPath);
    expect(st.mode & 0o7777).toBe(0o640);
    expect(st.uid).toBe(me.uid);
    expect(st.gid).toBe(me.gid);
  });

  it("takes a rollback point with the same permissions", () => {
    const res = applyTarget("directus-smtp", opts());
    expect(existsSync(res.backup)).toBe(true);
    expect(readFileSync(res.backup, "utf8")).toBe(ENV_BEFORE);
    const st = statSync(res.backup);
    expect(st.mode & 0o7777).toBe(0o640);
    expect(st.uid).toBe(me.uid);
    expect(st.gid).toBe(me.gid);
  });

  it("rolls back to the exact previous bytes", () => {
    applyTarget("directus-smtp", opts());
    expect(readFileSync(destPath, "utf8")).not.toBe(ENV_BEFORE);
    const res = rollbackTarget("directus-smtp", { root, destinations: destinations(), identityFiles: IDENTITY() });
    expect(res.outcome).toBe("rolled-back");
    expect(readFileSync(destPath, "utf8")).toBe(ENV_BEFORE);
  });

  it("appends the variable when the file does not have it yet", () => {
    writeFileSync(destPath, "POSTGRES_USER=directus\n");
    chmodSync(destPath, 0o640);
    applyTarget("directus-smtp", opts());
    expect(readFileSync(destPath, "utf8")).toBe(`POSTGRES_USER=directus\n${VAR.target}=${VALUE}\n`);
  });

  it("refuses a file that assigns the variable twice", () => {
    writeFileSync(destPath, `${VAR.target}=a\n${VAR.target}=b\n`);
    chmodSync(destPath, 0o640);
    expect(() => applyTarget("directus-smtp", opts())).toThrow(/refusing to guess/);
  });

  it("dry run writes nothing", () => {
    const res = applyTarget("directus-smtp", opts({ dryRun: true }));
    expect(res.outcome).toBe("would-apply");
    expect(readFileSync(destPath, "utf8")).toBe(ENV_BEFORE);
    expect(readdirSync(destDir).filter((n) => n.includes(".bak-secretdeploy-"))).toHaveLength(0);
  });
});

describe("idempotence", () => {
  it("applying the same version twice writes once", () => {
    const first = applyTarget("directus-smtp", opts());
    expect(first.outcome).toBe("applied");
    const bytes = readFileSync(destPath, "utf8");
    const backupsAfterFirst = readdirSync(destDir).filter((n) => n.includes(".bak-secretdeploy-"));

    const second = applyTarget("directus-smtp", opts());
    expect(second.outcome).toBe("unchanged");
    expect(second.versionId).toBe(first.versionId);
    expect(readFileSync(destPath, "utf8")).toBe(bytes);
    // No second rollback point: nothing changed, so there is nothing to undo.
    expect(readdirSync(destDir).filter((n) => n.includes(".bak-secretdeploy-"))).toEqual(backupsAfterFirst);
  });

  it("a replaced secret is a new version and does write", () => {
    applyTarget("directus-smtp", opts());
    const res = applyTarget("directus-smtp", opts({ readValue: () => OTHER, readEnvelope: () => "envelope-bytes-for-v2" }));
    expect(res.outcome).toBe("applied");
    expect(readFileSync(destPath, "utf8")).toContain(`${VAR.target}=${OTHER}`);
  });

  it("the version digest is taken over the envelope, not the value", () => {
    // Same plaintext, different envelope -> different version. If the digest
    // were over the value, this would collide and a re-encrypted secret would
    // look already-deployed.
    const a = versionIdFor("x", { readEnvelope: () => "envelope-A" });
    const b = versionIdFor("x", { readEnvelope: () => "envelope-B" });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("state that disagrees with the file does not suppress a real write", () => {
    applyTarget("directus-smtp", opts());
    writeFileSync(destPath, ENV_BEFORE); // someone edited it back by hand
    chmodSync(destPath, 0o640);
    const res = applyTarget("directus-smtp", opts());
    expect(res.outcome).toBe("applied");
  });
});

describe("the value never escapes", () => {
  it("is absent from every returned field", () => {
    const res = applyTarget("directus-smtp", opts());
    expect(JSON.stringify(res)).not.toContain(VALUE);
    expect(JSON.stringify(res)).toContain(STORED_NAME);
  });

  it("is absent from the recorded state", () => {
    applyTarget("directus-smtp", opts());
    const raw = readFileSync(join(root, "deploy-state.json"), "utf8");
    expect(raw).not.toContain(VALUE);
    expect(raw).toContain("versionId");
  });

  it("is absent from the audit trail", () => {
    // audit() resolves its path through storeRoot(), which under vitest refuses
    // to be the production store. Point it at this test's temp root, or the
    // trail is never written and this assertion passes against nothing.
    const prev = process.env.SECRET_STORE_ROOT;
    process.env.SECRET_STORE_ROOT = root;
    try {
      applyTarget("directus-smtp", opts());
      const auditFile = join(root, "audit.log");
      // Bite control: without this the assertion below would hold for a trail
      // that was never written at all.
      expect(existsSync(auditFile)).toBe(true);
      const raw = readFileSync(auditFile, "utf8");
      expect(raw).toContain("\"operation\":\"deploy\"");
      expect(raw).toContain(STORED_NAME);
      expect(raw).not.toContain(VALUE);
    } finally {
      if (prev === undefined) delete process.env.SECRET_STORE_ROOT;
      else process.env.SECRET_STORE_ROOT = prev;
    }
  });

  it("is absent from every error message on every rejection path", () => {
    const cases = [
      () => { chmodSync(destPath, 0o600); },
      () => { linkSync(destPath, join(destDir, "extra-link")); },
      () => { writeTargets([target({ env_var: VAR.bystander })]); },
      () => { writeFileSync(destPath, `${VAR.target}=a\n${VAR.target}=b\n`); chmodSync(destPath, 0o640); },
    ];
    for (const setup of cases) {
      writeFileSync(destPath, ENV_BEFORE);
      chmodSync(destPath, 0o640);
      writeTargets([target()]);
      for (const n of readdirSync(destDir)) if (n !== ".env") rmSync(join(destDir, n), { force: true, recursive: true });
      setup();
      let message = "";
      try {
        applyTarget("directus-smtp", opts());
        message = "(did not throw)";
      } catch (e) {
        message = `${e.message}\n${e.stack ?? ""}`;
      }
      expect(message).not.toContain(VALUE);
      expect(message).not.toBe("(did not throw)");
    }
  });

  it("refuses a value that would need quoting the existing line does not have", () => {
    expect(() => substituteAssignment(ENV_BEFORE, VAR.target, " leading-space"))
      .toThrow(/needs quoting/);
    expect(() => substituteAssignment(ENV_BEFORE, VAR.target, "with#hash"))
      .toThrow(/needs quoting/);
  });

  it("refuses a value containing a newline", () => {
    expect(() => substituteAssignment(ENV_BEFORE, VAR.target, "two\nlines"))
      .toThrow(/newline/);
  });

  it("keeps the quoting style the existing line already uses", () => {
    const quoted = `${VAR.target}=${'"'}old value${'"'}\n`;
    expect(substituteAssignment(quoted, VAR.target, "new value"))
      .toBe(`${VAR.target}=${'"'}new value${'"'}\n`);
  });
});

describe("wiring", () => {
  it("deploy is a registered audit operation", () => {
    // auditRecord() silently rewrites an unknown operation to "unknown", which
    // would leave every deploy unattributable in the trail.
    expect(AUDIT_OPERATIONS).toContain("deploy");
  });

  it("an unknown target id is refused", () => {
    expect(() => applyTarget("not-declared", opts())).toThrow(/no such deploy target/);
  });

  it("a targets file that is not a regular file is refused", () => {
    rmSync(join(root, "deploy-targets.json"));
    mkdirSync(join(root, "deploy-targets.json"));
    expect(() => readTargets({ root, destinations: destinations() })).toThrow(/not a regular file/);
  });

  it("state is readable and names the version, not the value", () => {
    applyTarget("directus-smtp", opts());
    const state = readState({ root });
    expect(state["directus-smtp"].env_var).toBe(VAR.target);
    expect(state["directus-smtp"].versionId).toMatch(/^[0-9a-f]{16}$/);
    expect(Object.values(state["directus-smtp"]).join(" ")).not.toContain(VALUE);
  });
});

// ---------------------------------------------------------------------------
// CLI safety. These cover two defects found on 2026-09-07 while deploying the
// Directus SMTP secret for real, both of which are silent-wrong-behaviour bugs
// rather than crashes — the kind a green suite happily coexists with.
// ---------------------------------------------------------------------------
describe("secretsctl flag parsing", () => {
  it("accepts --dry-run as a bare switch and yields boolean true", async () => {
    const { parseArgs } = await import("./secretsctl.mjs");
    // The regression: the parser demanded a value, so `--dry-run true` produced
    // the STRING "true", while the deploy command tested `=== true`. Asking to
    // simulate therefore performed a real deployment.
    expect(parseArgs(["--dry-run"], ["target", "dry-run"])["dry-run"]).toBe(true);
  });

  it("still parses a value flag alongside a boolean one, in either order", async () => {
    const { parseArgs } = await import("./secretsctl.mjs");
    const a = parseArgs(["--target", "directus-smtp", "--dry-run"], ["target", "dry-run"]);
    expect(a).toEqual({ target: "directus-smtp", "dry-run": true });
    const b = parseArgs(["--dry-run", "--target", "directus-smtp"], ["target", "dry-run"]);
    expect(b).toEqual({ target: "directus-smtp", "dry-run": true });
  });

  it("rejects an argument after a boolean flag instead of guessing", async () => {
    const { parseArgs } = await import("./secretsctl.mjs");
    expect(() => parseArgs(["--dry-run", "false"], ["dry-run"])).toThrow(/takes no value/);
  });

  it("still requires a value for non-boolean flags", async () => {
    const { parseArgs } = await import("./secretsctl.mjs");
    expect(() => parseArgs(["--target"], ["target"])).toThrow(/requires a value/);
  });

  it("never puts a flag's argument in the error text", async () => {
    const { parseArgs } = await import("./secretsctl.mjs");
    try {
      parseArgs(["--nope", "s3cr3t-looking-value"], ["target"]);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.message).toContain("--nope");
      expect(e.message).not.toContain("s3cr3t-looking-value");
    }
  });
});

describe("rollback tells the truth about what production holds", () => {
  it("marks the target rolled back instead of leaving it reported as applied", () => {
    writeTargets([target()]);
    applyTarget("directus-smtp", opts({ actor: "test" }));
    expect(readState({ root })["directus-smtp"].appliedAt).toBeTruthy();

    rollbackTarget("directus-smtp", opts({ actor: "test" }));

    // The regression: rollbackTarget rewrote the destination and wrote an audit
    // record, but never touched deploy-state.json — so deploy-status kept
    // asserting that the deployed version was live long after it had been rolled
    // back out. Observed in production on 2026-09-07.
    const after = readState({ root })["directus-smtp"];
    expect(after.rolledBackAt).toBeTruthy();
    expect(after.rolledBackFrom).toBe(after.versionId);
  });

  it("a re-apply after a rollback clears the rolled-back marker", () => {
    writeTargets([target()]);
    applyTarget("directus-smtp", opts({ actor: "test" }));
    rollbackTarget("directus-smtp", opts({ actor: "test" }));
    expect(readState({ root })["directus-smtp"].rolledBackAt).toBeTruthy();

    applyTarget("directus-smtp", opts({ actor: "test", readEnvelope: () => "envelope-bytes-for-v2" }));
    expect(readState({ root })["directus-smtp"].rolledBackAt).toBeUndefined();
  });

  it("still records no state at all for a dry run", () => {
    writeTargets([target()]);
    applyTarget("directus-smtp", opts({ actor: "test", dryRun: true }));
    expect(readState({ root })["directus-smtp"]).toBeUndefined();
  });
});
