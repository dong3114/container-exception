# AGENTS.md — 작업 에이전트 진입점

> 어떤 AI 에이전트(Claude Code, Codex, Cursor, Gemini CLI 등)든 **이 파일부터** 읽는다.
> 이 파일은 **읽는 순서**와 **작업 프로토콜**만 정의한다. 내용의 정본(canonical)은 `docs/`에 있다.

---

## 1. 프로젝트 한 줄

**CERA (Container Exception Recovery Agent)**
공공 API·이메일·계약서·현장 담당자 입력 등 여러 곳에 흩어진 수입 컨테이너 운영 사실을 **신뢰도 기반의 Canonical Operational State**로 통합한다.
예외(창고 수용량 감소, D&D 마감 임박 등)가 생기면 트럭·ODCY·창고·슬롯 제약 안에서 **여러 컨테이너의 최소비용 복구계획**을 계산한다.
그리고 운송사·ODCY·창고 **연락 초안 → 사람 승인 → 회신 반영 → 재최적화**까지 돕는 멀티에이전트형 Operations 시스템이다.

> 핵심 질문: "컨테이너가 어디에 있는가?"가 아니라 **"지금 무엇을 믿을 수 있고, 무엇을 해야 총손실이 최소인가?"**
> CERA는 System of Record가 아니라 **System of Decision / Action Layer**다. 공공데이터는 진실원천이 아니다.

| 항목 | 값 |
| --- | --- |
| 현재 단계 | **Phase 0.5 → Slice 1 구현 중(U0 · U1 완료).** 이벤트·상태 설계 완료(T-032·T-060), 30대 시나리오 + Control Tower Prototype 완료(T-061~T-063), **외부 통신 Architecture RFC + AI/Backend 책임 경계 확정(T-068, `docs/18`, ADR-026~029 Accepted)**, **외부 통신 요구사항 명세(T-071, `docs/19`)**, **DB 설계 전 요구사항 검토(T-072, `docs/20`)**, **개념 데이터 모델 승인(T-073 → rev.2 T-075 → rev.3 T-077 → T-078 정합성 정리 → **T-076 최종 승인**, `docs/21`)**, **논리 DB 설계(T-079 → rev.2.2 → **rev.2.3**(T-081 논리 모델 후속 — `docs/05` 4.2 대조로 누락 13건 복구 + ADR-020 상태 차원 복구 + `event_verification_target`, MVP 52 · Next 1 · 만들지 않음 2 = 55), `docs/22` + 논리 스키마 작업표, **T-079 DONE 2026-09-18 · T-081 DONE 2026-09-21 · rev.2.4 Q-44·Q-45 결정(메일 근거 시각 · 기록·내용 분리 보관, ADR-032) 2026-09-21**)**, **런타임·오류 처리·관측성 문서(`docs/23`, ADR-030 Proposed)**, **Main Backend = TypeScript + NestJS · AI Server = 별도 Python 런타임 결정(T-083, Q-64 CLOSED, ADR-033 Accepted 2026-09-21)**, **DB = PostgreSQL + Drizzle ORM + drizzle-kit 검토 SQL migration, SQLite 미사용 결정(T-084, Q-68 CLOSED, ADR-034 Accepted 2026-09-22)**. 작업 순서는 `(논리 DB 설계 완료) → (T-070 문서 동기화 완료) → (T-081 논리 모델 후속 완료) → (T-069 구현 계획 DONE — 첫 Slice = Mock 루프, L-13 CLOSED, P0 29개) → (T-083 Q-64 Backend 결정 DONE — NestJS) → (T-084 Q-68 DB 결정 DONE — PostgreSQL + Drizzle) → (T-080 물리 설계 DONE — `docs/24` + `docs/22` rev.2.5) → (**T-085 U0 Backend 뼈대 DONE 2026-09-23** — `back/` NestJS + PostgreSQL/Drizzle · `infra/local/` · 시험 61 통과 · `docs/24` 18.1) → (**T-086 U1 영속 기반 DONE 2026-10-06** — P0 29표 · M01~M10 · 트리거 70 · 권한 · 감사/`system_error` · ContentStore · 시드 · OpenAPI 뼈대 · 최종 검토(`actor_type` 불변 · 계획 기반 승인 = 한 실행 · 오류 기록 격리) · 시험 135 통과 · `docs/24` 18.2) → T-087~T-096 구현(U2~U11, **다음 T-087**)`이다. **제품 스키마·migration 은 생겼고**, 업무 흐름(초안·승인·발송·수신·사건)·Solver·메일 연동은 아직 코드가 없음. 사람 검토 대기: T-064·T-001. T-036은 DEFERRED |
| 기획 버전 | v0.2 (2026-09-11, 2026-09-15 개정). 변경 이력은 `docs/CHANGELOG.md` |
| 초기 범위 | 부산항 · Import FCL · 컨테이너 30대 안팎 · 창고 수용량 예외 · 사람 확인 · 가상 메일 · 운영 시뮬레이터(Prototype은 2D) |
| 코드 | `front/web/` Next.js Prototype(시나리오 재생, MockProvider) · **`back/` Main Backend(T-085 U0 뼈대 + T-086 U1 영속 기반 — NestJS 12, API·Worker 프로세스, PostgreSQL + Drizzle, P0 29표 · migration M01~M10, 감사/오류 기록기, ContentStore, 시드, `/health` · `/openapi.json`. 업무 기능은 U2 부터)** · **`packages/contracts/openapi.json`(생성된 OpenAPI)** · **`infra/local/` 로컬 PostgreSQL 18.6(Docker Compose)**. `ai/`(별도 Python AI Server 예정)는 README만 있는 빈 책임 영역 |

