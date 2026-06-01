#!/usr/bin/env python3
"""
Slice #9 rollback — reverses apply.py. Additive column → safe drop.

Removes `scope` from meetings + reminders and deletes the Directus field rows.
No other data depends on the column. Idempotent.

Required env: DB_CONTAINER (default hycrm-directus-db), DB_USER (hycrm), DB_NAME (hycrm)
"""
import os
import subprocess

DB_CONTAINER = os.environ.get("DB_CONTAINER", "hycrm-directus-db")
DB_USER = os.environ.get("DB_USER", "hycrm")
DB_NAME = os.environ.get("DB_NAME", "hycrm")


def psql(sql):
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER,
         "psql", "-U", DB_USER, "-d", DB_NAME, "-v", "ON_ERROR_STOP=1", "-tAc", sql],
        capture_output=True, text=True,
    )
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {out}\n--- SQL ---\n{sql}")
    return out


for coll in ("meetings", "reminders"):
    psql(f"DELETE FROM directus_fields WHERE collection='{coll}' AND field='scope';")
    psql(f"ALTER TABLE {coll} DROP COLUMN IF EXISTS scope;")
    print(f"  - dropped {coll}.scope + field registration")

print("ROLLBACK COMPLETE")
