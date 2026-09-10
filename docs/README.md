# docs — 정본 문서 색인

이 폴더의 문서가 프로젝트의 **정본(canonical source)** 이다.
원본 기획서(`../Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf` / `.docx`)는 출발점이자 참고 자료이며,
기획서와 docs가 다르면 **docs가 우선**한다(단, 차이는 `10_open-questions.md` 또는 `09_decisions.md`에 근거를 남긴다).

## 1. 문서 목록

| # | 파일 | 역할 | 상태 |
| --- | --- | --- | --- |
| 01 | `01_project-rules.md` | 프로젝트 규칙 | Draft v0.1 |
| 02 | `02_product-brief.md` | 제품 정의(기획서 정본 요약) | Draft v0.1 |
| 03 | `03_data-strategy.md` | 데이터 확보 전략 | Draft v0.1 |
| 04 | `04_service-flow.md` | 서비스 플로우 | Draft v0.1 |
| 05 | `05_domain-model.md` | 도메인 모델 / 계산 모델 | Draft v0.1 |
| 06 | `06_architecture.md` | 아키텍처 / 기술 스택 | Draft v0.1 |
| 07 | `07_roadmap.md` | 작업 계획 / Gate | Draft v0.1 |
| 08 | `08_glossary.md` | 용어집 | Draft v0.1 |
| 09 | `09_decisions.md` | ADR 기록 | Living |
| 10 | `10_open-questions.md` | 미확정·검증 필요 항목 | Living |
| — | `tasks/QUEUE.md` | 작업 큐 | Living |
| — | `tasks/LOG.md` | 작업 인계 로그 | Living (append-only) |

`Draft`: 초안이며 사람 검토 전이다. `Living`: 작업할 때마다 계속 갱신한다.

## 2. 정본 우선순위 (충돌 시)

1. `01_project-rules.md`
2. `09_decisions.md`의 `Accepted` ADR
3. `05_domain-model.md`
4. `03_data-strategy.md`, `06_architecture.md`
5. `04_service-flow.md`, `07_roadmap.md`
6. `02_product-brief.md`
7. 원본 기획서(PDF/DOCX)

하위 문서가 상위 문서와 다르면 하위 문서를 고치거나, 상위 문서 변경이 필요하면 ADR을 먼저 올린다.

## 3. 문서 변경 규칙

- 문서를 고치면 파일 상단의 `최종 수정`을 갱신한다.
- 새 정본 문서를 만들면 이 색인과 `AGENTS.md` 5절 문서 지도에 등록한다.
- 번호 체계: 정본 문서는 `NN_kebab-case.md`. 하위 상세 문서는 `docs/<주제>/` 폴더에 둔다(예: `docs/data/field-dictionary.md`).
- 수치·사실에는 검증 태그를 붙인다(규칙은 `01_project-rules.md` 2절).
- `tasks/LOG.md`는 기존 항목을 수정하지 않는다(append-only). 잘못된 기록은 새 항목으로 정정한다.
