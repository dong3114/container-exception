# 24. CERA 물리 데이터 모델 — Slice 1 P0 (PostgreSQL + Drizzle)

- 상태: **승인 — T-080 DONE (2026-09-22, 사용자 + ChatGPT 최종 승인)** (작성 Claude Code). 사용자 검토 결과를 반영했다 — **F-1~F-5 논리 모순은 `docs/22` rev.2.5 로 해소**, D-4 · D-5 보완, F-6~F-11 정리·기록(25절). **U1(T-086) 구현 확인 결과는 18.2**
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
```

**순환 분석 — 둘 다 "NULL 먼저, FK 나중"으로 풀리고 설계 오류가 아니다**

| 순환 | 왜 생기나 | 해법 | 지연 FK 필요? |
| --- | --- | --- | --- |
| ① `comm_message.current_approval_id` ↔ `message_approval.message_id` | 메시지가 먼저 생기고 승인은 나중. 포인터는 캐시 | 컬럼은 NULL 허용으로 먼저 만들고, 같은 migration 끝에서 FK 추가. 실행 순서: 메시지 → 승인 → 포인터 갱신 | 아니오 |
| ② `extraction.created_event_id` ↔ `event.extraction_id` | 추출이 먼저, 사건은 채택 때 | 같다. 실행 순서: 추출 → 사건 → 검토 갱신 | 아니오 |

- 자기참조 3개(`recovery_run.previous_run_id` · `message_approval.invalidates_approval_id` · `event.supersedes_event_id`)는 **불변 행 + 이미 있는 행만 참조**라서 순환이 생길 수 없다(자기 자신은 CHECK 로 막는다).
- **다형 참조**(`event_entity_link` → 마스터들)는 FK 가 아니므로 그래프 밖이다. 삽입 가드 트리거는 M02 의 표가 있어야 동작한다 — M05 뒤에 트리거를 만들므로 문제없다.

---

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

## 22. 표별 물리 명세 (29표)

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

- **FK(표 수준 · 복합 포함)**: —
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


---

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
