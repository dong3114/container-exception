# 기획 변경 이력 (CHANGELOG)

- 이 문서는 **기획 버전 사이에 무엇이 바뀌었는지**만 요약한다. 작업 단위 기록은 `tasks/LOG.md`, 파일 단위 이력은 git에 있다.
- 현재 기준은 **기획 v0.2**다. 여기 적힌 v0.1 내용은 역사 기록일 뿐, 구현 근거로 쓰지 않는다.

---

## v0.2 개정 — 2026-09-11 · 이벤트·상태 설계 확정안 (T-032)

기획 방향은 그대로다. 이벤트·상태 설계를 구현 직전 수준으로 고정하면서 아래 v0.2 초안 개념을 바꿨다(모두 Proposed, 사람 검토 대기).

| 폐기·변경한 초안 개념 | 이유 | 대체 |
| --- | --- | --- |
| 전역 출처 우선순위 (HUMAN_CONFIRMED > PARTNER > PUBLIC > EMAIL > INFERRED로 먼저 고름, ADR-012 R3) | 같은 출처도 사실마다 권한이 다르고, 강한 출처의 오래된 값이 약한 출처의 최신 값보다 옳지 않을 수 있다 | 권한 매트릭스 + 근거 강도 + 최근 우선·강도 가드·동시 충돌·불리한 변경 보류 (ADR-019, `05` 8절 R1~R12) |
| `source_type` 값 `HUMAN_CONFIRMED`, `HUMAN_REPORTED`, `EMAIL_EXTRACTED`, `DOCUMENT_EXTRACTED` | 채널과 확인·추출 여부가 섞였다 | 채널(`HUMAN_UI`, `FILE_IMPORT`, `EMAIL`, `DOCUMENT` …) × 역할 × 추출 방식 (ADR-020) |
| Canonical 상태 단일 enum 7개 (CONFIRMED~UNKNOWN) | 서로 다른 차원(보증·신선도·충돌·값 유무)이 섞였다 | `value_status`, `freshness_status`, `conflict_status`, `hold_status` → `decision_usability` (ADR-020) |
| Event의 `verification_status`, `verified_by` 저장 | 불변 원칙과 충돌 | VERIFICATION Event로부터 계산 |
| 컨테이너 상태 S0~S9 유도 규칙 (S1 도달 불가) | Q-22 | Hybrid: 사실 + 유도 단계 10개 + 예외 + 영향 (ADR-021) |
| 창고 만차·트럭 부족 등을 컨테이너 예외로 둠 | 원인이 자원이고 여러 컨테이너에 걸린다 | 자원 조건 → Risk가 계산하는 영향 |
| `milestones.eta` | ETA는 관측이 아니라 예정·예상 | ~~`plan.eta`~~ → 패치에서 `forecast.eta` (FORECAST) |
| T-032 산출물의 JSON Schema 수작업 파일 | `07`은 스키마를 Pydantic에서 생성하기로 했다. 지금 손으로 쓰면 두 벌이 생긴다 | 스키마는 `05` 4·9·14절 표로 고정, 파일 생성은 T-041 |

**T-032 패치 (2026-09-11, 사람 조건부 승인 후 4개 수정)**

| 폐기·변경 | 이유 | 대체 |
| --- | --- | --- |
| ADR-007 CP-SAT를 `[DECIDED]`(Accepted)로 유지 | v0.2 정본에서 솔버는 후보일 뿐이고 비교가 Open Question | ADR-007 **Reopened → Proposed**, 선택은 T-036 (Q-35) |
| "계획 승인 = 입력 사실의 확인" (ADR-017 결정 (2), `VERIFICATION(method=PLAN_APPROVAL)`) | 계획 실행 허가와 사실 확인은 다른 행동. 합치면 감사에서 "누가 무엇을 확인했나"가 사라진다 | `PLAN_APPROVAL` 결정 기록(`plan_decisions`) + 별도 `VERIFICATION` Event. CONFIRMED 근거는 `verification_basis`로만 |
| 근거 시각 `max(source_event_time, source_recorded_at ?? received_at − 지연 허용)`, 공공 API 지연 허용 ∞ | 구현 해석이 복잡하고, 수신 시각에서 지연을 빼는 추정은 근거가 없다 | 3단계 폴백(EVENT_TIME → RECORDED_TIME → RECEIVED_ONLY) + 어댑터 매핑 정의(STATE의 발생 시각 = 관측 시각) |
| `plan.eta` (PLAN) | ETA는 계획이 아니라 외부 예상·예측일 수 있다. PLAN은 운영자 권한 사실이라 맞지 않는다 | `FORECAST` 사실 종류 + `forecast.eta` (`forecast_kind`로 scheduled / estimated / predicted 구분) |
| CASE 2 결과 표기 OBSERVED | CONFIRMED 근거에 "권한 A 시스템"을 포함 | CONFIRMED (`AUTHORITATIVE_SYSTEM`). 값·선택 이유는 같음 |