### 1.1 저장소 구조 (Private Monorepo, ADR-024)

Git 저장소는 **하나**다. 안에서 코드 책임 영역만 나눈다. 배포 때는 서비스별 Docker Image로 나눌 수 있으므로 저장소를 나누지 않는다.

| 폴더 | 책임 | 현재 |
| --- | --- | --- |
| `front/` | 화면. `front/web/` = Control Tower (Next.js) | Prototype 동작 |
| `back/` | 중앙 API, 인증, DB·Event 저장, Canonical State(Reconciliation), 외부 연동(Channel Adapter·OAuth·Outbox·수신 원문 보존·발신자 등록부), 승인, 감사, 오류 처리·관측성, 백그라운드 작업, push, **그리고 모든 결정론 엔진**(Tariff·Cost·Risk·Optimization·Solver — ADR-029). 결정론 엔진은 DB·네트워크·LLM 클라이언트를 import하지 않는다 | 구현 전 |
| `ai/` | **LLM·비정형 처리만**: 메일 초안 문장, 회신·계약서 구조화 추출(값 후보 + 원문 인용), 설명 문장. 신원·권한·사실 확정·현재 상태·숫자·발송은 하지 않는다(ADR-029, `docs/18` O절) | 구현 전 |
| `packages/` | 공유 계약(OpenAPI, 생성 타입) | `contracts/openapi.json`(생성, T-086 — health 뿐) |
| `data/` | 공통 시나리오·테스트 데이터 (front·back·ai가 같이 씀) | `data/scenarios/busan-wh-capacity-01/` |
| `docs/` | 정본 문서 | — |
| `infra/` | 배포 구성 | 구현 전 |

영역 사이 규칙: `front/`는 raw 데이터 파일이 아니라 계약(API / Provider)만 본다. 계약의 정본은 Backend가 생기면 OpenAPI로 옮긴다(`packages/README.md`). Desktop 앱은 **검토 중인 선택지이지 확정 기술이 아니다** — Web First, Desktop 은 중앙 Backend 의 Client, 첫 후보 Electron(ADR-031 Proposed, `docs/23`).

---

## 2. 매 세션 읽는 순서 (필수)

1. `AGENTS.md` (이 파일)
2. **`docs/tasks/CURRENT.md`** — 지금 진행 중인 작업의 인계 문서(정본). Status가 `IDLE`이 아니면 그 작업을 이어받는다
3. `git status`와 최근 커밋 — CURRENT의 Baseline과 실제 저장소가 맞는지 확인
4. `docs/01_project-rules.md` — 반드시 지켜야 할 규칙
5. `docs/tasks/QUEUE.md` — 예정 작업과 상단 "사람 지시"
6. `docs/tasks/LOG.md`의 최근 3개 항목 — 끝난 작업의 인계 내용
7. CURRENT·태스크의 `참조 문서`와 관련 ADR만 추가로 읽는다. **docs 전체를 매번 읽지 않는다.**

