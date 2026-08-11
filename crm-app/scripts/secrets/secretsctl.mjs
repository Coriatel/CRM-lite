#!/usr/bin/env node
// secretsctl — the owner's write path into the private secret store.
//
// Why a CLI and not the /ops "add secret" form: the /ops surface is a static
// Caddy file_server with no application backend (see docs/secrets-mvp.md).
// A browser form would need a new writable service, and would drag the raw
// value through HTTP, a JS heap and a server log on its way to a file that
// lives on this account anyway. The CLI removes that whole path.
//
// Value handling rules enforced here:
//   - never accepted as an argv token (argv is world-readable via /proc)
//   - never echoed to the terminal
//   - never written to shell history (it is typed at a prompt, not in a command)
//   - never logged, and never printed back after save
//
// Usage:
//   secretsctl init
//   secretsctl add --name <n> --type <t> --purpose <p> --consumer <c> [--expiry YYYY-MM-DD]
//   secretsctl replace --name <n>
//   secretsctl disable --name <n>
//   secretsctl list
//   secretsctl audit
//   secretsctl publish [--out <path>]

import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

import {
  addSecret,
  auditModes,
  disableSecret,
  initStore,
  listSecrets,
  opsProjection,
  replaceSecret,
  storeRoot,
  SECRET_TYPES,
} from "./secretstore.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      // A bare --flag consumes the next token unless that token is itself a flag.
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
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
      owner: args.owner || process.env.USER || "unknown",
      expiry: typeof args.expiry === "string" ? args.expiry : null,
    };
    if (!SECRET_TYPES.includes(meta.type)) {
      throw new Error(`--type must be one of: ${SECRET_TYPES.join(", ")}`);
    }
    const value = await readSecretFromTty(`Value for "${meta.name}" (not echoed): `);
    const entry = addSecret(meta, value);
    // Metadata only. The value is never printed back, here or anywhere.
    console.log(`saved: ${entry.name} → ${entry.path} (0600), status=${entry.status}`);
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

  publish(args) {
    const out = typeof args.out === "string" ? args.out : "public/ops-data/secrets.json";
    const proj = opsProjection();
    writeFileSync(out, JSON.stringify(proj, null, 2) + "\n");
    console.log(`wrote metadata-only projection: ${out} (${proj.secrets.length} secrets, 0 values)`);
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
    await fn(parseArgs(rest));
  } catch (e) {
    // Error messages are built from names and flags only — never from a value.
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
  }
}

main();
