#!/usr/bin/env python3
"""
Slice #8 schema apply — idempotent (additive only).

Creates two daily-agenda time-management sources (A5, Rabbi Runtime lane):
  - meetings    (scheduled appointments: starts_at / ends_at / location / status / contact_id / owner_id)
  - reminders   (personal nudges: due_at / status / contact_id / owner_id)
  + FK relations: contact_id → contacts ON DELETE SET NULL; owner_id → directus_users ON DELETE SET NULL
  + partial indexes on the hot agenda paths (status='scheduled' / status='pending')

Binding spec (owner-ratified Q1–Q6, 2026-05-31):
  /srv/ops-vault/projects/merkaz-neshama-os/lane-a/decisions/meetings-reminders-schema.md
    Q1 two collections · Q2 owner-scoped (owner_id) · Q3 real meeting title (owner-scoped)
    Q4 nullable ends_at · Q5 recurrence deferred · Q6 contact_id ON DELETE SET NULL

Mirrors the slice2-cohorts apply pattern: GET-check-then-create, partial indexes
via `docker exec`. Safe to re-run: skips anything that already exists. Seeds NO data.

Required env:
  DIRECTUS_URL            e.g. http://localhost:18055
  DIRECTUS_ADMIN_TOKEN    admin-grade bearer token
  DB_CONTAINER            postgres container (default: hycrm-directus-db)
  DB_USER                 default: hycrm
  DB_NAME                 default: hycrm

NOTE: This is a production additive migration. Do NOT run without explicit owner
go per the project migration policy. Authoring this script is not running it.
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
    "User-Agent": "slice8-apply/1.0",
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


MEETING_STATUS = [
    {"text": "Scheduled", "value": "scheduled"},
    {"text": "Done", "value": "done"},
    {"text": "Cancelled", "value": "cancelled"},
]
REMINDER_STATUS = [
    {"text": "Pending", "value": "pending"},
    {"text": "Done", "value": "done"},
    {"text": "Dismissed", "value": "dismissed"},
]


def std_meta(special=None, **kw):
    m = {"interface": "input"}
    if special:
        m["special"] = special
    m.update(kw)
    return m


# ----- STEP 1: meetings -----

print("STEP 1: meetings collection")
create_collection({
    "collection": "meetings",
    "meta": {
        "icon": "event",
        "note": "Scheduled appointments — daily-agenda source (slice #8 / A5).",
        "display_template": "{{title}} ({{status}})",
        "translations": [{"language": "he-IL", "translation": "פגישות"}],
        "sort_field": "starts_at",
        "accountability": "all",
    },
    "schema": {"name": "meetings"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},
        {"field": "title", "type": "string",
         "meta": {"interface": "input", "required": True, "note": "Surfaces to the agenda (owner-scoped)"},
         "schema": {"is_nullable": False, "max_length": 200}},
        {"field": "starts_at", "type": "timestamp",
         "meta": {"interface": "datetime", "required": True, "note": "Agenda anchor"},
         "schema": {"is_nullable": False}},
        {"field": "ends_at", "type": "timestamp",
         "meta": {"interface": "datetime", "note": "Optional end (Q4: nullable v0)"},
         "schema": {"is_nullable": True}},
        {"field": "location", "type": "string",
         "meta": {"interface": "input", "note": "Room / address / video link"},
         "schema": {"is_nullable": True, "max_length": 200}},
        {"field": "status", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True, "options": {"choices": MEETING_STATUS}},
         "schema": {"is_nullable": False, "default_value": "scheduled"}},
        {"field": "contact_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "display": "related-values",
                  "display_options": {"template": "{{full_name}}"}, "note": "Optional counterparty"},
         "schema": {"is_nullable": True}},
        {"field": "owner_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "note": "Whose calendar; agenda is owner-scoped on this"},
         "schema": {"is_nullable": True}},
        {"field": "notes", "type": "text",
         "meta": {"interface": "input-multiline", "note": "Prep notes — owner/admin only; NEVER surfaced to agenda"},
         "schema": {"is_nullable": True}},
        {"field": "created_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "special": ["date-created"]},
         "schema": {"is_nullable": False}},
        {"field": "updated_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "special": ["date-updated"]},
         "schema": {"is_nullable": True}},
        {"field": "created_by", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "readonly": True, "special": ["user-created"]},
         "schema": {"is_nullable": True}},
    ],
})


# ----- STEP 2: reminders -----

print("STEP 2: reminders collection")
create_collection({
    "collection": "reminders",
    "meta": {
        "icon": "notifications",
        "note": "Personal nudges/to-dos — daily-agenda source (slice #8 / A5).",
        "display_template": "{{title}} ({{status}})",
        "translations": [{"language": "he-IL", "translation": "תזכורות"}],
        "sort_field": "due_at",
        "accountability": "all",
    },
    "schema": {"name": "reminders"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},
        {"field": "title", "type": "string",
         "meta": {"interface": "input", "required": True, "note": "Surfaces to the agenda (owner-scoped)"},
         "schema": {"is_nullable": False, "max_length": 200}},
        {"field": "due_at", "type": "timestamp",
         "meta": {"interface": "datetime", "required": True, "note": "Agenda anchor"},
         "schema": {"is_nullable": False}},
        {"field": "status", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True, "options": {"choices": REMINDER_STATUS}},
         "schema": {"is_nullable": False, "default_value": "pending"}},
        {"field": "contact_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "display": "related-values",
                  "display_options": {"template": "{{full_name}}"}, "note": "Optional link"},
         "schema": {"is_nullable": True}},
        {"field": "owner_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "note": "Whose reminder; agenda is owner-scoped on this"},
         "schema": {"is_nullable": True}},
        {"field": "notes", "type": "text",
         "meta": {"interface": "input-multiline", "note": "Detail — owner/admin only; NEVER surfaced to agenda"},
         "schema": {"is_nullable": True}},
        {"field": "created_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "special": ["date-created"]},
         "schema": {"is_nullable": False}},
        {"field": "updated_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "special": ["date-updated"]},
         "schema": {"is_nullable": True}},
        {"field": "created_by", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "readonly": True, "special": ["user-created"]},
         "schema": {"is_nullable": True}},
    ],
})


# ----- STEP 3: FK relations (Q6: contact_id SET NULL; owner_id SET NULL) -----

print("STEP 3: FK relations")
for coll in ("meetings", "reminders"):
    if collection_exists("contacts"):
        create_relation({
            "collection": coll, "field": "contact_id",
            "related_collection": "contacts",
            "schema": {"on_delete": "SET NULL"}, "meta": {"sort_field": None},
        })
    else:
        print(f"  ! contacts not present — skip {coll}.contact_id FK (re-run after contacts ship)")
    create_relation({
        "collection": coll, "field": "owner_id",
        "related_collection": "directus_users",
        "schema": {"on_delete": "SET NULL"}, "meta": {"sort_field": None},
    })


# ----- STEP 4: indexes (Postgres-level) -----

print("STEP 4: indexes")
psql("CREATE INDEX IF NOT EXISTS idx_meetings_owner_starts ON meetings (owner_id, starts_at);")
print("  ✓ idx_meetings_owner_starts")
psql("CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_starts "
     "ON meetings (starts_at) WHERE status = 'scheduled';")
print("  ✓ idx_meetings_scheduled_starts (partial)")
psql("CREATE INDEX IF NOT EXISTS idx_reminders_owner_due ON reminders (owner_id, due_at);")
print("  ✓ idx_reminders_owner_due")
psql("CREATE INDEX IF NOT EXISTS idx_reminders_pending_due "
     "ON reminders (due_at) WHERE status = 'pending';")
print("  ✓ idx_reminders_pending_due (partial)")


# ----- STEP 5: refresh schema cache -----

print("STEP 5: refresh schema cache")
code, _ = req("POST", "/utils/cache/clear", {})
print(f"  cache clear: HTTP {code}")

print("\n=== ALL STEPS COMPLETE ===")
print("Next: python3 validate.py")
