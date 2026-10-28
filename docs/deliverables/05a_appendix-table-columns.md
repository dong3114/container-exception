# 부록 A. 테이블 · 컬럼 전체 명세 (자동 생성)

> 상태: **자동 생성 — 손으로 고치지 않는다.** 원천 = migration M01~M38 이 적용된 PostgreSQL 카탈로그(`pg_attribute` · `pg_constraint` · `pg_indexes` · `pg_trigger` · `cera_app` 권한), 2026-10-28.
> 설명 · 업무 의미 · 관계는 [05 데이터 모델 및 테이블 설계서](05_data-model-and-tables.md)에 있다. 스키마 정본은 `back/src/db/schema/*.ts` + `back/drizzle/migrations/*.sql`.

합계: 테이블 53 · 컬럼 654 · FK 116 · CHECK 297 · UNIQUE 39 · 별도 인덱스 73 · trigger 139

| 테이블 | 컬럼 | FK | CHECK | trigger | 변경 정책 | 앱 역할(`cera_app`) 권한 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| [`actor`](#actor) | 4 | 0 | 1 | 2 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`agent_checkpoint`](#agent_checkpoint) | 10 | 1 | 4 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`agent_checkpoint_write`](#agent_checkpoint_write) | 11 | 1 | 3 | 4 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`agent_run`](#agent_run) | 21 | 3 | 9 | 4 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`agent_step`](#agent_step) | 13 | 2 | 8 | 1 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`agent_tool_call`](#agent_tool_call) | 17 | 1 | 10 | 4 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`audit_log`](#audit_log) | 11 | 1 | 3 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`bl`](#bl) | 9 | 3 | 4 | 2 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`canonical_fact`](#canonical_fact) | 35 | 2 | 21 | 1 | 갱신 · 삭제 가능 | DELETE,INSERT,SELECT,UPDATE |
| [`comm_message`](#comm_message) | 19 | 4 | 14 | 4 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`comm_message_question`](#comm_message_question) | 2 | 2 | 0 | 3 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`comm_message_structured_field`](#comm_message_structured_field) | 8 | 3 | 4 | 4 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`comm_thread`](#comm_thread) | 12 | 4 | 6 | 4 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`conflict`](#conflict) | 15 | 1 | 8 | 0 | 갱신 · 삭제 가능 | DELETE,INSERT,SELECT,UPDATE |
| [`contact_channel_address`](#contact_channel_address) | 10 | 2 | 7 | 2 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`contact_selection`](#contact_selection) | 11 | 4 | 3 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`container`](#container) | 8 | 2 | 2 | 2 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`container_bl`](#container_bl) | 3 | 2 | 1 | 1 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`counterparty`](#counterparty) | 5 | 0 | 1 | 1 | 갱신 가능 · 삭제 불가 | INSERT,SELECT,UPDATE |
| [`counterparty_contact`](#counterparty_contact) | 6 | 1 | 0 | 2 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`event`](#event) | 39 | 6 | 26 | 6 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`event_entity_link`](#event_entity_link) | 4 | 1 | 2 | 4 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`event_verification_target`](#event_verification_target) | 3 | 2 | 1 | 3 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`external_identifier`](#external_identifier) | 9 | 2 | 3 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`extraction`](#extraction) | 20 | 4 | 10 | 5 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`extraction_retry_request`](#extraction_retry_request) | 9 | 2 | 3 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`facility`](#facility) | 8 | 1 | 1 | 1 | 갱신 가능 · 삭제 불가 | INSERT,SELECT,UPDATE |
| [`facility_planning_profile`](#facility_planning_profile) | 13 | 3 | 5 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`message_approval`](#message_approval) | 13 | 5 | 10 | 5 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`message_approval_structured_field`](#message_approval_structured_field) | 8 | 3 | 3 | 4 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`message_status_transition`](#message_status_transition) | 8 | 3 | 1 | 4 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`operational_exception`](#operational_exception) | 16 | 3 | 8 | 5 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`operational_exception_observation`](#operational_exception_observation) | 12 | 2 | 4 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`plan_follow_up`](#plan_follow_up) | 8 | 4 | 1 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`planning_container_record`](#planning_container_record) | 20 | 5 | 6 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`planning_input_batch`](#planning_input_batch) | 12 | 2 | 5 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`planning_snapshot`](#planning_snapshot) | 10 | 1 | 3 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`public_data_fetch`](#public_data_fetch) | 18 | 2 | 9 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`question_item`](#question_item) | 15 | 1 | 9 | 3 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`raw_input`](#raw_input) | 12 | 1 | 5 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`recovery_plan`](#recovery_plan) | 31 | 7 | 17 | 4 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`recovery_plan_item`](#recovery_plan_item) | 12 | 1 | 3 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`recovery_run`](#recovery_run) | 12 | 2 | 7 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`scenario`](#scenario) | 7 | 0 | 0 | 1 | 갱신 가능 · 삭제 불가 | INSERT,SELECT,UPDATE |
| [`send_attempt`](#send_attempt) | 14 | 2 | 10 | 5 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`system_error`](#system_error) | 20 | 1 | 7 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`tariff_rate`](#tariff_rate) | 17 | 2 | 7 | 2 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`truck_pool`](#truck_pool) | 5 | 1 | 1 | 1 | 갱신 가능 · 삭제 불가 | INSERT,SELECT,UPDATE |
| [`user_account`](#user_account) | 8 | 1 | 4 | 4 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`user_session`](#user_session) | 6 | 1 | 3 | 4 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |
| [`verification_request`](#verification_request) | 16 | 2 | 8 | 0 | 갱신 · 삭제 가능 | DELETE,INSERT,SELECT,UPDATE |
| [`verification_request_handling`](#verification_request_handling) | 9 | 3 | 2 | 3 | append-only (UPDATE · DELETE 거부) | INSERT,SELECT |
| [`vessel_call`](#vessel_call) | 10 | 1 | 4 | 2 | 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) | INSERT,SELECT,UPDATE |

## actor

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `actor_id` | uuid | N |  | PK |
| 2 | `actor_type` | text | N |  |  |
| 3 | `display_name` | character varying(60) | N |  |  |
| 4 | `is_active` | boolean | N | `true` |  |

**CHECK**

- `ck_actor__actor_type`: `CHECK ((actor_type = ANY (ARRAY['HUMAN'::text, 'SYSTEM'::text, 'AI_AGENT'::text])))`

**TRIGGER**

- `tg_actor__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_actor__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## agent_checkpoint

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `checkpoint_row_id` | uuid | N |  | PK |
| 2 | `agent_run_id` | uuid | N |  | FK→`agent_run` |
| 3 | `checkpoint_ns` | character varying(200) | N | `''::character varying` |  |
| 4 | `checkpoint_id` | character varying(64) | N |  |  |
| 5 | `parent_checkpoint_id` | character varying(64) | Y |  |  |
| 6 | `content_ref` | character varying(300) | N |  |  |
| 7 | `content_hash` | character varying(71) | N |  |  |
| 8 | `meta_source` | character varying(20) | Y |  |  |
| 9 | `meta_step` | integer | Y |  |  |
| 10 | `created_at` | timestamp(3) with time zone | N |  |  |

**UNIQUE**

- `uq_agent_checkpoint__run_ns_checkpoint_id`: `UNIQUE (agent_run_id, checkpoint_ns, checkpoint_id)`

**FK**

- `fk_agent_checkpoint__agent_run_id`: `FOREIGN KEY (agent_run_id) REFERENCES cera.agent_run(agent_run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_agent_checkpoint__checkpoint_id`: `CHECK (((checkpoint_id)::text ~ '^[A-Za-z0-9._:-]{1,64}$'::text))`
- `ck_agent_checkpoint__content_hash`: `CHECK (((content_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_agent_checkpoint__content_ref`: `CHECK (((content_ref)::text ~ '^cref:v1:AGENT_CHECKPOINT:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text))`
- `ck_agent_checkpoint__parent_checkpoint_id`: `CHECK (((parent_checkpoint_id)::text ~ '^[A-Za-z0-9._:-]{1,64}$'::text))`

**TRIGGER**

- `tg_agent_checkpoint__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_agent_checkpoint__guard_insert` — BEFORE INSERT → `fn_cera_guard_agent_runtime_insert`

## agent_checkpoint_write

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `agent_run_id` | uuid | N |  | PK FK→`agent_run` |
| 2 | `checkpoint_ns` | character varying(200) | N | `''::character varying` | PK |
| 3 | `checkpoint_id` | character varying(64) | N |  | PK |
| 4 | `task_id` | character varying(64) | N |  | PK |
| 5 | `write_idx` | integer | N |  | PK |
| 6 | `task_path` | character varying(300) | N | `''::character varying` |  |
| 7 | `channel` | character varying(200) | N |  |  |
| 8 | `value_type` | character varying(40) | N |  |  |
| 9 | `value_b64` | text | N |  |  |
| 10 | `value_hash` | character varying(71) | N |  |  |
| 11 | `created_at` | timestamp(3) with time zone | N |  |  |

**FK**

- `fk_agent_checkpoint_write__agent_run_id`: `FOREIGN KEY (agent_run_id) REFERENCES cera.agent_run(agent_run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_agent_checkpoint_write__value_b64`: `CHECK ((value_b64 ~ '^[A-Za-z0-9+/]*={0,2}$'::text))`
- `ck_agent_checkpoint_write__value_hash`: `CHECK (((value_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_agent_checkpoint_write__value_size`: `CHECK ((length(value_b64) <= 262144))`

**INDEX**

- `ix_agent_checkpoint_write__checkpoint`: `btree (agent_run_id, checkpoint_ns, checkpoint_id)`

**TRIGGER**

- `tg_agent_checkpoint_write__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_agent_checkpoint_write__guard_insert` — BEFORE INSERT → `fn_cera_guard_agent_runtime_insert`
- `tg_agent_checkpoint_write__guard_update` — BEFORE UPDATE → `fn_cera_guard_checkpoint_write_update`
- `tg_agent_checkpoint_write__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`

## agent_run

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `agent_run_id` | uuid | N |  | PK |
| 2 | `recovery_run_id` | uuid | N |  | FK→`recovery_run` |
| 3 | `goal` | character varying(300) | N |  |  |
| 4 | `status` | text | N |  |  |
| 5 | `created_by_actor_id` | uuid | N |  | FK→`actor` |
| 6 | `agent_actor_id` | uuid | N |  | FK→`actor` |
| 7 | `runtime_version` | character varying(40) | Y |  |  |
| 8 | `trace_id` | character varying(64) | Y |  |  |
| 9 | `started_at` | timestamp(3) with time zone | N |  |  |
| 10 | `finished_at` | timestamp(3) with time zone | Y |  |  |
| 11 | `is_simulated` | boolean | N |  |  |
| 12 | `parameters` | jsonb | Y |  |  |
| 13 | `current_node` | character varying(60) | Y |  |  |
| 14 | `waiting_reason` | character varying(60) | Y |  |  |
| 15 | `pending_ref_type` | character varying(40) | Y |  |  |
| 16 | `pending_ref_id` | uuid | Y |  |  |
| 17 | `last_error_code` | character varying(60) | Y |  |  |
| 18 | `updated_at` | timestamp(3) with time zone | Y |  |  |
| 19 | `runtime_attempts` | integer | N | `0` |  |
| 20 | `next_attempt_at` | timestamp(3) with time zone | Y |  |  |
| 21 | `result_summary` | jsonb | Y |  |  |

**FK**

- `fk_agent_run__agent_actor_id`: `FOREIGN KEY (agent_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_agent_run__created_by_actor_id`: `FOREIGN KEY (created_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_agent_run__recovery_run_id`: `FOREIGN KEY (recovery_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_agent_run__finished_after_started`: `CHECK (((finished_at IS NULL) OR (finished_at >= started_at)))`
- `ck_agent_run__finished_shape`: `CHECK (((status = ANY (ARRAY['COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text])) = (finished_at IS NOT NULL)))`
- `ck_agent_run__parameters_object`: `CHECK ((jsonb_typeof(parameters) = 'object'::text))`
- `ck_agent_run__pending_ref_pair`: `CHECK (((pending_ref_type IS NULL) = (pending_ref_id IS NULL)))`
- `ck_agent_run__result_summary_object`: `CHECK ((jsonb_typeof(result_summary) = 'object'::text))`
- `ck_agent_run__retry_shape`: `CHECK (((status = 'WAITING_RUNTIME'::text) = (next_attempt_at IS NOT NULL)))`
- `ck_agent_run__runtime_attempts`: `CHECK ((runtime_attempts >= 0))`
- `ck_agent_run__status`: `CHECK ((status = ANY (ARRAY['CREATED'::text, 'RUNNING'::text, 'WAITING_HUMAN'::text, 'WAITING_EXTERNAL'::text, 'WAITING_RUNTIME'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text])))`
- `ck_agent_run__waiting_shape`: `CHECK (((status = ANY (ARRAY['WAITING_HUMAN'::text, 'WAITING_EXTERNAL'::text, 'WAITING_RUNTIME'::text])) = (waiting_reason IS NOT NULL)))`

**INDEX**

- `ix_agent_run__pending_ref`: `btree (pending_ref_type, pending_ref_id) WHERE (pending_ref_id IS NOT NULL)`
- `ix_agent_run__recovery_run_id`: `btree (recovery_run_id)`

**TRIGGER**

- `tg_agent_run__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_agent_run__guard_insert` — BEFORE INSERT → `fn_cera_guard_agent_run`
- `tg_agent_run__guard_transition` — BEFORE UPDATE → `fn_cera_guard_agent_run`
- `tg_agent_run__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`

## agent_step

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `step_id` | uuid | N |  | PK |
| 2 | `agent_run_id` | uuid | N |  | FK→`agent_run` |
| 3 | `seq` | integer | N |  |  |
| 4 | `kind` | text | N |  |  |
| 5 | `node` | character varying(60) | Y |  |  |
| 6 | `outcome` | character varying(60) | N |  |  |
| 7 | `detail_code` | character varying(60) | Y |  |  |
| 8 | `tool_call_id` | uuid | Y |  | FK→`agent_tool_call` |
| 9 | `retry_count` | integer | N | `0` |  |
| 10 | `started_at` | timestamp(3) with time zone | N |  |  |
| 11 | `finished_at` | timestamp(3) with time zone | N |  |  |
| 12 | `duration_ms` | integer | N |  |  |
| 13 | `trace_id` | character varying(64) | Y |  |  |

**UNIQUE**

- `uq_agent_step__agent_run_id__seq`: `UNIQUE (agent_run_id, seq)`

**FK**

- `fk_agent_step__agent_run_id`: `FOREIGN KEY (agent_run_id) REFERENCES cera.agent_run(agent_run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_agent_step__tool_call_id`: `FOREIGN KEY (tool_call_id) REFERENCES cera.agent_tool_call(tool_call_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_agent_step__detail_code`: `CHECK (((detail_code)::text ~ '^[A-Z][A-Z0-9_]{0,59}$'::text))`
- `ck_agent_step__duration`: `CHECK (((duration_ms >= 0) AND (finished_at >= started_at)))`
- `ck_agent_step__kind`: `CHECK ((kind = ANY (ARRAY['START'::text, 'NODE'::text, 'INTERRUPT'::text, 'RESUME'::text, 'TERMINAL'::text])))`
- `ck_agent_step__node`: `CHECK (((node)::text ~ '^[a-z][a-z0-9_]{0,59}$'::text))`
- `ck_agent_step__node_shape`: `CHECK (((kind = 'NODE'::text) = (node IS NOT NULL)))`
- `ck_agent_step__outcome`: `CHECK (((outcome)::text ~ '^[A-Z][A-Z0-9_]{0,59}$'::text))`
- `ck_agent_step__retry_count`: `CHECK ((retry_count >= 0))`
- `ck_agent_step__seq`: `CHECK ((seq >= 1))`

**TRIGGER**

- `tg_agent_step__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`

## agent_tool_call

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `tool_call_id` | uuid | N |  | PK |
| 2 | `agent_run_id` | uuid | N |  | FK→`agent_run` |
| 3 | `tool_name` | character varying(60) | N |  |  |
| 4 | `tool_version` | character varying(10) | N |  |  |
| 5 | `category` | text | N |  |  |
| 6 | `status` | text | N |  |  |
| 7 | `idempotency_key` | character varying(100) | Y |  |  |
| 8 | `input_hash` | character varying(71) | N |  |  |
| 9 | `output_hash` | character varying(71) | Y |  |  |
| 10 | `result_ref_type` | character varying(40) | Y |  |  |
| 11 | `result_ref_id` | uuid | Y |  |  |
| 12 | `error_code` | character varying(60) | Y |  |  |
| 13 | `started_at` | timestamp(3) with time zone | N |  |  |
| 14 | `finished_at` | timestamp(3) with time zone | Y |  |  |
| 15 | `duration_ms` | integer | Y |  |  |
| 16 | `request_id` | character varying(64) | Y |  |  |
| 17 | `trace_id` | character varying(64) | Y |  |  |

**FK**

- `fk_agent_tool_call__agent_run_id`: `FOREIGN KEY (agent_run_id) REFERENCES cera.agent_run(agent_run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_agent_tool_call__category`: `CHECK ((category = ANY (ARRAY['READ'::text, 'EXTERNAL_READ'::text, 'COMPUTE'::text, 'PROPOSE'::text, 'REQUEST'::text])))`
- `ck_agent_tool_call__duration`: `CHECK (((duration_ms IS NULL) OR (duration_ms >= 0)))`
- `ck_agent_tool_call__error_shape`: `CHECK (((status = ANY (ARRAY['FAILED'::text, 'REJECTED'::text])) = (error_code IS NOT NULL)))`
- `ck_agent_tool_call__finished_shape`: `CHECK (((status = 'STARTED'::text) = ((finished_at IS NULL) AND (duration_ms IS NULL))))`
- `ck_agent_tool_call__idempotency_key`: `CHECK (((idempotency_key)::text ~ '^[A-Za-z0-9._:-]{1,100}$'::text))`
- `ck_agent_tool_call__input_hash`: `CHECK (((input_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_agent_tool_call__output_hash`: `CHECK (((output_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_agent_tool_call__result_ref_pair`: `CHECK (((result_ref_type IS NULL) = (result_ref_id IS NULL)))`
- `ck_agent_tool_call__status`: `CHECK ((status = ANY (ARRAY['STARTED'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'REJECTED'::text])))`
- `ck_agent_tool_call__tool_name`: `CHECK (((tool_name)::text ~ '^[a-z][a-z0-9_]{1,59}$'::text))`

**INDEX**

- `ix_agent_tool_call__agent_run_id__started_at`: `btree (agent_run_id, started_at)`
- `uq_agent_tool_call__run_tool_idempotency_key`: `btree (agent_run_id, tool_name, idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND (status = ANY (ARRAY['STARTED'::text, 'SUCCEEDED'::text])))` (UNIQUE)

**TRIGGER**

- `tg_agent_tool_call__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_agent_tool_call__guard_insert` — BEFORE INSERT → `fn_cera_guard_agent_tool_call`
- `tg_agent_tool_call__guard_transition` — BEFORE UPDATE → `fn_cera_guard_agent_tool_call`
- `tg_agent_tool_call__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`

## audit_log

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `audit_id` | uuid | N |  | PK |
| 2 | `occurred_at` | timestamp(3) with time zone | N |  |  |
| 3 | `actor_id` | uuid | N |  | FK→`actor` |
| 4 | `action` | text | N |  |  |
| 5 | `target_type` | text | N |  |  |
| 6 | `target_id` | character varying(40) | N |  |  |
| 7 | `before_ref` | character varying(300) | Y |  |  |
| 8 | `after_ref` | character varying(300) | Y |  |  |
| 9 | `request_context` | character varying(300) | Y |  |  |
| 10 | `result` | text | N |  |  |
| 11 | `is_simulated` | boolean | N |  |  |

**FK**

- `fk_audit_log__actor_id`: `FOREIGN KEY (actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_audit_log__action`: `CHECK ((action ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_audit_log__result`: `CHECK ((result = ANY (ARRAY['SUCCESS'::text, 'FAILURE'::text])))`
- `ck_audit_log__target_type`: `CHECK ((target_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`

**INDEX**

- `ix_audit_log__content_purged`: `btree (target_type, target_id) WHERE ((action = 'CONTENT_PURGED'::text) AND (result = 'SUCCESS'::text))`
- `ix_audit_log__occurred_at`: `btree (occurred_at)`
- `ix_audit_log__target_type__target_id__occurred_at`: `btree (target_type, target_id, occurred_at)`

**TRIGGER**

- `tg_audit_log__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_audit_log__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## bl

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `bl_id` | uuid | N |  | PK |
| 2 | `bl_no` | character varying(40) | N |  |  |
| 3 | `bl_type` | text | N |  |  |
| 4 | `parent_bl_id` | uuid | Y |  | FK→`bl` |
| 5 | `bl_year` | integer | Y |  |  |
| 6 | `carrier_counterparty_id` | uuid | Y |  | FK→`counterparty` |
| 7 | `first_raw_input_id` | uuid | N |  | FK→`raw_input` |
| 8 | `is_simulated` | boolean | N |  | FK→`raw_input` |
| 9 | `registered_at` | timestamp(3) with time zone | N |  |  |

**UNIQUE**

- `uq_bl__bl_type__bl_no__bl_year`: `UNIQUE NULLS NOT DISTINCT (bl_type, bl_no, bl_year)`

**FK**

- `fk_bl__carrier_counterparty_id`: `FOREIGN KEY (carrier_counterparty_id) REFERENCES cera.counterparty(counterparty_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_bl__first_raw_input_id__is_simulated`: `FOREIGN KEY (first_raw_input_id, is_simulated) REFERENCES cera.raw_input(raw_input_id, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_bl__parent_bl_id`: `FOREIGN KEY (parent_bl_id) REFERENCES cera.bl(bl_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_bl__bl_no`: `CHECK (((bl_no)::text ~ '^[A-Z0-9-]{1,40}$'::text))`
- `ck_bl__bl_type`: `CHECK ((bl_type = ANY (ARRAY['MASTER'::text, 'HOUSE'::text, 'UNKNOWN'::text])))`
- `ck_bl__parent_not_self`: `CHECK ((parent_bl_id <> bl_id))`
- `ck_bl__parent_only_for_house`: `CHECK (((bl_type = 'HOUSE'::text) OR (parent_bl_id IS NULL)))`

**TRIGGER**

- `tg_bl__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_bl__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`

## canonical_fact

- 변경 정책: 갱신 · 삭제 가능 · 앱 역할 권한: DELETE,INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `entity_type` | text | N |  | PK |
| 2 | `entity_id` | uuid | N |  | PK |
| 3 | `fact_key` | character varying(120) | N |  | PK |
| 4 | `applicability_scope_type` | text | N | `'GLOBAL'::text` | PK |
| 5 | `applicability_scope_ref` | character varying(60) | N | `''::character varying` | PK |
| 6 | `fact_name` | character varying(60) | N |  |  |
| 7 | `param_date` | date | Y |  |  |
| 8 | `param_slot_start` | timestamp(3) with time zone | Y |  |  |
| 9 | `param_size_type` | text | Y |  |  |
| 10 | `value_text` | text | Y |  |  |
| 11 | `value_number` | numeric(18,4) | Y |  |  |
| 12 | `value_timestamp` | timestamp(3) with time zone | Y |  |  |
| 13 | `value_code` | text | Y |  |  |
| 14 | `value_unit` | text | Y |  |  |
| 15 | `valid_from` | timestamp(3) with time zone | Y |  |  |
| 16 | `valid_until` | timestamp(3) with time zone | Y |  |  |
| 17 | `winning_event_id` | uuid | N |  | FK→`event` |
| 18 | `applied_rule` | text | N |  |  |
| 19 | `rule_version` | character varying(20) | N |  |  |
| 20 | `value_status` | text | N |  |  |
| 21 | `verification_basis` | text | Y |  |  |
| 22 | `evidence_strength` | text | N |  |  |
| 23 | `evidence_policy_version` | character varying(20) | N |  |  |
| 24 | `evidence_time` | timestamp(3) with time zone | Y |  |  |
| 25 | `evidence_time_quality` | text | N |  |  |
| 26 | `temporal_confidence` | text | N |  |  |
| 27 | `freshness_status` | text | N |  |  |
| 28 | `conflict_status` | text | N |  |  |
| 29 | `hold_status` | text | N |  |  |
| 30 | `decision_usability` | text | N |  |  |
| 31 | `contributing_event_count` | integer | N |  |  |
| 32 | `is_simulated` | boolean | N |  | PK |
| 33 | `scenario_id` | uuid | Y |  | FK→`scenario` |
| 34 | `computed_as_of` | timestamp(3) with time zone | N |  |  |
| 35 | `computed_at` | timestamp(3) with time zone | N |  |  |

**FK**

- `fk_canonical_fact__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_canonical_fact__winning_event_id`: `FOREIGN KEY (winning_event_id) REFERENCES cera.event(event_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_canonical_fact__applicability_scope_type`: `CHECK ((applicability_scope_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_canonical_fact__applied_rule`: `CHECK ((applied_rule ~ '^R[0-9]{1,2}(-[a-z])?$'::text))`
- `ck_canonical_fact__confirmed_basis`: `CHECK (((value_status = 'CONFIRMED'::text) = (verification_basis IS NOT NULL)))`
- `ck_canonical_fact__conflict_status`: `CHECK ((conflict_status = ANY (ARRAY['NONE'::text, 'DISSENT'::text, 'OPEN'::text])))`
- `ck_canonical_fact__contributing_event_count`: `CHECK ((contributing_event_count >= 1))`
- `ck_canonical_fact__decision_usability`: `CHECK ((decision_usability = ANY (ARRAY['USABLE'::text, 'USABLE_WITH_WARNING'::text, 'APPROVAL_BLOCKED'::text, 'UNUSABLE'::text])))`
- `ck_canonical_fact__entity_type`: `CHECK ((entity_type = ANY (ARRAY['CONTAINER'::text, 'BL'::text, 'FACILITY'::text, 'COUNTERPARTY'::text, 'TRUCK_POOL'::text, 'VESSEL_CALL'::text])))`
- `ck_canonical_fact__evidence_strength`: `CHECK ((evidence_strength = ANY (ARRAY['0'::text, '1'::text, '2'::text, '3'::text])))`
- `ck_canonical_fact__evidence_time_quality`: `CHECK ((evidence_time_quality = ANY (ARRAY['EVENT_TIME'::text, 'RECORDED_TIME'::text, 'RECEIVED_ONLY'::text])))`
- `ck_canonical_fact__freshness_status`: `CHECK ((freshness_status = ANY (ARRAY['FRESH'::text, 'AGING'::text, 'STALE'::text, 'EXPIRED'::text, 'UNKNOWN'::text, 'N_A'::text])))`
- `ck_canonical_fact__hold_status`: `CHECK ((hold_status = ANY (ARRAY['NONE'::text, 'HELD'::text])))`
- `ck_canonical_fact__krw_integer`: `CHECK (((value_unit <> 'KRW'::text) OR (value_number = trunc(value_number))))`
- `ck_canonical_fact__param_size_type`: `CHECK ((param_size_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_canonical_fact__s2_simulated_scenario`: `CHECK ((is_simulated = (scenario_id IS NOT NULL)))`
- `ck_canonical_fact__scope_global_empty`: `CHECK (((applicability_scope_type = 'GLOBAL'::text) = ((applicability_scope_ref)::text = ''::text)))`
- `ck_canonical_fact__temporal_confidence`: `CHECK ((temporal_confidence = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))`
- `ck_canonical_fact__valid_range`: `CHECK (((valid_from IS NULL) OR (valid_until IS NULL) OR (valid_from < valid_until)))`
- `ck_canonical_fact__value_code`: `CHECK ((value_code ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_canonical_fact__value_status`: `CHECK ((value_status = ANY (ARRAY['CONFIRMED'::text, 'OBSERVED'::text, 'PROVISIONAL'::text, 'INFERRED'::text, 'UNKNOWN'::text])))`
- `ck_canonical_fact__value_unit`: `CHECK ((value_unit ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_canonical_fact__verification_basis`: `CHECK ((verification_basis = ANY (ARRAY['HUMAN_VERIFICATION'::text, 'AUTHORITATIVE_SYSTEM'::text, 'POLICY_EVIDENCE'::text])))`

**INDEX**

- `ix_canonical_fact__fact_name__param_date`: `btree (fact_name, param_date)`
- `ix_canonical_fact__not_usable`: `btree (decision_usability) WHERE (decision_usability <> 'USABLE'::text)`
- `ix_canonical_fact__winning_event_id`: `btree (winning_event_id)`

**TRIGGER**

- `tg_canonical_fact__guard_confirmed` — BEFORE INSERT/UPDATE → `fn_cera_guard_canonical_confirmed`

## comm_message

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `message_id` | uuid | N |  | PK FK→`message_approval` |
| 2 | `thread_id` | uuid | N |  | FK→`comm_thread` |
| 3 | `direction` | text | N |  |  |
| 4 | `message_kind` | text | N |  |  |
| 5 | `contact_verification_id` | uuid | Y |  |  |
| 6 | `channel_type` | text | N |  | FK→`comm_thread`,`contact_channel_address` |
| 7 | `external_message_id` | character varying(200) | Y |  |  |
| 8 | `from_address` | character varying(200) | Y |  |  |
| 9 | `to_address_id` | uuid | Y |  | FK→`contact_channel_address` |
| 10 | `message_content_ref` | character varying(300) | Y |  |  |
| 11 | `content_hash` | character varying(71) | N |  |  |
| 12 | `current_status` | text | Y |  |  |
| 13 | `current_approval_id` | uuid | Y |  | FK→`message_approval` |
| 14 | `drafted_by` | text | Y |  |  |
| 15 | `created_at` | timestamp(3) with time zone | N |  |  |
| 16 | `sent_at` | timestamp(3) with time zone | Y |  |  |
| 17 | `received_at` | timestamp(3) with time zone | Y |  |  |
| 18 | `is_simulated` | boolean | N |  | FK→`comm_thread` |
| 19 | `scenario_id` | uuid | Y |  | FK→`scenario` |

**UNIQUE**

- `uq_comm_message__channel_type__external_message_id`: `UNIQUE (channel_type, external_message_id)`
- `uq_comm_message__message_id__is_simulated`: `UNIQUE (message_id, is_simulated)`
- `uq_comm_message__message_id__to_address_id`: `UNIQUE (message_id, to_address_id)`

**FK**

- `fk_comm_message__current_approval_id__message_id`: `FOREIGN KEY (current_approval_id, message_id) REFERENCES cera.message_approval(approval_id, message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_comm_message__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_comm_message__thread_id__channel_type__is_simulated`: `FOREIGN KEY (thread_id, channel_type, is_simulated) REFERENCES cera.comm_thread(thread_id, channel_type, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_comm_message__to_address_id__channel_type`: `FOREIGN KEY (to_address_id, channel_type) REFERENCES cera.contact_channel_address(address_id, channel_type) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_comm_message__channel_type`: `CHECK ((channel_type = ANY (ARRAY['GMAIL'::text, 'MOCK'::text, 'PORTAL'::text])))`
- `ck_comm_message__content_hash`: `CHECK (((content_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_comm_message__current_status`: `CHECK ((current_status = ANY (ARRAY['DRAFTED'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text, 'QUEUED'::text, 'SENT'::text, 'DELIVERY_FAILED'::text, 'REPLIED'::text, 'CLOSED'::text])))`
- `ck_comm_message__cv_requires_verification`: `CHECK (((message_kind <> 'CONTACT_VERIFICATION'::text) OR (contact_verification_id IS NOT NULL)))`
- `ck_comm_message__direction`: `CHECK ((direction = ANY (ARRAY['OUTBOUND'::text, 'INBOUND'::text])))`
- `ck_comm_message__drafted_by`: `CHECK ((drafted_by = ANY (ARRAY['AI_DRAFT'::text, 'HUMAN'::text, 'TEMPLATE'::text])))`
- `ck_comm_message__inbound_received_at`: `CHECK (((direction <> 'INBOUND'::text) OR (received_at IS NOT NULL)))`
- `ck_comm_message__message_content_ref`: `CHECK (((message_content_ref)::text ~ '^cref:v1:COMM_MESSAGE_CONTENT:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text))`
- `ck_comm_message__message_kind`: `CHECK ((message_kind = ANY (ARRAY['BUSINESS'::text, 'CONTACT_VERIFICATION'::text])))`
- `ck_comm_message__outbound_current_status`: `CHECK (((direction = 'OUTBOUND'::text) = (current_status IS NOT NULL)))`
- `ck_comm_message__outbound_drafted_by`: `CHECK (((direction = 'OUTBOUND'::text) = (drafted_by IS NOT NULL)))`
- `ck_comm_message__outbound_recipient_content`: `CHECK (((direction <> 'OUTBOUND'::text) OR ((to_address_id IS NOT NULL) AND (message_content_ref IS NOT NULL))))`
- `ck_comm_message__p0_no_contact_verification`: `CHECK ((contact_verification_id IS NULL))`
- `ck_comm_message__s2_simulated_scenario`: `CHECK ((is_simulated = (scenario_id IS NOT NULL)))`

**INDEX**

- `ix_comm_message__queued`: `btree (created_at) WHERE (current_status = 'QUEUED'::text)`
- `ix_comm_message__thread_id__created_at`: `btree (thread_id, created_at)`
- `ix_comm_message__to_address_id`: `btree (to_address_id)`

**TRIGGER**

- `tg_comm_message__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_comm_message__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`
- `tg_comm_message__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`
- `tg_comm_message__sent_at_once` — BEFORE UPDATE → `fn_cera_guard_one_time_fill`

## comm_message_question

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `message_id` | uuid | N |  | PK FK→`comm_message` |
| 2 | `question_item_id` | uuid | N |  | PK FK→`question_item` |

**FK**

- `fk_comm_message_question__message_id`: `FOREIGN KEY (message_id) REFERENCES cera.comm_message(message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_comm_message_question__question_item_id`: `FOREIGN KEY (question_item_id) REFERENCES cera.question_item(question_item_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**INDEX**

- `ix_comm_message_question__question_item_id`: `btree (question_item_id)`

**TRIGGER**

- `tg_comm_message_question__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_comm_message_question__guard_insert` — BEFORE INSERT → `fn_cera_guard_message_children_insert`
- `tg_comm_message_question__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## comm_message_structured_field

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `message_id` | uuid | N |  | PK FK→`comm_message` |
| 2 | `field_key` | character varying(60) | N |  | PK |
| 3 | `value_text` | text | Y |  |  |
| 4 | `value_number` | numeric(18,4) | Y |  |  |
| 5 | `unit` | text | Y |  |  |
| 6 | `source_run_id` | uuid | Y |  | FK→`recovery_run` |
| 7 | `source_question_item_id` | uuid | Y |  | FK→`question_item` |
| 8 | `source_path` | character varying(120) | Y |  |  |

**FK**

- `fk_comm_message_structured_field__message_id`: `FOREIGN KEY (message_id) REFERENCES cera.comm_message(message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_comm_message_structured_field__source_question_item_id`: `FOREIGN KEY (source_question_item_id) REFERENCES cera.question_item(question_item_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_comm_message_structured_field__source_run_id`: `FOREIGN KEY (source_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_comm_message_structured_field__field_key`: `CHECK (((field_key)::text ~ '^[a-z][a-z0-9_]*$'::text))`
- `ck_comm_message_structured_field__krw_integer`: `CHECK (((unit <> 'KRW'::text) OR (value_number = trunc(value_number))))`
- `ck_comm_message_structured_field__unit`: `CHECK ((unit ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_comm_message_structured_field__value_present`: `CHECK ((num_nonnulls(value_text, value_number) >= 1))`

**INDEX**

- `ix_comm_message_structured_field__source_question_item_id`: `btree (source_question_item_id)`
- `ix_comm_message_structured_field__source_run_id`: `btree (source_run_id)`

**TRIGGER**

- `tg_comm_message_structured_field__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_comm_message_structured_field__check_copies` — AFTER INSERT → `fn_cera_check_approval_copies`
- `tg_comm_message_structured_field__guard_insert` — BEFORE INSERT → `fn_cera_guard_message_children_insert`
- `tg_comm_message_structured_field__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## comm_thread

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `thread_id` | uuid | N |  | PK |
| 2 | `channel_type` | text | N |  |  |
| 3 | `external_thread_id` | character varying(200) | Y |  |  |
| 4 | `counterparty_id` | uuid | N |  | FK→`counterparty_contact`,`counterparty` |
| 5 | `contact_id` | uuid | Y |  | FK→`counterparty_contact` |
| 6 | `purpose` | text | N |  |  |
| 7 | `related_run_id` | uuid | Y |  | FK→`recovery_run` |
| 8 | `thread_status` | text | N |  |  |
| 9 | `opened_at` | timestamp(3) with time zone | N |  |  |
| 10 | `last_activity_at` | timestamp(3) with time zone | N |  |  |
| 11 | `is_simulated` | boolean | N |  |  |
| 12 | `scenario_id` | uuid | Y |  | FK→`scenario` |

**UNIQUE**

- `uq_comm_thread__channel_type__external_thread_id`: `UNIQUE (channel_type, external_thread_id)`
- `uq_comm_thread__thread_id__channel_type__is_simulated`: `UNIQUE (thread_id, channel_type, is_simulated)`

**FK**

- `fk_comm_thread__contact_id__counterparty_id`: `FOREIGN KEY (contact_id, counterparty_id) REFERENCES cera.counterparty_contact(contact_id, counterparty_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_comm_thread__counterparty_id`: `FOREIGN KEY (counterparty_id) REFERENCES cera.counterparty(counterparty_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_comm_thread__related_run_id`: `FOREIGN KEY (related_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_comm_thread__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_comm_thread__channel_type`: `CHECK ((channel_type = ANY (ARRAY['GMAIL'::text, 'MOCK'::text, 'PORTAL'::text])))`
- `ck_comm_thread__last_activity_after_open`: `CHECK ((last_activity_at >= opened_at))`
- `ck_comm_thread__purpose`: `CHECK ((purpose = ANY (ARRAY['CAPACITY_CHECK'::text, 'RATE_REQUEST'::text, 'SLOT_REQUEST'::text, 'FACT_CONFIRM'::text, 'GENERAL'::text])))`
- `ck_comm_thread__s2_simulated_scenario`: `CHECK ((is_simulated = (scenario_id IS NOT NULL)))`
- `ck_comm_thread__simulated_mock_only`: `CHECK (((NOT is_simulated) OR (channel_type = 'MOCK'::text)))`
- `ck_comm_thread__thread_status`: `CHECK ((thread_status = ANY (ARRAY['OPEN'::text, 'WAITING_REPLY'::text, 'ANSWERED'::text, 'CLOSED'::text])))`

**INDEX**

- `ix_comm_thread__counterparty_id`: `btree (counterparty_id)`
- `ix_comm_thread__related_run_id`: `btree (related_run_id)`

**TRIGGER**

- `tg_comm_thread__external_thread_id_once` — BEFORE UPDATE → `fn_cera_guard_one_time_fill`
- `tg_comm_thread__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_comm_thread__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`
- `tg_comm_thread__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## conflict

- 변경 정책: 갱신 · 삭제 가능 · 앱 역할 권한: DELETE,INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `conflict_id` | uuid | N |  | PK |
| 2 | `entity_type` | text | N |  |  |
| 3 | `entity_id` | uuid | N |  |  |
| 4 | `fact_key` | character varying(120) | N |  |  |
| 5 | `applicability_scope_type` | text | N |  |  |
| 6 | `applicability_scope_ref` | character varying(60) | N | `''::character varying` |  |
| 7 | `conflict_type` | text | N |  |  |
| 8 | `event_ids` | uuid[] | N |  |  |
| 9 | `severity` | text | N |  |  |
| 10 | `detected_rule` | text | N |  |  |
| 11 | `rule_version` | character varying(20) | N |  |  |
| 12 | `blocks_automation` | boolean | N |  |  |
| 13 | `computed_as_of` | timestamp(3) with time zone | N |  |  |
| 14 | `is_simulated` | boolean | N |  |  |
| 15 | `scenario_id` | uuid | Y |  | FK→`scenario` |

**FK**

- `fk_conflict__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_conflict__applicability_scope_type`: `CHECK ((applicability_scope_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_conflict__conflict_type`: `CHECK ((conflict_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_conflict__detected_rule`: `CHECK ((detected_rule ~ '^R[0-9]{1,2}(-[a-z])?$'::text))`
- `ck_conflict__entity_type`: `CHECK ((entity_type = ANY (ARRAY['CONTAINER'::text, 'BL'::text, 'FACILITY'::text, 'COUNTERPARTY'::text, 'TRUCK_POOL'::text, 'VESSEL_CALL'::text])))`
- `ck_conflict__event_ids_cardinality`: `CHECK ((cardinality(event_ids) >= 2))`
- `ck_conflict__s2_simulated_scenario`: `CHECK ((is_simulated = (scenario_id IS NOT NULL)))`
- `ck_conflict__scope_global_empty`: `CHECK (((applicability_scope_type = 'GLOBAL'::text) = ((applicability_scope_ref)::text = ''::text)))`
- `ck_conflict__severity`: `CHECK ((severity ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`

**INDEX**

- `ix_conflict__coordinate`: `btree (entity_type, entity_id, fact_key, applicability_scope_type, applicability_scope_ref, is_simulated)`

## contact_channel_address

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `address_id` | uuid | N |  | PK |
| 2 | `contact_id` | uuid | N |  | FK→`counterparty_contact` |
| 3 | `channel_type` | text | N |  |  |
| 4 | `normalized_address` | character varying(200) | N |  |  |
| 5 | `email_verification_status` | text | N |  |  |
| 6 | `relationship_status` | text | N |  |  |
| 7 | `communication_status` | text | N |  |  |
| 8 | `verified_at` | timestamp(3) with time zone | Y |  |  |
| 9 | `approved_by_actor_id` | uuid | Y |  | FK→`actor` |
| 10 | `approved_at` | timestamp(3) with time zone | Y |  |  |

**UNIQUE**

- `uq_contact_channel_address__address_id__channel_type`: `UNIQUE (address_id, channel_type)`
- `uq_contact_channel_address__channel_type__normalized_address`: `UNIQUE (channel_type, normalized_address)`

**FK**

- `fk_contact_channel_address__approved_by_actor_id`: `FOREIGN KEY (approved_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_contact_channel_address__contact_id`: `FOREIGN KEY (contact_id) REFERENCES cera.counterparty_contact(contact_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_contact_channel_address__approved_by`: `CHECK (((relationship_status <> 'APPROVED'::text) OR ((approved_by_actor_id IS NOT NULL) AND (approved_at IS NOT NULL))))`
- `ck_contact_channel_address__channel_type`: `CHECK ((channel_type = ANY (ARRAY['GMAIL'::text, 'MOCK'::text, 'PORTAL'::text])))`
- `ck_contact_channel_address__communication_status`: `CHECK ((communication_status = ANY (ARRAY['ACTIVE'::text, 'PAUSED'::text, 'INACTIVE'::text])))`
- `ck_contact_channel_address__email_verification_status`: `CHECK ((email_verification_status = ANY (ARRAY['UNVERIFIED'::text, 'PENDING'::text, 'VERIFIED'::text, 'FAILED'::text, 'EXPIRED'::text])))`
- `ck_contact_channel_address__normalized`: `CHECK (((normalized_address)::text = lower(btrim((normalized_address)::text))))`
- `ck_contact_channel_address__relationship_status`: `CHECK ((relationship_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])))`
- `ck_contact_channel_address__verified_at`: `CHECK (((email_verification_status <> 'VERIFIED'::text) OR (verified_at IS NOT NULL)))`

**INDEX**

- `ix_contact_channel_address__contact_id`: `btree (contact_id)`

**TRIGGER**

- `tg_contact_channel_address__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_contact_channel_address__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## contact_selection

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `selection_id` | uuid | N |  | PK |
| 2 | `scope_type` | text | N |  |  |
| 3 | `agent_run_id` | uuid | Y |  | FK→`agent_run` |
| 4 | `plan_id` | uuid | Y |  | FK→`recovery_plan` |
| 5 | `action_key` | character varying(120) | Y |  |  |
| 6 | `subject_type` | text | N |  |  |
| 7 | `subject_id` | uuid | N |  |  |
| 8 | `address_id` | uuid | N |  | FK→`contact_channel_address` |
| 9 | `selected_by_actor_id` | uuid | N |  | FK→`actor` |
| 10 | `selected_at` | timestamp(3) with time zone | N |  |  |
| 11 | `note` | character varying(200) | Y |  |  |

**FK**

- `fk_contact_selection__address_id`: `FOREIGN KEY (address_id) REFERENCES cera.contact_channel_address(address_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_contact_selection__agent_run_id`: `FOREIGN KEY (agent_run_id) REFERENCES cera.agent_run(agent_run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_contact_selection__plan_id`: `FOREIGN KEY (plan_id) REFERENCES cera.recovery_plan(plan_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_contact_selection__selected_by_actor_id`: `FOREIGN KEY (selected_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_contact_selection__scope`: `CHECK ((((scope_type = 'AGENT_RUN'::text) AND (agent_run_id IS NOT NULL) AND (plan_id IS NULL) AND (action_key IS NULL)) OR ((scope_type = 'PLAN_FOLLOW_UP'::text) AND (plan_id IS NOT NULL) AND (action_key IS NOT NULL) AND (agent_run_id IS NULL))))`
- `ck_contact_selection__scope_type`: `CHECK ((scope_type = ANY (ARRAY['AGENT_RUN'::text, 'PLAN_FOLLOW_UP'::text])))`
- `ck_contact_selection__subject_type`: `CHECK ((subject_type = ANY (ARRAY['FACILITY'::text, 'TRUCK_POOL'::text])))`

**INDEX**

- `ix_contact_selection__agent_run_id__subject_id`: `btree (agent_run_id, subject_id)`
- `ix_contact_selection__plan_id__action_key`: `btree (plan_id, action_key)`

**TRIGGER**

- `tg_contact_selection__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_contact_selection__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## container

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `container_id` | uuid | N |  | PK |
| 2 | `container_no` | character varying(11) | N |  |  |
| 3 | `size_type` | text | Y |  |  |
| 4 | `vessel_call_id` | uuid | Y |  | FK→`vessel_call` |
| 5 | `first_raw_input_id` | uuid | N |  | FK→`raw_input` |
| 6 | `is_simulated` | boolean | N |  | FK→`raw_input` |
| 7 | `registered_at` | timestamp(3) with time zone | N |  |  |
| 8 | `is_active` | boolean | N | `true` |  |

**UNIQUE**

- `uq_container__container_no`: `UNIQUE (container_no)`

**FK**

- `fk_container__first_raw_input_id__is_simulated`: `FOREIGN KEY (first_raw_input_id, is_simulated) REFERENCES cera.raw_input(raw_input_id, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_container__vessel_call_id`: `FOREIGN KEY (vessel_call_id) REFERENCES cera.vessel_call(vessel_call_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_container__container_no`: `CHECK (((container_no)::text ~ '^[A-Z]{3}[UJZ][0-9]{7}$'::text))`
- `ck_container__size_type`: `CHECK ((size_type = ANY (ARRAY['20DRY'::text, '40DRY'::text, '40HC'::text, '20RF'::text, '40RF'::text, 'OTHER'::text])))`

**INDEX**

- `ix_container__vessel_call_id`: `btree (vessel_call_id) WHERE (vessel_call_id IS NOT NULL)`

**TRIGGER**

- `tg_container__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_container__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`

## container_bl

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `container_id` | uuid | N |  | PK FK→`container` |
| 2 | `bl_id` | uuid | N |  | PK FK→`bl` |
| 3 | `link_role` | text | N |  |  |

**FK**

- `fk_container_bl__bl_id`: `FOREIGN KEY (bl_id) REFERENCES cera.bl(bl_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_container_bl__container_id`: `FOREIGN KEY (container_id) REFERENCES cera.container(container_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_container_bl__link_role`: `CHECK ((link_role = ANY (ARRAY['PRIMARY'::text, 'CONSOLIDATED'::text])))`

**INDEX**

- `ix_container_bl__bl_id`: `btree (bl_id)`
- `uq_container_bl__container_id__primary`: `btree (container_id) WHERE (link_role = 'PRIMARY'::text)` (UNIQUE)

**TRIGGER**

- `tg_container_bl__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`

## counterparty

- 변경 정책: 갱신 가능 · 삭제 불가 · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `counterparty_id` | uuid | N |  | PK |
| 2 | `display_name` | character varying(100) | N |  |  |
| 3 | `source_role` | text | N |  |  |
| 4 | `org_code` | character varying(30) | Y |  |  |
| 5 | `is_active` | boolean | N | `true` |  |

**CHECK**

- `ck_counterparty__source_role`: `CHECK ((source_role = ANY (ARRAY['TRUCKING'::text, 'ODCY'::text, 'WAREHOUSE'::text, 'SHIPPING_LINE'::text, 'TERMINAL'::text])))`

**TRIGGER**

- `tg_counterparty__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## counterparty_contact

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `contact_id` | uuid | N |  | PK |
| 2 | `counterparty_id` | uuid | N |  | FK→`counterparty` |
| 3 | `person_name` | character varying(60) | N |  |  |
| 4 | `team` | character varying(60) | Y |  |  |
| 5 | `note` | character varying(200) | Y |  |  |
| 6 | `is_active` | boolean | N | `true` |  |

**UNIQUE**

- `uq_counterparty_contact__contact_id__counterparty_id`: `UNIQUE (contact_id, counterparty_id)`

**FK**

- `fk_counterparty_contact__counterparty_id`: `FOREIGN KEY (counterparty_id) REFERENCES cera.counterparty(counterparty_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**INDEX**

- `ix_counterparty_contact__counterparty_id`: `btree (counterparty_id)`

**TRIGGER**

- `tg_counterparty_contact__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_counterparty_contact__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## event

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `event_id` | uuid | N |  | PK |
| 2 | `schema_version` | character varying(20) | N |  |  |
| 3 | `raw_input_id` | uuid | N |  | FK→`raw_input` |
| 4 | `event_class` | text | N |  |  |
| 5 | `event_type` | text | N |  |  |
| 6 | `fact_kind` | text | Y |  |  |
| 7 | `fact_key` | character varying(120) | Y |  |  |
| 8 | `value_text` | text | Y |  |  |
| 9 | `value_number` | numeric(18,4) | Y |  |  |
| 10 | `value_timestamp` | timestamp(3) with time zone | Y |  |  |
| 11 | `value_code` | text | Y |  |  |
| 12 | `value_unit` | text | Y |  |  |
| 13 | `valid_from` | timestamp(3) with time zone | Y |  |  |
| 14 | `valid_until` | timestamp(3) with time zone | Y |  |  |
| 15 | `applicability_scope_type` | text | N | `'GLOBAL'::text` |  |
| 16 | `applicability_scope_ref` | character varying(60) | N | `''::character varying` |  |
| 17 | `source_event_time` | timestamp(3) with time zone | Y |  |  |
| 18 | `source_recorded_at` | timestamp(3) with time zone | Y |  |  |
| 19 | `received_at` | timestamp(3) with time zone | N |  |  |
| 20 | `source_type` | text | N |  |  |
| 21 | `source_role_at_ingestion` | text | Y |  |  |
| 22 | `source_id` | character varying(60) | Y |  |  |
| 23 | `extraction_method` | text | N |  |  |
| 24 | `input_quality` | text | N |  |  |
| 25 | `input_confidence_level` | text | N |  |  |
| 26 | `input_confidence_reasons` | jsonb | Y |  |  |
| 27 | `asserted_by_counterparty_id` | uuid | Y |  | FK→`counterparty` |
| 28 | `entered_by_actor_id` | uuid | Y |  | FK→`actor` |
| 29 | `supersedes_event_id` | uuid | Y |  | FK→`event` |
| 30 | `supersede_reason` | character varying(200) | Y |  |  |
| 31 | `verification_action` | text | Y |  |  |
| 32 | `verification_method` | text | Y |  |  |
| 33 | `extraction_id` | uuid | Y |  | FK→`extraction` |
| 34 | `correlation_id` | character varying(60) | Y |  |  |
| 35 | `idempotency_key` | character varying(71) | N |  |  |
| 36 | `payload` | jsonb | Y |  |  |
| 37 | `recorded_at` | timestamp(3) with time zone | N |  |  |
| 38 | `is_simulated` | boolean | N |  | FK→`raw_input` |
| 39 | `scenario_id` | uuid | Y |  | FK→`scenario` |

**UNIQUE**

- `uq_event__idempotency_key`: `UNIQUE (idempotency_key)`

**FK**

- `fk_event__asserted_by_counterparty_id`: `FOREIGN KEY (asserted_by_counterparty_id) REFERENCES cera.counterparty(counterparty_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_event__entered_by_actor_id`: `FOREIGN KEY (entered_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_event__extraction_id`: `FOREIGN KEY (extraction_id) REFERENCES cera.extraction(extraction_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_event__raw_input_id__is_simulated`: `FOREIGN KEY (raw_input_id, is_simulated) REFERENCES cera.raw_input(raw_input_id, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_event__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_event__supersedes_event_id`: `FOREIGN KEY (supersedes_event_id) REFERENCES cera.event(event_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_event__applicability_scope_type`: `CHECK ((applicability_scope_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_event__class_correction`: `CHECK (((event_class <> 'CORRECTION'::text) OR ((fact_kind IS NOT NULL) AND (fact_key IS NOT NULL) AND (supersedes_event_id IS NOT NULL) AND (verification_action IS NULL) AND (verification_method IS NULL))))`
- `ck_event__class_observation`: `CHECK (((event_class <> 'OBSERVATION'::text) OR ((fact_kind IS NOT NULL) AND (fact_key IS NOT NULL) AND (num_nonnulls(value_text, value_number, value_timestamp, value_code) >= 1) AND (supersedes_event_id IS NULL) AND (verification_action IS NULL) AND (verification_method IS NULL))))`
- `ck_event__class_verification`: `CHECK (((event_class <> 'VERIFICATION'::text) OR ((fact_kind IS NULL) AND (fact_key IS NULL) AND (num_nonnulls(value_text, value_number, value_timestamp, value_code) = 0) AND (supersedes_event_id IS NULL) AND (verification_action IS NOT NULL) AND (verification_method IS NOT NULL))))`
- `ck_event__event_class`: `CHECK ((event_class = ANY (ARRAY['OBSERVATION'::text, 'CORRECTION'::text, 'VERIFICATION'::text])))`
- `ck_event__event_type`: `CHECK ((event_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_event__extraction_method`: `CHECK ((extraction_method = ANY (ARRAY['DIRECT'::text, 'RULE_PARSED'::text, 'LLM_EXTRACTED'::text, 'CALCULATED'::text])))`
- `ck_event__fact_kind`: `CHECK ((fact_kind = ANY (ARRAY['MILESTONE'::text, 'STATE'::text, 'OFFER'::text, 'TERM'::text, 'IDENTITY'::text, 'PLAN'::text, 'FORECAST'::text])))`
- `ck_event__idempotency_key`: `CHECK (((idempotency_key)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_event__input_confidence_level`: `CHECK ((input_confidence_level = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])))`
- `ck_event__input_confidence_reasons_array`: `CHECK ((jsonb_typeof(input_confidence_reasons) = 'array'::text))`
- `ck_event__input_quality`: `CHECK ((input_quality = ANY (ARRAY['STRUCTURED'::text, 'SEMI_STRUCTURED'::text, 'UNSTRUCTURED'::text])))`
- `ck_event__krw_integer`: `CHECK (((value_unit <> 'KRW'::text) OR (value_number = trunc(value_number))))`
- `ck_event__llm_extraction_pair`: `CHECK (((extraction_method = 'LLM_EXTRACTED'::text) = (extraction_id IS NOT NULL)))`
- `ck_event__payload_object`: `CHECK ((jsonb_typeof(payload) = 'object'::text))`
- `ck_event__s2_simulated_scenario`: `CHECK ((is_simulated = (scenario_id IS NOT NULL)))`
- `ck_event__schema_version`: `CHECK (((schema_version)::text ~ '^ev-[1-9][0-9]*$'::text))`
- `ck_event__scope_global_empty`: `CHECK (((applicability_scope_type = 'GLOBAL'::text) = ((applicability_scope_ref)::text = ''::text)))`
- `ck_event__source_role_at_ingestion`: `CHECK ((source_role_at_ingestion ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_event__source_type`: `CHECK ((source_type = ANY (ARRAY['HUMAN_UI'::text, 'FILE_IMPORT'::text, 'EMAIL'::text, 'DOCUMENT'::text, 'PUBLIC_API'::text, 'PARTNER_SYSTEM'::text, 'INFERENCE'::text])))`
- `ck_event__supersedes_not_self`: `CHECK ((supersedes_event_id <> event_id))`
- `ck_event__valid_range`: `CHECK (((valid_from IS NULL) OR (valid_until IS NULL) OR (valid_from < valid_until)))`
- `ck_event__value_code`: `CHECK ((value_code ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_event__value_unit`: `CHECK ((value_unit ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_event__verification_action`: `CHECK ((verification_action = ANY (ARRAY['CONFIRM'::text, 'REJECT'::text, 'REVOKE'::text])))`
- `ck_event__verification_method`: `CHECK ((verification_method = ANY (ARRAY['DIRECT_REVIEW'::text, 'REQUEST_RESOLUTION'::text])))`

**INDEX**

- `ix_event__correlation_id`: `btree (correlation_id) WHERE (correlation_id IS NOT NULL)`
- `ix_event__extraction_id`: `btree (extraction_id) WHERE (extraction_id IS NOT NULL)`
- `ix_event__fact_key__scope`: `btree (fact_key, applicability_scope_type, applicability_scope_ref)`
- `ix_event__raw_input_id`: `btree (raw_input_id)`
- `ix_event__received_at`: `btree (received_at)`
- `ix_event__supersedes_event_id`: `btree (supersedes_event_id) WHERE (supersedes_event_id IS NOT NULL)`

**TRIGGER**

- `tg_event__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_event__check_links` — AFTER INSERT → `fn_cera_check_event_links`
- `tg_event__guard_authority` — BEFORE INSERT → `fn_cera_guard_event_authority`
- `tg_event__guard_insert` — BEFORE INSERT → `fn_cera_guard_event_insert`
- `tg_event__guard_withdrawal` — BEFORE INSERT → `fn_cera_guard_event_withdrawal`
- `tg_event__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## event_entity_link

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `event_id` | uuid | N |  | PK FK→`event` |
| 2 | `entity_type` | text | N |  | PK |
| 3 | `entity_id` | uuid | N |  | PK |
| 4 | `link_role` | text | N |  |  |

**FK**

- `fk_event_entity_link__event_id`: `FOREIGN KEY (event_id) REFERENCES cera.event(event_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_event_entity_link__entity_type`: `CHECK ((entity_type = ANY (ARRAY['CONTAINER'::text, 'BL'::text, 'FACILITY'::text, 'COUNTERPARTY'::text, 'TRUCK_POOL'::text, 'VESSEL_CALL'::text])))`
- `ck_event_entity_link__link_role`: `CHECK ((link_role = ANY (ARRAY['SUBJECT'::text, 'CONTEXT'::text])))`

**INDEX**

- `ix_event_entity_link__subject_entity`: `btree (entity_type, entity_id, event_id) WHERE (link_role = 'SUBJECT'::text)`
- `uq_event_entity_link__event_id__subject`: `btree (event_id) WHERE (link_role = 'SUBJECT'::text)` (UNIQUE)

**TRIGGER**

- `tg_event_entity_link__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_event_entity_link__check_links` — AFTER INSERT → `fn_cera_check_event_links`
- `tg_event_entity_link__guard_insert` — BEFORE INSERT → `fn_cera_guard_entity_link_insert`
- `tg_event_entity_link__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## event_verification_target

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `verification_event_id` | uuid | N |  | PK FK→`event` |
| 2 | `target_event_id` | uuid | N |  | PK FK→`event` |
| 3 | `target_role` | text | N |  | PK |

**UNIQUE**

- `uq_event_verification_target__verification__target`: `UNIQUE (verification_event_id, target_event_id)`

**FK**

- `fk_event_verification_target__target_event_id`: `FOREIGN KEY (target_event_id) REFERENCES cera.event(event_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_event_verification_target__verification_event_id`: `FOREIGN KEY (verification_event_id) REFERENCES cera.event(event_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_event_verification_target__target_role`: `CHECK ((target_role = ANY (ARRAY['TARGET'::text, 'OVERRULED'::text])))`

**INDEX**

- `ix_event_verification_target__target_event_id`: `btree (target_event_id)`

**TRIGGER**

- `tg_event_verification_target__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_event_verification_target__check_links` — AFTER INSERT → `fn_cera_check_event_links`
- `tg_event_verification_target__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## external_identifier

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `external_identifier_id` | uuid | N |  | PK |
| 2 | `owner_type` | text | N |  |  |
| 3 | `owner_id` | uuid | N |  |  |
| 4 | `issuing_system` | text | N |  |  |
| 5 | `id_type` | text | N |  |  |
| 6 | `id_value` | character varying(40) | N |  |  |
| 7 | `source_event_id` | uuid | Y |  | FK→`event` |
| 8 | `source_raw_input_id` | uuid | N |  | FK→`raw_input` |
| 9 | `is_simulated` | boolean | N |  | FK→`raw_input` |

**UNIQUE**

- `uq_external_identifier__system_type_value`: `UNIQUE (issuing_system, id_type, id_value)`

**FK**

- `fk_external_identifier__source_event_id`: `FOREIGN KEY (source_event_id) REFERENCES cera.event(event_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_external_identifier__source_raw_input_id__is_simulated`: `FOREIGN KEY (source_raw_input_id, is_simulated) REFERENCES cera.raw_input(raw_input_id, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_external_identifier__id_type`: `CHECK ((id_type = ANY (ARRAY['CARGO_MGMT_NO'::text, 'MANIFEST_NO'::text, 'MSN'::text])))`
- `ck_external_identifier__issuing_system`: `CHECK ((issuing_system = ANY (ARRAY['KCS'::text, 'MOF'::text])))`
- `ck_external_identifier__owner_type`: `CHECK ((owner_type = ANY (ARRAY['BL'::text, 'CONTAINER'::text, 'VESSEL_CALL'::text])))`

**INDEX**

- `ix_external_identifier__owner`: `btree (owner_type, owner_id)`

**TRIGGER**

- `tg_external_identifier__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_external_identifier__guard_insert` — BEFORE INSERT → `fn_cera_guard_external_identifier_insert`

## extraction

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `extraction_id` | uuid | N |  | PK |
| 2 | `message_id` | uuid | Y |  | FK→`comm_message` |
| 3 | `raw_input_id` | uuid | N |  | FK→`raw_input` |
| 4 | `ask_id` | character varying(40) | Y |  |  |
| 5 | `candidate_value_text` | text | N |  |  |
| 6 | `candidate_unit` | text | Y |  |  |
| 7 | `source_quote_ref` | character varying(300) | N |  |  |
| 8 | `source_quote_hash` | character varying(71) | N |  |  |
| 9 | `quote_location` | character varying(100) | Y |  |  |
| 10 | `model_version` | character varying(60) | N |  |  |
| 11 | `prompt_version` | character varying(20) | N |  |  |
| 12 | `model_confidence` | numeric(5,4) | Y |  |  |
| 13 | `review_status` | text | N | `'PENDING'::text` |  |
| 14 | `reviewed_by_actor_id` | uuid | Y |  | FK→`actor` |
| 15 | `reviewed_at` | timestamp(3) with time zone | Y |  |  |
| 16 | `created_event_id` | uuid | Y |  | FK→`event` |
| 17 | `is_simulated` | boolean | N |  | FK→`raw_input` |
| 18 | `schema_version` | character varying(20) | N |  |  |
| 19 | `input_hash` | character varying(71) | N |  |  |
| 20 | `validator_result` | jsonb | N |  |  |

**FK**

- `fk_extraction__created_event_id`: `FOREIGN KEY (created_event_id) REFERENCES cera.event(event_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_extraction__message_id`: `FOREIGN KEY (message_id) REFERENCES cera.comm_message(message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_extraction__raw_input_id__is_simulated`: `FOREIGN KEY (raw_input_id, is_simulated) REFERENCES cera.raw_input(raw_input_id, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_extraction__reviewed_by_actor_id`: `FOREIGN KEY (reviewed_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_extraction__accepted_has_event`: `CHECK (((review_status = 'ACCEPTED'::text) = (created_event_id IS NOT NULL)))`
- `ck_extraction__candidate_unit`: `CHECK ((candidate_unit ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_extraction__input_hash`: `CHECK (((input_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_extraction__model_confidence`: `CHECK (((model_confidence >= (0)::numeric) AND (model_confidence <= (1)::numeric)))`
- `ck_extraction__pending_unreviewed`: `CHECK (((review_status <> 'PENDING'::text) OR ((reviewed_by_actor_id IS NULL) AND (reviewed_at IS NULL) AND (created_event_id IS NULL))))`
- `ck_extraction__review_status`: `CHECK ((review_status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'SUPERSEDED'::text])))`
- `ck_extraction__reviewed_at`: `CHECK (((review_status <> ALL (ARRAY['ACCEPTED'::text, 'REJECTED'::text])) OR (reviewed_at IS NOT NULL)))`
- `ck_extraction__source_quote_hash`: `CHECK (((source_quote_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_extraction__source_quote_ref`: `CHECK (((source_quote_ref)::text ~ '^cref:v1:EXTRACTION_SOURCE_QUOTE:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text))`
- `ck_extraction__validator_result_array`: `CHECK ((jsonb_typeof(validator_result) = 'array'::text))`

**INDEX**

- `ix_extraction__message_id`: `btree (message_id)`
- `ix_extraction__pending`: `btree (review_status) WHERE (review_status = 'PENDING'::text)`
- `ix_extraction__raw_input_id`: `btree (raw_input_id)`

**TRIGGER**

- `tg_extraction__guard_accept` — BEFORE UPDATE → `fn_cera_guard_extraction_accept`
- `tg_extraction__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_extraction__guard_review` — BEFORE UPDATE → `fn_cera_guard_extraction_review`
- `tg_extraction__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`
- `tg_extraction__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## extraction_retry_request

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `retry_request_id` | uuid | N |  | PK |
| 2 | `message_id` | uuid | N |  | FK→`comm_message` |
| 3 | `command_id` | uuid | N |  |  |
| 4 | `requested_by_actor_id` | uuid | N |  | FK→`actor` |
| 5 | `requested_at` | timestamp(3) with time zone | N |  |  |
| 6 | `prior_state` | text | N |  |  |
| 7 | `prior_failed_attempts` | integer | N |  |  |
| 8 | `note` | character varying(200) | Y |  |  |
| 9 | `is_simulated` | boolean | N |  |  |

**UNIQUE**

- `uq_extraction_retry_request__requested_by_actor_id__command_id`: `UNIQUE (requested_by_actor_id, command_id)`

**FK**

- `fk_extraction_retry_request__message_id`: `FOREIGN KEY (message_id) REFERENCES cera.comm_message(message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_extraction_retry_request__requested_by_actor_id`: `FOREIGN KEY (requested_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_extraction_retry_request__note`: `CHECK (((note IS NULL) OR (char_length((note)::text) >= 1)))`
- `ck_extraction_retry_request__prior_failed_attempts`: `CHECK ((prior_failed_attempts >= 0))`
- `ck_extraction_retry_request__prior_state`: `CHECK ((prior_state = ANY (ARRAY['FAILED'::text, 'NO_CANDIDATE'::text, 'DONE'::text])))`

**INDEX**

- `ix_extraction_retry_request__message_id`: `btree (message_id, requested_at)`

**TRIGGER**

- `tg_extraction_retry_request__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_extraction_retry_request__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## facility

- 변경 정책: 갱신 가능 · 삭제 불가 · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `facility_id` | uuid | N |  | PK |
| 2 | `facility_type` | text | N |  |  |
| 3 | `facility_name` | character varying(100) | N |  |  |
| 4 | `area` | character varying(100) | Y |  |  |
| 5 | `default_open_time` | time(0) without time zone | Y |  |  |
| 6 | `default_close_time` | time(0) without time zone | Y |  |  |
| 7 | `is_active` | boolean | N | `true` |  |
| 8 | `operator_counterparty_id` | uuid | Y |  | FK→`counterparty` |

**FK**

- `fk_facility__operator_counterparty_id`: `FOREIGN KEY (operator_counterparty_id) REFERENCES cera.counterparty(counterparty_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_facility__facility_type`: `CHECK ((facility_type = ANY (ARRAY['WAREHOUSE'::text, 'TERMINAL'::text, 'ODCY'::text])))`

**TRIGGER**

- `tg_facility__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## facility_planning_profile

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `profile_id` | uuid | N |  | PK |
| 2 | `batch_id` | uuid | N |  | FK→`planning_input_batch` |
| 3 | `facility_id` | uuid | N |  | FK→`facility` |
| 4 | `accepts` | jsonb | N |  |  |
| 5 | `open_from_hour` | integer | N |  |  |
| 6 | `last_departure_hour` | integer | N |  |  |
| 7 | `trip_hours` | integer | N |  |  |
| 8 | `max_storage_days` | integer | Y |  |  |
| 9 | `record_status` | text | N |  |  |
| 10 | `row_no` | integer | N |  |  |
| 11 | `content_hash` | character varying(71) | N |  |  |
| 12 | `supersedes_profile_id` | uuid | Y |  | FK→`facility_planning_profile` |
| 13 | `recorded_at` | timestamp(3) with time zone | N |  |  |

**UNIQUE**

- `uq_facility_planning_profile__supersedes_profile_id`: `UNIQUE (supersedes_profile_id)`

**FK**

- `fk_facility_planning_profile__batch_id`: `FOREIGN KEY (batch_id) REFERENCES cera.planning_input_batch(batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_facility_planning_profile__facility_id`: `FOREIGN KEY (facility_id) REFERENCES cera.facility(facility_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_facility_planning_profile__supersedes_profile_id`: `FOREIGN KEY (supersedes_profile_id) REFERENCES cera.facility_planning_profile(profile_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_facility_planning_profile__content_hash`: `CHECK (((content_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_facility_planning_profile__hours`: `CHECK ((((open_from_hour >= 0) AND (open_from_hour <= 23)) AND ((last_departure_hour >= 0) AND (last_departure_hour <= 23)) AND (last_departure_hour >= open_from_hour)))`
- `ck_facility_planning_profile__max_storage_days`: `CHECK (((max_storage_days IS NULL) OR (max_storage_days >= 0)))`
- `ck_facility_planning_profile__record_status`: `CHECK ((record_status = ANY (ARRAY['ACTIVE'::text, 'WITHDRAWN'::text])))`
- `ck_facility_planning_profile__trip_hours`: `CHECK (((trip_hours >= 1) AND (trip_hours <= 24)))`

**INDEX**

- `ix_facility_planning_profile__facility_id`: `btree (facility_id)`

**TRIGGER**

- `tg_facility_planning_profile__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_facility_planning_profile__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## message_approval

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `approval_id` | uuid | N |  | PK |
| 2 | `message_id` | uuid | N |  | FK→`message_approval`,`comm_message`,`comm_message` |
| 3 | `decision` | text | N |  |  |
| 4 | `invalidates_approval_id` | uuid | Y |  | FK→`message_approval` |
| 5 | `invalidation_cause` | text | Y |  |  |
| 6 | `actor_id` | uuid | N |  | FK→`actor` |
| 7 | `decided_at` | timestamp(3) with time zone | N |  |  |
| 8 | `expires_at` | timestamp(3) with time zone | Y |  |  |
| 9 | `approved_content_ref` | character varying(300) | Y |  |  |
| 10 | `approved_plan_run_id` | uuid | Y |  | FK→`recovery_run` |
| 11 | `approved_content_hash` | character varying(71) | Y |  |  |
| 12 | `approved_to_address_id` | uuid | Y |  | FK→`comm_message` |
| 13 | `reason` | character varying(500) | Y |  |  |

**UNIQUE**

- `uq_message_approval__approval_id__message_id`: `UNIQUE (approval_id, message_id)`
- `uq_message_approval__invalidates_approval_id`: `UNIQUE (invalidates_approval_id)`

**FK**

- `fk_message_approval__actor_id`: `FOREIGN KEY (actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_message_approval__approved_plan_run_id`: `FOREIGN KEY (approved_plan_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_message_approval__invalidates_approval_id__message_id`: `FOREIGN KEY (invalidates_approval_id, message_id) REFERENCES cera.message_approval(approval_id, message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_message_approval__message_id`: `FOREIGN KEY (message_id) REFERENCES cera.comm_message(message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_message_approval__message_id__approved_to_address_id`: `FOREIGN KEY (message_id, approved_to_address_id) REFERENCES cera.comm_message(message_id, to_address_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_message_approval__approved_content_hash`: `CHECK (((approved_content_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_message_approval__approved_content_ref`: `CHECK (((approved_content_ref)::text ~ '^cref:v1:MESSAGE_APPROVAL_CONTENT:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text))`
- `ck_message_approval__approved_copy`: `CHECK (((decision <> 'APPROVED'::text) OR ((approved_content_hash IS NOT NULL) AND (approved_to_address_id IS NOT NULL))))`
- `ck_message_approval__cause_by_decision`: `CHECK ((((decision <> 'REVOKED'::text) OR (invalidation_cause = 'USER_REVOKED'::text)) AND ((decision <> 'INVALIDATED'::text) OR (invalidation_cause = ANY (ARRAY['PLAN_SUPERSEDED'::text, 'CONTENT_CHANGED'::text])))))`
- `ck_message_approval__cause_pair`: `CHECK (((decision = ANY (ARRAY['REVOKED'::text, 'INVALIDATED'::text])) = (invalidation_cause IS NOT NULL)))`
- `ck_message_approval__decision`: `CHECK ((decision = ANY (ARRAY['APPROVED'::text, 'REJECTED'::text, 'REVISION_REQUESTED'::text, 'REVOKED'::text, 'INVALIDATED'::text])))`
- `ck_message_approval__expires_after_decided`: `CHECK (((expires_at IS NULL) OR (expires_at > decided_at)))`
- `ck_message_approval__invalidates_pair`: `CHECK (((decision = ANY (ARRAY['REVOKED'::text, 'INVALIDATED'::text])) = (invalidates_approval_id IS NOT NULL)))`
- `ck_message_approval__invalidation_cause`: `CHECK ((invalidation_cause = ANY (ARRAY['USER_REVOKED'::text, 'PLAN_SUPERSEDED'::text, 'CONTENT_CHANGED'::text])))`
- `ck_message_approval__reason_required`: `CHECK (((decision <> ALL (ARRAY['REJECTED'::text, 'REVISION_REQUESTED'::text])) OR (reason IS NOT NULL)))`

**INDEX**

- `ix_message_approval__approved`: `btree (message_id) WHERE (decision = 'APPROVED'::text)`
- `ix_message_approval__message_id__decided_at`: `btree (message_id, decided_at)`

**TRIGGER**

- `tg_message_approval__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_message_approval__check_copies` — AFTER INSERT → `fn_cera_check_approval_copies`
- `tg_message_approval__guard_decision` — BEFORE INSERT → `fn_cera_guard_approval_decision`
- `tg_message_approval__guard_insert` — BEFORE INSERT → `fn_cera_guard_approval_insert`
- `tg_message_approval__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## message_approval_structured_field

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `approval_id` | uuid | N |  | PK FK→`message_approval` |
| 2 | `field_key` | character varying(60) | N |  | PK |
| 3 | `approved_value_text` | text | Y |  |  |
| 4 | `approved_value_number` | numeric(18,4) | Y |  |  |
| 5 | `approved_unit` | text | Y |  |  |
| 6 | `approved_source_run_id` | uuid | Y |  | FK→`recovery_run` |
| 7 | `approved_source_question_item_id` | uuid | Y |  | FK→`question_item` |
| 8 | `approved_source_path` | character varying(120) | Y |  |  |

**FK**

- `fk_message_approval_structured_field__approval_id`: `FOREIGN KEY (approval_id) REFERENCES cera.message_approval(approval_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_message_approval_structured_field__approved_source_run_id`: `FOREIGN KEY (approved_source_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_message_approval_structured_field__approved_src_question`: `FOREIGN KEY (approved_source_question_item_id) REFERENCES cera.question_item(question_item_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_message_approval_structured_field__approved_unit`: `CHECK ((approved_unit ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_message_approval_structured_field__krw_integer`: `CHECK (((approved_unit <> 'KRW'::text) OR (approved_value_number = trunc(approved_value_number))))`
- `ck_message_approval_structured_field__value_present`: `CHECK ((num_nonnulls(approved_value_text, approved_value_number) >= 1))`

**TRIGGER**

- `tg_message_approval_structured_field__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_message_approval_structured_field__check_copies` — AFTER INSERT → `fn_cera_check_approval_copies`
- `tg_message_approval_structured_field__guard_insert` — BEFORE INSERT → `fn_cera_guard_approval_copy_insert`
- `tg_message_approval_structured_field__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## message_status_transition

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `transition_id` | uuid | N |  | PK |
| 2 | `message_id` | uuid | N |  | FK→`comm_message`,`send_attempt` |
| 3 | `status` | text | N |  |  |
| 4 | `occurred_at` | timestamp(3) with time zone | N |  |  |
| 5 | `actor_id` | uuid | Y |  | FK→`actor` |
| 6 | `send_attempt_id` | uuid | Y |  | FK→`send_attempt` |
| 7 | `note` | character varying(300) | Y |  |  |
| 8 | `is_simulated` | boolean | N |  | FK→`comm_message` |

**FK**

- `fk_message_status_transition__actor_id`: `FOREIGN KEY (actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_message_status_transition__message_id__is_simulated`: `FOREIGN KEY (message_id, is_simulated) REFERENCES cera.comm_message(message_id, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_message_status_transition__send_attempt_id__message_id`: `FOREIGN KEY (send_attempt_id, message_id) REFERENCES cera.send_attempt(send_attempt_id, message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_message_status_transition__status`: `CHECK ((status = ANY (ARRAY['DRAFTED'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text, 'QUEUED'::text, 'SENT'::text, 'DELIVERY_FAILED'::text, 'REPLIED'::text, 'CLOSED'::text])))`

**INDEX**

- `ix_message_status_transition__message_id__occurred_at`: `btree (message_id, occurred_at)`

**TRIGGER**

- `tg_message_status_transition__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_message_status_transition__apply` — AFTER INSERT → `fn_cera_apply_status_transition`
- `tg_message_status_transition__guard_insert` — BEFORE INSERT → `fn_cera_guard_status_transition`
- `tg_message_status_transition__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## operational_exception

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `exception_id` | uuid | N |  | PK |
| 2 | `exception_type` | text | N |  |  |
| 3 | `scope` | text | N |  |  |
| 4 | `scenario_id` | uuid | Y |  | FK→`scenario` |
| 5 | `facility_id` | uuid | N |  | FK→`facility` |
| 6 | `window_day` | date | N |  |  |
| 7 | `status` | text | N |  |  |
| 8 | `basis` | text | N |  |  |
| 9 | `scheduled_demand` | integer | N |  |  |
| 10 | `capacity` | integer | Y |  |  |
| 11 | `shortage` | integer | N |  |  |
| 12 | `recovery_run_id` | uuid | Y |  | FK→`recovery_run` |
| 13 | `is_simulated` | boolean | N |  |  |
| 14 | `detected_at` | timestamp(3) with time zone | N |  |  |
| 15 | `updated_at` | timestamp(3) with time zone | N |  |  |
| 16 | `resolved_at` | timestamp(3) with time zone | Y |  |  |

**UNIQUE**

- `uq_operational_exception__recovery_run_id`: `UNIQUE (recovery_run_id)`

**FK**

- `fk_operational_exception__facility_id`: `FOREIGN KEY (facility_id) REFERENCES cera.facility(facility_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_operational_exception__recovery_run_id`: `FOREIGN KEY (recovery_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_operational_exception__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_operational_exception__basis`: `CHECK ((basis = ANY (ARRAY['CONFIRMED'::text, 'PROVISIONAL'::text])))`
- `ck_operational_exception__exception_type`: `CHECK ((exception_type = 'WAREHOUSE_CAPACITY_SHORTAGE'::text))`
- `ck_operational_exception__numbers`: `CHECK (((scheduled_demand >= 0) AND ((capacity IS NULL) OR (capacity >= 0)) AND (shortage >= 0)))`
- `ck_operational_exception__resolved`: `CHECK (((status = 'RESOLVED'::text) = (resolved_at IS NOT NULL)))`
- `ck_operational_exception__scope`: `CHECK ((scope = ANY (ARRAY['LIVE'::text, 'SCENARIO'::text])))`
- `ck_operational_exception__scope_scenario`: `CHECK ((((scope = 'SCENARIO'::text) = (scenario_id IS NOT NULL)) AND ((scope = 'SCENARIO'::text) = is_simulated)))`
- `ck_operational_exception__status`: `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'RESOLVED'::text])))`
- `ck_operational_exception__time_order`: `CHECK (((updated_at >= detected_at) AND ((resolved_at IS NULL) OR (resolved_at >= detected_at))))`

**INDEX**

- `ix_operational_exception__status`: `btree (status, detected_at)`
- `uq_operational_exception__active_identity`: `btree (exception_type, scope, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid), facility_id, window_day) WHERE (status = 'ACTIVE'::text)` (UNIQUE)

**TRIGGER**

- `tg_operational_exception__columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_operational_exception__lifecycle` — BEFORE UPDATE → `fn_cera_guard_operational_exception`
- `tg_operational_exception__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`
- `tg_operational_exception__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`
- `tg_operational_exception__run_once` — BEFORE UPDATE → `fn_cera_guard_one_time_fill`

## operational_exception_observation

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `observation_id` | uuid | N |  | PK |
| 2 | `exception_id` | uuid | N |  | FK→`operational_exception` |
| 3 | `kind` | text | N |  |  |
| 4 | `as_of` | timestamp(3) with time zone | N |  |  |
| 5 | `observed_at` | timestamp(3) with time zone | N |  |  |
| 6 | `scheduled_demand` | integer | N |  |  |
| 7 | `capacity` | integer | Y |  |  |
| 8 | `capacity_state` | text | N |  |  |
| 9 | `capacity_event_id` | uuid | Y |  | FK→`event` |
| 10 | `shortage` | integer | N |  |  |
| 11 | `evidence` | jsonb | N |  |  |
| 12 | `evidence_hash` | character varying(71) | N |  |  |

**FK**

- `fk_operational_exception_observation__capacity_event_id`: `FOREIGN KEY (capacity_event_id) REFERENCES cera.event(event_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_operational_exception_observation__exception_id`: `FOREIGN KEY (exception_id) REFERENCES cera.operational_exception(exception_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_operational_exception_observation__capacity_state`: `CHECK ((capacity_state ~ '^[A-Z][A-Z_]*$'::text))`
- `ck_operational_exception_observation__evidence_hash`: `CHECK (((evidence_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_operational_exception_observation__kind`: `CHECK ((kind = ANY (ARRAY['DETECTED'::text, 'CHANGED'::text, 'RESOLVED'::text, 'INDETERMINATE'::text])))`
- `ck_operational_exception_observation__numbers`: `CHECK (((scheduled_demand >= 0) AND ((capacity IS NULL) OR (capacity >= 0)) AND (shortage >= 0)))`

**INDEX**

- `ix_operational_exception_observation__exception_id`: `btree (exception_id, observed_at)`

**TRIGGER**

- `tg_operational_exception_observation__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_operational_exception_observation__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## plan_follow_up

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `follow_up_id` | uuid | N |  | PK |
| 2 | `plan_id` | uuid | N |  | FK→`recovery_plan` |
| 3 | `action_key` | character varying(120) | N |  |  |
| 4 | `message_id` | uuid | N |  | FK→`comm_message` |
| 5 | `created_by_actor_id` | uuid | N |  | FK→`actor` |
| 6 | `created_at` | timestamp(3) with time zone | N |  |  |
| 7 | `follow_up_kind` | text | N | `'REQUEST'::text` |  |
| 8 | `refers_to_message_id` | uuid | Y |  | FK→`comm_message` |

**UNIQUE**

- `uq_plan_follow_up__message_id`: `UNIQUE (message_id)`
- `uq_plan_follow_up__plan_id__action_key`: `UNIQUE (plan_id, action_key)`

**FK**

- `fk_plan_follow_up__created_by_actor_id`: `FOREIGN KEY (created_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_plan_follow_up__message_id`: `FOREIGN KEY (message_id) REFERENCES cera.comm_message(message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_plan_follow_up__plan_id`: `FOREIGN KEY (plan_id) REFERENCES cera.recovery_plan(plan_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_plan_follow_up__refers_to_message_id`: `FOREIGN KEY (refers_to_message_id) REFERENCES cera.comm_message(message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_plan_follow_up__follow_up_kind`: `CHECK ((follow_up_kind = ANY (ARRAY['REQUEST'::text, 'CORRECTION'::text, 'CANCELLATION'::text])))`

**INDEX**

- `ix_plan_follow_up__plan_id`: `btree (plan_id)`

**TRIGGER**

- `tg_plan_follow_up__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_plan_follow_up__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## planning_container_record

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `record_id` | uuid | N |  | PK |
| 2 | `batch_id` | uuid | N |  | FK→`planning_input_batch` |
| 3 | `recovery_run_id` | uuid | Y |  | FK→`recovery_run` |
| 4 | `container_no` | character varying(11) | N |  |  |
| 5 | `container_id` | uuid | Y |  | FK→`container` |
| 6 | `size_type` | text | N |  |  |
| 7 | `carrier_code` | character varying(20) | N |  |  |
| 8 | `priority` | text | N |  |  |
| 9 | `lfd` | date | Y |  |  |
| 10 | `pickup_ready` | boolean | N |  |  |
| 11 | `current_terminal` | character varying(40) | N |  |  |
| 12 | `destination_facility_id` | uuid | N |  | FK→`facility` |
| 13 | `planned_day` | date | N |  |  |
| 14 | `planned_depart_hour` | integer | Y |  |  |
| 15 | `alternate_destination_allowed` | boolean | N |  |  |
| 16 | `record_status` | text | N |  |  |
| 17 | `row_no` | integer | N |  |  |
| 18 | `content_hash` | character varying(71) | N |  |  |
| 19 | `supersedes_record_id` | uuid | Y |  | FK→`planning_container_record` |
| 20 | `recorded_at` | timestamp(3) with time zone | N |  |  |

**UNIQUE**

- `uq_planning_container_record__supersedes_record_id`: `UNIQUE (supersedes_record_id)`

**FK**

- `fk_planning_container_record__batch_id`: `FOREIGN KEY (batch_id) REFERENCES cera.planning_input_batch(batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_planning_container_record__container_id`: `FOREIGN KEY (container_id) REFERENCES cera.container(container_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_planning_container_record__destination_facility_id`: `FOREIGN KEY (destination_facility_id) REFERENCES cera.facility(facility_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_planning_container_record__recovery_run_id`: `FOREIGN KEY (recovery_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_planning_container_record__supersedes_record_id`: `FOREIGN KEY (supersedes_record_id) REFERENCES cera.planning_container_record(record_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_planning_container_record__container_no`: `CHECK (((container_no)::text ~ '^[A-Z]{4}[0-9]{7}$'::text))`
- `ck_planning_container_record__content_hash`: `CHECK (((content_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_planning_container_record__planned_depart_hour`: `CHECK (((planned_depart_hour IS NULL) OR ((planned_depart_hour >= 0) AND (planned_depart_hour <= 23))))`
- `ck_planning_container_record__priority`: `CHECK ((priority = ANY (ARRAY['CRITICAL'::text, 'HIGH'::text, 'NORMAL'::text])))`
- `ck_planning_container_record__record_status`: `CHECK ((record_status = ANY (ARRAY['ACTIVE'::text, 'WITHDRAWN'::text])))`
- `ck_planning_container_record__size_type`: `CHECK ((size_type = ANY (ARRAY['20DRY'::text, '40DRY'::text, '40HC'::text, '20RF'::text, '40RF'::text, 'OTHER'::text])))`

**INDEX**

- `ix_planning_container_record__recovery_run_id`: `btree (recovery_run_id, container_no)`

**TRIGGER**

- `tg_planning_container_record__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_planning_container_record__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## planning_input_batch

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `batch_id` | uuid | N |  | PK |
| 2 | `input_kind` | text | N |  |  |
| 3 | `recovery_run_id` | uuid | Y |  | FK→`recovery_run` |
| 4 | `command_id` | uuid | N |  |  |
| 5 | `submitted_by_actor_id` | uuid | N |  | FK→`actor` |
| 6 | `source_type` | text | N |  |  |
| 7 | `source_label` | character varying(100) | Y |  |  |
| 8 | `content_hash` | character varying(71) | N |  |  |
| 9 | `row_count` | integer | N |  |  |
| 10 | `accepted_count` | integer | N |  |  |
| 11 | `unchanged_count` | integer | N |  |  |
| 12 | `submitted_at` | timestamp(3) with time zone | N |  |  |

**UNIQUE**

- `uq_planning_input_batch__submitted_by_actor_id__command_id`: `UNIQUE (submitted_by_actor_id, command_id)`

**FK**

- `fk_planning_input_batch__recovery_run_id`: `FOREIGN KEY (recovery_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_planning_input_batch__submitted_by_actor_id`: `FOREIGN KEY (submitted_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_planning_input_batch__content_hash`: `CHECK (((content_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_planning_input_batch__counts`: `CHECK (((row_count >= 0) AND (accepted_count >= 0) AND (unchanged_count >= 0) AND ((accepted_count + unchanged_count) = row_count)))`
- `ck_planning_input_batch__input_kind`: `CHECK ((input_kind = ANY (ARRAY['CONTAINERS'::text, 'RATES'::text, 'FACILITY_PROFILES'::text])))`
- `ck_planning_input_batch__run_scope`: `CHECK (((input_kind = 'CONTAINERS'::text) OR (recovery_run_id IS NULL)))`
- `ck_planning_input_batch__source_type`: `CHECK ((source_type = ANY (ARRAY['CSV'::text, 'ROWS'::text])))`

**TRIGGER**

- `tg_planning_input_batch__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_planning_input_batch__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## planning_snapshot

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `snapshot_id` | uuid | N |  | PK |
| 2 | `as_of` | timestamp(3) with time zone | N |  |  |
| 3 | `fact_fingerprint` | character varying(71) | N |  |  |
| 4 | `rule_version` | character varying(20) | N |  |  |
| 5 | `tariff_version` | character varying(20) | N |  |  |
| 6 | `policy_version` | character varying(20) | N |  |  |
| 7 | `scope_ref` | jsonb | Y |  |  |
| 8 | `contains_simulated` | boolean | N |  |  |
| 9 | `created_at` | timestamp(3) with time zone | N |  |  |
| 10 | `scenario_id` | uuid | Y |  | FK→`scenario` |

**UNIQUE**

- `uq_planning_snapshot__snapshot_id__contains_simulated`: `UNIQUE (snapshot_id, contains_simulated)`

**FK**

- `fk_planning_snapshot__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_planning_snapshot__fact_fingerprint`: `CHECK (((fact_fingerprint)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_planning_snapshot__scenario_simulated`: `CHECK (((scenario_id IS NULL) OR contains_simulated))`
- `ck_planning_snapshot__scope_ref_object`: `CHECK ((jsonb_typeof(scope_ref) = 'object'::text))`

**TRIGGER**

- `tg_planning_snapshot__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_planning_snapshot__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## public_data_fetch

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `fetch_id` | uuid | N |  | PK |
| 2 | `provider` | text | N |  |  |
| 3 | `dataset` | text | N |  |  |
| 4 | `operation` | character varying(100) | N |  |  |
| 5 | `request_params` | jsonb | N |  |  |
| 6 | `page_no` | integer | N |  |  |
| 7 | `mode` | text | N |  |  |
| 8 | `requested_at` | timestamp(3) with time zone | N |  |  |
| 9 | `received_at` | timestamp(3) with time zone | Y |  |  |
| 10 | `http_status` | integer | Y |  |  |
| 11 | `result_code` | character varying(20) | Y |  |  |
| 12 | `outcome` | text | N |  |  |
| 13 | `total_count` | integer | Y |  |  |
| 14 | `item_count` | integer | Y |  |  |
| 15 | `raw_input_id` | uuid | Y |  | FK→`raw_input` |
| 16 | `requested_by_actor_id` | uuid | N |  | FK→`actor` |
| 17 | `trace_id` | character varying(64) | Y |  |  |
| 18 | `is_simulated` | boolean | N |  | FK→`raw_input` |

**UNIQUE**

- `uq_public_data_fetch__raw_input_id`: `UNIQUE (raw_input_id)`

**FK**

- `fk_public_data_fetch__raw_input_id__is_simulated`: `FOREIGN KEY (raw_input_id, is_simulated) REFERENCES cera.raw_input(raw_input_id, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_public_data_fetch__requested_by_actor_id`: `FOREIGN KEY (requested_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_public_data_fetch__dataset`: `CHECK ((dataset = ANY (ARRAY['MOF_VESSEL_CALL'::text, 'MOF_CONTAINER_MANIFEST'::text])))`
- `ck_public_data_fetch__mode`: `CHECK ((mode = ANY (ARRAY['LIVE'::text, 'REPLAY'::text])))`
- `ck_public_data_fetch__outcome`: `CHECK ((outcome = ANY (ARRAY['SUCCESS'::text, 'NO_DATA'::text, 'UPSTREAM_ERROR'::text, 'TRANSPORT_ERROR'::text, 'PARSE_ERROR'::text])))`
- `ck_public_data_fetch__page_no`: `CHECK ((page_no >= 1))`
- `ck_public_data_fetch__provider`: `CHECK ((provider = ANY (ARRAY['DATA_GO_KR'::text, 'UNIPASS'::text])))`
- `ck_public_data_fetch__received_after_requested`: `CHECK (((received_at IS NULL) OR (received_at >= requested_at)))`
- `ck_public_data_fetch__replay_is_simulated`: `CHECK (((mode = 'REPLAY'::text) = is_simulated))`
- `ck_public_data_fetch__request_params_object`: `CHECK ((jsonb_typeof(request_params) = 'object'::text))`
- `ck_public_data_fetch__transport_error_shape`: `CHECK (((outcome = 'TRANSPORT_ERROR'::text) = ((raw_input_id IS NULL) AND (received_at IS NULL))))`

**INDEX**

- `ix_public_data_fetch__requested_at`: `btree (requested_at)`

**TRIGGER**

- `tg_public_data_fetch__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_public_data_fetch__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## question_item

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `question_item_id` | uuid | N |  | PK |
| 2 | `thread_id` | uuid | N |  | FK→`comm_thread` |
| 3 | `ask_id` | character varying(40) | N |  |  |
| 4 | `question_type` | text | N |  |  |
| 5 | `question_text` | text | N |  |  |
| 6 | `target_entity_type` | text | Y |  |  |
| 7 | `target_entity_id` | uuid | Y |  |  |
| 8 | `target_fact_key` | character varying(120) | Y |  |  |
| 9 | `target_applicability_scope_type` | text | Y |  |  |
| 10 | `target_applicability_scope_ref` | character varying(60) | Y |  |  |
| 11 | `expected_value_type` | text | N |  |  |
| 12 | `expected_unit` | text | Y |  |  |
| 13 | `verification_request_key` | character varying(71) | Y |  |  |
| 14 | `question_status` | text | N |  |  |
| 15 | `is_simulated` | boolean | N |  |  |

**UNIQUE**

- `uq_question_item__thread_id__ask_id`: `UNIQUE (thread_id, ask_id)`

**FK**

- `fk_question_item__thread_id`: `FOREIGN KEY (thread_id) REFERENCES cera.comm_thread(thread_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_question_item__expected_unit`: `CHECK ((expected_unit ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_question_item__expected_value_type`: `CHECK ((expected_value_type = ANY (ARRAY['NUMBER'::text, 'TIMESTAMP'::text, 'CODE'::text, 'TEXT'::text, 'BOOLEAN'::text])))`
- `ck_question_item__question_status`: `CHECK ((question_status = ANY (ARRAY['DRAFTED'::text, 'SENT'::text, 'ANSWERED'::text, 'UNANSWERED'::text, 'CANCELLED'::text])))`
- `ck_question_item__question_type`: `CHECK ((question_type = ANY (ARRAY['CAPACITY'::text, 'RATE'::text, 'SLOT'::text, 'CONFIRM_FACT'::text, 'FREE_TEXT'::text])))`
- `ck_question_item__target_all_or_none`: `CHECK ((num_nonnulls(target_entity_type, target_entity_id, target_fact_key, target_applicability_scope_type, target_applicability_scope_ref) = ANY (ARRAY[0, 5])))`
- `ck_question_item__target_applicability_scope_type`: `CHECK ((target_applicability_scope_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_question_item__target_entity_type`: `CHECK ((target_entity_type = ANY (ARRAY['CONTAINER'::text, 'BL'::text, 'FACILITY'::text, 'COUNTERPARTY'::text, 'TRUCK_POOL'::text, 'VESSEL_CALL'::text])))`
- `ck_question_item__target_scope_global_empty`: `CHECK (((target_applicability_scope_type IS NULL) OR ((target_applicability_scope_type = 'GLOBAL'::text) = ((target_applicability_scope_ref)::text = ''::text))))`
- `ck_question_item__verification_request_key`: `CHECK (((verification_request_key)::text ~ '^sha256:[0-9a-f]{64}$'::text))`

**INDEX**

- `ix_question_item__verification_request_key`: `btree (verification_request_key) WHERE (verification_request_key IS NOT NULL)`

**TRIGGER**

- `tg_question_item__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_question_item__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`
- `tg_question_item__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## raw_input

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `raw_input_id` | uuid | N |  | PK |
| 2 | `source_type` | text | N |  |  |
| 3 | `source_name` | character varying(60) | N |  |  |
| 4 | `request_ref` | character varying(300) | Y |  |  |
| 5 | `payload_ref` | character varying(300) | Y |  |  |
| 6 | `payload_hash` | character varying(71) | N |  |  |
| 7 | `attachment_manifest` | jsonb | Y |  |  |
| 8 | `source_record_key` | character varying(200) | Y |  |  |
| 9 | `source_recorded_at` | timestamp(3) with time zone | Y |  |  |
| 10 | `received_at` | timestamp(3) with time zone | N |  |  |
| 11 | `collected_by_actor_id` | uuid | Y |  | FK→`actor` |
| 12 | `is_simulated` | boolean | N |  |  |

**UNIQUE**

- `uq_raw_input__raw_input_id__is_simulated`: `UNIQUE (raw_input_id, is_simulated)`
- `uq_raw_input__source_name__source_record_key`: `UNIQUE (source_name, source_record_key)`

**FK**

- `fk_raw_input__collected_by_actor_id`: `FOREIGN KEY (collected_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_raw_input__attachment_manifest_array`: `CHECK ((jsonb_typeof(attachment_manifest) = 'array'::text))`
- `ck_raw_input__email_recorded_before_received`: `CHECK (((source_type <> 'EMAIL'::text) OR (source_recorded_at IS NULL) OR (source_recorded_at <= received_at)))`
- `ck_raw_input__payload_hash`: `CHECK (((payload_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_raw_input__payload_ref`: `CHECK (((payload_ref)::text ~ '^cref:v1:RAW_INPUT_PAYLOAD:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text))`
- `ck_raw_input__source_type`: `CHECK ((source_type = ANY (ARRAY['HUMAN_UI'::text, 'FILE_IMPORT'::text, 'EMAIL'::text, 'DOCUMENT'::text, 'PUBLIC_API'::text, 'PARTNER_SYSTEM'::text, 'INFERENCE'::text])))`

**INDEX**

- `ix_raw_input__received_at`: `btree (received_at)`

**TRIGGER**

- `tg_raw_input__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_raw_input__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## recovery_plan

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `plan_id` | uuid | N |  | PK |
| 2 | `case_run_id` | uuid | N |  | FK→`recovery_run` |
| 3 | `snapshot_id` | uuid | N |  | FK→`planning_snapshot` |
| 4 | `version` | integer | N |  |  |
| 5 | `plan_status` | text | N |  |  |
| 6 | `solver_status` | text | N |  |  |
| 7 | `solver_version` | character varying(40) | N |  |  |
| 8 | `input_hash` | character varying(71) | N |  |  |
| 9 | `plan_hash` | character varying(71) | N |  |  |
| 10 | `objective_krw` | bigint | Y |  |  |
| 11 | `base_cost_krw` | bigint | Y |  |  |
| 12 | `risk_penalty_krw` | bigint | Y |  |  |
| 13 | `baseline_total_krw` | bigint | N |  |  |
| 14 | `baseline_base_cost_krw` | bigint | N |  |  |
| 15 | `saving_krw` | bigint | Y |  |  |
| 16 | `base_saving_krw` | bigint | Y |  |  |
| 17 | `candidate_count` | integer | N |  |  |
| 18 | `result` | jsonb | N |  |  |
| 19 | `cost_ms` | integer | N |  |  |
| 20 | `solve_ms` | integer | N |  |  |
| 21 | `outdated_reasons` | jsonb | Y |  |  |
| 22 | `outdated_at` | timestamp(3) with time zone | Y |  |  |
| 23 | `superseded_by_plan_id` | uuid | Y |  | FK→`recovery_plan` |
| 24 | `approved_by_actor_id` | uuid | Y |  | FK→`actor` |
| 25 | `approved_at` | timestamp(3) with time zone | Y |  |  |
| 26 | `created_by_actor_id` | uuid | N |  | FK→`actor` |
| 27 | `agent_run_id` | uuid | Y |  | FK→`agent_run` |
| 28 | `contains_simulated` | boolean | N |  | FK→`planning_snapshot` |
| 29 | `scenario_id` | uuid | Y |  | FK→`scenario` |
| 30 | `created_at` | timestamp(3) with time zone | N |  |  |
| 31 | `updated_at` | timestamp(3) with time zone | N |  |  |

**UNIQUE**

- `uq_recovery_plan__case_run_id__version`: `UNIQUE (case_run_id, version)`

**FK**

- `fk_recovery_plan__agent_run_id`: `FOREIGN KEY (agent_run_id) REFERENCES cera.agent_run(agent_run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_recovery_plan__approved_by_actor_id`: `FOREIGN KEY (approved_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_recovery_plan__case_run_id`: `FOREIGN KEY (case_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_recovery_plan__created_by_actor_id`: `FOREIGN KEY (created_by_actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_recovery_plan__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_recovery_plan__snapshot_id__contains_simulated`: `FOREIGN KEY (snapshot_id, contains_simulated) REFERENCES cera.planning_snapshot(snapshot_id, contains_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_recovery_plan__superseded_by_plan_id`: `FOREIGN KEY (superseded_by_plan_id) REFERENCES cera.recovery_plan(plan_id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED`

**CHECK**

- `ck_recovery_plan__amounts`: `CHECK ((((objective_krw IS NULL) OR (objective_krw >= 0)) AND ((base_cost_krw IS NULL) OR (base_cost_krw >= 0)) AND ((risk_penalty_krw IS NULL) OR (risk_penalty_krw >= 0)) AND (baseline_total_krw >= 0) AND (baseline_base_cost_krw >= 0)))`
- `ck_recovery_plan__approved_shape`: `CHECK (((approved_by_actor_id IS NULL) = (approved_at IS NULL)))`
- `ck_recovery_plan__approved_status`: `CHECK (((plan_status <> 'APPROVED'::text) OR (approved_by_actor_id IS NOT NULL)))`
- `ck_recovery_plan__infeasible_status`: `CHECK ((((plan_status <> 'INFEASIBLE'::text) OR (objective_krw IS NULL)) AND ((plan_status <> ALL (ARRAY['PROPOSED'::text, 'APPROVED'::text])) OR (objective_krw IS NOT NULL))))`
- `ck_recovery_plan__input_hash`: `CHECK (((input_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_recovery_plan__objective_shape`: `CHECK (((solver_status = ANY (ARRAY['OPTIMAL'::text, 'FEASIBLE'::text, 'TIME_LIMIT'::text])) = (objective_krw IS NOT NULL)))`
- `ck_recovery_plan__outdated_reasons_array`: `CHECK ((jsonb_typeof(outdated_reasons) = 'array'::text))`
- `ck_recovery_plan__outdated_shape`: `CHECK (((outdated_at IS NULL) = (outdated_reasons IS NULL)))`
- `ck_recovery_plan__plan_hash`: `CHECK (((plan_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_recovery_plan__plan_status`: `CHECK ((plan_status = ANY (ARRAY['PROPOSED'::text, 'APPROVED'::text, 'SUPERSEDED'::text, 'OUTDATED'::text, 'INFEASIBLE'::text])))`
- `ck_recovery_plan__result_object`: `CHECK ((jsonb_typeof(result) = 'object'::text))`
- `ck_recovery_plan__scenario_simulated`: `CHECK (((scenario_id IS NULL) OR contains_simulated))`
- `ck_recovery_plan__solver_status`: `CHECK ((solver_status = ANY (ARRAY['OPTIMAL'::text, 'FEASIBLE'::text, 'INFEASIBLE'::text, 'TIME_LIMIT'::text, 'ERROR'::text])))`
- `ck_recovery_plan__superseded_not_self`: `CHECK ((superseded_by_plan_id <> plan_id))`
- `ck_recovery_plan__superseded_shape`: `CHECK (((plan_status = 'SUPERSEDED'::text) = (superseded_by_plan_id IS NOT NULL)))`
- `ck_recovery_plan__timings`: `CHECK (((cost_ms >= 0) AND (solve_ms >= 0) AND (candidate_count >= 0)))`
- `ck_recovery_plan__version`: `CHECK ((version >= 1))`

**INDEX**

- `ix_recovery_plan__agent_run_id`: `btree (agent_run_id)`
- `ix_recovery_plan__snapshot_id`: `btree (snapshot_id)`
- `uq_recovery_plan__case_run_id__current`: `btree (case_run_id) WHERE (plan_status = ANY (ARRAY['PROPOSED'::text, 'APPROVED'::text]))` (UNIQUE)

**TRIGGER**

- `tg_recovery_plan__guard` — BEFORE INSERT/UPDATE → `fn_cera_guard_recovery_plan`
- `tg_recovery_plan__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_recovery_plan__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`
- `tg_recovery_plan__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## recovery_plan_item

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `plan_id` | uuid | N |  | PK FK→`recovery_plan` |
| 2 | `container_ref` | character varying(40) | N |  | PK |
| 3 | `action` | text | N |  |  |
| 4 | `target_ref` | character varying(60) | N |  |  |
| 5 | `destination_ref` | character varying(60) | N |  |  |
| 6 | `delivery_day` | date | N |  |  |
| 7 | `scheduled_at` | timestamp(3) with time zone | Y |  |  |
| 8 | `truck_ref` | character varying(120) | Y |  |  |
| 9 | `base_cost_krw` | bigint | N |  |  |
| 10 | `risk_penalty_krw` | bigint | N |  |  |
| 11 | `total_krw` | bigint | N |  |  |
| 12 | `detail` | jsonb | N |  |  |

**FK**

- `fk_recovery_plan_item__plan_id`: `FOREIGN KEY (plan_id) REFERENCES cera.recovery_plan(plan_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_recovery_plan_item__action`: `CHECK ((action = ANY (ARRAY['KEEP_CURRENT_PLAN'::text, 'MOVE_TO_WAREHOUSE'::text, 'MOVE_TO_ODCY'::text, 'WAIT_AT_TERMINAL'::text])))`
- `ck_recovery_plan_item__amounts`: `CHECK (((base_cost_krw >= 0) AND (risk_penalty_krw >= 0) AND (total_krw = (base_cost_krw + risk_penalty_krw))))`
- `ck_recovery_plan_item__detail_object`: `CHECK ((jsonb_typeof(detail) = 'object'::text))`

**TRIGGER**

- `tg_recovery_plan_item__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_recovery_plan_item__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## recovery_run

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `run_id` | uuid | N |  | PK |
| 2 | `snapshot_id` | uuid | N |  | FK→`planning_snapshot` |
| 3 | `trigger_type` | text | N |  |  |
| 4 | `trigger_ref` | character varying(60) | Y |  |  |
| 5 | `previous_run_id` | uuid | Y |  | FK→`recovery_run` |
| 6 | `objective_version` | character varying(20) | N |  |  |
| 7 | `run_status` | text | N |  |  |
| 8 | `unmet_constraints` | jsonb | Y |  |  |
| 9 | `total_cost_krw` | bigint | Y |  |  |
| 10 | `solve_ms` | integer | Y |  |  |
| 11 | `contains_simulated` | boolean | N |  | FK→`planning_snapshot` |
| 12 | `executed_at` | timestamp(3) with time zone | N |  |  |

**FK**

- `fk_recovery_run__previous_run_id`: `FOREIGN KEY (previous_run_id) REFERENCES cera.recovery_run(run_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_recovery_run__snapshot_id__contains_simulated`: `FOREIGN KEY (snapshot_id, contains_simulated) REFERENCES cera.planning_snapshot(snapshot_id, contains_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_recovery_run__infeasible_unmet`: `CHECK (((run_status <> 'INFEASIBLE'::text) OR (unmet_constraints IS NOT NULL)))`
- `ck_recovery_run__previous_not_self`: `CHECK ((previous_run_id <> run_id))`
- `ck_recovery_run__run_status`: `CHECK ((run_status = ANY (ARRAY['FEASIBLE'::text, 'INFEASIBLE'::text, 'TIMEOUT'::text, 'ERROR'::text])))`
- `ck_recovery_run__solve_ms`: `CHECK ((solve_ms >= 0))`
- `ck_recovery_run__total_cost_krw`: `CHECK ((total_cost_krw >= 0))`
- `ck_recovery_run__trigger_type`: `CHECK ((trigger_type = ANY (ARRAY['EXCEPTION_DETECTED'::text, 'OPERATOR_REQUEST'::text, 'FACT_CORRECTION'::text, 'CONSTRAINT_CHANGE'::text, 'REPLY_RECEIVED'::text, 'SCHEDULED'::text])))`
- `ck_recovery_run__unmet_constraints_array`: `CHECK ((jsonb_typeof(unmet_constraints) = 'array'::text))`

**INDEX**

- `ix_recovery_run__previous_run_id`: `btree (previous_run_id)`
- `ix_recovery_run__snapshot_id`: `btree (snapshot_id)`

**TRIGGER**

- `tg_recovery_run__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_recovery_run__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## scenario

- 변경 정책: 갱신 가능 · 삭제 불가 · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `scenario_id` | uuid | N |  | PK |
| 2 | `scenario_name` | character varying(100) | N |  |  |
| 3 | `description` | character varying(300) | Y |  |  |
| 4 | `data_pack_ref` | character varying(300) | Y |  |  |
| 5 | `as_of_base` | timestamp(3) with time zone | N |  |  |
| 6 | `created_at` | timestamp(3) with time zone | N |  |  |
| 7 | `is_active` | boolean | N | `true` |  |

**TRIGGER**

- `tg_scenario__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## send_attempt

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `send_attempt_id` | uuid | N |  | PK |
| 2 | `message_id` | uuid | N |  | FK→`message_approval`,`comm_message` |
| 3 | `approval_id` | uuid | Y |  | FK→`message_approval` |
| 4 | `attempt_no` | integer | N |  |  |
| 5 | `idempotency_key` | character varying(71) | N |  |  |
| 6 | `channel_connection_id` | uuid | Y |  |  |
| 7 | `sent_content_hash` | character varying(71) | N |  |  |
| 8 | `started_at` | timestamp(3) with time zone | N |  |  |
| 9 | `finished_at` | timestamp(3) with time zone | Y |  |  |
| 10 | `result` | text | Y |  |  |
| 11 | `error_code` | text | Y |  |  |
| 12 | `error_message` | character varying(500) | Y |  |  |
| 13 | `provider_message_id` | character varying(200) | Y |  |  |
| 14 | `is_simulated` | boolean | N |  | FK→`comm_message` |

**UNIQUE**

- `uq_send_attempt__idempotency_key`: `UNIQUE (idempotency_key)`
- `uq_send_attempt__message_id__attempt_no`: `UNIQUE (message_id, attempt_no)`
- `uq_send_attempt__send_attempt_id__message_id`: `UNIQUE (send_attempt_id, message_id)`

**FK**

- `fk_send_attempt__approval_id__message_id`: `FOREIGN KEY (approval_id, message_id) REFERENCES cera.message_approval(approval_id, message_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_send_attempt__message_id__is_simulated`: `FOREIGN KEY (message_id, is_simulated) REFERENCES cera.comm_message(message_id, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_send_attempt__attempt_no`: `CHECK ((attempt_no >= 1))`
- `ck_send_attempt__error_code`: `CHECK ((error_code ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_send_attempt__finished_after_started`: `CHECK (((finished_at IS NULL) OR (finished_at >= started_at)))`
- `ck_send_attempt__idempotency_key`: `CHECK (((idempotency_key)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_send_attempt__p0_no_channel_connection`: `CHECK ((channel_connection_id IS NULL))`
- `ck_send_attempt__result`: `CHECK ((result = ANY (ARRAY['SUCCESS'::text, 'RETRYABLE_FAILURE'::text, 'PERMANENT_FAILURE'::text, 'UNKNOWN'::text])))`
- `ck_send_attempt__result_finished_pair`: `CHECK (((result IS NULL) = (finished_at IS NULL)))`
- `ck_send_attempt__sent_content_hash`: `CHECK (((sent_content_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_send_attempt__success_no_error`: `CHECK (((result <> 'SUCCESS'::text) OR (error_code IS NULL)))`
- `ck_send_attempt__success_provider_id`: `CHECK (((result <> 'SUCCESS'::text) OR (provider_message_id IS NOT NULL)))`

**INDEX**

- `ix_send_attempt__message_id`: `btree (message_id)`
- `ix_send_attempt__pending`: `btree (started_at) WHERE (result IS NULL)`
- `ix_send_attempt__provider_message_id`: `btree (provider_message_id) WHERE (provider_message_id IS NOT NULL)`
- `uq_send_attempt__message_id__success`: `btree (message_id) WHERE (result = 'SUCCESS'::text)` (UNIQUE)
- `uq_send_attempt__message_id__unresolved`: `btree (message_id) WHERE ((result IS NULL) OR (result = 'UNKNOWN'::text))` (UNIQUE)

**TRIGGER**

- `tg_send_attempt__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_send_attempt__guard_insert` — BEFORE INSERT → `fn_cera_guard_send_attempt_insert`
- `tg_send_attempt__guard_result` — BEFORE UPDATE → `fn_cera_guard_send_attempt_result`
- `tg_send_attempt__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`
- `tg_send_attempt__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## system_error

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `error_id` | uuid | N |  | PK |
| 2 | `occurred_at` | timestamp(3) with time zone | N |  |  |
| 3 | `service_name` | character varying(60) | N |  |  |
| 4 | `component_name` | character varying(100) | N |  |  |
| 5 | `operation_name` | character varying(100) | N |  |  |
| 6 | `error_boundary` | text | N |  |  |
| 7 | `error_category` | text | N |  |  |
| 8 | `error_code` | character varying(60) | N |  |  |
| 9 | `safe_error_message` | character varying(500) | N |  |  |
| 10 | `exception_type` | character varying(200) | Y |  |  |
| 11 | `request_id` | character varying(64) | Y |  |  |
| 12 | `trace_id` | character varying(64) | Y |  |  |
| 13 | `target_system` | text | Y |  |  |
| 14 | `http_status` | integer | Y |  |  |
| 15 | `retryable` | boolean | N |  |  |
| 16 | `related_entity_type` | text | Y |  |  |
| 17 | `related_entity_id` | character varying(40) | Y |  |  |
| 18 | `raw_log_ref` | character varying(300) | Y |  |  |
| 19 | `is_simulated` | boolean | N |  |  |
| 20 | `scenario_id` | uuid | Y |  | FK→`scenario` |

**FK**

- `fk_system_error__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_system_error__error_boundary`: `CHECK ((error_boundary = ANY (ARRAY['API_REQUEST'::text, 'INTEGRATION'::text, 'BACKGROUND_JOB'::text])))`
- `ck_system_error__error_category`: `CHECK ((error_category ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_system_error__http_status`: `CHECK (((http_status >= 100) AND (http_status <= 599)))`
- `ck_system_error__related_entity_pair`: `CHECK (((related_entity_type IS NULL) = (related_entity_id IS NULL)))`
- `ck_system_error__related_entity_type`: `CHECK ((related_entity_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_system_error__s2_simulated_scenario`: `CHECK ((is_simulated = (scenario_id IS NOT NULL)))`
- `ck_system_error__target_system`: `CHECK ((target_system ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`

**INDEX**

- `ix_system_error__error_code__occurred_at`: `btree (error_code, occurred_at)`
- `ix_system_error__occurred_at`: `btree (occurred_at)`
- `ix_system_error__related_entity`: `btree (related_entity_type, related_entity_id)`
- `ix_system_error__trace_id`: `btree (trace_id) WHERE (trace_id IS NOT NULL)`

**TRIGGER**

- `tg_system_error__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_system_error__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## tariff_rate

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `rate_id` | uuid | N |  | PK |
| 2 | `batch_id` | uuid | N |  | FK→`planning_input_batch` |
| 3 | `rate_type` | text | N |  |  |
| 4 | `carrier_code` | character varying(20) | Y |  |  |
| 5 | `from_ref` | character varying(60) | Y |  |  |
| 6 | `to_ref` | character varying(60) | Y |  |  |
| 7 | `size_type` | text | Y |  |  |
| 8 | `amount` | bigint | N |  |  |
| 9 | `unit` | text | N |  |  |
| 10 | `effective_from` | date | N |  |  |
| 11 | `effective_until` | date | Y |  |  |
| 12 | `source_note` | character varying(200) | N |  |  |
| 13 | `record_status` | text | N |  |  |
| 14 | `row_no` | integer | N |  |  |
| 15 | `content_hash` | character varying(71) | N |  |  |
| 16 | `supersedes_rate_id` | uuid | Y |  | FK→`tariff_rate` |
| 17 | `recorded_at` | timestamp(3) with time zone | N |  |  |

**UNIQUE**

- `uq_tariff_rate__supersedes_rate_id`: `UNIQUE (supersedes_rate_id)`

**FK**

- `fk_tariff_rate__batch_id`: `FOREIGN KEY (batch_id) REFERENCES cera.planning_input_batch(batch_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_tariff_rate__supersedes_rate_id`: `FOREIGN KEY (supersedes_rate_id) REFERENCES cera.tariff_rate(rate_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_tariff_rate__amount`: `CHECK ((amount >= 0))`
- `ck_tariff_rate__content_hash`: `CHECK (((content_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_tariff_rate__period`: `CHECK (((effective_until IS NULL) OR (effective_until >= effective_from)))`
- `ck_tariff_rate__rate_type`: `CHECK ((rate_type = ANY (ARRAY['DEMURRAGE_PER_DAY'::text, 'TERMINAL_STORAGE_PER_DAY'::text, 'DETENTION_FREE_DAYS'::text, 'TRANSPORT'::text, 'ODCY_HANDLING_IN_OUT'::text, 'ODCY_STORAGE_PER_DAY'::text])))`
- `ck_tariff_rate__record_status`: `CHECK ((record_status = ANY (ARRAY['ACTIVE'::text, 'WITHDRAWN'::text])))`
- `ck_tariff_rate__size_type`: `CHECK ((size_type = ANY (ARRAY['20DRY'::text, '40DRY'::text, '40HC'::text, '20RF'::text, '40RF'::text, 'OTHER'::text])))`
- `ck_tariff_rate__unit`: `CHECK ((unit = ANY (ARRAY['KRW'::text, 'DAY'::text])))`

**INDEX**

- `ix_tariff_rate__rate_type`: `btree (rate_type, effective_from)`

**TRIGGER**

- `tg_tariff_rate__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_tariff_rate__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## truck_pool

- 변경 정책: 갱신 가능 · 삭제 불가 · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `truck_pool_id` | uuid | N |  | PK |
| 2 | `pool_name` | character varying(100) | N |  |  |
| 3 | `ownership` | text | N |  |  |
| 4 | `owner_counterparty_id` | uuid | Y |  | FK→`counterparty` |
| 5 | `is_active` | boolean | N | `true` |  |

**FK**

- `fk_truck_pool__owner_counterparty_id`: `FOREIGN KEY (owner_counterparty_id) REFERENCES cera.counterparty(counterparty_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_truck_pool__ownership`: `CHECK ((ownership = ANY (ARRAY['OWN'::text, 'PARTNER'::text])))`

**INDEX**

- `ix_truck_pool__owner_counterparty_id`: `btree (owner_counterparty_id)`

**TRIGGER**

- `tg_truck_pool__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## user_account

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `user_id` | uuid | N |  | PK |
| 2 | `actor_id` | uuid | N |  | FK→`actor` |
| 3 | `login_id` | character varying(60) | N |  |  |
| 4 | `role` | text | N |  |  |
| 5 | `password_hash` | character varying(200) | N |  |  |
| 6 | `is_active` | boolean | N | `true` |  |
| 7 | `created_at` | timestamp(3) with time zone | N |  |  |
| 8 | `updated_at` | timestamp(3) with time zone | N |  |  |

**UNIQUE**

- `uq_user_account__actor_id`: `UNIQUE (actor_id)`
- `uq_user_account__login_id`: `UNIQUE (login_id)`

**FK**

- `fk_user_account__actor_id`: `FOREIGN KEY (actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_user_account__login_id_format`: `CHECK (((login_id)::text ~ '^[a-z0-9][a-z0-9._@-]{2,59}$'::text))`
- `ck_user_account__password_hash_format`: `CHECK (((password_hash)::text ~ '^scrypt[$][0-9]+[$][0-9]+[$][0-9]+[$][A-Za-z0-9_-]+[$][A-Za-z0-9_-]+$'::text))`
- `ck_user_account__role`: `CHECK ((role = ANY (ARRAY['ADMIN'::text, 'OPERATOR'::text, 'FIELD_OPERATOR'::text, 'DEMO_VISITOR'::text])))`
- `ck_user_account__updated_after_created`: `CHECK ((updated_at >= created_at))`

**TRIGGER**

- `tg_user_account__guard` — BEFORE INSERT → `fn_cera_guard_user_account`
- `tg_user_account__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_user_account__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`
- `tg_user_account__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## user_session

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `session_id` | uuid | N |  | PK |
| 2 | `user_id` | uuid | N |  | FK→`user_account` |
| 3 | `token_hash` | character varying(71) | N |  |  |
| 4 | `created_at` | timestamp(3) with time zone | N |  |  |
| 5 | `expires_at` | timestamp(3) with time zone | N |  |  |
| 6 | `revoked_at` | timestamp(3) with time zone | Y |  |  |

**UNIQUE**

- `uq_user_session__token_hash`: `UNIQUE (token_hash)`

**FK**

- `fk_user_session__user_id`: `FOREIGN KEY (user_id) REFERENCES cera.user_account(user_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_user_session__expires_after_created`: `CHECK ((expires_at > created_at))`
- `ck_user_session__revoked_after_created`: `CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at)))`
- `ck_user_session__token_hash`: `CHECK (((token_hash)::text ~ '^sha256:[0-9a-f]{64}$'::text))`

**INDEX**

- `ix_user_session__user_id`: `btree (user_id)`

**TRIGGER**

- `tg_user_session__guard` — BEFORE UPDATE → `fn_cera_guard_user_session`
- `tg_user_session__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_user_session__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`
- `tg_user_session__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## verification_request

- 변경 정책: 갱신 · 삭제 가능 · 앱 역할 권한: DELETE,INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `verification_request_id` | uuid | N |  | PK |
| 2 | `request_key` | character varying(71) | N |  |  |
| 3 | `trigger_rule` | text | N |  |  |
| 4 | `entity_type` | text | N |  |  |
| 5 | `entity_id` | uuid | N |  |  |
| 6 | `fact_key` | character varying(120) | N |  |  |
| 7 | `applicability_scope_type` | text | N |  |  |
| 8 | `applicability_scope_ref` | character varying(60) | N | `''::character varying` |  |
| 9 | `conflict_id` | uuid | Y |  | FK→`conflict` |
| 10 | `priority` | text | N |  |  |
| 11 | `blocks_automation` | boolean | N |  |  |
| 12 | `computed_as_of` | timestamp(3) with time zone | N |  |  |
| 13 | `computed_at` | timestamp(3) with time zone | N |  |  |
| 14 | `current_status` | text | N |  |  |
| 15 | `is_simulated` | boolean | N |  |  |
| 16 | `scenario_id` | uuid | Y |  | FK→`scenario` |

**UNIQUE**

- `uq_verification_request__request_key`: `UNIQUE (request_key)`

**FK**

- `fk_verification_request__conflict_id`: `FOREIGN KEY (conflict_id) REFERENCES cera.conflict(conflict_id) ON UPDATE RESTRICT ON DELETE SET NULL`
- `fk_verification_request__scenario_id`: `FOREIGN KEY (scenario_id) REFERENCES cera.scenario(scenario_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_verification_request__applicability_scope_type`: `CHECK ((applicability_scope_type ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_verification_request__current_status`: `CHECK ((current_status ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_verification_request__entity_type`: `CHECK ((entity_type = ANY (ARRAY['CONTAINER'::text, 'BL'::text, 'FACILITY'::text, 'COUNTERPARTY'::text, 'TRUCK_POOL'::text, 'VESSEL_CALL'::text])))`
- `ck_verification_request__priority`: `CHECK ((priority ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`
- `ck_verification_request__request_key`: `CHECK (((request_key)::text ~ '^sha256:[0-9a-f]{64}$'::text))`
- `ck_verification_request__s2_simulated_scenario`: `CHECK ((is_simulated = (scenario_id IS NOT NULL)))`
- `ck_verification_request__scope_global_empty`: `CHECK (((applicability_scope_type = 'GLOBAL'::text) = ((applicability_scope_ref)::text = ''::text)))`
- `ck_verification_request__trigger_rule`: `CHECK ((trigger_rule ~ '^[A-Z0-9][A-Z0-9_]*$'::text))`

**INDEX**

- `ix_verification_request__coordinate`: `btree (entity_type, entity_id, fact_key, applicability_scope_type, applicability_scope_ref)`
- `ix_verification_request__current_status`: `btree (current_status)`

## verification_request_handling

- 변경 정책: append-only (UPDATE · DELETE 거부) · 앱 역할 권한: INSERT,SELECT

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `handling_id` | uuid | N |  | PK |
| 2 | `request_key` | character varying(71) | N |  |  |
| 3 | `handling_type` | text | N |  |  |
| 4 | `actor_id` | uuid | N |  | FK→`actor` |
| 5 | `handled_at` | timestamp(3) with time zone | N |  |  |
| 6 | `note` | character varying(500) | Y |  |  |
| 7 | `question_item_id` | uuid | Y |  | FK→`question_item` |
| 8 | `resolving_event_id` | uuid | Y |  | FK→`event` |
| 9 | `is_simulated` | boolean | N |  |  |

**FK**

- `fk_verification_request_handling__actor_id`: `FOREIGN KEY (actor_id) REFERENCES cera.actor(actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_verification_request_handling__question_item_id`: `FOREIGN KEY (question_item_id) REFERENCES cera.question_item(question_item_id) ON UPDATE RESTRICT ON DELETE RESTRICT`
- `fk_verification_request_handling__resolving_event_id`: `FOREIGN KEY (resolving_event_id) REFERENCES cera.event(event_id) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_verification_request_handling__handling_type`: `CHECK ((handling_type = ANY (ARRAY['ACKNOWLEDGED'::text, 'ASSIGNED'::text, 'ASKED_EXTERNAL'::text, 'RESOLVED'::text, 'DISMISSED'::text, 'SNOOZED'::text])))`
- `ck_verification_request_handling__request_key`: `CHECK (((request_key)::text ~ '^sha256:[0-9a-f]{64}$'::text))`

**INDEX**

- `ix_verification_request_handling__request_key__handled_at`: `btree (request_key, handled_at)`

**TRIGGER**

- `tg_verification_request_handling__append_only` — BEFORE UPDATE/DELETE → `fn_cera_reject_mutation`
- `tg_verification_request_handling__guard_insert` — BEFORE INSERT → `fn_cera_guard_handling_insert`
- `tg_verification_request_handling__no_truncate` — BEFORE TRUNCATE → `fn_cera_reject_truncate`

## vessel_call

- 변경 정책: 제한적 갱신 (정해진 컬럼만 · 한 번만 채움) · 앱 역할 권한: INSERT,SELECT,UPDATE

| # | 컬럼 | 타입 | NULL | Default | 키 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `vessel_call_id` | uuid | N |  | PK |
| 2 | `port_authority_code` | character varying(3) | N |  |  |
| 3 | `call_year` | integer | N |  |  |
| 4 | `call_seq` | integer | N |  |  |
| 5 | `call_sign` | character varying(10) | N |  |  |
| 6 | `vessel_name` | character varying(40) | Y |  |  |
| 7 | `first_raw_input_id` | uuid | N |  | FK→`raw_input` |
| 8 | `is_simulated` | boolean | N |  | FK→`raw_input` |
| 9 | `registered_at` | timestamp(3) with time zone | N |  |  |
| 10 | `is_active` | boolean | N | `true` |  |

**UNIQUE**

- `uq_vessel_call__port_year_seq_call_sign`: `UNIQUE (port_authority_code, call_year, call_seq, call_sign)`

**FK**

- `fk_vessel_call__first_raw_input_id__is_simulated`: `FOREIGN KEY (first_raw_input_id, is_simulated) REFERENCES cera.raw_input(raw_input_id, is_simulated) ON UPDATE RESTRICT ON DELETE RESTRICT`

**CHECK**

- `ck_vessel_call__call_seq`: `CHECK (((call_seq >= 0) AND (call_seq <= 999)))`
- `ck_vessel_call__call_sign`: `CHECK (((call_sign)::text ~ '^[A-Z0-9]{1,10}$'::text))`
- `ck_vessel_call__call_year`: `CHECK (((call_year >= 1990) AND (call_year <= 2999)))`
- `ck_vessel_call__port_authority_code`: `CHECK (((port_authority_code)::text ~ '^[0-9]{3}$'::text))`

**TRIGGER**

- `tg_vessel_call__guard_columns` — BEFORE UPDATE → `fn_cera_guard_columns`
- `tg_vessel_call__no_delete` — BEFORE DELETE → `fn_cera_reject_delete`

