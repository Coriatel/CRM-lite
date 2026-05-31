#!/usr/bin/env python3
"""
Slice #8 validate — read-only post-apply checks. Mutates nothing.

Confirms the meetings/reminders collections, key fields, FK on_delete rules,
and partial indexes exist as the ratified packet specifies. Exit 0 = all good.

Required env: DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN
              DB_CONTAINER (default hycrm-directus-db), DB_USER (hycrm), DB_NAME (hycrm)
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

H = {"Authorization": f"Bearer {TOK}", "User-Agent": "slice8-validate/1.0"}
fails = []


def get(path):
    r = urllib.request.Request(URL + path, headers=H)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None


def psql(sql):
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER,
         "psql", "-U", DB_USER, "-d", DB_NAME, "-tAc", sql],
        capture_output=True, text=True,
    )
    return (r.stdout + r.stderr).strip()


def check(label, ok):
    print(f"  {'✓' if ok else '✗'} {label}")
    if not ok:
        fails.append(label)


code, cols = get("/collections?fields=collection&limit=500")
names = {c["collection"] for c in cols["data"]} if code == 200 else set()
check("collection meetings exists", "meetings" in names)
check("collection reminders exists", "reminders" in names)

for coll, required in (
    ("meetings", {"title", "starts_at", "ends_at", "location", "status", "contact_id", "owner_id", "notes"}),
    ("reminders", {"title", "due_at", "status", "contact_id", "owner_id", "notes"}),
):
    code, fdata = get(f"/fields/{coll}")
    have = {f["field"] for f in fdata["data"]} if code == 200 else set()
    check(f"{coll} has required fields", required.issubset(have))

code, rels = get("/relations")
rel = {(r["collection"], r["field"]): r["schema"].get("on_delete")
       for r in rels["data"]} if code == 200 else {}
for coll in ("meetings", "reminders"):
    check(f"{coll}.contact_id ON DELETE SET NULL", rel.get((coll, "contact_id")) == "SET NULL")
    check(f"{coll}.owner_id ON DELETE SET NULL", rel.get((coll, "owner_id")) == "SET NULL")

idx = psql("SELECT indexname FROM pg_indexes WHERE tablename IN ('meetings','reminders');")
for name in ("idx_meetings_scheduled_starts", "idx_reminders_pending_due"):
    check(f"partial index {name} present", name in idx)

print()
if fails:
    print(f"VALIDATION FAILED: {len(fails)} issue(s)", file=sys.stderr)
    sys.exit(1)
print("VALIDATION OK")
