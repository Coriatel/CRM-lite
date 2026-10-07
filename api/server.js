// crmlite-api — internal POST /api/queue-actions endpoint (MN-OS S3, A′).
//
// Mediated write through queue_action_submit.py → spool → merger → reducer.
// Never touches state/operational_queue.json. Listens on 127.0.0.1 only;
// upstream auth posture (Cloudflare + host Caddy) is reused unchanged.

const express = require("express");
const { execFile } = require("node:child_process");
const path = require("node:path");

const PORT = Number(process.env.CRMLITE_API_PORT || 8211);
const HOST = process.env.CRMLITE_API_HOST || "127.0.0.1";

const OPSVAULT = process.env.OPSVAULT_DIR || "/srv/ops-vault";
const SUBMIT_PY = process.env.QUEUE_SUBMIT_BIN ||
  path.join(OPSVAULT, "automation-registry/scripts/queue_action_submit.py");
const MERGER_BIN = process.env.QUEUE_MERGER_BIN ||
  path.join(OPSVAULT, "scripts/mn-os-writers/mn-os-queue-actions-merger");
const REDUCER_PY = process.env.QUEUE_REDUCER_BIN ||
  path.join(OPSVAULT, "automation-registry/scripts/build-operational-queue-state.py");
const SPOOL_DIR = process.env.QUEUE_SPOOL_DIR ||
  path.join(OPSVAULT, "state/queue-actions-spool");

const VALID_ACTIONS = new Set([
  "ack", "snooze", "dismiss", "escalate", "assign", "annotate",
]);
const SUBPROC_TIMEOUT_MS = 10_000;
const BODY_LIMIT = "16kb";

function runPy(binPath, args) {
  return new Promise((resolve) => {
    execFile(binPath, args, { timeout: SUBPROC_TIMEOUT_MS }, (err, stdout, stderr) => {
      resolve({
        code: err && typeof err.code === "number" ? err.code : err ? 1 : 0,
        stdout: (stdout || "").toString(),
        stderr: (stderr || "").toString(),
        timedOut: !!(err && err.killed),
      });
    });
  });
}

function buildSubmitArgs(body) {
  const args = [
    "--via=spool",
    `--action=${body.action}`,
    `--queue-item-id=${body.queue_item_id}`,
    `--spool-dir=${SPOOL_DIR}`,
  ];
  const fields = body.fields || {};
  for (const [k, v] of Object.entries(fields)) {
    args.push(`--field=${k}=${v}`);
  }
  return args;
}

function validateBody(body) {
  if (!body || typeof body !== "object") return "body must be a JSON object";
  if (typeof body.action !== "string") return "action must be a string";
  if (!VALID_ACTIONS.has(body.action)) return `invalid action: ${body.action}`;
  if (typeof body.queue_item_id !== "string" || !body.queue_item_id.trim()) {
    return "queue_item_id must be a non-empty string";
  }
  if (body.fields !== undefined) {
    if (body.fields === null || typeof body.fields !== "object" || Array.isArray(body.fields)) {
      return "fields must be an object";
    }
    for (const [k, v] of Object.entries(body.fields)) {
      if (typeof k !== "string" || !/^[a-zA-Z0-9_]+$/.test(k)) {
        return `invalid field name: ${k}`;
      }
      if (typeof v !== "string") return `field ${k} must be a string`;
    }
  }
  return null;
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: BODY_LIMIT }));

  app.use((err, _req, res, next) => {
    if (err && err.type === "entity.parse.failed") {
      return res.status(400).json({ accepted: false, error: "malformed JSON" });
    }
    return next(err);
  });

  app.get("/api/queue-actions/health", (_req, res) => {
    res.json({ ok: true, spool_dir: SPOOL_DIR });
  });

  app.post("/api/queue-actions", async (req, res) => {
    const reason = validateBody(req.body);
    if (reason) return res.status(400).json({ accepted: false, error: reason });

    const submit = await runPy(SUBMIT_PY, buildSubmitArgs(req.body));
    if (submit.timedOut) {
      return res.status(504).json({ accepted: false, error: "submit timeout" });
    }
    if (submit.code === 1) {
      return res.status(400).json({ accepted: false, error: submit.stderr.trim() || "validation error" });
    }
    if (submit.code !== 0) {
      return res.status(500).json({ accepted: false, error: submit.stderr.trim() || "submit failed" });
    }
    const spoolPath = submit.stdout.trim().split("\n").pop();

    // Synchronous v1: drain + reduce inline. Errors here do not invalidate the
    // already-spooled request (it will be picked up on the next merger run).
    const merger = await runPy(MERGER_BIN, ["--quiet"]);
    const reducer = await runPy(REDUCER_PY, []);

    return res.json({
      accepted: true,
      spool_path: spoolPath,
      merger: { code: merger.code, timed_out: merger.timedOut },
      reducer: { code: reducer.code, timed_out: reducer.timedOut },
    });
  });

  return app;
}

if (require.main === module) {
  const app = makeApp();
  app.listen(PORT, HOST, () => {
    console.log(`crmlite-api listening on ${HOST}:${PORT} (spool=${SPOOL_DIR})`);
  });
}

module.exports = { makeApp, validateBody, buildSubmitArgs };
