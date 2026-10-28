# 02. CERA 요구사항 분석서

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 확정(2026-10-28 구현 기준) — **구현된 요구사항만** 적는다. 구현되지 않은 것은 9절 |
| 기준 | HEAD `5881529` + T-132. 근거 순서: 코드 → migration(M01~M36) → OpenAPI(`packages/contracts/openapi.json`) → 시험 → 최신 docs |
| 관련 문서 | [01 기획서](01_service-plan.md) · [03 유스케이스](03_use-cases.md) · [07 API](07_interface-api.md) · [05 DB](05_data-model-and-tables.md) · [09 추적성](09_traceability-matrix.md) · [11 용어집](11_glossary.md) |

## 1. ID 체계와 우선순위

- 기능: `FR-<영역>-<번호3자리>` — AUTH(인증 · 권한) · RUN(복구 실행) · DETECT(예외 탐지) · AGENT · REG(등록부) · COMM(연락) · EXT(추출) · TRUTH(사실) · INPUT(운영 입력) · PLAN(비용 · 계획) · SOLVER · FU(후속) · PUB(공공데이터) · AUDIT · OPS(운영) · DEMO
- 비기능: `NFR-<영역>-<번호3자리>` — SEC · REL · INT(데이터 무결성) · AUDIT · PERF · OBS · DEP · MNT
- 기존 설계 문서의 ID(`docs/03` 의 FR-OPR · FR-OPT, `docs/19` 의 FR-ELG · FR-APV · FR-SND 등)는 **설계 시점 요구사항**이라 구현되지 않은 항목도 섞여 있다. 이 문서는 구현 기준으로 새 ID 를 붙이고, 대응되는 옛 ID 는 "비고"에 적는다.
- 우선순위: **P0** = 핵심 흐름(이것이 없으면 CERA 가 아니다) · **P1** = 안전 · 복구 · 운영에 중요 · **P2** = 보조 · 시연 · 선택
- 상태: **구현** = 코드 + 시험 있음 · **구현(검증 제한)** = 코드는 있으나 실제 외부 환경 검증이 일부 · **부분** = 일부만

카드 형식(각 요구사항): 설명 · 목적 / Actor · 권한 / 사전조건 / 입력 / 처리 / 출력 / 예외 / API / 테이블 / 시험 / 우선순위 · 상태 / 비고.
시험 경로는 `back/test/{unit,db}/`, `ai/tests/`, `front/web/src/` 기준이다.

## 2. 역할 · 권한 표 (정본 `back/src/auth/permissions.ts`)

| 권한 | ADMIN | OPERATOR | FIELD_OPERATOR | DEMO_VISITOR |
| --- | :-: | :-: | :-: | :-: |
| `read` | ✓ | ✓ | ✓ | ✓ |
| `agent_run.manage` | ✓ | ✓ | | ✓ |
| `communication.draft` | ✓ | ✓ | | ✓ |
| `communication.approve` | ✓ | ✓ | | ✓ |
| `communication.send` | ✓ | ✓ | | ✓ |
| `truth.review` | ✓ | ✓ | | ✓ |
| `truth.manual_entry` | ✓ | ✓ | ✓ | ✓ |
| `extraction.retry` | ✓ | ✓ | | ✓ |
| `plan.recalculate` | ✓ | ✓ | | ✓ |
| `plan.approve` | ✓ | ✓ | | ✓ |
| `planning.input` | ✓ | ✓ | | |
| `public_data.fetch` | ✓ | ✓ | | |
| `contact.select` | ✓ | ✓ | | ✓ |
| `registry.manage` | ✓ | | | |
| `users.manage` | ✓ | | | |

규칙(`back/src/auth/auth.guard.ts`): `@Public()` 은 통과 · 선언 없는 GET 은 `read` · **선언 없는 변경 요청은 거부**(`PERMISSION_NOT_DECLARED`).

## 3. 영역별 요약

| 영역 | 기능 요구사항 | P0 | P1 | P2 |
| --- | ---: | ---: | ---: | ---: |
| AUTH 인증 · 권한 · 사용자 | 6 | 2 | 3 | 1 |
| RUN 복구 실행 | 3 | 1 | 1 | 1 |
| DETECT 예외 탐지(T-132) | 5 | 3 | 2 | 0 |
| AGENT | 8 | 5 | 3 | 0 |
| REG 등록부 · Contact Gate | 10 | 3 | 7 | 0 |
| COMM 연락 · 채널 | 11 | 6 | 5 | 0 |
| EXT 추출 | 5 | 2 | 3 | 0 |
| TRUTH 사실 | 7 | 4 | 3 | 0 |
| INPUT 운영 입력 | 5 | 0 | 5 | 0 |
| PLAN · SOLVER | 7 | 6 | 1 | 0 |
| FU 후속 · 정정 · 취소 | 4 | 1 | 3 | 0 |
| PUB 공공데이터 | 3 | 0 | 0 | 3 |
| AUDIT | 2 | 1 | 1 | 0 |
| OPS 운영 | 3 | 0 | 2 | 1 |
| DEMO 시연 · 포트폴리오 | 2 | 0 | 0 | 2 |
| **합계(기능)** | **83** | **34** | **41** | **8** |
| 비기능(8절) | 28 | | | |

## 4. 기능 요구사항 — 인증 · 권한 · 복구 실행

### FR-AUTH-001 로그인 · 세션 (P0 · 구현)
- 설명 · 목적: 사람 사용자가 아이디 · 비밀번호로 로그인하고 세션 쿠키로 이후 요청의 행위자가 정해진다. 승인 · 확인의 주체를 사람 계정으로 고정한다.
- Actor · 권한: 모든 사람 사용자 · `PUBLIC`(로그인) · `read`(`/auth/me`)
- 사전조건: 활성 계정 · 활성 HUMAN actor
- 입력: `login_id`, `password`
- 처리: scrypt 비밀번호 대조(상수 시간) → 32바이트 난수 토큰 → DB 에는 sha256 지문만 저장 → 감사 `AUTH_LOGIN`
- 출력: HttpOnly · SameSite=Strict(production 은 Secure) 쿠키 `cera_session`, 사용자 · 역할 · 권한 목록
- 예외: 틀린 비밀번호 · 없는 계정 모두 401 `INVALID_CREDENTIALS`(구분하지 않음)
- API: `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`
- 테이블: `user_account` · `user_session` · `actor` · `audit_log`
- 시험: `db/auth.test.ts`
- 비고: 세션 수명 기본 720분 [ASSUMPTION] (`CERA_SESSION_TTL_MINUTES`)

### FR-AUTH-002 로그인 실패 제한 (P1 · 구현)
- 설명: 계정 이름별 15분에 5번 실패하면 잠시 막는다 [ASSUMPTION]. 포트폴리오 모드에서는 IP 별 15분 20회 한도가 더해진다.
- 출력 · 예외: 429 `LOGIN_RATE_LIMITED` / 429 `RATE_LIMITED`
- API: `POST /auth/login` · 테이블: 없음(프로세스 메모리) · 시험: `db/auth.test.ts` · `unit/portfolio.test.ts`
- 비고: API 인스턴스마다 따로 센다(다중 인스턴스 시 [향후] 공유 저장 필요)

### FR-AUTH-003 역할 기반 권한 강제 (P0 · 구현)
- 설명: 모든 요청을 전역 Guard 가 2절 표로 판정한다. 화면 숨김과 무관하다.
- 처리: 세션 → 역할 → 필요한 권한 비교. 선언 없는 변경 경로는 거부
- 예외: 401 `AUTH_REQUIRED` · 403 `PERMISSION_DENIED` · 403 `PERMISSION_NOT_DECLARED`
- 테이블: `user_account` · 시험: `db/auth.test.ts` · `unit/portfolio.test.ts` · `db/portfolio.test.ts`
- 비고: 옛 ID FR-UI 권한 항목

