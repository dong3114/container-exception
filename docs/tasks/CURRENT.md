# CERA Current Task

> 지금 진행 중인 작업 **하나**의 인수인계 문서다. Claude와 Codex 중 누가 이어받든 이 파일에서 시작한다.
> 예정 작업은 `QUEUE.md`, 끝난 작업은 `LOG.md`에 있다. 사용법: `docs/17_ai-development-workflow.md` 5·6절.
> 대화 내용을 옮겨 적지 않는다. 결정된 것, 진행 상태, blocker, 다음 한 걸음만 남긴다.

상태 값: `IDLE` · `DESIGNING` · `PLANNING` · `AWAITING_APPROVAL` · `IMPLEMENTING` · `REVIEWING` · `DOC_SYNC` · `COMMIT_READY`

---

## Status

**IMPLEMENTING — T-112 Cost / Risk Engine → T-113 Recovery Solver (2026-10-26 사용자 지시 · 남은 개발 약 2일)** · Orchestrator: Claude Code. **T-111 DONE**(커밋 · push). Truth Layer = MVP 안정 checkpoint.

### 진행 원칙 (사용자 지시 2026-10-26)
- 모델 작업 · 후순위 작업 중단(상용 benchmark · 파인튜닝 · 프롬프트 튜닝 · Redis · Multi-Agent · 대규모 리팩터 · T-098 · Gmail · 대시보드). MVP 모델 Qwen3-4B 그대로
- 목표: 30대 시나리오(부산항 수입 FCL)를 실제 계산으로 관통 — 비용 · 위험 결정론 엔진 → Solver → 제안 계획 → 사실 변경 시 재계산
- 숫자는 결정론 엔진에서만 · 기존 시나리오 결과(v1 · v2 숫자)는 참고 · 회귀 비교로만 · Cost/Solver 는 검토 전 커밋하지 않음

### 진행: Agent Runtime · 모델 호출 제한 = "관측 후 줄이기"

- 원칙(사용자 지시): 운영 데이터가 없으므로 정상 실행을 막는 낮은 제한을 추측해 두지 않는다. 폭주(무한 loop · retry · HTTP 대기 · 생성)만 막는 넉넉한 비상 상한 `[ASSUMPTION / DEVELOPMENT SAFETY CEILING]` 을 두고, 분포(p50 · p90 · p95 · p99 · max)를 보고 줄인다. 사람 · 외부 대기(WAITING_*)는 실행 시간 제한 대상이 아니다.
- 결과: 비상 상한(단계 100 · Tool 50 · 재시도 3 · 그래프 구동 900초 · 모델 300초 · 상용 120초 · Backend→AI 330초 · 공공 30초) · 상한 코드 분리(`RETRY_LIMIT_REACHED` · `MODEL_TIMEOUT` 추가) · `npm run runtime:stats` · AI Server 추론 로그 · 평가 지연 p90/p99/max · 빈 `CERA_AI_REPLAY_DIR` 결함 수정. 정본 `docs/24` 18.15.
- **다음 한 걸음**: T-111 Truth Lifecycle Hardening.

### T-099 — 연속 모델 평가 (MODEL_EVAL_CONTINUOUS · 2026-10-26)

- **현재 임시 모델**: Qwen3-4B-Instruct-2507 Q4_K_M(llama.cpp, OpenAI 호환, 로컬 Docker `llm` 프로필). 이유: API 비용 0 · 현재 하드웨어에서 동작 · 교체 가능 · 결정론 검증이 보호. **최종 Production 선정: Deferred.** 설정 위치 `ai/.env.example`(provider · model) · `infra/local/.env.example`(`CERA_LLM_HF`).
- 모델의 역할은 후보 제시뿐이다(값 후보 · 정규화 값 · 정확한 인용 · 모호성). 사실 확정 · 승인 · 발송 · 권한 판정 · 계획 확정은 못 한다. 틀린 값(예: `"Yeah"`)은 장애가 아니라 후보 거절이다.
- 상용 fallback(Local → 검증 실패 / 모호 → 상용 → 사람)은 구현하지 않는다. 공급자 추상화는 유지한다.
- 파인튜닝 안 함(141건 중 Human Gold 없음). 나중 학습 데이터로 재구성할 수 있는 고리만 남겼다(`docs/24` 18.14 F-13).

### T-099 추가 작업 (2026-10-26 · 사용자 승인 · 체크포인트 커밋 2개)

**T-099 는 계속 IN_PROGRESS.** 이번 체크포인트의 완료사항 2가지: ① CERA 전체 Docker 실행 경로 ② Eval Validator ↔ Production Validator drift 방지.