---

## v0.2 — 2026-09-11 · 기획 전면 재정렬 (T-031)

### 1. 무엇이 바뀌었나

| 항목 | v0.1 (폐기) | v0.2 (현재) |
| --- | --- | --- |
| 제품 본질 | 공공데이터 기반 D&D Risk Radar → Recovery Optimizer | 여러 시스템과 사람에게 흩어진 운영 사실을 **신뢰도 기반 Canonical Operational State**로 통합하고, 예외 발생 시 비용 최소 복구안을 계산한 뒤 **연락·회신 반영·재최적화**까지 돕는 Agentic Operations System |
| 포지셔닝 | (암묵적) 컨테이너 상태조회·D&D 알림 | System of Record가 아니라 **System of Decision / Action Layer** |
| 진실원천 | 공공 API 응답 → State Engine 직결 | 공공 API는 여러 입력원 중 하나. 역할은 자동 초기화, 교차 검증, 히스토리 보강 세 가지로 제한 |
| 상태 모델 | 공공 API 이벤트 → 마일스톤 → 상태 | 출처·신뢰도·신선도를 가진 Event → Event Store → Reconciliation → Canonical State (사실마다 상태: CONFIRMED / OBSERVED / PROVISIONAL / INFERRED / STALE / CONFLICTED) |
| 사람 입력 | 보조 입력 | **정식 입력 채널**. 자동 추출 → 사람 확인 → 확정. 짧은 액션 우선 |
| 이메일·계약서 | 계약 PDF 구조화만 (V0.2 이후) | 정식 입력원. PoC부터 LLM이 구조화 후보를 만들고 사람이 확인 |
| 에이전트 | 없음 | 책임이 분리된 10개 역할이 하나의 Event Store / Canonical State / Rule Engine / Solver를 공유 |
| 커뮤니케이션 | V1 작업지시 생성까지 | PoC에서 메일 초안 → 사람 승인 → **가상 발송** → 회신 구조화 → 재최적화 (Closed Feedback Loop) |
| UI | Streamlit 대시보드 | 웹 프론트 + Three.js 2.5D Operations Simulator + Agent Activity Timeline |
| 대표 시나리오 | 원본 기획서의 37대 예시 | 부산 Import FCL 30대, Warehouse 수용량 20 → 8 감소 |
| 제품 단계 명칭 | V0.1 / V0.2 / V1 / V2 | **PoC / Pilot / Scale**. "기획 v0.2"와 옛 "V0.2 Recovery Optimizer"의 이름이 겹쳐서 바꿨다 (5절) |
| 발견 방식 | 인터뷰 10~20명 먼저 | **Prototype-led Discovery**: 작동하는 데모를 보여 주고 "무엇이 틀렸나"를 묻는다 |

### 2. 폐기된 가정 (DEPRECATED)