### FR-AUTH-004 행위자 사칭 방지 (P1 · 구현)
- 설명: session 모드에서 요청 헤더 `X-CERA-Actor-Id` 를 지우고 세션 사용자로 다시 채운다. `dev-header` 모드는 local · test 에서만 허용(설정 검사).
- 테이블: `actor` · 시험: `db/auth.test.ts` · `db/portfolio.test.ts`(옛 헤더로 사칭 시도 → 401)

### FR-AUTH-005 사용자 · 역할 관리 (P1 · 구현)
- Actor · 권한: ADMIN · `users.manage`
- 입력: `login_id`, `display_name`, `role`, `password`(12자+) / 변경: `role`, `is_active`, `password`
- 처리: 사용자 생성 = HUMAN actor + 계정 · 역할 · 활성 · 비밀번호가 바뀌면 그 사용자의 열린 세션을 모두 끊는다 · 감사 `USER_CREATED` · `USER_UPDATED`
- 예외: 409 `LOGIN_ID_TAKEN` · 409 `CANNOT_DEMOTE_SELF`
- API: `GET · POST /admin/users` · `PATCH /admin/users/{userId}` · 테이블: `user_account` · `user_session` · `actor` · `audit_log` · 시험: `db/auth.test.ts`
- 비고: 관리 화면은 없다(API 만) — [향후]

### FR-AUTH-006 공개 데모 방문자 세션 (P2 · 구현)
- 설명: 포트폴리오 모드에서만 비밀번호 없이 데모 방문자(DEMO_VISITOR) 계정 하나에 세션을 연다.
- 사전조건: `CERA_PORTFOLIO_DEMO_MODE=true` + 포트폴리오 시드가 만든 데모 계정(비밀번호 = 아무도 모르는 난수)
- API: `GET · POST /auth/demo-session`(일반 배포에는 경로 없음 — 404)
- 예외: 409 `DEMO_NOT_READY` · 429 `RATE_LIMITED`(IP 별 시간당 10)
- 테이블: `user_account` · `user_session` · `audit_log` · 시험: `db/portfolio.test.ts`
- 비고: ADR-039(Proposed)

### FR-RUN-001 시나리오 복구 실행 (P2 · 구현)
- 설명: 합성 시나리오 팩(`data/scenarios/busan-wh-capacity-01`)을 시드로 넣어 시뮬레이션 실행(`contains_simulated = true`)을 만든다. 시연 · 시험용.
- 처리: `npm run db:seed` — 시설 · 거래처 · 주소(`*.invalid`, MOCK) · 트럭 풀 · 스냅숏 · 실행 · 창고 A 수용량 초기 사건(사람 입력 경로). 반복 실행 안전
- 예외: local · test · 포트폴리오 모드가 아니면 시드 거부
- 테이블: `scenario` · `planning_snapshot` · `recovery_run` · `facility` · `counterparty*` · `truck_pool` · `raw_input` · `event` · 시험: `db/persistence.test.ts` · `db/invariants.test.ts`
- 비고: 시드 실행의 트리거 값은 `EXCEPTION_DETECTED`. 운영 데이터에서 예외를 찾아 실행을 만드는 것은 FR-DETECT(T-132)

### FR-RUN-002 실제 복구 실행 생성 (P1 · 구현)
- 설명: 운영자가 시나리오 없이 실제 실행(`contains_simulated = false`)을 만들고 운영 입력(FR-INPUT)으로 계산한다.
- Actor · 권한: OPERATOR · ADMIN · `planning.input`
- API: `POST /planning/runs` · 테이블: `planning_snapshot` · `recovery_run` · 시험: `db/live-planning.test.ts`
- 비고: 트리거 값 `OPERATOR_REQUEST`

### FR-DETECT-001 창고 수용량 부족 결정론 탐지 (P0 · 구현 · T-132)
- 설명 · 목적: 사람이 문제를 먼저 찾지 않아도, 창고 × 날짜마다 예정 반입 수(운영 기준 계획 · 시나리오 원래 계획)와 수용량 사실 `capacity.day(D)` 를 비교해 부족을 찾는다. **LLM 을 쓰지 않는다**
- Actor: 시스템(탐지기 — API · Worker 프로세스) · 사전조건: `CERA_EXCEPTION_DETECTION=on`
- 처리: shortage = 예정 − 수용량 > 0 이면 예외. 사실 품질: 확정 · 관측 → 단정 / 임시 → 기록만(근거 PROVISIONAL) / 오래됨 · 철회 · 검토 필요 · 없음 → 판단 불가(새 예외 없음 · 해소 없음). 넘치는 컨테이너 = 계획 순서(출발 시각 → 번호)의 뒤쪽. 기준 시각은 경계에서 한 번(LIVE = 지금 · 시나리오 = 스냅숏), 범위 = 계획 범위 3일
- 출력: 예외(`ACTIVE`) + 관측 기록(DETECTED, 근거: 수용량 사건 id · 운영 입력 묶음 id · 넘치는 컨테이너 · 기준 시각) · 감사 `EXCEPTION_DETECTED`
- 위치: `back/src/detection/exception-rules.ts`(순수) · `exception-detector.service.ts`
- 테이블: `operational_exception` · `operational_exception_observation` · 시험: `unit/exception-rules.test.ts` · `db/exception-detection.test.ts`

### FR-DETECT-002 예외 → 복구 실행 자동 생성 (P0 · 구현)
- 설명: 근거가 CONFIRMED 인 진행 중 예외에 복구 실행을 하나 만든다(트리거 `EXCEPTION_DETECTED` · 참조 `EXCEPTION:<id>`). LIVE 는 새 스냅숏 + 운영 기준 계획의 지금 판을 그 실행의 계획 입력으로 옮겨 적고, 시나리오는 시드 스냅숏 위의 새 시뮬레이션 실행. **Agent 는 자동 시작하지 않는다** — 문의 수량 · 시간대는 사람이 정한다(그래프 안전 정책). 외부 연락은 사람 승인 뒤에만
- 출력: 실행 목록 `source = AUTO_DETECTED` + 예외 요약 · 운영 콘솔 할 일 "자동 탐지된 예외 — Agent 시작이 필요합니다" · 감사 `EXCEPTION_RUN_CREATED`
- 테이블: `recovery_run` · `planning_snapshot` · `planning_input_batch` · `planning_container_record` · 시험: `db/exception-detection.test.ts`

### FR-DETECT-003 중복 방지 (P0 · 구현)
- 설명: 진행 중 예외는 정체(종류 · 범위 · 시나리오 · 시설 · 날짜)마다 하나(부분 유일 인덱스) · 탐지는 트랜잭션 advisory lock 으로 한 번에 하나 · 실행 연결은 한 번 채움 · 근거 지문이 같으면 관측 기록 없음. API · Worker · 재시작 · Redis 유무와 무관
- 시험: `db/exception-detection.test.ts`(반복 · 동시 · 새 프로세스) · Staging E2E(Worker · Redis · API 재시작)

### FR-DETECT-004 예외 수명주기 (P1 · 구현)
- 설명: `ACTIVE → RESOLVED`(끝 — 다시 부족하면 새 예외). 근거 변화(수용량 8 → 6)는 같은 예외의 CHANGED 관측. 해소 = 확정 수용량 충분 · 예정 0 · (LIVE) 날짜 경과. 실행 · 계획 기록은 지우지 않는다. 호출 시점 = 사실 · 운영 입력 변경 알림 + Worker 주기(기본 30초 [ASSUMPTION])
- 테이블: `operational_exception`(M38 가드) · 시험: `unit/exception-rules.test.ts` · `db/exception-detection.test.ts`

### FR-DETECT-005 예외 조회 · 화면 표시 (P1 · 구현)
- API: `GET /exceptions?status=` · `GET /exceptions/{exceptionId}`(관측 기록) · `POST /exceptions/detect`(사람 요청, `plan.recalculate`, 꺼져 있으면 409 `EXCEPTION_DETECTION_OFF`) · `GET /planning/runs`(source · exception)
- 화면: 실행 목록 [자동 탐지] 배지 + "창고 A 수용량 부족 · 10-13 예정 20 / 가능 8 · 영향 12대" · 개요 숫자(진행 중 예외 · 오늘 탐지 · 사람 대기 · 진행 중 복구 실행) · `/demo` 가 자동 실행을 따라감
- 시험: `db/exception-detection.test.ts` · `front/web/src/components/ops/ops.test.tsx`

