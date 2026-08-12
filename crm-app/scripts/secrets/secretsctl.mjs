#!/usr/bin/env node
// secretsctl — the owner's local write path into the private secret store.
//
// The browser flow (owner-authenticated /ops/secrets → secretsd) is the primary
// surface. This CLI remains for host-side administration and recovery, where
// there is no browser: `init`, `audit`, and direct add/replace/disable.
//
// Value handling rules enforced here:
//   - never accepted as an argv token (argv is world-readable via /proc), and
//     an unknown flag is now REJECTED rather than silently ignored, so a
//     mistaken `--value <secret>` fails loudly instead of leaking to /proc
//   - never echoed to the terminal
//   - never written to shell history (it is typed at a prompt, not in a command)
//   - never logged, and never printed back after save
//   - never quoted back in an error message
//
// Usage:
//   secretsctl init
//   secretsctl add --name <n> --type <t> --purpose <p> --consumer <c> [--expiry YYYY-MM-DD]
//   secretsctl replace --name <n>
//   secretsctl disable --name <n>
//   secretsctl delete --name <n>
//   secretsctl list
//   secretsctl audit
//   secretsctl keygen --out <path>          generate the encryption key (once)
//   secretsctl export-recovery --out <path>  wrap the server key under a passphrase
//   secretsctl import-recovery --from <p> --out <p>   rebuild the key file from it
//   secretsctl backup --out <path>          encrypted bundle (ciphertext only)
//   secretsctl restore --from <path>        restore into SECRET_STORE_ROOT
//   secretsctl capabilities                 list broker capabilities the owner granted
//   secretsctl trail [--limit N]            recent audit records

import { createInterface } from "node:readline";
import { userInfo } from "node:os";
import { existsSync, writeFileSync, chmodSync, readFileSync } from "node:fs";

import { audit } from "./secretaudit.mjs";
import { auditPath } from "./secretaudit.mjs";
import { generateKeyHex, wrapKeyForRecovery, unwrapRecoveryKey } from "./secretcrypto.mjs";
import { listCapabilities } from "./secretbroker.mjs";
import { createBackup, readBackup, restoreBackup, writeBackup } from "./secretsbackup.mjs";

import {
  addSecret,
  auditModes,
  disableSecret,
  initStore,
  listSecrets,
  removeSecret,
  replaceSecret,
  storeRoot,
  SECRET_TYPES,
} from "./secretstore.mjs";

// Every flag each command accepts. An argument outside this set is an error:
// silently ignoring `--value` is what let a mistyped secret sit in
// /proc/<pid>/cmdline while the CLI waited at the prompt (review L1).
const COMMAND_FLAGS = {
  init: [],
  add: ["name", "type", "purpose", "consumer", "expiry"],
  replace: ["name"],
  disable: ["name"],
  delete: ["name"],
  list: [],
  audit: [],
  keygen: ["out"],
  "export-recovery": ["out"],
  "import-recovery": ["from", "out"],
  backup: ["out"],
  restore: ["from"],
  capabilities: [],
  trail: ["limit"],
};

export function parseArgs(argv, allowedFlags) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      throw new Error("unexpected positional argument");
    }
    const key = a.slice(2);
    if (!allowedFlags.includes(key)) {
      // Name the flag, never its argument — the argument may be a secret.
      throw new Error(`unknown flag --${key} (allowed: ${allowedFlags.map((f) => `--${f}`).join(", ") || "none"})`);
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new Error(`repeated flag --${key}`);
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`flag --${key} requires a value`);
    }
    out[key] = next;
    i++;
  }
  return out;
}

// Prompt for the value with terminal echo disabled. Falls back to reading a
// single line from a pipe when stdin is not a TTY, so the CLI stays usable
// from a password manager (`pass show x | secretsctl replace --name x`)
// without ever putting the value in argv.
function readSecretFromTty(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (d) => { buf += d; });
      process.stdin.on("end", () => resolve(buf.replace(/\r?\n$/, "")));
      process.stdin.on("error", reject);
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(prompt);
    // Suppress echo: swallow every keystroke the readline writer emits.
    const origWrite = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl._writeToOutput = origWrite ?? (() => {});
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function requireFlag(args, name) {
  const v = args[name];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`missing required flag --${name}`);
  }
  return v;
}

