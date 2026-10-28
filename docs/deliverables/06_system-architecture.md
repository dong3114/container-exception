# 06. CERA 시스템 아키텍처 설계서

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 확정(2026-10-28 구현 기준) |
| 기준 | HEAD `5881529` + T-132 · T-133 · `back/src/app/*` · `back/src/worker.ts` · `back/src/detection/*` · `back/src/ops/*` · `ai/cera_ai/*` · `front/web/*` · `infra/local/compose*.yaml` · `infra/portfolio/compose.yaml` · `infra/staging/compose.yaml` |
| 관련 결정 | ADR-026~029(책임 경계) · ADR-033(NestJS + 별도 Python) · ADR-034(PostgreSQL + Drizzle) · ADR-035(Vite SPA) · ADR-036(Agent Runtime) · ADR-037(LLM 선정 방식) · ADR-038(HiGHS) · ADR-039(포트폴리오 데모, Proposed) · ADR-040(Private Staging · 예외 자동 탐지) — [`docs/14_decisions.md`](../14_decisions.md) |
| 관련 문서 | [07 API](07_interface-api.md) · [08 비기능 · 운영](08_nfr-and-operations.md) · [05 DB](05_data-model-and-tables.md) |

## 1. 전체 구조

```text
                       Browser (React SPA — front/web, CSR 만)
                          │  /backend/*  (dev: Vite 프록시 · Docker: nginx · 공개: Caddy HTTPS → nginx)
                          ▼
┌──────────────────────── Main Backend (TypeScript · NestJS — back/) ───────────────────────────┐
│  API 프로세스 (node dist/main.js, :3100)                    Worker 프로세스 (node dist/worker.js) │
│  · 인증 · 권한 Guard · 업무 API                              · Outbox 발송(Mock · Gmail 어댑터)    │
│  · 등록부 · Contact Gate · 문의 · 승인 · 발송 요청            · 수신(원문 보존 · 발신자 판정)        │
│  · Truth(승격 · Reconciliation · 사람 판단)                  · 추출 요청 → AI Server              │
│  · 운영 입력 · Cost/Risk Engine · HiGHS Solver(WASM)         · 사실 파생 표 재판정                  │
│  · 예외 탐지기(결정론 — 사실 · 입력 변경 알림)                · 예외 탐지 주기(알림을 놓쳐도)        │
│  · 운영 시스템 상태(GET /ops/system-status — 읽기만)          · 주기마다 heartbeat(runtime_heartbeat) │
│  · 계획 판 · 후속 · 정정 · 취소                               · Agent 재조정(AgentReconciler)       │
│  · Agent Coordinator · Agent Tool API(/internal)             · advisory lock 으로 작업별 하나만     │
│  · Public Data Adapter(data.go.kr)                                                                │
└───────┬───────────────────────┬────────────────────────────┬─────────────────────────┬──────────┘
        │ SQL(앱 역할 cera_app)   │ 빠른 전달 · 깨우기(BullMQ)    │ HTTP(내부)               │ HTTPS
        ▼                        ▼                            ▼                          ▼
  PostgreSQL 18.6           Redis 7.4(선택)          Python AI Server (ai/, FastAPI, :8100)   외부
  업무 정본 · append-only    정본 아님 · 저장 끔        · /v1/extractions/reply(추출)          · Gmail API
  ContentStore 참조          없으면 PostgreSQL 폴링    · /v1/agent-runs/{id}/start|resume      · data.go.kr
                                                       · LangGraph 그래프(결정론 정책)
  ContentStore(로컬 파일)                               · LLM 공급자: replay · gemini · openai · anthropic · local
  원문 · 체크포인트 내용                                  └─ Tool · 체크포인트는 Backend /internal 로만
                                                       (선택) llama.cpp 로컬 모델 서버(:8080, compose profile llm)
```

- Solver 와 Cost Engine 은 **Main Backend 프로세스 안**에서 돈다(별도 서비스 아님, ADR-038). Agent 는 Tool 로 계산을 *요청*할 뿐이다.
- 브라우저는 Backend 만 부른다. AI Server · DB · Redis 는 브라우저에서 닿지 않는다(공개 배포는 내부망 + `/backend/internal/*` 404).

## 2. 서비스별 책임

