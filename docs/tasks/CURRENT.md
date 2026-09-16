# CERA Current Task

> 지금 진행 중인 작업 **하나**의 인수인계 문서다. Claude와 Codex 중 누가 이어받든 이 파일에서 시작한다.
> 예정 작업은 `QUEUE.md`, 끝난 작업은 `LOG.md`에 있다. 사용법: `docs/17_ai-development-workflow.md` 5·6절.
> 대화 내용을 옮겨 적지 않는다. 결정된 것, 진행 상태, blocker, 다음 한 걸음만 남긴다.

상태 값: `IDLE` · `DESIGNING` · `PLANNING` · `AWAITING_APPROVAL` · `IMPLEMENTING` · `REVIEWING` · `DOC_SYNC` · `COMMIT_READY`

---

## Status

**PLANNING** — T-068 설계 완료(Architecture/RFC + 책임 경계 Audit + 사용자 결정 반영). **Implementation Plan 작성 대기.**

다음 담당자는 **Implementation Planner**(ChatGPT 또는 Orchestrator의 별도 planning 단계)다. 산출물은 `docs/tasks/plans/T-069-external-communication-slice.md`. **아직 구현을 시작하지 않는다.**

### 지금까지 한 것 (2026-09-16, 한 세션)

1. **Architecture/RFC 작성** — `docs/18_external-communication.md` (A~O절)
2. **AI/Backend 책임 경계 Audit** — RFC 초안 자체 7건 + 기존 정본 8건의 오배치를 찾아 수정
3. **사용자 결정 반영** — M-1~M-5·M-7 승인, M-6 미확정 유지, ADR-026~029 `Accepted`, `01` 6절 규칙 충돌 해소

### 설계의 결론 두 줄

- **AI가 맡는 것은 비정형 텍스트 ↔ 구조 변환뿐이다**(현재 MVP: 초안 문장, 회신 추출, 계약서 추출, 설명 문장). 신원·권한·강도·상태·숫자·발송 판단은 전부 Backend·결정론이다. 이 네 가지는 영구 고정 목록이 아니라 **현재 허용 범위**이며, 넓히려면 별도 설계·승인이 필요하다.
- **LLM을 부르는 기준은 "입력이 비정형인가"이지 "값이 자주 바뀌는가"가 아니다.** 구조화 채널(폼·포털·TMS·CSV)은 Backend 검증만 거친다.

## Baseline

| 항목 | 값 |
| --- | --- |
| branch | `main` |
| baseline commit | `5972420b3699d9bd95e1d5ccd9d848bb76cd9f7d` — feat: establish CERA frontend prototype and monorepo structure |
| remote | 없음 (push 한 적 없음) |
| last updated | 2026-09-16 |
| current orchestrator | **없음 (설계 완료).** 다음 담당: Implementation Planner. 마지막 Orchestrator: Claude Code — T-068 |

T-067·T-068 문서는 2026-09-16 사용자 승인으로 커밋됐다(Commit Gate 참조). 제품 코드 변경 없음.

---

# Task: T-068 CERA External Communication Vertical Slice v0.1 (설계)

## Goal

지금 Prototype에서 Mock으로만 존재하는 **문의 초안 → 사람 승인 → 외부 발송 → 실제 회신 → 구조화 → Operational Event 후보 → CERA 화면 반영** 루프를, 실제 시스템으로 구현할 수 있는 수준의 **설계(Task Brief + Architecture RFC + ADR)** 로 만든다. 이번 Task에서는 구현하지 않는다.

## Why

