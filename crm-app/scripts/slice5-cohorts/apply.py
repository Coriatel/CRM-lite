#!/usr/bin/env python3
"""
Slice #5 schema apply — idempotent (additive only).

Creates:
  - cohorts                 (named groups of contacts)
  - cohort_members          (junction: cohort_id × contact_id, unique pair)
  + FK relations (RESTRICT both sides)
  + unique index on (cohort_id, contact_id)
  + btree indexes for slug / status lookups

Safe to re-run: skips anything that already exists.
Does NOT seed data. Owner role only — v1.

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
    "User-Agent": "slice5-apply/1.0",
}


def req(method, path, body=None):
    d = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + path, data=d, method=method, headers=H)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def collection_exists(name):
    code, data = req("GET", "/collections?fields=collection&limit=500")
    if code != 200:
        raise RuntimeError(f"list collections failed: {code} {data}")
    return any(c["collection"] == name for c in data["data"])


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
        print(f"  + created relation: {coll}.{field}")
    else:
        raise RuntimeError(f"relation {coll}.{field} failed: {code} {data}")


def psql(sql, *, allow_duplicate=False):
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER,
         "psql", "-U", DB_USER, "-d", DB_NAME, "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True,
    )
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        if allow_duplicate and ("already exists" in out or "duplicate" in out.lower()):
            return out
        raise RuntimeError(f"psql failed: {out}\n--- SQL ---\n{sql}")
    return out


def main():
    print("STEP 1: cohorts collection")
    create_collection({
        "collection": "cohorts",
        "meta": {
            "icon": "groups",
            "note": "Named groups of contacts (slice #5).",
            "display_template": "{{name}} ({{status}})",
            "sort_field": "created_at",
            "accountability": "all",
        },
        "schema": {"name": "cohorts"},
        "fields": [
            {"field": "id", "type": "uuid", "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
             "schema": {"is_primary_key": True, "has_auto_increment": False}},
            {"field": "slug", "type": "string", "meta": {"interface": "input", "required": True, "note": "kebab-case unique slug"},
             "schema": {"is_nullable": False, "is_unique": True}},
            {"field": "name", "type": "string", "meta": {"interface": "input", "required": True},
             "schema": {"is_nullable": False}},
            {"field": "description", "type": "text", "meta": {"interface": "input-multiline"}},
            {"field": "status", "type": "string", "meta": {"interface": "select-dropdown", "options": {"choices": [
                {"text": "Draft", "value": "draft"},
                {"text": "Active", "value": "active"},
                {"text": "Archived", "value": "archived"},
            ]}, "required": True},
             "schema": {"is_nullable": False, "default_value": "draft"}},
            {"field": "member_count", "type": "integer", "meta": {"interface": "input", "readonly": True, "note": "Cached count; refreshed by writer."},
             "schema": {"is_nullable": False, "default_value": 0}},
            {"field": "created_at", "type": "timestamp", "meta": {"interface": "datetime", "readonly": True, "special": ["date-created"]},
             "schema": {"is_nullable": False}},
            {"field": "updated_at", "type": "timestamp", "meta": {"interface": "datetime", "readonly": True, "special": ["date-updated"]}},
        ],
    })

    print("STEP 2: cohort_members collection")
    create_collection({
        "collection": "cohort_members",
        "meta": {
            "icon": "person_add",
            "note": "Junction: cohort × contact (slice #5).",
            "display_template": "{{cohort_id.name}} ← {{contact_id.full_name}}",
            "sort_field": "joined_at",
            "accountability": "all",
            "hidden": True,
        },
        "schema": {"name": "cohort_members"},
        "fields": [
            {"field": "id", "type": "uuid", "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
             "schema": {"is_primary_key": True}},
            {"field": "cohort_id", "type": "uuid", "meta": {"interface": "select-dropdown-m2o", "required": True}},
            {"field": "contact_id", "type": "uuid", "meta": {"interface": "select-dropdown-m2o", "required": True}},
            {"field": "joined_at", "type": "timestamp", "meta": {"interface": "datetime", "readonly": True, "special": ["date-created"]},
             "schema": {"is_nullable": False}},
            {"field": "notes", "type": "text", "meta": {"interface": "input-multiline"}},
        ],
    })

    print("STEP 3: FK relations (RESTRICT both sides)")
    create_relation({
        "collection": "cohort_members",
        "field": "cohort_id",
        "related_collection": "cohorts",
        "schema": {"on_delete": "RESTRICT"},
        "meta": {"sort_field": None},
    })
    # contact_id → contacts (if contacts collection exists, else skip)
    if collection_exists("contacts"):
        create_relation({
            "collection": "cohort_members",
            "field": "contact_id",
            "related_collection": "contacts",
            "schema": {"on_delete": "RESTRICT"},
            "meta": {"sort_field": None},
        })
    else:
        print("  ! contacts collection not present — skipping cohort_members.contact_id FK (will need manual rerun once contacts ships)")

    print("STEP 4: unique (cohort_id, contact_id)")
    psql(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uniq_cohort_members_pair') THEN "
        "CREATE UNIQUE INDEX uniq_cohort_members_pair ON cohort_members (cohort_id, contact_id); "
        "END IF; END $$;"
    )
    print("  ✓ uniq_cohort_members_pair")

    print("STEP 5: btree indexes")
    for idx_name, sql in [
        ("idx_cohorts_slug", "CREATE INDEX IF NOT EXISTS idx_cohorts_slug ON cohorts (slug);"),
        ("idx_cohorts_status", "CREATE INDEX IF NOT EXISTS idx_cohorts_status ON cohorts (status);"),
        ("idx_cohort_members_cohort", "CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort ON cohort_members (cohort_id);"),
        ("idx_cohort_members_contact", "CREATE INDEX IF NOT EXISTS idx_cohort_members_contact ON cohort_members (contact_id);"),
    ]:
        psql(sql)
        print(f"  ✓ {idx_name}")

    print("STEP 6: refresh schema cache")
    code, _ = req("POST", "/utils/cache/clear", {})
    print(f"  cache clear: HTTP {code}")

    print("\n=== ALL STEPS COMPLETE ===")
    print("Next: python validate.py")


if __name__ == "__main__":
    main()
