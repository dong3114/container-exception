# 14. 설계 결정 기록 (ADR)

- 상태: Living (기획 v0.2)
- 최종 수정: 2026-09-22 (**ADR-034 영속 계층 = PostgreSQL + Drizzle ORM + drizzle-kit 생성·검토 SQL migration — Q-68 사용자 결정, Accepted. ADR-004 Superseded(SQLite 미사용).**) 이전: 2026-09-21 (**ADR-033 Main Backend = NestJS + TypeScript, AI Server = 별도 Python 런타임 — Q-64 사용자 결정, Accepted. ADR-002 Superseded, ADR-031 결정 1·2·8 Superseded.** 같은 날 앞서: **ADR-032 메일 근거 시각 + 기록·내용 분리 보관 — Q-44 · Q-45 사용자 결정, Accepted.** 보관 기간 숫자는 미결). 이전: 2026-09-18 (**T-079 최종 정리: ADR-030 오류·관측성 원칙, ADR-031 런타임 방향(Backend 우선 후보 NestJS · Web First · Desktop = Client · Electron 첫 후보 · AI 분리 조건) 추가 — 둘 다 Proposed.** ADR-002·024 에 2026-09-18 주석). 이전: 2026-09-16 (**T-072: ADR-019·020·021을 `Accepted (구조 한정)`으로 판정** — 구조는 승인, 정책 파라미터는 계속 검증. 상태 값에 `Accepted (구조 한정)` 도입). 같은 날 T-068: ADR-026 Channel Adapter·Gmail 첫 검증 채널, ADR-027 Tech Validation 단계, ADR-028 통신 도메인 저장·OpenAPI 전환 추가 + 책임 경계 Audit으로 ADR-026·027·028 개정 + **ADR-029 결정론 엔진 분리** 추가. 이전: 2026-09-15 (ADR-025 AI 협업 Workflow 추가. 같은 날 ADR-024 Monorepo 추가. 같은 날 ADR-022·023 추가, ADR-014·016 주석. 이전: 2026-09-11 v0.2 ADR-011~018 추가, `09_decisions.md`에서 이름 변경)

상태 값: `Proposed`(제안, 사람 승인 전) · `Accepted`(확정) · **`Accepted (구조 한정)`**(구조·형태는 확정, 그 안의 파라미터 값은 계속 검증. 2026-09-16 도입) · `Superseded by ADR-NNN`(대체됨) · `Rejected`(기각).
`Accepted` ADR은 에이전트가 혼자 뒤집지 않는다. 바꾸려면 새 ADR을 `Proposed`로 올린다.
기존 ADR의 본문은 결정 당시 이유를 보존하기 위해 고치지 않고, 바뀐 의미는 `v0.2 주석`으로 덧붙인다.

새 ADR 템플릿:

```markdown
## ADR-NNN: 제목
- 상태: Proposed
- 날짜: YYYY-MM-DD
- 맥락: 왜 결정이 필요한가
- 결정: 무엇을 하기로 했나
- 대안: 검토한 다른 선택지와 버린 이유
- 결과: 이 결정으로 생기는 영향·제약
```

## 요약

| ADR | 제목 | 상태 |
| --- | --- | --- |
| 001 | 문서 체계 | Proposed (v0.2 구조로 갱신) |
| 002 | 백엔드 스택 Python | **Superseded by ADR-033** (2026-09-21 사용자 결정 — Main Backend 는 NestJS + TypeScript. Python 은 **별도 AI Server 런타임**으로만 쓴다) |
| 003 | PoC UI Streamlit | **Superseded by ADR-016** |
| 004 | SQLite → PostgreSQL | **Superseded by ADR-034** (2026-09-22 사용자 결정 — SQLite 는 쓰지 않는다. 로컬·시험·운영 모두 PostgreSQL) |
| 005 | 마일스톤 유도 + 예외 오버레이 | Proposed (ADR-012 아래의 뷰로 유지) |
| 006 | 금액·시각 규칙 | Proposed |
| 007 | 최적화 솔버 후보 CP-SAT | **Reopened → Proposed** (v0.2, 2026-09-11. 선택은 T-036) |
| 008 | LLM 역할 경계 | **Accepted** |
| 009 | 최적화 2단계 분해 | Proposed |
| 010 | PoC 범위 부산 FCL 수입 | Proposed |
| 011 | System of Decision 포지셔닝, 공공데이터 비진실원천 | Proposed |
| 012 | Event 모델 + Source Priority + Reconciliation | Proposed (전역 우선순위 규칙은 **Superseded by ADR-019**) |
| 013 | Append-only Event 테이블 + 물질화 상태 | Proposed |
| 014 | Freshness 정책 | Proposed (T-032에서 근거 시각 정의 추가) |
| 015 | 역할 분리 에이전트 + 결정론 오케스트레이터 | Proposed |
| 016 | 웹 프론트엔드 + Three.js | Proposed |
| 017 | 사람 확인 게이트와 LLM 후보 이벤트 | Proposed (T-032 패치: "계획 승인 = 확인" 폐기, 사실 확인과 계획 승인 분리) |
| 018 | 시나리오 재생 우선 PoC | Proposed |
| 019 | Reconciliation Policy: 근거 강도 × 최근성 × 신선도, 강도 가드·동시 충돌·불리한 변경 보류 | **Accepted (구조 한정)** (2026-09-16 사람 결정). **정책 파라미터 값은 계속 검증** |
| 020 | 출처 3축(채널·역할·추출 방식)과 상태 차원 분리 | **Accepted (구조 한정)** (2026-09-16 사람 결정). 값 목록·강도 매핑은 계속 검증 |
| 021 | 컨테이너 상태 = Hybrid (사실 + 유도 단계 + 예외 오버레이 + 영향) | **Accepted (구조 한정)** (2026-09-16 사람 결정). 단계 목록 적합성(Q-32)은 계속 검증 |
| 022 | 프론트엔드 = Next.js + 2D SVG 운영 지도 + Data Contract/Mock Provider (ADR-016의 Vite·Three.js 부분 개정) | Proposed (T-062·T-063, 2026-09-15) |
| 023 | 개발 순서 = Prototype 먼저 (T-036 최적화 명세 DEFERRED) | Proposed (2026-09-14 사람 지시, 2026-09-15 기록) |
| 024 | 저장소 = 하나의 Private Monorepo + 책임 영역(front·back·ai·packages·data·docs·infra) | **Accepted** (2026-09-15 사람 결정). **`ai/` 영역 정의는 ADR-029로 개정됨**(2026-09-16). 계약 정본 OpenAPI는 ADR-028로 확정, Desktop(Tauri)은 여전히 미확정 |
| 025 | AI 협업 개발 Workflow: 한 Task 한 Orchestrator(Claude 또는 Codex), 인계 정본 `CURRENT.md`, Brief(WHAT) → Plan(HOW) → Implement → Review → Docs Sync → 사용자 승인 → Commit | **Accepted** (2026-09-15 사람 결정). ADR-001 확장 |
| 026 | 외부 통신 = Channel Adapter 추상화. Gmail은 최종 채널이 아니라 **첫 기술검증 채널**. 구조화 채널은 LLM을 거치지 않는다 | **Accepted** (2026-09-16 사람 결정) |
| 027 | 제품 단계에 `Tech Validation` 신설 — 검증·승인된 연락처에만, 건별 승인 뒤 실제 발송 (`01` 6절 개정) | **Accepted** (2026-09-16 사람 결정) |
| 028 | 통신 도메인 저장 분리(`comm_*`) + Counterparty→Contact→Address 3상태 발송 자격 + 쓰기 계약(`CeraCommandClient`)과 OpenAPI 정본 전환 시작 | **Accepted** (2026-09-16 사람 결정) |
| 029 | **결정론 엔진(Tariff·Cost·Risk·Reconciliation·Optimize·Solver)을 `ai/`에서 분리** — `ai/`는 LLM·비정형 처리만. 새 `engine/`은 만들지 않음. ADR-024 영역 정의 개정 | **Accepted** (2026-09-16 사람 결정). 실행은 T-003 |
| 030 | **오류·관측성 원칙**: Event · Audit · System Error 세 기록 분리, 중요한 오류만 `system_error`(DB), 세 경계(API·연동·작업) 공통 오류 처리, `request_id`·`trace_id`, 외부 연동 오류 정규화 | Proposed (2026-09-18) |
| 031 | **런타임 방향**: Web First, Desktop = 중앙 Backend 의 Client(Electron 첫 후보), `DesktopBridge`, 같은 OpenAPI 계약. **결정 1·2(Backend 후보)와 8(AI 분리 조건)은 ADR-033 이 대체**(2026-09-21) | Proposed (Desktop·Web First 부분) · **결정 1·2·8 Superseded by ADR-033** |
| 032 | **메일 근거 시각 + 기록·내용 분리 보관**: 메일 `source_recorded_at` 은 `Date` 헤더가 정상이고 채널 수신 시각보다 **미래가 아니면** `Date`, 아니면 채널 수신 시각(원래 두 시각 보존, Q-44). 실제 메일은 **기록과 내용을 분리** — 행 삭제 ≠ 내용 파기. 원문·본문·인용·승인 문장은 참조 + 지문으로 기록에 붙고 보관 정책에 따라 내용만 파기, 파기는 감사(Q-45). **보관 기간 숫자는 미결(Pilot 정책)** | **Accepted** (2026-09-21 사용자 결정 — 구조·규칙 확정, 기간 숫자 제외) |
| 033 | **Main Backend = TypeScript + NestJS**(모듈형 모놀리스, 같은 코드베이스의 API + Worker 프로세스) · **AI Server = 별도 Python 런타임**(권한 없음, HTTP/JSON) · 큐 제품 없이 DB Outbox · OpenAPI → 생성 TS 타입 · 스키마 단일 원천 · 정확성 규칙 5가지 | **Accepted** (2026-09-21 사용자 결정 — Q-64 CLOSED) |
| 034 | **영속 계층 = PostgreSQL + Drizzle ORM(SQL-aware Hybrid) + drizzle-kit 생성 SQL migration 을 사람이 검토·커밋 뒤 명시 적용** · SQLite 미사용 · DB 권한은 Main Backend 만 · 운영 자동 동기화 금지 | **Accepted** (2026-09-22 사용자 결정 — Q-68 CLOSED) |
| 035 | **프론트엔드 = Vite + React SPA, 클라이언트 렌더링(CSR)만** — 서버 렌더링(SSR·RSC) 없음, `vite build` → 정적 파일. Backend 는 개발 서버 `/backend` 프록시로 부른다. 라우터 라이브러리는 아직 고르지 않음. ADR-022 결정 1(Next.js)·4(Turbopack root) 대체 | **Accepted** (2026-10-06 사용자 결정) |
| 036 | **Agent Runtime = Python + LangGraph** — 권한은 NestJS Backend, Agent 는 typed Tool 로만 부작용 · Agent 는 권한 주체가 아니다 (ADR-015 일부 대체 · ADR-033 결정 3·4 일부 개정) | **Accepted** (2026-10-22) |
| 038 | **Recovery Solver = HiGHS(highs-js) 0-1 MIP, Backend 프로세스 안** — 결정론(단일 스레드 · gap 0 · 3단계 동률 해소) · 계수는 Cost Engine 의 KRW 정수 · LLM · Agent 는 숫자를 만들지 않는다. ADR-007(CP-SAT 후보) 대체 제안 | **Proposed** (2026-10-26, T-113 — 사용자 검토 대기) |
| 037 | **AI 공급자 · 모델 선정 방식 — 공급자는 ADR, 모델은 설정** · 평가(CERA Eval)로 교체 · AI 는 권한 없음. 선정(공급자 · 모델)은 비워 둠 — MVP 임시 기본값 = 로컬 Qwen3-4B-Instruct-2507 Q4_K_M | **Accepted (구조 한정)** (2026-10-26 사용자 지시) · 선정 Deferred |

---

## ADR-001: 문서 체계 — AGENTS.md 진입점 + docs 정본 + 작업 큐
- 상태: Proposed
- 날짜: 2026-09-10
- 맥락: 여러 AI 에이전트가 번갈아 작업해도 문서만 읽고 이어갈 수 있어야 한다.
- 결정: 루트 `AGENTS.md`는 읽는 순서와 작업 프로토콜만, 내용 정본은 `docs/`에 둔다. 작업은 `docs/tasks/QUEUE.md`에서 고르고, 끝나면 다음 작업을 큐잉하며 `LOG.md`에 인계를 남긴다. `CLAUDE.md`는 `@AGENTS.md`를 가져오기만 한다.
- 대안: 단일 거대 README(에이전트가 매번 전부 읽어야 해서 비효율), 이슈 트래커(오프라인 에이전트가 접근하기 어려움).
- 결과: 문서와 코드가 어긋나지 않도록 태스크 완료 조건에 "문서 갱신"을 넣어야 한다.
- **v0.2 주석 (2026-09-11)**: 원칙은 유지한다. 정본 파일 구성을 01~15로 재편했고, 기획 변경 이력은 `CHANGELOG.md`에 요약한다. 옛 기획 문서는 저장소에 남기지 않는다(git 이력으로만 보존).

## ADR-002: 기술 스택 — Python 3.12 + Pydantic + OR-Tools + FastAPI
- 상태: **Superseded by ADR-033** (2026-09-21 사용자 결정 — Q-64). 원래 상태는 Proposed. 본문은 결정 당시 기록으로 남긴다
- 날짜: 2026-09-10
- 맥락: 최적화(OR-Tools), XML 공공 API, LLM 연동이 모두 필요하다. 1인 + 에이전트 개발이다.
- 결정: `07_backend-architecture.md` 3절의 스택.
- 대안: TypeScript/Node(OR-Tools 바인딩이 약함), Java(개발 속도).
- 결과: UI는 별도 결정(ADR-003 → ADR-016).
- **v0.2 주석**: 백엔드 스택은 그대로다. LLM SDK(Anthropic Python SDK)와 SSE가 추가됐다. 프론트엔드는 ADR-016.
- **2026-09-21 주석 — Superseded by ADR-033**: 사용자가 **Main Backend = TypeScript + NestJS** 로 결정했다(Q-64). Python 은 Main Backend 가 아니라 **별도 AI Server 런타임**(초안 문장 · 추출 후보 등 AI 전용)으로 쓴다. 이 ADR 의 Python 스택(Pydantic · FastAPI · APScheduler · pytest 등)은 **Main Backend 기술로는 폐기**되고, AI Server 의 구체 패키지는 구현 시점에 정한다. 솔버 위치는 Q-65 로 남는다.
- **2026-09-18 주석**: 사용자가 Backend 언어를 다시 검토하고 있다. **현재 우선 후보는 NestJS + TypeScript**(ADR-031 Proposed, `docs/23` 3절)이고 Java / Spring Boot 도 후보다. 이 ADR 은 **폐기하지 않고 Proposed 로 둔다.** 최종 결정이 나면 `Superseded by ADR-031` 또는 Accepted 로 정리한다. 이 ADR 의 대안 줄에 적힌 "TypeScript/Node(OR-Tools 바인딩이 약함)"는 여전히 유효한 위험이며 `docs/23` 3.3 에서 선택지로 다룬다.

## ADR-003: PoC UI — Streamlit
- 상태: **Superseded by ADR-016** (Proposed 상태에서 대체됨, 2026-09-11)
- 날짜: 2026-09-10
- 맥락: 공모전·PoC 데모가 우선이고 화면 수가 적다.
- 결정: V0.1~V0.2는 Streamlit. V0.1은 서비스 계층을 직접 호출하고, V0.2부터 FastAPI를 분리한다.
- 대안: Next.js + FastAPI(완성도는 높지만 초기 속도가 느림).
- 결과: 공모전 심사에서 UI 완성도가 중요하면 T-013 전에 다시 결정한다(Q-10).
- **대체 이유**: v0.2는 Three.js 2.5D 시뮬레이터, 실시간 Agent Activity Timeline, 짧은 액션 UI가 필요하다. Streamlit으로는 이 상호작용을 만들기 어렵다.

## ADR-004: 저장소 — SQLite(PoC) → PostgreSQL
- 상태: **Superseded by ADR-034** (2026-09-22 사용자 결정 — Q-68). 원래 상태는 Proposed. 본문은 결정 당시 기록으로 남긴다
- 날짜: 2026-09-10
- 결정: SQLAlchemy 2.x + Alembic으로 추상화하고 PoC는 SQLite 파일 하나를 쓴다. JSON 컬럼은 두 DB에서 모두 동작하는 방식만 쓴다.
- 결과: 동시 쓰기가 많아지는 V1 전에 PostgreSQL로 옮긴다.
- **v0.2 주석**: 유지. "V1 전"은 "Pilot 전"으로 읽는다. 저장 구조는 ADR-013.
- **2026-09-22 주석**: ADR-034 가 대체한다. SQLite 단계를 두지 않고 처음부터 PostgreSQL 을 쓴다. SQLAlchemy·Alembic 은 Python Backend(ADR-002, Superseded) 전제였으므로 함께 폐기한다.