- CERA의 제품 가설 중 **아직 한 번도 기술적으로 검증되지 않은 것**이 외부 통신 루프다. Event/State(T-032·T-060)와 화면(T-061~T-063)은 설계·구현됐지만, "밖으로 나가서 답을 받아 사실로 되돌아오는" 경로는 전부 시나리오 작성값이다(`16_frontend-prototype.md` 6절: LLM은 한 번도 실행하지 않았다).
- 이 루프가 안 되면 CERA는 System of Decision이 아니라 대시보드로 남는다. Solver를 정교하게 만드는 것보다 먼저 검증할 위험이다(ADR-023 Prototype-led Discovery와 같은 논리).
- Gmail은 **최종 채널이 아니라 첫 기술검증 채널**이다. 현업의 실제 채널(전화·카카오톡·TMS·모바일 응답 링크)은 인터뷰(T-058) 전에는 모른다(Q-26·Q-28·Q-33, R-8). 그래서 이번 설계의 핵심 산출물은 "Gmail 연동"이 아니라 **Channel Adapter 경계**다. 채널이 바뀌어도 승인·발송·회신·추출·Event 연결 규칙이 그대로여야 한다.

## Scope

이번 Task에서 하는 것은 **문서 산출물뿐**이다.

- `docs/18_external-communication.md` (신규 정본): 외부 통신 루프 RFC
  - 기능 흐름(사람이 이해할 수 있는 한 장), Front / Back / AI 책임 경계
  - 도메인 모델(Thread, Message, Outbox, Channel, Counterparty Registry, Inbound Raw)
  - 상태 전이(초안 → 승인 → 발송 → 회신 → 추출 → Event 후보)와 각 전이의 게이트
  - Event / Canonical State 연결 규칙 (`05`의 R1~R12를 **재사용**하고 새 규칙을 만들지 않는다)
  - Gmail 채널 설계: OAuth·토큰·최소 권한·전용 메일함·CERA가 만든 Thread 중심 접근
  - 실패·중복·재시도·승인 만료·계획 교체 정책
  - Mock Communication과 Real Communication의 구분 규칙
  - API 후보(OpenAPI 대상), `CeraDataProvider` → ApiProvider 전환 방향
  - MVP 범위 / 의도적으로 미루는 것 / 사용자 결정이 필요한 것
- `docs/14_decisions.md`: 새 ADR(Proposed) — 채널 추상화·Gmail 위치, 제품 단계(실제 발송 허용 조건), 통신 도메인 저장 위치
- `docs/15_open-questions.md`: 이번 설계에서 새로 생긴 질문 등록
- `docs/tasks/QUEUE.md` / `LOG.md` / `docs/README.md` / `AGENTS.md` 동기화

## Out of Scope

**이번 Task에서 코드를 쓰지 않는다.** 아래는 이번 설계 대상도 아니다(사용자 지시 2026-09-16).

- Solver, 실제 Recovery Optimization (T-036 DEFERRED 유지)
- Tauri · Rust · Desktop App
- Public API Integration (UNI-PASS·해수부 — T-005·T-006)
- Contract Parser 전체 구현 (계약서 PDF → TariffRule. 첨부파일은 보관만 설계)
- Multi-tenancy, 사용자 인증·권한 체계
- Production-scale infrastructure (배포, 스케일링, 고가용성)
- Risk·Cost·Tariff 엔진, Canonical State 전체 물질화(이번 루프가 쓰는 자원 사실 범위만 설계)

그리고 이번 설계가 **결정하지 않는 것**: 현업의 최종 통신 채널. Gmail은 기술검증용 첫 채널이며, 현업 검증(T-058) 결과로 채널이 바뀔 수 있다는 전제 위에 설계한다.

## Existing Decisions

따라야 하는 것:

| 출처 | 요지 | 이 Task에서의 뜻 |
| --- | --- | --- |
| `01` 3절 / ADR-008 | LLM 경계. 숫자는 결정론 엔진에서만. 추출 결과는 후보 | 회신 추출은 Event 후보까지만. 초안의 숫자는 계획에서 주입하고 LLM은 문장만 |
| `01` 4절 | 금지 주장 | "AI가 연락·예약한다", "자동 배차" 류를 UI·문서에 쓰지 않는다 |
| `01` 5절 | `as_of` 주입, Asia/Seoul, KRW 정수, Event append-only, 출처 필수, 원본 보존 | 메일 원문(RFC822) 보존, 시각은 전부 타임존 포함 |
| `01` 6절 | **PoC의 메일 발송은 가상 메일함으로만. 실제 발송은 Pilot이고 별도 ADR이 필요하다** | 이번 Task의 핵심 충돌 지점. 새 ADR 없이는 실제 발송을 구현할 수 없다(아래 Open Questions) |
| `01` 6절 | API 키·OAuth 토큰은 `.env`에만. 실제 메일 본문 커밋 금지 | Gmail refresh token 저장 설계, fixture는 합성본만 |
| ADR-017 (개정판) | Fact Verification(G2)과 Plan Approval(G3)은 분리. 계획 승인은 사실 확인이 아니다 | 발송 승인(G4)은 **세 번째 별개 게이트**. 어느 것도 서로를 대신하지 않는다 |
| ADR-019 / `05` 8절 | R1~R12 Reconciliation | 회신 Event는 기존 규칙만 탄다. 새 규칙을 만들지 않는다 |
| ADR-020 / `05` 3절 | 출처 3축(채널·역할·추출 방식). 발신자 역할은 **상대방 등록부**로 결정론적으로 정한다. LLM이 정하지 않는다 | Counterparty Registry가 이번 슬라이스의 필수 구성요소 |
| ADR-018 | 시나리오 재생 이벤트는 실제 입력과 같은 경로를 타고 `is_simulated`만 다르다 | Mock 채널과 Real 채널이 같은 파이프라인을 써야 한다 |
| ADR-024 (**Accepted**) | Private Monorepo, `front`·`back`·`ai` 책임 영역. 결정론 엔진은 LLM을 import하지 않는다 | Gmail 클라이언트는 `back/`, 추출 LLM은 `ai/` |
| ADR-025 (**Accepted**) | Task Brief → Plan → 사용자 승인 → 구현. 승인 없이 commit 금지 | 이번 세션은 Brief + RFC에서 멈춘다 |
| QUEUE 사람 지시 (2026-09-15) | Backend·Gmail·LLM·Solver·Tauri **구현**은 아직 시작하지 않는다 | 설계는 지시 위반이 아니지만, 구현 착수는 사용자가 이 지시를 풀어야 한다 |
| `16` 11절 G-13 | 초안의 구조화 값이 어느 계획의 어느 `resource_gaps`에서 왔는지 포인터가 필요하다 | 이번 RFC가 그 포인터를 설계한다 |

판정 대기(Proposed)지만 전제로 삼는 것: ADR-011, 013, 014, 017, 019, 020, 021(Event/State), ADR-022(Next.js + Mock Provider).

## 승인된 결정 (2026-09-16, 사용자)

| # | 결정 | 반영 위치 |
| --- | --- | --- |
| M-1 | **실제 Gmail 기술 검증 허용.** `Tech Validation` 단계 신설 | `01` 6·6.1절, `02` 6절, ADR-027 **Accepted** |
| M-2 | **발송 자격 = 거래처 → 담당 연락처 → 이메일 검증 → 관계 승인 → 통신 활성.** 개발용 수신자 제한은 **별개 장치** | `18` D.5·G.5, ADR-028 **Accepted** |
| M-3 | **구현 착수 가능.** 테스트 상대도 실제 제품의 연락처 검증 흐름을 그대로 사용 | `01` 6.1절, ADR-027 |
| M-4 | **Event/Reconciliation은 이번 기능에 필요한 최소 subset만** | `18` F.5 |
| M-5 | **추출 스키마는 최소 fact key부터.** 실제 회신을 보기 전에 크게 고정하지 않는다 | `18` D.4 |
| M-7 | **OpenAPI를 API 계약 정본으로.** External Communication API부터 시작 | `18` I·J.5, ADR-028 |
| ADR-029 | **`ai/`는 LLM·비정형 처리만.** 결정론 엔진은 Backend 영역. 새 `engine/`은 만들지 않음 | `07` 6·6.1절, ADR-024 개정 주석 |
| 원칙 | **AI 사용 기준 = "입력이 비정형이고 해석이 필요한가"** (값이 자주 바뀌는가가 아님) | `01` 3절, ADR-026 **Accepted** |
| 원칙 | AI 책임 4가지는 **현재 MVP 허용 범위**이고 영구 고정 목록이 아니다. 확장은 별도 설계·승인 | `01` 3절, `18` O절 |