### FR-RUN-003 복구 실행 목록 (P0 · 구현)
- 설명: 실행마다 시뮬레이션 여부 · Agent 상태 · 대기 사유 · 현재 판을 보여 준다.
- API: `GET /planning/runs`(`PlanningRunController`, `back/src/communication/draft.controller.ts`) · 테이블: `recovery_run` · `agent_run` · `recovery_plan` · 시험: `front/web/src/components/ops/ops.test.tsx`(그룹 · 표시), `db/drafts.test.ts`

## 5. 기능 요구사항 — Agent · 등록부

### FR-AGENT-001 Agent 실행 생성 · 시작 (P0 · 구현)
- 설명: 복구 실행 하나에 Agent 실행을 만들고 시작한다. 목표 · 매개변수(예: `plan_recovery` — 계획까지 진행할지)를 받는다.
- Actor · 권한: OPERATOR · ADMIN · DEMO_VISITOR · `agent_run.manage`
- 처리: `agent_run`(CREATED) → Backend Coordinator 가 AI Server `POST /v1/agent-runs/{id}/start` 호출 → 그래프 구동 → interrupt 나 끝에서 반환
- 출력: 상태(`RUNNING` · `WAITING_*` · `COMPLETED` · `FAILED`)와 대기 사유
- API: `POST /agent-runs` · `POST /agent-runs/{agentRunId}/start` · `GET /agent-runs` · `GET /agent-runs/{agentRunId}` · `GET /agent-runs/runtime`
- 테이블: `agent_run` · `agent_step` · `agent_tool_call` · `agent_checkpoint(_write)` · 시험: `db/agent-runtime.test.ts` · `db/processes.test.ts` · `ai/tests/test_agent_graph.py`

### FR-AGENT-002 정보 공백 판정 (P0 · 구현)
- 설명: 계획에 필요한데 믿을 만한 값이 없는 사실을 Backend 결정론 규칙이 판정한다(LLM 아님).
- 처리: 계획 날짜의 창고 · ODCY 일 수용량, 협력 트럭 풀의 시간대 가용을 사실 표와 대조 → 공백마다 상태(`MISSING` · `ASKED` · 임시 · 확인 대기 등) · 소유 거래처 · 추천 문의 종류
- API: Agent Tool `get_information_gaps`(`/internal/agent-tools/get_information_gaps`) — 사람용 API 없음
- 테이블: `canonical_fact` · `facility` · `truck_pool` · `comm_message` · 시험: `db/agent-tools.test.ts` · `unit/agent-tools.test.ts`
- 비고: 화면은 사실 · 문의 · 준비도로 공백을 다시 조합해 보여 준다(`docs/16` 13절 한계)

### FR-AGENT-003 다음 행동 선택 (P0 · 구현)
- 설명: 그래프가 공백 상태로 다음 행동(`COMMUNICATION` · `PUBLIC_DATA` · `WAIT_EXTERNAL` · `PLAN` · `COMPLETE` · `FAIL`)을 고른다. **기본 정책은 결정론(`DeterministicPolicy`)** 이며 LLM 을 쓰지 않는다.
- 위치: `ai/cera_ai/agent/graph.py` · 시험: `ai/tests/test_agent_graph.py`
- 비고: 의미 판단 정책은 끼울 수 있게만 되어 있고 허용된 행동 외 값은 실패로 처리 [향후]

### FR-AGENT-004 사람 · 외부 대기와 재개 (P0 · 구현)
- 설명: 승인 · 발송 요청 · 회신 · 사실 확인 · 계획 결정 · 연락처 문제에서 그래프가 멈추고(interrupt) 업무 기록이 바뀌면 이어 간다.
- 출력: `WAITING_HUMAN` / `WAITING_EXTERNAL` + 대기 사유([11 용어집](11_glossary.md) 2.2)
- API: `POST /agent-runs/{agentRunId}/resume` · 사람 행동 API(승인 · 확인 등) 뒤 자동 깨움
- 테이블: `agent_run` · `agent_checkpoint` · 시험: `db/agent-runtime.test.ts` · `unit/agent-wake-rules.test.ts`

### FR-AGENT-005 재조정 · 재시작 회복 (P1 · 구현)
- 설명: Worker 의 `AgentReconciler` 가 주기마다 기다리던 기록이 바뀐 실행과 재시도 시각이 된 실행을 깨운다. 알림을 놓쳐도(재시작) 영구 정지하지 않는다. 기다리는 실행 전부를 쪽 단위로 읽는다(T-108).
- 테이블: `agent_run` · 시험: `db/agent-reconcile-paging.test.ts` · `db/processes.test.ts` · `db/agent-runtime.test.ts`

### FR-AGENT-006 Agent Tool 경계 (P0 · 구현)
- 설명: Agent 는 Backend 의 Tool 14개로만 부작용을 만든다. 서비스 토큰(32자+) · 실행 id 가 필요하고, 변경 Tool(`create_inquiry_draft` · `request_approval` · `propose_recovery_plan`)은 멱등 키(`Idempotency-Key`)도 필수다. 호출마다 기록된다. 승인 · 발송은 Tool 에 없다(`request_approval` 은 승인 대기열에 넣는 요청일 뿐).
- API: `GET /internal/agent-tools` · `POST /internal/agent-tools/{tool}` · `/internal/agent-runtime/*`(체크포인트 · 단계)
- 테이블: `agent_tool_call` · `agent_step` · `agent_checkpoint(_write)` · 시험: `db/agent-tools.test.ts` · `unit/agent-tools.test.ts` · `ai/tests/test_tools.py`
- 비고: ADR-036. Tool 목록은 [07 API](07_interface-api.md) 5절

### FR-AGENT-007 Agent 실행 취소 (P1 · 구현)
- API: `POST /agent-runs/{agentRunId}/cancel` · 권한 `agent_run.manage` · 테이블: `agent_run` · 시험: `db/agent-runtime.test.ts`

### FR-AGENT-008 Runtime 일시 장애 재시도 · 상한 (P1 · 구현)
- 설명: AI Server 연결 실패 · 시간 초과 · 5xx 면 `WAITING_RUNTIME` 으로 두고 다시 시도(기본 3회, 30초부터 2배 [ASSUMPTION]). 그래프 단계 100 · Tool 호출 50 · Tool 재시도 3 비상 상한 [ASSUMPTION / DEVELOPMENT SAFETY CEILING].
- 시험: `unit/agent-runtime-client.test.ts` · `ai/tests/test_runtime_limits.py` · `db/agent-runtime.test.ts`

### FR-REG-001 등록부 조회 (P0 · 구현)
- 설명: 거래처 · 담당자 · 주소(자격 판정 포함) · 시설(운영 거래처 포함)을 본다.
- API: `GET /registry/counterparties` · `GET /registry/facilities` · `GET /registry/addresses/{addressId}/eligibility`
- 테이블: `counterparty` · `counterparty_contact` · `contact_channel_address` · `facility` · `truck_pool` · 시험: `db/registry.test.ts`

### FR-REG-002 거래처 등록 (P1 · 구현)
- 권한: ADMIN · `registry.manage` · API: `POST /registry/counterparties` · 테이블: `counterparty` · 시험: `db/contact-registration.test.ts` · 비고: T-127

### FR-REG-003 담당자 · 주소 등록 (P1 · 구현)
- 설명: 실행 중에도 담당자 · 주소를 등록한다. 새 주소는 확인 · 승인 전 상태로 시작하고 자동 승인되지 않는다. "CERA 밖에서 확인함"을 표시하면 확인 상태로 등록.
- 권한: `registry.manage` · API: `POST /registry/counterparties/{counterpartyId}/contacts` · 테이블: `counterparty_contact` · `contact_channel_address` · 시험: `db/contact-registration.test.ts` · `db/registry.test.ts`
- 예외: 409 중복 주소

