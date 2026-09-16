# 작업 큐 (정본)

- 최종 수정: 2026-09-16 (**T-071 DONE** — 외부 통신 요구사항 명세 `docs/19`, 미커밋. 같은 날 **T-068 DONE** — Architecture RFC + 책임 경계 Audit, ADR-026~029 Accepted, 커밋 `2c37c28`. 다음은 T-069 Implementation Plan). 이전: 2026-09-15 (T-067 AI 협업 Workflow 완료. 같은 날 T-066 Monorepo 재정렬 완료. 같은 날: T-060~T-063 완료, T-036 DEFERRED, T-064·T-065 추가)
- 프로토콜: `AGENTS.md` 3절
- 백로그 원천: `docs/12_roadmap.md`
- 역할 구분: **QUEUE = 예정 작업** · `CURRENT.md` = 지금 진행 중인 작업 하나의 인계 · `LOG.md` = 끝난 작업. 작업을 시작하면 CURRENT에 Task Brief를 채우고, 끝나면 CURRENT → LOG로 옮긴 뒤 CURRENT를 다음 Task 또는 `IDLE`로 둔다(`docs/17_ai-development-workflow.md` 6절)

## 다음 추천 태스크

0. **T-069** (Implementation Planner, P1) — 설계(T-068)와 요구사항(T-071)이 끝났다. **`docs/19` 24절 Handoff**와 **`docs/18` N절 15가지**를 입력으로 Implementation Plan을 `docs/tasks/plans/T-069-*.md`에 쓴다.
   - **착수 전에 사용자에게 물을 것: Q-45(실제 메일 보관 기간·파기 정책), Q-44(근거 시각 선택 규칙).** 첫 회신을 저장하는 순간 둘 다 필요하다
   - **계획에서 확정하지 않을 것: M-6, Q-46, `19` 23절의 기술 선택 목록**
   - 계획이 승인돼야 구현(Antigravity)을 시작한다

**앞으로의 순서**: `T-069 Implementation Plan 작성` → `사용자 승인` → `Antigravity 구현` → `리뷰` → `문서 동기화` → `사용자 승인` → `commit` (`17` 4절)
1. **T-064** (NEEDS_HUMAN, P0) — Control Tower Prototype 검토: `front/web/` 실행해 9단계 재생, 화면·숫자·용어가 현업에게 보여줄 수준인지, `16_frontend-prototype.md` 11절 발견사항과 Q-37~Q-43 판단, ADR-022·023 판정. **커밋 여부 결정** — 2026-09-15 기준 약 2만 줄이 미커밋이고 원격 백업이 없다(T-066 LOG)
2. **T-001** (NEEDS_HUMAN, P0) — 기획 v0.2 + T-032 결과 검토, ADR 판정 (T-060 시각 규칙 개정 포함)
3. **T-017** (에이전트, P2) — Prototype 기반 인터뷰 가이드 (Prototype이 생겨 의존 해소, 사람 지시상 착수 가능)
4. **T-034** (에이전트, P1) — 메일 Event 스키마 + LLM 추출 계약 (Prototype 회신 3건이 입력 예시)
5. **T-035** (에이전트, P1) — Risk 모델 명세 (Prototype 등급 규칙 `risk.json` grade_rules가 초안 입력)

실행 가능(TODO + 의존 해소): **T-069(1순위)**, T-070, T-017, T-029, T-034, T-035, T-040, T-030 (8개). T-065는 T-064 뒤, T-036은 DEFERRED(재개 조건: T-064·T-065), T-037은 아래 사람 지시로 대기.

**사람 지시**
- (2026-09-16) **T-068을 사용자 지시로 착수했다. 설계(Task Brief + Architecture/RFC)까지만 하고 구현은 하지 않는다.** 이번에 만들지 않는 것: Solver, 실제 Recovery Optimization, Tauri·Rust·Desktop, Public API 연동, Contract Parser 전체, Multi-tenancy, Production infra. **Gmail을 현업의 최종 채널로 가정하지 않는다** — "실제 외부 통신 Loop를 기술적으로 검증하는 첫 채널"로만 다룬다.
- (2026-09-16) **T-068 설계 승인 + 문서 기준점 커밋.** ADR-026·027·028·029 모두 `Accepted`. **`Tech Validation` 단계 신설로 실제 Gmail 발송이 가능해졌다**(등록·검증·승인된 연락처 + 건별 승인 + 개발환경 수신자 제한). **2026-09-15의 "Gmail·Backend 구현 금지" 지시는 External Communication Vertical Slice 범위에 한해 해제된다.** 단 **Implementation Plan(T-069)이 승인돼야 구현을 시작한다.** Solver·T-036 금지는 그대로 유지. ADR-029의 폴더 배치 적용은 T-003.
- (2026-09-11) T-004 결과를 사람이 검토하기 전에는 T-005 이후(공공 API 실호출)로 넘어가지 않는다.
- (2026-09-11) 기획 v0.2 재정렬 결과는 사람이 검토하기 전까지 커밋하지 않는다. → 같은 날 세션 끝에 **사람 요청으로 커밋함**(`af47569`). 이후 커밋도 사람 요청 시에만.
- (2026-09-11) **T-032 결과를 사람이 검토하기 전에는 T-036, T-037, Phase 1 코드 작업으로 넘어가지 않는다.** → 2026-09-14 지시로 **Frontend Prototype(T-060~T-063)만 예외**로 수행했다. Backend·Solver·Phase 1 코드 금지는 유지.
- (2026-09-11) T-032는 조건부 승인됐고 4개 패치를 반영했다. **사람 최종 검토 전까지 T-036 착수, 솔버 확정 금지.**
- (2026-09-14) **T-036을 보류(DEFERRED)하고 30대 시나리오 + Frontend Prototype(Control Tower)을 먼저 만든다.** Prototype이 끝나도 Solver·Backend로 넘어가지 않는다. 커밋은 사람 승인 전 금지. (T-060~T-063으로 수행, 2026-09-15 완료)
- (2026-09-15) **AI 협업 개발 Workflow를 따른다(ADR-025).** 한 Task 한 Orchestrator(Claude 또는 Codex), 인계는 `CURRENT.md`, 사용자 승인 없이 commit·push 금지. 다음 제품 Task는 사용자가 아직 고르지 않았다(후보: 현업 검증 / Gmail 연락 루프 / 결정론 코어 — 확정 아님). (T-067)
- (2026-09-15) **CERA는 하나의 Private Monorepo로 유지한다.** 영역: `front/`·`back/`·`ai/`·`packages/`·`data/`·`docs/`·`infra/`. 저장소를 나누지 않는다. Backend·Gmail·LLM·Solver·Tauri 구현은 아직 시작하지 않는다. (T-066, ADR-024)

---

## 상태 규칙

