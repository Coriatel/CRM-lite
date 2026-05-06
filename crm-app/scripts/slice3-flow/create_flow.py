#!/usr/bin/env python3
"""
Slice #3 + #4 — Create Directus Flow for server-side stage transition audit.

Flow chain:
  contacts.update
    → condition   (lifecycle_stage_id changed?)
    → exec        (extract_values: contactId + toStageId from trigger)
    → item-read   (fetch_prev_stage: last stage_transitions row for contact)
    → exec        (extract_from_stage: fromStageId = prev row's to_stage_id or null)
    → item-create (write_audit_row: create stage_transitions row with from+to populated)

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

# ── 1. Create the Flow ─────────────────────────────────────────────────────────
flow = req("POST", "/flows", {
    "name": FLOW_NAME,
    "icon": "history",
    "color": "#1565C0",
    "description": (
        "Writes a stage_transitions audit row whenever contacts.lifecycle_stage_id "
        "is updated. Reads previous transition to populate from_stage_id (Slice #4). "
        "Client issues a single PATCH; this Flow handles atomicity."
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

# ── 2. Create write_audit_row (item-create) ────────────────────────────────────
# Resolves to nothing; sits at the end of the chain.
create_op = req("POST", "/operations", {
    "flow": flow_id,
    "name": "Create stage_transitions row",
    "key": "write_audit_row",
    "type": "item-create",
    "position_x": 73,
    "position_y": 1,
    "options": {
        "collection": "stage_transitions",
        "permissions": "$full",
        "emitEvents": False,
        "payload": {
            "contact_id":    "{{extract_values.contactId}}",
            "to_stage_id":   "{{extract_values.toStageId}}",
            "from_stage_id": "{{extract_from_stage.fromStageId}}",
            "trigger_type":  "flow",
        },
    },
    "resolve": None,
    "reject": None,
})["data"]
create_op_id = create_op["id"]
print(f"  write_audit_row op: {create_op_id}")

# ── 3. Create extract_from_stage (exec) ────────────────────────────────────────
# Safely extracts fromStageId from item-read result (null for first transition).
from_op = req("POST", "/operations", {
    "flow": flow_id,
    "name": "Extract from_stage_id",
    "key": "extract_from_stage",
    "type": "exec",
    "position_x": 55,
    "position_y": 1,
    "options": {
        "code": (
            "module.exports = async function(data) {\n"
            "  const result = data.fetch_prev_stage;\n"
            "  let rows;\n"
            "  if (Array.isArray(result)) {\n"
            "    rows = result;\n"
            "  } else if (result && Array.isArray(result.data)) {\n"
            "    rows = result.data;\n"
            "  } else {\n"
            "    rows = [];\n"
            "  }\n"
            "  return { fromStageId: rows.length > 0 ? rows[0].to_stage_id : null };\n"
            "};"
        ),
    },
    "resolve": create_op_id,
    "reject": None,
})["data"]
from_op_id = from_op["id"]
print(f"  extract_from_stage op: {from_op_id}")

# ── 4. Create fetch_prev_stage (item-read) ─────────────────────────────────────
# Reads the most recent stage_transitions row for this contact (before new row is written).
read_op = req("POST", "/operations", {
    "flow": flow_id,
    "name": "Read previous stage",
    "key": "fetch_prev_stage",
    "type": "item-read",
    "position_x": 37,
    "position_y": 1,
    "options": {
        "collection": "stage_transitions",
        "permissions": "$full",
        "query": {
            "filter": {"contact_id": {"_eq": "{{extract_values.contactId}}"}},
            "sort": ["-transitioned_at"],
            "limit": 1,
        },
    },
    "resolve": from_op_id,
    "reject": None,
})["data"]
read_op_id = read_op["id"]
print(f"  fetch_prev_stage op: {read_op_id}")

# ── 5. Create extract_values (exec) ───────────────────────────────────────────
# Extracts contactId and toStageId from trigger (keys is array, not key, in Directus 11).
exec_op = req("POST", "/operations", {
    "flow": flow_id,
    "name": "Extract trigger values",
    "key": "extract_values",
    "type": "exec",
    "position_x": 19,
    "position_y": 1,
    "options": {
        "code": (
            "module.exports = async function(data) {\n"
            "  return {\n"
            "    contactId: data.$trigger.keys[0],\n"
            "    toStageId: data.$trigger.payload.lifecycle_stage_id,\n"
            "  };\n"
            "};"
        ),
    },
    "resolve": read_op_id,
    "reject": None,
})["data"]
exec_op_id = exec_op["id"]
print(f"  extract_values op: {exec_op_id}")

# ── 6. Create condition op → extract_values ───────────────────────────────────
condition_op = req("POST", "/operations", {
    "flow": flow_id,
    "name": "lifecycle_stage_id changed?",
    "key": "stage_changed",
    "type": "condition",
    "position_x": 1,
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
    "resolve": exec_op_id,
    "reject": None,
})["data"]
condition_op_id = condition_op["id"]
print(f"  stage_changed op: {condition_op_id}")

# ── 7. Wire flow entry point → condition op ────────────────────────────────────
req("PATCH", f"/flows/{flow_id}", {"operation": condition_op_id})

print(f"\nDone. Flow '{FLOW_NAME}' is ACTIVE.")
print(f"  Flow ID:              {flow_id}")
print(f"  stage_changed:        {condition_op_id}")
print(f"  extract_values:       {exec_op_id}")
print(f"  fetch_prev_stage:     {read_op_id}")
print(f"  extract_from_stage:   {from_op_id}")
print(f"  write_audit_row:      {create_op_id}")
print(f"\nChain: contacts.update → condition → extract_values → fetch_prev_stage → extract_from_stage → write_audit_row")
