#!/usr/bin/env python3
"""
Slice #4 schema apply — idempotent.

Creates:
  - approvals               (auditable ledger of external/irreversible actions)
  - automation_runs         (execution ledger linked to approvals)
  + FK relations (RESTRICT on both sides — Codex N6)
  + 5 CHECK constraints (status/decided/executed/standing-cap/policy-per_run)
  + btree indexes for queue + polymorphic + audit reads

Safe to re-run: skips anything that already exists.
DOES NOT seed data, DOES NOT set granular permissions (owner role only — v1).

Required env:
  DIRECTUS_URL            e.g. https://crm.merkazneshama.co.il
  DIRECTUS_ADMIN_TOKEN    admin-grade static token
  DB_CONTAINER            postgres container (default: hycrm-directus-db)
  DB_USER                 default: hycrm
  DB_NAME                 default: hycrm

Owner-gated by /srv/ops-vault/proposals/approvals-schema-proposal.md §N.
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
    "User-Agent": "Mozilla/5.0 slice4-apply/1.0",
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
        raise RuntimeError(f"list collections failed: {code}")
    return any(c["collection"] == name for c in data["data"])


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


def create_relation(spec):
    coll, field = spec["collection"], spec["field"]
    if relation_exists(coll, field):
        print(f"  ✓ relation exists: {coll}.{field} (skip)")
        return
    code, data = req("POST", "/relations", spec)
    if code == 200:
        print(f"  + created relation: {coll}.{field} → {spec['related_collection']}")
    else:
        raise RuntimeError(f"create relation {coll}.{field} failed: {code} {data}")


def psql(sql, *, allow_duplicate=False):
    """Run raw SQL via docker exec. Idempotent for CHECK adds via NOT EXISTS guard."""
    r = subprocess.run(
        ["sudo", "docker", "exec", "-i", DB_CONTAINER,
         "psql", "-U", DB_USER, "-d", DB_NAME, "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True,
    )
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        if allow_duplicate and ("already exists" in out or "duplicate" in out.lower()):
            return out
        raise RuntimeError(f"psql failed: {out}\n--- SQL ---\n{sql}")
    return out


# -------------------------------------------------------------------- ACTION_TYPE
# Codex N2: v1 enum ships with 3 values.
ACTION_TYPE_CHOICES = [
    {"text": "WhatsApp group send", "value": "whatsapp_group_send"},
    {"text": "LMS grant",            "value": "lms_grant"},
    {"text": "Other (escape hatch)", "value": "other"},
]

# Polymorphic context.
CONTEXT_TYPE_CHOICES = [
    {"text": "Lesson",               "value": "lesson"},
    {"text": "Lesson processing run","value": "lesson_processing_run"},
    {"text": "Contact",              "value": "contact"},
    {"text": "Cohort",               "value": "cohort"},
    {"text": "Cohort member",        "value": "cohort_member"},
    {"text": "Task",                 "value": "task"},
    {"text": "Payment",              "value": "payment"},
    {"text": "Financial obligation", "value": "financial_obligation"},
    {"text": "Content output",       "value": "content_output"},
    {"text": "Other",                "value": "other"},
]

POLICY_CHOICES = [
    {"text": "Per run",  "value": "per_run"},
    {"text": "Batched",  "value": "batched"},
    {"text": "Standing", "value": "standing"},
]

STATUS_CHOICES = [
    {"text": "Pending",   "value": "pending"},
    {"text": "Approved",  "value": "approved"},
    {"text": "Rejected",  "value": "rejected"},
    {"text": "Expired",   "value": "expired"},
    {"text": "Revoked",   "value": "revoked"},
    {"text": "Executed",  "value": "executed"},
    {"text": "Failed",    "value": "failed"},
]

PROPOSED_BY_KIND_CHOICES = [
    {"text": "Automation",    "value": "automation"},
    {"text": "User",          "value": "user"},
    {"text": "Claude agent",  "value": "agent_claude"},
    {"text": "Codex agent",   "value": "agent_codex"},
]

RUN_STATUS_CHOICES = [
    {"text": "Running", "value": "running"},
    {"text": "OK",      "value": "ok"},
    {"text": "Failed",  "value": "failed"},
    {"text": "Killed",  "value": "killed"},
]


# =====================================================================
print("STEP 1: approvals collection")
create_collection({
    "collection": "approvals",
    "meta": {
        "icon": "approval",
        "note": "Auditable ledger of external/irreversible actions (slice #4).",
        "display_template": "{{action_type}} ({{status}}) — {{context_type}} {{context_id}}",
        "sort_field": "proposed_at",
        "accountability": "all",
        "collection": "approvals",
    },
    "schema": {"name": "approvals"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"interface": "input", "readonly": True, "hidden": True, "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},

        {"field": "action_type", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": ACTION_TYPE_CHOICES},
                  "note": "v1: 3 values. Adding more = enum metadata edit."},
         "schema": {"is_nullable": False}},

        {"field": "context_type", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": CONTEXT_TYPE_CHOICES},
                  "note": "Polymorphic FK target type (no DB FK; audit-driven)."},
         "schema": {"is_nullable": False}},

        {"field": "context_id", "type": "uuid",
         "meta": {"interface": "input", "required": True,
                  "note": "Polymorphic FK — resolves against the collection named by context_type."},
         "schema": {"is_nullable": False}},

        {"field": "policy", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": POLICY_CHOICES},
                  "note": "v1: CHECK enforces 'per_run' only (Codex N8)."},
         "schema": {"is_nullable": False, "default_value": "per_run"}},

        {"field": "proposed_payload", "type": "json",
         "meta": {"interface": "input-code", "required": True,
                  "options": {"language": "json"},
                  "note": "Shape per action_type in schemas/approvals/*.v1.json. App-validated."},
         "schema": {"is_nullable": False, "default_value": {}}},

        {"field": "proposed_by", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o", "special": ["user-created"], "readonly": True,
                  "note": "Directus user; null if service-token-proposed."},
         "schema": {"is_nullable": True}},

        {"field": "proposed_by_kind", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": PROPOSED_BY_KIND_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "automation"}},

        {"field": "proposed_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "special": ["date-created"]},
         "schema": {"is_nullable": False}},

        {"field": "expires_at", "type": "timestamp",
         "meta": {"interface": "datetime",
                  "note": "Approval deadline. Applies only while status='pending' (Codex N7)."},
         "schema": {"is_nullable": True}},

        {"field": "status", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": STATUS_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "pending"}},

        {"field": "decided_by", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o"},
         "schema": {"is_nullable": True}},

        {"field": "decided_at", "type": "timestamp",
         "meta": {"interface": "datetime"},
         "schema": {"is_nullable": True}},

        {"field": "decision_reason", "type": "text",
         "meta": {"interface": "input-multiline",
                  "note": "Required (length ≥ 3) when status IN (rejected,revoked)."},
         "schema": {"is_nullable": True}},

        {"field": "executed_at", "type": "timestamp",
         "meta": {"interface": "datetime"},
         "schema": {"is_nullable": True}},

        {"field": "execution_run_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o",
                  "note": "FK → automation_runs.id. ON DELETE RESTRICT (Codex N6)."},
         "schema": {"is_nullable": True}},

        {"field": "execution_result", "type": "json",
         "meta": {"interface": "input-code", "options": {"language": "json"}},
         "schema": {"is_nullable": True}},

        {"field": "idempotency_key", "type": "string",
         "meta": {"interface": "input",
                  "note": "Optional unique key; recommended for service-token-proposed rows."},
         "schema": {"is_nullable": True, "is_unique": False}},

        {"field": "created_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "hidden": True, "special": ["date-created"]},
         "schema": {"is_nullable": False}},

        {"field": "updated_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "hidden": True, "special": ["date-updated"]},
         "schema": {"is_nullable": True}},
    ],
})

# =====================================================================
print("STEP 2: automation_runs collection")
create_collection({
    "collection": "automation_runs",
    "meta": {
        "icon": "play_circle",
        "note": "Execution ledger linked to approvals (slice #4).",
        "display_template": "{{automation_name}} — {{status}} @ {{started_at}}",
        "sort_field": "started_at",
        "accountability": "all",
        "collection": "automation_runs",
    },
    "schema": {"name": "automation_runs"},
    "fields": [
        {"field": "id", "type": "uuid",
         "meta": {"interface": "input", "readonly": True, "hidden": True, "special": ["uuid"]},
         "schema": {"is_primary_key": True, "has_auto_increment": False}},

        {"field": "automation_name", "type": "string",
         "meta": {"interface": "input", "required": True,
                  "note": "Stable slug, e.g. whatsapp_lesson_summary_send."},
         "schema": {"is_nullable": False}},

        {"field": "automation_version", "type": "string",
         "meta": {"interface": "input",
                  "note": "Provenance for non-reproducibility audits (Codex round-1 reinstated)."},
         "schema": {"is_nullable": True}},

        {"field": "started_at", "type": "timestamp",
         "meta": {"interface": "datetime", "required": True},
         "schema": {"is_nullable": False}},

        {"field": "finished_at", "type": "timestamp",
         "meta": {"interface": "datetime"},
         "schema": {"is_nullable": True}},

        {"field": "status", "type": "string",
         "meta": {"interface": "select-dropdown", "required": True,
                  "options": {"choices": RUN_STATUS_CHOICES}},
         "schema": {"is_nullable": False, "default_value": "running"}},

        {"field": "approval_id", "type": "uuid",
         "meta": {"interface": "select-dropdown-m2o",
                  "note": "FK → approvals.id. ON DELETE RESTRICT."},
         "schema": {"is_nullable": True}},

        {"field": "error", "type": "text",
         "meta": {"interface": "input-multiline"},
         "schema": {"is_nullable": True}},

        {"field": "created_at", "type": "timestamp",
         "meta": {"interface": "datetime", "readonly": True, "hidden": True, "special": ["date-created"]},
         "schema": {"is_nullable": False}},
    ],
})

# =====================================================================
print("STEP 3: FK relations (RESTRICT both sides — Codex N6)")
# approvals.execution_run_id → automation_runs.id
create_relation({
    "collection": "approvals",
    "field": "execution_run_id",
    "related_collection": "automation_runs",
    "schema": {"on_delete": "RESTRICT"},
})
# automation_runs.approval_id → approvals.id
create_relation({
    "collection": "automation_runs",
    "field": "approval_id",
    "related_collection": "approvals",
    "schema": {"on_delete": "RESTRICT"},
})
# approvals.proposed_by → directus_users
create_relation({
    "collection": "approvals",
    "field": "proposed_by",
    "related_collection": "directus_users",
    "schema": {"on_delete": "SET NULL"},
})
# approvals.decided_by → directus_users
create_relation({
    "collection": "approvals",
    "field": "decided_by",
    "related_collection": "directus_users",
    "schema": {"on_delete": "SET NULL"},
})

# =====================================================================
print("STEP 4: CHECK constraints (idempotent via DO blocks)")
CHECKS = [
    # 1. decided_at iff status IN (approved,rejected,revoked)
    (
        "chk_approval_status_decided",
        """ALTER TABLE approvals ADD CONSTRAINT chk_approval_status_decided
           CHECK (
             (status IN ('approved','rejected','revoked')) =
             (decided_at IS NOT NULL)
           );""",
    ),
    # 2. decision_reason required (length>=3) when rejected/revoked
    (
        "chk_approval_reason_required",
        """ALTER TABLE approvals ADD CONSTRAINT chk_approval_reason_required
           CHECK (
             status NOT IN ('rejected','revoked')
             OR (decision_reason IS NOT NULL AND length(decision_reason) >= 3)
           );""",
    ),
    # 3. Biconditional: status IN (executed,failed) iff
    #    (executed_at + execution_run_id both populated).
    #    Tightened from one-way implication per Codex round-2 — blocks orphan
    #    executed_at / execution_run_id on pending/approved/rejected rows.
    (
        "chk_approval_executed",
        """ALTER TABLE approvals ADD CONSTRAINT chk_approval_executed
           CHECK (
             (status IN ('executed','failed'))
             =
             (executed_at IS NOT NULL AND execution_run_id IS NOT NULL)
           );""",
    ),
    # 4. standing-policy hard cap 7 days
    (
        "chk_approval_standing_cap",
        """ALTER TABLE approvals ADD CONSTRAINT chk_approval_standing_cap
           CHECK (
             policy <> 'standing'
             OR expires_at IS NULL
             OR (expires_at - proposed_at) <= INTERVAL '7 days'
           );""",
    ),
    # 5. v1: policy MUST be 'per_run' (Codex N8). Lift this CHECK when batched/standing ships.
    (
        "chk_approval_policy_v1",
        """ALTER TABLE approvals ADD CONSTRAINT chk_approval_policy_v1
           CHECK (policy = 'per_run');""",
    ),
    # 6. idempotency_key length cap ≤120 (proposal §C1; Codex round-2).
    (
        "chk_approval_idempotency_key_length",
        """ALTER TABLE approvals ADD CONSTRAINT chk_approval_idempotency_key_length
           CHECK (idempotency_key IS NULL OR length(idempotency_key) <= 120);""",
    ),
]

for name, ddl in CHECKS:
    # Scope conname check to approvals table (Codex round-2: conname not globally unique).
    # Belt-and-braces: also swallow duplicate_object if a race slips past the guard.
    guarded = f"""
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '{name}'
      AND conrelid = 'approvals'::regclass
  ) THEN
    {ddl}
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;
"""
    out = psql(guarded)
    print(f"  ✓ CHECK {name}")

# =====================================================================
print("STEP 5: idempotency_key unique partial index")
psql(
    "CREATE UNIQUE INDEX IF NOT EXISTS uniq_approvals_idempotency_key "
    "ON approvals (idempotency_key) WHERE idempotency_key IS NOT NULL;"
)
print("  ✓ uniq_approvals_idempotency_key")

# =====================================================================
print("STEP 6: btree indexes")
INDEX_SQL = [
    # Approvals queue per action_type
    "CREATE INDEX IF NOT EXISTS idx_approvals_queue "
    "ON approvals (status, action_type, expires_at);",
    # Polymorphic context lookup
    "CREATE INDEX IF NOT EXISTS idx_approvals_context "
    "ON approvals (context_type, context_id);",
    # Recent-activity
    "CREATE INDEX IF NOT EXISTS idx_approvals_proposed_at "
    "ON approvals (proposed_at DESC);",
    # automation_runs per-automation history
    "CREATE INDEX IF NOT EXISTS idx_automation_runs_name_started "
    "ON automation_runs (automation_name, started_at DESC);",
    # automation_runs failure surface
    "CREATE INDEX IF NOT EXISTS idx_automation_runs_status_finished "
    "ON automation_runs (status, finished_at DESC);",
    # reverse lookup
    "CREATE INDEX IF NOT EXISTS idx_automation_runs_approval "
    "ON automation_runs (approval_id);",
]
for sql in INDEX_SQL:
    psql(sql)
    print(f"  ✓ {sql.split('idx_')[1].split(' ')[0]}")

# =====================================================================
print("STEP 7: refresh schema cache")
code, body = req("POST", "/utils/cache/clear", {})
print(f"  cache clear: HTTP {code}")
if code >= 400:
    # Codex round-2: log body so failures are debuggable, not silent.
    print(f"  cache clear body: {body}")
    raise RuntimeError(f"cache clear failed: HTTP {code}")

print("\n=== ALL STEPS COMPLETE ===")
print("Next: python validate.py (slice 4c).")
