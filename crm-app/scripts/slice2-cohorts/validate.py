#!/usr/bin/env python3
"""
Slice #2 validate — read-only assertions against post-apply state.

Checks:
  - cohorts + cohort_members collections present (HTTP 200)
  - Postgres tables exist with expected columns
  - uniq_cohort_members_active_pair partial unique index present
  - FK on_delete actions match proposal §D5:
      cohort_members.cohort_id   = CASCADE
      cohort_members.contact_id  = RESTRICT
      cohorts.lead_teacher_id    = SET NULL

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
    "cohorts": [
        "id", "name", "slug", "track", "status", "start_date",
        "target_size", "lead_teacher_id", "location", "notes",
        "created_at", "updated_at", "created_by",
    ],
    "cohort_members": [
        "id", "cohort_id", "contact_id", "readiness", "role",
        "joined_at", "left_at", "notes",
        "created_at", "updated_at", "created_by",
    ],
}
for table, cols in expected.items():
    out = psql(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}';")
    present = set(out.split("\n"))
    for col in cols:
        check(f"{table}.{col}", col in present)

print("=== Partial unique index uniq_cohort_members_active_pair ===")
out = psql(
    "SELECT indexdef FROM pg_indexes "
    "WHERE indexname='uniq_cohort_members_active_pair';"
)
check("uniq_cohort_members_active_pair exists", "uniq_cohort_members_active_pair" in out)
check(
    "uniq_cohort_members_active_pair is partial WHERE left_at IS NULL",
    "left_at IS NULL" in out,
    f"indexdef={out[:120]!r}",
)

print("=== FK on_delete actions ===")
# confdeltype codes: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
FK_EXPECT = {
    ("cohort_members", "cohort_id"): ("c", "CASCADE"),
    ("cohort_members", "contact_id"): ("r", "RESTRICT"),
    ("cohorts", "lead_teacher_id"): ("n", "SET NULL"),
}
for (table, col), (expected_code, expected_label) in FK_EXPECT.items():
    out = psql(
        f"SELECT c.confdeltype FROM pg_constraint c "
        f"JOIN pg_class t ON t.oid=c.conrelid "
        f"JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) "
        f"WHERE t.relname='{table}' AND c.contype='f' AND a.attname='{col}';"
    )
    if not out:
        check(f"FK {table}.{col} → {expected_label}", False, "(no FK found)")
        continue
    check(
        f"FK {table}.{col} → {expected_label}",
        out == expected_code,
        f"confdeltype={out!r}",
    )

print("=== Empty collections (no test data) ===")
for c in ("cohorts", "cohort_members"):
    code, data = directus_get(f"/items/{c}?limit=1")
    rows = data.get("data", []) if (code == 200 and data) else None
    check(f"{c} empty post-apply", code == 200 and rows == [],
          f"HTTP {code}, rows={rows!r}")

print(f"\n=== SUMMARY: {len(passes)} pass / {len(fails)} fail ===")
sys.exit(0 if not fails else 1)