## ADR-005: 상태 = 마일스톤 유도 + 예외 오버레이
- 상태: Proposed
- 날짜: 2026-09-10
- 맥락: 기획서의 S0~S9는 선형이지만, 실제로는 입항 전 통관처럼 순서가 바뀌고 이벤트가 늦게 도착한다. 예외는 메인 상태와 동시에 존재한다.
- 결정: 이벤트는 마일스톤 타임스탬프를 채우고, 메인 상태는 마일스톤 조합으로 계산한다. 예외는 별도 플래그 목록으로 둔다.
- 대안: 엄격한 FSM 전이(순서가 바뀐 이벤트를 처리할 수 없음).
- 결과: 상태 유도 함수는 순수 함수이며 이벤트 순서와 무관하게 같은 결과를 내야 한다(속성 테스트로 검증).
- **v0.2 주석**: 유지하되 위치가 바뀐다. 마일스톤 값은 이제 Event가 직접 채우지 않고, **Reconciliation(ADR-012)을 거친 Canonical 마일스톤 사실**에서 온다. 메인 상태는 그 위의 파생 뷰다(`04_domain-model.md` 2절). S1 도달 불가 문제(Q-22)는 열려 있다.
- **T-032 주석 (2026-09-11)**: ADR-021(Hybrid)이 이 결정을 확장한다. 마일스톤 조합 + 예외 오버레이는 유지하고, `customs.status`·`location` 사실과 자원 영향 층을 더했다. Q-22는 ADR-021의 유도 규칙으로 해결했다(ADR-021 판정에 따름).

## ADR-006: 금액·시각 규칙
- 상태: Proposed
- 날짜: 2026-09-10
- 결정: 금액은 KRW 정수. 외화 Tariff는 환율과 환율 기준일을 기록한 뒤 환산한다(반올림 규칙은 T-011에서 정함). 시각은 Asia/Seoul 타임존이 붙은 값만 쓰고, 엔진은 `as_of`를 주입받는다.
- 결과: CP-SAT 목적함수 계수가 정수라서 그대로 쓸 수 있다. (v0.2 주석: 솔버는 ADR-007 재개로 미정. 정수 계수는 어느 후보에도 유리하다)
- **v0.2 주석**: 유지. 반올림 규칙은 T-043(Tariff·Cost 엔진)에서 정한다(옛 T-011은 폐기된 ID).

## ADR-007: 최적화 1차 후보 — OR-Tools CP-SAT
- 상태: **Superseded by ADR-038** (2026-10-27 — MVP 는 HiGHS 0-1 MIP). 이전: **Reopened → Proposed** (2026-09-11, 사람 검토 지시). 이전 상태: Accepted (2026-09-10, 원본 기획서 결정 승계)
- 날짜: 2026-09-10 (재개 2026-09-11)
- 결정(원문 보존): 1차 구현은 CP-SAT. 실제 데이터 구조를 확보한 뒤 MILP / min-cost flow / VRP / scheduling 조합과 비교한다(T-021).
- **재개 이유 (2026-09-11)**: 이 ADR의 Accepted 상태는 v0.1 원본 기획서를 그대로 이어받은 것이다. CERA V0.2 Master Planning 정본에서 솔버 선택은 확정 사항이 아니다. CP-SAT은 **현재 후보**이고, 실제 문제 구조(MVP 시나리오의 변수·제약·재최적화 요구)를 확정한 뒤 CP-SAT / MILP / min-cost flow / VRP / scheduling 등을 비교해 **가장 단순하고 검증 가능한 구조**를 고르는 것이 Open Question이다. T-031·T-032 보고에서 이 ADR을 `[DECIDED]`로 유지한 것은 v0.2 정본과 충돌했으므로 바로잡는다.
- **v0.2 기준 결정**: 솔버는 정하지 않는다. T-036(Recovery 최적화 모델 명세)에서 후보를 비교하고 이 ADR을 Accepted / Superseded 중 하나로 다시 올린다. 그 전까지 문서의 CP-SAT 언급은 모두 "후보"로 읽는다. 정수 KRW 계수(ADR-006), 결정론·재현성(NFR-01) 요구는 어떤 솔버를 고르든 유지한다. Open Question Q-35.
- **v0.2 주석**: 유지. 비교 메모(옛 T-021)는 폐기된 ID이며, 규모가 커질 때 새 태스크로 만든다.

## ADR-008: LLM 역할 경계
- 상태: Accepted (원본 기획서 원칙 승계)
- 날짜: 2026-09-10
- 결정: LLM은 D&D 금액을 계산하거나 최적안을 고르지 않는다. 비정형 자료(계약 PDF)와 커뮤니케이션 계층(질의 해석, 설명)에만 쓴다. 상세는 `01_project-rules.md` 3절.
- **v0.2 주석**: 유지(뒤집지 않음). v0.2의 메일 읽기·회신 구조화는 "비정형 자료", 메일 초안·회신 요약은 "커뮤니케이션 계층"에 해당하므로 이 결정 안에 있다. 추가 제약(추출 결과는 후보일 뿐 확정 아님)은 ADR-017. "V0.1에는 LLM이 없다"는 옛 규칙은 폐기했다(`CHANGELOG.md` D-9).

## ADR-009: 최적화 2단계 분해
- 상태: Proposed
- 날짜: 2026-09-10
- 맥락: `x[c,y,t,s]`를 그대로 쓰면 최대 약 50만 개 변수가 된다.
- 결정: 1단계는 `x[c,r,s]` 배정(트럭은 슬롯별 대수 용량). 2단계 개별 트럭 배정·순서는 V1에서 한다.
- 대안: 단일 통합 모델(규모 문제), 휴리스틱만(최적화 근거 약함).
- 결과: 1단계 결과가 2단계에서 실행 불가능할 수 있다. V1에서 피드백 루프가 필요하다.
- **v0.2 주석**: 유지. "V1"은 "Pilot 이후"로 읽는다. 1단계에 ODCY 입고일 차원과 계획 변경 벌점을 더했다(`08_optimization-model.md` 3절).

## ADR-010: PoC 범위 — 부산항 FCL 수입
- 상태: Proposed
- 날짜: 2026-09-10
- 결정: PoC 대상은 부산항, FCL, 수입 컨테이너로 한정한다. LCL, 수출, 다른 항만은 범위 밖이다.
- 결과: Watchlist 검증에서 범위 밖 건은 경고와 함께 제외한다.
- **v0.2 주석**: 유지·강화. 규모는 컨테이너 30대 안팎, 대표 예외는 창고 수용량 감소로 좁힌다(`02_product-definition.md` 5절).

---

## ADR-011: 포지셔닝 — System of Decision / Action Layer, 공공데이터는 진실원천이 아니다
- 상태: Proposed
- 날짜: 2026-09-11
- 맥락: v0.1은 "공공데이터 → 상태 → D&D 위험 → 최적화" 구조였고, 공공데이터의 반영 속도를 믿을 수 있다는 전제를 가졌다. 공공 API의 반영 지연 SLA는 확인되지 않았고(R-1), DS-02에는 컨테이너별 이벤트 일시도 없다(T-004).
- 결정: CERA는 FMS·Visibility·공공 시스템을 대체하지 않는 **결정·실행 층**이다. 공공데이터를 포함한 모든 입력을 출처·신뢰도를 가진 Event로 받아 Canonical Operational State를 만든다. 공공데이터의 역할은 자동 초기화, 교차 검증, 히스토리 보강으로 제한한다. D&D는 첫 번째 대표 Exception이다.
- 대안: (a) v0.1 유지 — 공공 API 지연이 크면 제품 가치가 무너진다. (b) 사람 입력만 — 자동화 가치가 없다.
- 결과: 사람 확인 UX, Reconciliation, 커뮤니케이션 루프가 핵심 기능이 된다. 공공 API 실데이터 검증은 PoC의 선행 조건에서 병행 트랙으로 내려간다.

## ADR-012: Event 모델 + Source Priority + Reconciliation
- 상태: Proposed
- 날짜: 2026-09-11
- 맥락: 같은 사실을 여러 출처가 다르게 말한다(사용자 = 반출 완료, 공공 API = 터미널 장치 중).
- 결정: 모든 입력은 `05_event-and-state.md` 3절의 Event로 저장한다. 같은 `(subject, fact_key)`에 대해 규칙 R1~R8로 이긴 값을 정한다. 우선순위 가설은 HUMAN_CONFIRMED > PARTNER_SYSTEM > PUBLIC_API(= HUMAN_REPORTED) > EMAIL/DOCUMENT_EXTRACTED > INFERRED이고, 같으면 발생 시각이 늦은 쪽이다. 조건을 만족하는 차이는 Conflict로 드러낸다.
- 대안: (a) 최신 시각 우선 — 느린 공공 API의 늦게 온 옛 값이 사람 확인을 덮는다. (b) 출처별 고정 필드 소유 — 필드마다 믿을 출처가 상황에 따라 달라서 경직된다. (c) 가중 점수 합산 — 설명하기 어렵고 재현·디버깅이 힘들다.
- 결과: 우선순위는 **가설**이다(Q-23). 정책은 `policy.yaml`에 두고 버전을 매긴다. Canonical State는 `(events, policy_version, as_of)`의 순수 함수다.
- **T-032 주석 (2026-09-11)**: Event로 모든 입력을 받는다는 결정과 Conflict를 드러낸다는 결정은 유지한다. "우선순위가 가장 높은 출처 → 같으면 늦은 것"이라는 **전역 우선순위 선택 규칙(R3)은 ADR-019로 대체**한다. 같은 사람도 사실에 따라 권한이 다르고, 강한 출처의 오래된 값이 약한 출처의 최신 값보다 항상 옳지 않기 때문이다. 출처 유형 값(`HUMAN_CONFIRMED` 등)은 ADR-020으로 대체한다.

## ADR-013: 저장 방식 — Append-only Event 테이블 + 물질화된 Canonical State
- 상태: Proposed
- 날짜: 2026-09-11
- 맥락: 현재 상태만 저장하면 출처·이력·충돌 근거를 잃는다. 반대로 풀 Event Sourcing은 1인 PoC에 과하다.
- 결정: `events`(INSERT만)와 `raw_inputs`를 진실한 기록으로 두고, `canonical_facts`·`conflicts`·`verification_requests`는 Reconciliation이 다시 계산하는 **파생 테이블**로 둔다. Event 수정은 없고 정정은 `supersedes` Event로 한다. 확인 상태도 `VERIFICATION_RECORDED` Event로부터 계산한다.

  | 비교 | 풀 Event Sourcing | Append-only + 물질화 (선택) | 현재 상태만 |
  | --- | --- | --- | --- |
  | 이력·근거 | 완전 | 완전 | 없음 |
  | 구현 부담 | 큼(애그리게이트, 커맨드, 스냅샷, 프로젝션 버전) | 작음(테이블 2개 + 재계산 함수) | 가장 작음 |
  | 재현성 | 높음 | 높음(정책 버전 포함) | 낮음 |
  | 30대 PoC 적합성 | 과함 | 적합 | 부적합 |
- 대안: 위 표.
- 결과: 파생 테이블은 언제든 지우고 재생성할 수 있어야 한다(테스트로 확인). 규모가 커지면 subject 단위 증분 재계산과 스냅샷을 추가한다.

## ADR-014: Freshness 정책
- 상태: Proposed
- 날짜: 2026-09-11
- 맥락: 공공 API 응답은 방금 받았어도 내용은 오래됐을 수 있다. 오래된 사실로 비용이 큰 판단을 하면 안 된다.
- 결정: 신선도는 `as_of − (source_event_time ?? received_at)`으로 계산하고, `source_type × fact_key`별 기준으로 FRESH / AGING / STALE을 정한다. STALE인 중요 사실은 확인을 요청하고, 그 사실을 쓴 계획에는 경고를 붙이며, 계획 승인 전에 확인을 요구한다. 발생 시각이 없는 출처는 `time_basis = RECEIVED`로 표시한다.
- 대안: 신선도 무시(v0.1) / 오래되면 자동 폐기(값이 사라져 판단 불가).
- 결과: 기준값은 **정하지 않았다**(Q-24). PoC 시나리오는 데모용 `[ASSUMPTION]` 값을 쓴다.
- **T-032 주석 (2026-09-11)**: 신선도 기준 시각을 "근거 시각"(`05_event-and-state.md` 5.2)으로 구체화했다: `max(source_event_time, source_recorded_at ?? received_at − lag_allowance)`. 공공 API의 `lag_allowance`는 R-1 실측 전까지 ∞로 취급해, 수신 시각이 방금이어도 응답 속 발생 시각 기준으로만 신선도를 판단한다. 기준값은 사실 계열별로 두고 `EXPIRED`(제안 시간창 경과)를 추가했다. STALE이어도 값은 UNKNOWN으로 바꾸지 않는다.
- **T-032 패치 주석 (2026-09-11, 사람 검토 지시)**: 위 `max(...)` 공식과 "공공 API 지연 허용 ∞"를 **폐기**하고 3단계 폴백으로 단순화했다: `source_event_time`(EVENT_TIME) → `source_recorded_at`(RECORDED_TIME) → `received_at`(RECEIVED_ONLY). 수신 시각에서 지연을 빼서 현실 시각을 추정하지 않는다. 옛 공식이 막던 오류(변경 시각을 넣어 더 늦게 안 값이 지는 것)는 "STATE의 `source_event_time` = 관측 시각, 변경 시각은 `payload.changed_at`"이라는 어댑터 매핑 정의로 막는다. 공공 API는 fetch 시각을 `source_event_time`으로 쓰지 않으며, 시각이 없으면(RECEIVED_ONLY) STALE로 취급한다(`05_event-and-state.md` 5.2).
- **T-060 주석 (2026-09-15, 사람 지시)**: 바로 위 "RECEIVED_ONLY → STALE 취급"을 **폐기**한다. "언제 발생했는지 모른다"는 "오래됐다"가 아니다. RECEIVED_ONLY면 `freshness_status = UNKNOWN`, `temporal_confidence = LOW`, `evidence_time_quality = RECEIVED_ONLY`(옛 이름 `temporal_quality`)로 둔다. 중요 사실이면 STALE과 같은 게이트(확인 요청·재조회·계획 승인 차단, 사유 `FRESHNESS_UNKNOWN`)를 건다. 모든 출처에 같게 적용한다(옛 "그 밖 출처는 received_at으로 계산"도 폐기). 결정 본문의 `time_basis = RECEIVED`는 `evidence_time_quality = RECEIVED_ONLY`로 읽는다(`05_event-and-state.md` 5.2).

## ADR-015: 역할 분리 에이전트 + 결정론 오케스트레이터
- 상태: Proposed — **일부 대체 by ADR-036 (2026-10-22)**: "LLM 은 … 도구를 주지 않는다"와 대안 기각 "LLM 플래너" 부분만. 업무 이벤트 핸들러 표 · 루프 폭주 방지 · 결정론 안전 규칙 · 승인/발송 권한 · 숫자 계산 권한은 그대로
- 날짜: 2026-09-11
- 맥락: "멀티에이전트"를 여러 LLM의 자율 대화로 만들면 재현성·안전성·디버깅이 무너진다.
- 결정: 10개 역할(`06_agent-architecture.md` 2절)을 책임이 분리된 모듈로 만들고, 공유 Event Store / Canonical State / Rule Engine / Solver를 쓴다. 흐름은 in-process 작업 큐와 명시적 핸들러 표로 제어한다. LLM은 추출·초안·설명의 말단 함수로만 쓰며 도구를 주지 않는다.
- 대안: LLM 플래너 에이전트(비결정적, 검증 어려움), 메시지 브로커 기반 분산 에이전트(PoC에 과함).
- 결과: 모든 단계가 Agent Activity를 남겨 타임라인과 감사의 근거가 된다. 루프 폭주 방지(디바운스, 입력 해시)가 필요하다.

## ADR-016: 웹 프론트엔드 + Three.js (ADR-003 대체)
- 상태: Proposed
- 날짜: 2026-09-11
- 맥락: 2.5D Operations Simulator, 실시간 Activity Timeline, 짧은 액션 UI, 인터뷰·공모전용 영상이 필요하다.
- 결정: `web/`에 TypeScript + React + Vite + Three.js(@react-three/fiber)로 한 앱을 만든다. 백엔드와는 REST + SSE로 통신한다. 프론트에는 비즈니스 로직을 넣지 않는다.
- 대안: Streamlit(3D·실시간 상호작용이 약함), 순수 Three.js + 바닐라 JS(대시보드 화면 생산성이 낮음), 게임 엔진(과함).
- 결과: 프론트엔드 언어가 하나 늘어난다. T-003에서 `web/` 뼈대를 함께 만든다. 공모전 요강(Q-15)에 따라 조정할 수 있다.
- **2026-09-15 주석**: 사람 지시(2026-09-14)로 `web/`을 **Next.js**(App Router) + React + TypeScript로 먼저 만들었고, 운영 지도는 Three.js 대신 2D SVG로 그렸다. "웹 프론트엔드, REST(+SSE), 프론트에 비즈니스 로직 없음"은 유지하고 빌드 도구·3D 부분만 ADR-022로 개정 제안한다.