(옛 방식) 루트에 `HANDOFF.md`가 있으면 먼저 읽고 CURRENT.md에 옮긴 뒤 삭제한다. 새 인계는 CURRENT.md에만 쓴다.

처음 온 에이전트는 `docs/README.md` 2절의 순서로 한 번 훑는다. LOG에 나오는 옛 파일 경로(`docs/05_domain-model.md` 등)는 `docs/CHANGELOG.md` 7절 표로 새 경로를 찾는다.

---

## 3. 작업 프로토콜

### 3.1 태스크 선택
- `CURRENT.md`의 Status가 `IDLE`이 아니면 → **그 작업을 이어받는다**(3.7). 옛 방식의 LOG `상태: 중단` 인계도 같다.
- 없으면 `TODO` 중 **의존 태스크가 모두 `DONE`** 인 것 가운데 우선순위(P0 > P1 > P2), 그다음 ID 오름차순으로 **하나**를 고른다.
- `NEEDS_HUMAN` 태스크는 에이전트가 수행하지 않는다. 사람이 해야 할 행동을 요약해 보고만 한다.
- `DEPRECATED` 태스크와 그 ID는 다시 쓰지 않는다.
- 한 세션 = 한 태스크가 원칙이다. 태스크가 너무 크면 먼저 쪼개서 큐에 넣고 첫 조각만 수행한다.
- 사용자가 세션에서 다른 작업을 직접 지시하면 그 지시가 우선한다. 단, 끝나면 이 프로토콜의 3.4를 똑같이 수행한다.
- QUEUE 상단의 `사람 지시`를 확인한다(예: 검토 전 착수 금지, 커밋 금지).

### 3.2 착수
- `docs/tasks/QUEUE.md`에서 해당 태스크 상태를 `IN_PROGRESS`로 바꾸고 `담당`에 `에이전트명 / YYYY-MM-DD`를 적는다.
- `docs/tasks/CURRENT.md`에 Task Brief(`docs/tasks/TASK_BRIEF_TEMPLATE.md` 형식: Goal·Why·Scope·Out of Scope·Existing Decisions …)를 채우고 Status·Baseline·Current Orchestrator를 적는다. Architecture 변경·여러 영역 기능·중요 Vertical Slice는 `docs/17_ai-development-workflow.md`의 전체 흐름(Brief → Plan → 사용자 승인 → 구현 → 리뷰 → Docs Sync → 사용자 승인 → Commit)을 따른다. 작은 수정은 17 문서 4.1절처럼 줄인다.

### 3.3 수행
- `docs/01_project-rules.md`를 지킨다. 특히 검증 태그, LLM 역할 경계, 금지 주장, 외부 발송·Write 금지, 비밀정보 규칙.
- 범위 밖에서 발견한 문제는 고치지 말고 **큐에 새 태스크로 추가**하거나 `docs/15_open-questions.md`에 기록한다.
- 설계 결정이 필요하면 `docs/14_decisions.md`에 ADR을 `Proposed`로 추가한다.
  `Accepted` ADR을 뒤집는 변경은 사람 승인 전까지 하지 않는다.

### 3.4 완료 — 완료 조건(DoD)을 모두 만족할 때만
아래를 **모두** 수행한 뒤 세션을 끝낸다.

1. 태스크의 `완료 조건`을 항목별로 확인한다. 테스트가 있으면 실행하고 결과를 확인한다.
2. 영향받은 정본 문서(`docs/`)를 갱신한다. **코드와 문서가 어긋난 상태로 끝내지 않는다.**
3. `QUEUE.md`: 태스크를 `DONE`으로 바꾸고 `완료` 섹션으로 옮긴다(한 줄 요약 + 산출물 경로).
4. **다음 작업을 큐잉한다.**
   - 이 작업으로 의존이 풀린 태스크를 확인한다.
   - 작업 중 발견한 후속 작업을 새 ID로 추가한다(QUEUE.md의 템플릿 사용).
   - 실행 가능한 태스크(`TODO` + 의존 해소)가 **최소 3개** 남도록 `docs/12_roadmap.md`를 보고 보충한다.
     `NEEDS_HUMAN` 때문에 3개를 채울 수 없으면 그 사유를 QUEUE.md 상단 `다음 추천 태스크`에 적는다.
   - QUEUE.md 상단의 `다음 추천 태스크`를 갱신한다.
