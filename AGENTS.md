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
| 현재 단계 | **Phase 0.5 — Prototype-led Discovery: 이벤트·상태 설계 완료(T-032·T-060), 30대 시나리오 + Control Tower Prototype 완료(T-061~T-063), 사람 검토(T-064·T-001) 대기.** Backend·DB·Solver는 아직 없음. T-036은 DEFERRED |
| 기획 버전 | v0.2 (2026-09-11, 2026-09-15 개정). 변경 이력은 `docs/CHANGELOG.md` |
| 초기 범위 | 부산항 · Import FCL · 컨테이너 30대 안팎 · 창고 수용량 예외 · 사람 확인 · 가상 메일 · 운영 시뮬레이터(Prototype은 2D) |
| 코드 | `front/web/` Next.js Prototype(시나리오 재생, MockProvider)만 있음. `back/`·`ai/`·`packages/`·`infra/`는 README만 있는 빈 책임 영역 (T-003) |

### 1.1 저장소 구조 (Private Monorepo, ADR-024)

Git 저장소는 **하나**다. 안에서 코드 책임 영역만 나눈다. 배포 때는 서비스별 Docker Image로 나눌 수 있으므로 저장소를 나누지 않는다.

| 폴더 | 책임 | 현재 |
| --- | --- | --- |
| `front/` | 화면. `front/web/` = Control Tower (Next.js) | Prototype 동작 |
| `back/` | 중앙 API, 인증, DB·Event 저장, Canonical State, 외부 연동(메일 등), 승인, 감사, 백그라운드 작업, push | 구현 전 |
| `ai/` | LLM 해석(메일·계약서 파싱, 설명) **+ 결정론 엔진**(Tariff·Cost·Risk·Optimization·Solver). 결정론 엔진은 LLM 클라이언트를 import하지 않는다 | 구현 전 |
| `packages/` | 공유 계약(OpenAPI, 생성 타입) | 비어 있음 |
| `data/` | 공통 시나리오·테스트 데이터 (front·back·ai가 같이 씀) | `data/scenarios/busan-wh-capacity-01/` |
| `docs/` | 정본 문서 | — |
| `infra/` | 배포 구성 | 구현 전 |

영역 사이 규칙: `front/`는 raw 데이터 파일이 아니라 계약(API / Provider)만 본다. 계약의 정본은 Backend가 생기면 OpenAPI로 옮긴다(`packages/README.md`). Desktop 앱(Tauri 등)은 **검토 중인 선택지이지 확정 기술이 아니다**.

---

## 2. 매 세션 읽는 순서 (필수)

0. 루트에 `HANDOFF.md`가 있으면 **가장 먼저** 읽는다. 1회성 인계 파일이므로, 내용을 반영한 뒤 삭제한다(정본은 `docs/`, 이력은 LOG에 있음).
1. `AGENTS.md` (이 파일)
2. `docs/01_project-rules.md` — 반드시 지켜야 할 규칙
3. `docs/tasks/QUEUE.md` — 지금 할 일
4. `docs/tasks/LOG.md`의 최근 3개 항목 — 직전 작업자의 인계 내용
5. 선택한 태스크의 `참조 문서`에 적힌 파일만 추가로 읽는다. **docs 전체를 매번 읽지 않는다.**

처음 온 에이전트는 `docs/README.md` 2절의 순서로 한 번 훑는다. LOG에 나오는 옛 파일 경로(`docs/05_domain-model.md` 등)는 `docs/CHANGELOG.md` 7절 표로 새 경로를 찾는다.

---

## 3. 작업 프로토콜

### 3.1 태스크 선택
- `IN_PROGRESS` 태스크가 있고 LOG에 `상태: 중단` 인계가 있으면 → **그것을 이어받는다.**
- 없으면 `TODO` 중 **의존 태스크가 모두 `DONE`** 인 것 가운데 우선순위(P0 > P1 > P2), 그다음 ID 오름차순으로 **하나**를 고른다.
- `NEEDS_HUMAN` 태스크는 에이전트가 수행하지 않는다. 사람이 해야 할 행동을 요약해 보고만 한다.
- `DEPRECATED` 태스크와 그 ID는 다시 쓰지 않는다.
- 한 세션 = 한 태스크가 원칙이다. 태스크가 너무 크면 먼저 쪼개서 큐에 넣고 첫 조각만 수행한다.
- 사용자가 세션에서 다른 작업을 직접 지시하면 그 지시가 우선한다. 단, 끝나면 이 프로토콜의 3.4를 똑같이 수행한다.
- QUEUE 상단의 `사람 지시`를 확인한다(예: 검토 전 착수 금지, 커밋 금지).