## ADR-017: 사람 확인 게이트와 LLM 후보 이벤트
- 상태: Proposed
- 날짜: 2026-09-11
- 맥락: LLM이 메일·계약서에서 뽑은 값이 틀려도 그대로 확정되면 비용 판단이 틀어진다. 반대로 모든 값에 확인을 요구하면 루프가 멈춘다.
- 결정: (1) LLM이 추출한 **컨테이너 사실**은 사람 확인 전에는 Canonical State에 들어가지 않는다. (2) 상대방이 제안한 **자원·견적 사실**은 PROVISIONAL로 들어가 재계획에 쓰이며, 계획 승인이 곧 그 입력의 확인이다. (3) 계약 조건은 최초 1회 확인해야 규칙이 된다. (4) 외부 발송은 항상 사람 승인 뒤에만 한다. 게이트는 G1~G5(`06_agent-architecture.md` 7절).
- 대안: 신뢰도 임계값 이상 자동 확정(LLM 자기평가를 믿을 수 없음), 전부 수동 확인(루프가 멈춤).
- 결과: 추출 신뢰도는 결정론적 검증기로 정한다. Pilot에서 확인 부담(클릭 수)을 측정해 조정한다(R-7).
- **T-032 패치 개정 (2026-09-11, 사람 검토 지시)**: 결정 (2)의 "계획 승인이 곧 그 입력의 확인이다"를 **폐기**한다.
  - Plan Approval("이 스냅샷 기준으로 계획을 실행해도 된다")과 Fact Verification("이 사실이 현실이다")은 다른 도메인 행동이다. 계획을 승인했다고 입력 사실이 CONFIRMED가 되지 않는다.
  - CONFIRMED 전환 근거는 명시적 사람 `VERIFICATION`, 권한 A 파트너·시스템의 같은 사실 보고, 정책이 인정한 다른 검증 근거뿐이다(`05_event-and-state.md` 6.2 `verification_basis`).
  - PROVISIONAL 입력을 쓴 계획은 승인자가 "잠정 입력으로 인지"를 명시하면 승인할 수 있다(`ALLOW_WITH_ACK`). 승인 뒤에도 입력은 PROVISIONAL이고 V9 확인 요청이 남는다.
  - "확인 + 승인" 묶음 UI는 허용하지만 `VERIFICATION` Event와 `PLAN_APPROVAL` 결정 기록(`plan_decisions`)을 따로 남긴다. G2(사실)와 G3(계획)는 별개 게이트이고, G2 차단이 남아 있으면 G3를 통과할 수 없다(`05` 11.5).
  - 이유: 승인자는 계획의 비용·배정을 판단한 것이지, 운송사가 15시에 트럭 2대를 실제로 보낼지 확인한 것이 아니다. 둘을 합치면 감사 기록에서 "누가 무엇을 확인했는지"가 사라진다.

## ADR-018: 시나리오 재생 우선 PoC
- 상태: Proposed
- 날짜: 2026-09-11
- 맥락: 실제 파트너·메일·공공 API에 기대면 데모가 재현되지 않고, 키·제휴 확보를 기다리느라 Prototype이 늦어진다.
- 결정: PoC의 외부 입력(공공 API 응답, 메일 회신, 현장 보고, 예외)은 **시나리오 파일로 재생**할 수 있어야 한다. 재생 이벤트는 실제 입력과 같은 Intake → Event Store → Reconciliation 경로를 타고 `is_simulated`만 다르다. LLM도 녹화 재생 모드를 둔다. 시간은 SimClock이 `as_of`로 공급한다.
- 대안: 실데이터 우선(느리고 재현 불가), 데모 전용 가짜 화면(실제 파이프라인을 증명하지 못함).
- 결과: 시나리오 데이터 팩(T-037)이 핵심 산출물이 된다. 어댑터를 실제 소스로 바꾸면 Pilot으로 넘어갈 수 있다.

## ADR-019: Reconciliation Policy — 근거 강도 × 최근성 × 신선도
- 상태: **Accepted (구조 한정)** — 2026-09-16 사람 결정. **구조·규칙 형태는 확정. 정책 파라미터 값은 계속 검증한다**(아래 2026-09-16 주석)
- 날짜: 2026-09-11 (T-032)
- 맥락: ADR-012의 "가장 높은 출처 → 늦은 것" 규칙은 (1) 같은 출처도 사실에 따라 권한이 다르다는 점 (2) 강한 출처의 오래된 값이 약한 출처의 최신 값보다 옳지 않을 수 있다는 점(어제 사람 5대 vs 오늘 파트너 3대)을 표현하지 못한다.
- 결정: `05_event-and-state.md` 8절의 R1~R12.
  - Event마다 **근거 강도**(0~3) = 채널 × 사실 계열 권한 × 확인 × 추출 신뢰도(3.3).
  - 사실 종류(MILESTONE / STATE / OFFER / TERM / IDENTITY / PLAN)마다 선택 규칙이 다르다.
  - STATE·OFFER: 자격 있는 근거 중 **최근 것**을 채택한다. 단 **더 강하고 신선한** 옛 근거와 다르면 바꾸지 않고 충돌로 드러낸다(R4-b).
  - 근거 시각 차이가 τ 이내이고 **가장 강한 후보끼리 동률**인데 값이 다르면 자동 선택하지 않고 사람에게 묻는다(R6). 변화 사유를 선언한 Event는 예외다.
  - 약한 근거가 주장하는 자원의 **불리한 큰 변경**은 확인 전까지 보류한다(R10).
  - 확인 요청을 처리하면 고르지 않은 후보는 기각되어 같은 충돌이 다시 열리지 않는다.
  - 모든 결과에 규칙 추적, 근거 Event 목록, 설명 문장, fingerprint를 남긴다.
- 대안: (a) 전역 우선순위(ADR-012 R3) — 위 두 문제. (b) 최신 값 무조건 채택 — 약한 출처가 확인된 값을 조용히 덮는다. (c) 가중 점수 합산 — 설명·재현이 어렵다. (d) 모든 차이를 충돌로 — 사람 확인이 넘쳐 루프가 멈춘다(R-7).
- 결과: 핵심 파라미터(τ, δ_m, 신선도 기준, θ_adverse, 권한 매트릭스, 강도표)는 정책 파일에 두고 모두 `[TO VERIFY]`다(Q-23, Q-24). 공공 API 강도는 R-1 실측 전까지 최대 2다.
- **T-032 패치 주석 (2026-09-11)**: 사실 종류에 `FORECAST`를 추가해 7개가 됐다(ETA 등 외부 예상·CERA 예측. 실제 MILESTONE이 생기면 판단에서 빠짐, R7-f). R8(추정)은 FORECAST 사실만 채운다. CONFIRMED는 `verification_basis`(사람 확인·권한 A 시스템·정책 근거)가 있을 때만이고, 계획 승인은 근거가 아니다(ADR-017 개정).
- **2026-09-16 사용자 결정 (T-072)**: **구조적 방향을 승인한다.** 데이터 모델의 전제로 삼는 것: ① 여러 사건에서 현재 판단값을 만드는 Reconciliation이 있다 ② 출처를 **단순 전역 순위로 처리하지 않는다** ③ 값의 선택은 사실 종류·권한·확인·신선도·발생 시각·정정 관계를 함께 본다 ④ 모든 결과에 규칙 추적·근거 목록·설명이 남는다.
  **아직 승인되지 않은 것 — 정책 파라미터 값**: 근거 강도표의 실제 숫자, 권한 매트릭스의 현업 적합성(Q-23), 동시로 보는 시각 차이 τ, 마일스톤 허용 오차 δ, 불리한 변경 보류 기준, 계획 영향 기준, 사실 계열별 신선도 기준(Q-24). 이 값들은 `policy.yaml`에 두고 현장 검증으로 계속 조정한다.
  즉 **"구조는 승인, 파라미터는 계속 검증"**이다. 개념 데이터 모델은 이 구조를 전제로 만들 수 있다.

## ADR-020: 출처 3축과 상태 차원 분리
- 상태: **Accepted (구조 한정)** — 2026-09-16 사람 결정. 축과 차원의 **분리 구조는 확정**. 각 축의 값 목록과 강도 매핑은 계속 검증
- 날짜: 2026-09-11 (T-032)
- 맥락: v0.2 초안의 `source_type`(`HUMAN_CONFIRMED`, `EMAIL_EXTRACTED` 등)은 채널과 확인·추출 여부를 한 값에 섞었다. Canonical 상태 7개 값(CONFIRMED~UNKNOWN)은 "누가 보증하나", "얼마나 오래됐나", "다툼이 있나", "값이 있나"를 한 enum에 넣었다.
- 결정:
  - 출처는 `source_type`(채널: HUMAN_UI, FILE_IMPORT, EMAIL, DOCUMENT, PUBLIC_API, PARTNER_SYSTEM, INFERENCE) × `source_role`(현실의 역할) × `extraction.method`로 표현한다. 시뮬레이션은 출처 유형이 아니라 `is_simulated` 플래그다.
  - Event에는 불변 필드만 둔다. `verification_status`, `supersession_status`, 신선도는 `as_of`마다 계산한다.
  - Canonical Fact는 `value_status`, `freshness_status`, `conflict_status`, `hold_status`를 따로 두고, 엔진은 이를 합친 `decision_usability` 하나를 본다.
- 대안: 7개 값 단일 enum 유지 — "사람이 확인했지만 오래됐다"(CONFIRMED + STALE) 같은 조합을 표현하지 못하고, 어느 한쪽 정보를 버리게 된다.
- 결과: 옛 값 대응표는 `05_event-and-state.md` 3.1·6.2절. 화면은 값 옆에 차원별 배지를 보여준다.
- **2026-09-16 사용자 결정 (T-072)**: **구조적 방향을 승인한다.** 데이터 모델의 전제: ① 출처를 **채널·현실 역할·추출 방식**으로 나눈다(한 값에 섞지 않는다) ② 사건에는 **불변 필드만** 두고 확인 상태·신선도는 기준 시각마다 계산한다 ③ 현재 사실의 상태를 **여러 차원**(값 보증·신선도·충돌·보류·결정 가능성)으로 표현하고 한 enum에 합치지 않는다.
  **아직 승인되지 않은 것**: 각 축의 값 목록이 현장에 충분한지, 채널×권한 → 강도 매핑의 실제 숫자. 계속 검증한다.

## ADR-021: 컨테이너 상태 = Hybrid (ADR-005 확장)
- 상태: **Accepted (구조 한정)** — 2026-09-16 사람 결정. **층 구조와 "단계는 계산값"은 확정**. 단계 목록의 현장 적합성(Q-32)은 계속 검증
- 날짜: 2026-09-11 (T-032)
- 맥락: 단일 lifecycle enum은 순서가 바뀐 이벤트와 출처별 근거를 다루지 못한다. 마일스톤만 두면 화면·위험 판정이 어렵다. 옛 유도 규칙에서는 S1 DISCHARGED에 도달할 수 없었다(Q-22).
- 결정: 층 1 사실(마일스톤 11개, `customs.status`, `location`, `exception.*`, `plan.*`, `forecast.eta` — 패치에서 `plan.eta`를 `forecast.eta`로 옮김) → 층 2 파생 단계 10개(유도 규칙) → 층 3 컨테이너 예외 → 층 4 자원 영향(Risk가 계산, 사실 아님). CUSTOMS_PENDING은 신고 근거가 있을 때만이고, 통관 정보가 없으면 DISCHARGED다. 엔진은 단계가 아니라 사실과 `ready_at`을 입력으로 쓴다(`04_domain-model.md` 2절).
- 대안: 단일 enum(폐기), 마일스톤만(화면·위험 판정에 부족).
- 결과: Q-22 해결. 창고 수용량 감소·트럭 부족 등은 컨테이너 예외가 아니라 자원 조건 → 영향으로 다룬다. 10단계가 현장에 맞는지는 `[TO VERIFY]` Q-32.
- **2026-09-16 사용자 결정 (T-072)**: **구조적 방향을 승인한다.** 데이터 모델의 전제: ① 컨테이너를 **단일 상태 컬럼으로 모델링하지 않는다** ② 사실(층 1) + 유도 단계(층 2) + 예외 오버레이(층 3) + 자원 영향(층 4) 구조로 본다 ③ **단계(`phase`)는 사실에서 계산하는 값이지 원본 사실이 아니다** ④ **자원 영향도 계산 결과이지 원본 사실이 아니다**.
  **아직 승인되지 않은 것**: 단계 10개가 현장에 쓸모 있는 세분화인지(Q-32), 예외 코드 목록의 완전성.
  **주의**: "계산값"은 "절대 저장 금지"가 아니라 **"진실의 원천으로 삼지 않는다"**는 뜻이다. 성능을 위한 캐시·물질화는 조건부로 열려 있다(`20` 7절).

## ADR-022: 프론트엔드 = Next.js + 2D SVG 운영 지도 + Data Contract / Mock Provider (ADR-016 부분 개정)
- 상태: Proposed · **결정 1(Next.js)·4(Turbopack root)는 ADR-035 가 대체**(2026-10-06). 결정 2(2D SVG)·3(Data Contract / Provider)은 그대로
- 날짜: 2026-09-15 (T-062·T-063)
- 맥락: 2026-09-14 사람 지시로 Backend·Solver보다 Control Tower Prototype을 먼저 만든다(ADR-023). 지시는 Next.js / React / TypeScript를 지정했고, 3D는 목적이 아니라고 했다. 기존 문서(ADR-016, `07` 3절, T-003)는 Vite + Three.js였다. 백엔드가 없으므로 화면이 fixture에 직접 묶이면 나중에 백엔드로 바꿀 때 화면을 다시 짜야 한다.
- 결정:
  1. `web/`은 Next.js(App Router) + React + TypeScript. 지금은 정적 페이지 하나이고 클라이언트에서 시나리오를 재생한다.
  2. 운영 지도는 **추상 2D SVG**로 그린다. Three.js(@react-three/fiber)는 이해에 도움이 될 때만 T-056에서 다시 판단한다.
  3. 화면은 **Frontend Data Contract**(`web/src/contracts/cera.ts`)에만 의존한다. `CeraDataProvider` 인터페이스 하나에 지금은 `MockProvider`(시나리오 데이터 팩)만 있고, 나중에 같은 계약의 `ApiProvider`로 바꾼다. 응답마다 `result_kind`(SCENARIO_RESULT / ENGINE_RESULT)와 `is_simulated`를 싣는다.
  4. 시나리오 데이터 팩은 `web/` 밖(`data/scenarios/`)에 두고 백엔드도 같은 파일을 읽게 한다(Turbopack `root`를 저장소 루트로).
- 대안: Vite + React(ADR-016 원안 — 사람 지시와 다름, SSR·라우팅이 나중에 필요할 때 다시 옮겨야 함), Three.js 2.5D(상태 변화보다 그래픽이 앞섬, 브리프 11절 "게임 같은 3D" 회피), fixture 직접 import(백엔드 교체 때 화면 재작성).
- 결과: `07` 3절 프론트엔드 줄과 T-003 범위(web 뼈대는 이미 있음)가 바뀐다. 프론트 비즈니스 로직 금지(ADR-016)는 유지한다: MockProvider는 백엔드 대역으로 표시용 집계만 하고, 위험·비용·계획 숫자는 fixture 값을 그대로 쓴다. 판정 전까지 `[PROPOSED]`.

## ADR-023: 개발 순서 = Prototype 먼저 (T-036 DEFERRED)
- 상태: Proposed (사람 지시 2026-09-14로 이미 실행, 형식 판정은 T-001/T-064)
- 날짜: 2026-09-15
- 맥락: T-032 뒤 다음 순서는 T-036(최적화 명세·솔버 선택)이었다. 그러나 실제 운영 데이터와 제약이 검증되지 않은 상태에서 수학모델을 먼저 고정하면 가정을 과도하게 설계할 위험이 있다.
- 결정: Event/State 완료(T-060) → 30대 Scenario Data Pack(T-061) → Frontend Data Contract·Mock Data Layer(T-062) → Operations Control Tower·Scenario Playback(T-063) → UI·데이터 요구사항 검증(T-064 사람, T-065) → Recovery Optimization Model(T-036) → Solver → Backend·DB·외부 연결. T-036은 삭제하지 않고 `DEFERRED`로 둔다.
- 대안: 원래 순서(T-036 먼저 — 검증 안 된 가정이 모델에 굳음), 병행(1인 + 에이전트 규모에서 초점이 흩어짐).
- 결과: 이것은 기획 후퇴가 아니라 Prototype-led Discovery(`02` 9절)를 개발 순서에 적용한 것이다. Prototype의 결과값은 엔진 결과가 아니므로 모든 화면에 시뮬레이션 표시를 붙인다. Prototype에서 찾은 요구사항(`16_frontend-prototype.md` 11절)이 T-036의 입력이 된다.

## ADR-024: 저장소 = 하나의 Private Monorepo + 책임 영역 분리
- 상태: **Accepted** (2026-09-15, 사람 결정). 단 아래 "방향" 항목(계약 정본 OpenAPI, Desktop)은 확정이 아니다
- 날짜: 2026-09-15 (T-066)
- 맥락: 앞으로 Frontend(Web, 필요하면 Desktop), Backend(API·DB·연동), AI/Decision Engine(LLM·파싱·위험·비용·최적화)가 생긴다. 당분간 1인 개발이다. 저장소를 여러 개로 나누면 계약 변경·문서·버전 맞추기 비용이 커진다. 반대로 영역 경계가 없으면 LLM 코드와 결정론 엔진, 화면과 백엔드 로직이 섞인다.
- 결정:
  1. Git 저장소는 **하나**(Private Monorepo)다. 저장소 루트가 곧 CERA 루트다.
  2. 코드 책임 영역: `front/`(화면, 현재 `front/web` = Next.js Prototype), `back/`(API·인증·DB·Event·Canonical State·연동·승인·감사·작업·push), `ai/`(LLM 해석 + 결정론 엔진 Tariff·Cost·Risk·Optimization·Solver), `packages/`(공유 계약), `data/`(공통 시나리오·테스트 데이터), `docs/`(정본 문서), `infra/`(배포).
  3. `ai/` 안에서도 LLM 코드와 결정론 엔진은 서로 다른 패키지로 나누고, 엔진은 LLM 클라이언트를 import하지 않는다(ADR-008, `01` 3절).
  4. `data/scenarios/`는 특정 영역 소유가 아니라 공통 기준 데이터다. 화면은 계약(Provider)을 통해서만 본다.
  5. 배포는 서비스별 Docker Image로 나눌 수 있다. 이를 위해 저장소를 나눌 필요는 없다.
  6. `AGENTS.md`·`CLAUDE.md`는 루트에 둔다. 영역별 AGENTS 파일은 루트 규칙으로 부족할 때만 만든다.