5. `docs/tasks/LOG.md` **맨 위**에 인계 기록을 추가한다(템플릿 사용). `CURRENT.md`의 요지를 옮기고, CURRENT는 다음 Task로 채우거나 `IDLE`로 되돌린다.
6. 이 파일(AGENTS.md) 1절의 `현재 단계`가 바뀌었으면 갱신한다.
7. 기획 방향이 바뀌는 작업이면 `docs/CHANGELOG.md`에 요약을 추가하고, 옛 문서는 남기지 않는다(`docs/README.md` 4절).

### 3.5 막혔을 때
- 상태를 `BLOCKED`로 바꾸고 `차단 사유`와 `해소 조건`을 적는다.
- 사람이 해야 할 일(키 발급, 계약서 확보, 의사결정 등)이면 `NEEDS_HUMAN` 태스크를 새로 만들어 의존으로 연결한다.
- LOG에 기록한 뒤 다른 실행 가능한 태스크로 넘어가거나 세션을 끝낸다.

### 3.6 중간에 끊길 것 같을 때
- 태스크를 `IN_PROGRESS`로 둔 채 `CURRENT.md`의 Status·Implementation Status·Handoff Notes를 갱신한다(한 일 / 남은 일 / blocker / 다음 한 걸음). LOG에는 완료·차단 때 적는다.

### 3.7 Orchestrator Handoff Rule
Claude와 Codex는 작업 장소에 따라 번갈아 Orchestrator를 맡는다. 역할 전체와 흐름은 `docs/17_ai-development-workflow.md`.

- 한 Task에는 한 시점에 **하나의 Orchestrator**만 둔다. 두 도구가 같은 Task에 따로 지시하지 않는다.
- 현재 작업 상태의 정본은 대화가 아니라 **`docs/tasks/CURRENT.md`**다. 대화에서 정한 것은 CURRENT·docs·ADR에 적어야 효력이 있다.
- 새 Orchestrator는 시작 전에 `AGENTS.md`, `CURRENT.md`, 관련 ADR, `git status`를 확인하고 CURRENT의 Current Orchestrator를 갱신한다.
- 이전 Orchestrator가 정한 Scope / Out of Scope를 임의로 넓히지 않는다. Accepted ADR을 임의로 바꾸지 않는다. 바꿔야 하면 덮어쓰지 말고 변경 제안이나 새 ADR(Proposed)로 올려 사용자 승인을 받는다.
- 구현 결과가 승인된 계획과 다르면 고치기 전에 먼저 차이를 보고한다. Coding Agent(Antigravity)도 계획과 다른 설계가 필요하면 멈추고 보고한다.
- 세션을 끝낼 때 중요한 상태 변경(결정, 진행 상태, blocker, 다음 한 걸음)을 CURRENT에 남긴다. 대화를 통째로 복사하지 않는다.
- 사용자 승인 없이 commit / push 하지 않는다(4절 규칙 10).

---

## 4. 절대 규칙 요약 (상세: `docs/01_project-rules.md`)