### 3.2 착수
- `docs/tasks/QUEUE.md`에서 해당 태스크 상태를 `IN_PROGRESS`로 바꾸고 `담당`에 `에이전트명 / YYYY-MM-DD`를 적는다.

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
5. `docs/tasks/LOG.md` **맨 위**에 인계 기록을 추가한다(템플릿 사용).
6. 이 파일(AGENTS.md) 1절의 `현재 단계`가 바뀌었으면 갱신한다.
7. 기획 방향이 바뀌는 작업이면 `docs/CHANGELOG.md`에 요약을 추가하고, 옛 문서는 남기지 않는다(`docs/README.md` 4절).

### 3.5 막혔을 때
- 상태를 `BLOCKED`로 바꾸고 `차단 사유`와 `해소 조건`을 적는다.
- 사람이 해야 할 일(키 발급, 계약서 확보, 의사결정 등)이면 `NEEDS_HUMAN` 태스크를 새로 만들어 의존으로 연결한다.
- LOG에 기록한 뒤 다른 실행 가능한 태스크로 넘어가거나 세션을 끝낸다.

### 3.6 중간에 끊길 것 같을 때
- 태스크를 `IN_PROGRESS`로 둔 채 LOG에 `상태: 중단` 인계를 남긴다(한 일 / 남은 일 / 다음 한 걸음).

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
10. 사람이 요청하지 않으면 **git commit / push / 원격 생성을 하지 않는다**.

---

## 5. 문서 지도

| 문서 | 내용 | 언제 읽나 |
| --- | --- | --- |
| `docs/README.md` | 문서 색인, 읽는 순서, 정본 우선순위, 변경 규칙 | 처음 / 문서 구조를 바꿀 때 |
| `docs/CHANGELOG.md` | 기획 v0.1 → v0.2 변경, 폐기된 가정, 문서 이전 지도, 옛 경로 대응 | 옛 기록을 읽을 때 |
| `docs/01_project-rules.md` | 원칙, 검증 태그, LLM 경계, 금지 주장, 계산·보안·코드 규칙 | **매 세션** |
| `docs/02_product-definition.md` | 제품 정의, 포지셔닝, 고객, 초기 범위, 단계, KPI, BM, Discovery | 제품 방향을 판단할 때 |
| `docs/03_requirements.md` | 기능·비기능 요구사항, 행위자, 화면 목록 | 기능·UI 작업 |
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
| `data/scenarios/busan-wh-capacity-01/README.md` | 30대 시나리오 데이터 팩(Prototype 판) | 시나리오 값을 바꿀 때 |
| `docs/data/field-dictionary.md` | 공공 API 필드 사전(공식 명세 기준, 출처 S-nn) | 공공 API 어댑터 작업 |
| `docs/data/code-tables.md` | 공공 API 코드값·에러코드 | 어댑터·파서 작업 |
| `docs/tasks/QUEUE.md` | 작업 큐(정본) | **매 세션** |
| `docs/tasks/LOG.md` | 작업 인계 로그 | **매 세션** |

---

## 6. 개발 명령어

> 백엔드 명령은 T-003(저장소 초기화)에서 채운다. 지금은 `front/web/` Prototype만 있다(Node 22 기준, `docs/16_frontend-prototype.md` 3절).

```text
[front/web — Control Tower Prototype]  (모든 명령은 front/web 폴더에서)
설치:        cd front/web && npm install
시나리오 검사: npm run validate:scenario     # 데이터 팩 합계·용량·트럭·KPI·금지 표현
타입 검사:    npm run typecheck
린트:        npm run lint
빌드·실행:    npm run build && npm run start  # http://localhost:3000
브라우저 확인: npm run smoke                  # 서버가 떠 있을 때. Edge/Chrome 헤드리스, 스크린샷 front/web/.smoke/
개발 서버:    npm run dev

[back / ai]  (구현 전)
설치·테스트·린트: (T-003에서 정의)
로컬 실행:       (T-052 / T-054에서 정의)
시나리오 CLI:    (T-046에서 정의)
```