| 상태 | 의미 |
| --- | --- |
| `TODO` | 대기 |
| `IN_PROGRESS` | 진행 중 (`담당`에 에이전트명/날짜) |
| `BLOCKED` | 막힘 (`차단 사유`, `해소 조건` 필수) |
| `NEEDS_HUMAN` | 사람만 할 수 있음. 에이전트는 수행하지 않는다 |
| `DONE` | 완료 조건 충족, `완료` 섹션으로 이동 |
| `DEPRECATED` | 기획 변경으로 폐기. ID는 다시 쓰지 않는다 |
| `DEFERRED` | 폐기가 아니라 **보류**. `보류 사유`와 `재개 조건`을 적는다. 재개 조건이 풀리면 `TODO`로 되돌린다 (2026-09-15 추가) |

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

(없음 — T-068 설계 완료. 다음은 T-069 Implementation Plan)

## 대기 — P0

### T-064: Control Tower Prototype 사람 검토 + 현업 검증 질문
- 상태: NEEDS_HUMAN | 우선: P0 | 단계: Phase 0.5 | 담당: 사람
- 의존: T-063
- 참조 문서: docs/16_frontend-prototype.md (3절 실행, 8절 단계별 화면, 11절 발견사항), data/scenarios/busan-wh-capacity-01/README.md, docs/15_open-questions.md Q-02·Q-37~Q-43, docs/14_decisions.md ADR-022·023
- 목표: Prototype이 "현업에게 보여주고 업무 흐름 검증 질문을 할 수 있는 수준"인지 판단하고, 화면·데이터 요구사항 수정 방향을 정한다.
- 작업 내용:
  - `cd front/web && npm install && npm run build && npm run start` → http://localhost:3000 에서 Play Scenario 또는 다음 이벤트로 9단계 재생
  - 30초 이해 테스트(처음 보는 사람), 13절 질문 1~9 확인
  - 숫자·용어·표현 검토: Current/Recoverable Exposure 정의(Q-02), v2가 v1보다 비싼 장면(Q-43), 신뢰 범주 6개
  - ADR-022(Next.js + 2D SVG), ADR-023(Prototype 우선 순서) 판정
  - 발견사항 G-1~G-13 중 반영할 것 선택, Q-37~Q-42 방향
  - 커밋 여부 결정
- 산출물: 검토 결과 (에이전트가 T-065에서 문서에 반영)
- 완료 조건:
  - [ ] Prototype 수정 필요 항목 목록 또는 "그대로 인터뷰에 쓴다" 결정
  - [ ] ADR-022·023 판정
  - [ ] T-036 재개 시점 결정
- 완료 후 큐잉 힌트: T-065가 풀린다. 인터뷰(T-058)로 바로 가면 T-017을 먼저.

### T-001: 기획 v0.2 검토 및 ADR 판정
- 상태: NEEDS_HUMAN | 우선: P0 | 단계: Phase 0 | 담당: 사람
- 의존: T-031
- 참조 문서: docs/CHANGELOG.md, docs/02_product-definition.md, docs/05_event-and-state.md, docs/14_decisions.md, docs/15_open-questions.md, docs/data/field-dictionary.md
- 목표: 기획 v0.2와 주요 설계 결정을 확정해 스키마·코드 작업을 시작할 수 있게 한다.
- 작업 내용:
  - 기획 v0.2 재정렬 결과 검토(`CHANGELOG.md` 1~4절: 변경, 폐기된 가정, 삭제 문서, 이전 지도) → 커밋 여부 결정
  - ADR 판정: **ADR-011~018** (신규), **ADR-019·020·021** (T-032), ADR-002(백엔드 스택), ADR-016(웹 + Three.js), ADR-001·004·005·006·009·010
  - T-032 결과 검토: `05_event-and-state.md`(특히 3.2 권한 매트릭스, 3.3 강도표, 8절 R1~R12, 부록 A 사례 결과), `04_domain-model.md` 2절
  - T-004 결과 검토(필드 사전, 코드표)
  - 질문 답변: Q-15(공모전), Q-17(UNI-PASS 가이드 복제 금지 문구), Q-21(체인포털 문의 여부), Q-23(권한 매트릭스에 대한 감), Q-36(잠정 입력 인지 승인 정책), Q-01·Q-02·Q-07
  - T-032 패치 최종 검토(ADR-007 재개, 계획 승인·사실 확인 분리, 근거 시각 3단계, FORECAST)
  - Gate 1·2 기준(`12_roadmap.md` 3·4절) 확인
- 산출물: `14_decisions.md`, `15_open-questions.md` 갱신 (판정 결과는 에이전트가 반영)
- 완료 조건:
  - [ ] ADR-011, 012, 013, 015, 016, 017, 018, 019, 020, 021 판정
  - [ ] ADR-002 판정 (T-003 선행 조건)
  - [ ] 판정 결과를 에이전트가 문서에 반영
- 완료 후 큐잉 힌트: T-003이 풀린다. 판정이 바뀌면 영향받는 명세 태스크 범위를 수정한다.

## 대기 — P1

### T-070: `Tech Validation` 단계 + 통신 요구사항 + **책임 경계 Audit 잔여분**을 정본에 반영
- 상태: TODO | 우선: P1 | 단계: Phase 0.5 | 담당: -
- 의존: **T-068 사용자 승인** (ADR-027 Accepted 필요. 아래 Audit 잔여분은 ADR-029 판정 필요)
- 참조 문서: docs/18_external-communication.md 부록, docs/01 6절, docs/02 6절, docs/03 2.1·2.7절, docs/05 4.4·5.2절, docs/06 7절, docs/07 4·5·6절, docs/11 5절
- 목표: ADR-026·027·028 판정 결과를 정본 문서에 반영해 코드와 문서가 어긋나지 않게 한다.
- 작업 내용:
  - `01` 6절·`02` 6절에 `Tech Validation` 단계와 세 조건(허용목록·테스트 주소·건별 승인) 추가
  - `03` FR-ING-07(Gmail 연동) 등급 조정, FR-COM-02의 "가상 메일함으로만" 수정, 발송 실패·중복 방지 FR 신설
  - `06` 7절 G4 행에 실제 발송·승인 해시·감사 요건 추가
  - `07` 4·5·6절: `messages` → `comm_*` 분리, 새 엔드포인트, `back/channels` 배치, 새 설정 키
  - `05` 4.4에 값 미변경 회신 처리(M-6 결정), 5.2 어댑터 매핑에 메일 채널 행
  - ~~`11` 5절 메일함 행 갱신~~ (T-068에서 선행 완료)
- **책임 경계 Audit 잔여분** (T-068에서 발견했으나 이번에 고치지 않은 것):
  - **ADR-029 판정 뒤**: `ai/README.md`·`back/README.md`·루트 `README.md`의 영역 책임 문구, `07` 6절 배치표, ADR-024 영역 표 (제품 폴더 안이라 T-068에서 손대지 않았다). 코드 이동 자체는 T-003
  - `03` FR-ING-05(발신자 분류 주체 = Backend 등록부 명시), FR-RSP-01(추출과 Event 생성 주체 분리), NFR-03(측정 기준에 "결정론 검증기 통과" 추가), FR-ING-07 등급
  - `02`·`09`·`10`·`12`·`CHANGELOG`의 "Agent Activity"·"Agentic System" 표현: 결정론 계산(Baseline 계산, plan generated, 재최적화)이 AI가 한 일처럼 읽히는 곳. **전면 개명이 아니라 오해가 큰 곳만** 정리한다(`06` 1.1절이 정본)
  - `front/web/src/contracts/cera.ts`의 `RiskView.explanation`·`RecoveryAction.rationale`·`MessageView.extraction.method`: 산문 필드의 출처(엔진 템플릿 / LLM)가 타입으로 구분되지 않는다 → 계약 개정 때 반영