**실행 시점 주의**: ADR-029의 폴더·코드 배치는 **T-003(Backend scaffold)** 에서 적용한다. 이번 작업에서 폴더를 옮기지 않았고 `engine/`도 만들지 않았다.

## Open Questions (열린 상태 유지)

| ID | 질문 | 왜 아직 안 닫았나 |
| --- | --- | --- |
| **M-6 / Q-40** | 값이 같은 새 회신("지금도 3대 가능합니다")이 신선도를 갱신하나 | `VALUE_CHANGE` / `OBSERVATION_REFRESH` / `NO_OPERATIONAL_CHANGE`로 나눴다. 가운데가 미결이며 **출처 권한·근거 강도·확인 상태·현재 충돌·사실 종류**를 함께 보는 Backend 정책 문제다. **AI가 결정하지 않는다** |
| **Q-46** | 상대방이 포털·모바일 링크로 직접 입력한 값의 Source 모델 | 이름 확정 금지. 먼저 축을 분리해야 한다: `source_channel`(경로) / `source_role`(역할) / `actor_type`(입력 주체). **채널 하나로 근거 강도를 자동 결정하지 않는다** |
| **Q-48** | Contact를 개인(PERSON)과 공용 업무 메일함(ROLE_MAILBOX)으로 나눠야 하나 | `dispatch@`·`operations@` 같은 공용함은 생애주기가 개인 주소와 다르다. **이번에 DB 스키마를 확정하지 않는다** — 구현 계획에서 검토 |
| Q-44·Q-45·Q-47 | Date 헤더 선택 / 메일 보관 기간 / 회신 없을 때 운영 규칙 | 구현·실측·인터뷰 필요 |

현업 검증이 필요한 핵심(변동 없음): 운송사·ODCY 연락 채널(Q-26·Q-28), 고객 메일함 접근 조건(Q-33, R-8), Tariff 실제 규칙(Q-08·Q-09).

## Expected User Value

이 Task가 끝나면(설계 기준):

- "Gmail을 붙일 수 있는가"가 아니라 **"채널이 바뀌어도 안 무너지는 구조인가"**에 답할 수 있다.
- Implementation Planner(ChatGPT)에게 넘길 수 있는 수준의 책임 경계·데이터 모델·상태 전이·실패 정책이 문서로 남는다.
- 실제 발송이라는 되돌릴 수 없는 행위에 대한 **안전장치 목록**(승인 게이트, 허용목록, 중복 방지, 계획 교체 시 취소)이 규칙으로 고정된다.
- 현업 인터뷰(T-058)에서 "메일이 아니라 전화입니다"라는 답이 나와도 설계 대부분이 살아남는다.

## Completion Criteria

- [ ] `docs/18_external-communication.md` 작성 — A~N 항목(기능 흐름·책임·데이터 모델·상태 전이·Event 연결·보안/OAuth·실패 정책·API 후보·Mock→Real·MVP 범위·미루는 것·사용자 결정·Handoff) 포함
- [ ] 새 ADR을 `Proposed`로 등록(채널 추상화 / 실제 발송 단계 / 통신 도메인 저장)
- [ ] `docs/15_open-questions.md`에 새 질문 등록, Q-33·Q-40 갱신
- [ ] `docs/README.md` 색인과 `AGENTS.md` 5절 문서 지도에 18번 등록
- [ ] `QUEUE.md`에 T-068 등록 + 후속 태스크 큐잉(실행 가능 3개 이상 유지)
- [ ] 코드·스키마 파일을 만들지 않았음을 확인 (`git status`에 `front/`·`back/`·`ai/`·`data/` 변경 없음)
- [ ] 사용자 승인 전 commit 하지 않음