function printTable(rows) {
  if (rows.length === 0) {
    console.log("No secrets registered yet.");
    return;
  }
  const cols = ["name", "type", "status", "expiry", "consumer", "purpose"];
  const width = Object.fromEntries(
    cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => String(r[c] ?? "—").length))]),
  );
  console.log(cols.map((c) => c.toUpperCase().padEnd(width[c])).join("  "));
  for (const r of rows) {
    console.log(cols.map((c) => String(r[c] ?? "—").padEnd(width[c])).join("  "));
  }
}

// Derived from the OS identity, never from a flag: the registry's `owner` field
// documents which account owns the value file, so letting the caller type it
// made it a free-text claim (review L5).
function currentOwner() {
  try {
    return userInfo().username;
  } catch {
    return "unknown";
  }
}

const COMMANDS = {
  init() {
    const root = initStore();
    console.log(`store ready: ${root} (dir 0700, files 0600)`);
  },

  async add(args) {
    const meta = {
      name: requireFlag(args, "name"),
      type: requireFlag(args, "type"),
      purpose: requireFlag(args, "purpose"),
      consumer: requireFlag(args, "consumer"),
      owner: currentOwner(),
      expiry: typeof args.expiry === "string" ? args.expiry : null,
    };
    if (!SECRET_TYPES.includes(meta.type)) {
      throw new Error(`--type must be one of: ${SECRET_TYPES.join(", ")}`);
    }
    const value = await readSecretFromTty(`Value for "${meta.name}" (not echoed): `);
    const entry = addSecret(meta, value);
    audit({ actor: currentOwner(), operation: "add", secret: entry.name, outcome: "success" });
    // Metadata only. The value is never printed back, here or anywhere.
    console.log(`saved: ${entry.name} (0600, encrypted), status=${entry.status}`);
  },

  async replace(args) {
    const name = requireFlag(args, "name");
    const value = await readSecretFromTty(`New value for "${name}" (not echoed): `);
    const entry = replaceSecret(name, value);
    audit({ actor: currentOwner(), operation: "replace", secret: entry.name, outcome: "success" });
    console.log(`replaced: ${entry.name} (metadata unchanged, created=${entry.created})`);
  },

  disable(args) {
    const entry = disableSecret(requireFlag(args, "name"));
    audit({ actor: currentOwner(), operation: "disable", secret: entry.name, outcome: "success" });
    console.log(
      `disabled: ${entry.name} — metadata only. This does NOT revoke the credential ` +
      `at the provider; do that manually.`,
    );
  },

  // Removal is permanent and there is no undelete: the value file is unlinked
  // and the registry entry dropped. `disable` remains the reversible option.
  delete(args) {
    const entry = removeSecret(requireFlag(args, "name"), { mustExist: true });
    audit({ actor: currentOwner(), operation: "delete", secret: entry.name, outcome: "success" });
    console.log(
      `deleted: ${entry.name} — value file and registry entry removed. This does NOT ` +
      `revoke the credential at the provider; do that manually.`,
    );
  },

  list() {
    printTable(listSecrets());
  },

  keygen(args) {
    const out = requireFlag(args, "out");
    // Never overwrite: silently replacing a key makes every existing value and
    // every existing backup permanently unreadable.
    if (existsSync(out)) throw new Error("refusing to overwrite an existing key file");
    writeFileSync(out, generateKeyHex() + "\n", { mode: 0o400 });
    chmodSync(out, 0o400);
    console.log(
      `key written: ${out} (0400). Back this up OFF this host NOW — without it, ` +
      `every stored value and every backup is unrecoverable. The key itself is not printed.`,
    );
  },

  // The owner's off-box safety net: the SAME server key, wrapped under a
  // passphrase typed at the prompt. Reuses the canonical envelope — there is no
  // second recovery system to keep in sync.
  async "export-recovery"(args) {
    const out = requireFlag(args, "out");
    if (existsSync(out)) throw new Error("refusing to overwrite an existing recovery artifact");
    const keyHex = readFileSync(process.env.SECRET_KEY_FILE || "", "utf8").trim();
    const pass = await readSecretFromTty("Recovery passphrase (min 12 chars, not echoed): ");
    const again = await readSecretFromTty("Repeat it: ");
    if (pass !== again) throw new Error("passphrases did not match");
    writeFileSync(out, wrapKeyForRecovery(keyHex, pass) + "\n", { mode: 0o400 });
    chmodSync(out, 0o400);
    console.log(
      `recovery artifact written: ${out} (0400). Store it OFF this host. It is useless ` +
      `without the passphrase, and the passphrase is not stored anywhere.`,
    );
  },

  async "import-recovery"(args) {
    const from = requireFlag(args, "from");
    const out = requireFlag(args, "out");
    if (existsSync(out)) throw new Error("refusing to overwrite an existing key file");
    const pass = await readSecretFromTty("Recovery passphrase (not echoed): ");
    const keyHex = unwrapRecoveryKey(readFileSync(from, "utf8").trim(), pass);
    writeFileSync(out, keyHex + "\n", { mode: 0o400 });
    chmodSync(out, 0o400);
    console.log(`key restored to ${out} (0400). The key itself was not printed.`);
  },

  backup(args) {
    const out = requireFlag(args, "out");
    const bundle = createBackup({ actor: currentOwner() });
    const res = writeBackup(out, bundle);
    console.log(
      `backup written: ${res.path} (0${res.mode}) — ${Object.keys(bundle.values).length} entries, ` +
      `ciphertext only. Restoring it REQUIRES the key file.`,
    );
  },

  restore(args) {
    const from = requireFlag(args, "from");
    const bundle = readBackup(from);
    const res = restoreBackup(bundle, { actor: currentOwner() });
    console.log(`restored ${res.restored} entries into ${storeRoot()}: ${res.names.join(", ")}`);
  },

  capabilities() {
    const caps = listCapabilities();
    if (caps.length === 0) {
      console.log("no broker capabilities granted.");
      return;
    }
    for (const c of caps) console.log(`${c.id}\t${c.operation}\t${c.description ?? ""}`);
  },

  trail(args) {
    const limit = Number(args.limit ?? 20);
    if (!existsSync(auditPath())) {
      console.log("no audit records yet.");
      return;
    }
    const lines = readFileSync(auditPath(), "utf8").trim().split("\n").filter(Boolean);
    for (const line of lines.slice(-limit)) {
      const r = JSON.parse(line);
      console.log(`${r.ts}\t${r.actor}\t${r.operation}\t${r.secret ?? "-"}\t${r.outcome}${r.reason ? "\t" + r.reason : ""}`);
    }
  },

  audit() {
    const problems = auditModes();
    if (problems.length === 0) {
      console.log(`OK — ${storeRoot()} and all entries have owner-only modes.`);
      return;
    }
    for (const p of problems) console.error(`BAD MODE ${p.mode} (want ${p.expected}): ${p.path}`);
    process.exitCode = 1;
  },
};

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const fn = COMMANDS[cmd];
  if (!fn) {
    console.error(`usage: secretsctl <${Object.keys(COMMANDS).join("|")}> [flags]`);
    process.exitCode = 2;
    return;
  }
  try {
    await fn(parseArgs(rest, COMMAND_FLAGS[cmd]));
  } catch (e) {
    // Error messages are built from names and flags only — never from a value,
    // and never by quoting an argument back.
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
  }
}

// Importable for tests without executing the CLI.
if (process.env.SECRETSCTL_NO_MAIN !== "1") main();