- 방향 (미확정, 해당 시점에 별도 결정):
  - 계약: Backend가 생기면 OpenAPI를 정본으로 두고 TypeScript 타입을 `packages/`에 자동 생성한다(지금은 `front/web/src/contracts/cera.ts` 손 작성).
  - Desktop: 현업 필요성이 검증되면 기존 React 화면을 Tauri로 재사용하는 방안을 검토한다. **Tauri는 확정 기술이 아니다.**
  - **2026-09-18 주석**: 위 Desktop 방향(미확정)을 ADR-031(Proposed)이 갱신한다 — **Web First, Desktop 은 중앙 Backend 의 Client, 첫 후보 Electron, Tauri 는 크기·메모리·네이티브 보안 요구가 실제 문제가 될 때 재평가.** 이 ADR 의 확정 결정(1~6)은 바뀌지 않는다.
- 대안: 저장소 3개 분리(front·back·ai — 1인 개발에 조율 비용 과다, 계약 변경마다 여러 저장소 수정), 영역 없는 단일 폴더(책임 경계 흐림).
- 결과: `web/`을 `front/web/`으로 옮겼다(미커밋 상태에서의 이동이라 git 이동 이력은 없음). 옛 레이아웃의 `src/cera/<모듈>`은 `back/`과 `ai/`로 나눠 배치한다(`07` 6절). T-003 범위가 `back/`·`ai/` 뼈대로 바뀐다.
- **2026-09-16 개정 (ADR-029, 사람 결정)**: 결정 2의 **`ai/` 영역 정의가 바뀐다.** `ai/`는 **LLM·비정형 처리만** 맡는다(LLM Provider, Email Extraction, Contract Extraction, Draft 자연어 문장, Explanation). 결정론 엔진 **Tariff·Cost·Risk·Reconciliation·Optimization·Solver는 Backend 내부의 결정론 영역**에 둔다. 새 최상위 `engine/` 영역은 만들지 않는다(1인 MVP에 과설계). 나머지 결정(저장소 하나, `data/` 공통, 서비스별 이미지, 루트 AGENTS, 엔진의 LLM import 금지)은 그대로다. 이유: "숫자는 결정론 엔진에서만 나온다"(`01` 3절)와 금지 주장 "AI가 D&D 비용을 계산한다"(`01` 4절)가 폴더 이름과 충돌했고, 순수 엔진 중 `state`만 `back/`에 있어 배치가 이미 일관되지 않았다. 적용 시점은 T-003.

## ADR-025: AI 협업 개발 Workflow — Orchestrator Handoff (ADR-001 확장)
- 상태: **Accepted** (2026-09-15, 사람 결정)
- 날짜: 2026-09-15 (T-067)
- 맥락: 1인 개발이지만 Claude·Codex·ChatGPT·Antigravity를 역할별로 쓰고, 작업 장소에 따라 Claude와 Codex가 교대로 저장소를 관리한다. 판단이 대화 기억으로만 전해지면 결정이 뒤집히거나 범위가 넓어지거나 구현이 계획과 달라진다. ADR-001(AGENTS.md 진입점 + docs 정본 + 작업 큐)은 한 에이전트가 연속 작업하는 경우만 다뤘다.
- 결정 (`docs/17_ai-development-workflow.md`):
  1. 역할: 사용자 = 최종 결정(ADR·계획·commit 승인), Orchestrator = Claude **또는** Codex(작업 단위마다 하나), ChatGPT = Implementation Planner / Independent Reviewer(결정권 없음), Antigravity = Coding Agent(승인된 계획만 구현, 설계 변경이 필요하면 멈추고 보고).
  2. 정본 순서: Git 저장소 → Accepted ADR → `docs/` → `docs/tasks/CURRENT.md` → API·Schema·Test → code. AI 대화는 정본이 아니다.
  3. 현재 작업의 인계 정본은 `docs/tasks/CURRENT.md`. QUEUE = 예정, CURRENT = 현재, LOG = 과거. `HANDOFF.md` 방식은 CURRENT로 대체한다.
  4. 흐름: Task Brief(WHAT/WHY) → Implementation Plan(HOW) → 사용자 승인 → Implement → Test → Review → Fix → Docs Sync → 사용자 승인 → Commit. Architecture 변경·여러 영역 기능·중요 Vertical Slice에 적용하고, 작은 수정은 줄인다(commit 승인은 생략하지 않음).
  5. 이어받은 Orchestrator는 Scope를 임의로 넓히거나 Accepted ADR을 임의로 바꾸지 않는다. 바꿔야 하면 새 ADR(Proposed)·변경 제안으로 사용자 승인을 받는다.
  6. commit·push·원격 생성은 사람 승인 뒤에만 한다. 모든 도구에 같다(`01` 8절 문구를 이에 맞춰 정리).
- 대안: 대화 기억·요약으로 인계(도구 간 전달 불가, 검증 불가), 도구별 전용 설정 파일(CODEX.md 등 — 같은 규칙이 여러 벌 생김. AGENTS.md를 모든 도구가 읽으므로 불필요), 모든 작업에 전체 11단계(관료적, 작은 수정이 느려짐).
- 결과: `docs/tasks/CURRENT.md`, `docs/tasks/TASK_BRIEF_TEMPLATE.md`, `docs/17_ai-development-workflow.md` 신규. `AGENTS.md` 2절 읽는 순서(CURRENT가 두 번째), 3절 착수·완료·중단 절차, 3.7절 Handoff Rule. 계획 문서는 필요할 때 `docs/tasks/plans/`에 둔다.

## ADR-026: 외부 통신 = Channel Adapter 추상화, Gmail은 첫 기술검증 채널
- 상태: **Accepted** (2026-09-16, 사람 결정)
- 날짜: 2026-09-16 (T-068)
- 맥락: 문의 초안 → 승인 → 발송 → 회신 → 구조화 → Event 루프는 CERA의 핵심 가설인데 한 번도 기술 검증되지 않았다(현재 전부 시나리오 작성값). 그러나 **현업이 실제로 어떤 채널을 쓰는지 모른다**: 메일인지 전화인지 카카오톡인지 TMS인지(Q-26·Q-28), 고객 메일함 접근이 보안 정책에 막힐지(R-8), 연동 방식도 미결이다(Q-33). 채널을 먼저 고정하면 인터뷰 결과 한 줄에 설계가 무너진다.
- 결정:
  1. 외부 통신을 **`ChannelAdapter` 포트** 뒤에 둔다: `capabilities()`, `send()`, `fetch_inbound()`, `lookup_sent()`. 구현체는 `MockChannel`(가상 메일함, 현재), `GmailChannel`(첫 실채널), 이후 SMTP/IMAP·전달 주소·전화 기록·모바일 응답 링크·TMS.
  2. 채널과 무관하게 고정되는 것: 초안의 구조화 값 주입과 숫자 검사, 사람 발송 승인(G4), Outbox·멱등·재시도, 상대방 등록부에 의한 역할 판정, 원문 보존, 추출 검증기, Reconciliation R1~R12, PROVISIONAL 규칙, 화면.
  3. 채널이 바꾸는 것은 전송·수신 방법과 **`source_type`(그에 따른 근거 강도)** 뿐이다.
  4. **Gmail은 "혼자서, 계약 없이, 실제 외부 왕복을 오늘 검증할 수 있는 유일한 채널"이라는 이유로 고른 첫 채널이며 최종 채널이 아니다.** 문서·UI·코드 어디에도 "CERA의 통신 채널은 메일"이라고 쓰지 않는다.
  5. 최소 권한은 scope가 아니라 **전용 계정 + 전용 라벨 + CERA가 만든 Thread만 수집**이라는 세 겹으로 만든다(Gmail에는 라벨 단위 읽기 scope가 없다). 개인·회사 메일함에 붙이지 않는다.
  6. **구조화 채널은 LLM을 거치지 않는다.** 어댑터가 `capabilities().structured_reply = true`를 선언하면 Intake는 추출 단계를 호출하지 않고 스키마 검증만 한다. LLM 호출의 기준은 **"입력이 비정형인가"**이지 "값이 자주 바뀌는가"가 아니다. `Form → LLM → Structured Value` 경로를 만들지 않는다.
- 대안: (a) Gmail 전용 구현 — 인터뷰 결과에 따라 대부분 버려진다. (b) 채널 없이 사람이 직접 메일 — 루프의 기술 위험이 검증되지 않는다. (c) 범용 메시징 추상화를 처음부터 크게 — 채널이 하나뿐인데 과설계다. (d) 모든 회신을 일괄로 LLM에 통과 — 구조화 입력에 비용·지연·오류만 더한다.
- 결과: 어댑터 교체로 채널을 바꿀 수 있다. 다만 상대방이 직접 입력하는 구조화 채널(모바일 응답 링크·파트너 포털)의 `source_type`은 아직 정해지지 않았다(Q-46). `source_type`(채널)과 `source_role`(역할)은 다른 축이며, 역할은 어느 채널이든 등록부가 결정론적으로 정한다. 상세 설계는 `docs/18_external-communication.md`.
- **2026-09-16 책임 경계 Audit 반영**: 결정 6(구조화 채널 LLM 우회)을 추가했다. 초안에는 이 규칙이 표에만 암시되어 있어 "동적 데이터 → AI"로 읽힐 여지가 있었다.

## ADR-027: 제품 단계에 `Tech Validation` 신설 — 통제된 실제 발송
- 상태: **Accepted** (2026-09-16, 사람 결정). `01_project-rules.md` 6·6.1절과 `02_product-definition.md` 6절에 반영 완료
- 날짜: 2026-09-16 (T-068)
- 맥락: `01_project-rules.md` 6절은 "PoC의 메일 발송은 가상 메일함으로만, 실제 발송 없음 / Pilot의 실제 발송은 건별 승인 + 별도 ADR"이다. `11_data-sources.md` 5절도 실발송에 "ADR 필요"를 명시했고, `03_requirements.md` FR-ING-07은 Gmail 연동을 Could/Pilot으로 둔다. 그런데 외부 통신 루프의 기술 위험(OAuth, 스레드 상관, 중복 발송, 회신 추출)은 **가상 메일함으로는 전혀 검증되지 않는다**. 반대로 Pilot을 기다리면 고객이 생길 때까지 검증이 미뤄진다.
- 결정: PoC와 Pilot 사이에 **`Tech Validation`(기술검증)** 단계를 만들고, 이 단계에서만 아래 세 조건을 **모두** 만족할 때 실제 발송을 허용한다.
  1. **수신자가 등록·검증·승인된 Contact여야 한다.** `email_verification_status = VERIFIED` AND `relationship_status = APPROVED` AND `communication_status = ACTIVE`. 이것은 제품 게이트이고 Pilot·Scale에서도 그대로 적용된다(`18` D.5).
  2. 발송은 **건마다 사람 승인** 뒤에만 일어난다. 승인한 내용과 다른 내용은 나가지 않는다(승인 내용 해시 대조).
  3. 개발·기술검증 환경에서는 **별도의 안전장치** `CERA_TEST_RECIPIENT_ALLOWLIST`가 추가로 막는다. 이것은 제품 모델이 아니라 환경 설정이며, 1번을 대신하지 못한다.
  추가로: 실제 발송 기능은 1·3번 강제와 "승인 없는 발송 경로 없음" 테스트(NFR-03)가 통과하기 전에는 활성화하지 않는다. 즉시 끌 수 있는 스위치를 둔다.
- 대안: (a) 규칙 6절 유지 — 이 Task를 구현할 수 없다. (b) PoC에서 실제 발송을 그냥 허용 — 실수로 메일이 나가는 되돌릴 수 없는 사고를 막을 근거가 사라진다. (c) Pilot까지 대기 — 가장 큰 기술 위험의 검증이 고객 확보 뒤로 밀린다. (d) 초안의 "상대가 실제 현업 담당자가 아닐 것" — 아래 참조.
- 결과: `01_project-rules.md` 6절, `02_product-definition.md` 6절, `03_requirements.md` FR-ING-07·FR-COM-02를 고쳐야 한다. 이 ADR이 `Accepted`가 되기 전에는 실제 발송 코드를 만들지 않는다. 테스트 상대(본인·가족·테스트·가상 운송사 역할 계정)도 **실제 거래처와 똑같은 Contact Verification Flow**를 쓴다. 테스트용 우회 경로를 만들지 않으므로, Pilot으로 갈 때 흐름이 바뀌지 않는다.
- **2026-09-16 책임 경계 Audit 개정**: 초안의 조건 ②("상대방은 실제 현업 담당자가 아니다")를 **폐기**한다. 그것은 시스템이 판정할 수 없는 기준이고(주소만 보고 현업인지 알 수 없다), 단계가 끝나면 버려지는 임시 규칙이라 Pilot에서 다시 설계해야 한다. 옳은 축은 **"등록·검증·승인된 Contact인가"**이며, 이 기준은 DB가 결정론적으로 판정할 수 있고 제품 수명 내내 그대로 쓰인다. 초안의 `send_allowlist`는 제품 게이트와 개발 안전장치를 한 테이블에 뭉친 것이라 폐기하고 두 겹으로 나눴다(ADR-028, `18` D.5·G.5).

## ADR-028: 통신 도메인 저장 분리 + 쓰기 계약과 OpenAPI 정본 전환 시작
- 상태: **Accepted** (2026-09-16, 사람 결정). 단 **구체 컬럼·DDL은 확정이 아니다** — Implementation Plan(T-069)에서 정한다
- 날짜: 2026-09-16 (T-068)
- 맥락: `07_backend-architecture.md` 4절의 `messages` 한 테이블에는 채널, 외부 메시지·스레드 ID, 재시도 횟수, 멱등키, 승인 내용 해시, 상태 전이 이력이 없다. 실제 발송은 이것들 없이는 중복·오발송을 막을 수 없다. 또 `CeraDataProvider`는 읽기 전용이라 "승인" 같은 쓰기 동작의 계약이 아예 없다. ADR-024는 "계약 정본을 OpenAPI로"를 **방향(미확정)**으로만 남겼다.
- 결정:
  1. `messages`를 `comm_threads` / `comm_messages` / `comm_message_events`로 나누고, 상대방 등록부를 **`counterparties`(거래처) → `counterparty_contacts`(담당자) → `contact_channel_addresses`(주소)** 3단계로 두며 `contact_verifications`, `extractions`를 더한다. 원문은 기존 `raw_inputs`(RFC822 그대로)를 쓴다.
  1b. 발송 자격은 주소 행의 **세 상태의 AND**다: `email_verification_status`(주소를 통제하는 사람이 확인에 응답했나) AND `relationship_status`(사용자가 업무 연락처로 인정했나) AND `communication_status`(지금 보낼 수 있나). 세 질문은 서로 다르므로 한 칸에 합치지 않는다. **이메일 확인은 법인 대표권이나 계약 권한을 증명하지 않는다** — 문서·UI에 그 이상으로 쓰지 않는다. 판정은 Backend 결정론이며 AI는 어떤 형태로도 참여하지 않는다.
  1c. MVP는 **Model A(Contact Verification)** 다. 상대방이 CERA 계정을 만들 필요가 없다. Model B(Partner Account / Portal)는 Pilot 이후이며 이번 슬라이스로 끌어오지 않는다.
  2. 발송 승인(G4)은 **Event Store에 넣지 않는다.** 현실 사실에 대한 주장이 아니라 CERA 안의 결정이다(`PLAN_APPROVAL`과 같은 논리). `comm_messages`의 승인 필드 + `audit_log`에 남는다. G2·G3·G4는 서로를 대신하지 않는다.
  3. 읽기 계약 `CeraDataProvider`는 순수 View 계약으로 유지하고, 쓰기는 **별도 `CeraCommandClient`**로 낸다. 두 인터페이스 모두 mock/api 구현을 가진다.
  4. **이 슬라이스의 엔드포인트부터 Backend OpenAPI를 계약 정본으로 삼고**, TypeScript 타입을 `packages/`에 생성한다. 백엔드가 아직 서빙하지 않는 화면의 View Model은 `front/web/src/contracts/cera.ts` 손 작성으로 남으며, 이 혼재 상태를 문서에 명시한다.