- 산출물: 위 문서 갱신
- 완료 조건:
  - [ ] 승인된 M절 결정 7건이 전부 반영되거나 보류 사유 기록
  - [ ] ADR-029 판정 결과 반영 (승인이면 3개 README + `07` 6절 + ADR-024, 부결이면 사유 기록)
  - [ ] `18`의 부록 표와 실제 문서 상태가 일치
- 완료 후 큐잉 힌트: T-069(Implementation Plan) 작성의 전제가 정리된다.

### T-069: T-068 Implementation Plan (HOW) — **다음 작업**
- 상태: TODO | 우선: **P1 (다음 추천 1순위)** | 단계: Phase 0.5 → 1 | 담당: Implementation Planner
- 의존: **T-068 (DONE, 2026-09-16 승인·커밋)**. T-003(뼈대)은 이 계획의 1단계로 흡수할지 선행으로 뺄지를 계획이 결정한다
- 참조 문서: **docs/18_external-communication.md N절(전제·15가지·금지선)과 O절(책임 경계표)**, docs/17_ai-development-workflow.md 4·7절, docs/tasks/CURRENT.md
- 목표: RFC를 변경 파일·DDL·모듈 경로·작업 순서·테스트까지 구체화한 실행 계획으로 만든다.
- 작업 내용: `18` N.2의 15가지에 답한다 — ① Backend 기술 뼈대 ② 최소 DB 스키마 ③ 거래처·연락처·검증 모델 ④ Gmail OAuth·어댑터 ⑤ Outbox·멱등 ⑥ 확인 메일 흐름 ⑦ 초안·승인·발송 API ⑧ 회신 수신 폴링 ⑨ AI 추출 인터페이스 ⑩ Event·Reconciliation 최소 subset ⑪ OpenAPI 구성 ⑫ Frontend Mock → Real 교체 범위 ⑬ 테스트 전략 ⑭ 구현 순서 ⑮ Antigravity 작업 단위
- 산출물: `docs/tasks/plans/T-069-external-communication-slice.md` (`plans/` 폴더는 첫 사용 때 생성)
- 완료 조건:
  - [ ] N.2의 15가지에 모두 답함
  - [ ] J.4의 2단계(Mock 채널로 루프 완주)가 **독립 단계**로 분리됨 — 실제 발송은 마지막에 켠다
  - [ ] K.2 성공 판정 13개가 테스트로 매핑됨
  - [ ] **M-6·Q-46을 확정하지 않았음**을 확인 (N.3 금지선)
  - [ ] 사용자 승인(`APPROVED`)
- 완료 후 큐잉 힌트: 구현 태스크로 쪼갠다(T-041·T-048·T-049·T-051 범위 재조정 포함). T-003 선행 여부가 여기서 정해진다.

### T-065: Prototype 발견 요구사항을 정본에 반영
- 상태: TODO | 우선: P1 | 단계: Phase 0.5 | 담당: -
- 의존: T-064
- 참조 문서: docs/16_frontend-prototype.md 11절, docs/04_domain-model.md 2.3·4.3·6.4, docs/05_event-and-state.md 4.3·11.5, docs/08_optimization-model.md 6·7절, docs/15_open-questions.md Q-02·Q-37~Q-42
- 목표: T-064 판단에 따라 G-1~G-13을 `04`·`05`·`07`·`08`에 반영하고, Prototype 화면·데이터 팩을 고친다.
- 작업 내용:
  - `08` 7절 출력에 범위 분리(`route_summary_20`/`recovery_action_summary_12`/`unchanged_direct`/`cost_scope`), `result_kind` 추가 (G-1·G-2)
  - `04` 6.4 Exposure 정의 확정안 (G-3, Q-02), `04` 4.3 RateQuote 구조화 조건 (G-9), `04` 2.3 위치 값 (G-10, Q-42)
  - `05` 11.5 / `08` 6절에 승인 계획의 입력 변경 상태 (G-4, Q-37), 값 변경 없는 회신 처리 (G-7, Q-40), 다음 날 수용량 전망 (G-6, Q-38)
  - 사람이 요청한 Prototype 화면 수정, `validate:scenario`·`smoke` 재통과
- 산출물: 정본 갱신, `front/web/`·데이터 팩 수정
- 완료 조건:
  - [ ] T-064 결정 항목 전부 반영 또는 보류 사유 기록
  - [ ] `npm run validate:scenario`, `typecheck`, `lint`, `build`, `smoke` 통과
- 완료 후 큐잉 힌트: T-036 재개(DEFERRED → TODO), T-040·T-038 범위 재조정.

### T-036: Recovery 최적화 모델 명세
- 상태: **DEFERRED** (2026-09-15) | 우선: P1 | 단계: Phase 0 → 0.5 뒤 | 담당: -
- 보류 사유: 운영 데이터·제약이 검증되기 전에 수학모델을 먼저 고정하면 가정을 과도하게 설계할 위험이 있다. Prototype-led Discovery에 따라 Control Tower Prototype과 현업 검증을 먼저 한다(2026-09-14 사람 지시, ADR-023, `12_roadmap.md` 2.5절). 삭제가 아니라 보류다.
- 재개 조건: T-064(사람 검토) 완료 + T-065 반영. 재개 때 입력에 `16_frontend-prototype.md` 11절(G-2·G-4·G-5·G-8)과 Q-37·Q-39·Q-41을 더한다
- 의존: T-064, T-065 (2026-09-15 추가)
- 참조 문서: docs/08_optimization-model.md, **docs/05_event-and-state.md 14절(Planning Snapshot 입력 계약)**, docs/04_domain-model.md 5·6절, docs/09_mvp-scenario.md, docs/16_frontend-prototype.md 11절, docs/15_open-questions.md Q-01·Q-07·Q-39·Q-41
- 목표: MVP 시나리오를 풀 수 있는 1단계 모델을 수식·데이터 입력·비용 계수 정의까지 확정하고, **솔버를 선택한다**(ADR-007 Reopened).
- 작업 내용:
  - **솔버 비교**: 확정한 문제 구조로 CP-SAT / MILP / min-cost flow / VRP / scheduling을 비교해 가장 단순하고 검증 가능한 것을 고르고, ADR-007을 Accepted 또는 Superseded로 다시 올린다(Q-35)
  - 변수·제약·목적의 최종 형태(ODCY 2구간 트럭 단순화 유지 여부, 대기 표현, λ)
  - 비용 계수 계산 절차(어느 비용 항목을 어떤 입력으로)와 손 검산 예제 3건
  - Baseline 휴리스틱 절차, Recovery 대상 선정 규칙(Q-01)
  - 재최적화 트리거·잠금·디바운스, 재현성(단일 워커·타이브레이크)
  - `resource_gaps` 산출 규칙(Communication 입력)
