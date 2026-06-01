#!/usr/bin/env python3
"""
Slice #9 validate — read-only post-apply checks. Mutates nothing.

Confirms `scope` exists on meetings + reminders as varchar(16) NOT NULL
DEFAULT 'private', that no row carries a NULL/unknown scope, and that the
Directus field registration is present. Exit 0 = all good.

Required env: DB_CONTAINER (default hycrm-directus-db), DB_USER (hycrm), DB_NAME (hycrm)
"""
import os
import subprocess
import sys

DB_CONTAINER = os.environ.get("DB_CONTAINER", "hycrm-directus-db")
DB_USER = os.environ.get("DB_USER", "hycrm")
DB_NAME = os.environ.get("DB_NAME", "hycrm")

fails = []


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


for coll in ("meetings", "reminders"):
    row = psql(
        "SELECT data_type||'|'||character_maximum_length||'|'||is_nullable||'|'||column_default "
        f"FROM information_schema.columns WHERE table_name='{coll}' AND column_name='scope';"
    )
    check(f"{coll}.scope is varchar(16) NOT NULL DEFAULT 'private'",
          row.startswith("character varying|16|NO|") and "'private'" in row)

    # no NULL / unknown values (Q3 fail-safe)
    bad = psql(
        f"SELECT count(*) FROM {coll} WHERE scope IS NULL OR scope NOT IN ('private','amuta');"
    )
    check(f"{coll} has no NULL/unknown scope rows", bad == "0")

    # Directus field registration
    reg = psql(
        "SELECT interface FROM directus_fields "
        f"WHERE collection='{coll}' AND field='scope';"
    )
    check(f"{coll}.scope registered as select-dropdown", reg == "select-dropdown")

print()
if fails:
    print(f"VALIDATION FAILED: {len(fails)} issue(s)", file=sys.stderr)
    sys.exit(1)
print("VALIDATION OK")