## Required Review

| 검토 | 누가 | 무엇 |
| --- | --- | --- |
| Architecture 승인 | **사용자** | RFC M절의 7개 결정, 특히 `01` 6절 개정과 구현 착수 시점 |
| Implementation Plan | ChatGPT (Planner) | RFC N절 Handoff를 입력으로 `docs/tasks/plans/T-068-*.md` 작성 |
| 독립 리뷰 | ChatGPT | scope creep, 과설계, 보안(OAuth·토큰·프롬프트 인젝션), contract drift |

## Implementation Plan

상태: **NOT_STARTED — 다음 담당자(Implementation Planner)의 첫 작업이다.**

- 산출물: `docs/tasks/plans/T-069-external-communication-slice.md` (`plans/` 폴더는 첫 사용 때 만든다)
- 입력: **`docs/18_external-communication.md` N절**(전제 · 답해야 할 15가지 · 넘으면 안 되는 선 · Antigravity 문구)과 **O절**(CERA 전체 책임 경계표)
- 답해야 할 15가지: ① Backend 기술 뼈대 ② 최소 DB 스키마 ③ 거래처·연락처·검증 모델 ④ Gmail OAuth·어댑터 ⑤ Outbox·멱등 ⑥ 확인 메일 흐름 ⑦ 초안·승인·발송 API ⑧ 회신 수신 폴링 ⑨ AI 추출 인터페이스 ⑩ Event·Reconciliation 최소 subset ⑪ OpenAPI 구성 ⑫ Frontend Mock → Real 교체 범위 ⑬ 테스트 전략 ⑭ 구현 순서 ⑮ Antigravity 작업 단위
- 계획이 확정하면 안 되는 것: **M-6**(신선도 갱신 정책), **Q-46**(상대방 입력 Source 이름·강도), Q-48은 "구분이 필요한지"까지만 검토
- 계획 승인 뒤에야 구현을 시작한다(`17` 4절 흐름).

## Implementation Status

코드 변경 없음(설계 Task). 저장소에 실제로 있는 것은 baseline과 같다:

- `front/web/` Next.js Control Tower Prototype (MockProvider, `SCENARIO_RESULT`)
- `data/scenarios/busan-wh-capacity-01/` 30대 합성 시나리오
- `back/`·`ai/`·`packages/`·`infra/`는 README만

구현이 없는 것: Backend, DB, Gmail·메일 연동, LLM, Risk·Cost·Tariff 엔진, Solver, 인증, Desktop, 단위 테스트, 배포.

## Validation

이번 Task는 문서만 바꾸므로 코드 검증 명령을 돌리지 않았다(baseline 검증 결과는 2026-09-15 T-063 기준: `validate:scenario` 2,133개 통과, `typecheck`·`lint`·`build`·`smoke` 통과).

## Review Findings

### 1차 (RFC 작성 중 발견)

- `01` 6절(PoC = 실제 발송 없음)과 이 Task의 목표가 정면으로 충돌한다. ADR 없이 구현할 수 없다. → ADR-027
- `06` 7절 게이트 표의 G4(발송 승인)는 "PoC: 가상"으로만 적혀 있고, 실제 발송의 승인 기록·감사 요건이 없다. → 반영 완료
- `07` 4절 `messages` 테이블에 채널·외부 ID·재시도·멱등키·승인 내용 해시가 없다. → ADR-028
- `CeraDataProvider`는 읽기 전용이다. 승인 같은 쓰기 동작의 계약이 없다. → `CeraCommandClient` 분리
- T-034·T-039·T-048·T-049·T-051이 이 슬라이스와 범위가 겹친다. 큐 정리 필요.

### 2차 — 책임 경계 Audit (2026-09-16)

**내가 쓴 RFC 초안에서 발견한 것** (전부 수정 완료):

