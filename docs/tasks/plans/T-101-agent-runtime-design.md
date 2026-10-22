# T-101 — CERA Agent Runtime 설계 (Draft, 사용자 승인 대기)

> 상태: **승인 (2026-10-22, 사용자)** — 짝 ADR: `docs/14` **ADR-036 (Accepted)**. 승인 때 정한 것: 2026-09-11 공공 API 실호출 금지 해제 · `vessel_call` P0 승격(T-102 에서 `docs/22` rev.2.6) · T-005/T-006 DEPRECATED · 작업 순서 13절. 이 문서의 표는 T-102 이후 구현에서 고칠 수 있다(정본 반영은 해당 Task 에서).
> 작성: Claude Code (claude-opus-5-5), 2026-10-22. 사용자 지시(2026-10-22): "Backend Authority 와 안전장치는 유지하면서 실제 Agentic Logistics System 으로. 대규모 구현 전에 설계 · 크로스체크부터."
> 원칙의 정본은 ADR-036 이다. Tool 목록 · 표 구조 · 시간 제한 같은 세부는 T-102 ~ T-105 구현에서 확정하고 그때 정본(`docs/07` · `docs/18` · `docs/23` · `docs/24`)으로 옮긴다.

---

## 0. 한 줄 요약

**두 개의 오케스트레이션을 나눈다.** NestJS 가 "무엇이 허용되고 무엇이 사실인가"(권한 · 상태 · 승인 · 발송)를 소유하고, Python + LangGraph 가 "다음에 무엇을 알아봐야 하는가"(정보 공백 · 조사 · 해석 · 판단 · 설명)를 추론한다. Agent 는 **Backend 가 열어 준 typed Tool 로만** 세상에 손을 댄다. 공공데이터도 Agent 가 직접 부르지 않고 Backend Adapter 를 거친다.

---

## 1. 지금 저장소 사실 (2026-10-22 확인)

| 항목 | 현재 |
| --- | --- |
| Backend | NestJS 12 · API + Worker · PostgreSQL · P0 29표 · migration M01~M13 · endpoint: registry 3 · communication 9 · planning 1 · health 2 |
| AI Server | FastAPI · `POST /v1/extractions/reply` 하나 · 회신 1건 = LLM 1회(녹화 재생) · **상태 없음 · Backend 만 부른다** |
| Agent 실행 | **없다.** 흐름은 NestJS Worker 의 결정론 단계(발송 · 수신 · 추출 호출) |
| 공공 API | 코드 없음. 명세 조사(T-004)만. **엔티티 표(`container` · `bl` · `container_bl` · `external_identifier`)는 논리 설계(`docs/22` 8절)에만 있고 물리 P0 에 없다.** `vessel_call` 은 Next(구조만) |
| 행위자 종류 | `ACTOR_TYPE = HUMAN · SYSTEM · AI_AGENT` — **`AI_AGENT` 가 이미 있다**(새 enum 불필요). 승인자는 활성 `HUMAN` 만(T-089) |
| 관측성 | `request_id` · `trace_id` 전파 규칙 · `system_error` · `audit_log`. OpenTelemetry 는 "지금 정하지 않음"(`docs/23` 207행) |

---

## 2. 기존 ADR 과의 관계 — 충돌과 호환