- **Docker 전체 실행**(정본 `infra/README.md`): profile `app`(migrate · api · worker · ai) · `web`(nginx 정적) · `llm`(llama.cpp) · `eval`, `compose.gpu.yaml`. 호스트 `npm run dev` · Vite HMR 개발은 그대로(Docker 가 유일한 방식 아님). 이미지 3개: `back` · `ai`(빌드 맥락 = 저장소 루트 — Agent Runtime 이 `packages/contracts` 를 읽는다) · `front/web`(맥락 = 루트)
- **Docker 안에서 확인한 범위(구분)**: ① 업무 API 체인(초안 → 승인 → 발송 → Mock 회신 → 추출 → 후보 PASSED) ② **T-105 Agent 그래프 전체**: Agent Run → 공백 → 문의 → `WAITING_HUMAN` → 승인 → 발송 요청 → `WAITING_EXTERNAL` → Mock 회신 → 추출 → 재평가 → `COMPLETED`(노드 16 · Tool 7종 · 실패 Tool 0). 이 E2E 로 **`ai` 이미지에 Tool 계약 파일이 빠져 Agent 모드가 기동하지 않던 결함**을 찾아 고쳤다. 로컬 공급자 Qwen3-4B 의 추출은 `"Yeah"` 를 수량으로 내 Backend 검증기가 `BAD_QUANTITY` 로 거부했다(`NO_VALID_CANDIDATE`) — 모델 튜닝은 하지 않았다. 첫 추출은 모델 콜드 스타트로 `EXTRACTION_TIMEOUT`(20초 제한) 후 재시도됐다. 두 번째 Run 은 시드 데이터의 다른 공백에서 `NO_ELIGIBLE_CONTACT`(인프라 문제 아님)
- **Validator conformance(방식 B 유지)**: 정본 = Backend TypeScript 검증기. 392건 · 판정 대상 답 563(합격 307 · 불합격 256)에서 Python 포팅이 완전 일치. 수정 전 포팅은 30건 차이 · pass/fail 반전 1건. TS 검증기 변경 → `npm run validator-conformance:emit` 안 하면 Backend 시험 실패, 포팅 불일치 → Python 시험 실패. 흐름은 `packages/README.md`. Node/Backend 를 평가 컨테이너에 넣는 방식 A 는 택하지 않았다
- **로컬 모델 판정**(20건만으로 순위 확정 안 함, `ai/evals/runs/2026-10-26-local-ladder/README.md`): 0.5B = 연결 smoke 전용 · 1.5B = 제외(no-answer 환각) · 3B = 연구 기준선만(Qwen Research License) · **Qwen3-4B-Instruct-2507 = Local candidate 유지** · 7B = 충분한 GPU 에서 재평가. 모델 출처 `ai/evals/local-models.json`(저장소 · revision · 파일 해시 · 라이선스; Qwen3-4B 는 **unsloth 제3자 GGUF 변환**, 파일 sha256 직접 확인)
- **GPU**: Docker Desktop GPU 전달 + CUDA 이미지 동작 확인(GTX 1650/Turing, p50 4182 → 1268ms). **GTX 1080(Pascal)은 미확인 `[TO VERIFY]`**
- **run artifact 정책**: `ai/evals/runs/` 의 `smoke-*` · `ladder-*` 최상위는 gitignore(재생성 가능). 선정 근거 요약만 날짜 폴더(report · metrics · run)에 커밋. 기존 `2026-10-22-baselines` 는 그대로
- **유지보수 후보(직접 대조한 것만)**: QUEUE T-108(os.environ) · T-109(큰 파일) · T-110(모듈 순환 · CI · ai lockfile). Validator drift 는 해결되어 별도 Task 없음. 큐잉 보강: T-110 은 "GitHub CI 가 conformance · contract · 시험을 자동 실행"하는 목적
- **환경 파일**: `back/.env` DB 비밀번호를 `infra/local/.env` 에 맞춤 · 빠진 키 추가 · `ai/.env` 생성 · `CERA_AGENT_TOOL_TOKEN` 로컬 값(양쪽 동일). 상용 비밀번호는 사용자가 나중에 직접
- **주의(Windows)**: Git Bash 는 컨테이너 경로 인자(`/srv/...`)를 `C:/Program Files/Git/...` 로 바꾼다 · curl 에 한글을 인자로 직접 주면 깨진다(`--data-binary @파일` 사용)

**T-099 완료된 것**: 평가 인프라 · 141건 데이터셋 · AI 교차 검토 · HF Decision 기준선 · LocalProvider · Docker 모델 서빙 · 로컬 생성 모델 사다리 · Validator conformance · 전체 Docker 런타임.
**(옛) T-099 남은 것 — 연속 평가로 전환되어 보류**: OpenAI · Gemini live 평가(필요하면 Anthropic) · Jev live 평가 · 상용 vs 로컬 비교 · 추출 공급자/모델 선정 · Decision 공급자/모델 선정 · Live LLM Agent E2E · ADR-037 Accepted. 평가 순서 5건 → 20건 → 비용 확인 → AGREED 전체. 로컬은 Qwen3-4B 만 비교 후보로 유지(1.5B · 3B 전체 실행 안 함, 7B 는 GPU 환경 전까지 전체 실행 안 함)
**다음 한 걸음**: `ai/.env` 의 `OPENAI_API_KEY` · `GEMINI_API_KEY`(필요하면 `ANTHROPIC_API_KEY` · Jev 는 `OPENROUTER_API_KEY`)가 준비되면 상용 모델 평가

### T-099 진행 (2026-10-22)