### FR-REG-004 주소 승인 · 거절 (P1 · 구현)
- API: `POST /registry/addresses/{addressId}/approve` · `POST /registry/addresses/{addressId}/reject` · 권한 `registry.manage` · 테이블: `contact_channel_address` · `audit_log` · 시험: `db/contact-lifecycle.test.ts`

### FR-REG-005 주소 통신 상태 · 담당자 활성 변경 (P1 · 구현)
- 설명: 주소를 `ACTIVE` · `PAUSED` · `INACTIVE`(예: 퇴사)로, 담당자를 활성/비활성으로. 이미 승인된 초안도 발송 직전 Gate 에서 다시 막힌다.
- API: `PATCH /registry/addresses/{addressId}/status` · `PATCH /registry/contacts/{contactId}` · 테이블: `contact_channel_address` · `counterparty_contact` · 시험: `db/contact-lifecycle.test.ts` · 비고: T-129

### FR-REG-006 시설 운영 거래처 지정 (P1 · 구현)
- 설명: 시설(ODCY · 창고)의 운영 회사를 정한다. 문의 · 후속은 이 회사의 주소로만 간다(다른 회사로 대신 보내지 않음).
- API: `PATCH /registry/facilities/{facilityId}/operator` · 테이블: `facility` · 시험: `db/contact-routing.test.ts`

### FR-REG-007 Contact Gate (P0 · 구현)
- 설명: 주소가 지금 발송 자격이 있는지 결정론으로 판정한다: 거래처 활성 · 담당자 활성 · 메일 확인 · 관계 승인 · 통신 활성 · Mock/Real 일치 · (비운영 환경 실채널) 수신 허용 목록. **승인 때와 발송 직전에 두 번** 본다.
- 예외: 403 `RECIPIENT_NOT_ELIGIBLE`(막은 조건을 구분해 보임)
- 위치: `back/src/registry/contact-gate.ts` · 테이블: `contact_channel_address` · `counterparty_contact` · `counterparty` · 시험: `unit/contact-gate.test.ts` · `db/registry.test.ts` · `db/send.test.ts`
- 비고: 옛 ID FR-ELG-01~05

### FR-REG-008 받는 주소 사람 선택 (P0 · 구현)
- 설명: 연락 가능한 주소가 여럿이면 CERA 는 고르지 않고(`CONTACT_SELECTION_REQUIRED`) 사람이 이번 한 건의 주소를 고른다. 처음에 아무것도 미리 고르지 않는다. Backend 가 소속 회사 · 역할 · Mock/Real · Gate 를 다시 판정한다.
- 권한: `contact.select`(ADMIN · OPERATOR · DEMO_VISITOR)
- API: `POST /agent-runs/{agentRunId}/contact-selection` · `POST /planning/plans/{planId}/follow-ups/contact-selection`
- 예외: 422 `WRONG_COUNTERPARTY` · 422 `ROLE_MISMATCH` · 422 `SIMULATION_MISMATCH` · 403 `RECIPIENT_NOT_ELIGIBLE` · 409 `NOT_WAITING_FOR_CONTACT_SELECTION` · 409 `GAP_ALREADY_RESOLVED` · 409 `FOLLOW_UP_ALREADY_DRAFTED`
- 테이블: `contact_selection`(append-only — 다시 고르면 새 행) · `audit_log` · 시험: `db/contact-lifecycle.test.ts` · 비고: T-129 · M34 · M35

### FR-REG-010 시설 · 트럭 풀 등록 (P1 · 구현 · T-132)
- 설명: 시드가 없는 Private Staging · 운영에서 관리자가 창고 · ODCY · 터미널과 트럭 풀(자사 · 협력 — 협력은 소유 운송사 필수)을 등록한다. 같은 이름 409. 운영 입력의 목적지 · 수용량 사실 · 예외 탐지가 이 시설을 가리킨다
- 권한: `registry.manage` · API: `POST /registry/facilities` · `POST /registry/truck-pools` · 감사 `FACILITY_CREATED` · `TRUCK_POOL_CREATED`
- 테이블: `facility` · `truck_pool` · 시험: `db/exception-detection.test.ts`

### FR-REG-009 등록 · 선택 뒤 Agent 깨우기 (P1 · 구현)
- 설명: 연락처 등록 · 승인(`REGISTRY_CHANGED`)이나 선택(`CONTACT_SELECTED`)이 그 대기를 풀 수 있으면 Agent 를 깨운다. 미승인 주소 · Real 실행의 Mock 주소로는 깨우지 않는다.
- 위치: `back/src/agent-tools/wake-rules.ts` · 시험: `unit/agent-wake-rules.test.ts` · `ai/tests/test_agent_graph.py`

## 6. 기능 요구사항 — 연락 · 추출 · 사실

### FR-COMM-001 문의 초안 생성 (P0 · 구현)
- 설명: 문의 종류(`TRUCK_SLOT` · `FACILITY_CAPACITY`)와 구조화 값(수량 · 날짜 · 시간대 · 크기 유형)으로 초안을 만든다. 질문 대상(개체 · 사실 키 · 범위)은 생성 때 Backend 가 확정한다. Agent(Tool `create_inquiry_draft`)나 사람이 만든다.
- 권한: `communication.draft`
- 입력: `address_id`, `intent`, `target_id`, `values[]`, `source_run_id`
- 예외: 403 `RECIPIENT_NOT_ELIGIBLE` · 422 `SIMULATION_MISMATCH`(시뮬레이션 값 → 실채널) · 400 형식 오류
- API: `POST /communication/drafts` · `GET /communication/drafts` · `GET /communication/drafts/{messageId}`
- 테이블: `comm_thread` · `comm_message` · `question_item` · `comm_message_question` · `comm_message_structured_field` · 시험: `db/drafts.test.ts` · 비고: 옛 FR-COM

### FR-COMM-002 숫자 검사 (P0 · 구현)
- 설명: 초안 문장에 적힌 숫자가 구조화 값과 같은지 결정론으로 검사한다. 다르면 승인할 수 없다(`HUMAN_ACTION_REQUIRED`).
- 위치: `back/src/communication/number-check.ts` · 시험: `unit/draft-number-check.test.ts` · `db/drafts.test.ts`

### FR-COMM-003 초안 수정 (P1 · 구현)
- 입력: 제목(200자) · 본문(4000자) · 값 · API: `POST /communication/drafts/{messageId}/revisions` · 권한 `communication.draft` · 테이블: `comm_message` · `comm_message_structured_field` · 시험: `db/drafts.test.ts`
- 비고: 값이 계획 값과 다르면 사람 입력 값이 된다(출처 끊김)

### FR-COMM-004 발송 승인 · 반려 · 승인 취소 (P0 · 구현)
- 설명: 사람이 내용 지문(`content_hash`)을 확인하고 승인한다. 승인 시 받는 주소 · 구조화 값 사본을 고정한다. 유효 기한(기본 24시간 [ASSUMPTION]) 이 지나면 다시 승인해야 한다. Agent · 시스템은 승인할 수 없다(DB 가 HUMAN 만 허용).
- 권한: `communication.approve`
- 예외: 409 `CONTENT_CHANGED` · 403 `RECIPIENT_NOT_ELIGIBLE` · 409 만료 · 403 AI · 시스템 행위자
- API: `POST /communication/drafts/{messageId}/approve` · `.../reject` · `POST /communication/approvals/{approvalId}/revoke` · `GET /communication/approvers`
- 테이블: `message_approval` · `message_approval_structured_field` · `message_status_transition` · `audit_log` · 시험: `db/approvals.test.ts` · `unit/approval-rules.test.ts` · 비고: 옛 FR-APV-01~12(FR-APV-07 = 유효 기한)