| ADR | 상태 | 내용 | 이 설계와 | 제안 |
| --- | --- | --- | --- | --- |
| **ADR-015** 역할 분리 + 결정론 오케스트레이터 | **Proposed** | 흐름은 핸들러 표로. "LLM 은 말단 함수, **도구를 주지 않는다**". LLM 플래너는 대안에서 기각 | **충돌.** Agent 가 다음 조사 대상 · Tool 을 고른다 | **부분 대체.** ① 업무 이벤트 → 다음 업무 단계 핸들러 표(NestJS)는 **유지** ② "도구를 주지 않는다" · "LLM 플래너 금지"는 **대체** — 단 *제한된 행위성*: 그래프 모양(노드 · 엣지)은 코드로 고정, LLM 은 정해진 분기점에서 열거된 선택지 중에서만 고른다, 단계 · Tool 호출 상한 ③ 루프 폭주 방지(디바운스 · 입력 해시)는 유지 |
| **ADR-029** 결정론 엔진은 `back/` | Accepted | `ai/` = LLM · 비정형만. Tariff · Cost · Risk · Solver 는 Backend, LLM import 금지 | **호환.** Agent 는 비용 · 위험 · 솔버를 *Tool 로 부를* 뿐 계산하지 않는다 | **유지.** 영역 정의 문구만 넓힌다: `ai/` = "LLM · 비정형 처리 **+ Agent 추론 런타임**". 결정 2·3 그대로 |
| **ADR-033** NestJS + Python AI Server | Accepted | 결정 3 "AI Server 가 가질 수 있는 외부 클라이언트는 **LLM 공급자뿐**" · 결정 4 "Backend → AI Server HTTP" | **충돌 2곳.** ① Agent 가 Backend Tool API 를 부른다(역방향 호출) ② 실행 상태(checkpoint)가 생긴다(지금 AI Server 는 무상태) | **결정 3·4 일부 개정**: 허용 클라이언트 = LLM 공급자 + **CERA Backend Tool API**(그 밖은 금지 — DB · 메일 · 공공 API 금지 유지). 결정 2(Backend 가 유일한 권한 주체) · 출력은 후보 · 장애 격리는 **그대로** |
| **ADR-034** PostgreSQL 단일 · AI Server DB 자격증명 없음 | Accepted | 결정 6 | **주의.** LangGraph Postgres checkpointer 를 쓰면 AI Server 가 DB 접속을 갖게 된다 | **유지.** checkpoint 는 Backend Tool API 로 저장(8절). AI Server 는 여전히 DB 자격증명이 없다 |
| ADR-017 · 026 · 027 · 028 | Proposed / Accepted | 사람 게이트 · Channel Adapter · 실제 발송 단계 · 계약 | **호환** | 유지. 승인 · 확인 · 발송은 계속 NestJS + 사람 |
| ADR-030 오류 · 관측성 | Proposed | 세 기록 분리 | **호환** | `agent_run` 계열 기록을 네 번째 축으로 추가(10절) |
| ADR-006 `as_of` 주입 | Accepted | 핵심 로직은 현재 시각을 직접 읽지 않는다 | **호환** | 실행마다 Backend 가 `as_of` 를 정해 그래프에 준다 |
| AGENTS.md 규칙 3 · 4 · 11 | — | 숫자는 결정론 · 발송은 승인 뒤 · LLM 출력은 후보 | **호환** | 변경 없음. 오히려 Tool 경계로 물리적으로 강제된다 |

**결론**: 뒤집는 것은 **ADR-015(Proposed)의 "LLM 에 도구 없음 · 플래너 금지"** 와 **ADR-033 결정 3·4 의 클라이언트 · 방향 제한** 두 곳이다. 권한 · 숫자 · 승인 · 발송 · DB 소유 원칙은 하나도 바뀌지 않는다.

---

## 3. 이전 A안에서 고칠 점

| 이전 A안 (지난 답변) | 문제 | 고침 |
| --- | --- | --- |
| LangGraph 를 회신 해석 등 *AI 작업 내부 파이프라인*으로만 | 사용자 목표("Recovery workflow 를 추론하는 Agent")보다 좁다 | Recovery 전체를 추론하는 `CeraRecoveryGraph` 하나 |
| L2 도구를 "AI Server 안의 읽기 전용 도구"로 둠 · 공공 API 조회를 AI 쪽 도구로 적음 | 공공데이터가 원문 보존 · 출처 · 감사 없이 Agent 로 들어온다 | **모든 Tool 은 Backend 에 있고**, Agent 는 Tool 계약만 안다. 공공 API 는 Backend Adapter |
| 그래프 상태 · checkpoint 를 언급하지 않음 | 승인 대기 중 실행 상태를 어디 둘지 · 정본이 무엇인지 불명확 | checkpoint = 실행 위치만, 정본 = PostgreSQL(7·8절) |
| "층을 쌓는다"만 있고 줄이는 기준이 없음 | 복잡도만 늘 수 있다 | 평가로 노드를 유지/삭제(12절) |

---

## 4. 최종 추천 Architecture

```
                         ┌──────────────── 사람 (Control Tower UI) ────────────────┐
                         │  승인 · 반려 · 사실 확인 · 실행 시작/중지 · 타임라인 보기   │
                         └───────────────▲──────────────────────────┬──────────────┘
                                         │ OpenAPI                  │
┌────────────────────────────────────────┴──────────────────────────▼──────────────────────────────┐
│ A. Business Workflow / Authority — NestJS (back/)                                                │
│  Registry · Contact Gate · Draft · Approval · Outbox/Send · Inbound · Extraction 검증 · Event ·   │
│  CanonicalFact · Verification · Audit · system_error · 멱등 · 권한 · 상태 전이                     │
│  ┌── Agent Run Coordinator ──┐   ┌── Agent Tool API (/agent-tools/*) ──┐   ┌── Public Data ──┐   │
│  │ 실행 생성 · 시작 · 재개    │   │ typed 계약 · 서비스 토큰 · 범위 검사 │   │ Adapter (DS-01~03)│  │
│  │ 업무 이벤트 → resume 신호  │   │ 부작용 등급 · 멱등 · 감사 · tool_call│──▶│ 원문 보존 · 정규화│  │
│  └────────────┬──────────────┘   └───────────────▲─────────────────────┘   │ · PUBLIC_API 사건 │  │
│               │ start / resume                    │ Tool 호출만              └────────┬────────┘   │
└───────────────┼───────────────────────────────────┼────────────────────────────────────┼─────────┘
                │ HTTP                              │ HTTP                               │ HTTPS
┌───────────────▼───────────────────────────────────┴───────────────┐             data.go.kr
│ B. Agent Reasoning — Python + LangGraph (ai/)                      │             UNI-PASS
│  CeraRecoveryGraph (노드 = 책임 단위) · Graph State(ID/ref 만)      │
│  LLM 노드(생성형) · Decision 노드(판정 모델) · 라우터(열거된 분기)   │
│  checkpoint → Backend Tool API 로 저장 (DB 자격증명 없음)           │
│  외부 클라이언트: LLM 공급자 · CERA Backend Tool API — 그 밖 금지    │
└───────────────────────────────────────────────────────────────────┘
```