| # | 문제 | 수정 |
| --- | --- | --- |
| a | 추출 계약에서 **LLM이 `entity_id`·`fact_key`를 직접 출력**했다. 허용 목록으로 걸러도 엔티티 신원·사실 키는 DB의 것이다 | LLM은 `ask_id` + 값 + 원문 인용만. 매핑은 Backend (`18` D.3) |
| b | `send_allowlist`가 **제품 도메인 모델과 개발 안전장치를 한 테이블에 뭉쳤다.** "검증 안 된 주소도 목록에 넣으면 발송" 뒷문이 생긴다 | Contact Gate(제품, 영구) + `CERA_TEST_RECIPIENT_ALLOWLIST`(개발, 임시) 두 겹 (`18` D.5·G.5) |
| c | ADR-027의 허용 조건이 **"상대가 실제 현업 담당자가 아닐 것"** 이었다. 시스템이 판정할 수 없고 Pilot에서 버려지는 기준 | **"등록·검증·승인된 Contact인가"** 로 축을 교체. 테스트 상대도 같은 Flow를 쓴다 |
| d | 수신 흐름에 **구조화 채널 분기가 없어** "동적 데이터 → AI"로 읽힐 수 있었다 | 9번 분기 신설 + ADR-026에 결정 6 추가 + 테스트 조건 (`18` J.6) |
| e | "값을 바꾸지 않는 회신"을 한 덩어리로 봤다 | `VALUE_CHANGE` / `OBSERVATION_REFRESH` / `NO_OPERATIONAL_CHANGE` 3분류, 가운데는 **미결**로 둠 (`18` F.4) |
| f | 상대방 등록부가 주소 목록 수준이라 **담당자(Contact) 개념과 검증 흐름이 없었다** | Counterparty → Contact → Address 3상태 + Verification Flow (`18` D.5·D.6) |
| g | CERA 전체 책임 경계를 한눈에 보는 표가 없었다 | **`18` O절 신설** |

**기존 정본에서 발견한 것**:

| # | 위치 | 문제 | 조치 |
| --- | --- | --- | --- |
| h | `11` 5절 | "분류: 발신자·스레드로 결정론적 분류, **모호하면 LLM 분류**" — 모호할 때 LLM이 상대방 신원·역할(=권한)을 정하게 된다 | **폐기.** 미등록·미매칭은 Quarantine (수정 완료) |
| i | `06` 2절 | 10개 모듈을 모두 "에이전트"로 부르는데 **7개가 결정론**이다 | 1.1절 신설: 성격 분류표 (수정 완료). 전면 개명은 하지 않음 |
| j | `06` 2절 Intake·Communication·Response | 발신자 분류·수신자 선택·추출 범위의 주체가 모호 | 세 행 모두 결정론/LLM 경계 명시 (수정 완료) |
| k | `04` 4.1 | `견적 메일 ──(Response Agent, LLM)──▶ RateQuote(PROVISIONAL)` — **LLM 출력이 화살표 하나로 DB 구조체**가 된다 | 검증기·등록부·강도·Event 단계를 도식에 추가 (수정 완료) |
| l | `07` 1절 vs 6절 | **순수 엔진 중 `state`만 `back/`, 나머지 넷은 `ai/`** — 같은 성격이 두 영역으로 갈렸고 기준이 "AI인가"가 아니다 | 6.1절 신설 + **ADR-029(Proposed)** |
| m | `ai/README.md`·`back/README.md`·루트 `README.md` | Risk·Cost·Tariff·Solver를 `ai/` 소관으로 명시 (3곳) | **이번에 손대지 않음** — 제품 폴더 변경 금지. ADR-029 판정 뒤 T-070 |
| n | `03` FR-ING-05 / FR-RSP-01 / NFR-03 | 발신자 분류 주체 미지정, "추출해 Event로 만든다"의 주체 혼재, NFR 기준에 검증기 항목 없음 | T-070에 등록 (문서 다수 수정이라 승인 뒤 일괄) |
| o | `02`·`09`·`10`·`12`·CHANGELOG | 결정론 계산(Baseline 계산, Recovery plan generated, 재최적화)이 "Agent Activity"·"Agentic System"으로 서술 | 오해 목록으로만 보고. **이번에 개명하지 않음** (`06` 1.1절이 정본 역할) |

