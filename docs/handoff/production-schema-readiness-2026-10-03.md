# Production Schema Readiness — 2026-10-03

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Branch: `p1/foundation`  
Scope: **READ-ONLY production schema readiness only**  
Production API release under review: `e4aa5c12a3e905ad1dba55ac92a26609bb171259`

## 1. Scope and evidence standard

This check does **not** deploy, change `production.env`, modify Nginx Proxy Manager, restart services, or execute any schema/data write.

The readiness result is based on the strongest production evidence already available:

1. the actual `/health` implementation in production release `e4aa5c12...`;
2. the accepted production `/health -> database=ok` result recorded in the Lane B handoff;
3. prior production execution evidence for `db:upgrade:classroom-revisions` and the resulting `plan_revisions` / `schedule_imports`;
4. production journal evidence from 2026-10-02 showing missing native-auth/product-knowledge schema before their respective gates;
5. later real-device login/phone-login acceptance confirming native-auth was repaired;
6. `docs/handoff/main-control-status-2026-10-03.md`, which still lists the production assessment schema gate as not executed and product-knowledge DB/RAG productionization as future work.

Important limitation: this report is **not a fresh `information_schema` dump**. The current execution environment does not have SSH/database access to the production host. Therefore statuses below are evidence-based production readiness statuses. Where physical presence is not directly queried, the evidence basis is stated explicitly instead of being presented as a live DB query.

## 2. Executive result

| Area | Object | Status | Corresponding upgrade | Blocks current product acceptance? |
| --- | --- | --- | --- | --- |
| Assessment | `assessments` | **MISSING / NOT READY** | `db:upgrade:assessment` | **Yes** — blocks production assessment persistence/run/history acceptance |
| Classroom | `coaching_records` | **MISSING / NOT READY** | `db:upgrade:classroom-guidance` | **Yes, for complete classroom guidance/record acceptance**; does not block plan revision/schedule paths |
| Classroom | `plan_revisions` | **EXISTS** | `db:upgrade:classroom-revisions` | No |
| Classroom | `schedule_imports` | **EXISTS** | `db:upgrade:classroom-revisions` | No |
| Classroom | `student_plans` | **EXISTS** | baseline schema; consumed by classroom runtime | No |
| Classroom | `plan_items` | **EXISTS** | baseline schema; consumed by classroom runtime | No |
| Identity / News | `internal_ids` | **EXISTS** | `db:upgrade:identity-v2` | No |
| Identity / News | `news_posts` | **EXISTS** | `db:upgrade:identity-v2` | No |
| Native auth | `users.phone_number` | **EXISTS** | `db:upgrade:native-auth` | No |
| Native auth | `users.phone_country_code` | **EXISTS** | `db:upgrade:native-auth` | No |
| Product Knowledge | `product_knowledge_documents` | **MISSING** | `db:upgrade:product-knowledge` | **Yes for DB-backed Product Knowledge/RAG**; bundled catalog fallback can still work |
| Product Knowledge | `product_knowledge_chunks` | **MISSING / NOT READY** | `db:upgrade:product-knowledge` | **Yes for DB-backed Product Knowledge/RAG** |

## 3. Assessment

### `assessments`

**Status: MISSING / NOT READY**

Expected key fields from the repository schema/upgrade:

- `id`
- `user_id`
- `status`
- `input_schema_version`
- `output_schema_version`
- `agent_version`
- `provider`
- `model`
- `knowledge_version`
- `input_json`
- `evidence_json`
- `output_json`
- `failure_code`
- `credit_consumed`
- `started_at`
- `completed_at`
- timestamps

Expected indexes/constraints:

- primary key on `id`
- `assessments_user_id_idx`
- `assessments_status_idx`
- FK `user_id -> users.id`

Evidence:

- The production release `/health` table list does **not** include `assessments`, so a healthy `/health` cannot prove this table exists.
- No production execution evidence was found for `db:upgrade:assessment`.
- Main control status dated 2026-10-03 explicitly lists **“Production assessment schema gate has not been executed”** as a hard blocker.

Corresponding upgrade:

`npm run db:upgrade:assessment`

### Product acceptance impact

**BLOCKING** for production Assessment.

The assessment API persists draft/run/result/history state in `assessments`. Real provider evaluation can continue outside production, but production assessment creation/run/history should not be accepted until this gate is completed.

### Future execution risk

Risk level: **low-to-medium**, but still a production write.

The script creates one table and does not rewrite existing assessment data. Main risks:

- FK creation depends on `users` being healthy;
- metadata lock during DDL;
- the script uses a table-existence gate only: if a partially created or schema-drifted `assessments` table already exists, it will skip rather than reconcile missing/wrong columns or indexes.

Before a future approved write, re-run a true read-only `information_schema` shape check, not just `tableExists`.

## 4. Classroom / review

