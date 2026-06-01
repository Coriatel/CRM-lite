#!/usr/bin/env python3
"""
Slice #9 schema apply — idempotent (additive only).

Adds a single `scope` field to the existing meetings + reminders collections
(A7 / Rabbi Control Center — Phase 3 private-vs-amuta separation):

  scope  varchar(16)  NOT NULL  DEFAULT 'private'   values: private | amuta

Binding spec (owner-ratified Q1-Q6, 2026-06-01):
  /srv/ops-vault/projects/merkaz-neshama-os/lane-a/decisions/rabbi-private-vs-amuta-scope.md
    Q1 field name `scope` · Q2 values private|amuta · Q3 default private (fail-safe)
    Q4 broad-surface wiring deferred · Q5 notes stay owner-only both scopes
    Q6 backfill existing rows via column default (no data migration)

NOT NULL hardening: the packet proposed a nullable column; this apply uses
NOT NULL DEFAULT 'private' so a row can never carry a NULL/unknown scope
(owner audit question "avoid NULL/unknown scope states"). Equally reversible.

Mechanism: raw psql via `docker exec` (the slice8 migration's sanctioned path for
DB-level steps), plus a directus_fields registration so the column surfaces in the
Directus admin UI as a private|amuta select-dropdown. No admin REST token required.
Safe to re-run: every step is existence-guarded. Seeds NO data.

Required env (all optional — sensible hycrm defaults):
  DB_CONTAINER   postgres container (default: hycrm-directus-db)
  DB_USER        default: hycrm
  DB_NAME        default: hycrm

NOTE: This is a production additive migration. Run only on explicit owner go
(Authority Gate #5). Authoring this script is not running it.
Rollback: python3 rollback.py   (DROP COLUMN scope on both + remove the fields rows)
"""
import os
import subprocess
import sys

DB_CONTAINER = os.environ.get("DB_CONTAINER", "hycrm-directus-db")
DB_USER = os.environ.get("DB_USER", "hycrm")
DB_NAME = os.environ.get("DB_NAME", "hycrm")

COLLECTIONS = ("meetings", "reminders")
SCOPE_OPTIONS = (
    '{"choices":[{"text":"Private (Rabbi)","value":"private"},'
    '{"text":"Amuta / Org","value":"amuta"}]}'
)


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


print("STEP 1: add `scope` column (additive, NOT NULL DEFAULT 'private')")
for coll in COLLECTIONS:
    psql(
        f"ALTER TABLE {coll} "
        f"ADD COLUMN IF NOT EXISTS scope varchar(16) NOT NULL DEFAULT 'private';"
    )
    print(f"  ✓ {coll}.scope present (varchar(16) NOT NULL DEFAULT 'private')")

print("STEP 2: register the field in Directus (select-dropdown private|amuta)")
for coll in COLLECTIONS:
    exists = psql(
        "SELECT EXISTS(SELECT 1 FROM directus_fields "
        f"WHERE collection='{coll}' AND field='scope');"
    )
    if exists == "t":
        print(f"  ✓ directus_fields {coll}.scope exists (skip)")
        continue
    # place it right after status in the admin form
    psql(
        "INSERT INTO directus_fields "
        "(collection, field, special, interface, options, display, readonly, "
        " hidden, sort, width, required, note) VALUES "
        f"('{coll}', 'scope', NULL, 'select-dropdown', '{SCOPE_OPTIONS}', NULL, "
        " false, false, "
        f" (SELECT COALESCE(MAX(sort),0)+1 FROM directus_fields WHERE collection='{coll}'), "
        " 'half', true, "
        " 'private = Rabbi-only; amuta = organizational (may appear on broad ops surfaces). Default private.');"
    )
    print(f"  + registered directus_fields {coll}.scope")

print("STEP 3: schema cache")
# CACHE_ENABLED defaults to false on this instance, so the items API reflects the
# new column immediately. If a deployment enables the cache, bounce it with:
#   curl -XPOST $DIRECTUS_URL/utils/cache/clear -H "Authorization: Bearer <admin>"
print("  ✓ cache disabled by default — column live for the items API")

print("\n=== ALL STEPS COMPLETE ===")
print("Next: python3 validate.py")