- **Blocker — API 키 없음**: `ai/.env` 파일이 없고 셸 환경 · `back/.env` 에도 `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` · `GEMINI_API_KEY` · `OPENROUTER_API_KEY` 가 없다 → 실제 공급자 호출 0건. 사용자에게 필요 키 · 발급처 · 예상 상한(약 $15, 상한 $20)을 한 번 알렸다
- **Gold**: 루브릭 README 작성 · 정답을 보지 않은 두 번째 라벨링(별도 컨텍스트) → `review/blind-agreement.json`: AGREED 119 · CONTESTED 22(실제 차이 4건 = 답 유형 3 · 확정성 3 · 검토 필요 1, 나머지 18 = 두 번째 라벨러의 '불확실' 표시). 추출 값 · 근거는 전부 일치. 사람 검토표 `review/gold-review.csv`(CONTESTED 먼저, `reviewer_decision` 칸). 주 지표 = AGREED — **two-model-agreed(AI 교차 검토)이지 Human Gold · Verified Gold 가 아니다.** 사람이 `gold-review.csv` 에 OK · FIX · UNSURE 를 적으면 human-reviewed 등급이 따로 생긴다
- **평가 코드 보강**(기존 유지 · 최소 수정): Gold 등급별 지표 · pipeline 점수(Backend 검증 통과분) · 범주별 요약 · run 메타(eval_version · contract_version · case_ids · gold_tiers) · `gold-agreement` · `gold-sheet` 명령 · 가격표 10-22 재확인 · `eval` extra(SDK 3종)
- **공식 문서 조사(10-22)**: ADR-037(Proposed) 후보 목록 — 모델명 변경점: Jev 1.14 · Gemini 4 Argon · 3.5 Flash-Lite · Gemini 3.8 Flash 2027 가격 인상 · Sonnet 5.5 포함
- **HF 기준선 결과(Docker CPU, 141건 실행 · 주 지표는 AGREED 119)**: **일부 분류력은 있지만 보정(calibration)과 높은 확신 오답이 Production 기준에 못 미친다 → Production Decision Provider 로 부적합.**
  - 기저율보다 나은 점: 조건부 F1 0.33(둘 다, 기저율 0.00) · 검토필요 F1 — `mDeBERTa` 0.52(기저율 0.00) · 파생 검토 AUROC 0.73~0.74(전체 141건)
  - 기준 미달: 검토필요 Brier — `bge-m3` 0.28 · `mDeBERTa` 0.47(기저율 0.23) · 검토필요 ECE 0.23 · 0.50 · 확신 오답(≥0.9, 141건) 18 · 36건 · 확정성(FIRM/CONDITIONAL) 정확도 0.33 · 0.47(141건) — 확신 값이 실제 정답률을 나타내지 못한다
  - `bge-m3-zeroshot-v2.0-c`(MIT · 상업 친화 데이터) = 무료 로컬 참고 기준선으로만 유지. `mDeBERTa`(학습 데이터에 비상업 ANLI) = 연구 비교용만
  - 결과 `ai/evals/runs/2026-10-22-baselines/`(합성 데이터 · 비밀값 없음). Windows 애플리케이션 제어 차단은 우회하지 않고 Docker(Linux CPU) 사용
- **다음 한 걸음**: 키가 생기면 scratchpad `t099-live-plan.sh smoke` → `sample` → 비용 확인 → 전체(AGREED) → Decision(Jev · LLM judge) → 상위 모델로 Agent Runtime live-LLM E2E → ADR-037 선정 채우기

### T-105 인계 (2026-10-22 · DONE)

- 사용자 승인. 한 그래프에서 공공데이터(LIVE) → 공백 → 초안 → 승인 → 발송 요청 → Worker 발송 → 회신 대기 → 회신 · 추출 → 재평가 → 결과. 시험 Backend 329 · Python 56 · Front 42. 기록 `docs/24` 18.12. 후속 T-108(P2)

### T-104 인계 (2026-10-22 · DONE)

- 사용자 승인 + durability 보강: 재조정(`AgentReconciler` · Worker · 기동/주기) · `wake-rules.ts` · `WAITING_RUNTIME`(일시 장애 = 연결 실패 · 시간 초과 · 5xx → 2배 backoff, 최대 3회 → FAILED) · Python 은 같은 실행 시작을 다시 받으면 checkpoint 에서 이어 감 · Backend 저장 통로 장애 = 503 · crash window 시험. 기록 `docs/24` 18.11 R-3a · R-3b · R-5a · R-5b
- 시험: Backend 328 · Python 53 · Front 39 · typecheck · build · lint · `drizzle-kit check`

### T-103 인계 (2026-10-22 · DONE)