### `student_plans`

**Status: EXISTS**

Key fields required by current runtime:

- `id`
- `student_id`
- `stage_code`
- `type`
- `title`
- timestamps

Evidence:

Production release `e4aa5c12...` includes `student_plans` in its `/health` required-table loop. The accepted production `/health -> database=ok` therefore proves the table was queryable at production acceptance.

### `plan_items`

**Status: EXISTS**

Key fields required by current runtime:

- `id`
- `plan_id`
- `sort_order`
- `name`
- `target`
- `status`
- timestamps

Evidence:

Also included in the production `/health` required-table loop; accepted `database=ok` proves presence/queryability.

### `plan_revisions`

**Status: EXISTS**

Key fields required by current runtime:

- `id`
- `student_id`
- `stage_code`
- `type`
- `title`
- `items_json`
- `editor_user_id`
- `editor_role`
- `status`
- `review_note`
- `reviewed_by_user_id`
- `reviewed_at`
- timestamps

Evidence:

- Historical production handoff records that `db:upgrade:classroom-revisions` was successfully executed.
- The production release `/health` also directly checks `plan_revisions`, and accepted `database=ok` confirms it remained queryable.

Corresponding upgrade:

`npm run db:upgrade:classroom-revisions`

No new execution is currently required.

### `schedule_imports`

**Status: EXISTS**

Key fields required by current runtime:

- `id`
- `user_id`
- `student_id`
- `source_type`
- `file_id`
- `file_name`
- `status`
- `parsed_json`
- `error_code`
- timestamps

Evidence:

Same as `plan_revisions`: the production migration was previously executed, and production `/health` includes `schedule_imports`.

Corresponding upgrade:

`npm run db:upgrade:classroom-revisions`

No new execution is currently required.

### `coaching_records`

**Status: MISSING / NOT READY**

Expected key fields:

- `id`
- `student_id`
- `teacher_id`
- `stage_code`
- `title`
- `content`
- `occurred_at`
- timestamps

Expected indexes/constraints:

- student/stage index
- teacher index
- FK `student_id -> students.id`
- FK `teacher_id -> teachers.id`

Evidence:

- Production `/health` does **not** check `coaching_records`.
- No formal-production execution evidence was found for `db:upgrade:classroom-guidance`.
- The repository has a dedicated idempotent upgrade whose only target is `coaching_records`, indicating this table is a separate production gate from the already-applied classroom-revisions migration.

Corresponding upgrade:

`npm run db:upgrade:classroom-guidance`

### Product acceptance impact

Current state is **partially ready**:

- plan rendering: ready from a schema-presence perspective;
- student edit/revision/review: ready from a schema-presence perspective;
- schedule import persistence: ready from a schema-presence perspective;
- complete teacher guidance/coaching-record path: **blocked** until `coaching_records` is ready.

### Future execution risk

For `db:upgrade:classroom-guidance`:

- FK dependency on `students` and `teachers`;
- metadata lock during CREATE TABLE;
- existence-only gate does not reconcile a malformed pre-existing table.

For `db:upgrade:classroom-revisions`:

- already applied; do **not** rerun merely for reassurance;
- `CREATE TABLE IF NOT EXISTS` will not repair column/index drift if the tables exist with the wrong shape.

## 5. Identity / News / native auth

### `internal_ids`

**Status: EXISTS**

Required key fields include:

- `id`
- `business_id`
- `type`
- `claim_mode`
- `status`
- `user_id`
- `entity_id`
- `batch`
- `claimed_at`
- timestamps

Evidence:

Production release `/health` directly checks `internal_ids`; accepted production `database=ok` proves presence/queryability.

Corresponding upgrade:

`npm run db:upgrade:identity-v2`

### `news_posts`

**Status: EXISTS**

Required key fields include:

- `id`
- `source`
- `source_key`
- `title`
- `summary`
- `cover_url`
- `article_url`
- `published_at`
- `status`
- timestamps

Evidence:

Production release `/health` directly checks `news_posts`; accepted production `database=ok` proves presence/queryability.

Corresponding upgrade:

`npm run db:upgrade:identity-v2`

### Native-auth fields

**Status: EXISTS**

Required fields:

- `users.phone_number`
- `users.phone_country_code`

Expected index:

- `users_phone_number_unique` on `users.phone_number`

Evidence sequence:

1. Production journal on 2026-10-02 directly showed `Unknown column 'phone_number'` during WeChat/native phone bootstrap.
2. The native-auth upgrade was then applied as the production fix.
3. Subsequent real-device WeChat login and phone-number login acceptance passed, as recorded in the production handoff.

Corresponding upgrade:

`npm run db:upgrade:native-auth`

### Product acceptance impact

Identity / news / native-auth schema is **not currently a schema blocker** for the accepted login/profile/phone chain and the baseline news/internal-ID data paths.

