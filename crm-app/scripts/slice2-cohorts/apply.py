#!/usr/bin/env python3
"""
Slice #2 schema apply — idempotent (additive only).

Creates:
  - cohorts                       (named groups with track/status/lead_teacher)
  - cohort_members                (membership with readiness/role/left_at)
  + FK relations (CASCADE / RESTRICT / SET NULL per proposal §D5)
  + partial unique index on (cohort_id, contact_id) WHERE left_at IS NULL
  + btree indexes for cohort funnel + recency queries

Binding spec:
  /srv/ops-vault/proposals/cohorts-schema-proposal.md  (APPROVED-A-MODIFIED 2026-05-18)
  /srv/ops-vault/proposals/cohorts-role-enum-evaluation.md  (binds role enum to v0)

Safe to re-run: skips anything that already exists.
Refuses to run if prior slice5-cohorts shape detected (see README §Reconciliation).
Does NOT seed data.

Required env:
  DIRECTUS_URL            e.g. http://localhost:18055
  DIRECTUS_ADMIN_TOKEN    admin-grade bearer token
  DB_CONTAINER            postgres container (default: hycrm-directus-db)
  DB_USER                 default: hycrm
  DB_NAME                 default: hycrm

Optional env:
  SLICE2_OVERRIDE_SLICE5  set to "1" to bypass slice5 detection (reserved for
                          owner-approved migration runs; never set in CI)
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
OVERRIDE_SLICE5 = os.environ.get("SLICE2_OVERRIDE_SLICE5") == "1"

if not URL or not TOK:
    print("ERROR: set DIRECTUS_URL and DIRECTUS_ADMIN_TOKEN env vars", file=sys.stderr)
    sys.exit(2)

H = {
    "Authorization": f"Bearer {TOK}",
    "Content-Type": "application/json",
    "User-Agent": "slice2-apply/1.0",
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
        return False  # collection may not exist yet; treat as field-absent
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


# ----- PROBE: refuse to run if slice5 shape detected -----

print("STEP 0: probe for slice5-cohorts shape")
if collection_exists("cohorts") and field_exists("cohorts", "member_count"):
    if not OVERRIDE_SLICE5:
        print("ERROR: detected slice5-cohorts shape (cohorts.member_count present).", file=sys.stderr)
        print("       slice2-cohorts is INCOMPATIBLE with slice5-cohorts.", file=sys.stderr)
        print("       See README.md §Reconciliation. Refusing to run.", file=sys.stderr)
        sys.exit(3)
    print("  ! slice5 shape detected, SLICE2_OVERRIDE_SLICE5=1 — proceeding with caution")
else:
    print("  ✓ no slice5 shape detected (clean apply path)")


# ----- STEP 1: cohorts collection -----

TRACK_CHOICES = [
    {"text": "Women", "value": "women"},
    {"text": "Men", "value": "men"},
    {"text": "Mixed", "value": "mixed"},
    {"text": "Other", "value": "other"},
]

STATUS_CHOICES = [
    {"text": "Planning", "value": "planning"},
    {"text": "Active", "value": "active"},
    {"text": "Closed", "value": "closed"},
    {"text": "Canceled", "value": "canceled"},
]

print("STEP 1: cohorts collection")
create_collection({
    "collection": "cohorts",
    "meta": {
        "icon": "groups",
        "note": "Named groups of contacts (slice #2 — post-decision wave shape).",
        "display_template": "{{name}} ({{track}}, {{status}})",
        "translations": [{"language": "he-IL", "translation": "קבוצות"}],
        "sort_field": "created_at",
        "accountability": "all",
    },
    "schema": {"name": "cohorts"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},
        {"field": "name", "type": "string",
         "meta": {"interface": "input", "required": True, "note": "Hebrew label visible to admin"},
         "schema": {"is_nullable": False, "max_length": 120}},
        {"field": "slug", "type": "string",
         "meta": {"interface": "input", "required": True, "note": "Stable ASCII code key (e.g. women-wave-4)"},
         "schema": {"is_unique": True, "is_nullable": False, "max_length": 64}},
        {"field": "track", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": TRACK_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "women"}},
        {"field": "status", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": STATUS_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "planning"}},
        {"field": "start_date", "type": "date",
         "meta": {"interface": "datetime", "note": "Informational; not a trigger"},
         "schema": {"is_nullable": True}},
        {"field": "target_size", "type": "integer",
         "meta": {"interface": "input", "note": "Planning hint (≥0)"},
         "schema": {"is_nullable": True}},
        {"field": "lead_teacher_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "display": "related-values",
                  "display_options": {"template": "{{full_name}}"},
                  "note": "FK to contacts; rabbi page scopes on this"},
         "schema": {"is_nullable": True}},
        {"field": "location", "type": "string",
         "meta": {"interface": "input", "note": "Free text (Givat Brenner, Zoom, ...)"},
         "schema": {"is_nullable": True, "max_length": 160}},
        {"field": "notes", "type": "text",
         "meta": {"interface": "input-multiline", "note": "Admin-only"},
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


# ----- STEP 2: cohort_members collection -----

READINESS_CHOICES = [
    {"text": "Interested", "value": "interested"},
    {"text": "Warm", "value": "warm"},
    {"text": "Received details", "value": "received_details"},
    {"text": "Confirmed", "value": "confirmed"},
    {"text": "Paid", "value": "paid"},
]

ROLE_CHOICES = [
    {"text": "Member", "value": "member"},
    {"text": "Student", "value": "student"},
    {"text": "Leader", "value": "leader"},
    {"text": "Coordinator", "value": "coordinator"},
    {"text": "Mentor", "value": "mentor"},
    {"text": "Observer", "value": "observer"},
]

print("STEP 2: cohort_members collection")
create_collection({
    "collection": "cohort_members",
    "meta": {
        "icon": "person_add",
        "note": "Junction: cohort × contact with readiness funnel (slice #2).",
        "display_template": "{{contact_id.full_name}} — {{readiness}}",
        "translations": [{"language": "he-IL", "translation": "חברי קבוצה"}],
        "sort_field": "joined_at",
        "accountability": "all",
        "hidden": True,
    },
    "schema": {"name": "cohort_members"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},
        {"field": "cohort_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "required": True,
                  "display": "related-values", "display_options": {"template": "{{name}}"}},
         "schema": {"is_nullable": False}},
        {"field": "contact_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "required": True,
                  "display": "related-values", "display_options": {"template": "{{full_name}}"}},
         "schema": {"is_nullable": False}},
        {"field": "readiness", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": READINESS_CHOICES},
                  "note": "Funnel state; see C2-i in proposal for `paid` semantics."},
         "schema": {"is_nullable": False, "default_value": "interested"}},
        {"field": "role", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": ROLE_CHOICES},
                  "note": "Per-membership role; rabbi/teacher live in future cohort_staff_assignments."},
         "schema": {"is_nullable": False, "default_value": "member"}},
        {"field": "joined_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": False, "required": True},
         "schema": {"is_nullable": False, "default_value": "now()"}},
        {"field": "left_at", "type": "timestamp",
         "meta": {"interface": "datetime",
                  "note": "Non-null = historical membership; excluded from active queries"},
         "schema": {"is_nullable": True}},
        {"field": "notes", "type": "text",
         "meta": {"interface": "input-multiline", "note": "Leader/admin annotation"},
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


# ----- STEP 3: FK relations -----

print("STEP 3: FK relations")

# cohorts.lead_teacher_id → contacts.id ON DELETE SET NULL
if collection_exists("contacts"):
    create_relation({
        "collection": "cohorts",
        "field": "lead_teacher_id",
        "related_collection": "contacts",
        "schema": {"on_delete": "SET NULL"},
        "meta": {"sort_field": None},
    })
else:
    print("  ! contacts collection not present — skipping cohorts.lead_teacher_id FK (re-run after contacts ship)")

# cohort_members.cohort_id → cohorts.id ON DELETE CASCADE
create_relation({
    "collection": "cohort_members",
    "field": "cohort_id",
    "related_collection": "cohorts",
    "schema": {"on_delete": "CASCADE"},
    "meta": {"sort_field": None},
})

# cohort_members.contact_id → contacts.id ON DELETE RESTRICT
if collection_exists("contacts"):
    create_relation({
        "collection": "cohort_members",
        "field": "contact_id",
        "related_collection": "contacts",
        "schema": {"on_delete": "RESTRICT"},
        "meta": {"sort_field": None},
    })
else:
    print("  ! contacts collection not present — skipping cohort_members.contact_id FK (re-run after contacts ship)")


# ----- STEP 4: indexes (Postgres-level) -----

print("STEP 4: indexes")

# Partial unique: at most one active membership per (cohort, contact)
psql(
    "CREATE UNIQUE INDEX IF NOT EXISTS uniq_cohort_members_active_pair "
    "ON cohort_members (cohort_id, contact_id) WHERE left_at IS NULL;"
)
print("  ✓ uniq_cohort_members_active_pair (partial)")

# btree on (status, start_date) for "next planning cohort" Today-card query
psql(
    "CREATE INDEX IF NOT EXISTS idx_cohorts_status_start "
    "ON cohorts (status, start_date);"
)
print("  ✓ idx_cohorts_status_start")

# btree on (track) for filtered listings
psql("CREATE INDEX IF NOT EXISTS idx_cohorts_track ON cohorts (track);")
print("  ✓ idx_cohorts_track")

# btree on (cohort_id, readiness) for funnel counts
psql(
    "CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort_readiness "
    "ON cohort_members (cohort_id, readiness);"
)
print("  ✓ idx_cohort_members_cohort_readiness")

# Partial btree on (contact_id) WHERE left_at IS NULL — "active cohorts for contact"
psql(
    "CREATE INDEX IF NOT EXISTS idx_cohort_members_active_contact "
    "ON cohort_members (contact_id) WHERE left_at IS NULL;"
)
print("  ✓ idx_cohort_members_active_contact (partial)")

# btree on (cohort_id, joined_at DESC) for recency listings
psql(
    "CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort_recent "
    "ON cohort_members (cohort_id, joined_at DESC);"
)
print("  ✓ idx_cohort_members_cohort_recent")


# ----- STEP 5: refresh schema cache -----

print("STEP 5: refresh schema cache")
code, _ = req("POST", "/utils/cache/clear", {})
print(f"  cache clear: HTTP {code}")

print("\n=== ALL STEPS COMPLETE ===")
print("Next: python3 validate.py")