### FR-COMM-005 발송 요청 (P0 · 구현)
- 설명: 승인만으로는 나가지 않는다. 사람이 발송을 요청하면 승인 · 지문 · Gate · 계획 무효 여부를 잠근 상태에서 다시 확인하고 `QUEUED` 로 넣는다. 멱등(두 번 눌러도 한 번).
- 권한: `communication.send`
- 예외: 409 `CONTENT_CHANGED` · `NOT_APPROVED` · `PLAN_SUPERSEDED` · `CHANNEL_UNAVAILABLE` · 403 `RECIPIENT_NOT_ELIGIBLE` · 403 `PORTFOLIO_DEMO_REAL_CHANNEL_BLOCKED`(포트폴리오)
- API: `POST /communication/drafts/{messageId}/send` · 테이블: `message_status_transition` · `audit_log` · 시험: `db/send.test.ts` · `unit/send-rules.test.ts` · `db/portfolio.test.ts`

### FR-COMM-006 Worker 발송 · 재시도 · 화해 (P0 · 구현)
- 설명: Worker 가 발송 대기를 집어(`FOR UPDATE SKIP LOCKED`) 시도를 먼저 기록하고 채널로 보낸 뒤 결과를 한 번 남긴다. 일시 실패는 지수 간격 재시도(최대 5회, 첫 간격 30초, 상한 10분 [ASSUMPTION]). 결과 모르는 시도는 일정 시간 뒤 화해(보낸 편지함 조회)로 중복 발송을 막는다.
- 테이블: `send_attempt` · `message_status_transition` · `comm_message` · 시험: `db/send.test.ts` · `db/gmail-channel.test.ts` · `unit/send-rules.test.ts`
- 비고: 발송 워커는 advisory lock 으로 하나만 돈다

### FR-COMM-007 발송 차단 스위치 (P1 · 구현)
- 설명: `CERA_SENDING_PAUSED=true` 면 승인 · 발송 요청은 되지만 Worker 가 보내지 않고 대기에 둔다. 옛 FR-SND-12.
- 시험: `db/send.test.ts`

### FR-COMM-008 회신 수신 · 원문 보존 · 발신자 판정 (P0 · 구현)
- 설명: Worker 가 채널 수신함을 읽어 원문을 내용 저장소에 보존하고(DB 에는 참조 · 해시), 스레드에 연결하고, 발신자를 등록부와 대조한다. 등록되지 않은 발신자 등은 보류(HOLD)하고 AI 에 보내지 않는다. 중복 수신은 외부 메시지 id UNIQUE 가 막는다.
- API: `GET /communication/inbound`(조회) · 테이블: `raw_input` · `comm_message`(INBOUND) · `comm_thread` · 시험: `db/inbound.test.ts` · `unit/inbound-rules.test.ts`
- 비고: 보류함을 푸는 API 는 없다 — 조회만. 보류함 화면은 `/prototype` 에만

### FR-COMM-009 Gmail 채널 (P1 · 구현(검증 제한))
- 설명: CERA 전용 Gmail 계정 하나로 보내고 받는다(OAuth 2.0 Installed App · refresh token). 비운영 환경에서는 수신 허용 목록이 비어 있으면 실채널 발송을 전부 막는다(fail-closed). 5xx · 4xx 오류를 분류(`GMAIL_TOKEN_REVOKED` 등)한다.
- 설정: `CERA_GMAIL_ENABLED` 와 `GMAIL_*` · 시험: `unit/gmail-channel.test.ts` · `db/gmail-channel.test.ts`(가짜 Gmail)
- 비고: 2026-10-27 테스트 계정으로 실제 왕복 1회 검증. Testing 모드 refresh token 약 7일 [외부 의존]

### FR-COMM-010 Mock 채널 · Mock 회신 도우미 (P1 · 구현)
- 설명: 네트워크 없이 파일 "보낸 편지함 · 수신함"으로 발송 · 수신한다. 시연 · 시험에서 Mock 상대의 답장을 넣는 도우미가 있다(local · test · 포트폴리오 모드에서만). 포트폴리오 모드는 정해진 문장 · `.invalid` 발신자만 받는다.
- API: `POST /dev/demo/mock-reply`(권한 `communication.draft`) · `GET /dev/demo/status`(PUBLIC) · 시험: `db/send.test.ts` · `db/inbound.test.ts` · `db/portfolio.test.ts`

### FR-COMM-011 계획이 바뀌면 승인 무효화 (P1 · 구현)
- 설명: 계획 기반 초안의 승인은 그 계획 판이 새 판에 밀리면 무효(`INVALIDATED` · `PLAN_SUPERSEDED`)가 되고 발송할 수 없다.
- 테이블: `message_approval` · 시험: `db/approvals.test.ts` · `db/recovery-plan.test.ts`

### FR-EXT-001 회신 추출 요청 (P0 · 구현)
- 설명: Worker 가 수신한 회신을 AI Server 에 보내 값 후보를 받는다. AI 에 주는 질문은 CERA 가 이미 물은 것(질문 행 · 구조화 값)으로 Backend 가 정한다.
- 처리: Backend → `POST /v1/extractions/reply`(AI Server, 내부) → 후보(값 + 원문 인용) · 공급자 · 모델 판
- 테이블: `extraction` · 시험: `db/extraction.test.ts` · `db/ai-server.test.ts` · `ai/tests/test_ai_server.py`

### FR-EXT-002 결정론 검증 (P0 · 구현)
- 설명: AI 의 답을 믿지 않는다. 후보마다 원문에 인용이 있는가(`QUOTE_IN_SOURCE`) · 값이 인용 안에 있는가(`VALUE_IN_QUOTE`) · 형식 · 단위 · 물은 범위(`QUESTION_SCOPE`) · 물은 항목인가(`FIELD_NOT_ASKED`) · 모호함 · 상충 후보 · 일관성을 검사하고 결과를 남긴다. AI 의 자기 점수(confidence)는 판정에 쓰지 않는다.
- 위치: `back/src/communication/extraction-rules.ts` · Python 포팅과 일치를 계약 파일로 강제(`packages/contracts/conformance/extraction-validator.v1.json`)
- 시험: `unit/extraction-rules.test.ts` · `unit/validator-conformance.test.ts` · `ai/tests/test_validator_conformance.py`

### FR-EXT-003 자동 추출 재시도 (P1 · 구현)
- 설명: 일시 실패면 간격을 두고 자동 재시도(한도 3회, 10초 × 3^(실패 수−1), 상한 120초 [ASSUMPTION]). 모든 시도를 기록한다. 끝내 실패하면 값 없이 사람 검토로 넘긴다(`REPLY_REVIEW_REQUIRED`).
- 테이블: `extraction` · 시험: `db/extraction.test.ts` · `unit/extraction-status.test.ts`

### FR-EXT-004 사람의 재추출 요청 (P1 · 구현)
- 권한: `extraction.retry` · API: `POST /communication/inbound/{messageId}/extraction/retry` · 테이블: `extraction_retry_request` · `extraction` · 시험: `db/extraction-retry.test.ts` · 비고: T-124

### FR-EXT-005 LLM 공급자 추상화 · failover (P1 · 구현(검증 제한))
- 설명: 공급자는 설정으로 고른다(`replay` 녹화 재생 · `gemini` · `openai` · `anthropic` · `local`). 기술 오류(키 없음 · 호출 실패 · 시간 초과)에만 대체 공급자를 한 번 시도한다. production 은 replay 를 거부한다(포트폴리오 모드는 replay 만 허용).
- 위치: `ai/cera_ai/providers.py` · `ai/cera_ai/config.py` · 시험: `ai/tests/test_config.py` · `ai/tests/test_ai_server.py`
- 비고: 상용은 Gemini smoke 1건만 검증(2026-10-28). 최종 선정 [미확정] ADR-037

### FR-TRUTH-001 후보 → 임시 사실 승격 (P0 · 구현)
- 설명: 검증을 통과한 후보가 승격 조건(질문 날짜와 일치 등)을 만족하면 사건(OBSERVATION, `LLM_EXTRACTED`)이 되고 사실은 임시(`PROVISIONAL`)가 된다. 탈락하면 후보는 PENDING 으로 남고 값을 만들지 않는다.
- 위치: `back/src/truth/promotion-rules.ts` · `promotion.service.ts` · 테이블: `event` · `event_entity_link` · `extraction` · `canonical_fact` · 시험: `unit/truth-rules.test.ts` · `db/truth.test.ts`

