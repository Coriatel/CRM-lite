#!/usr/bin/env python3
"""
Slice #6 — attention_items schema PROPOSAL dry-run.

PROPOSAL ONLY. This script will NOT call Directus, will NOT touch Postgres,
will NOT mutate any production data. It prints the intended REST calls and
SQL statements that the real apply.py (written only after owner approval per
README.md §"Owner approval required") would execute.

Usage:
    python3 apply.py            # dry-run: prints intended actions
    python3 apply.py --apply    # blocked — exits 2 with PROPOSAL ONLY message

Owner-gated by README.md §"Owner approval required".
"""
import json
import sys

DIRECTUS_BASE = "<DIRECTUS_URL>"

COLLECTION_SPEC = {
    "collection": "attention_items",
    "meta": {
        "icon": "flag",
        "note": "Daily Attention items shown on /today",
        "display_template": "{{title}} — {{owner}} ({{urgency}})",
        "sort_field": "urgency",
        "archive_field": "dismissed_at",
        "archive_app_filter": True,
    },
    "schema": {"name": "attention_items"},
}

FIELDS = [
    ("title",         {"type": "string",   "required": True,  "max_length": 140}),
    ("owner",         {"type": "string",   "required": True,  "enum": ["elron", "rav", "system"]}),
    ("urgency",       {"type": "string",   "required": True,  "enum": ["low", "normal", "high", "critical"]}),
    ("status",        {"type": "string",   "required": True,  "enum": ["open", "blocked", "waiting", "stale", "done"]}),
    ("domain",        {"type": "string",   "required": True,  "enum": ["people", "lessons", "tasks", "content", "finance", "automation", "runtime"]}),
    ("next_action",   {"type": "text",     "required": True}),
    ("href",          {"type": "string",   "required": False}),
    ("source",        {"type": "string",   "required": True,  "enum": ["manual", "projection", "import"]}),
    ("source_ref",    {"type": "string",   "required": False}),
    ("pinned",        {"type": "boolean",  "default": False}),
    ("snoozed_until", {"type": "timestamp","required": False}),
    ("dismissed_at",  {"type": "timestamp","required": False}),
    ("note",          {"type": "text",     "required": False}),
]

INDEXES_SQL = [
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_attention_items_source_ref "
    "  ON attention_items (source, source_ref) "
    "  WHERE source_ref IS NOT NULL;",
    "CREATE INDEX IF NOT EXISTS ix_attention_items_owner_visibility "
    "  ON attention_items (owner, dismissed_at, snoozed_until);",
    "CREATE INDEX IF NOT EXISTS ix_attention_items_source_lookup "
    "  ON attention_items (source, source_ref);",
]

CHECKS_SQL = [
    "ALTER TABLE attention_items "
    "  ADD CONSTRAINT chk_attention_items_snooze_after_create "
    "  CHECK (snoozed_until IS NULL OR snoozed_until > created_at);",
]


def banner(s: str) -> None:
    print("\n" + "=" * 72)
    print(s)
    print("=" * 72)


def main() -> int:
    if "--apply" in sys.argv:
        print(
            "PROPOSAL ONLY — this script cannot apply.\n"
            "The real apply.py is written after owner approval per README.md.",
            file=sys.stderr,
        )
        return 2

    banner("Slice #6 attention_items — DRY RUN (no network, no SQL)")
    print("Status: PROPOSAL ONLY. No collection will be created.\n")

    banner("Would POST " + DIRECTUS_BASE + "/collections")
    print(json.dumps(COLLECTION_SPEC, indent=2, ensure_ascii=False))

    banner("Would POST " + DIRECTUS_BASE + "/fields/attention_items (×%d)" % len(FIELDS))
    for name, spec in FIELDS:
        print(f"  - {name:14} → {json.dumps(spec, ensure_ascii=False)}")

    banner("Would run SQL (indexes)")
    for s in INDEXES_SQL:
        print("  " + s.replace("\n", "\n  "))

    banner("Would run SQL (CHECK constraints)")
    for s in CHECKS_SQL:
        print("  " + s.replace("\n", "\n  "))

    banner("Summary")
    print(f"  1 collection, {len(FIELDS)} fields, "
          f"{len(INDEXES_SQL)} indexes, {len(CHECKS_SQL)} CHECK constraints.")
    print("  No data seeded. No permissions set (owner role only — v1).")
    print("\nNo Directus schema or production data was changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
