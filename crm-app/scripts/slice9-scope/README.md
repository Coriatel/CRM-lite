# slice9-scope — A7 Phase 3 private vs amuta

Additive migration adding a single `scope` field to the existing `meetings` and
`reminders` collections, per the owner-ratified decision packet
`/srv/ops-vault/projects/merkaz-neshama-os/lane-a/decisions/rabbi-private-vs-amuta-scope.md`.

| field | type | nullable | default | values |
|---|---|---|---|---|
| `scope` | varchar(16) | **NOT NULL** | `'private'` | `private` \| `amuta` |

`private` = Rabbi-only; `amuta` = organizational (may surface on broad ops
surfaces later — Q4 deferred). Default `private` is fail-safe: visibility only
widens by an explicit Rabbi action. NOT NULL guarantees no NULL/unknown scope.

## Run (Authority Gate #5 — explicit owner go only)

```
cd crm-app/scripts/slice9-scope
python3 apply.py        # idempotent; uses sudo docker exec psql (hycrm-directus-db)
python3 validate.py     # read-only assertions; exit 0 = OK
```

Env (optional, hycrm defaults): `DB_CONTAINER=hycrm-directus-db DB_USER=hycrm DB_NAME=hycrm`.

## Rollback

```
python3 rollback.py     # DROP COLUMN scope on both + remove directus_fields rows
```

Additive nullable-free column, no data dependency → safe drop. Collections were
empty (0 rows) at apply time, so the column default backfills nothing.

## Notes

- Mechanism is raw psql + a `directus_fields` registration (select-dropdown),
  mirroring how slice8 uses `sudo docker exec` for its DB-level steps. No admin
  REST token required.
- `CACHE_ENABLED` defaults to false on this Directus, so the items API reflects
  the new column immediately. If a deployment enables the schema cache, clear it:
  `curl -XPOST $DIRECTUS_URL/utils/cache/clear -H "Authorization: Bearer <admin>"`.
- The privacy invariant is unchanged: `notes` is never in any read field list,
  regardless of scope.
