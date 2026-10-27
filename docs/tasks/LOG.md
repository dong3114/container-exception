# 작업 인계 로그

- 새 항목은 **맨 위**에 추가한다. 기존 항목은 수정하지 않는다(append-only).
- 다음 에이전트는 최근 3개 항목을 읽고 시작한다.

## 템플릿

```markdown
## YYYY-MM-DD · T-NNN · 에이전트명
- 상태: 완료 | 중단 | 차단
- 한 일:
  - ...
- 변경 파일:
  - ...
- 검증: 실행한 테스트·확인 방법과 결과
- 남은 일 / 다음 한 걸음:
  - ...
- 큐 변경: 추가·상태변경한 태스크 ID
- 주의사항: 다음 작업자가 알아야 할 것
```

---

## 2026-10-27 · 운영 준비(Final Operational Readiness) · Claude Code (claude-opus-5-5)
- 상태: 완료 — 사용자 검토 대기 · Backend feature freeze
- 한 일:
  - Agent 연락처 제약 분석 → **BLOCKER**: 시설 공백 문의 · ODCY 반입 후속이 "같은 역할의 첫 거래처"로 가 다른 회사로 갈 수 있었다(ODCY B → ODCY A 실측) · 연락처 없으면 Agent FAILED. 고침(`a9365dd`): 시설 운영 거래처(M32) · 주인 없음/여럿 = 고르지 않음 · `WAITING_HUMAN` CONTACT_* 대기 · 공백이 닫히면 깨움 · ADMIN 등록부 API · 시드 연결
  - `/health` 큐 상태 · Gmail 5xx/4xx 분류 시험(`91fed46`) · 새 설치 · 백업/복원 · 장애 복구 runbook(`c97802b`)
- 검증: 새 볼륨 설치(58초 · migration 32) · LIVE 전체 E2E(실제 Gmail 발송 1 · 실제 회신 1, 사람 검토 → 재시도 → 직접 입력 → v1 → 재계획 v2 → 승인 → 후속 → 무효화 차단) · 장애(Redis 중단 · FLUSHALL · Worker · AI · API 재시작) · pg_dump/pg_restore 새 인스턴스 · production 설정 방어 8 · 비밀 · 로그 점검 0건 · 추적 체인 · `/demo` 12단계(오류 0, 숫자 그대로) · LIVE 회귀 · Backend 523 · Python 89 · Front 80 · lint 오류 0
- 남은 일 / 다음 한 걸음: 사용자 검토. T-127(등록부 관리 API) · T-128 · T-099(상용 키) · T-120(UI)
- 큐 변경: **T-127 · T-128 신규**
- 주의사항: 백업 = DB + ContentStore 폴더(원문 · Agent 체크포인트). 복원하면 세션도 살아난다(필요하면 모두 끊기). 실제 실행 숫자는 기준 시각에 따라 바뀐다

## 2026-10-27 · T-123 실제 계획 입력 · T-125 재시도 간격 · Claude Code (claude-opus-5-5)
- 상태: 완료 — 사용자 검토 대기(feature freeze 판단)
- 한 일:
  - T-123: 입력 방식 LIVE / SCENARIO 분리. 운영 기록 표 4(planning_input_batch · planning_container_record · tariff_rate · facility_planning_profile, M30 · M31 append-only 판). 일괄 입력 API(CSV · 행, dry_run, 행별 오류, 한 묶음 = 한 트랜잭션, 명령 id 멱등, 같은 내용 = 새 판 없음, ISO 6346 · 수식 칸 · 크기 상한). 실제 실행 만들기 `POST /planning/runs`. LIVE 입력 생성기(순수, 시나리오 팩 안 읽음) — 자사 트럭 = 확인된 신선한 가용만, 시설 보관 한도 = OPERATIONAL_RECORD 사실. 준비도 READY / READY_WITH_PROVISIONAL / NOT_READY · 필드 단위 · 묶음 요약 — 요율 · 다음 날 수용량 누락은 엔진 결과로 판정. `PLANNING_INPUT_UNAVAILABLE.details`. 스냅숏 `input_mode` · `operational_inputs`(판 id · 지문 · 요율 금액). 운영 기록 변경 → OUTDATED(`OPERATIONAL_RECORD_CHANGED` 등) → 재계산. Cost Engine · Solver 무수정
  - E2E 로 찾은 결함 2: 준비도 READY 인데 Solver INFEASIBLE(다음 날 창고 수용량 누락) · 자사 트럭이 협력 트럭 id 꼴이라 외부 배차 후속 초안이 생김 — 둘 다 고침(`6a5542e`)
  - T-125: 일시 실패만 자동 재시도 · 같은 실패는 바로 사람 검토 · 간격 base × 3^(n−1) 상한 · DB 시각 기준 · `next_attempt_at`
- 검증: Backend 520 · Python 87 · Front 80 · typecheck · build · drizzle-kit check · lint 오류 0. Docker LIVE E2E: 실제 실행 → 시설 계획 정보 4 · 요율 21 · 컨테이너 8(검증만 → 저장, LFD 하나 비움) → 준비도 NOT_READY(LFD · 창고 수용량 · 트럭, 필드 단위) · 계산 요청 409 → 고침 → 다음 날 창고 수용량 누락까지 잡음 → READY → Agent(계획 포함)가 비용 · Solver → v1 OPTIMAL(총 1,480,000 · Baseline 2,005,000 · 절감 525,000, Solver 39 ms · 비용 2 ms) → 사람 승인 → Agent COMPLETED → 후속 초안(자사 트럭만 쓴 판 = 외부 연락 없음) → 운송 요율 인상 → v1 OUTDATED(OPERATIONAL_RECORD_CHANGED · RATE) → 새 Agent 실행 v2(총 1,760,000). 시나리오 `/demo` 12단계 브라우저(오류 0, v1 5,735,000 그대로). T-125 Docker: 시도 간격 10초 · 30초, 그 사이 Worker · Redis 재시작, AI 복귀 뒤 DONE. 전체 실행 중 Agent 두 프로세스 시험 1건이 한 번 흔들렸다(단독 · 재실행 통과)
- 남은 일 / 다음 한 걸음: 사용자 검토 · feature freeze 판단. 상용 LLM 키(T-099) · UI(T-120, 사용자) · 내부 시스템 자동 연동(T-126, 대상 미정)
- 큐 변경: T-123 · T-125 DONE · **T-126 신규**(P2)
- 주의사항: LIVE 준비도는 등록부의 모든 활성 시설 · 트럭 풀을 본다(공유 DB 시험은 다른 시험의 풀 가용이 보인다). 계획 기간 = 계획일 + 2일 [ASSUMPTION]. 요율 · 컨테이너 기록은 지우지 않고 판으로 쌓인다

