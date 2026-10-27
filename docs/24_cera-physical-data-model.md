# 24. CERA 물리 데이터 모델 — Slice 1 P0 (PostgreSQL + Drizzle)

- 상태: **T-112 · T-113 · T-114(2026-10-26, DONE): Cost Engine · Solver · 복구 계획 — 표 2 추가(22.43 · 22.44 · M22 · M23 22.45, 표 40 → 42 · 컬럼 478 → 521). 구현 기록 18.17.** T-111(2026-10-26, DONE): 철회 · 신선도 · 직접 입력 · 날짜 계약 — 표 · 열 변경 없음, M21 가드 1(22.42). 구현 기록 18.16.** T-093(2026-10-26, DONE): 사실 파이프라인 — 표 · 열 변경 없음, M20 가드 3(22.41). 구현 기록 18.14.** T-104(2026-10-22, DONE) — Agent Runtime 3표 + `agent_run` 생애주기(22.36 · 22.38~22.40 · M18 · M19, 표 37 → 40 · 컬럼 434 → 478). 구현 기록 18.11.** T-103(2026-10-22) — Agent 기록 2표(22.36 · 22.37 · M16 · M17, 표 35 → 37 · 컬럼 406 → 434). 구현 기록 18.10.** T-102(2026-10-22) — 공공데이터 6표 추가(22.30~22.35 · M14 · M15, 표 29 → 35 · 컬럼 349 → 406). 구현 기록 18.9. 이전: **승인 — T-080 DONE (2026-09-22, 사용자 + ChatGPT 최종 승인)** (작성 Claude Code). 사용자 검토 결과를 반영했다 — **F-1~F-5 논리 모순은 `docs/22` rev.2.5 로 해소**, D-4 · D-5 보완, F-6~F-11 정리·기록(25절). **U1(T-086) 구현 확인 결과는 18.2**
- 기준: HEAD `4db8608` · 논리 모델 `docs/22` **rev.2.5** + 작업표 · 개념 모델 `docs/21`(승인, 변경 0) · **ADR-033**(NestJS · AI Server DB 권한 없음) · **ADR-034**(PostgreSQL · Drizzle SQL-aware Hybrid · drizzle-kit 검토 SQL migration · SQLite 미사용) · ADR-032(Q-44 · Q-45) · T-069 계획(5.1 P0 29 · 12 트랜잭션 · 13 멱등 · 17 인계 목록)
- 이 문서의 성격: **물리 설계(HOW to store)**. 논리 모델의 의미를 바꾸지 않는다. 논리 모델과 어긋나는 곳은 여기서 고치지 않고 **25절**에 적어 사용자 판단으로 올린다(이번 판단 결과도 25절)
- 짝 산출물: **`docs/24_cera-physical-data-model.xlsx`** — 22절 표를 컬럼 한 줄씩 본 검토용 작업표(자동 생성, 정본은 이 문서)

> **이 문서가 정하지 않는 것**: 실제 SQL(DDL · 트리거 · 인덱스 SQL) · Drizzle `schema.ts` · migration 파일 · PostgreSQL · Drizzle · Node/Nest 버전 · 연결 풀 패키지 · 로컬 PostgreSQL 실행 방식(Docker 여부) · 호스팅 · HA · 백업 · 내용 저장소 **제품** · 큐 제품 · P1 14 · DEFERRED 9 표의 물리 설계. SQL 과 스키마 코드는 **U0(T-085) · U1(T-086)** 이 이 문서를 보고 쓴다.

---

## 0. 한 장 요약

| 주제 | 결정 | 절 |
| --- | --- | --- |
| 범위 | P0 **29표 · 논리 컬럼 349개**(`docs/22` rev.2.5 기준 재계산) 전부 물리 매핑. 누락 0 · 이름 변경 0 · 새 컬럼 0 | 1 · 23 |
| ID | **UUIDv7, `uuid` 타입, Main Backend 가 생성**. 시드는 저장소 fixture 의 **고정된 유효 UUIDv7 값** | 4 |
| CODE | **ENUM 없음.** 고정 목록 → `text` + `CHECK IN (…)`(54컬럼) · 업무가 늘리는 코드 → `text` + 형식 CHECK + **Backend 카탈로그 한 곳**(27컬럼) · 규칙 id 2 · Slice 1 코드 표 없음 | 3 |
| 시각 | `timestamptz(3)` · 세션 UTC · DB 는 시각을 만들지 않는다 · Asia/Seoul 은 API 직렬화 · 메일 원래 두 시각은 `event.payload` | 5 |
| 금액·수치 | `bigint` → TS `bigint` → API 10진 정수 문자열. **JS `number` 로 암묵 변환 금지.** `numeric` 은 문자열 경계 | 6 |
| JSON | `jsonb` 는 부가 정보 6곳만 · `conflict.event_ids` 는 `uuid[]` | 7 |
| 해시 | SHA-256 `sha256:<hex>` · RFC 8785 JCS 재료 판 | 8 |
| 사건 멱등 | `evk/1` = 원천 + 주장 위치(JSON Pointer) + SUBJECT + `fact_key`/대상 집합 + 범위 + 부류 · `UNIQUE` + `ON CONFLICT DO NOTHING` | 9 |
| **발송 멱등(F-1)** | **논리 발송 = 메시지**(`message_id` = `X-CERA-Message`). 시도마다 `attempt_no` · `idempotency_key`(= 메시지 + 시도 번호) 가 다르다. **메시지당 `SUCCESS` 1건 · 미확정(`NULL`·`UNKNOWN`) 1건**을 부분 유일로 강제 → 재전송 전 화해가 DB 에서 강제된다 | 13 · 14 |
| **`UNKNOWN`(F-2)** | 확정 결과가 아니다. **화해만** `UNKNOWN` → `SUCCESS`(`provider_message_id` 필수) / `RETRYABLE_FAILURE`(`error_code = RECONCILED_NOT_SENT`) 한 번. 새 표 없음 | 12 · 15 |
| **한 번 채움(F-3 · F-4)** | `comm_message.sent_at` · `comm_thread.external_thread_id` — `NULL` → 값 한 번, 이후 변경 금지(트리거) | 12 |
| **INBOUND(F-5)** | OUTBOUND = `drafted_by` · `current_status` NOT NULL · INBOUND = 둘 다 NULL. INBOUND 의 NULL 은 "상태 모름"이 아니라 **"보내는 메시지 생애주기가 적용되지 않음"** — 수신 처리 상태는 `raw_input` → `extraction` → `event` 흐름이 관리한다 | 22.14 |
| FK | 기본 `RESTRICT` · CASCADE 0 · `SET NULL` 1 · 복합 FK 13 · 순환 2개 "NULL 먼저, FK 나중" | 11 · 19 |
| append-only | **A** 저장소·서비스에 금지 경로 없음 · **B** 트리거(불변 기록 + 허용된 한 번 전이) · **C** migration 소유 역할 ≠ 앱 역할(표 단위 권한). 열 단위 GRANT 는 기본값이 아니다 | 12 |
| Outbox | 세션 advisory lock(단일 워커) + `FOR UPDATE SKIP LOCKED` + 부분 유일 U-6·U-7 + 삽입 가드 | 14 |
| 트랜잭션 | READ COMMITTED + 행 잠금 · advisory xact lock · UNIQUE. 외부 호출은 트랜잭션 밖 | 15 |
| 내용 저장소 | DB 밖 `ContentStore` · `cref:v1:<범주>:<uuid>` · **생성: 쓰기 → 존재 확인 → 지문 확인 → DB 기록** · **파기: 삭제 → 삭제 확인 → 감사 `SUCCESS`** | 16 · 17 |
| trace_id(F-9) | 업무 컬럼을 늘리지 않는다. 장기 상관은 도메인 id, 실행 추적은 관측 문맥·로그 | 10 |
| Drizzle 경계 | NORMAL 10 · DRIZZLE_PLUS_SQL 14 · POSTGRES_NATIVE 5 표 | 18 |
| migration | 층별 생성 6 + custom 4 · U1 에서 한 번에 · 앞으로만 | 19 · 20 |
| 시드 | migration 과 분리된 명령 · local·test 만 · 팩 읽기만 | 21 |
| 논리 모순 | **F-1~F-5 해소** — `docs/22` **rev.2.5**. 표기 F-6~F-8 정리, F-9~F-11 확인 기록 | 25 |

---

## 1. 범위

| 구분 | 표 | 이번 물리 설계 |
| --- | --- | --- |
| **P0 (29)** | `scenario` · `actor` · `counterparty` · `counterparty_contact` · `contact_channel_address` · `facility` · `truck_pool` · `planning_snapshot` · `recovery_run` · `comm_thread` · `question_item` · `comm_message` · `comm_message_structured_field` · `comm_message_question` · `message_approval` · `message_approval_structured_field` · `send_attempt` · `message_status_transition` · `raw_input` · `extraction` · `event` · `event_entity_link` · `event_verification_target` · `canonical_fact` · `conflict` · `verification_request` · `verification_request_handling` · `audit_log` · `system_error` | **한다** — 논리 컬럼 전부(T-069 5절: "P0 표는 논리 컬럼 전부를 물리 설계") |
| P1 (14) | `contact_verification` · `channel_connection` · `commercial_offer` · `commercial_offer_item` · `container` · `bl` · `container_bl` · `assignment` · `facility_warehouse` · `facility_terminal` · `facility_odcy` · `planning_snapshot_fact` · `operator_planning_constraint` · `plan_decision` | 하지 않는다 — Slice 2 · 계획 도메인 합류 때(T-069 5.2). **P0 가 P1 을 가리키는 두 컬럼**(`comm_message.contact_verification_id` · `send_attempt.channel_connection_id`)은 컬럼만 만들고 FK 는 P1 migration 이 붙인다(11.3) |
| DEFERRED (9) | `external_identifier` · `contract` · `tariff_rule` · `risk_assessment` · `cost_result` · `cost_line_item` · `cost_line_link` · `planning_snapshot_constraint` · `planning_snapshot_input` | 하지 않는다. `planning_snapshot_input.value_path` 의 "전체" 표시 문자열(QUEUE T-080 항목)도 이 표와 함께 미룬다 |

> **새 표 · 새 컬럼 · 새 엔티티를 만들지 않았다.** 물리 설계가 더한 것은 **제약**(복합 UNIQUE · 복합 FK · CHECK · 트리거)과 **인덱스**뿐이다(23절). 코드 표(`code_group`/`code_value`)도 Slice 1 에서는 만들지 않는다(3절).

---

## 2. 공통 타입 매핑

| 논리 타입 | PostgreSQL | Drizzle (`drizzle-orm/pg-core`) | TypeScript 경계 | 메모 |
| --- | --- | --- | --- | --- |
| 내부 식별자 `STRING(30/40)` (PK) · `REF(표)` | `uuid` | `uuid()` | `string`(UUID 형식) — 브랜드 타입 권장(U0) | 4절 |
| 다형 개체 id (`entity_id` · `target_entity_id`) | `uuid` | `uuid()` | 같음 | 대상이 전부 uuid PK 표라서 가능. FK 없음 |
| 다형 참조 문자열 (`audit_log.target_id` · `system_error.related_entity_id` · `recovery_run.trigger_ref`) | `varchar(n)` | `varchar()` | `string` | 논리 길이 유지. uuid 문자열(36자)이 들어간다 |
| `STRING(n)` | `varchar(n)` | `varchar({ length: n })` | `string` | 길이를 늘리는 변경은 PostgreSQL 에서 메타데이터 변경뿐이다 |
| `TEXT` | `text` | `text()` | `string` | |
| `CODE` | `text` + CHECK | `text()` + `check()` | 문자열 리터럴 유니온(앱 카탈로그가 정본) | 3절 |
| `BOOLEAN` | `boolean` | `boolean()` | `boolean` | `is_simulated` 는 **기본값 없음**(항상 명시 — 빠뜨려 실제 데이터로 들어가는 것을 막는다) |
| `TIMESTAMP_TZ` | `timestamptz(3)` | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | 시간 모듈의 Instant 값 객체(JS `Date` 금지) | 5절 |
| `DATE` | `date` | `date({ mode: 'string' })` | `YYYY-MM-DD` 문자열 → 달력 날짜 값 객체 | Asia/Seoul 달력 날짜 |
| `TIME` | `time(0)` | `time({ precision: 0 })` | `HH:mm:ss` 문자열 | Asia/Seoul 벽시계 시각(시설 기준선) |
| `INTEGER` | `integer` | `integer()` | `number` | 개수·밀리초·HTTP 상태 |
| `BIGINT` (KRW) | `bigint` | `bigint({ mode: 'bigint' })` | `bigint` → API 문자열 | 6절 |
| `DECIMAL(p,s)` | `numeric(p,s)` | `numeric({ precision, scale })` — 문자열로 온다 | 10진 값 객체(라이브러리는 U0) | 6절 |
| `JSON` | `jsonb` (예외 `uuid[]` 1곳) | `jsonb().$type<T>()` · `uuid().array()` | 스키마 검증된 타입 | 7절 |
| `HASH` | `varchar(71)` + 형식 CHECK | `varchar({ length: 71 })` | `string` | 8절 |
| 내용 참조 `*_ref` | `varchar(300)` + 형식 CHECK | `varchar({ length: 300 })` | `string` | 16절 |

**이름 규칙** — 표·컬럼 이름은 논리 이름 그대로(snake_case). 제약 이름: `pk_<표>` · `fk_<표>__<컬럼들>` · `uq_<표>__<컬럼들>` · `ck_<표>__<규칙>` · `ix_<표>__<컬럼들>` · 트리거 `tg_<표>__<목적>` · 함수 `fn_cera_<목적>`. 이름을 고정해 두면 drizzle-kit 이 만든 SQL 과 custom SQL 이 같은 이름을 가리킨다.

**스키마(namespace)** — 모든 표는 하나의 PostgreSQL 스키마 `cera` 에 둔다(`public` 을 쓰지 않는다 — 권한을 스키마 단위로 닫기 쉽다). 시험은 실행마다 별도 데이터베이스 또는 템플릿 DB 복제로 격리한다(방식은 U0).

---

## 3. CODE 저장 방식

**PostgreSQL ENUM 을 쓰지 않는다.** `docs/22` 18절의 이유(값이 늘 때마다 타입 변경 · 값 제거·순서 변경이 어렵다)에 더해, ENUM 은 트랜잭션 안에서 새 값을 추가한 뒤 같은 트랜잭션에서 쓰지 못하는 제약이 있고, drizzle-kit 의 diff 가 ENUM 변경을 다루는 방식이 버전마다 달라 검토 부담이 크다 `[TO VERIFY: 사용하는 drizzle-kit 판의 enum diff 동작]`.

| 분류 | 기준 | 물리 표현 | 값이 바뀔 때 |
| --- | --- | --- | --- |
| **CLOSED** | 정본(`docs/22` · `docs/05`)에 값 목록이 있고 로직이 그 값에 직접 의존 | `text NOT NULL CHECK (col IN (…))` | **검토된 migration** 으로 CHECK 교체(`NOT VALID` 로 추가 후 `VALIDATE`) |
| **CATALOG** | 값 목록이 아직 없거나(Q-66 · L-14 · L-15 · Q-34) 업무가 늘리는 값(`event_type` · 단위 · 감사 `action` 등) | `text` + **형식 CHECK** `^[A-Z0-9][A-Z0-9_]*$` + **앱 카탈로그 한 곳**(`docs/22` 17.4 규칙 1) | 앱 카탈로그만 바꾼다. DB migration 없음 |
| **규칙 식별자** | `applied_rule` · `detected_rule` | `text` + 형식 CHECK `^R[0-9]{1,2}(-[a-z])?$` | 규칙 문서가 정본 |

- 22절 표에서 CHECK 가 `IN (…)` 인 컬럼이 CLOSED 이고, `CATALOG 형식` 인 컬럼이 CATALOG 다. **CLOSED 54개 컬럼 · CATALOG 27개 컬럼 · 규칙 식별자 2개**(22절 자동 집계).
- **Backend 카탈로그는 한 곳이 정본이다.** 확장 코드의 허용 값은 Main Backend 의 카탈로그 모듈 **하나**에만 정의하고, 검증기 · OpenAPI 스키마 · 생성 타입 · 화면 라벨은 모두 그것에서 파생한다(ADR-033 결정 7 · `docs/22` 17.4 규칙 1). 같은 목록을 여러 파일에 복사하지 않는다 — 복사가 필요해 보이면 파생 규칙을 고친다.
- **코드 표를 만들지 않는 이유(D-2)** — `docs/22` 18절은 "업무가 늘리는 값"을 코드 표로 적었지만 형태는 물리 설계에 맡겼다. Slice 1 에서 코드 표를 만들면 (1) 모든 CODE 컬럼이 코드 표를 가리키는 FK 를 갖거나(복합 FK 에 `code_group` 컬럼이 필요 — **새 컬럼**) (2) FK 없이 표만 두게 되어 CHECK 보다 약해진다. `event_type` 카탈로그는 fixture 와 이미 어긋나 있고(T-082), `source_type` 값은 Q-46 으로 열려 있다. 그래서 **Slice 1 은 앱 카탈로그 + 형식 CHECK** 로 가고, 운영 화면에서 코드 값을 사람이 관리해야 하는 요구가 생기면 그때 코드 표를 만든다(기존 값은 `NOT VALID` FK → `VALIDATE` 로 옮길 수 있다).
- `source_type`(7값)은 Q-46 이 열려 있어도 **CLOSED** 로 둔다. I-23 등 로직이 의존하고, 값이 바뀌면 권한 모델도 함께 바뀌므로 migration 검토를 거치는 편이 안전하다.

---

## 4. ID 전략 (D-1)

| 후보 | 분산 생성 | 정렬 | 로그·디버깅 | URL 노출 | Drizzle | PostgreSQL | fixture | 사람이 읽기 | migration |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **UUIDv7** (`uuid` 타입) | 앱에서 바로 | **생성 시각순**(ms) | 36자, 앞부분이 시각 | 추측 어려움 | `uuid()` 기본 지원 | 16바이트 · `uuidv7()` 함수는 PostgreSQL 18 부터 `[TO VERIFY]` — **앱 생성이라 버전 무관** | 결정적 생성 가능(아래) | 낮음 | 쉬움 |
| UUIDv4 | 앱에서 바로 | **정렬 불가** | 같음 | 같음 | 같음 | 같음 | 같음 | 낮음 | 쉬움 |
| ULID (`text` 26자) | 앱에서 바로 | 시각순 | 읽기 약간 쉬움 | 같음 | `text` + CHECK | **전용 타입 없음** — 문자열 비교·인덱스 크기 | 같음 | 보통 | 보통 |
| `bigint identity` | **DB 왕복 필요** | 삽입순 | 짧다 | **열거 가능** | 기본 지원 | 기본 | 쉬움 | 높음 | 쉬움 |
| 접두어 문자열(`evt_01J…`) | 앱에서 바로 | 본문에 따라 | **종류가 보인다** | 추측 어려움 | `varchar` + CHECK | 문자열 인덱스 | 같음 | 높음 | 보통 |

**결정(D-1 — 승인): 29표 모두 UUIDv7, `uuid` 타입, Main Backend 가 실행 중에 생성한다.**

1. **ID 가 행보다 먼저 필요하다.** 내용 저장소에 먼저 쓰는 경로(T1 · T2 · T7), 멱등 재료, Outbox 가 같은 트랜잭션 전에 id 를 알아야 한다 → DB 왕복이 필요한 `identity` 는 맞지 않는다.
2. **`event_id` 는 정렬 가능해야 한다**(`docs/22` 5절 — R 규칙 최종 tie-break). UUIDv7 은 생성 시각순이다. 같은 밀리초 안의 순서는 무작위 비트로 정해지지만 **tie-break 에 필요한 것은 "결정적인 전체 순서"** 이고 UUID 비교는 결정적이다.
3. **모든 표가 같은 전략이다.** 다형 참조(`event_entity_link.entity_id` 등)가 가리키는 대상이 전부 `uuid` 라서 다형 컬럼도 `uuid` 타입으로 형식 검사를 받는다. 표마다 전략이 다르면 다형 컬럼이 `text` 로 약해진다.
4. **DB 기본값으로 만들지 않는다**(`DEFAULT gen_random_uuid()` 없음). 시계를 주입하는 원칙(`docs/01` 규칙 6)과 같은 이유로, ID 생성기도 주입해서 시험에서 결정적으로 만든다.
5. **시드는 저장소 fixture 에 적은 고정 UUIDv7 값**을 쓴다. 별도의 결정적 생성기를 만들지 않는다. 고정 값이라 두 번 넣어도 같은 행이 되고(`ON CONFLICT DO NOTHING`), 유효한 UUIDv7(버전 7 · RFC 9562 variant)인지는 U0 시험이 검사한다.
6. 사람이 읽기 어려운 문제는 **화면·로그에 이름을 같이 보여 주는 것**으로 푼다(ID 를 읽기 좋게 만들려고 형식을 바꾸지 않는다). 로그에는 표 종류를 함께 적는다.

> 접두어 문자열(`evt_…`)은 쓰지 않는다 — 다형 컬럼·FK 가 전부 `varchar` 가 되고 인덱스가 커진다.

---

## 5. 시각

| 규칙 | 내용 |
| --- | --- |
| 타입 | **모든 `TIMESTAMP_TZ` = `timestamptz(3)`**(밀리초). 시간대 없는 `timestamp` 는 쓰지 않는다 |
| 저장 의미 | `timestamptz` 는 **시점(instant)** 을 UTC 로 저장한다. 원래 오프셋은 저장되지 않는다 |
| DB 세션 | 연결마다 `TimeZone = 'UTC'`. DB 가 돌려주는 문자열 형식이 서버 설정에 따라 달라지지 않게 한다 |
| Drizzle | `mode: 'string'` — 저장소 계층에서 **곧바로 시간 모듈의 Instant 로 바꾼다.** 도메인·엔진은 JS `Date` 를 쓰지 않는다(ADR-033 결정 8③) — **U0 확인(18.1)**: `YYYY-MM-DD HH:mm:ss.sss+00` 문자열 |
| 정밀도 | 밀리초. 앱이 만드는 Instant 도 밀리초로 자른다 → 해시 재료·비교가 왕복 뒤에도 같다 |
| 현재 시각 | **DB 는 시각을 만들지 않는다.** `DEFAULT now()` 없음, 트리거도 `now()` 를 쓰지 않는다(예: 승인 만료 검사는 `NEW.started_at` 과 비교). 모든 시각은 주입된 시계(`as_of`)에서 온다(`docs/01` 규칙 6) |
| Asia/Seoul | **표시·직렬화 책임.** API 는 `+09:00` 오프셋이 붙은 ISO 8601 로 내보내고, 들어오는 시각은 **오프셋이 있는 값만** 받는다(없으면 400). 시간대 없는 출처 시각은 어댑터가 Asia/Seoul 로 해석하고 `payload.tz_assumed = true`(`docs/20` A-03) |
| `DATE` · `TIME` | `param_date` = Asia/Seoul **달력 날짜**. `facility.default_open_time` 등 = Asia/Seoul **벽시계 시각**. 둘 다 시점이 아니라서 `date` · `time` 이 맞다 |

**시각 컬럼별 의미**(물리 타입은 모두 같다)

| 컬럼 | 누가 채우나 | 비고 |
| --- | --- | --- |
| `received_at` | CERA 가 받은 시각(주입 시계) | `raw_input` · `event` · `comm_message`(INBOUND) |
| `source_recorded_at` | 출처 기록 시각. 메일이면 **Q-44 규칙**의 선택 결과 | `raw_input` · `event`. EMAIL 은 `<= received_at` CHECK |
| `source_event_time` | 출처가 말한 발생 시각 | `event` |
| `recorded_at` | DB 기록 벽시계 — **주입 시계**에서 | `event` |
| `created_at` · `opened_at` · `executed_at` · `decided_at` · `handled_at` · `occurred_at` | 그 행위의 시각(주입 시계) | |
| `sent_at` | 발송 성공 시각 — 처음 `NULL`, 성공 확인 시 그 시도의 `finished_at` 으로 **한 번** 채움 | `docs/22` rev.2.5 |
| `approved_at` · `verified_at` | 등록부 상태 시각 | |
| `computed_as_of` · `computed_at` | 계산 기준 시각 · 계산 시각 | 파생 표 |

**Q-44 원래 두 시각** — `timestamptz` 가 원래 오프셋을 버리므로, 메일의 원래 값은 **`event.payload` 에 원문 그대로** 둔다: `date_header_raw`(원래 문자열) · `date_header_parsed`(ISO 8601, 원래 오프셋 유지) · `channel_received_at`(`internalDate` 를 ISO 로) · `recorded_at_basis` · `date_header_rejected` · `date_header_reject_reason`(`docs/22` 11.2e). 선택 결과만 `source_recorded_at` 컬럼에 간다.

---

## 6. 정수 · 금액 · 소수 (D-3)

**P0 의 `BIGINT` 는 `recovery_run.total_cost_krw` 한 개**다(원 정수). 그 밖의 금액성 값(보관 요율 등)은 사실의 값이라 `numeric(18,4)` 인 `event.value_number` · `canonical_fact.value_number` 에 들어간다.

| 비교 | A. JS `bigint` | B. 문자열 경계 | C. 안전 범위 `number` |
| --- | --- | --- | --- |
| 정확성 | 항상 정확 | 항상 정확 | 2^53 까지 — 넘으면 **조용히 틀린다** |
| JSON 직렬화 | `JSON.stringify` 가 **오류** — 직렬화기 필요 | 그대로 | 그대로 |
| OpenAPI | `integer/int64` 를 대부분의 생성기가 `number` 로 만든다 | `string` + 패턴 | `integer` |
| React | 표시용 변환 필요 | 표시용 변환 필요 | 바로 |
| Drizzle | `bigint({ mode: 'bigint' })` | `bigint({ mode: 'string' })` `[TO VERIFY]` | `bigint({ mode: 'number' })` |
| 계산 코드 | `bigint` 끼리만 연산 — `number` 와 섞으면 **TypeError** 로 드러난다 | 매번 변환 | 섞여도 조용히 동작 |
| 시험 | 2^53 초과 값 속성 시험 가능 | 같음 | 초과 값에서 깨짐 |

**결정(D-3 — 승인): DB `bigint` ↔ 도메인 `Krw`(JS `bigint` 기반 값 객체) ↔ API 10진 정수 문자열. JS `number` 로의 암묵 변환은 금지한다** — 변환은 명시적 함수 한 곳에서만, 안전 범위 검사를 거쳐 한다(표시용 포매팅 포함).

- 저장소 계층 `mode: 'bigint'` → 도메인 `Krw` → API 응답은 `"4820000"` 같은 문자열(OpenAPI `type: string`, `pattern: '^-?[0-9]+$'`, 설명에 "원 단위 정수"). 요청도 문자열로 받는다.
- 이유: 정확성은 A·B 가 같고, **계산 코드에서 실수로 `number` 와 섞으면 즉시 실패**하는 것은 A 뿐이다. API 에서 `number` 로 내보내면 생성 타입이 `number` 가 되어 Frontend 에서 다시 C 의 위험이 생기므로 경계는 문자열로 둔다.
- `numeric(p,s)`(`value_number` · 구조화 값 · `model_confidence`) — node-postgres 가 문자열로 돌려준다. 도메인은 **10진 값 객체**(라이브러리는 U0)로 받고, 숫자 검사(FR-COM-07)도 문자열 10진 비교로 한다(부동소수 금지). API 도 문자열.
- 단위가 `KRW` 인 수치는 **정수여야 한다** — `CHECK (value_unit <> 'KRW' OR value_number = trunc(value_number))` 를 `event` · `canonical_fact` · 구조화 값 두 표에 둔다(`docs/01` 규칙 7 의 DB 표현).
- `integer`(개수 · `solve_ms` · `attempt_no` · `http_status`) — JS `number` 로 충분하다.
- `total_cost_krw >= 0` CHECK.

---

## 7. JSONB

**판단 기준(`docs/22` 11.2d)**: 조회·조인·제약의 대상이면 컬럼이고, 설명·감사용이면 JSON 이다. P0 의 JSON 7곳을 모두 검토했다.

| 컬럼 | 결정 | 모양 | 왜 컬럼·자식 표가 아닌가 | 스키마 판 |
| --- | --- | --- | --- | --- |
| `event.payload` | **jsonb 객체** | 사건 종류별 부가 키: `change_reason` · `forecast_kind` · `tz_assumed` · Q-44 키 6개 · **`claim_locator`**(9절) | 조회·조인·제약 대상이 아니다. 핵심 구조(SUBJECT · fact_key · 범위 · 출처 3축 · 시각 · 값 · 신뢰도 · 확인 · 멱등 키)는 전부 정식 컬럼이다 | 행의 `schema_version`(`ev-N`)이 payload 키 목록까지 정한다 |
| `event.input_confidence_reasons` | **jsonb 배열** | `[{check, outcome, effect}]` — 검사 이름은 `docs/05` 4.6 의 7가지 | 표로 만들면 정책 판마다 스키마를 바꿔야 한다(11.2b) | `schema_version` |
| `extraction.validator_result` | **jsonb 배열** | `[{check, passed, detail_code}]` | 같음(15.9.2). 원문·인용 텍스트는 넣지 않는다 | 행의 `schema_version`(추출 계약 판) |
| `raw_input.attachment_manifest` | **jsonb 배열** | `[{sha256, size_bytes, media_type}]` — **파일명 금지**(29.4) | 첨부 해석은 범위 밖. 증거용 메타데이터 | 배열 원소 형식은 앱 스키마 판 `am/1` |
| `recovery_run.unmet_constraints` | **jsonb 배열** | 솔버 출력 요약 | Slice 1 은 시드. 솔버(Q-65) 결정 뒤 구조가 정해진다 | 솔버 계약 판 |
| `planning_snapshot.scope_ref` | **jsonb 객체** | 스냅샷 대상 설명 | 계산 입력은 자식 표(P1)가 담는다. 여기는 설명 | — |
| `conflict.event_ids` | **`uuid[]` 로 바꾼다** | 정렬된 사건 id 배열 | 원소 타입을 DB 가 검사할 수 있다. 역방향 조회 대상은 아니다(11.2a — 그래서 자식 표도 아니다) | — |

- 모든 jsonb 컬럼에 **모양 CHECK**(`jsonb_typeof(...) = 'object' | 'array'`)를 둔다. 세부 스키마 검증은 **쓰기 경로의 스키마 검증기**(ADR-033 결정 7 의 단일 원천)가 한다 — DB 에 JSON Schema 를 두지 않는다.
- jsonb 에 **GIN 인덱스를 만들지 않는다**(조회 대상이 아니므로). 조회가 필요해지면 그것은 컬럼으로 올릴 신호다.
- **payload 에 넣지 않는 것**: 원문 인용 · 메일 본문 · 비밀값 · 다른 표로 가야 할 핵심 구조.

---

## 8. 해시 · 지문

### 8.1 표현

| 항목 | 결정 |
| --- | --- |
| 알고리즘 | **SHA-256** (Slice 1 고정) |
| 표현 | **`sha256:` + 64자리 소문자 16진수** — `varchar(71)` + `CHECK (col ~ '^sha256:[0-9a-f]{64}$')` |
| 왜 `bytea` 가 아닌가 | 로그·감사·API·fixture 에서 그대로 읽고 비교할 수 있다. 크기 차이(33 → 72바이트)는 이 규모에서 문제가 아니다 |
| 왜 접두어를 두나 | 알고리즘을 바꿀 때 컬럼을 추가하지 않고 값 자체가 알고리즘을 말한다. **다른 접두어끼리는 같다고 보지 않는다** — 알고리즘을 바꾸면 그 뒤 행부터 새 값이고, 옛 값과의 멱등은 보장하지 않는다(판 경계로 기록) |
| 구조 재료 직렬화 | **RFC 8785 JSON Canonicalization Scheme(JCS)**. 재료는 항상 `{"k": 재료 종류, "v": 판, …}` 객체다 |
| 재료 안의 값 | 10진수는 **정규화한 문자열**(지수 표기 없음 · 뒤 0 제거 · `-0` 없음) · 시각은 UTC `YYYY-MM-DDTHH:mm:ss.sssZ` · id 는 소문자 UUID 문자열 · 없음은 `null` 로 명시 · 집합 의미의 배열은 **정렬** |
| 바이트 해시 | 원문처럼 바이트 자체가 대상이면 JCS 없이 **바이트의 SHA-256** |

**논리 정체성과 해시 표현을 구분한다.** 각 해시의 *무엇을 같다고 볼 것인가*(재료 목록)는 논리 정체성이고 `docs/22` 가 정본이다. 이 절은 그 재료를 *어떻게 바이트로 만들고 무엇으로 줄이는가*만 정한다. 재료 목록이 바뀌면 재료 판(`v`)을 올린다.

### 8.2 해시별 명세

| 컬럼 | 재료 종류 · 판 | 재료 | 바이트/JCS | UNIQUE |
| --- | --- | --- | --- | --- |
| `comm_message.content_hash` | `msg-content/1` | `to_address_id` · 제목 · 안전한 텍스트 본문 · 구조화 값 목록(`field_key` 정렬, 값·단위) — **구현 `back/src/communication/message-content.ts`(T-089, 18.5 U4-1)** | JCS | 아니오 |
| `message_approval.approved_content_hash` | `msg-content/1` | 승인 사본으로 같은 함수 | JCS | 아니오 |
| `send_attempt.sent_content_hash` | `msg-content/1` | BUSINESS = 유효 승인의 값 · CV = 메시지 `content_hash`(I-3 · I-3b) | JCS | 아니오 |
| `raw_input.payload_hash` | 바이트 | 원문 바이트(RFC822 등) | 바이트 | **아니오**(11.1) |
| `extraction.source_quote_hash` | 바이트 | 인용 문자열의 UTF-8 바이트(정규화하지 않는다) | 바이트 | 아니오 |
| `extraction.input_hash` | `extract-input/1` | AI 포트에 보낸 요청 문서 전체(스키마 판 · 프롬프트 판 · 안전한 텍스트 · 스레드 문맥 · 질문 목록) | JCS | 아니오 |
| `planning_snapshot.fact_fingerprint` | `snap-facts/1` | 스냅샷 사실 집합(Slice 1 은 시드 fixture 의 사실 목록) | JCS | 아니오 |
| `verification_request.request_key` · `question_item.verification_request_key` · `verification_request_handling.request_key` | `vrk/1` | `trigger_rule` · 개체 · `fact_key` · 적용 범위 · 관련 사건 id **정렬 집합**(`docs/22` 11.7.2) | JCS | **`verification_request` 에서 UNIQUE** |
| `event.idempotency_key` | `evk/1` | 9절 | JCS | **UNIQUE** |
| `send_attempt.idempotency_key` | `sak/1` | `message_id` · `attempt_no` — **시도마다 다르다**(논리 발송의 신원은 메시지, `docs/22` rev.2.5) | JCS | **UNIQUE** |

- `send_attempt.idempotency_key` 는 논리 `STRING(100)` 이고 물리 표현은 해시(71자)다. 같은 행의 `message_id` · `attempt_no` 로 재료를 사람이 읽을 수 있다. **중복 발송을 막는 것은 이 키가 아니라 13절 U-6 · U-7 과 `lookup_sent`** 다.
- **내용 저장소의 무결성 지문**(16절)은 저장한 바이트의 SHA-256 이다. `payload_hash` · `source_quote_hash` 는 그 값과 같다. 메시지·승인 문장은 저장 문서가 `{제목, 본문}` 이고 기록의 지문은 수신자·구조화 값까지 덮으므로, 꺼낸 내용 + 기록 쪽 값으로 `msg-content/1` 을 **다시 계산해 대조**한다(`docs/22` 29.1 성질 2).

---

## 9. 사건 멱등 — `event.idempotency_key` (`evk/1`)

`docs/22` 11.2d 의 논리 재료를 물리로 닫는다.

```
evk/1 = sha256(JCS({
  k: "event-idem", v: 1,
  origin:        { raw_input_id },                          // 모든 사건은 원천이 있다(NOT NULL)
  claim_locator: "<RFC 6901 JSON Pointer>",                 // 원천 안의 주장 위치
  subject:       { entity_type, entity_id },                // SUBJECT 링크와 같은 값
  fact_key:      "<fact_key>" | null,                       // VERIFICATION 이면 null
  targets:       ["<target_event_id>", …] | null,           // VERIFICATION 이면 정렬 집합, 아니면 null
  scope:         { type, ref },                             // GLOBAL 이면 ref = ""
  event_class:   "OBSERVATION" | "CORRECTION" | "VERIFICATION"
}))
```

**주장 위치(claim locator) 형식 — RFC 6901 JSON Pointer**. 어댑터가 원천을 **정규 파싱한 구조** 안의 위치를 가리킨다. 파서가 바뀌어도 같은 주장이면 같은 위치가 나오도록 **위치는 원천의 안정적인 식별자로 만든다**(배열 순번보다 원천이 준 키를 우선).

| 원천 | 위치 예 | 왜 안정적인가 |
| --- | --- | --- |
| 비정형 메일 회신(추출) | `/asks/<ask_id>` | `ask_id` 는 CERA 가 만든 질문 표식이다. **`extraction_id` 를 쓰지 않는다** — 재추출하면 새 추출 행이 생기므로 같은 주장이 다른 키가 된다 |
| 구조화 회신(Mock ODCY) | `/fields/<field_key>` 또는 `/rows/<원천 행 키>` | 원천이 준 키 |
| 공공 API · 파일 | `/items/<원천 키>` — 원천 키가 없으면 `/items/<순번>` | 순번은 같은 원문 재처리에서 같다 |
| 사람 화면 명령 | `/` (명령 1건 = `raw_input` 1행 = 주장 1건) | |
| 사람 확인(VERIFICATION) | `/` | 대상은 `targets` 가 구분한다 |

- **`claim_locator` 는 `event.payload.claim_locator` 에 남긴다** — 조회·조인·제약 대상이 아니고 "왜 이 키인가"의 설명·감사용이다(11.2d 판단 기준). 키를 다시 계산해 볼 수 있게 된다.
- **같은 사람 명령의 재시도**: 화면 명령은 `CeraCommandClient` 가 만든 **명령 id(UUIDv7)** 를 `raw_input.source_record_key` 로 쓴다(`source_name = 'cera-ui'`). 같은 명령이 두 번 오면 `UNIQUE(source_name, source_record_key)` 가 같은 `raw_input` 으로 모으고, 그래서 사건 키도 같다. `docs/22` rev.2.5 가 11.1 표에 이것을 적었다(25절 F-10).
- **삽입**: T9 에서 `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING event_id`. 아무것도 돌아오지 않으면 **그 트랜잭션의 나머지(링크 · 추출 검토 갱신)를 하지 않는다**(`docs/05` 4.5 "무시, 로그만" — `system_error` 아님).
- **재추출 뒤 같은 주장**: 새 추출 행은 `ACCEPTED` 가 될 수 없다(`created_event_id` 필수인데 새 사건이 없다) → 새 추출 행은 `SUPERSEDED` 나 `REJECTED` 로 닫고, 사건은 처음 추출 행을 가리킨 채 남는다. 사건 수가 바뀌지 않는 것이 목적(NFR-23 · I-25)이다.
- **값은 재료가 아니다**(논리 그대로). 같은 위치의 같은 주장을 파서 수정 뒤 다른 값으로 읽어도 새 사건이 생기지 않는다 — 값을 바로잡는 길은 `CORRECTION` 사건이다.

---

## 10. 요청 id · 추적 id

`docs/23` 13절 · T-069 17절이 넘긴 형식을 정한다(오류 기록 컬럼에 들어가므로).

| id | 형식 | 헤더 | 저장 |
| --- | --- | --- | --- |
| `trace_id` | **W3C Trace Context 의 trace-id** — 32자리 소문자 16진수 | `traceparent`(W3C) | `system_error.trace_id varchar(64)` |
| `request_id` | UUIDv7 문자열 | `X-Request-Id`(클라이언트가 보내면 형식 검사 후 사용) | `system_error.request_id varchar(64)` |

- W3C 형식을 쓰면 관측 제품(Q-67)을 나중에 붙일 때 바꿀 것이 없다.
- **Outbox 작업으로 `trace_id` 를 이어 주기 위해 업무 표에 컬럼을 추가하지 않는다**(F-9 결정). 장기 업무 상관은 안정적인 도메인 id — `message_id` · `thread_id` · `correlation_id` · `run_id` — 로 잇고, `trace_id` 는 관측 문맥·로그에 둔다. 워커는 작업마다 새 trace 를 열고 로그에 도메인 id 를 남긴다. 비동기 전달에 저장이 필요하다는 구체적 근거가 생길 때만 다시 연다.

---

## 11. FK 와 삭제 정책

### 11.1 기본 정책

| 정책 | 쓰는 곳 | 이유 |
| --- | --- | --- |
| **`ON DELETE RESTRICT` · `ON UPDATE RESTRICT`** | **모든 FK(기본)** | 기록은 지우지 않는다(`docs/22` 17.3). PK 는 바뀌지 않는다. `RESTRICT` 는 즉시 검사라 지연 검사(`NO ACTION`)처럼 트랜잭션 끝까지 미뤄지지 않는다 |
| `ON DELETE SET NULL` | **`verification_request.conflict_id` 한 곳** | 두 표가 모두 재생성 대상(REBUILDABLE)이고 이 참조는 화면용이다. 재계산이 충돌을 지우고 다시 만들 때 확인 요청이 막히지 않게 한다 |
| `CASCADE` | **없음** | 부모 삭제로 사건·감사·승인·메시지 이력이 사라지는 구조를 금지한다 |
| `NO ACTION`(지연 가능) | 없음 | 순환은 19절 "NULL 먼저, FK 나중"으로 풀었다. 지연 FK 가 필요 없다 |

- **REBUILDABLE 표를 지울 때의 순서**(T10): `verification_request` → `conflict` → `canonical_fact` 순으로 지우고 반대로 만든다. `canonical_fact.winning_event_id` 는 `event` 를 가리키는 것이지 가리킴을 받는 쪽이 아니라서 사건을 지우지 않는다.
- **마스터는 지우지 않는다** — `is_active = false`. 앱 역할에 DELETE 권한이 없다(12.2).

### 11.2 복합 FK 13개 — 논리 규칙을 DB 가 직접 지키게 하는 곳

모두 **새 컬럼 없이** 같은 행에 이미 있는 컬럼으로 만든다. 대상 쪽에는 그 조합의 `UNIQUE` 를 둔다(22절 각 표).

| 참조 | 무엇을 막나 | 근거 |
| --- | --- | --- |
| `comm_message (thread_id, channel_type, is_simulated)` → `comm_thread` | 스레드와 다른 채널 · 다른 시뮬레이션 값의 메시지 | `docs/18` J.3 "한 스레드 안에서 채널이 섞이지 않는다" · S-1 |
| `comm_message (to_address_id, channel_type)` → `contact_channel_address (address_id, channel_type)` | 다른 채널의 주소로 발송 | J.3 |
| `comm_message (current_approval_id, message_id)` → `message_approval (approval_id, message_id)` | 캐시 포인터가 다른 메시지의 승인을 가리킴 | 15.3 |
| `comm_thread (contact_id, counterparty_id)` → `counterparty_contact (contact_id, counterparty_id)` | 다른 거래처의 연락처로 스레드 | 15.1 |
| `message_approval (invalidates_approval_id, message_id)` → `message_approval (approval_id, message_id)` | 다른 메시지의 승인을 무효화 | 15.5.0 규칙 3 |
| `message_approval (message_id, approved_to_address_id)` → `comm_message (message_id, to_address_id)` | 메시지 수신자가 아닌 주소를 승인 | 15.5 · 수신자 바꿔치기 |
| `send_attempt (approval_id, message_id)` → `message_approval (approval_id, message_id)` | 다른 메시지의 승인으로 발송 | 15.7.1 규칙 1 |
| `send_attempt (message_id, is_simulated)` → `comm_message` | 가상 메시지를 실제 시도로(또는 반대로) 기록 | J.3 · S-6 |
| `message_status_transition (message_id, is_simulated)` → `comm_message` · `(send_attempt_id, message_id)` → `send_attempt` | 다른 메시지의 시도를 상태에 연결 | 15.8 |
| `event (raw_input_id, is_simulated)` → `raw_input` · `extraction (raw_input_id, is_simulated)` → `raw_input` | 가상 원천에서 실제 사건(또는 반대) | S-1 · `docs/01` 규칙 9 |
| `recovery_run (snapshot_id, contains_simulated)` → `planning_snapshot` | 스냅샷과 다른 `contains_simulated` | I-5 |

> 이 복합 FK 들은 **논리 규칙을 DB 로 표현한 것**이지 새 규칙이 아니다. 다만 `event`·`extraction` ↔ `raw_input` 의 `is_simulated` 일치는 논리 문서에 명시 문장이 없고 S-1 · 규칙 9 에서 따라 나온다 — 확인 결과 유지한다(25절 F-11).

### 11.3 P1 표를 가리키는 P0 컬럼

| 컬럼 | P0 에서 | P1 migration 에서 |
| --- | --- | --- |
| `comm_message.contact_verification_id` | `uuid NULL`, FK 없음, **임시 CHECK `contact_verification_id IS NULL`** — Slice 1 에는 주소 확인 메일이 없다 | `contact_verification` 생성 → FK 추가 → 임시 CHECK 제거 |
| `send_attempt.channel_connection_id` | `uuid NULL`, FK 없음, **임시 CHECK `IS NULL`**(Mock 은 연결 없음 — T-069 5.1) | `channel_connection` 생성 → FK 추가 → 임시 CHECK 제거 |

임시 CHECK 가 있으므로 P0 기간에 참조 대상 없는 값이 들어갈 수 없다. FK 를 나중에 붙일 때 기존 행 검사도 필요 없다(전부 NULL).

---

## 12. append-only · 변경 방식 강제 (D-4)

### 12.1 세 층

| 층 | 무엇을 하나 | 막는 것 |
| --- | --- | --- |
| **A. 애플리케이션** | append-only 표의 저장소·서비스에 **update · delete 경로를 만들지 않는다.** 한 번 전이(결과 · 검토 · 화해 · 한 번 채움)는 **그 일을 맡은 서비스 하나**에만 메서드가 있다(예: `UNKNOWN` 화해는 화해 서비스만) | 앱 코드의 실수 — 타입 단계에서 드러난다 |
| **B. PostgreSQL 트리거** | **불변 기록**의 UPDATE · DELETE · TRUNCATE 거부 + **허용된 한 번 전이**만 통과시키는 가드 + 행 사이 불변식(삽입 가드 · 지연 검사) | 앱 역할의 모든 경로(raw SQL 포함) |
| **C. 역할 분리** | **migration 소유 역할 `cera_owner` ≠ 실행 앱 역할 `cera_app`.** 앱 역할은 표의 소유자가 아니므로 **트리거를 끄거나 스키마를 바꿀 수 없다.** 권한은 **표 단위**로 준다 | 트리거 해제 · DDL · TRUNCATE |

- **열 단위 GRANT 를 기본값으로 쓰지 않는다.** 어느 열이 바뀔 수 있는지는 B 의 가드 트리거가 정하고, C 는 표 단위(SELECT · INSERT · 필요한 표의 UPDATE · 재생성 표의 DELETE)만 다룬다. 열 단위 권한은 **실제로 필요한 경우만** 추가한다(Slice 1 에는 없다).
- **B 는 "불변 기록과 한 번 전이"에 쓴다.** 등록부 마스터의 일반 수정(이름 · 활성 여부 등)은 A 가 다룬다 — 마스터에 열 가드 트리거를 붙이지 않는다(과한 설계를 피한다). **예외 하나: `actor`** — `actor_type` 은 승인 · 확인 처리 가드(B)가 믿는 권한 속성이라, 앱 역할이 바꾸면 B 의 "사람만 승인"이 무너진다. 그래서 `actor` 에만 열 가드(`display_name` · `is_active` 만 변경)를 붙인다(T-086 최종 검토 2026-10-06, 18.2 U1-11). **예외 둘(2026-10-06 T-087 M11): `contact_channel_address`(`contact_id` · `channel_type` · `normalized_address` 불변)와 `counterparty_contact`(`counterparty_id` 불변)** — 승인 · 발송은 수신자를 `address_id` 로 맞추므로, 주소 값이나 소속 연락처 · 거래처가 바뀌면 승인된 메시지가 다른 주소로 나가거나 다른 거래처로 게이트를 통과한다(18.3 U2-1)
- 사람의 운영 작업(점검 · 긴급 수정)은 소유 역할로 하고 운영 절차·감사로 다룬다(이 문서 밖).

### 12.2 역할과 표 단위 권한

| 역할 | 누가 | 권한 |
| --- | --- | --- |
| `cera_owner` | migration 실행(배포 단계에서 명시적으로) | 스키마 `cera` 와 모든 객체의 소유자. **앱이 이 역할로 붙지 않는다** |
| `cera_app` | NestJS API · Worker | 아래 표. `TRUNCATE` · `TRIGGER` · `REFERENCES` · DDL 없음 |
| (없음) | **Python AI Server** | **DB 역할 자체가 없다**(ADR-033 · ADR-034 결정 6). 자격증명도 배포하지 않는다 |

| 표 묶음 | `cera_app` 권한 |
| --- | --- |
| APPEND_ONLY 14표(12.3 첫 줄) | SELECT · INSERT |
| 한 번 전이 · 제어된 갱신 표: `send_attempt` · `extraction` · `comm_message` · `comm_thread` · `question_item` | SELECT · INSERT · UPDATE (열·전이는 B 가 제한) |
| 등록부 마스터: `scenario` · `actor` · `counterparty` · `counterparty_contact` · `contact_channel_address` · `facility` · `truck_pool` | SELECT · INSERT · UPDATE (DELETE 없음 — 비활성화) |
| 재생성 표: `canonical_fact` · `conflict` · `verification_request` | SELECT · INSERT · UPDATE · **DELETE** |

- 역할은 클러스터 객체라 **환경 준비 단계**(로컬 초기화 스크립트 · 운영 절차 — U0)에서 만든다. migration 은 역할이 있다고 보고 `GRANT` 만 한다(M10).
- 시험도 두 역할로 돈다 — "앱 역할로 불변 표 UPDATE → 거부" 시험이 실제 권한·트리거를 검사한다.

### 12.3 트리거 목록 (공통 함수 몇 개)

| 함수 | 붙는 표 | 동작 |
| --- | --- | --- |
| `fn_cera_reject_mutation()` — `BEFORE UPDATE OR DELETE` | **APPEND_ONLY 14표**: `planning_snapshot` · `recovery_run` · `comm_message_structured_field` · `comm_message_question` · `message_approval` · `message_approval_structured_field` · `message_status_transition` · `raw_input` · `event` · `event_entity_link` · `event_verification_target` · `verification_request_handling` · `audit_log` · `system_error` | 예외(앱이 구분할 수 있는 전용 SQLSTATE) |
| `fn_cera_reject_delete()` — `BEFORE DELETE` | `send_attempt` · `extraction` · `comm_message` · `comm_thread` · `question_item` | 예외 |
| `fn_cera_reject_truncate()` — `BEFORE TRUNCATE` | 재생성 표를 뺀 모든 표 | 예외 |
| `fn_cera_guard_columns(가변 열 목록)` — `BEFORE UPDATE`, **인자로 바뀔 수 있는 열을 받는 공통 함수** | `comm_message`(`current_status` · `current_approval_id` · `sent_at`) · `comm_thread`(`thread_status` · `last_activity_at` · `external_thread_id`) · `question_item`(`question_status`) · `send_attempt`(결과 5열) · `extraction`(검토 4열) · **`actor`(`display_name` · `is_active` — `actor_type` 불변, 12.1 예외)** · **`contact_channel_address`(3상태 · `verified_at` · `approved_by_actor_id` · `approved_at`) · `counterparty_contact`(`person_name` · `team` · `note` · `is_active`) — M11, 12.1 예외** | 목록 밖 열이 바뀌면 예외 |
| `fn_cera_guard_one_time_fill(열)` — `BEFORE UPDATE` | `comm_message.sent_at` · `comm_thread.external_thread_id` | **`NULL` → 값 한 번**. 값이 있으면 바꿀 수 없다(같은 값 재기록은 허용하지 않는다) |
| `fn_cera_guard_send_attempt_result()` — `BEFORE UPDATE` | `send_attempt` | 허용 전이만: `NULL` → {`SUCCESS`, `RETRYABLE_FAILURE`, `PERMANENT_FAILURE`, `UNKNOWN`}(이때 `finished_at` 도 함께) · **`UNKNOWN` → `SUCCESS`**(`provider_message_id` NOT NULL — 화해가 찾은 증거) · **`UNKNOWN` → `RETRYABLE_FAILURE`**(`error_code = 'RECONCILED_NOT_SENT'` — 화해가 발송 없음을 확인). `finished_at` 은 한 번 기록 뒤 바꾸지 않는다. 그 밖의 전이(확정 결과 변경 등) 거부 |
| `fn_cera_guard_extraction_review()` — `BEFORE UPDATE` | `extraction` | `PENDING` → 종료 한 번 |
| `fn_cera_guard_send_attempt_insert()` — `BEFORE INSERT` | `send_attempt` | **I-9 · I-3 · I-3b**(BUSINESS: 유효한 승인 여섯 조건을 `NEW.started_at` 기준으로 · 지문 = `approved_content_hash` · 수신자 일치 / CV: 승인 NULL · 지문 = 메시지 `content_hash`) + **새 시도 조건**: 그 메시지에 `SUCCESS` · `PERMANENT_FAILURE` 시도가 있으면 거부 · `attempt_no` = 이전 최대 + 1 |
| `fn_cera_guard_approval_insert()` — `BEFORE INSERT` | `message_approval` | 무효화 대상이 APPROVED · CV 메시지 승인 금지(I-10) · 결정 주체 `HUMAN`(`INVALIDATED` 는 `SYSTEM` 허용 — AI 는 승인하지 않는다) · 계획 기반이면 `approved_plan_run_id` · 내용이 있으면 `approved_content_ref` |
| **`fn_cera_guard_approval_decision()`** — `BEFORE INSERT`(**M12**, T-089) | `message_approval` | 메시지 행 `FOR UPDATE`(결정 줄 세움) · `APPROVED`: 메시지 `PENDING_APPROVAL`/`APPROVED` · 승인 지문 = 메시지 지문 · 그 시각 살아 있는 승인 없음 · 계획 기반이면 근거 실행 미교체(`fn_cera_lock_plan_run` advisory lock 뒤 확인) · `REJECTED`/`REVISION_REQUESTED`: 메시지 `PENDING_APPROVAL` · `REVOKED`/`INVALIDATED`: 성공 · 미확정 발송 시도 없음(18.5 U4-2) |
| **`fn_cera_guard_status_transition()`** — `BEFORE INSERT`(**M13**, T-090) | `message_status_transition` | 메시지 행 `FOR UPDATE` · OUTBOUND 허용 전이 표만 · BUSINESS `QUEUED` = 그 시각 유효한 승인(지문 · 수신자 · 만료 · 무효화) · `SENT` = SUCCESS 시도 있음(18.6 U5-6) |
| `fn_cera_check_approval_copies()` — **지연 제약 트리거**(커밋 시) | `message_approval` · `message_approval_structured_field` · `comm_message_structured_field` | APPROVED 의 구조화 값 사본 = 메시지 구조화 값 · **계획 기반 승인: 메시지 값의 `source_run_id` 는 한 실행뿐이고 `approved_plan_run_id` = 그 실행**(`source_run_id` 없는 값만 있으면 계획 무관 승인) |
| `fn_cera_guard_message_children_insert()` — `BEFORE INSERT` | `comm_message_structured_field` · `comm_message_question` | 메시지 `BUSINESS` · `current_status = DRAFTED` · 같은 스레드(I-10 규칙 4·5) |
| `fn_cera_guard_approval_copy_insert()` — `BEFORE INSERT` | `message_approval_structured_field` | 부모 decision ∈ (APPROVED, REJECTED, REVISION_REQUESTED) |
| `fn_cera_apply_status_transition()` — `AFTER INSERT` | `message_status_transition` | `comm_message.current_status` 갱신(캐시가 정본과 어긋날 수 없게). **INBOUND 메시지에는 전이를 넣을 수 없다**(삽입 거부) |
| `fn_cera_guard_event_insert()` — `BEFORE INSERT` | `event` | CORRECTION: 원 사건과 `fact_kind` 같음 |
| `fn_cera_check_event_links()` — **지연 제약 트리거** | `event` · `event_entity_link` · `event_verification_target` | SUBJECT **정확히 1건**(I-8) · VERIFICATION 은 TARGET ≥ 1, 그 밖은 0(I-21) · 대상 부류 ≠ VERIFICATION · OVERRULED 는 REQUEST_RESOLUTION 에서만 · **I-26 좌표 동일** · CORRECTION 주체 = 원 사건 주체 |
| `fn_cera_guard_entity_link_insert()` — `BEFORE INSERT` | `event_entity_link` | 다형 대상 존재 검사. P0 에 표가 없는 `CONTAINER` · `BL` · `VESSEL_CALL` 은 Slice 1 에서 거부 |
| `fn_cera_guard_handling_insert()` — `BEFORE INSERT` | `verification_request_handling` | 처리 주체 `HUMAN` |

- 트리거 SQL 은 이 문서에 쓰지 않는다(U1 custom migration). **함수는 `now()` 를 부르지 않는다**(5절).
- **"화해만 `UNKNOWN` 을 바꾼다"의 강제**: A 에서 화해 서비스만 그 메서드를 갖고, B 는 화해의 **증거**(`provider_message_id` 또는 `RECONCILED_NOT_SENT`)가 없는 전이를 거부한다. 별도 화해 표는 만들지 않는다 — 누가 언제 화해했는지는 기존 `audit_log` 와 상태 전이에 남는다.

---

## 13. 조건부 유일 · 부분 유일

PostgreSQL 의 `UNIQUE` 제약은 `WHERE` 조건을 가질 수 없다. 조건이 **"값이 있을 때만"** 이면 **일반 UNIQUE**(NULL 은 서로 같지 않다 — 기본 동작)로, **다른 열의 값에 따른 조건**이면 **partial unique index** 로 만든다.

| # | 규칙 | 조건 | 유일 대상 | 물리 구현 | 왜 필요한가 | migration |
| --- | --- | --- | --- | --- | --- | --- |
| U-1 | 사건마다 SUBJECT 1건(I-8 의 "최대") | `link_role = 'SUBJECT'` | `(event_id)` | **partial unique index** | 한 사건이 두 현재 사실로 가면 Reconciliation 이 결정론이 아니다. "최소 1"은 지연 트리거 | M05 |
| U-2 | 한 승인당 무효화 1건(I-17) | 값이 있을 때 | `(invalidates_approval_id)` | 일반 UNIQUE | 같은 승인 두 번 무효화 | M04 |
| U-3 | 같은 전달 건 중복 처리 금지 | 값이 있을 때 | `(source_name, source_record_key)` | 일반 UNIQUE | 같은 메일·명령 두 번 처리 | M05 |
| U-4 | 중복 수신 차단 | 값이 있을 때 | `(channel_type, external_message_id)` | 일반 UNIQUE | 같은 회신 두 번(I-04) | M04 |
| U-5 | 외부 스레드 중복 | 값이 있을 때 | `(channel_type, external_thread_id)` | 일반 UNIQUE | 스레드 중복. **범위는 채널 종류**(아래) | M04 |
| **U-6** | **메시지당 성공 발송 1건** | `result = 'SUCCESS'` | `(message_id)` | **partial unique index** | 한 논리 발송(메시지)이 두 번 성공으로 기록되는 것 — **중복 업무 발송의 DB 최종 방어** | M04 |
| **U-7** | **메시지당 미확정 시도 1건** | `result IS NULL OR result = 'UNKNOWN'` | `(message_id)` | **partial unique index** | 결과를 모르는 시도가 있으면 **새 시도를 넣을 수 없다** → `lookup_sent` 로 화해해 `RETRYABLE_FAILURE`(발송 없음 확인)가 된 뒤에만 재전송. `UNKNOWN` 뒤 곧바로 재전송하는 경로를 DB 가 막는다 | M04 |

- `send_attempt.idempotency_key` 는 **시도마다 다르므로 일반 UNIQUE** 다(`(message_id, attempt_no)` 와 같은 재료라 겹치는 보장이지만, 채널에 넘기는 값의 유일성을 따로 명시한다).
- **U-6 · U-7 의 조건 열 `result` 는 나중에 바뀐다.** PostgreSQL 은 UPDATE 때 부분 인덱스를 다시 평가한다 — 시도가 `RETRYABLE_FAILURE` 로 확정되는 순간 U-7 에서 빠져 다음 시도가 들어올 수 있고, `SUCCESS` 가 되는 순간 U-6 에 들어가 두 번째 성공을 막는다.
- **U-5 범위(F-4)**: Gmail threadId 는 **메일함(연결) 안에서** 유일하다. 그러나 `comm_thread` 에는 채널 연결 참조가 없고(`docs/22` 15.1 — 논리 모델의 실제 관계), Tech Validation 은 채널마다 **전용 계정 하나**다(`docs/18` N · `docs/19`). 그래서 **범위 = 채널 종류**로 둔다. 한 채널에 연결이 둘 이상 생기면 `(channel_connection_id, external_thread_id)` 로 좁혀야 하고, 그때는 스레드에 연결 참조가 필요하다 — **새 논리 컬럼이라 이번에 추가하지 않고 보고한다**(25절). `comm_message.external_message_id`(U-4)도 같은 조건이다.
- P0 밖(`container_bl` 주 B/L = partial unique · `operator_planning_constraint.releases_constraint_id` = 일반 UNIQUE)은 P1 물리 설계에서 같은 방식.

### 13.1 L13-5 — 복구 맥락 뿌리 id 를 복사하지 않는다

- `recovery_run` 에 뿌리 id 를 **복사하지 않는다**. `previous_run_id` 재귀 조회 + `ix_recovery_run__previous_run_id`.
- I-35(`RECOVERY_CONTEXT` 참조는 존재하는 뿌리 run id)는 **쓰기 경로 검사** — Slice 1 회신 사실은 전부 `GLOBAL` 이다(T-069 4.3).

---

## 14. Outbox · 워커 잠금

**Slice 1 흐름**: DB Outbox(= `comm_message.current_status = 'QUEUED'`) → 단일 워커 → 발송 → `lookup_sent` 화해. 큐 제품은 쓰지 않는다(ADR-033 결정 5 · ADR-034 결정 8). **구현: T-090 — `back/src/communication/outbox-dispatcher.ts` · `back/src/app/worker.module.ts`(18.6).**

| 선택지 | 무엇을 보장하나 | Slice 1 |
| --- | --- | --- |
| 단일 워커 보장만(배포 설정으로 1개) | 설정 실수 · 재기동 겹침에 약하다 | 단독으로는 쓰지 않는다 |
| **advisory lock (세션 단위)** | 워커가 DB 로 "나 하나만"을 보장. **연결이 끊기면 자동 해제** → 죽은 워커가 잠금을 쥐고 있지 않다 | **쓴다** — 단일 워커 보장 |
| **`SELECT … FOR UPDATE SKIP LOCKED`** | 여러 워커가 같은 행을 동시에 집지 않는다 | **쓴다** — 픽업. 다중 워커로 넓힐 때 코드가 그대로다 |
| 조합 | 위 둘 + 발송 시도의 DB 최종 방어 | **결정** |

**결정**

1. **워커 시작**: 전용 연결에서 `pg_try_advisory_lock(<outbox 워커 키>)`. 못 잡으면 대기(다른 워커가 돌고 있다). 잡은 연결은 워커가 사는 동안 유지한다.
2. **픽업(T4 → T5, 한 트랜잭션)**: `comm_message` 에서 `current_status = 'QUEUED'` 를 `created_at` 순으로 `FOR UPDATE SKIP LOCKED` · `LIMIT n` → 매 시도 전 재검사(Contact Gate · 개발 안전장치 · 승인 지문 · 계획 유효성) → `send_attempt` 삽입(결과 NULL) → **커밋**. 부분 인덱스 `ix_comm_message__queued` 가 픽업을 받친다.
3. **외부 호출은 트랜잭션 밖**(15절). 행 잠금은 T5 커밋 때 풀린다. 그 사이 다른 워커가 같은 메시지를 다시 집어도 **U-7(메시지당 미확정 1건)** 이 두 번째 시도 삽입을 막고, 성공 뒤에는 **삽입 가드 + U-6(메시지당 성공 1건)** 이 막는다.
4. **결과(T6)**: 별도 트랜잭션에서 결과 한 번 + 상태 전이 + 감사. `SUCCESS` 면 `comm_message.sent_at` 과(첫 발송이면) `comm_thread.external_thread_id` 를 **한 번** 채운다.
5. **화해(재기동 · `UNKNOWN`)**: 결과가 `NULL` 이거나 `UNKNOWN` 인 시도(부분 유일 U-7 의 인덱스가 조회도 받친다)를 `lookup_sent`(`X-CERA-Message` = `message_id`)로 조회한다 — 찾으면 `SUCCESS`(+ `provider_message_id`), 없음이 확인되면 `RETRYABLE_FAILURE`(`RECONCILED_NOT_SENT`), 확인 못 하면 그대로 두고 다음 주기에 다시. **재전송은 `RETRYABLE_FAILURE` 로 확정된 뒤에만** 새 시도(`attempt_no + 1`)로 한다 — U-7 이 이 순서를 DB 에서 강제한다.
6. **다중 워커로 넓힐 때**: 1번만 없앤다. 2~5는 그대로 안전하다.
7. **폴링 주기**: 설정값. 기본 **5초** `[ASSUMPTION]`. 재시도 백오프는 `docs/18` H.3(최대 5회 · 상한 약 10분 `[ASSUMPTION]`).

**advisory lock 키 목록**(64비트 정수 상수, 코드 한 곳에서 관리)

| 키 | 단위 | 쓰는 곳 |
| --- | --- | --- |
| `cera.outbox.worker` | 세션 | 발송 워커 단일 보장 |
| `cera.inbound.poller` | 세션 | 수신 폴링 단일 보장(Slice 1 은 Mock 스크립트 · Slice 2 Gmail) |
| `cera.recon(<좌표 해시>)` | **트랜잭션**(`pg_advisory_xact_lock`) | T10 재계산 — 같은 좌표(개체 + `fact_key` + 범위 + 시뮬레이션)를 동시에 다시 계산하지 않게 |

---

## 15. 트랜잭션 경계 (T-069 12절 → PostgreSQL · Drizzle)

**공통**: `db.transaction(async (tx) => …)` · 격리 수준 **READ COMMITTED**(기본). 동시성은 SERIALIZABLE 재시도 대신 **명시적 행 잠금 · advisory xact lock · UNIQUE/부분 유일 · 트리거**로 막는다. 트랜잭션 콜백 안에서는 **채널 어댑터 · AI Server 포트 · 내용 저장소를 부르지 않는다**(아키텍처 시험으로 강제 — U0). 저장소 함수는 `tx` 를 인자로 받는다.

| # | 경계 | 트랜잭션 안 | 잠금 · 충돌 처리 | 트랜잭션 밖(앞 · 뒤) |
| --- | --- | --- | --- | --- |
| T1 | 초안 생성 | 스레드 · 질문 · 메시지(`DRAFTED`) · 구조화 값 · 메시지↔질문 · 상태 전이 · 감사 | — | **앞**: 내용 생성 4단계(16.2). 고아 내용 허용 · 내용 없는 행 금지(`message_content_ref` NOT NULL CHECK) |
| T2 | 승인 | 승인 행 · 승인 사본 · 상태 `APPROVED` · 포인터 · 감사 | **메시지 행 `FOR UPDATE`** — 같은 승인 요청 두 번(A-06)을 줄 세운다. 이미 유효한 같은 지문 승인이 있으면 그것을 돌려준다 | **앞**: 승인 문장 생성 4단계(16.2) |
| T3 | 무효화 | 무효화 행 · 상태 전이 · 감사 | U-2 UNIQUE. 계획 교체는 **새 실행 등록과 같은 트랜잭션** | — |
| T4 | 발송 준비 | 상태 `QUEUED` | — | — |
| T5 | **발송 시도 선커밋** | 픽업 + 재검사 + `send_attempt`(결과 NULL · `attempt_no` · 시도별 `idempotency_key`) | `FOR UPDATE SKIP LOCKED` · U-7 · 삽입 가드(성공·영구 실패 뒤 거부) | **뒤(밖)**: `ChannelAdapter.send()` |
| T6 | 발송 결과 | 결과 한 번 · 상태 `SENT`/`DELIVERY_FAILED` · `sent_at` 한 번 · (첫 발송) `external_thread_id` 한 번 · 감사 | 결과 가드 · 한 번 채움 트리거 · U-6 | 필요하면 `system_error`(**별도 트랜잭션**) |
| T6r | **화해** | `NULL`/`UNKNOWN` → `SUCCESS`(`provider_message_id`) 또는 `RETRYABLE_FAILURE`(`RECONCILED_NOT_SENT`) · 성공이면 T6 와 같은 한 번 채움 · 상태 전이 · 감사 | 결과 가드(증거 검사) · U-6 | **앞(밖)**: `lookup_sent()` |
| T7 | 수신 | `raw_input` · 메시지(INBOUND) · 스레드 연결 또는 보류 | `INSERT … ON CONFLICT DO NOTHING`(U-3 · U-4) — 충돌이면 **전체 건너뜀** | **앞**: 원문 생성 4단계(16.2) |
| T8 | 추출 | 추출 행(들) | — | **앞**: AI Server 호출(Slice 1 녹화 재생) · 인용 생성 4단계(16.2) |
| T9 | 사건 생성 | 사건 · 링크 · 추출 검토 `ACCEPTED` | `ON CONFLICT (idempotency_key) DO NOTHING` · 지연 트리거(커밋 시) | — |
| T10 | 재계산 | 좌표별 파생 3표 지우고 다시 쓰기 | **`pg_advisory_xact_lock(cera.recon, 좌표)`** | — |
| T11 | 사람 확인 | `VERIFICATION` 사건 · 확인 대상 · (요청 처리면) 처리 기록 · 감사 | `raw_input` 명령 id UNIQUE(9절) · 지연 트리거 | 그다음 T10 |
| T12 | 파기(시험 명령) | 감사 `CONTENT_PURGED` · `SUCCESS` | — | **앞**: 29.7 조건 조회(읽기) → 내용 `purge` → **없어졌는지 확인**(16.2) |

- `system_error` 는 업무 트랜잭션이 롤백돼도 남아야 하므로 **항상 별도 트랜잭션**(가능하면 별도 연결)으로 쓴다.
- 감사(`audit_log`)는 그 행위와 **같은 트랜잭션**이다 — 행위가 롤백되면 감사도 없어야 한다. 예외는 T12 의 실패 감사(`FAILURE`)로, 별도 트랜잭션이다.

---

## 16. 내용 저장소 참조 (D-5)

`docs/22` 29절 "보관 관리 내용"의 물리 위치를 정한다.

### 16.1 위치

**결정(D-5 — 승인): 내용은 PostgreSQL 밖에 둔다. `ContentStore` 포트 하나를 로컬·시험·운영이 같이 쓰고, 어댑터만 바꾼다.**

| 선택지 | 파기 의미 | 트랜잭션 | 크기 | 로컬=운영 |
| --- | --- | --- | --- | --- |
| DB 안 별도 표(`bytea`) | **약하다** — DELETE 뒤에도 WAL·백업·PITR 에 남는다. "파기됨"을 보장하려면 백업 보관까지 다뤄야 한다 | 기록과 같은 트랜잭션 가능 | 원문·첨부가 DB 를 키운다 | 같음 |
| **DB 밖(파일 · 객체 저장소)** ← 결정 | 저장소에서 지우면 끝(객체 저장소의 버전 관리는 끄거나 보관 정책을 맞춘다 — 운영 준비 때) | 트랜잭션 밖 — **T-069 12절이 이미 이 순서로 설계됐다**(내용 먼저, 행 나중, 고아 허용) | 문제없음 | 포트가 같다 |

### 16.2 생성 · 파기 일관성 (D-5 보완)

**생성** — 내용이 기록보다 먼저, 기록은 확인된 내용만 가리킨다.

| 순서 | 무엇 | 실패하면 |
| --- | --- | --- |
| 1 | `ContentStore.put` — 새 `cref` 로 쓴다 | 끝(DB 에 아무것도 없다) |
| 2 | `exists(cref)` — 실제로 있는지 확인 | 끝(쓰다 만 내용은 고아 — 정리 대상) |
| 3 | 저장된 바이트의 SHA-256 을 기대 지문과 대조(바이트 지문이거나, `msg-content/1` 을 다시 계산) | 끝(고아) + `system_error` |
| 4 | **DB 트랜잭션**에서 `cref` + 지문을 기록 행에 넣고 커밋 | 커밋 실패 → **고아 내용 허용**(정리·화해 작업 대상. 기록이 가리키지 않으므로 파기 감사 대상이 아니다) |

- **"참조는 있는데 내용이 없는" 행은 정상 생성 흐름에서 만들지 않는다.** 그 상태가 보이면 17절 판정대로 손실(`CONTENT_MISSING`)이거나 정상 파기다.
- 고아 정리: 기록 행이 가리키지 않는 `cref` 를 주기적으로 찾아 지운다 — 생성 뒤 일정 시간이 지난 것만(진행 중 트랜잭션과 겹치지 않게). Slice 1 은 남겨 둬도 된다(DEFERRED).

**파기** — 내용이 먼저 없어지고, 확인된 뒤에만 성공 감사.

| 순서 | 무엇 |
| --- | --- |
| 1 | 29.7 조건 확인(진행 중 흐름이 쓰는 내용이 아닌가 — 읽기) |
| 2 | `ContentStore.purge(cref)` |
| 3 | `exists(cref) = false` 확인 |
| 4 | `audit_log` `CONTENT_PURGED` · `SUCCESS`(T12). 2~3 이 실패하면 `FAILURE` 감사(별도 트랜잭션) + `system_error` |

Q-45 규칙(`docs/22` 29.8.1) 그대로다 — 기록 행 · 참조 · 지문은 바뀌지 않는다.

### 16.3 포트와 참조 형식

**포트**

| 동작 | 뜻 |
| --- | --- |
| `put(category, bytes, media_type) → { ref, sha256 }` | 새 내용. 저장 뒤 지문을 돌려준다 |
| `get(ref) → bytes \| ABSENT` | 없으면 `ABSENT`(예외가 아니다) — 판정은 17절 |
| `exists(ref) → boolean` | 점검 작업용 |
| `purge(ref) → PURGED \| NOT_FOUND` | 제거 후 **다시 확인**해서 없을 때만 `PURGED` |

**참조 형식**: `cref:v1:<범주>:<uuidv7>`

| 범주 | 기록 컬럼 | 저장 문서 | 기록 쪽 지문과의 관계 |
| --- | --- | --- | --- |
| `RAW_INPUT_PAYLOAD` | `raw_input.payload_ref` | 원문 바이트(RFC822 · 명령 JSON 등, 첨부 포함) | `payload_hash` = 저장 바이트 SHA-256 |
| `COMM_MESSAGE_CONTENT` | `comm_message.message_content_ref` | JCS `{subject, body_text}` | `content_hash` = `msg-content/1`(수신자·구조화 값 포함)을 **다시 계산해 대조** |
| `MESSAGE_APPROVAL_CONTENT` | `message_approval.approved_content_ref` | JCS `{subject, body_text}` | `approved_content_hash` 로 같은 방식 |
| `EXTRACTION_SOURCE_QUOTE` | `extraction.source_quote_ref` | 인용 UTF-8 바이트 | `source_quote_hash` = 저장 바이트 SHA-256 |
| `COMMERCIAL_OFFER_CONDITIONS` | (P1 `commercial_offer.conditions_content_ref`) | — | P1 |

- **내용 주소 방식(해시를 참조로)을 쓰지 않는다.** 같은 내용을 두 기록이 공유하면 한쪽 파기가 다른 쪽 내용을 지운다. 참조는 **기록마다 새 uuid** 다.
- 참조는 **불투명**하다 — 기록 id 나 해시를 담지 않는다. 범주만 담아 감사 `target_type` 과 같은 어휘로 쓴다.
- 기록 컬럼 CHECK: 형식 `^cref:v1:<그 컬럼의 범주>:<uuid>$` — 다른 범주의 참조가 들어갈 수 없다.
- **로컬·시험 어댑터**: 파일 시스템. 뿌리 디렉터리는 설정(`CERA_CONTENT_DIR`), 기본값은 **gitignore 된 `data/raw/content/`**(실제 메일·원문은 커밋하지 않는다 — `docs/01` 6절 · `docs/18` G.7). 배치: `<뿌리>/<범주>/<uuid 앞 2자리>/<uuid>` + 옆에 메타데이터(`sha256` · `size` · `media_type` · 저장 시각) — **파일명·내용 요약을 메타데이터에 넣지 않는다.**
- **운영 어댑터**: 객체 저장소 — **제품은 정하지 않는다.** 암호화·접근 통제·버전 관리 정책은 운영 준비(Pilot) 때 `[TO VERIFY]`.

---

## 17. 파기와 내용 손실 판정

`docs/22` 29.8.1 을 물리로 가능하게 하는 것: **참조(기록 행) × 저장소 존재 × 감사 행.**

| 내용(`exists(ref)`) | 성공 파기 감사 | 판정 | 처리 |
| --- | --- | --- | --- |
| 있다 | 없다 | 보관 중 | 정상 |
| 없다 | 있다 | 정상 파기 | 화면 "보관 정책에 따라 파기됨" |
| 없다 | 없다 | **데이터 손실** | `system_error` `CONTENT_MISSING`(참조·범주만, 내용 없음) |
| 있다 | 있다 | **파기 불일치** | `system_error` `CONTENT_PURGE_MISMATCH` |

- **"성공 파기 감사"의 조회**: `audit_log` 에서 `action = 'CONTENT_PURGED' AND result = 'SUCCESS' AND target_type = <범주> AND target_id = <기록 id>`. 부분 인덱스 `ix_audit_log__content_purged`(22.3)가 받친다. 참조 1개 = (범주, 기록 id) 1개라서 이 키로 충분하다.
- **감사 쪽 `target_id`** 는 기록 id(uuid 문자열)다. 참조 값을 그대로 넣지 않아도 되지만, `before_ref` 에 참조를 적는다(내용은 넣지 않는다).
- **`result` 값**: `SUCCESS` · `FAILURE`(`docs/22` rev.2.5 에서 29.8 표기를 작업표 값으로 통일).
- **순서(T12)**: 16.2 파기 4단계. 중간에 멈추면 "없음 + 감사 없음" = 손실로 **시끄럽게** 드러난다(29.8.1).
- **기록 행은 절대 바뀌지 않는다**: append-only 표는 앱 역할에 UPDATE 권한이 없고(12.2), 제어된 갱신 표(`comm_message`)는 열 가드 트리거가 참조·지문 열의 변경을 거부한다(12.3).
- 점검 작업(주기 · 읽을 때)이 같은 판정을 한다 — 판정 함수는 순수 함수(입력 = 존재 여부 + 감사 존재 여부)로 두어 단위 시험(C-01~03)한다.

---

## 18. Drizzle 과 SQL 의 경계

| 분류 | 뜻 | 표 |
| --- | --- | --- |
| **NORMAL** | Drizzle 스키마(타입 · PK · FK · UNIQUE · CHECK · 부분 인덱스)로 전부 표현된다 | `scenario` · `actor` · `counterparty` · `counterparty_contact` · `contact_channel_address` · `facility` · `truck_pool` · `canonical_fact` · `conflict` · `verification_request` **(10)** |
| **DRIZZLE_PLUS_SQL** | + custom migration 의 **트리거**(append-only · 열·한 번 채움 가드 · 전이 가드 · 삽입 가드 · 캐시) | `audit_log` · `system_error` · `planning_snapshot` · `recovery_run` · `comm_thread` · `question_item` · `comm_message` · `comm_message_structured_field` · `comm_message_question` · `message_approval_structured_field` · `message_status_transition` · `raw_input` · `extraction` · `verification_request_handling` **(14)** |
| **POSTGRES_NATIVE** | 정확성이 PostgreSQL 고유 동작에 기대는 곳 — **지연 제약 트리거 · 행 사이 불변식 · 부분 유일 + 잠금 의미** | `message_approval` · `send_attempt` · `event` · `event_entity_link` · `event_verification_target` **(5)** |

(합 29.)

**Drizzle 스키마로 쓰지 않고 custom SQL migration 으로 쓰는 것 — 전체 목록**

| # | PostgreSQL 기능 | 어디 | 왜 Drizzle 밖인가 |
| --- | --- | --- | --- |
| N-1 | 트리거 함수(PL/pgSQL) + 트리거 | 12.3 전부 | Drizzle 스키마에 트리거 개념이 없다 |
| N-2 | **지연 제약 트리거**(`CREATE CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED`) | 승인 사본 · 사건 링크·대상 | 같다 |
| N-3 | `BEFORE TRUNCATE` 문장 트리거 | 12.3 | 같다 |
| N-4 | 역할별 **표 단위 GRANT**(열 단위는 필요할 때만) | 12.2 | Drizzle 이 권한을 다루지 않는다 |
| N-5 | 스키마 `cera` 생성 · 기본 권한(`ALTER DEFAULT PRIVILEGES`) | M01 앞 | 같다 |
| N-6 | advisory lock 함수 호출 | 14 · 15 | 스키마가 아니라 쿼리 — Drizzle `sql` 탈출구로 |
| N-7 | `FOR UPDATE SKIP LOCKED` | 14 | Drizzle 쿼리 빌더가 지원(**U0 확인 18.1**) |
| N-8 | `INSERT … ON CONFLICT DO NOTHING RETURNING` | T7 · T9 | Drizzle 지원(`onConflictDoNothing`) — 스키마 밖 쿼리 |
| N-9 | 재귀 CTE(계보 뿌리) | 13.1 | `sql` 탈출구 |
| N-10 | CHECK 제약의 `NOT VALID` → `VALIDATE` 교체 | 3절 CLOSED 값 변경 | drizzle-kit 이 두 단계로 만들지 않는다 — 손으로 고친다 |

**Drizzle 로 쓰되 U0 첫 시험에서 확인할 것** — **결과는 18.1**: `check()` 가 생성 SQL 에 들어가는가 · `uniqueIndex().where()` 부분 유일 · 유일 제약(비 PK)을 가리키는 **복합 `foreignKey()`** · `uuid().array()` · `timestamp({ mode: 'string' })` 의 실제 반환 형식 · `bigint({ mode: 'bigint' })` · `numeric` 문자열 반환 · custom migration 생성 명령과 적용 순서 · rename 감지 때 프롬프트 동작.

> **Drizzle 편의를 위해 불변식을 약화하지 않는다.** 위 항목이 Drizzle 판에서 안 되면 그 제약을 custom SQL 로 옮기지, 제약을 빼지 않는다.

### 18.1 U0 확인 결과 (T-085 · 2026-09-22)

로컬 PostgreSQL **18.6**(Docker) · drizzle-orm **0.45.3** · drizzle-kit **0.31.11** · node-postgres **8.23.0** 에서 시험으로 확인했다(`back/test/db/drizzle-kit.test.ts` · `drizzle-runtime.test.ts`). 시험은 일회용 스키마(`cera_spike_*`)만 쓰고 지운다 — 제품 스키마·migration 은 만들지 않았다.

| 항목 | 결과 | 내용 |
| --- | --- | --- |
| `check()` → 생성 SQL | **VERIFIED** | `CONSTRAINT … CHECK (…)` 가 CREATE TABLE 안에 들어간다. 식 안의 열 이름을 `"스키마"."표"."열"` 로 적지만 PostgreSQL 이 받아들이고 실행 시 거부도 된다 |
| `uniqueIndex().where()` 부분 유일 | **VERIFIED** | `CREATE UNIQUE INDEX … WHERE …` 생성 · 적용 · 실행 시 23505 거부(U-1 · U-7 모양) |
| 비 PK 유일 제약을 가리키는 복합 `foreignKey()` | **VERIFIED** | `UNIQUE("id","channel")` + `FOREIGN KEY (…,…) REFERENCES …(…,…) ON DELETE restrict ON UPDATE restrict` · 실행 시 23503 |
| `uuid().array()` | **VERIFIED** | `uuid[]` 생성 · 읽으면 `string[]` |
| `timestamp({ withTimezone, precision: 3, mode: 'string' })` | **VERIFIED + NOTE** | `timestamp(3) with time zone`. node-postgres 는 **`2026-09-22 09:04:14.246+00`**(세션 UTC) 문자열을 돌려준다 → `Instant.fromDb()` 로 바꾼다. **밀리초 아래는 PostgreSQL 이 반올림**한다(자르지 않는다) — 앱이 밀리초 Instant 만 쓰므로 영향 없음 |
| `bigint({ mode: 'bigint' })` | **VERIFIED** | JS `bigint` 로 2^63−1 까지 정확히 왕복 |
| `numeric` | **VERIFIED** | 열의 scale 대로 문자열(`'12.3400'`) — 부동소수 아님 |
| `uuid` | **VERIFIED** | 소문자 문자열 |
| 세션 `TimeZone = UTC` | **VERIFIED** | 풀 연결 옵션 `-c TimeZone=UTC` |
| `FOR UPDATE SKIP LOCKED`(N-7) | **VERIFIED** | 쿼리 빌더 `.for('update', { skipLocked: true })` — 다른 트랜잭션이 잠근 행을 건너뛴다. `sql` 탈출구가 필요 없다 |
| `onConflictDoNothing().returning()`(N-8) | **VERIFIED** | 중복이면 빈 배열 |
| `sql` 템플릿 | **VERIFIED** | 값은 매개변수로 넘어간다(인젝션 문자열이 그대로 저장) |
| 트랜잭션 | **VERIFIED** | 커밋 · 오류 시 롤백 · 격리 수준 명시(`read committed`) |
| custom migration 생성·적용 순서 | **VERIFIED + NOTE** | `drizzle-kit generate --custom --name <이름>` 이 빈 SQL 파일을 만들고 journal 순서에 끼운다. 트리거·함수·GRANT 를 손으로 쓰고 `--> statement-breakpoint` 로 나눈다. 생성 SQL 과 함께 migrator 로 순서대로 적용된다 |
| migration 이력 표(20절) | **VERIFIED** | `migrations: { schema, table }` 설정으로 스키마 `cera_meta` · 표 `drizzle_migrations` 에 둔다(시험은 `cera_spike_meta`) |
| 소유 역할 ≠ 앱 역할(12.2) | **VERIFIED** | 앱 역할로 `DISABLE TRIGGER` · `CREATE TABLE`(cera · public) · `TRUNCATE` 모두 42501 거부. custom migration 트리거가 앱 역할의 UPDATE/DELETE 를 거부 |
| `push` 미사용 | **VERIFIED** | `back/package.json` 에 `drizzle-kit push` 스크립트 없음(시험이 검사) |
| rename 감지 프롬프트 | **IMPLEMENTATION NOTE** | 대화형이라 자동 시험 대상이 아니다. U1 부터 **이름 변경은 생성 SQL 을 사람이 반드시 확인**한다(20절 파괴적 migration 표시) |
| drizzle-kit 첫 실행 부작용 | **IMPLEMENTATION NOTE** | `generate` · `check` 는 처음 돌 때 **빈 `drizzle/migrations/meta/_journal.json`** 을 만든다. U0 는 제품 migration 이 없으므로 지웠다 — U1 첫 migration 과 함께 커밋한다 |
| ENUM diff(3절) | **해당 없음** | ENUM 을 쓰지 않는다 |
| PostgreSQL `uuidv7()`(4절) | **NOTE** | PostgreSQL 18 에 있다 — 그래도 **앱이 생성**한다(4절 결정 그대로, 버전 무관) |
| `bigint({ mode: 'string' })`(6절 비교표) | **해당 없음** | `mode: 'bigint'` 로 확정했다 |
| 내용 저장소 운영 정책(16절) | **미확인 — Pilot** | U0 범위 밖 |

### 18.2 U1 구현 확인 결과 (T-086 · 2026-10-02)

이 문서대로 `back/src/db/schema/`(Drizzle) · `back/drizzle/migrations/`(M01~M10)를 만들고, **빈 `cera_test` 에 M01 → M10 을 처음부터** 적용한 결과를 PostgreSQL 카탈로그로 확인했다(`back/test/db/global-setup.ts` · `schema-catalog.test.ts` · `invariants.test.ts` · `permissions-migrations.test.ts`). 시험은 이 문서 22절을 직접 읽어 컬럼 하나씩 대조한다.

| 항목 | 결과 |
| --- | --- |
| 표 · 컬럼 | **29표 · 349컬럼** — 이름 · 순서 · 타입 · NULL · 기본값 모두 22절과 일치(불일치 0) |
| CODE | CLOSED **54** 컬럼 = `CHECK IN` 값 목록 일치 · CATALOG **27** · 규칙 id 2 형식 CHECK · ENUM 0 · DB 생성 id/시각 기본값 0 |
| 키 | PK 29(`pk_<표>`) · FK **58**(복합 **13**) · `CASCADE` 0 · `SET NULL` 1(`verification_request.conflict_id`) · 나머지 RESTRICT |
| 부분 유일 | U-1 · U-6 · U-7 존재 + 실행 시 23505 확인 · Outbox = `ix_comm_message__queued`(표 없음) |
| 트리거 | 함수 **17**(12.3 표와 1:1) · 트리거 70(2026-10-06 `tg_actor__guard_columns` +1) · 함수 안 `now()` 0 · 전용 SQLSTATE `CE001`~`CE006`(`back/src/db/sqlstate.ts`) |
| 권한 | 29표 모두 표 단위 GRANT(12.2 묶음대로) · 앱 역할 DDL · DROP · TRUNCATE · 트리거 해제 · `cera_meta` 읽기 42501 |
| migration | 이력 10행 = 파일 SHA-256 · 세 번 적용해도 10행(반복 안전) · `drizzle-kit check` 통과 · 스키마 ↔ migration 차이 0 |

**구현 메모(설계 해석 — 사용자 확인 대상)**

| # | 내용 |
| --- | --- |
| U1-1 | 이름 63자 제한 때문에 FK 하나를 줄였다: `fk_message_approval_structured_field__approved_src_question`(컬럼 `approved_source_question_item_id`). 다른 이름은 2절 규칙 그대로. 스키마 로드 때 63자 초과를 거부한다 |
| U1-2 | 승인 삽입 가드의 "계획 기반이면 `approved_plan_run_id`"를 **"메시지 구조화 값 중 `source_run_id` 가 있는 것이 있으면"** 으로 판정했다. **2026-10-06 보강(U1-11)**: 커밋 시 검사가 값의 실행이 하나뿐인지, `approved_plan_run_id` 가 그 실행과 같은지도 본다 |
| U1-3 | 승인 사본 지연 검사(`fn_cera_check_approval_copies`)를 승인 행 삽입뿐 아니라 **사본 행 삽입에도** 붙였다(같은 함수 · 같은 불변식 — 나중에 사본을 더해 어긋나게 하는 경로를 막는다) |
| U1-4 | 발송 시도 삽입 가드: 결과 5컬럼은 삽입 때 비어 있어야 한다("NULL → 결과 한 번")와 **OUTBOUND 메시지에만** 시도를 둔다를 함께 검사한다. 결과 가드는 결과가 NULL 인 채로 다른 결과 컬럼만 바꾸는 것도 거부한다 |
| U1-5 | `ALTER DEFAULT PRIVILEGES` 는 쓰지 않았다(N-5) — 새 표가 자동으로 권한을 받지 않게 M10 이 표마다 명시 GRANT 한다. 시험이 29표 모두 GRANT 가 있는지 확인한다 |
| U1-6 | 한 번 채움 트리거는 `BEFORE UPDATE OF <열>` 이다 — 그 열이 SET 에 있을 때만 돌고, 값이 있으면 같은 값 재기록도 거부한다 |
| U1-7 | 내용 저장소 로컬 어댑터 뿌리 설정 이름은 `CERA_CONTENT_DIR`(기본 `../data/raw/content` — gitignore). 파일 옆 `<uuid>.meta.json` 에 sha256 · size · media_type · stored_at 만. 고아 정리는 DEFERRED(16.2) |
| U1-8 | `system_error` 오류 코드는 U1 이 쓰는 최소 값만 앱 카탈로그에 두었다(`back/src/persistence/catalog.ts`). 전체 목록은 Q-66(OPEN) |
| U1-9 | **독립 검토(2026-10-02)로 고친 것**: ① 승인 사본 검사를 메시지 구조화 값 삽입에도 붙였다 — 승인 뒤 메시지 값을 더해 사본과 어긋나게 하는 경로 차단 ② `comm_message.current_status` 는 **캐시 열**(`@current_status`): 상태 전이 트리거 안에서만 바뀐다(직접 UPDATE 거부 — 캐시가 정본과 어긋나지 않게) ③ BUSINESS 발송 시도도 `sent_content_hash = 메시지 content_hash` 를 검사(`docs/22` 15.7.2 "작성한 내용 ≠ 보낸 내용은 어느 종류에서도 불허") ④ 발송 시도 삽입 가드가 메시지 행을 `FOR UPDATE` 로 잠근다(동시 결과 확정과 줄 세움) ⑤ 이미 없는 내용의 파기 요청: 앞선 성공 감사가 있으면 멱등, 없으면 `CONTENT_MISSING` — 성공 감사로 덮지 않는다 |
| U1-10 | **남은 위험(알림)**: (a) ~~`cera_app` 이 `actor_type` 을 바꿔 사람 승인 가드를 우회~~ → **U1-11 에서 해소** (b) 상태 캐시는 삽입 순서를 따른다(`occurred_at` 순서가 아님) — 전이는 시계 순서대로 넣는다는 앱 규칙 (c) T3(무효화) · T6(결과)도 메시지 행을 잠가야 삽입 가드의 줄 세움이 완전하다 — U4 · U5 구현 때 |
| U1-11 | **T-086 최종 안전성 검토(2026-10-06)로 고친 것**: ① **`actor_type` 불변**(22.2 정본) — 고치기 전 스키마에서 `cera_app` 이 SYSTEM actor 를 HUMAN 으로 UPDATE 할 수 있음을 실제로 확인(승인 가드 우회 가능) → M07 에 `tg_actor__guard_columns`(`display_name` · `is_active` 만 변경, 그 밖 CE002). 마스터 열 가드 금지(12.1)의 유일한 예외 ② **계획 기반 승인 = 한 실행**(`docs/22` 15.5 `approved_plan_run_id` "어느 계산 결과를 근거로" · `docs/19` FR-COM-10 · FR-APV-06): M08 `fn_cera_check_approval_copies` 가 커밋 때 메시지 값의 `source_run_id` 가 2개 이상이면 CE006, 1개면 `approved_plan_run_id` = 그 실행(아니면 CE006). 값에 `source_run_id` 가 없으면 계획 무관 승인 그대로 ③ **`system_error` 기록 실패가 원래 오류를 덮지 않음**: `SystemErrorRecorder.record` 가 문맥 · ID 생성 · 삽입 · 실패 로그 어디서 실패해도 던지지 않고 `null`, `ApiErrorFilter` 는 기록을 기다리지 않고 rejection 을 삼킨다(처리되지 않은 rejection 으로 프로세스가 흔들리지 않게). 회귀 시험 +9(135). 다른 마스터(`counterparty_contact` · `contact_channel_address` · `facility` 등)의 "불변" 열은 여전히 A층 책임 — 22절 문구와 B층 강제 사이 차이는 후속 판단 |


---

### 18.3 U2 구현 확인 결과 (T-087 · 2026-10-06)

| 항목 | 결과 |
| --- | --- |
| migration | **M11 = `0010_m11_registry_guards.sql`**(custom) — 함수 17 그대로 · 트리거 **72**(+2) · 이력 11행 · fresh M01→M11 2회 적용 안전 |
| 판정 | `back/src/registry/contact-gate.ts` — **import 0**(순수 함수, 시험이 검사) · 6조건 · 사유 6종(`CONTACT_INACTIVE` 추가 — T-087 D1) · 개발 안전장치는 실채널(GMAIL · PORTAL) × 비운영(`local` · `test` · `staging`)만, 목록 비면 전부 차단(D2) |
| API | `GET /registry/counterparties` · `GET /registry/addresses/{addressId}/eligibility`(404 `ADDRESS_NOT_FOUND` · 400 `INVALID_ID`). 읽기 전용 · 감사 없음 · 판정 저장 없음 |
| 시드 | 25행(+5: 창고 A 거래처 · 연락처 · `UNVERIFIED`/`PENDING` 주소, K운송 야간 연락처 · `PAUSED` 주소) |
| 계약 | `packages/contracts/openapi.json` 에 응답 스키마 · `openapi.d.ts`(openapi-typescript 7.13.0 생성, 프론트 시험이 최신인지 검사) |

| # | 구현 메모 |
| --- | --- |
| U2-1 | **M11 등록부 불변 열 가드** — 고치기 전에는 `cera_app` 이 `normalized_address` 를 바꿔 승인된 메시지를 다른 주소로 돌릴 수 있었다(승인 · 발송 가드는 `address_id` 로 맞춘다). 22절 "불변" 열을 B층으로 강제(12.1 예외) |
| U2-2 | 주소 표에 `is_active` 가 없다 — FR-ELG-01 ③ "주소 활성"과 ⑥ "통신 활성"은 같은 `communication_status` 를 본다(`PAUSED` = ③ 통과 · ⑥ 실패). 사유 코드는 `NOT_ACTIVE` 하나만 낸다 |
| U2-3 | OpenAPI 경로 매개변수는 `@ApiParam` 으로 명시한다 — `openapi:emit` 은 tsx(esbuild)로 돌아 decorator metadata 가 없어서, 명시하지 않으면 실행 방식에 따라 문서가 달라졌다(시험이 잡음) |
| U2-4 | 개발 안전장치 목록 `CERA_TEST_RECIPIENT_ALLOWLIST` 는 zod 로 정규화(소문자 · 공백 제거)하고 값은 로그에 남기지 않는다 |

### 18.4 U3 구현 확인 결과 (T-088 · 2026-10-06)

- **DB 변경 없음**(M11 그대로) — 스레드 · 질문 · 메시지 · 구조화 값 · 메시지↔질문 · 상태 전이를 P0 표 그대로 쓴다
- 흐름: `POST /communication/drafts` → Contact Gate → 값 형식 · 출처 확인 → 템플릿 문장(`drafted_by = TEMPLATE`) → 숫자 검사(순수 함수 `communication/number-check.ts`) → 내용 저장소(트랜잭션 밖) → **한 트랜잭션**(스레드 · 질문 · 메시지 · DRAFTED 전이 · 구조화 값 · 질문 연결 · 통과 시 PENDING_APPROVAL 전이)

| # | 구현 메모 |
| --- | --- |
| U3-1 | `BLOCKED_NUMBER_CHECK` 는 **메시지 상태 코드가 아니다**(CHECK 목록에 없음) — 검사에 걸린 초안은 `DRAFTED` 에 머물고, 통과한 초안만 `PENDING_APPROVAL` 로 전이한다. 검사 결과는 저장하지 않고 읽을 때마다 내용 + 구조화 값으로 다시 계산한다(결정론). U4 승인은 `PENDING_APPROVAL` + 재검사 통과를 조건으로 삼는다 |
| U3-2 | 숫자 검사는 제목 + 본문의 날짜 · 시각 · 금액 · 수량 토큰이 구조화 값 집합 안에 있는지 본다(docs/18 D.2). 이름 · 질문 표식(`[문의 Q1]`) · 구조화 문자 값 표기 안의 숫자는 **고정 문구**로 빼고 본다 — 예: "터미널 T1"의 1. 고정 문구는 DB 행에서 같은 규칙으로 다시 만든다 |
| U3-3 | 수정(FR-COM-12)은 **새 메시지**(`drafted_by = HUMAN`, 같은 스레드 · 구조화 값 · 질문) + 이전 메시지 `CLOSED` 전이. 내용 불변 원칙 그대로 |
| U3-4 | 인증이 아직 없어 상태 전이 행위자는 시드 SYSTEM actor 다(운영자 수정도). 사람 행위자 기록은 인증이 생기는 단위에서 |
| U3-5 | 값의 출처: `source_path` 가 있는 값만 `source_run_id` 를 받는다(나머지는 계획 무관). 실행은 메시지당 하나(T-086 U1-11 과 같은 규칙). **값이 그 실행의 부족분과 실제로 같은지는 아직 대조하지 않는다** — 실행의 부족분이 DB 에 없다(계획 결과 저장은 Solver · 계획 단위) |
| U3-6 | `TRUCK_SLOT` 에서 대상을 주지 않으면 그 운송사 소유 트럭 풀(정확히 하나)을 Backend 가 고른다. 다른 운송사의 트럭은 물을 수 없다(422) |

### 18.5 U4 구현 확인 결과 (T-089 · 2026-10-07)

| 항목 | 결과 |
| --- | --- |
| migration | **M12 = `0011_m12_approval_guards.sql`**(custom) — 함수 **19**(+2: `fn_cera_guard_approval_decision` · `fn_cera_lock_plan_run`) · 트리거 **73**(+1) · 이력 12행 · 표 29 그대로 · 재실행 안전. **새 표 · 새 열 · 새 상태 코드 0** — P0 승인 표 2개(`message_approval` · `message_approval_structured_field`)를 그대로 쓴다 |
| API | `POST /communication/drafts/{messageId}/approve`(요청 = 운영자가 본 `content_hash`) · `POST /communication/drafts/{messageId}/reject`(사유 필수) · `POST /communication/approvals/{approvalId}/revoke` · `GET /communication/approvers`. 결정 명령은 헤더 `X-CERA-Actor-Id`(활성 HUMAN actor 인지 서버가 확인) |
| 읽기 | `DraftDto.approval`(상태 `NONE · ACTIVE · EXPIRED · REVOKED · INVALIDATED · REJECTED` · `usable_for_send` = 15.5.1 여섯 조건 · 승인 사본 · 끝낸 행 · 반려 · 이력) · `DraftDto.revision`(이전 · 다음 수정본 · "내용 변경으로 재승인 필요") · `blocked_reasons` 8종 |
| 판정 | 순수 모듈 `communication/approval-rules.ts`(유효한 승인 · 승인 불가 이유) · `communication/message-content.ts`(`msg-content/1` · 내용 문서) — import 는 시간 타입뿐 |

| # | 구현 메모 |
| --- | --- |
| U4-1 | **T-088 의 `content_hash` 가 8.2 와 달랐다** — 제목 · 본문 바이트만 해시했다. 8.2 `msg-content/1`(받는 주소 · 제목 · 본문 · 구조화 값 `field_key` 정렬, 값 · 단위, JCS)로 고쳤다. 내용 문서도 JCS `{subject, body_text}`(16절). T-088 때 만든 로컬 초안은 읽을 수 있지만(옛 `{subject, body}` 도 읽음) 다시 계산한 지문과 맞지 않아 승인할 수 없다(`CONTENT_HASH_MISMATCH`) |
| U4-2 | **M12 메시지 단위 가드**(`BEFORE INSERT message_approval`, M08 가드보다 먼저): 메시지 행 `FOR UPDATE` 로 같은 메시지의 결정을 줄 세움 · `APPROVED` 는 메시지가 `PENDING_APPROVAL` 또는 `APPROVED`(재승인)일 때만, 승인 지문 = 메시지 지문, 그 시각(`NEW.decided_at`)에 살아 있는 승인이 없을 때만(FR-APV-10) · 계획 기반이면 근거 실행이 새 실행으로 교체되지 않았을 때만 · `REJECTED` 는 승인 대기 메시지에만 · `REVOKED` · `INVALIDATED` 는 성공 · 미확정 발송 시도가 없을 때만(FR-APV-08 · 12) |
| U4-3 | **승인 = 그 순간의 내용**: 요청이 `content_hash` 를 가져오고, 행에 지문 · 수신자 · `approved_plan_run_id` · 제목 · 본문 사본(`MESSAGE_APPROVAL_CONTENT`, 트랜잭션 밖에서 먼저 저장 — 12절 T2) · 구조화 값 사본을 고정한다. 읽을 때 사본을 다시 해시해 `copy_verified` 로 보여준다. 유효 기한 = `CERA_APPROVAL_TTL_MINUTES`(기본 1440, [ASSUMPTION]) |
| U4-4 | **승인 직전 재검증**(트랜잭션 밖 → 잠근 뒤 다시): 대체된 수정본(`MESSAGE_SUPERSEDED`) · 지문(`CONTENT_CHANGED`) · 살아 있는 승인(같은 지문이면 그 승인을 돌려준다 — 멱등) · 내용 부재 · 지문 재계산 · 숫자 검사(422 `NUMBER_CHECK_FAILED`) · Contact Gate(403) · 계획 교체(`PLAN_SUPERSEDED`) · 상태. 동시 요청은 메시지 행 잠금 뒤 다시 본 승인 행으로 하나만 남는다(API 인스턴스 2개로 시험) |
| U4-5 | **상태 코드는 늘리지 않았다**(`docs/22` 15.8.1). 반려 = `PENDING_APPROVAL → REJECTED`. 승인 취소 · 무효화는 새 행이고 메시지 상태는 `APPROVED` 그대로(`PENDING_APPROVAL` 로 돌아가지 않는다) — 재승인은 같은 메시지에 새 `APPROVED` 행 + `APPROVED` 전이 한 줄(이력). 수정본이 생기면 이전 메시지는 `CLOSED`(T-088 U3-3 규칙을 `APPROVED` · `REJECTED` 에서도 씀 — `docs/18` E.1 상태도에 없는 화살표 `APPROVED → CLOSED` · `REJECTED → CLOSED`) |
| U4-6 | **변경 후 재승인**: 수정(본문 · 구조화 값)은 새 메시지 + 같은 트랜잭션에서 이전 메시지의 살아 있는 승인에 `INVALIDATED(CONTENT_CHANGED)`(SYSTEM) + 이전 메시지 `CLOSED` + `current_approval_id = NULL`. 값 수정: 질문 대상을 정하는 값(날짜 · 시간창 · 규격)은 바꿀 수 없다(422 `QUESTION_TARGET_CHANGED` — 새 문의로). 바꾼 값은 계획 출처를 잃는다(계획 숫자로 위장하지 않는다), 같은 값은 출처를 이어받는다 |
| U4-7 | **계획 교체**(FR-APV-06): `PlanSupersessionService.invalidateForNewRun(tx, newRunId, systemActorId)` — 새 실행 등록 트랜잭션 안에서 부른다(HTTP 없음 — 실행 등록은 Solver · 계획 단위). 옛 실행 근거의 살아 있는 · 미발송 승인에 `INVALIDATED(PLAN_SUPERSEDED)`. 승인 쪽과 같은 advisory lock(`fn_cera_lock_plan_run` — `recovery_run` 은 앱 역할에 UPDATE 가 없어 행 잠금 불가)으로 줄 세운다. 승인 전 초안은 승인 시점 검사가 막는다 |
| U4-8 | **승인자**: 인증 전 개발용 헤더 `X-CERA-Actor-Id`. 서버가 활성 HUMAN actor 인지 확인하고, DB 가드(M08)가 다시 HUMAN 을 강제한다. **누구나 헤더로 다른 운영자를 사칭할 수 있다** — 인증 단위에서 교체해야 하는 남은 위험. 시스템 무효화(내용 변경 · 계획 교체)와 상태 전이 일부는 SYSTEM actor(U3-4 그대로) |
| U4-9 | 기존 시험 조정: M12 가 `DRAFTED` 메시지 승인 · 살아 있는 승인 위 승인 · 다른 지문 승인을 거부하게 되어 fixture `approve()` 가 먼저 `PENDING_APPROVAL` 전이를 넣고, "승인 뒤 값 추가 → CE006" 두 시험은 상태를 `DRAFTED` 로 되돌린 뒤 값을 넣는다(전이 순서는 아직 DB 가 강제하지 않는다 — 그래도 커밋 검사가 잡는지 확인). OpenAPI 매개변수 순서를 경로 → 쿼리 → 헤더로 고정(tsx · vitest 의 decorator 순서 차이) |

### 18.6 U5 구현 확인 결과 (T-090 · 2026-10-07)

| 항목 | 결과 |
| --- | --- |
| migration | **M13 = `0012_m13_message_lifecycle_guards.sql`**(custom) — 함수 **20**(+1 `fn_cera_guard_status_transition`) · 트리거 **74**(+1) · 이력 13행 · 표 29 그대로 · 재실행 안전. **새 표 · 새 열 · 새 상태 코드 0** — Outbox 는 14절 그대로 `comm_message.current_status = 'QUEUED'` |
| API | `POST /communication/drafts/{messageId}/send`(요청 = `content_hash` · 헤더 `X-CERA-Actor-Id`) — **검증 뒤 `APPROVED → QUEUED` 만**. 네트워크 호출 없음. 이미 대기 · 발송 · 실패면 지금 상태를 돌려준다(멱등). 읽기 `DraftDto.dispatch`(상태 `NOT_REQUESTED · QUEUED · SENDING · RETRY_WAIT · SENT · FAILED` · 막힌 이유 15종 · 요청 · 발송 시각 · 사용한 승인 · 시도 요약 · 대기 해제 사유 · kill switch) |
| Worker | `OutboxDispatcher` — 화해 → 픽업(`FOR UPDATE SKIP LOCKED`) → 발송 판정 → 시도 선커밋 → 트랜잭션 밖 발송 → 결과 한 번. `WorkerRunner` 가 세션 advisory lock(`cera.outbox.worker`)으로 단일 보장. `npm run dev:worker`(주기 `CERA_OUTBOX_POLL_MS`) · `--once`(점검 + 한 주기) |
| 채널 | `back/src/channel/` — `ChannelAdapter` 포트(`docs/18` J.1: `capabilities` · `send` · `lookupSent`, `fetch_inbound` 는 U6) · `MockChannelAdapter`(파일 "보낸 편지함" `CERA_MOCK_CHANNEL_DIR` — 네트워크 없음, 재시작 뒤 조회 가능) · 장애 주입 `CERA_MOCK_CHANNEL_FAULT`(production 금지) |

| # | 구현 메모 |
| --- | --- |
| U5-1 | **한 판정, 두 자리**: 발송 요청(빠른 실패)과 Worker 시도 직전(최종 검사, FR-SND-08)이 같은 `DraftService.sendCheck` → 순수 `sendBlocks`(유효한 승인 여섯 조건 · 승인 사본 재해시 · 내용 지문 재계산 · Contact Gate(개발 안전장치 포함) · 계획 교체 · 채널 · 시뮬레이션 불일치)를 부른다. 잠근 뒤 승인 행을 다시 읽어 같은 살아 있는 승인인지 확인한다 |
| U5-2 | **보내는 내용 = 승인 사본**(`MESSAGE_APPROVAL_CONTENT` + 승인 수신자) — 화면 문자열을 다시 조합하지 않는다. `send_attempt.approval_id` = 실제로 쓴 살아 있는 승인 행 · `sent_content_hash` = 승인 지문 · `idempotency_key` = `sak/1`(`{k:'send-attempt', v:1, message_id, attempt_no}`) |
| U5-3 | **정책 거부(Worker 시점)**: 시도를 만들지 않고 `QUEUED → APPROVED`(대기 해제) + 사유 note + 감사 `SEND_DEQUEUED`. 재시도하지 않는다(docs/18 H.3). 사람이 사유를 보고 다시 요청한다. 화면 `dispatch.dequeued_reason` |
| U5-4 | **재시도**: 일시 실패 = `RETRYABLE_FAILURE` + 지수 백오프(`CERA_SEND_RETRY_BASE_MS` × 2^(n-1), 상한 10분) · 최대 `CERA_SEND_MAX_ATTEMPTS`(기본 5) 뒤 `DELIVERY_FAILED` · 영구 실패 = `PERMANENT_FAILURE` + `DELIVERY_FAILED`(재시도 없음) · 분류 못 한 예외 = `UNKNOWN`(재전송 전에 화해) |
| U5-5 | **화해**: 결과 없는 · `UNKNOWN` 시도 중 `CERA_SEND_RECONCILE_AFTER_MS`(기본 60초 — 다른 워커가 아직 보내는 중일 수 있다)보다 오래된 것만 `lookupSent`. 찾으면 `SUCCESS`(+ `provider_message_id`, 표식 `error_message = 'reconciled: found in channel (lookup_sent)'` — 성공에는 오류 코드를 둘 수 없다) · 없음이 확인되면 `RETRYABLE_FAILURE`(`RECONCILED_NOT_SENT`, 바로 재시도) · 조회 실패면 그대로. 미확정 시도가 있으면 새 시도를 만들지 않는다(U-7 + 앱) |
| U5-6 | **M13 상태 전이 가드**(T-089 기술 부채 ② 해소): 허용 전이 표(DRAFTED → PENDING_APPROVAL/CLOSED · PENDING_APPROVAL → APPROVED/REJECTED/CLOSED · APPROVED → APPROVED/QUEUED/CLOSED · REJECTED → CLOSED · QUEUED → SENT/DELIVERY_FAILED/APPROVED · SENT → REPLIED/DELIVERY_FAILED/CLOSED · REPLIED → REPLIED/CLOSED · DELIVERY_FAILED → CLOSED) + **BUSINESS 의 QUEUED 는 그 시각 유효한 승인 필요** + **SENT 는 SUCCESS 시도 필요**. `docs/18` E.1 상태도에 없던 화살표: `* → CLOSED`(수정본 대체, U4-5) · `QUEUED → APPROVED`(U5-3) · 같은 상태 반복(DRAFTED 첫 기록 · APPROVED 재승인 · REPLIED) |
| U5-7 | 첫 성공 때 한 번 채움: `comm_message.sent_at` · `comm_thread.external_thread_id`(화해 성공은 외부 스레드 id 를 모르면 채우지 않는다) · 스레드 `WAITING_REPLY` · 질문 `SENT` |
| U5-8 | **kill switch**(FR-SND-12): `CERA_SENDING_PAUSED=true` 면 요청 · 승인은 되고 Worker 가 보내지 않는다(대기열에 머묾, 화면 표시). 실행 중 전환 명령(`SetKillSwitch`)은 아직 없다 — 설정값 |
| U5-9 | 기존 시험 조정: M13 이 "승인 뒤 DRAFTED 로 되돌리기"를 막아 T-089 때 남긴 두 시험(되돌린 뒤 값 추가 → CE006)은 이제 CE005 를 확인한다 — 커밋 시 사본 검사(M08 CE006)는 앱 역할로는 닿지 않는 마지막 방어선으로 남는다. 프로세스 시험의 Worker `--once` 는 Mock 보낸 편지함을 임시 디렉터리로 |

### 18.7 U6 구현 확인 결과 (T-091 · 2026-10-07)

| 항목 | 결과 |
| --- | --- |
| migration | **없음**(M13 그대로) — `raw_input` · INBOUND `comm_message` · `audit_log` 로 충분하다. 새 표 · 열 · 상태 코드 0 |
| 채널 | `ChannelAdapter.fetchInbound(watermark)`(J.1 `fetch_inbound`) · `InboundRawMessage`(원문 바이트 + 외부 메시지 · 스레드 id · `Date` 원문 · `In-Reply-To`/`References` · 채널 수신 시각). `MockChannelAdapter` 수신함 = `CERA_MOCK_CHANNEL_DIR/inbox/`(한 통 = JSON 봉투 파일 — 이 바이트가 원문). 개발 · 시험용 회신 주입 `simulateReply` 는 CLI `npm run mock:reply`(production 거부)와 시험만 쓴다 — 제품 API 에 없다 |
| Worker | `InboundProcessor.runCycle()` — 발송 주기 다음에. 세션 잠금 `cera.inbound.poller`(docs/24 14 키 목록). 발송 · 수신은 서로의 실패와 무관하다 |
| API | `GET /communication/inbound?status=NORMAL|HOLD`(수신 기록 · 보류함 — 읽기 전용) · `DraftDto.replies`(그 스레드에 붙은 회신) |

| # | 구현 메모 |
| --- | --- |
| U6-1 | **저장(T7)**: 원문 바이트 → 내용 저장소(`RAW_INPUT_PAYLOAD`, 저장 후 지문 확인) → 한 트랜잭션 `raw_input`(`source_type = EMAIL` · `source_name = 채널 코드` · `source_record_key = 외부 메시지 id` · `payload_hash` · `source_recorded_at` = Q-44 근거 시각 · `received_at` = CERA 수신 시각) `ON CONFLICT DO NOTHING` — 충돌이면 전체 건너뜀. 정상이면 INBOUND `comm_message`(같은 외부 id · `from_address` · `content_hash` = 원문 지문 · `message_content_ref` NULL — 원문이 정본 · `drafted_by` · `current_status` NULL · 전이 없음, F-5) + 답한 보낸 메시지 `SENT → REPLIED` + 스레드 `ANSWERED`. 두 표는 (채널, 외부 id)로 이어진다 — 연결 열을 새로 만들지 않았다 |
| U6-2 | **스레드 연결**: `In-Reply-To`/`References` → 그 외부 id 로 **성공한** 발송 시도 → 보낸 메시지 → 스레드, 그리고 외부 스레드 id → 스레드. 두 근거가 서로 다른 스레드면 `AMBIGUOUS_THREAD`, 근거가 없으면 `NO_MATCHING_THREAD` — 추측하지 않는다. T-069 11.6 의 "CERA 스레드 밖 메일은 저장하지 않음"은 Gmail 에서 수집 범위(라벨)로 지킨다. Mock 수신함에 들어온 스레드 밖 메일은 버리지 않고 보류한다(사용자 지시) |
| U6-3 | **발신자(등록부만, LLM 없음)**: 같은 채널의 정규화 주소(`이름 <주소>` → 주소 · 소문자) → 주소 → 연락처 → 거래처. 사유: `UNKNOWN_SENDER` · `AMBIGUOUS_SENDER`(채널 안 주소 UNIQUE 라 DB 로는 생기지 않음 — 규칙에만) · `SENDER_INACTIVE` · `SENDER_UNVERIFIED` · `SENDER_NOT_APPROVED` · `OTHER_COUNTERPARTY`(스레드 상대와 다른 거래처) · `DIFFERENT_CONTACT`(같은 거래처의 다른 주소 — "다른 담당자 회신") · `SIMULATION_MISMATCH`(어댑터가 고정한 가상 여부 ≠ 스레드). 개발 안전장치(allowlist)는 보내는 쪽 규칙이라 수신에 쓰지 않는다 |
| U6-4 | **보류 = 버리지 않음**: 원문 · `raw_input` 은 남고 스레드에 붙지 않는다(INBOUND 메시지를 만들지 않는다 — 메시지는 스레드가 필수). 사유는 **수신 순간의 판정**을 감사 기록 `INBOUND_HELD_<사유>`(대상 `RAW_INPUT`)로 남긴다 — 나중에 등록부가 바뀌어도 그때 왜 보류했는지가 남는다. 사람이 문의에 연결하는 명령(`LinkHeldInbound`)은 후속 |
| U6-5 | **Q-44**(`docs/22` 11.2e): RFC 5322 `Date`(오프셋 필수 — 시각대를 추측하지 않는다)가 있고 · 파싱되고 · 채널 수신 시각보다 미래가 아니면 `Date`, 아니면 채널 수신 시각 + `MISSING` · `UNPARSEABLE` · `AFTER_CHANNEL_RECEIVED`. 허용 오차 없음. 선택 결과는 `raw_input.source_recorded_at`, **거부 사유는 수신 트랜잭션에서 감사 기록 `INBOUND_DATE_REJECTED_<사유>`(대상 `RAW_INPUT`)로 영속**한다(사용자 검토 2026-10-07 — 처음 구현은 읽을 때 원문으로 다시 계산해 원문 파기 뒤 재현할 수 없었다). 화면 · API 의 기준 · 사유 · 근거 시각은 이 영속 값만 쓴다(원문 재계산 아님). 원래 두 시각을 사건 `payload` 에 남기는 것은 사건이 생기는 U8 |
| U6-6 | 워터마크는 저장하지 않는다(저장할 표가 없다) — 매 주기 Mock 수신함 전체를 받고 외부 id UNIQUE 로 걸러 낸다. Gmail(`history_id`)은 Slice 2 에서 저장 위치를 정한다 |
| U6-7 | 사건(Event) · 추출 · 현재 사실은 만들지 않는다 — 회신의 수량 · 시각 해석은 U7(AI 추출 = 후보) |

### 18.8 U7 구현 확인 결과 (T-092 · 2026-10-07)

| 항목 | 결과 |
| --- | --- |
| migration | **없음**(M13 그대로) — `extraction` 표 · 내용 저장소(`EXTRACTION_SOURCE_QUOTE`) · `audit_log` · `system_error` 로 충분하다 |
| AI Server | `ai/` Python(FastAPI — ADR-033 "FastAPI 또는 동등") · `POST /v1/extractions/reply` · DB · 채널 없음 · stateless · LLM 공급자 **포트** + 녹화 재생 + 실제 어댑터 자리(**공급자 미정 — 정하지 않음**) · 계약 견본 · JSON Schema `packages/contracts/ai/`(양쪽 시험이 같은 견본을 읽는다) |
| Backend | `back/src/ai/ai-client.ts`(HTTP · 시간 제한 `CERA_AI_TIMEOUT_MS` · 응답 엄격 스키마 · 기술 실패 분류) · `extraction-rules.ts`(순수 — 질문 만들기 · 검증기) · `ExtractionProcessor`(Worker — 잠금 `cera.extraction.worker`) · `ExtractionRepository` · `InboundItemDto.extraction` |

| # | 구현 메모 |
| --- | --- |
| U7-1 | **대상**: 정상 회신(INBOUND 메시지 — 스레드 연결 · 등록 발신자 판정 통과)만. 보류 메일은 메시지가 없어 대상이 될 수 없다(AI 호출 0회). 원문이 없거나 질문이 없으면 시작하지 않고 감사 `EXTRACTION_SKIPPED_<사유>` |
| U7-2 | **AI 입력**: Backend 가 확정한 것만 — 물은 질문(`question_item` 의 `ask_id` · 질문 문장 · 답할 칸 · 기대 단위, 보낸 메시지의 날짜 · 시간창) · 기준일(질문의 날짜 — 시스템 현재 시각 아님) · 거래처 이름 · **원문 텍스트**(원문 바이트에서 `readInboundSurface` 로 — 검증기가 인용을 찾는 텍스트와 같은 문자열). `input_hash` = `extract-input/1`(요청 문서 전체) |
| U7-3 | **검증기**(`docs/05` 4.6 안에서): `FIELD`(답이 말한 칸 — 표에 칸 열이 없어 첫 검사의 `detail_code` 로 남긴다) · `QUESTION_SCOPE`(없는 질문 · 묻지 않은 칸 탈락) · `QUOTE_IN_SOURCE`(원문 그대로의 부분 문자열 — 요약 · 의역 불인정) · `VALUE_FORMAT` · `UNIT` · `VALUE_IN_QUOTE`(값이 인용 안에 숫자 · 한글 수 · 시각 표현으로 실제로 있음) · `CONSISTENCY`(같은 질문 · 칸의 상충 값 → 모두 탈락) · `AMBIGUITY`(모호 표시 — 탈락 아님, U8 입력 신뢰도 재료). AI 자기 점수는 판정에 쓰지 않는다(`model_confidence` 는 기록만) |
| U7-4 | **저장(T8)**: 인용을 내용 저장소에 먼저(트랜잭션 밖) → 한 트랜잭션(회신 단위 advisory lock · 이미 끝났으면 아무것도 안 함): 후보 1개 = `extraction` 1행. 통과 = `PENDING`(사건 후보 — U8 이 사건을 만들면 `ACCEPTED`), 탈락 = `REJECTED`(결정론 규칙의 판정 — SYSTEM 주체, `docs/22` 15.9.1 규칙 4. 처음부터 종료 상태로 넣는다) + 감사 `EXTRACTION_COMPLETED`. 후보가 없으면 행 없이 감사 `EXTRACTION_NO_CANDIDATE_<outcome>`. **사건 · 현재 사실을 만들지 않는다** |
| U7-5 | **기술 실패**(`docs/22` 15.9.2 — 검증기 결과가 아니다): `system_error`(`AI_SERVER_UNAVAILABLE` · `EXTRACTION_TIMEOUT` · `EXTRACTION_PROVIDER_FAILED` · `EXTRACTION_OUTPUT_INVALID` · `EXTRACTION_REQUEST_REJECTED`, 관련 개체 = 회신 메시지). 다음 주기에 재시도, `CERA_EXTRACTION_MAX_ATTEMPTS`(기본 3 [ASSUMPTION]) 에 닿으면 멈춘다. 회신 · 원문은 그대로 |
| U7-6 | **멱등**: 대상 = 추출 행 · 완료 감사가 없는 회신. 저장 트랜잭션이 회신 단위로 줄 서고 다시 확인하므로 재시도 · 동시 Worker 에도 행이 한 벌. 정책이 바뀌어 다시 추출하면 새 행 + 이전 `SUPERSEDED`(15.9.1 규칙 6) — 그 명령은 아직 없다 |
| U7-7 | **정본과 다른 점 / 남은 판단**: `docs/18` D.3 의 답에는 `slot` 이 있는데 이번 질문은 시간창이 질문에 이미 고정돼 있어 `slot` 대신 답할 칸(`field` — `quantity` · `available_from` · `available_until`)으로 했다. 칸 이름은 `extraction` 표에 열이 없어 `validator_result` 의 `FIELD` 검사에 남긴다 — U8 에서 사건의 `fact_key` · 범위로 옮길 때 정식 위치를 다시 판단한다. `unmapped_statements` 는 저장하지 않는다(사건이 아니다 — 필요하면 U8 의 확인 요청) |

### 18.9 T-102 공공데이터 구현 확인 결과 (2026-10-22)

| 항목 | 결과 |
| --- | --- |
| migration | **M14 = `0013_m14_public_data.sql`**(drizzle-kit 생성, 사람 검토) — 표 6(`vessel_call` · `bl` · `container` · `container_bl` · `external_identifier` · `public_data_fetch`) · 컬럼 57 · FK 12(복합 5). **M15 = `0014_m15_public_data_guards.sql`**(custom) — append-only 3표 · 삭제 금지 3표 · 열 가드 3표 · TRUNCATE 금지 1 · `fn_cera_guard_entity_link_insert` 를 같은 이름으로 교체(CONTAINER · BL · VESSEL_CALL 허용) · 외부 식별자 소유자 존재 가드(함수 +1 = **21**) · GRANT. 트리거 **85**. M01~M13 은 고치지 않았다 |
| Backend | `back/src/public-data/` — `adapters/`(전송 포트 · 실제 HTTP · 녹화 재생 · 데이터셋 정보) · `parsing/`(XML 봉투 · 결과 판정, 순수) · `normalization/`(DS-03 · DS-02 · 시각 · ISO 6346, 순수) · `public-data.repository.ts`(원장 · 원문 · 개체 · 사건) · `public-data.service.ts`(페이지 흐름) · 개발 API 6개(`/public-data/*`) |
| 설정 | `CERA_PUBLIC_DATA_MODE`(off · replay · live) · `DATA_GO_KR_SERVICE_KEY` · `CERA_PUBLIC_DATA_TIMEOUT_MS` · `CERA_PUBLIC_DATA_MAX_PAGES` · `CERA_PUBLIC_DATA_RAW_DIR`(예약) · `CERA_PUBLIC_DATA_REPLAY_DIR` |

| # | 구현 메모 |
| --- | --- |
| P-1 | **한 페이지 = 한 흐름**: 전송(트랜잭션 밖) → 원문 바이트를 내용 저장소(`RAW_INPUT_PAYLOAD`)에 먼저 · 저장 후 지문 확인 → 한 트랜잭션에 `raw_input`(PUBLIC_API · `source_record_key = fetch_id`) · `public_data_fetch` · 감사 `PUBLIC_DATA_FETCHED` · 정규화 결과. 응답이 오지 않은 전송 실패는 원장 행만(원문 없음). 상대 오류 · 해석 실패는 원문까지 남기고 `system_error`(`PUBLIC_DATA_INTEGRATION`) |
| P-2 | **인증키**: 실제 전송 구현 생성자만 받는다. URL 에만 붙고(한 번 URL 인코딩), 원장 `request_params` · `raw_input.request_ref` · 감사 · `system_error` · 로그에 없다 — fetch 오류 메시지도 URL 을 담을 수 있어 버리고 종류(`TIMEOUT` · `NETWORK`)만 남긴다. DB 시험이 모든 기록 표를 문자열 검색한다 |
| P-3 | **봉투 판정**(field-dictionary 8절): 게이트웨이 봉투(`OpenAPI_ServiceResponse`)는 HTTP 200 이어도 `UPSTREAM_ERROR`(`GW_<코드>`) · `resultCode 03` 또는 0건 = `NO_DATA` · XML 아님 = `PARSE_ERROR`(HTTP 실패면 `UPSTREAM_ERROR`). 값은 문자열 그대로(입항횟수 `003`) |
| P-4 | **정규화(결정론 · 원문에서 다시 돌릴 수 있다)**: DS-03 → 입항 건 키 · 선명 · 입항 상세(`reqstSeNm = 최종` 우선)의 `etryptDt` = **입항 신고 일시** `ARRIVAL_DECLARED`(`declared_arrival`, payload 에 신청구분 · 받은 시각 기준 PAST/FUTURE) — **실제 입항 마일스톤(`milestone.arrived`)으로 쓰지 않는다**(2026-10-22 live 검토: 받은 시각보다 뒤인 신고 35/181 · 신청구분 최초 · 변경 · 최종) · 계선 시설 `LOCATION_REPORTED`(`location`, 값 코드 `<시설>_<서브>` — 비표준 `*` 코드는 이름만) · 수입 `mrNum` → 외부 식별자. DS-02 → 수입(`II`)만 · ISO 6346 모양 · 체크 숫자 불일치는 받되 신뢰도 LOW · B/L 종류 `UNKNOWN` · 사건 `VESSEL_CALL_LINKED` · `BL_LINKED` · `EQUIPMENT_REPORTED`(ISO 코드). 출항 일시 · 선종은 응답에만 |
| P-5 | **신뢰도**: 공공 API 상한(`docs/05` 3.3)에 맞춰 MEDIUM. 최종이 아닌 입항 신고 · 비표준 시설 코드 · 체크 숫자 불일치는 LOW. 이유 코드 `PUBLIC_API_DECLARATION` · `DECLARATION_NOT_FINAL` · `NONSTANDARD_FACILITY_CODE` · `PUBLIC_API_MANIFEST` · `TZ_ASSUMED` · `CONTAINER_CHECK_DIGIT_MISMATCH` · 사건 `payload.basis = PORT_MIS_ENTRY_DECLARATION` |
| P-6 | **실제 / 녹화 분리**: replay = `mode REPLAY` = `is_simulated` = 시나리오 `public-data-replay`(고정 id) 의 사건. 실제 응답이 녹화로 등록된 개체를 가리키면 쓰지 않고 `*_SIMULATION_MISMATCH` 로 알린다. 녹화로 등록된 입항 건에 실제 적하목록을 붙이지 않는다(409) |
| P-7 | **반복 조회**: 같은 조건을 다시 물으면 새 원문 · 새 사건(`docs/05` 4.5 — 새 근거)이지만 개체 · 외부 식별자는 늘지 않는다. 컨테이너가 이미 다른 입항 건에 걸려 있으면 바꾸지 않고 `CONTAINER_ON_OTHER_VESSEL_CALL`(이력은 사건), 다른 B/L 이 PRIMARY 면 `CONTAINER_ON_OTHER_BL` — Reconciliation(T-093)에서 다룬다 |
| P-8 | **읽기 모양**: 개발 API 의 `latest_arrival` · `latest_berth` 는 **최신 공공 관측**이지 현재 사실(`canonical_fact`)이 아니다. 값마다 provenance(호출 · 원문 · 지문 · 요청/받은 시각 · LIVE/REPLAY · `result_kind`) |
| P-9 | **조회 주체**: 지금은 활성 HUMAN(`X-CERA-Actor-Id` — T-089 기술 부채 ①). Agent(`AI_AGENT`)는 T-103 Tool 경로에서 연다. 기간은 31일 이내, 페이지 상한 `CERA_PUBLIC_DATA_MAX_PAGES`(기본 20 = 1,000행) |
| P-11 | **live 검증(2026-10-22)**: 실제 DS-03 · DS-02 응답으로 전체 흐름 확인. 차이를 최소 수정했다 — `*` 비표준 계선 시설 코드(이름만 남김) · 신청구분 `최초 · 변경 · 최종`(최종 아니면 LOW) · **입항 신고 일시를 `ARRIVED` 마일스톤에서 `ARRIVAL_DECLARED` 로**(실제 접안 확정이 아니다) · **데이터 없음 = `00` + 0건만**(`03` 은 관측되지 않아 데이터 없음 규칙에서 뺐다 — 오면 UPSTREAM_ERROR 로 남겨 확인). 상세 field-dictionary 9절 |
| P-10 | **남은 판단**: `CERA_PUBLIC_DATA_RAW_DIR` 는 예약값(원문은 지금 내용 저장소 `CERA_CONTENT_DIR` 에 있다 — 둘 다 `data/raw/` gitignore) · `bl` 유일(L-16)은 잠정 · 원문 보관 기간은 Q-45 · 실제 응답에서 응답 크기 · 결과 코드 `03` 확인 필요 |

### 18.10 T-103 Agent Tool Layer 구현 확인 결과 (2026-10-22)

| 항목 | 결과 |
| --- | --- |
| migration | **M16 = `0015_m16_agent_runs.sql`**(생성, 검토) — `agent_run` · `agent_tool_call` · 컬럼 28 · FK 4. **M17 = `0016_m17_agent_guards.sql`**(custom) — 함수 +2(**23**) · 행위자 가드(실행 = AI_AGENT, 만든 이 = HUMAN · SYSTEM) · 한 번 전이 · 열 가드 · 삭제 금지 · GRANT. M01~M15 는 고치지 않았다 |
| Backend | `back/src/agent-tools/` — `registry.ts`(Tool 9 · 등급 · 시간 제한 · 멱등) · `schemas.ts`(zod 정본 — T-102 TS 계약과 같은 모양인지 컴파일 때 검사) · `executor.ts`(검증 · 기록 · 멱등 · 시간 제한 · 오류 분류 · 출력 검사) · `handlers.ts`(기존 서비스만 호출) · `context.service.ts`(맥락 · 정보 공백 `gap-rules/0`) · `agent-tools.service.ts`(서비스 인증 · 실행 범위) · `/internal/agent-tools/*` · `/agent-runs/*` |
| 계약 | `packages/contracts/agent-tools/agent-tools.v1.json`(`npm run agent-tools:emit`) — Python 이 읽는다. 단위 시험이 최신인지 검사 |

| # | 구현 메모 |
| --- | --- |
| A-1 | **서비스 인증**: `Authorization: Bearer <CERA_AGENT_TOOL_TOKEN>` 만(쿼리 · 사람 헤더 불가). SHA-256 지문을 `timingSafeEqual` 로 비교. 꺼져 있으면 503 `AGENT_TOOLS_DISABLED`. 토큰은 기록 · 로그에 없다(DB 시험이 모든 기록 표를 문자열 검색) |
| A-2 | **실행 범위**: `X-CERA-Agent-Run-Id` 의 ACTIVE 실행만. 실행은 사람(`POST /agent-runs`)이 계획 실행 하나에 묶어 만든다. 다른 계획 실행 · 그 실행의 메시지를 가리키면 `OUT_OF_SCOPE`(기록됨). 초안의 계획 실행은 실행 기록이 정한다 — 입력으로 받지 않는다 |
| A-3 | **봉투**: 기록된 결과는 HTTP 200 + `{status: SUCCEEDED · REJECTED · FAILED, error.code, retryable}`. 입구 오류(꺼짐 · 인증 · 실행 없음 · 모르는 Tool)만 HTTP 오류 상태 + 같은 봉투(기록 없음) |
| A-4 | **멱등**: PROPOSE · REQUEST 는 `Idempotency-Key` 필수. 부분 유일(진행 중 · 성공)이 동시 재시도를 하나로 줄 세우고, 같은 키 + 같은 입력이면 앞선 결과 참조로 출력을 다시 만든다(`replayed`). 다른 입력이면 `IDEMPOTENCY_KEY_REUSED`. **성공 표시는 초안 · 승인 대기 전이와 같은 트랜잭션**(`ctx.commit`) — 업무 기록만 있고 호출은 STARTED 로 남는 틈이 없다 |
| A-5 | **시간 제한**(Tool 별, [ASSUMPTION]): READ 5초 · EXTERNAL_READ 60초 · PROPOSE · REQUEST 15초. 넘으면 FAILED(`UPSTREAM_TIMEOUT` · `TOOL_TIMEOUT`, retryable). 늦게 끝난 부작용은 commit 이 실패해 업무 트랜잭션도 되돌린다 |
| A-6 | **초안 · 승인 요청**: `create_inquiry_draft` 는 기존 `DraftService.create`(Contact Gate · 값 형식 · 숫자 검사)를 그대로 쓰되 **승인 대기에 올리지 않는다**(`submitForApproval: false`, 전이 행위자 AI_AGENT). `request_approval` 은 `DraftService.requestApproval` — 승인 직전 검사(내용 · 지문 · 숫자 · Contact Gate · 계획 교체)를 다시 하고 `DRAFTED → PENDING_APPROVAL` + 감사 `APPROVAL_REQUESTED`. **승인 행은 만들지 않는다** — 승인 결정은 DB 가 HUMAN 으로 막는다(M08) |
| A-7 | **정보 공백(`gap-rules/0`, 결정론)**: 계획 날짜 D(스냅숏 기준 시각의 Asia/Seoul 날짜)에 창고 `capacity.day(D)` · ODCY `capacity.….day(D)` · 협력 차량 풀 `available.slot(D…)` 가 같은 시뮬레이션 구분의 관측으로 있나. 없으면 공백(이 실행에서 묻는 중이면 ASKED). 공공데이터는 이 공백을 풀지 못한다 |
| A-8 | **남은 판단**: Agent 초안의 숫자(수량 · 시각)는 아직 계획 엔진에서 오지 않는다 — 사람 승인이 마지막 문이다(솔버 · 자원 부족 계산 T-036 뒤 공백 출력에서 값을 주는 방향) · 실행 종료(FINISHED)는 T-104 Coordinator · Python 쪽 실행 시작/재개 endpoint 는 T-104 |

### 18.11 T-104 LangGraph Agent Runtime 구현 확인 결과 (2026-10-22 · DONE)

| 항목 | 결과 |
| --- | --- |
| migration | **M18 = `0017_m18_agent_runtime.sql`**(생성 + 검토한 옮김 블록) — `agent_step` · `agent_checkpoint` · `agent_checkpoint_write` · `agent_run` 열 10 · FK +4(**78**). 옛 상태 옮김: `ACTIVE` → `CANCELLED`(`LEGACY_RUN_CLOSED_BY_M18`) · `FINISHED` → `COMPLETED`(트리거를 그 블록에서만 끄고 다시 켬). **M19 = `0018_m19_agent_runtime_guards.sql`**(custom) — 함수 +2(**25**) · 생애주기 전이표 · 열 가드 교체 · Tool 호출은 CREATED · RUNNING 실행에만 · checkpoint/쓰기는 RUNNING 에만 · step · checkpoint append-only · 쓰기 삭제 금지 · 특수 쓰기만 갱신 · GRANT. **M01~M17 은 고치지 않았다** |
| Backend | `back/src/agent-tools/` — `coordinator.ts`(시작 · 재개 · 결과 반영 · 신호 구독) · `runtime-client.ts`(Python 호출 · 응답 계약 `agent-runtime/1` 엄격 검사) · `agent-runtime.service.ts` · `agent-runtime.controller.ts`(`/internal/agent-runtime/runs/:id/checkpoints · checkpoint-writes · steps`) · `runtime-store.repository.ts` · `service-auth.ts` · `src/shared/signals/`(업무 신호 — 승인 결정) |
| Python | `ai/cera_ai/agent/` — `graph.py`(`CeraRecoveryGraph` 노드 12 · 조건 분기 · interrupt) · `runtime.py`(start · resume) · `checkpointer.py`(`BackendCheckpointSaver` — LangGraph `BaseCheckpointSaver` 를 Backend API 로) · `tooling.py`(Registry 제한 · 상한 · 재시도) · `backend.py`. LangGraph `1.2.11` 고정 |

| # | 구현 메모 |
| --- | --- |
| R-1 | **두 오케스트레이션**: 실행 상태 전이는 Coordinator 만 한다. Python 은 결과(`WAITING_HUMAN · WAITING_EXTERNAL · COMPLETED · FAILED` + 코드)만 돌려준다 — `CANCELLED` · 업무 상태는 돌려줄 수 없다(응답 스키마가 거부) |
| R-2 | **멱등**: 시작은 `CREATED → RUNNING` 을 잠금 아래 이긴 쪽만 그래프를 부른다(두 번째 시작 = 지금 상태). 재개도 `WAITING_* → RUNNING` 을 이긴 쪽만. 초안 · 승인 요청 Tool 키는 실행 + 공백 / 메시지에서 결정론으로 만든다 → 재실행 · 재시도가 초안을 두 번 만들지 않는다 |
| R-3 | **재개 = 깨우기만**: 승인 결정이 커밋된 뒤 `APPROVAL_DECIDED` 신호 → `pending_ref` 로 기다리는 실행을 찾아 재개. 재개 값은 사유 코드뿐이고 그래프는 `get_communication_status` 로 권위 상태를 다시 읽는다(아직 대기면 다시 interrupt) |
| R-3a | **신호는 최적화, 정확성은 DB 상태**: 신호는 프로세스 안에서만 돈다(커밋 직후 죽으면 사라진다). Worker 의 `AgentReconciler`(잠금 `cera.agent.reconciler`, 기동 · 주기마다)가 기다리는 실행마다 대기 대상 메시지의 지금 상태를 `wake-rules.ts` 로 판정해 이미 일어났으면 깨운다. 따로 깨우기 표를 두지 않는다 — 기다리던 업무 기록(승인 · 발송 · 회신 · 추출) 자체가 내구성 있는 기록이다. Kafka · Redis 없음. 시험: 신호를 버린 채 승인 → API 재기동 → 재조정 → 같은 실행이 COMPLETED, 초안 · 승인 요청 · 승인 각 1건 |
| R-3b | **부작용 직후 · checkpoint 전 장애**: 노드가 끝나기 전에 죽으면 그 노드는 다시 돈다. 초안 · 승인 요청 Tool 의 멱등 키가 실행 + 공백 / 메시지에서 결정론으로 만들어지므로 다시 불러도 같은 결과를 돌려받는다(T-103 멱등). Python 시험이 두 Tool 각각에서 죽였다가 이어 가 부작용 1건씩을 확인 |
| R-4 | **재시작 복구**: Python 은 호출 사이에 아무것도 기억하지 않는다 — 매 호출 checkpoint 를 Backend 에서 읽는다. E2E 시험이 interrupt 뒤 Python 을 죽였다 다시 띄우고 이어서 완료하는 것을 확인 |
| R-5 | **상한 · 재시도**: 단계 25 · Tool 호출 12 · 재시도 2(`CERA_AGENT_MAX_*` — 기본값일 뿐 제품 정책이 아니다, [ASSUMPTION], Agent Eval 로 조정). 넘으면 `LOOP_LIMIT_REACHED` · `TOOL_CALL_LIMIT_REACHED` 로 FAILED. retryable FAILED(`UPSTREAM_TIMEOUT` 등)만 같은 키로 재시도 |
| R-5a | **Runtime 장애 구분**: 일시 장애(`AGENT_RUNTIME_UNAVAILABLE` — 연결 거부 · 5xx · Python 이 Backend 저장 통로에 못 닿음, `AGENT_RUNTIME_TIMEOUT`) → `WAITING_RUNTIME` + `next_attempt_at`(`CERA_AGENT_RUNTIME_RETRY_BASE_MS` × 2^(n-1)) → 재조정이 다시 시도. `CERA_AGENT_RUNTIME_MAX_ATTEMPTS`(기본 3 = 첫 시도 + 재시도 2, [ASSUMPTION]) 번째 실패에서 FAILED. 거부(401/403) · 계약 위반 · 그래프 오류(`POLICY_OUTPUT_INVALID` · `OUT_OF_SCOPE` …)는 바로 FAILED. 실패마다 `system_error`(retryable 표시). 다시 시도할 때 checkpoint 가 있으면 이어 가기(resume), 없으면 시작 — Python 은 같은 실행의 시작을 다시 받으면 checkpoint 에서 이어 간다 |
| R-5b | **시간 제한 120초 = 그래프 한 번 실행(HTTP 요청 하나)의 제한**이다. interrupt 에서 요청이 끝나므로 WAITING_HUMAN · WAITING_EXTERNAL 대기 시간에는 제한이 없다 |
| R-6 | **숫자**: 문의 수량 · 시간창은 사람이 실행을 만들 때 준 `parameters` 에서만. 없으면 `INQUIRY_PARAMETERS_REQUIRED` |
| R-7 | **남은 판단**: 상한 값 · `WAITING_EXTERNAL`(회신 대기) 재개는 T-105(수신 신호) · checkpoint 보관 기간 · 오래된 checkpoint 정리 |

### 18.12 T-105 첫 Agent Vertical Slice 구현 확인 결과 (2026-10-22 · DONE)

**DB 변경 없음**(M18 · M19 그대로). 한 그래프에서 START → 공공데이터(사람이 준 기간) → 정보 공백 → 문의 초안 → 승인 대기 → 승인 → **사람의 발송 요청 대기** → Worker 발송 → 회신 대기 → 회신 · 추출(T-092) → 공백 재평가 → 결과 → END.

| # | 구현 메모 |
| --- | --- |
| S-1 | **발송 권한은 그대로 사람 · Backend**: Tool 은 10개(READ `get_reply_candidates` 추가 — 회신 · 검증된 추출 후보, 원문 · 인용 없음). send · approve Tool 없음. 승인 뒤 그래프는 `track_message` 로 상태만 보고 `AWAITING_SEND_REQUEST`(사람) → `AWAITING_DELIVERY` · `AWAITING_REPLY`(외부)로 기다린다. 발송 요청 · Outbox · Worker 는 T-090 규칙 그대로 |
| S-2 | **깨우기**: 대기 사유별 판정 `wake-rules.ts` — 승인 결정 · 발송 진행(APPROVED 를 벗어남 · QUEUED 를 벗어남) · 회신(정상 회신 + 추출이 끝남: DONE · NO_CANDIDATE · SKIPPED · FAILED). 수신 · 추출 Worker 가 커밋 뒤 `INBOUND_REPLY_RECEIVED` · `REPLY_EXTRACTED` 알림 → 재조정 즉시 실행(최적화). 알림을 놓쳐도 Worker 주기 재조정이 같은 판정으로 깨운다 |
| S-3 | **후보 ≠ 사실**: 회신 추출은 PENDING 후보로 남고 사건 · 현재 사실을 만들지 않는다(T-093 전 — **T-093 이후는 18.14**: 자격 있는 후보는 임시 사실 사건이 되고 `gap-rules/2` 가 사실 상태를 따른다). 공백 출력 `gap-rules/1` 이 둘을 나눈다 — `state`(업무 공백: MISSING · ASKED, 사실 기준) · `candidate_state`(작업 흐름: NONE · REPLY_RECEIVED · CANDIDATE_RECEIVED · NO_VALID_CANDIDATE) · `candidate_extraction_ids`. 결과 코드 `CANDIDATE_RECEIVED_PENDING_CONFIRMATION`(통과 후보 있음) · `REPLY_NEEDS_HUMAN_REVIEW`(통과 후보 없음 · 추출 실패) |
| S-4 | **결과 요약** `agent_run.result_summary`: 목표 공백 · 메시지 id · 회신 결과 · 후보 항목 · 후보 id · 업무 공백 상태 · 후보 상태 · `facts_confirmed=false` · 공공데이터 모드(LIVE · REPLAY) · 결과 · 입항 건수 · fetch id. 후보 값 · 원문은 넣지 않는다 |
| S-5 | **상한**: 단계 상한은 실행 전체, Tool 호출 상한은 **대기와 대기 사이 한 구간마다**(대기 뒤 0 부터) — 오래 기다리는 실행이 상태 재조회만으로 예산을 다 쓰지 않게. 무한 반복은 단계 상한이 막는다. 값은 기본값 [ASSUMPTION] |
| S-6 | **실제 프로세스 E2E(2026-10-22)**: 개발 DB(M19) · `npx tsx src/main.ts` · `src/worker.ts` · `python -m cera_ai`(그래프 + 추출 녹화 재생) · 실제 data.go.kr. 공공데이터 LIVE 4쪽 · 입항 189건(원장 행위자 AI_AGENT · `is_simulated=false`) → 가상 ODCY A 수용량 공백 → 초안 → 승인(API) → 발송 요청(**브라우저 화면 클릭**) → Worker Mock 발송 → `AWAITING_REPLY` 에서 **Python 종료 · 재기동** → Mock 회신 → 추출(합성 녹화 `odcy-capacity-yes.json`) → 재평가 → COMPLETED(`CANDIDATE_RECEIVED_PENDING_CONFIRMATION`, 업무 공백 ASKED 유지). 실제 공공데이터는 합성 계획 실행과 억지로 잇지 않았다(REAL PUBLIC · SYNTHETIC PRIVATE 출처 유지 — T-107) |
| S-7 | **화면**: Control Tower 에 "Agent 진행 (Backend)" 블록 — 실행 시작(계획 실행 · 수량 · 시간창 · 공공데이터 기간) · 상태 · 지금 하는 일 · 기다리는 이유 · 단계 체크(초안 · 승인 · 발송 · 회신/추출 · 재평가 · 결과) · 최근 단계 · 최근 Tool · 기다리는 초안(기존 DraftView 로 승인 · 발송 요청) · 결과 요약. 새 디자인 없음 |

### 18.13 로컬 전체 실행 구성 (T-099 부수 작업 · 2026-10-26)

**DB 변경 없음.** 로컬 PostgreSQL 만 띄우던 `infra/local/compose.yaml` 이 앱 전체를 띄운다 — 사용법 · 명령 · GPU 는 정본 `infra/README.md` 한 곳에 있다(여기에 복사하지 않는다). 구조 결정만 적는다.

- **profile 로 나눈다**: 항상 `postgres`, `app`(`migrate` → `api` · `worker` · `ai`), `web`(정적 빌드 + nginx), `llm`(로컬 모델 서버), `eval`(평가 CLI). 호스트의 `npm run dev:*` · Vite HMR 개발을 대체하지 않는다.
- **이미지 3개**: `back`(API · Worker · migrate 가 한 이미지, 명령만 다름) · `ai`(AI 서버 · 평가 CLI) · `front/web`(빌드 맥락 = 저장소 루트 — `data/scenarios` · `packages/contracts` 참조).
- **연결 방향은 기존 경계와 같다**: 브라우저 → `web` → `api`(`/backend/*`) 만. `api` → `ai`(추출 · Agent Runtime), `ai` → `api`(typed Tool, 서비스 토큰), `ai` → `llm`(`CERA_LLM_PROVIDER=local`). AI · 모델 서버는 DB 에 가지 않는다(ADR-033 · 036).
- **설정은 `.env` 를 컨테이너 안 주소로 덮어쓴다**(DB `postgres:5432` 등). 비밀값은 이미지에 굽지 않는다.
- **로컬 모델 공급자 `local`**(OpenAI 호환 Chat Completions + `json_schema` 문법 강제)은 평가용 선택지이다. 공급자 선택은 ADR-037(구조 한정 Accepted · 선정 Deferred) 몫이며, 출력은 후보일 뿐 판정은 Backend 검증기(ADR-029).
- 큐(Redis 등)는 도입하지 않았다 — Outbox · 작업 큐는 PostgreSQL 그대로(위 18.5·18.11).

### 18.14 T-093 사실 파이프라인 구현 확인 결과 (2026-10-26 · DONE — 사용자 승인)

**표 · 열 변경 없음.** M20 = 가드 3개만(22.41). `event` · `extraction` · `canonical_fact` · `conflict` 는 M05 · M06 이 이미 설계해 둔 표를 그대로 쓴다(새 Event 엔진 · 새 사실 표 없음). 한 줄: **AI 가 읽은 답은 사실이 아니다 → 검증을 통과해 자격이 있으면 임시 사실(PROVISIONAL) 사건 → 사람이 확인하면 정식 사실(CONFIRMED) → 사실이 바뀌면 기다리던 Agent 가 다시 판단한다.**


**쉬운 말로 — 값의 단계**

| 단계 | 뜻 | 저장 위치 |
| --- | --- | --- |
| 후보(Candidate) | **AI 가 읽은 값**. 사실이 아니다 | `extraction`(PENDING · 검증 탈락은 REJECTED) |
| 임시 사실(PROVISIONAL) | **검증을 통과한 임시 사실**. 쓸 수는 있지만 "주의"(사람 확인 전) | 사건 OBSERVATION · `value_status=PROVISIONAL` |
| 확정 사실(CONFIRMED) | **사람이 확인한 사실**(또는 권한자 시스템) | 사건 VERIFICATION(CONFIRM) · HUMAN_UI 입력 |
| 거절됨(REJECTED) | **사용하지 않기로 한 값**. 기록은 남는다 | 사건 VERIFICATION(REJECT) |
| 대체됨(SUPERSEDED) | **새 사실로 대체된 이전 값**. 기록은 남는다 | 사건 CORRECTION(`supersedes_event_id`) |
| 검토 필요(NEEDS_REVIEW) | 값끼리 충돌하거나 큰 감소가 보류됨 — 사람이 정해야 한다 | `conflict_status=OPEN` · `hold_status=HELD` |

```text
회신 → 추출(후보, Backend 검증기) ──[같은 트랜잭션]──▶ 승격 판정(PromotionService)
   PASSED + 자격 있음 ─▶ event(OBSERVATION · LLM_EXTRACTED · EMAIL, 강도 1) = PROVISIONAL      extraction → ACCEPTED(created_event_id)
   PASSED + 자격 없음 ─▶ extraction PENDING 으로 남음 + 감사 FACT_PROMOTION_BLOCKED_<사유>    = 사람이 판단
사람 ─▶ VERIFICATION(CONFIRM) → CONFIRMED · VERIFICATION(REJECT) → 판정에서 빠짐 · CORRECTION(supersedes) → 대상 SUPERSEDED + 새 값 CONFIRMED
사건 → 사실 판정(reconcile/1) → canonical_fact · conflict(파생) → gap-rules/2 · get_recovery_context.facts → Agent 깨우기
```

| # | 구현 메모 |
| --- | --- |
| F-1 | **원칙**: AI 출력 ≠ 사실 · 검증된 후보 ≠ 확정 · PROVISIONAL ≠ CONFIRMED · 회신 한 통 ≠ 권위 있는 사실 · 모델 확신도 ≠ 권한. 상태를 바꾸는 것은 Backend 뿐이고 CONFIRMED 의 근거는 사람(`HUMAN_VERIFICATION`) 또는 권한자 시스템(`AUTHORITATIVE_SYSTEM`)뿐이다. 계획 승인은 근거가 아니다(docs/05 6.2). 모델이 틀리는 것(예: 수량 `"Yeah"`)은 정상 상황이다 — 검증기가 후보에서 거절하고 사실은 생기지 않는다 |
| F-2 | **승격 조건** `promotion-rules.ts`(순수, `promotion/2`): 발신자 판정 · 스레드 연결 · 정상(NORMAL) 회신(U6 — 보류 메일은 메시지가 없어 대상이 아님) · 정확한 인용 · 질문 범위의 칸 · 값 형식 · 단위 · 값-인용 · 같은 답 안의 상충(U7 검증기) 위에 더해: 후보 PENDING(대체 · 소비되지 않음) · 수량 칸 · 질문에 대상(개체 · 사실 키) · 질문 취소 아님 · 근거 계획 미교체(`PLAN_SUPERSEDED`) · 모호 표현 없음(`AMBIGUOUS_REPLY`) · 발신자 권한(`SENDER_NOT_AUTHORITY`: 역할이 사실 계열과 맞고 자기 자원이면 A, 소유 확인 불가면 S, 아니면 W=탈락) · **시간창**(F-7 — `WINDOW_OUT_OF_SCOPE` · `WINDOW_UNVERIFIED`) · **날짜**(F-7 — `DATE_OUT_OF_SCOPE` · `DATE_UNVERIFIED`) · 시뮬레이션이면 시나리오 · 중복 승격 없음(PENDING 한 번 전이 + 멱등 키 + 값이 다른 같은 주장은 `DUPLICATE_CLAIM`). **모델 확신도(`model_confidence`)는 어떤 조건에도 쓰지 않는다** — 0.99 여도 강도 1 · PROVISIONAL(시험). 탈락 사유는 감사 `FACT_PROMOTION_BLOCKED_<사유>`(대상 = 추출 id), 후보 DTO `promotion_blocked_reasons` |
| F-3 | **사건 모양**: `event_type` 은 docs/05 4.4 카탈로그 그대로(차량 `TRUCK_AVAILABILITY_REPORTED` · 창고 `WAREHOUSE_CAPACITY_CHANGED` · ODCY `YARD_CAPACITY_REPORTED`), `fact_kind` OFFER(차량 · ODCY) / STATE(창고), `extraction_method=LLM_EXTRACTED` + `extraction_id`, `input_confidence_level=MEDIUM`, 출처 역할 · 거래처 = 등록부 판정(AI 아님), SUBJECT 링크(개체) + CONTEXT 링크(거래처), `raw_input_id` = 회신 원문(복제 없음), 근거 시각 = Q-44 `source_recorded_at`(없으면 받은 시각). 멱등 키 `evk/1` 주장 위치 = `ask:<ask_id>` — 같은 회신 · 같은 질문은 사건 하나. `payload` 에는 **원문 · 인용 본문을 넣지 않는다**: 수신 때의 권한 판정(`authority`) + 추출 연결 고리(추출 id · 모델 · prompt · schema 버전 · 입력 지문 · 인용 참조 · 인용 지문) |
| F-4 | **사실 판정** `reconcile-rules.ts`(순수 · `asOf` 주입 · 사건 도착 순서와 무관): R1 제외(REJECT) · R2 강도 · R4-a 최근 우선 · **R4-b 강도 가드**(더 강한 현직과 다른 값을 약한 새 값이 말하면 OPEN, 현직 유지 — 사람이 확인한 값을 AI 후보가 덮지 못한다) · R4-d 제안 시간창 만료 · **R6 동시 충돌**(가장 강한 값끼리 τ 안에서 다르면 OPEN, 먼저 받은 값 유지) · R9 정정(철회 포함) · **R10 불리한 큰 변경 보류**(약한 근거가 현직을 θ 이상 줄이면 HELD) · R11 결정 가능성. **정책 값은 `truth-policy.ts` 한 곳**(`TRUTH_POLICY_VERSION=truth-policy/1`): `materialChangeRatio=0.30`(θ) · `nearTimeConflictWindowMs=5분`(τ) — **둘 다 실운영 데이터 없이 정한 휴리스틱 `[ASSUMPTION]`**, 제품의 확정 진리가 아니다. 실제 충돌 빈도 · 사람 정정 · 잘못된 보류 · 놓친 충돌을 보고 조정한다(판정 함수가 정책 객체를 인자로 받아 경계 시험이 있다: 29%/30%, 5:00/5:01). **출처 강도(0~3)** = 출처 종류 × 사실 계열별 출처 권한(A · S · W) × 검증기 입력 신뢰도(+ 사람 확인이면 최소 2) — 표는 `truth-policy.ts` 머리. 사람 입력 S=2 · 사람 확인 ≥2 · 권한자 시스템 A=3 · 공공 API A=2 · 이메일 추출 A/S=1 · W 또는 모호(LOW)=0. 공공데이터와 상대 회신 사이에 **전역 순위를 두지 않는다**(권한이 사실 계열별) — 계열 · 출처를 늘릴 때 이 표와 `promotion-rules.ts` 계열 → 역할 표를 늘린다. 안 한 것: R3 신선도(Q-24 — `freshness_status=UNKNOWN`) · R5 · R7 · R8. `value_status`: CONFIRMED / OBSERVED(강도 ≥ 2, 사람 확인 없음) / PROVISIONAL(강도 1) / UNKNOWN(**canonical_fact 행 없음**) |
| F-5 | **사람 행위** `POST /truth/events/{id}/confirm · reject · correct`(헤더 `X-CERA-Actor-Id` = 활성 HUMAN): 모두 **새 사건**(append-only). 확인 = VERIFICATION(CONFIRM · `DIRECT_REVIEW`) · 거절 = VERIFICATION(REJECT, 사유 코드 7종) · 정정 = CORRECTION(`supersedes_event_id`, 같은 fact_kind · 주체 · 범위 · 단위, 대상의 근거 시각 · 적용 시간을 이어받음, `HUMAN_UI` 직접 입력이라 CONFIRMED). 명령은 `raw_input`(HUMAN_UI, `cera-ui`, 명령 id 로 멱등) + 내용 저장소 사본을 가진다. 이미 원하는 상태면 새 사건을 만들지 않는다. 409 `EVENT_SUPERSEDED` · `ALREADY_REJECTED`, 422 `VALUE_UNCHANGED`. AI · Agent · 시스템 행위자는 403. `REVOKE` 규칙은 판정에 있으나 API 는 아직 없다 |
| F-6 | **충돌 · 덮어쓰기 금지**: 같은 좌표의 사건은 모두 남는다. 최신 답이라고 자동 승격하지 않는다 — 더 약한 새 값이 강한 현직과 다르면 OPEN, 큰 감소는 HELD, 같은 강도의 동시 불일치는 OPEN. `decision_usability`: OPEN · HELD → `APPROVAL_BLOCKED`(이 사실 계열은 모두 critical), PROVISIONAL · DISSENT → `USABLE_WITH_WARNING`, 만료 · 값 없음 → `UNUSABLE`. 풀리는 길은 사람뿐. `conflict` 행은 OPEN · DISSENT 일 때 재생성 |
| F-7 | **시간(temporal)**: 사실의 유효 범위 = 질문이 정한 날짜 · 시간창 **안에서** 회신이 말한 범위(Asia/Seoul → UTC). 질문 09–18시 · 회신 "15시 이후" → `valid_from` 15:00 · `valid_until` 18:00(더 구체적인 정상 답 — 허용). 질문 창을 넘는 부분은 잘라 낸다(묻지 않은 시간의 값을 만들지 않음). 겹치는 시간이 없으면 `WINDOW_OUT_OF_SCOPE`, 검증 못 한 시간 칸이 있으면 `WINDOW_UNVERIFIED` → 자동 승격 안 함(사람). 창고 · ODCY 일별 용량 = 그날 00:00~익일 00:00. **날짜**: 회신 계약(`reply-extract/1`)에는 답의 날짜 칸이 없다 — 숨기지 않는다. 그래서 인용이 든 문장의 날짜 표현을 결정론으로 확인한다(`date-scope.ts`): 오늘 · 내일 · 모레 · 글피 · 어제 · "10월 27일" · "27일"(회신 근거 날짜 기준)이 질문 날짜와 다르면 `DATE_OUT_OF_SCOPE`, 요일 · 다음 주 · 주말처럼 풀 수 없으면 `DATE_UNVERIFIED`. **표현할 수 없는 날짜를 질문 날짜로 임의 해석해 임시 사실로 올리지 않는다.** 날짜 칸을 가진 계약(`reply-extract/2`)은 T-111 |
| F-8 | **정보 공백 `gap-rules/2`**: 업무 `state` 가 사실 상태를 따른다 — 사람이 확인한(CONFIRMED · OBSERVED) 사실만 공백을 닫아 `known` 으로 옮기고, 임시 사실은 `PROVISIONAL_AVAILABLE`(공백 유지 · `fact` 첨부), 충돌 · 보류는 `NEEDS_REVIEW`, 사실 없음은 `MISSING`/`ASKED`. 만료된 제안은 사실 없음으로 본다(판정 기준 시각 = **계획 스냅샷 시각**, 시스템 시계가 아니다). 작업 흐름 `candidate_state` 에 `CANDIDATE_ACCEPTED` 추가. 후보 · 임시 · 확인 세 단계를 뭉치지 않는다 |
| F-9 | **Agent 맥락**: `get_recovery_context` 에 `facts`(값 + `fact_state` + `verified_by_human` + 근거 + 충돌 · 보류 + `decision_usability`) 추가 — `latest_observations` 는 판정 전 원본 주장. `get_reply_candidates` 후보에 `fact_event_id` · `promotion_blocked_reasons`. 계약 파일 `agent-tools.v1.json` 재생성 |
| F-10 | **Agent 깨우기**: 그래프에 `wait_fact_verification`(HUMAN interrupt, `AWAITING_FACT_VERIFICATION`, 대기 대상 = 문의 메시지) 추가 — 답이 임시 사실이 되면 실행은 사람 확인을 기다린다. 깨우기 판정 `wake-rules.ts`: 문의가 물은 좌표 중 PROVISIONAL 이 없으면 깨운다. 판정은 **DB 상태**(사건에서 바로 계산)이고 알림(`FACT_CHANGED`)은 최적화 — 신호를 잃어도 재조정(Worker)이 깨운다(시험). 깨어난 그래프는 공백을 다시 읽는다: 닫힘 → `FACT_CONFIRMED`(`facts_confirmed=true`) · 거절 → `FACT_REJECTED_GAP_OPEN` · 충돌 → `FACT_NEEDS_HUMAN_REVIEW`. 승격되지 못한 후보 → `CANDIDATE_RECEIVED_PENDING_CONFIRMATION`(= 사람이 봐야 함) |
| F-11 | **DB 가드(M20)**: 사람이 한 일은 HUMAN 행위자만 · 추출 ACCEPTED 는 LLM 추출 OBSERVATION 에 이어져야 함 · CONFIRMED 는 사람 근거 사건이 있어야 함(22.41). AI · Agent · 시스템은 SQL 로도 CONFIRMED 의 근거를 만들 수 없다 |
| F-12 | **읽기 ≠ 파생 표**: Agent · 화면은 사건에서 바로 판정한다. `canonical_fact` · `conflict` 는 쓰기와 같은 커밋에서 갱신되는 재생성 가능한 투영(후속 소비자용)이라 지워도 읽기 결과가 같다(시험). 자격 있는 값이 없으면 행을 지운다 |
| F-13 | **학습 데이터 고리**(별도 export 없음): 원문(`raw_input`) → 질문(`question_item`) → 추출(후보 · 인용 참조 · 지문 · 모델 · prompt · schema · 입력 지문 · 검증 결과) → 승격 사건(`event.extraction_id` · payload.extraction) → 사람 결정(VERIFICATION 사유 코드 / CORRECTION `corrected_event_id` · 새 값) → 최종 상태. "어떤 모델이 만든 오류인가"를 가를 수 있다. 파인튜닝은 하지 않는다 |
| F-14 | **하지 않은 것**: 신선도(Q-24) · 확인 요청 큐(`verification_request` · 처리 기록 — T-094) · `REVOKE` API · 후보 없이 사람이 값을 직접 입력 · 회신의 날짜 칸 · 정책 값 외부화(`policy.yaml`) · Solver · 비용 · 위험 · 상용 모델 호출 · fallback 공급자 |
| F-15 | **push 전 최종 확인(2026-10-26)**: ① 상대 날짜의 기준 = 회신 근거 시각(`source_recorded_at`, 없으면 받은 시각)의 **Asia/Seoul 날짜**(`replyDateOf`) — 처리 시각이 아니라 같은 회신을 언제 다시 처리해도 같다(23:50 KST 의 "내일" = 다음 날, 00:30 KST 는 서울 날짜 기준) ② 월이 없는 "N일" 은 질문 날짜의 일과 같을 때만 질문 날짜로 보고, 다르면 이번 달 · 다음 달을 정할 수 없어 `DATE_UNVERIFIED` ③ **출처 권한은 수신 때 사실 계열별로 판정해 사건에 남긴 값만 쓴다** — 판정이 없는 사건은 권한 NONE(강도 0, 후보 자격 없음). SYSTEM 행위자 · 공공데이터 · 파트너 시스템이라는 사실만으로는 강해지지 않고 사람이 확인한 값을 덮지 못한다(시험). 사람 직접 입력(HUMAN_UI)만 운영자 권한 S 를 기본으로 갖는다 ④ 모델 확신도는 강도 계산의 입력이 아니다(0.99 · 0.55 모두 강도 1, 시험) ⑤ 상대의 원래 주장("15시 이후")은 시간 칸 후보(`extraction`: 값 · 인용 · 위치)와 원문으로 남고, 사건의 `valid_from` · `valid_until` 은 이 질문에 적용한 범위(15:00–18:00)다 — 후보 행이 같은 사건(`created_event_id`)을 가리켜 둘을 따로 추적한다 |

**시험(2026-10-26 · 최종)**: Backend unit 163 · db 209(`truth.test.ts` 15 · `agent-runtime.test.ts` 13 — 두 프로세스 E2E: 임시 사실에서 실행이 기다림 → 사람 확인 → 깨어나 `FACT_CONFIRMED` / 신호를 잃어도 재조정이 깨움 / 거절 → `FACT_REJECTED_GAP_OPEN`) · Python 71 · Front 57 · typecheck · lint · build · `drizzle-kit check` · OpenAPI · Tool 계약 최신.

**Docker 실제 실행(2026-10-26, 별도 프로젝트 `-p cera-e2e` — 개발 DB 볼륨 미접촉)**:
- **CASE B(실제 로컬 모델 Qwen3-4B, GPU)**: Agent 실행 → 승인 → 발송 → Mock 회신("15:00부터 17:00까지 차량 2대 배차 가능합니다" · "차량 2대 가능합니다") → 모델이 수량을 `"Yeah"` · `"Yes"` 로 냄 → 검증기 `BAD_QUANTITY` 거절 → **사실 생성 없음**, Run 은 `CANDIDATE_RECEIVED_PENDING_CONFIRMATION`(시간 칸 후보만 남아 사람이 봄). 모델 튜닝 안 함. (앞선 같은 날 시도에서는 같은 문장이 수량 2 로 읽혀 PROVISIONAL → 확인까지 갔다 — 모델 출력이 일정하지 않다)
- **CASE A(통제된 회신 — 녹화 재생, LLM 미실행으로 표시)**: 같은 스택에서 AI 를 replay 로 두고 녹화가 있는 문장("오후 3시 이후 차량 4대 가능합니다") → 검증 → PROVISIONAL(4대, 15:00–17:00) → Run `WAITING_HUMAN · AWAITING_FACT_VERIFICATION` → **브라우저(Edge, playwright-core)에서 [확인] 클릭** → 화면 PROVISIONAL → CONFIRMED → Agent 깨어남 → `FACT_CONFIRMED`, 공백 `KNOWN`, `facts_confirmed=true`. 같은 스레드에 회신을 더 넣어 **[거절]**(새 후보 REJECTED, 현재 값 유지) · **[정정]**(대상 SUPERSEDED + 사람 값 사건)도 브라우저로 눌렀다. 정정 값 3 은 2분 전 사람이 확인한 4 와 τ 안에서 달라 R6 충돌(NEEDS_REVIEW)이 됐다 — 정책대로의 동작(두 사람 근거가 다르면 사람이 정한다)
- 이 과정에서 기존 설정 결함 하나를 찾았다: `ai/.env` 에 `CERA_AI_REPLAY_DIR=`(빈 값)이 있으면 녹화 폴더 대신 현재 폴더를 읽는다 → T-093 밖, 후속 커밋에서 고친다





### 18.15 Runtime 비상 상한 · 관측 (2026-10-26 · 사용자 지시)

**DB 변경 없음.** 원칙: 운영 데이터가 아직 없으므로 적정 지연 · 단계 · Tool 호출 · 재시도 수를 안다고 가정하지 않는다. **정상적인 느린 실행을 막는 낮은 제한을 추측해 두지 않고, 폭주(무한 loop · 재시도 · HTTP 대기 · 생성)만 끊는 넉넉한 비상 상한**을 둔다. 값은 모두 `[ASSUMPTION / DEVELOPMENT SAFETY CEILING]` — 제품 정책이 아니다. 실행 분포를 보고 줄인다("숫자를 먼저 정하고 시스템을 맞추지 않는다. 시스템을 관측하고 숫자를 정한다").

| 설정(env) | 이전 | 지금 | 무엇을 막나 |
| --- | --- | --- | --- |
| `CERA_AGENT_MAX_STEPS`(ai) | 25 | 100 | 실행 전체의 그래프 단계 — 끝나지 않는 loop |
| `CERA_AGENT_MAX_TOOL_CALLS`(ai) | 12 | 50 | 대기와 대기 사이 한 구간의 Tool 호출 |
| `CERA_AGENT_MAX_RETRIES`(ai) | 2 | 3 | 재시도 가능한 Tool 실패의 재시도(같은 멱등 키) — 다 쓰면 `RETRY_LIMIT_REACHED`(원인 코드는 호출 기록에 남음) |
| `CERA_AGENT_RUNTIME_TIMEOUT_MS`(back) | 120 000 | 900 000 | Backend → Python **그래프 한 번 구동**(시작 · 재개 → 다음 interrupt) 요청 하나. 사람 · 외부 대기(`WAITING_HUMAN` · `WAITING_EXTERNAL` · `WAITING_RUNTIME`)는 요청이 끝난 뒤라 **대상이 아니다**(시험: 대기 중 상한을 넘겨도 실패하지 않음) |
| `CERA_LOCAL_LLM_TIMEOUT_S`(ai) | 300 | 300 | 로컬 모델 추론 요청 하나 — 넘으면 `MODEL_TIMEOUT`(재시도 가능). 관측: Qwen3-4B 콜드 스타트 > 20초, 7B CPU 약 41.6초/건 |
| `CERA_COMMERCIAL_LLM_TIMEOUT_S`(ai, 신설) | SDK 기본 | 120 | 상용 API(anthropic · openai · gemini) 요청 하나 — 공급자 종류별로 따로 둔다(local · commercial · 공공데이터). 정책 엔진은 만들지 않음 |
| `CERA_AI_TIMEOUT_MS`(back) | 20 000 | 330 000 | Backend → AI Server 추출 요청 하나 — 로컬 모델 상한(300초)보다 길게 둬서 모델 쪽 `MODEL_TIMEOUT` 이 먼저 보이게 |
| `CERA_PUBLIC_DATA_TIMEOUT_MS`(back) | 10 000 | 30 000 | 공공 API 요청 하나 |
| Tool 실행 상한 `TOOL_TIMEOUT_MS`(back) | READ 5s · EXTERNAL 60s · COMPUTE 10s · PROPOSE/REQUEST 15s | 30s · 120s · 60s · 60s | Tool 하나(계약 파일에 실림 — Python 쪽 HTTP 대기는 그 + 5초) |

- **상한 도달은 업무 실패와 구분되는 코드**: `LOOP_LIMIT_REACHED` · `TOOL_CALL_LIMIT_REACHED` · `RETRY_LIMIT_REACHED`(Agent 실행) · `MODEL_TIMEOUT`(모델 응답 없음 — 추출 기술 실패의 공급자 코드) · `EXTRACTION_TIMEOUT`(Backend → AI Server) · `AGENT_RUNTIME_TIMEOUT`(그래프 구동 요청 — `WAITING_RUNTIME` 재시도 후 상한이면 FAILED). "상한이 너무 낮은가 / 그래프가 이상하게 도는가"를 이 코드로 가른다
- **관측**: `npm run runtime:stats`(back) — 기존 기록(`agent_step` · `agent_tool_call` · `agent_run` · `public_data_fetch` · `system_error`)만 읽어 그래프 구동 시간 · 노드 시간 · Tool 시간 · 공공데이터 지연 · 실행당 단계 · Tool 호출 · 재시도 · Runtime 재시도의 p50 · p90 · p95 · p99 · max 와 상한 · 시간 초과 코드 수를 낸다. **새 저장 구조 없음.** 모델 추론 시간은 DB 에 두지 않는다 — AI Server 로그 한 줄(`local llm call model=… server=… total_ms=… first_call_in_process=…`, 프롬프트 · 회신 본문 없음)과 평가 결과(`metrics.json` 의 `latency_ms_p50 · p90 · p95 · p99 · max`). RAM · VRAM 은 평가 스크립트(`infra/local/eval-ladder.sh`)가 기록한다 — 운영 Runtime 에 무거운 profiler 를 넣지 않는다
- **줄이는 기준(예)**: 정상 실행 500건의 단계 p99 = 22 → 100 을 40 으로 · 로컬 추론 p99 = 18초 → 300초를 60초로. 줄일 때는 이 표와 `.env.example` 을 같이 고친다
- 함께 고친 결함: `ai/.env` 의 `CERA_AI_REPLAY_DIR=`(빈 값)이 녹화 폴더 대신 현재 폴더를 가리키던 것 → 빈 값 = 기본 폴더


### 18.16 T-111 Truth Lifecycle Hardening 구현 확인 결과 (2026-10-26 · DONE — 사용자 승인)

**표 · 열 변경 없음.** M21 = 철회 가드 1개(22.42). 한 줄: **한 번 확정된 사실도 영원히 믿지 않는다** — 사람이 철회하면 현재 사실에서 빠지고, 시간이 지나면 "오래됨"이 되며, 운영자가 전화로 확인한 사실은 AI 없이 바로 넣을 수 있다. 답의 날짜도 계약에 담는다.

**쉬운 말로 — 값의 단계(T-093 표에 더한 것)**

| 단계 | 뜻 | 기록 |
| --- | --- | --- |
| 철회됨(REVOKED) | **사람이 "그 값은 더는 유효하지 않다"고 거둔 값** — 새 값 없이. 그 시점까지의 값이 모두 현재 사실에서 빠진다 | 값 없는 CORRECTION(사람 · HUMAN_UI) |
| 오래됨(STALE) | **틀린 것이 아니라 지금 결정에 쓰기에 오래된 값** — 유효 시간이 지났거나(EXPIRED) 계열별 신선도 기준을 넘김 | 기록 없음 — 기준 시각으로 판정 |
| 사람 직접 입력 | **운영자가 전화 · 방문으로 확인해 넣은 사실** — 바로 확정(CONFIRMED) | HUMAN_UI OBSERVATION(의도 · 출처 메모 · 감사) |

| # | 구현 메모 |
| --- | --- |
| L-1 | **철회** `POST /truth/events/{id}/revoke`(사유 3종 `SOURCE_WITHDREW` · `OPERATOR_INVALIDATED` · `OUTDATED_OPERATIONAL_STATE` + 메모): 기존 스키마의 **값 없는 CORRECTION**(docs/05 10절 "철회")을 쓴다 — 새 상태 열 · 표 없음. 판정 규칙(`reconcile-rules.ts`): 사람(HUMAN_UI)의 철회는 대상과 **근거 시각이 철회 시각 이하인 모든 값**을 빼낸다(옛 다른 값이 되살아나지 않게). 철회 뒤에 들어온 새 근거는 정상 경쟁한다. 결과 `fact_state = REVOKED`(값 없음 · `revoked_by_event_id`), 파생 행 삭제, 사건은 모두 남음. 사람만: 서비스(활성 HUMAN) + M20(HUMAN_UI = HUMAN 행위자) + **M21(값 없는 CORRECTION 은 HUMAN_UI 만)** + 판정 규칙(다른 출처의 값 없는 정정은 아무것도 철회하지 못함). 결정론 시스템 출처의 철회는 정의하지 않았다(필요하면 계열별 권한과 함께). 같은 철회의 재요청 = 사건 하나. 철회된 값은 확인 · 정정 409 `EVENT_REVOKED` |
| L-2 | **신선도**(`truth-policy.ts` `truth-policy/2`): ① 사실의 명시적 `valid_until` 이 먼저 — 지나면 **EXPIRED**(모든 fact_kind; 옛 규칙은 OFFER 만), 그 전에는 FRESH ② 없으면 **계열별 정책** — 근거 시각부터 FRESH → AGING(주의) → STALE: 차량 가용 · 창고 수용량 6시간 / 24시간, ODCY 12시간 / 48시간 — **실운영 데이터 없이 정한 넉넉한 시작값 `[ASSUMPTION]`**(docs/05 15절 PoC 값 1~4시간보다 길게). 실제 STALE 빈도 · 재확인 · 정정을 보고 줄인다 ③ 정책 없는 계열은 평가하지 않음(UNKNOWN). 전역 TTL 없음. **STALE ≠ 틀림**: `value_status`(보증 수준)는 그대로 두고 `freshness_status` 와 `fact_state = STALE` 로 따로 보인다(REJECTED · REVOKED · SUPERSEDED 와 구분). R11: EXPIRED → UNUSABLE, STALE → APPROVAL_BLOCKED, AGING → USABLE_WITH_WARNING |
| L-3 | **기준 시각(as_of)**: 판정 함수는 시계를 읽지 않고 `asOf` 를 받는다. 실제 계획 실행 = 지금(시계 포트), **시뮬레이션 실행 = 그 시나리오 시각**(스냅샷 기준 시각 — 가상 시나리오는 실제 시간에 늙지 않는다), 호출자가 주면 그 시각(`GET /truth/facts?as_of=` · 행위 API `?as_of=` · `informationGaps(run, override)`). 같은 as_of 면 같은 답(시험). 사실 응답에 `evaluated_as_of`. 화면은 목록의 기준 시각을 행위 요청에 넘긴다 |
| L-4 | **시간 경과 반영**: 읽기(Agent · 화면)는 사건에서 바로 판정하므로 항상 그 기준 시각의 답이다. 파생 표(`canonical_fact`)는 Worker 가 60초 `[ASSUMPTION]` 마다 다시 쓴다(`refreshDerived` — 잠금 `cera.truth.refresh`, 바뀐 수 · 걸린 시간 기록). 기다리는 Agent 의 깨우기도 DB + 실행의 기준 시각으로 판정한다(알림 · 프로세스 타이머에 기대지 않음) |
| L-5 | **정보 공백 `gap-rules/3`**: 확인됐어도 오래됐거나(STALE · EXPIRED) 철회된 사실은 공백을 닫지 못한다 → **NEEDS_REFRESH**(`refresh_basis_event_id` = 오래된 값 또는 철회 사건). 그 근거보다 뒤에 보낸 문의가 있으면 ASKED. 새 상태는 이것 하나다(공백 id 재료는 판 1 그대로 — 도는 실행이 공백을 잃지 않음). Agent 그래프: NEEDS_REFRESH 는 MISSING 처럼 다시 묻는다 — 초안 멱등 키에 근거 사건을 붙여(`…:draft:r<근거 12자>`) 옛 초안을 되돌려 주지 않는다. 사실 확인을 기다리던 실행은 철회 · 만료로 깨어나 `FACT_NEEDS_REFRESH` 로 끝난다 |
| L-6 | **사람 직접 입력** `POST /truth/facts/manual`: 명시 의도 `intent = OPERATOR_DIRECT_ENTRY` · 출처 메모 필수(200자) · 상대가 말한 시각(선택, 미래 불가) · 종류(차량 슬롯 · 창고/ODCY 수용량) · 대상 · 날짜 · 시간창 · 값 · (시뮬레이션이면 시나리오). 사실 키는 문의와 같은 규칙(`targetFactKey`)이라 같은 좌표에 모인다. HUMAN_UI OBSERVATION(권한 S, 강도 2) → **바로 CONFIRMED** — Confirm 을 한 번 더 누르지 않는다. AI · Agent · 시스템 403 + M20. 명령 id 로 멱등. 고칠 때는 정정(대체 + 새 사건), 철회도 같다 |
| L-7 | **날짜를 담는 회신 계약 `reply-extract/2`**: 질문의 칸에 `answer_date`(DATE, YYYY-MM-DD) · 요청에 `reply_date`(회신 근거 시각의 Asia/Seoul 날짜 — 상대 날짜의 기준) · `timezone: Asia/Seoul`(계약에 드러냄). 검증기는 DATE 의 형식 · 단위만 본다(conformance 포함 — Python 포팅 일치). **승격 단계가 인용 문장을 회신 날짜 기준으로 다시 풀어**(`date-scope.ts`) 모델 날짜와 맞을 때만 믿는다: 다른 날 → `DATE_OUT_OF_SCOPE`, 인용이 뒷받침 못 함 → `DATE_UNVERIFIED`. 프롬프트 `reply-extract-v2` |
| L-8 | **하위 호환**: AI Server 는 v1 · v2 요청을 모두 받고 요청한 판으로 답한다. Backend 는 v1 응답도 받는다(날짜 칸 없음 → 문장 날짜 확인만). 추출 행 `schema_version` = 실제로 쓰인 응답 판. 녹화 재생은 회신 본문 지문으로 찾으므로 녹화 파일은 고치지 않았다. v1 계약 파일 · 견본은 기록으로 그대로 두고 v2 파일을 더했다(`packages/contracts/ai/reply-extract.v2.*`). 평가 데이터셋(141건)은 v1 요청 그대로 돈다 |
| L-9 | **Solver 가 읽을 사실 계약**: `fact_state` 로 구분된다 — CONFIRMED(+ `freshness_status` FRESH · AGING) · PROVISIONAL(+ 신선) · STALE(+ `value_status` 가 CONFIRMED 인지 PROVISIONAL 인지) · REVOKED · NEEDS_REVIEW(충돌 · 보류) · UNKNOWN. 무엇을 어떤 위험 가중으로 쓸지는 Cost / Risk / Solver Task 가 정한다(숫자 없음) |
| L-10 | **확인 요청 큐 검토**: 지금은 Agent 패널의 사실 카드가 PROVISIONAL · 충돌 · 보류 · 오래됨 · 철회를 계획 실행 단위로 보여 주고 행위(확인 · 거절 · 정정 · 철회 · 직접 입력)를 받는다. 여러 실행을 가로지르는 한곳 목록은 **T-098(역할별 화면)로 미룬다** — 이번에 새 대시보드를 만들지 않았다(`verification_request` 표는 그대로 비어 있음) |
| L-11 | **학습 데이터 고리**: 회신 → 추출(후보 · 인용 · 모델 · 검증) → 임시 사실 → 사람 확인 · 거절 · 정정 → **철회(사유) · 오래됨(기준 시각)** → 최종 현재 사실. 직접 입력은 `entry` · `source_note` 로 구분된다 |
| L-12 | **알려진 빈틈**: 차량 풀 목록 API 가 없어 화면의 직접 입력은 이미 사실이 있는 차량 풀만 고를 수 있다(창고 · ODCY 는 `/registry/facilities`). 화면에 as_of 를 고르는 선택기는 없다(API 인자만). 시뮬레이션 사실의 신선도는 시나리오 시각으로만 판정된다 |

**시험(2026-10-26)**: Backend 390(unit 169 · db 221 — `truth.test.ts` 철회 · 권한 · 신선도 · 재현성 · 직접 입력 · 정정 · 날짜 계약 · v1 호환 · `agent-runtime.test.ts` 철회 → 신호 유실에도 재조정이 깨움 → `FACT_NEEDS_REFRESH`) · Python 80 · Front 74 · typecheck · lint · build · `drizzle-kit check` · OpenAPI · Tool 계약 · AI 계약 · conformance 최신.

**Docker 실제 실행(2026-10-26, 별도 프로젝트 · 통제된 회신 = 녹화 재생 — LLM 미실행)**: FLOW 2 — 운영자 직접 입력 → CONFIRMED → 공백 `known` → 철회 → REVOKED · 공백 NEEDS_REFRESH → 새 Agent 실행이 그 공백을 골라 다시 물음(초안 `available.slot(2026-10-13T15:00-17:00)`). FLOW 1 — 그 문의 승인 → 발송 → 회신 → PROVISIONAL → 실행 `AWAITING_FACT_VERIFICATION` → 확인 → 깨어나 `FACT_CONFIRMED` → `as_of` 14:00 = CONFIRMED · FRESH / 17:00(시간창 끝) = STALE(EXPIRED · UNUSABLE, 보증은 CONFIRMED 그대로) / 다시 14:00 = 같은 답. **브라우저(Edge)**: 사실 카드 "사람 확인 완료 · 신선" → [철회] → "철회됨 — 지금 값 없음" → 직접 입력 폼(종류 · 대상 · 날짜 · 시간창 · 값 · 확인 출처) → "사람 확인 완료 5대". 오래됨 표시는 컴포넌트 시험으로 확인(화면에 as_of 선택기 없음). 관측(`runtime:stats`, 이 스택): 그래프 구동 p99 0.5초 · 노드 p99 82ms · Tool p99 69ms — 표본이 작아 상한을 줄이지 않았다.


```
M01 기반·운영 기록   scenario ─┬─ actor
                              ├─ audit_log (actor)
                              └─ system_error (scenario)
M02 등록부          counterparty ─ counterparty_contact ─ contact_channel_address (actor)
                    facility · truck_pool (counterparty)
M03 계획 시드        planning_snapshot (scenario) ─ recovery_run (planning_snapshot, 자기참조)
M04 통신            comm_thread (counterparty, counterparty_contact, recovery_run, scenario)
                    question_item (comm_thread)
                    comm_message (comm_thread, contact_channel_address, scenario)      ← current_approval_id FK 없이
                    comm_message_structured_field · comm_message_question
                    message_approval (comm_message, actor, recovery_run, 자기참조)
                    message_approval_structured_field
                    ALTER comm_message ADD FK (current_approval_id, message_id)         ← 순환 ①
                    send_attempt (comm_message, message_approval)
                    message_status_transition (comm_message, actor, send_attempt)
M05 수신·사건       raw_input (actor)
                    extraction (comm_message, raw_input, actor)                         ← created_event_id FK 없이
                    event (raw_input, counterparty, actor, 자기참조, extraction, scenario)
                    ALTER extraction ADD FK (created_event_id)                          ← 순환 ②
                    event_entity_link · event_verification_target (event)
M06 파생·사람 처리   canonical_fact (event, scenario) · conflict (scenario)
                    verification_request (conflict, scenario)
                    verification_request_handling (actor, question_item, event)
M14 공공데이터(T-102) vessel_call (raw_input) ─ container (vessel_call, raw_input)
                    bl (counterparty, raw_input, 자기참조) ─ container_bl (container, bl)
                    external_identifier (event, raw_input) · public_data_fetch (raw_input, actor)
M15 가드 · 권한(T-102 custom — 트리거 · 함수 교체 · GRANT, 표 없음)
M16 Agent 기록(T-103) agent_run (recovery_run, actor) ─ agent_tool_call (agent_run)
M17 가드 · 권한(T-103 custom — 행위자 · 전이 · 열 가드 · GRANT, 표 없음)
M18 Agent Runtime(T-104) agent_step (agent_run, agent_tool_call) · agent_checkpoint (agent_run) · agent_checkpoint_write (agent_run) + agent_run 열 7
M19 가드 · 권한(T-104 custom — 생애주기 · 열 가드 교체 · append-only · GRANT, 표 없음)
```

**순환 분석 — 둘 다 "NULL 먼저, FK 나중"으로 풀리고 설계 오류가 아니다**

| 순환 | 왜 생기나 | 해법 | 지연 FK 필요? |
| --- | --- | --- | --- |
| ① `comm_message.current_approval_id` ↔ `message_approval.message_id` | 메시지가 먼저 생기고 승인은 나중. 포인터는 캐시 | 컬럼은 NULL 허용으로 먼저 만들고, 같은 migration 끝에서 FK 추가. 실행 순서: 메시지 → 승인 → 포인터 갱신 | 아니오 |
| ② `extraction.created_event_id` ↔ `event.extraction_id` | 추출이 먼저, 사건은 채택 때 | 같다. 실행 순서: 추출 → 사건 → 검토 갱신 | 아니오 |

- 자기참조 3개(`recovery_run.previous_run_id` · `message_approval.invalidates_approval_id` · `event.supersedes_event_id`)는 **불변 행 + 이미 있는 행만 참조**라서 순환이 생길 수 없다(자기 자신은 CHECK 로 막는다).
- **다형 참조**(`event_entity_link` → 마스터들)는 FK 가 아니므로 그래프 밖이다. 삽입 가드 트리거는 M02 의 표가 있어야 동작한다 — M05 뒤에 트리거를 만들므로 문제없다.

---


### 18.17 T-112 · T-113 · T-114 Cost / Risk Engine · Recovery Solver · Recovery Plan 구현 확인 결과 (2026-10-26 · DONE — 사용자 승인)

- **엔진(순수 · 결정론, `back/src/planning/engine/`)** — DB · HTTP · LLM · 현재 시각 없음(ADR-029). 금액 = KRW 정수(ADR-006), 날짜 = Asia/Seoul
  - `cost-engine.ts`: 컨테이너 × 선택지(KEEP_CURRENT_PLAN · MOVE_TO_ODCY(대상 · 입고일) · WAIT_AT_TERMINAL(입고일) · MOVE_TO_WAREHOUSE(다른 창고 — 화주 승인 없으면 실행 불가))마다 `feasible` · `infeasible_reasons` · 비용 8항목(transport · storage · handling · demurrage · detention · delay · additional_move · risk) · `base_cost`(실제로 내는 돈) · `risk_penalty`(정책 벌점) · `total`. 항목마다 수량 · 단가 · 출처(RATE_TABLE · FACT · POLICY + 참조) · 가정. 요율 · LFD 가 없으면 **NOT_AVAILABLE + RATE_MISSING/LFD_MISSING 실행 불가**(숫자를 지어내지 않는다). 입력 검사(KRW 정수 · 오프셋 있는 as_of · 사실 좌표 중복 없음)
  - `cost-policy.ts`(`cost-policy/1`, 값은 모두 [ASSUMPTION]): 지연 벌점 CRITICAL 300,000 · HIGH 50,000 · NORMAL 0 원/일 · LFD 후 터미널 대기 위험 10,000 원/일 · 잠정 사실 의존 20,000 · 오래되는 중 10,000 · 반납 리드타임 1일. 사실 사용 규칙: CONFIRMED · OBSERVED(신선) 그대로 · AGING 경고 + 벌점 · PROVISIONAL 정책 허용 시 경고 + 벌점 · NEEDS_REVIEW · STALE · EXPIRED · REVOKED · UNKNOWN 은 제약으로 쓰지 않는다(그 자원 = 없음)
  - `baseline.ts`(`baseline/1` 규칙, 최적화 아님): 오늘 남은 창고 용량만큼 원래 출발 순서(동시면 우선순위 → Reefer → 번호)로 KEEP, 나머지는 대기 · 입고일은 LFD 순(동률은 하루 대기 비용 큰 순). **같은 비용표**의 선택지를 그대로 쓴다
  - `solver.ts`(`recovery-solver/1`): **HiGHS 1.15.3(highs-js, MIT, WASM — Backend 프로세스 안, 네트워크 없음, 단일 스레드)** 0-1 MIP. 변수 y(선택지) · z(선택지 × 트럭 × 출발 정시) · s(계획 불가). 제약: 컨테이너당 하나 · 창고 일별 용량(약속된 수 뺌) · ODCY 용량(규격별) · 트럭 한 대 한 시각 한 일(왕복 시간 점유) · 출발 시간창(as_of 이후 · 입고 마감 · ODCY 반입 마감). 목적 Σ total + 협력 트럭 위험 벌점. 동률은 3단계(목적값 고정 → 원래 계획에 가까운 쪽 → 이른 출발 · 트럭 번호)로 결정론 해소. 상태 OPTIMAL · FEASIBLE · INFEASIBLE · TIME_LIMIT · ERROR, 비상 상한 30초 [ASSUMPTION / DEVELOPMENT SAFETY CEILING]. 할당마다 이유 코드(더 싼 선택지가 어떤 자원이 차서 막혔나) · 대안 4개(차액) · 근거 · 경고. 계획 불가면 컨테이너별 이유(선택지 실행 불가 이유 + 찬 자원)
- **입력(`scenario-input.ts`)** — 시나리오 팩(합성 컨테이너 30 · 요율 [ASSUMPTION] · 자사 트럭 명부 · 다음 날 용량) + **Truth 사실**(오늘 창고 · ODCY 용량, 협력 차량 가용 — Agent 가 묻는 계열은 Truth 에서만, 다른 좌표도 Truth 값이 있으면 Truth 우선). 사실마다 `source` TRUTH(사건 id) · SCENARIO(팩 위치). 실제(시뮬레이션 아닌) 계획 실행은 컨테이너 데이터가 없어 `PLANNING_INPUT_UNAVAILABLE`(409) — 숫자를 만들지 않는다. 협력 회신 "N대"는 시간창 동안 일하는 트럭 N대로 본다 [ASSUMPTION]
- **저장(M22 · M23, 22.43 ~ 22.45)** — `recovery_plan`(판 = Solver 실행 하나) · `recovery_plan_item`. 입력 스냅숏은 기존 `planning_snapshot`(append-only) `scope_ref` 에 쓴 Truth 사실(사건 id · 상태 · 값 · 신선도) · 정책 판 · as_of · 후보 · 약속 · 트럭. `recovery_run` 은 새로 만들지 않는다(초안의 "계획 교체" 판정 · 화면 실행 목록에 섞이지 않게). 판 상태 PROPOSED → APPROVED(사람만, `plan_hash` 인용) · SUPERSEDED · OUTDATED, INFEASIBLE. 입력 지문이 같으면 새 판 없이 지금 판을 돌려준다
- **사실 변경 → OUTDATED → 다시 계산** — `RecoveryPlanService.refreshOutdated`: 지금 판이 기댄 Truth 사실을 **판의 as_of 로** 다시 판정해 스냅숏과 비교(다른 사건이 이김 FACT_SUPERSEDED · 철회 FACT_REVOKED · 상태 · 값 FACT_STATE_CHANGED · 충돌 FACT_CONFLICTED · 새 사실 FACT_ADDED). API 의 `FACT_CHANGED` 알림 + Worker 60초 주기(알림을 놓쳐도). OUTDATED · 승인 → `PLAN_CHANGED` 알림 → 그 판을 기다리던 Agent 실행을 깨운다(Coordinator) · Worker 재조정은 판 상태로 같은 결론(`planWakeReason`)
- **Agent(ADR-036 경계 유지)** — Tool 4개: `calculate_recovery_costs` · `solve_recovery`(COMPUTE, 저장 없음) · `propose_recovery_plan`(PROPOSE, Idempotency-Key 필수, 만든 이 = 실행의 AI_AGENT) · `get_recovery_plan`(READ). 승인 Tool 은 없다(`approve_plan` · `approve_recovery_plan` 금지 목록). 그래프: 사람이 `parameters.plan_recovery` 를 켜면 공백이 닫히거나 사람 확인만 남을 때 `calculate_costs → solve_recovery → propose_plan → wait_plan_decision(AWAITING_PLAN_DECISION, 대기 대상 RECOVERY_PLAN)` → `track_plan`: APPROVED → 완료(PLAN_APPROVED) · OUTDATED/SUPERSEDED → 맥락 · 공백 다시 읽고 다시 계산 · 그 밖 → 계속 대기. 계획 모드에서는 잠정 사실이 실행을 멈추지 않는다(엔진이 벌점 · 경고와 함께 쓰고, 사람이 확인하면 판이 OUTDATED → 다시 계산)
- **API** — `GET /planning/runs/:runId/costs`(비용표 · 저장 없음) · `GET/POST /planning/runs/:runId/plans`(판 목록 · 사람 재계산) · `GET /planning/plans/:planId` · `POST /planning/plans/:planId/approve`(사람 · `plan_hash`). 응답 숫자는 저장된 엔진 출력 그대로(`result_kind = ENGINE_RESULT`, 입력이 합성이면 `contains_simulated`)
- **화면** — Agent 패널에 "복구 계획까지" 선택(기본 켬) · 복구 계획 패널: 문제(창고 · 들어올 수 · 받을 수 · 초과) · Baseline vs 추천 손실 · 절감(시뮬레이션 기준) · 조치별 대수 · 경고(잠정 · 제외 사실 · 꽉 찬 제약) · 컨테이너별 조치 · 대상 · 입고일 · 출발 · 트럭 · 손실 · Baseline · 이유 · 펼치면 비용 항목(출처 · 가정) · 다른 선택지와 막힌 이유 · 판 목록 · OUTDATED 사유 · [지금 사실로 다시 계산] · [이 계획 승인]
- **30대 시나리오(S7 = 회신 3건 반영 뒤, 오프라인 `npx tsx src/dev/plan-scenario.ts --step S7`)** — Baseline: 영향 12대 base **4,650,000**(시나리오와 같음 · 같은 입고일) · 직송 유지 8대 1,600,000 · 창고 B 3대 590,000 → 23대 base 6,840,000 · 위험 380,000 · 합 7,220,000. 시나리오 Plan v1 · v2 의 배정을 엔진으로 값 매기면 **3,835,000 · 3,855,000**(시나리오와 같음 — 시험). **Solver 최적해**: base 5,535,000 · 위험 280,000 · 합 5,815,000(영향 12대 base **3,345,000** — v2 보다 510,000 낮음). 차이: 시나리오는 입고일을 LFD 순으로 고정했지만 Solver 는 입고일도 고른다 — LFD 10/14 인 C017 · C018 · C020 을 10/14 직송 대기(Demurrage 0)로 두고, LFD 10/13 인 40FT 를 ODCY 로 보낸다. 직송 유지 8대는 같은 8대(Reefer 4 · 필수 화물). 계산 시간: 비용표 ≈ 6 ms · Solver(3단계) ≈ 0.5 s(23대 · 선택지 117 · 트럭 변수 1,790)
- **시험** — unit: Cost Engine 16(A 결정론 · B 실행 불가 · C 용량 · D 시간창 · E 확인 사실 · F STALE/EXPIRED · G REVOKED/충돌/없음 · H 잠정 정책 · AGING · I 항목 합 = 합계 · K 음수 없음 · L 통화 · 단위 · M 요율 · LFD 없음 · N as_of 재현 · 계산식 · J Baseline = 같은 엔진(4,650,000) · v1/v2 가격 매기기) · Solver 12(한 대 · 용량 · 경쟁 · 트럭 왕복 · 용량 부족 INFEASIBLE + 이유 · 대기 fallback · 전수 조사와 같은 최솟값 · 결정론 · 사실 변경 → 다른 해 · 협력 잠정 트럭 벌점 · 30대 S7 · S1→S7) · 깨우기 규칙 1 · Tool 등록부. db: `recovery-plan.test.ts` 7(비용표 = Truth + 팩 · 제안 v1 · 스냅숏 · 재사용 · 철회 → OUTDATED → v2 · 승인 가드(해시 · 사람 · OUTDATED) · DB 가드(CE001 · CE002 · CE004 · CE005 · 42501) · Agent Tool 4개 · 실제 실행 거부) + 카탈로그(표 42 · 컬럼 521 · FK 86 · 함수 30 · migration 23). Python 그래프 5(계획 경로 · 잠정만 남아도 계획 · 승인 → 완료 · OUTDATED → v2 · Solver 오류)
- **Docker E2E(별도 프로젝트 `cera-e2e`, AI 녹화 재생 · 실제 API · Worker · Python Runtime · PostgreSQL)** — 사람 직접 입력 5(창고 A 8 · 내일 11 · 창고 B 10 · ODCY A 4 · ODCY B 6) → Agent(계획까지) → K운송 문의 → 승인 · 발송 → Mock 회신 "오후 3시 이후 차량 4대" → PROVISIONAL → **v1 PROPOSED 5,735,000(Baseline 7,220,000 · 절감 1,485,000, 회신 → v1 6초)** → 사람 확인 → v1 OUTDATED(FACT_STATE_CHANGED) → Agent 깨어남 → **v2(4초)** → ODCY A 정정 4 → 2(CORRECTION) → v2 OUTDATED(FACT_SUPERSEDED) → **v3 5,835,000(ODCY A 2대, 4초)** → 사람 승인 → Agent COMPLETED `PLAN_APPROVED`. Tool 시간: 비용 17~38 ms · Solver 320~633 ms · 제안 319~394 ms. 첫 시도에서는 ODCY A 를 "새 직접 입력" 으로 바꿨고, 5분 안 두 사람 값이 R6 충돌(NEEDS_REVIEW)이 되어 v3 가 ODCY A 를 쓰지 않았다(규칙대로 — 충돌 사실 제외 경로 확인). 브라우저(Edge): 계획 패널 · 판 목록 · 펼친 비용 내역 · 대안 확인, 페이지 오류 0
- **남은 것 · 한계**: 다음 날 트럭(대기 후 직송 · ODCY→창고) · ODCY 일별 점유 · 개별 트럭 동선(2단계, ADR-009)은 모델 밖. 실제 계획 실행의 컨테이너 연결(공공데이터 컨테이너 → 계획)은 없다. 승인된 계획 → 문의 · 배차는 없다(승인 ≠ 실행). 벌점 값 · 협력 회신 해석은 [ASSUMPTION] — 관측 후 조정

### 18.18 T-119 Authentication / RBAC 구현 확인 결과 (2026-10-27)

- **방식** — Backend 관리 세션. `POST /auth/login`(login_id · password) → 32바이트 난수 토큰을 HttpOnly · SameSite=Strict 쿠키로, DB(`user_session`)에는 sha256 지문만. 서명 비밀키 · JWT 없음. 비밀번호는 Node 내장 scrypt(`scrypt$N$r$p$salt$hash`). 로그인 실패 사유는 하나(`INVALID_CREDENTIALS`), 계정별 15분 5회 제한(프로세스 메모리 [ASSUMPTION]). 로그아웃 · 역할/활성/비밀번호 변경 → 그 사용자의 세션 전부 끊김
- **역할 · 권한(정본 `back/src/auth/permissions.ts`)** — ADMIN = 모든 운영 + `users.manage` · `registry.manage` / OPERATOR = `agent_run.manage` · `communication.draft/approve/send` · `truth.review` · `truth.manual_entry` · `plan.recalculate/approve` · `public_data.fetch` · `read` / FIELD_OPERATOR = `read` · `truth.manual_entry` 만
- **강제** — 전역 Guard. 경로마다 `@RequirePermission` 선언, GET 기본 `read`, **선언 없는 변경 요청은 403 `PERMISSION_NOT_DECLARED`**(실수로 열린 경로 방지). 신원 없음 → 401 `AUTH_REQUIRED`, 역할 부족 → 403 `PERMISSION_DENIED`
- **사칭 방지** — `CERA_AUTH_MODE=session`(기본): 미들웨어가 요청의 `X-CERA-Actor-Id` 를 지우고 세션 사용자의 actor id 로 다시 채운다 → 기존 서비스 · 감사 기록이 읽는 행위자는 언제나 서버가 정한 값. `dev-header`(옛 개발 방식)는 local · test 에서만(env 검사)
- **분리** — Agent 는 서비스 토큰(Bearer)으로 `/internal/*` 만, 사람 세션으로는 Agent Tool 을 못 부르고 토큰으로 로그인할 수 없다. Worker 는 SYSTEM actor. 계정은 HUMAN actor 에만(M25 트리거 CE005)
- **DB** — M24 `user_account` · `user_session`(22.46 · 22.47) · M25 가드(22.48). 시드 사용자 admin · operator · field — 비밀번호는 `back/.env` 의 `CERA_SEED_*_PASSWORD`(저장소에 없음, 비면 만들지 않음). operator 는 기존 시드 "운영자 (가상)" actor 에 붙는다
- **시험** — `test/db/auth.test.ts` 27(로그인 · 쿠키 속성 · 지문 저장 · 잘못된 비밀번호 = 없는 계정 · 5회 제한 429 · 세션 없음 401 · 만료/가짜 토큰 · 로그아웃 · 헤더만으로 401 · 현장 담당자가 관리자 주장해도 403 · 역할 표 11경로 × 현장 403/운영자 통과 · 사용자 관리 ADMIN 만 · 생성/역할 변경 → 세션 끊김/비활성 · 중복 409 · 자기 강등 금지 · 서비스/사람 인증 분리 · DB 가드). 화면은 최소 로그인 관문(`front/web/src/app/LoginGate.tsx`)만. 브라우저 `/demo` 11단계를 operator 로그인으로 통과
- **한계** — 등록부 변경 API(`registry.manage`)는 아직 없다(권한만 정의). 실패 횟수 제한은 인스턴스별 메모리. 비밀번호 재설정 메일 · MFA 없음

### 18.19 T-121 Redis 실행 큐 구현 확인 결과 (2026-10-27)

- **역할 구분** — PostgreSQL = 업무 정본 · 감사 · 멱등 · Outbox 상태 · Agent 실행 · 사실 · 계획 · 복구. Redis(BullMQ `bullmq@6.3.12` + `ioredis@5.11.1`, `redis:7.4.2` 저장 끔) = 빠른 전달 · 지연 재시도 · 깨우기 가속만. `CERA_REDIS_URL` 이 비면 큐 없이 폴링만(기존과 같음)
- **구조** — 서비스는 Redis 를 모른다: 커밋 뒤 업무 알림(`SEND_REQUESTED` · `SEND_RETRY_SCHEDULED` · `MESSAGE_SENT` 신설 + 기존 승인 · 수신 · 추출 · 사실 · 계획 알림) → `SignalToQueueBridge` → 작업 `OUTBOX_SEND`(메시지) · `EXTRACTION_CYCLE` · `AGENT_RECONCILE`. Worker 만 소비하고, 처리기는 폴링과 같은 멱등 진입점(화해 → 그 메시지 처리 · 추출 한 주기 · 재조정 한 번)이다. 같은 프로세스 안에서는 처리기별 직렬(폴링과 큐가 겹치지 않게), 프로세스 사이는 기존 advisory lock
- **payload** — `{ job_type, entity_id, trace_id, attempt }` 만(원문 · checkpoint · 사실 값 · 비밀 없음 — 시험이 키 목록을 검사). 대기 중 작업 id = `유형__대상`(중복 넣기 무시), 지연 작업은 예약 초를 붙인다. 큐 자체 재시도 없음(재시도 규칙은 DB)
- **장애** — 넣기는 연결이 ready 가 아니면 즉시 포기 · 2초 시간 제한 → 업무 요청을 붙잡지 않는다(로그만). 재연결은 1 · 2 · 4 … 최대 30초 간격. 실측으로 찾은 결함 2건을 고쳤다: ① Redis 가 멈추면 재연결의 호스트 이름 조회가 Node 공용 스레드풀(4)을 채워 PostgreSQL 연결이 시간 초과 → 재연결 간격 + `UV_THREADPOOL_SIZE=16`(compose) ② 생산자 `maxRetriesPerRequest=1` 이면 재연결 직후 넣기가 버려져 빠른 길이 회복되지 않음 → 제한 없음(늦게 전달돼도 멱등). 덤으로 `DomainSignals` 를 앱마다 새로 만든다(한 프로세스의 여러 앱이 알림을 공유하던 문제 — 시험에서 드러남)
- **실측(Docker, Mock 채널)** — 발송 요청 → SENT: Redis 있음 **153~160 ms** · Redis 멈춤 **4.3~4.8 s**(폴링 5초 주기) · Redis 재시작 뒤 다시 153~160 ms. Redis 멈춤 동안 Worker 주기 실패 0
- **시험** — `test/db/queue.test.ts` 6(폴링 없이 큐로 발송 · 같은 작업 3번 동시 + 1번 → 발송 1건 · 일시 실패 → 지연 작업(참조만 · 60초 뒤) · Redis 비움 → 폴링이 발송 · Redis 다운 → 요청 3초 안 성공 + 폴링 발송) · unit 2. 실제 Redis 필요(`CERA_TEST_REDIS_URL`, 기본 `redis://127.0.0.1:56379`)
- **한계** — Gmail 수신 폴링 · 신선도 재판정 · 계획 무효 검사는 큐에 넣지 않았다(주기 작업 그대로). 큐 길이 · 지연 모니터링 화면 없음

### 18.20 T-115 실제 계획 실행의 입력 준비도 (2026-10-27)

- **바뀐 것** — 실제(시뮬레이션 아닌) 실행이 막연한 `PLANNING_INPUT_UNAVAILABLE` 로 끝나지 않는다. `GET /planning/runs/:runId/input-readiness` 가 **있는 것과 없는 것**을 돌려주고, 계산 API 는 같은 코드(Agent Tool 의 `CAPABILITY_NOT_AVAILABLE` 매핑 유지)에 빠진 항목을 메시지로 싣는다. 판정은 순수 함수 `back/src/planning/real-input.ts`
- **모으는 곳(실제로 확보 가능한 것만)** — 등록부(시설 · 입고 시간 · 트럭 풀) · 공공데이터(스냅숏 `scope_ref.vessel_call_ids` 로 묶은 입항 건의 컨테이너 번호 · 규격, B/L 선사) · Truth(사람 직접 입력 · 회신의 그날 수용량 · 차량 가용 — 철회 · 만료 · 값 없음은 제외)
- **`missing_inputs`(지어내지 않는다)** — BLOCKING: `CONTAINER_SCOPE_EMPTY` · `CONTAINER_DESTINATION` · `CONTAINER_ORIGINAL_PLAN` · `CONTAINER_LFD` · `CONTAINER_CARRIER`(컨테이너별 개수 · 예시 5) · `RATE_TABLE`(확정 요율 저장소 없음 — 시나리오 자리표시 요율은 실제 실행에 쓰지 않는다) · `FACILITY_HOURS` · `FACILITY_CAPACITY`(시설별) · `OWN_TRUCK_ROSTER`(자사 풀, Truth 가용 사실이 있으면 닫힘) / OPTIONAL: `PARTNER_TRUCK_SLOTS`. 항목마다 `provide_via`(어디서 와야 하나)
- **검증된 흐름** — 운영자 직접 입력(실제 · 시나리오 없음) → Truth → 준비도에서 해당 시설 · 풀의 공백이 닫힌다(DB 시험). 시뮬레이션 실행은 그대로 시나리오 팩 + Truth 로 계산(직접 입력 · 정정이 Solver 까지 흐르는 것은 `/demo` 10단계 v3 로 확인)
- **한계(정직하게)** — 컨테이너별 목적지 · 원래 배차 · LFD · 확정 요율 · 자사 트럭 명부는 들어오는 길이 없어 **실제 실행은 아직 계산되지 않는다**. 다음 단계 후보: 컨테이너 사실 직접 입력 · CSV 가져오기 · 요율표 등록(T-123)

### 18.21 T-116 승인된 계획 → 후속 문의 초안 (2026-10-27)

- **흐름** — 승인된 판 → 필요 조치(순수 함수 `back/src/planning/follow-up.ts`) → 사람이 요청하면 조치마다 문의 초안(`POST /planning/plans/:planId/follow-ups`, 권한 `communication.draft`) → 초안마다 기존 경계(Contact Gate · 숫자 검사 · **사람 승인** · 발송 요청 · Worker · 채널). **계획 승인 ≠ 자동 실행 ≠ 자동 발송**
- **조치** — ODCY 경유 = ODCY · 터미널 출발일별 대수 → 그 ODCY 에 반입 요청(FACILITY_CAPACITY 형식). 협력 트럭(`풀#시간창#번호`) = 풀 · 날짜 · 시간창별 트럭 수 → 그 운송사에 배차 요청(TRUCK_SLOT 형식). 유지 · 대기 · 자사 트럭 = 외부 연락 없음. 받는 사람 = 트럭은 풀의 운송사, ODCY 는 ODCY 역할 거래처 — 실행의 Mock/Real 과 맞는 eligible 주소만, 없으면 `NO_ELIGIBLE_CONTACT`
- **연결 · 무효** — `plan_follow_up`(22.49, append-only, 판 × 조치 키 UNIQUE → 같은 조치 초안은 한 번). 판이 APPROVED 가 아니게 되면(OUTDATED · SUPERSEDED) 연결된 초안은 승인 요청 · 승인 결정 · 발송 요청 · Worker 최종 검사 모두에서 `PLAN_SUPERSEDED`(`DraftService.inspect` 한 곳)
- **실측(Docker · /demo 12단계)** — 30대 시나리오 v3 승인 → 조치 3건: ODCY A 2대 · ODCY B 6대(10/13 반입) · K운송 10/13 15:00~18:00 4대 → 초안 3건 PENDING_APPROVAL · 발송 0건 → 그중 K운송 초안 사람 승인 · 발송 요청 → SENT 188 ms(Redis 경로, Mock 채널). 결함 1건을 실측으로 찾아 고쳤다: ODCY 반입일을 최종 도착일(`delivery_day`)로 잡던 것 → 터미널 출발일(`scheduled_at` 서울 날짜)
- **한계** — 초안 문구는 기존 문의 템플릿("가능 여부")을 쓴다 — "확정 요청" 전용 문구 · 회신 해석은 아직 없다. Agent 가 승인 뒤 후속 초안을 스스로 만들지는 않는다(사람 요청)

### 18.22 T-124 값을 얻지 못한 회신 — 사람 검토 · 추출 재시도 · 직접 입력 (2026-10-27)

배경: 실제 Gmail 왕복(`docs/18` G.8)에서 회신은 정상으로 들어왔지만 추출 공급자가 값을 내지 못했다(replay = 녹화 없음 · 로컬 Qwen3-4B = `UNPARSEABLE`). 안전하게 실패했지만 Agent 실행은 `COMPLETED` 로 끝나 "업무 완료"처럼 보였고, 자동 한도를 넘긴 회신은 다시 읽을 길이 없었다. **"답장이 왔다" ≠ "질문에 답을 얻었다"** 를 코드로 지킨다.

- **상태를 나눠 둔다** — 통신 = 회신 수신(`NORMAL`) · 추출 = `state`(FAILED · NO_CANDIDATE · DONE …) + `failure_kind` · 사실 = 없음 · 공백 = `ASKED` + `candidate_state = NO_VALID_CANDIDATE`. 회신 보기(`InboundExtractionDto`)에 `needs_review` · `failure_kind`(AI_CALL_FAILED = AI 호출 자체 실패 · NO_ANSWER_FOUND = 모델이 답을 못 찾음 · VALIDATOR_REJECTED = 답이 모두 검증 탈락 · NOT_EXTRACTABLE) · `provider_code`(NO_RECORDING 등) · `attempts`(시간순 전부, `AUTO` / `HUMAN_RETRY`) · `retry`(가능 여부 · 막힌 이유)를 더했다. 판정은 순수 함수 하나(`back/src/communication/extraction-status.ts`)가 저장 기록만 보고 한다
- **Agent** — 회신에서 쓸 만한 값이 없고(EXTRACTION_FAILED · NO_VALID_CANDIDATE) Backend 가 공백을 아직 열린 것(ASKED · MISSING)으로 보면 `COMPLETED` 대신 **`WAITING_HUMAN` · `REPLY_REVIEW_REQUIRED`** 로 멈춘다(새 최상위 상태 없음, 계획 모드도 같다). 재조정(`wake-rules.ts`)은 사람이 사실을 넣어 값이 생겼거나(`FACT_STATE_CHANGED`) 재시도가 검증 통과 후보를 냈을 때(`EXTRACTION_RETRIED`)만 깨운다 — 재시도가 또 실패하면 계속 기다린다. 깨어난 그래프는 회신을 다시 읽고(`read_reply`) 공백을 다시 본다. 대기는 DB(`agent_run.waiting_reason` · `pending_ref`)에 있어 프로세스 재시작 뒤에도 같다
- **사람 재시도** — `POST /communication/inbound/:messageId/extraction/retry {command_id, note?}` · 권한 `extraction.retry`(ADMIN · OPERATOR, 현장 담당자 · Agent · 시스템 불가) · 활성 HUMAN 만. 요청 하나 = 시도 하나(22.51), 자동 한도는 그대로. 같은 명령 id = 같은 요청(`replayed`), 시도가 열려 있으면 `409 EXTRACTION_IN_PROGRESS`(추출 저장과 같은 advisory lock 으로 줄 세움). 요청 때 다시 확인: 통과 후보가 이미 있음 `EXTRACTION_NOT_REQUIRED` · 원문 · 질문 없음 `NOT_EXTRACTABLE` · 같은 스레드에 더 새 회신 · 새 문의 `REPLY_SUPERSEDED` · 물은 사실이 이미 사람 확인 · 공식 기록으로 알려짐 `GAP_ALREADY_RESOLVED`. 성공한 재시도는 기존 경로(AI → 결정론 검증 → 승격 판정 T-093 → 사람 확인) 그대로 — 새 Truth 경로 없음. 공급자는 지금 설정된 것(요청으로 고르지 않는다)
- **직접 입력(경로 B)** — 기존 `POST /truth/facts/manual`(현장 담당자도 가능). 넣으면 공백이 닫히고 기다리던 Agent 가 깨어난다. 실패 기록은 그대로 남는다 — 회신 → 모델 실패 → 사람 입력은 나중에 평가 데이터가 된다(T-099)
- **실행 큐** — 요청 뒤 `EXTRACTION_RETRY_REQUESTED` 알림 → Redis 가 있으면 추출 주기를 바로 깨우고, 없으면 Worker 폴링이 같은 시도를 집는다(Redis 필수 아님)
- **감사 · 추적** — 요청 = `extraction_retry_request` + 감사 `REPLY_EXTRACTION_RETRY_REQUESTED`(사람 · 회신 · request_id/trace_id 는 `request_context`). 시도 = Worker 로그(`trigger` · `retry_request_id` · `correlation_id` · 모델판 · 지연) + 실패 `system_error`(trace_id) 또는 완료 감사 · 추출 행

**실측 · 시험**: DB 시험 `back/test/db/extraction-retry.test.ts`(자동 2회 실패 → 사람 검토 → 권한 · 멱등 · 진행 중 409 → 사람 시도 실패(자동 재실행 없음) → 다시 요청 → 통과 후보 · 이전 실패 3건 유지 / 답 못 찾음 → 직접 입력 → `GAP_ALREADY_RESOLVED` / 옛 회신 `REPLY_SUPERSEDED` · 동시 요청 하나만 / append-only) · 단위 `extraction-status.test.ts` · `agent-wake-rules.test.ts` · Python `test_agent_graph.py`(사례 B · C · D, 계획 모드)

### 18.23 T-123 실제 계획 입력 — 시나리오 없이 계산 (2026-10-27)

배경: 시뮬레이션 실행은 시나리오 팩(합성 컨테이너 · 요율 · 자사 명부)으로 계산됐지만, 실제 실행은 기업 내부 정보(컨테이너 목적지 · 원래 배차 · LFD · 계약 요율 · 시설 계획 규칙 · 트럭)가 들어올 길이 없어 늘 `PLANNING_INPUT_UNAVAILABLE` 이었다(T-115). 공공 API 로는 이 값을 얻을 수 없다.

- **입력 방식(`input_mode`) 둘 — 섞지 않는다**: SCENARIO(시뮬레이션 실행 = 팩 + Truth) · LIVE(실제 실행 = 운영 기록 + Truth). LIVE 생성기(`back/src/planning/live-input.ts`, 순수)는 시나리오 팩을 읽지 않는다. 계획 판 스냅숏에 `input_mode` 를 남긴다
- **기준 정보 vs 사실**: 시간에 따라 바뀌는 값(그날 창고 · ODCY 수용량, 협력 · 자사 트럭 가용 `available.slot`)은 Truth 사실 그대로(`POST /truth/facts/manual`, 회신). 기준 · 계획 정보는 새 운영 기록 표(22.53~22.56): 컨테이너 계획 정보(실행마다) · 계약 요율(효력 기간) · 시설 계획 정보. 모두 append-only 판 — 고칠 때 새 판이 옛 판을 가리킨다
- **출처**: 계획 사실의 `source` = TRUTH(사건 id) · SCENARIO(팩) · OPERATIONAL_RECORD(기록 id, 시설 보관 한도). 컨테이너 근거 = `planning_container_record:<id>`(+ 공공데이터 `container:<id>`). 요율표 판 = `live:<지문>`, 쓴 요율 판 id · 금액은 스냅숏 `operational_inputs.rate_records` — 나중에 요율이 바뀌어도 그 판이 무엇으로 계산했는지 남는다
- **자사 트럭**: 확인(사람) · 공식 기록이고 신선한 `available.slot` 만 명부로 쓴다(벌점 없는 확실한 자원이므로). 잠정 · 오래됨은 쓰지 않고 `OWN_TRUCK_NOT_CONFIRMED` 로 알린다. 협력 트럭은 엔진의 기존 사실 정책(잠정 = 벌점 + 경고)
- **일괄 입력**: `POST /planning/runs/:runId/inputs/containers` · `POST /planning/inputs/rates` · `POST /planning/inputs/facility-profiles` — CSV(첫 줄 = 열 이름) 또는 같은 열의 JSON 행, `dry_run`(검증만) · `command_id`(멱등). 한 묶음 = 한 트랜잭션 — 오류 행이 하나라도 있으면 아무것도 저장하지 않고(422, `details` = 행별 오류 보고) 검증만은 200 으로 같은 보고. 같은 내용 행은 새 판 없음(unchanged). 검증: ISO 6346 검사 숫자 · 중복 행 · 달력 날짜 · 계획일 ± 365일 `[ASSUMPTION]` · KRW 정수 · 음수 · 규격 코드 · 등록부 시설(이름 또는 id, 종류 · 활성) · 공공데이터 규격 대조 · 요율 종류별 필요한 칸 · 단위. 보안: 512 KB · 2000행 `[ASSUMPTION]`, 알 수 없는 열 거부, `= + @` · 탭 · CR · (숫자 아닌 칸의) `-` 로 시작하는 칸 거부(수식 주입), 파일 이름 · 원본은 저장하지 않는다
- **실제 실행 만들기**: `POST /planning/runs {command_id}` — 기준 시각 = 지금, 계획일 = 서울 날짜, 시뮬레이션 아님(같은 명령 id = 같은 실행)
- **준비도**: `GET /planning/runs/:runId/input-readiness` → `status` = READY · READY_WITH_PROVISIONAL(잠정 사실을 벌점 · 경고와 함께 씀) · NOT_READY, `missing_inputs[]`(code · group · BLOCKING/OPTIONAL · `fields` 예: `container.<번호>.lfd` · `facility.<이름>.capacity.day(D)` · `rate.transport.<터미널>__<시설>.<규격>`), `groups`(CONTAINER_DATA · LFD · RATE · WAREHOUSE_CAPACITY · ODCY_CAPACITY · TRUCK_AVAILABILITY · FACILITY_PROFILE · TERMINAL 별 개수). 요율 누락은 엔진이 판정한다: 같은 입력으로 비용표를 만들어 원래 계획(KEEP)의 `RATE_MISSING` 은 BLOCKING, 대안에만 필요한 요율은 OPTIONAL. 계산 요청이 막히면 409 `PLANNING_INPUT_UNAVAILABLE` 의 `details` 에 같은 목록
- **엔진 · Solver 무수정**: 같은 `PlanningInput` 계약 → 같은 Cost Engine · Baseline · Solver · 판 저장 · 승인 · T-116 후속 초안(실제 실행 = 실제 주소만, 없으면 `NO_ELIGIBLE_CONTACT`)
- **운영 기록 변경 → OUTDATED**: 저장 뒤 `OPERATIONAL_INPUT_CHANGED` → 판마다 스냅숏의 운영 기록 지문과 지금을 비교 → 다르면 OUTDATED(`OPERATIONAL_RECORD_CHANGED|ADDED|REMOVED` · kind · key · 전/후), 입력이 빠졌으면 `INPUT_UNAVAILABLE`. 기존 Truth 사실 비교와 함께 · 기다리던 Agent 가 깨어나 다시 계산
- **권한**: `planning.input` = ADMIN · OPERATOR(현장 담당자는 Truth 직접 입력만). 활성 HUMAN 만. 감사 `LIVE_RUN_CREATED` · `PLANNING_INPUT_IMPORTED`(대상 = 묶음)
- **계획 기간**: 계획일 + 2일(`LIVE_HORIZON_DAYS = 3`, 시나리오와 같은 길이 `[ASSUMPTION]`)

**시험**: 단위 `test/unit/live-input.test.ts`(READY → 엔진 · Solver OPTIMAL · 결정론 · LFD/수용량/트럭/요율 누락 · 잠정 · CSV 검증 · 수식 칸 · 요율 모양) · DB `test/db/live-planning.test.ts`(실제 실행 → 일괄 입력 · 검증만 · 422 · 멱등 · 409 → 준비도 → 고침 → 요율 누락 → READY → 판 v1(스냅숏 출처) → 승인 → 후속 초안 → 요율 인상 → OUTDATED → v2 · v1 금액 유지 · append-only · 시뮬레이션 실행 거부 · 권한)

### 18.24 T-125 자동 추출 재시도 간격 (2026-10-27)

- **문제(T-124 실측)**: 자동 재시도 3회가 약 5초 안에 끝났다 — 수신 알림의 빠른 경로와 Worker 폴링이 같은 회신을 연달아 집었다. 모델 콜드 스타트 · 잠깐의 장애에도 곧바로 사람 검토로 넘어갔고, 다시 해도 같은 실패(녹화 없음)에도 한도를 다 썼다
- **규칙**: 자동 시도는 (1) 기술 실패 < `CERA_EXTRACTION_MAX_ATTEMPTS` (2) 재시도해도 같은 실패(`system_error.retryable = false` — 녹화 없음 · 출력 형식 · 요청 거부)가 없음 (3) 마지막 실패 + `base × 3^(n−1)`(상한 max)이 지남 — 셋 다일 때만. 기본 base 10초 · max 120초 `[ASSUMPTION]`(`CERA_EXTRACTION_RETRY_BASE_MS` · `CERA_EXTRACTION_RETRY_MAX_MS`). 간격은 저장된 실패 시각으로 SQL 이 판정한다 — 재시작 · Redis 유무와 무관, 새 표 없음. 시험 기본값은 0(간격 없음)
- **상태**: retryable 이 아닌 자동 실패는 한도 전에도 `FAILED`(사람 검토 · 다시 추출 가능). RETRYING 이면 회신 보기에 `next_attempt_at`. 재시도 중에는 Agent 가 사람 검토로 넘어가지 않는다(AWAITING_REPLY 는 추출이 끝났을 때만 깨운다)
- **사람 재시도**: 간격 없음, 자동 한도와 무관(T-124 그대로)
- **실측(Docker)**: AI Server 정지 → 시도 1 15:53:25 · 시도 2 15:53:41(10초 + 재시작 지연) — 그 사이 Worker · Redis 재시작 → AI 복귀 → 시도 3 15:54:11(30초) DONE · 후보 검증 통과 · 임시 사실 → Agent 계속

### 18.25 운영 준비 — 받는 사람은 등록부가 정한다 · 최종 검증 (2026-10-27)

- **결함(BLOCKER)**: 시설(창고 · ODCY) 공백의 문의와 승인 계획의 ODCY 반입 요청이 "같은 역할의 첫 거래처"(등록부 id 순)로 갔다 — ODCY B 문의가 ODCY A 회사 담당자로 갈 수 있었다(실측: ODCY B 초안의 받는 사람 = ODCY A 영업팀, 발송 전 사람이 거절). 또 남은 공백 모두 연락처가 없으면 Agent 실행이 `FAILED / NO_ELIGIBLE_CONTACT` 로 끝나 계획까지 가지 못했다
- **고침**: `facility.operator_counterparty_id`(22.8 · M32) = 시설 운영 거래처. 공백의 `owner_counterparty_id` = 트럭 풀 소유 운송사 · 시설 운영 거래처(등록부만). 주인이 없으면 아무에게도 묻지 않는다. 주인의 적격 주소(Contact Gate · 실행의 Mock/Real 일치)가 정확히 하나일 때만 고르고, 둘 이상이면 `CONTACT_SELECTION_REQUIRED`(임의 선택 없음). 후속 초안(T-116)도 같은 규칙(`NO_ELIGIBLE_CONTACT` · `CONTACT_SELECTION_REQUIRED`)
- **연락할 수 없을 때**: Agent 는 실패하지 않고 `WAITING_HUMAN` · `CONTACT_REGISTRATION_REQUIRED` | `CONTACT_SELECTION_REQUIRED` 로 기다린다(대기 대상 = 공백의 주체 FACILITY · TRUCK_POOL). 재조정은 그 주체의 공백이 더는 열려 있지 않으면(사람이 값을 넣음) 깨운다. 연락처를 등록 · 정리한 뒤에는 운영자가 resume 한다(등록부 변경은 공백 상태를 바꾸지 않는다)
- **등록부 API**: `PATCH /registry/facilities/:id/operator {counterparty_id|null}` — `registry.manage`(ADMIN) · 활성 HUMAN · 거래처 역할 = 시설 종류(아니면 422 `ROLE_MISMATCH`) · 감사 `FACILITY_OPERATOR_SET`. 시드: 창고 A → 창고 A 거래처 · ODCY A → ODCY A 거래처 · ODCY B → 새 합성 거래처 "ODCY B (가상)"(연락처 · Mock 주소). 창고 B = 운영 거래처 없음(연락처 없는 경로)
- **이미 보낸 v1 후속**: 판이 바뀌어도 보낸 기록은 지우지 않는다. 옛 판의 미발송 초안은 승인 · 발송 요청이 `PLAN_SUPERSEDED` 로 막힌다(실측). 정정 · 취소 문안을 자동으로 만들지는 않는다(알려진 제한)

**최종 검증(2026-10-27, `a9365dd` 기준 새 설치 `cera-fresh`)**
- 새 설치: 빈 볼륨 → 명령 2개 · 58초 → migration 32 · 표 50 · 트리거 130 · CHECK 281 · FK 106 · 시드 사용자 3(scrypt). 앱 역할 UPDATE/DELETE 거부 · 소유 역할 append-only 트리거
- LIVE 전체(실제 Gmail 1통): 로그인 → 실제 실행 → 운영 입력(122 ms) → 사실 → 준비도 READY → Agent 가 ODCY A 공백 → 등록부 운영 거래처의 GMAIL 주소 하나 → 초안 → 승인 → 실제 발송(1.66초) → 회신 대기 중 API · Worker 재시작(세션 · 상태 유지, 사칭 머리말 403, 세션 없음 401) → 실제 회신("3대정도는 가능할거같아요") 수신 · 같은 스레드 · 등록 발신자 · 중복 없음 → 녹화 재생이 못 읽음(1회 뒤 바로 사람 검토) → `REPLY_REVIEW_REQUIRED` → 현장 담당자 재시도 403 · 운영자 재시도 = 새 시도 → 현장 담당자 직접 입력 3 → Agent 1.6초 안에 깨어나 v1(OPTIMAL 48 ms, 총 1,960,000 · Baseline 3,590,000) → 요율 변경 → v1 무효 · Agent 재계산 v2(1.6초, 2,020,000) → 승인 → 후속 초안 ODCY A(GMAIL, 승인 · 발송 직전) · ODCY B `NO_ELIGIBLE_CONTACT`(다른 회사로 보내지 않음) → 사실 정정 → v2 OUTDATED → v2 초안 발송 요청 409 `PLAN_SUPERSEDED`
- 장애: Redis 중단 · FLUSHALL · Worker 중단 · AI 중단 · API 재시작 — infra/README "운영 준비" 실측 표
- 백업/복원: pg_dump(0.5초) → 새 인스턴스 pg_restore(0.9초) → 행 수 · 권한 · 트리거 동일 → Redis 없이 API 조회 정상. ContentStore 는 DB 밖 — 함께 백업
- 추적: recovery_run → agent_run(trace) → thread(Gmail threadId) → message → send_attempt(RFC822 Message-ID) → raw_input → system_error(trace · operation) → retry_request → plan v1/v2(agent_run) → plan_follow_up → message, 입력 묶음
- 비밀: 추적 파일 · 이력 · 컨테이너 로그(api · worker · ai) 토큰 · Authorization · 실제 주소 · 회신 본문 0건
- 시나리오 `/demo` 12단계: v1 5,735,000 · v3 5,835,000 · Baseline 7,220,000 그대로, 후속 초안 ODCY B 는 이제 ODCY B 운영 거래처로

## 20. migration 전략

**ADR-034 그대로**: Drizzle 스키마 → drizzle-kit 이 SQL 생성 → 사람이 SQL 검토 → 저장소에 기록 → 명시적으로 적용. `drizzle-kit push` 는 운영 정본으로 쓰지 않는다(로컬 실험용으로도 권하지 않는다 — 로컬과 운영의 이력이 갈라진다).

| 항목 | 결정 |
| --- | --- |
| 단위 | **층별로 나눈다** — 생성 migration 6개(M01~M06) + custom migration 4개(**M07** 공통 불변식 함수·append-only·TRUNCATE 트리거 · **M08** 통신 가드·캐시 트리거 · **M09** 사건 지연 트리거·다형 가드 · **M10** 스키마 권한·표 단위 GRANT). 29표를 한 파일에 넣지 않는다 — **검토 단위를 작게** 하기 위해서다 |
| 적용 단위 | 10개 모두 **U1(T-086) 한 작업**에서 만들고 한 번에 적용한다. 중간 상태로 운영하지 않는다 |
| 스키마 vs 시드 | **분리**. migration 에는 데이터를 넣지 않는다(코드 값도 CHECK 라 데이터가 없다). 시드는 21절 명령 |
| 되돌리기 | **앞으로만**(down migration 없음). 잘못된 migration 은 **새 수정 migration** 으로 고친다. 운영 전(로컬·시험)은 DB 를 지우고 처음부터 다시 적용할 수 있다 |
| 파괴적 변경 | `DROP` · `RENAME` · 타입 축소 · NOT NULL 추가 · CHECK 강화는 PR 에 **"파괴적 migration" 표시**와 데이터 영향 설명이 있어야 병합한다. drizzle-kit 의 rename 추정은 사람이 확인한다 |
| 적용 주체 | `cera_owner` 로 **배포 단계에서 명시적으로**. **앱 기동 시 자동 적용하지 않는다** |
| 이력 | drizzle-kit 의 migration 이력 표(`cera_meta.drizzle_migrations` — U0 확인 18.1)는 스키마 `cera` 밖(별도 스키마)에 둔다 |
| 확인 | 적용 뒤 **스키마 검사 시험**: 표 29 · 불변 표 트리거 존재 · 앱 역할로 UPDATE/DELETE 거부 · 부분 유일 존재 |

---

## 21. 시드 전략

| 항목 | 결정 |
| --- | --- |
| 형태 | **migration 이 아닌 명령**(예: `seed:scenario <팩 경로>` — 이름은 U1). 앱 역할로 저장소 계층을 거쳐 쓴다(트리거·권한을 그대로 통과해야 한다) |
| 환경 | **`local` · `test` 에서만.** 다른 환경이면 명령이 실행을 거부한다 |
| 입력 | `data/scenarios/busan-wh-capacity-01/` 를 **읽기만**(`docs/18` N.4 — 수정하지 않는다) |
| id | fixture 의 **고정 UUIDv7 값**(4절) → 두 번 넣어도 같은 행. 이미 있으면 건너뛴다(`ON CONFLICT DO NOTHING`) |
| `is_simulated` | 시드가 만드는 **모든 기록 행은 `true` + `scenario_id`**. 계획 시드는 `contains_simulated = true` |

**Slice 1 시드 목록**

| 대상 | 내용 |
| --- | --- |
| `scenario` | 1행 |
| `actor` | `SYSTEM` 1 · `HUMAN` 운영자 1 이상 |
| `counterparty` | 운송사(`TRUCKING`) · ODCY(`ODCY`) — T-069 "상대 2곳". 창고 수용량은 사람 입력이라 거래처가 필요 없다 |
| `counterparty_contact` | 거래처마다 1 |
| `contact_channel_address` | **`channel_type = MOCK`** · 주소는 `*.invalid` 합성 · `VERIFIED` / `APPROVED` / `ACTIVE` · `verified_at` · `approved_by_actor_id` · `approved_at` |
| `facility` | 창고 · ODCY |
| `truck_pool` | 운송사 풀 |
| `planning_snapshot` · `recovery_run` | 뿌리 실행 1 (`FEASIBLE`) |
| gap fixture | **DB 에 넣지 않는다** — 데이터 팩 파일을 Mock 계획 제공자가 읽는다. 구조화 값의 `source_path` 가 가리킨다(T-069 3절 — 논리 모델에 gap 표가 없다) |
| 창고 수용량 초기 사실 | 사람 입력 경로 그대로 — `raw_input`(`HUMAN_UI`) → `event` → 링크. **저장소 쓰기 경로를 쓴다**(SQL 직접 삽입 금지) |

**가상 데이터가 실제 채널로 나가지 못하게 하는 물리 장치**(J.3 · G-06 · DoD 19)

1. `comm_thread` CHECK `NOT is_simulated OR channel_type = 'MOCK'` — 가상 스레드는 Mock 채널뿐.
2. `comm_message` → `comm_thread` 복합 FK — 메시지의 채널·시뮬레이션 값은 스레드와 같다.
3. `comm_message` → `contact_channel_address` 복합 FK — 메시지 채널 = 주소 채널. 시드 주소는 `MOCK` 이라 실제 채널 메시지의 수신자가 될 수 없다.
4. `send_attempt` → `comm_message` 복합 FK — 시도의 `is_simulated` 는 메시지와 같다.
5. Dispatcher 의 `BLOCKED_SIMULATION_MISMATCH` 검사(앱 · G-06 시험).

> **마스터 표에는 `is_simulated` 가 없다**(`docs/22` 20절의 선택). 시드 거래처·시설이 실제 데이터와 같은 DB 에 섞이면 운영 조회가 구분할 방법이 없다 → **시드는 local·test 에서만** 돈다. 확인 결과 Slice 1 에는 이것으로 충분하다(25절 F-10).

---

## 22. 표별 물리 명세 (29표 + T-102 공공데이터 6표 + T-103 Agent 기록 2표 = 37표)

> **읽는 법** — 컬럼 표는 `docs/22` 작업표의 논리 컬럼 순서 그대로다. "FK / CHECK / 메모" 칸의 FK 는 **참조 대상**이고, **복합 FK 로 구현되는 곳은 표 아래 "FK(표 수준)" 목록이 정본**이다. `IN (…)` = CLOSED CHECK, `CATALOG` = 형식 CHECK + 앱 카탈로그(3절). 해시 형식 = `^sha256:[0-9a-f]{64}$`. 모든 표의 PK 는 `NOT NULL` 이다. **S-2** = `CHECK (is_simulated = (scenario_id IS NOT NULL))`(`docs/22` 20절). 표 수준 FK 목록의 단일 FK 가 복합 FK 와 같은 컬럼을 쓰면 **복합 FK 하나로 만든다**(존재 검사가 포함된다). 이 절과 짝 작업표(`docs/24_…xlsx`)는 같은 생성기로 만들었다.

### 22.1 `scenario` — 재생 시나리오 메타. 가상 행의 `scenario_id` 대상(S-2)

- 논리: `SIMULATION_ONLY` · `CONTROLLED_UPDATE` · 그룹 **F0 기반** · Drizzle 분류 **NORMAL**
- PK: `scenario_id`
- 변경 방식: CONTROLLED_UPDATE — UPDATE 허용: `scenario_name` · `description` · `data_pack_ref` · `is_active`. `as_of_base`·`created_at` 불변(재현성). DELETE 금지
- migration 의존: — · Slice 1 사용: 시드 1행

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `scenario_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `scenario_name` | STRING(100) | `varchar(100)` | NOT NULL | — | `varchar({ length: 100 })` | — |
| 3 | `description` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | — |
| 4 | `data_pack_ref` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | — |
| 5 | `as_of_base` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 6 | `created_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 7 | `is_active` | BOOLEAN | `boolean` | NOT NULL | `true` | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**: —
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.2 `actor` — 승인·확인·감사의 주체(SYSTEM · 운영자)

- 논리: `MASTER` · `CONTROLLED_UPDATE` · 그룹 **F0 기반** · Drizzle 분류 **NORMAL**
- PK: `actor_id`
- 변경 방식: CONTROLLED_UPDATE — `display_name` · `is_active`. `actor_type` 불변. DELETE 금지
- migration 의존: — · Slice 1 사용: 시드: SYSTEM 1 · HUMAN 운영자 1+

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `actor_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `actor_type` | CODE | `text` | NOT NULL | — | `text()` | IN (HUMAN, SYSTEM, AI_AGENT) |
| 3 | `display_name` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | — |
| 4 | `is_active` | BOOLEAN | `boolean` | NOT NULL | `true` | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**: —
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.3 `audit_log` — 되돌릴 수 없는 행위의 감사 · 내용 파기 감사(29.8)

- 논리: `SOURCE_OF_TRUTH` · `APPEND_ONLY` · 그룹 **F1 운영 기록** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `audit_id`
- 변경 방식: APPEND_ONLY — UPDATE·DELETE 거부 트리거 + 앱 권한 없음
- migration 의존: actor · Slice 1 사용: 모든 Phase

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `audit_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `occurred_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 3 | `actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor · RESTRICT |
| 4 | `action` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 5 | `target_type` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 6 | `target_id` | STRING(40) | `varchar(40)` | NOT NULL | — | `varchar({ length: 40 })` | 다형 — FK 없음. CONTENT_PURGED 면 기록 id |
| 7 | `before_ref` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | — |
| 8 | `after_ref` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | — |
| 9 | `request_context` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | — |
| 10 | `result` | CODE | `text` | NOT NULL | — | `text()` | IN (SUCCESS, FAILURE) · `FAILURE`(docs/22 rev.2.5 표기 통일) |
| 11 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - actor_id → actor
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (target_type, target_id) WHERE action = 'CONTENT_PURGED' AND result = 'SUCCESS' — 파기 판정(14절)
  - (target_type, target_id, occurred_at)
  - (occurred_at)

### 22.4 `system_error` — 중요한 기술·연동 오류(docs/23). 업무 흐름의 입력이 아니다(I-19)

- 논리: `EVIDENCE` · `APPEND_ONLY` · 그룹 **F1 운영 기록** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `error_id`
- 변경 방식: APPEND_ONLY. **업무 트랜잭션과 따로(별도 연결·트랜잭션) 기록** — 업무 롤백과 함께 사라지지 않게
- migration 의존: scenario · Slice 1 사용: 모든 Phase(C-02 `CONTENT_MISSING` 포함)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `error_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `occurred_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 3 | `service_name` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | — |
| 4 | `component_name` | STRING(100) | `varchar(100)` | NOT NULL | — | `varchar({ length: 100 })` | — |
| 5 | `operation_name` | STRING(100) | `varchar(100)` | NOT NULL | — | `varchar({ length: 100 })` | — |
| 6 | `error_boundary` | CODE | `text` | NOT NULL | — | `text()` | IN (API_REQUEST, INTEGRATION, BACKGROUND_JOB) |
| 7 | `error_category` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 8 | `error_code` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | — |
| 9 | `safe_error_message` | STRING(500) | `varchar(500)` | NOT NULL | — | `varchar({ length: 500 })` | — |
| 10 | `exception_type` | STRING(200) | `varchar(200)` | NULL | — | `varchar({ length: 200 })` | — |
| 11 | `request_id` | STRING(64) | `varchar(64)` | NULL | — | `varchar({ length: 64 })` | UUIDv7 문자열(10절) |
| 12 | `trace_id` | STRING(64) | `varchar(64)` | NULL | — | `varchar({ length: 64 })` | W3C trace-id 32 hex 소문자(10절) |
| 13 | `target_system` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 14 | `http_status` | INTEGER | `integer` | NULL | — | `integer()` | 100~599 |
| 15 | `retryable` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 16 | `related_entity_type` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 17 | `related_entity_id` | STRING(40) | `varchar(40)` | NULL | — | `varchar({ length: 40 })` | 다형 — FK 없음(17.4 예외). type·id 둘 다 있거나 둘 다 없음 |
| 18 | `raw_log_ref` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | — |
| 19 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 20 | `scenario_id` | REF(scenario) | `uuid` | NULL | — | `uuid()` | FK scenario · RESTRICT |

- **FK(표 수준 · 복합 포함)**:
  - scenario_id → scenario
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**:
  - S-2: `is_simulated = (scenario_id IS NOT NULL)`
  - `(related_entity_type IS NULL) = (related_entity_id IS NULL)`
  - `http_status BETWEEN 100 AND 599`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (trace_id) WHERE trace_id IS NOT NULL
  - (occurred_at)
  - (error_code, occurred_at)
  - (related_entity_type, related_entity_id)

### 22.5 `counterparty` — 거래처 — 역할 판정의 정본

- 논리: `MASTER` · `CONTROLLED_UPDATE` · 그룹 **R 등록부** · Drizzle 분류 **NORMAL**
- PK: `counterparty_id`
- 변경 방식: CONTROLLED_UPDATE — `display_name` · `source_role` · `org_code` · `is_active`. DELETE 금지(비활성화)
- migration 의존: — · Slice 1 사용: 시드 2곳(운송사 · ODCY)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `counterparty_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `display_name` | STRING(100) | `varchar(100)` | NOT NULL | — | `varchar({ length: 100 })` | — |
| 3 | `source_role` | CODE | `text` | NOT NULL | — | `text()` | IN (TRUCKING, ODCY, WAREHOUSE, SHIPPING_LINE, TERMINAL) |
| 4 | `org_code` | STRING(30) | `varchar(30)` | NULL | — | `varchar({ length: 30 })` | — |
| 5 | `is_active` | BOOLEAN | `boolean` | NOT NULL | `true` | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**: —
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.6 `counterparty_contact` — 거래처 담당 연락처

- 논리: `MASTER` · `CONTROLLED_UPDATE` · 그룹 **R 등록부** · Drizzle 분류 **NORMAL**
- PK: `contact_id`
- 변경 방식: CONTROLLED_UPDATE — `person_name` · `team` · `note` · `is_active`. `counterparty_id` 불변
- migration 의존: counterparty · Slice 1 사용: 시드

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `contact_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `counterparty_id` | REF(counterparty) | `uuid` | NOT NULL | — | `uuid()` | FK counterparty · RESTRICT |
| 3 | `person_name` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | — |
| 4 | `team` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | — |
| 5 | `note` | STRING(200) | `varchar(200)` | NULL | — | `varchar({ length: 200 })` | — |
| 6 | `is_active` | BOOLEAN | `boolean` | NOT NULL | `true` | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - counterparty_id → counterparty
- **UNIQUE / 부분 유일**:
  - (contact_id, counterparty_id) — comm_thread 복합 FK 대상
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (counterparty_id)

### 22.7 `contact_channel_address` — 발송 자격의 정본(3상태)

- 논리: `MASTER` · `CONTROLLED_UPDATE` · 그룹 **R 등록부** · Drizzle 분류 **NORMAL**
- PK: `address_id`
- 변경 방식: CONTROLLED_UPDATE — 3상태 · `verified_at` · `approved_by_actor_id` · `approved_at`. `contact_id` · `channel_type` · `normalized_address` 불변(주소 변경 = 새 행)
- migration 의존: counterparty_contact · actor · Slice 1 사용: 시드: MOCK 주소(`*.invalid`) · VERIFIED/APPROVED/ACTIVE

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `address_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `contact_id` | REF(counterparty_contact) | `uuid` | NOT NULL | — | `uuid()` | FK counterparty_contact · RESTRICT |
| 3 | `channel_type` | CODE | `text` | NOT NULL | — | `text()` | IN (GMAIL, MOCK, PORTAL) |
| 4 | `normalized_address` | STRING(200) | `varchar(200)` | NOT NULL | — | `varchar({ length: 200 })` | — |
| 5 | `email_verification_status` | CODE | `text` | NOT NULL | — | `text()` | IN (UNVERIFIED, PENDING, VERIFIED, FAILED, EXPIRED) |
| 6 | `relationship_status` | CODE | `text` | NOT NULL | — | `text()` | IN (PENDING, APPROVED, REJECTED) |
| 7 | `communication_status` | CODE | `text` | NOT NULL | — | `text()` | IN (ACTIVE, PAUSED, INACTIVE) |
| 8 | `verified_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 9 | `approved_by_actor_id` | REF(actor) | `uuid` | NULL | — | `uuid()` | FK actor · RESTRICT |
| 10 | `approved_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **FK(표 수준 · 복합 포함)**:
  - contact_id → counterparty_contact
  - approved_by_actor_id → actor
- **UNIQUE / 부분 유일**:
  - (channel_type, normalized_address)
  - (address_id, channel_type) — comm_message 복합 FK 대상
- **CHECK(컬럼 CHECK 외)**:
  - `normalized_address = lower(btrim(normalized_address))`
  - `email_verification_status <> 'VERIFIED' OR verified_at IS NOT NULL`
  - `relationship_status <> 'APPROVED' OR (approved_by_actor_id IS NOT NULL AND approved_at IS NOT NULL)`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (contact_id)

### 22.8 `facility` — 사건 주체(창고 · ODCY)

- 논리: `MASTER` · `CONTROLLED_UPDATE` · 그룹 **R 등록부** · Drizzle 분류 **NORMAL**
- PK: `facility_id`
- 변경 방식: CONTROLLED_UPDATE — `facility_name` · `area` · 기본 시각 2개 · `is_active`. `facility_type` 불변
- migration 의존: — · Slice 1 사용: 시드 2+

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `facility_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `facility_type` | CODE | `text` | NOT NULL | — | `text()` | IN (WAREHOUSE, TERMINAL, ODCY) |
| 3 | `facility_name` | STRING(100) | `varchar(100)` | NOT NULL | — | `varchar({ length: 100 })` | — |
| 4 | `area` | STRING(100) | `varchar(100)` | NULL | — | `varchar({ length: 100 })` | — |
| 5 | `default_open_time` | TIME | `time(0)` | NULL | — | `time({ precision: 0 })` | — |
| 6 | `default_close_time` | TIME | `time(0)` | NULL | — | `time({ precision: 0 })` | — |
| 7 | `is_active` | BOOLEAN | `boolean` | NOT NULL | `true` | `boolean()` | — |
| 8 | `operator_counterparty_id` | REF(counterparty) | `uuid` | NULL | — | `uuid()` | FK counterparty · RESTRICT **(M32 · 운영 준비)** — 이 시설을 운영하는 거래처. 수용량 문의 · 반입 요청의 받는 사람은 이 거래처의 연락처뿐. NULL = 등록 안 됨 → 아무에게도 묻지 않는다(역할로 추측하지 않는다). 바꾸기 = `PATCH /registry/facilities/:id/operator`(ADMIN · 감사) |

- **FK(표 수준 · 복합 포함)**: (operator_counterparty_id) → counterparty
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.9 `truck_pool` — 사건 주체(차량 풀)

- 논리: `MASTER` · `CONTROLLED_UPDATE` · 그룹 **R 등록부** · Drizzle 분류 **NORMAL**
- PK: `truck_pool_id`
- 변경 방식: CONTROLLED_UPDATE — `pool_name` · `ownership` · `owner_counterparty_id` · `is_active`
- migration 의존: counterparty · Slice 1 사용: 시드 1+

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `truck_pool_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `pool_name` | STRING(100) | `varchar(100)` | NOT NULL | — | `varchar({ length: 100 })` | — |
| 3 | `ownership` | CODE | `text` | NOT NULL | — | `text()` | IN (OWN, PARTNER) |
| 4 | `owner_counterparty_id` | REF(counterparty) | `uuid` | NULL | — | `uuid()` | FK counterparty · RESTRICT |
| 5 | `is_active` | BOOLEAN | `boolean` | NOT NULL | `true` | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - owner_counterparty_id → counterparty
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (owner_counterparty_id)

### 22.10 `planning_snapshot` — `recovery_run` 이 가리키는 입력 스냅샷(Slice 1 은 자식 표 없음)

- 논리: `PERSISTED_OUTPUT` · `APPEND_ONLY` · 그룹 **P 계획 시드** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `snapshot_id`
- 변경 방식: APPEND_ONLY
- migration 의존: scenario · Slice 1 사용: 시드 1행(`contains_simulated = true`)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `snapshot_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `as_of` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 3 | `fact_fingerprint` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` |
| 4 | `rule_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | — |
| 5 | `tariff_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | — |
| 6 | `policy_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | — |
| 7 | `scope_ref` | JSON | `jsonb` | NULL | — | `jsonb().$type<…>()` | jsonb 객체. 스냅샷 대상 집합 설명(조회·조인 대상 아님) |
| 8 | `contains_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 9 | `created_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 10 | `scenario_id` | REF(scenario) | `uuid` | NULL | — | `uuid()` | FK scenario · RESTRICT |

- **FK(표 수준 · 복합 포함)**:
  - scenario_id → scenario
- **UNIQUE / 부분 유일**:
  - (snapshot_id, contains_simulated) — recovery_run 복합 FK 대상(I-5)
- **CHECK(컬럼 CHECK 외)**:
  - `scenario_id IS NULL OR contains_simulated`
  - `jsonb_typeof(scope_ref) = 'object'`(값이 있을 때)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.11 `recovery_run` — 계획 1판 · 구조화 값의 출처 · L-13 뿌리

- 논리: `PERSISTED_OUTPUT` · `APPEND_ONLY` · 그룹 **P 계획 시드** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `run_id`
- 변경 방식: APPEND_ONLY
- migration 의존: planning_snapshot · Slice 1 사용: 시드 뿌리 실행 1행. 시험 A-03 에서 같은 계보의 새 실행 1행

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `run_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `snapshot_id` | REF(planning_snapshot) | `uuid` | NOT NULL | — | `uuid()` | FK planning_snapshot · RESTRICT |
| 3 | `trigger_type` | CODE | `text` | NOT NULL | — | `text()` | IN (EXCEPTION_DETECTED, OPERATOR_REQUEST, FACT_CORRECTION, CONSTRAINT_CHANGE, REPLY_RECEIVED, SCHEDULED) |
| 4 | `trigger_ref` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | 다형 문자열(사건·제약·메시지 id). FK 없음 |
| 5 | `previous_run_id` | REF(recovery_run) | `uuid` | NULL | — | `uuid()` | FK recovery_run · RESTRICT · 자기참조. L-13 뿌리는 저장하지 않고 재귀 조회(12.3) |
| 6 | `objective_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | — |
| 7 | `run_status` | CODE | `text` | NOT NULL | — | `text()` | IN (FEASIBLE, INFEASIBLE, TIMEOUT, ERROR) |
| 8 | `unmet_constraints` | JSON | `jsonb` | NULL | — | `jsonb().$type<…>()` | jsonb 배열. `run_status = INFEASIBLE` 이면 NOT NULL(I-6 CHECK) |
| 9 | `total_cost_krw` | BIGINT | `bigint` | NULL | — | `bigint({ mode: 'bigint' })` | 원 정수. `>= 0` CHECK. TS 경계는 6절(bigint) |
| 10 | `solve_ms` | INTEGER | `integer` | NULL | — | `integer()` | — |
| 11 | `contains_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 12 | `executed_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **FK(표 수준 · 복합 포함)**:
  - (snapshot_id, contains_simulated) → planning_snapshot(snapshot_id, contains_simulated) — I-5 전파
  - previous_run_id → recovery_run
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**:
  - `previous_run_id <> run_id`
  - I-6: `run_status <> 'INFEASIBLE' OR unmet_constraints IS NOT NULL`
  - `total_cost_krw >= 0`
  - `solve_ms >= 0`
  - `jsonb_typeof(unmet_constraints) = 'array'`(값이 있을 때)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (previous_run_id)
  - (snapshot_id)

### 22.12 `comm_thread` — 한 상대·한 주소·한 채널 대화

- 논리: `SOURCE_OF_TRUTH` · `CONTROLLED_UPDATE (thread_status · last_activity_at) + external_thread_id 한 번 채움` · 그룹 **C 통신** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `thread_id`
- 변경 방식: CONTROLLED_UPDATE — `thread_status` · `last_activity_at` · **`external_thread_id` NULL → 값 한 번**. 나머지 열 불변(가드 트리거)
- migration 의존: counterparty · counterparty_contact · recovery_run · scenario · Slice 1 사용: 초안 생성(T1) · 첫 발송 결과(T6)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `thread_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `channel_type` | CODE | `text` | NOT NULL | — | `text()` | IN (GMAIL, MOCK, PORTAL) |
| 3 | `external_thread_id` | STRING(200) | `varchar(200)` | NULL | — | `varchar({ length: 200 })` | NULL → 값 **한 번**(첫 발송 뒤 채널이 줄 때 — Mock 도 같은 경로). 유일 범위 = 채널 종류(13절 U-5) |
| 4 | `counterparty_id` | REF(counterparty) | `uuid` | NOT NULL | — | `uuid()` | FK counterparty · RESTRICT |
| 5 | `contact_id` | REF(counterparty_contact) | `uuid` | NULL | — | `uuid()` | FK counterparty_contact · RESTRICT · 복합 FK (contact_id, counterparty_id) → 연락처가 그 거래처 소속 |
| 6 | `purpose` | CODE | `text` | NOT NULL | — | `text()` | IN (CAPACITY_CHECK, RATE_REQUEST, SLOT_REQUEST, FACT_CONFIRM, GENERAL) |
| 7 | `related_run_id` | REF(recovery_run) | `uuid` | NULL | — | `uuid()` | FK recovery_run · RESTRICT |
| 8 | `thread_status` | CODE | `text` | NOT NULL | — | `text()` | IN (OPEN, WAITING_REPLY, ANSWERED, CLOSED) |
| 9 | `opened_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 10 | `last_activity_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 11 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 12 | `scenario_id` | REF(scenario) | `uuid` | NULL | — | `uuid()` | FK scenario · RESTRICT |

- **FK(표 수준 · 복합 포함)**:
  - counterparty_id → counterparty
  - (contact_id, counterparty_id) → counterparty_contact(contact_id, counterparty_id)
  - related_run_id → recovery_run
  - scenario_id → scenario
- **UNIQUE / 부분 유일**:
  - (channel_type, external_thread_id)
  - (thread_id, channel_type, is_simulated) — comm_message 복합 FK 대상
- **CHECK(컬럼 CHECK 외)**:
  - S-2
  - J.3: `NOT is_simulated OR channel_type = 'MOCK'`
  - `last_activity_at >= opened_at`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (counterparty_id)
  - (related_run_id)

### 22.13 `question_item` — 회신 → 사실 키 매핑의 축(L-1)

- 논리: `SOURCE_OF_TRUTH` · `CONTROLLED_UPDATE (question_status)` · 그룹 **C 통신** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `question_item_id`
- 변경 방식: CONTROLLED_UPDATE — `question_status` 만. 대상 개체·사실 키·범위는 불변(가드 트리거 — AI 가 범위를 정하지 않는다는 보장)
- migration 의존: comm_thread · Slice 1 사용: 초안 생성(T1)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `question_item_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `thread_id` | REF(comm_thread) | `uuid` | NOT NULL | — | `uuid()` | FK comm_thread · RESTRICT |
| 3 | `ask_id` | STRING(40) | `varchar(40)` | NOT NULL | — | `varchar({ length: 40 })` | — |
| 4 | `question_type` | CODE | `text` | NOT NULL | — | `text()` | IN (CAPACITY, RATE, SLOT, CONFIRM_FACT, FREE_TEXT) |
| 5 | `question_text` | TEXT | `text` | NOT NULL | — | `text()` | — |
| 6 | `target_entity_type` | CODE | `text` | NULL | — | `text()` | IN (CONTAINER, BL, FACILITY, COUNTERPARTY, TRUCK_POOL, VESSEL_CALL) |
| 7 | `target_entity_id` | STRING(30) | `uuid` | NULL | — | `uuid()` | — |
| 8 | `target_fact_key` | STRING(120) | `varchar(120)` | NULL | — | `varchar({ length: 120 })` | — |
| 9 | `target_applicability_scope_type` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 10 | `target_applicability_scope_ref` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | 대상 5컬럼은 전부 NULL 이거나 전부 NOT NULL. GLOBAL ⇔ 빈 문자열 |
| 11 | `expected_value_type` | CODE | `text` | NOT NULL | — | `text()` | IN (NUMBER, TIMESTAMP, CODE, TEXT, BOOLEAN) |
| 12 | `expected_unit` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 13 | `verification_request_key` | HASH | `varchar(71)` | NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · 논리 연결 키 — FK 없음(15.2.2) |
| 14 | `question_status` | CODE | `text` | NOT NULL | — | `text()` | IN (DRAFTED, SENT, ANSWERED, UNANSWERED, CANCELLED) |
| 15 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - thread_id → comm_thread
- **UNIQUE / 부분 유일**:
  - (thread_id, ask_id)
- **CHECK(컬럼 CHECK 외)**:
  - 대상 5컬럼 전부 NULL 또는 전부 NOT NULL
  - 대상 범위: `GLOBAL` ⇔ 빈 문자열
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (verification_request_key) WHERE verification_request_key IS NOT NULL

### 22.14 `comm_message` — 보낸·받은 한 통(내용은 참조 + 지문)

- 논리: `SOURCE_OF_TRUTH` · `IMMUTABLE_AFTER_CREATE + CACHE_UPDATE + sent_at 한 번 채움` · 그룹 **C 통신** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `message_id`
- 변경 방식: IMMUTABLE_AFTER_CREATE + CACHE(`current_status` · `current_approval_id`) + **`sent_at` NULL → 값 한 번**. 나머지 열 불변(가드 트리거)
- migration 의존: comm_thread · contact_channel_address · scenario (+ message_approval 뒤) · Slice 1 사용: T1 · T7

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `message_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `thread_id` | REF(comm_thread) | `uuid` | NOT NULL | — | `uuid()` | FK comm_thread · RESTRICT |
| 3 | `direction` | CODE | `text` | NOT NULL | — | `text()` | IN (OUTBOUND, INBOUND) |
| 4 | `message_kind` | CODE | `text` | NOT NULL | — | `text()` | IN (BUSINESS, CONTACT_VERIFICATION) |
| 5 | `contact_verification_id` | REF(contact_verification) | `uuid` | NULL | — | `uuid()` | P1 표 참조 — P0 에는 FK 없음 + 임시 CHECK `IS NULL`(P1 migration 이 FK 추가·임시 CHECK 제거) |
| 6 | `channel_type` | CODE | `text` | NOT NULL | — | `text()` | IN (GMAIL, MOCK, PORTAL) |
| 7 | `external_message_id` | STRING(200) | `varchar(200)` | NULL | — | `varchar({ length: 200 })` | INBOUND 중복 수신 차단 키. OUTBOUND 는 비움(발송 id 는 send_attempt.provider_message_id) |
| 8 | `from_address` | STRING(200) | `varchar(200)` | NULL | — | `varchar({ length: 200 })` | — |
| 9 | `to_address_id` | REF(contact_channel_address) | `uuid` | NULL | — | `uuid()` | FK contact_channel_address · RESTRICT · 복합 FK (to_address_id, channel_type) → 같은 채널 주소만 |
| 10 | `message_content_ref` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | 내용 참조 형식 `cref:v1:COMM_MESSAGE_CONTENT:<uuid>` |
| 11 | `content_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · 해시 재료는 8.2 `msg-content/1` |
| 12 | `current_status` | CODE | `text` | NULL | — | `text()` | IN (DRAFTED, PENDING_APPROVAL, APPROVED, REJECTED, QUEUED, SENT, DELIVERY_FAILED, REPLIED, CLOSED) · CACHE — transition 삽입 트리거가 갱신. **OUTBOUND 만 NOT NULL, INBOUND 는 NULL · 전이 없음**(rev.2.5). INBOUND 의 NULL = "상태 모름"이 아니라 "보내는 메시지 생애주기 미적용" — 수신 처리 상태는 raw_input → extraction → event 흐름 |
| 13 | `current_approval_id` | REF(message_approval) | `uuid` | NULL | — | `uuid()` | FK message_approval · RESTRICT · 뒤에서 추가 · CACHE 포인터. 복합 FK (current_approval_id, message_id) → 같은 메시지의 승인만. 같은 migration 뒤쪽에서 FK 추가(순환) |
| 14 | `drafted_by` | CODE | `text` | NULL | — | `text()` | IN (AI_DRAFT, HUMAN, TEMPLATE) · **OUTBOUND 만 NOT NULL, INBOUND 는 NULL**(rev.2.5). CERA 자동 초안 = TEMPLATE·AI_DRAFT, 행위 주체는 DRAFTED 전이의 SYSTEM actor |
| 15 | `created_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 16 | `sent_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | NULL → 값 **한 번**(발송 성공 확인 시 그 시도의 `finished_at`, rev.2.5) |
| 17 | `received_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 18 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 19 | `scenario_id` | REF(scenario) | `uuid` | NULL | — | `uuid()` | FK scenario · RESTRICT |

- **FK(표 수준 · 복합 포함)**:
  - (thread_id, channel_type, is_simulated) → comm_thread — 채널·시뮬레이션 일치(J.3)
  - (to_address_id, channel_type) → contact_channel_address(address_id, channel_type)
  - (current_approval_id, message_id) → message_approval(approval_id, message_id) · 뒤에서 추가
  - scenario_id → scenario
- **UNIQUE / 부분 유일**:
  - (channel_type, external_message_id)
  - (message_id, is_simulated) — send_attempt·transition 복합 FK 대상
  - (message_id, to_address_id) — message_approval 복합 FK 대상
- **CHECK(컬럼 CHECK 외)**:
  - S-2
  - `message_kind <> 'CONTACT_VERIFICATION' OR contact_verification_id IS NOT NULL`
  - **P0 임시**: `contact_verification_id IS NULL`(P1 전 CV 메시지 없음)
  - `direction <> 'OUTBOUND' OR (to_address_id IS NOT NULL AND message_content_ref IS NOT NULL)`
  - `direction <> 'INBOUND' OR received_at IS NOT NULL`
  - `(direction = 'OUTBOUND') = (drafted_by IS NOT NULL)` · `(direction = 'OUTBOUND') = (current_status IS NOT NULL)`(rev.2.5)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (created_at) WHERE current_status = 'QUEUED' — Outbox 픽업
  - (thread_id, created_at)
  - (to_address_id)

### 22.15 `comm_message_structured_field` — 메시지 숫자와 출처(숫자 검사·승인 대조의 기준)

- 논리: `SOURCE_OF_TRUTH` · `APPEND_ONLY` · 그룹 **C 통신** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `(message_id, field_key)`
- 변경 방식: APPEND_ONLY + 삽입 가드: 메시지가 `BUSINESS` 이고 `current_status = DRAFTED` 일 때만(I-10 규칙 4 · 수정은 새 메시지)
- migration 의존: comm_message · recovery_run · question_item · Slice 1 사용: T1

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `message_id` | REF(comm_message) | `uuid` | NOT NULL | — | `uuid()` | FK comm_message · RESTRICT |
| 2 | `field_key` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | 형식 CHECK `^[a-z][a-z0-9_]*$` |
| 3 | `value_text` | TEXT | `text` | NULL | — | `text()` | — |
| 4 | `value_number` | DECIMAL(18,4) | `numeric(18,4)` | NULL | — | `numeric({ precision: 18, scale: 4 })  // string` | `value_text`·`value_number` 중 최소 1개. 단위 KRW 면 정수(소수부 0) |
| 5 | `unit` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 6 | `source_run_id` | REF(recovery_run) | `uuid` | NULL | — | `uuid()` | FK recovery_run · RESTRICT |
| 7 | `source_question_item_id` | REF(question_item) | `uuid` | NULL | — | `uuid()` | FK question_item · RESTRICT |
| 8 | `source_path` | STRING(120) | `varchar(120)` | NULL | — | `varchar({ length: 120 })` | — |

- **FK(표 수준 · 복합 포함)**:
  - message_id → comm_message
  - source_run_id → recovery_run
  - source_question_item_id → question_item
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**:
  - `num_nonnulls(value_text, value_number) >= 1`
  - `unit <> 'KRW' OR value_number = trunc(value_number)`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (source_run_id)
  - (source_question_item_id)

### 22.16 `comm_message_question` — 메시지 ↔ 질문

- 논리: `SOURCE_OF_TRUTH` · `APPEND_ONLY` · 그룹 **C 통신** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `(message_id, question_item_id)`
- 변경 방식: APPEND_ONLY + 삽입 가드: `BUSINESS` · `DRAFTED` · 질문과 메시지가 같은 스레드(I-10 규칙 5)
- migration 의존: comm_message · question_item · Slice 1 사용: T1

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `message_id` | REF(comm_message) | `uuid` | NOT NULL | — | `uuid()` | FK comm_message · RESTRICT |
| 2 | `question_item_id` | REF(question_item) | `uuid` | NOT NULL | — | `uuid()` | FK question_item · RESTRICT |

- **FK(표 수준 · 복합 포함)**:
  - message_id → comm_message
  - question_item_id → question_item
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (question_item_id)

### 22.17 `message_approval` — G4 승인 · 반려 · 취소 · 무효화 사슬

- 논리: `DECISION_RECORD` · `APPEND_ONLY` · 그룹 **C 통신** · Drizzle 분류 **POSTGRES_NATIVE**
- PK: `approval_id`
- 변경 방식: APPEND_ONLY + 삽입 가드(대상 승인이 APPROVED · CV 메시지 승인 금지 · 결정 주체 HUMAN(INVALIDATED 는 SYSTEM 허용) · 계획 기반이면 `approved_plan_run_id` · 내용 있으면 `approved_content_ref`) + **커밋 시 지연 검사**: APPROVED 의 구조화 값 사본 = 메시지 구조화 값 · 값의 `source_run_id` 는 한 실행뿐 · `approved_plan_run_id` = 그 실행
- migration 의존: comm_message · actor · recovery_run · contact_channel_address · Slice 1 사용: T2 · T3

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `approval_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `message_id` | REF(comm_message) | `uuid` | NOT NULL | — | `uuid()` | FK comm_message · RESTRICT |
| 3 | `decision` | CODE | `text` | NOT NULL | — | `text()` | IN (APPROVED, REJECTED, REVISION_REQUESTED, REVOKED, INVALIDATED) |
| 4 | `invalidates_approval_id` | REF(message_approval) | `uuid` | NULL | — | `uuid()` | FK message_approval · RESTRICT · 복합 FK (invalidates_approval_id, message_id) → 같은 메시지 · UNIQUE(1건) · 대상 decision=APPROVED 는 트리거 |
| 5 | `invalidation_cause` | CODE | `text` | NULL | — | `text()` | IN (USER_REVOKED, PLAN_SUPERSEDED, CONTENT_CHANGED) |
| 6 | `actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor · RESTRICT |
| 7 | `decided_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 8 | `expires_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | `expires_at > decided_at` |
| 9 | `approved_content_ref` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | 내용 참조 형식 `cref:v1:MESSAGE_APPROVAL_CONTENT:<uuid>` |
| 10 | `approved_plan_run_id` | REF(recovery_run) | `uuid` | NULL | — | `uuid()` | FK recovery_run · RESTRICT |
| 11 | `approved_content_hash` | HASH | `varchar(71)` | NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` |
| 12 | `approved_to_address_id` | REF(contact_channel_address) | `uuid` | NULL | — | `uuid()` | FK contact_channel_address · RESTRICT · 복합 FK (message_id, approved_to_address_id) → comm_message(message_id, to_address_id) |
| 13 | `reason` | STRING(500) | `varchar(500)` | NULL | — | `varchar({ length: 500 })` | — |

- **FK(표 수준 · 복합 포함)**:
  - message_id → comm_message
  - (invalidates_approval_id, message_id) → message_approval(approval_id, message_id) — 같은 메시지
  - actor_id → actor
  - approved_plan_run_id → recovery_run
  - (message_id, approved_to_address_id) → comm_message(message_id, to_address_id)
- **UNIQUE / 부분 유일**:
  - (invalidates_approval_id) — NULL 여럿 허용, 값은 1건(I-17)
  - (approval_id, message_id) — 복합 FK 대상
- **CHECK(컬럼 CHECK 외)**:
  - 무효화 쌍: `decision IN (REVOKED, INVALIDATED)` ⇔ `invalidates_approval_id`·`invalidation_cause` NOT NULL
  - `decision = REVOKED` ⇒ `USER_REVOKED` · `decision = INVALIDATED` ⇒ `PLAN_SUPERSEDED`·`CONTENT_CHANGED`
  - `decision = APPROVED` ⇒ `approved_content_hash`·`approved_to_address_id` NOT NULL
  - `decision IN (REJECTED, REVISION_REQUESTED)` ⇒ `reason` NOT NULL
  - `expires_at IS NULL OR expires_at > decided_at`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (message_id, decided_at)
  - (message_id) WHERE decision = 'APPROVED'

### 22.18 `message_approval_structured_field` — 승인한 숫자의 사본

- 논리: `DECISION_RECORD` · `APPEND_ONLY` · 그룹 **C 통신** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `(approval_id, field_key)`
- 변경 방식: APPEND_ONLY + 삽입 가드: 부모 decision ∈ (APPROVED, REJECTED, REVISION_REQUESTED)
- migration 의존: message_approval · Slice 1 사용: T2

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `approval_id` | REF(message_approval) | `uuid` | NOT NULL | — | `uuid()` | FK message_approval · RESTRICT |
| 2 | `field_key` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | — |
| 3 | `approved_value_text` | TEXT | `text` | NULL | — | `text()` | — |
| 4 | `approved_value_number` | DECIMAL(18,4) | `numeric(18,4)` | NULL | — | `numeric({ precision: 18, scale: 4 })  // string` | — |
| 5 | `approved_unit` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 6 | `approved_source_run_id` | REF(recovery_run) | `uuid` | NULL | — | `uuid()` | FK recovery_run · RESTRICT |
| 7 | `approved_source_question_item_id` | REF(question_item) | `uuid` | NULL | — | `uuid()` | FK question_item · RESTRICT |
| 8 | `approved_source_path` | STRING(120) | `varchar(120)` | NULL | — | `varchar({ length: 120 })` | — |

- **FK(표 수준 · 복합 포함)**:
  - approval_id → message_approval
  - approved_source_run_id → recovery_run
  - approved_source_question_item_id → question_item
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**:
  - `num_nonnulls(approved_value_text, approved_value_number) >= 1`
  - `approved_unit <> 'KRW' OR approved_value_number = trunc(approved_value_number)`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.19 `send_attempt` — 외부 호출 1회 — 중복 방지의 핵심

- 논리: `SOURCE_OF_TRUTH` · `IMMUTABLE_AFTER_CREATE + CONTROLLED_UPDATE (결과 5컬럼 · UNKNOWN 화해 한 번)` · 그룹 **C 통신** · Drizzle 분류 **POSTGRES_NATIVE**
- PK: `send_attempt_id`
- 변경 방식: 요청 9컬럼 불변 · 결과 5컬럼 NULL → 결과 한 번 + **UNKNOWN → SUCCESS / RETRYABLE_FAILURE 한 번(화해 증거 필수)**(트리거) · **삽입 가드 = I-9/I-3/I-3b + 새 시도 조건**(SUCCESS·PERMANENT_FAILURE 시도가 있으면 거부 · `attempt_no` = 이전 최대 + 1)(BUSINESS: 유효한 승인 여섯 조건을 `started_at` 기준으로 · 지문 = `approved_content_hash` · 수신자 일치 / CV: 승인 NULL · 지문 = 메시지 `content_hash`)
- migration 의존: comm_message · message_approval · Slice 1 사용: T5 · T6 · 화해

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `send_attempt_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `message_id` | REF(comm_message) | `uuid` | NOT NULL | — | `uuid()` | FK comm_message · RESTRICT |
| 3 | `approval_id` | REF(message_approval) | `uuid` | NULL | — | `uuid()` | FK message_approval · RESTRICT · 복합 FK (approval_id, message_id) → 같은 메시지 승인. BUSINESS 필수 · CV 금지는 삽입 트리거 |
| 4 | `attempt_no` | INTEGER | `integer` | NOT NULL | — | `integer()` | — |
| 5 | `idempotency_key` | STRING(100) | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · UNIQUE · **시도마다 다름** — 재료 `sak/1` = 메시지 + 시도 번호(8.2) |
| 6 | `channel_connection_id` | REF(channel_connection) | `uuid` | NULL | — | `uuid()` | P1 표 참조 — FK 없음 + 임시 CHECK `IS NULL` |
| 7 | `sent_content_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` |
| 8 | `started_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 9 | `finished_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 10 | `result` | CODE | `text` | NULL | — | `text()` | IN (SUCCESS, RETRYABLE_FAILURE, PERMANENT_FAILURE, UNKNOWN) · NULL → 결과 한 번 · **UNKNOWN → SUCCESS(`provider_message_id` 필수) / RETRYABLE_FAILURE(`error_code = RECONCILED_NOT_SENT`) 한 번 — 화해만**(트리거, rev.2.5) |
| 11 | `error_code` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` · CATALOG. 화해로 보내지 않았음을 확인하면 `RECONCILED_NOT_SENT` |
| 12 | `error_message` | STRING(500) | `varchar(500)` | NULL | — | `varchar({ length: 500 })` | — |
| 13 | `provider_message_id` | STRING(200) | `varchar(200)` | NULL | — | `varchar({ length: 200 })` | — |
| 14 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | 복합 FK (message_id, is_simulated) → 메시지와 같은 값 |

- **FK(표 수준 · 복합 포함)**:
  - (message_id, is_simulated) → comm_message(message_id, is_simulated)
  - (approval_id, message_id) → message_approval(approval_id, message_id)
- **UNIQUE / 부분 유일**:
  - (message_id, attempt_no)
  - (idempotency_key) — 시도마다 다름
  - **부분 유일 U-6** `(message_id) WHERE result = 'SUCCESS'` — 메시지당 성공 1건
  - **부분 유일 U-7** `(message_id) WHERE result IS NULL OR result = 'UNKNOWN'` — 메시지당 미확정 1건(재전송 전 화해 강제)
  - (send_attempt_id, message_id) — transition 복합 FK 대상
- **CHECK(컬럼 CHECK 외)**:
  - `attempt_no >= 1`
  - `(result IS NULL) = (finished_at IS NULL)`
  - `result <> 'SUCCESS' OR error_code IS NULL`
  - `result <> 'SUCCESS' OR provider_message_id IS NOT NULL`
  - `finished_at IS NULL OR finished_at >= started_at`
  - **P0 임시**: `channel_connection_id IS NULL`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (started_at) WHERE result IS NULL — 재기동 화해
  - (provider_message_id) WHERE provider_message_id IS NOT NULL — 회신 상관
  - (message_id)

### 22.20 `message_status_transition` — 메시지 상태의 정본

- 논리: `SOURCE_OF_TRUTH` · `APPEND_ONLY` · 그룹 **C 통신** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `transition_id`
- 변경 방식: APPEND_ONLY + **AFTER INSERT 트리거가 `comm_message.current_status` 갱신**(캐시가 어긋날 수 없게)
- migration 의존: comm_message · send_attempt · actor · Slice 1 사용: T1~T7

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `transition_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `message_id` | REF(comm_message) | `uuid` | NOT NULL | — | `uuid()` | FK comm_message · RESTRICT |
| 3 | `status` | CODE | `text` | NOT NULL | — | `text()` | IN (DRAFTED, PENDING_APPROVAL, APPROVED, REJECTED, QUEUED, SENT, DELIVERY_FAILED, REPLIED, CLOSED) |
| 4 | `occurred_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 5 | `actor_id` | REF(actor) | `uuid` | NULL | — | `uuid()` | FK actor · RESTRICT |
| 6 | `send_attempt_id` | REF(send_attempt) | `uuid` | NULL | — | `uuid()` | FK send_attempt · RESTRICT · 복합 FK (send_attempt_id, message_id) → 같은 메시지의 시도 |
| 7 | `note` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | — |
| 8 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - (message_id, is_simulated) → comm_message(message_id, is_simulated)
  - actor_id → actor
  - (send_attempt_id, message_id) → send_attempt(send_attempt_id, message_id)
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (message_id, occurred_at)

### 22.21 `raw_input` — 수집 1건(원문은 참조 + 지문)

- 논리: `SOURCE_OF_TRUTH` · `APPEND_ONLY` · 그룹 **I 수신·사건** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `raw_input_id`
- 변경 방식: APPEND_ONLY
- migration 의존: actor · Slice 1 사용: T7 · 사람 명령 · 시드

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `raw_input_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `source_type` | CODE | `text` | NOT NULL | — | `text()` | IN (HUMAN_UI, FILE_IMPORT, EMAIL, DOCUMENT, PUBLIC_API, PARTNER_SYSTEM, INFERENCE) |
| 3 | `source_name` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | — |
| 4 | `request_ref` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | — |
| 5 | `payload_ref` | STRING(300) | `varchar(300)` | NULL | — | `varchar({ length: 300 })` | 내용 참조 형식 `cref:v1:RAW_INPUT_PAYLOAD:<uuid>` |
| 6 | `payload_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · bytes 의 SHA-256(8.2). UNIQUE 아님 |
| 7 | `attachment_manifest` | JSON | `jsonb` | NULL | — | `jsonb().$type<…>()` | jsonb 배열 `[{sha256, size_bytes, media_type}]` — 파일명 금지 |
| 8 | `source_record_key` | STRING(200) | `varchar(200)` | NULL | — | `varchar({ length: 200 })` | UNIQUE(source_name, source_record_key) — NULL 여러 개 허용(기본 동작) |
| 9 | `source_recorded_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | EMAIL 이면 `<= received_at` (I-28 결과) |
| 10 | `received_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 11 | `collected_by_actor_id` | REF(actor) | `uuid` | NULL | — | `uuid()` | FK actor · RESTRICT |
| 12 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - collected_by_actor_id → actor
- **UNIQUE / 부분 유일**:
  - (source_name, source_record_key)
  - (raw_input_id, is_simulated) — event·extraction 복합 FK 대상
- **CHECK(컬럼 CHECK 외)**:
  - EMAIL: `source_recorded_at IS NULL OR source_recorded_at <= received_at`
  - `jsonb_typeof(attachment_manifest) = 'array'`(값이 있을 때)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (received_at)

### 22.22 `extraction` — LLM(Slice 1 은 녹화 재생) 추출 후보 + 인용 + 검증기 결과

- 논리: `EVIDENCE` · `IMMUTABLE_AFTER_CREATE + CONTROLLED_UPDATE (검토 4컬럼)` · 그룹 **I 수신·사건** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `extraction_id`
- 변경 방식: 결과 16컬럼 불변 · 검토 4컬럼 PENDING → 종료 한 번(트리거)
- migration 의존: raw_input · comm_message · actor (+ event 뒤) · Slice 1 사용: T8 · T9

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `extraction_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `message_id` | REF(comm_message) | `uuid` | NULL | — | `uuid()` | FK comm_message · RESTRICT |
| 3 | `raw_input_id` | REF(raw_input) | `uuid` | NOT NULL | — | `uuid()` | FK raw_input · RESTRICT |
| 4 | `ask_id` | STRING(40) | `varchar(40)` | NULL | — | `varchar({ length: 40 })` | — |
| 5 | `candidate_value_text` | TEXT | `text` | NOT NULL | — | `text()` | — |
| 6 | `candidate_unit` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 7 | `source_quote_ref` | STRING(300) | `varchar(300)` | NOT NULL | — | `varchar({ length: 300 })` | 내용 참조 형식 `cref:v1:EXTRACTION_SOURCE_QUOTE:<uuid>` |
| 8 | `source_quote_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` |
| 9 | `quote_location` | STRING(100) | `varchar(100)` | NULL | — | `varchar({ length: 100 })` | — |
| 10 | `model_version` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | Slice 1 녹화 재생은 `replay:<fixture 판>` 형식 |
| 11 | `prompt_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | — |
| 12 | `model_confidence` | DECIMAL(5,4) | `numeric(5,4)` | NULL | — | `numeric({ precision: 5, scale: 4 })  // string` | 0 ≤ x ≤ 1. 근거 강도 아님 |
| 13 | `review_status` | CODE | `text` | NOT NULL | `'PENDING'` | `text()` | IN (PENDING, ACCEPTED, REJECTED, SUPERSEDED) |
| 14 | `reviewed_by_actor_id` | REF(actor) | `uuid` | NULL | — | `uuid()` | FK actor · RESTRICT |
| 15 | `reviewed_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 16 | `created_event_id` | REF(event) | `uuid` | NULL | — | `uuid()` | FK event · RESTRICT · 뒤에서 추가 · 순환 — 같은 migration 뒤쪽에서 FK 추가. ACCEPTED ⇔ NOT NULL |
| 17 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 18 | `schema_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | — |
| 19 | `input_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` |
| 20 | `validator_result` | JSON | `jsonb` | NOT NULL | — | `jsonb().$type<…>()` | jsonb 배열 — 검사별 결과(7.3) |

- **FK(표 수준 · 복합 포함)**:
  - message_id → comm_message
  - (raw_input_id, is_simulated) → raw_input(raw_input_id, is_simulated)
  - reviewed_by_actor_id → actor
  - created_event_id → event · 뒤에서 추가
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**:
  - `review_status = ACCEPTED` ⇔ `created_event_id IS NOT NULL`
  - `review_status IN (ACCEPTED, REJECTED)` ⇒ `reviewed_at IS NOT NULL`
  - `review_status = PENDING` ⇒ 검토 3컬럼 NULL
  - `model_confidence BETWEEN 0 AND 1`
  - `jsonb_typeof(validator_result) = 'array'`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (raw_input_id)
  - (message_id)
  - (review_status) WHERE review_status = 'PENDING'

### 22.23 `event` — 사실 주장의 정본(append-only)

- 논리: `SOURCE_OF_TRUTH` · `APPEND_ONLY` · 그룹 **I 수신·사건** · Drizzle 분류 **POSTGRES_NATIVE**
- PK: `event_id`
- 변경 방식: APPEND_ONLY + 삽입 가드(CORRECTION 은 원 사건과 fact_kind·주체 같음) + **커밋 시 지연 검사**: SUBJECT 정확히 1건(I-8) · VERIFICATION 은 TARGET ≥ 1 · 그 밖은 0(I-21)
- migration 의존: raw_input · counterparty · actor · extraction · scenario · Slice 1 사용: T9 · T11

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | UUIDv7 — 생성 시각순 정렬, R 규칙 최종 tie-break(4절) |
| 2 | `schema_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | 형식 CHECK `^ev-[1-9][0-9]*$` |
| 3 | `raw_input_id` | REF(raw_input) | `uuid` | NOT NULL | — | `uuid()` | FK raw_input · RESTRICT · 복합 FK (raw_input_id, is_simulated) → 원천과 같은 시뮬레이션 값 |
| 4 | `event_class` | CODE | `text` | NOT NULL | — | `text()` | IN (OBSERVATION, CORRECTION, VERIFICATION) |
| 5 | `event_type` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` · CATALOG — docs/05 4.4. fixture 불일치는 T-082 |
| 6 | `fact_kind` | CODE | `text` | NULL | — | `text()` | IN (MILESTONE, STATE, OFFER, TERM, IDENTITY, PLAN, FORECAST) |
| 7 | `fact_key` | STRING(120) | `varchar(120)` | NULL | — | `varchar({ length: 120 })` | VERIFICATION 이면 NULL, 아니면 NOT NULL(부류 CHECK) |
| 8 | `value_text` | TEXT | `text` | NULL | — | `text()` | — |
| 9 | `value_number` | DECIMAL(18,4) | `numeric(18,4)` | NULL | — | `numeric({ precision: 18, scale: 4 })  // string` | 단위 KRW 면 정수 |
| 10 | `value_timestamp` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 11 | `value_code` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 12 | `value_unit` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 13 | `valid_from` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 14 | `valid_until` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 15 | `applicability_scope_type` | CODE | `text` | NOT NULL | `'GLOBAL'` | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 16 | `applicability_scope_ref` | STRING(60) | `varchar(60)` | NOT NULL | `''` | `varchar({ length: 60 })` | GLOBAL ⇔ 빈 문자열(CHECK). RECOVERY_CONTEXT 면 뿌리 run_id 문자열(I-35, 쓰기 경로 검사) |
| 17 | `source_event_time` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 18 | `source_recorded_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 19 | `received_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 20 | `source_type` | CODE | `text` | NOT NULL | — | `text()` | IN (HUMAN_UI, FILE_IMPORT, EMAIL, DOCUMENT, PUBLIC_API, PARTNER_SYSTEM, INFERENCE) |
| 21 | `source_role_at_ingestion` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 22 | `source_id` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | — |
| 23 | `extraction_method` | CODE | `text` | NOT NULL | — | `text()` | IN (DIRECT, RULE_PARSED, LLM_EXTRACTED, CALCULATED) |
| 24 | `input_quality` | CODE | `text` | NOT NULL | — | `text()` | IN (STRUCTURED, SEMI_STRUCTURED, UNSTRUCTURED) |
| 25 | `input_confidence_level` | CODE | `text` | NOT NULL | — | `text()` | IN (HIGH, MEDIUM, LOW) |
| 26 | `input_confidence_reasons` | JSON | `jsonb` | NULL | — | `jsonb().$type<…>()` | jsonb 배열(7.2) |
| 27 | `asserted_by_counterparty_id` | REF(counterparty) | `uuid` | NULL | — | `uuid()` | FK counterparty · RESTRICT |
| 28 | `entered_by_actor_id` | REF(actor) | `uuid` | NULL | — | `uuid()` | FK actor · RESTRICT |
| 29 | `supersedes_event_id` | REF(event) | `uuid` | NULL | — | `uuid()` | FK event · RESTRICT · 자기참조. `<> event_id`. 순환은 append-only + 기존 행만 참조로 불가능 |
| 30 | `supersede_reason` | STRING(200) | `varchar(200)` | NULL | — | `varchar({ length: 200 })` | — |
| 31 | `verification_action` | CODE | `text` | NULL | — | `text()` | IN (CONFIRM, REJECT, REVOKE) |
| 32 | `verification_method` | CODE | `text` | NULL | — | `text()` | IN (DIRECT_REVIEW, REQUEST_RESOLUTION) |
| 33 | `extraction_id` | REF(extraction) | `uuid` | NULL | — | `uuid()` | FK extraction · RESTRICT · I-23: `(extraction_method = LLM_EXTRACTED) = (extraction_id IS NOT NULL)` |
| 34 | `correlation_id` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | — |
| 35 | `idempotency_key` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · UNIQUE. 재료 `evk/1`(9절) |
| 36 | `payload` | JSON | `jsonb` | NULL | — | `jsonb().$type<…>()` | jsonb 객체 — 부가 속성만(7.1). `claim_locator` · Q-44 키 |
| 37 | `recorded_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 38 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 39 | `scenario_id` | REF(scenario) | `uuid` | NULL | — | `uuid()` | FK scenario · RESTRICT |

- **FK(표 수준 · 복합 포함)**:
  - (raw_input_id, is_simulated) → raw_input(raw_input_id, is_simulated)
  - asserted_by_counterparty_id → counterparty
  - entered_by_actor_id → actor
  - supersedes_event_id → event
  - extraction_id → extraction
  - scenario_id → scenario
- **UNIQUE / 부분 유일**:
  - (idempotency_key)
- **CHECK(컬럼 CHECK 외)**:
  - S-2
  - 부류 조합(11.2 규칙 5): OBSERVATION / CORRECTION / VERIFICATION 별 NULL·NOT NULL
  - I-23: `(extraction_method = 'LLM_EXTRACTED') = (extraction_id IS NOT NULL)`
  - `supersedes_event_id <> event_id`
  - 범위: `(applicability_scope_type = 'GLOBAL') = (applicability_scope_ref = '')`
  - `valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until`
  - `value_unit <> 'KRW' OR value_number = trunc(value_number)`
  - `jsonb_typeof(payload) = 'object'` · `jsonb_typeof(input_confidence_reasons) = 'array'`(값이 있을 때)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (raw_input_id)
  - (fact_key, applicability_scope_type, applicability_scope_ref)
  - (supersedes_event_id) WHERE supersedes_event_id IS NOT NULL
  - (extraction_id) WHERE extraction_id IS NOT NULL
  - (correlation_id) WHERE correlation_id IS NOT NULL
  - (received_at)

### 22.24 `event_entity_link` — 사건 → 개체. SUBJECT 1건

- 논리: `SOURCE_OF_TRUTH` · `APPEND_ONLY` · 그룹 **I 수신·사건** · Drizzle 분류 **POSTGRES_NATIVE**
- PK: `(event_id, entity_type, entity_id)`
- 변경 방식: APPEND_ONLY + 삽입 가드: 다형 대상 존재 검사(FACILITY → facility 등. P0 에 없는 CONTAINER·BL·VESSEL_CALL 은 Slice 1 에서 거부)
- migration 의존: event (+ 다형: facility · truck_pool · counterparty) · Slice 1 사용: T9 · T11

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | REF(event) | `uuid` | NOT NULL | — | `uuid()` | FK event · RESTRICT |
| 2 | `entity_type` | CODE | `text` | NOT NULL | — | `text()` | IN (CONTAINER, BL, FACILITY, COUNTERPARTY, TRUCK_POOL, VESSEL_CALL) |
| 3 | `entity_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | 다형 — DB FK 없음, 존재 검사 트리거(11.3) |
| 4 | `link_role` | CODE | `text` | NOT NULL | — | `text()` | IN (SUBJECT, CONTEXT) · rev.2.5 필수(I-8 이 SUBJECT 를 센다) |

- **FK(표 수준 · 복합 포함)**:
  - event_id → event
- **UNIQUE / 부분 유일**:
  - **부분 유일** `(event_id) WHERE link_role = 'SUBJECT'`(I-8 의 "최대 1")
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (entity_type, entity_id, event_id) WHERE link_role = 'SUBJECT' — 좌표별 사건 조회

### 22.25 `event_verification_target` — 확인 사건 → 대상 사건(TARGET · OVERRULED)

- 논리: `SOURCE_OF_TRUTH` · `APPEND_ONLY` · 그룹 **I 수신·사건** · Drizzle 분류 **POSTGRES_NATIVE**
- PK: `(verification_event_id, target_event_id, target_role)`
- 변경 방식: APPEND_ONLY + **커밋 시 지연 검사**: 확인 사건 부류 = VERIFICATION · 대상 부류 ≠ VERIFICATION · OVERRULED 는 REQUEST_RESOLUTION 에서만 · I-26 좌표 동일
- migration 의존: event · Slice 1 사용: T11

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `verification_event_id` | REF(event) | `uuid` | NOT NULL | — | `uuid()` | FK event · RESTRICT |
| 2 | `target_event_id` | REF(event) | `uuid` | NOT NULL | — | `uuid()` | FK event · RESTRICT · 역방향 조회 인덱스. VERIFICATION 을 가리킬 수 없음(트리거) |
| 3 | `target_role` | CODE | `text` | NOT NULL | — | `text()` | IN (TARGET, OVERRULED) |

- **FK(표 수준 · 복합 포함)**:
  - verification_event_id → event
  - target_event_id → event
- **UNIQUE / 부분 유일**:
  - (verification_event_id, target_event_id) — 같은 대상을 두 역할로 가리키지 않는다(물리 보강 — 검토)
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (target_event_id) — R1 역방향 조회

### 22.26 `canonical_fact` — 현재 사실(파생 · 재생성 가능)

- 논리: `DERIVED_MATERIALIZED` · `REBUILDABLE` · 그룹 **D 파생·사람 처리** · Drizzle 분류 **NORMAL**
- PK: `(entity_type, entity_id, fact_key, applicability_scope_type, applicability_scope_ref, is_simulated)`
- 변경 방식: REBUILDABLE — 앱 권한 INSERT·UPDATE·DELETE. 좌표 단위 재계산은 advisory xact lock(13.3)
- migration 의존: event · scenario · Slice 1 사용: T10

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `entity_type` | CODE | `text` | NOT NULL | — | `text()` | IN (CONTAINER, BL, FACILITY, COUNTERPARTY, TRUCK_POOL, VESSEL_CALL) |
| 2 | `entity_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 3 | `fact_key` | STRING(120) | `varchar(120)` | NOT NULL | — | `varchar({ length: 120 })` | — |
| 4 | `applicability_scope_type` | CODE | `text` | NOT NULL | `'GLOBAL'` | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 5 | `applicability_scope_ref` | STRING(60) | `varchar(60)` | NOT NULL | `''` | `varchar({ length: 60 })` | — |
| 6 | `fact_name` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | — |
| 7 | `param_date` | DATE | `date` | NULL | — | `date({ mode: 'string' })` | — |
| 8 | `param_slot_start` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 9 | `param_size_type` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 10 | `value_text` | TEXT | `text` | NULL | — | `text()` | — |
| 11 | `value_number` | DECIMAL(18,4) | `numeric(18,4)` | NULL | — | `numeric({ precision: 18, scale: 4 })  // string` | — |
| 12 | `value_timestamp` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 13 | `value_code` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 14 | `value_unit` | CODE | `text` | NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 15 | `valid_from` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 16 | `valid_until` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 17 | `winning_event_id` | REF(event) | `uuid` | NOT NULL | — | `uuid()` | FK event · RESTRICT · FK RESTRICT — 재계산은 이 표를 지우는 것이지 사건을 지우는 것이 아니다 |
| 18 | `applied_rule` | CODE | `text` | NOT NULL | — | `text()` | 형식 `^R[0-9]{1,2}(-[a-z])?$` |
| 19 | `rule_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | — |
| 20 | `value_status` | CODE | `text` | NOT NULL | — | `text()` | IN (CONFIRMED, OBSERVED, PROVISIONAL, INFERRED, UNKNOWN) |
| 21 | `verification_basis` | CODE | `text` | NULL | — | `text()` | IN (HUMAN_VERIFICATION, AUTHORITATIVE_SYSTEM, POLICY_EVIDENCE) · `(value_status = CONFIRMED) = (verification_basis IS NOT NULL)` |
| 22 | `evidence_strength` | CODE | `text` | NOT NULL | — | `text()` | IN (0, 1, 2, 3) · docs/05 3.3 강도 등급(rev.2.5 표기 정정) |
| 23 | `evidence_policy_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | — |
| 24 | `evidence_time` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 25 | `evidence_time_quality` | CODE | `text` | NOT NULL | — | `text()` | IN (EVENT_TIME, RECORDED_TIME, RECEIVED_ONLY) · docs/05 5.2 의 값(작업표 예시도 rev.2.5 에서 정정) |
| 26 | `temporal_confidence` | CODE | `text` | NOT NULL | — | `text()` | IN (HIGH, MEDIUM, LOW) |
| 27 | `freshness_status` | CODE | `text` | NOT NULL | — | `text()` | IN (FRESH, AGING, STALE, EXPIRED, UNKNOWN, N_A) |
| 28 | `conflict_status` | CODE | `text` | NOT NULL | — | `text()` | IN (NONE, DISSENT, OPEN) |
| 29 | `hold_status` | CODE | `text` | NOT NULL | — | `text()` | IN (NONE, HELD) |
| 30 | `decision_usability` | CODE | `text` | NOT NULL | — | `text()` | IN (USABLE, USABLE_WITH_WARNING, APPROVAL_BLOCKED, UNUSABLE) |
| 31 | `contributing_event_count` | INTEGER | `integer` | NOT NULL | — | `integer()` | `>= 1` |
| 32 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 33 | `scenario_id` | REF(scenario) | `uuid` | NULL | — | `uuid()` | FK scenario · RESTRICT |
| 34 | `computed_as_of` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 35 | `computed_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **FK(표 수준 · 복합 포함)**:
  - winning_event_id → event
  - scenario_id → scenario
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**:
  - S-2
  - 범위 GLOBAL ⇔ 빈 문자열
  - `(value_status = 'CONFIRMED') = (verification_basis IS NOT NULL)`
  - `contributing_event_count >= 1`
  - `value_unit <> 'KRW' OR value_number = trunc(value_number)`
  - `valid_from < valid_until`(둘 다 있을 때)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (fact_name, param_date)
  - (winning_event_id)
  - (decision_usability) WHERE decision_usability <> 'USABLE'

### 22.27 `conflict` — 같은 범위 안의 충돌(파생)

- 논리: `DERIVED_MATERIALIZED` · `REBUILDABLE` · 그룹 **D 파생·사람 처리** · Drizzle 분류 **NORMAL**
- PK: `conflict_id`
- 변경 방식: REBUILDABLE
- migration 의존: scenario · Slice 1 사용: T10

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `conflict_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | 파생 대리키 — 재계산마다 새로 발급될 수 있다 |
| 2 | `entity_type` | CODE | `text` | NOT NULL | — | `text()` | IN (CONTAINER, BL, FACILITY, COUNTERPARTY, TRUCK_POOL, VESSEL_CALL) |
| 3 | `entity_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 4 | `fact_key` | STRING(120) | `varchar(120)` | NOT NULL | — | `varchar({ length: 120 })` | — |
| 5 | `applicability_scope_type` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 6 | `applicability_scope_ref` | STRING(60) | `varchar(60)` | NOT NULL | `''` | `varchar({ length: 60 })` | — |
| 7 | `conflict_type` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 8 | `event_ids` | JSON | `uuid[]` | NOT NULL | — | `uuid().array()` | **jsonb → uuid[]**(같은 이름·같은 뜻). 정렬·중복 없음은 앱, `cardinality >= 2` CHECK |
| 9 | `severity` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 10 | `detected_rule` | CODE | `text` | NOT NULL | — | `text()` | 형식 `^R[0-9]{1,2}(-[a-z])?$` |
| 11 | `rule_version` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | — |
| 12 | `blocks_automation` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 13 | `computed_as_of` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 14 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 15 | `scenario_id` | REF(scenario) | `uuid` | NULL | — | `uuid()` | FK scenario · RESTRICT |

- **FK(표 수준 · 복합 포함)**:
  - scenario_id → scenario
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**:
  - S-2
  - 범위 GLOBAL ⇔ 빈 문자열
  - `cardinality(event_ids) >= 2`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (entity_type, entity_id, fact_key, applicability_scope_type, applicability_scope_ref, is_simulated)

### 22.28 `verification_request` — 확인 큐(파생)

- 논리: `DERIVED_MATERIALIZED` · `REBUILDABLE` · 그룹 **D 파생·사람 처리** · Drizzle 분류 **NORMAL**
- PK: `verification_request_id`
- 변경 방식: REBUILDABLE — `current_status` 는 처리 기록을 접은 캐시
- migration 의존: conflict · scenario · Slice 1 사용: T10

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `verification_request_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `request_key` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · UNIQUE. 재료 `vrk/1`(8.2) |
| 3 | `trigger_rule` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 4 | `entity_type` | CODE | `text` | NOT NULL | — | `text()` | IN (CONTAINER, BL, FACILITY, COUNTERPARTY, TRUCK_POOL, VESSEL_CALL) |
| 5 | `entity_id` | STRING(30) | `uuid` | NOT NULL | — | `uuid()` | — |
| 6 | `fact_key` | STRING(120) | `varchar(120)` | NOT NULL | — | `varchar({ length: 120 })` | — |
| 7 | `applicability_scope_type` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 8 | `applicability_scope_ref` | STRING(60) | `varchar(60)` | NOT NULL | `''` | `varchar({ length: 60 })` | — |
| 9 | `conflict_id` | REF(conflict) | `uuid` | NULL | — | `uuid()` | FK conflict · SET NULL · FK **ON DELETE SET NULL** — 둘 다 재생성 대상, 화면용 참조 |
| 10 | `priority` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 11 | `blocks_automation` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 12 | `computed_as_of` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 13 | `computed_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 14 | `current_status` | CODE | `text` | NOT NULL | — | `text()` | CATALOG 형식 `^[A-Z0-9][A-Z0-9_]*$` |
| 15 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 16 | `scenario_id` | REF(scenario) | `uuid` | NULL | — | `uuid()` | FK scenario · RESTRICT |

- **FK(표 수준 · 복합 포함)**:
  - conflict_id → conflict · SET NULL
  - scenario_id → scenario
- **UNIQUE / 부분 유일**:
  - (request_key)
- **CHECK(컬럼 CHECK 외)**:
  - S-2
  - 범위 GLOBAL ⇔ 빈 문자열
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (entity_type, entity_id, fact_key, applicability_scope_type, applicability_scope_ref)
  - (current_status)

### 22.29 `verification_request_handling` — 사람의 처리 기록(재계산으로 지워지지 않음)

- 논리: `DECISION_RECORD` · `APPEND_ONLY` · 그룹 **D 파생·사람 처리** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `handling_id`
- 변경 방식: APPEND_ONLY + 삽입 가드: `actor.actor_type = HUMAN`(사람의 처리 기록)
- migration 의존: actor · question_item · event · Slice 1 사용: T11

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `handling_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `request_key` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · 논리 연결 키 — FK 없음(11.7.1) |
| 3 | `handling_type` | CODE | `text` | NOT NULL | — | `text()` | IN (ACKNOWLEDGED, ASSIGNED, ASKED_EXTERNAL, RESOLVED, DISMISSED, SNOOZED) |
| 4 | `actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor · RESTRICT |
| 5 | `handled_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 6 | `note` | STRING(500) | `varchar(500)` | NULL | — | `varchar({ length: 500 })` | — |
| 7 | `question_item_id` | REF(question_item) | `uuid` | NULL | — | `uuid()` | FK question_item · RESTRICT |
| 8 | `resolving_event_id` | REF(event) | `uuid` | NULL | — | `uuid()` | FK event · RESTRICT |
| 9 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - actor_id → actor
  - question_item_id → question_item
  - resolving_event_id → event
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (request_key, handled_at)


### 22.30 `vessel_call` — 입항 건(공공 API 식별 정보) **(M14 · T-102 — Next → P0 승격)**

- 논리: `MASTER` · `CONTROLLED_UPDATE` · 그룹 **P 공공데이터** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` rev.2.6 8.5
- PK: `vessel_call_id`
- 변경 방식: CONTROLLED_UPDATE — 바뀔 수 있는 열 `vessel_name` · `is_active`(M15 열 가드). 삭제 없음
- migration 의존: raw_input · T-102 사용: DS-03 수집 · DS-02 조회 키
- **사실은 열이 아니다**: 입항 신고 일시 · 선석은 PUBLIC_API 사건(`ARRIVAL_DECLARED` · `LOCATION_REPORTED`)이다

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `vessel_call_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `port_authority_code` | STRING(3) | `varchar(3)` | NOT NULL | — | `varchar({ length: 3 })` | 형식 `^[0-9]{3}$` — 항만청 코드(부산 020) |
| 3 | `call_year` | INTEGER | `integer` | NOT NULL | — | `integer()` | 1990~2999 |
| 4 | `call_seq` | INTEGER | `integer` | NOT NULL | — | `integer()` | 0~999 — 원천은 0 채움 3자리 문자열(`003`). API 응답에서 다시 채운다 |
| 5 | `call_sign` | STRING(10) | `varchar(10)` | NOT NULL | — | `varchar({ length: 10 })` | 형식 `^[A-Z0-9]{1,10}$` |
| 6 | `vessel_name` | STRING(40) | `varchar(40)` | NULL | — | `varchar({ length: 40 })` | 신고마다 바뀔 수 있다(가이드 크기 40) |
| 7 | `first_raw_input_id` | REF(raw_input) | `uuid` | NOT NULL | — | `uuid()` | FK (first_raw_input_id, is_simulated) → raw_input · RESTRICT — 처음 알게 된 원문 |
| 8 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 9 | `registered_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 10 | `is_active` | BOOLEAN | `boolean` | NOT NULL | `true` | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - (first_raw_input_id, is_simulated) → raw_input (raw_input_id, is_simulated)
- **UNIQUE / 부분 유일**:
  - (port_authority_code, call_year, call_seq, call_sign)
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.31 `bl` — 선하증권 **(M14 · T-102)**

- 논리: `MASTER` · `CONTROLLED_UPDATE` · 그룹 **P 공공데이터** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` rev.2.6 8.2
- PK: `bl_id`
- 변경 방식: CONTROLLED_UPDATE — 바뀔 수 있는 열 `carrier_counterparty_id`(M15 열 가드). 삭제 없음
- migration 의존: counterparty · raw_input · T-102 사용: DS-02 수집

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `bl_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `bl_no` | STRING(40) | `varchar(40)` | NOT NULL | — | `varchar({ length: 40 })` | 형식 `^[A-Z0-9-]{1,40}$` |
| 3 | `bl_type` | CODE | `text` | NOT NULL | — | `text()` | IN (MASTER, HOUSE, UNKNOWN) — DS-02 는 MBL/HBL 을 말하지 않는다 → UNKNOWN(rev.2.6) |
| 4 | `parent_bl_id` | REF(bl) | `uuid` | NULL | — | `uuid()` | FK bl · RESTRICT — HOUSE → MASTER |
| 5 | `bl_year` | INTEGER | `integer` | NULL | — | `integer()` | DS-02 에는 없다 |
| 6 | `carrier_counterparty_id` | REF(counterparty) | `uuid` | NULL | — | `uuid()` | FK counterparty · RESTRICT |
| 7 | `first_raw_input_id` | REF(raw_input) | `uuid` | NOT NULL | — | `uuid()` | FK (first_raw_input_id, is_simulated) → raw_input · RESTRICT |
| 8 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 9 | `registered_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **FK(표 수준 · 복합 포함)**:
  - parent_bl_id → bl
  - carrier_counterparty_id → counterparty
  - (first_raw_input_id, is_simulated) → raw_input (raw_input_id, is_simulated)
- **UNIQUE / 부분 유일**:
  - (bl_type, bl_no, bl_year) **NULLS NOT DISTINCT** — L-16 물리 잠정안(rev.2.6)
- **CHECK(컬럼 CHECK 외)**:
  - `bl_type = 'HOUSE' OR parent_bl_id IS NULL` · `parent_bl_id <> bl_id`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.32 `container` — 컨테이너(식별 정보) **(M14 · T-102)**

- 논리: `MASTER` · `CONTROLLED_UPDATE` · 그룹 **P 공공데이터** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` rev.2.6 8.1
- PK: `container_id`
- 변경 방식: CONTROLLED_UPDATE — 바뀔 수 있는 열 `size_type` · `vessel_call_id` · `is_active`(M15 열 가드). 삭제 없음
- migration 의존: vessel_call · raw_input · T-102 사용: DS-02 수집
- 운영자 열(선사 · 목적지 · 화물 설명 · 업무 우선순위)은 **쓰는 Task 에서 더한다**(rev.2.6 — 공공데이터가 채우는 열만 먼저)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `container_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `container_no` | STRING(11) | `varchar(11)` | NOT NULL | — | `varchar({ length: 11 })` | 형식 `^[A-Z]{3}[UJZ][0-9]{7}$`(ISO 6346 모양). 체크 숫자 불일치는 거부하지 않고 사건 신뢰도 LOW |
| 3 | `size_type` | CODE | `text` | NULL | — | `text()` | IN (20DRY, 40DRY, 40HC, 20RF, 40RF, OTHER) — ISO 원래 코드는 `EQUIPMENT_REPORTED` 사건 값 |
| 4 | `vessel_call_id` | REF(vessel_call) | `uuid` | NULL | — | `uuid()` | FK vessel_call · RESTRICT — 처음 등록된 입항 건(이력은 `VESSEL_CALL_LINKED` 사건) |
| 5 | `first_raw_input_id` | REF(raw_input) | `uuid` | NOT NULL | — | `uuid()` | FK (first_raw_input_id, is_simulated) → raw_input · RESTRICT |
| 6 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |
| 7 | `registered_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 8 | `is_active` | BOOLEAN | `boolean` | NOT NULL | `true` | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - vessel_call_id → vessel_call
  - (first_raw_input_id, is_simulated) → raw_input (raw_input_id, is_simulated)
- **UNIQUE / 부분 유일**:
  - (container_no)
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (vessel_call_id) WHERE vessel_call_id IS NOT NULL

### 22.33 `container_bl` — 컨테이너 ↔ B/L **(M14 · T-102)**

- 논리: `MASTER` · 물리 **APPEND_ONLY**(rev.2.6 — 정정은 사건) · 그룹 **P 공공데이터** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` 8.3
- PK: `(container_id, bl_id)`
- 변경 방식: APPEND_ONLY(M15)
- migration 의존: container · bl

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `container_id` | REF(container) | `uuid` | NOT NULL | — | `uuid()` | FK container · RESTRICT |
| 2 | `bl_id` | REF(bl) | `uuid` | NOT NULL | — | `uuid()` | FK bl · RESTRICT |
| 3 | `link_role` | CODE | `text` | NOT NULL | — | `text()` | IN (PRIMARY, CONSOLIDATED) |

- **FK(표 수준 · 복합 포함)**:
  - container_id → container
  - bl_id → bl
- **UNIQUE / 부분 유일**:
  - (container_id) WHERE link_role = 'PRIMARY' — 컨테이너당 PRIMARY 1건까지
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (bl_id)

### 22.34 `external_identifier` — 외부 시스템 식별자 **(M14 · T-102)**

- 논리: `EVIDENCE` · `APPEND_ONLY` · 그룹 **P 공공데이터** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` 8.4
- PK: `external_identifier_id`
- 변경 방식: APPEND_ONLY + 삽입 가드: 다형 소유자(`owner_type`, `owner_id`) 존재(M15)
- migration 의존: event · raw_input

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `external_identifier_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `owner_type` | CODE | `text` | NOT NULL | — | `text()` | IN (BL, CONTAINER, VESSEL_CALL) |
| 3 | `owner_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | 다형 참조 — FK 없음, 삽입 가드가 존재 검사 |
| 4 | `issuing_system` | CODE | `text` | NOT NULL | — | `text()` | IN (KCS, MOF) |
| 5 | `id_type` | CODE | `text` | NOT NULL | — | `text()` | IN (CARGO_MGMT_NO, MANIFEST_NO, MSN) |
| 6 | `id_value` | STRING(40) | `varchar(40)` | NOT NULL | — | `varchar({ length: 40 })` | MSN 은 적하목록 안에서만 유일 → 값 = `<적하목록관리번호>-<MSN>` |
| 7 | `source_event_id` | REF(event) | `uuid` | NULL | — | `uuid()` | FK event · RESTRICT |
| 8 | `source_raw_input_id` | REF(raw_input) | `uuid` | NOT NULL | — | `uuid()` | FK (source_raw_input_id, is_simulated) → raw_input · RESTRICT — rev.2.6 추가(근거 원문) |
| 9 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | rev.2.6 추가 |

- **FK(표 수준 · 복합 포함)**:
  - source_event_id → event
  - (source_raw_input_id, is_simulated) → raw_input (raw_input_id, is_simulated)
- **UNIQUE / 부분 유일**:
  - (issuing_system, id_type, id_value)
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (owner_type, owner_id)

### 22.35 `public_data_fetch` — 공공 API 호출 원장 **(M14 · T-102 — rev.2.6 신설)**

- 논리: `EVIDENCE` · `APPEND_ONLY` · 그룹 **P 공공데이터** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` rev.2.6 8.6
- PK: `fetch_id`
- 변경 방식: APPEND_ONLY · TRUNCATE 금지(M15)
- migration 의존: raw_input · actor
- 무엇을 언제 어떤 조건으로 물었고 무엇이 왔나(실패 포함). **인증키는 어느 열에도 없다**(`request_params` 는 안전한 조회 조건만)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `fetch_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `provider` | CODE | `text` | NOT NULL | — | `text()` | IN (DATA_GO_KR, UNIPASS) |
| 3 | `dataset` | CODE | `text` | NOT NULL | — | `text()` | IN (MOF_VESSEL_CALL, MOF_CONTAINER_MANIFEST) |
| 4 | `operation` | STRING(100) | `varchar(100)` | NOT NULL | — | `varchar({ length: 100 })` | 예: `1192000/VsslEtrynd5/Info5` |
| 5 | `request_params` | JSON | `jsonb` | NOT NULL | — | `jsonb().$type<…>()` | jsonb 객체 — 안전한 조회 조건(키 없음) |
| 6 | `page_no` | INTEGER | `integer` | NOT NULL | — | `integer()` | >= 1 |
| 7 | `mode` | CODE | `text` | NOT NULL | — | `text()` | IN (LIVE, REPLAY) |
| 8 | `requested_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 9 | `received_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | `>= requested_at` |
| 10 | `http_status` | INTEGER | `integer` | NULL | — | `integer()` | — |
| 11 | `result_code` | STRING(20) | `varchar(20)` | NULL | — | `varchar({ length: 20 })` | 정상 봉투 resultCode · 게이트웨이 `GW_<returnReasonCode>` · 전송 실패 종류 |
| 12 | `outcome` | CODE | `text` | NOT NULL | — | `text()` | IN (SUCCESS, NO_DATA, UPSTREAM_ERROR, TRANSPORT_ERROR, PARSE_ERROR) |
| 13 | `total_count` | INTEGER | `integer` | NULL | — | `integer()` | — |
| 14 | `item_count` | INTEGER | `integer` | NULL | — | `integer()` | — |
| 15 | `raw_input_id` | REF(raw_input) | `uuid` | NULL | — | `uuid()` | FK (raw_input_id, is_simulated) → raw_input · RESTRICT · UNIQUE |
| 16 | `requested_by_actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor · RESTRICT — 호출을 일으킨 주체 |
| 17 | `trace_id` | STRING(64) | `varchar(64)` | NULL | — | `varchar({ length: 64 })` | — |
| 18 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | — |

- **FK(표 수준 · 복합 포함)**:
  - (raw_input_id, is_simulated) → raw_input (raw_input_id, is_simulated)
  - requested_by_actor_id → actor
- **UNIQUE / 부분 유일**:
  - (raw_input_id)
- **CHECK(컬럼 CHECK 외)**:
  - `(mode = 'REPLAY') = is_simulated` — 녹화 재생은 시뮬레이션(규칙 9)
  - `(outcome = 'TRANSPORT_ERROR') = (raw_input_id IS NULL AND received_at IS NULL)` — 응답이 왔으면 원문이 있다
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (requested_at)

### 22.36 `agent_run` — Agent 실행(범위 = 계획 실행 하나) **(M16 · T-103 · ADR-036 · M18/M19 T-104 생애주기)**

- 논리: `OPERATIONAL_RECORD` · 한 번 전이 · 그룹 **A Agent 실행 기록** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` rev.2.7
- PK: `agent_run_id`
- 변경 방식(M19): 생애주기 `CREATED → RUNNING → WAITING_HUMAN · WAITING_EXTERNAL · WAITING_RUNTIME → RUNNING → … → COMPLETED · FAILED · CANCELLED`(WAITING_RUNTIME = Runtime 일시 장애 뒤 재시도 대기). 끝난 실행은 바뀌지 않는다. 삽입은 `CREATED` 만. 바뀔 수 있는 열 `status` · `finished_at` · `current_node` · `waiting_reason` · `pending_ref_type` · `pending_ref_id` · `last_error_code` · `updated_at` · `runtime_attempts` · `next_attempt_at` · `result_summary`. 삭제 없음. M18 이 옛 값 `ACTIVE` → `CANCELLED`(`last_error_code = LEGACY_RUN_CLOSED_BY_M18`) · `FINISHED` → `COMPLETED` 로 옮겼다
- 상태 전이는 **Backend Coordinator 만** 한다. Python Runtime 은 결과(`agent-runtime/1`)를 돌려줄 뿐 상태를 쓰지 않는다
- 삽입 가드(M17): `agent_actor_id` 는 AI_AGENT, `created_by_actor_id` 는 HUMAN 또는 SYSTEM — **Agent 가 자기 실행 · 범위를 만들지 못한다**
- **업무 사실이 아니다** — 실행 기록이다(checkpoint 도 아니다, ADR-036 결정 2)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `agent_run_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `recovery_run_id` | REF(recovery_run) | `uuid` | NOT NULL | — | `uuid()` | FK recovery_run · RESTRICT — 모든 Tool 호출의 범위 |
| 3 | `goal` | STRING(300) | `varchar(300)` | NOT NULL | — | `varchar({ length: 300 })` | 사람이 준 목표 |
| 4 | `status` | CODE | `text` | NOT NULL | — | `text()` | IN (CREATED, RUNNING, WAITING_HUMAN, WAITING_EXTERNAL, WAITING_RUNTIME, COMPLETED, FAILED, CANCELLED) |
| 5 | `created_by_actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor · RESTRICT — HUMAN · SYSTEM(M17) |
| 6 | `agent_actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor · RESTRICT — AI_AGENT(M17). Tool 호출의 행위자 |
| 7 | `runtime_version` | STRING(40) | `varchar(40)` | NULL | — | `varchar({ length: 40 })` | — |
| 8 | `trace_id` | STRING(64) | `varchar(64)` | NULL | — | `varchar({ length: 64 })` | — |
| 9 | `started_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 10 | `finished_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | 끝난 상태(COMPLETED · FAILED · CANCELLED) ⇔ 값 있음 |
| 11 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | = 계획 실행의 `contains_simulated` |
| 12 | `parameters` | JSON | `jsonb` | NULL | — | `jsonb()` | 객체(M18). **사람이** 실행을 만들 때 준 값(예: 문의 수량 · 시간창) — Agent 가 숫자를 지어내지 않는다 |
| 13 | `current_node` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | 관측용 — 마지막으로 끝난 그래프 노드 |
| 14 | `waiting_reason` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | WAITING_* 상태 ⇔ 값 있음(예: HUMAN_APPROVAL_REQUIRED · AWAITING_REPLIES) |
| 15 | `pending_ref_type` | STRING(40) | `varchar(40)` | NULL | — | `varchar({ length: 40 })` | `pending_ref_id` 와 함께 — 재개를 기다리는 업무 기록 종류(COMM_MESSAGE) |
| 16 | `pending_ref_id` | STRING(40) | `uuid` | NULL | — | `uuid()` | 다형 참조 — FK 없음. 승인 결정 신호가 이것으로 실행을 찾는다 |
| 17 | `last_error_code` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | FAILED · CANCELLED 사유 코드(값만, 메시지 · 비밀값 없음) |
| 18 | `updated_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | 마지막 상태 변경 시각 |
| 19 | `runtime_attempts` | INTEGER | `integer` | NOT NULL | `0` | `integer().default(0)` | >= 0 · Runtime 일시 장애의 연속 실패 횟수(성공하면 0) |
| 20 | `next_attempt_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | status = WAITING_RUNTIME ⇔ 값 있음 — 재조정이 이 시각 뒤에 다시 시도 |
| 21 | `result_summary` | JSON | `jsonb` | NULL | — | `jsonb()` | 객체 · 끝난 실행의 요약(코드 · id · 개수만 — 업무 값 · 원문 없음) |

- **FK(표 수준 · 복합 포함)**:
  - recovery_run_id → recovery_run
  - created_by_actor_id → actor
  - agent_actor_id → actor
- **UNIQUE / 부분 유일**: —
- **CHECK(컬럼 CHECK 외)**:
  - 끝남 모양 `(status IN 끝난 상태) = (finished_at IS NOT NULL)` · 대기 모양 `(status IN WAITING_*) = (waiting_reason IS NOT NULL)` · 재시도 모양 `(status = 'WAITING_RUNTIME') = (next_attempt_at IS NOT NULL)` · `runtime_attempts >= 0` · 대기 참조 쌍 · `parameters` · `result_summary` 객체 · `finished_at >= started_at`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (recovery_run_id)
  - (pending_ref_type, pending_ref_id) WHERE pending_ref_id IS NOT NULL — 신호 → 기다리는 실행

### 22.37 `agent_tool_call` — Tool 호출 하나 **(M16 · T-103)**

- 논리: `OPERATIONAL_RECORD` · 한 번 전이 · 그룹 **A Agent 실행 기록** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` rev.2.7
- PK: `tool_call_id`
- 변경 방식: STARTED → SUCCEEDED · FAILED · REJECTED 한 번(M17). 바뀔 수 있는 열은 결과 열뿐. 삭제 없음. 삽입은 CREATED · RUNNING 실행에만(M19), STARTED 또는 REJECTED(실행 전 거부)
- **입력 · 출력은 지문만**(JCS SHA-256). 메일 원문 · 공공 API 원문 · 비밀값을 복제하지 않는다. 결과가 업무 기록이면 그 id(`result_ref_*`)만

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `tool_call_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `agent_run_id` | REF(agent_run) | `uuid` | NOT NULL | — | `uuid()` | FK agent_run · RESTRICT |
| 3 | `tool_name` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | 형식 `^[a-z][a-z0-9_]{1,59}$` — Tool Registry 이름 |
| 4 | `tool_version` | STRING(10) | `varchar(10)` | NOT NULL | — | `varchar({ length: 10 })` | — |
| 5 | `category` | CODE | `text` | NOT NULL | — | `text()` | IN (READ, EXTERNAL_READ, COMPUTE, PROPOSE, REQUEST) — COMMIT 없음 |
| 6 | `status` | CODE | `text` | NOT NULL | — | `text()` | IN (STARTED, SUCCEEDED, FAILED, REJECTED) |
| 7 | `idempotency_key` | STRING(100) | `varchar(100)` | NULL | — | `varchar({ length: 100 })` | 형식 `^[A-Za-z0-9._:-]{1,100}$` — PROPOSE · REQUEST 필수 |
| 8 | `input_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · 입력 JCS 지문 |
| 9 | `output_hash` | HASH | `varchar(71)` | NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · 출력(부작용 Tool 은 결과 참조) 지문 |
| 10 | `result_ref_type` | STRING(40) | `varchar(40)` | NULL | — | `varchar({ length: 40 })` | `result_ref_id` 와 함께 |
| 11 | `result_ref_id` | STRING(40) | `uuid` | NULL | — | `uuid()` | 다형 참조(예: COMM_MESSAGE) — FK 없음 |
| 12 | `error_code` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | 상태가 FAILED · REJECTED 일 때만 값이 있다 |
| 13 | `started_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 14 | `finished_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | `(status = STARTED) = (finished_at IS NULL AND duration_ms IS NULL)` |
| 15 | `duration_ms` | INTEGER | `integer` | NULL | — | `integer()` | >= 0 |
| 16 | `request_id` | STRING(64) | `varchar(64)` | NULL | — | `varchar({ length: 64 })` | — |
| 17 | `trace_id` | STRING(64) | `varchar(64)` | NULL | — | `varchar({ length: 64 })` | — |

- **FK(표 수준 · 복합 포함)**:
  - agent_run_id → agent_run
- **UNIQUE / 부분 유일**:
  - (agent_run_id, tool_name, idempotency_key) WHERE idempotency_key IS NOT NULL AND status IN ('STARTED', 'SUCCEEDED') — 재시도가 부작용을 두 번 만들지 않는다(실패 · 거부 뒤 재시도는 가능)
- **CHECK(컬럼 CHECK 외)**:
  - 끝남 모양 · 오류 모양 · 결과 참조 쌍 · `duration_ms >= 0`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (agent_run_id, started_at)

### 22.38 `agent_step` — 그래프 단계 하나(관측) **(M18 · T-104)**

- 논리: `OPERATIONAL_RECORD` · append-only · 그룹 **A Agent 실행 기록** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` rev.2.8
- PK: `step_id`
- 변경 방식: 삽입만(M19 append-only). Coordinator 가 START · RESUME · INTERRUPT · TERMINAL 을, Runtime API 가 NODE 를 적는다(NODE 는 RUNNING 실행에만)
- **입력 · 출력 · 프롬프트 · 비밀값은 없다** — 노드 이름 · 결과 코드 · Tool 호출 id · 시간뿐

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `step_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `agent_run_id` | REF(agent_run) | `uuid` | NOT NULL | — | `uuid()` | FK agent_run · RESTRICT |
| 3 | `seq` | INTEGER | `integer` | NOT NULL | — | `integer()` | >= 1 · 실행 안에서 유일(실행 행 잠금 아래 max + 1) |
| 4 | `kind` | CODE | `text` | NOT NULL | — | `text()` | IN (START, NODE, INTERRUPT, RESUME, TERMINAL) |
| 5 | `node` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | 형식 `^[a-z][a-z0-9_]{0,59}$` · kind = NODE ⇔ 값 있음 |
| 6 | `outcome` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | 형식 `^[A-Z][A-Z0-9_]{0,59}$` — SUCCEEDED · 오류 코드 · 상태 |
| 7 | `detail_code` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | 같은 형식 — 고른 행동 · 승인 결과 |
| 8 | `tool_call_id` | REF(agent_tool_call) | `uuid` | NULL | — | `uuid()` | FK agent_tool_call · RESTRICT — 이 단계의 마지막 Tool 호출 |
| 9 | `retry_count` | INTEGER | `integer` | NOT NULL | `0` | `integer().default(0)` | >= 0 |
| 10 | `started_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 11 | `finished_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | >= started_at |
| 12 | `duration_ms` | INTEGER | `integer` | NOT NULL | — | `integer()` | >= 0 |
| 13 | `trace_id` | STRING(64) | `varchar(64)` | NULL | — | `varchar({ length: 64 })` | — |

- **FK(표 수준 · 복합 포함)**:
  - agent_run_id → agent_run
  - tool_call_id → agent_tool_call
- **UNIQUE / 부분 유일**:
  - (agent_run_id, seq)
- **CHECK(컬럼 CHECK 외)**:
  - 노드 모양 `(kind = 'NODE') = (node IS NOT NULL)` · `finished_at >= started_at`
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.39 `agent_checkpoint` — LangGraph checkpoint 하나 **(M18 · T-104 · ADR-036 결정 2)**

- 논리: `OPERATIONAL_RECORD` · append-only · 그룹 **A Agent 실행 기록** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` rev.2.8
- PK: `checkpoint_row_id`
- 변경 방식: 삽입만(M19). RUNNING 실행에만 삽입. 같은 (실행, ns, checkpoint_id) 재전송은 같은 행을 돌려준다(멱등)
- **실행 상태이지 업무 사실이 아니다.** 본문(직렬화된 그래프 상태 — id · 참조 · 코드뿐)은 내용 저장소에 두고 행에는 참조 + 지문만. Python 은 DB 자격증명 없이 `/internal/agent-runtime` 으로만 쓴다

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `checkpoint_row_id` | STRING(40) | `uuid` | NOT NULL | — | `uuid()` | — |
| 2 | `agent_run_id` | REF(agent_run) | `uuid` | NOT NULL | — | `uuid()` | FK agent_run · RESTRICT — LangGraph thread_id |
| 3 | `checkpoint_ns` | STRING(200) | `varchar(200)` | NOT NULL | `''` | `varchar({ length: 200 }).default('')` | 하위 그래프 이름공간(지금은 빈 값뿐) |
| 4 | `checkpoint_id` | STRING(64) | `varchar(64)` | NOT NULL | — | `varchar({ length: 64 })` | 형식 `^[A-Za-z0-9._:-]{1,64}$` — LangGraph 가 만든 정렬 가능 id |
| 5 | `parent_checkpoint_id` | STRING(64) | `varchar(64)` | NULL | — | `varchar({ length: 64 })` | 같은 형식 |
| 6 | `content_ref` | STRING(300) | `varchar(300)` | NOT NULL | — | `varchar({ length: 300 })` | 내용 참조 형식 `cref:v1:AGENT_CHECKPOINT:<uuid>` |
| 7 | `content_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · 읽을 때 다시 계산해 대조 |
| 8 | `meta_source` | STRING(20) | `varchar(20)` | NULL | — | `varchar({ length: 20 })` | LangGraph metadata.source(input · loop · update) |
| 9 | `meta_step` | INTEGER | `integer` | NULL | — | `integer()` | LangGraph metadata.step |
| 10 | `created_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **FK(표 수준 · 복합 포함)**:
  - agent_run_id → agent_run
- **UNIQUE / 부분 유일**:
  - (agent_run_id, checkpoint_ns, checkpoint_id)
- **CHECK(컬럼 CHECK 외)**: —
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: —

### 22.40 `agent_checkpoint_write` — checkpoint 의 대기 쓰기(pending writes) **(M18 · T-104)**

- 논리: `OPERATIONAL_RECORD` · 거의 append-only · 그룹 **A Agent 실행 기록** · Drizzle 분류 **DRIZZLE_PLUS_SQL** · `docs/22` rev.2.8
- PK: (`agent_run_id`, `checkpoint_ns`, `checkpoint_id`, `task_id`, `write_idx`)
- 변경 방식: 삽입(RUNNING 실행에만). 삭제 없음. **갱신은 특수 쓰기(`write_idx < 0` — 오류 · interrupt · resume)만**, 값 열만(M19). 일반 쓰기(`write_idx >= 0`) 재전송은 무시(LangGraph 규약)
- 값은 직렬화된 작은 값(노드 반환 · interrupt 값 · resume 사유)뿐 — 업무 행 · 원문 · 비밀값 없음

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `agent_run_id` | REF(agent_run) | `uuid` | NOT NULL | — | `uuid()` | FK agent_run · RESTRICT |
| 2 | `checkpoint_ns` | STRING(200) | `varchar(200)` | NOT NULL | `''` | `varchar({ length: 200 }).default('')` | — |
| 3 | `checkpoint_id` | STRING(64) | `varchar(64)` | NOT NULL | — | `varchar({ length: 64 })` | — |
| 4 | `task_id` | STRING(64) | `varchar(64)` | NOT NULL | — | `varchar({ length: 64 })` | — |
| 5 | `write_idx` | INTEGER | `integer` | NOT NULL | — | `integer()` | 음수 = 특수 쓰기(덮어쓰기 허용) |
| 6 | `task_path` | STRING(300) | `varchar(300)` | NOT NULL | `''` | `varchar({ length: 300 }).default('')` | — |
| 7 | `channel` | STRING(200) | `varchar(200)` | NOT NULL | — | `varchar({ length: 200 })` | 상태 채널 이름 · `__interrupt__` · `__resume__` |
| 8 | `value_type` | STRING(40) | `varchar(40)` | NOT NULL | — | `varchar({ length: 40 })` | 직렬화 형식(serde type) |
| 9 | `value_b64` | TEXT | `text` | NOT NULL | — | `text()` | base64 · 길이 <= 262144 |
| 10 | `value_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` |
| 11 | `created_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **FK(표 수준 · 복합 포함)**:
  - agent_run_id → agent_run
- **UNIQUE / 부분 유일**: — (PK 가 쓰기 하나의 신원)
- **CHECK(컬럼 CHECK 외)**:
  - base64 형식 · 크기 상한
- **인덱스(PK·UNIQUE·FK 인덱스 외)**:
  - (agent_run_id, checkpoint_ns, checkpoint_id)

### 22.41 M20 사실 파이프라인 가드 **(T-093 · 표 · 열 변경 없음)**

- 파일: `back/drizzle/migrations/0019_m20_fact_guards.sql`(사람이 쓴 custom migration, 함수 3 · 트리거 3 — 함수 25 → 28, `now()` 호출 없음)
- `tg_event__guard_authority` BEFORE INSERT ON `event`: `source_type = HUMAN_UI` 이거나 `event_class = VERIFICATION` 이면 `entered_by_actor_id` 의 `actor_type` 이 `HUMAN` 이어야 한다(CE005). `extraction_method = LLM_EXTRACTED` 는 `OBSERVATION` 만
- `tg_extraction__guard_accept` BEFORE UPDATE ON `extraction`: `ACCEPTED` 로 가는 후보의 `created_event_id` 는 LLM 추출 `OBSERVATION` 이어야 한다
- `tg_canonical_fact__guard_confirmed` BEFORE INSERT OR UPDATE ON `canonical_fact`: `value_status = CONFIRMED` 이면 `verification_basis` 가 `HUMAN_VERIFICATION`(같은 좌표 · 같은 값의 HUMAN_UI 사건 또는 사람의 CONFIRM 이 가리킨 사건 필요) 또는 `AUTHORITATIVE_SYSTEM`(PARTNER_SYSTEM 사건 필요). `POLICY_EVIDENCE` 는 정책이 비어 있어 거부
- 앱 역할 권한은 M10 그대로

### 22.42 M21 철회 가드 **(T-111 · 표 · 열 변경 없음)**

- 파일: `back/drizzle/migrations/0020_m21_withdrawal_guard.sql`(함수 1 · 트리거 1 — 함수 28 → 29, `now()` 없음)
- `tg_event__guard_withdrawal` BEFORE INSERT ON `event`: 값이 하나도 없는 CORRECTION(철회)은 `source_type = HUMAN_UI` 여야 한다(CE005) — M20 과 합쳐 사람 행위자만 철회한다

### 22.43 `recovery_plan` — 복구 계획 판(Solver 실행 하나) **(M22 · T-114)**

- 논리: `DECISION_RECORD`(후보 계획) · 상태 열만 바뀜 · 그룹 **P 계획** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `plan_id`. 판 번호는 계획 실행(`case_run_id`) 안에서 1, 2, 3 …(UNIQUE). 지금 쓰이는 판(PROPOSED · APPROVED)은 계획 실행마다 하나(부분 유일)
- 변경 방식: 삽입(PROPOSED · INFEASIBLE 로만). 갱신은 상태 · 무효 사유 · 무효 시각 · 밀어낸 판 · 승인자 · 승인 시각 · 갱신 시각만(M23). 삭제 없음
- 숫자(목적값 · base · 위험 벌점 · Baseline · 절감)는 결정론 Cost Engine · Solver 출력이다(ADR-029). 입력 스냅숏(쓴 사실 id · 상태 · as_of · 정책 판)은 `planning_snapshot.scope_ref`
- 승인은 사람(HUMAN)만 · 본 판의 `plan_hash` 로. 승인은 실행 지시가 아니다(배차 · 발송 없음)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `plan_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | PK |
| 2 | `case_run_id` | REF(recovery_run) | `uuid` | NOT NULL | — | `uuid()` | FK recovery_run · RESTRICT — 사람 · Agent 가 다루는 계획 실행 |
| 3 | `snapshot_id` | REF(planning_snapshot) | `uuid` | NOT NULL | — | `uuid()` | FK planning_snapshot(+contains_simulated 복합) — 이 판의 입력 스냅숏 |
| 4 | `version` | INTEGER | `integer` | NOT NULL | — | `integer()` | >= 1 |
| 5 | `plan_status` | CODE | `text` | NOT NULL | — | `text()` | IN (PROPOSED, APPROVED, SUPERSEDED, OUTDATED, INFEASIBLE) |
| 6 | `solver_status` | CODE | `text` | NOT NULL | — | `text()` | IN (OPTIMAL, FEASIBLE, INFEASIBLE, TIME_LIMIT, ERROR) |
| 7 | `solver_version` | STRING(40) | `varchar(40)` | NOT NULL | — | `varchar({ length: 40 })` | 예: `recovery-solver/1` |
| 8 | `input_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` — Solver 입력 지문 |
| 9 | `plan_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` — 승인이 인용하는 판 지문 |
| 10 | `objective_krw` | BIGINT | `bigint` | NULL | — | `bigint({ mode: 'bigint' })` | 총 예상 손실(base + 위험 벌점). 해가 있을 때만 |
| 11 | `base_cost_krw` | BIGINT | `bigint` | NULL | — | `bigint({ mode: 'bigint' })` | 실제로 내는 돈 합 |
| 12 | `risk_penalty_krw` | BIGINT | `bigint` | NULL | — | `bigint({ mode: 'bigint' })` | 정책 벌점 합 [ASSUMPTION] |
| 13 | `baseline_total_krw` | BIGINT | `bigint` | NOT NULL | — | `bigint({ mode: 'bigint' })` | Baseline(같은 엔진 · 규칙) |
| 14 | `baseline_base_cost_krw` | BIGINT | `bigint` | NOT NULL | — | `bigint({ mode: 'bigint' })` | — |
| 15 | `saving_krw` | BIGINT | `bigint` | NULL | — | `bigint({ mode: 'bigint' })` | Baseline − 목적값(음수 가능, 시뮬레이션 기준) |
| 16 | `base_saving_krw` | BIGINT | `bigint` | NULL | — | `bigint({ mode: 'bigint' })` | — |
| 17 | `candidate_count` | INTEGER | `integer` | NOT NULL | — | `integer()` | >= 0 |
| 18 | `result` | JSON | `jsonb` | NOT NULL | — | `jsonb().$type<…>()` | jsonb 객체. Baseline 배정 · 제약 · 자원 사용 · 계획 불가 이유 · 경고 · 가정 · 시간 |
| 19 | `cost_ms` | INTEGER | `integer` | NOT NULL | — | `integer()` | >= 0 |
| 20 | `solve_ms` | INTEGER | `integer` | NOT NULL | — | `integer()` | >= 0 |
| 21 | `outdated_reasons` | JSON | `jsonb` | NULL | — | `jsonb().$type<…>()` | jsonb 배열. 바뀐 사실(코드 · 주체 · 키 · 전후) |
| 22 | `outdated_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | outdated_reasons 와 함께 |
| 23 | `superseded_by_plan_id` | REF(recovery_plan) | `uuid` | NULL | — | `uuid()` | FK recovery_plan(자기) · DEFERRABLE · SUPERSEDED 와 함께 |
| 24 | `approved_by_actor_id` | REF(actor) | `uuid` | NULL | — | `uuid()` | FK actor · HUMAN 만(M23) |
| 25 | `approved_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | 승인자와 함께 |
| 26 | `created_by_actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor — 사람(재계산) · AI_AGENT(제안 Tool) |
| 27 | `agent_run_id` | REF(agent_run) | `uuid` | NULL | — | `uuid()` | FK agent_run — Agent 가 제안했으면 |
| 28 | `contains_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | 입력에 시뮬레이션 값 포함(규칙 9) |
| 29 | `scenario_id` | REF(scenario) | `uuid` | NULL | — | `uuid()` | FK scenario · contains_simulated 일 때만 |
| 30 | `created_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 31 | `updated_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **FK(표 수준 · 복합 포함)**:
  - case_run_id → recovery_run
  - (snapshot_id, contains_simulated) → planning_snapshot(snapshot_id, contains_simulated)
  - superseded_by_plan_id → recovery_plan(DEFERRABLE INITIALLY DEFERRED — 새 판을 넣는 트랜잭션이 옛 판을 먼저 밀어낸다)
  - approved_by_actor_id · created_by_actor_id → actor · agent_run_id → agent_run · scenario_id → scenario
- **UNIQUE / 부분 유일**: (case_run_id, version) · `uq_recovery_plan__case_run_id__current` (case_run_id) WHERE plan_status IN ('PROPOSED','APPROVED')
- **CHECK(컬럼 CHECK 외)**: 해가 있으면(OPTIMAL · FEASIBLE · TIME_LIMIT) 목적값 있음 · INFEASIBLE 판은 목적값 없음 · PROPOSED/APPROVED 는 목적값 있음 · 금액 >= 0(절감 제외) · 승인자 ↔ 승인 시각 · APPROVED ⇒ 승인자 · 무효 시각 ↔ 사유 · SUPERSEDED ↔ 밀어낸 판 · 시나리오 ⇒ 시뮬레이션
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: (snapshot_id) · (agent_run_id)

### 22.44 `recovery_plan_item` — 판의 컨테이너 배정 하나 **(M22 · T-114)**

- 논리: `DECISION_RECORD` · append-only · 그룹 **P 계획** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: (`plan_id`, `container_ref`). 컨테이너는 아직 저장소 표가 없다(시나리오 데이터 팩의 합성 id) — 참조 문자열
- 비용 항목(금액 · 수량 · 단가 · 출처 · 가정) · 이유 코드 · 대안 · 근거 · 경고는 엔진 출력 그대로 `detail`

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `plan_id` | REF(recovery_plan) | `uuid` | NOT NULL | — | `uuid()` | FK recovery_plan · RESTRICT |
| 2 | `container_ref` | STRING(40) | `varchar(40)` | NOT NULL | — | `varchar({ length: 40 })` | 합성 컨테이너 id |
| 3 | `action` | CODE | `text` | NOT NULL | — | `text()` | IN (KEEP_CURRENT_PLAN, MOVE_TO_WAREHOUSE, MOVE_TO_ODCY, WAIT_AT_TERMINAL) |
| 4 | `target_ref` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | 오늘 가는 곳(시설 id · 터미널) |
| 5 | `destination_ref` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | 최종 창고 |
| 6 | `delivery_day` | DATE | `date` | NOT NULL | — | `date({ mode: 'string' })` | 창고 입고일(Asia/Seoul) |
| 7 | `scheduled_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | 오늘 출발 시각(대기면 없음) |
| 8 | `truck_ref` | STRING(120) | `varchar(120)` | NULL | — | `varchar({ length: 120 })` | 자사 트럭 id · 협력 가용 트럭 표시 |
| 9 | `base_cost_krw` | BIGINT | `bigint` | NOT NULL | — | `bigint({ mode: 'bigint' })` | >= 0 |
| 10 | `risk_penalty_krw` | BIGINT | `bigint` | NOT NULL | — | `bigint({ mode: 'bigint' })` | >= 0 |
| 11 | `total_krw` | BIGINT | `bigint` | NOT NULL | — | `bigint({ mode: 'bigint' })` | = base + 위험 벌점 |
| 12 | `detail` | JSON | `jsonb` | NOT NULL | — | `jsonb().$type<…>()` | jsonb 객체. 비용 항목 · 이유 코드 · 대안 · 근거 · 경고 · 가정 |

- **FK(표 수준)**: plan_id → recovery_plan
- **CHECK(컬럼 CHECK 외)**: 금액 >= 0 · total = base + risk
- **인덱스**: — (PK 가 판 단위 조회를 덮는다)

### 22.45 M23 복구 계획 가드 · 권한 **(T-114)**

- 파일: `back/drizzle/migrations/0022_m23_recovery_plan_guards.sql`(함수 1 · 트리거 6 — 함수 29 → 30, `now()` 없음). 표 · 열은 M22(`0021_m22_recovery_plan.sql`, drizzle-kit 생성 · 검토)
- `tg_recovery_plan__guard`: 삽입은 PROPOSED · INFEASIBLE 만, 전이 PROPOSED → APPROVED · SUPERSEDED · OUTDATED / APPROVED → SUPERSEDED · OUTDATED / OUTDATED → SUPERSEDED / INFEASIBLE → SUPERSEDED · OUTDATED(CE004). 승인자는 한 번 · APPROVED 로 갈 때만(CE003) · HUMAN 만(CE005)
- `tg_recovery_plan__guard_columns`: 위 상태 열 밖은 불변(CE002) · `tg_recovery_plan__no_delete` · `no_truncate`
- `tg_recovery_plan_item__append_only` · `no_truncate`
- 앱 역할: recovery_plan SELECT · INSERT · UPDATE / recovery_plan_item SELECT · INSERT
- `fk_recovery_plan__superseded_by_plan_id` 를 DEFERRABLE INITIALLY DEFERRED 로 바꾼다

---

### 22.46 `user_account` — 사람 로그인 계정 **(M24 · T-119)**

- 논리: `MASTER`(사람 행위자의 로그인 수단) · 그룹 **A 기반** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `user_id`. 계정 하나 = HUMAN actor 하나(UNIQUE actor_id) — 승인 · 확인 · 감사가 가리키는 주체는 여전히 `actor` 다. AI_AGENT · SYSTEM 은 계정을 가질 수 없다(M25 트리거)
- 변경 방식: 삽입 · 역할 · 비밀번호 해시 · 활성 · 갱신 시각만 갱신(M25). 삭제 없음(비활성으로 끈다)
- 비밀번호는 scrypt 해시만(`back/src/auth/password.ts`). 평문 · 되돌릴 수 있는 값은 저장하지 않는다

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `user_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | PK |
| 2 | `actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor · RESTRICT · UNIQUE · HUMAN 만(M25) |
| 3 | `login_id` | STRING(60) | `varchar(60)` | NOT NULL | — | `varchar({ length: 60 })` | UNIQUE · 소문자 `^[a-z0-9][a-z0-9._@-]{2,59}$` |
| 4 | `role` | CODE | `text` | NOT NULL | — | `text()` | IN (ADMIN, OPERATOR, FIELD_OPERATOR) — 권한 표 `back/src/auth/permissions.ts` |
| 5 | `password_hash` | STRING(200) | `varchar(200)` | NOT NULL | — | `varchar({ length: 200 })` | 형식 `scrypt$N$r$p$salt$hash` |
| 6 | `is_active` | BOOLEAN | `boolean` | NOT NULL | `true` | `boolean().default(true)` | 끄면 로그인 · 세션 불가 |
| 7 | `created_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 8 | `updated_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | >= created_at |

- **UNIQUE**: (actor_id) · (login_id)

### 22.47 `user_session` — 로그인 세션 **(M24 · T-119)**

- 논리: `TECHNICAL`(인증 상태 — 업무 사실 아님) · 그룹 **A 기반** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `session_id`. 토큰은 32바이트 난수 — 브라우저에는 HttpOnly · SameSite=Strict 쿠키로만, DB 에는 sha256 지문만(DB 를 읽어도 세션을 쓸 수 없다, 서명 비밀키 불필요)
- 변경 방식: 삽입 · 끊기(revoked_at NULL → 값) 한 번만(M25). 삭제 없음. 로그아웃 · 역할/활성/비밀번호 변경이 끊는다

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `session_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | PK |
| 2 | `user_id` | REF(user_account) | `uuid` | NOT NULL | — | `uuid()` | FK user_account · RESTRICT |
| 3 | `token_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · UNIQUE |
| 4 | `created_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |
| 5 | `expires_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | > created_at (CERA_SESSION_TTL_MINUTES) |
| 6 | `revoked_at` | TIMESTAMP_TZ | `timestamptz(3)` | NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | >= created_at · 한 번만 채움 |

- **UNIQUE**: (token_hash)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: (user_id)

### 22.48 M25 로그인 가드 · 권한 **(T-119)**

- `user_account`: 삽입 시 actor 가 HUMAN 인지(CE005) · 열 가드(역할 · 비밀번호 해시 · 활성 · 갱신 시각만) · 삭제 · TRUNCATE 금지
- `user_session`: 갱신은 끊기 한 번만(CE003) · 열 가드(revoked_at 만) · 삭제 · TRUNCATE 금지
- 권한: cera_app = 두 표 모두 SELECT · INSERT · UPDATE

### 22.49 `plan_follow_up` — 승인된 계획의 후속 문의 연결 **(M26 · T-116)**

- 논리: `DECISION_RECORD`(이 판의 이 조치로 이 초안을 만들었다) · 그룹 **P 계획** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `follow_up_id`. 판 안에서 조치 키 하나 = 초안 하나(UNIQUE) · 초안 하나는 한 조치에만(UNIQUE message_id)
- 변경 방식: append-only(M27). 초안의 승인 · 발송 가능 여부는 이 행이 아니라 판의 지금 상태로 매번 판정한다 — 판이 APPROVED 가 아니면 PLAN_SUPERSEDED
- 계획 승인 ≠ 실행 · 발송. 초안은 사람이 요청할 때만 만들고, 초안마다 사람 승인 · 발송 요청을 거친다

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `follow_up_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | PK |
| 2 | `plan_id` | REF(recovery_plan) | `uuid` | NOT NULL | — | `uuid()` | FK recovery_plan · RESTRICT |
| 3 | `action_key` | STRING(120) | `varchar(120)` | NOT NULL | — | `varchar({ length: 120 })` | 결정론 조치 키(`ODCY_RECEIVE:<시설>:<날짜>` · `PARTNER_TRUCKS:<풀>:<날짜>:<시간창>`) |
| 4 | `message_id` | REF(comm_message) | `uuid` | NOT NULL | — | `uuid()` | FK comm_message · RESTRICT · UNIQUE |
| 5 | `created_by_actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor — 요청한 사람 |
| 6 | `created_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **UNIQUE**: (plan_id, action_key) · (message_id)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: (plan_id)

### 22.50 M27 계획 후속 문의 가드 · 권한 **(T-116)**

- `plan_follow_up`: 갱신 · 삭제 · TRUNCATE 금지(append-only). 권한: cera_app = SELECT · INSERT

### 22.51 `extraction_retry_request` — 사람이 요청한 회신 추출 재시도 **(M28 · T-124)**

- 논리: `DECISION_RECORD`(누가 언제 이 회신을 다시 읽게 했다) · 그룹 **C 통신** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- PK: `retry_request_id`. 사람 × 명령 id 하나 = 요청 하나(UNIQUE — 두 번 누름 · 네트워크 재시도가 같은 요청으로 모인다)
- 변경 방식: append-only(M29). 요청 하나 = 시도 하나. 시도의 결과는 이 행이 아니라 기존 기록이다(실패 = `system_error` · `operation_name = extractReplyRetry`, 완료 = `audit_log` `EXTRACTION_*` · `extraction` 행). 이전 시도의 기록은 지우거나 고치지 않는다
- 자동 재시도 한도(`CERA_EXTRACTION_MAX_ATTEMPTS`)는 되돌리지 않는다 — 자동 시도의 실패만 센다

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `retry_request_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | PK |
| 2 | `message_id` | REF(comm_message) | `uuid` | NOT NULL | — | `uuid()` | FK comm_message · RESTRICT — 다시 읽을 INBOUND 회신 |
| 3 | `command_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | 멱등 키(요청한 사람 안에서 UNIQUE) |
| 4 | `requested_by_actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor — 활성 HUMAN(권한 `extraction.retry`) |
| 5 | `requested_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | 이 시각 뒤의 첫 실패 · 완료가 이 요청의 시도다 |
| 6 | `prior_state` | CODE | `text` | NOT NULL | — | `text()` | IN (FAILED, NO_CANDIDATE, DONE) — 무엇을 보고 다시 시켰나 |
| 7 | `prior_failed_attempts` | INTEGER | `integer` | NOT NULL | — | `integer()` | CHECK ≥ 0 |
| 8 | `note` | STRING(200) | `varchar(200)` | NULL | — | `varchar({ length: 200 })` | CHECK 비었으면 NULL |
| 9 | `is_simulated` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | 회신의 Mock/Real 구분 |

- **UNIQUE**: (requested_by_actor_id, command_id)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: (message_id, requested_at)

### 22.52 M29 회신 추출 재시도 가드 · 권한 **(T-124)**

- `extraction_retry_request`: 갱신 · 삭제 · TRUNCATE 금지(append-only). 권한: cera_app = SELECT · INSERT

### 22.53 `planning_input_batch` — 실제 계획 입력 묶음 **(M30 · T-123)**

- 논리: `DECISION_RECORD`(누가 언제 어떤 운영 기록 묶음을 넣었나) · 그룹 **P 계획** · Drizzle 분류 **DRIZZLE_PLUS_SQL**
- 한 묶음 = 한 트랜잭션: 오류 행이 하나라도 있으면 묶음도 행도 저장하지 않는다(검증만 `dry_run` 은 저장 없음). 사람 × 명령 id = 묶음 하나(멱등)
- 파일 원본 · 파일 이름은 저장하지 않는다 — 정규화한 행의 지문(`content_hash`)과 행 수만

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `batch_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | PK |
| 2 | `input_kind` | CODE | `text` | NOT NULL | — | `text()` | IN (CONTAINERS, RATES, FACILITY_PROFILES) |
| 3 | `recovery_run_id` | REF(recovery_run) | `uuid` | NULL | — | `uuid()` | FK recovery_run · CONTAINERS 만 있다(CHECK) |
| 4 | `command_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | 멱등 키(요청한 사람 안에서 UNIQUE) |
| 5 | `submitted_by_actor_id` | REF(actor) | `uuid` | NOT NULL | — | `uuid()` | FK actor — 활성 HUMAN(권한 `planning.input`) |
| 6 | `source_type` | CODE | `text` | NOT NULL | — | `text()` | IN (CSV, ROWS) |
| 7 | `source_label` | STRING(100) | `varchar(100)` | NULL | — | `varchar({ length: 100 })` | 운영자가 붙인 이름(파일 이름을 믿지 않는다) |
| 8 | `content_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · 재료 `planning-input-batch/1` = 종류 · 범위 · 행 지문들 |
| 9 | `row_count` | INTEGER | `integer` | NOT NULL | — | `integer()` | — |
| 10 | `accepted_count` | INTEGER | `integer` | NOT NULL | — | `integer()` | 새 판(새 · 바뀜) 수 |
| 11 | `unchanged_count` | INTEGER | `integer` | NOT NULL | — | `integer()` | CHECK accepted + unchanged = row_count |
| 12 | `submitted_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **UNIQUE**: (submitted_by_actor_id, command_id)

### 22.54 `planning_container_record` — 컨테이너 계획 정보(실행마다, 판) **(M30 · T-123)**

- 논리: `OPERATIONAL_RECORD` · 그룹 **P 계획**. 계획 실행 × 컨테이너 번호마다 판이 쌓인다 — 지금 판 = 후속(`supersedes_record_id` 로 가리키는 행)이 없는 행. 철회 = `WITHDRAWN` 판
- 공공데이터 컨테이너(같은 번호, 실행 범위 안)가 있으면 연결하고 규격을 대조한다(다르면 행 오류). LFD 는 비워 둘 수 있다 — 저장은 되지만 계획 준비도가 막는다(추정하지 않는다)

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `record_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | PK |
| 2 | `batch_id` | REF(planning_input_batch) | `uuid` | NOT NULL | — | `uuid()` | FK planning_input_batch |
| 3 | `recovery_run_id` | REF(recovery_run) | `uuid` | NOT NULL | — | `uuid()` | FK recovery_run(실제 실행만 — 시뮬레이션 실행은 거부) |
| 4 | `container_no` | STRING(11) | `varchar(11)` | NOT NULL | — | `varchar({ length: 11 })` | CHECK `^[A-Z]{4}[0-9]{7}$` · 앱이 ISO 6346 검사 숫자를 검사 |
| 5 | `container_id` | REF(container) | `uuid` | NULL | — | `uuid()` | FK container — 공공데이터 컨테이너와 연결(있을 때) |
| 6 | `size_type` | CODE | `text` | NOT NULL | — | `text()` | IN (20DRY, 40DRY, 40HC, 20RF, 40RF, OTHER) |
| 7 | `carrier_code` | STRING(20) | `varchar(20)` | NOT NULL | — | `varchar({ length: 20 })` | 선사 코드 — Demurrage 요율의 키 |
| 8 | `priority` | CODE | `text` | NOT NULL | — | `text()` | IN (CRITICAL, HIGH, NORMAL) |
| 9 | `lfd` | DATE | `date` | NULL | — | `date({ mode: 'string' })` | Demurrage 무료 마지막 날. 없으면 준비도 `CONTAINER_LFD` |
| 10 | `pickup_ready` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | 오늘 반출 가능 |
| 11 | `current_terminal` | STRING(40) | `varchar(40)` | NOT NULL | — | `varchar({ length: 40 })` | 터미널 코드 — 운송 요율 출발지 키 |
| 12 | `destination_facility_id` | REF(facility) | `uuid` | NOT NULL | — | `uuid()` | FK facility(창고) |
| 13 | `planned_day` | DATE | `date` | NOT NULL | — | `date({ mode: 'string' })` | 원래 배차 날짜 |
| 14 | `planned_depart_hour` | INTEGER | `integer` | NULL | — | `integer()` | CHECK 0~23 |
| 15 | `alternate_destination_allowed` | BOOLEAN | `boolean` | NOT NULL | — | `boolean()` | 다른 창고로 바꿔 보내도 되는가(화주 승인) |
| 16 | `record_status` | CODE | `text` | NOT NULL | — | `text()` | IN (ACTIVE, WITHDRAWN) |
| 17 | `row_no` | INTEGER | `integer` | NOT NULL | — | `integer()` | 입력 파일의 줄(추적) |
| 18 | `content_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` · 같은 내용이면 새 판을 만들지 않는다 |
| 19 | `supersedes_record_id` | REF(planning_container_record) | `uuid` | NULL | — | `uuid()` | FK 자기 자신 · UNIQUE(판마다 후속 하나) |
| 20 | `recorded_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **UNIQUE**: (supersedes_record_id)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: (recovery_run_id, container_no)

### 22.55 `tariff_rate` — 계약 요율(효력 기간, 판) **(M30 · T-123)**

- 논리: `OPERATIONAL_RECORD` · 그룹 **P 계획**. 요율 자리 = (종류 · 선사 · 출발 · 도착 · 규격 · 효력 시작). 계획일에 유효한 것 중 효력 시작이 가장 늦은 지금 판을 쓴다
- 요율이 없으면 0 원이 아니라 엔진의 `RATE_MISSING` — 원래 계획(KEEP)에 필요한 요율이 없으면 준비도가 막는다

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `rate_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | PK |
| 2 | `batch_id` | REF(planning_input_batch) | `uuid` | NOT NULL | — | `uuid()` | FK planning_input_batch |
| 3 | `rate_type` | CODE | `text` | NOT NULL | — | `text()` | IN (DEMURRAGE_PER_DAY, TERMINAL_STORAGE_PER_DAY, DETENTION_FREE_DAYS, TRANSPORT, ODCY_HANDLING_IN_OUT, ODCY_STORAGE_PER_DAY) |
| 4 | `carrier_code` | STRING(20) | `varchar(20)` | NULL | — | `varchar({ length: 20 })` | DEMURRAGE_PER_DAY 만 |
| 5 | `from_ref` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | TRANSPORT 만 — 터미널 코드 또는 시설 id |
| 6 | `to_ref` | STRING(60) | `varchar(60)` | NULL | — | `varchar({ length: 60 })` | TRANSPORT · ODCY_* — 시설 id |
| 7 | `size_type` | CODE | `text` | NULL | — | `text()` | IN (20DRY, 40DRY, 40HC, 20RF, 40RF, OTHER) |
| 8 | `amount` | INTEGER64 | `bigint` | NOT NULL | — | `bigint({ mode: 'bigint' })` | CHECK ≥ 0 · KRW 정수(DETENTION_FREE_DAYS 는 일) |
| 9 | `unit` | CODE | `text` | NOT NULL | — | `text()` | IN (KRW, DAY) |
| 10 | `effective_from` | DATE | `date` | NOT NULL | — | `date({ mode: 'string' })` | — |
| 11 | `effective_until` | DATE | `date` | NULL | — | `date({ mode: 'string' })` | CHECK ≥ effective_from |
| 12 | `source_note` | STRING(200) | `varchar(200)` | NOT NULL | — | `varchar({ length: 200 })` | 출처(계약서 · 견적) — 필수 |
| 13 | `record_status` | CODE | `text` | NOT NULL | — | `text()` | IN (ACTIVE, WITHDRAWN) |
| 14 | `row_no` | INTEGER | `integer` | NOT NULL | — | `integer()` | — |
| 15 | `content_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` |
| 16 | `supersedes_rate_id` | REF(tariff_rate) | `uuid` | NULL | — | `uuid()` | FK 자기 자신 · UNIQUE |
| 17 | `recorded_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **UNIQUE**: (supersedes_rate_id)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: (rate_type, effective_from)

### 22.56 `facility_planning_profile` — 시설 계획 정보(판) **(M30 · T-123)**

- 논리: `OPERATIONAL_RECORD` · 그룹 **P 계획**. 시설 등록부(이름 · 종류)와 그날 수용량(Truth 사실) 사이의 **계획 규칙**: 받는 규격 · 출발 가능 시각 · 마지막 출발 · 왕복 시간 · 보관 한도
- 보관 한도는 계획 사실 `max_days`(출처 `OPERATIONAL_RECORD`)로 엔진에 들어간다

| # | 컬럼 | 논리 타입 | PostgreSQL | NULL | 기본값 | Drizzle | FK / CHECK / 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `profile_id` | UUID | `uuid` | NOT NULL | — | `uuid()` | PK |
| 2 | `batch_id` | REF(planning_input_batch) | `uuid` | NOT NULL | — | `uuid()` | FK planning_input_batch |
| 3 | `facility_id` | REF(facility) | `uuid` | NOT NULL | — | `uuid()` | FK facility(창고 · ODCY) |
| 4 | `accepts` | JSON | `jsonb` | NOT NULL | — | `jsonb()` | 받는 규격 배열(예: ["20DRY","40DRY"]) |
| 5 | `open_from_hour` | INTEGER | `integer` | NOT NULL | — | `integer()` | CHECK 0~23 |
| 6 | `last_departure_hour` | INTEGER | `integer` | NOT NULL | — | `integer()` | CHECK 0~23 · ≥ open_from_hour — 그날 도착을 위한 마지막 출발 |
| 7 | `trip_hours` | INTEGER | `integer` | NOT NULL | — | `integer()` | CHECK 1~24 — 터미널 왕복으로 트럭을 쓰는 시간 |
| 8 | `max_storage_days` | INTEGER | `integer` | NULL | — | `integer()` | CHECK ≥ 0 — ODCY 보관 한도 |
| 9 | `record_status` | CODE | `text` | NOT NULL | — | `text()` | IN (ACTIVE, WITHDRAWN) |
| 10 | `row_no` | INTEGER | `integer` | NOT NULL | — | `integer()` | — |
| 11 | `content_hash` | HASH | `varchar(71)` | NOT NULL | — | `varchar({ length: 71 })` | 해시 형식 `^sha256:[0-9a-f]{64}$` |
| 12 | `supersedes_profile_id` | REF(facility_planning_profile) | `uuid` | NULL | — | `uuid()` | FK 자기 자신 · UNIQUE |
| 13 | `recorded_at` | TIMESTAMP_TZ | `timestamptz(3)` | NOT NULL | — | `timestamp({ withTimezone: true, precision: 3, mode: 'string' })` | — |

- **UNIQUE**: (supersedes_profile_id)
- **인덱스(PK·UNIQUE·FK 인덱스 외)**: (facility_id)

### 22.57 M31 실제 계획 입력 가드 · 권한 **(T-123)**

- `planning_input_batch` · `planning_container_record` · `tariff_rate` · `facility_planning_profile`: 갱신 · 삭제 · TRUNCATE 금지(append-only). 권한: cera_app = SELECT · INSERT

## 23. 논리 → 물리 대응 (누락 검사)

**방법**: `docs/22_cera-logical-data-model.xlsx` 의 P0 29개 표 블록에서 영문 필드명 행을 그대로 읽어(생성기 입력) 22절의 표를 만들었다. 작업표 전체 컬럼 수 **587**(`docs/22` 머리말과 같음) 중 P0 29표가 **349**다.

| 표 | 논리 컬럼 수 | 물리 컬럼 수 | SAME | RENAMED | DERIVED | JSON_MEMBER | PHYSICAL_SPLIT | 누락 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `scenario` | 7 | 7 | 7 | 0 | 0 | 0 | 0 | 0 |
| `actor` | 4 | 4 | 4 | 0 | 0 | 0 | 0 | 0 |
| `audit_log` | 11 | 11 | 11 | 0 | 0 | 0 | 0 | 0 |
| `system_error` | 20 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| `counterparty` | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| `counterparty_contact` | 6 | 6 | 6 | 0 | 0 | 0 | 0 | 0 |
| `contact_channel_address` | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 |
| `facility` | 7 | 7 | 7 | 0 | 0 | 0 | 0 | 0 |
| `truck_pool` | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| `planning_snapshot` | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 0 |
| `recovery_run` | 12 | 12 | 12 | 0 | 0 | 0 | 0 | 0 |
| `comm_thread` | 12 | 12 | 12 | 0 | 0 | 0 | 0 | 0 |
| `question_item` | 15 | 15 | 15 | 0 | 0 | 0 | 0 | 0 |
| `comm_message` | 19 | 19 | 19 | 0 | 0 | 0 | 0 | 0 |
| `comm_message_structured_field` | 8 | 8 | 8 | 0 | 0 | 0 | 0 | 0 |
| `comm_message_question` | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 |
| `message_approval` | 13 | 13 | 13 | 0 | 0 | 0 | 0 | 0 |
| `message_approval_structured_field` | 8 | 8 | 8 | 0 | 0 | 0 | 0 | 0 |
| `send_attempt` | 14 | 14 | 14 | 0 | 0 | 0 | 0 | 0 |
| `message_status_transition` | 8 | 8 | 8 | 0 | 0 | 0 | 0 | 0 |
| `raw_input` | 12 | 12 | 12 | 0 | 0 | 0 | 0 | 0 |
| `extraction` | 20 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| `event` | 39 | 39 | 39 | 0 | 0 | 0 | 0 | 0 |
| `event_entity_link` | 4 | 4 | 4 | 0 | 0 | 0 | 0 | 0 |
| `event_verification_target` | 3 | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| `canonical_fact` | 35 | 35 | 35 | 0 | 0 | 0 | 0 | 0 |
| `conflict` | 15 | 15 | 15 | 0 | 0 | 0 | 0 | 0 |
| `verification_request` | 16 | 16 | 16 | 0 | 0 | 0 | 0 | 0 |
| `verification_request_handling` | 9 | 9 | 9 | 0 | 0 | 0 | 0 | 0 |
| **합계 29표** | **349** | **349** | **349** | **0** | **0** | **0** | **0** | **0** |

| 분류 | 뜻 | 개수 |
| --- | --- | --- |
| `SAME` | 같은 이름의 물리 컬럼 1개 | **349** — 그중 **표현만 바뀐 것**: 내부 식별자·참조 → `uuid`, `conflict.event_ids` JSON → `uuid[]`, `send_attempt.idempotency_key` 읽는 문자열 → 해시 표현 |
| `RENAMED` | 이름이 바뀐 컬럼 | 0 |
| `DERIVED` | 다른 컬럼에서 계산되는 물리 컬럼 | 0 |
| `JSON_MEMBER` | JSON 안으로 들어간 논리 컬럼 | 0 (반대로 `claim_locator` 는 논리 컬럼이 아닌 **멱등 재료**가 `event.payload` 키로 기록된다 — 9절) |
| `PHYSICAL_SPLIT` | 논리 1개 → 물리 여러 개 | 0 |
| **물리에만 있는 컬럼** | | **0** |

**물리가 더한 것은 제약·인덱스뿐이다**: 복합 UNIQUE(복합 FK 대상) 9개 · 복합 FK 13개(11.2) · CHECK · 트리거(12.3) · 인덱스(22절). **L13-5 의 뿌리 id 복사는 하지 않는다**(13.1).

---

## 24. 재현 시험 설계 (I-7 · T-080 완료 조건)

| 단계 | 내용 |
| --- | --- |
| 준비 | Slice 1 시나리오(두 상대 루프 + 사람 확인)를 돈 DB. 기준 시각 `as_of` 고정 |
| 1 | `canonical_fact` · `conflict` · `verification_request` 의 **내용 스냅숏**을 뜬다 — 비교 키: 현재 사실 = PK 6열 + 값·차원 전부(`computed_at` 제외) · 충돌 = 좌표 + 정렬된 `event_ids` + 유형·규칙(대리키 `conflict_id` 제외) · 확인 요청 = `request_key` + 나머지(대리키·`computed_at` 제외) |
| 2 | 세 표를 **전부 지운다**(앱 역할 DELETE — 11.1 순서) |
| 3 | 같은 `as_of` 로 `event` 전체에서 재계산 |
| 4 | 1과 비교 — **완전히 같아야 한다** |
| 5 | `verification_request_handling` 이 `request_key` 로 **다시 붙는지** 확인(처리 기록은 지워지지 않았다) |
| 6 | 원문 내용을 파기한 뒤(T12) 1~5 를 반복 — 결과가 같아야 한다(I-33) |

---

## 25. 발견한 구조 문제와 처리 결과

**2026-09-22 사용자 검토 결과를 반영했다.** F-1~F-5 는 논리 모델의 실제 모순이라 **`docs/22` rev.2.5** 로 고쳤다(새 표 0 · 새 컬럼 0 · `docs/21` 변경 0).

| # | 문제 | 처리 | 어디 |
| --- | --- | --- | --- |
| **F-1** | `send_attempt.idempotency_key` UNIQUE(재료 = 채널 + 메시지 + 지문 + 승인) ↔ "재시도 = 같은 재료의 새 행" | **해소.** 논리 발송의 신원 = 메시지(`message_id` = `X-CERA-Message`). `idempotency_key` 는 **시도마다 다르다**(재료 `sak/1` = 메시지 + 시도 번호) · `UNIQUE(message_id, attempt_no)` · **U-6 메시지당 `SUCCESS` 1건 · U-7 메시지당 미확정 1건** · 삽입 가드가 성공·영구 실패 뒤 새 시도를 막는다 | `docs/22` 15.7 · 15.7.3 규칙 6·7 · 17.2 · 이 문서 13 · 14 |
| **F-2** | `UNKNOWN` 을 확정 결과로 적었는데 화해(`docs/18` H.2 · 시험 S-03)는 바꾼다 | **해소.** `UNKNOWN` = 아직 확인 안 됨. **화해만** `UNKNOWN` → `SUCCESS`(`provider_message_id` 필수) / `RETRYABLE_FAILURE`(`RECONCILED_NOT_SENT`) 한 번. 다른 확정 결과 변경 금지. 새 표 없음 | `docs/22` 1.3 · 15.7 · 15.7.3 규칙 2·4 · 15.8.1 · I-18 · 이 문서 12.3 |
| **F-3** | `comm_message.sent_at` 을 채울 변경 방식이 없었다 | **해소.** `NULL` → 값 **한 번**(발송 성공 확인 시 그 시도의 `finished_at`) · 이후 변경 금지 | `docs/22` 1.3 · 15.3 · 12.3 `fn_cera_guard_one_time_fill` |
| **F-4** | `comm_thread.external_thread_id` 는 첫 발송 뒤에 생긴다 | **해소.** `NULL` → 값 **한 번**(T6 에서 채널 응답으로). 유일 범위는 **채널 종류**(13절 U-5 — 논리 모델에 연결 참조가 없다). **연결이 여럿이 되면 연결 참조가 필요** — 그때 다시 연다 | `docs/22` 1.3 · 15.1 |
| **F-5** | INBOUND 에 `drafted_by`(필수) 값이 없다 | **해소.** OUTBOUND 만 필수 · INBOUND 는 NULL. CERA 자동 초안은 `TEMPLATE`/`AI_DRAFT` 이고 행위 주체는 `DRAFTED` 전이의 `SYSTEM` actor. **같은 이유로 `current_status` 도 OUTBOUND 만 필수**(상태 값 목록이 보내는 메시지의 생애주기라 INBOUND 에 맞는 값이 없다 — 검토 중 추가로 발견, 같은 방식으로 정리) | `docs/22` 15.3 |
| F-6 | 감사 `result` — 작업표 `FAILURE` ↔ 29.8 `FAILED` | **정리** — `SUCCESS` · `FAILURE` 로 통일 | `docs/22` 29.8 |
| F-7 | `evidence_strength` 예시 `STRONG` ↔ `docs/05` 강도 0~3 · `evidence_time_quality` 예시 `SOURCE_EVENT_TIME` ↔ `EVENT_TIME` | **정리** — 강도 `0`·`1`·`2`·`3`(CLOSED) · 예시 `EVENT_TIME` | `docs/22` 11.4 · 작업표 |
| F-8 | `event_entity_link.link_role` 이 "필수 아니오" | **정리** — 필수 | `docs/22` 11.3 · 작업표 |
| F-9 | Outbox 작업으로 `trace_id` 를 이어 줄 저장 위치가 없다 | **결정 — 업무 논리 모델에 컬럼을 추가하지 않는다.** 장기 업무 상관은 안정적인 도메인 id(`message_id` · `thread_id` · `correlation_id` · `run_id`)로 잇고, 실행 추적 `trace_id` 는 관측 문맥·로그에 둔다. 워커는 작업마다 새 trace 를 열고 로그에 도메인 id 를 남긴다. **비동기 전달에 별도 저장이 필요하다는 구체적 근거가 생길 때만 다시 연다** | 10절 |
| F-10 | 마스터 표에 `is_simulated` 가 없다 · 사람 명령 id 를 `source_record_key` 로 쓴다 | **확인 결과** — (1) 마스터 시드는 **local · test 에서만** 넣는다(21절, 명령이 다른 환경을 거부). 운영 DB 에 시드 마스터가 섞이지 않으므로 Slice 1 에 컬럼이 필요 없다. 운영에서 가상 거래처가 필요해지면 그때 논리 모델을 연다. (2) 화면 명령 id 는 **원천(화면 클라이언트)이 주는 전달 식별자**라 11.1 의 정의와 맞다 — `docs/22` 11.1 표에 적었다 | 21 · 9 · `docs/22` 11.1 |
| F-11 | 논리에 문장이 없는 물리 보조 제약 | **확인 결과 — 유지.** 모두 기존 논리 규칙에서 따라 나오고 더 엄격해질 뿐이다: `event`·`extraction` ↔ `raw_input` 시뮬레이션 일치(S-1 · `docs/01` 규칙 9) · 승인·처리 주체 `HUMAN`(A-17 · ADR-026) · `event_verification_target (확인, 대상)` 유일(11.2a — 선택한 후보와 기각한 후보가 같을 수 없다) · 등록부 상태 ⇒ 시각 필수 · `cardinality(event_ids) >= 2`(충돌은 둘 이상의 대립) · 구조화 값 최소 1개 값 | 11.2 · 22 |

**새 상위 개념 · 새 엔티티는 필요하지 않았다.** 다시 열 조건만 남긴 것: F-4(한 채널에 연결 여럿) · F-9(비동기 trace 저장 근거) · F-10(운영 가상 마스터).

---

## 26. 결정 상태

| # | 무엇 | 상태 |
| --- | --- | --- |
| F-1 ~ F-5 | 논리 모순 | **해소 — `docs/22` rev.2.5**(2026-09-22 사용자 검토 결과) |
| D-1 | ID = UUIDv7 · `uuid` · Main Backend 생성. 시드는 fixture 의 고정된 유효 UUIDv7 | **승인** — U0 에서 fixture 값이 UUIDv7 형식(버전·variant 비트)인지 검사한다 |
| D-2 | 고정 목록 CHECK · 확장 코드 형식 CHECK + Backend 카탈로그 한 곳 · ENUM 없음 · 코드 표 없음 | **승인** |
| D-3 | `bigint` → TS `bigint` → API 10진 문자열 · 암묵 `number` 변환 금지 | **승인** |
| D-4 | A + B + C · 표 단위 권한 · 열 단위 GRANT 는 필요할 때만 | **승인(보완 반영)** |
| D-5 | DB 밖 `ContentStore` · `cref:v1` · 생성·파기 일관성 순서 | **승인(보완 반영)** |
| 남은 판단 | 없음 — 최종 승인(2026-09-22) | |

---

## 27. 검증 결과

**재계산 방법**: `docs/22` rev.2.5 작업표를 다시 읽어(생성기 입력) 22절을 새로 만들고, 만든 문서를 다시 읽어 작업표와 **표·컬럼·순서별로 대조**했다. 컬럼 추가·삭제는 없었으므로 결과 수가 이전과 같다(억지로 맞춘 것이 아니다).

| # | 항목 | 결과 |
| --- | --- | --- |
| 1 | P0 29표 모두 물리 명세 | **PASS** — 22.1~22.29 |
| 2 | 논리 컬럼 누락 0 | **PASS** — 349 / 349 · 표 29 / 29 · 순서 일치 |
| 3 | 모든 PK 정의 | **PASS** — 단일 uuid 23 · 복합 6 |
| 4 | 모든 FK 삭제 정책 | **PASS** — 단일 FK 컬럼 58 + 복합 FK 13 · RESTRICT 기본 · SET NULL 1 · CASCADE 0 · P1 참조 2 = FK 없음 + 임시 CHECK |
| 5 | 조건부 유일 매핑 | **PASS** — U-1 ~ U-7(13절) |
| 6 | 사건 멱등 물리 규칙 | **PASS** — 9절 |
| 7 | append-only 강제 | **PASS** — A + B + C(12절) |
| 8 | Outbox 잠금 | **PASS** — 14절 |
| 9 | BIGINT/TS 경계 | **PASS** — 6절 |
| 10 | 시각 매핑 | **PASS** — 5절 |
| 11 | JSONB 범위 | **PASS** — 7절 |
| 12 | 내용 참조 물리 전략 | **PASS** — 16절(생성 일관성 포함) |
| 13 | 파기 판정 | **PASS** — 17절 |
| 14 | migration 순환 | **PASS** — 2개, NULL 먼저 · FK 나중 |
| 15 | Drizzle 밖 기능 목록 | **PASS** — N-1~N-10 |
| 16 | SQLite 의존 0 | **PASS** |
| 17 | AI Server DB 접근 0 | **PASS** |
| 18 | 코드 · SQL · migration 0 | **PASS** |

**이번 보완의 시나리오 점검**

| 점검 | 흐름 | 결과 |
| --- | --- | --- |
| **재시도 가능(F-1)** | 시도 1 → `RETRYABLE_FAILURE`(U-7 에서 빠짐) → 시도 2 삽입(`attempt_no` 2 · 새 `idempotency_key`) → `SUCCESS` | **PASS** — UNIQUE 위반 없음 |
| **`UNKNOWN` 화해(F-2)** | 시도 1 `UNKNOWN` → 새 시도 삽입 시도 → **U-7 위반으로 거부** → `lookup_sent` 찾음 → `UNKNOWN` → `SUCCESS`(`provider_message_id`) / 못 찾음 → `RETRYABLE_FAILURE`(`RECONCILED_NOT_SENT`) → 시도 2 가능 | **PASS** — S-03 · 재전송 전 화해가 DB 에서 강제 |
| 발송 중 강제 종료 | 시도 1 `result NULL` 로 남음 → 재기동 → 화해(`NULL` → `SUCCESS` 또는 `RETRYABLE_FAILURE`) → 필요할 때만 시도 2 | **PASS** — S-02 |
| **중복 업무 발송 방지** | 같은 메시지 두 번째 `SUCCESS` 기록 → U-6 위반 · 성공 뒤 새 시도 삽입 → 삽입 가드 거부 · 다중 워커 경합 → SKIP LOCKED + U-7 | **PASS** |
| **`sent_at`(F-3)** | 초안 `NULL` → T6 `SUCCESS` 에서 `finished_at` 으로 한 번 → 다시 쓰기 → 트리거 거부 | **PASS** |
| **Gmail `external_thread_id`(F-4)** | 스레드 생성 `NULL` → 첫 발송 응답 threadId 로 한 번 → 변경 시도 거부 · 같은 채널 같은 id 중복 → U-5 | **PASS** |
| **INBOUND 저장(F-5)** | `direction = INBOUND` · `drafted_by NULL` · `current_status NULL` · `received_at` 있음 · 전이 없음 → CHECK 통과 | **PASS** |
| append-only 유지 | 앱 역할로 불변 표 UPDATE/DELETE → 트리거·권한 거부 · 트리거 끄기 → 소유자 아님 | **PASS** |
| ContentStore 일관성 | 16절 생성 4단계 · 파기 3단계 · 고아 허용 · "참조만 있고 내용 없음"은 정상 흐름에서 생기지 않음 | **PASS**(설명 존재) |
| `docs/21` 변경 0 · 제품 코드 0 · SQL/migration 0 · `git diff --check` | | **PASS** |

**T-080 DONE** (2026-09-22 최종 승인).

---

## 28. U0 · U1 이 실제로 만들 것

| 단위 | 만든다 | 이 문서의 근거 |
| --- | --- | --- |
| **U0 (T-085)** | 로컬 PostgreSQL 실행 방식 선택(NFR-09 — 명령 1~2개) · 역할 2개 준비 스크립트 · 연결 설정(`TimeZone = UTC`, 앱 = `cera_app`) · Drizzle 설정 · **18절 `[TO VERIFY]` 확인 시험** · 시간 모듈(Instant) · `Krw` · 10진 값 객체 · ID 생성기(UUIDv7) · 시드 fixture UUIDv7 형식 검사 · JCS + SHA-256 해시 유틸 · 트랜잭션 헬퍼(콜백 안 외부 포트 금지 아키텍처 시험) · `traceparent` · `X-Request-Id` | 2 · 4 · 5 · 6 · 8 · 10 · 15 · 18 |
| **U1 (T-086)** | Drizzle 스키마 29표 · migration M01~M10(생성 6 + custom 4) · 저장소 계층(append-only 표는 insert 만) · `ContentStore` 포트 + 파일 시스템 어댑터 · 감사·`system_error` 기록기 · 파기 판정 함수 · 시드 명령 · 스키마 검사 시험 · 권한 시험 · C-01~03 | 11 · 12 · 13 · 16 · 17 · 19 · 20 · 21 · 22 |

---

## 29. 정하지 않은 것

PostgreSQL · Drizzle · Node · Nest 판 · 연결 풀 · 로컬 실행 방식(Docker 여부) · 호스팅 · HA · 백업 · 객체 저장소 제품 · 암호화 · 보관 기간 숫자(Q-45) · 고아 내용 정리 주기 · 폴링 주기의 운영 값 · 코드 카탈로그의 실제 값 목록(Q-66 · L-14 · L-15 · Q-34 · T-082) · 10진 라이브러리 · 시간 라이브러리 · P1 · DEFERRED 표.
