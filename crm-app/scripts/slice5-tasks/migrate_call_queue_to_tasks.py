#!/usr/bin/env python3
"""
Slice #5 data migration — one-shot move of call_queue open rows into tasks.

For each call_queue row with status='pending':
  INSERT INTO tasks (
    kind='call', subject_contact_id, due_at, status='open',
    priority, created_at, notes='migrated from call_queue:<src_id>'
  )

Re-runnable: skips rows already migrated (detected via tasks.notes containing
"call_queue:<src_id>").

call_queue rows are NOT deleted. They remain as legacy read-only.

Usage:
  python3 migrate_call_queue_to_tasks.py --dry-run    # report what would happen
  python3 migrate_call_queue_to_tasks.py              # do the migration

Required env:
  DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN

Optional env:
  CALL_QUEUE_BATCH_SIZE   default 100
"""
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("DIRECTUS_URL")
TOK = os.environ.get("DIRECTUS_ADMIN_TOKEN")
BATCH = int(os.environ.get("CALL_QUEUE_BATCH_SIZE", "100"))
DRY_RUN = "--dry-run" in sys.argv

if not URL or not TOK:
    print("ERROR: set DIRECTUS_URL and DIRECTUS_ADMIN_TOKEN", file=sys.stderr)
    sys.exit(2)

H = {
    "Authorization": f"Bearer {TOK}",
    "Content-Type": "application/json",
    "User-Agent": "slice5-tasks-migrate/1.0",
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


def fetch_pending_call_queue():
    """Yield every call_queue row with status='pending', paginated."""
    offset = 0
    while True:
        path = (
            f"/items/call_queue"
            f"?filter[status][_eq]=pending"
            f"&limit={BATCH}&offset={offset}"
            f"&fields=id,contact_id,scheduled_date,priority,created_at,notes"
        )
        code, data = req("GET", path)
        if code != 200:
            raise RuntimeError(f"list call_queue failed: {code} {data}")
        rows = data.get("data", [])
        if not rows:
            return
        for r in rows:
            yield r
        if len(rows) < BATCH:
            return
        offset += BATCH


def already_migrated(src_id, cache):
    """Check if a task with notes matching this call_queue id already exists.

    Uses an in-memory cache built by a single scan of tasks at startup, since
    Directus's filter[notes][_contains] is sometimes case-folded; an explicit
    server-side query plus client-side substring check is more reliable.
    """
    needle = f"call_queue:{src_id}"
    return any(needle in (note or "") for note in cache)


def fetch_existing_audit_notes():
    """Return a list of every existing tasks.notes that mentions a call_queue migration."""
    notes = []
    offset = 0
    while True:
        path = (
            f"/items/tasks"
            f"?filter[notes][_contains]=migrated from call_queue:"
            f"&limit={BATCH}&offset={offset}"
            f"&fields=notes"
        )
        code, data = req("GET", path)
        if code != 200:
            raise RuntimeError(f"list tasks failed: {code} {data}")
        rows = data.get("data", [])
        if not rows:
            return notes
        notes.extend(r.get("notes") or "" for r in rows)
        if len(rows) < BATCH:
            return notes
        offset += BATCH


def cq_to_task(cq):
    """Build the tasks payload from a call_queue row."""
    due_at = None
    if cq.get("scheduled_date"):
        # call_queue.scheduled_date is a date string; we add 09:00 local for due_at
        due_at = f"{cq['scheduled_date']}T09:00:00"
    priority = cq.get("priority")
    if priority is None:
        priority = 2
    return {
        "kind": "call",
        "subject_contact_id": cq.get("contact_id"),
        "due_at": due_at,
        "status": "open",
        "priority": priority,
        "notes": f"migrated from call_queue:{cq['id']}",
        "created_at": cq.get("created_at"),
    }


def main():
    print(f"=== call_queue → tasks migration {'(DRY RUN)' if DRY_RUN else ''} ===")
    existing_notes = fetch_existing_audit_notes()
    print(f"  existing migrated tasks: {len(existing_notes)}")

    candidates = list(fetch_pending_call_queue())
    print(f"  call_queue pending rows: {len(candidates)}")

    to_migrate = [
        cq for cq in candidates if not already_migrated(cq["id"], existing_notes)
    ]
    skipped = len(candidates) - len(to_migrate)
    print(f"  to migrate: {len(to_migrate)}")
    print(f"  skipped (already migrated): {skipped}")

    if not to_migrate:
        print("Nothing to do.")
        return

    if DRY_RUN:
        for cq in to_migrate[:5]:
            sample = cq_to_task(cq)
            print(f"  would insert: kind=call subject_contact_id={sample['subject_contact_id']} "
                  f"due_at={sample['due_at']} priority={sample['priority']}")
        if len(to_migrate) > 5:
            print(f"  ... and {len(to_migrate) - 5} more")
        return

    inserted = 0
    failed = 0
    # Batch-insert via Directus item POST array
    for i in range(0, len(to_migrate), BATCH):
        batch = [cq_to_task(cq) for cq in to_migrate[i:i + BATCH]]
        code, data = req("POST", "/items/tasks", batch)
        if code == 200:
            inserted += len(batch)
            print(f"  + inserted batch {i // BATCH + 1}: {len(batch)} rows")
        else:
            failed += len(batch)
            print(f"  ! batch {i // BATCH + 1} FAILED: {code} {data}", file=sys.stderr)

    print(f"\n=== MIGRATION COMPLETE: {inserted} inserted, {failed} failed ===")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