| # | 폐기된 가정 | 폐기 이유 | 대체 설계 |
| --- | --- | --- | --- |
| D-1 | 공공데이터가 CERA의 단일 진실원천이다 | 공공 API의 실제 반영 지연(SLA)을 확인하지 못했다(R-1). DS-02에는 컨테이너별 이벤트 일시가 없다(T-004) | `05_event-and-state.md`: 다중 출처 + Source Priority + Reconciliation |
| D-2 | 공공 API → State Engine 직결 구조 | 오래되거나 틀린 값이 그대로 운영 판단에 들어간다 | 모든 입력은 Event Store를 거친다. 신선도가 떨어지면 사람 확인을 요구한다 |
| D-3 | D&D Risk Radar가 제품의 핵심이다 | 현업의 예외는 창고 수용량, 트럭, 장치장 등 여러 가지다. D&D는 그중 비용이 가장 드러나는 첫 사례일 뿐이다 | `02_product-definition.md`: D&D는 첫 번째 대표 Exception |
| D-4 | 단순 Plan A/B/C 비교 중심의 최적화 설명 | 여러 컨테이너가 트럭·장치장·슬롯을 나눠 쓰는 배분 문제다(v0.1 금지 주장에도 있었다) | `08_optimization-model.md` |
| D-5 | VBS 자동 Write 연동 | 외부 Write API가 있는지 확인하지 못했다(R-4) | Scale 단계에서 권한을 확보하고 별도 ADR을 거친 뒤에만 한다. PoC의 VBS 슬롯은 가상값 |
| D-6 | 공공데이터만으로 LFD를 완전히 계산할 수 있다 | Free Time·요율·특약은 공공 API에 없다(`data/field-dictionary.md` 6절) | Contract Agent 추출 → 사람 확인 → Tariff Rule Engine |
| D-7 | DS-02(외항화물컨테이너정보)가 컨테이너 단위 반출입 이벤트를 준다 | 공식 명세상 입항 건 단위 조회이고, 컨테이너별 일시 필드가 없다(T-004, VERIFIED) | DS-02는 B/L↔컨테이너 적하목록 스냅샷 출처로만 쓴다 |
| D-8 | 15011649 링크 404 = 데이터셋 소멸 | 옛 URL 형식만 404였다. 파일데이터(XLSX, 1회성)로 존재한다(T-004, VERIFIED) | `11_data-sources.md` |
| D-9 | V0.1에는 LLM이 없고 LLM은 V0.2 이후에 붙인다 | 이메일·계약 구조화가 핵심 루프에 들어왔다 | PoC부터 LLM을 쓴다. 단, 계산·확정·최적안 선택 금지(ADR-008 유지) |
| D-10 | PoC UI는 Streamlit (ADR-003) | 3D/2.5D 시뮬레이터와 실시간 Agent 로그가 필요하다 | ADR-016 (Proposed): 웹 + Three.js |
| D-11 | 적응형 폴링이 수집의 중심이다 | 공공 API는 보조 출처가 됐다 | 공공 API 동기화 주기표는 `[ASSUMPTION]`으로 `11_data-sources.md`에 남긴다 |
| D-12 | 원본 기획서의 37대 데모를 재현한다(옛 T-025) | 새 MVP 시나리오로 대체됐다 | `09_mvp-scenario.md` |
| D-13 | Gate 1 "Data" 기준: 실제 B/L 20건 중 90% 이상에서 공공 API만으로 상태 생성 | 공공 API가 진실원천이 아니므로 제품 Gate가 될 수 없다 | 공공 API 병행 트랙의 품질 지표로 격하(T-006 완료 조건: 조인 성공률·지연). 새 Gate는 `12_roadmap.md` |
| D-14 | 원본 기획서 15장 "개발 착수 순서"(공공 API 명세 → 상태 스키마 → Tariff → 시뮬레이션 → 비용 → 최적화 → 데모 → 인터뷰) | 공공 API를 선행 조건으로 두는 순서다 | `12_roadmap.md`: 설계·시나리오 → 결정론 코어 → 에이전트 루프 → 웹·시뮬레이터 → Prototype 인터뷰. 공공 API는 병행 |

### 3. 유지된 것 (KEEP)

