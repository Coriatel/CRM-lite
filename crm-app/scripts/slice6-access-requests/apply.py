#!/usr/bin/env python3
"""
Slice #6 schema apply — idempotent (additive only).

Creates:
  - access_requests collection (10 fields per auth-allowlist-design.md §3)
  + FK relations: requesting_user_id → directus_users (CASCADE),
                  decided_by → directus_users (SET NULL)
  + btree index on (decision, requested_at)
  + unique index on (requesting_user_id)

Does NOT set role-scoped permissions (deferred until roles exist; see README).

Binding spec:
  /srv/ops-vault/concepts/auth-allowlist-design.md §3
  /srv/ops-vault/projects/merkaz-neshama-os/lane-a/decisions/rabbi-auth-strategy.md (Option A modified)

Safe to re-run: skips anything that already exists.

Required env:
  DIRECTUS_URL            e.g. http://localhost:18055
  DIRECTUS_ADMIN_TOKEN    admin-grade bearer token
  DB_CONTAINER            postgres container (default: hycrm-directus-db)
  DB_USER                 default: hycrm
  DB_NAME                 default: hycrm
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

URL = os.environ.get("DIRECTUS_URL")
TOK = os.environ.get("DIRECTUS_ADMIN_TOKEN")
DB_CONTAINER = os.environ.get("DB_CONTAINER", "hycrm-directus-db")
DB_USER = os.environ.get("DB_USER", "hycrm")
DB_NAME = os.environ.get("DB_NAME", "hycrm")

if not URL or not TOK:
    print("ERROR: set DIRECTUS_URL and DIRECTUS_ADMIN_TOKEN env vars", file=sys.stderr)
    sys.exit(2)

H = {
    "Authorization": f"Bearer {TOK}",
    "Content-Type": "application/json",
    "User-Agent": "slice6-access-requests-apply/1.0",
}


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


def collection_exists(name):
    code, data = req("GET", "/collections?fields=collection&limit=500")
    if code != 200:
        raise RuntimeError(f"list collections failed: {code} {data}")
    return any(c["collection"] == name for c in data["data"])


def field_exists(coll, field):
    code, data = req("GET", f"/fields/{coll}")
    if code != 200:
        return False
    return any(f["field"] == field for f in data["data"])


def relation_exists(coll, field):
    code, data = req("GET", "/relations")
    if code != 200:
        raise RuntimeError(f"list relations failed: {code}")
    return any(r["collection"] == coll and r["field"] == field for r in data["data"])


def create_collection(spec):
    name = spec["collection"]
    if collection_exists(name):
        print(f"  ✓ collection exists: {name} (skip)")
        return
    code, data = req("POST", "/collections", spec)
    if code == 200:
        print(f"  + created collection: {name}")
    else:
        raise RuntimeError(f"create {name} failed: {code} {data}")


def create_relation(spec):
    coll, field = spec["collection"], spec["field"]
    if relation_exists(coll, field):
        print(f"  ✓ relation exists: {coll}.{field} (skip)")
        return
    code, data = req("POST", "/relations", spec)
    if code == 200:
        print(f"  + created relation: {coll}.{field} → {spec['related_collection']}")
    else:
        raise RuntimeError(f"create relation {coll}.{field} failed: {code} {data}")


def psql(sql):
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER,
         "psql", "-U", DB_USER, "-d", DB_NAME, "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True,
    )
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {out}\n--- SQL ---\n{sql}")
    return out


DECISION_CHOICES = [
    {"text": "Pending", "value": "pending"},
    {"text": "Approved", "value": "approved"},
    {"text": "Denied", "value": "denied"},
]


print("STEP 1: access_requests collection")
create_collection({
    "collection": "access_requests",
    "meta": {
        "icon": "how_to_reg",
        "note": "Auth allowlist + admin approval queue (slice #6 — post-decision wave).",
        "display_template": "{{email}} — {{decision}}",
        "translations": [{"language": "he-IL", "translation": "בקשות גישה"}],
        "sort_field": "requested_at",
        "accountability": "all",
    },
    "schema": {"name": "access_requests"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},
        {"field": "requesting_user_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "required": True,
                  "display": "related-values",
                  "display_options": {"template": "{{email}}"},
                  "note": "Directus user the request belongs to"},
         "schema": {"is_nullable": False}},
        {"field": "email", "type": "string",
         "meta": {"interface": "input", "required": True,
                  "note": "Denormalized snapshot; survives user deletion"},
         "schema": {"is_nullable": False, "max_length": 320}},
        {"field": "display_name", "type": "string",
         "meta": {"interface": "input", "note": "Google profile name"},
         "schema": {"is_nullable": True, "max_length": 200}},
        {"field": "requested_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "special": ["date-created"]},
         "schema": {"is_nullable": False}},
        {"field": "decision", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": DECISION_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "pending"}},
        {"field": "decided_at", "type": "timestamp",
         "meta": {"interface": "datetime", "note": "Set when decision flips"},
         "schema": {"is_nullable": True}},
        {"field": "decided_by", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o",
                  "display": "related-values",
                  "display_options": {"template": "{{email}}"},
                  "note": "Admin who decided"},
         "schema": {"is_nullable": True}},
        {"field": "assigned_role_slug", "type": "string",
         "meta": {"interface": "input",
                  "note": "Role name snapshot on approval (e.g. mentor, rabbi); decoupled from Directus role UUIDs per role.name-only rule"},
         "schema": {"is_nullable": True, "max_length": 64}},
        {"field": "notes", "type": "text",
         "meta": {"interface": "input-multiline", "note": "Admin-only context"},
         "schema": {"is_nullable": True}},
    ],
})


print("STEP 2: FK relations")
create_relation({
    "collection": "access_requests",
    "field": "requesting_user_id",
    "related_collection": "directus_users",
    "schema": {"on_delete": "CASCADE"},
    "meta": {"sort_field": None},
})
create_relation({
    "collection": "access_requests",
    "field": "decided_by",
    "related_collection": "directus_users",
    "schema": {"on_delete": "SET NULL"},
    "meta": {"sort_field": None},
})


print("STEP 3: indexes")
# btree on (decision, requested_at) — supports pending-requests queue ordered by age
psql(
    "CREATE INDEX IF NOT EXISTS idx_access_requests_decision_requested "
    "ON access_requests (decision, requested_at);"
)
print("  ✓ idx_access_requests_decision_requested")

# unique on (requesting_user_id) — exactly one request per Directus user
psql(
    "CREATE UNIQUE INDEX IF NOT EXISTS uniq_access_requests_user "
    "ON access_requests (requesting_user_id);"
)
print("  ✓ uniq_access_requests_user (unique)")


print("STEP 4: refresh schema cache")
code, _ = req("POST", "/utils/cache/clear", {})
print(f"  cache clear: HTTP {code}")

print("\nNOTE: role-scoped permissions are DEFERRED — see README.md")
print("      v0 access is admin-only (Directus default).")

print("\n=== ALL STEPS COMPLETE ===")
print("Next: python3 validate.py")
