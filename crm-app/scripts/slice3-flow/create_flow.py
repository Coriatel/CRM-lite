#!/usr/bin/env python3
"""
Slice #3 — Create Directus Flow for server-side stage transition audit.

Flow: contacts.update → condition (lifecycle_stage_id changed) → create stage_transitions row.

Idempotent: if a flow named 'Stage transition audit (Slice #3)' already exists, prints its ID and exits.

Required env:
  DIRECTUS_URL           e.g. http://127.0.0.1:18055
  DIRECTUS_ADMIN_TOKEN   admin-grade access token
"""
import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse

URL = os.environ.get("DIRECTUS_URL", "http://127.0.0.1:18055").rstrip("/")
TOK = os.environ.get("DIRECTUS_ADMIN_TOKEN")

if not TOK:
    print("ERROR: set DIRECTUS_ADMIN_TOKEN", file=sys.stderr)
    sys.exit(2)

FLOW_NAME = "Stage transition audit (Slice #3)"

H = {
    "Authorization": f"Bearer {TOK}",
    "Content-Type": "application/json",
}


def req(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{URL}{path}", data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"HTTP {e.code} {method} {path}: {err}", file=sys.stderr)
        raise


# ── Idempotency guard ──────────────────────────────────────────────────────────
flows_resp = req("GET", "/flows?filter[name][_eq]=" + urllib.parse.quote(FLOW_NAME) + "&fields=id,name,status")
existing = flows_resp.get("data", [])
if existing:
    fid = existing[0]["id"]
    print(f"Flow already exists: {fid}  ({existing[0]['name']})")
    sys.exit(0)

print("Creating flow…")

# ── 1. Create the Flow (no entry operation yet) ────────────────────────────────
flow = req("POST", "/flows", {
    "name": FLOW_NAME,
    "icon": "history",
    "color": "#1565C0",
    "description": (
        "Writes a stage_transitions audit row whenever contacts.lifecycle_stage_id "
        "is updated. Triggered server-side after each PATCH — no client audit logic needed."
    ),
    "status": "active",
    "trigger": "event",
    "accountability": "all",
    "options": {
        "type": "action",
        "scope": ["items.update"],
        "collections": ["contacts"],
    },
})["data"]
flow_id = flow["id"]
print(f"  Flow created: {flow_id}")

# ── 2. Create the item-create operation (write audit row) ──────────────────────
# $trigger.key  = contact UUID (single item update)
# $trigger.payload.lifecycle_stage_id = new stage UUID
create_op = req("POST", "/operations", {
    "flow": flow_id,
    "name": "Create stage_transitions row",
    "key": "write_audit_row",
    "type": "item-create",
    "position_x": 37,
    "position_y": 1,
    "options": {
        "collection": "stage_transitions",
        "permissions": "$full",
        "emitEvents": False,
        "payload": {
            "contact_id": "{{$trigger.key}}",
            "to_stage_id": "{{$trigger.payload.lifecycle_stage_id}}",
            "from_stage_id": None,
            "trigger_type": "flow",
        },
    },
    "resolve": None,
    "reject": None,
})["data"]
create_op_id = create_op["id"]
print(f"  item-create op created: {create_op_id}")

# ── 3. Create the condition operation ─────────────────────────────────────────
# Fires only when lifecycle_stage_id is present and non-null in the update payload.
condition_op = req("POST", "/operations", {
    "flow": flow_id,
    "name": "lifecycle_stage_id changed?",
    "key": "stage_changed",
    "type": "condition",
    "position_x": 19,
    "position_y": 1,
    "options": {
        "filter": {
            "$trigger": {
                "payload": {
                    "lifecycle_stage_id": {"_nnull": True},
                }
            }
        }
    },
    "resolve": create_op_id,
    "reject": None,
})["data"]
condition_op_id = condition_op["id"]
print(f"  condition op created: {condition_op_id}")

# ── 4. Wire flow entry point → condition op ────────────────────────────────────
req("PATCH", f"/flows/{flow_id}", {"operation": condition_op_id})
print(f"  Flow entry point set to condition op")

print(f"\nDone. Flow '{FLOW_NAME}' is ACTIVE.")
print(f"  Flow ID:        {flow_id}")
print(f"  Condition op:   {condition_op_id}")
print(f"  Create op:      {create_op_id}")
print(f"\nTest: PATCH contacts/<id> with lifecycle_stage_id=<stage> → stage_transitions row should appear.")
