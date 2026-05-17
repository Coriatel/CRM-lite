#!/usr/bin/env python3
"""
Slice #6a validate — read-only assertions against post-apply state.

Checks:
  - attention_items collection present (Directus HTTP 200)
  - Postgres table exists with all 17 expected columns
  - Partial unique index uq_attention_items_source_ref present
  - Btree indexes ix_attention_items_owner_visibility + _source_lookup present
  - CHECK constraint chk_attention_items_snooze_after_create present
  - FK attention_items.created_by → directus_users with SET NULL
  - Sanity: row count == 0 (Phase 6a ships schema only; no seed)

Exit 0 = all pass, 1 = any fail, 2 = env missing.
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
    print("ERROR: set DIRECTUS_URL and DIRECTUS_ADMIN_TOKEN", file=sys.stderr)
    sys.exit(2)

passes: list[str] = []
fails: list[str] = []


def check(label, ok, detail=""):
    (passes if ok else fails).append(label)
    mark = "✓" if ok else "✗"
    print(f"  {mark} {label} {detail}".rstrip())


def directus_get(path):
    r = urllib.request.Request(
        URL + path, headers={"Authorization": f"Bearer {TOK}"}
    )
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None


def psql(sql):
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER,
         "psql", "-U", DB_USER, "-d", DB_NAME, "-tA", "-c", sql],
        capture_output=True, text=True,
    )
    return r.stdout.strip()


print("=== Directus collection ===")
code, _ = directus_get("/collections/attention_items")
check("collection attention_items", code == 200, f"HTTP {code}")

print("=== Postgres table ===")
out = psql("SELECT to_regclass('public.attention_items');")
check("table attention_items", out == "attention_items", f"to_regclass={out!r}")

print("=== Required columns (17) ===")
expected_cols = [
    "id", "title", "owner", "urgency", "status", "domain",
    "next_action", "href", "source", "source_ref",
    "pinned", "snoozed_until", "dismissed_at", "note",
    "created_by", "created_at", "updated_at",
]
out = psql(
    "SELECT column_name FROM information_schema.columns "
    "WHERE table_name='attention_items';"
)
present = set(out.split("\n"))
for col in expected_cols:
    check(f"col {col}", col in present)

print("=== Indexes ===")
for ix in (
    "uq_attention_items_source_ref",
    "ix_attention_items_owner_visibility",
    "ix_attention_items_source_lookup",
):
    out = psql(
        f"SELECT indexname FROM pg_indexes WHERE indexname='{ix}';"
    )
    check(ix, out == ix)

print("=== CHECK constraints ===")
out = psql(
    "SELECT conname FROM pg_constraint "
    "WHERE conname='chk_attention_items_snooze_after_create' "
    "AND conrelid='attention_items'::regclass;"
)
check("chk_attention_items_snooze_after_create",
      out == "chk_attention_items_snooze_after_create")

print("=== FK created_by → directus_users (SET NULL) ===")
out = psql(
    "SELECT confdeltype FROM pg_constraint c "
    "JOIN pg_class t ON t.oid=c.conrelid "
    "WHERE t.relname='attention_items' AND c.contype='f' "
    "AND c.conname LIKE '%created_by%';"
)
# 'n' = SET NULL
check("created_by FK SET NULL", out == "n", f"confdeltype={out!r}")

print("=== No seeded rows (Phase 6a ships schema only) ===")
out = psql("SELECT count(*) FROM attention_items;")
check("row count == 0", out == "0", f"count={out!r}")

print(f"\n=== SUMMARY: {len(passes)} pass / {len(fails)} fail ===")
sys.exit(0 if not fails else 1)
