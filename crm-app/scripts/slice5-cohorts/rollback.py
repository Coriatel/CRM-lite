#!/usr/bin/env python3
"""
Slice #5 rollback — DROP cohorts + cohort_members.

REQUIRES interactive confirmation. RESTRICT-safe (drops child first).

Env: DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, DB_CONTAINER, DB_USER, DB_NAME
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


def confirm():
    print("This will DROP TABLE cohort_members; DROP TABLE cohorts; (cascade-safe).")
    print("Type exactly 'yes' to continue:")
    if input().strip() != "yes":
        print("aborted")
        sys.exit(1)


def directus_delete(coll):
    req = urllib.request.Request(
        f"{URL}/collections/{coll}",
        method="DELETE",
        headers={"Authorization": f"Bearer {TOK}"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            print(f"  Directus DELETE /collections/{coll}: {r.status}")
    except urllib.error.HTTPError as e:
        print(f"  Directus DELETE /collections/{coll}: {e.code} (may be already gone)")


def psql(sql):
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER,
         "psql", "-U", DB_USER, "-d", DB_NAME, "-c", sql],
        capture_output=True, text=True,
    )
    out = (r.stdout + r.stderr).strip()
    print(out)
    return r.returncode == 0


def main():
    confirm()
    # Child first
    psql("DROP TABLE IF EXISTS cohort_members CASCADE;")
    psql("DROP TABLE IF EXISTS cohorts CASCADE;")
    directus_delete("cohort_members")
    directus_delete("cohorts")
    # Cache clear
    req = urllib.request.Request(
        f"{URL}/utils/cache/clear",
        data=b"{}",
        method="POST",
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            print(f"cache clear: {r.status}")
    except urllib.error.HTTPError as e:
        print(f"cache clear: {e.code}")
    print("=== ROLLBACK COMPLETE ===")


if __name__ == "__main__":
    main()