---

## 5. 역할 분담

### 5.1 LangGraph (Agent Reasoning)
- 정보가 **충분한지**, 부족하면 **무엇이** 부족한지, **어디서** 구할지(공공데이터 / 상대 업체 문의 / 사람 확인) 고른다.
- Tool 을 고르고 부른다. 결과를 해석하고 다음 분기를 정한다.
- 회신 해석(값 후보 · 원문 인용), 의미 · 모호성 판단, 후보 복구전략에 대한 **추론**과 **설명 문장**.
- **하지 않는다**: DB · SQL · CanonicalFact 변경 · 권위 Event 생성 · 승인 생성/변경 · Contact Gate 우회 · 발송 · Gmail · 공공 API 직접 호출 · 사용자/역할 변경 · 계획 확정 · 숫자(비용 · 수량 · 시각) 생성.

### 5.2 NestJS (Business Workflow / Authority)
- 지금 하는 모든 것 + **Agent Run Coordinator**(실행 생성 · 시작 · 재개 신호) + **Agent Tool API** + **Public Data Adapter**.
- Agent 가 보낸 모든 것(초안 요청 · 추출 후보 · 판정 결과)을 **검증한 뒤에만** 반영한다. Agent 가 부른 공공데이터 조회의 원문 · 출처 · 감사도 Backend 가 남긴다.
- 발송은 계속 **사람 승인 → NestJS Outbox** 다. 그래프의 `send` 단계는 "NestJS 가 보낼 때까지 기다림"이지 Agent 의 행동이 아니다.

---

## 6. Tool Layer

### 6.1 공통 계약

| 항목 | 규칙 |
| --- | --- |
| 정의 위치 | Backend 의 `ToolDefinition`(zod 입력 · 출력 스키마 하나에서 파생 — ADR-033 결정 7). `packages/contracts/agent-tools.json`(JSON Schema)로 내보내고 Python 은 그것으로 Tool 을 만든다. 양쪽 시험이 최신인지 검사(지금 OpenAPI · AI 계약과 같은 방식) |
| 호출 | `POST /agent-tools/{name}` · 헤더 `Authorization: Bearer <CERA_AGENT_TOOL_TOKEN>` · `X-CERA-Agent-Run-Id` · `traceparent` · `Idempotency-Key`(부작용 Tool) |
| 권한 | ① 서비스 토큰(사람 권한 아님) ② **실행 범위**: 실행이 가리키는 `recovery_run` · 문의 · 컨테이너 밖의 id 는 거부 ③ **그래프 버전별 Tool 허용 목록** ④ 행위자 = `AI_AGENT` 시스템 행위자. 승인 · 확인 Tool 은 아예 없다 |
| 부작용 등급 | `READ`(읽기) · `EXTERNAL_READ`(Backend 가 외부를 읽고 원문 보존) · `COMPUTE`(결정론 계산, 사실 변경 없음) · `PROPOSE`(초안 · 후보 생성 — 사람 게이트 앞) · `REQUEST`(사람에게 요청 — 승인 아님). **`COMMIT` 등급(승인 · 발송 · 사실 확정 · 계획 확정)은 Agent 에게 열지 않는다** |
| 멱등 | `PROPOSE` · `REQUEST` = `Idempotency-Key`(= `agent_run_id` + 노드 + 대상 id) 필수, 같은 키는 같은 결과. `EXTERNAL_READ` = (출처, 조회 키, `as_of` 구간) 캐시 — 같은 실행에서 같은 조회를 두 번 내보내지 않는다 |
| 시간 제한 | READ 3초 · COMPUTE 10초 · EXTERNAL_READ 15초(어댑터 10초 + 여유) · PROPOSE/REQUEST 5초 `[ASSUMPTION]` |
| 감사 | 모든 호출 = `agent_tool_call` 행(실행 · Tool · 버전 · 입력 지문 · 결과 참조 · 등급 · 상태 · 소요 · 오류 코드 · `trace_id`). PROPOSE/REQUEST 는 기존 `audit_log` 에도(행위자 `AI_AGENT`). 원문 · 비밀값은 남기지 않는다 |
| 출처 | 결과마다 `provenance`: `source_type` · `raw_input_id`/`event_id`/`fact_id` 참조 · 관측 시각 · `is_simulated` · `result_kind`. Agent 는 이 참조를 State 에 들고 다닌다 |
| 실패 | 표준 오류 `{code, retryable, safe_message}` — `CAPABILITY_NOT_AVAILABLE` · `OUT_OF_SCOPE` · `PUBLIC_DATA_KEY_MISSING` · `UPSTREAM_ERROR` · `RATE_LIMITED` · `VALIDATION_FAILED` 등 |