| 구성 | 하는 일 | 하지 않는 일 |
| --- | --- | --- |
| Frontend(`front/web`) | 운영 콘솔 `/` · 단계별 체험 `/demo` · Mock 재생 `/prototype` · Backend 응답 확인 `/dev/api`. 5초 폴링(`createPoller`) · 권한으로 버튼 숨김 · 오류 코드를 쉬운 말로 | 권한 판정(Backend 가 함) · 비밀값 보관(번들이 읽는 환경변수는 `VITE_CERA_API_BASE` · `VITE_CERA_PROVIDER` 둘) · 숫자 계산 |
| NestJS API | 사람 요청 처리 · 권한 · 업무 규칙 · 결정론 엔진 · 감사 · Agent 실행 소유(생성 · 시작 · 재개 · 끝 상태) · Tool 제공 | 외부 메일 직접 발송(Worker 가 함) · LLM 호출 |
| Worker | 발송 · 수신 · 추출 요청 · 사실 재판정 · Agent 재조정. HTTP 없음 · 업무 상태를 메모리에 두지 않음 | 사람 결정 · 승인 |
| PostgreSQL | **업무 정본**(Business Truth). 트리거로 불변식 · append-only 강제 | — |
| Redis | 실행 큐(작업 `OUTBOX_SEND` · `EXTRACTION_CYCLE` · `AGENT_RECONCILE`) — 빠른 전달 · 지연 재시도 · 깨우기 | 업무 정본(저장 끔 — 잃어도 Worker 가 DB 에서 다시 찾음) |
| Python AI Server | 회신 추출(값 후보 + 인용) · Agent 그래프 실행 | DB 접근 · SQL · 사실 확정 · 승인 · 발송 · 공공 API 직접 호출 |
| LangGraph 그래프 | 공백 확인 → 다음 행동(결정론 `DeterministicPolicy`) → Tool 호출 → 사람 · 외부 대기(interrupt) | 의미 판단으로 행동을 지어냄(허용된 행동 외 값은 실패) |
| LLM 공급자 | 추출 응답(후보) | 판정 · 저장 |
| Cost / Risk Engine | 컨테이너 × 선택지 비용(원 정수) · 위험 벌점. 순수 함수 | DB · HTTP · LLM · 현재 시각 사용 |
| HiGHS Solver | 0-1 MIP 최적 배정(결정론, 30초 상한) | 저장 · 승인 · 실행 |
| Gmail Adapter | OAuth refresh token 으로 발송 · 수신 · 화해 조회 · 오류 분류 | 받는 사람 판정(Contact Gate 가 함) |
| Mock Channel Adapter | 파일 보낸 편지함 · 수신함, 장애 주입(시험) | 네트워크 |
| Public Data Adapter | DS-03 · DS-02 조회 · 원본 보존 · 정규화 · replay | 응답을 최신 현실로 취급 |
| ContentStore | 원문 · 인용 · 체크포인트 내용 파일 보관(참조 + 해시) | — |

## 3. Agent 권한 경계 (ADR-036)

| 항목 | 구현 |
| --- | --- |
| DB 접근 | 없음. AI Server 는 DB 연결 정보를 받지 않는다 |
| SQL | 실행하지 않음 |
| 사실 확정 | 하지 않음. 추출 결과는 후보이고, 승격 · 판정은 Backend 결정론 |
| 승인 | 할 수 없음 — Tool 에 승인이 없고 DB 트리거가 승인 결정을 `HUMAN` actor 로만 허용. `request_approval` 은 승인 대기열에 넣는 요청 |
| 메일 발송 | 하지 않음 — 발송 요청은 사람(`communication.send`), 발송은 Worker |
| 부작용 경로 | `POST /internal/agent-tools/{tool}` 14개만. 서비스 토큰(32자+) · `X-CERA-Agent-Run-Id` 필수, 변경 Tool 3개는 `Idempotency-Key` 도 필수. 호출마다 `agent_tool_call` 기록 |
| 다음 행동 선택 | 결정론 정책 — LLM 을 쓰지 않음 |
| 실행 소유 | Backend Coordinator 가 생성 · 시작 · 재개 · 끝 상태를 조건부 전이로 소유(중복 시작 · 재개 = 그래프 하나) |
| 깨우는 신호 | 업무 사건(승인 결정 등)은 이유 코드 · 대상 참조만 전달 — 그래프가 Tool 로 업무 상태를 다시 읽는다 |
| 비상 상한 | 단계 100 · Tool 호출 50 · Tool 재시도 3 [ASSUMPTION] |

## 4. Business Truth 와 실행 상태