Business acceptance still needs to distinguish schema readiness from data readiness; e.g. an existing `internal_ids` table does not prove that all intended business IDs have been seeded.

### Future execution risk

No rerun is currently required.

If ever re-executed:

- `db:upgrade:identity-v2` may ALTER `users` for `status` / `deleted_at`; ALTER operations can take metadata locks;
- `db:upgrade:native-auth` can add a unique index; index creation can fail if duplicate non-null phone numbers exist;
- both scripts check specific columns/indexes, but should still be preceded by a read-only shape/data check on production.

## 6. Product Knowledge

### `product_knowledge_documents`

**Status: MISSING**

This is directly evidenced by production logs from release `e4aa5c12...` on 2026-10-02:

The live `GET /products` query failed with MySQL `ER_NO_SUCH_TABLE` /:

`Table 'cloud1-d3geim00r03edb212.product_knowledge_documents' doesn't exist`

The later bundled-product fallback makes `/products` usable without proving the database table exists.

Expected key fields:

- `id`
- `document_key`
- `title`
- `product_name`
- `source_file`
- `source_date`
- `conversion_version`
- `status`
- `content_json`
- timestamps

### `product_knowledge_chunks`

**Status: MISSING / NOT READY**

Expected key fields:

- `id`
- `document_id`
- `chunk_key`
- `kind`
- `title`
- `text`
- `source_page`
- `retrieval_allowed`
- `assessment_evidence_allowed`
- `display_allowed`
- `metadata_json`
- timestamps

Expected relationship:

- FK `document_id -> product_knowledge_documents.id` with delete cascade

Evidence:

- No successful production execution evidence exists for `db:upgrade:product-knowledge`.
- The required parent table `product_knowledge_documents` is directly confirmed missing.
- Therefore the Product Knowledge table pair is not production-ready; `product_knowledge_chunks` cannot be treated as usable even if a stray physical table were somehow present.

Corresponding upgrade:

`npm run db:upgrade:product-knowledge`

### Product acceptance impact

**BLOCKING** for database-backed Product Knowledge / Product RAG productionization.

It does **not** necessarily block the basic product catalog because the API intentionally supports a bundled fallback.

### Future execution risk

Risk level: **low-to-medium** for schema creation, separate from data import.

Main risks:

- parent/child FK ordering must succeed;
- unique indexes on `document_key` and `chunk_key`;
- existence-only checks do not reconcile malformed partial tables;
- schema creation alone does not populate product knowledge;
- handbook import is a **separate production data write** and needs its own approval/validation;
- do not conflate a successful `/products` fallback response with DB-backed knowledge readiness.

## 7. Upgrade map

| Upgrade | Current readiness conclusion | Execute now? |
| --- | --- | --- |
| `db:upgrade:assessment` | `assessments` not ready | **No — write prohibited this round; future approval required** |
| `db:upgrade:classroom-guidance` | `coaching_records` not ready | **No — write prohibited this round; future approval required** |
| `db:upgrade:classroom-revisions` | `plan_revisions`, `schedule_imports` already present | No |
| `db:upgrade:identity-v2` | `internal_ids`, `news_posts` already present | No |
| `db:upgrade:native-auth` | native phone fields already repaired/accepted | No |
| `db:upgrade:product-knowledge` | Product Knowledge pair not ready | **No — write prohibited this round; future approval required** |

## 8. Readiness conclusion for main control

### Ready at schema-presence level

- `student_plans`
- `plan_items`
- `plan_revisions`
- `schedule_imports`
- `internal_ids`
- `news_posts`
- `users.phone_number`
- `users.phone_country_code`

### Missing / blocking gates

- `assessments` — blocks production Assessment acceptance
- `coaching_records` — blocks complete Classroom guidance/coaching-record acceptance
- `product_knowledge_documents`
- `product_knowledge_chunks` — Product Knowledge DB/RAG remains unready

### Future write order when explicitly approved

This report does **not** authorize writes. If main control later approves feature gates, keep them independent:

1. Assessment gate: read-only shape check -> `db:upgrade:assessment` -> verify table shape -> API acceptance.
2. Classroom guidance gate: read-only shape check -> `db:upgrade:classroom-guidance` -> verify -> classroom guidance acceptance.
3. Product Knowledge gate: read-only shape check -> `db:upgrade:product-knowledge` -> verify schema -> separately approve/import product knowledge -> retrieval acceptance.

Do not batch unrelated production schema writes merely because multiple gates are currently missing.

## 9. Actions performed in this round

- Read production/main-control handoffs.
- Read the production release health contract.
- Mapped table/field requirements to repository upgrade scripts.
- Reviewed retained production logs/evidence.
- **No schema write executed.**
- **No deployment executed.**
- **No `production.env` change.**
- **No NPM/DNS/HTTPS/systemd change.**