### 6.2 Tool 목록

| 범주 | Tool | 등급 | 지금 | 비고 |
| --- | --- | --- | --- | --- |
| PUBLIC DATA | `get_vessel_status` | EXTERNAL_READ | 없음 → T-102 | DS-03 입항 · 계선 시설 · 입출항 일시 |
| | `get_container_manifest` | EXTERNAL_READ | 없음 → T-102 | DS-02 입항 건의 B/L ↔ 컨테이너 · 규격 |
| | `get_customs_progress` | EXTERNAL_READ | 없음 → T-106 | DS-01 통관 진행 · 반출입 이력(실제 B/L 필요) |
| CERA READ | `get_recovery_context` | READ | 일부(`GET /planning/runs`) | 실행 · 스냅샷 · 예외 요약 ref |
| | `get_container_state` | READ | 없음(엔티티 표 M14 뒤) | 사실 ref + 상태 네 차원 |
| | `get_current_facts` | READ | 없음(T-093 뒤 실질) | `canonical_fact` 조회 |
| | `get_information_gaps` | READ(결정론) | 없음 | **계획에 필요한 입력 − 신선하고 쓸 수 있는 사실**을 Backend 가 계산. Agent 는 이것을 판단하지 않고 받는다 |
| | `get_counterparty` | READ | 있음(`/registry/*`) | Contact Gate 판정 포함 |
| | `get_question_context` | READ | 일부(초안 · 질문 항목) | |
| | `get_communication_status` | READ | 있음(drafts · inbound) | |
| COMMUNICATION | `create_inquiry_draft` | PROPOSE | 있음(`POST /communication/drafts` 를 감쌈) | 구조화 값은 Backend 가 주입 · 숫자 검사 그대로 |
| | `request_approval` | REQUEST | 없음 | **승인이 아니다** — 승인 대기열에 올리고 사람에게 알린다. 결과 = `approval_request_ref` |
| | `get_reply_status` | READ | 일부 | |
| PLANNING | `calculate_cost` · `calculate_risk` | COMPUTE | 없음(T-033 · T-035) | 인터페이스만 — `CAPABILITY_NOT_AVAILABLE` |
| | `generate_recovery_candidates` · `solve_recovery_plan` | COMPUTE | 없음(T-036 · Q-65) | 인터페이스만. 시나리오 결과를 쓰면 `result_kind = SCENARIO_RESULT` |
| AI / DECISION | `extract_reply` · `classify_reply` · `assess_ambiguity` · `assess_information_sufficiency` | — | 추출은 있음 | **Backend Tool 이 아니라 그래프 노드**(Python 안 LLM · Decision 호출). 결과는 `submit_extraction_candidate` · `submit_decision_result`(PROPOSE)로 Backend 에 보내 검증 |

> **충분성 판단은 둘로 나눈다.** "계획에 필요한 입력이 있는가"는 Backend 결정론(`get_information_gaps`). "이 회신이 질문에 실제로 답했는가 · 조건부인가 · 모호한가"는 Decision 모델. 둘 다 통과해야 "충분"이다.

---

## 7. Public Data Layer (T-005 · T-006 재설계)

```
Agent Tool (get_vessel_status 등) 또는 Worker 스케줄
  → NestJS PublicDataService
     → 출처별 Adapter (DS-03 · DS-02 · DS-01) — 키 · 한도 · 재시도 · 오류 봉투 판정
     → 원문 바이트 → ContentStore(CERA_PUBLIC_DATA_RAW_DIR, gitignore) + raw_input(source_type = PUBLIC_API, 지문)
     → 결정론 Normalizer → 관측값(observation) + provenance
     → 필요하면 Event 후보(PUBLIC_API, 강도 상한 2 — docs/05 3.3) → Reconciliation(T-093)
  → Tool 결과 = 정규화 관측값 + raw_input_id · event_id 참조
```

- Event 를 만드는 것은 **Backend 의 결정론 Normalizer** 다. 누가 조회를 촉발했든(Agent · 스케줄 · 사람) 같은 규칙으로 만든다 — Agent 가 권위 Event 를 만드는 것이 아니다.
- 모듈 위치 `back/src/public-data/`(`public-data.module.ts` · `adapters/{vessel-call,container-manifest,customs-progress}.adapter.ts` · `normalize/*` · `public-data.service.ts`). 실행 모드 `CERA_PUBLIC_DATA_MODE = off | replay | live`(T-100 에서 설정 자리 완료).
- **DB**: M14 — `container` · `bl` · `container_bl` · `external_identifier`(논리 `docs/22` 8절 그대로) + **`vessel_call` 을 Next → MVP 로 승격**(DS-03 → DS-02 조인의 키이므로 필요 — `docs/22` rev.2.6 결정 필요). 공공 조회 이력은 `raw_input` + `audit_log` 로 충분한지 T-102 Plan 에서 확인.
- **커밋 규칙**: 실제 응답 · 실제 B/L · 컨테이너 번호는 `data/raw/`(gitignore)에만. 시험 fixture 는 마스킹본(`data/fixtures/public-data/`). UNI-PASS 가이드 원문은 저장소에 두지 않는다(Q-17).
- 기존 T-005 · T-006 은 Python 시절 경로(`intake/adapters/public_api.py`)를 가리킨다 → **T-102 · T-106 으로 대체(DEPRECATED 처리 제안)**.