- 대안: (a) `messages` 한 테이블 유지 — 재시도·중복 방지 상태를 표현할 수 없다. (b) 승인을 Event로 기록 — Event Store가 "현실에 대한 주장"이라는 정의가 무너진다. (c) 읽기 Provider에 쓰기 메서드를 섞음 — View 계약이 흐려지고 Mock 재생이 복잡해진다. (d) OpenAPI 전환을 전면 일괄 — 백엔드가 아직 대부분의 화면을 서빙하지 않아 빈 계약이 생긴다. (e) 평평한 `send_allowlist` 하나 — "검증되지 않은 주소도 목록에 넣으면 보낼 수 있다"는 뒷문이 생긴다.
- 결과: `07` 4·5절 갱신이 필요하다. `packages/`가 처음으로 실제 산출물을 갖게 된다. 상세는 `docs/18_external-communication.md` D·I·J절.

## ADR-029: 결정론 엔진을 `ai/`에서 분리 (ADR-024 영역 정의 개정)
- 상태: **Accepted** (2026-09-16, 사람 결정). **ADR-024의 영역 정의를 이 범위에서 개정한다.** 실제 폴더 생성·코드 이동은 T-003(Backend scaffold) 때 적용하며, 이번 작업에서는 옮기지 않았다
- 날짜: 2026-09-16 (T-068 책임 경계 Audit)
- 맥락: ADR-024는 `ai/`에 "LLM 해석 **+ 결정론 엔진**(Tariff·Cost·Risk·Optimization·Solver)"을 둔다. 그런데 CERA의 가장 중요한 주장은 **"숫자는 결정론 엔진에서만 나온다"**(`01` 3절)이고, 금지 주장 목록에는 **"AI가 D&D 비용을 계산한다"**(`01` 4절)가 명시돼 있다. 위험·비용·최적화 코드가 `ai/`라는 폴더에 물리적으로 들어 있으면 저장소를 여는 사람마다 그 주장을 의심하게 된다. 인터뷰·심사에서 방어해야 할 주장이라 이름값이 실제 비용이다. `ai/README.md`도 "이름이 오해를 부른다"고 스스로 적어 두었다.
  더 결정적인 것은 **현재 배치가 이미 일관되지 않다**는 점이다. `07` 1.2절은 순수 엔진을 `state`·`tariff`·`cost`·`risk`·`optimize`로 나열하는데, `07` 6절 배치표는 그중 `state`(Reconciliation)만 `back/`에 두고 나머지 넷은 `ai/`에 둔다. 같은 성격의 코드가 두 영역으로 갈라져 있고, 그 기준이 "AI인가"가 아니라 우연이다.
- 결정 (제안):
  1. **`ai/` = LLM 관련만**: `extraction`(메일·계약서 구조화 추출), 프롬프트·스키마, 초안 문장 생성, 설명 문장 생성, LLM 클라이언트.
  2. **결정론 엔진 `tariff`·`cost`·`risk`·`optimize`는 `state`와 같은 자리**(`back/`)로 옮긴다. 순수 함수·I/O 없음 규칙(`07` 1.2)은 그대로 유지하고, 패키지 경계로 강제한다(엔진 패키지는 `storage`·네트워크·LLM 클라이언트를 import하지 않는다).
  3. **새 최상위 `engine/` 폴더는 만들지 않는다.** 1인 개발·MVP 규모에서 세 번째 Python 패키지·테스트 트리·의존 그래프를 지금 만드는 것은 과설계다. 별도 배포 이미지나 두 번째 소비자가 생기면 그때 다시 판단한다.
  4. **실행 시점은 T-003(저장소 초기화)이다.** 지금은 `back/`·`ai/`에 코드가 없으므로 이동 비용이 0이지만, 폴더 구조 변경 자체를 이번 설계 Task의 범위로 끌어오지 않는다.
- 대안:
  - (a) 현재 유지 — 이름과 내용의 불일치가 남고, `01` 4절 금지 주장과 저장소 구조가 계속 충돌한다.
  - (b) 최상위 `engine/` 신설(3영역) — 경계는 가장 선명하지만 코드가 0줄인 지금 만들 이유가 없다. `ai/` 안에서 패키지를 나누는 것으로 같은 경계를 얻는다.
  - (c) `ai/`를 `decision/`으로 개명 — 폴더 하나로 LLM과 결정론을 계속 묶게 되어, "결정론 엔진은 LLM을 import하지 않는다"를 물리적으로 보장하지 못한다.
  - (d) 절충: 지금은 `ai/llm/`·`ai/engine/`으로 내부만 나누고 폴더 이동은 나중 — 선택지로 유효하다. 다만 `state`가 이미 `back/`에 있어 결정론 엔진이 두 군데로 갈리는 문제는 그대로 남는다.
- 결과: `ai/README.md`, `back/README.md`, 루트 `README.md`, `07` 6절, ADR-024의 영역 표를 이 결정에 맞게 고친다(T-070). **실제 폴더·코드 배치는 T-003(Backend scaffold)에서 적용한다** — 지금은 `back/`·`ai/`에 코드가 없으므로 이동 비용이 0이다.
- **ADR-024와의 관계**: ADR-024(Accepted, Monorepo)의 결정 1·4·5·6(저장소 하나, `data/` 공통, 서비스별 이미지, 루트 AGENTS)은 그대로다. 결정 2의 **영역 책임 정의만** 이 ADR이 개정한다: `ai/` = LLM·비정형 처리(LLM Provider, Email Extraction, Contract Extraction, Draft 문장, Explanation), 결정론 엔진(Tariff·Cost·Risk·Reconciliation·Optimization·Solver) = Backend 내부의 결정론 영역. 결정 3(엔진이 LLM 클라이언트를 import하지 않는다)은 유지되며, 분리로 물리적으로 더 쉽게 지켜진다.

## ADR-030: 오류·관측성 원칙 — 세 기록 분리 + `system_error` + 공통 오류 처리
- 상태: **Proposed** (2026-09-18)
- 날짜: 2026-09-18 (T-079 최종 정리)
- 맥락: 사용자는 서버 내부 오류와 외부 시스템 호출 오류를 **한 곳에서 추적**하고, 어디서·어떤 요청/실행에서·어떤 외부 호출이 실패했는지, 재시도 가능한지, 관련 메시지·발송 시도·복구 실행이 무엇인지 확인하길 원한다(Java 프로젝트에서 전역 예외 처리 + 오류 DB 기록을 구현한 경험). 그런데 CERA 에는 이미 `event`(현실 사실)·`audit_log`(사람의 행위)·`send_attempt`(발송 결과)가 있어, 오류를 아무 데나 넣으면 "Gmail 이 503 을 줬다"가 현실 사실이나 감사 기록처럼 섞인다.
- 결정 (상세: `docs/23` 4~6절, 표 모양: `docs/22` 16.2a):
  1. **Operational Event · Audit · System/Integration Error 를 섞지 않는다.** 같은 실패가 `send_attempt` 와 `system_error` 두 곳에 남을 수 있지만 답하는 질문이 다르다.
  2. **`system_error` 논리 표를 MVP 에 둔다.** 분류 `EVIDENCE`, 변경 `APPEND_ONLY`. 업무 도메인 개념이 아니라 기술 운영 표이므로 개념 모델(`docs/21`)을 다시 열지 않는다. 대응 이력 표는 만들지 않는다.
  3. **DB 에는 중요한 오류만**(중요한 ERROR · 외부 연동 실패 · 예상 밖 5xx · 작업 실패 · 데이터 처리 실패). 입력 검증 4xx · debug/info · 반복 저가치 경고는 로그에만. 전체 스택 트레이스는 외부 로그, DB 에는 참조만.
  4. **비밀값·토큰·실제 본문·원문 응답은 로그와 `system_error` 어디에도 넣지 않는다.**
  5. **API Request · External Integration · Background Job 세 경계가 같은 Error Recorder · Structured Logger 를 쓴다.** 프레임워크 구현은 정하지 않는다.
  6. **`request_id` · `trace_id` 를 MVP 첫 구현부터 둔다.** 업무 `correlation_id`(`docs/05`)와 다른 것이다. OpenTelemetry 등 특정 제품은 정하지 않는다.
  7. **외부 호출은 공통 Integration Client(또는 같은 역할의 계층)** 가 시간 제한·오류 정규화(분류·코드)·재시도 가능 판정·기록을 맡는다. 재시도 **정책**은 업무 쪽(`docs/18` H절)이 정한다.
- 대안: (a) 오류 표 하나에 모든 로그 — 로그 저장소를 DB 로 흉내 내게 되고 비밀·원문이 새기 쉽다. (b) 오류를 `event` 로 — 현실 사실이 아닌 것이 Reconciliation 에 들어간다. (c) `audit_log` 에 섞기 — 사람의 행위와 프로그램 실패가 구분되지 않는다. (d) DB 기록 없이 로그만 — 사용자가 원하는 "DB 에서 찾아보기"가 안 되고, 관련 개체와의 연결을 조회로 볼 수 없다.
- 결과: `docs/22` 에 `system_error` 추가(MVP 51 · Next 1 · MVP 에서 만들지 않음 2 = 54). `docs/23` 신설. 오류 분류·코드 값 목록은 Q-66, 관측 제품은 Q-67.

## ADR-031: 런타임 방향 — Backend 우선 후보 · Web First · Desktop = Client · AI 분리 조건
- 상태: **Proposed** (2026-09-18) — **2026-09-21: 결정 1·2(Backend 후보)와 결정 8(Python AI 서비스는 나중에만 분리)은 ADR-033 이 대체했다(Superseded).** 결정 3(솔버 위험)은 Q-65 의 맥락으로 남고, 결정 4~7·9(Web First · Desktop = Client · Electron 첫 후보 · `DesktopBridge` · 같은 OpenAPI 계약)는 그대로 Proposed 다. 본문은 당시 기록으로 남긴다
- 날짜: 2026-09-18
- 맥락: 기록상 Backend 초안은 Python 3.12 + FastAPI(ADR-002 Proposed)다. 그 뒤 상황이 바뀌었다 — Frontend 는 이미 Next.js + React + TypeScript 로 구현됐고, 1인 개발이며, 사용자가 회사에서 NestJS 를 실제로 쓰고, Backend·API·데이터 흐름 위주 개발을 선호한다. 향후 Desktop 클라이언트(Electron/Tauri)와 AI 모듈도 고려한다. 반대로 결정론 엔진(최적화·솔버)은 ADR-029 에 따라 Backend 영역이다.
- 결정 (상세: `docs/23` 3·7~12절):
  1. **Backend 현재 우선 후보는 NestJS + TypeScript.** 이유: Frontend 와 언어 통일, 스키마·타입 공유, 1인 개발 문맥 전환 감소, 사용자 실무 경험, Module·DI·Guard·Pipe·Interceptor·ExceptionFilter 구조, Electron 과의 생태계 연속성, Outbox·재시도·연동 어댑터·전역 오류 처리에 충분함.
  2. **Java / Spring Boot 는 후보로 남긴다.** 성숙한 트랜잭션·영속성 생태계, 사용자의 Spring 전역 예외 처리 경험, Java/Spring 포트폴리오가 목표라면 충분한 선택 이유다.
  3. **NestJS 의 가장 큰 기술 위험은 솔버**다(OR-Tools 공식 Node 바인딩 없음 `[TO VERIFY]`). TS 내 솔버 / Python **결정론** 솔버 워커(`back/` 영역, AI 아님) / 다른 Backend 언어 중 무엇인지는 T-036 재개 뒤, Backend 확정 때 함께 본다. 첫 슬라이스(외부 통신)는 솔버가 필요 없다.
  4. **Web First.** MVP 에서 Desktop 을 만들지 않는다.
  5. **Desktop 은 중앙 Backend 의 Client 다.** Desktop 안에 정본 Backend·DB 를 넣지 않는다.
  6. **Desktop 첫 후보는 Electron**, Tauri 는 배포 크기·메모리·네이티브 보안 요구가 실제 문제가 될 때 재평가. 지금 Rust/Tauri 를 들이지 않는다.
  7. 화면은 데스크톱 런타임 API 를 직접 부르지 않고 **`DesktopBridge`** 뒤에 숨긴다(Web·Electron·Tauri 구현).
  8. **Python AI 서비스는 Python 전용 요구(로컬 추론·OCR·커스텀 모델·GPU·Python 중심 데이터 처리)가 실제로 생길 때만** 뗀다. 그 전에는 Backend 가 LLM API 를 직접 부르고, `ai/` 는 같은 프로세스 안의 모듈 경계로 시작할 수 있다. LLM 공급자·모델은 여전히 미정.
  9. Web·Desktop·향후 외부 Client 는 **같은 Backend OpenAPI 계약**을 쓴다(ADR-028).
- 대안: (a) Python/FastAPI 유지(ADR-002) — 솔버·데이터 생태계는 가장 강하지만 Frontend 와 언어가 갈리고 사용자 실무 경험과 멀다. (b) Spring Boot 확정 — 운영 성숙도는 가장 높지만 1인 개발 문맥 전환이 크다. (c) 지금 NestJS 를 Accepted 로 — 첫 슬라이스 요구와 솔버 위험을 보기 전에 닫게 된다. (d) Desktop 에 Backend·DB 내장 — 여러 운영자가 같은 사실·승인을 공유할 수 없다. (e) Tauri 먼저 — 1인 개발에 Rust 를 더한다.
- 결과: `docs/23` 신설. `docs/01` 7절 · `docs/07` 3·6절 · ADR-002 · ADR-024 의 Python/Tauri 표현에 "미결 · `docs/23` 참조" 주석. 본문 전면 정리는 T-070. 미결 항목은 `docs/15` Q-64(Backend 언어) · Q-65(솔버 실행 위치).

## ADR-032: 메일 근거 시각 선택 + 기록과 내용의 분리 보관 (Q-44 · Q-45)
- 상태: **Accepted** (2026-09-21, 사용자 결정). **구조와 규칙은 확정. 보관 기간 숫자는 포함하지 않는다** — Pilot 정책으로 미결
- 날짜: 2026-09-21
- 맥락: T-069(외부 통신 구현 계획) 전에 두 가지를 정해야 했다(`docs/19` 22.1). ① 메일에는 발신자가 붙인 `Date` 헤더와 채널(Gmail)의 수신 시각 `internalDate` 가 있고, 발신자는 `Date` 를 조작할 수 있다. ② 실제 메일을 받기 시작하면 원문·본문·연락처가 쌓이는데, 이미 정한 불변 규칙(원문 행 삭제 금지 · 메시지 본문·추출 인용·승인 사본 UPDATE 금지)과 단순 파기가 부딪힌다.
- 결정:
  1. **(Q-44) 메일 `source_recorded_at`**: `Date` 가 있고, 정상 파싱되고, **채널 수신 시각보다 미래가 아니면** `Date`. 없거나·파싱 실패거나·미래면 채널 수신 시각 + `date_header_rejected` · 거부 사유. **과거 `Date` 는 허용**한다 — 늦게 도착한 메일은 발신 시각 그대로. 근거 시각은 **채널이 받은 시각보다 늦을 수 없다.** 원래 두 시각과 선택 결과는 `event.payload` 에 보존한다(`docs/22` 11.2e). 허용 오차는 두지 않는다(필요하면 정책 파라미터, `[TO VERIFY]`).
  2. **(Q-45) 기록과 내용을 분리한다 — 행 삭제 ≠ 내용 파기.** 원문(RFC822 — 첨부·HTML 포함)·메시지 제목·본문·승인 문장 사본·추출 인용·제안 조건 원문은 **보관 관리 내용**이고, 기록 행은 **참조 + 지문**만 갖는다. 기존 `raw_input.payload_ref` 방식을 다른 내용 필드로 넓힌 것이며 **새 표는 없다**(`docs/22` 29절).
  3. 보관 기간이 끝나면 **내용만 파기**한다. 기록 행(사건 · 원문 행 · 메시지 · 승인 · 추출 · 발송 시도 · 상태 전이 · 감사)은 **지우지도 고치지도 않는다.** 진행 중인 흐름이 쓰는 내용은 파기하지 않는다.
  4. **파기는 감사된다**(`audit_log` `CONTENT_PURGED` · 내용 범주 · 기록 id · 보관 정책 판). 파기한 내용은 감사·로그에 복사하지 않는다. **내용 부재는 성공한 `CONTENT_PURGED` 감사가 있을 때만 정상 파기이고, 감사 없는 부재는 데이터 손실(`system_error`)이다.** 참조(`*_ref`)는 부모 기록이 영구히 유지하는 안정적인 식별자이며 파기 때 부모 기록·참조·지문은 바뀌지 않는다.
  5. 원본 HTML 은 따로 저장하지 않는다. 첨부는 보관과 지문·메타데이터까지만(해석은 범위 밖).
  6. 보관 순서: 원문·첨부·HTML 가장 짧게 → 본문·인용·승인 문장·조건 원문 중간 → 기록은 파기하지 않는다. **숫자는 정하지 않는다.**
  7. Tech Validation 은 전용 테스트 계정만 쓰고 개인·회사 실메일을 쓰지 않으며, 단계가 끝나면 원문·내용을 정리한다.
