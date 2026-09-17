# docs — 정본 문서 색인

- 기준: **기획 v0.2** (2026-09-11). 2026-09-15: `16_frontend-prototype.md` 추가, 저장소를 Monorepo 영역으로 재정렬(ADR-024). 2026-09-16: `18_external-communication.md`(외부 통신 아키텍처)와 `19_external-communication-requirements.md`(외부 통신 요구사항) 추가. 18 = 왜 이 구조인가, 19 = 무엇을 만들어야 하는가. 같은 날 `20_data-model-preconditions.md`(DB 설계 전 요구사항 검토) 추가. 2026-09-17: `21_cera-conceptual-data-model.md`(개념 데이터 모델)와 짝 작업표 `21_cera-conceptual-data-model.xlsx` 추가. 같은 날 검토 반영으로 **rev.2** 개정 + RPG 스타일 DB 명세 Preview `21_cera-db-template-preview.xlsx` 추가. 같은 날 **rev.3**: `03_requirements.md` 2.6.1절 신설(운영자 개입과 재계산)과 `docs/21` 12.5절 추가. 같은 날 개념 모델 **최종 승인(T-076)** 뒤 `22_cera-logical-data-model.md`(논리 DB 설계)와 짝 작업표 `22_cera-logical-data-model.xlsx` 추가 — **DB 제품·ORM·SQL 은 여전히 미확정**. 같은 날 검토 반영으로 **rev.2** 개정(구조 정합성 13건 + **사용자 결정 D-1~D-5 확정**) → **rev.2.1** 최종 정합성 패치(적용 범위 전파 · 분류와 변경 방식 분리 · 새 테이블 0개)
- 저장소 전체 구조(front·back·ai·packages·data·docs·infra)는 루트 `README.md`와 `07_backend-architecture.md` 6절. 코드가 의존하는 기술 문서는 이 폴더(Git)에 둔다. 발표 자료·사업계획서 같은 외부 공유 자료는 Git 밖(예: Google Drive)에 둘 수 있다
- 이 폴더에 있는 문서가 현재 정본(canonical source)의 전부다. 옛 기획(v0.1) 문서와 원본 기획서는 저장소에 남기지 않는다. 무엇이 바뀌었고 무엇이 폐기됐는지는 `CHANGELOG.md`에 있다.

## 1. 문서 목록