| 저장소 | 성격 | 잃으면 |
| --- | --- | --- |
| PostgreSQL 업무 표 | **정본** — 사실 · 승인 · 메시지 · 계획 · 감사 | 복구 필요(백업) |
| `canonical_fact` 등 파생 표 | 사건에서 다시 계산 | 재판정으로 복구 |
| LangGraph 체크포인트(`agent_checkpoint` + ContentStore) | **실행 상태** — 어디까지 진행했나. 업무 사실 아님 | 그 Agent 실행만 영향(업무 기록은 그대로) |
| Redis | 큐 · 신호 — 정본 아님 | 영향 없음(폴링이 같은 일) |
| `runtime_heartbeat`(T-133) | 실행 상태 — Worker 가 마지막으로 일한 시각 | 다음 주기에 다시 생김(업무 영향 없음) |
| 프로세스 메모리 | 요청 한도 · 로그인 실패 수 · 도메인 신호 | 재시작 시 초기화(정확성은 DB + 재조정이 보장) |

## 5. 장애 복구 구조 (검증 기준 — `docs/tasks/LOG.md` 2026-10-27 · 10-28)

| 장애 | 동작 | 검증 |
| --- | --- | --- |
| Redis 멈춤 · `FLUSHALL` | 큐 없이 PostgreSQL 폴링(5초 주기)으로 같은 결과. `/health` 의 `queue` 만 `down`(전체 상태는 ok) | 실측(Mock 채널, 발송 요청 → SENT): Redis 있음 153~160 ms · 멈춤 4.3~4.8 s · 재시작 뒤 회복, 멈춘 동안 Worker 주기 실패 0(`docs/24` 18.19) |
| Worker 재시작 | advisory lock 은 연결이 끊기면 PostgreSQL 이 풀어 줌 · 결과 모르는 발송은 화해 · 첫 주기 = 기동 재조정 | 대기 중 재시작 뒤 같은 결과 |
| API 재시작 | 상태를 메모리에 두지 않음 · 신호를 놓쳐도 재조정이 깨움 | 대기 중 재시작 뒤 계속 |
| AI Server 재시작 · 장애 | 추출: 자동 재시도(간격) → 실패 기록 → 사람 검토 / Agent: `WAITING_RUNTIME` → 재시도(3회) | 두 프로세스 E2E · Python 재시작 시험 |
| 메일 공급자 장애 | 일시 실패 재시도(최대 5) · 영구 실패 기록 · 토큰 철회 분류(`GMAIL_TOKEN_REVOKED`) | `db/gmail-channel.test.ts` |
| LLM 공급자 장애 | 기술 오류면 대체 공급자 한 번(설정 시) · 아니면 실패 기록 → 사람 검토 | 10-28 Gemini 503 → 자동 재시도 성공 |

## 5b. 예외 자동 탐지 (T-132 · ADR-040)

```text
운영 기준 계획(POST /planning/inputs/containers) ─┐
수용량 사실(Truth 확정 · 정정 · 철회) ─────────────┤ DomainSignal(OPERATIONAL_INPUT_CHANGED · FACT_CHANGED) → API 의 탐지기
Worker 주기(CERA_EXCEPTION_DETECT_INTERVAL_MS, 기본 30초) ┘ (알림을 놓쳐도 · Redis 없이도)
        ▼
ExceptionDetectorService (back/src/detection — 순수 규칙 exception-rules.ts + DB)
  · 트랜잭션 advisory lock `cera.exception_detector` — 프로세스가 여럿이어도 한 번에 하나
  · 범위 LIVE(운영 기준 계획 · 오늘~+2일) / SCENARIO(시드 시나리오의 원래 계획)
  · 창고 × 날짜: 예정 > 확정 수용량 → 예외 ACTIVE(부분 유일 인덱스) + 관측 기록(근거 지문)
  · 근거 CONFIRMED → 복구 실행 자동 생성(SYSTEM actor · EXCEPTION_DETECTED) — Agent 는 시작하지 않음
        ▼
운영 콘솔: [자동 탐지] 배지 · 개요 숫자 · 할 일 "Agent 시작이 필요합니다" → 기존 흐름(사람 승인)
```

스위치 `CERA_EXCEPTION_DETECTION`(`off` 기본 · `on` = 데모 · 포트폴리오 · Staging compose). 재시작 검증: Worker · Redis · API 를 재시작해도 예외 1 · 실행 1(Staging E2E, 10-28).

## 5c. 운영 가시성 (T-133)