- **한 일**: `back/src/agent-tools/`(Registry 9 · zod 계약 · 실행기 · 서비스 인증 · 실행 범위 · 기존 서비스만 호출) · `/internal/agent-tools/*`(Agent 전용) · `/agent-runs/*`(사람이 시작 · 취소 · Runtime 연결 확인) · M16(`agent_run` · `agent_tool_call`) · M17(행위자 · 전이 · 열 가드 · GRANT) · `DraftService` 에 Agent 용 옵션(승인 대기에 올리지 않음) + `requestApproval`(승인 직전 검사 재사용, 승인 아님) · `PublicDataService.*As(actorId)` · 계약 파일 `packages/contracts/agent-tools/agent-tools.v1.json`(`npm run agent-tools:emit`) · Python `ai/cera_ai/tools/`(계약 기반 Registry · 작은 스키마 검사기 · 타입 있는 Client) · 시드 AI_AGENT 행위자
- **시험**: Backend **311**(unit 130 · db 181) · Python **39** · Front 39 · typecheck · build · `drizzle-kit check` · OpenAPI · 계약 파일 최신. **실제 경로 확인**: Python Client → NestJS Tool API → 실제 data.go.kr(LIVE) — 공공 원장에 행위자 AI_AGENT 로 남음
- **T-102 live 검증**(같은 세션): DS-03 · DS-02 실제 응답 확인 — 차이 2곳 최소 수정(`*` 비표준 계선 시설 코드 · 신청구분 최초 · 변경 · 최종). field-dictionary 9절 · Q-18 CLOSED
- **주의 — 로컬 `back/.env`**: 13:17 에 예시 내용으로 바뀌어 **DB 비밀번호가 `infra/local/.env` 와 다르다**(DB 연결 실패 28P01). 비밀 파일이라 고치지 않았다 — 시험 · 실행은 이번 세션에서 연결 문자열을 환경변수로 넘겨 돌렸다. 사용자가 `back/.env` 4줄(`DATABASE_URL` · `MIGRATION_DATABASE_URL` · `TEST_DATABASE_URL` · `TEST_OWNER_DATABASE_URL`)의 비밀번호를 `infra/local/.env` 의 `CERA_APP_PASSWORD` · `CERA_OWNER_PASSWORD` 와 맞춰야 한다
- **남은 판단(사용자 검토)**: Agent 초안의 숫자는 아직 계획 엔진에서 오지 않는다(사람 승인이 마지막 문) · 정보 공백 규칙 `gap-rules/0`(계획 날짜 · 창고/ODCY 수용량 · 협력 차량) · Tool 시간 제한 값 · 큰 적하목록(1,227행)은 페이지 상한 20 에 걸린다
- **다음 한 걸음**: T-104 LangGraph Runtime(사용자 지시 2026-10-22 — StateGraph · interrupt · resume · Backend 경유 checkpoint · Python 재시작 뒤 재개)

(이전) **T-102** · 2026-10-22.

### Task: T-102 DS-03 + DS-02 Public Data Adapter

- **Goal**: 부산 실제 입항 건(DS-03)과 그 입항 건의 B/L ↔ 컨테이너 목록(DS-02)을 Backend 가 받아 원문 · 출처와 함께 저장하고, CERA 개체 · 사건(PUBLIC_API)으로 정규화한다.
- **Why**: 100% Mock 시나리오를 벗어나 REAL 공공 + SYNTHETIC 사설 데이터로 개발한다(사용자 2026-10-22). 이 capability 를 T-103 에서 첫 External Read Tool 로 감싼다.
- **Scope**: `back/src/public-data/`(어댑터 · XML 파싱 · 정규화 · provenance · 서비스 · 개발 API) · M14(엔티티 5표 + 호출 원장) · M15(가드 · 권한) · replay fixture(합성) · 시험 · `docs/22` rev.2.6 · `docs/24` 22.30~ · 필드 사전 정정. `DATA_GO_KR_SERVICE_KEY` 가 있으면 실제 호출.
- **Out of Scope**: LangGraph · Tool Registry · Tool SDK(T-103~) · DS-01 UNI-PASS(T-106) · Reconciliation/현재 사실(T-093) · Demo Scenario v2(T-107) · 화면.
- **Existing Decisions**: ADR-036(Agent 는 공공 API 직접 호출 금지 — LangGraph → Backend Tool → Public Data Service → Adapter → data.go.kr) · ADR-033/034(NestJS · PostgreSQL · 검토 migration, M01~M13 수정 금지) · 규칙 5(실제 키 · B/L · 컨테이너 번호 커밋 금지, fixture 는 마스킹 · 합성) · 규칙 9(replay = 시뮬레이션) · `vessel_call` P0 승격(사용자 2026-10-22).
- **Completion Criteria**: 원문 바이트 보존 + 지문 · 요청 시각 · 수신 시각 · 안전한 조회 조건 · 원문 참조가 재현 가능 · 인증키가 DB · 원문 메타 · 로그에 없음(시험) · replay 로 전체 흐름 시험 · 반복 조회 시 개체 중복 없음 · Backend 전체 시험 · typecheck · `drizzle-kit check` · OpenAPI 최신.
- **진행(2026-10-22)**: **구현 · 검증 끝 — 사용자 검토 대기(커밋 전).** M14(6표) · M15(가드 · GRANT) · `back/src/public-data/` · 개발 API 6개 · 합성 replay fixture(`data/fixtures/public-data/`) · `docs/22` rev.2.6 · `docs/24` 22.30~22.35 · 18.9 · 필드 사전 정정(S-09 · S-10). 시험: Backend **292**(+20) · Front 39 · typecheck · build · `drizzle-kit check` · OpenAPI 최신 · 개발 DB migrate + 실제 API 서버 replay 확인.
- **실제 호출 0건** — `back/.env` 에 `DATA_GO_KR_SERVICE_KEY` 없음. 키가 생기면: `CERA_PUBLIC_DATA_MODE=live` 로 API 를 띄우고 `POST /public-data/vessel-calls/fetch {"from":"<어제>","to":"<오늘>"}` → 입항 건 하나 골라 `/manifest/fetch`. 원문은 `data/raw/content/`(gitignore)
- **남은 판단(사용자 검토)**: `bl` 유일 잠정안(L-16) · `container.vessel_call_id` = 처음 입항 건(재입항은 사건만) · 결과 코드 03 = 데이터 없음 `[ASSUMPTION]` · 입항 신고 일시를 `ARRIVED` 로 부르는 것(실제 접안 확인 전, 신뢰도 MEDIUM · `basis` 기록)
- **다음 한 걸음**: 사용자 보고 → 승인 시 T-102 커밋(명시 staging) → T-103(Tool Layer, migration 은 M16 부터)