- 대안: Q-44 — (a) 대칭 허용 오차(T-068 초안): 늦게 도착한 메일을 최신처럼 만든다 (b) 항상 `internalDate`: 같은 문제 (c) 항상 `Date`: 미래 시각 조작이 통과한다. Q-45 — (a) 무기한 보관: 최소 보관 원칙과 Pilot 고객사 요구에 맞지 않고 나중에 쌓인 것을 처리해야 한다 (b) 원문 즉시 파기: `docs/20` A-05(재추출)를 사실상 없앤다 (c) 내용 컬럼을 `NULL` 로 비우기: 불변 규칙을 깬다.
- 결과: `docs/22` rev.2.4(11.2e · 29절 · I-28~I-33 · 안티패턴 11). **논리 테이블 수 변화 없음(52).** `docs/05` 5.2 `EMAIL` 매핑 · `docs/18` F.2 · G.7 · `docs/19` NFR-21 · `docs/23` 4.4 · `docs/15` Q-44 CLOSED · Q-45 구조 CLOSED. **`docs/20` A-05 는 유지하되 "원문이 보관된 동안" 보장되는 것으로 읽는다** — 원문이 파기돼도 Event → Canonical 재계산·스냅샷 재현·감사는 그대로 된다(재현성 ≠ 원문 재처리 능력). `docs/21` 은 변경 없음 — 원문 보관 기간은 `docs/21` 23절이 Q-45 로 사용자에게 넘겨 둔 것이다.
- 미결: 보관 범주별 **기간 숫자**(Pilot — 고객사 IT · 계약 · 보안·감사 요구 · 개인정보·관련 법률 검토) · 연락처 익명화·법적 보관 의무(`[TO VERIFY]`, Q-48) · `internalDate` 의 정확한 의미(`[TO VERIFY]`, Tech Validation) · 물리 저장 위치와 파기 실행 방식(T-080 이후)

## ADR-033: Main Backend = TypeScript + NestJS · AI Server = 별도 Python 런타임 (Q-64)
- 상태: **Accepted** (2026-09-21, 사용자 결정 — Q-64 CLOSED). **결정 3·4 일부 개정 by ADR-036 (2026-10-22)**: 허용 외부 클라이언트 = LLM 공급자 + CERA Backend Tool API, 호출은 양방향(Backend → 실행 시작 · 재개 / Agent → Tool). 나머지 결정은 그대로
- 날짜: 2026-09-21 (T-083)
- 맥락: T-069 가 첫 구현 Slice(Mock 외부 통신 루프)와 그 기술 조건을 확정했다(`docs/tasks/plans/T-069-external-communication-slice.md` 16절). 사용자는 CERA 의 기본 구조를 **React/Next.js → Main Backend → DB**, 그리고 **Main Backend → Python AI Server** 로 정했고, Main Backend 후보로 NestJS 와 Spring Boot 를 비교해 NestJS 를 골랐다. Python/FastAPI 는 Main Backend 후보가 아니다.
- 결정:
  1. **Main Backend = TypeScript + NestJS, 모듈형 모놀리스.** 같은 코드베이스에서 **API 프로세스**와 **Worker 프로세스**를 따로 실행할 수 있게 한다. 마이크로서비스 분할 · service mesh · Kafka · 분산 워커 클러스터 · 브로커 중심 구조를 처음부터 두지 않는다.
  2. **Main Backend 가 운영 권한의 유일한 주체다**: 인증·인가 · 거래처·연락처 등록부 · DB 권한 · 트랜잭션 · 승인 · 메시지 생애주기 · Outbox · 발송 시도 · Gmail/ChannelAdapter · 발신자 매핑 · 결정론 검증 · 사건 append · 현재 사실 · Reconciliation · 사람 확인 · 감사 · `system_error` · 멱등 · API 계약. **AI Server 가 돌려준 결과의 검증도 Main Backend 가 한다.**
  3. **AI Server = 별도 Python 런타임**(FastAPI 또는 동등한 Python API 런타임 — 구체 패키지는 구현 시점). 맡는 것: 초안 **문장** 생성 · 자유 형식 회신의 **추출 후보** · 향후 문서 추출 · 향후 AI/ML 추론 · Python 전용 AI 작업. **하지 않는 것**: DB 접근 · 수신자 신원 · 거래처 권한 · 사건 확정 · 현재 사실 변경 · 승인 · 외부 발송 · 비용/위험/솔버 권한 · 운영 상태 변경. 가질 수 있는 외부 클라이언트는 **LLM 공급자 호출뿐**이다. **출력은 언제나 후보**이고 Main Backend 가 검증한 뒤에만 반영된다(ADR-026 · ADR-029 는 그대로).
  4. **Main Backend → AI Server 는 HTTP/JSON 을 우선한다.** 요청·응답 스키마를 계약으로 두고, 짧은 timeout · 제한된 재시도(같은 입력이면 다시 불러도 안전한 요청만) · `correlation_id`/`trace_id` 전달 · **장애 격리**(AI 실패 → 추출 실패로 기록 + `system_error` + 사람 확인. 초안은 템플릿으로 대체 가능 — FR-COM-06)를 둔다. AI 장애가 Main Backend 의 권한·DB 상태를 깨뜨리지 않는다. 정확한 프로토콜·endpoint 는 정하지 않는다.
  5. **Worker·Outbox**: Slice 1 은 큐 제품 없이 **DB Outbox → 단일 워커 폴링 → `ChannelAdapter.send()` → `lookup_sent()` 화해**. 워커 잠금·스케줄 방식은 Q-68 · T-080 · U0 에서 정한다. Redis · BullMQ · Kafka · RabbitMQ · 스케줄러 패키지는 정하지 않는다.
  6. **API 계약**: NestJS Backend → **OpenAPI** → `packages/` 에 생성한 TypeScript client/types → React/Next.js. **Frontend 는 Backend 내부 DTO·도메인 타입을 직접 import 하지 않는다**(같은 언어여도 — ADR-028).
  7. **스키마 단일 원천**: API 검증 · OpenAPI · 생성 타입은 **하나의 정본 스키마에서 파생**한다. 실행 시 검증 스키마 · TS 타입 · OpenAPI 스키마를 따로 손으로 관리하지 않는다. 라이브러리 선택은 U0.
  8. **정확성 규칙 — U0 필수 요구**: ① 스키마 단일 원천(7) ② 트랜잭션은 명시적 블록으로만, **외부 호출은 트랜잭션 밖**(T-069 12절 T5 — 시도 선커밋 · 결과는 별도 트랜잭션) ③ 시각은 **타임존이 붙은 한 가지 타입**으로, 날짜·시각 연산은 시간 모듈 안에서만 ④ 금액은 **원 단위 정수**, DB BIGINT 변환 규칙을 정한다 ⑤ Frontend 는 생성 타입만 import(린트로 강제).
  9. **솔버는 Q-65 로 남는다.** NestJS 를 골랐다고 솔버를 TypeScript 로 강제하지 않는다. 솔버는 불변 **PlanningSnapshot 계약**(`docs/05` 14절)을 입력으로 받아 배정을 돌려주는 경계로 붙이고, 런타임(Python · Java · 기타 결정론 런타임)은 Q-65 에서 정한다. 솔버는 결정론 엔진이지 AI 가 아니다(ADR-029).
  10. 저장소 영역은 ADR-024 · ADR-029 그대로다: `back/` = Main Backend(결정론 엔진 포함), `ai/` = AI Server 런타임 코드. **`back/` 와 `ai/` 는 코드·도메인 패키지를 공유하지 않고 HTTP 계약으로만 만난다.**
- 대안: (a) **Spring Boot + Java** — 트랜잭션·시각·금액·실행 시 타입 검증·OpenAPI 일치가 기본으로 더 강하다. 그러나 Frontend(TS) · Backend(Java) · AI(Python) 로 1인 개발 언어가 셋이 된다. (b) **Python/FastAPI 를 Main Backend 로**(ADR-002) — 사용자 전제에서 제외. Python 은 AI Server 로 쓴다.
- 결과: ADR-002 **Superseded by ADR-033**. ADR-031 결정 1·2·8 **Superseded**(나머지는 Proposed 유지). `docs/07` 1·2·3·6절 · `docs/23` 2·3·11·13절 · `docs/01` 7절 · `docs/15` Q-64 CLOSED · `back/`·`ai/` README · T-069 계획 · `AGENTS.md` 동기화. **미결로 남는 것**: Q-68(DB 제품 · ORM/쿼리 · 마이그레이션 · 트랜잭션 구현 · append-only 강제 · 부분 유일 · JSON · 타임존 시각 타입 · BIGINT 매핑 · 워커 잠금 · 내용 저장소 위치) · Q-65(솔버) · U0 선택(스키마 라이브러리 · Node/Nest 버전 · HTTP 클라이언트 · 로깅 · 스케줄러) · AI Server 구체 패키지 · LLM 공급자·모델 · 폴더 세부 구조.

## ADR-034: 영속 계층 = PostgreSQL + Drizzle ORM + drizzle-kit 검토 SQL migration (Q-68)
- 상태: **Accepted** (2026-09-22, 사용자 결정 — Q-68 CLOSED)
- 날짜: 2026-09-22 (T-084)
- 맥락: ADR-033 으로 Main Backend 가 TypeScript + NestJS 로 정해졌다. T-080(P0 29개 물리 설계)은 DB 제품 없이 쓸 수 없다 — 시각·JSON·해시 물리 타입, 부분 유일 제약, append-only 강제 방식이 제품마다 다르다(T-069 계획 16.4). 선택지 비교는 `docs/tasks/plans/T-084-db-decision-options.md`.
- 결정:
  1. **DB = PostgreSQL.** CERA 의 유일한 DB 다. 이유: 관계형 FK · 복합 UNIQUE · partial unique index 등을 이용해 부분/조건부 유일(partial/conditional uniqueness)을 구현할 수 있음(실제 index SQL·구현 방식은 T-080) · 명시적 트랜잭션 · Outbox 폴링과 행 잠금(나중에 다중 워커 잠금으로 확장 가능) · JSON · BIGINT(원 정수) · 타임존이 붙은 시각 타입 · append-only / 불변 제약을 DB 에서 구현할 수 있음 · 사건·상태 재현성 · 운영 확장성.
  2. **SQLite 는 쓰지 않는다** — 운영에도, 개발·시험에도. "개발 SQLite → 운영 PostgreSQL" 이원화를 하지 않는다. 잠금 · 트랜잭션 · 부분 제약/인덱스 · 시각 처리 · JSON · migration 동작이 달라 CERA 의 정확성 중심 시험을 왜곡하기 때문이다. 개발·통합 시험도 PostgreSQL 의미를 그대로 쓴다. 로컬에서 어떻게 띄울지(Docker · 직접 설치 · test container 등)는 U0 / T-080 에서 정한다.
  3. **NestJS DB 접근 = Drizzle ORM.** 이유: TypeScript·NestJS 와 자연스럽게 결합 · SQL 구조에 가까움 · 쿼리와 트랜잭션을 명시적으로 씀 · PostgreSQL 고유 기능으로 내려갈 수 있음(`sql` 등) · 스키마를 코드로 관리 · 생성된 migration SQL 을 사람이 검토할 수 있음 · 트랜잭션·제약이 많은 CERA 구조를 ORM 추상화 뒤에 숨기지 않아도 됨.
  4. **방식 = SQL-aware ORM / Hybrid** (Full ORM 아님). 등록부 조회 · 단순 insert · 읽기 모델은 Drizzle 추상화를 써도 된다. **Outbox · 멱등 · 부분 유일 · 잠금 · append-only 강제 · 핵심 트랜잭션 · Reconciliation 원자적 갱신**은 PostgreSQL 의미가 드러나게 쓰고, 필요하면 Drizzle SQL 탈출구나 PostgreSQL 기능을 직접 쓴다. **DB 가 지킬 수 있는 불변식을 애플리케이션 코드만으로 흉내 내지 않는다.**
  5. **Migration = Drizzle 스키마 → drizzle-kit 이 SQL migration 생성 → 사람이 SQL 검토 → 저장소에 기록 → 명시적으로 적용.** 금지: 운영 자동 스키마 동기화 · 실행 시 자동 스키마 변경 · 검토 없는 파괴적 migration · ORM 상태만 믿고 migration 이력을 버리는 것. `drizzle-kit push` 같은 직접 반영 기능을 운영 migration 의 정본으로 쓰지 않는다. 실제 명령과 운영 절차는 U0 / T-080.
  6. **DB 권한은 Main Backend 만.** 스키마와 migration 의 소유자는 NestJS Main Backend 다. Python AI Server 는 PostgreSQL 클라이언트 · ORM · migration · DB 자격증명을 갖지 않고, Main Backend 와 HTTP/JSON 으로만 통신한다(ADR-033 결정 3·4 재확인).
  7. **트랜잭션**: 핵심 흐름은 명시적 트랜잭션 경계를 유지하고, 외부 I/O 를 긴 DB 트랜잭션 안에 넣지 않는다 — 예: 트랜잭션 A(`send_attempt` 생성 → 커밋) → 트랜잭션 밖 `ChannelAdapter.send()` → 트랜잭션 B(결과 · 메시지 상태 · 감사 → 커밋). ADR-033 결정 8② · T-069 계획 12절 T5 그대로. Drizzle 트랜잭션 작성 방식은 U0 / T-080.
  8. **Outbox / Worker**: Slice 1 방향 유지 — PostgreSQL → DB Outbox → 단일 워커 폴링 → 외부 발송 → 화해. 큐 제품은 도입하지 않는다. 워커가 늘면 PostgreSQL 잠금 기능을 쓸 수 있게 설계한다.
  9. **Append-only / 불변 기록**(Event · Audit · MessageApproval 이력 · PlanDecision · 확인 사건 등)은 애플리케이션 관례만으로 보호하지 않는다. 가능한 불변식은 PostgreSQL 제약으로 먼저 강제한다. UPDATE·DELETE 차단 수단(trigger · 권한 · 저장소 제한 · 조합)은 T-080 에서 비교해 정한다.
  10. **금액 = 원 정수, DB BIGINT.** BIGINT 값을 무조건 JS `number` 로 바꾸지 않는다. TypeScript 쪽 경계(`bigint` · 문자열 경계 · serializer 등)는 T-080 / U0 에서 명시적으로 정한다.
  11. **시각**: PostgreSQL 을 골랐다고 시각 정책이 풀리지 않는다. `received_at` · `source_recorded_at` · `source_event_time` · Gmail `Date` · `internalDate` · Asia/Seoul 표시 규칙(ADR-006 · ADR-032)은 그대로다. 물리 시각 타입 · UTC 저장 방식 · 타임존 정보 보존 방식은 T-080.
- 대안: Prisma · Kysely · TypeORM · MikroORM 은 **현재 구현 후보에서 제외**한다. Drizzle 을 고른 이유는 결정 3·4 와 같다(스키마·타입·migration SQL 을 한 곳에서, 쿼리·트랜잭션은 명시적으로, PostgreSQL 기능으로 바로 내려갈 수 있음). 자세한 비교는 `docs/tasks/plans/T-084-db-decision-options.md` 2·3절에만 둔다. MySQL 은 CERA 요구에서 PostgreSQL 보다 나은 점이 없다.
- 결과: ADR-004 **Superseded by ADR-034**. `docs/07` 3절 · `docs/15` Q-68 CLOSED · `docs/22` · `docs/23` 2·13절 · `back/` README · T-069 계획 16절 · `AGENTS.md` 동기화. **이 ADR 이 정하지 않는 것**: PostgreSQL · Drizzle · Node/Nest 버전 · 연결 풀 패키지 · DB 호스팅(클라우드 · 관리형 제품 · HA/복제 · 백업) · Docker 사용 여부 · 트랜잭션 API 세부 · 잠금 SQL(`SKIP LOCKED` · advisory lock 여부 · 폴링 주기) · 인덱스·트리거 SQL · 내용 저장소 제품 · 운영 구성·배포 · Redis/큐 제품 → T-080 / U0. 솔버(Q-65)는 여전히 OPEN.

## ADR-035: 프론트엔드 = Vite + React SPA, 클라이언트 렌더링(CSR)만 (ADR-022 결정 1·4 대체)
- 상태: **Accepted** (2026-10-06, 사용자 결정)
- 날짜: 2026-10-06
- 맥락: Prototype 은 Next.js(App Router)로 만들었지만 실제로는 화면 하나를 클라이언트에서 재생할 뿐이었다. 사용자는 화면을 **컴포넌트 단위로 다시 만들 계획**이고, **서버 렌더링을 쓰지 않고 CSR 로만** 가기로 했다. 데이터·권한·계산은 모두 Main Backend(NestJS, ADR-033)에 있으므로 프론트 서버가 할 일이 없다. Desktop 은 중앙 Backend 의 Client(ADR-031 Proposed, Electron 첫 후보)이고, 정적 SPA 가 그대로 들어간다.
- 결정:
  1. `front/web/` = **Vite + React + TypeScript SPA**. `index.html` 빈 껍데기 + `src/main.tsx` 의 `createRoot`. **서버 렌더링(SSR·RSC·SSG 미리 그리기) 없음.** `npm run build` → `dist/` 정적 파일.
  2. Main Backend 호출은 같은 출처의 **`/backend/*` → Vite 프록시 → `CERA_API_URL`(기본 `http://127.0.0.1:3100`)**. 그래서 개발 중 Backend 에 CORS 설정이 필요 없다. 배포 때 정적 파일 앞단(리버스 프록시 등)에서 같은 경로를 넘길지, Backend CORS 를 열지는 배포 구성 때 정한다 `[TO VERIFY]`.
  3. Data Contract / Provider(ADR-022 결정 3)와 2D SVG(결정 2)는 그대로. Provider 선택 환경 변수는 `VITE_CERA_PROVIDER`(이전 `NEXT_PUBLIC_CERA_PROVIDER`).
  4. 라우터 라이브러리는 **아직 고르지 않는다**. 지금은 `src/App.tsx` 의 경로 분기 하나(`/` Control Tower, `/dev/api` Backend 응답 확인). 실제 화면을 컴포넌트로 다시 만들 때 고른다.
  5. 시나리오 데이터 팩은 계속 `data/scenarios/` 에서 읽는다(`@scenario` 별칭 · 개발 서버 `fs.allow` = 저장소 루트).