- 검증 태그 규칙(`[VERIFIED]`/`[ASSUMPTION]`/`[TO VERIFY]`), 금지 주장 목록(항목 추가), 비밀정보 규칙
- ADR-008 LLM 역할 경계 (Accepted). ADR-007 CP-SAT은 이 시점 기록에서 Accepted로 유지했으나, 2026-09-11 사람 검토에서 v0.2 정본과 충돌한다고 판단해 **Reopened → Proposed**로 바꿨다(솔버는 T-036에서 결정)
- `as_of` 주입, Asia/Seoul 타임존, KRW 정수, 원본 보존, 재현성(seed, 입력 해시)
- ADR-010 부산 FCL 수입 범위
- 총비용 비교 원칙과 "ODCY로 빼면 D&D가 사라진다가 틀린 이유" 설명
- 컨테이너 마일스톤 S0~S9와 예외 오버레이(ADR-005). 이제 Canonical State의 **파생 뷰**다. Q-22(S1 도달 불가)는 그대로 열려 있다
- TariffRule 스키마 초안, 비용 항목, SlackTime·위험 등급 가정, Exposure·Baseline 정의
- 2단계 최적화 분해(ADR-009)와 1단계 정식화의 뼈대
- T-004 필드 사전·코드표 전체(공공 API 역할 주석만 추가)
- Q-01~Q-22, R-1~R-5 전부(뜻이 바뀐 항목에는 설명 추가)

### 4. 문서 이전 지도 (삭제 전에 작성)

| 기존 문서 | 분류 | 조치 | 유효한 내용을 옮긴 곳 | 삭제·변경 이유 |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | MODIFY | 유지·갱신 | — | 프로젝트 정의, 단계, 문서 지도, 규칙 요약을 v0.2로 |
| `CLAUDE.md` | KEEP | 유지 | — | `@AGENTS.md` 가져오기만 함 |
| `docs/README.md` | MODIFY | 유지·갱신 | — | 새 정본 목록과 우선순위 |
| `docs/01_project-rules.md` | MODIFY | 유지·갱신 | — | 제품 원칙, LLM 경계, 이벤트 규칙, 외부 발송 규칙을 v0.2로 |
| `docs/02_product-brief.md` | DEPRECATE | **삭제** | `02_product-definition.md`(고객 가설, 경쟁, BM, KPI), `01_project-rules.md` 4절(금지 주장), `11_data-sources.md` + 이 문서 D-8(15011649 정정), `15_open-questions.md`(Q-01, Q-02) | 제품 정의가 D&D Risk Radar 중심이고, V0.1~V2 단계 체계를 쓴다 |
| `docs/03_data-strategy.md` | DEPRECATE | **삭제** | `11_data-sources.md`(출처 카탈로그, DS-01~04 VERIFIED 요약, 조인 경로, 동기화 주기 가정, 참고 출처), `05_event-and-state.md`(provenance → Event 필드) | "공공 API → State" 직결 수집 파이프라인이 전제다 |
| `docs/04_service-flow.md` | DEPRECATE | **삭제** | `03_requirements.md`(행위자, 사용자 여정, 화면 목록, 알림 정책), `09_mvp-scenario.md`(WAREHOUSE_FULL 예외 흐름 → 시나리오) | V0.1~V2 단계 흐름과 Streamlit이 전제다 |
| `docs/05_domain-model.md` | DEPRECATE | **삭제** | `04_domain-model.md`(엔티티, S0~S9 + 유도 규칙 + Q-22 표시, 예외, TariffRule, 비용 항목, ODCY 설명, SlackTime·등급, Exposure, Baseline), `08_optimization-model.md`(규모 분해, 1단계 정식화, 출력 형식), `05_event-and-state.md`(ContainerEvent/State 스키마 → Event/Canonical 스키마) | 상태가 공공 API 이벤트로만 만들어진다는 전제 |
| `docs/06_architecture.md` | DEPRECATE | **삭제** | `07_backend-architecture.md`(의존 방향 규칙, 스택, 저장소 레이아웃, 저장 스키마, 내부 API, 설정) | Streamlit + 단일 수집 파이프라인 구조 |
| `docs/07_roadmap.md` | DEPRECATE | **삭제** | `12_roadmap.md`(Phase·Gate 구조, 병행 발견 트랙), 이 문서 6절(옛 백로그 ID 폐기 기록) | 일정과 태스크가 옛 버전 체계 |
| `docs/08_glossary.md` | MODIFY | `13_glossary.md`로 이름 변경 + 용어 추가 | 전체 | 번호 재편 |
| `docs/09_decisions.md` | MODIFY | `14_decisions.md`로 이름 변경 + ADR-011~018 추가, 기존 ADR에 v0.2 주석 | 전체(ADR-001~010 원문 보존) | 번호 재편 |
| `docs/10_open-questions.md` | MODIFY | `15_open-questions.md`로 이름 변경 + 항목 추가·주석 | 전체(Q-01~Q-22, R-1~R-5 보존) | 번호 재편 |
| `docs/data/field-dictionary.md` | KEEP | 유지(참조 경로 갱신 + 공공 API 역할 주석) | — | VERIFIED 결과의 정본 |
| `docs/data/code-tables.md` | KEEP | 유지(참조 경로 갱신) | — | |
| `docs/tasks/QUEUE.md` | MODIFY | 재정렬 | — | 새 우선순위 |
| `docs/tasks/LOG.md` | KEEP | append-only | — | |
| `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf` / `.docx` (루트) | DEPRECATE | **삭제** (사용자 허락, 2026-09-11) | 내용은 T-000에서 v0.1 문서 세트로 요약됐고, 그중 유효한 것은 위 표대로 v0.2 문서에 옮겼다. 원본 기획서의 부록 A(적대적 교차검증 요청서)는 수행하지 않았고 v0.2에서 의미가 없어 폐기(옛 T-028) | v0.1 기획 원본이라 새 에이전트가 정본으로 오해할 수 있다. 복원: `git show ef6b85b:Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf > 파일명` |

