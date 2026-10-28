# 07. CERA 인터페이스 · API 연계 설계서

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 확정(2026-10-28 구현 기준) |
| 정본 | Controller 데코레이터(`back/src/**/*.controller.ts`) · 요청 스키마(zod, 각 service) · 생성 OpenAPI `packages/contracts/openapi.json` · Agent Tool 계약 `packages/contracts/agent-tools/agent-tools.v1.json` · AI 계약 `packages/contracts/ai/` |
| 부록 | **[부록 B. API 엔드포인트 전체 목록(자동 생성)](07a_appendix-api-endpoints.md)** — 84 경로의 Method · Path · 권한 · Handler · 코드 위치 |
| 관련 문서 | [02 요구사항](02_requirements-analysis.md) · [03 유스케이스](03_use-cases.md) · [05 DB](05_data-model-and-tables.md) · [09 추적성](09_traceability-matrix.md) |

## 1. 공통 규약

| 항목 | 규약 |
| --- | --- |
| 기준 주소 | Backend `:3100`. 화면은 `/backend/*` 로 부른다(Vite 프록시 · nginx 가 접두사를 뗀다) |
| 인증 | 세션 쿠키 `cera_session`(HttpOnly · SameSite=Strict · production Secure). `X-CERA-Actor-Id` 헤더는 session 모드에서 무시 · 덮어씀 |
| 권한 | 전역 Guard — 표는 [02](02_requirements-analysis.md) 2절. `PUBLIC` = 상태 확인 · 로그인 · 데모 입구 · Internal(서비스 토큰을 컨트롤러가 검사) |
| 오류 형식 | `{ code, message, request_id }`(+ 업무 거부는 `details`). 5xx 는 `Internal server error` 만 — 스택 · SQL · 경로 없음 |
| 상태 코드 | 400 형식 · 401 인증 · 403 권한 · Gate · 404 없음 · 409 업무 규칙 · 상태 충돌 · 422 의미 불일치 · 429 한도 · 503 DB 불가(health) |
| 추적 | 응답 헤더 `X-Request-Id` |
| 내용 지문 | 승인 · 발송 · 계획 승인은 화면이 본 지문(`content_hash` · `plan_hash` = `sha256:<64 hex>`)을 보내야 한다 — 그 사이 바뀌면 409 |
| 멱등 | 사실 판단 · 직접 입력 · 운영 입력 · 실제 실행 생성은 `command_id`(UUID) · 발송 요청은 상태로 멱등 · Agent 변경 Tool 은 `Idempotency-Key` |
| 시각 · 금액 | 시각은 시간대 포함 ISO(서울 표시) · 금액은 원 정수 |
| CORS | 열지 않는다(같은 출처). 변경 요청 Origin 검사(`CERA_ALLOWED_ORIGINS` 가 있을 때) |

## 2. API 분류

| 영역 | 경로 접두사 | 수 | 주요 권한 |
| --- | --- | ---: | --- |
| Health | `/health` | 2 | PUBLIC |
| Auth · Demo session | `/auth` | 5 | PUBLIC · read |
| 사용자 관리 | `/admin/users` | 3 | `users.manage` |
| Registry | `/registry` | 12 | read · `registry.manage` |
| Communication | `/communication` | 11 | `communication.*` · `extraction.retry` |
| Truth | `/truth` | 6 | read · `truth.review` · `truth.manual_entry` |
| Agent 실행 | `/agent-runs` | 8 | `agent_run.manage` · `contact.select` |
| Planning(실행 · 입력 · 운영 기준 계획 · 비용 · 계획 · 후속) | `/planning` | 20 | read · `planning.input` · `plan.*` · `communication.draft` · `contact.select` |
| Exceptions(T-132) | `/exceptions` | 3 | read · `plan.recalculate` |
| Public Data | `/public-data` | 6 | read · `public_data.fetch` |
| Demo 도우미 | `/dev/demo` | 2 | PUBLIC · `communication.draft` |
| Internal(Agent Runtime) | `/internal` | 6 | 서비스 토큰 |
| **합계** | | **84**(+ `GET /openapi.json`) | |

## 3. 주요 API 상세

Request 는 본문 필드(`?` = 선택). 관련 테이블은 쓰는 표 중심.

### 3.1 인증

