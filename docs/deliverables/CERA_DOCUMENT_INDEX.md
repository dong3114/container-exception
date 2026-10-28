# CERA 산출물 문서 INDEX

| 항목 | 내용 |
| --- | --- |
| 작성일 · 기준 | 2026-10-28 · 저장소 HEAD `5881529`(코드 기준 시점) + T-132(예외 자동 탐지 · Private Staging) 반영 |
| 정본 우선순위 | 실제 코드 → DB migration / schema → API 계약(OpenAPI · Tool · AI) → 시험 → 최신 docs → CURRENT · QUEUE · LOG · ADR → 과거 기획 문서. **과거 문서와 다르면 이 산출물(= 현재 구현)이 우선**한다 |
| 표기 | `[미확정]` 정하지 않음 · `[ASSUMPTION]` 가정 값 · `[향후]` 구현 안 됨 · `[외부 의존]` 외부 조건 필요 |
| 상태 | Backend Core Logic FROZEN · Frontend Demo Freeze · 공개 포트폴리오 배포 구성 준비(실제 서버 배포 전) |

## 1. 문서 목록

| # | 문서 | 목적 | 대상 독자 | 상태 | 관련 문서 |
| --- | --- | --- | --- | --- | --- |
| 01 | [서비스 기획서](01_service-plan.md) | 왜 만들었나 · 문제 · 사용자 · 범위 · 현재 수준 | 기획 · 경영 · 포트폴리오 검토자 | 확정 | 02 · 03 · 11 |
| 02 | [요구사항 분석서](02_requirements-analysis.md) | 구현된 기능 83 · 비기능 28 요구사항(카드 · 우선순위 · 역할 권한 표) | 기획 · 개발 · QA | 확정 | 03 · 07 · 09 |
| 03 | [유스케이스 분석서](03_use-cases.md) | Actor · 유스케이스 29 · 주요 시퀀스 6 | 기획 · 개발 · QA | 확정 | 02 · 07 |
| 04 | [데이터 분석서](04_data-analysis.md) | 데이터 소스 18 · 실제/합성 · 흐름 · 품질 · 보안 · 향후 분석 | 데이터 · 기획 · 보안 | 확정 | 05 · 06 |
| 05 | [데이터 모델 및 테이블 설계서](05_data-model-and-tables.md) | 53표 도메인 · 표별 상세 · ERD · 관계 · append-only · ID/시간 | 개발 · DBA | 확정 | 부록 A · 04 |
| 05a | [부록 A. 테이블 · 컬럼 전체 명세](05a_appendix-table-columns.md) | 654 컬럼 · 제약 · 인덱스 · 트리거(카탈로그에서 자동 생성) | 개발 · DBA | 자동 생성 | 05 |
| 06 | [시스템 아키텍처 설계서](06_system-architecture.md) | 구성 · 책임 · Agent 경계 · 정본/실행 상태 · 장애 복구 · 배포 | 개발 · 운영 | 확정 | 07 · 08 |
| 07 | [인터페이스 · API 연계 설계서](07_interface-api.md) | 공통 규약 · 주요 API · Internal · Agent Tool 14 · AI Server · 외부 연동 | 개발 · 연동 | 확정 | 부록 B · 02 |
| 07a | [부록 B. API 엔드포인트 전체 목록](07a_appendix-api-endpoints.md) | 84 경로 · 권한 · Handler · 코드 위치(Controller 에서 자동 생성) | 개발 · QA | 자동 생성 | 07 |
| 08 | [비기능 요구사항 및 운영 설계서](08_nfr-and-operations.md) | 보안 · 가용성 · 감사 · 성능(실측) · 관측 · 배포 · 운영 절차 · 위험 | 운영 · 보안 · 개발 | 확정 | 06 · `infra/*/README.md` |
| 09 | [요구사항 추적성 매트릭스](09_traceability-matrix.md) | 요구사항 → UC → API → Service → Table → Test | 개발 · QA · 감리 | 확정 | 02 · 03 · 05 · 07 |
| 10 | [화면 정의서 1차 초안](10_screen-definition-draft.md) | 현재 화면의 정보 구조 · 기능 | 기획 · 디자인 · 개발 | **DRAFT / NON-FINAL** | 03 · 07 |
| 11 | [용어집](11_glossary.md) | 업무 용어 · 상태값 · 역할 · 오류 코드(코드값 ↔ 쉬운 말) | 전원 | 확정 | 전체 |

## 2. 읽는 순서

- 처음 보는 사람: 01 → 11 → 03 → 06
- 개발 · 유지보수: 06 → 07(+ 부록 B) → 05(+ 부록 A) → 09
- 운영: 08 → [`infra/README.md`](../../infra/README.md) → [`infra/portfolio/README.md`](../../infra/portfolio/README.md)
- 화면 개선: 10 → 03 → [`docs/16`](../16_frontend-prototype.md)

## 3. 기존 문서와의 관계

`docs/01`~`docs/24` 는 설계 · 결정 이력이다. 지우거나 고치지 않았다. 이 산출물과 다를 때의 기준:

| 기존 문서 | 성격 | 이 산출물과 다를 때 |
| --- | --- | --- |
| `docs/02_product-definition.md` · `docs/03_requirements.md` | 기획 · 요구사항(설계 시점 — 미구현 항목 포함) | Historical — 구현 범위는 01 · 02 |
| `docs/04` · `05` · `06` · `07` · `08` · `09` · `10` | 도메인 · 사건/상태 · Agent · Backend · 최적화 · 시나리오 · 시뮬레이션 설계 | 설계 근거로 유효. 구현 사실은 05 · 06 · 07 |
| `docs/13_glossary.md` | 설계 시점 용어집 | 코드값 · 상태는 11 |
| `docs/14_decisions.md` | ADR(결정 기록) | 정본(결정). 산출물은 이를 인용 |
| `docs/18` · `docs/19` | 외부 통신 설계 · 요구사항 | 구현 기준은 02 · 07 |
| `docs/21` · `22` · `24` | 개념 · 논리 · 물리 데이터 모델 | `docs/24` 22절은 시험이 실제 DB 와 대조하는 명세 — 05 와 함께 유효 |
| `docs/16_frontend-prototype.md` | 화면 구현 기록 | 10 과 함께 유효 |
| `README.md` · `AGENTS.md` · `docs/tasks/*` | 저장소 안내 · 작업 규칙 · 진행 기록 | 그대로 |

## 4. 문서 검토 발견사항

문서 작성 중 코드와 문서 사이에서 발견한 사항은 [`DOCUMENTATION_REVIEW_FINDINGS.md`](DOCUMENTATION_REVIEW_FINDINGS.md) 에 따로 적었다(코드는 고치지 않았다).

## 5. 자동 생성 부록 다시 만들기

부록 A · B 는 손으로 고치지 않는다. 스키마 · Controller 가 바뀌면 같은 방식으로 다시 만든다:
- 부록 A: migration 을 모두 적용한 PostgreSQL 에서 `pg_attribute` · `pg_constraint` · `pg_indexes` · `pg_trigger` · `information_schema.role_table_grants` 를 읽어 표로 만든다
- 부록 B: `back/src/**/*.controller.ts` 의 `@Controller` · `@Get/@Post/@Put/@Patch/@Delete` · `@RequirePermission` · `@Public` 데코레이터를 읽어 표로 만든다
- 생성 스크립트는 저장소에 넣지 않았다[미확정 — 필요하면 `back/src/dev/` 도구로 추가]
