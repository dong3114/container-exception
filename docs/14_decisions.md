# 14. 설계 결정 기록 (ADR)

- 상태: Living (기획 v0.2)
- 최종 수정: 2026-09-11 (v0.2: ADR-011~018 추가, 기존 ADR에 v0.2 주석. `09_decisions.md`에서 이름 변경)

상태 값: `Proposed`(제안, 사람 승인 전) · `Accepted`(확정) · `Superseded by ADR-NNN`(대체됨) · `Rejected`(기각).
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
| 002 | 백엔드 스택 Python | Proposed |
| 003 | PoC UI Streamlit | **Superseded by ADR-016** |
| 004 | SQLite → PostgreSQL | Proposed |
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
| 019 | Reconciliation Policy: 근거 강도 × 최근성 × 신선도, 강도 가드·동시 충돌·불리한 변경 보류 | Proposed (T-032) |
| 020 | 출처 3축(채널·역할·추출 방식)과 상태 차원 분리 | Proposed (T-032) |
| 021 | 컨테이너 상태 = Hybrid (사실 + 유도 단계 + 예외 오버레이 + 영향) | Proposed (T-032) |

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
- 상태: Proposed
- 날짜: 2026-09-10
- 맥락: 최적화(OR-Tools), XML 공공 API, LLM 연동이 모두 필요하다. 1인 + 에이전트 개발이다.
- 결정: `07_backend-architecture.md` 3절의 스택.
- 대안: TypeScript/Node(OR-Tools 바인딩이 약함), Java(개발 속도).
- 결과: UI는 별도 결정(ADR-003 → ADR-016).
- **v0.2 주석**: 백엔드 스택은 그대로다. LLM SDK(Anthropic Python SDK)와 SSE가 추가됐다. 프론트엔드는 ADR-016.

## ADR-003: PoC UI — Streamlit
- 상태: **Superseded by ADR-016** (Proposed 상태에서 대체됨, 2026-09-11)
- 날짜: 2026-09-10
- 맥락: 공모전·PoC 데모가 우선이고 화면 수가 적다.
- 결정: V0.1~V0.2는 Streamlit. V0.1은 서비스 계층을 직접 호출하고, V0.2부터 FastAPI를 분리한다.
- 대안: Next.js + FastAPI(완성도는 높지만 초기 속도가 느림).
- 결과: 공모전 심사에서 UI 완성도가 중요하면 T-013 전에 다시 결정한다(Q-10).
- **대체 이유**: v0.2는 Three.js 2.5D 시뮬레이터, 실시간 Agent Activity Timeline, 짧은 액션 UI가 필요하다. Streamlit으로는 이 상호작용을 만들기 어렵다.

## ADR-004: 저장소 — SQLite(PoC) → PostgreSQL
- 상태: Proposed
- 날짜: 2026-09-10
- 결정: SQLAlchemy 2.x + Alembic으로 추상화하고 PoC는 SQLite 파일 하나를 쓴다. JSON 컬럼은 두 DB에서 모두 동작하는 방식만 쓴다.
- 결과: 동시 쓰기가 많아지는 V1 전에 PostgreSQL로 옮긴다.
- **v0.2 주석**: 유지. "V1 전"은 "Pilot 전"으로 읽는다. 저장 구조는 ADR-013.

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
- 상태: **Reopened → Proposed** (2026-09-11, 사람 검토 지시). 이전 상태: Accepted (2026-09-10, 원본 기획서 결정 승계)
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

## ADR-015: 역할 분리 에이전트 + 결정론 오케스트레이터
- 상태: Proposed
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
- 상태: Proposed
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

## ADR-020: 출처 3축과 상태 차원 분리
- 상태: Proposed
- 날짜: 2026-09-11 (T-032)
- 맥락: v0.2 초안의 `source_type`(`HUMAN_CONFIRMED`, `EMAIL_EXTRACTED` 등)은 채널과 확인·추출 여부를 한 값에 섞었다. Canonical 상태 7개 값(CONFIRMED~UNKNOWN)은 "누가 보증하나", "얼마나 오래됐나", "다툼이 있나", "값이 있나"를 한 enum에 넣었다.
- 결정:
  - 출처는 `source_type`(채널: HUMAN_UI, FILE_IMPORT, EMAIL, DOCUMENT, PUBLIC_API, PARTNER_SYSTEM, INFERENCE) × `source_role`(현실의 역할) × `extraction.method`로 표현한다. 시뮬레이션은 출처 유형이 아니라 `is_simulated` 플래그다.
  - Event에는 불변 필드만 둔다. `verification_status`, `supersession_status`, 신선도는 `as_of`마다 계산한다.
  - Canonical Fact는 `value_status`, `freshness_status`, `conflict_status`, `hold_status`를 따로 두고, 엔진은 이를 합친 `decision_usability` 하나를 본다.
- 대안: 7개 값 단일 enum 유지 — "사람이 확인했지만 오래됐다"(CONFIRMED + STALE) 같은 조합을 표현하지 못하고, 어느 한쪽 정보를 버리게 된다.
- 결과: 옛 값 대응표는 `05_event-and-state.md` 3.1·6.2절. 화면은 값 옆에 차원별 배지를 보여준다.

## ADR-021: 컨테이너 상태 = Hybrid (ADR-005 확장)
- 상태: Proposed
- 날짜: 2026-09-11 (T-032)
- 맥락: 단일 lifecycle enum은 순서가 바뀐 이벤트와 출처별 근거를 다루지 못한다. 마일스톤만 두면 화면·위험 판정이 어렵다. 옛 유도 규칙에서는 S1 DISCHARGED에 도달할 수 없었다(Q-22).
- 결정: 층 1 사실(마일스톤 11개, `customs.status`, `location`, `exception.*`, `plan.*`, `forecast.eta` — 패치에서 `plan.eta`를 `forecast.eta`로 옮김) → 층 2 파생 단계 10개(유도 규칙) → 층 3 컨테이너 예외 → 층 4 자원 영향(Risk가 계산, 사실 아님). CUSTOMS_PENDING은 신고 근거가 있을 때만이고, 통관 정보가 없으면 DISCHARGED다. 엔진은 단계가 아니라 사실과 `ready_at`을 입력으로 쓴다(`04_domain-model.md` 2절).
- 대안: 단일 enum(폐기), 마일스톤만(화면·위험 판정에 부족).
- 결과: Q-22 해결. 창고 수용량 감소·트럭 부족 등은 컨테이너 예외가 아니라 자원 조건 → 영향으로 다룬다. 10단계가 현장에 맞는지는 `[TO VERIFY]` Q-32.