| Method · Path | 목적 | 권한 | Request | Response | Error | 멱등 | 테이블 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /auth/login` | 로그인 | PUBLIC | `login_id` · `password` | 사용자 · `role` · `permissions[]` · `expires_at` + 쿠키 | 400 · 401 `INVALID_CREDENTIALS` · 429 | 아님 | `user_session` · `audit_log` |
| `POST /auth/logout` | 로그아웃 | PUBLIC | `{}` | `logged_out` | — | 예 | `user_session` |
| `GET /auth/me` | 내 정보 | read | — | 사용자 · 권한 · `auth_mode` · `portfolio_demo` | 401 | — | `user_session` |
| `GET · POST /auth/demo-session` | 공개 데모 입구(포트폴리오 모드만) | PUBLIC | `{}` | GET: `enabled` 등 / POST: 데모 방문자 세션 | 404(일반 배포) · 409 `DEMO_NOT_READY` · 429 | 아님 | `user_session` |
| `GET · POST /admin/users` · `PATCH /admin/users/{userId}` | 사용자 관리 | `users.manage` | `login_id` · `display_name` · `role` · `password` / `role?` · `is_active?` · `password?` | 사용자 | 409 `LOGIN_ID_TAKEN` · `CANNOT_DEMOTE_SELF` | 아님 | `user_account` · `actor` |

### 3.2 등록부

| Method · Path | 목적 | 권한 | Request | Error | 테이블 |
| --- | --- | --- | --- | --- | --- |
| `GET /registry/counterparties` | 거래처 · 담당자 · 주소(자격 포함) | read | — | — | `counterparty*` · `contact_channel_address` |
| `GET /registry/facilities` | 시설 · 운영사 | read | — | — | `facility` |
| `GET /registry/addresses/{addressId}/eligibility` | Contact Gate 판정 | read | — | 404 | 위와 같음 |
| `POST /registry/counterparties` | 거래처 등록 | `registry.manage` | 이름 · `source_role` | 409 중복 | `counterparty` |
| `POST /registry/counterparties/{counterpartyId}/contacts` | 담당자 · 주소 등록 | `registry.manage` | `person_name` · `team?` · `note?` · `channel_type`(`GMAIL` · `MOCK`) · `address` · (CERA 밖 확인 여부) | 409 중복 · 400 | `counterparty_contact` · `contact_channel_address` |
| `POST /registry/addresses/{addressId}/approve` · `/reject` | 주소 승인 · 거절 | `registry.manage` | 거절: `reason_code` | 409 상태 | `contact_channel_address` |
| `PATCH /registry/addresses/{addressId}/status` | 통신 상태 | `registry.manage` | `communication_status`(`ACTIVE` · `PAUSED` · `INACTIVE`) · `reason_code` | 409 | 위와 같음 |
| `PATCH /registry/contacts/{contactId}` | 담당자 활성 | `registry.manage` | `is_active` · `reason_code` | 409 | `counterparty_contact` |
| `PATCH /registry/facilities/{facilityId}/operator` | 시설 운영사 | `registry.manage` | `counterparty_id`(null 가능) | 404 | `facility` |
| `POST /registry/facilities` | 시설 등록(T-132) | `registry.manage` | `facility_type`(`WAREHOUSE` · `ODCY` · `TERMINAL`) · `facility_name` · `area?` · `operator_counterparty_id?` | 409 `FACILITY_ALREADY_REGISTERED` | `facility` |
| `POST /registry/truck-pools` | 트럭 풀 등록(T-132) | `registry.manage` | `pool_name` · `ownership`(`OWN` · `PARTNER`) · `owner_counterparty_id?`(협력은 필수) | 409 `TRUCK_POOL_ALREADY_REGISTERED` · 400 | `truck_pool` |

등록 · 승인 · 선택이 대기를 풀 수 있으면 Agent 를 깨운다(`REGISTRY_CHANGED` · `CONTACT_SELECTED`).

### 3.3 연락

| Method · Path | 목적 | 권한 | Request | Response | Error | 멱등 | 테이블 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /communication/drafts` | 문의 초안 | `communication.draft` | `address_id` · `intent`(`TRUCK_SLOT` · `FACILITY_CAPACITY`) · `target_id` · `values[]`(`key` · `value_number?` · `value_text?` · `unit?` · `source_path?`, 1~20) · `source_run_id` | 초안(메시지 · 스레드 · 숫자 검사 · Gate) | 403 Gate · 422 `SIMULATION_MISMATCH` · 400 | 아님 | `comm_thread` · `comm_message` · `question_item` · `comm_message_structured_field` |
| `POST /communication/drafts/{messageId}/revisions` | 수정 | `communication.draft` | `subject`(≤200) · `body`(≤4000) · `values?` | 초안 | 409 상태 | 아님 | 위와 같음 |
| `GET /communication/drafts` · `/{messageId}` | 조회(상태 · 승인 · 발송 · 답장 · 추출) | read | 필터 | 초안 상세 | 404 | — | 위 + `send_attempt` · `extraction` |
| `POST /communication/drafts/{messageId}/approve` | 승인 | `communication.approve` | `content_hash` | 초안 | 409 `CONTENT_CHANGED` · 403 Gate · 409 만료 | 아님 | `message_approval*` · `message_status_transition` |
| `POST /communication/drafts/{messageId}/reject` | 반려 | `communication.approve` | `reason`(≤500) · `content_hash` | 초안 | 409 | 아님 | `message_approval` |
| `POST /communication/approvals/{approvalId}/revoke` | 승인 취소 | `communication.approve` | `reason?` | 초안 | 409 | 아님 | `message_approval` |
| `GET /communication/approvers` | 승인 가능한 사람 | read | — | 목록 | — | — | `user_account` |
| `POST /communication/drafts/{messageId}/send` | 발송 요청 | `communication.send` | `content_hash` | 초안(`QUEUED`) | 409 `CONTENT_CHANGED` · `NOT_APPROVED` · `PLAN_SUPERSEDED` · `CHANNEL_UNAVAILABLE` · 403 Gate · 403 `PORTFOLIO_DEMO_REAL_CHANNEL_BLOCKED` | **예**(이미 대기 · 보냄이면 그대로) | `message_status_transition` · `audit_log` |
| `GET /communication/inbound` | 받은 메일 · 보류 | read | — | 목록 | — | — | `comm_message` · `raw_input` |
| `POST /communication/inbound/{messageId}/extraction/retry` | 사람 재추출 | `extraction.retry` | `{}` | 요청 | 409 `EXTRACTION_NOT_REQUIRED` 등 | 아님 | `extraction_retry_request` |

