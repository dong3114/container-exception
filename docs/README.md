# docs — 정본 문서 색인

- 기준: **기획 v0.2** (2026-09-11)
- 이 폴더에 있는 문서가 현재 정본(canonical source)의 전부다. 옛 기획(v0.1) 문서와 원본 기획서는 저장소에 남기지 않는다. 무엇이 바뀌었고 무엇이 폐기됐는지는 `CHANGELOG.md`에 있다.

## 1. 문서 목록

| # | 파일 | 역할 | 상태 |
| --- | --- | --- | --- |
| 01 | `01_project-rules.md` | 프로젝트 규칙(원칙, 검증 태그, LLM 경계, 금지 주장, 계산·보안 규칙) | Draft |
| 02 | `02_product-definition.md` | 제품 정의, 포지셔닝, 고객, 범위, 단계, KPI, BM, Discovery 원칙 | Draft |
| 03 | `03_requirements.md` | 기능·비기능 요구사항, 행위자, 여정, 화면 목록 | Draft |
| 04 | `04_domain-model.md` | 엔티티, 컨테이너 생애주기, 자원, 계약·Tariff, 비용, 위험 | Draft |
| 05 | `05_event-and-state.md` | Event 스키마, 출처·신뢰도·신선도, Reconciliation, Canonical State, 공공 API 역할 | Draft |
| 06 | `06_agent-architecture.md` | 에이전트 역할, 오케스트레이션, AI vs 결정론 경계, LLM 통합, 사람 게이트 | Draft |
| 07 | `07_backend-architecture.md` | 모듈 구성, 기술 스택, 저장 스키마, 내부 API, 저장소 레이아웃 | Draft |
| 08 | `08_optimization-model.md` | 복구 최적화 정식화, 비용 계수, Baseline, 재최적화 | Draft |
| 09 | `09_mvp-scenario.md` | 기준 데모 시나리오 (부산 Import FCL 30대, 창고 수용량 20 → 8) | Draft |
| 10 | `10_simulation-spec.md` | Three.js Operations Simulator 요구사항 | Draft |
| 11 | `11_data-sources.md` | 데이터 출처 카탈로그, 공공 API 확인 결과, 조인 경로, 메일 입력 | Draft |
| 12 | `12_roadmap.md` | Phase·Gate·태스크 백로그 원천 | Draft |
| 13 | `13_glossary.md` | 용어집 | Living |
| 14 | `14_decisions.md` | ADR | Living |
| 15 | `15_open-questions.md` | 미확정 사항, 리스크 | Living |
| — | `CHANGELOG.md` | 기획 버전 간 변경 요약, 폐기된 가정, 문서 이전 지도 | Living |
| — | `data/field-dictionary.md` | 공공 API 필드 사전 (공식 명세 기준, 출처 S-nn) | Draft (T-004) |
| — | `data/code-tables.md` | 공공 API 코드값·에러코드 | Draft (T-004) |
| — | `tasks/QUEUE.md` | 작업 큐 | Living |
| — | `tasks/LOG.md` | 작업 인계 로그 | Living (append-only) |

`Draft`: 초안이며 사람 검토 전이다. `Living`: 작업할 때마다 계속 갱신한다.

## 2. 읽는 순서 (처음 온 사람)

1. `02_product-definition.md` — 무엇을 왜 만드는가
2. `09_mvp-scenario.md` — 무엇을 보여줄 것인가
3. `05_event-and-state.md` — 핵심 설계(다중 출처 → Canonical State)
4. `06_agent-architecture.md`, `07_backend-architecture.md` — 어떻게 만드는가
5. 작업할 태스크의 `참조 문서`

## 3. 정본 우선순위 (충돌 시)

1. `01_project-rules.md`
2. `14_decisions.md`의 `Accepted` ADR
3. `02_product-definition.md` (방향·범위)
4. `05_event-and-state.md`, `04_domain-model.md`
5. `06_agent-architecture.md`, `07_backend-architecture.md`, `08_optimization-model.md`
6. `03_requirements.md`, `09_mvp-scenario.md`, `10_simulation-spec.md`, `11_data-sources.md`, `data/*`
7. `12_roadmap.md`

하위 문서가 상위 문서와 다르면 하위 문서를 고치거나, 상위 문서 변경이 필요하면 ADR을 먼저 올린다. 단, `data/field-dictionary.md`의 `[VERIFIED]` 사실이 상위 문서의 가정과 다르면 사실을 기준으로 상위 문서를 고친다.

## 4. 문서 변경 규칙

- 문서를 고치면 파일 상단의 `최종 수정`을 갱신한다.
- 새 정본 문서를 만들면 이 색인과 `AGENTS.md` 5절 문서 지도에 등록한다.
- 번호 체계: 정본 문서는 `NN_kebab-case.md`. 하위 상세 문서는 `docs/<주제>/` 폴더에 둔다(예: `docs/data/field-dictionary.md`).
- 수치·사실에는 검증 태그를 붙인다(`01_project-rules.md` 2절).
- **기획이 바뀌면 옛 문서를 남기지 않는다.** 정본을 고치고, 유효한 검증 결과는 새 정본으로 옮긴 뒤, 변경 요약을 `CHANGELOG.md`에 적는다. 과거 원문은 git 이력으로 본다.
- `tasks/LOG.md`는 기존 항목을 수정하지 않는다(append-only). 잘못된 기록은 새 항목으로 정정한다. LOG 속 옛 파일 경로는 `CHANGELOG.md` 7절 표로 읽는다.