---

(이전) ### T-099 인계 (2026-10-12)

- 원칙(사용자 지시): 모델 평가가 목적 — AI 권한 추가 없음 · Backend · DB · 화면 변경 없음 · Generative(값 + 원문 근거)와 Decision(의미 판단)을 분리 · 임계값은 결과를 보고 정하고 이번에 확정하지 않음 · LangChain · Agent framework · RAG 금지
- **한 일 (`5ba83ab` 에 커밋됨, 모두 `ai/` 안)**:
  - 평가셋 `ai/evals/datasets/cera-reply-eval-v1/` — `source.py`(사람이 고치는 원본, 루브릭 일관성 검사 포함) → `cases.jsonl`(생성, 141건 · A~N 14범주 · ko 128 / en 9 / mixed 4 · 정답 추출값 138 · 검토 필요 59). 정답은 Orchestrator 가 루브릭으로 작성 — 모델 출력에서 가져오지 않았다. **전부 `DRAFT_NEEDS_HUMAN_REVIEW`**(Claude 계열이 후보이므로 사람 검토 필요). **README.md(루브릭 R1~R6 설명)는 아직 안 씀**
  - 생성형 어댑터 `ai/cera_ai/llm_adapters.py`(Anthropic `output_config.format` · OpenAI Responses `json_schema` strict · Gemini `response_json_schema`, SDK 지연 import, 키는 환경변수만). `providers.py` 의 live 모드는 `CERA_LLM_PROVIDER` + `CERA_LLM_MODEL` 둘 다 있을 때만 어댑터 사용(기본 replay 그대로)
  - Decision `ai/cera_ai/decision.py` — 질문 4개(answer_type · commitment · answers_question · needs_human_review) · Jev(OpenRouter `POST /api/alpha/decisions`, `typesafe/jev-1.13`) · LLM 판정 · HF NLI · 기저율 · 녹화 재생
  - 실행기 `ai/cera_ai/evals/`(`python -m cera_ai.evals validate|estimate|extract|decide|rescore|report`) — 실행 결과는 `ai/evals/runs/<id>/`(run.json · outputs.jsonl · metrics.json · per_case.csv). Backend 검증기 Python 포팅으로 "맞은 값을 Backend 가 통과시키는가"도 측정. 가격표 `evals/pricing.py`(공식 페이지 2026-10-12 확인)
  - `ai/.env.example`(변수명만) · 평가 CLI 는 `ai/.env`(gitignore) 를 읽는다 · 시험 `ai/tests/test_evals.py` → **pytest 26 통과**(7 + 19). 이 PC 에서 pytest 는 `--basetemp <scratch>` 필요(Temp 권한)
- **실제 호출: 0건.** 환경에 키 없음(ANTHROPIC · OPENAI · GEMINI · OPENROUTER 모두 unset)
- **Blocker**: ① 키 — 사용자가 `ai/.env` 를 채워야 한다(대화창에 붙이지 않음). 키 질문 · 비용 상한 질문에 사용자가 "먼저 확인하고 싶다"고 해서 답을 받지 못했다 — 다음 세션에서 사용자가 무엇을 확인하려 했는지부터 묻는다 ② HF NLI — 모델(`MoritzLaurer/bge-m3-zeroshot-v2.0-c`) 다운로드는 됐으나 Windows 애플리케이션 제어 정책이 scipy DLL(`_vode`)을 차단해 실행 불가(우회하지 않음)
- 조사 결과(공식 문서, 2026-10-12): 후보 쌍 Anthropic `claude-opus-5-5`($4/$20) ↔ `claude-haiku-5-5`($0.10/$0.50) · OpenAI `gpt-6.1-sol`($2/$10) ↔ `gpt-6-luna`($0.10/$0.50) · Gemini `gemini-3.8-flash`($0.75/$3.75) ↔ `gemini-3.1-flash-lite`($0.25/$1.50) · Jev 입력 $0.042/1M · 출력 무료(2차 출처 — `[TO VERIFY]`), 독점 모델(가중치 비공개). HF 상용 후보 `bge-m3-zeroshot-v2.0-c`(MIT · 상업 친화 데이터 · 다국어) · 연구용만 `mDeBERTa-v3-base-xnli-multilingual-nli-2mil7`(MIT 표기지만 XNLI · ANLI 비상업 데이터 학습). 141건 추정 비용: 저가 모델 ~$0.1~0.4 · 강한 모델 ~$2~4 · Jev ~$0.02
- 이미 보인 발견(후속 Task 후보, 아직 큐 미등록): 계약 `reply-extract/1` 에 답의 **날짜 칸이 없다**(다른 날짜 값 I05 · I08 · I11 을 표현 못 함) · Backend 검증기가 `after 3 PM` · `오후 세 시` · `15~17시`의 시작 · `3시`(오전/오후 없음)를 VALUE_NOT_IN_QUOTE 로 거른다
- **다음 한 걸음**: ① 사용자 확인 사항 듣기 → 키 · 비용 상한 확정 ② 모델마다 5건 표본 → 전체 141건 ③ Decision(Jev · LLM 판정, HF 는 실행 환경 결정 후) ④ `report` 로 비교표 · 데이터셋 README · `ai/README.md` 갱신 · 공급자 선택 ADR(Proposed) ⑤ 사용자에게 보고(staging 0 · commit 없음). **최종 보고 형식은 사용자 지시 21절(1~20 항목 + 마지막 줄 `CERA T-099 MODEL EVAL REVIEW READY`)**
- 건드리지 않음: `data/Proposal/` · `scripts/` · T-098

