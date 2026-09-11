# 작업 인계 로그

- 새 항목은 **맨 위**에 추가한다. 기존 항목은 수정하지 않는다(append-only).
- 다음 에이전트는 최근 3개 항목을 읽고 시작한다.

## 템플릿

```markdown
## YYYY-MM-DD · T-NNN · 에이전트명
- 상태: 완료 | 중단 | 차단
- 한 일:
  - ...
- 변경 파일:
  - ...
- 검증: 실행한 테스트·확인 방법과 결과
- 남은 일 / 다음 한 걸음:
  - ...
- 큐 변경: 추가·상태변경한 태스크 ID
- 주의사항: 다음 작업자가 알아야 할 것
```

---

## 2026-09-11 · T-032 패치 (사람 조건부 승인 후 4개 수정) · Claude Code (claude-opus-5)
- 상태: 완료 (사람 최종 검토 대기, **커밋하지 않음**. T-036·솔버 확정·코드 금지)
- 지시: T-032 전체 방향은 조건부 승인. 기존 설계를 유지한 채 4개만 최소 수정·재검증
- 한 일:
  1. **ADR-007 Reopened → Proposed**. 재개 이유: Accepted 상태는 v0.1 원본 기획서 승계였고, V0.2 Master Planning 정본에서 솔버는 "현재 후보"이며 CP-SAT / MILP / min-cost flow / VRP / scheduling 비교가 Open Question이다. 직전 T-031·T-032 보고와 LOG에서 이 ADR을 `[DECIDED]`로 유지한 것은 정본과 충돌했으므로 바로잡는다. 선택은 T-036(Q-35). ADR-008은 `[DECIDED]` 유지. 01 규칙의 `[DECIDED]` 예시를 ADR-008로 교체. 06·07·08·12·13·CHANGELOG의 CP-SAT 확정 표현을 "후보"로 정리
  2. **Plan Approval / Fact Verification 분리** (ADR-017 결정 (2) 개정): `PLAN_APPROVAL`은 Event Store 밖 결정 기록(`plan_decisions`, append-only). 계획 승인으로 입력 사실을 CONFIRMED로 올리지 않음. CONFIRMED 근거 `verification_basis` = HUMAN_VERIFICATION / AUTHORITATIVE_SYSTEM / POLICY_EVIDENCE. PROVISIONAL 입력은 `ALLOW_WITH_ACK`(잠정 입력 인지 명시)로 승인 가능, 승인 뒤 V9 확인 요청. `APPROVAL_BLOCKED`는 사실 단위 행동으로만 해제. "확인 + 승인" 묶음 UI는 허용하되 `VERIFICATION` Event와 `PLAN_APPROVAL` 기록을 따로 남김. 승인 때 차단 확인·입력 불변 확인. `verification_method = PLAN_APPROVAL` 삭제
  3. **근거 시각 단순화**: `max(...)` 공식과 공공 API 지연 허용 ∞를 폐기하고 3단계 폴백(EVENT_TIME → RECORDED_TIME → RECEIVED_ONLY) + `temporal_quality`로 바꿈. 수신 시각에서 지연을 빼지 않음. 옛 공식이 막던 오류는 "STATE의 `source_event_time` = 관측 시각, 변경 시각은 `payload.changed_at`" 어댑터 매핑 정의로 막음(결정론 예시 05 5.2). 공공 API RECEIVED_ONLY → STALE 취급. [지금도 맞음] 액션 추가(옛 Event 확인만으로는 신선해지지 않음)
  4. **FORECAST 사실 종류 추가**: `plan.eta` → `forecast.eta`(`forecast_kind`: SCHEDULED / ESTIMATED / PREDICTED). `milestone.ata`와 다른 키. 실제 입항이 생기면 R7-f로 판단에서 빠짐. INFERENCE는 FORECAST만 채움(R8). PLAN은 CERA 사용자의 예정만