- 산출물: `docs/08_optimization-model.md` 확정판
- 완료 조건:
  - [ ] 12대 영향 장면을 손으로 풀 수 있을 만큼 작은 예제(3대·2 ODCY·4슬롯)의 정답 표
  - [ ] Q-01, Q-07 갱신
- 완료 후 큐잉 힌트: T-045가 풀린다(T-043 뒤).

### T-037: MVP 시나리오 데이터 팩 (정식 Event fixture 판)
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-032, T-061 (2026-09-15: Prototype 판 데이터 팩이 컨테이너·자원·타임라인·결과값을 이미 정함)
- 참조 문서: docs/09_mvp-scenario.md (0절), data/scenarios/busan-wh-capacity-01/, docs/05_event-and-state.md, docs/04_domain-model.md, docs/11_data-sources.md
- 목표: `busan-wh-capacity-01` 시나리오를 재생 가능한 데이터로 만든다(코드 없이 YAML·CSV·텍스트). **2026-09-15 범위 조정**: 컨테이너 30대·자원·스크립트 시각·기대 결과는 T-061 JSON을 원천으로 쓰고, 이 태스크는 그 위에 T-032 스키마 전체를 만족하는 Event fixture, 합성 메일 원문, 공공 API 합성 fixture, 합성 계약서를 더한다. 사람 지시(2026-09-11)에 따라 T-032 사람 검토 뒤 착수.
- 작업 내용:
  - 컨테이너 30대(합성 ISO 6346 번호), 선사 3곳 Tariff(자리표시 `[ASSUMPTION]`), LFD 분포
  - 자원(창고·트럭·ODCY·슬롯) 슬롯별 값, 초기 계획
  - 시각별 스크립트 이벤트(09:30 충돌, 11:00 예외), 합성 메일(발송 기대 초안 3건, 회신 3건)
  - 공공 API 합성 fixture(실제 응답 구조를 본뜬 것, 식별자 합성)
  - 기대 결과 범위(Plan v1·v2 모양, 금액 범위)
- 산출물: `data/scenarios/busan-wh-capacity-01.yaml`, `data/scenarios/busan-wh-capacity-01/` (CSV, 메일, fixture)
- 완료 조건:
  - [ ] 모든 Event가 T-032 스키마를 만족
  - [ ] 모든 가정값에 태그
  - [ ] `09_mvp-scenario.md` 갱신
- 완료 후 큐잉 힌트: T-038, T-046, T-017이 풀린다.

### T-029: 공개 D&D Tariff 원문 조사
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: 없음
- 참조 문서: docs/04_domain-model.md 4·5절, docs/15_open-questions.md Q-08·Q-09
- 목표: 선사 공개 Tariff 원문을 조사해 TariffRule 스키마가 표현해야 할 규칙과 계약 추출 대상 필드를 찾는다.
- 작업 내용:
  - 한국(부산) 수입 기준 공개 D&D Tariff 2~3개 선사 조사(공개 여부부터)
  - 선사별 Free Time, 기산 이벤트, 역일/영업일, 휴일 제외, Combined/Split, 요율 구간, 통화, 만료 시각
  - 현재 TariffRule 초안으로 표현할 수 없는 규칙 목록
  - 합성 계약서(T-037)의 현실성 기준 제안
- 산출물: `docs/data/tariff-research.md`
- 완료 조건:
  - [ ] 선사마다 출처 URL·확인일·태그
  - [ ] Q-08, Q-09 1차 결론
  - [ ] `docs/README.md` 색인 등록
- 완료 후 큐잉 힌트: T-033 입력.

### T-033: Contract·Tariff·RateQuote 스키마
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-029
- 참조 문서: docs/04_domain-model.md 4절, docs/06_agent-architecture.md 6절, docs/data/tariff-research.md
- 목표: 계약 추출 후보(DRAFT) → 확정 규칙(CONFIRMED) 흐름의 스키마를 확정한다. (옛 T-008 대체)
- 작업 내용:
  - TariffRule(D&D·Storage·Handling·Transport), RateQuote, Contract 스키마와 필드별 evidence 구조
  - 규칙 선택 순서, 버전 관리, 확인 UI에 필요한 필드
  - LFD 계산 규칙 명세와 손 검산 예제 5건
- 산출물: `docs/04_domain-model.md` 4절 확정, `schemas/tariff_rule.schema.json` 초안
- 완료 조건:
  - [ ] T-029에서 찾은 규칙을 모두 표현하거나, 못 하는 것을 목록으로 남김
  - [ ] Q-08, Q-09 갱신
- 완료 후 큐잉 힌트: T-043, T-050이 풀린다.

### T-034: 메일 Event 스키마 + LLM 추출 계약 + 평가 세트 설계
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-032
- 참조 문서: docs/05_event-and-state.md 4.3절, docs/06_agent-architecture.md 6절, docs/11_data-sources.md 5절
- 목표: 메일(운송사·ODCY·창고 회신, 창고 예외 메일)을 어떤 스키마로 추출하고 어떻게 검증·평가할지 정한다.
- 작업 내용:
  - TruckAvailability, YardCapacity, WarehouseCapacity, RateQuote, Exception 추출 스키마(필드별 evidence)
  - 검증기 규칙 목록, 신뢰도 결정 표
  - 합성 메일 평가 세트 설계(정상·모호·거절·조건부 각 유형), 목표 정확도(Gate 2 기준)
  - 녹화 fixture 형식
- 산출물: `docs/06_agent-architecture.md` 6절 갱신, `schemas/extraction/*.schema.json` 초안, 평가 세트 목록
- 완료 조건:
  - [ ] 시나리오 회신 3건이 스키마로 표현됨
  - [ ] R-6 검증 방법 구체화
- 완료 후 큐잉 힌트: T-039, T-049가 풀린다.

### T-035: Risk 모델 명세
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-032
- 참조 문서: docs/04_domain-model.md 6절, docs/09_mvp-scenario.md
- 목표: 위험 유형별 판정식, 영향 컨테이너 탐지, 등급, Exposure 계산 절차를 확정한다.
- 작업 내용:
  - WAREHOUSE_SHORTFALL 영향 컨테이너 선정 규칙(어느 12대인가)
  - STATE_UNCERTAIN(중요 사실의 `decision_usability = APPROVAL_BLOCKED`)의 위험 반영 방식. 입력은 Planning Snapshot(`05` 14절)
  - 등급 기준(Q-14), Exposure 정의(Q-02) 확정안
- 산출물: `docs/04_domain-model.md` 6절 확정판
- 완료 조건:
  - [ ] 시나리오 11:00 장면의 영향 판정을 손으로 재현하는 예제
- 완료 후 큐잉 힌트: T-044가 풀린다.

