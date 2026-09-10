# 작업 큐 (정본)

- 최종 수정: 2026-09-10 (T-000 완료 후)
- 프로토콜: `AGENTS.md` 3절

## 다음 추천 태스크

1. **T-001** (NEEDS_HUMAN) — 초안 검토·ADR 승인
2. **T-002** (NEEDS_HUMAN) — API 키 발급
3. **T-004** (에이전트 가능, 의존 없음) — 공식 명세 확보 + 필드 사전 초안
4. **T-029** (에이전트 가능, 의존 없음) — 공개 D&D Tariff 원문 조사
5. **T-017** (에이전트 가능, 의존 없음) — 인터뷰 가이드 초안

에이전트가 지금 바로 할 수 있는 것: **T-004**, **T-029**, **T-017**. T-003은 T-001(스택 승인) 뒤에 한다.

---

## 상태 규칙

| 상태 | 의미 |
| --- | --- |
| `TODO` | 대기 |
| `IN_PROGRESS` | 진행 중 (`담당`에 에이전트명/날짜) |
| `BLOCKED` | 막힘 (`차단 사유`, `해소 조건` 필수) |
| `NEEDS_HUMAN` | 사람만 할 수 있음. 에이전트는 수행하지 않는다 |
| `DONE` | 완료 조건 충족, `완료` 섹션으로 이동 |

우선순위: `P0`(지금 막고 있는 것) > `P1`(이번 단계) > `P2`(다음 단계 준비).

## 태스크 템플릿

```markdown
### T-NNN: 제목
- 상태: TODO | 우선: P1 | 단계: Phase N | 담당: -
- 의존: T-xxx, T-yyy
- 참조 문서: docs/..., docs/...
- 목표: 한두 문장
- 작업 내용:
  - ...
- 산출물: 경로
- 완료 조건:
  - [ ] ...
  - [ ] 영향받은 docs 갱신
- 완료 후 큐잉 힌트: 어떤 태스크가 풀리는지, 후속으로 만들 만한 것
```

---

## 진행 중

(없음)

## 대기

### T-001: 초안 문서 검토 및 ADR 승인
- 상태: NEEDS_HUMAN | 우선: P0 | 단계: Phase 0 | 담당: 사람
- 의존: T-000
- 참조 문서: AGENTS.md, docs/09_decisions.md, docs/10_open-questions.md
- 목표: 초안 체계와 주요 설계 결정을 확정해 코드 작업을 시작할 수 있게 한다.
- 작업 내용:
  - ADR-001~006, 009, 010을 Accepted/Rejected로 판정
  - Q-01, Q-02, Q-07, Q-10, Q-15, Q-16에 답변
  - Gate 1·2 통과 기준 수치(`07_roadmap.md` 3·4절) 확인
- 산출물: `09_decisions.md`, `10_open-questions.md` 갱신
- 완료 조건:
  - [ ] ADR-002(스택), ADR-003(UI) 판정
  - [ ] 판정 결과를 에이전트가 문서에 반영
- 완료 후 큐잉 힌트: T-003이 풀린다.

### T-002: 공공 API 키 발급
- 상태: NEEDS_HUMAN | 우선: P0 | 단계: Phase 0 | 담당: 사람
- 의존: 없음
- 참조 문서: docs/03_data-strategy.md 2.1절
- 목표: 실제 호출에 필요한 인증키를 확보한다.
- 작업 내용:
  - UNI-PASS 회원가입 → OpenAPI 인증키(API001 화물통관진행정보) 발급
  - 공공데이터포털 활용신청: `관세청_화물통관진행정보`(15126268), `해양수산부_외항화물컨테이너정보`(15131742), 선박 입출항 데이터셋(T-004 결과에 따라)
  - 로컬 `.env`에 저장 (커밋 금지)
  - 테스트용 실제 B/L 5~20건 준비 (본인·지인 회사 화물 등, 외부 공유 금지)
- 완료 조건:
  - [ ] 키 발급 완료, 트래픽 한도 확인(Q-05)
  - [ ] 샘플 B/L 목록을 `data/raw/`에 로컬 보관
- 완료 후 큐잉 힌트: T-005, T-006이 풀린다(T-003도 필요).

### T-004: 공공 API 공식 명세 확보 및 필드 사전 초안
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: 없음
- 참조 문서: docs/03_data-strategy.md, docs/05_domain-model.md 3절, docs/01_project-rules.md 2절
- 목표: 키 없이 확인할 수 있는 범위에서 API 요청·응답 명세를 1차 출처로 정리한다.
- 작업 내용:
  - data.go.kr 15126268, 15131742 페이지와 첨부 명세서(활용가이드) 확인
  - UNI-PASS "OPEN API 연계 가이드" 공개본 확인 (엔드포인트, 파라미터, 응답 태그, 처리이력 구조, 오류코드)
  - 선박 입출항(PORT-MIS 계열) 데이터셋 후보 조사 → DS-03 확정안
  - 부산항 체인포털 공개 API 여부 확인 (DS-04)
  - 필드 사전·코드표 초안 작성, 각 항목에 출처 URL과 태그