### 7.1 API 재확인 결과 (2026-10-22, 공식 포털 · 가이드 · 가짜 키 호출로 경로 생존 확인)

| | DS-03 선박운항정보 (15006353) | DS-02 외항화물컨테이너 (15131742) | DS-01 UNI-PASS 화물통관진행 (API001 · 15126268) |
| --- | --- | --- | --- |
| API | `GET apis.data.go.kr/1192000/VsslEtrynd5/Info5` | `GET apis.data.go.kr/1192000/CargFrghtContnOut/ContnInfo` | `GET unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo` |
| 요청 | `prtAgCd`(부산 020) · `sde`/`ede` · `deGb` · `clsgn` · `numOfRows`≤50 | `prtAgCd` · `etryptYear` · `etryptCo` · `clsgn` · `numOfRows`≤50 | `crkyCn` + `cargMtNo` 또는 `mblNo`/`hblNo` + `blYy` |
| 받는 필드 | 입항연도 · 입항횟수 · 호출부호 · 선명 · 국적 · 선종 · 입출항 일시 · **계선 시설** · 하역 톤수 · `mrNum` | B/L · MSN · **컨테이너 번호 · 규격 · 크기** · 입출항 일시(+09:00) · 반입반출 구분 · 업체 | 진행상태 · 처리이력(처리구분 · **반출입 일시** · 장치장) · 선명 · 입항일 |
| 키 | data.go.kr 활용신청 | data.go.kr 활용신청 | unipass.customs.go.kr › My메뉴 › OpenAPI사용관리 (**API 마다 따로** 발급 가능성 `[TO VERIFY]`) |
| 비용 | 무료 | 무료 | 무료 |
| 한도 | 개발 10,000/일 · 30 tps · 운영 자동승인 | 개발 1,000/일 · 30 tps · 운영 심의 | **공개 수치 없음**(Q-05) · 운영 심의 |
| 상태 | 정상 · 포털 수정 2026-10-06 · 새 PDF 가이드 | 정상 · 포털 수정 2026-10-06 · 새 PDF 가이드 · `entrpsCd` 크기 7(사전 9 — 확인 필요) | 정상 · 2026-02-05 이후 변동 없음 · 3년 이내만 조회 |
| CERA 연결 | `vessel_call` · 도착(ATA) 사실 · 선석/계선 위치 | `bl` · `container` · `container_bl` · `external_identifier`(MSN) · 규격 | 통관 상태 사실 · 반출입 이력(B/L 단위) · 장치장 |
| 형식 | XML | XML | XML(오류도 HTTP 200 + `tCnt=-1`) |

추가 후보: UNI-PASS API020(컨테이너 내역) · API021(입항보고) · **API048(보세구역 반출신고 — 컨테이너별 반출 시각에 가장 가까운 후보, 단위 미확인)** · API005(장치장 정보). 해수부 15057599(외항컨테이너반출입정보)는 **집계**라 컨테이너별 근거가 못 된다.

**여전히 어떤 공공 API 도 주지 않는 것**: Free Time · LFD · D&D Tariff · 화주 특약 · ODCY 용량/요율 · 트럭 가용성 · VBS 슬롯 · D/O · 창고 수용량 · 터미널 내 장치 위치 · 양하 시각 · 컨테이너별 gate-out 시각(확인된 출처 없음) · 공컨 반납.

**첫 실제 Adapter 추천**: ① **DS-03 → DS-02 묶음**(키 하나 · 무료 · **실제 B/L 없이** 부산 기간 조회로 시작 · 한도 넉넉) ② 그다음 DS-01(실제 B/L 5~20건이 준비되면).

---

## 8. Human-in-the-loop · checkpoint

```
Graph: request_human_approval 노드 → Tool request_approval(REQUEST) → interrupt(HUMAN_APPROVAL_REQUIRED)
NestJS: 승인 대기열 → Human UI → 사람 승인(기존 T-089 규칙 · HUMAN 행위자 · 지문 고정)
NestJS: 승인 → (사람 또는 정책이) 발송 요청 → Outbox → 발송 완료 → 회신 수신 → 추출 검증
NestJS Coordinator: 업무 이벤트(APPROVED · SENT · REPLY_VALIDATED · REJECTED · EXPIRED)마다 resume 신호
Graph: resume → 상태를 checkpoint 에서 믿지 않고 Tool 로 다시 읽는다 → 다음 분기
```

