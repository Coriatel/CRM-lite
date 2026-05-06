#!/usr/bin/env python3
"""
Slice #1 schema apply — idempotent.

Creates: lifecycle_stages, stage_transitions collections
        + contacts.lifecycle_stage_id (FK)
        + btree indexes
        + 9 seed stages

Safe to re-run: skips anything that already exists.

Required env:
  DIRECTUS_URL            e.g. https://crm.merkazneshama.co.il
  DIRECTUS_ADMIN_TOKEN    admin-grade static token
  DB_CONTAINER            docker container running the Postgres db
                          (used for CREATE INDEX via psql; default: hycrm-directus-db)
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
    "User-Agent": "Mozilla/5.0 slice1-apply/1.0",
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
        raise RuntimeError(f"list collections failed: {code}")
    return any(c["collection"] == name for c in data["data"])


def field_exists(coll, field):
    code, data = req("GET", f"/fields/{coll}")
    if code != 200:
        raise RuntimeError(f"list fields {coll} failed: {code}")
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


def create_field(coll, spec):
    name = spec["field"]
    if field_exists(coll, name):
        print(f"  ✓ field exists: {coll}.{name} (skip)")
        return
    code, data = req("POST", f"/fields/{coll}", spec)
    if code == 200:
        print(f"  + created field: {coll}.{name}")
    else:
        raise RuntimeError(f"create field {coll}.{name} failed: {code} {data}")


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


print("STEP 1: lifecycle_stages collection")
create_collection({
    "collection": "lifecycle_stages",
    "meta": {
        "icon": "stairs",
        "note": "Customer journey stages (slice #1)",
        "display_template": "{{name}}",
        "sort_field": "sort_order",
        "accountability": "all",
        "collection": "lifecycle_stages",
    },
    "schema": {"name": "lifecycle_stages"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"interface": "input", "readonly": True, "hidden": True, "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},
        {"field": "slug", "type": "string",
         "meta": {"interface": "input", "required": True, "note": "stable code key"},
         "schema": {"is_unique": True, "is_nullable": False}},
        {"field": "name", "type": "string",
         "meta": {"interface": "input", "required": True}, "schema": {"is_nullable": False}},
        {"field": "sort_order", "type": "integer",
         "meta": {"interface": "input"}, "schema": {"default_value": 0}},
        {"field": "color", "type": "string",
         "meta": {"interface": "select-color"}, "schema": {}},
        {"field": "is_active", "type": "boolean",
         "meta": {"interface": "boolean"}, "schema": {"default_value": True}},
        {"field": "date_created", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "hidden": True, "special": ["date-created"]},
         "schema": {}},
    ],
})

print("STEP 2: stage_transitions collection")
create_collection({
    "collection": "stage_transitions",
    "meta": {
        "icon": "history",
        "note": "Audit log of contact lifecycle stage changes (slice #1)",
        "display_template": "{{contact_id}}: {{from_stage_id}} → {{to_stage_id}}",
        "sort_field": "transitioned_at",
        "accountability": "all",
        "collection": "stage_transitions",
    },
    "schema": {"name": "stage_transitions"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"interface": "input", "readonly": True, "hidden": True, "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},
        {"field": "contact_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o"},
         "schema": {"is_nullable": False}},
        {"field": "from_stage_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o"}, "schema": {"is_nullable": True}},
        {"field": "to_stage_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o"}, "schema": {"is_nullable": False}},
        {"field": "transitioned_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "special": ["date-created"]}, "schema": {}},
        {"field": "transitioned_by", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "special": ["user-created"], "readonly": True},
         "schema": {"is_nullable": True}},
        {"field": "trigger_type", "type": "string",
         "meta": {"interface": "select-dropdown", "options": {"choices": [
             {"text": "Manual", "value": "manual"},
             {"text": "Automation", "value": "automation"},
             {"text": "Import", "value": "import"},
             {"text": "Webhook", "value": "webhook"},
             {"text": "System", "value": "system"},
         ]}}, "schema": {"default_value": "manual"}},
        {"field": "reason", "type": "text",
         "meta": {"interface": "input-multiline"}, "schema": {"is_nullable": True}},
        {"field": "metadata", "type": "json",
         "meta": {"interface": "input-code", "options": {"language": "json"}},
         "schema": {"is_nullable": True}},
    ],
})

print("STEP 3: FK relations")
create_relation({"collection": "stage_transitions", "field": "contact_id",
                 "related_collection": "contacts", "schema": {"on_delete": "CASCADE"}})
create_relation({"collection": "stage_transitions", "field": "from_stage_id",
                 "related_collection": "lifecycle_stages", "schema": {"on_delete": "SET NULL"}})
create_relation({"collection": "stage_transitions", "field": "to_stage_id",
                 "related_collection": "lifecycle_stages", "schema": {"on_delete": "NO ACTION"}})
create_relation({"collection": "stage_transitions", "field": "transitioned_by",
                 "related_collection": "directus_users", "schema": {"on_delete": "SET NULL"}})

print("STEP 4: contacts.lifecycle_stage_id")
create_field("contacts", {
    "field": "lifecycle_stage_id",
    "type": "uuid",
    "meta": {
        "interface": "select-dropdown-m2o",
        "display": "related-values",
        "display_options": {"template": "{{name}}"},
        "note": "Customer journey stage (slice #1)",
    },
    "schema": {"is_nullable": True},
})
create_relation({"collection": "contacts", "field": "lifecycle_stage_id",
                 "related_collection": "lifecycle_stages", "schema": {"on_delete": "SET NULL"}})

print("STEP 5: seed stages")
SEED = [
    {"slug": "awareness", "name": "חשיפה (תוכן אורגני)", "sort_order": 10, "color": "#94a3b8"},
    {"slug": "lead", "name": "ליד (טופס נחיתה)", "sort_order": 20, "color": "#fbbf24"},
    {"slug": "general_lessons", "name": "מעגל שיעורים כלליים", "sort_order": 30, "color": "#7dd3fc"},
    {"slug": "workshop_candidate", "name": "מועמד/ת לסדנה", "sort_order": 40, "color": "#a78bfa"},
    {"slug": "prep_group", "name": "בקבוצת הכנה", "sort_order": 50, "color": "#60a5fa"},
    {"slug": "active_cohort", "name": "בסדנה פעילה", "sort_order": 60, "color": "#34d399"},
    {"slug": "graduate", "name": "בוגר/ת", "sort_order": 70, "color": "#10b981"},
    {"slug": "dormant", "name": "נשרה / לא פעיל", "sort_order": 80, "color": "#9ca3af"},
    {"slug": "do_not_contact", "name": "אין לפנות", "sort_order": 90, "color": "#ef4444"},
]
code, existing = req("GET", "/items/lifecycle_stages?fields=slug&limit=100")
if code != 200:
    raise RuntimeError(f"list stages failed: {code}")
existing_slugs = {s["slug"] for s in existing["data"]}
to_create = [s for s in SEED if s["slug"] not in existing_slugs]
if to_create:
    code, data = req("POST", "/items/lifecycle_stages", to_create)
    if code != 200:
        raise RuntimeError(f"seed failed: {code} {data}")
    print(f"  + seeded {len(to_create)} stages")
else:
    print("  ✓ all 9 stages already present (skip)")

print("STEP 6: btree indexes (via docker exec)")
SQL = [
    "CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle_stage_id ON contacts(lifecycle_stage_id);",
    "CREATE INDEX IF NOT EXISTS idx_stage_transitions_contact_at ON stage_transitions(contact_id, transitioned_at DESC);",
]
for sql in SQL:
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c", sql],
        capture_output=True, text=True,
    )
    out = (r.stdout + r.stderr).strip()
    print(f"  SQL: {sql}")
    print(f"        → {out[:120]}")
    if r.returncode != 0 and "already exists" not in out:
        raise RuntimeError(f"index sql failed: {out}")

print("STEP 7: refresh schema cache")
code, _ = req("POST", "/utils/cache/clear", {})
print(f"  cache clear: HTTP {code}")
print("\n=== ALL STEPS COMPLETE ===")
