#!/usr/bin/env python3
"""
Slice #5 validate — read-only assertions against post-apply state.

Checks:
  - tasks collection present (HTTP 200)
  - Postgres table exists with expected columns
  - All 4 btree indexes present
  - FK on_delete=SET NULL for relations whose target collections exist
    (subject_contact_id, assignee_id, related_lesson_id, related_payment_id,
     related_care_report_id, related_cohort_id)
  - call_queue write permissions stripped for non-admin roles

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
warnings = []


def check(label, ok, detail=""):
    (passes if ok else fails).append(label)
    mark = "✓" if ok else "✗"
    print(f"  {mark} {label} {detail}")


def warn(label, detail=""):
    warnings.append(label)
    print(f"  ! {label} {detail}")


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
code, _ = directus_get("/collections/tasks")
check("collection tasks", code == 200, f"HTTP {code}")

print("=== Postgres table ===")
out = psql("SELECT to_regclass('public.tasks');")
check("table tasks", out == "tasks", f"to_regclass={out!r}")

print("=== Required columns ===")
EXPECTED_COLS = [
    "id", "kind", "subject_contact_id", "assignee_id", "due_at", "status",
    "priority", "outcome", "related_lesson_id", "related_payment_id",
    "related_care_report_id", "related_cohort_id", "notes",
    "created_at", "updated_at", "created_by",
]
out = psql("SELECT column_name FROM information_schema.columns WHERE table_name='tasks';")
present = set(out.split("\n"))
for col in EXPECTED_COLS:
    check(f"tasks.{col}", col in present)

print("=== btree indexes ===")
EXPECTED_INDEXES = [
    "idx_tasks_status_due",
    "idx_tasks_assignee_status",
    "idx_tasks_subject_contact",
    "idx_tasks_care_report",
]
for idx in EXPECTED_INDEXES:
    out = psql(f"SELECT indexname FROM pg_indexes WHERE indexname='{idx}';")
    check(f"index {idx}", out == idx)

print("=== FK on_delete=SET NULL (where target exists) ===")
# confdeltype: n = SET NULL
FK_TARGETS = [
    ("subject_contact_id", "contacts"),
    ("assignee_id", "contacts"),
    ("related_lesson_id", "lessons"),
    ("related_payment_id", "payments"),
    ("related_care_report_id", "care_reports"),
    ("related_cohort_id", "cohorts"),
]
for col, target_collection in FK_TARGETS:
    target_exists = psql(f"SELECT to_regclass('public.{target_collection}');") == target_collection
    if not target_exists:
        warn(f"tasks.{col} → {target_collection}", "target collection missing — FK skipped at apply time (expected)")
        continue
    out = psql(
        f"SELECT c.confdeltype FROM pg_constraint c "
        f"JOIN pg_class t ON t.oid=c.conrelid "
        f"JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) "
        f"WHERE t.relname='tasks' AND c.contype='f' AND a.attname='{col}';"
    )
    if not out:
        check(f"FK tasks.{col} → {target_collection}", False, "(no FK constraint found)")
        continue
    check(f"FK tasks.{col} → {target_collection} SET NULL", out == "n", f"confdeltype={out!r}")

print("=== call_queue write permissions stripped ===")
code, perms = directus_get("/permissions?filter[collection][_eq]=call_queue&limit=200")
if code == 200 and perms:
    write_perms = [p for p in perms["data"] if p.get("action") in ("create", "update", "delete")]
    check("call_queue write perms stripped", len(write_perms) == 0,
          f"found {len(write_perms)} write perm(s)")
else:
    warn("call_queue permissions check", f"HTTP {code} — manual verification required")

print("=== Empty collection (pre-migration) ===")
code, data = directus_get("/items/tasks?limit=1")
rows = data.get("data") if (code == 200 and data) else None
if rows == []:
    print("  ✓ tasks empty (pre-migration baseline)")
    passes.append("tasks empty pre-migration")
elif rows:
    print(f"  ! tasks has {len(rows)} row(s) — migration may have already run (this is OK if expected)")
    warnings.append("tasks non-empty")
else:
    check("tasks readable", False, f"HTTP {code}")

print(f"\n=== SUMMARY: {len(passes)} pass / {len(fails)} fail / {len(warnings)} warn ===")
sys.exit(0 if not fails else 1)