### FR-TRUTH-002 사실 조회 (P0 · 구현)
- 설명: 실행 기준으로 사실(현재 값 · 상태 · 신선도 · 충돌 · 후보 목록 · 출처 · 인용)을 본다. 기준 시각(`as_of`)을 줄 수 있다.
- API: `GET /truth/facts?recovery_run_id=&as_of=` · 테이블: `canonical_fact` · `event` · 시험: `db/truth.test.ts` · `front/web/src/api/truth.test.ts`

### FR-TRUTH-003 사람의 사실 확인 · 거절 · 정정 · 철회 (P0 · 구현)
- 설명: 확인 = VERIFICATION 사건 → `CONFIRMED`. 거절 · 정정(새 값) · 철회(값 없는 CORRECTION — 사람만)는 새 사건으로 남는다.
- 권한: `truth.review`(현장 담당자 · AI · Agent · 시스템 불가)
- API: `POST /truth/events/{eventId}/confirm` · `.../reject` · `.../correct` · `.../revoke`
- 테이블: `event` · `event_verification_target` · `canonical_fact` · 시험: `db/truth.test.ts` · 비고: M20 · M21

### FR-TRUTH-004 사실 직접 입력 (P0 · 구현)
- 설명: 사람이 확인한 값을 직접 넣는다(`intent = OPERATOR_DIRECT_ENTRY`, 출처 메모 200자). 바로 확정. 현장 담당자도 가능.
- 입력: `kind`(`FACILITY_CAPACITY` · `TRUCK_SLOT`) · 대상 · 날짜 · (시간대) · 값 · `source_note`
- API: `POST /truth/facts/manual` · 권한 `truth.manual_entry` · 테이블: `raw_input` · `event` · `canonical_fact` · 시험: `db/truth.test.ts`

### FR-TRUTH-005 Reconciliation(현재 값 판정) (P1 · 구현)
- 설명: 같은 사실의 사건들 중 현재 값을 정한다: 사람 확인 · 사람 입력 → 확정, 근거 강도 2 이상 → 관측, 그 외 → 임시. 상태 차원(값 · 신선도 · 충돌 · 보류 · 쓸 수 있음)을 따로 둔다. Worker 가 주기적으로 파생 표를 다시 판정한다.
- 위치: `back/src/truth/reconcile-rules.ts` · 테이블: `canonical_fact` · `conflict` · 시험: `unit/truth-rules.test.ts` · `db/truth.test.ts`

### FR-TRUTH-006 신선도 (P1 · 구현)
- 설명: 명시 유효 시간을 우선하고 없으면 사실 계열별 시작값 [ASSUMPTION]으로 `FRESH` · `AGING` · `STALE` · `EXPIRED` 를 정한다. `STALE` 공백은 다시 묻기(`NEEDS_REFRESH`) 대상.
- 위치: `back/src/truth/truth-policy.ts` · 시험: `unit/truth-rules.test.ts`

### FR-TRUTH-007 충돌 (P1 · 부분)
- 설명: 같은 사실에 다른 값이 있으면 `DISSENT` · `OPEN` 으로 표시하고 쓸 수 있음 판정에 반영한다.
- 테이블: `conflict` · `verification_request` · 시험: `unit/truth-rules.test.ts`
- 비고: 충돌 해소 요청(`verification_request_handling`) 표는 있으나 전용 사람 API 는 없다 — 사람은 확인 · 정정으로 해소 [향후]

## 7. 기능 요구사항 — 운영 입력 · 계획 · 후속 · 기타

### FR-INPUT-001 컨테이너 입력 (P1 · 구현)
- 설명: 실제 실행의 컨테이너(번호 · 크기 · 우선순위 · LFD · 원래 목적지 등)를 CSV 또는 행(JSON)으로 넣는다. **먼저 검증만**(dry-run) 하고, 오류 0 이고 같은 내용일 때만 저장한다(행 · 필드 · 이유 표).
- 권한: `planning.input` · API: `POST · GET /planning/runs/{runId}/inputs/containers` · `GET /planning/inputs/batches/{batchId}`
- 테이블: `planning_input_batch` · `planning_container_record` · `container` · 시험: `unit/live-input.test.ts` · `db/live-planning.test.ts`

### FR-INPUT-002 요율 입력 (P1 · 구현)
- 설명: 체선료 · 터미널 보관료 · 반납 유예일 · 운송비 · ODCY 반출입 · ODCY 보관료(`TARIFF_RATE_TYPE`)를 입력. 원 정수.
- API: `POST · GET /planning/inputs/rates` · 테이블: `tariff_rate` · `planning_input_batch` · 시험: `unit/live-input.test.ts` · `db/live-planning.test.ts`

### FR-INPUT-003 시설 계획 정보 입력 (P1 · 구현)
- API: `POST · GET /planning/inputs/facility-profiles` · 테이블: `facility_planning_profile` · 시험: `db/live-planning.test.ts`

### FR-INPUT-005 운영 기준 계획 입력 (P1 · 구현 · T-132)
- 설명: 어느 복구 실행에도 속하지 않은 예정 반입(원래 계획)을 CSV · 행으로 넣는다 — 예외 탐지기의 수요 원천. 검증만(dry-run) · 판 · 멱등 · 철회(`status = WITHDRAWN`) 규칙은 실행 입력과 같다. 저장되면 `OPERATIONAL_INPUT_CHANGED` 알림 → 탐지
- 권한: `planning.input` · API: `POST · GET /planning/inputs/containers`
- 테이블: `planning_input_batch`(`recovery_run_id` NULL) · `planning_container_record`(`recovery_run_id` NULL, M37) · 시험: `db/exception-detection.test.ts`

### FR-INPUT-004 입력 준비도 (P1 · 구현)
- 설명: 실제 실행이 계산 가능한지, 빠진 값(LFD · 창고 수용량 · 트럭 등)을 필드 단위로 알려 준다. 준비가 안 되면 계산 요청은 409.
- API: `GET /planning/runs/{runId}/input-readiness` · 시험: `db/live-planning.test.ts`

### FR-PLAN-001 비용 · 위험 계산 (P0 · 구현)
- 설명: 컨테이너 × 선택지마다 기본 비용(체선료 · 보관료 · 운송 · ODCY)과 위험 벌점(입고 지연 · 임시 사실 의존 · 오래되는 사실 · 터미널 대기)을 원 정수로 계산한다. 요율 · 사실이 없으면 그 선택지는 실행 불가(이유 표시) — 숫자를 지어내지 않는다. 순수 함수(DB · LLM · 현재 시각 없음).
- API: `GET /planning/runs/{runId}/costs`(저장 없음) · Tool `calculate_recovery_costs`
- 위치: `back/src/planning/engine/cost-engine.ts` · `cost-policy.ts` · 시험: `unit/cost-engine.test.ts`
- 비고: 벌점 계수는 정책값 [ASSUMPTION] (예: 지연 벌점 CRITICAL 300,000원/일)

### FR-PLAN-002 기준안 (P1 · 구현)
- 설명: 원래 계획대로 할 때의 비용을 같은 엔진으로 계산해 절감액 비교 기준으로 쓴다.
- 위치: `back/src/planning/engine/baseline.ts` · 시험: `unit/cost-engine.test.ts` · `unit/solver.test.ts`

### FR-SOLVER-001 최적 배정 (P0 · 구현)
- 설명: HiGHS 0-1 MIP 로 총 예상 손실이 가장 작은 배정을 찾는다. 결정론(단일 스레드 · 동률 해소 3단계 · 입력 지문). 비상 시간 상한 30초 [ASSUMPTION]. Backend 프로세스 안에서 돈다(LLM 아님).
- API: Tool `solve_recovery` · 재계산 API 안에서 호출
- 위치: `back/src/planning/engine/solver.ts` · 시험: `unit/solver.test.ts` · 비고: ADR-038