### T-003: 저장소 초기화
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-001 (ADR-002, ADR-016 판정)
- 참조 문서: docs/07_backend-architecture.md 3·6·7절, docs/01_project-rules.md 6·7절
- 목표: 코드 작업의 뼈대를 만든다(`back/` + `ai/`). 2026-09-15: Monorepo 영역(`front/`·`back/`·`ai/`·`packages/`·`infra/`)과 루트 `README.md`는 T-066에서 먼저 만들었다(ADR-024)
- 작업 내용:
  - ~~`git init`, `.gitignore`~~ — 2026-09-10 사용자 지시로 선행 완료. `.gitignore`는 필요하면 보강
  - uv + `pyproject.toml` (Python 3.12 후보, ADR-002), `back/`·`ai/` 패키지 뼈대(옛 계획 `src/cera/` → `07` 6절 배치표), back·ai 공통 `domain` 패키지 위치 결정, 영역별 `tests/`, ruff·pytest 설정
  - ~~`web/` Vite + React + TypeScript 뼈대~~ — 2026-09-15 T-063에서 **Next.js로 선행 생성**(ADR-022 Proposed), T-066에서 `front/web/`으로 이동. 판정이 바뀌면 여기서 조정
  - `.env.example`, `policy.yaml`(가정값 + 태그, `back/` config 아래)
  - ~~사람용 `README.md`~~ — T-066에서 선행
  - `AGENTS.md` 6절 개발 명령어 채우기, 코드·커밋 메시지 언어 결정
- 산출물: 저장소 뼈대
- 완료 조건:
  - [ ] `uv run pytest` 통과(빈 테스트 1개 이상), `uv run ruff check` 통과
  - [ ] web 개발 서버 기동 확인
  - [ ] AGENTS.md 6절 갱신
- 완료 후 큐잉 힌트: T-041이 풀린다(T-032 뒤).

## 대기 — P2

### T-038: Three.js Simulator 상세 명세
- 상태: TODO | 우선: P2 | 단계: Phase 0~3 | 담당: -
- 의존: T-037
- 참조 문서: docs/10_simulation-spec.md, docs/09_mvp-scenario.md
- 목표: 장면 배치·오브젝트·상태→시각 매핑·SSE 메시지 형식·카메라 경로를 구현 가능한 수준으로 정한다.
- 산출물: `docs/10_simulation-spec.md` 확정판(와이어프레임 포함)
- 완료 조건:
  - [ ] 시나리오 타임라인의 각 단계에 대응하는 화면 상태 표
- 완료 후 큐잉 힌트: T-056.

### T-039: Communication·Response Agent 명세
- 상태: TODO | 우선: P2 | 단계: Phase 0~2 | 담당: -
- 의존: T-034
- 참조 문서: docs/06_agent-architecture.md, docs/05_event-and-state.md 5.3절
- 목표: 문의 초안 템플릿(구조화 값 + LLM 문장), 승인 흐름, 스레드 규칙, 회신 → Event 흐름을 확정한다.
- 산출물: `docs/06_agent-architecture.md` 갱신
- 완료 조건:
  - [ ] 시나리오 발송 초안 3건의 기대 형태
  - [ ] 숫자 검사 규칙 명세
- 완료 후 큐잉 힌트: T-051.

### T-040: UI Wireflow
- 상태: TODO | 우선: P2 | 단계: Phase 0~3 | 담당: -
- 의존: 없음
- 참조 문서: docs/03_requirements.md 5절, docs/09_mvp-scenario.md
- 목표: SCR-01~09의 화면 흐름과 짧은 액션 UX를 정한다.
- 산출물: `docs/ui/wireflow.md` (텍스트 와이어프레임 + 흐름도)
- 완료 조건:
  - [ ] 시나리오 한 바퀴를 화면 이동으로 따라갈 수 있음
  - [ ] `docs/README.md` 색인 등록
- 완료 후 큐잉 힌트: T-054.

### T-017: Prototype 기반 인터뷰 가이드
- 상태: TODO | 우선: P2 | 단계: Phase 3 준비 → 0.5 | 담당: -
- 의존: T-063 (2026-09-15: T-037 대신 Control Tower Prototype을 보여주며 묻는다)
- 참조 문서: docs/02_product-definition.md 9절, docs/15_open-questions.md (Q-37~Q-43 포함), docs/09_mvp-scenario.md, docs/16_frontend-prototype.md 8절
- 목표: 데모를 보여준 뒤 "무엇이 틀렸는가"를 묻는 인터뷰 질문지를 만든다(v0.2에서 방향 변경: 아이디어 인터뷰 → Prototype 인터뷰).
- 작업 내용:
  - 대상별(포워더, 화주 물류팀, 운송사, ODCY, 창고) 30~45분 질문지
  - R-2~R-8, Q-23~Q-31 검증 문항 대응표
  - 시나리오 장면별 "현장과 다른 점" 질문, 결과 기록 템플릿
- 산출물: `docs/research/interview-guide.md`, `docs/research/interview-template.md`
- 완료 조건:
  - [ ] 각 리스크·질문 ID에 문항 2개 이상
  - [ ] 유도 질문 금지("D&D가 문제죠?")
  - [ ] `docs/README.md` 색인 등록
- 완료 후 큐잉 힌트: T-058(인터뷰 수행, NEEDS_HUMAN).

### T-030: DS-03 전체 필드 사전 + UNI-PASS 추가 API 명세 조사
- 상태: TODO | 우선: P2 | 단계: 병행 | 담당: -
- 의존: 없음
- 참조 문서: docs/data/field-dictionary.md 4.2·4.4·6·7절, docs/15_open-questions.md Q-12·Q-20·Q-22
- 목표: 양하(S1)·반출(S5) 이벤트와 B/L→컨테이너 목록을 줄 수 있는 공식 API를 1차 출처로 찾아 필드 사전의 빈칸을 줄인다. (v0.2: 공공 API의 역할이 초기화·교차 검증·히스토리 보강으로 줄어 P1 → P2)
- 작업 내용:
  - DS-03(15006353) 전체 필드를 field-dictionary 형식으로 정리
  - UNI-PASS API020, API021, API038, API048, API005의 공식 명세 탐색(공공데이터포털 개별 데이터셋 먼저)
  - 로그인이 필요하면 T-002 준비물에 명시
- 산출물: `docs/data/field-dictionary.md` v0.2, `docs/data/code-tables.md` 갱신
- 완료 조건:
  - [ ] DS-03 필드 전부 매핑(또는 "미사용")
  - [ ] UNI-PASS 후보 5개 각각 "명세 확보 / 로그인 필요 / 없음" 결론
- 완료 후 큐잉 힌트: 쓸 만한 API가 있으면 T-005/T-006 범위에 추가.