```text
운영 콘솔(5초 폴링 — WebSocket 없음) ── GET /ops/system-status (system.monitor = ADMIN · OPERATOR)
   │                                       │
   │                                       ├─ API 자신(가동 · 판 · CERA_BUILD_COMMIT) · PostgreSQL ping(ms) · 실행 큐 상태(Redis)
   │                                       ├─ Worker: runtime_heartbeat(주기마다 Worker 가 덮어씀 — 프로세스 메모리 아님)
   │                                       ├─ AI Server · Agent Runtime: /health(공급자 이름 · agent_runtime 만)
   │                                       ├─ LLM · Gmail · 공공데이터: 기존 기록(감사 · system_error · send_attempt · 수신 · public_data_fetch) + heartbeat 의 채널 확인 코드
   │                                       └─ 대기 작업: PostgreSQL(QUEUED 메시지 · 추출 대기/재시도 · WAITING_RUNTIME) — Redis 큐 길이는 보지 않는다
   └─ 결정론 판정(system-status.policy.ts): DB DOWN → DOWN / Worker 멈춤 · Gmail 인증 거부 → ACTION_REQUIRED / 대체 경로 · 지연 → DEGRADED / 그 밖 HEALTHY
```

장기 지표 스택(Prometheus · Grafana · OpenTelemetry)은 넣지 않았다. 응답에 주소 · 호스트 · 경로 · 키 · 토큰이 없다(`GET /agent-runs/runtime` 의 내부 URL 도 T-133 에서 뺐다).

## 6. 배포 구성

| 구성 | 파일 | 용도 |
| --- | --- | --- |
| 로컬 전체 실행 | `infra/local/compose.yaml`(+ `compose.demo.yaml` · `compose.gpu.yaml`) | profile `app`(DB · migrate · API · Worker · AI · Redis) · `web` · `llm`(로컬 모델) · `eval`. 포트는 루프백만 |
| 공개 포트폴리오 | `infra/portfolio/compose.yaml` · `Caddyfile` · `nginx.conf` | Caddy HTTPS → nginx → API, 내부망(외부 경로 없음), 포트폴리오 모드, 초기화 스크립트 — [08](08_nfr-and-operations.md) 6절 |
| Private Staging(실제 Gmail · 상용 LLM · 공공데이터 · 실제 운영 입력) | `infra/staging/compose.yaml` · `Caddyfile` · `.env.example` · `README.md` | 프로젝트 `cera-staging` — 공개 데모와 DB · Redis · ContentStore · 세션이 다름, 포트폴리오 모드 끔(데모 경로 404), 공식 로그인 + 선택 Basic Auth(Caddy profile `edge`) · IP 제한 · VPN 권장, 첫 준비 `npm run db:bootstrap`. 실제 서버 배포는 [미확정] |

이미지: `back/Dockerfile`(API · Worker · migrate 공용, 빌드본 실행) · `ai/Dockerfile` · `front/web/Dockerfile`(Vite 빌드 → nginx).

## 7. 코드 구조 (주요 모듈)

| 경로 | 내용 |
| --- | --- |
| `back/src/auth` | 로그인 · 세션 · Guard · 권한 표 · 데모 세션 |
| `back/src/registry` | 등록부 · Contact Gate · 받는 주소 선택 |
| `back/src/communication` | 초안 · 숫자 검사 · 승인 · 발송 · Outbox · 수신 · 추출 · 검증 규칙 |
| `back/src/channel` | Mock · Gmail 어댑터 |
| `back/src/truth` | 승격 · Reconciliation · 사람 판단 · 신선도 |
| `back/src/planning` | 운영 입력 · 준비도 · 계획 · 후속 · `engine/`(Cost · Baseline · Solver) |
| `back/src/agent-tools` | Agent 실행 API · Coordinator · Tool · 재조정 · Runtime 저장소 |
| `back/src/detection` | 예외 탐지 규칙(순수) · 탐지기 · `/exceptions` API |
| `back/src/ops` | 시스템 상태 판정(순수) · 모으기 · heartbeat 저장 · `/ops/system-status` API |
| `back/src/seed/run-bootstrap.ts` | 운영 환경 첫 준비(SYSTEM · AI_AGENT · 계정 — 합성 데이터 없음) |
| `back/src/public-data` | 공공데이터 어댑터 · 정규화 |
| `back/src/queue` | 실행 큐(BullMQ/Redis) |
| `back/src/content` | ContentStore |
| `back/src/http` | 오류 필터 · 요청 문맥 · OpenAPI · 공개 경계(Origin · 요청 한도) |
| `ai/cera_ai` | AI Server · 공급자 · 추출 · `agent/`(그래프 · 체크포인트 · Tool 클라이언트) · `evals/` |
| `front/web/src` | `app/ops`(운영 콘솔) · `app/demo` · `components/*` · `api/*`(OpenAPI 생성 타입) |