- 대안: Next.js 유지 + `output: 'export'`(런타임 SSR 은 없지만 빌드 때 HTML 을 미리 그리고, export 모드에서는 rewrites 프록시를 못 써서 Backend CORS 가 필요 — 사용자 의도 "서버에서 그리지 않음"과 어긋남).
- 결과: `next` · `eslint-config-next` 제거, `vite` · `@vitejs/plugin-react` · `typescript-eslint` 계열 추가. `next.config.ts` · `src/app/layout.tsx` · `src/app/page.tsx` · `next-env.d.ts` · `.next/` 는 쓰지 않는다. `docs/16` 3·4절, `AGENTS.md` 1·6절, 루트 `README.md` 동기화.

## ADR-036: Agent Runtime = Python + LangGraph · Agent 는 권한 주체가 아니다 (ADR-015 일부 대체 · ADR-033 결정 3·4 일부 개정)
- 상태: **Accepted** (2026-10-22, 사용자 승인 — T-101)
- 날짜: 2026-10-22
- 맥락: 사용자는 CERA 를 실제 Agentic Logistics System 으로 만들기로 했다(2026-10-22). 지금 AI Server 는 회신 1건에 LLM 1회를 부르는 무상태 함수이고, 흐름은 NestJS 결정론 단계뿐이다. 동시에 지금까지 만든 Backend 권한 · 승인 · Contact Gate · 감사 · 멱등은 버리지 않는다. 설계 상세는 `docs/tasks/plans/T-101-agent-runtime-design.md`.
- 결정:
  1. **두 오케스트레이션을 나눈다.** (A) Business Workflow / Authority = NestJS — DB · Event · CanonicalFact · 승인 · Contact Gate · 발송 · 등록부 · 감사 · 상태 전이 · 멱등 · 권한. (B) Agent Reasoning = Python + **LangGraph**(`ai/`) — 정보 공백 판단 · 조사 대상 선택 · Tool 선택 · 회신 해석 · 의미/모호성 판단 · 충분성의 의미 판단 · 후보 복구전략 추론 · 설명. **Agent 는 권한 주체가 아니다. 모든 부작용과 권위 상태 전이는 NestJS 의 typed Tool/API 를 거친다.** Agent 는 DB · SQL · CanonicalFact · 권위 Event · 승인 · Contact Gate · 발송 · Gmail · 사용자/역할 · 계획 확정 · 숫자 생성을 직접 하지 않는다. 승인 · 발송 · 사실 확정 · 계획 확정(`COMMIT` 등급) Tool 은 Agent 에게 열지 않는다.
  2. **LangGraph checkpoint 는 실행 상태(execution state)이지 업무 사실(business truth)이 아니다.** checkpoint 는 "어디서 재개하는가"만 담는다. 사람 승인 상태 · 사실 · 발송 여부의 정본은 PostgreSQL/NestJS 다. interrupt → NestJS 승인 흐름 → 사람 → Backend 이벤트 → Coordinator 의 resume 신호로 이어지고, 재개한 그래프는 Tool 로 현재 상태를 다시 읽는다. checkpoint 는 Backend Tool API 로 저장한다(AI Server 는 DB 자격증명을 갖지 않는다 — ADR-034 결정 6 유지).
  3. **공공데이터는 Agent 가 직접 호출하지 않는다.** NestJS Public Data Adapter → 실제 API → 원문 보존(`raw_input` · ContentStore) → 결정론 정규화 → 출처(provenance) → 필요 시 `PUBLIC_API` Event 후보. Agent 는 `get_vessel_status` · `get_container_manifest` · `get_customs_progress` 같은 typed capability 로 Backend 를 부르고, 받은 값에는 출처 · 관측 시각 · 원문 참조가 붙는다.
  4. **제한된 행위성(bounded agency).** 그래프 모양(노드 · 엣지)은 코드로 고정한다. LLM · Decision 모델은 정해진 분기점에서 열거된 선택지 중에서만 고른다. 실행마다 단계 · Tool 호출 상한(`CERA_AGENT_MAX_STEPS` · `CERA_AGENT_MAX_TOOL_CALLS`)을 둔다. 그래프는 하나(`CeraRecoveryGraph`)로 시작하고, 독립 맥락 · Tool 묶음 · 모델 정책 · 평가셋이 필요할 때만 Subgraph 로 승격한다. Supervisor + 다중 Agent 구조는 만들지 않는다.
  5. **Tool 계약**: 입력 · 출력 스키마는 Backend 의 단일 스키마에서 파생해 `packages/contracts/` 로 내보낸다. 모든 Tool 호출은 서비스 토큰 · 실행 범위 검사 · 부작용 등급(`READ` · `EXTERNAL_READ` · `COMPUTE` · `PROPOSE` · `REQUEST`) · 멱등 키 · 시간 제한 · `agent_tool_call` 감사 · provenance 를 갖는다. 행위자는 `AI_AGENT`.
  6. **관측성**: 실행마다 `agent_run_id` · `trace_id`(W3C `traceparent`) · `recovery_run_id`. 노드마다 시작/종료 · Tool 호출 · 소요 · 모델 · 토큰 · 비용 · 판정 · 오류 · interrupt · resume 을 Backend 소유 표에 남긴다. 원문 · 비밀값은 일반 로그에 남기지 않는다. 외부 추적 SaaS 는 별도 결정 전 쓰지 않는다.
  7. **평가가 복잡도를 정한다**: Extraction · Decision · Tool Selection · Workflow 평가에서 single-call 대비 나아지지 않는 노드는 줄인다.
- 기존 ADR 처리:
  - **ADR-015 (Proposed)** — 결정 중 "LLM 은 말단 함수로만, 도구를 주지 않는다"와 대안 기각 "LLM 플래너"를 **이 ADR 결정 1·4 로 대체**한다. "업무 이벤트 → 다음 업무 단계의 명시적 핸들러 표"(NestJS)와 루프 폭주 방지(디바운스 · 입력 해시) · Agent Activity 기록은 **유지**한다.
  - **ADR-033 (Accepted)** — 결정 3 의 "AI Server 가 가질 수 있는 외부 클라이언트는 LLM 공급자뿐"을 **"LLM 공급자 + CERA Backend Tool API"** 로, 결정 4 의 "Main Backend → AI Server" 단방향을 **양방향(Backend → 실행 시작 · 재개 / Agent → Tool 호출)** 으로 개정한다. 결정 1 · 2(Backend 가 유일한 권한 주체) · 5~10 과 "출력은 언제나 후보" · 장애 격리는 **그대로**다.
  - **ADR-029 (Accepted)** — 유지. `ai/` 영역 정의 문구만 "LLM · 비정형 처리 + Agent 추론 런타임"으로 넓힌다. 결정론 엔진은 `back/` · LLM import 금지 그대로.
  - **ADR-034 (Accepted)** — 유지(결정 6 재확인).
  - ADR-017 · 026 · 027 · 028 · 030 · 006 · AGENTS.md 규칙 3 · 4 · 11 — 유지.
- 대안: (a) LangGraph 를 회신 추출 파이프라인 안에만 — 권한 문제는 없지만 Recovery 추론이라는 목표에 못 미친다. (b) LangGraph 가 운영 전체를 지휘하고 Tool 로 승인 · 발송 · 상태 변경까지 — ADR-029 · 033 · 규칙 3 · 4 와 정면 충돌, 기각. (c) Agent Runtime 을 NestJS(LangGraph.js) 안에 — 권한 코드와 추론 코드가 같은 프로세스 · 같은 DB 자격증명을 공유해 경계가 약해진다. Python 평가 · 모델 생태계도 잃는다.
- 결과: `docs/06` 1·3절 · `docs/18` O절 책임표 · `docs/23` 관측성 · `ai/README.md` · `back/README.md` · AGENTS.md 1.1 표 갱신. T-102 ~ T-107 큐 등록 · T-005/T-006 DEPRECATED · T-099 재배치. 미결: checkpoint 표 구조 · Tool 시간 제한 값 · `system_error` boundary 추가 여부 · Decision 임계값(T-099).

## ADR-037: AI 공급자 · 모델 선정 방식 — 공급자는 ADR, 모델은 설정 (T-099)
- 상태: **Accepted (구조 한정)** — 구조 결정(결정 1~5) 확정 (2026-10-26 사용자 지시) · **공급자 · 모델 선정은 Deferred** (최종 Production 모델은 정해지지 않았다). 제안 2026-10-22, T-099 재개
- 날짜: 2026-10-22 (구조 결정 확정 2026-10-26)
- **2026-10-26 개정(사용자 지시)**: 이 ADR 의 **구조**("공급자 추상화 · 모델은 설정 · 평가로 교체 · AI 는 권한 없음")는 모델 이름과 무관하므로 확정한다. **선정**(어느 공급자 · 모델)은 비워 둔다 — 상용 평가(OpenAI · Gemini · Anthropic · Jev)는 필요할 때 다시 하며 T-099 는 *연속 평가*(Continuous Model Evaluation)로 둔다. 그동안의 **MVP 임시 기본값(provisional)** 은 로컬 `Qwen3-4B-Instruct-2507 Q4_K_M`(llama.cpp, OpenAI 호환) — 이유: API 비용 0 · 현재 로컬 하드웨어에서 동작 · 설정만 바꿔 교체 가능 · **결정론 검증(Backend 검증기 + 사실 파이프라인)이 정확도를 대신 보호한다**. "최종 Production 모델 선정 완료"가 아니다. 모델 출력은 언제나 후보이고 모델 정확도 자체를 제품 안전성의 전제로 두지 않는다(T-093).
- 맥락: T-105 로 실제 Agent Runtime 이 회신 → 추출 → (판정) → 공백 재평가로 이어진다. 어느 AI 를 넣을지가 품질 · 비용을 정한다. 모델 이름은 몇 달마다 바뀌므로(2026-10-12 메모 대비 10-22 에 Jev 1.13 → 1.14, Gemini 4 Argon · 3.5 Flash-Lite 신규 등) 모델 이름마다 아키텍처 ADR 을 새로 쓰면 안 된다.
- 결정(제안):
  1. **공급자(vendor) 선정은 ADR**, **모델(model id) 은 설정**(`CERA_LLM_PROVIDER` · `CERA_LLM_MODEL` · `CERA_DECISION_PROVIDER` · `CERA_DECISION_MODEL`). 모델 교체 = 같은 Eval 을 다시 돌려 기준을 넘는지 확인 + 설정 변경(코드 · ADR 변경 없음).
  2. 두 역할을 섞지 않는다: **Generative Extraction**(자유 회신 → 질문별 값 후보 + 정확한 원문 인용) 1순위 · 2순위, **Decision**(answers_question · firm · conditional · needs_human_review 확률) 1순위 · fallback/baseline.
  3. **선정 근거는 CERA Eval 만**: `ai/evals/datasets/cera-reply-eval-v1`(141건 · 14범주) 의 Gold 등급별(사람 검토 > AGREED = two-model-agreed · AI 교차 검토, Human Gold 아님 > Draft) 점수. 추출은 raw(모델 JSON) 와 **pipeline**(Backend 결정론 검증기를 통과한 값) 을 따로 보고, 범위 위반 · 지어낸 값 · Backend 가 통과시킨 틀린 값 · 근거 정확도 · 한국어 · 조건부 범주 · 스키마 안정성 · 지연 · 비용을 본다. 판정은 F1 과 함께 Brier · ECE(보정) 를 본다. 유명도 · 외부 벤치마크 점수는 근거가 아니다.
  4. 비용 단계: 모델마다 5건 → 20건 → 비용 계산 → 전체. 결과는 재현 가능한 run artifact(`run.json` · `outputs.jsonl` · `metrics.json` · `per_case.csv`) 로 남기고, 비밀값은 저장하지 않는다.
  5. 권한은 그대로: 모델 출력은 후보, 판정은 확률뿐. 문턱값(threshold) 은 Backend 업무 정책으로 나중에 정한다(이 ADR 은 추천만 할 수 있다). 추출 후보 ≠ CanonicalFact(T-105 결정 유지).
  6. **장애 대비 예비 공급자(failover, 2026-10-28 사용자 결정)**: 설정 `CERA_LLM_FALLBACK_PROVIDER` · `CERA_LLM_FALLBACK_MODEL`(선택). 기본 공급자의 **기술 실패**(키 없음 · 401/403 · 429 · 5xx · 시간 초과)에서만 같은 요청을 예비 공급자로 한 번 보낸다. 답의 품질 문제(JSON 아님 · 스키마 불일치 · 거부 · 잘림)는 넘기지 않는다 — 더 나은 답을 찾아 공급자를 바꾸지 않고 Backend 검증기 · 사람 검토가 다룬다. 가격 순 자동 선택은 하지 않는다(순서는 설정). 답한 공급자 · 모델은 `meta.provider` · `model_version` 에 남는다
- 후보(2026-10-22 공식 문서 확인, 첫 비교 대상): Anthropic `claude-sonnet-5-5` · `claude-haiku-5-5`(+ `claude-opus-5-5`) · OpenAI `gpt-6.1-sol` · `gpt-6-luna` · Google `gemini-3.8-flash` · `gemini-3.1-flash-lite`(+ `gemini-4-argon`). 판정: TypeSafe Jev(`typesafe/jev-1.14`, OpenRouter Decisions API — Alpha · 독점 · 데이터 보존 정책 문서 없음) · LLM judge · 로컬 baseline `MoritzLaurer/bge-m3-zeroshot-v2.0-c`(MIT · 상업 친화 데이터 — 2026-10-22 측정: 일부 분류력은 있으나 보정 · 높은 확신 오답이 Production 기준 미달, 무료 참고 기준선으로만) — `mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` 는 학습 데이터에 비상업(ANLI) 이 있어 **연구 비교용만**. 최상위 단가(`claude-fable-5-1` · `gpt-6-astra`, $10/$50) 는 하위 모델이 기준에 못 미칠 때만 추가한다.
- 대안: (a) 공급자 + 모델을 한 번에 ADR 로 고정 — 모델 교체마다 ADR 이 필요해 거부. (b) 외부 벤치마크 순위로 선정 — CERA 의 한국어 업무 회신 · 근거 인용 · 권한 경계를 재지 않아 거부.
- 결과: 구조(1~5)는 확정, **선정 결과(공급자 · 기본 모델 · 근거 run id) 는 Deferred** — 채워지면 이 ADR 의 "선정" 절만 갱신한다(구조 변경 없음). Runtime 코드 기본은 녹화 재생(replay) 그대로이고, 모델을 켜는 환경(Docker `llm` 프로필)의 임시 기본값만 Qwen3-4B 다(`ai/.env.example` · `infra/local/.env.example`). 회신 추출 기록은 모델 출처(`model_version` · `prompt_version` · `schema_version` · 입력 지문)를 남기므로 "어느 모델이 만든 오류인가"를 나중에 가를 수 있다(T-093).

## ADR-038: Recovery Solver = HiGHS 0-1 MIP, Main Backend 프로세스 안 (T-113 · ADR-007 대체 제안)
- 상태: **Accepted for MVP** (2026-10-27, 사용자 스프린트 지시 — 30대 시나리오 · 결정론 재현 · 사실 변경 → 재계산 · 계획 판 · Docker E2E 검증 뒤). 이전: Proposed (2026-10-26, T-113)
- **승인 범위**: "CERA MVP 의 결정론 최적화 엔진으로 지금 HiGHS 를 쓴다"이다. "앞으로의 모든 Solver 를 HiGHS 로 영구 고정한다"가 **아니다.** 문제 크기 · 제약 성격(다음 날 트럭 · 일별 점유 · VRP 등, T-117)이 달라지면 다시 비교해 교체할 수 있어야 한다
- **교체 경계(Business Contract 와 Solver 선택 분리)**: 업무 계약은 Cost Engine 의 비용표(KRW 정수) · 선택지 목록 → Solver → 후보 할당(입력 지문 · 동률 해소 규칙 포함)이다. 계획 저장 · `plan_hash` · 승인 · OUTDATED · 재계산 · 화면 · Agent Tool 은 이 계약만 보고 HiGHS 를 모른다. Solver 를 바꾸는 변경은 `back/src/planning/engine/solver.ts` 안에 머물러야 하고, 같은 입력에서 같은 목적값이 나오는지 기존 시험(30대 S7)으로 확인한다
- 맥락: 결정론 엔진은 `back/`(TypeScript)에 둔다(ADR-029). ADR-007 의 CP-SAT 는 "후보"였고 비교 결정이 남아 있었다(Q-35). MVP 문제(영향 12대 · 대상 23대 · 트럭 11대 · 정시 1시간 · 선택지 117 · 트럭 변수 약 1,800)는 작은 0-1 정수계획이다.
- 결정(제안):
  1. 1단계 할당은 **0-1 MIP** 로 푼다. 솔버는 **HiGHS**(MIT) 의 WASM 판 `highs@1.15.3`(npm, 의존성 없음, 판 고정)을 **Backend 프로세스 안에서** 부른다 — 네트워크 · 별도 프로세스 · Python 없음
  2. 결정론: 단일 스레드 · `random_seed 0` · `mip_rel_gap 0` · 3단계(목적값 → 원래 계획에 가까운 쪽 → 이른 출발 · 트럭 번호) 동률 해소 · 입력 지문
  3. 계수는 Cost Engine 의 KRW 정수만(옵티마이저는 비용 규칙을 모른다). Solver 는 후보 계획만 낸다 — 저장 · 승인 · 실행은 Backend · 사람
  4. 비상 시간 상한 30초 [ASSUMPTION / DEVELOPMENT SAFETY CEILING] — 관측(현재 0.3~0.6 s) 후 조정. 상한에 걸리면 TIME_LIMIT 로 보고
