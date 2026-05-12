# Slice #4 schema — `approvals` + `automation_runs`

Implements the schema proposed in `/srv/ops-vault/proposals/approvals-schema-proposal.md` (§C narrowed by §M, owner-gated by §N).

**Status:** drafted 2026-05-12 (elron-lane, autonomous loop). `apply.py` / `validate.py` / `rollback.sh` follow as separate slices (4b, 4c). This dir starts with the payload shape contracts (slice 4a) because Codex round-1 made them a blocker (N5).

## Contents

```
slice4-schema/
├── README.md                                     ← this file
└── schemas/
    └── approvals/
        ├── whatsapp_group_send.v1.json           ← N5 / Codex round-1
        ├── lms_grant.v1.json                     ← N5 / Codex round-1
        └── other.v1.json                         ← escape hatch
```

To be added in slice 4b (apply + rollback) and slice 4c (validate):

```
├── apply.py        ← idempotent Directus admin-API migration (4b)
├── rollback.sh     ← pg_dump pre-flight + drop tables + cache clear (4b)
└── validate.py     ← exercises CHECK constraints + state machine (4c)
```

## Shape contracts (slice 4a)

Each JSON file describes the **`approvals.proposed_payload`** shape per `action_type`. Validation lives in:

1. **Lane A UI** — before POST `/items/approvals`, validate against the matching contract. Reject early so the user sees the field-level error.
2. **Windmill** — before executing an approved approval, re-validate. Defense in depth; protects against drift between proposal and execution.

**Not** enforced in Postgres. Same reason cohorts/finance proposals avoid Postgres JSON Schema: Directus does not surface column-level JSON Schema, and validation belongs at the system boundary.

### Versioning

The `.v1.json` suffix is binding. To change a contract:

- **Backwards-compatible (additive optional field):** edit `.v1.json` in place.
- **Breaking (new required, type change, removed field):** copy to `.v2.json`. New rows write `_payload_schema_version: "v2"` in their `proposed_payload` and the consumer routes accordingly. Old rows continue to validate against `v1`.

## Owner-gated context

Per `/srv/ops-vault/proposals/approvals-schema-proposal.md §N`, owner approved the recommended defaults for N1–N8 (autonomous loop, 2026-05-12). Migration code does not run until owner executes `python apply.py` against production.

## Environment (target — for 4b)

```
DIRECTUS_URL            https://crm.merkazneshama.co.il
DIRECTUS_ADMIN_TOKEN    admin-grade static token
DB_CONTAINER            hycrm-directus-db
DB_USER                 hycrm
DB_NAME                 hycrm
```

(Same pattern as slice1-schema.)

## Run order (when ready — DO NOT RUN YET)

```bash
# Pre-flight
sudo docker exec hycrm-directus-db pg_dump -U hycrm -d hycrm \
    -t approvals -t automation_runs \
    > /tmp/slice4-pre.dump  # expect empty; safety baseline

python apply.py            # idempotent; safe to re-run
python validate.py         # asserts CHECKs and state machine
# if anything fails:
bash rollback.sh           # interactive (yes/NO prompt)
```