1. 확인되지 않은 사실을 사실처럼 쓰지 않는다. 문서·설정값에는 `[VERIFIED]` `[ASSUMPTION]` `[TO VERIFY]` 태그를 붙인다.
2. **공공 API 응답을 현실의 최신 상태로 취급하지 않는다.** 모든 입력은 출처·신뢰도를 가진 Event이고, 상태는 Reconciliation으로 만든다.
3. LLM은 D&D 금액 계산, 비용 합산, 최적 배치 결정, 상태 확정, 현실 이벤트 생성을 하지 않는다. **숫자는 결정론적 엔진에서만 나온다.** LLM 추출 결과는 후보일 뿐이다.
4. 외부로 나가는 연락은 **사람 승인 뒤에만**. PoC의 메일 발송은 가상 메일함으로만 하고, 예약·배차 시스템 Write는 Scale 단계에서 권한 확보와 ADR을 거친 뒤에만 구현한다.
5. API 키, 실제 B/L 번호, 화주 계약서, 실제 메일 본문, 실제 원본 응답을 **커밋하지 않는다**(마스킹·합성 fixture만 허용).
6. 핵심 로직에서 현재 시각을 직접 읽지 않는다. 기준시각 `as_of`를 주입한다.
7. 금액은 **원(KRW) 정수**로 다룬다. 시각은 **Asia/Seoul 타임존이 붙은 값**만 쓴다.
8. `docs/01_project-rules.md` 4절의 "확정하지 않을 주장"은 코드·UI·문서 어디에도 사실처럼 쓰지 않는다.
9. **Mock / Simulated / Real을 구분한다.** 시나리오 값·Mock 결과는 `is_simulated`, `result_kind = SCENARIO_RESULT`로 표시하고, 실행하지 않은 엔진·LLM·연동의 결과처럼 쓰지 않는다(예: 사람이 쓴 값을 "LLM 추출"이라고 부르지 않는다).
10. 사람이 요청하거나 승인하지 않으면 **git commit / push / 원격 생성을 하지 않는다**. Orchestrator·Coding Agent 모두 같다.
11. **AI를 쓰는 기준은 "입력이 비정형이고 해석이 필요한가"이지 "값이 자주 바뀌는가"가 아니다.** 구조화 입력(폼·포털·TMS·CSV·Human UI)은 Backend 검증만 거친다. LLM 출력은 언제나 후보이고, 신원·권한·근거 강도·상태 확정·숫자·외부 발송은 Backend·결정론이 정한다. 결정론 모듈을 "Agent"라고 부르지 않는다(ADR-026·029, `docs/18` O절 책임 경계표).
12. **외부로 실제 발송은 `Tech Validation` 단계부터**, 등록·검증·승인된 연락처에만, 건마다 사람 승인 뒤에 한다(ADR-027, `docs/01` 6.1절).

---

## 5. 문서 지도

