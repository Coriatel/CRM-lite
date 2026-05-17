#!/usr/bin/env python3
"""
Slice #6a apply — attention_items schema (idempotent, owner-gated).

Creates:
  - attention_items collection (Directus)
  - 14 user-defined fields + 3 Directus-managed (id / created_at / updated_at)
  - FK attention_items.created_by → directus_users (ON DELETE SET NULL)
  - 1 partial unique index on (source, source_ref) WHERE source_ref IS NOT NULL
  - 2 btree indexes (owner-visibility, source-lookup)
  - 1 CHECK constraint (snooze must be after row creation)

Defaults to DRY-RUN. Requires explicit --apply to mutate Directus / Postgres,
and refuses to mutate without a BASELINE env var pointing to an existing
pg_dump baseline file (see README.md §"Run order — owner only").

Idempotent: safe to re-run; skips anything that already exists.

Required env when --apply is passed:
  DIRECTUS_URL            e.g. http://localhost:18055
  DIRECTUS_ADMIN_TOKEN    admin-grade static token
  BASELINE                /path/to/slice6-pre.dump (must exist & be non-empty)

Optional env:
  DB_CONTAINER            postgres container   (default: hycrm-directus-db)
  DB_USER                 postgres user        (default: hycrm)
  DB_NAME                 postgres database    (default: hycrm)

Owner-gated by README.md §"Owner approval — Phase 6a only".
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

# ---------- args ------------------------------------------------------
parser = argparse.ArgumentParser(description="Slice #6a attention_items apply")
parser.add_argument(
    "--apply",
    action="store_true",
    help="Actually mutate Directus / Postgres. Without this flag the script "
    "prints intended actions only (dry-run).",
)
parser.add_argument(
    "--yes",
    action="store_true",
    help="With --apply: skip interactive 'yes' confirmation. Required for "
    "non-interactive owner-run.",
)
args = parser.parse_args()
DRY_RUN = not args.apply


# ---------- declarative spec -----------------------------------------
OWNER_CHOICES = [
    {"text": "Elron",  "value": "elron"},
    {"text": "Rabbi",  "value": "rav"},
    {"text": "System", "value": "system"},
]
URGENCY_CHOICES = [
    {"text": "Low",      "value": "low"},
    {"text": "Normal",   "value": "normal"},
    {"text": "High",     "value": "high"},
    {"text": "Critical", "value": "critical"},
]
STATUS_CHOICES = [
    {"text": "Open",    "value": "open"},
    {"text": "Blocked", "value": "blocked"},
    {"text": "Waiting", "value": "waiting"},
    {"text": "Stale",   "value": "stale"},
    {"text": "Done",    "value": "done"},
]
DOMAIN_CHOICES = [
    {"text": "People",       "value": "people"},
    {"text": "Lessons",      "value": "lessons"},
    {"text": "Tasks",        "value": "tasks"},
    {"text": "Content",      "value": "content"},
    {"text": "Finance",      "value": "finance"},
    {"text": "Automation",   "value": "automation"},
    {"text": "Runtime",      "value": "runtime"},
]
SOURCE_CHOICES = [
    {"text": "Manual",     "value": "manual"},
    {"text": "Projection", "value": "projection"},
    {"text": "Import",     "value": "import"},
]

COLLECTION_SPEC = {
    "collection": "attention_items",
    "meta": {
        "icon": "flag",
        "note": "Daily Attention items shown on /today, /rabbi, /elron.",
        "display_template": "{{title}} — {{owner}} ({{urgency}})",
        "sort_field": "urgency",
        "archive_field": "dismissed_at",
        "archive_app_filter": True,
        "accountability": "all",
        "collection": "attention_items",
    },
    "schema": {"name": "attention_items"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"interface": "input", "readonly": True, "hidden": True,
                  "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},

        {"field": "title", "type": "string",
         "meta": {"interface": "input", "required": True,
                  "note": "Hebrew, ≤140 chars."},
         "schema": {"is_nullable": False, "max_length": 140}},

        {"field": "owner", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": OWNER_CHOICES}},
         "schema": {"is_nullable": False}},

        {"field": "urgency", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": URGENCY_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "normal"}},

        {"field": "status", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": STATUS_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "open"}},

        {"field": "domain", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": DOMAIN_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "tasks"}},

        {"field": "next_action", "type": "text",
         "meta": {"interface": "input-multiline", "required": True},
         "schema": {"is_nullable": False}},

        {"field": "href", "type": "string",
         "meta": {"interface": "input",
                  "note": "Internal app route, e.g. /people."},
         "schema": {"is_nullable": True}},

        {"field": "source", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": SOURCE_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "manual"}},

        {"field": "source_ref", "type": "string",
         "meta": {"interface": "input",
                  "note": "Stable key for projection upsert, "
                          "e.g. followup:<contact_id>."},
         "schema": {"is_nullable": True}},

        {"field": "pinned", "type": "boolean",
         "meta": {"interface": "boolean"},
         "schema": {"is_nullable": False, "default_value": False}},

        {"field": "snoozed_until", "type": "timestamp",
         "meta": {"interface": "datetime",
                  "note": "Hide until this time. CHECK enforces > created_at."},
         "schema": {"is_nullable": True}},

        {"field": "dismissed_at", "type": "timestamp",
         "meta": {"interface": "datetime",
                  "note": "Soft-delete marker; non-null = hidden."},
         "schema": {"is_nullable": True}},

        {"field": "note", "type": "text",
         "meta": {"interface": "input-multiline",
                  "note": "Private operator note."},
         "schema": {"is_nullable": True}},

        {"field": "created_by", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o",
                  "special": ["user-created"], "readonly": True,
                  "note": "Directus user; FK SET NULL."},
         "schema": {"is_nullable": True}},

        {"field": "created_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "hidden": True,
                  "special": ["date-created"]},
         "schema": {"is_nullable": False}},

        {"field": "updated_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "hidden": True,
                  "special": ["date-updated"]},
         "schema": {"is_nullable": True}},
    ],
}

INDEXES_SQL = [
    ("uq_attention_items_source_ref",
     "CREATE UNIQUE INDEX IF NOT EXISTS uq_attention_items_source_ref "
     "ON attention_items (source, source_ref) "
     "WHERE source_ref IS NOT NULL;"),
    ("ix_attention_items_owner_visibility",
     "CREATE INDEX IF NOT EXISTS ix_attention_items_owner_visibility "
     "ON attention_items (owner, dismissed_at, snoozed_until);"),
    ("ix_attention_items_source_lookup",
     "CREATE INDEX IF NOT EXISTS ix_attention_items_source_lookup "
     "ON attention_items (source, source_ref);"),
]

CHECKS = [
    ("chk_attention_items_snooze_after_create",
     "ALTER TABLE attention_items "
     "ADD CONSTRAINT chk_attention_items_snooze_after_create "
     "CHECK (snoozed_until IS NULL OR snoozed_until > created_at);"),
]


# ---------- dry-run path ---------------------------------------------
def banner(s: str) -> None:
    print("\n" + "=" * 72)
    print(s)
    print("=" * 72)


def dry_run() -> int:
    banner("Slice #6a attention_items — DRY RUN (no network, no SQL)")
    print("Status: dry-run. Re-run with --apply to mutate (requires env + baseline).\n")

    banner(f"Would POST /collections (1 collection, "
           f"{len(COLLECTION_SPEC['fields'])} fields)")
    print("collection:", COLLECTION_SPEC["collection"])
    for f in COLLECTION_SPEC["fields"]:
        flags = []
        if f.get("schema", {}).get("is_primary_key"):
            flags.append("PK")
        if f["meta"].get("required"):
            flags.append("required")
        if f["meta"].get("special"):
            flags.append("/".join(f["meta"]["special"]))
        print(f"  - {f['field']:14} {f['type']:10} "
              f"{('[' + ','.join(flags) + ']') if flags else ''}")

    banner("Would POST /relations (1 FK)")
    print("  attention_items.created_by → directus_users (ON DELETE SET NULL)")

    banner(f"Would run SQL — indexes ({len(INDEXES_SQL)})")
    for name, sql in INDEXES_SQL:
        print(f"  {name}")

    banner(f"Would run SQL — CHECK constraints ({len(CHECKS)})")
    for name, sql in CHECKS:
        print(f"  {name}")

    banner("Summary")
    print(f"  1 collection, {len(COLLECTION_SPEC['fields']) - 3} user fields "
          f"(+ id/created_at/updated_at), 1 FK, "
          f"{len(INDEXES_SQL)} indexes, {len(CHECKS)} CHECK.")
    print("  No data seeded. No permissions set (owner role only — v1).")
    print("\nNo Directus schema or production data was changed.")
    return 0


# ---------- real apply ------------------------------------------------
URL = os.environ.get("DIRECTUS_URL")
TOK = os.environ.get("DIRECTUS_ADMIN_TOKEN")
DB_CONTAINER = os.environ.get("DB_CONTAINER", "hycrm-directus-db")
DB_USER = os.environ.get("DB_USER", "hycrm")
DB_NAME = os.environ.get("DB_NAME", "hycrm")
BASELINE = os.environ.get("BASELINE")

H = {
    "Authorization": f"Bearer {TOK}" if TOK else "",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 slice6a-apply/1.0",
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


def relation_exists(coll, field):
    code, data = req("GET", "/relations")
    if code != 200:
        raise RuntimeError(f"list relations failed: {code} {data}")
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


def psql(sql, *, allow_duplicate=False):
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER,
         "psql", "-U", DB_USER, "-d", DB_NAME,
         "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True,
    )
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        if allow_duplicate and (
            "already exists" in out or "duplicate" in out.lower()
        ):
            return out
        raise RuntimeError(f"psql failed: {out}\n--- SQL ---\n{sql}")
    return out


def apply_for_real() -> int:
    # Preflight
    missing = [k for k, v in [
        ("DIRECTUS_URL", URL),
        ("DIRECTUS_ADMIN_TOKEN", TOK),
        ("BASELINE", BASELINE),
    ] if not v]
    if missing:
        print(f"ERROR: missing env: {', '.join(missing)}", file=sys.stderr)
        print("Required for --apply. Re-run without --apply for dry-run.",
              file=sys.stderr)
        return 2

    if not os.path.isfile(BASELINE) or os.path.getsize(BASELINE) == 0:
        print(f"ERROR: BASELINE '{BASELINE}' missing or empty.", file=sys.stderr)
        print("Take pg_dump baseline first. See README.md §Rollback plan.",
              file=sys.stderr)
        return 2

    print(f"Baseline: {BASELINE} ({os.path.getsize(BASELINE)} bytes)")
    print(f"Directus: {URL}")
    print(f"Postgres: {DB_CONTAINER}/{DB_USER}/{DB_NAME}\n")

    if not args.yes:
        ans = input("About to create attention_items in production. "
                    "Type 'yes' to proceed: ").strip()
        if ans != "yes":
            print("aborted")
            return 1

    banner("STEP 1: collection + fields")
    create_collection(COLLECTION_SPEC)

    banner("STEP 2: FK relations")
    create_relation({
        "collection": "attention_items",
        "field": "created_by",
        "related_collection": "directus_users",
        "schema": {"on_delete": "SET NULL"},
    })

    banner("STEP 3: btree + partial-unique indexes")
    for name, sql in INDEXES_SQL:
        psql(sql, allow_duplicate=True)
        print(f"  ✓ {name}")

    banner("STEP 4: CHECK constraints (idempotent via DO blocks)")
    for name, ddl in CHECKS:
        guarded = f"""
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '{name}'
      AND conrelid = 'attention_items'::regclass
  ) THEN
    {ddl}
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;
"""
        psql(guarded)
        print(f"  ✓ CHECK {name}")

    banner("Done")
    print("Run validate.py to verify post-apply state.")
    return 0


# ---------- entrypoint -----------------------------------------------
if __name__ == "__main__":
    sys.exit(dry_run() if DRY_RUN else apply_for_real())
