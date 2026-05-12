#!/usr/bin/env python3
"""
Slice #4 validate — exercises CHECK constraints + state machine + FK RESTRICT.

Run AFTER apply.py. Owner inspects output and approves slice to ship.
Leaves test rows tagged with idempotency_key='test_slice4_<uuid>' so they
can be located + removed manually after a successful run.

Required env: DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

URL = os.environ.get("DIRECTUS_URL")
TOK = os.environ.get("DIRECTUS_ADMIN_TOKEN")
if not URL or not TOK:
    print("ERROR: set DIRECTUS_URL and DIRECTUS_ADMIN_TOKEN env vars", file=sys.stderr)
    sys.exit(2)

H = {
    "Authorization": f"Bearer {TOK}",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 slice4-validate",
}

PASS = 0
FAIL = 0


def req(method, path, body=None):
    d = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + path, data=d, method=method, headers=H)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body


def gate(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✓ {name}  {detail}")
    else:
        FAIL += 1
        print(f"  ✗ FAIL: {name}  {detail}")


tag = f"test_slice4_{uuid.uuid4().hex[:8]}"

# ============================================================
print("=== 1. collections present ===")
code, data = req("GET", "/collections/approvals")
gate("collection approvals", code == 200)
code, data = req("GET", "/collections/automation_runs")
gate("collection automation_runs", code == 200)

print("\n=== 2. key fields present on approvals ===")
code, data = req("GET", "/fields/approvals")
fields = {f["field"] for f in data["data"]}
for f in ("action_type", "context_type", "context_id", "policy",
          "proposed_payload", "status", "decided_at", "decision_reason",
          "executed_at", "execution_run_id", "idempotency_key"):
    gate(f"approvals.{f}", f in fields)

print("\n=== 3. happy path: create pending approval ===")
ctx_id = str(uuid.uuid4())
code, data = req("POST", "/items/approvals", {
    "action_type": "other",
    "context_type": "other",
    "context_id": ctx_id,
    "policy": "per_run",
    "proposed_payload": {
        "summary_hebrew": "בדיקת slice 4",
        "human_intent": "validation script — safe to delete",
    },
    "proposed_by_kind": "agent_claude",
    "idempotency_key": f"{tag}_a",
})
gate("POST pending approval", code == 200, f"HTTP {code}")
if code != 200:
    print(f"    body: {data}")
    sys.exit(1)
approval_id = data["data"]["id"]
print(f"    approval_id={approval_id}")

# ============================================================
print("\n=== 4. CHECK chk_approval_policy_v1 (must reject 'standing') ===")
code, data = req("POST", "/items/approvals", {
    "action_type": "other",
    "context_type": "other",
    "context_id": str(uuid.uuid4()),
    "policy": "standing",
    "proposed_payload": {"summary_hebrew": "x", "human_intent": "should fail"},
    "proposed_by_kind": "automation",
    "idempotency_key": f"{tag}_b",
})
gate("reject policy='standing' in v1", code >= 400, f"HTTP {code}")

# ============================================================
print("\n=== 5. CHECK chk_approval_executed (must reject orphan executed_at on pending) ===")
code, data = req("PATCH", f"/items/approvals/{approval_id}", {
    "executed_at": "2026-05-12T00:00:00Z",
})
gate("reject orphan executed_at on pending", code >= 400, f"HTTP {code}")

# ============================================================
print("\n=== 6. CHECK chk_approval_reason_required (must reject reject-without-reason) ===")
code, data = req("PATCH", f"/items/approvals/{approval_id}", {
    "status": "rejected",
    "decided_at": "2026-05-12T00:00:00Z",
})
gate("reject status=rejected without decision_reason", code >= 400, f"HTTP {code}")

# ============================================================
print("\n=== 7. CHECK chk_approval_idempotency_key_length (>120 chars must reject) ===")
long_key = "x" * 121
code, data = req("POST", "/items/approvals", {
    "action_type": "other",
    "context_type": "other",
    "context_id": str(uuid.uuid4()),
    "policy": "per_run",
    "proposed_payload": {"summary_hebrew": "x", "human_intent": "should fail"},
    "proposed_by_kind": "automation",
    "idempotency_key": long_key,
})
gate("reject idempotency_key length 121", code >= 400, f"HTTP {code}")

# ============================================================
print("\n=== 8. state machine: pending → approved ===")
code, data = req("PATCH", f"/items/approvals/{approval_id}", {
    "status": "approved",
    "decided_at": "2026-05-12T00:00:00Z",
})
gate("PATCH pending → approved", code == 200, f"HTTP {code}")

# ============================================================
print("\n=== 9. create automation_runs row linked to approval ===")
code, data = req("POST", "/items/automation_runs", {
    "automation_name": "test_slice4_validate",
    "automation_version": "v1",
    "started_at": "2026-05-12T00:00:00Z",
    "status": "running",
    "approval_id": approval_id,
})
gate("POST automation_runs", code == 200, f"HTTP {code}")
run_id = data["data"]["id"] if code == 200 else None
if run_id:
    print(f"    run_id={run_id}")

# ============================================================
print("\n=== 10. state machine: approved → executed (with run linkage) ===")
code, data = req("PATCH", f"/items/approvals/{approval_id}", {
    "status": "executed",
    "executed_at": "2026-05-12T00:01:00Z",
    "execution_run_id": run_id,
    "execution_result": {"ok": True},
})
gate("PATCH approved → executed", code == 200, f"HTTP {code}")

# ============================================================
print("\n=== 11. FK RESTRICT (must reject DELETE on linked automation_runs) ===")
if run_id:
    code, data = req("DELETE", f"/items/automation_runs/{run_id}")
    gate("RESTRICT blocks delete of linked run", code >= 400, f"HTTP {code}")
else:
    gate("RESTRICT blocks delete of linked run", False, "no run_id available")

# ============================================================
print("\n=== 12. polymorphic context query ===")
code, data = req("GET", f"/items/approvals?filter[context_id][_eq]={ctx_id}&limit=5")
gate("polymorphic context filter returns row", code == 200 and len(data["data"]) >= 1,
     f"HTTP {code}, found {len(data.get('data', [])) if isinstance(data, dict) else '?'}")

# ============================================================
print(f"\n=== SUMMARY: {PASS} pass / {FAIL} fail ===")
print(f"Test rows tagged with idempotency_key prefix: {tag}_")
print("To remove after manual inspection:")
print(f"  DELETE FROM approvals WHERE idempotency_key LIKE '{tag}\\_%';")
print(f"  DELETE FROM automation_runs WHERE automation_name='test_slice4_validate';")
print("  (Run approvals delete AFTER automation_runs delete — RESTRICT is mutual.)")

sys.exit(0 if FAIL == 0 else 1)
