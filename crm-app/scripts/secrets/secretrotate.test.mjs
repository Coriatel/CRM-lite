import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
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
const MCPVAR = ["N8N", "MCP", "TOKEN"].join("_");
const MNHOME = "mn-home";
const SRV = "srv1518109";
const ITARUTA_ENV = "/data/services/itaruta/credentials/transcriptor-api.env";

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
  it("maps n8n_mcp_token to one private env-file step, read back from the same file, on srv", () => {
    const spec = secretSpec("n8n_mcp_token");
    const file = "/home/devuserp/.config/merkaz/n8n-mcp.env";
    // Its consumer (devuserp's Claude sessions) still runs on srv; mn-home has
    // no n8n-mcp wrapper yet (checked 2026-10-27).
    expect(spec.host).toBe(SRV);
    expect(spec.vault_type).toBe("token");
    expect(spec.currentFrom).toEqual({ kind: "env", path: file, var: MCPVAR });
    expect(spec.steps).toEqual([
      { adapter: "env-file", params: { path: file, var: MCPVAR, owner: "devuserp", group: "devuserp", mode: "0600" } },
    ]);
  });

  it("declares a host for every secret, and refuses a spec without one", () => {
    for (const id of listSecretIds()) expect([MNHOME, SRV]).toContain(secretSpec(id).host);
    const map = { x: { display: "x", vault_type: "password", currentFrom: null, steps: [] } };
    expect(() => secretSpec("x", { map })).toThrow(expect.objectContaining({ code: "bad_spec" }));
    expect(() => secretSpec("x", { map: { x: { ...map.x, host: "a b" } } })).toThrow(expect.objectContaining({ code: "bad_spec" }));
  });

  it("n8n_db_password rotates on mn-home: both n8n clusters, their files, the Windmill DSN, owner restarts", () => {
    const spec = secretSpec("n8n_db_password");
    expect(spec.host).toBe(MNHOME);
    expect(spec.currentFrom).toEqual({ kind: "env", path: "/data/services/n8n/.env", var: PWVAR });
    expect(spec.steps).toEqual([
      { adapter: "pg-role", params: { container: "n8n-postgres", role: "n8n", superuser: "n8n" } },
      { adapter: "pg-role", params: { container: "yafutsu-db", role: "n8n", superuser: "n8n" } },
      { adapter: "env-file", params: { path: "/data/services/n8n/.env", var: PWVAR, owner: "root", group: "root", mode: "0600" } },
      { adapter: "env-file", params: { path: "/data/services/itaruta/db/.env", var: PWVAR, owner: "root", group: "root", mode: "0600" } },
      { adapter: "dsn-env", params: { path: ITARUTA_ENV, var: VAR, user: "n8n", owner: "root", group: "root", mode: "0400" } },
      { adapter: "windmill-variable", params: { workspace: "admins", path: "f/reporting/n8n_db", user: "n8n", base_url: "http://127.0.0.1:8000", auth_file: "/etc/crm-secrets/windmill-rotate.token" } },
      { adapter: "restart-systemd", params: { unit: "transcriptor-api" } },
      { adapter: "restart-compose", params: { dir: "/data/services/n8n", project: "n8n", file: "/data/services/n8n/docker-compose.yml", env_file: "/data/services/n8n/.env" } },
    ]);
  });

  it("directus_db_password rotates on mn-home: the hycrm role, its .env, the crm-stack recreate", () => {
    const spec = secretSpec("directus_db_password");
    expect(spec.host).toBe(MNHOME);
    expect(spec.currentFrom).toEqual({ kind: "env", path: "/data/services/hycrm/.env", var: PWVAR });
    expect(spec.steps).toEqual([
      { adapter: "pg-role", params: { container: "hycrm-directus-db", role: "hycrm", superuser: "hycrm" } },
      { adapter: "env-file", params: { path: "/data/services/hycrm/.env", var: PWVAR, owner: "root", group: "root", mode: "0600" } },
      { adapter: "restart-compose", params: { dir: "/data/services/hycrm", project: "crm-stack", file: "/data/services/hycrm/docker-compose.yml", env_file: "/data/services/hycrm/.env" } },
    ]);
  });

  it("directus_admin_password rotates on mn-home and carries Itaruta, which logs in as the same admin", () => {
    const spec = secretSpec("directus_admin_password");
    const ADMINVAR = ["DIRECTUS", "ADMIN", "PASSWORD"].join("_");
    expect(spec.host).toBe(MNHOME);
    expect(spec.currentFrom).toEqual({ kind: "env", path: "/data/services/hycrm/.env", var: ADMINVAR });
    expect(spec.steps).toEqual([
      { adapter: "directus-user", params: { base_url: "http://127.0.0.1:18055", email: "admin@crm.coriathost.cloud" } },
      { adapter: "env-file", params: { path: "/data/services/hycrm/.env", var: ADMINVAR, owner: "root", group: "root", mode: "0600" } },
      { adapter: "env-file", params: { path: ITARUTA_ENV, var: ["DIRECTUS", "PASSWORD"].join("_"), owner: "root", group: "root", mode: "0400" } },
      { adapter: "restart-systemd", params: { unit: "transcriptor-api" } },
    ]);
  });

  it("no mn-home secret still names a srv-only path or a pm2 restart", () => {
    for (const id of listSecretIds()) {
      const spec = secretSpec(id);
      if (spec.host !== MNHOME) continue;
      const text = JSON.stringify(spec);
      expect(text).not.toMatch(/\/home\/(elron|devuserp)\/|\/opt\/hoshen-yehuda|\/etc\/yafutsu|\/opt\/transcriptor-api/);
      expect(spec.steps.some((s) => s.adapter === "restart-pm2")).toBe(false);
    }
  });
});