- **checkpoint 는 "어디서 이어 갈지"만** 담는다. 승인 여부 · 사실 · 발송 여부의 정본은 PostgreSQL/NestJS 다. resume 첫 노드는 언제나 Tool 로 현재 상태를 다시 읽는다.
- checkpoint 저장: LangGraph `BaseCheckpointSaver` 를 구현한 **`BackendCheckpointSaver`** — `PUT/GET /agent-tools/_checkpoints/{agent_run_id}` 로 Backend 의 `agent_checkpoint` 표에 저장(ADR-034 결정 6 유지). checkpoint 를 잃어도 실행은 `load_context` 부터 다시 시작하면 같은 결과가 나와야 한다(노드 멱등 · Tool 멱등 키).
- 사람이 반려 · 승인 만료 · 실행 중지하면 Coordinator 가 그 사유로 resume → 그래프는 다른 분기(다른 상대 선택 · 사람에게 넘김 · 종료).
- **ADR 에 넣는다**(ADR-036 결정 2).

---

## 9. Graph · State · 첫 Vertical Slice

### 9.1 `CeraRecoveryGraph` (하나로 시작)

```
START → load_context → inspect_current_state → assess_information_sufficiency
  ├─ 충분 → (generate_recovery_candidates → solve → explain)  ※ 지금은 CAPABILITY_NOT_AVAILABLE → explain_gaps → END
  └─ 부족 → detect_information_gap → choose_information_source
        ├─ PUBLIC  → public_data_tool → validate_evidence → assess_information_sufficiency (루프, 상한)
        ├─ PARTNER → select_counterparty → create_inquiry_draft → request_human_approval → INTERRUPT(승인)
        │            → (NestJS 발송) → INTERRUPT(회신) → extract_reply → decide_reply → submit_for_validation
        │            → (NestJS 결정론 검증 · 사건 파이프라인) → assess_information_sufficiency
        └─ HUMAN   → request_human_verification → INTERRUPT(확인) → assess_information_sufficiency
```

노드 묶음(책임): Context Loader(`load_context` · `inspect_current_state`) · Evidence Collector(`public_data_tool` · `validate_evidence`) · Information Gap Analyzer · Tool Selector(`choose_information_source`) · Communication Planner(`select_counterparty` · `create_inquiry_draft` · `request_human_approval`) · Reply Interpreter(`extract_reply`) · Decision Evaluator(`decide_reply` · 충분성의 의미 판단) · Recovery Planner(인터페이스) · Explanation.

**Subgraph/Agent 로 승격하는 조건**(하나라도): 자기만의 긴 대화 맥락 · 별도 Tool 묶음 · 다른 모델/비용 정책 · 독립 평가셋이 필요해질 때. **Supervisor + 여러 Agent 구조는 만들지 않는다.**

### 9.2 Graph State (ID/ref 만)

`agent_run_id` · `graph_version` · `recovery_run_id` · `exception_ref` · `as_of` · `current_goal` · `known_fact_refs[]` · `evidence_refs[]`(raw_input · event id + 출처 · 관측 시각) · `information_gaps[]`(gap id · 사실 좌표 · 사유) · `tool_results[]`(tool_call id · 요약 코드) · `pending_human_action`(종류 · 대상 ref · 요청 시각) · `decision_results[]`(판정 ref · 점수) · `candidate_plan_refs[]` · `step_count` · `tool_call_count` · `errors[]`(코드만) · `trace_id`.
**넣지 않는다**: 컨테이너 · 거래처 · 사실 행 전체, 메일 본문, 공공 API 원문, 비밀값.

### 9.3 첫 Vertical Slice 제안 (T-105)

**"정보 공백 하나를 Agent 가 메운다"** — 시나리오 실행 하나에서:
1. `get_information_gaps` 가 공백을 준다(예: 특정 입항 건의 도착 사실 · 컨테이너 목록, 창고 수용 가능 여부).
2. 공공데이터로 풀 수 있는 공백 → `get_vessel_status` · `get_container_manifest`(replay 또는 live) → 근거 ref 확보.
3. 공공데이터로 안 되는 공백(창고 수용량) → 상대 선택 → 초안 → **승인 interrupt** → 사람 승인 → NestJS Mock 발송 → **회신 interrupt** → Mock 회신 → 추출 · 판정 → Backend 검증.
4. 충분성 재평가 → 계획 단계는 `CAPABILITY_NOT_AVAILABLE`(솔버 없음)로 정직하게 끝나고 설명을 남긴다.
5. 화면: 실행 타임라인(노드 · Tool · interrupt · resume) — 개발 화면(`/dev`) 수준.

범위 밖: 솔버 · 비용/위험 계산 · 실제 Gmail · DS-01 · 여러 그래프.

---

## 10. Decision Model · LLM · Solver · Backend