### 3.4 사실(Truth)

| Method · Path | 목적 | 권한 | Request | Error | 멱등 | 테이블 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /truth/facts?recovery_run_id=&as_of=` | 사실 · 후보 · 상태 | read | — | 400 | — | `canonical_fact` · `event` |
| `POST /truth/events/{eventId}/confirm` | 확인 | `truth.review` | `command_id` · `note?` | 409 · 403 | `command_id` | `event` · `event_verification_target` |
| `POST /truth/events/{eventId}/reject` | 거절 | `truth.review` | `command_id` · `reason_code` · `note?` | 409 | `command_id` | 위와 같음 |
| `POST /truth/events/{eventId}/correct` | 정정 | `truth.review` | `command_id` · `value`(0~999,999) · `reason_code` · `note?` | 409 | `command_id` | `event` |
| `POST /truth/events/{eventId}/revoke` | 철회 | `truth.review` | `command_id` · `reason_code` · `note?` | 409 | `command_id` | `event` |
| `POST /truth/facts/manual` | 직접 입력 | `truth.manual_entry` | `intent`=`OPERATOR_DIRECT_ENTRY` · `kind`(`TRUCK_SLOT` · `FACILITY_CAPACITY`) · `target_id` · `date` · `window_from?` · `window_to?` · `size_type?` · `value` · `source_note`(≤200) · `scenario_id?` | 400 · 403 | `command_id` | `raw_input` · `event` |

### 3.5 Agent 실행

| Method · Path | 목적 | 권한 | Request | Response | 테이블 |
| --- | --- | --- | --- | --- | --- |
| `POST /agent-runs` | 실행 만들기 | `agent_run.manage` | `recovery_run_id` · `goal`(≤300) · `runtime_version?` · `parameters?`(`plan_recovery?`, 문의 매개변수 등) | 실행(`CREATED`) | `agent_run` |
| `POST /agent-runs/{agentRunId}/start` · `/resume` | 시작 · 다시 확인 | `agent_run.manage` | `{}` | 실행 상태 · 대기 사유 | `agent_run` · `agent_step` |
| `POST /agent-runs/{agentRunId}/cancel` | 취소 | `agent_run.manage` | `{}` | `CANCELLED` | `agent_run` |
| `POST /agent-runs/{agentRunId}/contact-selection` | 받는 주소 선택 | `contact.select` | `address_id` · `note?` | 실행 | `contact_selection` |
| `GET /agent-runs` · `/{agentRunId}` · `/runtime` | 목록 · 상세 · Runtime 연결 | read | — | — | `agent_run` |

오류: 422 `WRONG_COUNTERPARTY` · `ROLE_MISMATCH` · `SIMULATION_MISMATCH` · 403 Gate · 409 `NOT_WAITING_FOR_CONTACT_SELECTION` · `GAP_ALREADY_RESOLVED` · 429 `DEMO_QUOTA_EXCEEDED`(포트폴리오).

### 3.6 Planning

| Method · Path | 목적 | 권한 | Request | Error | 멱등 | 테이블 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /planning/runs` | 실행 목록(`source`: `AUTO_DETECTED` · `MANUAL` · `SCENARIO` · `exception` 요약 — T-132) | read | — | — | — | `recovery_run` · `agent_run` · `recovery_plan` · `operational_exception` |
| `POST /planning/runs` | 실제 실행 만들기 | `planning.input` | `command_id` · `note?` | 403 | `command_id` | `planning_snapshot` · `recovery_run` |
| `POST /planning/runs/{runId}/inputs/containers` | 컨테이너 입력 | `planning.input` | `command_id` · `dry_run?` · `csv?` 또는 `rows?` · `source_label?` | 400(행 · 필드 · 이유) | `command_id` · 같은 내용 | `planning_input_batch` · `planning_container_record` |
| `POST · GET /planning/inputs/containers` | 운영 기준 계획(실행 밖 · T-132) — 저장되면 예외 탐지 | `planning.input` · read | 실행 입력과 같음 | 400 | `command_id` · 같은 내용 | `planning_input_batch` · `planning_container_record`(`recovery_run_id` NULL) |
| `POST /planning/inputs/rates` · `/facility-profiles` | 요율 · 시설 정보 | `planning.input` | 위와 같음 | 400 | 위와 같음 | `tariff_rate` · `facility_planning_profile` |
| `GET /planning/runs/{runId}/inputs/containers` · `/planning/inputs/rates` · `/facility-profiles` · `/planning/inputs/batches/{batchId}` | 입력 조회 | read | — | — | — | 위와 같음 |
| `GET /planning/runs/{runId}/input-readiness` | 준비도 | read | — | — | — | 위 + `canonical_fact` |
| `GET /planning/runs/{runId}/costs` | 비용표(저장 안 함) | read | — | 409 준비 안 됨 | — | 읽기만 |
| `POST /planning/runs/{runId}/plans` | 재계산 → 새 판 | `plan.recalculate` | `{}` | 409 준비 안 됨 | 아님(판이 하나 더) | `recovery_plan` · `recovery_plan_item` |
| `GET /planning/runs/{runId}/plans` · `GET /planning/plans/{planId}` | 판 목록 · 상세(KPI · 항목 · OUTDATED 이유) | read | — | 404 | — | `recovery_plan*` |
| `POST /planning/plans/{planId}/approve` | 계획 승인 | `plan.approve` | `plan_hash` · `note?` | 409(해시 · 상태) | 아님 | `recovery_plan` · `audit_log` |
| `GET · POST /planning/plans/{planId}/follow-ups` | 후속 조회 · 초안 만들기 | read · `communication.draft` | `{}` | 409 | 같은 조치는 한 번 | `plan_follow_up` · `comm_message` |
| `POST /planning/plans/{planId}/follow-ups/contact-selection` | 후속 받는 주소 선택 | `contact.select` | `action_key` · `address_id` · `note?` | 409 `FOLLOW_UP_ALREADY_DRAFTED` · 422 | 새 행 | `contact_selection` |

