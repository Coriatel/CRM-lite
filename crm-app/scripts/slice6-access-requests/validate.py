#!/usr/bin/env python3
"""
Slice #6 validate — read-only assertions against post-apply state.

Checks:
  - access_requests collection present (HTTP 200)
  - Postgres table exists with all 10 expected columns
  - btree index idx_access_requests_decision_requested present
  - unique index uniq_access_requests_user present
  - FK requesting_user_id ON DELETE CASCADE
  - FK decided_by ON DELETE SET NULL

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


print("=== Directus collection ===")
code, _ = directus_get("/collections/access_requests")
check("collection access_requests", code == 200, f"HTTP {code}")

print("=== Postgres table ===")
out = psql("SELECT to_regclass('public.access_requests');")
check("table access_requests", out == "access_requests", f"to_regclass={out!r}")

print("=== Required columns ===")
EXPECTED_COLS = [
    "id", "requesting_user_id", "email", "display_name", "requested_at",
    "decision", "decided_at", "decided_by", "assigned_role_slug", "notes",
]
out = psql("SELECT column_name FROM information_schema.columns WHERE table_name='access_requests';")
present = set(out.split("\n"))
for col in EXPECTED_COLS:
    check(f"access_requests.{col}", col in present)

print("=== Indexes ===")
for idx in ("idx_access_requests_decision_requested", "uniq_access_requests_user"):
    out = psql(f"SELECT indexname FROM pg_indexes WHERE indexname='{idx}';")
    check(f"index {idx}", out == idx)

print("=== uniq_access_requests_user is UNIQUE ===")
out = psql(
    "SELECT indexdef FROM pg_indexes WHERE indexname='uniq_access_requests_user';"
)
check("uniq_access_requests_user is UNIQUE", "UNIQUE" in out.upper(), f"indexdef={out[:120]!r}")

print("=== FK on_delete actions ===")
# c=CASCADE, n=SET NULL
FK_EXPECT = {
    "requesting_user_id": ("c", "CASCADE"),
    "decided_by": ("n", "SET NULL"),
}
for col, (expected_code, expected_label) in FK_EXPECT.items():
    out = psql(
        f"SELECT c.confdeltype FROM pg_constraint c "
        f"JOIN pg_class t ON t.oid=c.conrelid "
        f"JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) "
        f"WHERE t.relname='access_requests' AND c.contype='f' AND a.attname='{col}';"
    )
    if not out:
        check(f"FK access_requests.{col} → {expected_label}", False, "(no FK found)")
        continue
    check(
        f"FK access_requests.{col} → {expected_label}",
        out == expected_code,
        f"confdeltype={out!r}",
    )

print("=== Empty collection (pre-OAuth) ===")
code, data = directus_get("/items/access_requests?limit=1")
rows = data.get("data") if (code == 200 and data) else None
check("access_requests empty post-apply", code == 200 and rows == [],
      f"HTTP {code}, rows={rows!r}")

print(f"\n=== SUMMARY: {len(passes)} pass / {len(fails)} fail ===")
sys.exit(0 if not fails else 1)