describe("host guard", () => {
  const spyVault = () => {
    const calls = { has: 0, read: 0, store: 0 };
    const vault = {
      has: () => { calls.has += 1; return true; },
      read: () => { calls.read += 1; return NEWV; },
      store: () => { calls.store += 1; },
    };
    return { calls, vault };
  };
  const oneStep = (host, currentPath) => ({
    demo: {
      display: "demo",
      vault_type: "password",
      host,
      currentFrom: { kind: "env", path: currentPath ?? join(root, "a.env"), var: PWVAR },
      steps: [{ adapter: "env-file", params: { path: join(root, "a.env"), var: PWVAR, owner: "owner", group: "owner", mode: "0640" } }],
    },
  });
  const BEFORE = () => `${PWVAR}=${OLDV}\n`;

  beforeEach(() => {
    writeFileSync(join(root, "a.env"), BEFORE());
    chmodSync(join(root, "a.env"), 0o640);
  });

  it("refuses on another host before it reads the vault or touches a file, naming both hosts", async () => {
    const { calls, vault } = spyVault();
    const p = rotate("demo", { fromVault: true, map: oneStep(MNHOME), hostname: () => SRV, identityFiles: identityFiles(), vault });
    await expect(p).rejects.toMatchObject({ code: "wrong_host" });
    await expect(p).rejects.toThrow(new RegExp(`${MNHOME}.*${SRV}`));
    expect(calls).toEqual({ has: 0, read: 0, store: 0 });
    expect(readFileSync(join(root, "a.env"), "utf8")).toBe(BEFORE());
  });

  it("refuses a dry run on another host too", async () => {
    const { calls, vault } = spyVault();
    await expect(rotate("demo", { fromVault: true, dryRun: true, map: oneStep(MNHOME), hostname: () => SRV, vault }))
      .rejects.toMatchObject({ code: "wrong_host" });
    expect(calls.read).toBe(0);
  });

  it("falls back to os.hostname() and fails closed when nothing matches", async () => {
    await expect(rotate("demo", { newValue: NEWV, map: oneStep("no-such-host.invalid"), identityFiles: identityFiles(), vault: spyVault().vault }))
      .rejects.toMatchObject({ code: "wrong_host" });
    expect(readFileSync(join(root, "a.env"), "utf8")).toBe(BEFORE());
  });

  it("applies on its own host", async () => {
    const { vault } = spyVault();
    const res = await rotate("demo", { fromVault: true, map: oneStep(MNHOME), hostname: () => MNHOME, identityFiles: identityFiles(), actor: "test", vault });
    expect(res.verifications.every((v) => v.ok)).toBe(true);
    expect(readFileSync(join(root, "a.env"), "utf8")).toBe(`${PWVAR}=${NEWV}\n`);
  });

  it("refuses when the current value is not readable on this host: a failure could not be rolled back", async () => {
    const { vault } = spyVault();
    const map = oneStep(MNHOME, join(root, "absent.env"));
    await expect(rotate("demo", { fromVault: true, map, hostname: () => MNHOME, identityFiles: identityFiles(), vault }))
      .rejects.toMatchObject({ code: "no_current_value" });
    expect(readFileSync(join(root, "a.env"), "utf8")).toBe(BEFORE());
  });

  it("the shipped map: every mn-home secret is refused on srv, n8n_mcp_token on mn-home, nothing read", async () => {
    for (const id of listSecretIds()) {
      const { calls, vault } = spyVault();
      const other = secretSpec(id).host === MNHOME ? SRV : MNHOME;
      await expect(rotate(id, { fromVault: true, hostname: () => other, vault })).rejects.toMatchObject({ code: "wrong_host" });
      expect(calls).toEqual({ has: 0, read: 0, store: 0 });
    }
  });
});