(기존에 알려진 Prototype 문제는 그대로다: 화면 하드코딩 값, 손 작성 계약 타입, 시나리오 작성 스크립트 부재, `09` 2·3절 옛 값.)

## Documentation Sync

| 문서 | 변경 |
| --- | --- |
| `docs/18_external-communication.md` | 신규 + 2차 개정(A.1 구조화 분기, C.1 AI 금지 목록, D.1·D.3·D.5·D.6, F.4 3분류, G.5 두 겹, J.2·J.6, K, M, **O절 책임 경계표**) |
| `docs/14_decisions.md` | ADR-026·027·028 신규 + Audit 개정, **ADR-029 신규**(Proposed) |
| `docs/06_agent-architecture.md` | **1.1절 신설**(10개 중 LLM 3개), Intake·Communication·Response 행, G4 게이트 |
| `docs/07_backend-architecture.md` | **6.1절 신설**(`ai/` 이름 문제·ADR-029), 4절 `messages` 대체 표시, 6절 배치표 주석 |
| `docs/11_data-sources.md` | 5절 "모호하면 LLM 분류" **폐기**, 구조화 채널 LLM 우회 행 추가 |
| `docs/04_domain-model.md` | 4.1 흐름도에 Backend 검증·매핑 단계 |
| `docs/15_open-questions.md` | Q-44~Q-47 신규, Q-33·Q-40 갱신 |
| `docs/README.md`·`AGENTS.md` | 18번 문서 색인 등록, 현재 단계 |
| `docs/tasks/QUEUE.md`·`CURRENT.md` | T-068·T-069·T-070 |

**손대지 않은 것**: `front/`·`back/`·`ai/`·`data/` 전부(제품 코드·README 포함), 폴더 구조. `ai/README.md`·`back/README.md`·루트 `README.md`의 영역 책임 문구는 ADR-029 판정 뒤 T-070에서 고친다.

## Commit Gate

- baseline `5972420`: 커밋됨 (2026-09-15)
- **T-067 + T-068 통합 문서 기준점: 2026-09-16 사용자 승인으로 커밋됨.** 워크플로 문서·외부 통신 RFC·책임 경계 Audit이 서로 연결되고 같은 파일을 겹쳐 수정하므로 하나의 일관된 문서 기준점으로 묶었다.
- **remote 없음. push 하지 않았다.** 이 PC가 유일한 사본이다.

## Handoff Notes

- **이 Task는 설계에서 끝났다. 다음은 Implementation Plan이고, 그 계획이 승인돼야 구현을 시작한다.**
- 이어받는 사람은 `docs/18_external-communication.md` **N절 → O절** 순으로 읽는다. M절은 결정의 배경이고, 확정 상태는 M절 맨 위 표에 있다.
- **Gmail은 첫 기술검증 채널이다.** "CERA의 통신 채널은 메일"이라고 문서·UI에 쓰지 않는다. 채널이 전화·카카오톡·TMS로 바뀌어도 승인·멱등·등록부·검증·Reconciliation은 그대로여야 한다.
- **새 문서·코드에서 결정론 모듈을 "Agent"라고 부르지 않는다.** Risk Engine·Cost Engine·Reconciliation Engine이 정확하다. 기존 스키마명(`agent_activity`)·제품명은 이번에 개명하지 않았고, 정리는 후속 작업(T-070)이다.
- ADR-029의 폴더 배치는 **T-003에서 적용한다.** 지금 `back/`·`ai/`에 코드가 없어 이동 비용이 0이다.
- Frontend 명령은 `front/web`에서 실행한다.