---

(이전 상태) T-092 경과는 `LOG.md` 맨 위, 구현 메모는 `docs/24` 18.8(U7-1~7), AI Server 는 `ai/README.md`.

- **순서(사용자 결정 2026-10-07)**: T-099 공급자 검증(평가셋으로 값 · 근거 정확도 · 범위 위반 · 스키마 실패 · 조건부 표현 · 지연 · 비용 비교 — 감으로 고르지 않는다) → T-093(사건 · PROVISIONAL) → … · T-098(역할별 실제 화면 · 인증)은 큐에 유지
- **실제 LLM 은 아직 호출하지 않았다**(공급자 미정, ADR-033). 지금 AI Server 는 녹화 재생(`CERA_LLM_MODE=replay`)
- **다음 세션 시작 순서**: ① Docker Desktop 켜기 ② `docker compose -f infra/local/compose.yaml --env-file infra/local/.env up -d --wait` ③ `cd back && npm test`(266) · `cd ai && python -m pytest -q`(7) · `cd front/web && npm test`(39) ④ T-099 Brief
- **마지막 migration: M13**(T-091 · T-092 DB 변경 없음). 다음 DB 변경은 그때의 다음 번호
- 기술 부채(blocker 아님): `X-CERA-Actor-Id` 임시 인증 · kill switch 실행 중 전환 없음 · `DELIVERY_FAILED` 수동 재시도 없음 · 장시간 채널 호출 + 다중 Worker 화해 대기 위험 · 보류 회신 수동 연결 없음 · 수신 워터마크 미저장 · 원문 읽기 MOCK 형식만 · 답 칸 이름 정식 위치(U7-7) · 재추출 명령 없음
- 로컬 실행: API(`npm run dev:api`) · Worker(`npm run dev:worker` — 발송 · 수신 · 추출) · AI Server(`ai` 에서 `python -m cera_ai`) · 화면(`front/web` `npm run dev`) · Mock 회신(`back` `npm run mock:reply -- --reply-to <id> --body "..."`, 녹화가 있는 문장이면 AI 제안이 나온다 — `ai/fixtures/replay/`)
- 계약 갱신 순서: `back` `npm run openapi:emit` → `front/web` `npm run openapi:types` · AI 계약은 `ai` 에서 `python -m cera_ai.emit_schema` → 모두 커밋
- 서버를 끈 뒤 node 자식 프로세스가 3100/3000 을 잡고 남을 수 있다 — 확인 전 포트를 본다

## 커밋하지 않은 working tree (T-086 커밋 밖 — 각자 따로 정리)

| 무엇 | 파일 | 상태 |
| --- | --- | --- |
| (해소) 제안서 | `data/Proposal/` · `scripts/` | `e8695a0`(2026-10-14) 로 커밋됨 — 문구의 "Next.js 관제탑 UI" 는 남아 있음 |

**프론트 정리(2026-10-06, 사용자 직접 지시 — Task ID 없음)는 커밋 3개로 끝났다**: ① CSR 전환(ADR-035 · 정본 5곳 Next.js 표기 동기화) ② 기존 Antigravity 디자인 변경(09-17 작업, 그대로) ③ Backend 연결 준비(`docs/16` 4.1 — API base · `ApiError` · `AsyncState` · `GateBlockers` · `MessageLifecycle` · `CandidateBadge` · 데이터 출처 표시 · ②가 지운 시뮬레이션 표시 복구 · vitest 15 · `docs/23` 7.1 배포 원칙). 해시는 `LOG.md` 맨 위

## 다른 PC 로 옮길 때 (origin 클론 + gitignore 파일 따로)

**origin = `github.com/dong3114/container-exception`(2026-10-14 첫 push).** 코드는 클론으로 옮기고, gitignore 된 파일(`back/.env` · `infra/local/.env` · `ai/.env` · `data/raw/`)은 따로 옮긴다. git author 설정은 클론에 따라오지 않는다. 아래는 옛 Drive 복사 방식 메모다. `node_modules`(back · front/web)와 `back/dist` 는 복사하지 않고 새 PC 에서 `npm install` · `npm run build`. `back/.env` · `infra/local/.env`(gitignore)와 `.git/` 은 **반드시 함께 복사**(author `dong3114` 설정이 `.git` 안에 있다). Docker 볼륨은 따라가지 않는다 — 새 PC 에서 `up -d --wait` → `cd back && npm run db:migrate && npm run db:seed`. 미커밋 작업(`data/Proposal/` · `scripts/`)은 폴더째 복사하면 따라간다. 준비물: Node ≥ 22.12 · Docker Desktop · 포트 55442.