| 담당 | 하는 것 | 하지 않는 것 |
| --- | --- | --- |
| 생성형 LLM | 값 후보 + 원문 근거 추출 · 초안 문장 · 설명 | 판정 확정 · 숫자 생성 · 상태 |
| Decision 모델(Jev · LLM 판정 · NLI 후보) | 실제로 답했나 · 확정/조건부 · 사람 확인 필요 · 의미상 충분한가 — **점수 후보** | 사실 확정 · 승인 |
| 라우터(그래프 분기) | 열거된 다음 단계 중 선택(정보원 선택 등) | 그래프 밖 행동 |
| Solver(결정론, T-036 · Q-65) | 복구계획 최적화 | — |
| Backend | 권한 · 검증 · 임계값 적용 · 사실 · 승인 · 발송 · 감사 | 추론 |

Decision 점수를 "사람 확인 필요"로 바꾸는 **임계값은 Backend 정책값**(T-099 결과로 정한다).

---

## 11. 실제 데이터 전략 — Demo Scenario v2 (T-107)

| REAL (공공) | SYNTHETIC (사설 운영) |
| --- | --- |
| 부산 실제 입항 건(선박 · 입항횟수 · 입출항 일시 · 계선 시설) · 그 입항 건의 B/L ↔ 컨테이너 목록 · 규격 · (DS-01 준비 후) 통관 진행 · 장치장 | 창고 수용량 · 트럭 가용성 · ODCY 용량 · 계약 요율 · Free Time · 내부 SLA · 상대 업체 회신 |

- 구분: REAL 은 `source_type = PUBLIC_API` + `raw_input` 참조 + `is_simulated = false`. SYNTHETIC 은 `is_simulated = true` · `result_kind = SCENARIO_RESULT`. 화면 · 설명에서 둘을 다르게 표시(규칙 9).
- 실제 번호는 커밋하지 않으므로 v2 시나리오 팩은 **"실제 조회 레시피(기간 · 항만 · 입항 건 선택 규칙) + 마스킹 fixture + 합성 사설 데이터"**로 커밋하고, 실제 값은 로컬 `data/raw/` 에서 재구성한다.

---

## 12. Observability · Evals

### 12.1 기록
- Backend 소유 표(M16 예상 — M14 · M15 는 T-102 가 썼다): `agent_run`(그래프 버전 · 대상 · 상태 · 시작/종료 · `trace_id` · 사유) · `agent_step`(노드 시작/종료 · 소요 · 모델 · 토큰 · 비용 · 판정 요약 코드 · 오류 코드 · interrupt/resume) · `agent_tool_call`(6.1) · `agent_checkpoint`(8절).
- Python 은 노드 이벤트를 실행 끝 · interrupt 때 묶어 Backend 에 보고(`report_steps` Tool). 구조화 로그에는 id · 코드 · 수치만.
- `traceparent`(W3C) 를 지금부터 전파한다 — OpenTelemetry SDK 는 나중에 붙일 수 있게(`docs/23` 원칙 유지). LangSmith 같은 외부 추적 서비스는 데이터가 밖으로 나가므로 **기본 금지**, 쓰려면 별도 결정.
- 실패: 기술 실패는 기존 `system_error`(boundary `BACKGROUND_JOB` 또는 신규 `AGENT_RUNTIME` 검토). 원문 · 비밀값은 일반 로그 금지(기존 규칙).

### 12.2 평가 네 층
| 평가 | 묻는 것 | 데이터 |
| --- | --- | --- |
| Extraction | 값 · 근거 정확도 · 범위 위반 · 스키마 실패 | T-099 141건(기존) |
| Decision | 답함 · 확정/조건부 · 사람 확인 필요 판정 정확도 | T-099 141건 판정 축 |
| Tool Selection | 공백마다 맞는 정보원 · Tool 을 골랐나 · 불필요 호출 수 | 신규: 공백 시나리오 30~50건 |
| Workflow | 끝까지 맞는 종료 상태 · interrupt 위치 · 단계 수 · 실패율 | 신규: 시나리오 실행 10~20건 |

비교: **single-call(지금) vs graph(multi-step)** — 정확도 · 범위 위반 · 사람 확인 비율 · 지연 · 토큰 · 비용 · Tool 호출 수 · 실패율. **graph 가 같은 정확도에서 비용 · 지연만 늘리면 노드를 줄인다.**

---

## 13. 작업 순서 (새 번호: T-100 ~ T-107, QUEUE 최대 번호 T-099 확인)

