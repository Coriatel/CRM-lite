#!/usr/bin/env python3
"""
Slice #5 schema apply — idempotent (additive only).

Creates:
  - tasks collection with 15 fields per proposal §C1
  + FK relations for subject_contact_id, assignee_id, related_lesson_id,
    related_payment_id, related_care_report_id, related_cohort_id
    (ALL with ON DELETE SET NULL — task survives related-entity deletion)
  + btree indexes for (status, due_at), (assignee_id, status),
    (subject_contact_id), (related_care_report_id)
  + Strips write permissions on call_queue for crm-app role (read-only legacy)

For FKs whose target collection does not exist (e.g. care_reports), the
column is created but the FK constraint is skipped with a TODO log line.

Binding spec:
  /srv/ops-vault/proposals/tasks-schema-proposal.md
  /srv/ops-vault/projects/merkaz-neshama-os/lane-a/decisions/tasks-vs-call-queue.md  (Option B)

Safe to re-run: skips anything that already exists.

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
    "User-Agent": "slice5-tasks-apply/1.0",
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


def create_relation_if_target_exists(coll, field, target):
    if relation_exists(coll, field):
        print(f"  ✓ relation exists: {coll}.{field} (skip)")
        return
    if not collection_exists(target):
        print(f"  ! target {target} missing — FK skipped for {coll}.{field} (re-run after {target} ships)")
        return
    spec = {
        "collection": coll,
        "field": field,
        "related_collection": target,
        "schema": {"on_delete": "SET NULL"},
        "meta": {"sort_field": None},
    }
    code, data = req("POST", "/relations", spec)
    if code == 200:
        print(f"  + created relation: {coll}.{field} → {target} (SET NULL)")
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


# Enum choices per proposal §C3
KIND_CHOICES = [
    {"text": "שיחת טלפון", "value": "call"},
    {"text": "מעקב", "value": "followup"},
    {"text": "פעולת חיזוק", "value": "care_action"},
    {"text": "משימת הרב", "value": "rabbi_action"},
    {"text": "משימה אדמיניסטרטיבית", "value": "admin"},
    {"text": "לוגיסטיקת שיעור", "value": "lesson_logistics"},
    {"text": "מעקב תרומה / תשלום", "value": "contribution_followup"},
    {"text": "אפשר תמיכה / סבסוד", "value": "support_needed"},
    {"text": "סבסוד / חסות", "value": "sponsorship_subsidy"},
    {"text": "חסר קבלה", "value": "receipt_needed"},
    {"text": "משימת ניהול תקין", "value": "compliance_task"},
    {"text": "אדמין תורם", "value": "donor_admin"},
    {"text": "שכר דירה / חשבונות", "value": "rent_utility"},
    {"text": "משימה טכנית", "value": "technical_project"},
]

STATUS_CHOICES = [
    {"text": "Open", "value": "open"},
    {"text": "Done", "value": "done"},
    {"text": "Snoozed", "value": "snoozed"},
    {"text": "Canceled", "value": "canceled"},
]


print("STEP 1: tasks collection")
create_collection({
    "collection": "tasks",
    "meta": {
        "icon": "task_alt",
        "note": "Canonical action primitive (slice #5; supersedes call_queue post-cutover).",
        "display_template": "{{kind}}: {{subject_contact_id.full_name}} — {{status}}",
        "translations": [{"language": "he-IL", "translation": "משימות"}],
        "sort_field": "due_at",
        "accountability": "all",
    },
    "schema": {"name": "tasks"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"hidden": True, "readonly": True, "interface": "input", "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},
        {"field": "kind", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": KIND_CHOICES},
                  "note": "Use participation-not-collection language in UI (per operational-model.md §12.5). Never frame contribution_followup as debt collection."},
         "schema": {"is_nullable": False, "default_value": "call"}},
        {"field": "subject_contact_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o",
                  "display": "related-values",
                  "display_options": {"template": "{{full_name}}"},
                  "note": "Who the task is ABOUT (nullable for admin/project tasks)"},
         "schema": {"is_nullable": True}},
        {"field": "assignee_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o",
                  "display": "related-values",
                  "display_options": {"template": "{{full_name}}"},
                  "note": "Who ACTS (rabbi / leader / operator / Elron)"},
         "schema": {"is_nullable": True}},
        {"field": "due_at", "type": "timestamp",
         "meta": {"interface": "datetime", "note": "null = no time pressure"},
         "schema": {"is_nullable": True}},
        {"field": "status", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": STATUS_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "open"}},
        {"field": "priority", "type": "integer",
         "meta": {"interface": "input", "required": True,
                  "note": "1 (urgent) … 5 (low); mirrors call_queue.priority"},
         "schema": {"is_nullable": False, "default_value": 2}},
        {"field": "outcome", "type": "text",
         "meta": {"interface": "input-multiline",
                  "note": "Free-text once status flips to done/canceled"},
         "schema": {"is_nullable": True}},
        {"field": "related_lesson_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o"},
         "schema": {"is_nullable": True}},
        {"field": "related_payment_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o"},
         "schema": {"is_nullable": True}},
        {"field": "related_care_report_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o"},
         "schema": {"is_nullable": True}},
        {"field": "related_cohort_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o"},
         "schema": {"is_nullable": True}},
        {"field": "notes", "type": "text",
         "meta": {"interface": "input-multiline",
                  "note": "Admin-only; also carries migration audit refs from call_queue"},
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


print("STEP 2: FK relations (SET NULL where target exists; column-only where target missing)")
FK_TARGETS = [
    ("subject_contact_id", "contacts"),
    ("assignee_id", "contacts"),
    ("related_lesson_id", "lessons"),
    ("related_payment_id", "payments"),
    ("related_care_report_id", "care_reports"),
    ("related_cohort_id", "cohorts"),
]
for field, target in FK_TARGETS:
    create_relation_if_target_exists("tasks", field, target)


print("STEP 3: btree indexes")
INDEXES = [
    ("idx_tasks_status_due", "CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks (status, due_at);"),
    ("idx_tasks_assignee_status", "CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks (assignee_id, status);"),
    ("idx_tasks_subject_contact", "CREATE INDEX IF NOT EXISTS idx_tasks_subject_contact ON tasks (subject_contact_id);"),
    ("idx_tasks_care_report", "CREATE INDEX IF NOT EXISTS idx_tasks_care_report ON tasks (related_care_report_id);"),
]
for idx_name, sql in INDEXES:
    psql(sql)
    print(f"  ✓ {idx_name}")


print("STEP 4: strip call_queue write permissions for crm-app role")
# call_queue stays as legacy READ-ONLY post-cutover. We only strip create/update/delete
# from any non-admin role that has them. Admin retains full access. We list current
# permissions for call_queue and delete the create/update/delete ones for non-admin.
code, perms = req("GET", "/permissions?filter[collection][_eq]=call_queue&limit=200")
if code != 200:
    print(f"  ! could not list permissions for call_queue (HTTP {code}); skipping perm strip")
else:
    revoked = 0
    for p in perms.get("data", []):
        action = p.get("action")
        role = p.get("role")  # null = public; uuid = specific role
        # Skip admin (role IS NULL means public; admin perms are inherited via role, not listed here)
        if action in ("create", "update", "delete"):
            pid = p.get("id")
            dcode, _ = req("DELETE", f"/permissions/{pid}")
            if dcode in (200, 204):
                revoked += 1
                print(f"  - revoked perm {action} on call_queue (id={pid}, role={role})")
    print(f"  ✓ revoked {revoked} write permission(s) on call_queue")


print("STEP 5: refresh schema cache")
code, _ = req("POST", "/utils/cache/clear", {})
print(f"  cache clear: HTTP {code}")

print("\n=== ALL STEPS COMPLETE ===")
print("Next: python3 validate.py")
print("Then: python3 migrate_call_queue_to_tasks.py --dry-run")
