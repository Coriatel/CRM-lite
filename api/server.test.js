// Tests for crmlite-api (S3). Uses Node's built-in test runner; no test deps.
//
// Strategy: spin makeApp() with env vars pointing at a temp spool dir and at
// stub bin scripts that mimic the contracts of queue_action_submit.py,
// mn-os-queue-actions-merger, and build-operational-queue-state.py. This keeps
// the test self-contained — no dependency on /srv/ops-vault state, no need to
// check out the s2 branch — while still exercising the full request →
// subprocess → response path.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

function writeStub(dir, name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, "#!/usr/bin/env bash\n" + body + "\n", { mode: 0o755 });
  return p;
}

function bootEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crmlite-api-"));
  const spool = path.join(root, "spool");
  fs.mkdirSync(spool, { recursive: true });
  const calls = path.join(root, "calls.log");
  fs.writeFileSync(calls, "");

  // Submit stub: parses --action=, --queue-item-id=, --spool-dir=; on "bad"
  // queue_item_id exits 1; on "io" exits 2; otherwise writes a spool file and
  // prints its path on stdout (matches the real python contract).
  const submit = writeStub(root, "submit.sh", `
log() { echo "submit $*" >> "${calls}"; }
log "$@"
action=""; qid=""; spd=""
for a in "$@"; do
  case "$a" in
    --action=*) action="\${a#--action=}";;
    --queue-item-id=*) qid="\${a#--queue-item-id=}";;
    --spool-dir=*) spd="\${a#--spool-dir=}";;
  esac
done
case "$qid" in
  bad*) echo "validation: bad qid" >&2; exit 1;;
  io*)  echo "io: simulated" >&2; exit 2;;
esac
f="$spd/$(date +%s%N)-$$-$(id -u)-\${action}-\${qid//\\//_}.json"
printf '{"spool_schema":"v1","action":"%s","queue_item_id":"%s"}' "$action" "$qid" > "$f"
echo "$f"
`);

  const merger = writeStub(root, "merger.sh", `echo "merger $*" >> "${calls}"; exit 0`);
  const reducer = writeStub(root, "reducer.sh", `echo "reducer $*" >> "${calls}"; exit 0`);

  process.env.QUEUE_SPOOL_DIR = spool;
  process.env.QUEUE_SUBMIT_BIN = submit;
  process.env.QUEUE_MERGER_BIN = merger;
  process.env.QUEUE_REDUCER_BIN = reducer;
  // Tests load makeApp AFTER env is set.
  delete require.cache[require.resolve("./server.js")];
  const { makeApp } = require("./server.js");
  return { root, spool, calls, app: makeApp() };
}

function startApp(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function postJson(port, body, rawBody) {
  return new Promise((resolve, reject) => {
    const payload = rawBody !== undefined ? rawBody : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/api/queue-actions",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(buf); } catch (_) { /* ignore */ }
        resolve({ status: res.statusCode, body: parsed, raw: buf });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function withApp(fn) {
  const ctx = bootEnv();
  const { server, port } = await startApp(ctx.app);
  try { await fn({ ...ctx, port }); }
  finally { await new Promise((r) => server.close(r)); }
}

test("ack writes a spool file and runs merger+reducer", async () => {
  await withApp(async ({ port, spool, calls }) => {
    const r = await postJson(port, { action: "ack", queue_item_id: "blocker:s3-smoke" });
    assert.equal(r.status, 200);
    assert.equal(r.body.accepted, true);
    assert.match(r.body.spool_path, /spool\//);
    assert.equal(fs.readdirSync(spool).length, 1);
    const log = fs.readFileSync(calls, "utf8");
    assert.match(log, /submit .*--action=ack/);
    assert.match(log, /merger /);
    assert.match(log, /reducer/);
  });
});

test("snooze passes its 'until' field through to the submitter", async () => {
  await withApp(async ({ port, calls }) => {
    const r = await postJson(port, {
      action: "snooze",
      queue_item_id: "blocker:s3-snooze",
      fields: { until: "2099-01-01T00:00:00Z" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.accepted, true);
    assert.match(fs.readFileSync(calls, "utf8"), /--field=until=2099-01-01T00:00:00Z/);
  });
});

test("invalid action returns 400 without invoking the submitter", async () => {
  await withApp(async ({ port, calls, spool }) => {
    const r = await postJson(port, { action: "delete", queue_item_id: "x" });
    assert.equal(r.status, 400);
    assert.equal(r.body.accepted, false);
    assert.match(r.body.error, /invalid action/);
    assert.equal(fs.readFileSync(calls, "utf8"), "");
    assert.equal(fs.readdirSync(spool).length, 0);
  });
});

test("missing queue_item_id returns 400", async () => {
  await withApp(async ({ port }) => {
    const r = await postJson(port, { action: "ack" });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /queue_item_id/);
  });
});

test("malformed JSON returns 400", async () => {
  await withApp(async ({ port }) => {
    const r = await postJson(port, null, "{not json");
    assert.equal(r.status, 400);
    assert.match(r.body.error, /malformed JSON/);
  });
});

test("non-string field value returns 400 without subprocess", async () => {
  await withApp(async ({ port, calls }) => {
    const r = await postJson(port, {
      action: "annotate",
      queue_item_id: "x",
      fields: { note: 7 },
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /field note must be a string/);
    assert.equal(fs.readFileSync(calls, "utf8"), "");
  });
});

test("submitter validation error (exit 1) surfaces as 400 with stderr", async () => {
  await withApp(async ({ port }) => {
    const r = await postJson(port, { action: "ack", queue_item_id: "bad-thing" });
    assert.equal(r.status, 400);
    assert.equal(r.body.accepted, false);
    assert.match(r.body.error, /bad qid/);
  });
});

test("submitter IO error (exit 2) surfaces as 500", async () => {
  await withApp(async ({ port }) => {
    const r = await postJson(port, { action: "ack", queue_item_id: "io-thing" });
    assert.equal(r.status, 500);
    assert.equal(r.body.accepted, false);
    assert.match(r.body.error, /simulated/);
  });
});

test("operational_queue.json is never touched (only spool dir is written)", async () => {
  await withApp(async ({ port, root, spool }) => {
    // The endpoint should write strictly under SPOOL_DIR. We assert this by
    // snapshotting the parent root before and after; new entries must only
    // appear under spool/.
    const before = fs.readdirSync(root).sort().join(",");
    await postJson(port, { action: "ack", queue_item_id: "iso-check" });
    const after = fs.readdirSync(root).sort().join(",");
    assert.equal(before, after);
    assert.equal(fs.readdirSync(spool).length, 1);
  });
});

test("GET /api/queue-actions/health responds with the configured spool dir", async () => {
  await withApp(async ({ port, spool }) => {
    const data = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/api/queue-actions/health" }, (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
      }).on("error", reject);
    });
    assert.equal(data.status, 200);
    assert.equal(data.body.ok, true);
    assert.equal(data.body.spool_dir, spool);
  });
});
