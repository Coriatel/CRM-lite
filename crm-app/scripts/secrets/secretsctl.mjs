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

import { createInterface } from "node:readline";
import { userInfo } from "node:os";

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
    // Metadata only. The value is never printed back, here or anywhere.
    console.log(`saved: ${entry.name} (0600), status=${entry.status}`);
  },

  async replace(args) {
    const name = requireFlag(args, "name");
    const value = await readSecretFromTty(`New value for "${name}" (not echoed): `);
    const entry = replaceSecret(name, value);
    console.log(`replaced: ${entry.name} (metadata unchanged, created=${entry.created})`);
  },

  disable(args) {
    const entry = disableSecret(requireFlag(args, "name"));
    console.log(
      `disabled: ${entry.name} — metadata only. This does NOT revoke the credential ` +
      `at the provider; do that manually.`,
    );
  },

  // Removal is permanent and there is no undelete: the value file is unlinked
  // and the registry entry dropped. `disable` remains the reversible option.
  delete(args) {
    const entry = removeSecret(requireFlag(args, "name"), { mustExist: true });
    console.log(
      `deleted: ${entry.name} — value file and registry entry removed. This does NOT ` +
      `revoke the credential at the provider; do that manually.`,
    );
  },

  list() {
    printTable(listSecrets());
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