후속 응답의 각 조치: `kind`(`ODCY_RECEIVE` · `PARTNER_TRUCKS`) · `follow_up_kind` · `delta`(`ADDED` · `MODIFIED` · `REMOVED` · `CONTACT_CHANGED`) · `refers_to_message_id` · `previous_quantity` · `blocked_reason`.

### 3.6b 운영 예외 (T-132)

| Method · Path | 목적 | 권한 | Request | Response | Error | 테이블 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /exceptions?status=` | 예외 목록(`ACTIVE` · `RESOLVED`) | read | — | 종류 · 범위 · 시설 · 날짜 · 예정 · 수용량 · 부족 · 근거 · 실행 id · 시각 | — | `operational_exception` · `facility` |
| `GET /exceptions/{exceptionId}` | 예외 + 관측 기록(근거) | read | — | 위 + `observations[]`(종류 · 근거 jsonb · 수용량 사건 id) | 404 | 위 + `operational_exception_observation` |
| `POST /exceptions/detect` | 지금 탐지(사람 요청 — 평소에는 알림 · Worker 주기가 부른다) | `plan.recalculate` | `{}` | `evaluated` · `detected` · `changed` · `resolved` · `indeterminate` · `runs_created` | 409 `EXCEPTION_DETECTION_OFF` | 위 + `recovery_run` · `audit_log` |

### 3.7 공공데이터 · 상태 · 시연

| Method · Path | 목적 | 권한 |
| --- | --- | --- |
| `POST /public-data/vessel-calls/fetch` | 입항 선박 조회(기간) | `public_data.fetch` |
| `POST /public-data/vessel-calls/{vesselCallId}/manifest/fetch` | 적하목록 | `public_data.fetch` |
| `GET /public-data/status` · `/vessel-calls` · `/vessel-calls/{id}` · `/fetches` | 조회 | read |
| `GET /health/live` · `GET /health` | 상태(`status` · `app` · `db` · `queue` · `checked_at`) | PUBLIC |
| `GET /dev/demo/status` · `POST /dev/demo/mock-reply` | 시연 상태(T-132: `exception_detection` · `active_run_id` · `auto_exception`) · Mock 회신(local · test · 포트폴리오만) | PUBLIC · `communication.draft` |

## 4. Internal — Agent Runtime 전용

| 경로 | 호출자 | 인증 | 내용 |
| --- | --- | --- | --- |
| `GET /internal/agent-tools` | AI Server | `Authorization: Bearer <CERA_AGENT_TOOL_TOKEN>` | Tool 목록 |
| `POST /internal/agent-tools/{tool}` | AI Server | 토큰 + `X-CERA-Agent-Run-Id` + (변경 Tool) `Idempotency-Key` | Tool 실행 → 봉투(`status` · 출력 · 오류 코드) |
| `PUT · GET /internal/agent-runtime/runs/{id}/checkpoints` · `POST .../checkpoint-writes` · `POST .../steps` | AI Server(`BackendCheckpointSaver`) | 토큰 | 체크포인트 · 단계 저장(실행 상태) |

공개 배포에서는 nginx 가 `/backend/internal/*` 를 404 로 막는다.

## 5. Agent Tool 14개 (계약 `agent-tools.v1.json`)

| Tool | 분류 | 멱등 키 | 시간 상한 | 하는 일 |
| --- | --- | --- | --- | --- |
| `get_vessel_calls` | EXTERNAL_READ | 없음 | 120 s | 기간의 부산항 입항 선박(Backend 가 공공 API 호출) |
| `get_vessel_call` | READ | 없음 | 30 s | 등록된 항차와 알려진 컨테이너 |
| `get_container_manifest` | EXTERNAL_READ | 없음 | 120 s | 항차 적하목록 |
| `get_recovery_context` | READ | 없음 | 30 s | 실행 상태 · 스냅숏 날짜 · 시설 · 트럭 풀 |
| `get_information_gaps` | READ | 없음 | 30 s | 정보 공백(결정론) |
| `find_counterparty` | READ | 없음 | 30 s | 역할 · 이름으로 거래처와 주소 · Gate 결과 |
| `create_inquiry_draft` | PROPOSE | **필수** | 60 s | 문의 초안 |
| `get_communication_status` | READ | 없음 | 30 s | 문의 상태 |
| `get_reply_candidates` | READ | 없음 | 30 s | 회신 · 검증된 후보 |
| `request_approval` | REQUEST | **필수** | 60 s | 승인 대기열에 넣기(승인 아님) |
| `calculate_recovery_costs` | COMPUTE | 없음 | 60 s | 비용 · 위험 |
| `solve_recovery` | COMPUTE | 없음 | 60 s | Solver |
| `propose_recovery_plan` | PROPOSE | **필수** | 60 s | 판 저장(`expected_input_hash` 일치 시) |
| `get_recovery_plan` | READ | 없음 | 30 s | 판 상태 |

계약에 명시된 **Agent 에게 없는 것**: 승인 · 반려 · 발송 · 사실 확인 · 최종 계획 선택 · 등록부 변경. Tool 오류 코드 예: `INVALID_ARGUMENT` · `IDEMPOTENCY_KEY_REQUIRED` · `IDEMPOTENCY_KEY_REUSED` · `TOOL_CALL_IN_PROGRESS`(재시도 가능) · `OUT_OF_SCOPE` · `NOT_FOUND` · `CAPABILITY_DISABLED`.

## 6. Backend ↔ AI Server

| 경로(AI Server) | 호출자 | 인증 | 목적 | 실패 처리 |
| --- | --- | --- | --- | --- |
| `GET /health` | compose healthcheck · Backend 상태 확인 | 없음 | 생존 · 공급자 이름 | — |
| `POST /v1/extractions/reply` | Worker(추출 처리기) | **없음**(내부망 · 루프백 바인딩에 의존 — 문서 검토 발견 1) | 회신 추출(요청 = 메시지 원문 · Backend 가 정한 질문 · 기준 날짜, 응답 = 후보 + 인용 + 모델 판) | 시간 초과 · 5xx → 자동 재시도(3회, 간격) → 사람 검토 |
| `POST /v1/agent-runs/{id}/start` · `/resume` | API Coordinator · Worker 재조정 | 서비스 토큰(Bearer, 상수 시간 비교) | 그래프 구동 → interrupt · 끝까지 | 연결 실패 · 시간 초과 · 5xx → `WAITING_RUNTIME` → 재시도(3회) |

계약 파일: `packages/contracts/ai/`(`python -m cera_ai.emit_schema` 로 생성, 양쪽 시험이 검사).

## 7. 외부 인터페이스

| 대상 | 목적 | 방향 | 인증 | 실패 처리 | 재시도 | 시간 상한 | 저장 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gmail API | 문의 발송 · 회신 수신 · 화해 조회 | 양방향(Worker) | OAuth 2.0 Installed App · refresh token(CERA 전용 계정 하나, `npm run gmail:auth`) | 5xx · 4xx 분류(`GMAIL_TOKEN_REVOKED` 등) · 영구 실패는 `DELIVERY_FAILED` | 일시 실패 최대 5회(30초부터 지수, 상한 10분) · 결과 모름은 화해 | 30 s · 수신 메일 10 MB 상한 [ASSUMPTION] | 원문 → ContentStore · `raw_input` · `send_attempt` |
| LLM 공급자(Gemini · OpenAI · Anthropic · 로컬) | 회신 추출 | AI Server → 공급자 | API 키(`ai/.env`) | 기술 오류 → 대체 공급자 한 번(설정 시) · 실패 기록 | Backend 자동 재시도 3회 | 상용 120 s · 로컬 300 s [ASSUMPTION] | 후보만(`extraction`) · 모델 판 |
| 공공데이터(data.go.kr DS-03 · DS-02) | 입항 선박 · 적하목록 | Backend → 공공 API | 서비스 키(`DATA_GO_KR_SERVICE_KEY`) | `UPSTREAM_ERROR` · `TRANSPORT_ERROR` · `PARSE_ERROR` · `NO_DATA` 기록 · 키 없음 `PUBLIC_DATA_KEY_MISSING` | 없음(사람 · Agent 가 다시 요청) | 30 s · 최대 20쪽 [ASSUMPTION] | 원본 → 폴더(gitignore) · `public_data_fetch` · 정규화 표 |
| UNI-PASS(DS-01) | 통관 진행 | — | 키 항목만 | — | — | — | [향후] 어댑터 없음 |