- 재검증: 6개 CASE 재적용. 값이 바뀐 CASE는 없음. 바뀐 부분은 CASE 2 표기(OBSERVED → CONFIRMED/AUTHORITATIVE_SYSTEM), CASE 3 근거 시각 설명, CASE 4(승인해도 PROVISIONAL 유지, V9), CASE 5(G2·G3 분리 절차), CASE 6(차단 해제 경로). A.7.4를 FORECAST로 재작성. Planning Snapshot 구조 변경 없음(`forecast` 필드 추가, PROVISIONAL 규칙 문구, 승인 검사는 기존 값·winner_event_id로 가능)
- 변경 파일: `docs/05_event-and-state.md`, `docs/14_decisions.md`, `docs/01_project-rules.md`, `docs/03_requirements.md`, `docs/04_domain-model.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/15_open-questions.md`, `docs/CHANGELOG.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 큐 변경: T-032 완료 항목에 패치 기록. T-036에 솔버 비교·ADR-007 결정 추가. T-001에 패치 검토·Q-36 추가. 사람 지시 추가
- 주의사항: ADR-019·020·021은 Proposed 유지. 바로 아래 T-032 항목의 "ADR-007·008 `[DECIDED]` 유지" 문구는 이 항목으로 정정한다(LOG는 append-only)

## 2026-09-11 · T-032 Event·Source·Canonical State 설계 확정안 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**. 사람 지시: 검토 전 T-036·T-037·Phase 1 코드 착수 금지)
- 작업 전 상태: v0.2 재정렬 미커밋, T-001 미수행(ADR-007·008만 Accepted). 05에 R1~R8(Proposed)과 7개 상태 단일 enum이 있었음. 발견한 모순: ① R3이 전역 출처 순위 ② 상태 enum이 차원 혼합 ③ `source_type`이 채널과 확인·추출 여부 혼합 ④ 01 규칙 3절("LLM 결과는 확정 전 Canonical State를 바꾸지 못한다")과 ADR-017(자원 사실 PROVISIONAL 반영) 충돌 ⑤ `[DECIDED]`·`[PROPOSED]` 태그 없음
- 한 일:
  - `05_event-and-state.md` 전면 재작성(확정안): 결정 수준 표기, 사실 종류 6개, 출처 3축 + 권한 매트릭스 + 근거 강도, Event 스키마(필드별 필수·생성자·불변·용도, 요청 필드 처리 근거), fact_key·event_type 카탈로그, Validation/Quarantine, 추출 검증기, 네 개의 시각과 근거 시각·신선도, 상태 차원 분리, 충돌 범주 C1~C10과 결과 유형, Reconciliation 의사코드 + R1~R12 결정표 + 옛 R1~R8 대응, Canonical Fact 스키마·"왜 이 값인가"·fingerprint, 정정·철회·확인 취소, 확인 요청 V1~V8과 사람 액션 → Event, Planning Snapshot(엔진 입력 계약), 정책 파라미터
  - 부록 A: 필수 CASE 1~6 적용 결과 + 경계 사례 10개 + 규칙 사용표(R1~R12 모두 사용) + MVP 11:00 사건 표현
  - `04_domain-model.md` 2절: 단일 enum / Milestone Composition / Hybrid 비교 → Hybrid 채택안, 단계 유도 규칙(Q-22 해결), Phase 1 최소 모델, 예외 오버레이를 컨테이너 예외·자원 조건·영향으로 분리
  - ADR-019(Reconciliation Policy), ADR-020(출처 3축·상태 차원), ADR-021(Hybrid) 추가. ADR-012 전역 우선순위 규칙 Superseded 표시, ADR-005·014에 주석
  - 01 규칙: `[DECIDED]`·`[PROPOSED]` 태그 추가(사용자 요청), LLM 결과 반영 규칙을 ADR-017과 일치시킴(모순 ④ 해소), Event 필수 필드 갱신
  - 옛 용어(HUMAN_CONFIRMED 등, 단일 상태 enum, S0~S9, 05 옛 절 번호) 참조를 03·06·07·08·09·10·11·12·13·15·field-dictionary에서 정리
  - 작성 중 발견해 고친 것: 확인 요청을 처리해도 R4-b가 같은 충돌을 다시 여는 루프 → `overruled_event_ids`(기각) 추가 / 추출 검증기 표가 빠졌던 것 → 05 4.6으로 복원
- 변경 파일: `docs/05_event-and-state.md`(재작성), `docs/04_domain-model.md`, `docs/01_project-rules.md`, `docs/03_requirements.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/14_decisions.md`, `docs/15_open-questions.md`, `docs/CHANGELOG.md`, `docs/data/field-dictionary.md`, `AGENTS.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: 코드 없음. 6개 CASE와 경계 사례를 결정표에 손으로 적용(부록 A), 규칙 사용표로 R1~R12 전부 사용 확인. 05 전체를 다시 읽어 절 간 모순 수정(참조 절 번호, location 권한 계열, 스냅샷 예시). 옛 용어는 grep으로 전수 확인
- 완료 기준 Q1~Q10: 모두 답할 수 있음(최종 보고 참조). Q10 — T-036은 `05` 14절 Planning Snapshot만 입력으로 쓰면 되므로 추가 상태 설계 없이 시작 가능
- DoD 조정: JSON Schema 수작업 파일은 만들지 않고 T-041(Pydantic 생성)로 이동. 이유는 QUEUE 완료 항목에 기록
- 남은 일 / 다음 한 걸음:
  - 사람: T-001 — ADR-019·020·021 판정, 권한 매트릭스(3.2)·강도표(3.3)·부록 A 결과가 현장 감각과 맞는지, Q-23·Q-24·Q-34
  - 에이전트(검토 뒤): T-036 → T-037, 병행 T-035·T-029