- 산출물: `docs/data/field-dictionary.md`, `docs/data/code-tables.md`, `docs/03_data-strategy.md` 갱신
- 완료 조건:
  - [ ] DS-01·DS-02의 요청 파라미터·응답 필드가 1차 출처 기준으로 정리됨 (못 찾은 항목은 `[TO VERIFY]`)
  - [ ] Q-03, Q-04에 1차 결론 또는 추가 조사 필요 사유 기록
  - [ ] 필드 사전의 각 필드를 ContainerState 필드에 매핑(또는 "미사용")
  - [ ] `docs/README.md` 색인에 새 문서 등록
- 완료 후 큐잉 힌트: T-007이 풀린다. 새로 발견한 API가 있으면 수집 태스크를 추가한다.

### T-003: 저장소 초기화
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-001 (ADR-002 승인)
- 참조 문서: docs/06_architecture.md 2·3·6절, docs/01_project-rules.md 6·7절
- 목표: 코드 작업의 뼈대를 만든다.
- 작업 내용:
  - ~~`git init`, `.gitignore`~~ — 2026-09-10 사용자 지시로 선행 완료 (LOG 참고). `.gitignore`는 필요 시 보강
  - uv + `pyproject.toml` (Python 3.12, 의존성은 V0.1 범위만)
  - `src/cera/` 하위 패키지 뼈대, `tests/` 뼈대, ruff·pytest 설정
  - `.env.example`, `src/cera/config/assumptions.yaml`(`05_domain-model.md`의 가정값 + 태그)
  - 사람용 `README.md`
  - `AGENTS.md` 6절 개발 명령어 채우기
- 산출물: 저장소 뼈대
- 완료 조건:
  - [ ] `uv run pytest`가 통과(빈 테스트 1개 이상)
  - [ ] `uv run ruff check` 통과
  - [ ] AGENTS.md 6절 갱신
- 완료 후 큐잉 힌트: T-005, T-006(키 필요), T-008, T-018이 풀린다.

### T-029: 공개 D&D Tariff 원문 조사
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: 없음
- 참조 문서: docs/05_domain-model.md 3.3·4.1·4.2절, docs/10_open-questions.md Q-08·Q-09
- 목표: 코드 없이 선사 공개 Tariff 원문을 조사해 TariffRule 스키마가 표현해야 할 규칙을 찾는다.
- 작업 내용:
  - 한국(부산) 수입 기준 공개 D&D Tariff 2~3개 선사 조사 (후보: Maersk, HMM, MSC 등. 공개 여부부터 확인)
  - 선사별 Free Time 일수, 기산 이벤트, 역일/영업일, 휴일 제외, Combined/Split, 요율 구간, 통화, 만료 시각 정리
  - 현재 TariffRule 초안(`05_domain-model.md` 3.3)으로 표현할 수 없는 규칙 목록
  - T-008에서 구조화할 선사 1곳 추천
- 산출물: `docs/data/tariff-research.md`
- 완료 조건:
  - [ ] 선사마다 출처 URL·확인일·태그 기록
  - [ ] Q-08, Q-09에 1차 결론 기록
  - [ ] 스키마 보완 제안이 있으면 `05_domain-model.md`에 반영하거나 ADR Proposed로 올림
  - [ ] `docs/README.md` 색인 등록
- 완료 후 큐잉 힌트: T-008 입력이 된다.

### T-017: 현업 인터뷰 가이드 초안
- 상태: TODO | 우선: P2 | 단계: Phase 0 | 담당: -
- 의존: 없음
- 참조 문서: docs/02_product-brief.md, docs/10_open-questions.md
- 목표: R-2~R-5와 Q-06, Q-07, Q-11, Q-14를 검증할 인터뷰 질문지를 만든다.
- 작업 내용:
  - 대상별(포워더, 화주 물류팀, 운송사, ODCY) 질문지 30~45분 분량
  - 각 질문이 어떤 리스크·질문 ID를 검증하는지 표시
  - 인터뷰 결과 기록 템플릿
- 산출물: `docs/research/interview-guide.md`, `docs/research/interview-template.md`
- 완료 조건:
  - [ ] R-2~R-5 각각에 질문 3개 이상 대응
  - [ ] 유도 질문을 피하는 문항으로 작성 ("D&D가 문제죠?" 금지)
  - [ ] `docs/README.md` 색인 등록