| 순서 | Task | 목적 | 사용자에게 생기는 것 | 주요 파일 | DB | credential | 선행 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **T-100** Runtime 설정 정리 | `.env` 가 코드에 뒤처지지 않게 | `npm run env:check` · `python -m cera_ai.config` · 기동 시 조합 검사 | `back/src/config/env.ts` · `back/.env.example` · `ai/cera_ai/config.py` · `ai/.env.example` · 시험 2개 | 없음 | 없음 | — (**이번 세션 완료, 미커밋**) |
| 2 | **T-101** Agent Runtime 설계 승인 | 방향 · 경계 확정 | ADR-036 Accepted · 정본 문서 반영 | 이 문서 · `docs/14` · `docs/06` · `docs/18` O절 · `docs/23` | 없음 | 없음 | 사용자 승인(NEEDS_HUMAN) |
| 3 | **T-102** Public Data Adapter v1 (DS-03 + DS-02) | 실제 부산 입항 · 컨테이너 데이터 수집 | 실제 입항 건과 컨테이너 목록을 원문 · 출처와 함께 저장 · 조회 | `back/src/public-data/*` · `data/fixtures/public-data/` | **M14** 엔티티 표 + `vessel_call` 승격 | **data.go.kr serviceKey** | T-100 · T-101 · `docs/22` rev.2.6 결정 |
| 4 | **T-103** Agent Tool Layer v1 | Agent 가 쓸 수 있는 손 | Tool 계약 · 감사 · 실행 범위 · READ/PUBLIC/COMMUNICATION Tool | `back/src/agent-tools/*` · `packages/contracts/agent-tools.json` | **M16** `agent_run` · `agent_step` · `agent_tool_call` · `agent_checkpoint` | 없음(토큰은 로컬 생성) | T-101 · (PUBLIC Tool 은 T-102) |
| 5 | **T-104** Agent Runtime 기반 (LangGraph) | 그래프 실행 뼈대 | 실행 시작 · interrupt · resume · 상한 · 추적 | `ai/cera_ai/agent/*` · `pyproject.toml`(langgraph) | 없음 | 없음(replay) | T-103 |
| 6 | **T-105** 첫 Vertical Slice | 정보 공백 하나를 Agent 가 메운다(9.3) | 실행 타임라인 · 승인 대기 · 회신 반영까지 한 흐름 | 그래프 노드 · Coordinator · `/dev` 화면 | 없음 예상 | 없음(replay) / 선택: LLM 키 | T-104 · T-102 |
| 7 | **T-106** DS-01 UNI-PASS Adapter | 통관 · 반출입 이력 | 실제 B/L 의 통관 진행 | `back/src/public-data/adapters/customs-progress*` | 작음(필요 시) | **UNI-PASS 키 + 실제 B/L 5~20건** | T-102 |
| 8 | **T-107** Demo Scenario v2 | 실제 부산 사건 기반 시연 | REAL + SYNTHETIC 시나리오 | `data/scenarios/busan-*-v2/` | 없음 | data.go.kr 키 | T-102 (T-106 있으면 더 좋음) |
| 9 | **T-099** 재개 (범위 확장) | 모델 선택 근거 | Extraction · Decision + Tool Selection · Workflow 평가, single vs graph 비교표 | `ai/evals/*` | 없음 | **LLM 키 · OpenRouter 키 · 비용 상한** | T-105 |
| 10 | **T-093** U8 사건 · 현재 사실 | 공공 · 회신 근거가 실제 사실이 된다 | `get_current_facts` 가 실질 · Reconciliation | `back/src/state/*` | 새 migration 가능 | 없음 | T-099(사용자 결정 2026-10-07) · T-102 |
| 11 | **T-098** 역할별 실제 화면 · 로그인 | 시연 · 실제 사용 | 운영자 · 관리자 · 현장 앱 · 인증(임시 `X-CERA-Actor-Id` 교체) | `front/web/*` · 인증 모듈 | 가능 | 없음 | T-105 이후 · T-095 와 범위 정리 |

T-005 · T-006 → **DEPRECATED(T-102 · T-106 으로 대체)** 제안. T-002(키 발급)는 NEEDS_HUMAN 그대로, 우선순위 P2 → **P0** 제안. 2026-09-11 사람 지시 "T-004 검토 전 실호출 금지"는 **사용자 해제 확인이 필요**하다.

---

## 14. 필요한 키 · 설정 (T-100 으로 자리 완료)

| 키 | 어디에 | 언제 필요 | 발급 |
| --- | --- | --- | --- |
| `DATA_GO_KR_SERVICE_KEY` | `back/.env` | T-102 · T-107 | data.go.kr 15006353 · 15131742 활용신청(자동승인) |
| `UNIPASS_API_KEY` | `back/.env` | T-106 | unipass.customs.go.kr OpenAPI 사용관리(API001) |
| `CERA_AGENT_TOOL_TOKEN` | `back/.env` + `ai/.env`(같은 값) | T-103 | 로컬에서 생성한 임의 32자 이상 |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | `ai/.env` | T-099 · (선택) T-105 live | 각 공급자 콘솔 |
| `OPENROUTER_API_KEY` | `ai/.env` | T-099 Decision(Jev) | OpenRouter |

production 금지 조합(코드로 검사): Mock 장애 주입 · 공공데이터 replay · LLM replay · Decision replay. live 공공데이터는 키 하나 이상, Agent 는 32자 이상 토큰 필요.