## 지금 확정된 상태

| 항목 | 상태 |
| --- | --- |
| 개념 데이터 모델 `docs/21` | **승인·동결** (T-076). T-081 에서도 변경 0건 |
| 논리 DB 설계 `docs/22` + 작업표 | **rev.2.5** (T-080 검토로 발송 시도·한 번 채움·INBOUND 정리. 그 전 rev.2.4 = Q-44·Q-45). **MVP 52 · Next 1 · MVP 에서 만들지 않음 2 = 55**(변화 없음) · 작업표 블록 53 · **컬럼 587** · 흐름 검증 **64개 PASS** |
| Event·State 정합성 | `docs/05` 4.2 ↔ `docs/22` 대응 **누락 0건**(`docs/22` 23.1). ADR-020 상태 차원 복구. `docs/05` 머리의 "결정 대기" 해소 |
| 출처 어휘 | **`source_type` 7값 · `source_role` · `extraction_method` 3축**(사용자 결정 C). **Q-46 은 OPEN** |
| 런타임·오류 처리·관측성 `docs/23` | 정본. ADR-030 **Proposed** · ADR-031 은 Desktop·Web First 부분만 Proposed(결정 1·2·8 은 ADR-033 이 대체) |
| Backend 언어 | **결정 — Main Backend = TypeScript + NestJS**(모듈형 모놀리스, API + Worker) · **AI Server = 별도 Python 런타임**(권한 없음, HTTP/JSON). **ADR-033 Accepted**, ADR-002 Superseded, Q-64 CLOSED |
| 물리 설계 `docs/24` | **승인 (T-080 DONE 2026-09-22)**. 논리 기준 `docs/22` rev.2.5 · P0 29표 · 349컬럼. **U1 구현 확인 18.2 (2026-10-02 · 최종 검토 2026-10-06 U1-11)** |
| 프론트엔드 | **Vite + React SPA, CSR 만 — ADR-035 Accepted (2026-10-06)**. 라우터 미선택. API base = `VITE_CERA_API_BASE`(개발 `/backend` 프록시). Backend 연결 경계 `docs/16` 4.1. 운영 데이터는 아직 MockProvider |
| DB · ORM · 마이그레이션 | **결정 — PostgreSQL + Drizzle ORM(SQL-aware Hybrid) + drizzle-kit 검토 SQL migration**, SQLite 미사용. **ADR-034 Accepted**, ADR-004 Superseded, Q-68 CLOSED (2026-09-22). 비교 기록 `plans/T-084-db-decision-options.md` |

## Baseline

| 항목 | 값 |
| --- | --- |
| branch | `main` |
| 최신 커밋 | `e8695a0`(제안서 문서, 2026-10-14) ← `5ba83ab`(T-099 WIP) ← `d5a3c8b`(T-092) |
| remote | `origin` = github.com/dong3114/container-exception · `main` 이 `origin/main` 과 같음(2026-10-22 확인) |
| working tree 의 다른 작업 | 위 "커밋하지 않은 working tree" 표 |
| last updated | 2026-10-22 (Git/remote 표기 정정 · T-100 설정 정리) |
| current orchestrator | Claude Code (claude-opus-5-5) — T-099 중단 상태에서 T-100 |

## 다음 한 걸음

1. ~~T-083 — Q-64~~ **DONE (NestJS + TypeScript, ADR-033)**
2. ~~T-084 — Q-68~~ **DONE (PostgreSQL + Drizzle ORM + drizzle-kit 검토 SQL migration, ADR-034)**
3. ~~T-080 — P0 29개 물리 설계~~ **DONE (`docs/24`, `docs/22` rev.2.5)**
4. ~~T-085 — U0 Backend 뼈대~~ **DONE (`back/` · `infra/local/`, `docs/24` 18.1)**
5. ~~T-086 — U1 영속 기반~~ **DONE (2026-10-06, 커밋)**
6. ~~T-087 — U2 등록부 · Contact Gate~~ **DONE (2026-10-06, 커밋)**
7. ~~T-088 — U3 초안 · 구조화 값 · 숫자 검사~~ **DONE (2026-10-06, 커밋)**
8. ~~T-089 — U4 승인 · 무효화~~ **DONE (2026-10-07, 커밋)**
9. ~~T-090 — U5 Outbox · Mock 발송~~ **DONE (2026-10-07, 커밋)**
10. ~~T-091 — U6 수신~~ **DONE (2026-10-07, 커밋)**
11. ~~T-092 — U7 추출~~ **DONE (2026-10-07, 커밋)**
12. **T-099 — 실제 AI 공급자 검증 + CERA 평가셋** ← 다음(아직 시작 안 함). 그 뒤 T-093 ~ T-096 (U8 ~ U11) · T-098(역할별 실제 화면)은 적절한 시점에. Q-65(솔버)는 어느 단계도 막지 않는다

## 다음 Orchestrator 가 먼저 알아야 할 것