### 5. 제품 단계 명칭 대응

| v0.1 명칭 | 뜻 | v0.2 명칭 |
| --- | --- | --- |
| V0.1 Public Data Risk Radar | 공공 API + Tariff + 위험 대시보드 | 폐기. 기능 일부가 PoC에 흡수됨 |
| V0.2 Recovery Optimizer | 가상 자원 + 최적화 | **PoC** (시뮬레이션 기반 Closed Loop 데모) |
| V1 Human-approved Execution | 작업지시 + 승인 | **Pilot** (실제 고객 데이터, 실제 메일 연동, 사람 승인 후 발송) |
| V2 Closed-loop Operator | TMS/VBS/ODCY 자동 연동 | **Scale** (파트너 시스템 Write, 권한 확보 후) |

### 6. 태스크 ID 변경

- **T-031**: 이번 기획 재정렬 (DONE)
- **유지(내용 수정)**: T-001, T-002, T-003, T-005, T-006, T-017, T-029, T-030
- **DEPRECATED**: T-007 → T-032로 대체, T-008 → T-033으로 대체
- **폐기(미착수 백로그)**: 옛 로드맵의 T-009~T-016, T-018~T-028. 이 ID들은 **다시 쓰지 않는다**. 새 로드맵 백로그는 T-041부터 시작한다
- **완료 기록 보존**: T-000, T-004

### 7. 파일 경로 대응 (LOG의 옛 경로를 읽을 때)

| 옛 경로 (v0.1) | 새 경로 (v0.2) |
| --- | --- |
| `docs/02_product-brief.md` | `docs/02_product-definition.md` |
| `docs/03_data-strategy.md` | `docs/11_data-sources.md` |
| `docs/04_service-flow.md` | `docs/03_requirements.md`, `docs/09_mvp-scenario.md` |
| `docs/05_domain-model.md` | `docs/04_domain-model.md`, `docs/05_event-and-state.md`, `docs/08_optimization-model.md` |
| `docs/06_architecture.md` | `docs/07_backend-architecture.md` |
| `docs/07_roadmap.md` | `docs/12_roadmap.md` |
| `docs/08_glossary.md` | `docs/13_glossary.md` |
| `docs/09_decisions.md` | `docs/14_decisions.md` |
| `docs/10_open-questions.md` | `docs/15_open-questions.md` |

---

## v0.1 — 2026-09-10 · 초안 (T-000, T-004)

- 원본 기획서 V0.1(PDF 13쪽)을 바탕으로 규칙·데이터 전략·서비스 플로우·도메인 모델·아키텍처·로드맵·ADR·미확정 사항 초안을 작성했다(T-000).
- 공공 API 공식 명세로 필드 사전 v0.1을 작성했다(T-004). 이 결과는 v0.2에서도 그대로 유효하다.