### T-002: 공공 API 키 발급
- 상태: NEEDS_HUMAN | 우선: P2 | 단계: 병행 | 담당: 사람
- 의존: 없음
- 참조 문서: docs/11_data-sources.md 3절, docs/data/field-dictionary.md 2.1·3.1·4.2절
- 목표: 공공 API 실호출에 필요한 인증키를 확보한다. (v0.2: PoC 데모의 선행 조건이 아니라서 P0 → P2)
- 작업 내용:
  - **UNI-PASS 인증키 (DS-01)**: unipass.customs.go.kr 회원가입 → `My메뉴 > 서비스관리 > OpenAPI사용관리` → "화물통관 진행정보"(API001) 체크 → "OPEN API 신청". 즉시 승인되고 인증키가 발급된다. 이 키가 `crkyCn`이다
    - 같은 화면에서 한도(일일 호출 수)가 보이면 기록한다(Q-05)
    - 선택: API020(컨테이너내역), API021(입항보고 해상), API038(하선신고 목록), API048(반출신고)도 같이 신청해 두면 T-030·T-005에 도움이 된다. 신청 화면에서 각 API 명세 문서를 받을 수 있으면 받아 둔다(저장소에는 넣지 않음, Q-17)
  - **공공데이터포털 serviceKey (DS-02, DS-03)**: data.go.kr 회원가입 → 활용신청 2건(개발단계 자동승인)
    - `해양수산부_외항화물컨테이너정보` (15131742) — 개발계정 1,000
    - `해양수산부_선박운항정보` (15006353) — 개발계정 10,000. DS-02 조회 키(입항횟수)를 얻는 데 필요
    - `관세청_화물통관진행정보`(15126268)는 포털 유형이 `LINK`라서 실제 키는 UNI-PASS에서 받는다. 포털 활용신청도 필요한지 모르므로, 신청 버튼이 있으면 해 두고 결과를 기록한다
    - 발급 뒤 마이페이지의 활용신청 상세에서 인증키(인코딩·디코딩 형태가 따로 보이면 둘 다)와 트래픽 한도·단위(일/시간)를 확인해 기록한다(Q-05). 가이드는 키를 URL 인코딩해 보내라고 적었다 `[VERIFIED S-04]`
  - 로컬 `.env`에 저장 (커밋 금지): `UNIPASS_API_KEY=`, `DATA_GO_KR_SERVICE_KEY=`
  - **테스트용 실제 B/L 5~20건** 준비 (외부 공유 금지). 건마다 MBL(필수)·HBL(있으면)·**B/L 연도**(필수)·입항항(부산 권장)·대략 입항일·선박명·컨테이너 번호와 개수·FCL 여부. 반출·반납이 끝난 건과 아직 터미널에 있는 건을 섞고, 3년 이내 건만
  - 원본 응답·B/L 목록은 `data/raw/`에만 둔다
- 완료 조건:
  - [ ] UNI-PASS 인증키 발급 완료
  - [ ] data.go.kr 15131742, 15006353 활용신청 승인
  - [ ] 트래픽 한도·단위 기록(Q-05)
  - [ ] 샘플 B/L 목록을 `data/raw/`에 로컬 보관

### T-005: UNI-PASS 어댑터 및 실제 호출
- 상태: TODO | 우선: P2 | 단계: 병행 | 담당: -
- 의존: T-002, T-003, T-004(완료), T-032, **T-004 결과 사람 검토(T-001)**
- 참조 문서: docs/11_data-sources.md 3절, docs/data/field-dictionary.md 2·5·8절, docs/data/code-tables.md 2·3.1절, docs/05_event-and-state.md 7절
- 목표: 실제 응답을 확보하고, UNI-PASS 응답을 `PUBLIC_API` Event로 바꾸는 읽기 전용 어댑터를 만든다(v0.2: 상태 직결이 아니라 Event 후보 생성).
- 작업 내용:
  - `intake/adapters/public_api.py`의 UNI-PASS 부분: 조회(화물관리번호 / MBL·HBL + 연도), 목록 응답(`[N00]`) 처리, 오류 판정(HTTP 200 + `tCnt=-1`), 원문 보관
  - 샘플 B/L 실제 호출 → `data/raw/` → 마스킹본 `data/fixtures/`
  - 처리이력 처리구분 값 수집(`code-tables.md` 2.4, Q-12), 일시 형식·타임존(Q-19), 여러 컨테이너 B/L(Q-20), `prgsStCd` 값, 화물관리번호 구성(Q-04)
- 완료 조건:
  - [ ] 실제 응답 5건 이상, 마스킹 fixture 커밋 가능 상태
  - [ ] 테스트는 네트워크 없이 통과
  - [ ] 필드 사전의 `[TO VERIFY]` 항목 갱신
- 완료 후 큐잉 힌트: T-006, 시나리오 fixture 현실성 보정.

### T-006: 선박운항정보·외항화물컨테이너정보 어댑터, 조인 검증, 반영 지연 측정
- 상태: TODO | 우선: P2 | 단계: 병행 | 담당: -
- 의존: T-002, T-003, T-005, **T-004 결과 사람 검토(T-001)**
- 참조 문서: docs/11_data-sources.md 3절, docs/data/field-dictionary.md 3·4.2·5절, docs/15_open-questions.md R-1·Q-24
- 목표: B/L → 입항 건 → 컨테이너 목록 조인이 실제로 되는지 검증하고, 공공 API 반영 지연을 잰다(R-1, 신선도 기준 Q-24의 근거).
- 작업 내용:
  - DS-03(`VsslEtrynd5/Info5`), DS-02(`ContnInfo`) 읽기 전용 어댑터. 페이지 반복, 게이트웨이 오류 봉투 처리
  - 조인 경로 검증: DS-03 매칭 규칙, `blNo`가 MBL/HBL 중 무엇인지, Q-04
  - `tkinTkoutSe` 전체 값(Q-18), 공컨 반납 정보 부재 확인(Q-13), 트래픽 한도(Q-05)
  - 반영 지연 측정은 DS-01 처리이력 기준: 샘플 B/L을 며칠간 조회해 `rlbrDttm`과 처음 관측된 시각 비교
- 산출물: 어댑터, fixture, `docs/research/api-latency-report.md`
- 완료 조건:
  - [ ] 조인 성공률 기록 (참고 기준: 옛 Gate 1 "실 B/L 20건 중 90% 이상", `CHANGELOG.md` D-13)
  - [ ] 반영 지연 측정값(중앙값, 최대) 또는 측정 불가 사유
  - [ ] R-1 갱신, Q-24 기준값 제안
- 완료 후 큐잉 힌트: 신선도 정책 값 확정.

## 완료

### T-071: External Communication 구현 전 요구사항 명세 — DONE (2026-09-16, 사람 검토 대기 · 미커밋)
- 산출물: **`docs/19_external-communication-requirements.md`**, `docs/03`(2.7절을 19로 연결 + FR-ING-05·07·FR-COM-02·FR-RSP-01·NFR-03 개정), `docs/15`(Q-49~Q-52 추가, Q-44·Q-45를 구현 전 필수로 표시), `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`
- 요약: `18`이 "왜 이 구조인가"라면 `19`는 **"정확히 무엇을 만들어야 하는가"**다. 사용자 흐름 A~J, 요구사항 그룹 9개 신설(`FR-CPY`·`FR-EVF`·`FR-ELG`·`FR-APV`·`FR-SND`·`FR-INB`·`FR-XAI`·`FR-STC`·`FR-EVL`) + 기존 그룹 확장(`FR-COM-04~`·`FR-UI-09~`·`FR-AUD-02~`·`NFR-12~30`), 실패·예외 35+ 상황 표, 사용자에게 보이는 상태 이름, 완료 조건 34개, 우선순위 3단계, Implementation Planner Handoff
- 특징: **구현 기술을 고정하지 않았다.** AI 모델·공급자·SDK, 외부 API 호출 순서, 인증·DB·큐 라이브러리, 솔버, 배포 환경을 전부 열어 뒀다(23절). 요구사항은 행동과 계약만 정의한다
- 열린 질문 분류: **구현 전 필수**(Q-44 근거 시각, Q-45 보관 기간) / **구현 중 사례 보고 결정**(M-6, Q-47, Q-48) / **범위 밖**(Q-46) / **신규**(Q-49~Q-52)
- 제품 코드 변경 없음