- 대안: (a) OR-Tools CP-SAT — 강하지만 Node 공식 바인딩이 없어 Python 프로세스(또는 AI Server)에 두어야 한다 → 결정론 엔진이 `ai/` 로 새거나 새 서비스가 생긴다(ADR-029 와 어긋남). 규모가 커지거나 스케줄링 제약이 늘면 다시 비교한다. (b) 직접 짠 열거 · 분기 한정 — 트럭 시간 배정까지 넣으면 검증 부담이 크다. (c) min-cost flow — 2시간 연속 점유 · 트럭별 시간창을 그대로 담기 어렵다.
- 결과: `back/src/planning/engine/solver.ts` · `docs/08` 10절 · `docs/24` 18.17. **ADR-007 은 Superseded(2026-10-27)** — Q-35 · Q-65 는 MVP 범위에서 CLOSED.


## ADR-039: 공개 포트폴리오 데모 모드 — 실제 기능은 코드에 두고, 공개 배포는 설정으로 닫는다 (T-131)
- 상태: **Proposed** (2026-10-28, 사용자 지시 "CERA PORTFOLIO PRODUCTION DEPLOYMENT" 를 따라 구현 · 검증. 아래 선택(격리 · LLM · 입구)은 Orchestrator 가 고른 것이라 사용자 확인 대기)
- 맥락: 포트폴리오 링크로 외부 방문자가 CERA 의 실제 동작을 직접 눌러 보게 하려 한다. 그러나 방문자가 실제 Gmail 발송 · 실제 주소 조회 · OAuth · 관리 기능 · 외부 비용(상용 LLM · 공공 API) · 다른 방문자 세션 · 서버 비밀값에 닿으면 안 된다. Backend Core 는 FROZEN 이라 업무 규칙은 바꾸지 않는다.
- 결정:
  1. **명시 플래그 `CERA_PORTFOLIO_DEMO_MODE`**(Backend · AI 각각). 개인 운영(Private Operation) 배포와 섞지 않는다 — `APP_ENV=production` 과 함께 쓰고, 켜지면 **설정 단계에서** Gmail · 실제 수신 허용 목록 · 공공데이터 · dev-header 인증 · 장애 주입 · (production 이면) Origin 목록 없음을 기동 거부한다. AI 는 상용 LLM 모드를 기동 거부한다(키를 넘기지도 않는다)
  2. **LLM = 녹화 재생(선택지 A)**. 방문자 · 봇이 키 비용을 만들 수 없다. 실제 Gemini 추출은 별도 환경 smoke 로 검증된 상태로 둔다(T-099). 선택지 B(제한 호출 + quota)는 채택하지 않아 비용 제한 장치를 만들지 않았다 — 켜려면 이 ADR 을 고친다
  3. **입구 = `POST /auth/demo-session`**: 포트폴리오 모드에서만 경로가 생긴다(아니면 404). 비밀번호 없이 **데모 방문자 계정 하나(DEMO_VISITOR)** 에만 세션을 연다 — 그 계정의 비밀번호는 시드가 만든 아무도 모르는 난수라 로그인 폼으로는 못 들어온다. 세션 토큰은 방문자마다 따로(HttpOnly · Secure · SameSite=Strict). 일반 auth bypass 가 아니다
  4. **역할 `DEMO_VISITOR`(M36)** = OPERATOR − `planning.input` − `public_data.fetch`(등록부 · 사용자 관리 원래 없음). Backend Guard 가 강제
  5. **실제 채널 차단 이중화**: 설정 거부 + `POST /communication/drafts/:id/send` 가 MOCK 이 아닌 메시지를 403 `PORTFOLIO_DEMO_REAL_CHANNEL_BLOCKED`. Mock 답장 도우미는 정해진 문장 · `.invalid` 발신자만(방문자가 쓴 글이 다른 방문자 화면에 섞이지 않게)
  6. **격리 = 공유 상태 + 서버 초기화(선택지 B)**. 방문자별 실행 복제(A)는 사실이 개체(시설 · 트럭 풀) 단위라 실행을 나눠도 사실이 섞이고, 세션 이름공간(C)은 멀티테넌시 재설계라 범위 밖. 대신 `infra/portfolio/reset-demo.sh --if-idle N`(cron): 방문 흔적이 있고 N분 조작이 없으면 DB · 내용 볼륨을 새로 만들고 시드. 공개 초기화 API 는 없다. 이 초기화는 **포트폴리오 compose 프로젝트의 합성 데이터에만** 적용되고, 업무 기록 append-only 정책(개인 운영)과 별개다
  7. **요청 한도**(포트폴리오 모드, 방문자 IP 별 · 프로세스 메모리 [ASSUMPTION]): 데모 세션 10/시간 · 로그인 20/15분 · Agent 실행 · 시작 20/시간 · 재계산 30/시간 · Mock 답장 30/시간 · 추출 재시도 30/시간 · 변경 120/10분 · 읽기 600/분 + 전체 하루 Agent 실행 200(`DEMO_QUOTA_EXCEEDED`). 바깥 울타리로 nginx 30 r/s(burst 120)
  8. **브라우저 경계**: CORS 를 열지 않는다(같은 출처) · 변경 요청 Origin 검사(`CERA_ALLOWED_ORIGINS`, CSRF 2차 방어) · API nosniff · no-referrer · frame DENY · nginx CSP · HSTS(Caddy) · `/backend/internal/*` 404 · 소스맵 없음 · 화면 번들이 읽는 환경변수는 비밀이 아닌 2개
  9. **배포 = `infra/portfolio/`**(Docker Compose · Caddy HTTPS · 클라우드 비종속). 인터넷 노출은 Caddy 80 · 443 뿐, DB · Redis · API · AI 는 외부 경로가 없는 `internal` 망
- 대안: 화면만 숨기기(기각 — 권한은 Backend 가 강제해야 한다) · 공개 `POST /demo/reset`(기각 — 남용) · 방문자별 컨테이너(기각 — 포트폴리오 규모에 과함) · 상용 LLM 제한 호출(보류 — 비용 · 안정성)
- 결과: `back/src/http/public-guards.ts` · `back/src/auth/*`(demo-session) · `back/src/config/env.ts` · M36 · `ai/cera_ai/config.py` · `front/web/src/app/PortfolioDemo.tsx` · `infra/portfolio/` · 시험 `back/test/{unit,db}/portfolio.test.ts` · `ai/tests/test_config.py` · `front/web/src/app/portfolio.test.tsx`

## ADR-040: Private Staging 분리 + 결정론 운영 예외 탐지(Exception Detection Layer) (T-132)
- 상태: **Accepted (사용자 지시 2026-10-28 — 신규 기능 명시 승인, 완료 뒤 Backend 다시 FROZEN)**. 세부 선택도 사용자 승인(2026-10-28, T-133 지시): ① 운영 기준 계획을 탐지 기준으로 — APPROVE ② 탐지 후 Agent 자동 시작 안 함(실행만 만들고 사람에게 알림) — APPROVE ③ 공개 데모 공유 상태 — 현재 규모에서 APPROVE(동시 사용자가 늘면 세션 · 테넌트 격리는 별도 과제)
- 맥락: CERA 는 운영 입력 + Truth 로 실제 계획을 계산할 수 있었지만, 복구 실행은 사람이 문제를 발견해 직접 만들었다. 또 공개 데모(ADR-039)와 별개로 실제 Gmail · 상용 LLM · 공공데이터 · 실제 운영 입력을 쓰는 개인 검증 환경이 필요하다
- 결정:
  1. **환경 분리**: 같은 코드 · 다른 배포. 공개 데모 = `infra/portfolio`(`CERA_PORTFOLIO_DEMO_MODE=true`, 합성 · Mock · 녹화 재생 · 자동 초기화) / Private Staging = `infra/staging`(`APP_ENV=staging`, 데모 모드 false, 실제 채널 · LLM · 공공데이터를 `.env` 로). DB · Redis · ContentStore · 세션은 compose 프로젝트별 볼륨이라 섞이지 않는다. 데모에서 관리자만 실제 Gmail 을 쓰는 우회는 없다. Staging 의 실제 Gmail 은 비운영 환경 안전장치(수신 허용 목록)에 묶인다
  2. **운영 환경 첫 준비 `npm run db:bootstrap`**: SYSTEM · AI_AGENT 행위자 + 사람 계정(환경변수 비밀번호)만 — 합성 데이터 없음. 시드(`db:seed`)는 local · test · 포트폴리오에서만이라 그동안 staging · production 에는 Worker 의 SYSTEM 행위자가 없었다(`SYSTEM_ACTOR_MISSING`)
  3. **운영 기준 계획(Operational Baseline)**: 어느 복구 실행에도 속하지 않은 예정 반입(`planning_container_record.recovery_run_id IS NULL`, M37) — `POST /planning/inputs/containers`. 검증 · 판 · 멱등 규칙은 실행 입력과 같다
  4. **탐지는 결정론(LLM 아님)**: 첫 종류 `WAREHOUSE_CAPACITY_SHORTAGE` — 창고 × 날짜마다 예정 반입 수 vs 수용량 사실 `capacity.day(D)`(Truth 판정). 확정 · 관측 사실 → 단정, 임시 사실 → 예외는 기록하되 실행은 만들지 않음(사람이 확인하면 만듦), 오래됨 · 철회 · 검토 필요 · 없음 → 판단 불가(새 예외 없음 · 해소도 없음). 넘치는 컨테이너 = 계획 순서(출발 시각 → 번호)의 뒤쪽 — 무엇을 어디로 옮길지는 Solver. 기준 시각은 경계에서 한 번(LIVE = 지금, 시나리오 = 스냅숏 시각), 범위 = 계획 범위(LIVE 3일)
  5. **예외 → 복구 실행 자동 생성, Agent 는 자동 시작하지 않는다**: 그래프의 안전 정책 "문의 수량 · 시간대는 실행을 시작한 사람이 정한다(지어내지 않는다)"(`INQUIRY_PARAMETERS_REQUIRED`)와 충돌하기 때문. 자동 실행은 운영 콘솔 "지금 해야 할 일"에 "자동 탐지된 예외 — Agent 시작이 필요합니다"로 올라온다. 외부 연락은 기존대로 사람 승인 뒤에만
  6. **수명주기 최소**: 예외 `ACTIVE → RESOLVED`(해소는 끝 — 다시 부족하면 새 예외). 근거 변화(8 → 6)는 같은 예외의 관측 기록(append-only `operational_exception_observation`, 근거 지문이 같으면 기록 없음). 해소 = 확정 수용량 충분 · 예정 0 · (LIVE) 날짜 경과. 복구 실행 · 계획 기록은 지우지 않는다
  7. **중복 방지 = DB**: 진행 중 예외는 정체(종류 · 범위 · 시나리오 · 시설 · 날짜)마다 하나(부분 유일 인덱스) · 탐지는 트랜잭션 advisory lock 으로 한 번에 하나 · 실행 연결은 한 번 채움(M38 가드). API · Worker · 재시작 · Redis 유무와 무관
  8. **호출 시점**: 사실 · 운영 입력 변경 알림(`FACT_CHANGED` · `OPERATIONAL_INPUT_CHANGED`, API · Worker 프로세스) + Worker 주기(`CERA_EXCEPTION_DETECT_INTERVAL_MS`, 기본 30초). 스위치 `CERA_EXCEPTION_DETECTION`(기본 off — 기존 동작 보존, 배포 구성에서 on)
  9. **출처 표시**: 실행 목록 `source` = `AUTO_DETECTED`(트리거 `EXCEPTION_DETECTED` · 참조 `EXCEPTION:<id>`) · `MANUAL` · `SCENARIO`. 사람이 만드는 실제 실행은 그대로
  10. **시연**: 시나리오 범위도 같은 규칙 — 방문자가 창고 A 수용량 8 을 넣으면 예정 20 대비 부족 12 를 탐지해 새 시뮬레이션 실행을 만들고 `/demo` 가 그 실행을 따라간다
  11. **시설 · 트럭 풀 등록 API**(`POST /registry/facilities` · `POST /registry/truck-pools`, `registry.manage`): 시드 없는 Staging 에서 운영 입력 · 수용량 사실이 가리킬 시설을 만들 길이 없었다(blocker)
- 대안: LLM 판단(기각 — 숫자 · 상태 판단은 결정론) · 실행을 복제해 방문자 격리(ADR-039 와 같은 이유로 기각) · Agent 자동 시작 + 부족 대수를 문의 수량으로(보류 — 정책 충돌, 사람이 원하면 그래프 정책을 바꾸는 별도 결정) · 예외마다 매번 새 기록(기각 — 같은 문제의 변화는 한 예외의 이력)
- 결과: `back/src/detection/*` · M37 · M38 · `back/src/seed/run-bootstrap.ts` · `infra/staging/*` · `back/src/registry/*`(시설 · 트럭 풀 등록) · 화면(실행 목록 배지 · 개요 숫자 · 할 일 · `/demo` 연동) · 시험 `back/test/unit/exception-rules.test.ts` · `back/test/db/exception-detection.test.ts`

## ADR-041: 운영 가시성 — Worker heartbeat · 결정론 시스템 상태 판정 (T-133)
- 상태: **Accepted (사용자 지시 2026-10-28 — 운영 Dashboard · Staging 운영 준비. 업무 로직 변경 없음, 완료 뒤 Backend 다시 FROZEN)**
- 맥락: Private Staging 에서 운영자는 화물 예외뿐 아니라 CERA 자체가 일하고 있는지(Worker · Redis · AI · Gmail · 대기 작업)를 알아야 한다. Worker 는 HTTP 가 없어 healthcheck 가 "프로세스가 떠 있음" 이상을 말하지 못했고, 기존 `/health` 는 API · DB · 큐만 보였다
- 결정:
  1. **Worker heartbeat 는 DB 에**(`runtime_heartbeat`, M39 · M40): 주기를 마칠 때마다 종류별 한 행을 덮어쓴다(마지막 확인 · 주기 ms · 실패한 단계 · 채널별 수신 확인 코드). 프로세스 메모리에 두지 않으므로 API 가 여러 개여도 같은 답이다
  2. **판정은 결정론 순수 함수**(`back/src/ops/system-status.policy.ts`, LLM 없음): 구성 요소 HEALTHY · DEGRADED · DOWN · DISABLED, 전체는 업무 영향 — PostgreSQL 장애만 DOWN, 사람이 손대야 풀리는 것(Worker 멈춤 · Gmail 인증 거부)은 ACTION_REQUIRED, 대체 경로 · 지연(Redis → PostgreSQL 폴링 · AI 장애 → 사람 검토 · 오래 기다리는 작업)은 DEGRADED. 임계값(30초 · 90초 · 15분 · 1초)은 [ASSUMPTION]
  3. **대기 작업은 PostgreSQL 기준**: Redis 는 실행 가속일 뿐이라 큐 길이를 보지 않는다(업무 상태와 어긋나지 않게)
  4. **새 업무 기록 없음**: LLM · Gmail · 공공데이터 상태는 기존 기록(감사 · system_error · send_attempt · 수신 메시지 · public_data_fetch)과 heartbeat 를 읽는다. Gmail 토큰 만료 시각은 CERA 가 알 수 없으므로 추측해 보이지 않는다
  5. **권한 `system.monitor`** = ADMIN · OPERATOR. 데모 방문자 · 현장 담당자 403. 응답에 주소 · 호스트 · 경로 · 키 · 토큰 없음(`GET /agent-runs/runtime` 의 내부 URL 도 제거)
  6. **배포 모드 표시**: `/auth/me` 의 `deployment_mode`(설정에서만) → 모든 화면 위 배지
  7. **새 인프라 없음**: 5초 폴링 재사용 · WebSocket · Prometheus · Grafana · OpenTelemetry 를 넣지 않는다. 상태 이력은 없다(현재 상태만)
- 대안: Worker 에 HTTP 상태 경로(기각 — 내부망 · 프로세스마다 따로 물어야 함, DB 한 행이면 충분) · Redis 키 기반 heartbeat(기각 — Redis 가 정본이 아니고 장애 시 같이 사라짐) · 지표 스택(범위 밖 [향후])
- 결과: `back/src/ops/*` · M39 · M40 · `WorkerRunner` heartbeat · `InboundProcessor` 채널별 결과 · AI `/health` 의 `agent_runtime` · 화면 `SystemHealth` · `ExceptionBoard` · `ModeBadge` · 운영 기준 계획 입력 · 시험 `unit/system-status-policy.test.ts` · `db/ops-status.test.ts` · `fe/components/ops/dashboard.test.tsx`