| 문서 | 내용 | 언제 읽나 |
| --- | --- | --- |
| `docs/README.md` | 문서 색인, 읽는 순서, 정본 우선순위, 변경 규칙 | 처음 / 문서 구조를 바꿀 때 |
| `docs/CHANGELOG.md` | 기획 v0.1 → v0.2 변경, 폐기된 가정, 문서 이전 지도, 옛 경로 대응 | 옛 기록을 읽을 때 |
| `docs/01_project-rules.md` | 원칙, 검증 태그, LLM 경계, 금지 주장, 계산·보안·코드 규칙 | **매 세션** |
| `docs/02_product-definition.md` | 제품 정의, 포지셔닝, 고객, 초기 범위, 단계, KPI, BM, Discovery | 제품 방향을 판단할 때 |
| `docs/03_requirements.md` | 기능·비기능 요구사항, 행위자, 화면 목록. **2.6.1절 = 운영자 개입과 재계산**(CERA가 먼저 계산 → 운영자가 입력 수정 → 재계산. 계획 조건은 현실 사실이 아니다) | 기능·UI 작업 |
| `docs/04_domain-model.md` | 엔티티, 생애주기, 자원, 계약·Tariff, 비용, 위험 | 엔진 작업 |
| `docs/05_event-and-state.md` | Event, 출처·신뢰도·신선도, Reconciliation, Canonical State | 수집·상태 작업 |
| `docs/06_agent-architecture.md` | 에이전트 역할, 오케스트레이션, AI vs 결정론, LLM 통합, 사람 게이트 | 에이전트·LLM 작업 |
| `docs/07_backend-architecture.md` | 모듈, 스택, 저장 스키마, API, 레이아웃 | 코드 작업 |
| `docs/08_optimization-model.md` | 복구 최적화 정식화, 비용 계수, Baseline, 재최적화 | 최적화 작업 |
| `docs/09_mvp-scenario.md` | 기준 데모 시나리오 | 모든 구현·데모 작업 |
| `docs/10_simulation-spec.md` | Operations Simulator 요구사항 (현재 Prototype 구현: 2D SVG / Three.js는 향후 선택지) | 프론트·시각화 작업 |
| `docs/11_data-sources.md` | 출처 카탈로그, 공공 API 확인 결과, 조인 경로, 메일 입력 | 수집·연동 작업 |
| `docs/12_roadmap.md` | Phase·Gate·백로그 원천 | 큐를 보충할 때 |
| `docs/13_glossary.md` | 용어집(한/영 표준 표기) | 용어가 헷갈릴 때 |
| `docs/14_decisions.md` | ADR | 설계 결정 전후 |
| `docs/15_open-questions.md` | 미확정 사항, 리스크 | 가정을 세우거나 검증했을 때 |
| `docs/16_frontend-prototype.md` | Control Tower Prototype: 실행, Data Contract, 단계별 화면, 발견한 요구사항 | 프론트·시나리오·계약 작업 |
| `docs/17_ai-development-workflow.md` | AI 협업 개발 Workflow: 역할(사용자·Orchestrator·Planner·Implementer), 흐름, Handoff, Commit Gate | 새 Task 시작·도구 교대·구현 위임 때 |
| `docs/18_external-communication.md` | 외부 통신 **아키텍처(왜 이 구조인가)**: Channel Adapter, Gmail(첫 검증 채널), OAuth·최소 권한, 실패·중복·재시도, Mock→Real, **O절 CERA 전체 책임 경계표** | 연락·메일·채널 설계 판단이 필요할 때 |
| `docs/19_external-communication-requirements.md` | 외부 통신 **요구사항(무엇을 만드나)**: 사용자 흐름, 거래처·연락처·이메일 확인, 발송 자격·승인·발송, 회신·AI 추출 계약, 실패 표, 화면 상태, 완료 조건 | **외부 통신을 구현·계획할 때 (정본)** |
| `docs/20_data-model-preconditions.md` | **DB 설계 전 검토**: DB가 따라야 하는 확정 규칙 24개(A-01~A-24), 원본·파생·계산결과 분류, 검증기 규칙 5분류, 단계별 결정사항 | DB·스키마 작업 전 |
| `docs/21_cera-conceptual-data-model.md` | **개념 데이터 모델 (정본, rev.3, 승인)**: 개념 분류(엔티티·속성·사실·상태·계산·계획·결정·근거), 저장 개념 후보 33개와 그 근거, 관계·ERD, Source of Truth 정책, MVP 구분, Minimum Conceptual Model. 짝 산출물 두 개: **개념 검토 작업표** `docs/21_cera-conceptual-data-model.xlsx`, **RPG 스타일 DB 명세 Preview** `docs/21_cera-db-template-preview.xlsx`. **셋 다 확정 스키마가 아니다** | **데이터 모델·DB 작업 (정본)** |
| `docs/22_cera-logical-data-model.md` | **논리 DB 설계 (정본, rev.2.5)**: 승인된 개념을 테이블·컬럼·관계·제약으로 옮긴 것. 테이블 분류 7종, MVP 52 · Next 1(rev.2.2 `system_error` · rev.2.3 `event_verification_target`), 키·무결성 전략, 금지 안티패턴 10종, **적용 범위와 유효 기간 분리**, 개념→테이블 추적표, 전체 흐름 walkthrough. 짝 산출물 **논리 스키마 작업표** `docs/22_cera-logical-data-model.xlsx`. **DB 제품·ORM·CREATE TABLE·인덱스는 확정하지 않았다** | **논리 스키마·DB 작업 (정본)** |
| `docs/23_runtime-platform-and-observability.md` | **런타임 · 오류 처리 · 관측성 (정본)**: **Main Backend = TypeScript + NestJS · AI Server = 별도 Python 런타임(ADR-033 Accepted)**, Event · Audit · System Error 분리, 공통 오류 처리, `request_id`·`trace_id`, 외부 연동 오류 정규화, Web First, Desktop = Client(Electron 첫 후보), `DesktopBridge`, AI Server 호출 원칙 | **Backend·오류 처리·Desktop·기술 선택을 판단할 때** |
| `docs/24_cera-physical-data-model.md` | **물리 DB 설계 — Slice 1 P0 29표 (Draft, T-080)**: PostgreSQL 타입·ID·CODE·시각·금액·해시·멱등 · FK · append-only 강제 · 부분 유일 · Outbox 잠금 · 트랜잭션 · 내용 저장소 · migration · 시드 · 표별 명세. 짝 작업표 `docs/24_cera-physical-data-model.xlsx`. **SQL·migration 이 아니다. 승인(T-080 DONE) · 논리 기준 `docs/22` rev.2.5** | **U0·U1 구현 · DB 작업 (정본 후보)** |
| `data/scenarios/busan-wh-capacity-01/README.md` | 30대 시나리오 데이터 팩(Prototype 판) | 시나리오 값을 바꿀 때 |
| `docs/data/field-dictionary.md` | 공공 API 필드 사전(공식 명세 기준, 출처 S-nn) | 공공 API 어댑터 작업 |
| `docs/data/code-tables.md` | 공공 API 코드값·에러코드 | 어댑터·파서 작업 |
| `docs/tasks/CURRENT.md` | **현재** 진행 중인 작업 하나의 인수인계 문서 | **매 세션 (가장 먼저)** |
| `docs/tasks/TASK_BRIEF_TEMPLATE.md` | Task Brief 형식 (WHAT / WHY) | 새 Task를 시작할 때 |
| `docs/tasks/QUEUE.md` | **예정** 작업 목록(정본) | **매 세션** |
| `docs/tasks/LOG.md` | **끝난** 작업 기록 (append-only) | **매 세션** |