### T-068: CERA External Communication Vertical Slice v0.1 — 설계(Architecture RFC) + AI/Backend 책임 경계 Audit — DONE (2026-09-16, 사용자 결정 반영 및 커밋 `2c37c28`)
- 산출물: **`docs/18_external-communication.md`**(A~O절 RFC), **ADR-026·027·028·029 모두 Accepted**, `docs/01` 3·6·6.1절(**Tech Validation 단계 신설**), `docs/02` 6절, `docs/04` 4.1, `docs/06` 1.1절(**10개 중 LLM은 3개**)·2·7절, `docs/07` 4·6·6.1절, `docs/11` 5절, `docs/15`(Q-44~Q-48), `docs/tasks/CURRENT.md`
- 요약: Mock으로만 있던 외부 연락 루프(초안 → 사람 승인 → 발송 → 실제 회신 → 구조화 → Event 후보 → 화면)를 구현 가능한 수준으로 설계했다. Gmail은 **최종 채널이 아니라 첫 기술검증 채널**로 두고 Channel Adapter 뒤에 뒀다. 같은 날 2차 지시로 **AI/LLM vs Backend·결정론 엔진 책임 경계 Audit**을 수행해 RFC 초안 자체 7건 + 기존 정본 8건의 오배치를 찾아 고쳤다.
- 핵심 결정: ① **AI 사용 기준 = "입력이 비정형인가"** (값이 자주 바뀌는가가 아님) — 구조화 채널은 LLM을 거치지 않는다 ② 발송 자격 = **거래처 → 담당 연락처 → 이메일 검증 → 관계 승인 → 통신 활성**(제품 게이트)이며 개발용 수신자 제한은 별개 장치 ③ `ai/`는 LLM·비정형 처리만, 결정론 엔진은 Backend 영역(새 `engine/` 만들지 않음, 적용은 T-003) ④ OpenAPI를 API 계약 정본으로 전환 시작
- 열린 채로 남긴 것: **M-6**(값이 같은 새 회신의 신선도 갱신), **Q-46**(상대방 포털 입력의 Source 모델 — 채널·역할·입력주체 축 분리), **Q-48**(공용 업무 메일함 구분)
- 제품 코드 변경 없음(`front/`·`back/`·`ai/`·`data/`·`packages/`·`infra/`), 폴더 이동 없음, `engine/` 미생성

### T-067: (사람 지시) AI 협업 개발 Workflow / Orchestrator Handoff 규칙 — DONE (2026-09-15, 사람 검토 대기)
- 산출물: `docs/17_ai-development-workflow.md`, `docs/tasks/CURRENT.md`(IDLE), `docs/tasks/TASK_BRIEF_TEMPLATE.md`, ADR-025, `AGENTS.md` 2절·3.1·3.2·3.4·3.6·3.7절·4절 규칙 10·5절, `CLAUDE.md` Claude 전용 메모, 루트 `README.md` Development Workflow, `docs/01` 8절 commit 문구, `docs/README.md` 색인
- 요약: 사용자 = 최종 결정, Orchestrator = Claude 또는 Codex(한 Task 하나), ChatGPT = Planner/Reviewer, Antigravity = Implementer. 인계 정본은 대화가 아니라 CURRENT.md. 제품 코드·데이터 변경 없음

### T-066: (사람 지시) Private Monorepo 재정렬 — DONE (2026-09-15, 사람 검토 대기)
- 산출물: `web/` → `front/web/` 이동, `back/`·`ai/`·`packages/`·`infra/` README, 루트 `README.md`, `AGENTS.md` 1.1절·4절(규칙 9·10)·6절, `CLAUDE.md`, `docs/07` 6절, ADR-024, `.gitignore`, 경로 참조 수정(`next.config.ts`, `tsconfig.json`, 검사 스크립트 2개, docs 9개)
- 요약: 저장소 하나 안에서 책임 영역만 나눴다. 기능 추가 없음. 이동 전후 파일 해시 대조로 유실 0 확인. 시나리오 JSON의 "LLM 녹화" 표현 17곳을 "시나리오 작성값 (LLM 미실행)"으로 바꾸고, 문서의 Three.js 표현을 "현재 Prototype 2D / 향후 선택지"로 정리. validate·typecheck·lint·build·smoke(135항목) 통과

### T-063: CERA Operations Control Tower Prototype + Scenario Playback — DONE (2026-09-15, 사람 검토 대기 T-064)
- 산출물: `front/web/` (Next.js 16 · React 19 · TypeScript), `front/web/src/components/*`, `front/web/scripts/smoke-browser.mjs`, `docs/16_frontend-prototype.md`, ADR-022·023
- 요약: 한 화면에 KPI 6개, 추상 2D 운영 지도(정상·막힌·Recovery·잠정 경로, 트럭 시간대별 부하), Exception Panel, Recovery Console(Baseline·Plan·Saving, 20대 배치 = 20 · 영향 12대 Actions = 12, 조치 12행과 근거·변경), Activity Timeline, Communications, Data Trust, 30대 표와 상세 서랍. Reset·이전·다음 이벤트·Play로 S0~S8 재생. 검증: typecheck·lint·build 통과, Edge 헤드리스 smoke에서 9단계 화면 값을 fixture와 대조해 전부 통과, 콘솔 오류 0

### T-062: Frontend Data Contract + Mock Data Provider — DONE (2026-09-15)
- 산출물: `front/web/src/contracts/cera.ts` (View Model v0.1), `front/web/src/data/provider.ts` (`CeraDataProvider`, 엔드포인트 대응), `front/web/src/data/mock/` (`fixture.ts`, `mock-provider.ts`), `front/web/src/data/index.ts`
- 요약: 8개 개념 엔드포인트(`/operations/today`, `/containers`, `/risks`, `/resources`, `/recovery-plans/current`, `/communications`, `/activity`, `/data-trust`)와 같은 모양을 MockProvider가 돌려준다. `as_of` 주입, 응답 `meta.result_kind`·`is_simulated`. 컴포넌트는 fixture를 import하지 않는다. `07` 5절에 화면용 조회 API 추가