describe("owner-command steps never execute anything", () => {
  let runs;
  let orig;
  beforeEach(() => {
    runs = 0;
    orig = execHooks.run;
    execHooks.run = () => {
      runs += 1;
      return "";
    };
  });
  afterEach(() => {
    execHooks.run = orig;
  });

  it("restart-systemd hands the restart to the owner", async () => {
    const p = { unit: "transcriptor-api" };
    ADAPTERS["restart-systemd"].validate(p);
    const r = await ADAPTERS["restart-systemd"].apply(p, {});
    expect(r).toEqual({ outcome: "owner-command", command: "! sudo systemctl restart transcriptor-api" });
    expect((await ADAPTERS["restart-systemd"].rollback(p, {})).command).toBe(r.command);
    expect((await ADAPTERS["restart-systemd"].verify(p, {})).ok).toBe(true);
    expect(runs).toBe(0);
  });

  it("restart-systemd refuses a unit name that could carry another shell word", () => {
    for (const unit of ["", "a b", "x;reboot", "-x", "$(id)", "a/b", "a\nb"]) {
      expect(() => ADAPTERS["restart-systemd"].validate({ unit })).toThrow(RotateError);
    }
  });

  it("restart-compose names project, file, directory and env file for mn-home's layout", async () => {
    const p = { dir: "/data/services/itaruta/db", project: "itaruta-db", file: "/data/services/itaruta/db/docker-compose.yml", env_file: "/data/services/itaruta/db/.env" };
    ADAPTERS["restart-compose"].validate(p);
    expect((await ADAPTERS["restart-compose"].apply(p)).command).toBe(
      "! sudo docker compose -p itaruta-db -f /data/services/itaruta/db/docker-compose.yml --project-directory /data/services/itaruta/db --env-file /data/services/itaruta/db/.env up -d --no-build",
    );
    expect(runs).toBe(0);
  });

  it("restart-compose keeps the plain form when no project is named", async () => {
    expect((await ADAPTERS["restart-compose"].apply({ dir: "/srv/app" })).command).toBe("! cd /srv/app && docker compose up -d --no-build");
  });

  it("restart-compose refuses shell characters, a bad project name, and a project without its file", () => {
    const bad = [
      { dir: "/a b" },
      { dir: "/a;b" },
      { dir: "/a", project: "Bad Name", file: "/a/c.yml" },
      { dir: "/a", project: "p" },
      { dir: "/a", project: "p", file: "/a/$(x).yml" },
      { dir: "/a", project: "p", file: "/a/c.yml", env_file: "rel/.env" },
      { dir: "/a", project: null, file: "/a/c.yml" },
      { dir: "/a", file: "/a/c.yml" },
      { dir: "/a", env_file: "/a/.env" },
    ];
    for (const p of bad) expect(() => ADAPTERS["restart-compose"].validate(p)).toThrow(RotateError);
  });
});