---

## 6. 개발 명령어

> Node 22(≥ 22.12) 기준. `front/web/` Prototype(`docs/16` 3절)과 `back/` Main Backend(T-085 U0 — NestJS · PostgreSQL · Drizzle)가 있다. `back/` 는 `front/` 와 별도 npm 패키지다(루트 workspace 없음).

```text
[front/web — Control Tower Prototype]  (모든 명령은 front/web 폴더에서)
설치:        cd front/web && npm install
시나리오 검사: npm run validate:scenario     # 데이터 팩 합계·용량·트럭·KPI·금지 표현
타입 검사:    npm run typecheck
린트:        npm run lint
빌드·실행:    npm run build && npm run start  # http://localhost:3000
브라우저 확인: npm run smoke                  # 서버가 떠 있을 때. Edge/Chrome 헤드리스, 스크린샷 front/web/.smoke/
개발 서버:    npm run dev

[로컬 PostgreSQL 18.6 — Docker]  (저장소 루트에서. 처음 한 번: infra/local/.env.example → infra/local/.env)
켜기:        docker compose -f infra/local/compose.yaml --env-file infra/local/.env up -d --wait
끄기:        docker compose -f infra/local/compose.yaml --env-file infra/local/.env down      # 데이터 삭제는 down -v

[back — Main Backend (NestJS)]  (모든 명령은 back 폴더에서. 처음 한 번: back/.env.example → back/.env)
설치:        npm install
타입 검사:    npm run typecheck
시험:        npm test                 # unit + db(로컬 PostgreSQL 필요). 따로: npm run test:unit / npm run test:db
빌드:        npm run build
API:         npm run dev:api          # http://127.0.0.1:3100/health  (빌드본: npm run start:api)
Worker:      npm run dev:worker       # 기동 점검만: npx tsx src/worker.ts --once  (빌드본: npm run start:worker)
migration:   npm run db:generate → 생성 SQL 검토 → 커밋 → npm run db:migrate   # push 금지(ADR-034). 소유 역할로 M01~M10 적용, 반복 실행 안전
custom SQL:  npm run db:generate:custom -- --name <이름>   # 트리거·권한 등 사람이 쓰는 migration(M07~M10 방식)
시드:        npm run db:seed          # local·test 만. 고정 UUIDv7, 반복 실행 안전. 내용 파일은 CERA_CONTENT_DIR(gitignore)
OpenAPI:     npm run openapi:emit     # → packages/contracts/openapi.json (DB 시험이 최신인지 검사). 실행 중 API: GET /openapi.json

[ai]  (구현 전)
로컬 실행:       (T-052 / T-054에서 정의)
시나리오 CLI:    (T-046에서 정의)
```