### FR-PLAN-003 계획 판 저장 · 조회 (P0 · 구현)
- 설명: Solver 결과를 지금 사실 기준의 새 판(`PROPOSED`)으로 저장한다. 판마다 계획 해시 · KPI(총 예상 손실 · 기본 비용 · 기준안 · 절감) · 컨테이너별 조치 · 쓴 사실을 남긴다. 이전 판은 `SUPERSEDED`.
- API: `GET /planning/runs/{runId}/plans` · `GET /planning/plans/{planId}` · Tool `propose_recovery_plan` · `get_recovery_plan`
- 테이블: `recovery_plan` · `recovery_plan_item` · `planning_snapshot` · 시험: `db/recovery-plan.test.ts`

### FR-PLAN-004 계획 승인 (P0 · 구현)
- 설명: 사람이 계획 해시를 확인하고 승인한다. 승인은 결정 기록이지 실행 지시가 아니다. Agent 는 승인할 수 없다.
- 권한: `plan.approve` · 입력: `plan_hash` · API: `POST /planning/plans/{planId}/approve`
- 예외: 409 해시 불일치 · 409 이미 밀린 판 · 테이블: `recovery_plan` · `audit_log` · 시험: `db/recovery-plan.test.ts` · 비고: 옛 FR-OPT-06

### FR-PLAN-005 계획 무효화(OUTDATED) (P0 · 구현)
- 설명: 판이 기대던 사실 · 운영 입력(요율 등)이 바뀌면 그 판을 `OUTDATED` 로 두고 이유(어떤 사실 · 어떤 입력)를 남긴다. 그래프는 다시 계산 흐름으로 간다.
- 테이블: `recovery_plan` · 시험: `db/recovery-plan.test.ts` · `db/live-planning.test.ts`

### FR-PLAN-006 재계산 (P0 · 구현)
- 설명: 지금 사실로 새 판을 만든다. 실제 실행은 준비도가 READY 여야 한다.
- 권한: `plan.recalculate` · API: `POST /planning/runs/{runId}/plans` · 시험: `db/recovery-plan.test.ts` · `db/live-planning.test.ts`

### FR-FU-001 후속 요청 초안 (P0 · 구현)
- 설명: 승인된 계획에 필요한 외부 요청(ODCY 반입 `ODCY_RECEIVE` · 협력 트럭 `PARTNER_TRUCKS`)의 초안을 만든다. 받는 사람은 그 시설 · 트럭 풀의 **등록된 운영 회사**뿐이다. 자사 트럭만 쓴 판은 외부 연락이 없다. 초안은 승인 대기로만 만들고 보내지 않는다.
- 권한: `communication.draft` · API: `POST · GET /planning/plans/{planId}/follow-ups`
- 테이블: `plan_follow_up` · `comm_message` · 시험: `unit/follow-up.test.ts` · `db/recovery-plan.test.ts` · 비고: T-116

### FR-FU-002 정정 요청 (P1 · 구현)
- 설명: 이미 보낸 요청과 새 판의 수량 등이 다르면 `CORRECTION` 초안(이전 수량 포함)을 만든다. 원래 메일은 그대로다.
- 테이블: `plan_follow_up`(`follow_up_kind`, `refers_to_message_id`) · 시험: `unit/follow-up.test.ts` · `db/recovery-plan.test.ts` · 비고: T-128 · M33

### FR-FU-003 취소 요청 (P1 · 구현)
- 설명: 새 판에서 빠진 요청은 `CANCELLATION` 초안을 원래 받은 회사로 만든다.
- 시험: `unit/follow-up.test.ts` · `db/recovery-plan.test.ts` · 브라우저 E2E(10-28)

### FR-FU-004 후속 받는 주소 결정 (P1 · 구현)
- 설명: 보낼 수 있는 주소가 없으면 `NO_ELIGIBLE_CONTACT`(다른 회사로 대신 보내지 않음), 여럿이면 `CONTACT_SELECTION_REQUIRED` → FR-REG-008.
- 시험: `db/contact-routing.test.ts` · `db/contact-lifecycle.test.ts`

### FR-PUB-001 선박 입항 조회 (P2 · 구현(검증 제한))
- 설명: 기간을 주면 부산항 입항 선박을 공공데이터(DS-03, data.go.kr)에서 가져와 원본 보존 · 정규화한다.
- 권한: `public_data.fetch` · API: `POST /public-data/vessel-calls/fetch` · `GET /public-data/vessel-calls` · `GET /public-data/vessel-calls/{vesselCallId}` · `GET /public-data/fetches` · `GET /public-data/status`
- 테이블: `public_data_fetch` · `raw_input` · `vessel_call` · 시험: `unit/public-data.test.ts` · `db/public-data.test.ts` · 비고: 2026-10-22 live 검증

### FR-PUB-002 적하목록 조회 (P2 · 구현(검증 제한))
- 설명: 등록된 입항 선박의 컨테이너 적하목록(DS-02 — B/L · 컨테이너 · 크기 유형)을 가져온다.
- API: `POST /public-data/vessel-calls/{vesselCallId}/manifest/fetch` · 테이블: `container` · `bl` · `container_bl` · `external_identifier` · 시험: 위와 같음

### FR-PUB-003 replay / live 모드 (P2 · 구현)
- 설명: `off`(기본) · `replay`(마스킹 fixture, production 거부) · `live`(키 필요). 페이지 상한 20 [ASSUMPTION] (일일 호출 한도 보호).
- 시험: `unit/public-data.test.ts` · `unit/config.test.ts`

### FR-AUDIT-001 감사 기록 (P0 · 구현)
- 설명: 로그인 · 승인 · 반려 · 발송 요청 · 등록부 변경 · 사실 판단 · 계획 승인 · 주소 선택 · 사용자 관리를 감사 기록으로 남긴다(append-only). 업무 트랜잭션 안에서 함께 쓴다.
- 테이블: `audit_log` · 위치: `back/src/persistence/audit-recorder.ts` · `catalog.ts` · 시험: `db/persistence.test.ts` · `db/invariants.test.ts`

### FR-AUDIT-002 시스템 오류 기록 (P1 · 구현)
- 설명: 처리되지 않은 오류 · 연동 오류 · 백그라운드 오류를 별도 트랜잭션으로 기록한다(메시지 · 스택 없음). 기록 실패가 원래 처리를 깨지 않는다.
- 테이블: `system_error` · 위치: `back/src/http/error.filter.ts` · 시험: `db/persistence.test.ts` · `unit/context-errors.test.ts`

### FR-OPS-001 상태 확인 (P1 · 구현)
- 설명: `GET /health/live`(프로세스) · `GET /health`(앱 + DB — DB 가 안 되면 503 `degraded`, 실행 큐 상태는 참고용).
- 시험: `db/api.e2e.test.ts` · `db/queue.test.ts` · `db/portfolio.test.ts`

### FR-OPS-002 API 계약 공개 (P2 · 구현)
- 설명: 실행 중인 API 가 OpenAPI 를 내준다(`GET /openapi.json`). 생성본은 `packages/contracts/openapi.json` 이고 화면 타입은 이것에서 만든다(시험이 최신인지 검사).
- 시험: `db/api.e2e.test.ts` · `front/web/src/api/contract.test.ts`

### FR-OPS-003 운영 환경 첫 준비 (P1 · 구현 · T-132)
- 설명: `npm run db:bootstrap` — SYSTEM · AI_AGENT 행위자 + 사람 계정(환경변수 비밀번호)만 만든다. 합성 데이터 없음 · 어느 APP_ENV 에서나 · 반복 안전. 이것이 없으면 시드가 없는 Staging · 운영의 Worker 가 `SYSTEM_ACTOR_MISSING` 으로 멈췄다
- 위치: `back/src/seed/run-bootstrap.ts` · 검증: Staging E2E(10-28)

### FR-DEMO-001 시연 상태 · Mock 회신 도우미 (P2 · 구현)
- 설명: 시연 콘솔이 쓰는 상태 확인(설정 · AI Server · 시드 id)과 Mock 회신 넣기. local · test · 포트폴리오 모드에서만 경로가 있다.
- API: `GET /dev/demo/status`(T-132: `exception_detection` · `active_run_id` · `auto_exception`) · `POST /dev/demo/mock-reply` · 시험: `db/portfolio.test.ts`