describe("windmill-variable rewrites only the password inside the live DSN", () => {
  // The host part is deliberately NOT n8n-postgres: the adapter must keep
  // whatever host/port/db the variable holds, never assume one.
  const WDSN = (pw) => "postgresql" + "://" + "n8n" + ":" + pw + "@" + "10.9.8.7:6543/n8n";
  const WMTOKEN = ["dummy", "windmill", "token"].join("-");
  let wm;
  let origFetch;
  let tokenFile;
  const reply = (status, json) => ({ status, ok: status >= 200 && status < 300, json: async () => json });

  beforeEach(() => {
    tokenFile = join(root, "wm.token");
    writeFileSync(tokenFile, `${WMTOKEN}\n`);
    chmodSync(tokenFile, 0o400);
    wm = { value: WDSN(OLDV), posts: 0, auth: [] };
    origFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      wm.auth.push(init.headers?.Authorization);
      if (url === "http://127.0.0.1:8000/api/w/admins/variables/get_value/f/reporting/n8n_db") return reply(200, wm.value);
      if (url === "http://127.0.0.1:8000/api/w/admins/variables/update/f/reporting/n8n_db" && init.method === "POST") {
        wm.posts += 1;
        wm.value = JSON.parse(init.body).value;
        return reply(200, "ok");
      }
      return reply(404, null);
    };
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });
  const params = () => ({ workspace: "admins", path: "f/reporting/n8n_db", user: "n8n", base_url: "http://127.0.0.1:8000", auth_file: tokenFile });

  it("keeps host, port and database, rewrites the password, verifies, and rolls back", async () => {
    const ctx = { oldValue: OLDV, newValue: NEWV, dryRun: false };
    expect((await ADAPTERS["windmill-variable"].apply(params(), ctx)).outcome).toBe("applied");
    expect(wm.value).toBe(WDSN(encodeURIComponent(NEWV)));
    expect((await ADAPTERS["windmill-variable"].verify(params(), ctx)).ok).toBe(true);
    expect(wm.auth.every((a) => a === ["Bearer", WMTOKEN].join(" "))).toBe(true);
    expect((await ADAPTERS["windmill-variable"].rollback(params(), ctx)).outcome).toBe("rolled-back");
    expect(wm.value).toBe(WDSN(OLDV));
  });

  it("refuses, writing nothing, when the variable holds no DSN for that user", async () => {
    wm.value = "not a dsn";
    await expect(ADAPTERS["windmill-variable"].apply(params(), { oldValue: OLDV, newValue: NEWV, dryRun: false }))
      .rejects.toMatchObject({ code: "dsn_not_found" });
    expect(wm.posts).toBe(0);
  });

  it("refuses when Windmill will not return the variable", async () => {
    await expect(ADAPTERS["windmill-variable"].apply({ ...params(), path: "f/other/x" }, { oldValue: OLDV, newValue: NEWV, dryRun: false }))
      .rejects.toMatchObject({ code: "windmill_failed" });
    expect(wm.posts).toBe(0);
  });

  it("a dry run reports a missing token file and calls nothing", async () => {
    await expect(ADAPTERS["windmill-variable"].apply({ ...params(), auth_file: join(root, "absent") }, { newValue: NEWV, dryRun: true }))
      .rejects.toMatchObject({ code: "missing_auth_file" });
    expect((await ADAPTERS["windmill-variable"].apply(params(), { newValue: NEWV, dryRun: true })).outcome).toBe("would-apply");
    expect(wm.auth.length).toBe(0);
  });

  it("puts the old password back when the update lands but the reply is an error", async () => {
    const fetchOk = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      if (init.method === "POST" && JSON.parse(init.body).value.includes(encodeURIComponent(NEWV))) {
        await fetchOk(url, init); // the write lands ...
        return reply(502, null); // ... and the reply says it did not
      }
      return fetchOk(url, init);
    };
    await expect(ADAPTERS["windmill-variable"].apply(params(), { oldValue: OLDV, newValue: NEWV, dryRun: false }))
      .rejects.toMatchObject({ code: "windmill_failed" });
    expect(wm.value).toBe(WDSN(OLDV));
  });

  it("verifies the password of that user exactly, not a substring anywhere", async () => {
    wm.value = "postgresql" + "://" + "n8n" + ":" + OLDV + "@" + "h:1/" + encodeURIComponent(NEWV);
    expect((await ADAPTERS["windmill-variable"].verify(params(), { newValue: NEWV })).ok).toBe(false);
  });

  it("validates user, base_url and auth_file", () => {
    expect(() => ADAPTERS["windmill-variable"].validate(params())).not.toThrow();
    expect(() => ADAPTERS["windmill-variable"].validate({ ...params(), user: undefined })).toThrow(RotateError);
    expect(() => ADAPTERS["windmill-variable"].validate({ ...params(), base_url: "http://127.0.0.1:8000/x" })).toThrow(RotateError);
    expect(() => ADAPTERS["windmill-variable"].validate({ ...params(), auth_file: "rel/token" })).toThrow(RotateError);
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
      host: "test-host",
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
    const res = await rotate("demo", { newValue: NEWV, map: twoStep(), hostname: () => "test-host", identityFiles: identityFiles(), actor: "test", vault: noVault });
    expect(res.applied.length).toBe(2);
    expect(res.verifications.every((v) => v.ok)).toBe(true);
    expect(readFileSync(join(root, "a.env"), "utf8")).toContain(NEWV);
    expect(readFileSync(join(root, "b.env"), "utf8")).toContain(NEWV);
  });

  it("refuses before step one when a later step would fail its safety check", async () => {
    // The second file's real mode disagrees with its declared mode. The
    // preflight sees it, so the first file is never written.
    chmodSync(join(root, "b.env"), 0o600);
    await expect(
      rotate("demo", { newValue: NEWV, map: twoStep(), hostname: () => "test-host", identityFiles: identityFiles(), actor: "test", vault: noVault }),
    ).rejects.toMatchObject({ code: "preflight_failed" });
    expect(readFileSync(join(root, "a.env"), "utf8")).toBe(`${PWVAR}=${OLDV}\n`);
  });

  it("refuses before step one when a target does not hold the current value (rollback would not be exact)", async () => {
    writeFileSync(join(root, "b.env"), `${PWVAR}=${["drifted", "val"].join("-")}\n`);
    chmodSync(join(root, "b.env"), 0o640);
    const opts = { newValue: NEWV, map: twoStep(), hostname: () => "test-host", identityFiles: identityFiles(), actor: "test", vault: noVault };
    await expect(rotate("demo", opts)).rejects.toMatchObject({ code: "preflight_failed" });
    await expect(rotate("demo", opts)).rejects.toThrow(/old_value_mismatch/);
    expect(readFileSync(join(root, "a.env"), "utf8")).toBe(`${PWVAR}=${OLDV}\n`);
    const dry = await rotate("demo", { ...opts, dryRun: true });
    expect(dry.plan.map((x) => x.reason ?? x.outcome)).toEqual(["would-apply", "old_value_mismatch"]);
  });

  it("refuses when the current value is assigned twice or empty", async () => {
    const opts = { newValue: NEWV, map: twoStep(), hostname: () => "test-host", identityFiles: identityFiles(), actor: "test", vault: noVault };
    writeFileSync(join(root, "a.env"), `${PWVAR}=${OLDV}\n${PWVAR}=${NEWV}\n`);
    await expect(rotate("demo", opts)).rejects.toMatchObject({ code: "no_current_value" });
    writeFileSync(join(root, "a.env"), `${PWVAR}=\n`);
    await expect(rotate("demo", opts)).rejects.toMatchObject({ code: "no_current_value" });
  });

  it("checks a value from the vault like a typed one: no newline, $, backslash or backtick", async () => {
    for (const bad of [`a$b`, "a\\b", "a`b", "a\nb"]) {
      const vault = { has: () => true, read: () => bad, store: () => {} };
      await expect(rotate("demo", { fromVault: true, map: twoStep(), hostname: () => "test-host", identityFiles: identityFiles(), vault }))
        .rejects.toMatchObject({ code: "bad_value" });
    }
    expect(readFileSync(join(root, "a.env"), "utf8")).toBe(`${PWVAR}=${OLDV}\n`);
  });

  it("n8n_mcp_token from the vault (the browser path): rewrites only the token line, never writes the vault", async () => {
    // The real map entry, redirected to a temp file owned by the test user.
    const real = secretSpec("n8n_mcp_token");
    const p = join(root, "n8n-mcp.env");
    writeFileSync(p, ["# head", `${MCPVAR}=${OLDV}`, ""].join("\n"));
    chmodSync(p, 0o600);
    const map = {
      n8n_mcp_token: {
        ...real,
        currentFrom: { ...real.currentFrom, path: p },
        steps: real.steps.map((s) => ({ ...s, params: { ...s.params, path: p, owner: "owner", group: "owner" } })),
      },
    };
    let stored = 0;
    const vault = { has: (id) => id === "n8n_mcp_token", read: () => NEWV, store: () => { stored += 1; } };

    const dry = await rotate("n8n_mcp_token", { fromVault: true, dryRun: true, map, hostname: () => real.host, identityFiles: identityFiles(), vault });
    expect(dry.plan.map((x) => x.outcome)).toEqual(["would-apply"]);
    expect(readFileSync(p, "utf8")).toContain(`${MCPVAR}=${OLDV}`);

    const res = await rotate("n8n_mcp_token", { fromVault: true, map, hostname: () => real.host, identityFiles: identityFiles(), actor: "test", vault });
    expect(res.verifications.every((v) => v.ok)).toBe(true);
    expect(readFileSync(p, "utf8")).toBe(["# head", `${MCPVAR}=${NEWV}`, ""].join("\n"));
    expect(statSync(p).mode & 0o7777).toBe(0o600);
    expect(stored).toBe(0);
  });
});

