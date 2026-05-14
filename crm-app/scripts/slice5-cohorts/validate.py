#!/usr/bin/env python3
"""
Slice #5 validate — read-only assertions against post-apply state.

Checks:
  - cohorts + cohort_members collections present (HTTP 200)
  - Postgres tables exist with expected columns
  - uniq_cohort_members_pair index present
  - FK relations from cohort_members → cohorts with RESTRICT

Exit 0 = all pass, 1 = any fail.
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

passes = []
fails = []


def check(label, ok, detail=""):
    (passes if ok else fails).append(label)
    mark = "✓" if ok else "✗"
    print(f"  {mark} {label} {detail}")


def directus_get(path):
    req = urllib.request.Request(URL + path, headers={"Authorization": f"Bearer {TOK}"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None


def psql(sql):
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER,
         "psql", "-U", DB_USER, "-d", DB_NAME, "-tA", "-c", sql],
        capture_output=True, text=True,
    )
    return r.stdout.strip()


print("=== Directus collections ===")
for c in ("cohorts", "cohort_members"):
    code, _ = directus_get(f"/collections/{c}")
    check(f"collection {c}", code == 200, f"HTTP {code}")

print("=== Postgres tables ===")
for t in ("cohorts", "cohort_members"):
    out = psql(f"SELECT to_regclass('public.{t}');")
    check(f"table {t}", out == t, f"to_regclass={out!r}")

print("=== Required columns ===")
expected = {
    "cohorts": ["id", "slug", "name", "status", "member_count", "created_at"],
    "cohort_members": ["id", "cohort_id", "contact_id", "joined_at"],
}
for table, cols in expected.items():
    out = psql(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}';")
    present = set(out.split("\n"))
    for col in cols:
        check(f"{table}.{col}", col in present)

print("=== uniq_cohort_members_pair ===")
out = psql("SELECT indexname FROM pg_indexes WHERE indexname='uniq_cohort_members_pair';")
check("uniq_cohort_members_pair", out == "uniq_cohort_members_pair")

print("=== FK cohort_members.cohort_id ON DELETE RESTRICT ===")
out = psql(
    "SELECT confdeltype FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid "
    "WHERE t.relname='cohort_members' AND c.contype='f' AND c.conname LIKE '%cohort_id%';"
)
# 'r' = RESTRICT
check("cohort_id FK RESTRICT", out == "r", f"confdeltype={out!r}")

print(f"\n=== SUMMARY: {len(passes)} pass / {len(fails)} fail ===")
sys.exit(0 if not fails else 1)