- 큐 변경: T-032 DONE. T-001 범위에 T-032 검토 추가. T-036 참조에 Planning Snapshot 추가. T-035 문구 갱신. 사람 지시 추가
- 주의사항:
  - `[DECIDED]`(Accepted) 결정은 바꾸지 않았다(ADR-007·008). ADR-012·005·014는 Proposed라 주석으로 개정했다
  - 요청의 CASE 3에서 메일 Event를 "PROVISIONAL"이라 했지만, 설계상 메일에서 뽑은 **컨테이너 사실**은 확인 전 후보 자격이 없다(강도 0). PROVISIONAL은 자원·제안·견적 사실에만 쓴다(부록 A.3에 명시)
  - 모든 파라미터 값(τ, δ_m, 신선도, θ)은 PoC 데모용 `[ASSUMPTION]`이다. 특히 τ가 "동시 충돌"과 "그 사이 현실 변화"를 가른다(A.5)

## 2026-09-11 · T-031 (사용자 지시) 기획 v0.2 전면 재정렬 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음** — 사용자 지시)
- 변경 이유 (사용자 지시 요약):
  - 공공데이터의 실제 반영 속도(SLA)를 신뢰할 수 없으므로, 공공데이터를 단일 진실원천으로 두는 v0.1 구조를 버린다.
  - CERA를 "여러 출처의 운영 사실 → 신뢰도 기반 Canonical Operational State → 예외 탐지 → 비용 최소 복구 → 연락·회신 반영 → 재최적화"를 수행하는 System of Decision/Action으로 재정의한다.
  - 사람 입력·이메일·계약서를 정식 입력원으로, 멀티에이전트(역할 분리)·Three.js 시뮬레이터·Prototype-led Discovery를 설계에 넣는다. 초기 범위(부산 Import FCL 30대)는 넓히지 않는다.
  - 기존 문서가 새 기획과 충돌하면 삭제하되 검증 결과·질문·ADR·폐기 사유는 보존한다.