| # | 파일 | 역할 | 상태 |
| --- | --- | --- | --- |
| 01 | `01_project-rules.md` | 프로젝트 규칙(원칙, 검증 태그, LLM 경계, 금지 주장, 계산·보안 규칙) | Draft |
| 02 | `02_product-definition.md` | 제품 정의, 포지셔닝, 고객, 범위, 단계, KPI, BM, Discovery 원칙 | Draft |
| 03 | `03_requirements.md` | 기능·비기능 요구사항, 행위자, 여정, 화면 목록. **2.6.1절: 운영자 개입과 재계산**(CERA 선계산 → 입력 수정 → 재계산, `FR-OPR` + `AC-OPR`) | Draft |
| 04 | `04_domain-model.md` | 엔티티, 컨테이너 생애주기, 자원, 계약·Tariff, 비용, 위험 | Draft |
| 05 | `05_event-and-state.md` | Event 스키마, 출처·신뢰도·신선도, Reconciliation, Canonical State, 공공 API 역할 | Draft |
| 06 | `06_agent-architecture.md` | 에이전트 역할, 오케스트레이션, AI vs 결정론 경계, LLM 통합, 사람 게이트 | Draft |
| 07 | `07_backend-architecture.md` | 모듈 구성, 기술 스택, 저장 스키마, 내부 API, 저장소 레이아웃 | Draft |
| 08 | `08_optimization-model.md` | 복구 최적화 정식화, 비용 계수, Baseline, 재최적화 | Draft |
| 09 | `09_mvp-scenario.md` | 기준 데모 시나리오 (부산 Import FCL 30대, 창고 수용량 20 → 8) | Draft |
| 10 | `10_simulation-spec.md` | Operations Simulator 요구사항 (현재 Prototype 2D, Three.js는 선택지) | Draft |
| 11 | `11_data-sources.md` | 데이터 출처 카탈로그, 공공 API 확인 결과, 조인 경로, 메일 입력 | Draft |
| 12 | `12_roadmap.md` | Phase·Gate·태스크 백로그 원천 | Draft |
| 13 | `13_glossary.md` | 용어집 | Living |
| 14 | `14_decisions.md` | ADR | Living |
| 15 | `15_open-questions.md` | 미확정 사항, 리스크 | Living |
| 16 | `16_frontend-prototype.md` | Control Tower Prototype: 범위, 실행, Frontend Data Contract, 재생 단계별 화면, 신뢰 범주, 발견한 Backend·Data 요구사항 | Draft (T-061~T-063) |
| — | `../data/scenarios/busan-wh-capacity-01/README.md` | 30대 시나리오 데이터 팩(Prototype 판): 파일, 구성, 숫자, fixture 수정 기록 | Draft (T-061) |
| — | `CHANGELOG.md` | 기획 버전 간 변경 요약, 폐기된 가정, 문서 이전 지도 | Living |
| — | `data/field-dictionary.md` | 공공 API 필드 사전 (공식 명세 기준, 출처 S-nn) | Draft (T-004) |
| — | `data/code-tables.md` | 공공 API 코드값·에러코드 | Draft (T-004) |
| 17 | `17_ai-development-workflow.md` | AI 협업 개발 Workflow: 역할, Task Brief → Plan → Implement → Review → Docs Sync → Commit, Orchestrator Handoff, Commit Gate | Accepted (ADR-025) |
| 18 | `18_external-communication.md` | 외부 통신 루프 **아키텍처(왜 이 구조인가)**: Channel Adapter, Gmail 첫 검증 채널, OAuth·최소 권한, 실패·중복·재시도, Mock→Real, **O절 CERA 전체 책임 경계표** | Draft (T-068, ADR-026~029 Accepted) |
| 19 | `19_external-communication-requirements.md` | 외부 통신 **요구사항(무엇을 만들어야 하는가)**: 사용자 흐름, 거래처·연락처·이메일 확인, 발송 자격·승인·발송, 회신 수신·AI 추출 계약, 실패 표, 화면 상태, 완료 조건, 우선순위 | **Draft — 사람 검토 대기** (T-071) |
| 20 | `20_data-model-preconditions.md` | **DB 설계 전 요구사항 검토**: DB가 반드시 따라야 하는 확정 규칙 24개, Proposed 설계 분류, 시나리오 가정, 문서 충돌, 원본·파생·계산결과 분류, 식별자, 단계별 결정사항 | 검토 완료 (T-072) |
| 21 | `21_cera-conceptual-data-model.md` | **개념 데이터 모델 (정본, rev.3)**: 데이터 설계 원칙, 도메인 용어집, Concept Inventory, 독립 저장 개념 후보와 그 근거, 사실·사건·현재 상태·계산 결과·계획·근거·통신, 개념 관계와 ERD, 생애주기, Source of Truth 정책, 시나리오·요구사항 역매핑, MVP 구분, 제외 영역, Minimum Conceptual Model | **Approved rev.3** (T-076, 2026-09-17) — 논리 설계의 승인된 기준 |
| — | `21_cera-conceptual-data-model.xlsx` | **개념 검토 작업표**(16 시트): 후보 목록·분류·필터·검토 상태. **최종 스키마가 아니다** | **Approved rev.3** (T-076) |
| — | `21_cera-db-template-preview.xlsx` | **RPG 스타일 DB 명세 Preview**(8 시트, Table Candidate 38개): 테이블·컬럼·타입·PK/FK 후보를 실제 DB 명세처럼 읽기 쉽게 본 것. **확정 스키마가 아니다** | **Approved** (T-076) — 개념 단계 산출물 |
| 22 | `22_cera-logical-data-model.md` | **논리 DB 설계 (정본, rev.2.1)**: 벤더 중립 논리 타입, 테이블 분류 7종, 전체 목록(MVP 50 · Next 1 · MVP 에서 만들지 않음 2), 금지 안티패턴 10종, 열린 질문 판정(Q-54·55·58·59·60·62·63 · L-1~L-16), 도메인별 테이블 명세(A~J), 식별자·시간·금액 모델, **적용 범위와 유효 기간 분리**, 키·제약·참조 무결성, 코드값 정책, 논리 ERD, 시뮬레이션 분리, 개념→테이블 추적표, **분류와 변경 방식 분리**, **적용 범위 전파 점검표**, **사용자 결정 5건(전부 CLOSED)**, **구현 슬라이스 원칙**, **전체 흐름 walkthrough(26항목 검증)** | **Draft rev.2.1 — T-079 최종 승인 대기** |
| — | `22_cera-logical-data-model.xlsx` | **논리 스키마 작업표**(11 시트, 테이블 블록 51, 컬럼 537, 681행): 한글/영문 필드명·논리 타입·제약·예시. 기본키 노랑 · 외래키 초록 · 유일 제약 분홍 · 분류와 변경 방식 병기. **CREATE TABLE 이 아니며 DB 제품·ORM 은 미확정** | **Draft rev.2.1 — T-079 최종 승인 대기** |
| — | `tasks/CURRENT.md` | **현재** 진행 중인 작업 하나의 인수인계 문서 (Claude ↔ Codex 교대 기준) | Living |
| — | `tasks/TASK_BRIEF_TEMPLATE.md` | Task Brief 형식 (WHAT / WHY) | Living |
| — | `tasks/QUEUE.md` | 작업 큐 (**예정** 작업) | Living |
| — | `tasks/LOG.md` | 작업 인계 로그 (**끝난** 작업) | Living (append-only) |