### FR-DEMO-002 공개 포트폴리오 데모 모드 (P2 · 구현)
- 설명: `CERA_PORTFOLIO_DEMO_MODE=true` 면 Gmail · 실제 수신 허용 목록 · 공공데이터 · dev-header · 장애 주입(production 이면 Origin 목록 없음)을 기동 거부하고, 데모 세션 · Mock 답장 제한 · IP 별 요청 한도 · 하루 Agent 실행 한도(기본 200)를 켠다. AI Server 는 replay 만 허용.
- 시험: `unit/portfolio.test.ts` · `db/portfolio.test.ts` · `ai/tests/test_config.py` · `front/web/src/app/portfolio.test.tsx` · 비고: ADR-039 Proposed · `infra/portfolio`

## 8. 비기능 요구사항

| ID | 이름 | 내용(구현) | 근거 · 시험 | 우선 |
| --- | --- | --- | --- | --- |
| NFR-SEC-001 | 역할 권한 강제 | 전역 Guard · 선언 없는 변경 거부 | `auth.guard.ts` · `db/auth.test.ts` | P0 |
| NFR-SEC-002 | 세션 보안 | 토큰 지문만 저장 · HttpOnly · SameSite=Strict · production Secure 강제 | `env.ts` 검사 · `db/auth.test.ts` | P0 |
| NFR-SEC-003 | 비밀값 관리 | 비밀은 환경변수로만 · 설정 오류 메시지에 값 없음 · 화면 번들이 읽는 환경변수는 비밀 아닌 2개 | `env.ts` · `front/web/src/app/portfolio.test.tsx` | P0 |
| NFR-SEC-004 | 외부 발송 게이트 | 사람 승인 + 사람의 발송 요청 + Contact Gate 두 번 + DB 가 HUMAN 승인만 허용 | `db/approvals.test.ts` · `db/send.test.ts` | P0 |
| NFR-SEC-005 | 개발 안전장치 | 비운영 환경 실채널은 수신 허용 목록 · 비면 전부 차단 | `unit/contact-gate.test.ts` | P1 |
| NFR-SEC-006 | production 설정 방어 | dev-header · Mock 장애 주입 · 공공데이터 replay · Secure 없는 쿠키 · LLM replay 를 production 에서 기동 거부 | `unit/config.test.ts` · `ai/tests/test_config.py` | P1 |
| NFR-SEC-007 | 공개 배포 경계 | Origin 검사 · CORS 미개방 · API 보안 헤더 · 포트폴리오 모드 · IP 요청 한도 · 내부망 | `unit/portfolio.test.ts` · `db/portfolio.test.ts` | P1 |
| NFR-SEC-008 | 오류 노출 제한 | 응답은 `code · message · request_id` 만(스택 · SQL · 경로 없음) | `http/error.filter.ts` · `db/portfolio.test.ts` | P1 |
| NFR-REL-001 | 실행 큐 장애 대체 | Redis 가 없어도 PostgreSQL 폴링으로 같은 일 | `db/queue.test.ts` · 10-27 실측 | P1 |
| NFR-REL-002 | Agent 내구성 | 체크포인트는 Backend DB · 재조정으로 재시작 뒤 이어 감 | `db/processes.test.ts` · `db/agent-runtime.test.ts` | P0 |
| NFR-REL-003 | 발송 정확성 | 시도 선기록 · 결과 한 번 · 화해 · 단일 발송 워커 | `db/send.test.ts` | P0 |
| NFR-REL-004 | 멱등성 | 발송 요청 · Tool 호출(멱등 키) · 수신(외부 id UNIQUE) · 시드 · migration 반복 안전 | `db/agent-tools.test.ts` · `db/inbound.test.ts` | P1 |
| NFR-REL-005 | fail-closed | AI 실패 · 검증 탈락 → 값 없음 · 사람 검토 | `db/extraction.test.ts` · `db/truth.test.ts` | P0 |
| NFR-INT-001 | append-only 기록 | 사건 · 승인 · 상태 전이 · 감사 · 계획 항목 등 27표 UPDATE/DELETE 거부, 38표 TRUNCATE 거부 | DB trigger · `db/invariants.test.ts` | P0 |
| NFR-INT-002 | 금액 · 시각 | 원 정수(`bigint`) · `timestamptz` · 핵심 로직은 기준시각 `as_of` 주입 | `unit/krw.test.ts` · `unit/time.test.ts` | P0 |
| NFR-INT-003 | 시뮬레이션 분리 | `is_simulated` / `contains_simulated` 가 FK 에 함께 걸려 시뮬레이션 값이 실제 기록과 섞이지 않음 | 복합 FK · `db/invariants.test.ts` | P1 |
| NFR-INT-004 | 스키마 = 명세 | 실제 DB 와 `docs/24` 22절 명세 대조 | `db/schema-catalog.test.ts` | P1 |
| NFR-AUDIT-001 | 행위자 추적 | 모든 사람 행동에 actor · 감사 · request_id | `db/persistence.test.ts` | P0 |
| NFR-PERF-001 | Solver 시간 | 30대 시나리오 0.3~0.6 s 실측 · 비상 상한 30 s | ADR-038 · LOG | P1 |
| NFR-PERF-002 | 비상 상한 | AI 요청 330 s · 상용 LLM 120 s · Agent 구동 900 s · Gmail 30 s · 공공데이터 30 s [ASSUMPTION] | `env.ts` · `config.py` | P2 |
| NFR-OBS-001 | 요청 추적 | `X-Request-Id` · trace id · JSON 로그(local 외) | `request-context.middleware.ts` | P1 |
| NFR-OBS-002 | 실행 관측 | `npm run runtime:stats`(그래프 · Tool · 공공데이터 지연 분포) | `back/src/dev/runtime-stats.ts` | P2 |
| NFR-DEP-001 | 재현 가능한 실행 | Docker Compose(로컬 · 포트폴리오) · migration 한 번짜리 컨테이너 | `infra/` | P1 |
| NFR-DEP-002 | 새 설치 · 백업 · 복원 | 빈 볼륨 설치 · pg_dump/restore + ContentStore | `infra/README.md` · 10-27 검증 | P1 |
| NFR-DEP-003 | 환경 분리 | 공개 데모(`infra/portfolio`)와 Private Staging(`infra/staging`) — 같은 코드 · 다른 설정 · 다른 DB · Redis · ContentStore · 세션. 데모에서 실제 채널 우회 없음 | `infra/staging/README.md` · ADR-040 · Staging E2E | P1 |
| NFR-MNT-001 | 계약 일치 | OpenAPI · Agent Tool 계약 · 검증기 conformance 를 생성본과 시험으로 강제 | `db/api.e2e.test.ts` · `unit/validator-conformance.test.ts` | P1 |
| NFR-MNT-002 | 설정 키 일치 | `.env.example` ↔ 설정 스키마 | `unit/env-example.test.ts` · `ai/tests/test_config.py` | P2 |
| NFR-MNT-003 | migration 규칙 | 생성 SQL 검토 · push 금지 · 이력 해시 고정 | `db/permissions-migrations.test.ts` · `db/drizzle-kit.test.ts` | P1 |

## 9. 구현되지 않은 요구사항 (참고)

| 항목 | 상태 |
| --- | --- |
| 창고 수용량 부족 외 예외 유형 탐지 · Agent 자동 시작 · 예외 확인(acknowledge) | [향후] |
| 고객 TMS · WMS · FMS 연동 | [향후][외부 의존] T-126 |
| UNI-PASS 통관 조회 | [향후] T-106 |
| PORTAL 채널 | [향후] |
| 보류함 해제 API · 화면 | [향후] |
| 충돌 해소 요청 처리 API | [향후] |
| 사용자 관리 화면 | [향후] |
| 알림(메일 · 메신저) | [향후] (옛 FR-NTF) |
| 최종 LLM 선정 | [미확정] ADR-037 |
| 승인된 계획의 자동 실행 · 배차 Write | 의도적 제외 |