- 완료 후 큐잉 힌트: 실제 인터뷰 수행은 NEEDS_HUMAN 태스크로 추가.

### T-005: UNI-PASS 클라이언트 및 실제 호출
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-002, T-003, T-004
- 참조 문서: docs/03_data-strategy.md, docs/data/field-dictionary.md
- 목표: 실제 응답을 확보하고 읽기 전용 클라이언트를 만든다.
- 작업 내용:
  - `ingest/unipass.py`: 조회(화물관리번호 / MBL·HBL + 연도), 타임아웃·재시도, 원본 저장
  - 샘플 B/L 5~20건 실제 호출 → `data/raw/` 저장 → 마스킹본을 `data/fixtures/`에
  - fixture 기반 파서 단위 테스트
  - 처리이력에 어떤 이벤트가 나오는지 정리(Q-12)
- 완료 조건:
  - [ ] 실제 응답 5건 이상 확보, 마스킹 fixture 커밋 가능 상태
  - [ ] 테스트는 네트워크 없이 통과
  - [ ] 필드 사전의 `[TO VERIFY]` 항목을 실제 응답으로 갱신
- 완료 후 큐잉 힌트: T-009 준비.

### T-006: 해수부 외항화물컨테이너정보 클라이언트 및 반영 지연 측정
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-002, T-003, T-004
- 참조 문서: docs/03_data-strategy.md, docs/10_open-questions.md R-1
- 목표: 컨테이너 단위 반출입 이벤트를 받고, 실제 발생 대비 반영 지연을 잰다.
- 작업 내용:
  - `ingest/mof_container.py` 읽기 전용 클라이언트
  - 샘플 컨테이너를 며칠간 주기적으로 조회해 이벤트 발생 시각과 처음 관측된 시각 비교
  - 공컨 반납 이벤트 존재 여부 확인(Q-13), 트래픽 한도 확인(Q-05)
- 산출물: 클라이언트, fixture, `docs/research/api-latency-report.md`
- 완료 조건:
  - [ ] 반영 지연 측정값(중앙값, 최대) 또는 측정 불가 사유 기록
  - [ ] R-1 상태 갱신
- 완료 후 큐잉 힌트: 지연이 커서 운영 State로 부적합하면 NEEDS_HUMAN으로 방향 재검토 태스크를 추가.

### T-007: ContainerState / ContainerEvent 스키마 확정
- 상태: TODO | 우선: P1 | 단계: Phase 1 | 담당: -
- 의존: T-003, T-004
- 참조 문서: docs/05_domain-model.md 2·3절, docs/data/field-dictionary.md
- 목표: Pydantic 모델과 JSON Schema를 확정한다.
- 완료 조건:
  - [ ] `src/cera/domain/` 모델 + `schemas/*.json` 생성
  - [ ] 상태 유도 함수 + 이벤트 순서 무관성 속성 테스트(ADR-005)
  - [ ] `05_domain-model.md`를 확정 스키마로 갱신
- 완료 후 큐잉 힌트: T-009, T-010, T-018.

### T-008: TariffRule 스키마 및 선사 1곳 Tariff 구조화
- 상태: TODO | 우선: P1 | 단계: Phase 1 | 담당: -
- 의존: T-003, T-029
- 참조 문서: docs/05_domain-model.md 3.3·4.1절, docs/10_open-questions.md Q-08·Q-09
- 목표: 공개 Tariff 한 곳(후보: Maersk 한국 수입)을 규칙 데이터로 옮긴다.
- 완료 조건:
  - [ ] `data/tariffs/<carrier>.yaml`에 출처 URL·확인일·태그 포함
  - [ ] LFD 계산 함수 + 손 검산 테스트 5건 이상
  - [ ] Q-08, Q-09 갱신
- 완료 후 큐잉 힌트: T-011.

## 완료

### T-000: 문서 초안 세트 작성 — DONE (2026-09-10)
- 산출물: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/01`~`10`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 요약: 원본 기획서 V0.1을 바탕으로 규칙·데이터 전략·서비스 플로우·도메인 모델·아키텍처·로드맵·ADR·미확정 사항을 초안으로 작성. 공공 API 2종을 웹에서 1차 확인.

## 백로그 (로드맵에서 꺼낼 후보)

T-009 ~ T-016, T-018 ~ T-027: `docs/07_roadmap.md` 3~5절 참고. 의존이 풀리면 위 템플릿으로 옮겨 적는다.
T-028(후보): 원본 기획서 부록 A 형식의 적대적 교차검증 리포트 — 사람이 원하면 추가.