## 2026-10-27 · Final Stabilization(실제 Gmail 왕복 · T-124 · 설정 방어 · 최종 회귀) · Claude Code (claude-opus-5-5)
- 상태: 완료 — 사용자 검토 대기(feature freeze 제안)
- 한 일:
  - 실제 Gmail 왕복(테스트 계정 2개): 발송 · 실제 회신 · 같은 스레드 연결 · 발신자 판정 · 원문 보존 · 중복 없음 · Agent 재개. 추출은 후보 없음(replay 녹화 없음 · 로컬 Qwen3-4B `UNPARSEABLE`) — 값을 지어내지 않음
  - T-124: 회신 보기 `needs_review` · `failure_kind`(AI 호출 실패 / 답 못 찾음 / 검증 탈락 / 추출 불가) · `attempts`(AUTO / HUMAN_RETRY, 지우지 않음) · `retry`. Agent 는 값을 못 얻은 회신 + 열린 공백이면 `COMPLETED` 대신 `WAITING_HUMAN · REPLY_REVIEW_REQUIRED`(직접 입력 · 재시도 성공에만 깨어남). `POST /communication/inbound/:messageId/extraction/retry`(권한 `extraction.retry` = ADMIN · OPERATOR, 명령 id 멱등, 진행 중 409, `REPLY_SUPERSEDED` · `GAP_ALREADY_RESOLVED` · `EXTRACTION_NOT_REQUIRED`). M28 `extraction_retry_request` · M29 append-only. 최소 화면([다시 추출] · 시도 이력)
  - 설정: `CERA_REDIS_URL` 형식 검사(redis:// · rediss:// 만, 값 미노출) · production 가드 시험
- 변경 파일: `back/src/communication/{extraction-status,extraction-retry.service,extraction.repository,extraction-processor,inbound.service,inbound.controller,dto}.ts` · `back/src/agent-tools/{wake-rules,reconciler}.ts` · `back/src/db/schema/m28-extraction-retry.ts` · migration 0027 · 0028 · `ai/cera_ai/agent/graph.py` · `front/web/src/components/drafts/*` · `docs/24` 18.22 · 22.51 · 22.52
- 검증: Backend 507 · Python 87 · Front 80 · typecheck · build · drizzle-kit check · lint(오류 0) · Docker E2E(재시작 4개 프로세스 뒤 대기 유지 · 권한 403/401 · 직접 입력 → 다음 공백 · 계획 v1 5,735,000 → 승인 → 후속 초안 3) · `/demo` 12단계 브라우저(오류 0) · 비밀 점검
- 남은 일 / 다음 한 걸음: 사용자 검토 → feature freeze. T-125 · T-123 · T-099(상용 키) · T-120(사용자 UI)
- 큐 변경: T-118 실제 왕복 확인 · T-122 DONE · T-124 DONE · **T-125 신규**
- 주의사항: 자동 추출 재시도 3회가 몇 초 안에 끝난다(T-125). Gmail Testing 모드 refresh token 은 약 7일마다 `npm run gmail:auth`. Worker 추출 시도와 Agent 실행은 다른 trace_id

## 2026-10-27 · Final Productization Sprint 1일차(T-118 · T-119 · T-121 · T-115 · T-116 · /demo) · Claude Code (claude-opus-5-5)
- 상태: **진행 중(스프린트) — 영역마다 완료 · 커밋 · push.** 실제 Gmail 왕복만 사람의 OAuth 준비 대기
- 한 일: ADR-038 Accepted for MVP · Gmail 채널(가짜 Gmail 시험) · 시연 콘솔 `/demo` + 바탕화면 시나리오 문서 · Auth/RBAC(세션 · 전역 Guard · 사칭 차단 · M24/M25) · Redis 실행 큐(BullMQ, 폴링이 정확성) · 실제 실행 입력 준비도(`missing_inputs`) · 승인된 계획 → 후속 문의 초안(M26/M27)
- 검증: Backend 499 · Front 79 · Docker `/demo` 12단계 브라우저(페이지 오류 0, operator 로그인) · Redis 있음 153~160 ms / 멈춤 4.3~4.8 s / 재시작 회복 · 대기 중 ai · worker · api · redis 재시작 → 회신 → v1 5,735,000 그대로 · 비밀정보 점검(추적 파일에 값 없음)
- 실측으로 찾아 고친 결함: Redis 재연결 DNS 가 libuv 스레드풀을 채워 PostgreSQL 연결 시간 초과 · 재연결 뒤 큐 빠른 길 미회복 · DomainSignals 가 앱 사이에 공유됨 · ODCY 반입일을 최종 도착일로 계산 · password_hash CHECK 의 `$` 미이스케이프(생성 SQL 검토에서)
- 남은 일: 실제 Gmail 왕복(credential) · T-123 · P1 운영/관측 점검 · P2 UI(사용자)
- 큐 변경: T-118 · T-119 · T-121 · T-115(1차) · T-116 DONE, T-120 → P2, T-122 TODO, **T-123 신규**
- 주의: 시험 기본 `CERA_AUTH_MODE=dev-header`(`test/db/support.ts`) — 세션 시험은 `auth.test.ts`. Redis 시험은 실제 Redis(`redis://127.0.0.1:56379`) 필요. 실제 실행은 계산되지 않는다(요율 · 목적지 · LFD 없음 — 지어내지 않음)

## 2026-10-26 · T-112 · T-113 · T-114 DONE — Cost / Risk Engine · Recovery Solver · Recovery Plan · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인**(커밋 3개 · origin push)
- 한 일: 결정론 Cost / Risk Engine(순수) · Baseline 규칙(같은 비용표) · Solver = HiGHS 0-1 MIP(ADR-038 Proposed) · 계획 판 저장(M22 · M23) · 사실 변경 → OUTDATED → Agent 재계산 · 사람 승인(`plan_hash`) · Agent Tool 4 · 계획 화면. 기록 `docs/24` 18.17 · `docs/08` 10절
- 검증: Backend 426 · Python 85 · Front 79 · 30대 S7 Baseline 4,650,000 재현 · Solver 영향 12대 3,345,000 · Docker E2E v1 → v2 → v3 → 승인 → PLAN_APPROVED
- 남은 일: 사용자 스프린트(Real Gmail → Redis queue → Auth/RBAC → UI redesign → 통합 수정) · T-115 ~ T-117 · ADR-038 결정
- 주의: 벌점 값 · 협력 회신 "N대" 해석 [ASSUMPTION] · 실제(비시뮬레이션) 계획 실행은 입력이 없어 계산 거부

## 2026-10-26 · T-111 DONE — Truth Lifecycle Hardening · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인**(`feat: harden truth lifecycle and freshness`). origin push
- 한 일: 철회(값 없는 CORRECTION · 사람만 · M21) · 신선도(명시 유효 시간 우선 + 계열별 시작값 [ASSUMPTION]) · as_of 규칙 · `gap-rules/3` NEEDS_REFRESH · Agent 다시 묻기 · 사람 직접 입력(바로 CONFIRMED) · `reply-extract/2`(날짜 칸, v1 호환) · Worker 파생 표 재판정 · 화면. 기록 `docs/24` 18.16
- 검증: Backend 390 · Python 80 · Front 74 · Docker FLOW 1 · 2 · 브라우저
- 남은 일: T-112 Cost / Risk → T-113 Solver → T-114 Plan Integration (남은 개발 약 2일 — 모델 · 후순위 작업 중단)
- 주의: 차량 풀 목록 API 없음(화면 직접 입력 대상 제한) · 화면 as_of 선택기 없음

## 2026-10-26 · T-093 DONE — 사실 파이프라인 · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인**(`feat: add provisional truth verification pipeline`). push 없음
- 한 일: 검증된 추출 후보 → 임시 사실(PROVISIONAL) 사건(추출과 같은 트랜잭션의 승격 판정) → 사람 확인 · 거절 · 정정(모두 새 사건) → 사실 판정 `reconcile/1`(R4-b · R6 · R10 등, 정책 값 `truth-policy.ts` [ASSUMPTION]) · `canonical_fact` · `conflict` 파생 · M20 DB 가드 3(표 변경 없음) · `gap-rules/2` · `get_recovery_context.facts` · 그래프 `wait_fact_verification` · 깨우기 `AWAITING_FACT_VERIFICATION` · 화면(Agent 패널 사실 확인). 최종 보완: 시간창 subset 허용(질문 창 안의 더 좁은 창이 유효 범위) · 날짜 표현 확인(질문 날짜와 다르거나 풀 수 없으면 승격 안 함) · 정책 상수 분리 · 출처 강도 정의 문서화. ADR-037 = 구조 한정 Accepted · 선정 Deferred. T-099 = 연속 평가, MVP 임시 기본값 Qwen3-4B
- 검증: Backend 372 · Python 71 · Front 57 · typecheck · lint · build · drizzle-kit check. Docker: 실제 Qwen3-4B → 틀린 수량 거절(사실 없음) / 통제된 회신(녹화 재생) → PROVISIONAL → 브라우저 [확인] → CONFIRMED → Agent 깨어남 · 공백 해결, [거절] · [정정] 브라우저 동작
- 남은 일: T-111 Truth Lifecycle Hardening(철회 · 신선도 · 직접 입력 · 날짜 계약 · 확인 큐) → Cost/Risk → Solver
- 주의: `ai/.env` 의 빈 `CERA_AI_REPLAY_DIR=` 가 녹화 폴더를 잃게 하는 결함(후속 커밋). 정정 값이 몇 분 안의 다른 사람 확인 값과 다르면 R6 충돌(NEEDS_REVIEW)이 된다 — 정책대로

## 2026-10-22 · T-099 중간 checkpoint (진행 중 — DONE 아님) · Claude Code (claude-opus-5-5)
- 상태: **차단 — 실제 API credentials 필요. Task 는 IN_PROGRESS 유지**(`test: add CERA model evaluation harness and local baselines`, origin push — 사용자 지시)
- 한 일: 데이터셋 루브릭 README · 정답을 보지 않은 두 번째 라벨링 → AGREED 119 · CONTESTED 22(**two-model-agreed · AI 교차 검토 — Human Gold 아님**, 사람 검토 0) · 사람 검토표 `review/gold-review.csv`(OK · FIX · UNSURE) · Gold 등급별 지표 · raw vs pipeline(Backend 검증기 포팅) 점수 · 범주별 요약 · run 메타(eval/contract version · case ids) · 가격표 10-22 재확인 · `eval` extra · HF NLI 기준선 2종(Docker CPU) · ADR-037 Proposed(공급자 = ADR, 모델 = 설정)
- 결과: HF 기준선은 **일부 분류력(조건부 F1 0.33 · mDeBERTa 검토필요 F1 0.52)은 있지만 보정(Brier · ECE)과 높은 확신 오답이 Production 기준 미달** → Production Decision Provider 부적합. 실제 상용 LLM 호출 0건
- 남은 일: OpenAI · Anthropic · Gemini · Jev 실제 평가 → 추출 비교 → 선정 → Agent Runtime LIVE LLM E2E → ADR-037 Accepted. 필요한 키(코드 기준 이름): `OPENAI_API_KEY` · `ANTHROPIC_API_KEY` · `GEMINI_API_KEY` · (Jev) `OPENROUTER_API_KEY`
- 주의: API 키 없이 T-093 등 큰 작업을 시작하지 않는다(사용자 지시)

## 2026-10-22 · T-105 DONE — 첫 Agent Vertical Slice · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인**(`feat: add agentic recovery vertical slice`). push 없음
- 한 일: 그래프 확장(`observe_public_data` · `track_message` · `wait_send_request` · `wait_delivery` · `wait_reply` · `read_reply` · `reassess_gaps` · `result_summary`) · Tool `get_reply_candidates`(READ) · `gap-rules/1`(업무 `state` vs 작업 흐름 `candidate_state`) · 수신 · 추출 알림 → 재조정 · Tool 상한 = 대기 구간마다 · 합성 녹화 `odcy-capacity-yes.json` · Control Tower `AgentPanel`
- 검증: Backend 329 · Python 56 · Front 42 · E2E 11개 · 실제 프로세스 E2E(LIVE 공공데이터 189건 · 브라우저 발송 요청 · 회신 대기 중 Python 재시작 → COMPLETED `CANDIDATE_RECEIVED_PENDING_CONFIRMATION`)
- 결정(사용자): 업무 fact state 와 Agent candidate_state 분리 유지 — 추출 후보 ≠ CanonicalFact. 발송 요청은 사람(T-090 규칙 유지)
- 다음: **T-099** 재개(실제 Runtime 에 넣을 AI 선정) → T-093. T-108 은 P2

## 2026-10-22 · T-104 DONE — LangGraph Agent Runtime · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인**(`feat: add durable LangGraph agent runtime`). push 없음
- 한 일: `CeraRecoveryGraph`(StateGraph · 결정론 분기 · interrupt · resume) · Tool adapter(Registry 제한 · 상한 · 재시도) · `BackendCheckpointSaver`(Python DB 자격증명 없음) · Coordinator(시작 · 재개 · 상태 전이) · Runtime API · 승인 신호 · M18(`agent_step` · `agent_checkpoint` · `agent_checkpoint_write` + `agent_run` 생애주기 · 열 10) · M19 가드
- durability(승인 뒤 보강): 신호 = 최적화, 정확성 = DB 상태 — Worker 재조정이 기다리던 기록을 다시 보고 깨움 · `WAITING_RUNTIME`(일시 장애 bounded backoff) · checkpoint 에서 이어 가기 · crash window(부작용 1건) 시험
- 검증: Backend 328 · Python 53 · Front 39 · 두 프로세스 E2E(Python 재시작 · 신호 유실 → API 재기동 → 재조정 → 같은 실행 COMPLETED · Runtime 장애 재시도 · 상한 FAILED)
- 남은 판단: 상한 25/12/2 · Runtime 시간 제한 120초 · 재시도 3회/30초 — 모두 기본값 [ASSUMPTION], Agent Eval 로 조정 · checkpoint 보관 · 정리 주기
- 다음: **T-105** 첫 Agent Vertical Slice(사용자 지시로 바로 시작)

## 2026-10-22 · T-103 DONE — Agent Tool Layer v1 · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인**(`feat: add agent tool capability layer`). push 없음
- 한 일: `back/src/agent-tools/`(Registry 9 · zod 계약 → `packages/contracts/agent-tools/agent-tools.v1.json` · 실행기: 검증 · 기록 · 멱등 · 시간 제한 · 오류 분류 · 출력 검사 · 서비스 인증 Bearer · 실행 범위) · `/internal/agent-tools/*` · `/agent-runs/*` · M16(`agent_run` · `agent_tool_call`) · M17(행위자 · 전이 · 열 가드 · GRANT) · `DraftService` Agent 옵션(승인 대기에 올리지 않음) + `requestApproval`(승인 아님) · `PublicDataService.*As` · Python `ai/cera_ai/tools/`(계약 기반 Registry · 스키마 검사기 · 타입 있는 Client) · 시드 AI_AGENT 행위자
- 검증: Backend 311 · Python 39 · Front 39 · 실제 경로 Python Client → NestJS Tool API → data.go.kr(LIVE), 공공 원장 행위자 AI_AGENT
- 남은 판단: Agent 초안의 숫자는 아직 계획 엔진에서 오지 않는다(사람 승인이 마지막 문) · `gap-rules/0` · Tool 시간 제한 값 · 큰 적하목록 페이지 상한
- 다음: **T-104** LangGraph Runtime(StateGraph · interrupt · resume · Backend 경유 checkpoint)

## 2026-10-22 · T-102 DONE — DS-03 + DS-02 Public Data Adapter (live 검증) · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인(구현) + live 검증**(`feat: add public logistics data adapters`). push 없음
- 한 일: `back/src/public-data/`(전송 포트 · 실제 HTTP · 녹화 재생 · XML 봉투 · 정규화 · 원장 · 원문 · 개체 · PUBLIC_API 사건 · 개발 API 6개) · M14(6표) · M15(가드 · GRANT) · 합성 fixture · `docs/22` rev.2.6 · `docs/24` 22.30~22.35 · 18.9 · 필드 사전 정정
- live 검증(사용자 키 입력 뒤): DS-03 부산 181건(4쪽) · 91건(2쪽), DS-02 1,227행(상한 20쪽에서 truncated) · 291행 · 데이터 없음 2건. 실제 응답 기준 최소 수정: `*` 비표준 계선 시설 코드(이름만 남김, LOW) · 신청구분 최초 · 변경 · 최종(최종 아니면 LOW) · **입항 신고 일시 = `ARRIVAL_DECLARED`(`declared_arrival`) — 실제 입항 마일스톤(`milestone.arrived`)으로 쓰지 않는다** · **데이터 없음 = `00` + 0건만**(`03` 미관측 → 데이터 없음 규칙에서 제외, 오면 UPSTREAM_ERROR). `tkinTkoutSe` 4값 → Q-18 CLOSED. 상세 field-dictionary 9절 · `docs/05` 4.4 `ARRIVAL_DECLARED` 추가
- 검증: Backend 전체 시험 통과 · typecheck · build · `drizzle-kit check`

## 2026-10-22 · T-101 DONE — Agent Runtime 설계 (ADR-036 Accepted) · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인**(이 항목과 같은 커밋 `docs: define CERA agent runtime architecture`). push 없음
- 한 일: 두 오케스트레이션(NestJS 권한 · 업무 사실 / Python + LangGraph 추론) · Tool Layer(부작용 등급 5종, COMMIT 등급 미노출) · 공공데이터는 Backend Adapter 경유 · checkpoint = 실행 상태 · Graph State = ref 만 · `CeraRecoveryGraph` 하나로 시작 · 평가 4층(single-call vs graph) · 작업 순서 T-102~T-107. 공공 API 공식 재확인(DS-01~03 정상 · 무료, DS-02/03 가이드 새 PDF 2026-10-06, DS-02 `entrpsCd` 크기 차이 7 vs 9)
- 사용자 결정(2026-10-22): ADR-036 승인 · ADR-015 일부 대체 · ADR-033 결정 3·4 일부 개정 · 2026-09-11 공공 API 실호출 금지 해제 · `vessel_call` P0 승격 · T-005/T-006 DEPRECATED → T-106/T-102 · T-099 는 T-105 뒤 재개
- T-105 확인: 설계 문서 13절 6번째 줄에 정의돼 있었다(이름 "첫 Vertical Slice", 9.3절). 그대로 QUEUE 에 등록. 번호 정본은 QUEUE(등록 전 최대 T-099)
- 변경: `docs/tasks/plans/T-101-agent-runtime-design.md` · `docs/14`(ADR-036 · ADR-015/033 표시) · `docs/06` · `docs/18` O절 · `docs/23` · `ai/README.md` · `AGENTS.md` · QUEUE · LOG
- 다음: **T-102** (DS-03 + DS-02 Public Data Adapter) — 커밋 전 사용자 보고. T-103 은 T-102 검토 전 시작 금지

## 2026-10-22 · T-100 DONE — Runtime 설정 정리 · Claude Code (claude-opus-5-5)
- 상태: **완료 — 커밋 `1c58f08`**(`chore: align runtime configuration`). push 없음
- 한 일: Backend 설정 스키마에 공공데이터 · Agent Tool 항목 + production 금지 조합(장애 주입 · 공공데이터 replay · live 키 없음 · 짧은 토큰) · AI Server 설정 검증 모듈 신설(LLM · Decision · Agent, production replay 금지) · `.env.example` ↔ 코드 키 양방향 시험 · `npm run env:check` · `python -m cera_ai.config` · CURRENT 의 Git/remote 사실 오류 정정
- 검증: Backend unit 113 · typecheck · AI pytest 32. DB 시험은 설정 외 변경이 없어 돌리지 않음
- 주의: 로컬 `back/.env` 는 비밀 파일이라 고치지 않았다 — 빠진 키는 `npm run env:check`

## 2026-10-07 · T-092 DONE — U7 회신 추출 파이프라인 · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인 뒤 커밋**(`feat: add AI reply extraction pipeline`, 이 항목과 같은 커밋). 기준 HEAD `4f78fec`. push 없음. T-099 · T-093 시작 안 함. T-098 은 건드리지 않음
- 한 일: 정상 회신만 → Backend 가 물은 질문 · 기준일 · 정확한 원문 텍스트를 Python AI Server 에 보냄(트랜잭션 밖 · 시간 제한) → AI 는 값 후보 + 원문 인용만(녹화 재생) → 결정론 검증기(질문 범위 · 인용 원문 대조 · 형식 · 단위 · 값-인용 · 상충) → `extraction`(통과 PENDING · 탈락 REJECTED · SYSTEM). 기술 실패는 `system_error` + 재시도 한도. 화면 "AI 제안"(확정 아님 표시). 사건 · 현재 사실 생성 없음
- 발견 · 처리: AI Server 가 요청을 거부한 경우(422)를 출력 오류로 분류하던 것 → `EXTRACTION_REQUEST_REJECTED` 로 분리 · 시험의 SYSTEM 행위자 가정 수정 · 정본 D.3 `slot` 대신 답할 칸(`field`)을 써서 `validator_result` 의 `FIELD` 에 남김(U7-7 — U8 에서 판단)
- 검증: Backend `npm test` **266**(247 + 19) · Python `pytest` **7** · Front `npm test` **39** · typecheck · build · lint 오류 0 · `drizzle-kit check` · OpenAPI 최신 · smoke · E2E(초안 → 승인 → 발송 → Mock 회신 → 수신 → AI 추출 → 검증 → 화면, 묻지 않은 단가 탈락, 사건 0, 보류 회신 AI 호출 0, 콘솔 오류 0)
- 실제 LLM 공급자는 호출하지 않았다(공급자 미정 — ADR-033). 녹화 재생(Recorded) 공급자로 E2E 검증, 사용자 승인으로 완료 인정(2026-10-07). 후속: 답 칸 이름의 정식 위치(U7-7, U8 에서 판단) · 재추출(SUPERSEDED) 명령 · `unmapped_statements` 미저장 · Gmail RFC822 텍스트 추출(Slice 2)
- 다음(사용자 결정 2026-10-07): **T-099** 실제 AI 공급자 검증 + CERA 평가셋(값 · 근거 정확도 · 범위 위반 · 스키마 실패 · 조건부 표현 · 지연 · 비용 비교, Jev 는 판정 후보로) → 그 뒤 **T-093**(U8 사건 · PROVISIONAL)
- 큐 변경: T-092 `DONE` · **T-099 추가** · T-093 의존에 T-099 추가

## 2026-10-07 · T-091 DONE — U6 수신 · 원문 보존 · 스레드 연결 · 발신자 판정 · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인 뒤 커밋**(`feat: add inbound reply processing`, 이 항목과 같은 커밋). 기준 HEAD `cd0565f`. push 없음. T-092 시작 안 함. T-098 은 건드리지 않음
- 한 일: Mock 수신함 → Worker 수신 주기 → 원문 바이트를 내용 저장소에 먼저(저장 후 지문 확인) → 한 트랜잭션 `raw_input`(ON CONFLICT — 중복이면 전체 건너뜀) → 정상이면 INBOUND 메시지(상태 · 초안 주체 NULL) + 보낸 메시지 `REPLIED` + 스레드 `ANSWERED`, 보류면 원문만 남기고 사유를 감사 기록. 스레드 연결 = 회신 헤더(성공한 발송 시도의 외부 id) · 외부 스레드 id, 어긋나면 보류. 발신자 = 등록부만(LLM 없음). Q-44 근거 시각. 화면 회신 · 보류함
- 사용자 검토로 고친 것: **Q-44 거부 사유가 영속되지 않았다**(서버가 읽을 때 원문으로 다시 계산 — 원문 파기 뒤 재현 불가) → 수신 트랜잭션에서 감사 `INBOUND_DATE_REJECTED_<사유>` 로 남기고 API 는 영속 값만 읽게 함(원문 파일을 지운 뒤에도 같은 값 — 시험)
- 검증: Backend `npm test` **247**(232 + 15) · typecheck · build · `drizzle-kit check` · Front `npm test` **37** · lint 오류 0 · build · smoke · 헤드리스 Edge(발송 → Mock 회신 → 수신 → 화면 · 같은 회신 반복 1건 · 미등록 발신자 보류 · 스레드 밖 보류, 콘솔 오류 0)
- 후속(사용자 결정 2026-10-07, blocker 아님): 보류 회신을 사람이 문의에 연결하는 명령(`LinkHeldInbound`) 없음 · 수신 워터마크 미저장(Mock 은 매 주기 전체 + UNIQUE) · 원문 읽기는 MOCK 형식만(Gmail RFC822 는 Slice 2) · 반송 · 전달 · 자동 회신 판별 없음. **채널은 Mock 이다 — 실제 메일 수신이라고 쓰지 않는다**
- 다음: **T-092(U7)** — 정상 회신 원문에서 AI 가 값 후보 + 원문 인용만 내고 결정론 검증기가 거른다(발신자 · 스레드 · 근거 시각은 이번 판정을 그대로)
- 큐 변경: T-091 `DONE`

## 2026-10-07 · T-090 DONE — U5 Outbox · Mock 발송 · 멱등 · 화해 · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인 뒤 커밋**(`feat: add outbox mock send workflow`, 이 항목과 같은 커밋). 기준 HEAD `6dd6a3c`. push 없음. T-091 시작 안 함. T-098 은 건드리지 않음(큐에 유지)
- 한 일: 발송 요청 API(검증 → `APPROVED → QUEUED` 만, 외부 호출 없음) · Worker(`OutboxDispatcher` — 화해 → `FOR UPDATE SKIP LOCKED` 픽업 → 같은 발송 판정 → 시도 선커밋 → 트랜잭션 밖 Mock 발송 → 결과 한 번 · 백오프 · 정책 거부 시 대기 해제) · 세션 advisory lock 단일 Worker · `ChannelAdapter` 포트 + `MockChannelAdapter`(파일 보낸 편지함, 네트워크 없음, 장애 주입) · M13 상태 전이 가드 · 화면 발송 상태
- 발견 · 처리: 발송 완료 뒤에도 [승인 취소]가 보임 → 숨김 · OpenAPI DTO 선언 순서(데코레이터 메타데이터) · M13 이 "승인 뒤 DRAFTED 되돌리기"를 막아 T-089 시험 2곳 조정(`docs/24` 18.6 U5-9)
- 검증: Backend `npm test` **232**(211 + 21) · typecheck · build · `drizzle-kit check` · Front `npm test` **34** · lint 오류 0 · build · smoke · 헤드리스 Edge(초안 → 승인 → 발송 요청 → Worker → 발송 완료 · 재요청 → 1통 · 승인 뒤 Gate 차단) · **실제 Worker 프로세스 크래시(exit 70) → 재기동 → `lookup_sent` → SUCCESS · 1통** · UNKNOWN 화해
- 기술 부채 4건(사용자 결정 2026-10-07, T-090 blocker 아님 — 후속 Task): ① `X-CERA-Actor-Id` 임시 인증(인증 구현에서 교체) ② kill switch 실행 중 전환 명령 없음(설정값만) ③ `DELIVERY_FAILED` 수동 재시도 명령 없음 ④ 장시간 채널 호출 + 향후 다중 Worker 에서 화해 대기 시간(60초) 위험. **채널은 Mock 이다 — 실제 Gmail 발송이 되었다고 문서 · 화면에 쓰지 않는다**
- 다음: **T-091(U6)** — 회신 원문 보존 · 어떤 발송 스레드의 답인지 연결 · 발신자 등록 여부 판정 · 정상/보류 분리. LLM 없음. 그 뒤 추출(T-092), T-098 은 적절한 시점에
- 큐 변경: T-090 `DONE`

## 2026-10-07 · T-089 DONE — U4 발송 승인 · 반려 · 승인 취소 · 무효화 · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인 뒤 커밋**(`feat: add human approval workflow`, 이 항목과 같은 커밋). 기준 HEAD `36ae8b2`. push 없음. T-090 시작 안 함
- 사용자 결정(2026-10-07): ① 승인자 = 헤더 `X-CERA-Actor-Id`(서버가 활성 HUMAN 확인) ② 구조화 값 변경 = 수정 API `values`(바뀐 값은 계획 출처를 뗀다) ③ 계획 교체 = 도메인 함수 + 승인 시 검사(HTTP 없음) ④ 승인 유효 기한 기본 24시간
- 한 일: 승인은 운영자가 본 `content_hash` 에 대한 것 — 지문 · 수신자 · 계획 실행 · 제목 · 본문 · 구조화 값 사본 · 승인자 · 시각 고정. 승인 직전 재검증(최신 수정본 · 지문 · 숫자 검사 · Contact Gate · 계획 교체). 수정 = 새 메시지 + 옛 승인 `INVALIDATED(CONTENT_CHANGED)`. 반려(사유 필수) · 취소(`REVOKED`) · 재승인. **M12**(메시지 행 잠금 · 살아 있는 승인 1건 · 지문 일치 · 상태 · 계획 교체 거부 · 나간 메시지 취소 불가). 프론트 승인 영역
- 발견 · 처리: **T-088 `content_hash` 가 `docs/24` 8.2 와 달랐다**(제목 · 본문만) → 정본 `msg-content/1` 로 수정(T-088 로컬 초안은 승인 불가 — 새로 만들면 됨) · OpenAPI 매개변수 순서가 tsx/vitest 에서 달라 고정 · M12 에 맞게 기존 시험 4곳 조정(`docs/24` 18.5 U4-9)
- 검증: Backend `npm test` **211**(184 + 27) · typecheck · build · `drizzle-kit check` · Front `npm test` **27** · typecheck · lint 오류 0 · build · validate · smoke · 헤드리스 Edge 승인 흐름 · `git diff --check`
- 기술 부채 2건(사용자 결정 2026-10-07, T-089 blocker 아님): ① `X-CERA-Actor-Id` 승인자 헤더는 인증 전 임시 장치 — 인증 구현에서 교체 ② 메시지 상태 전이 순서는 DB 가 완전히 강제하지 않음 — T-090 발송 lifecycle 구현 때 실제 전이 규칙과 함께 검토
- 다음: **T-090(U5)** — Outbox · Mock 발송 · 발송 직전 `isUsableForSend`(15.5.1) + Contact Gate 재확인 · 새 실행 등록 경로에서 `invalidateForNewRun` 호출
- 큐 변경: T-089 `DONE`

## 2026-10-06 · T-088 DONE — U3 문의 초안 · 구조화 값 · 숫자 검사 · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인 뒤 커밋**(`feat: add communication draft validation flow`, 이 항목과 같은 커밋). 기준 HEAD `c7cdb5b`. push 없음. T-089 시작 안 함
- 한 일: `POST /communication/drafts` — Contact Gate → 값 형식 · 출처 → Backend 가 질문 대상 확정 → 템플릿 문장(AI 없음) → 순수 숫자 검사 → 내용 저장소(트랜잭션 밖) → 한 트랜잭션(스레드 · 질문 · 메시지 · 구조화 값 · 상태 전이). 통과한 초안만 `PENDING_APPROVAL`. 본문 수정 = 새 메시지 + 재검사(이전 `CLOSED`). 읽기 · 목록 · 계획 실행 · 시설 목록 endpoint. OpenAPI + 생성 타입. 프론트 "문의 초안" 카드(이 영역만 실제 API) · `.act-btn`
- 검증: Backend `npm test` **184**(156 회귀 + 단위 13 + DB/API 15) · typecheck · build · `drizzle-kit check` · 생성 차이 0 · fresh M01→M11 2회 · seed 25 → 0 · 빌드본 API(생성 201 PENDING_APPROVAL · 막힌 주소 403) · Worker `--once` · Front `npm test` **20** · typecheck · lint 오류 0 · build · validate · smoke · 헤드리스 브라우저 흐름(콘솔 오류 0) · `git diff --check`
- 발견 · 처리: 밝은 카드에 어두운 바 전용 `.pb-btn` 을 써 버튼이 안 보임 → `.act-btn` · `BLOCKED_NUMBER_CHECK` 는 DB 상태 코드가 아님 → `DRAFTED` 유지 + 읽을 때 재계산(U3-1)
- 남은 위험: 값이 계획 부족분과 같은지는 아직 대조하지 않음(부족분이 DB 에 없음, U3-5) · 인증 없음 → 전이 행위자는 SYSTEM(U3-4)
- 다음: **T-089(U4)** — 승인 · 반려 · 승인 취소, 승인 시 숫자 재검사 + Contact Gate 재확인 + 사본 · `approved_plan_run_id`, 계획 교체 · 내용 변경 무효화
- 큐 변경: T-088 `DONE`

## 2026-10-06 · T-087 DONE — U2 Registry · Contact Gate · 개발 안전장치 · Claude Code (claude-opus-5-5)
- 상태: **완료 — 사용자 승인 뒤 커밋**(`feat: add contact gate and registry API`, 이 항목과 같은 커밋). 기준 HEAD `17399b8`. push 없음. T-088 시작 안 함
- 결정(사용자, Plan 10절): D1 `CONTACT_INACTIVE` 추가 · D2 개발 안전장치 = 실채널(GMAIL · PORTAL) × 비운영, 목록 비면 전부 차단 · D3 M11 등록부 불변 열 가드 · D4 생성 타입 + `/dev/api` · D5 막힌 시드 주소 2개
- 한 일: 순수 판정 `back/src/registry/contact-gate.ts`(import 0 · 6조건 · 사유 6종 · 사유 전부 반환) · `RegistryService` · `GET /registry/counterparties` · `GET /registry/addresses/{addressId}/eligibility`(404 `ADDRESS_NOT_FOUND` · 400 `INVALID_ID`) · OpenAPI 응답 스키마 · M11(`contact_channel_address` 주소 · 연락처 · 채널, `counterparty_contact.counterparty_id` 불변) · 시드 25행 · `openapi-typescript` 7.13.0 → `packages/contracts/openapi.d.ts` · `front/web/src/api/registry.ts` · 계약 최신 검사 시험 · 문서(`docs/24` 12.1 · 12.3 · 18.3, `docs/18` D.5 · G.5, `docs/16` 4.1, packages · back README, AGENTS)
- 검증: Backend `npm test` **156 통과**(135 회귀 + 13 + 8) · typecheck · build · `drizzle-kit check` · 생성 차이 0 · fresh M01→M11 2회(이력 11 · 표 29 · 함수 17 · 트리거 72) · seed 25 → 0 · 빌드본 API `/health` + 두 endpoint 실제 호출 · Worker `--once` 0 · Front `npm test` 17 · typecheck · lint 오류 0 · build · validate · smoke · 프록시 200 · `git diff --check`
- 발견 · 처리: ① 고치기 전 `cera_app` 이 `normalized_address` 를 바꿔 승인 메시지를 다른 주소로 돌릴 수 있었다 → M11 ② `openapi:emit`(tsx)은 decorator metadata 가 없어 경로 매개변수가 빠졌다 → `@ApiParam` 명시(계약 최신 시험이 잡음) ③ 서버를 끈 뒤 node 자식이 포트를 잡고 남아 옛 빌드가 응답 → PID 정리
- 계획과 다른 점: 개발 안전장치 정책을 별도 파일 없이 `contact-gate.ts` 한 순수 모듈에
- 다음: **T-088(U3)** — 초안 · 구조화 값(출처 포인터) · 숫자 검사 · 템플릿 초안 포트. 판정 `evaluateContactGate` 는 U4 승인 · U5 발송 직전에 다시 부른다
- 큐 변경: T-087 `DONE`

## 2026-10-06 · Frontend 정리 — Vite 전환 커밋 · 디자인 커밋 · 실제 Backend 연결 준비 (사용자 직접 지시) · Claude Code (claude-opus-5-5)
- 상태: **완료.** 기준 HEAD `5463078`(T-086). 커밋 3개 — 해시는 `git log --oneline -4`: `refactor(front): switch Control Tower to Vite + React SPA (CSR only)` · `style(front): apply Control Tower design refresh` · `feat(front): prepare backend integration boundary`(이 항목과 같은 커밋). push 없음. T-087 시작 안 함
- 구현 도구: Claude Code 직접 구현(Orchestrator 겸). 다른 Coding Agent 는 쓰지 않았다 — 한 파일을 여러 Agent 가 고치지 않음
- 한 일
  - **① CSR 전환 커밋**: Vite 설정 · Next 파일 삭제 · ADR-035 · 정본 동기화(`docs/01` 7절 · `docs/07` 3·6절 · `docs/10` · `docs/18` · `docs/23` 2·12절 · `docs/16` · AGENTS · README). HEAD 컴포넌트에서 `"use client"` 만 지운 판으로 index 를 만들고, **그 커밋만 꺼낸 임시 worktree 에서** typecheck · lint · build · validate · smoke · 프록시 health 통과 확인(Antigravity 변경 없이도 동작)
  - **② 디자인 커밋**: 2026-09-17 Antigravity 변경(컴포넌트 11 · `globals.css`)을 그대로. **검토 결과 시뮬레이션 표시 일부를 지운 것을 발견** — 절감액 "(시뮬레이션 기준)" · 계획 "시나리오 결과 (Solver 아님)" · "시나리오 시계" (`docs/01` 4절 · 규칙 9)
  - **③ 연결 준비 커밋**: `src/api/`(config · client · errors · health) · `src/state/async.ts` · `src/components/workflow/`(AsyncStatus · GateBlockers · MessageLifecycle · CandidateBadge · lifecycle 매핑) · `BackendStatus`(데이터 출처 Mock 과 Backend 연결 상태를 따로) · 계약 `MessageView.lifecycle`(정본 상태 코드, MockProvider 매핑) · dev 페이지가 같은 API base 사용 · ②가 지운 표시 복구 · `.env.example` · vitest 5.0.1 + 단위 시험 15 · `docs/16` 4.1 · `docs/23` 7.1(배포 원칙 Implementation Note) · QUEUE 프론트 트랙 문구 갱신
- 검증: `npm test` 15 통과 · typecheck · lint 오류 0(경고 2 — 기존 `badges.tsx`) · build · validate:scenario OK(2,238 — 개수는 `src` 파일 수 × 금지 표현 7패턴이라 파일이 늘면 는다) · smoke OK · `/backend/health` 프록시 200 · 화면 확인(헤더 "데이터: Mock (시나리오)" + "Backend 연결됨 · DB up" · S2 초안 3건 "승인 필요" · S4 회신 "잠정 정보", AI 표시 없음) · lockfile 깨끗한 설치(`npm ci`) · `npm audit --omit=dev` 0
- 주의사항: vitest 추가 때 npm 10.9 arborist 버그(`edgesOut`)로 `--legacy-peer-deps` 사용 — 결과 lockfile 은 `npm ci` 정상. `src/app/` 폴더 이름은 Next 시절 이름(옮기지 않음). 라우터 라이브러리 미선택
- 다음: T-087(U2) — 엔드포인트가 생기면 `ApiProvider` 를 그 화면부터. Contact Gate 사유 코드 · 메시지 상태 · 승인 무효화는 OpenAPI 계약으로 받아 `GateBlockers` · `MessageLifecycle` 에 연결

## 2026-10-06 · T-086 DONE — U1 Persistence Foundation (최종 안전성 검토 · 커밋) · Claude Code (claude-opus-5-5)
- 상태: **완료.** 기준 HEAD `b7103de` → T-086 커밋 `feat: add CERA persistence foundation`(이 항목과 같은 커밋). push 없음. T-087 은 시작하지 않음(사용자 지시)
- 한 일(2026-10-06 최종 검토 — 구현 내용은 아래 2026-10-02 항목)
  - **A. `actor.actor_type`**: 정본 `docs/24` 22.2 = "`actor_type` 불변"인데 B층 가드가 없었고 M10 이 `cera_app` 에 `actor` UPDATE 를 준다. 고치기 전 개발 DB 에서 `cera_app` 이 SYSTEM actor 를 HUMAN 으로 UPDATE 함을 **실제로 확인**(ROLLBACK) → 사람 승인 가드(`fn_cera_guard_approval_insert`) · 확인 처리 가드 우회 가능. **수정**: M07 `tg_actor__guard_columns`(`display_name` · `is_active` 만 변경, 그 밖 CE002). 마스터 열 가드 금지(12.1)의 유일한 예외로 문서화
  - **B. 계획 기반 승인**: 정본(`docs/22` 15.5 `approved_plan_run_id` = "어느 계산 결과를 근거로" 단수 · `docs/19` FR-COM-10 문의 ↔ 계획(버전) · FR-APV-06 근거 계획이 바뀌면 자동 취소)과 대조 — 기존 가드는 "값에 `source_run_id` 가 있으면 `approved_plan_run_id` NOT NULL"만 봤다. **수정**: M08 `fn_cera_check_approval_copies`(커밋 시)가 값의 실행이 2개 이상이면 CE006, 1개면 `approved_plan_run_id` = 그 실행(아니면 CE006). `source_run_id` 없는 값만 있으면 계획 무관 승인 유지
  - **C. `system_error` 기록기**: DB 삽입 실패는 이미 `null` 로 격리돼 있었지만 문맥 · ID 생성이 `try` 밖이고 `ApiErrorFilter` 가 `void` 로 부른 Promise 의 rejection 을 처리하지 않았다. **수정**: `record` 전체를 `try` 로(실패 로그까지 격리) · 필터는 `.catch(() => undefined)`. 응답은 원래 오류 그대로
  - 문서: `docs/24` 12.1(예외) · 12.3 · 22.x · 18.2(트리거 70 · U1-2 보강 · U1-10(a) 해소 · **U1-11**) · QUEUE(T-086 DONE) · CURRENT(IDLE) · AGENTS 1절
- 변경 파일(이번 검토): `back/drizzle/migrations/0006_m07_append_only_guards.sql` · `0007_m08_communication_guards.sql` · `back/src/persistence/system-error-recorder.ts` · `back/src/http/error.filter.ts` · `back/test/db/{fixtures,invariants.test}.ts` · `back/test/unit/persistence-support.test.ts` · `docs/24` · `docs/tasks/{CURRENT,QUEUE,LOG}.md` · `AGENTS.md`
- 검증(2026-10-06 실제 실행): 대상 시험 39 통과 → 전체 `npm test` **135 통과**(unit 50 · db 85, 회귀 +9) · typecheck · build · 개발 DB `down -v` 뒤 **fresh M01→M10**(2회 — 이력 10행 · 29표 · 트리거 함수 17 · 트리거 70) · seed 2회(20 → 0) · 고친 뒤 같은 우회 시도 → CE002 · `drizzle-kit check` · `generate` 차이 0 · 빌드본 API `/health` 200 `db:up` · 404 공통 바디 · Worker `--once` 0 · `git diff --check`
- 커밋 범위: T-086 파일만 경로로 staging(`git add .`/`-A` 없음). `AGENTS.md` 는 T-086 줄만 index 에 넣고 프론트 줄(ADR-035)은 working tree 에 남김
- 남은 일 / 다음 한 걸음: **T-087(U2)** — 등록부 · Contact Gate · 개발 안전장치 · 첫 업무 endpoint · OpenAPI 확장. Brief → 사용자 승인부터
- 큐 변경: T-086 `DONE`
- 주의사항: migration M01~M10 은 커밋됨 — 고치지 말고 M11 부터 · 다른 마스터의 "불변" 열(`contact_channel_address.normalized_address` · `channel_type` · `counterparty_contact.counterparty_id` · `facility.facility_type` · `scenario.as_of_base`)은 여전히 A층만 지킨다 — U2 Contact Gate 설계 때 B층 강제 여부 판단 · 프론트 CSR 전환(ADR-035)은 별도 커밋 대기(CURRENT 표)

## 2026-10-02 · T-086 구현·검증 완료 · 사용자 검토 대기 — U1 Persistence Foundation · Claude Code (claude-opus-5-5)
- 상태: **중단(검토 대기)** — 구현·검증 끝, 사용자 검토 전. T-086 은 `IN_PROGRESS` 유지. 기준 HEAD `b7103de`. **staging 0 · commit 없음 · push 없음**
- 사용자 지시: Phase A → B → C 를 중간 승인 없이 진행(18:00 체크포인트 규칙). 착수 전 "분할 여부" 결정은 이 지시로 해소 — 적용은 빈 DB 에 M01 → M10 한 번
- 한 일
  - **Phase A**: P0 29표 Drizzle 스키마(`back/src/db/schema/` — 파일 = migration 층) · drizzle-kit 생성 SQL M01~M06(층마다 따로 생성 → 사람 검토). 스키마 `cera` 생성 포함 · 이름 규칙 `pk_/fk_/uq_/ck_/ix_`(63자 검사) · CLOSED 코드 단일 원천 `codes.ts`
  - **Phase B**: custom SQL M07(append-only · DELETE · TRUNCATE 거부 · 열 가드 · 한 번 채움) · M08(발송 결과·삽입 가드 · 추출 검토 · 승인 삽입 가드 · 승인 사본 지연 검사 · 메시지 자식 가드 · 상태 전이 캐시) · M09(사건 삽입 가드 · 사건 링크 지연 검사 I-8/I-21/I-26 · 다형 가드 · 처리 가드) · M10(표 단위 GRANT). 함수 17 · 트리거 68 · SQLSTATE CE001~CE006
  - **Phase C**: `AuditRecorder`(같은 트랜잭션 / 단독) · `SystemErrorRecorder`(별도 트랜잭션, 메시지·스택 저장 안 함) · `ApiErrorFilter` 5xx → `system_error` · `RegistryReader` · `EventWriter`(evk/1) · `ContentStore` 포트 + `LocalFileContentStore` + `ContentService`(생성 4단계 · 파기 4단계 · 손실 판정) · Slice 1 시드(`npm run db:seed`, local·test 만, 고정 UUIDv7, 창고 A 수용량 사실은 raw_input → event → 링크) · OpenAPI 뼈대(`GET /openapi.json` · `npm run openapi:emit` → `packages/contracts/openapi.json`)
- 검증: `npm test` **126 통과**(unit 47 · db 79, U0 61 포함 — 독립 검토 반영 뒤) · fresh DB M01→M10(시험마다) · 반복 적용 이력 10행 · 개발 DB migrate 2회 · seed 2회(20 → 0) · typecheck · build · `drizzle-kit check` · 생성 차이 0 · 빌드본 API `/health` · `/openapi.json` · Worker `--once` · `npm audit --omit=dev` 0 · `git diff --check`
- 새로 발견·해석: `docs/24` 18.2 U1-1~U1-8(FK 이름 축약 1 · 계획 기반 승인 판정 · 사본 검사 부착 위치 · 발송 시도 OUTBOUND 한정 · DEFAULT PRIVILEGES 미사용 · 한 번 채움 `UPDATE OF` · `CERA_CONTENT_DIR` · 오류 코드 최소 카탈로그). 상위 설계 변경 0. 독립 검토로 결함 5건 수정(U1-9) · 남은 위험 3건 알림(U1-10)
- 변경 파일: `back/`(src · test · drizzle · package.json · lock · .env.example · vitest.config.ts · README) · `packages/contracts/openapi.json` · `packages/README.md` · `docs/24` · `AGENTS.md` · `docs/tasks/{CURRENT,QUEUE,LOG}.md`. `front/web/` · `data/Proposal/` · `scripts/` 변경 없음
- 다음 한 걸음: 사용자 검토 → 승인되면 커밋(범위는 CURRENT) → T-086 DONE → T-087(U2)
- 큐 변경: T-086 `IN_PROGRESS`(검토 대기)

## 2026-09-23 · T-085 DONE — U0 Backend Foundation (구현 2026-09-22 · 최종 검토·커밋 2026-09-23) · Claude Code (claude-opus-5)
- 상태: **완료 — 독립 최종 검토 통과 뒤 커밋.** 기준 HEAD `8f9d2bf`. push 없음. **첫 제품 코드**
- 한 일
  - `back/`: NestJS 12.0.4 모듈형 모놀리스 · ESM · TypeScript 5.9.3. API 진입점 `src/main.ts`(HTTP) · Worker 진입점 `src/worker.ts`(HTTP 없음, `--once` 기동 점검). 같은 코드베이스, 별도 프로세스(ADR-033)
  - `infra/local/`: PostgreSQL 18(Docker Compose, `127.0.0.1:55442` — 55432 는 다른 프로젝트가 사용 중) · 초기화 스크립트가 역할 `cera_owner`(소유) · `cera_app`(앱) · DB `cera` · `cera_test` 를 만든다 · public 스키마 CREATE 회수
  - Drizzle 0.45.3 + node-postgres 8.23.0(세션 `TimeZone=UTC`) · drizzle-kit 0.31.11(`drizzle.config.ts` — 스키마 `cera`, 이력 `cera_meta.drizzle_migrations`, push 없음, `db:migrate` 는 소유 역할로 명시 적용) · 제품 스키마는 빈 파일(U1)
  - 공통: zod 설정 검증(값 비노출) · `Instant`/`Clock`(`SystemClock` · `FakeClock`) · UUIDv7(`uuid` 14) · `Krw`(bigint · 10진 문자열 · number 거부) · SHA-256 `sha256:<hex>` + RFC 8785 JCS(`canonicalize`) · `TransactionRunner`(READ COMMITTED 명시 · 중첩 금지) + `assertOutsideTransaction` · request/trace(W3C)/correlation 문맥(AsyncLocalStorage) · 오류 BUSINESS/VALIDATION/SYSTEM + `{code,message,request_id}` · `/health`(DB 포함, 다운 시 503) · `/health/live`
  - `docs/24` 18.1(`[TO VERIFY]` 결과) · `AGENTS.md` 6절 명령 · `back/README` · `infra/README` · CURRENT · QUEUE
- 검증(2026-09-23 독립 재실행): `typecheck` · `build` · `npm test` **61 통과**(unit 37 · db 24 — 실제 PostgreSQL 18.6) **2회 연속 동일**(기존 DB 상태에 의존하지 않는다 — spike 스키마는 시험이 만들고 지운다) · 빌드본으로 API 기동(`/health` 200 `db:up` · `/health/live` · 404 공통 오류 바디 · `x-powered-by` 없음 · SIGTERM 종료) · Worker(`--once` 종료 0 · idle 뒤 SIGTERM 종료, 바쁜 루프 없음) · `db:migrate`(적용할 것 없음)
- 역할 경계 **DB 에서 직접 확인**: 실행 프로세스(`application_name=cera-api`)가 `cera_app` 으로 접속(`pg_stat_activity`) · `cera_app` 은 superuser·createdb·createrole·bypassrls 없음, `cera_owner` 멤버 아님, `public`·DB `CREATE` 권한 없음 · 시험에서 DDL·`TRUNCATE`·`DISABLE TRIGGER` 42501 거부 · 소유 역할 URL 은 migration 명령만 쓴다
- 최종 검토에서 고친 것 **2건**: ① `infra/local/compose.yaml` 이미지가 떠다니는 `postgres:18` → **`postgres:18.6` 고정**(digest 동일 확인 후 교체, 컨테이너 재생성 · 볼륨/DB 보존) ② `back/test/db/processes.test.ts` 가 API 자식 프로세스를 `kill` 만 하고 종료를 기다리지 않던 것 → **종료 대기 + 종료 확인** 추가(고아 프로세스 방지 · 신호 처리 실제 검증)
- **완료 조건 중 미이행 1건**: `OpenAPI 뼈대 (R-01)` 는 만들지 않고 **U1(T-086)로 이월**했다 — U0 에는 업무 endpoint 가 `/health` 뿐이라 계약 문서 대상이 없다. QUEUE 의 T-085·T-086 행에 표시했다
- 비밀정보: `back/.env` · `infra/local/.env` 는 루트 `.gitignore` 로 무시됨을 `git check-ignore` 로 확인 · 저장소에 들어가는 파일에는 placeholder(`change-me-local-*`)와 시험 fixture 만 있다 · 초기화 스크립트는 비밀번호를 psql 변수로 넘긴다(소스 고정 없음)
- 주의: Docker Desktop 을 켜자 다른 프로젝트 컨테이너(parkgolf · watereffect)도 재시작 정책으로 함께 올라왔다 — **건드리지 않았다** · drizzle-kit 개발 의존성 moderate 4건(옛 esbuild 개발 서버 advisory)은 **dev 전용**(`npm audit --omit=dev` = 0건)이라 판을 유지했다(강제 수정은 drizzle-kit 0.18 로 내려감)
- 제품 스키마 · migration · 트리거 · 시드 · ContentStore · Outbox 는 만들지 않았다(U1 이후). `front/web/` · `data/Proposal/` · `scripts/` 변경 없음
- 다음 한 걸음: **T-086(U1 — P0 29표 스키마 · M01~M10 · 시드 · 감사/오류 기록기 · ContentStore · OpenAPI 뼈대)**

## 2026-09-22 · T-080 DONE · T-097 DONE — 논리 모순 해소(`docs/22` rev.2.5) + Slice 1 P0 물리 설계 · Claude Code (claude-opus-5)
- 상태: **완료 — 사용자 + ChatGPT 최종 승인.** 기준 HEAD `4db8608`. push 없음
- 최종 확인 2건: (1) `external_thread_id` 유일 범위 `(channel_type, external_thread_id)` 는 "채널당 연결 계정 1개" 전제 — 재오픈 조건이 `docs/22` 15.1 · `docs/24` 13절 U-5 · 25절 F-4 에 이미 있었다 (2) INBOUND `current_status = NULL` 의 뜻("상태 모름"이 아니라 "보내는 메시지 생애주기 미적용", 수신 처리는 raw_input → extraction → event)을 `docs/22` 15.3 · `docs/24` 0절 · 22.14 에 명시로 보강
- 사용자 검토 결과(T-097 · Q-69 CLOSED): 큰 방향 승인 · F-1~F-5 는 `docs/22` 수정 허용 · D-4 · D-5 보완 · F-9 는 업무 컬럼 추가 없음
- 한 일
  - **`docs/22` rev.2.5**(최소 변경, 새 표·컬럼 0): 15.7 · 15.7.3 규칙 2·4·6·7(시도별 멱등 키 · 논리 발송 = 메시지 · 성공 1 · 미확정 1 · `UNKNOWN` 화해 한 번) · 17.2 · I-18 · 1.3 · 15.1(`external_thread_id` 한 번 · 유일 범위 = 채널 종류) · 15.3(`sent_at` 한 번 · INBOUND `drafted_by`·`current_status` NULL) · 15.8.1 · 표기 정정(감사 `FAILURE` · 강도 `0`~`3` · `link_role` 필수 · 명령 id) · 작업표 21셀(서식 유지 확인)
  - `docs/24` 재동기화: 0 · 3 · 4 · 6 · 8.2 · 10 · 12(A+B+C · 표 단위 권한 · 열 가드 · 한 번 채움 · 화해 증거) · 13(U-6 · U-7) · 14 · 15(T6r 화해) · 16.2(생성·파기 일관성) · 17 · 18(10/14/5) · 21 · 25~27
  - 정합: `docs/18` H.2 · 336행 · T-069 계획 13절 사후 주석 · `docs/15` Q-69 CLOSED · README · AGENTS · QUEUE(T-097 DONE) · CURRENT
- 새로 발견: INBOUND `current_status` 도 `drafted_by` 와 같은 문제(상태 값이 보내는 메시지 생애주기) → 같은 방식(OUTBOUND 만 필수)으로 정리, 보고
- 검증: `docs/22` rev.2.5 작업표 재파싱 587 · P0 29표 **349/349** 순서 일치 · CLOSED 54 · CATALOG 27 · 규칙 id 2 · FK 58 + 복합 13 · 시나리오 점검(재시도 · `UNKNOWN` 화해 · 강제 종료 · 중복 발송 · `sent_at` · Gmail thread id · INBOUND 저장 · append-only · ContentStore) PASS · `git diff --check` 통과
- **제품 코드 0 · SQL/migration/schema.ts 0 · 설치 0 · `docs/21` 0**
- 다음 한 걸음: **T-085(U0)** — 시작하지 않았다

## 2026-09-22 · T-080 초안 완료 · 상위 판단 대기(T-097) — Slice 1 P0 물리 DB 설계 · Claude Code (claude-opus-5)
- 상태: **차단(사람 판단 대기)** — 설계 초안은 끝났지만 논리 모델 충돌 5건이 `docs/22` 변경을 요구한다. T-080 은 `IN_PROGRESS` 유지, **T-097(NEEDS_HUMAN, Q-69)** 신규. **미커밋.** 기준 HEAD `4db8608`
- 한 일
  - **`docs/24_cera-physical-data-model.md`** 신규(29절) + 짝 작업표 `docs/24_cera-physical-data-model.xlsx`(4 시트)
  - 공통 규칙: ID = **UUIDv7 · `uuid` · 앱 생성**(시드는 결정적 UUIDv7) · CODE = **ENUM 없음, CLOSED CHECK 53 · CATALOG 형식 CHECK 28 · 규칙 id 2**, 코드 표 없음 · 시각 = `timestamptz(3)` · 세션 UTC · DB 는 시각을 만들지 않음 · KRW = `bigint` → TS `bigint` → API 10진 문자열 · `numeric` 문자열 경계 · jsonb 6곳 + `conflict.event_ids` → `uuid[]` · 해시 = SHA-256 `sha256:<hex>` + RFC 8785 JCS 재료 판
  - 사건 멱등 `evk/1`(원천 + JSON Pointer 주장 위치 + SUBJECT + fact_key/대상 집합 + 범위 + 부류) · 사람 명령 재시도는 명령 id = `raw_input.source_record_key`
  - FK: 기본 RESTRICT · CASCADE 0 · SET NULL 1 · 복합 FK 13(J.3 채널·시뮬레이션 일치 · 같은 메시지 승인 등) · 순환 2개 "NULL 먼저, FK 나중" · P1 참조 2컬럼은 FK 없음 + 임시 CHECK
  - append-only: **A 저장소 + B 트리거 + C 역할 분리·열 단위 GRANT** 를 Slice 1 부터 · 발송 시도 삽입 가드(I-9) · 지연 제약 트리거(I-8 · I-21 · I-26 · 승인 사본)
  - Outbox: 세션 advisory lock(단일 워커) + `FOR UPDATE SKIP LOCKED` + 부분 유일 · T1~T12 매핑 · 내용 저장소 = DB 밖 `ContentStore` 포트(`cref:v1:<범주>:<uuid>`) · 파기 판정 부분 인덱스 · migration M01~M10(생성 6 + custom 4) · 앞으로만 · 시드는 local·test 명령
  - 동기화: `docs/15` Q-69 · `docs/README` · `AGENTS.md` 문서 지도·현재 단계 · `docs/07` 4절 한 줄 · QUEUE(T-080 IN_PROGRESS · T-097 신규) · CURRENT
- 검증: `docs/22` 작업표를 다시 읽어 `docs/24` 22절 컬럼과 표·순서별 대조 — **29표 · 349/349 · 불일치 0** · `git diff --check` 통과
- 발견(`docs/24` 25절): **F-1** 발송 멱등 키 UNIQUE ↔ 재시도 · **F-2** `UNKNOWN` 화해 ↔ 결과 한 번(S-03) · **F-3** `sent_at` · **F-4** `external_thread_id` · **F-5** INBOUND `drafted_by` — 논리 변경 필요. F-6~F-8 표기 불일치 · F-9 Outbox trace 전파 저장 위치 없음 · F-10 마스터 `is_simulated` 없음 · F-11 물리 보조 제약 확인
- **제품 코드 0 · SQL/migration/schema.ts 0 · 설치 0 · `docs/21` · `docs/22` 변경 0**
- 다음 한 걸음: 사용자 **T-097(Q-69)** → `docs/22` 반영 → `docs/24` 맞춤 → 사용자 + ChatGPT 검토 → T-080 DONE → U0(T-085)

## 2026-09-22 · T-084 DONE — Q-68 DB 결정 반영 · Claude Code (claude-opus-5)
- 상태: **완료 — T-084 DONE (사용자 결정 · 최종 승인).** 기준 HEAD `12a849a`. push 없음
- 결정(사용자, Option A): **PostgreSQL**(로컬·시험·운영 모두 — **SQLite 미사용**, 개발/운영 DB 이원화 금지) + **Drizzle ORM**(SQL-aware Hybrid — 핵심 경로는 PostgreSQL 의미를 드러내 쓴다, DB 불변식을 앱 코드로 흉내 내지 않는다) + **drizzle-kit 생성 SQL migration → 사람 검토 → 저장소 기록 → 명시 적용**(운영 자동 동기화 · `push` 정본 사용 · 검토 없는 파괴적 migration 금지). DB 권한·스키마·migration 은 Main Backend 만. Prisma · Kysely · TypeORM · MikroORM 후보 제외
- 재확인한 방향(구현 방식은 T-080): 외부 I/O 는 트랜잭션 밖(시도 선커밋 → send → 결과 트랜잭션) · DB Outbox + 단일 워커 폴링, 큐 제품 없음 · append-only 는 PostgreSQL 제약으로 먼저 강제 · BIGINT 를 무조건 JS number 로 바꾸지 않음 · 시각 규칙(ADR-006 · ADR-032) 유지
- 한 일
  - `docs/14`: **ADR-034 Accepted** 추가(마지막 번호 ADR-033 확인 뒤 배정) · ADR-004 **Superseded by ADR-034**(2026-09-22 주석)
  - `docs/15`: **Q-68 CLOSED**. Q-65 는 OPEN 유지
  - `docs/07` 3절 DB 줄(옛 SQLite·SQLAlchemy·Alembic 폐기 표시) · `docs/23` 머리·2·13절 · `docs/22` 포인터 3곳(논리 모델·rev 변경 0건) · `docs/01` 7절 · `back/README` · T-069 계획 16.4·17·19절 · `plans/T-084-db-decision-options.md` 결정 완료로 전환(**4절 방향 제안은 확정 아님** 명시) · `AGENTS.md` · QUEUE · CURRENT
- T-080 / U0 로 넘긴 것: 물리 타입 · PK/ID · FK · UNIQUE · 부분 유일 인덱스 · append-only 차단 수단 · JSON 물리 구조 · 멱등 직렬화/해시 · 주장 위치 · `schema_version` 형식 · BIGINT ↔ TS 경계 · 시각 물리 매핑 · 워커 잠금 SQL · 내용 저장소 물리 참조 · migration 순서·명령 · 로컬 PostgreSQL 실행 방식 · 버전 · 연결 풀
- 정하지 않은 것: PostgreSQL · Drizzle · Node/Nest 버전 · 호스팅 · HA · 백업 · Docker 여부 · 배포 · Redis/큐 제품 · 내용 저장소 제품
- **제품 코드 0건 · 패키지 설치 0건 · SQL/migration/설정 파일 0건 · `docs/21` 변경 0건.** `front/web/` · `data/Proposal/` · `scripts/` 는 건드리지 않음
- 최종 승인 때 표현 정정: "부분 유일 제약"을 PostgreSQL 물리 기능명처럼 쓴 곳(ADR-034 결정 1 · `docs/07` 3절 · T-084 비교 표 · T-069 계획 16.4 · QUEUE T-080)을 **"partial unique index 등으로 부분/조건부 유일을 구현할 수 있다"** 로 고쳤다. `docs/22` 의 "부분 유일 제약"은 vendor 중립 논리 규칙이라 그대로 둔다. index SQL 은 T-080
- 다음 한 걸음: **T-080(P0 29개 물리 설계)** → T-085~T-096

## 2026-09-21 · T-083 DONE — Q-64 Main Backend 결정 반영 · Claude Code (claude-opus-5)
- 상태: **완료 — T-083 DONE (사용자 결정).** **미커밋**(staging·commit·push 는 사용자 승인 뒤). 기준 HEAD `cad92ed`
- 결정(사용자): **Main Backend = TypeScript + NestJS**, 모듈형 모놀리스(같은 코드베이스의 API + Worker 프로세스). **AI Server = 별도 Python 런타임**(FastAPI 또는 동등) — 권한 없음(DB·발송·사건·사실·승인 X), LLM 공급자 클라이언트만, 출력은 후보. Main Backend → AI Server 는 HTTP/JSON(timeout · 제한 재시도 · `correlation_id`/`trace_id` · 장애 격리)
- 함께 적은 원칙: DB Outbox + 단일 워커 폴링(큐 제품 없음) · OpenAPI → 생성 TS 타입(Frontend 는 Backend 내부 타입 import 금지) · 스키마 단일 원천 · 외부 호출은 트랜잭션 밖 · 시각은 타임존 붙은 한 타입 · 금액은 원 정수(BIGINT 변환 규칙은 U0/T-080)
- 한 일
  - `docs/14`: **ADR-033 Accepted** 추가 · ADR-002 **Superseded by ADR-033** · ADR-031 결정 1·2·8 **Superseded**(3~7·9 는 Proposed 유지) · ADR-026·029 는 그대로
  - `docs/15`: **Q-64 CLOSED**. Q-65 · Q-68 은 OPEN
  - `docs/07` 1·2·3·6절(Python 스택 줄은 "폐기" 표시, back·ai 공통 domain 패키지 없음) · `docs/23` 2·3.1·11·13절(AI Server 는 처음부터 별도) · `docs/01` 7절 · `back/README` · `ai/README`(LLM 공급자 클라이언트만) · `AGENTS.md`(현재 단계 · 코드 · 문서 지도 · 명령 T-085) · T-069 계획 사후 주석(AI 포트 = HTTP 어댑터, 위치는 U0/U7) · QUEUE · CURRENT
  - 남은 "미결" 한 줄씩: `docs/16` 1절 범위 표 · `docs/22` 다음 작업 5번(rev 는 올리지 않음 — 표·컬럼·제약 변경 0건). `docs/15` Q-65 에 "솔버는 TS 로 강제하지 않음" 주석
- 정하지 않은 것: DB 제품 · ORM · 마이그레이션(Q-68) · 스키마·HTTP·로깅·스케줄러 라이브러리 · 버전 · 큐 제품 · Python 패키지 · LLM 공급자 · 솔버(Q-65) · endpoint · 폴더 구조
- `docs/18` C절(사용자 지시로 T-083 범위에 포함): `ai/` 행에서 "결정론 검증기" 제거 — 형식 수준 스키마 검사만, 검증·강도·권한·신원·매핑·Event 수용·현재 상태는 Main Backend · 규칙 2 결정론 엔진 위치 `back/` · 규칙 5 "허용 외부 호출 = LLM 공급자 API 뿐, Gmail·채널·DB 권한·운영 시스템·Event/CanonicalFact 변경 없음" · 규칙 6 회신 처리 순서 신설 · C.1 마지막 줄. T-069 계획 5.x `ai/` 줄과 19.3 #3 "정리 완료"
- **제품 코드 0건 · 패키지 설치 0건 · `docs/21` 변경 0건**
- 다음 한 걸음: 사용자 **T-084(Q-68)** → T-080(P0 29개 물리 설계) → T-085~T-096

## 2026-09-21 · T-069 DONE — 첫 Vertical Slice 구현 계획 종료 · Claude Code (claude-opus-5)
- 상태: **완료 — T-069 DONE (사용자 최종 승인).** 커밋은 이 기록과 같은 커밋(`git log` 이 정본). push 없음
- 산출물: `docs/tasks/plans/T-069-external-communication-slice.md`
- 결론
  - **Slice 1 = Mock External Communication Loop**(`18` J.4 1·2단계 — 루프 REAL, 채널·AI·계획 MOCK). Slice 2 Tech Validation · Slice 3 실제 LLM
  - **L-13 CLOSED = `recovery_run` 계보의 뿌리 실행 id**(`docs/22` I-35·I-36). 새 표·컬럼·개념 없음
  - **P0 29개**(P1 14 · DEFERRED 9 = 52)
  - 정상 회신: 검증 통과 값 → 사건 → PROVISIONAL/OBSERVED → 사람 확인 → CONFIRMED. **사건 생성 승인 게이트 없음**
  - 지난 계획 기준 회신: 사건·후보는 되지만 **현재 계획에 자동 반영 안 됨**(계획 불변 · 자동 재최적화 없음 · 스레드 안 질문 매핑). 범위와 다른 축
  - **Q-64 Backend 결정 필요 → T-083(NEEDS_HUMAN)** · **Q-68 DB 결정 필요 → T-084(NEEDS_HUMAN)** · **Q-65 솔버는 Slice 1 blocker 아님**
  - **T-080 은 T-083·T-084 뒤** · 구현 단위 **U0~U11 = T-085~T-096**, T-080 DONE 전에는 실행 가능하지 않음 · T-003 은 T-085 에 흡수(DEPRECATED)
- **제품 코드 구현 0건** · `docs/21` 변경 0건
- 다음 한 걸음: 사용자 **T-083(Q-64)** → **T-084(Q-68)** → T-080

## 2026-09-21 · T-069 구현 계획 (첫 Vertical Slice) · Claude Code (claude-opus-5)
- 상태: **계획 초안 완료 — 사용자 + ChatGPT 검토 대기.** `IN_PROGRESS` 유지(완료 조건 마지막이 사용자 승인). **미커밋.** 기준 HEAD `3106772`
- 산출물: **`docs/tasks/plans/T-069-external-communication-slice.md`**(`plans/` 첫 사용)
- 결정·정리
  - **첫 Vertical Slice = Slice 1 Mock 루프**(`18` J.4 1·2단계): 루프 전체 REAL, 채널·AI·계획만 MOCK. `19` 의 "첫 구현"(20절 34항목, 실제 Gmail 포함)을 **Slice 1(Mock 루프) → Slice 2(Tech Validation: 등록 명령·확인 메일·Gmail·요율) → Slice 3(실제 LLM)** 으로 나눠 34항목을 Slice 별로 매핑
  - **L-13 CLOSED — `recovery_run` 계보의 뿌리 실행 id.** 근거는 `docs/03` 2.6.1(운영자 개입은 첫 계산 뒤) — 실행 전 범위가 필요 없다. 새 표·컬럼 없음, ExceptionCase 부활 없음. `docs/22` I-35(범위 참조 = 존재하는 뿌리 실행 id) · I-36(같은 사고 재계산은 계보를 잇는다). 지난 계획 기준 회신은 **사건은 정상 생성, 현재 계획에만 자동 반영하지 않는다**(현재 문의의 답으로 연결 안 함 · 재계산 계기 없음 · 표시) — 검토에서 정정, 아래 참고
  - **P0 29 · P1 14 · DEFERRED 9 = 52.** 부족분(gap)은 논리 표가 없으므로 시드 fixture + `source_path` 로 가리킨다. `container`·`assignment` 는 P1
  - REAL/MOCK/DEFERRED 표 · Backend 기능 단위(F·A·B·B2·C·D·E)와 의존 · AI 포트 2개(DraftWriter 템플릿 · ReplyExtractor 녹화 재생) · Mock 채널 두 선언(비정형/구조화) · Query 10 · Command 16 · 공통 오류 응답 · **Q-66 오류 코드 초안** · Phase 0~11(**T-003 은 Phase 0 으로 흡수**) · 트랜잭션 경계 12 · 멱등 경계 · 시험 41개 · **DoD 18항목** · Backend·DB 기술 조건과 Q-64/65 평가 기준 · T-080 인계 목록 · N.2 15가지 답 · 작업 단위 U0~U11
  - 금지선 확인: **M-6 · Q-46 확정하지 않음**, Q-48 은 "지금 넣지 않는다"만, 기술 선택 없음, 새 Reconciliation 규칙 없음(`18` F.5 부분집합)
- 정본 정정: **`docs/18` N.2 #13 "K.2 성공 판정 13개" → 12개**(목록 자체가 12개). 그 밖의 표기 불일치(절 순서 · C 표의 검증기 위치 · T-003 의 Python 표현 · 로드맵에 Tech Validation 없음)는 계획 19.3 에 보고만
- 변경 파일: 계획 문서(신규) · `docs/22`(.md L-13 · I-35 · I-36 · 머리 / .xlsx OpenDecisions) · `docs/15`(L-13) · `docs/18`(N.2 #13) · `AGENTS.md` · `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 하지 않은 것: 제품 코드 · SQL/DDL · 물리 스키마 · 기술 선택 · 실제 Gmail · T-080 · T-082 · `docs/21` · staging·commit·push
- **(같은 날 검토 반영)** ① 초안의 "지난 계획 기준 회신은 사건을 만들지 않고 사람이 채택"은 **정본에 없는 새 게이트**였다 — `19` FR-INB-09 · 10.1 표는 "**현재 계획에** 자동 반영 안 함"이지 사건 금지가 아니다. **B(사건·근거는 남기고 현재 계획에 자동 반영 안 함)** 로 정정, 계획 4.3 에 정상 흐름과 "사건이 없는 경우"를 정본 근거로 고정. `docs/22` L-13 문구도 정정 ② **DB 선택에 Open Question 번호가 없었다**(ADR-004 Proposed · `docs/23` 미결 표뿐, "Q-64·Q-65"로 잘못 묶임) → **Q-68 신규 등록**. 순서: T-069 승인 → Q-64 → Q-68 → T-080 ③ 가상 데이터 실발송 차단 시험 G-06 을 **인수 시험 + DoD 19번**으로 올림(시험용 "실채널 선언" 어댑터) ④ P0 29개 재검증 — 유지
- **(같은 날 2차 검토 반영) 지난 계획 기준 회신 ↔ L-13** — 초안의 "원래 맥락에 속하고 현재 맥락 계산에는 보이지 않는다"는 **같은 사고 안에서 성립하지 않았다**(Run 1·Run 3 이 같은 뿌리). 정본 확인: R1 제외 목록에 "지난 문의"는 없고, 맥락 범위 기본값은 운영자 입력에만 해당하며(`22` 22.2), Slice 1 회신 사실은 `GLOBAL` 이다. **범위는 차단 장치가 아니다.** 실제 보장은 ① 계획·스냅샷 불변(`22` 13절 · I-12) ② 회신 자동 재최적화 없음(`18` L) — 이후 슬라이스에서도 지난 계획 기준 회신은 `REPLY_RECEIVED` 계기가 아님(FR-INB-09) ③ `ask_id` 가 자기 스레드 질문에만 매핑(`18` D.3). 계획 4.3 에 A~F 표로 고정, `docs/22` L-13 설명·시험 I-06 정정. **U0~U11 의존**(계획 20.1): Q-64 → Q-68 → T-080 → U0…, T-080 전에는 코드 단위를 실행 가능으로 보이지 않게 한다. 새 게이트·새 개념 없음
- 다음 한 걸음: 사용자 + ChatGPT 검토 → T-069 DONE · 구현 태스크 등록 → 사용자 Backend 결정(Q-64) → DB 결정(Q-68) → T-080(P0 29개)

## 2026-09-21 · Q-44 · Q-45 Decision Closure (`docs/22` rev.2.4) · Claude Code (claude-opus-5)
- 상태: **완료 — 사용자 최종 승인(2026-09-21).** 기준 커밋 `c16e1d7`(T-081). 제품 코드 0건. 커밋은 이 기록과 같은 커밋(`git log` 이 정본)
- 지시: 사용자 결정 Q-44 = ②, Q-45 = ① 을 정본에 반영하고 Q-45 때문에 필요한 **최소 논리 구조 보완까지만**. T-069 본문 · T-080 · 기술 선택 · 제품 코드 금지. `docs/21` 수정 금지. 새 표·개념 변경이 반드시 필요하면 멈추고 보고
- **Q-44 (CLOSED)**: `Date` 가 있고·정상 파싱되고·**채널 수신 시각보다 미래가 아니면** `Date`, 아니면 채널 수신 시각 + `date_header_rejected` · 거부 사유(`MISSING` · `UNPARSEABLE` · `AFTER_CHANNEL_RECEIVED`). 과거 `Date` 허용. 원래 두 시각·선택 결과는 **`event.payload` 여섯 키**(11.2d 판단 기준 — 조회·제약 대상이 아니어서 컬럼 불필요). 허용 오차 없음(필요하면 정책 파라미터, τ 재사용 안 함). `internalDate` 의미 `[TO VERIFY]`
- **Q-45 (구조 CLOSED / 기간 OPEN)**: **기록과 내용 분리 — 행 삭제 ≠ 내용 파기.** 단순 파기는 기존 규칙 4개(원문 행 삭제 금지 · 본문·인용·승인 사본 UPDATE 금지)와 `docs/21` 18절에 부딪혔다. **새 표 없이** `raw_input.payload_ref` 패턴을 확장해 풀었다
  - 내용 컬럼 → 참조 + 지문: `comm_message.subject`·`body_text` → `message_content_ref` · `message_approval.approved_subject`·`approved_body_text` → `approved_content_ref` · `extraction.source_quote` → `source_quote_ref` + `source_quote_hash` · `commercial_offer.conditions_text` → `conditions_content_ref` + `conditions_hash` · `raw_input.attachment_manifest`(지문·크기·형식만, 파일명 금지)
  - 논리 모델 자유 입력 필드 전수 조사 → A 기록 / B 민감 내용 / C 감사 메타 / D 별도 보안 정책 분류(29.2)
  - 파기 가능 조건(29.7 — 진행 중 흐름의 내용은 파기 불가) · **파기 감사는 `audit_log` 기존 컬럼으로**(`CONTENT_PURGED`, 새 컬럼 없음) · 파기 여부는 저장하지 않고 조회 · **재현성 ≠ 원문 재처리 능력**(A-05 는 원문이 보관된 동안 보장)
  - HTML 따로 저장 안 함 · 첨부는 보관 + 지문까지 · 연락처 익명화·법적 의무 `[TO VERIFY]` · Tech Validation 은 전용 계정·단계 종료 후 정리 · 기간 숫자는 Pilot 정책
- **새 표 0개 · 논리 테이블 수 52 그대로.** 보관 관리 내용은 논리 테이블이 아니라 기록이 가리키는 내용의 저장 위치다(`payload_ref` 와 같은 성격). **`docs/21` 수정 불필요** — 원문 보관 기간은 `docs/21` 23절이 Q-45 로 사용자에게 넘겨 둔 것이고, 원본 기록 행은 지워지지 않는다
- 추가: 무결성 I-28~I-34 · 안티패턴 11 · walkthrough 27.12(메일 시각) · 27.13(내용 파기) · 검증 **17항목 추가 → 64개 PASS** · **ADR-032 Accepted**(사용자 결정, 기간 숫자 제외)
- **(승인 전 최종 확인) 정상 파기 vs 데이터 손실** — 규칙이 **없었다.** 29.1 은 "내용 없음 = 파기됨"으로 읽혔고 27.13 은 감사를 삭제보다 먼저 남겼다. 29.8.1 · I-34 로 보완: 내용 부재 × 성공한 `CONTENT_PURGED` 감사로 판정, 근거 없는 부재는 손실(`system_error`), `SUCCESS` 는 제거 확인 뒤에만. 새 표·새 컬럼 없음
- 함께 정리: `docs/18` F.2 표를 rev.2.3 필드명으로(`extraction.method` → `extraction_method`, `confidence` → `input_confidence_level`, 옛 멱등 키 공식 → `docs/22` 11.2d 재료) — 새 설계 없음
- 작업표: 블록 53 · **컬럼 586 → 587**(참조 + 지문 교체의 순증 +1) · 키 색 보존 확인 · 필수 컬럼 존재·옛 컬럼 잔재 0 · Markdown ↔ 작업표 컬럼 이름 일치
- 변경 파일: `docs/22`(.md · .xlsx) · `docs/14`(ADR-032) · `docs/05` · `docs/15` · `docs/18` · `docs/19` · `docs/23` · `docs/README.md` · `AGENTS.md` · `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 하지 않은 것: T-069 본문 · T-080 · 기술 선택 · 제품 코드 · L-13 · T-082 · 기간 숫자 · 물리 저장 위치 · staging·commit·push
- 다음 한 걸음: 사용자 검토 → commit(지시 시) → **T-069**

## 2026-09-21 · T-081 논리 모델 후속 (rev.2.3) · Claude Code (claude-opus-5)
- 상태: **완료 — T-081 DONE (2026-09-21, 사용자 최종 승인).** 승인 전 최종 확인 3항목 통과 후 닫았다. 최종: **MVP 52 · Next 1 · MVP 에서 만들지 않음 2 = 55** · 작업표 블록 53 · 컬럼 586 · 흐름 검증 **47개 PASS** · `docs/21` 변경 0건 · 제품 코드 0건. 커밋은 이 기록과 같은 커밋(`git log` 이 정본). push 없음
- (아래는 작성 당시 기록. append-only 라 고치지 않는다 — "검토 대기" 표현은 당시 상태)
- 기준 커밋: `3b1bda3`(T-070). 이 커밋 위의 문서 변경만. 제품 코드 0건
- 지시: 승인된 Event/State 규칙이 `docs/22` 에서 빠진 부분을 복구한다. 새 제품 설계를 벌리지 않는다. `docs/21` 수정 금지. 구현 코드·SQL·물리 설계 금지. **C(출처 어휘)는 사용자가 선택지 ① 로 결정**
- **착수 전 확인에서 이전 보고의 오류를 잡았다**: 분석 단계에서 **ADR-017 을 `Accepted` 라고 보고했는데 HEAD 기준 `Proposed`** 다(`docs/14:205`). 사람 확인 사건의 근거를 **승인된 `docs/21` 9절·12.2 + `docs/20` A-17(근거 ADR-028 `Accepted`) + ADR-020 `Accepted`** 로 다시 세웠다. ADR-019·020 은 `Accepted (구조 한정)` 로 확인됨
- 한 일 (`docs/22` rev.2.3)
  - **A 사람 확인·정정**: `event.event_class`(OBSERVATION/CORRECTION/VERIFICATION) · `verification_action` · `verification_method` + **새 표 `event_verification_target`**(`TARGET`/`OVERRULED`, 3열 PK). JSON 배열이 아니라 연결 표인 이유는 R1 기각·6.1 계산이 **역방향 조회**를 하기 때문(11.2a)
  - **B 검증기 신뢰도**: `input_confidence_level`(HIGH/MEDIUM/LOW) + `input_confidence_reasons`(JSON). `input_quality`(입력 형태)와 **다른 축**임을 표로 고정. 없으면 `docs/05` 3.3 강도표를 색인할 수 없어 **Reconciliation 전체가 돌지 않는다**(11.2b)
  - **C 출처 3축**(사용자 결정): `source_kind` 6값 → **`source_type` 7값**(ADR-020) · `source_role_at_ingestion` · **`extraction_method` 신설** · `source_id` 추가. `PLAN_UPLOAD` → `FILE_IMPORT` + `fact_kind = PLAN`, **`INTERNAL` 은 문자열 치환하지 않고 의미로 나눴다**(엔진 추정 = `INFERENCE`+`CALCULATED`). `raw_input.source_type` 도 같은 집합으로(11.2c)
  - **D 나머지 4.2 필드**: `event_type` · `schema_version` · **`idempotency_key` UNIQUE** · `correlation_id` · `payload` · `source_id` · `extraction_method`. 멱등 키 재료에 **적용 범위 2컬럼 + 주장 위치(claim locator)** 를 넣었다 — 옛 `hash(raw_ref, entity, fact_key)` 를 그대로 쓰면 범위가 다른 두 주장이 같은 키가 되어 **운영자 입력이 조용히 버려진다**(11.2d)
  - **E 상태 차원 복구**(재대조에서 나온 것, 가장 무거움): `canonical_fact` 가 한 enum 에 합쳐 두던 것을 **`value_status`·`freshness_status`·`conflict_status`·`hold_status`·`decision_usability` + `verification_basis`** 로. ADR-020 `docs/14:252` 가 명시한 구조이고 `docs/14:253` 이 단일 enum 을 **기각된 대안**으로 적어 둔 것이다. rev.2.2 상태로는 **R10 보류와 `APPROVAL_BLOCKED`(FR-OPT-06 Must)를 표현할 수 없었다**. 정본에 없는 값 `VERIFIED`·`ASSUMED` 제거(11.4.2)
  - **`canonical_fact.confidence` 제거**: 승인 문서·ADR·`docs/05` 어디에도 계산 의미가 정의된 적이 없다. 새 의미를 만들지 않고 없앴다. 남은 "신뢰" 이름 4개는 각자 다른 질문에 답한다
  - **F 스냅샷 동결**: `planning_snapshot_fact` 에 상태 6차원 + `evidence_policy_version`·`rule_version`·근거 시각 3종 복사. **I-12 가 "그때 왜 승인 가능했나"까지 넓어졌다**(13.2.1)
  - **G `extraction` 보강**: `schema_version`·`input_hash`·**`validator_result`**(승인된 `docs/21` 13절 요구). `model_confidence`(LLM 자기 점수, 쓰지 않음)와 구분(15.9.2)
  - **H 메시지 상태 매핑**: 반송·영구 실패·재시도 가능·보냈는지 모름·승인 취소·숫자 검사 실패를 **기존 구조 어디로 보내는지** 표로. **새 표·새 상태 값 0개**(15.8.1)
  - 무결성 규칙 **I-21~I-25** 추가, I-12 확장 · 흐름 검증 **14항목 추가(30 → 44, 전부 통과)** · walkthrough **27.9 정정 · 27.10 재처리 멱등 · 27.11 범위별 멱등** 추가 · 27.1 에 확인 단계 4줄(6a~6d) 추가
  - **23.1절 신설**: `docs/05` 4.2 **29개 필드 전체 대응표**(SAME/RENAMED/SPLIT/MOVED/NOT STORED + 근거). **누락 0건**
- 수: **MVP 52 · Next 1 · MVP 에서 만들지 않음 2 = 55**. 작업표 블록 **53** · 컬럼 **586**(rev.2.2 는 52 · 557). 실제로 스크립트로 다시 셈
- 검증: I-7 재확인(늘어난 다섯 차원이 전부 `event` 에서 재계산되는지 표로 따짐 — `canonical_fact` 에만 있는 정보 0) · I-12 확장 · Markdown ↔ 작업표 대조 스크립트(필수 컬럼 존재 / 옛 컬럼 잔재 0 / 블록 이름 일치) **PASS** · `git diff --check` 통과 · staged 0건 · `docs/21` 변경 0건 · 제품 코드 0건
- 변경 파일: `docs/22_cera-logical-data-model.md`·`.xlsx` · `docs/05`(머리 주석 4건 해소) · `docs/15`(T-081 절 신설 — 닫힌 것/연 것) · `docs/README.md` · `AGENTS.md` · `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 하지 않은 것: `docs/21` 수정 · **Q-46 닫기**(열어 둠) · L-13·L-14·L-15·L-16 · 물리 설계(해시 알고리즘·주장 위치 형식·JSON 구조 세부) · 기술 선택 · 제품 코드 · `front/web/`·`data/Proposal/`·`scripts/` · staging·commit·push
- 큐 변경: T-081 → **DONE**(완료 섹션으로 이동) · **T-082 신설(P2)** · 다음 작업 **T-069**
- 다음 한 걸음: **T-069**(착수 전 Q-44·Q-45 를 사용자에게 먼저 묻는다) → Backend·DB 기술 선택(사용자) → T-080(첫 범위의 표만)
- **(같은 날 추가) 승인 전 최종 확인 3항목** — 사용자가 방향을 승인한 뒤 요청. **새 표·새 컬럼 0개, 규칙·문구만**
  1. 확인 사건의 대상 좌표 일치 — **강제되지 않았다.** 11.2a 규칙 7·8 + 11.2a.1 + **I-26** 추가. 좌표를 넘나들면 I-8(SUBJECT 1건)이 결정되지 않고 `OVERRULED` 가 다툰 적 없는 사실을 기각한다
  2. `event_class` 별 조건부 무결성 — **이미 반영돼 있었다**(Markdown 규칙 5 + 작업표 제약 칸). 변경 없음
  3. `decision_usability` 파생·재현 — **판을 입력으로 명시하지 않았다.** 11.4.2 규칙 5 입력표 · I-24 수정 · 13.2.1 재현표 · **I-27** 추가
  - 검증 항목 44 → **47**(J 그룹). 작업표 제약·주의 칸 동기화, 블록 53 · 컬럼 586 **변동 없음** 재확인
- 주의사항: **`ADR-017` 은 여전히 `Proposed`** 다. Accepted 로 인용하지 않는다. **Q-46 은 열려 있다** — `source_type` 7값은 현재 ADR 기준의 정렬이고, 거래처가 직접 입력한 구조화 값을 `HUMAN_UI` 로 넣으면 권한 모델이 무너진다

## 2026-09-18 · T-070 주변 문서 동기화 · Claude Code (claude-opus-5)
- 상태: **완료 — T-070 DONE** (사용자 검토 → 판정 B → `docs/05`·`docs/18` 정리 후 종료). **미커밋 — commit 은 사용자 지시 대기**
- 목적: 확정된 설계(`21` 승인 · `22` rev.2.2 · `23` · ADR-026~031)를 주변 문서에 맞춰, 다음 에이전트가 오래된 문서를 읽고 잘못 구현하지 않게 한다. 새 설계 없음
- 한 일
  - `docs/04`: 1절 엔티티를 `21`·`22` 요약으로(B/L 독립 + `container_bl`, Destination·Carrier 는 역할, Facility·TruckPool, 통신 개념) · 3절 마스터 기준선 vs 사실 · 4절 견적 3층(CommercialOffer 근거 → 요율 사실 → 현재 요율) · 5절 비용 3종 · 7절 운영자 입력 4갈래 신설
  - `docs/07`: Python·FastAPI·SQLite 확정 표현 → "미결 — `23`", 모듈 그림에 오류 처리·채널, 2.2절 외부 통신 흐름, 3절 "(초안)", **4절을 `22` 대응표로 교체(X-10)**, 구현 상태 명시
  - `docs/13`: 닫힌 결정 반영(Facility · Destination · Actor · MBL/HBL · Resource · RateQuote → CommercialOffer · 저장 이름) + 4.1절 통신·상업 용어 19개(X-11)
  - `docs/19`: 문의 메시지 vs 발송 시도(X-12) · 확인 메일에 업무 질문·숫자 금지 · 승인 기록 방식 · 기술 실패는 사건이 아님 · 절 참조 정정
  - `AGENTS.md` 1.1: `ai/` = LLM·비정형 처리만, 결정론 엔진 = `back/`(ADR-029) · `back/`·`ai/`·`packages/`·`infra/`·루트 README 정리
  - `docs/18`: 머리 주석 + **본문** D.1(논리 설계 대응표) · E.1(발송 중·재시도는 `send_attempt`) · E.4 · H.2(발송 시도 행 기반 화해) · H.3 · H.4(무효화 행·`expires_at`) · K.1 · N.2
  - `docs/05`: 정본 관계 주석(개념 규칙 = `05`+`21`, 표·필드 = `22`)과 **결정 대기 네 곳** 표시 · `docs/06` G4 · `docs/12` T-041 · `docs/16` 라벨 · `docs/15` X-10~X-13 표시
- **새로 발견 → T-081 로 분리**: `docs/22` 의 `event` 가 `docs/05` 4.2 와 대조되지 않았다 — 사람 확인(VERIFICATION)·정정 사건 표현 없음, 검증기 `confidence` 자리 없음, 출처 종류 값 목록 두 벌(ADR-020 vs `22`), `idempotency_key`·`event_type`·`schema_version`·`extraction.method` 미표현. T-079 검증이 `22` 내부 정합성과 Markdown↔작업표 대조에만 집중해 놓쳤다
- 검증: `git diff --check` 통과 · staged 0건 · `docs/21`·`docs/22`·`docs/23` 변경 0건 · 제품 코드 변경 0건(`front/web` 기존 diff 그대로) · `docs/18` 에 `comm_message_events` 가 발송 시도 정본으로 남은 곳 0건(대응표의 옛 이름 칸만)
- 큐 변경: T-070 DONE → 완료 섹션 · **T-081 신설(P0, T-069 의존)** · 순서 T-081 → T-069 → Backend·DB 기술 결정 → T-080
- 다음 한 걸음: 사용자 지시 시 commit → T-081
- 주의사항: T-081 결정 전까지 사람 확인 사건·검증기 confidence·출처 종류 값은 **`docs/05`·`docs/22` 어느 쪽으로도 구현하지 않는다**

## 2026-09-18 · T-079 DONE — Minor Cleanup 4건 + 종료 처리 · Claude Code (claude-opus-5)
- 상태: **완료 — T-079 DONE** (사용자 + ChatGPT rev.2.2 최종 승인). **미커밋 — commit 은 사용자 지시 대기**
- 경과: 읽기 전용 최종 검증 판정 **B(READY AFTER MINOR CLEANUP)** — 구조 문제·blocker 없음, 표현 4건만 → 사용자가 4건 정리 + 종료를 지시
- 고친 것 (4건, 새 설계 판단 없음)
  1. **QUEUE 순서 통일**: "다음 추천" 번호 목록을 T-070(1) → T-069(2, Q-44·Q-45·L-13·첫 슬라이스) → Backend·DB 기술 결정(3, 사용자) → T-080(4) → 구현(5) 로 재배열. T-069 제목의 "다음 작업 / 1순위" 제거, T-070 을 "다음 작업 / 1순위"로. "실행 가능"·"앞으로의 순서"·T-080 의존·T-079 완료 블록의 옛 후속 순서 표기를 같은 순서로 맞춤
  2. **기술 결정 시점 표현 통일**: "T-080 때 닫는다 / T-080 에서 확정" → **"T-069 가 첫 슬라이스·요구사항 확정 → 사용자가 Backend·DB 결정 → T-080 이 결정된 기술을 물리 설계에 반영"**. `docs/23`(머리 표 · 2절 · 3.1 · 3.3 · 13절)에 더해 **같은 표현이 있던 `docs/14` ADR-031(요약·상태 줄) · `docs/01` 7절 · `docs/22` 28절 5번**도 같은 뜻으로 맞췄다(후보 상태는 그대로, 기술 확정 없음)
  3. **`docs/22` 1.3 요약 표에 `plan_decision` 행 추가**: `DECISION_RECORD` · `APPEND_ONLY` — 13.5 와 같은 의미(결정이 바뀌면 새 결정 행)
  4. **작업표 `message_approval`**: `approved_subject` · `approved_body_text` 제약을 "APPROVED 이고 원 메시지에 값이 있으면 필수" 로 Markdown 과 일치
- 종료 처리: QUEUE T-079-R·T-079 DONE, `진행 중` 비움 · CURRENT 를 **IDLE**(다음 작업 T-070)로 — T-073~T-079 경과는 이 LOG 에 있으므로 CURRENT 에서 뺐다(이전 내용은 `687d458` 의 CURRENT 에 남아 있다) · `docs/22` 상태 "rev.2.2 최종" · `docs/README.md`·`AGENTS.md` 상태 표기
- **최종 상태**: `docs/21` 승인·동결(무변경) · `docs/22` rev.2.2 최종 — **MVP 51 · Next 1 · MVP 에서 만들지 않음 2 = 54**(작업표 블록 52 · 컬럼 557) · `docs/23` 추가(ADR-030·031 Proposed, 기술 최종 결정 아님)
- 검증: `git diff --check` 통과 · 4건 Markdown ↔ 작업표 차이 0 · QUEUE 순서 충돌 0 · 기술 결정 시점 충돌 0("T-080 에서 확정" 류 표현 0건) · `plan_decision` 변경 방식 충돌 0 · staged 0건
- 하지 않은 것: 새 표 · `docs/21` 수정 · 기술 확정 · `AGENTS.md` 1.1절 `ai/` 행(T-070) · `front/web/`·`data/Proposal/`·`scripts/` · staging·commit·push
- 다음 한 걸음: **사용자 지시 시 commit** → **T-070**
- 주의사항: 바로 아래 항목(같은 날 rev.2.2 정리)의 "최종 검토 대기"는 당시 상태다. 2026-09-17 항목들의 "미커밋"은 rev.2.1 이 `687d458` 로 저장되기 전 표현이다

## 2026-09-18 · T-079 최종 정리(rev.2.2) + 런타임·관측성 문서화 · Claude Code (claude-opus-5)
- 상태: 완료 (**사용자 + ChatGPT 최종 검토 대기 · rev.2.2 미커밋**). rev.2.1 은 이미 `687d458` 에 저장돼 있다 — 바로 아래 2026-09-17 항목의 "미커밋"은 당시 표현이다(LOG 는 append-only 라 고치지 않았다)
- 지시: ① T-079 최종 검증에서 나온 A~E 정합성 5건 + 표현 잔재 정리 ② 시스템·외부 연동 오류 추적 구조를 설계 문서에 반영 ③ Backend·Web·Desktop 기술 방향이 기존 문서에 있으면 갱신, 정본이 없으면 새 문서 **하나**. 기술을 최종 결정하지 않는다. 제품 코드·SQL·staging·commit·push 금지. `docs/21` 수정 금지
- 조사 결과: 관측성·오류 처리 정본 문서 **없음**(`observability`·`trace_id`·`system_error` 0건). Backend 기술은 ADR-002(Python/FastAPI, **Proposed**)·`docs/07` 3절·`docs/01` 7절(초안)에만 있음. Desktop 은 ADR-024 "방향(미확정)"·`docs/07` 6절·루트 README 에 "Tauri 검토" 한 줄씩. NestJS·Spring·Electron 언급 0건. `docs/17` 의 AI 협업 역할은 사용자가 말한 역할과 **이미 일치**(수정 불필요)
- 한 일
  - `docs/22` **rev.2.2**: A `message_approval` 컬럼 표 "조건부" + 무결성 규칙 1~8 · B `send_attempt`(15.7.3)·`extraction`(15.9.1) 생애주기 · C `value_path` NOT NULL + "전체" 표시(물리 문자열은 T-080) · D `is_simulated` 2건 표기 · E `<RECOVERY_CONTEXT_REF>` · 유효 승인 **여섯 조건** 통일 · 안티패턴·절 번호 · 17.1 표 · 17.3 논리 연결 키 행 · L-1 · 머리의 커밋 표기(설계 입력 `1b97905` / rev.2.1 저장 `687d458`, 자기 최신 커밋은 적지 않음) · 28절 새 순서 · `vessel_call` 컬럼 표기
  - **`system_error` 추가**(16.2a): 분류 `EVIDENCE` · `APPEND_ONLY` · 20컬럼 · 다형 관련 개체(DB FK 없음, 쓰기 경로 존재 검사 예외) · I-18~I-20 · 27.8 Gmail 503 walkthrough · 27.6 H(4항목, 총 30항목) · 23절 "개념 모델 밖 기술 운영 표" · 21절 Activity Timeline 에 섞지 않음
  - 작업표: A~E 반영, `system_error` 블록, `00_목록` 51/1/2/54, `10_OpenDecisions` 제목·L-1·Q-66
  - **`docs/23_runtime-platform-and-observability.md` 신설**: 기준선 · Backend 후보 비교(**현재 우선 후보 NestJS + TypeScript**, Spring Boot 후보 유지, Python ADR-002 기록 유지) · **솔버 위험(3.3)** · 세 기록 분리 · 세 경계 공통 오류 처리 · DB vs 로그 기준 · 비밀 금지 · `request_id`·`trace_id`(업무 `correlation_id` 와 구분) · 공통 Integration Client · 오류 정규화 예시 · Web First · Desktop = Client · Electron 첫 후보/Tauri 나중 · `DesktopBridge` · AI 런타임 분리 조건 · OpenAPI · 미룬 결정과 시점
  - ADR-030(오류·관측성) · ADR-031(런타임 방향) **Proposed**. ADR-002·024 에 2026-09-18 주석
  - `docs/01` 6절(로그·오류 기록 비밀 금지)·7절(Backend 미결), `docs/07` 3·6절 참조 주석, `docs/12` 7절 Desktop 한 줄, `docs/13` 용어 5개, `docs/15` Q-64~Q-67, `docs/README.md`·`AGENTS.md`·루트 `README.md` 색인·Desktop 문구
- 테이블 수 (실제로 다시 셈): **MVP 51 · Next 1 · MVP 에서 만들지 않음 2 = 54**. 작업표 블록 52 · 컬럼 557. Markdown 2절 목록 ↔ 작업표 블록 이름 차이 0건
- 검증: Markdown ↔ 작업표 컬럼 대조(차이 0 — 축약 표기 제외), PK 컬럼 NULL 허용 0건, 목록 시트 ↔ 블록의 분류·변경 방식 일치, `git diff --check` 통과, staged 0건, 제품 영역 변경 0건, `docs/21` 변경 0건
- 하지 않은 것: 기술 최종 결정 · 제품 코드 · SQL · 대응 이력 표 · 오류 코드 전체 목록 · L-13 결정 · `back/`·`ai/`·`packages/` README 수정(T-070) · `docs/07` 본문 전면 정리(T-070) · 옛 LOG 항목의 "미커밋" 수정 · staging·commit·push
- 변경 파일: `docs/22_cera-logical-data-model.md`·`.xlsx` · **`docs/23_runtime-platform-and-observability.md`(신규)** · `docs/01` · `docs/07` · `docs/12` · `docs/13` · `docs/14` · `docs/15` · `docs/README.md` · `AGENTS.md` · `README.md` · `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 큐 변경: T-079-R 을 rev.2.2 + `docs/23` 검토로 갱신 · 순서를 T-070 → T-069 → 기술 결정 → T-080 으로 · **T-080 을 템플릿 코드 블록 밖으로 옮기고** 의존·범위(첫 슬라이스부터)를 고침 · T-069·T-070 에 2026-09-18 추가 항목
- 남은 일 / 다음 한 걸음: 사용자 + ChatGPT 최종 검토 → T-079 DONE → T-070
- 주의사항: **Backend 언어는 결정되지 않았다.** NestJS 를 고르면 솔버를 어디서 돌릴지(Q-65)를 같이 답해야 한다. `system_error` 는 업무 개념이 아니며 `event`·계산·Activity Timeline 으로 흘러가지 않는다

## 2026-09-17 · T-079 rev.2.1 최종 정합성 패치 · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — T-079 최종 승인 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건. **새 테이블 0개**
- 지시: rev.2 검토 결과 **전체 구조는 승인 가능하지만 물리 설계 전에 정합성 몇 건을 정리**해야 한다. **새 설계를 벌리지 말고** 지적된 것만 닫는다. 이 작업 뒤 T-079 를 최종 승인·종료한다
- 고친 것 (9건)
  1. **`conflict` 에 적용 범위 2컬럼.** `canonical_fact` 의 식별자에 범위가 들어간 순간 충돌 판정 단위도 좁아져야 한다. `GLOBAL` 15,000원과 `RECOVERY_CONTEXT` 0원을 한 충돌로 묶으면 **있지도 않은 모순을 운영자에게 확인하라고 요구**하고 `blocks_automation` 까지 선다
  2. **`verification_request` 에 적용 범위 2컬럼.** "평소 얼마인지 확인" 과 "이번 건 얼마인지 확인" 은 다른 문제다. 범위를 빼면 한 줄로 합쳐져 하나를 처리하면 다른 것도 처리된 것처럼 보인다
  3. **`request_key` 재료에 범위 포함.** 안 넣으면 두 확인 요청이 같은 키를 갖고 처리 기록이 잘못 붙는다
  4. **`question_item.target_applicability_scope_*` 신규.** "이번 사고 건 보관료" 와 "일반 보관료" 는 개체도 사실 키도 같고 범위만 다르다. **Backend 가 질문 만들 때 확정**해야 회신을 사건으로 만들 때 범위가 결정론적으로 나온다. LLM 출력은 그대로(`ask_id` + 값 + 단위 + 인용) — **범위는 LLM 이 만지지 않는다**(ADR-026)
  5. **`question_item.verification_request_key` 의 FK 표기 제거.** `verification_request` 는 `REBUILDABLE` 이라 없어졌다 다시 생긴다. 사람이 실제로 보낸 질문이 파생 행의 생존에 의존하면 안 된다. `handling.request_key` 와 완전히 같은 취급
  6. **발송 지문 비교 대상 분리.** rev.2 는 "`approved_content_hash` 와 같아야 한다"고만 적어, 승인이 없는 주소 확인 메일에서 모순이었다. 업무 = **유효한 승인**의 지문 / 주소 확인 = **그 메시지의 `content_hash`**. **어느 쪽도 "작성한 내용 != 보낸 내용" 은 허용하지 않는다.** I-3 를 I-3 / I-3b 로 나눴다
  7. **승인 행 종류별 필수 컬럼 분리.** `APPROVED` 만 내용·수신자·지문·구조화 값 사본 필수. `REJECTED`/`REVISION_REQUESTED` 는 사유 필수 + 사본 선택. `REVOKED`/`INVALIDATED` 는 **대상 + 사유 종류만** 필수 — 새 내용을 승인한 행이 아니므로 사본을 요구하지 않는다. 무효화 대상은 **같은 메시지의 `APPROVED`**, 승인당 최대 1건(I-17)
  8. **분류(Classification)와 변경 방식(Mutation Policy) 분리.** rev.2 는 `SOURCE_OF_TRUTH` = 덧붙이기만 이라고 적었는데 실제로는 제어된 UPDATE 가 있다. 두 축으로 나누고 **49개 표 전부에 변경 방식 코드**를 붙였다(`APPEND_ONLY` · `REBUILDABLE` · `CONTROLLED_UPDATE` · `IMMUTABLE_AFTER_CREATE` · `CACHE_UPDATE` · `VERSION_REPLACEMENT`). **"Source of Truth = 무조건 append-only" 라는 일반 문장은 지웠다**
  9. **`contact_verification` 생애주기 명시.** `used_at`·`result` 를 갱신하므로 "덧붙이기만"이 아니다. **발급 기록 6컬럼은 불변**, **사용 결과 2컬럼만 한 방향으로 한 번** 바뀐다. 이 정도를 위해 별도 이력 표를 만들지 않았다
- **적용 범위 전파 점검표 신설**(22.5): 범위를 **갖는 8곳**과 **갖지 않는 곳 + 이유**를 전부 대조했다. `extraction` 에 범위를 두지 않는 것이 LLM 경계를 지키는 방법이고, `commercial_offer` 는 근거라서 범위가 사건으로 갈 때 정해진다
- **범위 선택 정책은 확정하지 않았다.** `CONTRACT`·`CONTAINER`·`RECOVERY_CONTEXT` 는 서로 다른 축이라 "좁다/넓다"로 한 줄에 못 세운다. 확정한 것은 ① 범위는 사실 식별자에 포함 ② 같은 범위끼리만 Reconciliation ③ 결정론적 선택 정책이 필요함 ④ 쓴 범위는 스냅샷에 남음 까지. **L-14 에 포함**하고 새 OPEN 항목을 만들지 않았다
- rev.1/rev.2 잔재 정리 9건: 상단 "12건" → 실제 개수 · Structured Draft Field → `comm_message_structured_field` · L-2/L-3/L-9/L-10 의 "사용자 결정 필요" → D-1~D-5 CLOSED · PK 열 수(4열 → **6열**, 실제로 세어 확인) · ERD 의 `canonical_fact` PK 에 범위 추가 · 21절 "D-5 로 열려 있다" 제거
- 테이블 수: **변화 없음** — MVP 50 · Next 1 · MVP 에서 만들지 않음 2 = **53**
- 검증: 흐름 walkthrough 재실행, **26개 항목 전부 통과**(27.6). **새로 발견된 구조 문제 없음**. `git diff --check` 통과 · staged 0건 · 제품 영역 변경 0건 · Markdown 2절 ↔ 작업표 블록 불일치 0건 · 작업표 잔재 0건
- 하지 않은 것: 새 테이블 · 새 개념 · DB 제품·ORM·SQL·인덱스 · UUID/ULID 확정 · 범위 우선순위 규칙 · L-13 복구 맥락 식별자(T-069) · **`docs/21` 수정** · `docs/04`·`07`·`18`·`19` 수정(T-070) · 제품 코드 변경 · staging·commit·push
- 변경 파일: `docs/22_cera-logical-data-model.md`(2,412행 · 0~28절), `docs/22_cera-logical-data-model.xlsx`(11 시트 · 블록 51 · 컬럼 537 · 681행), `docs/15`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 큐 변경: **T-079-R** 을 rev.2.1 최종 승인으로 갱신. T-080 물리 설계 대기
- 남은 일 / 다음 한 걸음: **T-079 최종 승인** → T-080 물리 설계
- 주의사항: **논리 모델 50개 표 ≠ 첫 마이그레이션 50개 표**(26절). 첫 구현은 T-069 외부 통신 슬라이스의 최소 묶음부터다

## 2026-09-17 · T-079 rev.2 논리 설계 구조 정합성 수정 · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 사용자 + ChatGPT 최종 검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: rev.1 검토 결과 **방향은 좋으나 물리 설계 전에 고쳐야 할 구조 정합성 문제**가 있다. **논리 모델을 갈아엎지 말고 지적된 것만 최소 범위로** 수정한다. `docs/21` 은 승인 문서라 수정 금지
- **사용자 결정 5건 전부 CLOSED**: D-1 연결 테이블 유지 · D-2 제안 묶음 만든다 · **D-3 기본값을 "현재 복구 맥락"으로 변경**(rev.1 추천 뒤집음) · D-4 계획 배치 만들지 않는다 · D-5 예외 Case 만들지 않는다(나중에 다시 연다)
- 고친 것 (13건)
  1. **`raw_input.payload_hash` 유일 제약 제거.** 09시와 10시에 같은 값을 관측해도 **"다시 확인했다"는 새 수집 사실**이다. 내용이 같다고 행을 막으면 신선도가 09시에 멈춘다. 중복 처리는 출처가 주는 `source_record_key` 로만 한다
  2. **`verification_request_handling.request_key` 를 DB 외래키에서 논리 연결 키로.** 파생 테이블을 지울 수 있다는 말과 외래키가 동시에 성립하지 않았다
  3. **`request_key` 재료에서 `conflict_id` 제거.** 파생 대리키라 재계산 때 값이 바뀌어 과거 처리 기록을 못 찾는다 — 이 구조가 막으려던 바로 그 문제였다. 재료를 불변 정보(규칙 + 개체 + `fact_key` + 사건 id 집합)로 바꿨다
  4. **스냅샷 보강 — 신규 `planning_snapshot_constraint` · `planning_snapshot_input`.** rev.1 은 사실만 얼려서, 마스터의 `default_travel_minutes_from_terminal` 을 다음 달에 고치면 과거 실행이 재현되지 않았다. 원칙을 명시했다: **계산에 쓴 모든 바뀔 수 있는 입력은 값으로 얼리거나 불변 판을 가리킨다**
  5. **승인에 구조화 숫자 고정 — 신규 `comm_message_structured_field` · `message_approval_structured_field`.** 숫자가 본문 문자열에만 있으면 검사도 승인 고정도 문자열 비교가 된다. 값·단위·출처(실행·질문·경로)를 나눴다
  6. **승인 생애주기.** `expires_at`(만들 때 정함) + `decision = REVOKED·INVALIDATED` + `invalidates_approval_id` + `invalidation_cause`. **UPDATE 없이** 취소·만료·계획 교체를 남긴다
  7. **주소 확인 메일의 승인 예외.** `comm_message.message_kind`(`BUSINESS`/`CONTACT_VERIFICATION`) + `contact_verification_id`. `send_attempt.approval_id` 는 **조건부 필수**. 위장 방지 규칙 8개를 적었다(구조화 값·질문 연결 0건, 종류 변경 불가, 감사는 남는다)
  8. **`ACTUAL_REPORTED` 제거.** 실제 발생액 보고는 계산 결과가 아니라 **현실 주장**이고 `event` → `canonical_fact` 로 간다. MVP 는 `ESTIMATED` · `PLAN` 둘뿐
  9. **`event.source_tier` 제거.** 근거 강도는 정책으로 **계산되는 값**이라 append-only 원천 컬럼에 두면 정책이 바뀌어도 고칠 수 없다. 원천 축(`source_kind`·`source_role_at_ingestion`·`input_quality`)만 남기고 `canonical_fact.evidence_strength` + `evidence_policy_version` 으로 옮겼다
  10. **사건마다 SUBJECT 정확히 1건.** 주체가 여럿이면 `canonical_fact` 의 키와 대응이 깨진다. 영향받는 컨테이너는 주체가 아니라 **위험 계산 결과**다
  11. **`bl` 단순화.** `mbl_no` + `hbl_no` 두 컬럼 → **번호 하나 + 종류 + 부모 참조**. `(bl_type, bl_no, bl_year)` 는 **업무 식별 후보로만** 두고 실제 `UNIQUE` 는 실데이터 확인 뒤로 미뤘다(L-16) — 번호가 연도 안에서 유일한지는 확인된 적이 없다
  12. **적용 범위와 유효 기간 분리 (22절 신설).** rev.1 은 적용 대상을 "사실의 주체로 정해진다"고 봤는데 틀렸다. 주체가 창고 B 인 것은 "창고 B 이야기"라는 뜻일 뿐이다. `applicability_scope_type`·`applicability_scope_ref` 추가, **기본값은 좁은 쪽**
  13. **계획 조건 해제도 새 행.** `released_at` 을 나중에 채우는 것이 바로 UPDATE 였다. `action = SET/RELEASE` + `releases_constraint_id`
- **흐름 검증(27절)에서 새 모순 1건 발견·수정**: 범위가 다른 현재 사실이 `canonical_fact` 의 같은 PK 를 다퉜다. 운영자의 "이번 건 0원"이 시설 전체 요율을 덮어쓸 수 있었다 → **PK 에 범위 2컬럼 추가**, 계산 시점에 가장 좁은 범위 선택(11.4.1)
- 테이블 수: **MVP 50**(46 → +4) · **Next 1** · **MVP 에서 만들지 않음 2** = **53**. 삭제 0건
- 신규 열린 질문: **L-13** 복구 맥락 식별자(T-069) · **L-14** 범위 값 목록(현업 검증) · **L-15** `message_kind` 값 목록 · **L-16** `bl` 유일 제약(실데이터)
- 하지 않은 것: DB 제품·ORM·`CREATE TABLE`·마이그레이션·인덱스 · UUID/ULID/BIGINT 확정 · API endpoint · 솔버 · LLM 공급자 · **`docs/21` 수정** · `docs/04`·`07`·`18`·`19` 수정(T-070) · 제품 코드 변경 · staging·commit·push
- 변경 파일: `docs/22_cera-logical-data-model.md`(2,138행), `docs/22_cera-logical-data-model.xlsx`(11 시트·블록 51·컬럼 531·678행), `docs/15`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git diff --check` 통과 · staged 0건 · 제품 영역 변경 0건 · Markdown 2절 목록 ↔ 작업표 블록 대조 불일치 0건 · rev.1 잔재(`source_tier`·`ACTUAL_REPORTED`·`mbl_no`/`hbl_no`·`released_at` 채우기) 확정 표현 0건(설명 문단만 남음)
- 큐 변경: **T-079-R** 을 rev.2 검토로 갱신. T-080 물리 설계는 그대로 대기
- 남은 일 / 다음 한 걸음: **rev.2 최종 검토** → T-080 물리 설계
- 주의사항: **논리 모델 50개 표 ≠ 첫 마이그레이션 50개 표**(26절). 첫 구현은 T-069 외부 통신 슬라이스에 필요한 최소 묶음부터다

## 2026-09-17 · T-079 논리 DB 설계 (Logical DB Design) · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 사용자 + ChatGPT 검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 전제: **T-076 에서 개념 모델 rev.3 이 최종 승인**됐다. 승인된 `docs/21` 은 이 작업에서 **한 글자도 고치지 않았다**. 문제가 보이면 고치지 말고 기록하라는 지시를 따랐고, 개념 모델 자체의 문제는 **발견되지 않았다**
- 산출물
  - **`docs/22_cera-logical-data-model.md`** (0~25절, 1,364행): 벤더 중립 논리 타입 · 테이블 분류 7종 · 전체 목록 · 테이블로 만들지 않은 개념 + **금지 안티패턴 10종 각각을 어떻게 피했는지** · **열린 질문 판정 20건** · 도메인 A~J 테이블 명세(기본 정보 · 컬럼 · 관계 · 무결성 규칙) · 식별자/시간/금액 모델 · 키·제약·참조 무결성 · 코드값 정책 · 논리 ERD · 시뮬레이션 분리 · 파생 조회 · **개념→테이블 추적표(E-01~E-39 전부)** · 문서 차이 X-10~X-13 · **사용자 결정 5건**
  - **`docs/22_cera-logical-data-model.xlsx`** (11 시트: `00_목록` · `01_물류핵심` ~ `09_감사운영` · `10_OpenDecisions`): 테이블 블록 **47개** + OPEN 2, 컬럼 **475개**, 데이터 **619행**. RPG 스타일(Arial · 기본키 `FFFF00` / 외래키 `93C47D` / 유일 제약 `F4CCCC` / 한글 필드행 `CFE2F3` / 테이블명 `D0E0E3` · 우측 범례 · 테두리 · 눈금선 끔)
- 테이블 수: **MVP 46 · Next 1(`vessel_call`) · OPEN 2(`exception_case` · `operational_plan_batch`) = 49**. 개수의 정본은 `docs/22` 2절 표 하나다
- 이번에 답한 것 (정본 `docs/22` 4절, 요약 `docs/15`)
  1. **Q-54** 외부 식별자 — **하이브리드**. 조회 경로 id 는 컬럼(`comm_message.external_message_id` · `comm_thread.external_thread_id`), 발급 기관이 늘어나는 화물·통관 id 는 `external_identifier(issuing_system, id_type, id_value)`
  2. **Q-55** 시설 — **공통 + 1:1 상세** (`facility` + `facility_warehouse`·`facility_terminal`·`facility_odcy`)
  3. **Q-58** 금액 — **Money 테이블 없음**. `cost_line_item` 의 5컬럼 묶음(원화 정수 + 원통화·금액·환율·기준일)
  4. **Q-59** 확인 요청 — **결정적 `request_key`**. 파생 대리키를 참조하면 재계산마다 사람의 처리 이력이 끊긴다
  5. **Q-60** 비용 줄 — 필수 부모는 `cost_result` 하나. 귀속·근거는 `cost_line_link(link_role ∈ ATTRIBUTION·BASIS)`
  6. **Q-62** Actor — 최소 4컬럼. 인증·권한·조직은 나중
  7. **Q-63** 사실 키 — **원본은 문자열 그대로**, 분해 컬럼(`param_date` 등)은 파생 `canonical_fact` 에만
  8. **L-1** 질문 항목 — 질문 생성 시 **대상 개체·사실 키를 확정**해 회신이 `ask_id` 단건 조회로 붙는다. LLM 이 사실 키를 정하지 않는다(ADR-026)
  9. **L-4** `default_` 접두(평시 기준선) · **L-5** 풀·슬롯 수준 배정 · **L-7** `send_attempt` 별도 테이블 · **L-8** 같은 테이블 + `is_simulated`/`contains_simulated` · **L-11** 승인 덧붙이기 + 승인 시점 사본 · **L-12** `operator_planning_constraint`(현실 사실이 아님, 솔버 표현은 미확정)
- **사용자 결정 필요 5건 (숨기지 않았다)**: **D-1** Container↔B/L 연결 테이블(L-2) · **D-2** 제안 묶음 생성(L-3) · **D-3** 운영자 입력의 기본 적용 범위(L-3b·L-12) · **D-4** `operational_plan_batch` 미생성 확정(L-9) · **D-5** `exception_case` 생성 여부(L-10·L-6)
- 설계에서 지킨 선: **정정은 UPDATE 가 아니라 새 행**(`supersedes_event_id`) · **계획 입력은 값을 복사해 얼린다**(`planning_snapshot_fact`) · **계산 결과는 사람이 고치지 않는다**(입력을 고치고 재계산) · **승인 없이 발송 시도 행이 생길 수 없다** · **비밀값은 DB 에 넣지 않는다**(`credential_reference` 참조만) · **모든 운영 조회에 `is_simulated = false`**
- 하지 않은 것: DB 제품(PostgreSQL·MySQL·SQLite) · ORM · 실제 `CREATE TABLE`·마이그레이션 · 인덱스·파티션 · API endpoint · LLM 공급자 · 솔버와 내부 표현 · 위험·신선도 임계값 · `plan_decision.decision_type` 값 목록 · **`docs/21` 수정** · 제품 코드 변경 · staging·commit·push
- 변경 파일: 신규 `docs/22_cera-logical-data-model.md`·`docs/22_cera-logical-data-model.xlsx` / 수정 `docs/15`(상태 20건 + 결론 절 + X-10~X-13), `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git diff --check` 통과. 제품 영역(`back/`·`ai/`·`data/`·`packages/`·`infra/`·`front/`·`scripts/`) 변경 0건. Markdown 2절 테이블 목록과 작업표 블록을 대조해 **불일치 0건**(OPEN 2개는 `10_OpenDecisions` 시트에 있음). Markdown 에 `CREATE TABLE`·DB 제품명·ORM 명이 확정 표현으로 등장하지 않음
- 큐 변경: **T-076 DONE**(개념 모델 승인) · **T-079 DONE** · **T-079-R**(검토 + 결정, NEEDS_HUMAN) 과 **T-080 물리 설계** 신규
- 남은 일 / 다음 한 걸음: **D-1~D-5 결정** → T-080 물리 설계. 그 뒤 T-070 문서 동기화가 X-10~X-13 을 흡수한다
- 주의사항: 논리 설계의 합격 기준은 **재현 테스트**다(`docs/22` I-7) — `canonical_fact` 를 전부 지우고 `event` 로부터 재계산했을 때 같은 결과가 나와야 한다. 나오지 않으면 파생에만 있는 정보가 생긴 것이고 설계 오류다

## 2026-09-17 · T-078 개념 모델 최종 정합성 정리 · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 최종 승인 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: 검토 방향이 승인 가능하다는 판정 뒤, **새 개념을 추가하거나 기존 설계를 다시 흔들지 않고** ① Markdown 표현 불일치 제거 ② 요구사항 ↔ 개념 모델 정합성 ③ 작업표 ↔ Preview ↔ Markdown 번호·개수 동기화 ④ 요구사항에서 아직 선택하지 않은 **구현 기술 선결 표현 제거** ⑤ 최종 승인 가능한 상태로 정리
- 고친 것 (10건):
  1. **후보 개수**: 21.1절 "미확정 후보 3개" → **4개**(OperatorPlanningConstraint 포함). QUEUE 체크리스트도. 최종 기준 MVP **33** / 시설 종류 **3** / 미확정 **4** / Next·보류 **2** / 올리지 않은 것 **16**
  2. **발송 승인 옛 표현 제거**: 9절·12.2절·18절의 "메시지 승인 필드" · "Send Approval · AuditLog" → **MessageApproval + AuditLog**. 12.3절의 "rev.1 은 …로만 봤다"는 **역사 서술이라 유지**
  3. **PlanDecision 통일**: "복구 계획에 대한 사람의 의사결정 기록" + **채택·거부·기존 계획 유지**. **enum 은 논리 설계**. "아직 행동하지 않은 상태"와 "의도적으로 유지하기로 결정한 상태"의 구분을 명시
  4. **계산 결과 용어**: 복구 계획 실행·배정·위험 평가·비용 계산 결과·비용 줄 → **"보존되는 산출 기록"**. 18절에 Source of Truth 와 다르다는 용어 주의 추가
  5. **`FR-CON-04` 구현 중립화**: 저장 구조 대신 **무엇을 보존해야 하는가**(제안 주체·시각·금액·유효기간·조건·원문 근거·관련 질문 항목)
  6. **`NFR-06`**: `pytest` 선결 제거 → 외부 네트워크 없이 자동 테스트 · 녹화 fixture·mock · 로컬 반복 실행
  7. **`NFR-09`**: "단일 DB 파일" 선결 제거 → PoC 최소 구성 로컬 실행, 명령 1~2개
  8. **신규 OPEN L-3b**: 운영자 직접 입력 요율의 **적용 대상·적용 기간**. 기존 L-3 옆에 붙여 질문군을 늘리지 않았다
  9. **작업표(16시트) 동기화** + 데이터 **585행**
  10. **메타 숫자 정정**: docs/21 1.3절 523행 → **585행**, CURRENT 의 "26개"·"523행"
- **미반영 1건 (다음 세션 또는 사용자 조치 필요)**: `docs/21_cera-db-template-preview.xlsx` 가 작업 중 **Excel 에서 열려 있어**(`docs/~$…` 잠금 파일) 덮어쓰지 못했다. 갱신본은 scratchpad `pending/` 에 생성해 뒀고 반영 방법을 `CURRENT.md` Handoff Notes 에 적었다. **E-ID·OPEN 표시는 현재 저장소 판에서도 정확**하며, 남은 차이는 05_계획 표시 번호 순서 · `decision_type` 값 목록 미확정 표시 · Notes 한 줄이다
- 하지 않은 것: 새 엔티티·새 요구사항 그룹 · **법적 책임·면책 문구** · `docs/04`·`docs/07`·`docs/18` 확대 수정(T-070 유지) · `AGENTS.md`·`.gitattributes` 불필요한 변경 · 솔버·enum·DB·ORM·API 확정
- 변경 파일: 수정 `docs/03`, `docs/15`, `docs/21_cera-conceptual-data-model.md`, `docs/21_cera-conceptual-data-model.xlsx`, `docs/README.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git diff --check` 통과. 제품 영역(`back/`·`ai/`·`data/`·`packages/`·`infra/`·`scripts/`) 변경 0건. `front/` 와 다른 작업의 untracked(`data/Proposal/`·`scripts/`) 무변경. 작업표를 openpyxl 로 다시 열어 **옛 표현 잔재 0건**(원본(기록) · PLAN_APPROVAL · 승인·반려 기록 · 미확정 3) 확인
- 남은 일 / 다음 한 걸음: **T-076 최종 승인** + Preview 갱신본 반영. 승인되면 **논리 DB 설계**
- 큐 변경: **T-078 DONE**, T-076 을 "최종 승인" 으로 갱신
- 주의사항: **개수는 `docs/21` 6절 개수 블록 하나만 정본**이다. 다른 절·작업표·부록은 그것을 따른다

## 2026-09-17 · T-077 운영자 개입과 재계산 요구사항 반영 (rev.3) · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 최종 검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: 개념 모델 rev.2 검토가 거의 끝난 시점에, **CERA 운영 UX의 핵심 요구사항 하나**가 정본에 부분적으로만 표현돼 있음이 확인됐다 — "CERA가 위험·D&D·예상 비용·복구안을 먼저 계산해 제시하고, 운영자가 현실 정보 또는 계획 조건을 수정하면 그 입력을 근거로 다시 계산한다". **기존 개념 모델을 대규모 재수정하지 않고 의미만 명확히 한다.** 새 최적화 알고리즘·DB 논리 설계·UI·Backend 는 하지 않는다. front 는 Antigravity 작업이므로 건드리지 않는다
- 한 일:
  1. **`docs/03` 2.6.1절 신설** (운영자 개입과 재계산): `FR-OPR-01~12` + 합격 기준 `AC-OPR-01~10`. 흐름도, **운영자 개입 4종 비교표**, 예시 2개(제2창고 0원 / ODCY A 제외)를 넣었다
  2. **기존 요구사항에 연결**: `FR-RSK-05`(위험 표현 경계 — 확률 모델이 아니다), `FR-CON-05`(운영자 상업 조건 입력도 같은 경로), `FR-VER-04`(개입 4종 구분), `FR-OPT-04·05` 주석, 사용자 여정 4번 확장
  3. **`docs/21` rev.3**: **12.5절 신설**(12.5.1 선계산 / 12.5.2 개입 4종 / 12.5.3 결과 대신 입력 수정 / 12.5.4 계획 조건은 현실 사실이 아니다 / 12.5.5 스냅샷·실행 연결과 재계산 이유 / 12.5.6 무조치도 결정), 4.3절 운영자 계획 조건 행, 11절 선계산 문장 + **비용 3종 표** + 위험 경계, 6.2절 **E-37 OperatorPlanningConstraint**(VesselCall→E-38, Truck→E-39), 6.4절 자원 사실 오염 금지, 15절 관계 3건, 16절 ERD `_CAND` 노드, 25.3·부록 A/B
  4. **작업표 16 시트 동기화**: Overview 개수·주의 2건 추가, ConceptInventory·AttributeCandidates·Events·CalculatedOutputs·Plans_Decisions·Relationships·OpenDecisions 반영. `04_EntityCandidates` **42행**(MVP 33 + 시설종류 3 + 형태 미확정 4 + Next·보류 2)
  5. **RPG Preview 에 `operator_planning_constraint` 블록 추가**: Table Candidate **38개**. `Schema Status: OPEN` · "현실 사실이 아니다" · "값 목록 미확정" 을 Notes 에 적었고, 경고 배너에 "계산 결과 숫자는 사용자 편집 대상이 아니다"를 더했다. `00_목록` 의 제외 목록에 **계산 결과 숫자**와 **자원 사용 불가 플래그**를 추가했다
  6. **`docs/13` 최소 3개 추가**: 운영자 계획 조건 · 예상 비용 · 실제 비용. 용어집 전체 동기화는 T-070 계획을 그대로 뒀다
  7. **`docs/15` 신규 L-12**: 운영자 계획 조건의 적용 범위·유효기간·강제/선호 구분·변경 이력·스냅샷 포함 방식을 **한 질문군으로** 묶었다(세분화하지 않았다)
- 이번에 못박은 경계:
  - **계산은 사람 승인 전에 이미 돌아간다.** 승인은 결과를 채택하는 결정이고, 사실 확인이 아니다
  - **운영자는 결과 숫자를 고치지 않고 입력을 고친다.** "350,000 → 0" 이 아니라 "창고 B 보관료 0원" 을 입력한다
  - **계획 조건은 현실 사실이 아니다.** "이번엔 ODCY A 쓰지 마"를 자원의 가용 사실로 기록하면 그 시설이 현실에서 못 쓰는 자원처럼 오염된다
  - **사실 입력은 기존 사건을 덮어쓰지 않는다.** 새 관측과 정정은 다른 사건 부류다
  - **무조치도 정당한 결정이다.** 복구안 하나를 반드시 승인해야 하는 시스템이 아니다
  - **예상 비용 ≠ 실제 비용.** 실제 비용은 Future 이고 CERA는 결제·송금·Invoice 정산·회계 처리를 하지 않는다
  - **위험은 확률이 아니다.** 등급·여유시간·노출액·자원 제약·데이터 불확실성·원인의 결정론적 평가다
- 하지 않은 것: 솔버 선택(CP-SAT/MILP) · 제약 표현 형식 · 제약 값 목록(enum) · 제약 DB 테이블 · 위험 확률·ML 모델 · 비용 공식·D&D 공식 변경 · DB 제품·ORM · API endpoint · UI·Backend 구현
- **rev.2 결정을 되돌리지 않았다**: QuestionItem · 견적 3층 · MessageApproval 후보 · OperationalPlan 묶음 OPEN · ExceptionCase OPEN · CostLineItem 귀속 완화 · ChannelConnection · MVP 33개 — 전부 그대로다
- 변경 파일: 수정 `docs/03`, `docs/13`, `docs/15`, `docs/21_cera-conceptual-data-model.md`(rev.3), `docs/21_cera-conceptual-data-model.xlsx`, `docs/21_cera-db-template-preview.xlsx`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git status --porcelain -- back/ ai/ packages/ infra/` 결과 없음. **`data/Proposal/` 이 untracked 로 새로 생겼으나 이 세션이 만들지 않았고 `data/` 는 손대지 않는 영역이라 그대로 뒀다.** `front/` 미커밋 변경은 Antigravity 것이며 읽지도 staging 하지도 않았다. `git diff --check` 통과. 두 워크북을 openpyxl 로 다시 열어 시트·행수·한글·색·범례·경고 배너 확인, 셀의 `**` 0건
- 남은 일 / 다음 한 걸음: **T-076 최종 검토**(rev.2 항목 + rev.3 운영자 개입·재계산). 승인되면 **논리 DB 설계**(L-1~L-12) → **T-070** → **T-069**
- 큐 변경: **T-077 DONE**, T-076 검토 항목에 rev.3 추가
- 주의사항:
  - 산출물은 모두 미커밋이고 **최종 DB 스키마가 아니다**
  - **운영자 계획 조건은 개념만 확정했다.** 표현 방식·값 목록·솔버 형식은 L-12 다
  - 화면을 만들 때 **계산 결과 숫자를 입력 필드로 두지 않는다**
  - **프론트는 Antigravity 소관이다.** `front/` 를 건드리지 않는다

## 2026-09-17 · T-075 개념 데이터 모델 검토 반영 (rev.2) + RPG 스타일 DB Preview · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 재검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: 사용자 + ChatGPT 1차 검토(T-074) 결과를 반영한다. **기존 개념 모델을 폐기하지 않고 수정** — ① 과하게 확정한 개념을 다시 OPEN ② 기존 요구사항 용어와 정렬 ③ Markdown·Excel 개념 목록·개수 동기화 ④ 기존 16시트 Excel 은 개념 검토 작업표로 유지 ⑤ RPG DB 문서 스타일의 별도 Preview Excel 추가. front 는 Antigravity 작업이므로 건드리지 않는다
- 유지한 구조적 결론: 사건 덧붙이기 · 원문 보존 · 사건 → 현재 사실 · 재생성 가능 · 현실/계획/계산 분리 · Facility 상위 개념 · Destination 역할 · 차량 풀 중심 · 개별 차량 비필수 · Actor 개념만 · 사건과 감사 분리 · 활동 타임라인 파생 · 단계·영향 파생 · 계획 스냅샷 · 복구실행/배정/승인 분리 · AI 는 값 후보와 인용까지
- 한 일:
  1. **다시 연 것 5건**: 견적을 **세 층**(제안 묶음 / 요율 사실 / 현재 요율)으로 나누고 묶음을 `OPEN FOR LOGICAL DESIGN` 으로 / 발송 승인을 **독립 불변 결정 기록 후보**로 승격 / 운영 계획 **묶음·버전**을 OPEN / 예외 Case 를 "파생 뷰가 기본안이지만 운영 Case 필요 여부 OPEN" 으로 / 비용 줄 귀속을 배정 하나에서 **비용 계산 결과의 종속 + 선택 귀속**으로 완화
  2. **용어 정렬**: `Ask` → **`QuestionItem`**(새 개념이 아니라 요구사항의 질문 항목이 저장 개념에서만 빠져 있었다. **추출 계약의 `ask_id` 는 깨지 않았다**), `ChannelCredential` → **`ChannelConnection`**(비밀값을 DB 에 담는 것처럼 읽히던 이름)
  3. **개수 전면 재계산**: MVP 저장 개념 후보 **33**(E-01~E-33) + 시설 종류 3 + 형태 미확정 3(E-34~36) + Next·보류 2(E-37·38) + 올리지 않은 것 16. 최소 집합 16 + 17 = 33. `docs/21` 6·21.1·25·부록 A 와 작업표 `04_EntityCandidates`·`01_Overview` 를 모두 맞췄다. **rev.1 의 "26개" 와 작업표 E-28 의 불일치를 해소**
  4. **`docs/21` rev.2 개정**: 3·4·5.6·5.7·5.11·5.12·6·8.4·11·12.3·12.4·14·14.4·15·16·19·20·21·24·25·부록 A/B. 6절·16절(ERD)·25절은 전면 교체. ERD 에서 `ASK` → `QUESTION_ITEM`, `MESSAGE_APPROVAL` 추가, 비용 줄을 `COST_RESULT` 아래로, 제안 묶음은 `_CAND` 접미로 후보 표시, 예외 Case·운영계획 묶음은 **확정 엔티티처럼 그리지 않았다**
  5. **작업표 16 시트 동기화**: 삭제·덮어쓰기 없이 같은 경로·같은 시트 구조를 유지하고 수정 개념을 반영(데이터 567행). Excel 셀의 markdown 강조(`**`)를 제거해 읽기 쉽게 했다
  6. **`docs/21_cera-db-template-preview.xlsx` 신규**: 참조 파일 `C:\Users\PC\Downloads\RPG 문서.xlsx`(2026-09-16)를 **직접 열어** 스타일을 확인했다 — 글꼴 Arial, 테이블 블록 5행(테이블명 / 한글 필드명 / 영문 필드명 / 타입 / 제약) + 예시 데이터, 색(PK `FFFF00` · FK `93C47D` · 한글행 `CFE2F3` · 라벨 `D0E0E3` · 보조 `F4CCCC`), 우측 범례(기본키·외래키), 얇은 테두리, 열 너비 ~15-20. 이 구조를 8 시트(`00_목록` `01_물류핵심` `02_시설자원` `03_사건상태` `04_계약비용` `05_계획` `06_외부통신` `07_감사운영`)에 **Table Candidate 37개**로 재현하고, 각 블록에 합성 예시 2~5행과 우측 Notes(Schema Status / 이유 / 주의 / 샘플 표시)를 붙였다
- 신규 질문: **L-9**(운영 계획 묶음 Aggregate·Version) · **L-10**(예외 운영 Case) · **L-11**(발송 승인 기록 표현). 갱신: L-1(이름 정정) · L-3(제안 묶음과 요율 사실의 관계) · Q-60(귀속 대상)
- 변경 파일: 수정 `docs/21_cera-conceptual-data-model.md`(rev.2), `docs/21_cera-conceptual-data-model.xlsx`, `docs/15`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md` / 신규 **`docs/21_cera-db-template-preview.xlsx`**
- 손대지 않은 것: `docs/18`·ADR 본문·LOG 의 옛 항목(**그때의 기록**). 어긋난 지점만 `docs/21` 24.3절 **X-7·X-8·X-9** 로 등록해 T-070 에서 한 번에 고치도록 했다. `docs/04`·`docs/07` 도 `docs/20` 6.3절 방침대로 승인 뒤 T-070
- 검증: `git status --porcelain -- back/ ai/ data/ packages/ infra/` 결과 없음, `front/` 는 Antigravity 미커밋 변경이 그대로 있고 이 세션이 건드리지 않았다. 두 워크북을 openpyxl 로 다시 열어 시트 수·행수·한글·PK/FK 색·범례·경고 배너 확인, Excel 셀의 `**` 0건, `git check-attr binary` 로 xlsx 바이너리 확인. 문서 Task 라 코드 검증 명령은 돌리지 않음
- 남은 일 / 다음 한 걸음: **T-076 재검토**(개수 일치, 다시 연 5건, 이름 정리, Preview 가 확정 스키마처럼 읽히지 않는지). 승인되면 **논리 DB 설계** → **T-070** → **T-069**
- 큐 변경: T-074 DONE(1차 검토 결과 기록), **T-075 DONE**, **T-076 신규(NEEDS_HUMAN, P0)**
- 주의사항:
  - **산출물 3개 모두 미커밋이고 최종 DB 스키마가 아니다.** Preview 도 Table Candidate 일 뿐이다
  - **작업표(16 시트)와 Preview(8 시트)는 역할이 다르다.** 하나로 합치거나 덮어쓰지 않는다
  - **Markdown 과 Excel 이 어긋나면 임의로 한쪽을 덮어쓰지 않는다.** 어긋난 항목을 보고하고 사람 검토로 넘긴다
  - **`ask_id` 계약은 그대로다.** 개념 이름만 `QuestionItem` 이고, 이름 통일 여부는 논리·API 설계에서 본다
  - **프론트는 Antigravity 소관이다.** `front/` 를 건드리지 않는다

## 2026-09-17 · T-073 CERA Conceptual Data Model (개념 데이터 모델) · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 사람 검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: ① 어제(2026-09-16) 작업을 **Git 정본 기준으로 복구**하고 ② 이미 진행된 DB 관련 작업이 있으면 **중복 작성하지 않고 이어서** 진행 ③ 작업 관리 문서를 실제 커밋 상태와 동기화 ④ 다음 단계인 **개념 데이터 모델**을 SQL 없이 작성. 세션 도중 추가 지시: **어제 Excel 작업이 있었는지 먼저 확인하고, 있으면 이어서 쓸 것**. 그리고 **프론트는 Antigravity가 디자인 작업 중이므로 손대지 말 것**
- 한 일:
  1. **Git 정본 확인**: HEAD `1b97905`, T-071·T-072 모두 **커밋됨**. 사용자가 기억한 것과 한 가지 다름 — **작업 트리가 clean이 아니다**(`front/web/src/app/globals.css`, `front/web/src/components/PlaybackBar.tsx` 미커밋 UI 리스타일 = **Antigravity 작업**). 읽기만 하고 건드리지 않았다
  2. **어제 DB 작업 복구**: 저장소 전체·Git 이력·파일명·내용 검색 결과 **존재하는 것은 `docs/20`(DB 설계 전 검토)까지**였다. 개념 모델 초안은 없었다. **Excel·CSV도 전혀 없었다** — git 이력에 xlsx/xls/csv가 단 한 번도 없고, 작업 트리·untracked에도 없다(워크스페이스 전체에서 발견된 csv는 다른 프로젝트 것). 그래서 개념 모델과 작업표를 **새로 만들었다**
  3. **작업 관리 문서 동기화**: QUEUE 머리말·완료 섹션·`사람 지시`, CURRENT 전면 재작성(baseline `2c37c28` → `1b97905`, **중복 `baseline commit` 행 제거**), T-072를 QUEUE·LOG에 **뒤늦게 등록**(사전 등록 없이 사용자 직접 지시로 수행된 경위를 그대로 적었다). `docs/20` 헤더에서 **검토 시작 기준점(`2c37c28` + 당시 미커밋)과 완료 커밋(`1b97905`)을 구분**해 덮어쓰지 않았다
  4. **`docs/21_cera-conceptual-data-model.md` 신규** (25개 절 + 부록 2): 데이터 설계 원칙, 도메인 용어집(56행), Concept Inventory(61행), 독립 엔티티 후보 26개 + **깨지는 기능**, 속성·사실·현실 사건·현재 상태·계산 결과·계획·근거·통신, 개념 관계 46건 + Mermaid 개념 ERD, 생애주기 5종, Source of Truth·이력 정책, 시나리오 역매핑, 외부 통신 요구사항 역매핑, MVP/Next/Future, **제외 물류 영역 18개**, 미확정 사항, 논리 설계 전 질문, Minimum Conceptual Model
  5. **`docs/21_cera-conceptual-data-model.xlsx` 신규** (16 시트·523행): Overview · DomainGlossary · ConceptInventory · EntityCandidates · AttributeCandidates · OperationalFacts · Events · CurrentState · CalculatedOutputs · Plans_Decisions · Contracts_Rates_Cost · Facilities_Resources · Communication · Relationships · ScenarioMapping · OpenDecisions. 헤더 고정·자동 필터·열 너비 적용. **Markdown = 왜 그렇게 보는가 / Excel = 무엇이 후보인가**로 역할을 갈랐다
- 답한 열린 질문 (개념 수준): **Q-53** MVP는 컨테이너 : B/L = N:1(Import FCL 전제 `[ASSUMPTION]`), 다대다는 구조로 배제하지 않음, `Shipment`는 만들지 않음 · **Q-56** Destination은 엔티티가 아니라 **관계에 붙은 역할** · **Q-57** 개별 차량은 **MVP 필수 아님**(풀 + 시간대별 가용량으로 성립) · **Q-61** 활동 타임라인은 **저장하지 않고 조합**(물질화는 허용)
- 엔티티로 올리지 않은 것과 근거: Destination(역할) · 선사(거래처 역할) · 개별 차량(보류) · SlotPool(터미널의 자원 단위) · 자원 가용량(사실) · 견적(사실 + 뷰) · 구간(값 객체) · 금액·환율(값 객체) · 예외(조합 뷰) · 단계·영향(파생) · 계획 버전(복구 계획 실행이 곧 버전) · 활동 타임라인(조합 뷰) · 운영 계획(PLAN 사실) · Shipment · 기사
- **새로 발견한 개념: Ask(문의 항목)** — 회신 값을 사실 키로 매핑하는 결정론 축인데 정본 스키마에 자리가 없다. 저장되지 않으면 LLM이 `fact_key`를 정하게 되어 **ADR-026 위반** → **L-1**, T-069에서 바로 필요
- 사실 카탈로그의 빈 자리 6건(F-1~F-6), 신규 질문 8건(L-1~L-8), 문서·데이터 불일치 6건(X-1~X-6) 등록
- 변경 파일: 신규 `docs/21_cera-conceptual-data-model.md`, `docs/21_cera-conceptual-data-model.xlsx` / 수정 `docs/15`, `docs/20`(헤더), `docs/README.md`, `AGENTS.md`, `.gitattributes`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git status --porcelain -- back/ ai/ data/ packages/ infra/` 결과 없음. `front/`의 미커밋 변경 2건은 **Antigravity 작업이며 이 세션이 만들지 않았고 건드리지 않았다**. 문서 Task라 코드 검증 명령은 돌리지 않음. xlsx는 openpyxl로 다시 읽어 시트·행수·한글 무결성 확인(523행), `.gitattributes`에 `*.xlsx binary` 추가 후 `git check-attr`로 확인
- 남은 일 / 다음 한 걸음: **T-074 사람 검토**(과설계 여부, 5절 판정 근거, MVP 구분, 최소 집합, L-1~L-8). 승인되면 **논리 DB 설계** → **T-070 문서 동기화** → **T-069 외부 통신 구현 계획**
- 큐 변경: T-073 DONE, **T-074 신규(NEEDS_HUMAN, P0)**, T-072를 완료 섹션에 뒤늦게 등록, T-069는 삭제하지 않고 **데이터 모델 뒤로 순서만 이동**
- 주의사항:
  - **`docs/21`과 xlsx 모두 미커밋이고 최종 DB 스키마가 아니다.** 논리 설계로 자동 진행하지 않는다
  - xlsx **재생성 스크립트를 저장소에 두지 않았다** — 사람이 직접 편집하는 작업표이므로 자동 생성이 사람의 기록을 덮어쓸 위험이 있다
  - **Q-44·Q-45는 여전히 사용자 결정 대기**다. 개념 모델은 막지 않지만 T-069 착수 전에 필요하다
  - `docs/04`·`docs/07`은 **일부러 고치지 않았다**(`docs/20` 6.3절 방침: 개념 모델 승인 뒤 T-070에서 한 번에)
  - **프론트는 Antigravity 소관이다.** 이 세션 이후에도 `front/`를 건드리지 않는다

## 2026-09-16 · T-072 (사용자 직접 지시) DB 설계 전 요구사항 검토 · Claude Code (claude-opus-5)
> **뒤늦은 기록 (2026-09-17 추가).** 이 작업은 2026-09-16에 끝나 `1b97905`로 커밋됐지만, 그날 세션이 QUEUE·CURRENT·LOG를 갱신하지 못한 채 끊겼다. 과거를 꾸미지 않고 그 경위와 결과만 여기 남긴다.
- 상태: 완료. **커밋 `1b97905`** (T-071과 함께 하나의 문서 기준점으로 묶임)
- 검토 시작 기준점: `2c37c28` + 당시 미커밋이던 T-071 변경 / **완료 커밋: `1b97905`** — 둘은 다른 의미다
- 지시: 사용자 직접 지시. QUEUE에 사전 등록되지 않았다. "어떤 테이블을 만들까"가 아니라 **테이블을 만들기 전에 무엇이 확정돼 있고 무엇을 더 결정해야 하는가**를 가를 것
- 한 일:
  1. **`docs/20_data-model-preconditions.md` 신규**: DB가 반드시 따라야 하는 확정 규칙 24개(A-01~A-24), Proposed 설계 분류(DB 구조를 좌우하는 10건), 시나리오 가정(제품 규칙이 아닌 것), 문서 충돌 D-01~D-06, **원본 / 물질화하는 파생 / 계산 결과 기록 / 조회 시 조립값** 4분류, Event·Canonical State 14문항, 도메인별 분석(Container·B/L·Facility·운송사·차량·계약·요율·비용·통신·감사), 검증 스크립트 규칙 5분류, 식별자 4종, 단계별 결정사항, Planner Handoff
  2. **사용자 결정 7건 반영**: 사건·상태 **구조 승인**(ADR-019·020·021을 `Accepted (구조 한정)`으로 판정, 파라미터 값은 계속 검증) · **B/L은 컨테이너와 별개 개념** · **Facility 공통 상위 개념 사용**(테이블 하나라는 뜻은 아님) · **개별 차량을 MVP 필수로 확정하지 않는다**(이전 결론 철회 → Q-57) · 환율·기준일은 **보존 요구만 확정**(저장 위치는 논리 설계) · **Operational Plan / Recovery Plan 용어 분리** · **Actor 개념만 도입**(인증·권한 모델은 만들지 않는다)
  3. **낡은 표기 정정**: `docs/07` 3절 기술 표를 A~D 4분류로(특정 LLM 공급자·모델은 요구사항이 아니라 구현 시점 선택), `messages` 행의 ADR-028을 **Accepted**로, 실제 발송을 **Tech Validation**으로. `docs/01`·`04`·`05`에서 ADR-019/021을 Proposed로 부르던 곳 정정. `docs/13`에 Facility·Destination·Operational Plan·Recovery Plan·Actor·PLAN 추가·구분. `docs/15`에 Q-53~Q-63 추가
- 판정: **개념 데이터 모델 착수 조건 충족**(18절 6건 모두 처리). 다음은 CERA 전체 개념 데이터 모델이며 **SQL은 아직 쓰지 않는다**
- 변경 파일: 신규 `docs/20_data-model-preconditions.md` / 수정 `docs/01`, `docs/04`, `docs/05`, `docs/07`, `docs/13`, `docs/14`, `docs/15`, `docs/19`(헤더)
- 검증: 제품 영역 변경 0건. 문서만 바꿔 코드 검증 명령은 돌리지 않음
- 남은 일 / 다음 한 걸음: **개념 데이터 모델**(→ 2026-09-17 T-073으로 수행)
- 큐 변경: (당시 누락) → 2026-09-17에 QUEUE 완료 섹션에 등록
- 주의사항: 이 문서의 **검토 시작 기준점을 완료 커밋으로 덮어쓰지 않는다.** 역사적 의미가 다르다

## 2026-09-16 · T-071 External Communication 구현 전 요구사항 명세 · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 사람 검토·승인 대기**). 기준 커밋 `2c37c28` 위의 문서 변경만. 제품 코드 0건
- 지시: 아키텍처·책임 경계가 확정됐으니 "무엇을 구현해야 하는지 / 어떤 상태가 있어야 하는지 / 어떤 입력과 결과가 필요한지 / 어떤 실패를 처리해야 하는지 / 언제 완료로 볼지"를 **구현 계획을 세울 수 있을 만큼** 구체화. **구현 기술은 고정하지 말 것**
- 한 일:
  1. **`docs/19_external-communication-requirements.md` 신규.** `18`(왜 이 구조인가)과 역할을 분리하고 내용을 복사하지 않았다. 사용자 흐름 A~J를 기술 용어 없이 먼저 적고, 그 아래 요구사항을 ID로 붙였다
  2. **요구사항 그룹 9개 신설**: `FR-CPY`(거래처·연락처·주소) `FR-EVF`(이메일 확인) `FR-ELG`(발송 자격) `FR-APV`(승인) `FR-SND`(실제 발송) `FR-INB`(회신 수신) `FR-XAI`(AI 추출 계약) `FR-STC`(구조화 채널) `FR-EVL`(사건·상태 반영). 기존 그룹 확장: `FR-COM-04~` `FR-UI-09~` `FR-AUD-02~` `NFR-12~30`. `03`의 `FR-<그룹>-NN` 체계를 그대로 따랐다
  3. **실패·예외 35+ 상황 표**(상황 → 시스템 행동 → 사용자 화면 → 재시도 가능 → 사람 확인 필요). 지시받은 목록에 더해 직접 찾은 것: 같은 주소가 두 거래처에 등록, 첨부만 있고 본문 없음, 발송 기능이 꺼져 있음, 회신 없이 기한 경과, 인증 문제와 개별 실패의 구분
  4. **사용자에게 보이는 상태 이름**을 내부 enum보다 먼저 고정(메시지 8개·묶음 7개·주소 6개)
  5. **완료 조건 34개 체크리스트**, **우선순위 3단계**(첫 구현 / 다음 / 나중), **화면 매핑**(연락 루프와 그 결과 자원 사실까지만 실제, 위험·비용·계획은 계속 시나리오)
  6. **열린 질문 재분류**: 구현 전 필수(Q-44 근거 시각, Q-45 보관 기간) / 구현 중 사례 보고 결정(M-6, Q-47, Q-48) / 범위 밖(Q-46) / 신규 Q-49~Q-52
  7. **Q-48(공용 업무 메일함) 분석**: 확인 절차·발송 자격·권한 판정에는 차이가 **없고**, 회신 발신자 처리·퇴사 처리·표시 이름에는 차이가 **있다**. 첫 구현을 막지 않으므로 구분 없이 진행하고 구현 형태는 확정하지 않았다
  8. **`docs/03` 모순 해소**: FR-ING-07(Gmail `Could/Pilot` → `Must`/Tech Validation), FR-COM-02("가상 메일함만" → Tech Validation부터 실제 발송), FR-ING-05(발신자 분류는 등록부 조회), FR-RSP-01(추출과 Event 생성의 주체 분리), NFR-03(검증 기준 3개로 구체화)
- 핵심 원칙 (23절에 명시): **요구사항은 행동과 계약만 정의하고 구현 기술을 고르지 않는다.** AI 모델·공급자·버전·SDK, 외부 API 호출 순서, 인증·DB·큐 라이브러리, 솔버·최적화 방식, 데스크톱 기술, 배포 환경을 전부 열어 뒀다. 같은 행동을 여러 기술로 만들 수 있고 어느 것이 나은지는 만들기 직전 상황에 달려 있기 때문이다. 단 책임 경계·사람 승인 게이트·발송 자격·사건 설계·원문 보존·중복 발송 금지는 이미 정해졌고 바꾸지 않는다
- 변경 파일: 신규 `docs/19_external-communication-requirements.md` / 수정 `docs/03`, `docs/15`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: 제품 영역(`front/`·`back/`·`ai/`·`data/`·`packages/`·`infra/`) 변경 0건, 폴더 이동·패키지 설치·API·DB 생성 없음. 문서만 바꿔 코드 검증 명령은 돌리지 않음
- 남은 일 / 다음 한 걸음: **T-069 Implementation Plan.** 착수 전에 사용자에게 **Q-45·Q-44**를 먼저 묻는다
- 큐 변경: T-071 DONE 추가. T-069가 다음 1순위(입력이 `19` 24절 + `18` N절로 늘어남)
- 주의사항:
  - `19`는 **미커밋**이다. 사용자 승인 뒤 커밋한다
  - `19`가 외부 통신 요구사항의 **정본**이다. `03` 2.7절은 요약이고 19를 가리킨다
  - 계획에서 확정하면 안 되는 것: M-6, Q-46, `19` 23절 기술 선택 목록

## 2026-09-16 · T-068 External Communication Architecture RFC + AI/Backend 책임 경계 Audit · Claude Code (claude-opus-5)
- 상태: 완료 (사용자 승인 뒤 **커밋함**). baseline `5972420` 위의 문서 변경만. 제품 코드 0건
- 지시: ① Mock으로만 존재하던 외부 연락 루프(초안 → 사람 승인 → 발송 → 실제 회신 → 구조화 → Operational Event → 화면)를 구현 가능한 수준으로 설계 ② 같은 날 2차로 **AI/LLM과 Backend·결정론 엔진의 책임 경계 재정리** ③ 3차로 승인 결정 반영 + 문서 동기화 + 커밋. 구현·폴더 이동 금지
- 한 일:
  1. **RFC 작성** `docs/18_external-communication.md` (A~O절): 기능 흐름, Front/Back/AI 책임, 도메인 모델, 상태 전이, Event/State 연결, Gmail OAuth·최소 권한, 실패·중복·재시도, API 후보, Mock→Real 전환, MVP 범위, 미루는 것, 열린 결정, Planner Handoff, **O절 CERA 전체 책임 경계표**
  2. **책임 경계 Audit**: RFC 초안 자체에서 7건(LLM이 `entity_id`·`fact_key` 출력 / `send_allowlist`가 제품·개발 혼재 / 허용 조건 축이 "실제 현업인가" / 구조화 채널 분기 없음 / 회신 결과 단일 분류 / Contact 개념 부재 / 경계표 부재), 기존 정본에서 8건(`11` "모호하면 LLM 분류", `06` 10개 중 7개가 결정론인데 Agent, `04` LLM → DB 구조체 직결 도식, `07` 순수 엔진 중 `state`만 `back/`, 3개 README의 `ai/` 배정, `03` FR 3건, `02`·`09`·`10`·`12`의 Agent 표현) 발견. 고칠 수 있는 것은 고치고 나머지는 T-070으로
  3. **승인 결정 반영**: `01` 6·6.1절 **`Tech Validation` 단계 신설**(PoC "가상 메일함만" 규칙과의 충돌을 삭제가 아니라 단계 정의로 해소), `02` 6절 제품 단계, `01` 3절 LLM 사용 기준·금지 경계, ADR-026·027·028·029 **모두 Accepted**, ADR-024 `ai/` 영역 정의 개정 주석
- 핵심 결정:
  - **AI 사용 기준 = "입력이 비정형이고 해석이 필요한가"** (값이 자주 바뀌는가가 아님). 구조화 채널(폼·포털·TMS·CSV)은 LLM을 거치지 않는다. `Form → LLM → Structured Value` 금지
  - **발송 자격 = 거래처 → 담당 연락처 → 이메일 검증 → 관계 승인 → 통신 활성** (제품 게이트, 영구). 개발환경 수신자 제한은 **별개 장치**. 테스트 상대도 같은 검증 흐름을 쓴다(우회 경로 없음)
  - **`ai/`는 LLM·비정형 처리만.** 결정론 엔진(Tariff·Cost·Risk·Reconciliation·Optimize·Solver)은 Backend 영역. 새 `engine/`은 만들지 않음. 적용은 T-003
  - LLM 출력에서 `entity_id`·`fact_key`·역할·강도를 걷어냄. LLM은 `ask_id` + 값 + 원문 인용만 내고 Backend가 매핑
  - AI 책임 4가지는 **현재 MVP 허용 범위**이지 영구 고정 목록이 아니다
- 변경 파일: 신규 `docs/18_external-communication.md` / 수정 `docs/01`(6·6.1절 신설), `docs/02`(6절), `docs/04`(4.1), `docs/06`(1.1절 신설·2·7절), `docs/07`(6.1절 신설·4·6절), `docs/11`(5절), `docs/14`(ADR-024 주석 + ADR-026~029), `docs/15`(Q-44~Q-48), `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`
- 검증: `git status --porcelain -- front/ back/ ai/ data/ packages/ infra/` 결과 없음(제품 코드 무변경), `engine/` 미생성, remote 없음. 문서만 바꿔 코드 검증 명령은 돌리지 않음(baseline 검증은 2026-09-15 T-063 기준 유효)
- 남은 일 / 다음 한 걸음: **T-069 Implementation Plan** — `18` N절의 15가지에 답한다. 계획이 승인돼야 구현 시작
- 큐 변경: T-068 DONE, **T-069 신규(다음 1순위)**, T-070 신규(정본 잔여 반영). 2026-09-15 "Gmail·Backend 구현 금지" 지시는 이 Slice 범위에 한해 해제(Solver·T-036 금지는 유지)
- 주의사항:
  - **M-6**(값이 같은 새 회신의 신선도 갱신), **Q-46**(상대방 포털 입력의 Source 모델), **Q-48**(공용 업무 메일함 구분)은 **열린 상태**다. 구현 계획에서 확정하지 말 것
  - 새 문서·코드에서 결정론 모듈을 "Agent"라고 부르지 않는다. 기존 스키마명(`agent_activity`)·제품명은 개명하지 않았다
  - `ai/README.md`·`back/README.md`·루트 `README.md`의 영역 문구는 제품 폴더 안이라 손대지 않았다 → T-070

## 2026-09-15 · T-067 (사람 지시) AI 협업 개발 Workflow / Orchestrator Handoff · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**). baseline `5972420` 위의 문서 변경만
- 지시: Claude·Codex가 번갈아 Orchestrator를 맡고 ChatGPT(계획·리뷰)·Antigravity(구현)를 함께 쓸 때 방향이 흔들리지 않도록, 인수인계를 Git 문서로 정식화. 제품 기능 구현 금지
- 한 일:
  1. 기존 규칙 점검 후 충돌 4건을 통합: ① `AGENTS.md` 2절의 1회성 `HANDOFF.md` → `CURRENT.md`로 대체(옛 파일이 있으면 옮기고 삭제) ② 3.1절 이어받기 기준 "LOG 중단 인계" → "CURRENT가 IDLE이 아님" ③ 3.6절 중단 기록 → CURRENT ④ `docs/01` 8절 "태스크 완료 조건에 있을 때 커밋" 예외 → 사람 승인 뒤로 일원화
  2. 신규: `docs/17_ai-development-workflow.md`(역할, 정본 순서, 11단계 흐름과 작은 수정 간소화, Handoff 절차, QUEUE·CURRENT·LOG, ChatGPT·Antigravity 지시 최소 항목, Commit Gate), `docs/tasks/CURRENT.md`(Status IDLE — 가짜 Task 없이 현재 상태, 다음 Task 후보는 미확정으로), `docs/tasks/TASK_BRIEF_TEMPLATE.md`
  3. `AGENTS.md`: 읽는 순서에 CURRENT·git status, 3.2 착수 때 CURRENT Task Brief, 3.4 완료 때 CURRENT → LOG, 3.7 Orchestrator Handoff Rule, 규칙 10에 "승인" 추가, 문서 지도. `CLAUDE.md`: Claude 전용 메모 3줄(규칙 복제 없음). 루트 `README.md`: Development Workflow 짧은 표. ADR-025(Accepted, 사람 결정)
  4. CODEX.md·Antigravity 설정 파일은 만들지 않았다(모든 도구가 AGENTS.md·CURRENT.md를 읽는 구조)
- 변경 파일: 신규 `docs/17_ai-development-workflow.md`, `docs/tasks/CURRENT.md`, `docs/tasks/TASK_BRIEF_TEMPLATE.md` / 수정 `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/01_project-rules.md`, `docs/14_decisions.md`, `docs/README.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: `front/web/src`·`data/scenarios`·코드 파일 변경 없음(`git diff --name-status`로 확인). 새·수정 문서의 로컬 링크·경로가 실제 파일을 가리키는지 검사. Frontend 코드가 바뀌지 않아 build는 다시 돌리지 않음
- 남은 일 / 다음 한 걸음: 사람 — T-067 커밋 여부, 다음 제품 Task 선택(CURRENT Open Questions), T-064·T-001
- 큐 변경: T-067 추가·DONE, 사람 지시(Workflow) 추가, QUEUE 머리에 QUEUE·CURRENT·LOG 역할 구분
- 주의사항: 다음 세션(Claude든 Codex든)은 `AGENTS.md` → `docs/tasks/CURRENT.md` → `git status` 순서로 시작한다. CURRENT는 IDLE이며 T-067 변경이 커밋 승인 대기로 적혀 있다

## 2026-09-15 · T-066 (사람 지시) Private Monorepo 재정렬 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**)
- 지시: 저장소를 나누지 않고 하나의 Private Monorepo 안에서 `front/`·`back/`·`ai/`·`packages/`·`data/`·`docs/`·`infra/` 책임 영역으로 재정렬. 기능 추가·Backend·Gmail·LLM·Solver·Tauri 금지. Frontend Prototype을 깨뜨리지 않는 것이 최우선
- 한 일:
  1. 사전 확인: git 상태(미커밋 18개 변경 + 새 파일 40개, 약 2만 줄), 비밀정보 파일 없음, 커밋 제외 대상 5종 확인. 이동 전 파일 87개(node_modules·.next·.git 제외)의 SHA-256 목록을 세션 scratchpad에 기록
  2. 사용자가 띄운 `next start --port 3001`(web/에서 실행 중, 폴더 잠금 원인)을 사용자 승인 뒤 종료
  3. `web/` → `front/web/` 이동. `web/`은 한 번도 커밋되지 않은 폴더라 `git mv`가 불가능해 일반 이동(같은 드라이브 이름 변경)을 썼다. node_modules 21,299개 파일 포함 그대로 이동
  4. 경로 수정: `next.config.ts`(Turbopack root = 두 단계 위), `tsconfig.json`(`@scenario/*` → `../../data/scenarios/*`), `scripts/validate-scenario.mjs`(저장소 루트·금지 표현 검사 경로), `scripts/smoke-browser.mjs`(시나리오 경로), `src/data/mock/fixture.ts` 주석, `.gitignore`(`.next/`·`.smoke/`·`next-env.d.ts`를 위치와 무관한 패턴으로)
  5. 영역 생성: `back/`·`ai/`·`packages/`·`infra/`에 README.md만. 루트 `README.md` 신규. `AGENTS.md` 1.1절(저장소 구조), 4절 규칙 9(Mock/Simulated/Real 구분)·10(요청 없이 commit/push 금지), 6절 명령(`cd front/web`). `CLAUDE.md`에 구조 한 단락. ADR-024(Accepted, 사람 결정)
  6. 문서: `docs/07` 6절을 Monorepo 레이아웃 + 옛 `src/cera` 모듈의 back/ai 배치표로 교체, 3절에 "구현된 것은 프론트엔드 줄뿐" 명시. `web/` 경로 38곳을 `front/web/`으로(AGENTS·01·07·12·13·16·README·QUEUE·데이터 팩 README). LOG의 옛 항목과 ADR 본문은 규칙대로 고치지 않고 CHANGELOG 7절 경로 대응표에 `web/ → front/web/` 추가
  7. 오해 표현 정정: 시나리오 JSON 4개의 "LLM (녹화 재생)"·"LLM 추출 녹화값"·"녹화된 값" 17곳 → "SIMULATED — 시나리오 작성값 (LLM 미실행)" 계열. 숫자·구조 변경 없음. 문서의 "Three.js Operations Simulator"(02·03·10·12·AGENTS·docs/README) → "현재 Prototype 2D / Three.js는 향후 선택지"
- 변경 파일:
  - 이동: `web/**` → `front/web/**`
  - 신규: `README.md`, `back/README.md`, `ai/README.md`, `packages/README.md`, `infra/README.md`
  - 수정: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `front/web/{next.config.ts, tsconfig.json, scripts/validate-scenario.mjs, scripts/smoke-browser.mjs, src/data/mock/fixture.ts}`, `data/scenarios/busan-wh-capacity-01/{scenario, events, communications, resources}.json`·`README.md`, `docs/01·02·03·07·10·12·13·14·16`, `docs/README.md`, `docs/CHANGELOG.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
  - 삭제: 없음
- 검증 (`front/web`에서): `validate:scenario` 2,133개 통과(숫자 동일: Baseline 4,650,000 / v1 3,835,000 / v2 3,855,000), `typecheck` 통과, `lint` 경고 0, `build` 통과, `smoke`(Edge 헤드리스) 135개 항목 통과 — 30대·9단계·KPI·지도 경로별 칸 수·Recovery Console·v1/v2·Communications·Timeline·상세 서랍, 콘솔 오류 0. 이동 전후 파일 해시 대조로 유실 없음 확인
- 남은 일 / 다음 한 걸음:
  - 사람: 커밋 여부 결정(원격 백업 없음, 미커밋 약 2만 줄), T-064 Prototype 검토, T-001
  - 에이전트: 변화 없음(T-017·T-034·T-035 등 실행 가능)
- 큐 변경: T-066 추가·DONE, T-003 범위를 `back/`·`ai/` 뼈대로 조정, 사람 지시(Monorepo 유지) 추가
- 주의사항:
  - 이제 Frontend 명령은 모두 `front/web`에서 실행한다. 사용자가 쓰던 3001번 서버는 종료했으므로 `cd front/web && npm run start`로 다시 띄워야 한다
  - `front/web/.next/`(빌드 산출물)는 옛 경로가 들어 있어 이동 뒤 다시 빌드했다. 삭제하지 않았다
  - 남은 하드코딩(화면 문구·입고 예정 대수·시간대)은 이번 범위가 아니라 그대로다(감사 보고 F-4)

## 2026-09-15 · T-060~T-063 (사람 지시) Prototype-led Discovery — Event/State 마무리 + 30대 시나리오 + Control Tower Prototype · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 T-064 대기, **커밋하지 않음** — 사람 지시)
- 지시 (2026-09-14 퇴근 전 사람 지시, 2026-09-15 실행): T-036을 보류하고 30대 시나리오 + Next.js Control Tower Prototype을 먼저 만든다. Solver·Backend·DB·실연동·LLM 금지. 끝나면 멈춘다. 이 지시가 HANDOFF.md 5절 순서(T-001 판정 → T-036)보다 우선한다
- 변경 이유 (로드맵): 실제 운영 데이터와 제약이 검증되지 않은 상태에서 수학모델을 먼저 고정하면 가정을 과도하게 설계할 위험이 있다. Prototype-led Discovery를 실제 개발 순서에 적용한 것이며 기획 후퇴가 아니다(ADR-023)
- 한 일:
  1. **T-060** `05` 5.2: RECEIVED_ONLY → STALE 취급(T-032 패치 ③) 폐기. `freshness = UNKNOWN`, `temporal_confidence = LOW`, `evidence_time_quality = RECEIVED_ONLY`. 중요 사실이면 STALE처럼 게이트(`FRESHNESS_UNKNOWN`). `temporal_quality` → `evidence_time_quality` 이름 변경을 07·11·13·14에 전파. Event/State 설계 완료 상태로 표시
  2. **로드맵**: `12` 2.5절 Phase 0.5 추가, T-036 DEFERRED(삭제 아님), QUEUE에 `DEFERRED` 상태 추가, ADR-023
  3. **T-061** 30대 데이터 팩(JSON 9개): 영향 12대·직송 유지 8대·그 밖 10대, Reefer 4, 트럭 8대 근무 시간, ODCY A/B 제약, 회신 3건, Plan v1·v2, 위험 상태 4개, 확인 요청. 금액은 단가에서 합산(Baseline 4,650,000 / v1 3,835,000 / v2 3,855,000원)
  4. **T-062** Frontend Data Contract(`cera.ts`) + `CeraDataProvider` + MockProvider. 컴포넌트는 fixture를 import하지 않음
  5. **T-063** Control Tower(Next.js 16, 2D SVG), Reset·이전·다음·Play, 컨테이너 상세 서랍. 검증 스크립트 2개(`validate:scenario`, `smoke`)
  6. 문서: `16_frontend-prototype.md`(신규), `09` 0절, `10`·`07`·`03`·`01` 7절·`13`·`14`(ADR-022·023, ADR-014·016 주석)·`15`(Q-37~Q-43, Q-02)·`README`·`CHANGELOG` 갱신. `HANDOFF.md` 반영 후 삭제
- `[PROPOSED]` 시나리오 fixture 수정 이유 (09 예시값과 다름):
  - 예시 6,420,000 / 2,850,000 / 3,570,000원은 산식이 없다. 운송비 포함 TotalCost를 단가(`[ASSUMPTION]`)에서 합산했고, 예시를 맞추려 단가를 역산하지 않았다
  - 예시 배정 8/5/4/3(합 20)은 "원래 창고 대상 20대 배치"로 해석해 v1에 유지하고, "영향 12대 Recovery Actions"(5/4/3 = 12)를 따로 셌다 → Affected 12 = Actions 12
  - v2가 v1보다 20,000원 비싸다(절감 815,000 → 795,000). v1이 가정한 ODCY A 5대가 회신에서 4대라 1대가 실행 불가였고, 운송사 추가 트럭으로 C008을 옮겨 일부 만회했다. "회신이 계획 가정을 바로잡는다"는 장면으로 의도했다(Q-43)
  - 회신 11:40~11:50 → 11:15~11:20 (지시 타임라인), D0 10/05(대체공휴일) → 10/13(화), Reefer 4대 추가(지시 요구, "ODCY 불가 → 직송"으로만 사용)
- 변경 파일:
  - 신규: `docs/16_frontend-prototype.md`, `data/scenarios/busan-wh-capacity-01/` (scenario·containers·resources·events·risk·plans·communications·activity·verifications `.json`, `README.md`), `web/` (package.json·package-lock.json·tsconfig.json·next.config.ts·eslint.config.mjs, `src/app/`·`src/contracts/`·`src/data/`·`src/components/`, `scripts/validate-scenario.mjs`·`scripts/smoke-browser.mjs`)
  - 갱신: `docs/01_project-rules.md`, `03_requirements.md`, `05_event-and-state.md`, `07_backend-architecture.md`, `09_mvp-scenario.md`, `10_simulation-spec.md`, `11_data-sources.md`, `12_roadmap.md`, `13_glossary.md`, `14_decisions.md`, `15_open-questions.md`, `README.md`, `CHANGELOG.md`, `tasks/QUEUE.md`, `tasks/LOG.md`, `AGENTS.md`, `.gitignore`
  - 삭제: `HANDOFF.md` (1회성 인계, 내용은 QUEUE·LOG·docs에 있음)
- 검증:
  - `npm run validate:scenario` 통과 (2,133개 검사: 비용 항목·계획 합계, 절감 = Baseline − Plan, 20대·12대 합, ODCY 용량·규격·최대 보관일, 창고 일자별 용량, 트럭 근무 시간·중복·당일 마감, K운송 트럭 시점, KPI = 위험 상태, 확인 대기 수, ISO 6346, +09:00, KRW 정수, 금지 표현)
  - `npm run typecheck`, `npm run lint`(경고 0), `npm run build` 통과
  - `npm run smoke` (Edge 헤드리스, `next start`): 9단계 전부 시계·KPI 6개·예외·계획 비용·절감·조치 12행·"= 12대"·지도 경로별 칸 수를 fixture와 대조 통과, S5 재계획 경고·S7 변경 표시·C007/C003 상세·Reset·Play 확인, 콘솔 오류 0. 스크린샷을 직접 보고 레이아웃 수정(Recovery Console 전체 폭, 표 줄바꿈, 입항 전 컨테이너를 터미널 밖으로)
- 남은 일 / 다음 한 걸음:
  - 사람: **T-064** Prototype 검토(실행법 `16` 3절), ADR-022·023 판정, 커밋 여부. T-001도 여전히 대기
  - 에이전트(검토 뒤): T-065 → T-036 재개. 병행 가능: T-017(인터뷰 가이드), T-034, T-035
- 큐 변경: T-060·T-061·T-062·T-063 DONE, T-064(NEEDS_HUMAN)·T-065 추가, T-036 DEFERRED(재개 조건 T-064·T-065), T-037 범위 조정(T-061 위에 정식 Event fixture), T-017 의존 T-037 → T-063, T-003 web 항목 선행 완료 표시, 상태 규칙에 DEFERRED
- 주의사항:
  - 데이터 팩 JSON은 세션 scratchpad의 작성 스크립트로 한 번 생성했다(커밋 안 함). 이제 JSON이 정본이며, 고칠 때는 JSON을 직접 고치고 `validate:scenario`로 합계를 확인한다
  - 화면 숫자는 엔진 결과가 아니다(`SCENARIO_RESULT`). "Solver가 계산했다" 류 표현은 validator가 막는다
  - ESLint 10은 `eslint-config-next` 16.3.5의 react 플러그인과 호환되지 않아 9를 쓴다(설치 시 deprecated 경고는 무시해도 됨)
  - `web/.smoke/`(스크린샷), `.next/`, `node_modules/`는 `.gitignore`
  - 사람 지시로 Backend·Solver·Phase 1 코드로 넘어가지 않았다

## 2026-09-11 · T-032 패치 (사람 조건부 승인 후 4개 수정) · Claude Code (claude-opus-5)
- 상태: 완료 (사람 최종 검토 대기, **커밋하지 않음**. T-036·솔버 확정·코드 금지)
- 지시: T-032 전체 방향은 조건부 승인. 기존 설계를 유지한 채 4개만 최소 수정·재검증
- 한 일:
  1. **ADR-007 Reopened → Proposed**. 재개 이유: Accepted 상태는 v0.1 원본 기획서 승계였고, V0.2 Master Planning 정본에서 솔버는 "현재 후보"이며 CP-SAT / MILP / min-cost flow / VRP / scheduling 비교가 Open Question이다. 직전 T-031·T-032 보고와 LOG에서 이 ADR을 `[DECIDED]`로 유지한 것은 정본과 충돌했으므로 바로잡는다. 선택은 T-036(Q-35). ADR-008은 `[DECIDED]` 유지. 01 규칙의 `[DECIDED]` 예시를 ADR-008로 교체. 06·07·08·12·13·CHANGELOG의 CP-SAT 확정 표현을 "후보"로 정리
  2. **Plan Approval / Fact Verification 분리** (ADR-017 결정 (2) 개정): `PLAN_APPROVAL`은 Event Store 밖 결정 기록(`plan_decisions`, append-only). 계획 승인으로 입력 사실을 CONFIRMED로 올리지 않음. CONFIRMED 근거 `verification_basis` = HUMAN_VERIFICATION / AUTHORITATIVE_SYSTEM / POLICY_EVIDENCE. PROVISIONAL 입력은 `ALLOW_WITH_ACK`(잠정 입력 인지 명시)로 승인 가능, 승인 뒤 V9 확인 요청. `APPROVAL_BLOCKED`는 사실 단위 행동으로만 해제. "확인 + 승인" 묶음 UI는 허용하되 `VERIFICATION` Event와 `PLAN_APPROVAL` 기록을 따로 남김. 승인 때 차단 확인·입력 불변 확인. `verification_method = PLAN_APPROVAL` 삭제
  3. **근거 시각 단순화**: `max(...)` 공식과 공공 API 지연 허용 ∞를 폐기하고 3단계 폴백(EVENT_TIME → RECORDED_TIME → RECEIVED_ONLY) + `temporal_quality`로 바꿈. 수신 시각에서 지연을 빼지 않음. 옛 공식이 막던 오류는 "STATE의 `source_event_time` = 관측 시각, 변경 시각은 `payload.changed_at`" 어댑터 매핑 정의로 막음(결정론 예시 05 5.2). 공공 API RECEIVED_ONLY → STALE 취급. [지금도 맞음] 액션 추가(옛 Event 확인만으로는 신선해지지 않음)
  4. **FORECAST 사실 종류 추가**: `plan.eta` → `forecast.eta`(`forecast_kind`: SCHEDULED / ESTIMATED / PREDICTED). `milestone.ata`와 다른 키. 실제 입항이 생기면 R7-f로 판단에서 빠짐. INFERENCE는 FORECAST만 채움(R8). PLAN은 CERA 사용자의 예정만
- 재검증: 6개 CASE 재적용. 값이 바뀐 CASE는 없음. 바뀐 부분은 CASE 2 표기(OBSERVED → CONFIRMED/AUTHORITATIVE_SYSTEM), CASE 3 근거 시각 설명, CASE 4(승인해도 PROVISIONAL 유지, V9), CASE 5(G2·G3 분리 절차), CASE 6(차단 해제 경로). A.7.4를 FORECAST로 재작성. Planning Snapshot 구조 변경 없음(`forecast` 필드 추가, PROVISIONAL 규칙 문구, 승인 검사는 기존 값·winner_event_id로 가능)
- 변경 파일: `docs/05_event-and-state.md`, `docs/14_decisions.md`, `docs/01_project-rules.md`, `docs/03_requirements.md`, `docs/04_domain-model.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/15_open-questions.md`, `docs/CHANGELOG.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 큐 변경: T-032 완료 항목에 패치 기록. T-036에 솔버 비교·ADR-007 결정 추가. T-001에 패치 검토·Q-36 추가. 사람 지시 추가
- 주의사항: ADR-019·020·021은 Proposed 유지. 바로 아래 T-032 항목의 "ADR-007·008 `[DECIDED]` 유지" 문구는 이 항목으로 정정한다(LOG는 append-only)

## 2026-09-11 · T-032 Event·Source·Canonical State 설계 확정안 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**. 사람 지시: 검토 전 T-036·T-037·Phase 1 코드 착수 금지)
- 작업 전 상태: v0.2 재정렬 미커밋, T-001 미수행(ADR-007·008만 Accepted). 05에 R1~R8(Proposed)과 7개 상태 단일 enum이 있었음. 발견한 모순: ① R3이 전역 출처 순위 ② 상태 enum이 차원 혼합 ③ `source_type`이 채널과 확인·추출 여부 혼합 ④ 01 규칙 3절("LLM 결과는 확정 전 Canonical State를 바꾸지 못한다")과 ADR-017(자원 사실 PROVISIONAL 반영) 충돌 ⑤ `[DECIDED]`·`[PROPOSED]` 태그 없음
- 한 일:
  - `05_event-and-state.md` 전면 재작성(확정안): 결정 수준 표기, 사실 종류 6개, 출처 3축 + 권한 매트릭스 + 근거 강도, Event 스키마(필드별 필수·생성자·불변·용도, 요청 필드 처리 근거), fact_key·event_type 카탈로그, Validation/Quarantine, 추출 검증기, 네 개의 시각과 근거 시각·신선도, 상태 차원 분리, 충돌 범주 C1~C10과 결과 유형, Reconciliation 의사코드 + R1~R12 결정표 + 옛 R1~R8 대응, Canonical Fact 스키마·"왜 이 값인가"·fingerprint, 정정·철회·확인 취소, 확인 요청 V1~V8과 사람 액션 → Event, Planning Snapshot(엔진 입력 계약), 정책 파라미터
  - 부록 A: 필수 CASE 1~6 적용 결과 + 경계 사례 10개 + 규칙 사용표(R1~R12 모두 사용) + MVP 11:00 사건 표현
  - `04_domain-model.md` 2절: 단일 enum / Milestone Composition / Hybrid 비교 → Hybrid 채택안, 단계 유도 규칙(Q-22 해결), Phase 1 최소 모델, 예외 오버레이를 컨테이너 예외·자원 조건·영향으로 분리
  - ADR-019(Reconciliation Policy), ADR-020(출처 3축·상태 차원), ADR-021(Hybrid) 추가. ADR-012 전역 우선순위 규칙 Superseded 표시, ADR-005·014에 주석
  - 01 규칙: `[DECIDED]`·`[PROPOSED]` 태그 추가(사용자 요청), LLM 결과 반영 규칙을 ADR-017과 일치시킴(모순 ④ 해소), Event 필수 필드 갱신
  - 옛 용어(HUMAN_CONFIRMED 등, 단일 상태 enum, S0~S9, 05 옛 절 번호) 참조를 03·06·07·08·09·10·11·12·13·15·field-dictionary에서 정리
  - 작성 중 발견해 고친 것: 확인 요청을 처리해도 R4-b가 같은 충돌을 다시 여는 루프 → `overruled_event_ids`(기각) 추가 / 추출 검증기 표가 빠졌던 것 → 05 4.6으로 복원
- 변경 파일: `docs/05_event-and-state.md`(재작성), `docs/04_domain-model.md`, `docs/01_project-rules.md`, `docs/03_requirements.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/14_decisions.md`, `docs/15_open-questions.md`, `docs/CHANGELOG.md`, `docs/data/field-dictionary.md`, `AGENTS.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: 코드 없음. 6개 CASE와 경계 사례를 결정표에 손으로 적용(부록 A), 규칙 사용표로 R1~R12 전부 사용 확인. 05 전체를 다시 읽어 절 간 모순 수정(참조 절 번호, location 권한 계열, 스냅샷 예시). 옛 용어는 grep으로 전수 확인
- 완료 기준 Q1~Q10: 모두 답할 수 있음(최종 보고 참조). Q10 — T-036은 `05` 14절 Planning Snapshot만 입력으로 쓰면 되므로 추가 상태 설계 없이 시작 가능
- DoD 조정: JSON Schema 수작업 파일은 만들지 않고 T-041(Pydantic 생성)로 이동. 이유는 QUEUE 완료 항목에 기록
- 남은 일 / 다음 한 걸음:
  - 사람: T-001 — ADR-019·020·021 판정, 권한 매트릭스(3.2)·강도표(3.3)·부록 A 결과가 현장 감각과 맞는지, Q-23·Q-24·Q-34
  - 에이전트(검토 뒤): T-036 → T-037, 병행 T-035·T-029
- 큐 변경: T-032 DONE. T-001 범위에 T-032 검토 추가. T-036 참조에 Planning Snapshot 추가. T-035 문구 갱신. 사람 지시 추가
- 주의사항:
  - `[DECIDED]`(Accepted) 결정은 바꾸지 않았다(ADR-007·008). ADR-012·005·014는 Proposed라 주석으로 개정했다
  - 요청의 CASE 3에서 메일 Event를 "PROVISIONAL"이라 했지만, 설계상 메일에서 뽑은 **컨테이너 사실**은 확인 전 후보 자격이 없다(강도 0). PROVISIONAL은 자원·제안·견적 사실에만 쓴다(부록 A.3에 명시)
  - 모든 파라미터 값(τ, δ_m, 신선도, θ)은 PoC 데모용 `[ASSUMPTION]`이다. 특히 τ가 "동시 충돌"과 "그 사이 현실 변화"를 가른다(A.5)

## 2026-09-11 · T-031 (사용자 지시) 기획 v0.2 전면 재정렬 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음** — 사용자 지시)
- 변경 이유 (사용자 지시 요약):
  - 공공데이터의 실제 반영 속도(SLA)를 신뢰할 수 없으므로, 공공데이터를 단일 진실원천으로 두는 v0.1 구조를 버린다.
  - CERA를 "여러 출처의 운영 사실 → 신뢰도 기반 Canonical Operational State → 예외 탐지 → 비용 최소 복구 → 연락·회신 반영 → 재최적화"를 수행하는 System of Decision/Action으로 재정의한다.
  - 사람 입력·이메일·계약서를 정식 입력원으로, 멀티에이전트(역할 분리)·Three.js 시뮬레이터·Prototype-led Discovery를 설계에 넣는다. 초기 범위(부산 Import FCL 30대)는 넓히지 않는다.
  - 기존 문서가 새 기획과 충돌하면 삭제하되 검증 결과·질문·ADR·폐기 사유는 보존한다.
- 한 일:
  1. 저장소 전체 문서(AGENTS, CLAUDE, docs/01~10, data/*, QUEUE, LOG) 검토 → 충돌 목록과 KEEP/MODIFY/DEPRECATE/NEW 분류(`docs/CHANGELOG.md` 1~4절)
  2. **삭제 전에** 문서 이전 지도 작성(`docs/CHANGELOG.md` 4절): 삭제할 문서, 이유, 유효 내용을 옮긴 곳
  3. 새 정본 구조로 재편하고 문서 작성: 제품 정의, 요구사항, 도메인 모델, 이벤트·상태, 에이전트, 백엔드, 최적화, MVP 시나리오, 시뮬레이터, 데이터 출처, 로드맵
  4. ADR-011~018 추가(Proposed). ADR-001~010 본문은 그대로 두고 v0.2 주석을 추가. ADR-003(Streamlit)은 Superseded by ADR-016
  5. Open Questions: R-6~R-8, Q-23~Q-33 추가. Q-01~Q-22·R-1~R-5 보존(주석 추가), Q-10·Q-16 CLOSED
  6. QUEUE 재정렬: T-031 DONE, T-032~T-040 신규, T-007·T-008 DEPRECATED, 옛 백로그 ID 폐기, T-002/T-005/T-006/T-030 P2로 조정
  7. 옛 문서·원본 기획서 삭제(아래), 참조 경로 정리
- 삭제한 파일 (모두 `ef6b85b`에 있어 git으로 복원 가능):
  - `docs/02_product-brief.md` → `02_product-definition.md`, `01` 4절, `11`, `15`로 이전
  - `docs/03_data-strategy.md` → `11_data-sources.md`, `05_event-and-state.md`로 이전 (T-004 VERIFIED 요약 포함)
  - `docs/04_service-flow.md` → `03_requirements.md`, `09_mvp-scenario.md`로 이전
  - `docs/05_domain-model.md` → `04_domain-model.md`, `05_event-and-state.md`, `08_optimization-model.md`로 이전
  - `docs/06_architecture.md` → `07_backend-architecture.md`로 이전
  - `docs/07_roadmap.md` → `12_roadmap.md`, `CHANGELOG.md` 6절로 이전
  - `docs/08_glossary.md`, `docs/09_decisions.md`, `docs/10_open-questions.md` → `13_glossary.md`, `14_decisions.md`, `15_open-questions.md`로 이름 변경(내용 전부 보존 + 추가)
  - 루트 `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf` / `.docx` → 사용자 허락으로 삭제. 유효 내용은 v0.1 문서 세트를 거쳐 v0.2로 이전됨
- 변경 파일:
  - 신규: `docs/CHANGELOG.md`, `docs/02_product-definition.md`, `docs/03_requirements.md`, `docs/04_domain-model.md`, `docs/05_event-and-state.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/14_decisions.md`, `docs/15_open-questions.md`
  - 갱신: `AGENTS.md`, `docs/README.md`, `docs/01_project-rules.md`, `docs/data/field-dictionary.md`(v0.2 읽기 주석, 참조 경로. 확인된 사실은 그대로), `docs/data/code-tables.md`(참조 경로), `docs/tasks/QUEUE.md`
- 폐기된 가정 (상세 `CHANGELOG.md` 2절 D-1~D-14): 공공데이터 단일 진실원천, 공공 API → State 직결, D&D Risk Radar가 제품 핵심, Plan A/B/C 비교 중심 최적화 설명, VBS 자동 Write, 공공데이터만으로 LFD 계산, DS-02 컨테이너 이벤트, 15011649 소멸, V0.1 LLM 없음, Streamlit UI, 폴링 중심 수집, 37대 데모, 공공 API 기반 Gate 1, 공공 API 선행 개발 순서
- 검증:
  - 삭제 대상 11개 파일이 모두 마지막 커밋에 있음을 `git cat-file`로 확인한 뒤 삭제(`git rm`이 아닌 `rm`, 인덱스 변경 없음)
  - 삭제된 파일명을 참조하는 곳을 grep으로 전수 확인 → 이름 변경 주석, CHANGELOG 대응표, LOG의 과거 기록만 남음(의도)
  - 옛 단계 명칭·Streamlit·폐기 ID 참조를 grep → 역사·주석 맥락에서만 남음
  - 코드 없음. 테스트 없음
- 남은 일 / 다음 한 걸음:
  - 사람: **T-001** — 기획 v0.2 검토, ADR-011~018 판정, 삭제 목록 확인 후 커밋 여부 결정, Q-15·Q-17·Q-21·Q-23 답변
  - 에이전트: T-032(Event·Canonical 스키마) → T-036(최적화 명세) → T-037(시나리오 데이터 팩). 병행 T-029
- 큐 변경: T-031 DONE. T-032~T-040 추가. T-007·T-008 DEPRECATED. T-009~T-016·T-018~T-028 폐기(재사용 금지). T-001 범위 변경(v0.2 검토). T-017을 Prototype 인터뷰 가이드로 변경. T-002·T-005·T-006·T-030 우선순위 P2
- 주의사항:
  - 커밋 전 백업: 재정렬 직전 작업 트리(T-004 미커밋 변경 포함)를 세션 scratchpad `backup_pre_v02/`에 복사해 두었다(세션 한정). 영구 복원 경로는 git `ef6b85b` + 이 LOG
  - 이 LOG의 아래쪽(과거) 항목에 나오는 파일 경로는 v0.1 기준이다. `docs/CHANGELOG.md` 7절 표로 읽는다
  - 제품 단계 명칭이 V0.1/V0.2/V1/V2 → **PoC/Pilot/Scale**로 바뀌었다. "기획 v0.2"는 문서 버전이지 제품 단계가 아니다
  - 시나리오 금액(6,420,000 / 2,850,000 / 3,570,000원)은 예시값이다. 엔진 결과처럼 쓰지 말 것

## 2026-09-11 · T-004 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기. 사람 지시: 검토 전에는 T-005 이후로 넘어가지 않는다)
- 한 일:
  - 공공데이터포털 상세 페이지 4개(15126268, 15131742, 15006353, 15011649)와 첨부 공식 가이드 3종을 받아 원문을 직접 읽었다. 포털 페이지에 포함된 Swagger 2.0 명세 2개도 추출했다
  - 인증키 없이 3개 엔드포인트에 GET을 1회씩 보내 엔드포인트가 살아 있는지와 오류 봉투 형식을 확인했다(데이터 수신 없음)
  - `docs/data/field-dictionary.md` v0.1 작성: API별 기본 정보 17개 항목, 요청·응답 필드, **CERA Mapping**(공식 필드 → 정규화 필드 → 도메인 엔티티 → 엔진 용도), 공공 API가 주지 않는 데이터, ContainerState 역매핑, T-007 스키마 제안, 파서 규칙
  - `docs/data/code-tables.md` v0.1 작성: 1차 출처에서 관측한 코드값만, 에러코드(UNI-PASS / 포털 게이트웨이)
- 변경 파일:
  - 신규: `docs/data/field-dictionary.md`, `docs/data/code-tables.md`
  - 갱신: `docs/03_data-strategy.md`(1·2.1·3·4·5·7·8절), `docs/02_product-brief.md`(10절), `docs/05_domain-model.md`(2.1 주 출처 열, Q-22 링크. 상태 유도 규칙은 **손대지 않음**), `docs/08_glossary.md`, `docs/10_open-questions.md`, `docs/07_roadmap.md`, `docs/README.md`, `AGENTS.md`(5절 문서 지도), `docs/tasks/QUEUE.md`
- **새로 VERIFIED된 사실** (출처 ID는 field-dictionary 0.2절):
  - DS-01 엔드포인트 `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo`, 개발계 호스트 `tunipass.customs.go.kr:38010`, GET, XML, 인증 `crkyCn` (S-02, S-08). T-000의 블로그 근거를 공식 문서로 대체
  - DS-01 요청 `cargMtNo` 또는 `mblNo`/`hblNo` + `blYy`, 응답 기본정보 38개 필드 + 처리이력(0..n) 13개 필드와 크기 (S-02)
  - DS-01 오류는 HTTP 200 + `tCnt=-1` + 한글 `ntceInfo`. 여러 건이면 `[N00]` 목록 응답. 조회 기간은 2023-06-17부터 3년 이내. IP로는 호출 불가 (S-02, S-08)
  - DS-02 엔드포인트 `https://apis.data.go.kr/1192000/CargFrghtContnOut/ContnInfo`. 필수 키는 **`prtAgCd` + `etryptYear` + `etryptCo` + `clsgn`**(입항 건). `numOfRows` 최대 50, 개발계정 1,000, 30 tps, 갱신주기 "실시간" 표기, 응답 17개 필드 (S-03, S-04)
  - DS-02 응답에 **컨테이너별 반출입 일시 필드가 없다**. 시각 필드는 선박 `etryndDt`뿐이다 (S-03, S-04)
  - 포털 게이트웨이 오류는 `OpenAPI_ServiceResponse/cmmMsgHeader` 봉투 + HTTP 401 (S-08). 가이드와 포털의 에러코드 번호 체계가 다르다(예: 10번) (S-03, S-04)
  - DS-03 후보 `해양수산부_선박운항정보`(15006353) `VsslEtrynd5/Info5`: 항만 + 기간으로 조회하면 `etryptYear`·`etryptCo`·`clsgn`·`mrNum`·입출항 일시·선석을 준다. 부산 `prtAgCd=020` (S-05, S-06)
- **기존 문서에서 틀려서 정정한 사실**:
  - "15011649 → 404, 사라짐" → 옛 URL(`/dataset/`)만 404다. 데이터셋은 **파일데이터(XLSX, 100행, 1회성)** `해양수산부_컨테이너반출입정보_20230112`로 있고, 오픈API가 아니다. 현재 오픈API 후보는 15131742 (Q-03 CLOSED)
  - "DS-02는 BL번호로 조회" → 입항 건 키로만 조회된다. 조인 경로를 B/L → DS-01 → DS-03 → DS-02로 바꿨다
  - "DS-02가 컨테이너 단위 반출입 이벤트(S1·S5·S9)를 준다" → 공식 명세상 아니다. DS-02를 **적하목록 스냅샷 출처**로 다시 분류했다. 반출 이벤트 1차 후보는 DS-01 처리이력
  - "DS-01 응답의 장치장명(`shedNm`)" → 기본정보가 아니라 처리이력 행의 필드다
  - T-000 응답 태그 목록의 `csclPrgsStts`, `prgsStCd`, `etprDt`, `cntrGcnt` 등은 공식 문서와 일치했다(정정 없음)
- **아직 확인 못한 항목** (`[TO VERIFY]`):
  - 코드표: `prgsStCd`, `csclPrgsStts`, 처리구분(`cargTrcnRelaBsopTpcd`), `blPt`, `spcnCargCd`, `tkinTkoutSe`(Q-18), `prtAgCd`(부산·광양 외). 공식 코드표를 찾지 못해 샘플 값만 적었다
  - DS-01 호출 한도, 갱신주기·실제 지연(R-1), 14자리 일시의 형식·타임존(Q-19), 목록 응답 태그명, 여러 컨테이너 B/L의 `cntrNo`·이력(Q-20), 포털 활용신청이 따로 필요한지
  - DS-02 트래픽 단위(일로 추정, Q-05), 조회 가능 기간, `blNo`가 MBL/HBL 중 무엇인지, `contnStndrd`가 ISO 6346 코드인지, `etryndDt`가 입항/출항 중 무엇인지
  - 화물관리번호 ↔ 적하목록관리번호·MSN 관계(Q-04, 길이만 맞는 가설), DS-03 매칭 규칙, ETA 출처
  - 양하(S1) 시각의 공식 출처(Q-22와 연결), DS-04 체인포털 공개 API(Q-21)
  - UNI-PASS API020·021·038·048·005 명세(T-030)
- **T-002에서 사용자에게 필요한 준비물** (QUEUE T-002에 상세):
  1. UNI-PASS 회원가입 → OpenAPI사용관리에서 API001 신청 → 인증키(`crkyCn`). 가능하면 API020·021·038·048도 신청하고 한도를 기록
  2. 공공데이터포털 활용신청 2건: 15131742(외항화물컨테이너정보), **15006353(선박운항정보, 새로 필요)**. 트래픽 단위 기록
  3. 로컬 `.env`에 `UNIPASS_API_KEY`, `DATA_GO_KR_SERVICE_KEY` (커밋 금지)
  4. 실제 B/L 5~20건: MBL(필수)·HBL·**B/L 연도**(필수)·입항항(부산)·대략 입항일·선박명·컨테이너 번호/개수. 반출·반납이 끝난 건과 아직 터미널에 있는 건을 섞고, 3년 이내 건만
- 검증: DoD 4항목 확인(DS-01·02 필드 1차 출처 정리 / Q-03 CLOSED·Q-04 갱신 / 필드→ContainerState 매핑(7절) / README 색인). 공식 문서 docx 3종의 SHA-256을 필드 사전에 기록. 문서 간 교차 참조(Q-17~Q-22, T-030, S-01~S-08)는 수동 확인. 코드 없음
- 남은 일 / 다음 한 걸음:
  - 사람: T-004 결과 검토(특히 Q-17 UNI-PASS 가이드 복제 금지 문구 판단, Q-21), T-001, T-002
  - 에이전트(검토와 무관하게 가능): T-029, T-030, T-017
- 큐 변경: T-004 DONE. T-030 신규. T-002·T-005·T-006·T-007 내용 갱신(T-006 범위 변경: DS-03 클라이언트 추가, 지연 측정을 DS-01 기준으로). T-001에 T-004 검토 추가
- 주의사항:
  - UNI-PASS 연계 가이드 원문과 샘플은 저장소에 넣지 말 것(Q-17). 필요하면 S-02 경로에서 다시 받는다
  - DS-02를 폴링 이벤트 출처로 설계하지 말 것. 개발계정 1,000건은 입항 건 스냅샷용
  - 05의 S1 도달 불가 문제(Q-22)는 일부러 고치지 않았다. T-007/T-009에서 처리

## 2026-09-10 · (사용자 지시) git 초기화 · Claude Code (claude-opus-5)
- 상태: 완료 (원격 푸시는 사람 작업 대기)
- 한 일:
  - 커밋 전 민감정보 점검: md 문서(키·토큰·이메일 패턴 없음), 원본 기획서 DOCX(본문이 PDF와 동일, 메타데이터 작성자 `python-docx`), PDF(작성자 `python-docx`, 생성기 LibreOffice) → 개인정보·비밀정보 없음
  - `git init -b main`, 로컬 user.name/user.email 설정(저장소 로컬 한정), `.gitignore` 추가, 첫 커밋
- 변경 파일: `.gitignore`(신규), `docs/tasks/QUEUE.md`(T-003에서 git init 항목 완료 표시), `docs/tasks/LOG.md`
- 검증: `git status`, `git log`로 커밋 작성자 확인
- 남은 일 / 다음 한 걸음:
  - 사람: GitHub에 private 저장소 생성 → remote 연결 → 해당 계정으로 인증 후 push
- 큐 변경: 없음 (T-003 범위 일부 선행)
- 주의사항: 이 PC의 Git Credential Manager에는 다른 GitHub 계정이 저장돼 있다. remote URL에 사용자명을 넣어(`https://<user>@github.com/...`) 계정을 구분할 것.

## 2026-09-10 · T-000 · Claude Code (claude-opus-5)
- 상태: 완료
- 한 일:
  - 원본 기획서 `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf`(13쪽)를 읽고 문서 체계 초안을 만듦
  - 공공데이터포털·웹에서 공공 API 확인
    - `관세청_화물통관진행정보`(15126268): 존재, XML, 개발 자동승인/운영 심의승인, UNI-PASS 가입 필요, 3년 이내 조회
    - 기획서의 해수부 링크(dataset/15011649)는 404. `해양수산부_외항화물컨테이너정보`(15131742)를 대체 후보로 찾음(필드: 항만명, 입항년도, 호출부호, 선박명, 적하목록관리번호, BL번호, MSN, 입출항일시, 반출입구분, 컨테이너번호·규격·사이즈)
    - UNI-PASS 엔드포인트·파라미터·응답 태그는 2차 출처(블로그)에서만 확인 → `[TO VERIFY]`
  - 기획서 내부 불일치 기록: 34대 vs 37대(Q-01), ₩18,720,000 vs ₩18,420,000(Q-02), RequiredHandlingBuffer 누락(Q-06)
  - 기획서에 없던 설계를 제안(ADR Proposed): 상태 = 마일스톤 유도 + 예외 오버레이, 최적화 2단계 분해, 위험 등급 기준, Baseline 정의, 적응형 폴링, Watchlist 온보딩
- 변경 파일: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/01_project-rules.md` ~ `docs/10_open-questions.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md` (모두 신규)
- 검증: 문서 간 교차 참조(태스크 ID, ADR 번호, 질문 ID)를 수동 확인. 코드 없음.
- 남은 일 / 다음 한 걸음:
  - 사람: T-001(검토·ADR 승인), T-002(API 키)
  - 에이전트: T-004(공식 명세·필드 사전) 또는 T-017(인터뷰 가이드)
- 큐 변경: T-001~T-008, T-017, T-029를 큐에 등록. T-000 DONE.
- 주의사항: 모든 문서가 Draft다. 사람 승인 전에는 ADR Proposed 내용을 확정 사실처럼 코드에 굳히지 말 것. 원본 기획서 PDF/DOCX는 루트에 그대로 있음(이동 여부 Q-16). DOCX는 PDF와 같은 내용으로 보고 따로 열어보지 않음.