- 한 일:
  1. 저장소 전체 문서(AGENTS, CLAUDE, docs/01~10, data/*, QUEUE, LOG) 검토 → 충돌 목록과 KEEP/MODIFY/DEPRECATE/NEW 분류(`docs/CHANGELOG.md` 1~4절)
  2. **삭제 전에** 문서 이전 지도 작성(`docs/CHANGELOG.md` 4절): 삭제할 문서, 이유, 유효 내용을 옮긴 곳
  3. 새 정본 구조로 재편하고 문서 작성: 제품 정의, 요구사항, 도메인 모델, 이벤트·상태, 에이전트, 백엔드, 최적화, MVP 시나리오, 시뮬레이터, 데이터 출처, 로드맵
  4. ADR-011~018 추가(Proposed). ADR-001~010 본문은 그대로 두고 v0.2 주석을 추가. ADR-003(Streamlit)은 Superseded by ADR-016
  5. Open Questions: R-6~R-8, Q-23~Q-33 추가. Q-01~Q-22·R-1~R-5 보존(주석 추가), Q-10·Q-16 CLOSED
  6. QUEUE 재정렬: T-031 DONE, T-032~T-040 신규, T-007·T-008 DEPRECATED, 옛 백로그 ID 폐기, T-002/T-005/T-006/T-030 P2로 조정
  7. 옛 문서·원본 기획서 삭제(아래), 참조 경로 정리
- 삭제한 파일 (모두 `ef6b85b`에 있어 git으로 복원 가능):
  - `docs/02_product-brief.md` → `02_product-definition.md`, `01` 4절, `11`, `15`로 이전
  - `docs/03_data-strategy.md` → `11_data-sources.md`, `05_event-and-state.md`로 이전 (T-004 VERIFIED 요약 포함)
  - `docs/04_service-flow.md` → `03_requirements.md`, `09_mvp-scenario.md`로 이전
  - `docs/05_domain-model.md` → `04_domain-model.md`, `05_event-and-state.md`, `08_optimization-model.md`로 이전
  - `docs/06_architecture.md` → `07_backend-architecture.md`로 이전
  - `docs/07_roadmap.md` → `12_roadmap.md`, `CHANGELOG.md` 6절로 이전
  - `docs/08_glossary.md`, `docs/09_decisions.md`, `docs/10_open-questions.md` → `13_glossary.md`, `14_decisions.md`, `15_open-questions.md`로 이름 변경(내용 전부 보존 + 추가)
  - 루트 `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf` / `.docx` → 사용자 허락으로 삭제. 유효 내용은 v0.1 문서 세트를 거쳐 v0.2로 이전됨
- 변경 파일:
  - 신규: `docs/CHANGELOG.md`, `docs/02_product-definition.md`, `docs/03_requirements.md`, `docs/04_domain-model.md`, `docs/05_event-and-state.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/14_decisions.md`, `docs/15_open-questions.md`
  - 갱신: `AGENTS.md`, `docs/README.md`, `docs/01_project-rules.md`, `docs/data/field-dictionary.md`(v0.2 읽기 주석, 참조 경로. 확인된 사실은 그대로), `docs/data/code-tables.md`(참조 경로), `docs/tasks/QUEUE.md`
- 폐기된 가정 (상세 `CHANGELOG.md` 2절 D-1~D-14): 공공데이터 단일 진실원천, 공공 API → State 직결, D&D Risk Radar가 제품 핵심, Plan A/B/C 비교 중심 최적화 설명, VBS 자동 Write, 공공데이터만으로 LFD 계산, DS-02 컨테이너 이벤트, 15011649 소멸, V0.1 LLM 없음, Streamlit UI, 폴링 중심 수집, 37대 데모, 공공 API 기반 Gate 1, 공공 API 선행 개발 순서
- 검증:
  - 삭제 대상 11개 파일이 모두 마지막 커밋에 있음을 `git cat-file`로 확인한 뒤 삭제(`git rm`이 아닌 `rm`, 인덱스 변경 없음)
  - 삭제된 파일명을 참조하는 곳을 grep으로 전수 확인 → 이름 변경 주석, CHANGELOG 대응표, LOG의 과거 기록만 남음(의도)
  - 옛 단계 명칭·Streamlit·폐기 ID 참조를 grep → 역사·주석 맥락에서만 남음
  - 코드 없음. 테스트 없음
- 남은 일 / 다음 한 걸음:
  - 사람: **T-001** — 기획 v0.2 검토, ADR-011~018 판정, 삭제 목록 확인 후 커밋 여부 결정, Q-15·Q-17·Q-21·Q-23 답변
  - 에이전트: T-032(Event·Canonical 스키마) → T-036(최적화 명세) → T-037(시나리오 데이터 팩). 병행 T-029
- 큐 변경: T-031 DONE. T-032~T-040 추가. T-007·T-008 DEPRECATED. T-009~T-016·T-018~T-028 폐기(재사용 금지). T-001 범위 변경(v0.2 검토). T-017을 Prototype 인터뷰 가이드로 변경. T-002·T-005·T-006·T-030 우선순위 P2
- 주의사항:
  - 커밋 전 백업: 재정렬 직전 작업 트리(T-004 미커밋 변경 포함)를 세션 scratchpad `backup_pre_v02/`에 복사해 두었다(세션 한정). 영구 복원 경로는 git `ef6b85b` + 이 LOG
  - 이 LOG의 아래쪽(과거) 항목에 나오는 파일 경로는 v0.1 기준이다. `docs/CHANGELOG.md` 7절 표로 읽는다
  - 제품 단계 명칭이 V0.1/V0.2/V1/V2 → **PoC/Pilot/Scale**로 바뀌었다. "기획 v0.2"는 문서 버전이지 제품 단계가 아니다
  - 시나리오 금액(6,420,000 / 2,850,000 / 3,570,000원)은 예시값이다. 엔진 결과처럼 쓰지 말 것

## 2026-09-11 · T-004 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기. 사람 지시: 검토 전에는 T-005 이후로 넘어가지 않는다)
- 한 일:
  - 공공데이터포털 상세 페이지 4개(15126268, 15131742, 15006353, 15011649)와 첨부 공식 가이드 3종을 받아 원문을 직접 읽었다. 포털 페이지에 포함된 Swagger 2.0 명세 2개도 추출했다
  - 인증키 없이 3개 엔드포인트에 GET을 1회씩 보내 엔드포인트가 살아 있는지와 오류 봉투 형식을 확인했다(데이터 수신 없음)
  - `docs/data/field-dictionary.md` v0.1 작성: API별 기본 정보 17개 항목, 요청·응답 필드, **CERA Mapping**(공식 필드 → 정규화 필드 → 도메인 엔티티 → 엔진 용도), 공공 API가 주지 않는 데이터, ContainerState 역매핑, T-007 스키마 제안, 파서 규칙
  - `docs/data/code-tables.md` v0.1 작성: 1차 출처에서 관측한 코드값만, 에러코드(UNI-PASS / 포털 게이트웨이)
- 변경 파일:
  - 신규: `docs/data/field-dictionary.md`, `docs/data/code-tables.md`
  - 갱신: `docs/03_data-strategy.md`(1·2.1·3·4·5·7·8절), `docs/02_product-brief.md`(10절), `docs/05_domain-model.md`(2.1 주 출처 열, Q-22 링크. 상태 유도 규칙은 **손대지 않음**), `docs/08_glossary.md`, `docs/10_open-questions.md`, `docs/07_roadmap.md`, `docs/README.md`, `AGENTS.md`(5절 문서 지도), `docs/tasks/QUEUE.md`
- **새로 VERIFIED된 사실** (출처 ID는 field-dictionary 0.2절):
  - DS-01 엔드포인트 `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo`, 개발계 호스트 `tunipass.customs.go.kr:38010`, GET, XML, 인증 `crkyCn` (S-02, S-08). T-000의 블로그 근거를 공식 문서로 대체
  - DS-01 요청 `cargMtNo` 또는 `mblNo`/`hblNo` + `blYy`, 응답 기본정보 38개 필드 + 처리이력(0..n) 13개 필드와 크기 (S-02)
  - DS-01 오류는 HTTP 200 + `tCnt=-1` + 한글 `ntceInfo`. 여러 건이면 `[N00]` 목록 응답. 조회 기간은 2023-06-17부터 3년 이내. IP로는 호출 불가 (S-02, S-08)
  - DS-02 엔드포인트 `https://apis.data.go.kr/1192000/CargFrghtContnOut/ContnInfo`. 필수 키는 **`prtAgCd` + `etryptYear` + `etryptCo` + `clsgn`**(입항 건). `numOfRows` 최대 50, 개발계정 1,000, 30 tps, 갱신주기 "실시간" 표기, 응답 17개 필드 (S-03, S-04)
  - DS-02 응답에 **컨테이너별 반출입 일시 필드가 없다**. 시각 필드는 선박 `etryndDt`뿐이다 (S-03, S-04)
  - 포털 게이트웨이 오류는 `OpenAPI_ServiceResponse/cmmMsgHeader` 봉투 + HTTP 401 (S-08). 가이드와 포털의 에러코드 번호 체계가 다르다(예: 10번) (S-03, S-04)
  - DS-03 후보 `해양수산부_선박운항정보`(15006353) `VsslEtrynd5/Info5`: 항만 + 기간으로 조회하면 `etryptYear`·`etryptCo`·`clsgn`·`mrNum`·입출항 일시·선석을 준다. 부산 `prtAgCd=020` (S-05, S-06)
- **기존 문서에서 틀려서 정정한 사실**:
  - "15011649 → 404, 사라짐" → 옛 URL(`/dataset/`)만 404다. 데이터셋은 **파일데이터(XLSX, 100행, 1회성)** `해양수산부_컨테이너반출입정보_20230112`로 있고, 오픈API가 아니다. 현재 오픈API 후보는 15131742 (Q-03 CLOSED)
  - "DS-02는 BL번호로 조회" → 입항 건 키로만 조회된다. 조인 경로를 B/L → DS-01 → DS-03 → DS-02로 바꿨다
  - "DS-02가 컨테이너 단위 반출입 이벤트(S1·S5·S9)를 준다" → 공식 명세상 아니다. DS-02를 **적하목록 스냅샷 출처**로 다시 분류했다. 반출 이벤트 1차 후보는 DS-01 처리이력
  - "DS-01 응답의 장치장명(`shedNm`)" → 기본정보가 아니라 처리이력 행의 필드다
  - T-000 응답 태그 목록의 `csclPrgsStts`, `prgsStCd`, `etprDt`, `cntrGcnt` 등은 공식 문서와 일치했다(정정 없음)
- **아직 확인 못한 항목** (`[TO VERIFY]`):
  - 코드표: `prgsStCd`, `csclPrgsStts`, 처리구분(`cargTrcnRelaBsopTpcd`), `blPt`, `spcnCargCd`, `tkinTkoutSe`(Q-18), `prtAgCd`(부산·광양 외). 공식 코드표를 찾지 못해 샘플 값만 적었다
  - DS-01 호출 한도, 갱신주기·실제 지연(R-1), 14자리 일시의 형식·타임존(Q-19), 목록 응답 태그명, 여러 컨테이너 B/L의 `cntrNo`·이력(Q-20), 포털 활용신청이 따로 필요한지
  - DS-02 트래픽 단위(일로 추정, Q-05), 조회 가능 기간, `blNo`가 MBL/HBL 중 무엇인지, `contnStndrd`가 ISO 6346 코드인지, `etryndDt`가 입항/출항 중 무엇인지
  - 화물관리번호 ↔ 적하목록관리번호·MSN 관계(Q-04, 길이만 맞는 가설), DS-03 매칭 규칙, ETA 출처
  - 양하(S1) 시각의 공식 출처(Q-22와 연결), DS-04 체인포털 공개 API(Q-21)
  - UNI-PASS API020·021·038·048·005 명세(T-030)
- **T-002에서 사용자에게 필요한 준비물** (QUEUE T-002에 상세):
  1. UNI-PASS 회원가입 → OpenAPI사용관리에서 API001 신청 → 인증키(`crkyCn`). 가능하면 API020·021·038·048도 신청하고 한도를 기록
  2. 공공데이터포털 활용신청 2건: 15131742(외항화물컨테이너정보), **15006353(선박운항정보, 새로 필요)**. 트래픽 단위 기록
  3. 로컬 `.env`에 `UNIPASS_API_KEY`, `DATA_GO_KR_SERVICE_KEY` (커밋 금지)
  4. 실제 B/L 5~20건: MBL(필수)·HBL·**B/L 연도**(필수)·입항항(부산)·대략 입항일·선박명·컨테이너 번호/개수. 반출·반납이 끝난 건과 아직 터미널에 있는 건을 섞고, 3년 이내 건만
- 검증: DoD 4항목 확인(DS-01·02 필드 1차 출처 정리 / Q-03 CLOSED·Q-04 갱신 / 필드→ContainerState 매핑(7절) / README 색인). 공식 문서 docx 3종의 SHA-256을 필드 사전에 기록. 문서 간 교차 참조(Q-17~Q-22, T-030, S-01~S-08)는 수동 확인. 코드 없음
- 남은 일 / 다음 한 걸음:
  - 사람: T-004 결과 검토(특히 Q-17 UNI-PASS 가이드 복제 금지 문구 판단, Q-21), T-001, T-002
  - 에이전트(검토와 무관하게 가능): T-029, T-030, T-017
- 큐 변경: T-004 DONE. T-030 신규. T-002·T-005·T-006·T-007 내용 갱신(T-006 범위 변경: DS-03 클라이언트 추가, 지연 측정을 DS-01 기준으로). T-001에 T-004 검토 추가
- 주의사항:
  - UNI-PASS 연계 가이드 원문과 샘플은 저장소에 넣지 말 것(Q-17). 필요하면 S-02 경로에서 다시 받는다
  - DS-02를 폴링 이벤트 출처로 설계하지 말 것. 개발계정 1,000건은 입항 건 스냅샷용
  - 05의 S1 도달 불가 문제(Q-22)는 일부러 고치지 않았다. T-007/T-009에서 처리

## 2026-09-10 · (사용자 지시) git 초기화 · Claude Code (claude-opus-5)
- 상태: 완료 (원격 푸시는 사람 작업 대기)
- 한 일:
  - 커밋 전 민감정보 점검: md 문서(키·토큰·이메일 패턴 없음), 원본 기획서 DOCX(본문이 PDF와 동일, 메타데이터 작성자 `python-docx`), PDF(작성자 `python-docx`, 생성기 LibreOffice) → 개인정보·비밀정보 없음
  - `git init -b main`, 로컬 user.name/user.email 설정(저장소 로컬 한정), `.gitignore` 추가, 첫 커밋
- 변경 파일: `.gitignore`(신규), `docs/tasks/QUEUE.md`(T-003에서 git init 항목 완료 표시), `docs/tasks/LOG.md`
- 검증: `git status`, `git log`로 커밋 작성자 확인
- 남은 일 / 다음 한 걸음:
  - 사람: GitHub에 private 저장소 생성 → remote 연결 → 해당 계정으로 인증 후 push
- 큐 변경: 없음 (T-003 범위 일부 선행)
- 주의사항: 이 PC의 Git Credential Manager에는 다른 GitHub 계정이 저장돼 있다. remote URL에 사용자명을 넣어(`https://<user>@github.com/...`) 계정을 구분할 것.

## 2026-09-10 · T-000 · Claude Code (claude-opus-5)
- 상태: 완료
- 한 일:
  - 원본 기획서 `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf`(13쪽)를 읽고 문서 체계 초안을 만듦
  - 공공데이터포털·웹에서 공공 API 확인
    - `관세청_화물통관진행정보`(15126268): 존재, XML, 개발 자동승인/운영 심의승인, UNI-PASS 가입 필요, 3년 이내 조회
    - 기획서의 해수부 링크(dataset/15011649)는 404. `해양수산부_외항화물컨테이너정보`(15131742)를 대체 후보로 찾음(필드: 항만명, 입항년도, 호출부호, 선박명, 적하목록관리번호, BL번호, MSN, 입출항일시, 반출입구분, 컨테이너번호·규격·사이즈)
    - UNI-PASS 엔드포인트·파라미터·응답 태그는 2차 출처(블로그)에서만 확인 → `[TO VERIFY]`
  - 기획서 내부 불일치 기록: 34대 vs 37대(Q-01), ₩18,720,000 vs ₩18,420,000(Q-02), RequiredHandlingBuffer 누락(Q-06)
  - 기획서에 없던 설계를 제안(ADR Proposed): 상태 = 마일스톤 유도 + 예외 오버레이, 최적화 2단계 분해, 위험 등급 기준, Baseline 정의, 적응형 폴링, Watchlist 온보딩
- 변경 파일: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/01_project-rules.md` ~ `docs/10_open-questions.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md` (모두 신규)
- 검증: 문서 간 교차 참조(태스크 ID, ADR 번호, 질문 ID)를 수동 확인. 코드 없음.
- 남은 일 / 다음 한 걸음:
  - 사람: T-001(검토·ADR 승인), T-002(API 키)
  - 에이전트: T-004(공식 명세·필드 사전) 또는 T-017(인터뷰 가이드)
- 큐 변경: T-001~T-008, T-017, T-029를 큐에 등록. T-000 DONE.
- 주의사항: 모든 문서가 Draft다. 사람 승인 전에는 ADR Proposed 내용을 확정 사실처럼 코드에 굳히지 말 것. 원본 기획서 PDF/DOCX는 루트에 그대로 있음(이동 여부 Q-16). DOCX는 PDF와 같은 내용으로 보고 따로 열어보지 않음.