`Draft`: 초안이며 사람 검토 전이다. `Living`: 작업할 때마다 계속 갱신한다.

## 2. 읽는 순서 (처음 온 사람)

1. `02_product-definition.md` — 무엇을 왜 만드는가
2. `09_mvp-scenario.md` — 무엇을 보여줄 것인가 (화면으로 보려면 `16_frontend-prototype.md` 3절대로 `front/web/` 실행)
3. `05_event-and-state.md` — 핵심 설계(다중 출처 → Canonical State)
4. `06_agent-architecture.md`, `07_backend-architecture.md` — 어떻게 만드는가
5. 작업할 태스크의 `참조 문서`

## 3. 정본 우선순위 (충돌 시)

1. `01_project-rules.md`
2. `14_decisions.md`의 `Accepted` ADR
3. `02_product-definition.md` (방향·범위)
4. `05_event-and-state.md`, `04_domain-model.md`
5. `06_agent-architecture.md`, `07_backend-architecture.md`, `08_optimization-model.md`
6. `03_requirements.md`, `19_external-communication-requirements.md`, `20_data-model-preconditions.md`, `21_cera-conceptual-data-model.md`, `09_mvp-scenario.md`, `10_simulation-spec.md`, `11_data-sources.md`, `16_frontend-prototype.md`, `18_external-communication.md`, `data/*`
7. `12_roadmap.md`

하위 문서가 상위 문서와 다르면 하위 문서를 고치거나, 상위 문서 변경이 필요하면 ADR을 먼저 올린다. 단, `data/field-dictionary.md`의 `[VERIFIED]` 사실이 상위 문서의 가정과 다르면 사실을 기준으로 상위 문서를 고친다.

## 4. 문서 변경 규칙

- 문서를 고치면 파일 상단의 `최종 수정`을 갱신한다.
- 새 정본 문서를 만들면 이 색인과 `AGENTS.md` 5절 문서 지도에 등록한다.
- 번호 체계: 정본 문서는 `NN_kebab-case.md`. 하위 상세 문서는 `docs/<주제>/` 폴더에 둔다(예: `docs/data/field-dictionary.md`).
- 수치·사실에는 검증 태그를 붙인다(`01_project-rules.md` 2절).
- **기획이 바뀌면 옛 문서를 남기지 않는다.** 정본을 고치고, 유효한 검증 결과는 새 정본으로 옮긴 뒤, 변경 요약을 `CHANGELOG.md`에 적는다. 과거 원문은 git 이력으로 본다.
- `tasks/LOG.md`는 기존 항목을 수정하지 않는다(append-only). 잘못된 기록은 새 항목으로 정정한다. LOG 속 옛 파일 경로는 `CHANGELOG.md` 7절 표로 읽는다.