### T-061: 30대 Scenario Data Pack (Prototype 판) — DONE (2026-09-15)
- 산출물: `data/scenarios/busan-wh-capacity-01/` (JSON 9개 + README), `front/web/scripts/validate-scenario.mjs`, `09_mvp-scenario.md` 0절
- 요약: 의도 설계(Faker 없음). 창고 A 20 → 8, 영향 12대, 트럭 8대(근무 시간 상이) + K운송, ODCY A(40FT Dry 전용 5 → 4)·B(Dry 6, Reefer 불가), Reefer 4대, 통관 대기·STALE·RECEIVED_ONLY 사례. Baseline 4,650,000 / v1 3,835,000(절감 815,000) / v2 3,855,000(절감 795,000)원 — 09 예시값을 복사하지 않고 단가에서 합산(`[PROPOSED]` fixture 수정, README 4절). `validate:scenario` 2,133개 검사 통과
- 작성 도구: JSON은 세션 scratchpad의 작성 스크립트로 한 번 생성한 뒤 **명시값으로 커밋 대상**에 둔다(엔진이 아님). 이후 수정은 JSON 직접 + validator

### T-060: Event/State 마무리 — RECEIVED_ONLY는 STALE이 아니라 신선도 UNKNOWN — DONE (2026-09-15)
- 산출물: `docs/05_event-and-state.md` 5.2·5.3·6.2·8.4·9.1·14·15절, `11`·`13`·`14`(ADR-014 주석)·`07` 갱신
- 요약: 발생·기록 시각 없이 수신 시각만 있으면 `freshness = UNKNOWN`, `temporal_confidence = LOW`, `evidence_time_quality = RECEIVED_ONLY`(옛 `temporal_quality`). "모른다" ≠ "오래됐다". 중요 사실이면 STALE처럼 확인·재조회·승인 게이트(`FRESHNESS_UNKNOWN`). 이것으로 Event/State 설계는 완료 상태(사람 검토 T-001은 별도)

### T-032: Event·Source·Canonical State 스키마 + Reconciliation 규칙표 — DONE (2026-09-11, 사람 검토 대기)
- 산출물: `docs/05_event-and-state.md` 확정안(Event 스키마 4절, Source Model 3절, 시간·신선도 5절, 상태 차원 6절, 충돌 7절, R1~R12 8절, Canonical Fact 9절, 정정 10절, 확인 정책 11절, Planning Snapshot 14절, 정책 파라미터 15절, 검증 사례 부록 A), `docs/04_domain-model.md` 2절(Hybrid 상태 모델), ADR-019·020·021(Proposed)
- 요약: 전역 출처 순위를 폐기하고 권한 매트릭스 + 근거 강도 + 최근 우선(강도 가드·동시 충돌·불리한 변경 보류)으로 Reconciliation을 정의했다. 출처를 채널·역할·추출 방식으로, Canonical 상태를 값 보증·신선도·충돌·보류·결정 가능성으로 나눴다. 6개 필수 CASE와 10개 경계 사례에 적용했고 R1~R12를 모두 썼다. Q-22 해결.
- DoD 조정: `schemas/*.schema.json` 수작업 초안은 만들지 않았다. `07_backend-architecture.md`가 JSON Schema를 Pydantic 모델에서 생성하기로 정했으므로, 지금 손으로 쓰면 두 벌이 생긴다. 스키마는 `05` 4·9·14절 표로 고정했고 파일 생성은 T-041로 옮겼다.
- field-dictionary 7.1 제안 채택 여부: VesselCall(`VESSEL_CALL` 엔티티, `vessel_call.link`), 원천 코드 보존(`payload`)은 채택. `manifest_no`·`msn`은 `bl.link`의 B/L 엔티티 속성으로 T-041에서 정한다.
- **패치 (2026-09-11, 사람 조건부 승인 후)**: ① ADR-007 Reopened → Proposed(솔버는 T-036) ② Plan Approval과 Fact Verification 분리(ADR-017 개정, `05` 11.5, `plan_decisions`) ③ 근거 시각 3단계 폴백 + `temporal_quality`(지연 허용 ∞ 폐기) ④ `FORECAST` 사실 종류 + `forecast.eta`. 6개 CASE 재검증 완료. 사람 최종 검토 대기.

### T-031: 기획 v0.2 전면 재정렬 — DONE (2026-09-11)
- 산출물: `docs/CHANGELOG.md`(신규), `docs/02`~`12`(신규 정본), `docs/13_glossary.md`·`14_decisions.md`·`15_open-questions.md`(이름 변경 + 갱신), `docs/01_project-rules.md`·`README.md`·`AGENTS.md`·`data/*`·`QUEUE.md` 갱신. v0.1 문서 7개와 원본 기획서 PDF/DOCX 삭제
- 요약: 공공데이터 중심 D&D Risk Radar에서 다중 출처 Canonical Operational State + 예외 복구 + 커뮤니케이션 루프를 갖춘 System of Decision/Action으로 재정의했다. Event·Source Priority·Reconciliation, 10개 에이전트 역할, 모듈형 모놀리스 백엔드, MVP 시나리오, Three.js 시뮬레이터 요구사항, ADR-011~018을 작성했다. 검증 결과와 기존 질문은 모두 이전·보존했다.

### T-004: 공공 API 공식 명세 확보 및 필드 사전 초안 — DONE (2026-09-11)
- 산출물: `docs/data/field-dictionary.md`, `docs/data/code-tables.md` (신규), 당시 `docs/03_data-strategy.md`·`02`·`05`·`08`·`10`·`README.md`·`AGENTS.md` 갱신 (v0.2에서 해당 내용은 `11_data-sources.md` 등으로 이전)
- 요약: 공식 가이드 3종(UNI-PASS 연계가이드 v3.6, 해수부 활용가이드 2종)과 포털 Swagger로 DS-01·DS-02 요청·응답 필드를 VERIFIED로 정리하고 CERA Mapping을 붙였다. DS-02는 입항 건 단위 조회이고 컨테이너별 이벤트 일시가 없다는 점을 확인해 조인 경로와 R-1 측정 방식을 바꿨다. 15011649 기록을 정정했다(Q-03 CLOSED).

### T-000: 문서 초안 세트 작성 — DONE (2026-09-10)
- 산출물: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/01`~`10`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md` (v0.2에서 재편, `docs/CHANGELOG.md` 4절)
- 요약: 원본 기획서 V0.1을 바탕으로 규칙·데이터 전략·서비스 플로우·도메인 모델·아키텍처·로드맵·ADR·미확정 사항을 초안으로 작성. 공공 API 2종을 웹에서 1차 확인.

## 폐기 (DEPRECATED)

| ID | 제목 | 폐기일 | 사유 / 대체 |
| --- | --- | --- | --- |
| T-007 | ContainerState / ContainerEvent 스키마 확정 | 2026-09-11 | 상태 모델이 Event·Canonical State로 바뀜 → **T-032** |
| T-008 | TariffRule 스키마 및 선사 1곳 Tariff 구조화 | 2026-09-11 | 계약 추출 → 확인 흐름으로 바뀜 → **T-033** (스키마), T-043 (엔진) |
| T-009~T-016, T-018~T-028 | v0.1 로드맵 백로그(미착수) | 2026-09-11 | 옛 버전 체계. 새 백로그는 `12_roadmap.md`의 T-041~T-059. 이 ID들은 다시 쓰지 않는다 |

## 백로그 (로드맵에서 꺼낼 후보)

T-041 ~ T-059: `docs/12_roadmap.md` 3~5절. 의존이 풀리면 위 템플릿으로 옮겨 적는다.