- **Main Backend(NestJS)가 모든 권한을 갖고, Python AI Server 는 권한이 없다**(ADR-033). AI Server 는 DB·발송·사건·사실·승인을 하지 않고, 가진 외부 클라이언트는 LLM 공급자뿐이며, 출력은 후보다. `back/` 와 `ai/` 는 코드를 공유하지 않고 HTTP 계약으로만 만난다
- **`docs/22` rev.2.5 는 사용자 검토 결과(Q-69)로 고친 최소 변경이다** — 새 표·새 컬럼 0, `docs/21` 0. 22절 표·작업표는 scratchpad 생성기로 만들었고(저장소에 없음) 23절 대응 검사는 `docs/22` 작업표를 다시 읽어 349/349 를 확인했다
- **DB 는 PostgreSQL 하나다(ADR-034).** SQLite 로 개발하지 않는다. Drizzle 을 쓰지만 Full ORM 이 아니다 — Outbox · 멱등 · 부분 유일 · 잠금 · append-only · 핵심 트랜잭션은 PostgreSQL 의미를 드러내 쓰고, DB 가 지킬 수 있는 불변식을 앱 코드로만 흉내 내지 않는다. migration 은 drizzle-kit 생성 SQL 을 사람이 검토·커밋한 뒤에만 적용한다
- **부분 유일은 PostgreSQL 의 UNIQUE 제약 자체가 아니라 partial unique index 등으로 구현한다** — 실제 index SQL 은 T-080
- **T-084 비교 문서 4절(BIGINT = number, advisory lock + SKIP LOCKED 등)은 확정이 아니다.** T-080 에서 비교해 정한다
- **솔버(Q-65)는 NestJS 결정과 별개다.** TypeScript 로 강제하지 않고, PlanningSnapshot 계약 뒤에 나중에 붙인다
- **`docs/21` 7절이 Event 속성의 정본을 `docs/05` 4.2 로 위임**해 두었다. Event 필드를 바꿀 때는 `docs/22` 23.1 대응표를 함께 고친다
- **`ADR-017` 은 `Proposed`** 다. 사람 확인 사건의 근거는 승인된 `docs/21` 9절·12.2 와 `docs/20` A-17(근거 ADR-028 Accepted) · ADR-020 Accepted 다
- **확인 사건 하나 = 현재 사실 좌표 하나**(I-26). 여러 사실을 한 번에 확인하려면 확인 사건도 여러 건이다
- `decision_usability` 는 **저장하지만 원천이 아니다**(I-24). 과거 판정은 스냅샷의 네 차원 + `rule_version` + `policy_version` 으로 재현한다(I-27)
- **개수는 추측하지 말고 다시 센다.** 정본은 `docs/22` 2절, 작업표 `00_목록` 시트
- **T-082(P2)**: 시나리오 fixture 의 `event_type` 3개가 `docs/05` 4.4 카탈로그에 없다. 프론트 트랙과 조율 필요. 주 흐름을 막지 않는다
- **지난 계획 기준 회신**은 사건·현재 사실 후보가 되지만 현재 계획에 자동 반영되지 않는다 — 보장은 계획 불변 · 자동 재최적화 없음 · 스레드 안 질문 매핑이다. **범위(L-13)와 다른 축**이다(계획 4.3)
- **사건 생성을 사람이 승인하는 게이트는 없다.** 사람 확인은 잠정 사실을 확인·기각하는 단계다
- **메일 내용은 기록 행에 직접 넣지 않는다**(`docs/22` 29절 · 안티패턴 11). 원문·본문·인용·승인 문장·조건 원문은 참조 + 지문이다. 파기는 행을 지우거나 고치지 않는다
- **내용 부재 ≠ 파기.** 성공한 `CONTENT_PURGED` 감사가 있어야 정상 파기이고, 없으면 데이터 손실(`system_error`)이다(I-34)
- **재현성 ≠ 원문 재처리 능력.** 원문이 파기돼도 재계산·스냅샷 재현·감사는 된다. 안 되는 것은 원문에서 다시 추출하는 것뿐이다(`docs/20` A-05 는 "원문이 보관된 동안" 보장)

## 남은 OPEN 질문 (답하는 시점)

| # | 무엇 | 언제 |
| --- | --- | --- |
| Q-45 (기간) | 보관 범주별 **실제 보관 기간 숫자** · 연락처 익명화·법적 보관 의무 `[TO VERIFY]` | **Pilot 정책** (고객사 IT · 계약 · 보안·감사 · 법률 검토) |
| Q-44 후속 | Gmail `internalDate` 의 정확한 의미 `[TO VERIFY]` | Tech Validation |
| Q-46 | 상대방 직접 입력의 Source 모델(`actor_type` 신설 여부 포함) | 권한 모델과 함께 |
| Q-34 | `payload.change_reason` 값 목록 | T-037 · 인터뷰 |
| Q-65 | 솔버 실행 위치·언어 | T-036 재개 뒤. PlanningSnapshot 계약으로 붙인다 — Slice 1 blocker 아님 |
| Q-66 | `system_error` 오류 분류·코드 목록 | T-069 · 구현 |
| Q-67 | 로그 저장소·관측 제품 | 첫 배포 환경을 정할 때 |
| L-14 · L-15 · L-16 | 적용 범위 값·선택 정책 · `message_kind` 값 · `bl` 유일 제약 | 현업 검증 · 필요 시 · 실데이터 확인 |