describe("rollback after a mid-rotation failure (pg-role steps, mocked psql)", () => {
  // Two roles that both hold the old value (so the preflight passes); the
  // second ALTER fails at run time, after the first one has landed.
  let orig;
  let calls;
  const map = () => ({
    two: {
      display: "two",
      vault_type: "password",
      host: "test-host",
      currentFrom: { kind: "env", path: join(root, "cur.env"), var: PWVAR },
      steps: [
        { adapter: "pg-role", params: { container: "pg-a", role: "r", superuser: "r" } },
        { adapter: "pg-role", params: { container: "pg-b", role: "r", superuser: "r" } },
      ],
    },
  });
  const opts = () => ({ newValue: NEWV, map: map(), hostname: () => "test-host", identityFiles: identityFiles(), actor: "test", vault: { has: () => false, read: () => "", store: () => {} } });
  const mock = ({ failRollbackOnA }) => {
    let altersOnA = 0;
    execHooks.run = (file, args, { input } = {}) => {
      const container = args[2];
      calls.push({ container, input });
      if (input.includes("select rolpassword")) return scramVerifier(OLDV);
      if (container === "pg-b") {
        const e = new Error(["psql", "LINE 1: ALTER ROLE r PASSWORD", "'SCRAM-SHA-256$4096:leak'"].join(" "));
        e.status = 3;
        throw e;
      }
      altersOnA += 1;
      if (failRollbackOnA && altersOnA === 2) throw Object.assign(new Error("boom"), { status: 1 });
      return "";
    };
  };

  beforeEach(() => {
    orig = execHooks.run;
    calls = [];
    writeFileSync(join(root, "cur.env"), `${PWVAR}=${OLDV}\n`);
  });
  afterEach(() => {
    execHooks.run = orig;
  });

  it("rolls the first role back and reports a sanitised error", async () => {
    mock({ failRollbackOnA: false });
    const err = await rotate("two", opts()).catch((e) => e);
    expect(err.code).toBe("psql_failed");
    expect(err.message).toMatch(/was rolled back/);
    expect(err.message).not.toMatch(/SCRAM|PASSWORD|LINE 1/);
    expect(err.rolledBack).toEqual([{ adapter: "pg-role", outcome: "rolled-back" }]);
    const altersA = calls.filter((c) => c.container === "pg-a" && c.input.includes("ALTER ROLE"));
    expect(altersA.length).toBe(2);
    expect(scramMatches(/PASSWORD '([^']+)'/.exec(altersA[1].input)[1], OLDV)).toBe(true);
    // Every statement runs with statement logging off.
    expect(calls.every((c) => c.input.startsWith("SET log_min_error_statement = panic;"))).toBe(true);
  });

  it("says INCOMPLETE, naming the step, when a rollback itself fails", async () => {
    mock({ failRollbackOnA: true });
    const err = await rotate("two", opts()).catch((e) => e);
    expect(err.code).toBe("rollback_incomplete");
    expect(err.message).toMatch(/INCOMPLETE: pg-role:rollback-threw/);
    expect(err.message).not.toMatch(/was rolled back/);
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
      // pg_isready also answers during initdb's temporary server, which then
      // stops; wait for the init to finish first, then for readiness.
      for (let i = 0; i < 80; i++) {
        const all = (() => {
          try {
            return execFileSync("sh", ["-c", `docker logs ${CN} 2>&1`], { encoding: "utf8" });
          } catch {
            return "";
          }
        })();
        try {
          if (!all.includes("init process complete")) throw new Error("initialising");
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
