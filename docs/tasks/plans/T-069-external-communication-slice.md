# T-069 구현 계획 — 첫 실제 구현 Vertical Slice (External Communication)

- 상태: **승인됨 — T-069 DONE** (2026-09-21, 사용자 최종 승인 · 작성 Claude Code)
- **2026-09-21 사후 주석 (T-083)**: Q-64 가 결정됐다 — **Main Backend = TypeScript + NestJS**(모듈형 모놀리스, API + Worker 프로세스), **AI Server = 별도 Python 런타임**(ADR-033 Accepted). 이 계획의 **AI 포트**는 Main Backend 안의 인터페이스로 그대로 두고, 그 구현이 **Main Backend → AI Server HTTP/JSON 어댑터**가 된다. Slice 1 의 템플릿·녹화 재생 구현을 Main Backend 쪽 어댑터에 둘지 AI Server 에 둘지는 U0/U7 에서 정한다(어느 쪽이든 출력은 후보). 본문의 "Q-64 미결" 표현은 결정 전 기록이다 — 현재 상태는 16.4 · 18 #1 · 19.2 를 본다.
- 기준: HEAD `3106772` · 논리 모델 `docs/22` **rev.2.4** · 개념 모델 `docs/21` 승인 · ADR-026~029·032 Accepted · ADR-030·031 Proposed
- 이 문서의 성격: **Implementation Plan (HOW)** — `docs/17` 4절. 무엇을 **어떤 순서로** 만들고 **무엇으로 다 됐다고 판단하는가**를 정한다
- 정본 관계: 요구사항은 `docs/19`, 구조의 이유는 `docs/18`, 표·컬럼·제약은 `docs/22`, 오류·관측은 `docs/23` 이 정본이다. **이 문서는 그 정본을 다시 쓰지 않고 "첫 구현의 범위와 순서"만 정한다.** 정본과 어긋나는 곳을 발견하면 여기서 고치지 않고 19절에 적는다

> **이 문서가 정하지 않는 것**: 제품 코드 · SQL·DDL · 물리 타입·인덱스 · ORM · 마이그레이션 도구 · endpoint URL · Backend 언어·프레임워크(Q-64) · **DB 제품·접근 방식·마이그레이션 도구(Q-68)** · 솔버(Q-65) · LLM 공급자·모델 · 실제 보관 기간 숫자 · M-6 · Q-46.

---

## 0. 한 장 요약

| 질문 | 답 |
| --- | --- |
| 첫 번째로 끝까지 동작시킬 흐름 | **외부 통신 루프 한 바퀴**: 계획의 부족분 → 구조화 숫자 → 문의 초안 → 숫자 검사 → **사람 발송 승인** → Outbox → **Mock 채널 발송** → 회신 수신·원문 보존 → 발신자 식별(등록부) → 추출 후보 → 검증기 → **사건** → **현재 사실(PROVISIONAL)** → 확인 요청 → **사람 확인(VERIFICATION 사건)** → 재계산(CONFIRMED) → 화면 |
| 왜 이것부터 | 정본 전체가 이미 이 흐름을 첫 구현으로 지정했다(`docs/19` 24.1 · `docs/18` N · `docs/22` 26절). CERA 의 안전 근거(승인 없이 안 나감 · 두 번 안 나감 · 회신 한 통으로 사실이 확정되지 않음)를 **전부** 지나가는 가장 짧은 흐름이다 |
| 채널 | **Mock**(`docs/18` J.4 2단계 — "루프는 진짜, 채널만 가짜"). 실제 Gmail 은 **Slice 2**(Tech Validation) |
| AI | **포트(인터페이스)만 REAL, 구현은 템플릿 + 녹화 재생**. 실제 LLM 은 **Slice 3** |
| 계획·위험·비용 | **시드(MOCK)**. 솔버·비용·위험 엔진은 만들지 않는다 |
| L-13 | **A — 복구 맥락 = `recovery_run` 계보의 뿌리 실행 id.** 새 표·새 컬럼 없음 |
| P0 표 | **29개**(MVP 52개 중). P1 14 · DEFERRED 9 |
| 완료 판단 | 15절 DoD 18항목. `docs/18` K.2 12개와 `docs/19` 20절 34개는 **Slice 1~3 전체**에 매핑(14.4 · 14.5) |
| 다음 | 계획 승인 → **사용자 Backend 결정(Q-64)** → **사용자 DB 결정(Q-68)** → **T-080 물리 설계(P0 29개)** → Phase 0 부터 구현. 솔버 위치(Q-65)는 Slice 1 을 막지 않는다 |

---

## 1. 첫 Slice 는 무엇인가

### 1.1 흐름 (정본 대조 결과 — 사용자 후보 17단계를 그대로 채택)

| # | 단계 | 정본 | 누가 |
| --- | --- | --- | --- |
| 1 | 이미 있는 복구 계획·부족분을 입력으로 받는다 | `19` 흐름 D · `18` D.2 | **시드**(MOCK) |
| 2 | 문의에 필요한 **구조화 숫자**를 계획에서 주입한다(출처 포인터 포함) | FR-COM-04·05 · `22` 15.4 | Backend(결정론) |
| 3 | 문의 **문장** 생성 — 템플릿, 또는 AI 포트 | FR-COM-06 · `18` O | 템플릿(REAL) / AI 포트(녹화) |
| 4 | **숫자 검사** — 본문 숫자 ⊂ 구조화 값 | FR-COM-07 · `18` D.2 | Backend(결정론) |
| 5 | **사람 발송 승인**(G4) — 내용·수신자·값 동결 | FR-APV · `22` 15.5 | 사람 + Backend |
| 6 | Outbox 가 집는다 — Contact Gate 재검사 | FR-ELG-03 · `18` H.2 | Backend |
| 7 | **Mock 채널 발송** — 시도 행을 호출 **전에** 커밋 | FR-SND-01·02 · `22` 15.7 | Backend + Mock 어댑터 |
| 8 | 회신 수신 — 원문 보존 · 중복 제거 | FR-INB-01·05 | Backend |
| 9 | 발신자 → 거래처·연락처 식별(**등록부**) | FR-INB-03 · `18` C.1 | Backend(결정론) |
| 10 | 추출 — 비정형이면 AI 포트, 구조화면 **AI 호출 없음** | FR-XAI · FR-STC · `18` J.6 | AI 포트(녹화) / Backend |
| 11 | 검증기 — 인용 대조 · 단위·범위 · 질문 매핑 · 권한 | FR-XAI-05 · `05` 4.6 | Backend(결정론) |
| 12 | **사건** 생성(append-only, 멱등) | FR-EVL-01~04 · `22` 11.2 | Backend |
| 13 | **현재 사실** 계산 — 대개 PROVISIONAL | FR-EVL-07 · `22` 11.4 | 결정론 엔진(Reconciliation subset) |
| 14 | 필요하면 **확인 요청**(V3·V4·V9) | `05` 11.1 · `18` F.5 | 결정론 엔진 |
| 15 | **사람 사실 확인** → `VERIFICATION` 사건 | `22` 11.2a · A-17 | 사람 + Backend |
| 16 | 재계산 → CONFIRMED · `decision_usability` 변화 | `22` 11.4.2 | 결정론 엔진 |
| 17 | 화면 반영 — 잠정/확정 배지 · 타임라인 | FR-UI · `19` 14.1 | Frontend(표시만) |

**정본과 맞는가 — 맞다.** `docs/19` 24.1 의 목표("문의 초안 → 사람 승인 → 실제 발송 → 실제 회신 → 구조화 → 운영 사실 후보 → 화면 반영")에 **사람 확인(15~16)** 을 더한 것이다. 사람 확인은 T-081 이 논리 모델에 복구한 경로이고 `docs/19` FR-EVL-07("대개 잠정 + 확인 요청")이 요구하는 끝단이므로 첫 Slice 에 넣는다.

### 1.2 잘라내지 않은 핵심 (사용자 지시)

| 핵심 | 어디서 보장하나 |
| --- | --- |
| 발송 승인 | Phase 4 · 테스트 A-01~A-06 |
| 중복 발송 방지 | Phase 5 · 테스트 S-01~S-05 |
| 회신 원문 보존 | Phase 6 · 테스트 I-01·I-02 |
| 발신자 신원을 AI 가 정하지 않음 | Phase 6 · 테스트 I-03·X-04 |
| 추출이 바로 사실이 되지 않음 | Phase 7·8 · 테스트 X-01·E-03 |
| 사건 생성 | Phase 8 |
| 현재 사실 반영 | Phase 8 |
| 사람 확인 경로 | Phase 9 |

### 1.3 "첫 구현"을 세 Slice 로 나눈다

`docs/19` 의 "첫 구현"(20절 34항목)은 **실제 Gmail 왕복까지** 포함한다. 한편 `docs/18` J.4 는 **"Mock 채널로 루프 완주"를 독립 단계로 먼저** 두고 "실제 발송은 마지막에 켠다"고 요구한다(N.2 #14). 둘을 맞추면 이렇게 된다.

| Slice | `18` J.4 | 무엇 | 이 계획에서 |
| --- | --- | --- | --- |
| **Slice 1 — Mock 루프** | 1 읽기 + **2 쓰기** | 루프 전체가 진짜, 채널·AI·계획만 가짜 | **이 문서의 "첫 Vertical Slice". 상세 계획** |
| Slice 2 — Tech Validation | 3 실채널 | **주소 확인 메일 흐름**(FR-EVF) · Gmail OAuth · 실제 왕복 · 개발 안전장치 · kill switch 실동작 | 골격만(11.13). 착수 전 별도 계획 보강 |
| Slice 3 — 실제 추출 | 4 추출 | `ai/extraction` 실제 LLM + 녹화 재생 병행 | 골격만(11.14) |

> **Slice 1 이 끝나도 `docs/19` 20절의 첫 구현이 끝난 것은 아니다.** 34항목 중 Slice 1 이 닫는 것과 Slice 2·3 이 닫는 것을 14.5절에 나눠 적었다.

---

## 2. 첫 Slice 에서 일부러 하지 않는 것

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| Solver · Recovery Optimization | **MOCK**(시드된 실행) | `18` N.3 금지선. 계획은 입력으로만 필요하다 |
| Full Risk / Cost Engine | **불필요** | 이 루프는 위험·비용 숫자를 쓰지 않는다. 화면은 계속 시나리오(`19` 24.4) |
| 실제 Gmail OAuth · 폴링 | **DEFERRED → Slice 2** | J.4 3단계 |
| 주소 확인 메일 흐름(FR-EVF) | **DEFERRED → Slice 2** | 실제 발송 전에만 필요하다. Slice 1 은 등록부 상태를 시드한다(아래 주의) |
| 실제 LLM | **DEFERRED → Slice 3** | J.4 4단계. 포트와 녹화 재생은 Slice 1 에 있다 |
| Pub/Sub push | **불필요** | 폴링으로 충분(`18` L) |
| Production 배포 · 멀티테넌시 · 인증 | **불필요** | `18` N.3 |
| Public API 어댑터 | **불필요** | `18` N.3 |
| Contract Parser · 첨부 해석 | **불필요** | 첨부는 보관·지문까지(`22` 29.4) |
| Desktop(Electron·Tauri) | **불필요** | ADR-031 Web First |
| 결제·회계 · Partner Portal · TMS | **불필요** | 범위 밖 |
| 보관 기간 자동 파기 작업 | **DEFERRED → Pilot** | 구조와 부재 판정(29.8.1)만 Slice 1 에 있다 |
| 요율 회신(`rate`) · 최대 보관일 · `commercial_offer` | **DEFERRED → Slice 2** | Slice 1 은 사실 키 3개로 루프를 닫는다(5.4) |

> **주의 — 등록부 시드는 우회가 아니다.** Slice 1 의 거래처·연락처·주소는 **시나리오 데이터(`is_simulated = true`)** 로 들어오고 주소 3상태도 시드된다. 이 데이터는 `docs/18` J.3 불변식 때문에 **실채널로 나갈 수 없다**(`BLOCKED_SIMULATION_MISMATCH`). 실제 주소는 Slice 2 의 확인 메일 흐름을 **반드시** 거친다(`docs/01` 6.1 "테스트할 때도 우회 경로를 만들지 않는다").

---

## 3. REAL · MOCK · DEFERRED

| 영역 | 항목 | 판정 | 비고 |
| --- | --- | --- | --- |
| 입력 | 복구 계획(`planning_snapshot`·`recovery_run`) | **MOCK** | 시드. 솔버 없음 |
| 입력 | 부족분(gap) | **MOCK** | 시드 fixture. 논리 모델에 gap 표는 없다 — 구조화 값의 `source_path` 로 가리킨다(`22` 15.4) |
| 입력 | 거래처·연락처·주소와 3상태 | **MOCK**(시드) | 판정 로직은 REAL |
| 입력 | 시설·차량 풀 | **MOCK**(시드) | 사실의 주체로만 쓴다 |
| 입력 | 상대방 회신 | **MOCK** | Mock 채널이 시나리오 스크립트로 돌려준다 |
| 채널 | Channel Adapter 포트 | **REAL** | 계약은 8절 |
| 채널 | Mock 채널 구현 | **MOCK** | 두 가지 선언(비정형 / 구조화) |
| 채널 | Gmail 구현 | **DEFERRED** | Slice 2 |
| AI | 초안 문장 포트 | **REAL**(포트) | 구현은 **템플릿**(AI 없이도 초안, FR-COM-06) |
| AI | 회신 추출 포트 | **REAL**(포트) | 구현은 **녹화 재생**(FR-XAI-10, NFR-29) |
| AI | 실제 LLM 호출 | **DEFERRED** | Slice 3 |
| 통신 | 메시지 생애주기 · 상태 전이 | **REAL** | `22` 15.3·15.8 |
| 통신 | 구조화 값 주입 + 출처 포인터 | **REAL** | |
| 통신 | 숫자 검사 | **REAL** | |
| 통신 | 발송 승인 · 승인 사본 동결 · 무효화 | **REAL** | 계획 교체(`PLAN_SUPERSEDED`) 포함 |
| 통신 | Contact Gate(6조건) + 개발 안전장치 | **REAL** | 실패 사유 5종 |
| 통신 | Outbox · 발송 시도 · 멱등 · 재시도 분류 · 화해(`lookup_sent`) | **REAL** | |
| 통신 | Kill switch | **REAL**(스위치) | Slice 1 은 Mock 이라 실제로 막을 발송은 없지만 **스위치 동작과 "승인은 되고 발송은 대기"** 는 검증한다 |
| 수신 | 원문 보존 · 중복 제거 · 스레드 상관 · Quarantine | **REAL** | |
| 수신 | 발신자 → 등록부 매핑 | **REAL** | |
| 수신 | Q-44 시각 선택 | **REAL** | Mock 이 `Date` · 채널 수신 시각을 둘 다 준다 |
| 추출 | 추출 기록 · 검증기 · `ask_id` 매핑 · 구조화 채널 우회 | **REAL** | |
| 상태 | 사건 append · 멱등 키 | **REAL** | |
| 상태 | Reconciliation subset · 현재 사실 · 충돌 · 확인 요청 | **REAL** | 규칙은 `18` F.5 의 부분집합(8.3) |
| 상태 | 사람 확인(`VERIFICATION`) · 확인 대상 표 · 처리 기록 | **REAL** | |
| 상태 | [지금도 맞음] (M-6 임시 동작) | **REAL** | 사람 관측 사건 1건. 신선도 정책은 정하지 않는다 |
| 보관 | 기록·내용 분리(참조 + 지문) · 부재 판정 | **REAL** | `22` 29절 · 29.8.1 |
| 보관 | 파기 작업(스케줄) | **DEFERRED** | 시험용 파기 명령만 둔다 |
| 운영 | 감사 · `system_error` · `request_id`/`trace_id` · 공통 오류 응답 | **REAL** | `docs/23` |
| 화면 | 통신·확인 큐·Data Trust·타임라인의 API 연결 | **REAL**(부분) | 9절. 나머지 화면은 시나리오 |
| 화면 | 30대 시나리오 재생 | **유지** | MockProvider 가 계속 기본값 |

---

## 4. L-13 — 복구 맥락 식별자 결정

### 4.1 비교

| 기준 | A. 계보 뿌리 `recovery_run` id | B. 최초 계기 사건 id | C. 컨테이너 집합 지문 | D. 별도 안정 id |
| --- | --- | --- | --- | --- |
| 재계산돼도 같은 맥락 | **예** — 뿌리는 바뀌지 않는다(append-only) | 예 | **아니오** | 예 |
| 컨테이너 일부 추가·제외 | **예** | 예 | **아니오** — 지문이 바뀐다 | 예 |
| 첫 실행 전에 범위가 필요한가 | **필요 없다** — 아래 근거 | — | — | 필요할 때 대비 가능 |
| 운영자 계획 조건이 붙을 곳 | **예** — 첫 계산 뒤에만 생긴다 | 예 | 불안정 | 예 |
| 범위 있는 요율 사실 | **예** | 예 | 불안정 | 예 |
| 문의·확인 요청 | **예** — `comm_thread.related_run_id` → 뿌리 | 사건이 없는 맥락은 표현 불가 | 불안정 | 예 |
| 계보 조회 | **쉽다** — `previous_run_id` 가 이미 있다 | 사건 → 실행 연결이 약하다(`trigger_ref` 문자열) | 어렵다 | 표 또는 컬럼이 필요 |
| 계기가 사건이 아닌 경우(`OPERATOR_REQUEST`·`SCHEDULED`) | **문제없다** | **실패** | — | 문제없다 |
| 물리 구현 | **새 컬럼·표 없음** | 없음 | 계산 규칙 필요 | **컬럼 1개 이상 + 발급 규칙**, 식별자를 담을 표가 없으면 FK 검사 불가 |
| ExceptionCase 없이 MVP 를 버티나 | **예** | 부분적 | 아니오 | 예 — 하지만 **이름만 바꾼 ExceptionCase 가 되기 쉽다** |

**"첫 실행 전에 범위가 필요 없다"의 근거.** `docs/03` 2.6.1(운영자 개입과 재계산)이 흐름을 **"CERA 가 먼저 계산해서 보여준다 → 운영자가 입력을 고친다 → 다시 계산한다"** 로 고정했다. 운영자 계획 조건·범위 있는 요율 입력·문의는 **모두 첫 계산 뒤에** 생긴다. 그래서 A 의 유일한 약점(실행 전 범위)이 실제로는 나타나지 않는다.

### 4.2 결정 — **L-13 CLOSED: A**

> **복구 맥락 = `recovery_run` 계보(`previous_run_id` 사슬)의 뿌리 실행 id.** `applicability_scope_type = RECOVERY_CONTEXT` 인 모든 곳의 `*_scope_ref` 에 이 값이 들어간다.

| 규칙 | 내용 |
| --- | --- |
| **L13-1** 뿌리의 정의 | `previous_run_id` 가 비어 있는 실행이 뿌리다. 뿌리 실행의 복구 맥락은 **자기 자신의 `run_id`** 다 |
| **L13-2** 같은 사고의 재계산 | 같은 사고를 다시 계산하면 **반드시 `previous_run_id` 를 이어받는다.** 이어받지 않으면 **새 맥락**이다 — 이전 맥락의 범위 있는 입력은 따라가지 않는다(D-3 "좁은 쪽이 안전"과 같은 방향) |
| **L13-3** 쓰기 경로 검사 | `RECOVERY_CONTEXT` 의 참조 값은 **존재하는 뿌리 실행 id** 여야 한다. 다형 문자열이라 DB FK 는 없고 쓰기 경로에서 검사한다(`22` 17.4 규칙 2) |
| **L13-4** 현재 계획 | 한 맥락의 **현재 실행** = 그 계보에서 가장 늦은 실행. 계획 결정(`plan_decision`)이 들어오는 슬라이스부터는 "마지막 유효 결정의 실행"(`22` 21절) |
| **L13-5** 저장하지 않는다 | 뿌리는 계보를 따라가 **조회로** 구한다. 행이 불변이라 뿌리도 바뀌지 않으므로 T-080 이 성능을 위해 물리적으로 복사해 둘 수는 있다(논리 컬럼 아님) |

**새 표·새 컬럼·새 개념 없음.** 이미 있는 `recovery_run.previous_run_id` 와 문자열 `*_scope_ref` 만으로 성립한다. **ExceptionCase 를 다시 만들지 않는다.** 나중에 사고 단위의 담당·상태·종결이 업무 기능이 되면 그때 `docs/22` 16.4 의 "다시 여는 조건"으로 간다.

### 4.3 회신 → 사건 → 사람 확인의 경계, 그리고 "지난 계획 기준 회신"

**먼저 원칙 — 사람 확인은 "사건을 만들지 말지 승인하는 단계"가 아니다.** 사람 확인은 **이미 사건이 된 잠정 사실을 확인·기각하는 단계**다. 이 둘을 섞지 않는다.

| 규칙 | 정본 | 뜻 |
| --- | --- | --- |
| **검증을 통과한 회신 값은 사건이 된다** | `19` FR-EVL-01 · `05` 1절(모든 입력은 출처를 가진 사건) · `19` 600행 파이프라인 | 사람이 먼저 허락해야 사건이 되는 것이 **아니다** |
| **회신 하나로는 CONFIRMED 가 되지 않는다** | `19` FR-EVL-07 · `18` K.2 #9 · `05` 3.3(메일 추출 강도 1) | 사건이 된 뒤 **대개 PROVISIONAL** 이고 확인 요청이 함께 생긴다 |
| **CONFIRMED 는 사람 확인 사건으로만** | `05` 6.2 `verification_basis` · `22` 11.2a · A-17 | `VERIFICATION(CONFIRM)` 사건이 현재 사실을 바꾼다 |

**정상 회신(그 맥락의 현재 실행에 대한 문의)의 흐름**

```
회신 수신 → 원문 보존 → 발신자 매핑(등록부) → 추출 후보 → 결정론 검증기
  → (통과한 값) 사건 생성 — 추출 기록은 SYSTEM 이 ACCEPTED (`22` 15.9.1 규칙 4)
  → 현재 사실 재계산 → 대개 PROVISIONAL (OBSERVED 도 가능 — 출처·권한에 따라)
  → 확인 요청(V3·V4·V9 — `05` 11.1, 새 규칙 없음)
  → 사람 확인 → VERIFICATION 사건 → 재계산 → CONFIRMED
```

**사건이 만들어지지 않는 경우 — 정본이 정한 것뿐이다.** 새 경우를 더하지 않는다.

| 경우 | 정본 | 왜 사건이 없나 |
| --- | --- | --- |
| 미등록 발신자 · 다른 거래처 소속 · 문의를 못 찾음 · 전달 메일 · 해독 불가 | `19` 10.1(값 추출 **안 함**) · FR-INB-06~08 | **보류함.** 사람이 스레드에 연결하면 그때부터 정상 흐름을 탄다 |
| 검증 실패(인용 불일치 · 단위 없음 · 형식 오류 · 묻지 않은 값) | FR-XAI-12~22 | 값이 탈락했으므로 주장할 것이 없다 |
| 여러 값 중 어느 것이 답인지 모름 | FR-XAI-13 | 값으로 쓰지 않고 후보를 보여 사람이 고른다 — **고른 값이 사건이 된다** |
| 빈 본문 · 자동 회신 | FR-INB-10·11 | 추출하지 않는다 |
| 운영상 변화 없음 · 재관측 | FR-EVL-12·13 · M-6 | 사건 없음(재관측은 [지금도 맞음] 임시 동작) |

#### "지난 계획 기준 회신"은 **B** 다 — 사건과 근거는 남고, 현재 계획에 자동 반영하지 않는다

| | A. 사건 자체를 만들지 않는다 | **B. 사건·근거는 남기되 현재 계획에 자동 반영하지 않는다** |
| --- | --- | --- |
| 정본 문구 | — | `19` FR-INB-09 "받아서 **저장·해석**한다 … 자동으로 **현재 계획**에 반영하지 않는다" · 10.1 표 "상태 반영 = **현재 계획에** 자동 반영 안 함"(보류함의 "안 함"과 다르게 적혀 있다) · 실패표 "저장·해석, 자동 반영 안 함" |
| 판정 | 정본에 근거가 없다. **새 승인 게이트**가 된다 | **정본이 요구하는 것** |

그래서 T-069 는 **B** 로 한다. 이전 초안의 "사건을 자동으로 만들지 않고 사람이 채택" 문구는 **정본에 없는 게이트였으므로 폐기**한다.

**판정** — 회신이 속한 스레드의 `related_run_id` 로 본다(L-13).

| `related_run_id` | 판정 |
| --- | --- |
| 그 맥락의 **현재 실행**(L13-4) | 정상 회신 |
| 같은 맥락이지만 **더 새 실행이 있음** · 또는 **다른 맥락** | **지난 계획 기준 회신** |

**지난 계획 기준 회신의 처리 — 여섯 단계로 나눠 본다** (2026-09-21 검토 반영)

"사건이 있다"와 "현재 계획을 자동으로 바꾼다"는 **같은 것이 아니다.**

| 단계 | 지난 계획 기준 회신 | 무엇이 그렇게 정하나 (기존 규칙) |
| --- | --- | --- |
| **A. 사건 생성** | **만든다** — 검증을 통과한 값 | `19` FR-EVL-01 · FR-INB-09("받아서 저장·해석") |
| **B. 현재 사실의 후보** | **후보다** | `05` 8.3 **R1 제외 목록**(거절 · 대체 · 권한 없음 · 기준 시각 이후 수신 · 기각)에 "지난 문의에서 온 사건"은 **없다** |
| **C. 현재 상태 반영** | **정상 회신과 같은 규칙**으로 정해진다 | 현실에 대한 주장이다. 이기는지는 근거 시각(Q-44 — 늦게 쓴 메일은 발신 시각으로 약해진다) · 강도(메일 추출 1 → 대개 `PROVISIONAL`) · 신선도로 판정하고, **지난 시간창의 제안은 `EXPIRED`**(R4-d · FR-EVL-09), 불리한 큰 감소는 **`HELD`**(R10) |
| **D. Reconciliation** | **특별 규칙 없음** | R1~R12 그대로. 새 규칙을 만들지 않는다(`18` N.3) |
| **E. 재계산(새 실행) 자동 계기** | **만들지 않는다** | 이번 슬라이스는 **어떤 회신도** 자동 재최적화를 하지 않는다 — `18` L "회신 반영 후 자동 재최적화: 솔버가 없다. **'입력이 바뀌었다'까지만 표시**"(T-045). 자동 계기가 생기는 슬라이스에서는 FR-INB-09 에 따라 **지난 계획 기준 회신은 `REPLY_RECEIVED` 계기가 되지 않는다** — 판정은 이 표 위의 `related_run_id` 기준 |
| **F. 현재 계획에 자동 적용** | **일어나지 않는다** | 아래 세 규칙 |

**F 를 보장하는 것 — 전부 이미 있는 규칙이다**

1. **계획은 불변 기록이다.** `recovery_run` · `planning_snapshot`(+ 자식 표)은 덧붙이기 전용이고, 계산 입력은 스냅샷에 **값으로 얼려져** 있다(`22` 13절 원칙 · 안티패턴 7 · I-12). 새 사건이 생겨도 **이미 만든 계획은 바뀔 수 없다.** 계획이 바뀌는 길은 **새 실행**뿐이고, 그 계기는 E 가 막는다.
2. **답의 연결은 그 회신의 스레드 안에서만 일어난다.** 추출은 `ask_id` 로 **자기 스레드의 `question_item`** 에만 매핑된다(`18` D.3 · `22` L-1). 그래서 지난 문의의 회신은 **지난 문의의 질문**에 답할 뿐이고, 현재 실행의 문의는 계속 회신 대기다. 사실 키에는 슬롯·날짜가 들어 있으므로(`05` 4.3 `available.slot(S)` · `capacity.day(D)`) 다른 시간창을 물은 옛 문의의 답은 **애초에 다른 사실**이다.
3. **사람이 나중에 다시 계산할 때의 안전장치.** 그 사실은 대개 `PROVISIONAL` 이라 새 계획에 쓰이면 `USABLE_WITH_WARNING` 이고, 계획 승인 때 **잠정 입력으로 인지했다는 기록**이 필요하다(`05` 11.5 `ALLOW_WITH_ACK`). 승인된 계획의 근거가 크게 바뀌면 **기존 V5**(`05` 11.1). 화면에는 "지난 계획 기준 회신"이 표시된다.

**L-13 과 모순되지 않는다 — 두 축이 다르다.**

| 축 | 무엇으로 판정하나 | 묻는 것 |
| --- | --- | --- |
| **적용 범위(scope)** | `applicability_scope_*` — 복구 맥락이면 **계보의 뿌리 실행 id** | 이 값이 **어느 사고에** 적용되나 |
| **지난 계획 기준인가** | `comm_thread.related_run_id` 가 그 맥락의 **현재 실행**(L13-4)인가 | 이 회신이 **어느 계산**에서 나온 문의에 대한 것인가 |

- 같은 사고 안의 Run 1 문의에 온 회신은 **같은 뿌리(R1)** 를 쓰는 Run 3 의 맥락에서도 **정상적인 근거**다. 같은 사고에 대한 현실 정보이기 때문이다. 이것은 막을 일이 아니다. 막아야 하는 것은 **자동 재계산과 현재 문의에 대한 자동 연결**이고, 그것은 범위가 아니라 **F 의 세 규칙**이 막는다.
- **범위가 차이를 만드는 경우는 하나뿐이다**: 회신의 값이 **맥락 범위**(`RECOVERY_CONTEXT`)로 저장됐고 그 뿌리가 **다른 사고**일 때 — 그 값은 새 사고의 계산에 보이지 않는다(`22` 11.4.1). Slice 1 의 회신 사실(차량 가용 · 야드 용량)은 현실 사실이라 **`GLOBAL`** 이다. 맥락 범위 기본값은 **운영자가 직접 넣은 요율·계획 조건**에만 해당한다(`22` 22.2).

> **이전 문구 정정**: "원래 맥락에 속하고 현재 맥락 계산에는 보이지 않는다"는 **근거 없이 일반화된 표현**이었다. 같은 사고 안에서는 성립하지 않고, 범위는 이 문제의 차단 장치가 아니다.


## 5. 첫 Slice 의 표 — P0 29개

`docs/22` 26절 원칙 그대로: **논리 모델 전체 ≠ 첫 마이그레이션.** 아래 분류는 **구현 순서**다. 논리 모델의 컬럼을 줄이라는 뜻이 아니다 — P0 표는 **논리 컬럼 전부를 물리 설계**하고, 아래 "Slice 1 이 실제로 채우는 컬럼"은 테스트·시드 범위를 정하는 데만 쓴다.

### 5.1 P0 — 첫 Slice 에 반드시 필요 (29)

| # | 표 | 왜 필요한가 | 어디서 생기나 | 쓰는 쪽 | 참조 | Slice 1 에서 비어 있는 것 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `scenario` | Mock 루프의 모든 행이 `is_simulated = true` 라 `scenario_id` 가 필요하다(S-2) | 시드 | 전체 | — | — |
| 2 | `actor` | 승인·확인·감사의 주체. `SYSTEM` + 운영자 | 시드 | 전체 | — | — |
| 3 | `counterparty` | 역할 판정의 정본. 상대방 2곳 | 시드 | 등록부·게이트·매핑 | — | — |
| 4 | `counterparty_contact` | 담당 연락처 | 시드 | 게이트·매핑 | 3 | — |
| 5 | `contact_channel_address` | **발송 자격의 정본**(3상태) | 시드 | 게이트·매핑 | 4 | — |
| 6 | `facility` | 사실의 주체(창고·ODCY) | 시드 | 사건 링크 | — | 상세 표 없음 |
| 7 | `truck_pool` | 사실의 주체(차량 풀) | 시드 | 사건 링크 | 3 | — |
| 8 | `planning_snapshot` | `recovery_run` 이 참조(NOT NULL) | 시드 | 계획 참조 | 1 | 스냅샷 자식 표 없음 |
| 9 | `recovery_run` | 구조화 값의 출처 · 승인의 계획 · 스레드 · **L-13 뿌리** | 시드 | 초안·승인·무효화 | 8 | 비용·솔버 칸 |
| 10 | `comm_thread` | 한 상대·한 주소·한 채널 고정(FR-COM-11) | 초안 생성 | 통신 | 3·4·9 | — |
| 11 | `question_item` | **회신 → 사실 키 매핑의 축**(L-1). AI 가 사실 키를 정하지 않게 한다 | 초안 생성 | 초안·추출 매핑 | 10 | `verification_request_key` |
| 12 | `comm_message` | 메시지 기록(내용은 참조) | 초안·수신 | 통신 | 10·5·(contact_verification 은 P1) | `contact_verification_id` |
| 13 | `comm_message_structured_field` | 숫자는 본문이 아니라 여기(숫자 검사의 기준) | 초안 | 숫자 검사·승인 | 12·9·11 | — |
| 14 | `comm_message_question` | 메시지 ↔ 질문 | 초안 | 통신 | 12·11 | — |
| 15 | `message_approval` | G4 승인·무효화 사슬 | 승인·무효화 | Outbox·게이트 | 12·9·5 | — |
| 16 | `message_approval_structured_field` | 승인한 숫자 사본 | 승인 | 승인 대조 | 15 | — |
| 17 | `send_attempt` | **중복 방지의 핵심**(호출 전 커밋 · 결과 1회) | 발송 | Outbox·화해 | 12·15 | `channel_connection_id`(Mock 이라 비움 — P1) |
| 18 | `message_status_transition` | 메시지 상태의 정본 | 전 과정 | 화면·감사 | 12·17 | — |
| 19 | `raw_input` | 회신 원문 기록(내용은 참조) | 수신 | 추출·사건 | 1·2 | `attachment_manifest`(Mock 은 첨부 없음 — 시험 1건만) |
| 20 | `extraction` | 추출 후보·인용·검증기 결과 | 추출 | 사건 생성 | 12·19 | — |
| 21 | `event` | 사실 주장의 정본 | 사건 생성·확인·[지금도 맞음] | 상태 | 19·20·3·2 | `supersedes_event_id`(정정은 P1 — 아래) |
| 22 | `event_entity_link` | 주체 1건 규칙(I-8) | 사건 생성 | 상태 | 21 | — |
| 23 | `event_verification_target` | 사람 확인이 무엇을 가리키나 | 사람 확인 | 상태 | 21 | — |
| 24 | `canonical_fact` | 현재 사실(파생) | 재계산 | 화면·확인 | 21 | — |
| 25 | `conflict` | 충돌(파생) | 재계산 | 확인 요청 | 21 | — |
| 26 | `verification_request` | 확인 큐(파생) | 재계산 | 화면 | 25 | — |
| 27 | `verification_request_handling` | 사람의 처리 기록 | 사람 | 화면 | (논리 키) · 2 · 21 | `question_item_id` |
| 28 | `audit_log` | 감사 · **파기 감사** | 전 과정 | 감사 화면 | 2 | — |
| 29 | `system_error` | 기술 오류 기록 · **내용 부재 판정** | 오류 | 운영 | (다형) | — |

- **정정(`CORRECTION`) 사건**: 표는 P0(21)에 있고 쓰기 경로는 Phase 8 에 **최소로** 둔다(자기 입력의 오입력 정정). 정정 UI 는 P1.
- **보관 관리 내용 저장소**는 표가 아니다(`22` 29.1). Slice 1 은 **포트(put / get / purge)** 를 REAL 로 두고 물리 저장 위치는 T-080·기술 결정이 정한다.

### 5.2 P1 — 두 번째 단계 (14)

| 표 | 언제 |
| --- | --- |
| `contact_verification` · `channel_connection` | **Slice 2** — 확인 메일 · Gmail 연결 |
| `commercial_offer` · `commercial_offer_item` | Slice 2 — 요율 회신(`rate` 사실) |
| `container` · `bl` · `container_bl` · `assignment` | 계획 도메인이 합류할 때(부족분을 시드 fixture 대신 배정에서 계산) |
| `facility_warehouse` · `facility_terminal` · `facility_odcy` | 시설 상세가 필요한 계산이 생길 때 |
| `planning_snapshot_fact` | 회신으로 **재계산(새 실행)** 을 돌릴 때 — 상태 6차원 동결(I-12·I-27) |
| `operator_planning_constraint` · `plan_decision` | 운영자 개입·계획 승인 흐름이 합류할 때 |

### 5.3 DEFERRED — 지금 만들지 않음 (9)

`external_identifier` · `contract` · `tariff_rule` · `risk_assessment` · `cost_result` · `cost_line_item` · `cost_line_link` · `planning_snapshot_constraint` · `planning_snapshot_input`. (`vessel_call` 은 Next, `exception_case` · `operational_plan_batch` 는 만들지 않음 — 원래 분류 그대로.)

**합계 확인: 29 + 14 + 9 = 52** (MVP 논리 테이블 수와 같다).

**P0 29개 재검증(2026-09-21)** — 표 수를 줄이려고 합치거나 빼지 않는다. 29개는 전부 **안전 규칙 또는 참조 무결성** 때문에 필요하다: `scenario`(가상 행은 `scenario_id` 필수, S-2) · `actor`(승인·확인·감사 주체) · 등록부 3개(**Contact Gate 의 정본**) · `facility`·`truck_pool`(사건 주체의 존재 검사, I-8) · `planning_snapshot`(`recovery_run.snapshot_id` NOT NULL) · `recovery_run`(**계획 교체 무효화 · L-13 뿌리**) · 통신 10개(승인 · 멱등 발송 · 상태의 정본) · 사건·상태 8개(사건 · 사람 확인 · 확인 큐) · `audit_log`·`system_error`(감사 · **내용 부재 판정**). 구현은 Phase 별 마이그레이션으로 나눈다(11절).

### 5.4 Slice 1 의 사실 키 — 3개

`docs/18` F.5 · `docs/19` FR-EVL-05 는 5개(차량 가용 · 야드 용량 · 최대 보관일 · 보관 요율 · 창고 수용량)를 말한다. Slice 1 은 **계산 없이 루프를 닫는 세 개**로 시작한다.

| 사실 | `fact_kind` | 주체 | 상대 |
| --- | --- | --- | --- |
| 슬롯별 차량 가용 `available.slot(S)` | `OFFER` | `TRUCK_POOL` | 운송사(Mock — 비정형 회신) |
| 규격·일별 야드 용량 `capacity.size_type(T).day(D)` | `OFFER` | `FACILITY`(ODCY) | ODCY(Mock — **구조화 회신**) |
| 일별 창고 수용량 `capacity.day(D)` | `STATE` | `FACILITY`(창고) | 사람 입력([지금도 맞음] · 시드) |

최대 보관일(`TERM`)과 보관 요율(`rate` → `commercial_offer`)은 **Slice 2**.

---

## 6. Backend 기능 단위와 의존

```
F  Runtime(오류 경계·request/trace id·감사·system_error·clock(as_of)·내용 저장소 포트)
│
├─ A  Registry        ── 거래처·연락처·주소, Contact Gate, 개발 안전장치
│
├─ B  Communication   ── 스레드·질문·메시지·구조화 값·숫자 검사·승인·무효화
│      │                (A 필요: 승인 시 게이트)
│      └─ B2 Outbox   ── 발송 시도·멱등·재시도 분류·화해·kill switch  (Channel 포트 필요)
│
├─ C  Inbound         ── 원문·중복 제거·스레드 상관·발신자 매핑·Quarantine·Q-44 시각
│                       (A 필요: 매핑 / B 필요: 스레드)
├─ D  Extraction      ── 추출 기록·검증기·ask_id 매핑·구조화 채널 우회   (C·B 필요)
│
└─ E  Event / State   ── 사건 append·멱등·Reconciliation subset·현재 사실·충돌·확인 요청·사람 확인
                        (D 필요 — 단, E 의 엔진은 D 없이도 시험 가능)
```

| 단위 | 모듈(`docs/07` 2절 이름) | 책임 | 의존 |
| --- | --- | --- | --- |
| **F** Runtime | `errors / observability` · `audit` · `storage` | 세 경계 공통 오류 처리 · 구조화 로그 · `request_id`/`trace_id` 전파(Outbox 작업까지) · 감사 기록기 · `system_error` 기록기 · 주입된 `as_of` · **내용 저장소 포트** | — |
| **A** Registry | `comms`(등록부) | 시드 로더 · 주소 3상태 · **Contact Gate 6조건 + 개발 안전장치** · 실패 사유 5종 | F |
| **B** Communication | `comms` | 스레드·질문·메시지·구조화 값 주입(출처 포인터) · 초안 문장 포트 호출 · **숫자 검사** · 승인(멱등) · 무효화(내용 변경·계획 교체·사용자 취소·만료) · 상태 전이 | F, A |
| **B2** Outbox | `comms` + `channels` | Outbox 픽업 · **시도 행 선커밋** · 채널 호출 · 결과 1회 기록 · 재시도 분류 · **화해(`lookup_sent`)** · 매 재시도 재검사 · kill switch · 시뮬레이션 불일치 차단 | B, 채널 포트 |
| **C** Inbound | `intake/mailbox` + `channels` | `fetch_inbound(watermark)` · 원문 저장(내용 저장소) · 중복 제거 · 스레드 상관 · **발신자 → 등록부** · Quarantine · Q-44 시각 선택 · 지난 계획 판정(4.3) | F, A, B |
| **D** Extraction | `extraction`(Backend 쪽) + `ai/`(포트 구현) | 구조화 채널이면 AI 호출 없이 스키마 검증 · 비정형이면 추출 포트 · **검증기 7종** · `ask_id` → 대상·사실 키·범위(question_item 한 줄 조회) · 추출 기록 | C, B |
| **E** Event/State | `state`(결정론 엔진 + 저장) | 사건 append · **멱등 키** · Reconciliation subset · 현재 사실 6차원 · 충돌 · 확인 요청 · 사람 확인·처리 기록 · [지금도 맞음] | F (엔진은 순수 함수), D |

- **결정론 엔진은 순수 함수**다(ADR-029): Reconciliation · 숫자 검사 · Contact Gate 판정 · 검증기 · Q-44 시각 선택 · 멱등 키 재료 조립은 DB·네트워크·LLM 을 import 하지 않는다. 입력을 받아 결과를 돌려준다.
- `ai/` 는 **포트 구현만** 가진다. DB 연결·메일/채널 클라이언트·외부 운영 시스템 클라이언트가 없고, 허용되는 외부 호출은 **LLM 공급자 API 뿐**이다(`18` C 규칙 5, ADR-033).

---

## 7. AI 경계

### 7.1 포트 두 개 — 서로 다른 호출·스키마·프롬프트(`18` C 규칙 3)

| 포트 | 입력 | 출력 | Slice 1 구현 |
| --- | --- | --- | --- |
| **DraftWriter** (초안 문장) | 질문 목록·구조화 값·수신 역할·어조 | **문장만**(제목·본문) | **템플릿**(REAL). AI 구현은 Slice 3 |
| **ReplyExtractor** (회신 추출) | 질문 목록(`ask_id` · 질문 · 답 모양 · 단위 · 슬롯) + 회신 텍스트(데이터 블록) | `outcome` + `answers[{ask_id, slot, value, unit, evidence.quote}]` + `unmapped_statements` + `ambiguity_flags` (`18` D.3) | **녹화 재생**(REAL 포트, 준비된 응답). 실제 LLM 은 Slice 3 |

- 출력 스키마에 `entity_id` · `fact_key` · `source_role` · 강도 · 신뢰도 **자리가 없다**(스키마로 강제 — K.2 #7).
- 녹화 재생도 **같은 검증기**를 통과한다. 재생 응답에 일부러 "원문에 없는 인용", "단위 없음", "묻지 않은 값"을 넣어 방어선을 시험한다.
- 추출 표기는 Mock 이면 "SIMULATED — 녹화 재생 (LLM 미실행)"(`18` J.3). **사람이 쓴 값을 "LLM 추출"이라 부르지 않는다**(`01` 규칙 9).

### 7.2 AI 가 하지 않는 것 (`18` O 표의 굵은 — 칸)

수신자 신원 · 거래처 권한 · 최종 대상·사실 키 매핑 · 근거 강도 · 신뢰도 · 사건 확정 · 현재 상태 변경 · 비용 · 위험 · 솔버 · **직접 외부 발송** · 회신 결과 분류(M-6 — Backend 가 값 비교 + 강도 + 정책으로).

---

## 8. Channel Adapter

### 8.1 계약 (`18` J.1 그대로 — 새로 정하지 않는다)

```
ChannelAdapter
  capabilities()                 -> { threading, attachments, structured_reply, delivery_receipt, inbound_push }
  send(OutboundMessage)          -> { external_message_id, external_thread_id }   # X-CERA-Message 헤더 포함
  fetch_inbound(watermark)       -> [InboundRawMessage], next_watermark
  lookup_sent(cera_message_id)   -> external_message_id | None                    # 화해용
```

- `InboundRawMessage` 는 **원문 + 채널 메타**(`external_message_id` · `external_thread_id` · `In-Reply-To`/`References` · **`Date` 헤더 원문** · **채널 수신 시각**)를 준다 — Q-44 규칙의 입력.
- 어댑터가 `is_simulated` 를 **고정**한다. 호출자가 바꿀 수 없다(J.3).

### 8.2 Mock 채널 — 두 가지 선언

| 선언 | `structured_reply` | 상대 | 시험하는 것 |
| --- | --- | --- | --- |
| `MOCK_EMAIL` | `false` | 운송사 | 비정형 회신 → **추출 포트** → 검증기 |
| `MOCK_FORM` | `true` | ODCY | 구조화 회신 → **AI 호출 0회**(K.2 #6 · FR-STC-02) |

- 한 스레드는 한 채널로 고정된다(FR-COM-11 · J.3).
- Mock 은 시나리오 스크립트로 회신을 만들고, **장애를 주입**할 수 있어야 한다: 호출 도중 종료 · 응답 없음(`UNKNOWN`) · 일시 실패 · 영구 실패 · 반송 · 지연 도착(Q-44 과거 `Date`) · 미래 `Date` · 미등록 발신자 · 다른 주소 회신 · 전달 메일 · 중복 수신 · 스레드 밖 메일.
- `lookup_sent` 는 Mock 의 "보낸 편지함"을 조회한다 — 화해 로직이 Gmail 과 똑같이 시험된다.

### 8.3 완료 기준

> **"Gmail 이 붙었다"가 아니라, 채널이 Mock 이어도 승인 · 멱등 · 회신 · 사건 · 사람 확인 흐름이 끝까지 똑같이 작동한다.** Slice 2 는 어댑터 구현 하나를 바꾸는 일이어야 한다(NFR-30).

---

## 9. Frontend 연결 범위

### 9.1 원칙 — 유지한다

| 원칙 | 근거 |
| --- | --- |
| `CeraDataProvider` = **읽기 전용**, 기존 9개 메서드 유지 | ADR-028 결정 3 · `18` J.5 |
| 쓰기는 **`CeraCommandClient`** 로 따로 | ADR-028 결정 3 |
| 두 인터페이스 모두 mock / api 구현, `NEXT_PUBLIC_CERA_PROVIDER` 로 선택 | `18` J.5 |
| **MockProvider 가 계속 기본값** — 30대 시나리오 재생은 그대로 | FR-UI-20 · NFR-27 · K.2 #12 |
| 이 슬라이스의 endpoint 부터 **Backend OpenAPI 가 계약 정본**, TS 타입은 `packages/` 에 생성. 나머지 화면은 `cera.ts` 수기 계약 — **혼재 기간을 문서에 표시** | ADR-028 결정 4 |

### 9.2 실제로 Backend 에 연결하는 화면 행동

| 화면 행동 | 읽기 / 쓰기 | 연결 |
| --- | --- | --- |
| 스레드·메시지 목록·상세(원문 보기 · 시도 이력 · 실패 사유) | 읽기 | API |
| 초안 보기 · **숫자 검사 결과** | 읽기 | API |
| 초안 수정 · 폐기 | 쓰기 | CommandClient |
| **발송 승인** · 반려 · 승인 취소 | 쓰기 | CommandClient |
| 발송 상태 · 시도 횟수 | 읽기 | API |
| 회신 · **추출 후보(값 + 인용 나란히)** | 읽기 | API |
| 보류함(Quarantine — 미등록·다른 주소·전달·문의 없음·해독 불가) · **수동 연결** | 읽기 + 쓰기 | API + CommandClient |
| **"지난 계획 기준 회신" 표시**(보류가 아니다 — 사건은 정상 생성, 현재 계획에만 자동 반영 안 함) | 읽기 | API |
| 여러 후보 중 **사람이 값 고르기**(FR-XAI-13) | 읽기 + 쓰기 | API + CommandClient |
| 잠정/확정 **사실 배지**(자원 사실만) | 읽기 | API |
| **확인 큐 · 사람 확인 · 거절 · [지금도 맞음]** | 읽기 + 쓰기 | API + CommandClient |
| Activity Timeline(통신·사실·사람 행위) | 읽기 | API |
| 계획·위험·비용·지도·KPI·컨테이너 사실 | 읽기 | **시나리오 그대로**(`19` 14.1 · 24.4) — 화면이 "시뮬레이션"임을 계속 표시 |

### 9.3 프론트 트랙과의 경계

- `front/web/` 은 지금 **Antigravity 디자인 작업이 진행 중**이다(미커밋 12파일). 이 계획은 **계약과 순서만** 정하고, 프론트 구현(Phase 10)은 그 트랙과 겹치지 않는 시점에 한다.
- View Model 에 더할 필드(`18` J.5): `channel` · `is_real` · `failure` · `attempt_count` · `approval{by, at, hash}` · `extraction.model_ref`. 기존 `MessageStatus`(`DRAFT`·`SENT_SIMULATED`·`RECEIVED`)는 논리 모델 상태(`22` 15.8)와 **대응표**로 잇는다 — 시나리오 재생은 그대로 둔다.

---

## 10. Query · Command 계약 (URL 은 정하지 않는다)

### 10.1 Query (읽기)

| 이름 | 돌려주는 것 |
| --- | --- |
| `GetThreads(as_of, filter)` | 스레드 목록 · 상태 · 상대 · 채널 · 실제/가상 |
| `GetThread(thread_id)` | 메시지 · 질문 · 상태 전이 · 발송 시도 · 회신 · 추출 |
| `GetMessage(message_id)` | 제목·본문(**내용 저장소에서** — 파기됐으면 "파기됨") · 구조화 값 · 숫자 검사 결과 · 승인 사슬 · `content_hash` |
| `GetRawInput(raw_input_id)` | 안전한 텍스트 보기 · 지문 · 첨부 목록 · 부재 판정(보관 중 / 파기됨 / 손실) |
| `GetExtraction(extraction_id)` | 후보 · 인용 · 검증기 결과 · 검토 상태 |
| `GetHoldBox()` | Quarantine 항목 · 사유(지난 계획 기준 회신은 보류가 아니므로 여기 없다 — `GetThread` 의 표시) |
| `GetCurrentFact(entity, fact_key, scope)` | 현재 사실 · **6차원** · 이긴 사건 · 근거 |
| `GetVerificationQueue(as_of)` | 확인 요청 · 우선순위 · 막는 범위 · 처리 기록 |
| `GetContactEligibility(address_id)` | 6조건 · 막힌 사유(FR-ELG-04 · FR-UI-10) |
| `GetActivity(as_of)` | 사건 · 상태 전이 · 승인 · 사람 확인 · 감사(업무 타임라인 — `system_error` 는 섞지 않는다) |

### 10.2 Command (쓰기)

| 이름 | 효과 | 멱등 |
| --- | --- | --- |
| `CreateInquiryDraft(run_id, gap_ref, counterparty, address)` | 스레드·질문·메시지·구조화 값 · 숫자 검사 | 같은 (실행, gap, 주소)에 열린 초안이 있으면 그것을 돌려준다 |
| `RegenerateDraft(message_id)` · `EditDraft(message_id, text)` | **새 메시지**(내용 불변) + 숫자 재검사 | — |
| `DiscardDraft(message_id)` | 폐기 | 예 |
| `ApproveMessage(message_id, content_hash)` | 승인 행 + 사본 동결 | **예** — 같은 메시지 + 같은 지문이면 승인 하나(FR-APV-10) |
| `RejectMessage(message_id, reason)` · `RevokeApproval(approval_id, reason)` | 반려 / 무효화 행 | 예 |
| `SetKillSwitch(on/off)` | 실제 발송 차단 스위치 | 예 |
| `LinkHeldInbound(raw_input_id, thread_id)` | 보류 회신을 사람이 스레드에 연결 | 예 |
| `ChooseExtractionCandidate(extraction_id)` · `DismissExtractionCandidates(message_id, reason)` | **여러 후보 중 어느 것이 답인지 모를 때**(FR-XAI-13) 사람이 고르거나 모두 버림. 고른 값이 사건이 된다 | 예 |
| `ConfirmFact(target_event_ids, method)` · `RejectFact(...)` · `RevokeVerification(...)` | **`VERIFICATION` 사건** + 대상 + (요청 처리면) 처리 기록 | 예 — 사건 멱등 키 |
| `ReaffirmFact(entity, fact_key, scope, value)` | **[지금도 맞음]** — 사람 관측 사건(M-6 임시 동작) | 예 |
| `AcknowledgeVerificationRequest(request_key)` | 열람·배정 기록 | 예 |

Mock 전용(시험·시연): `SimulateInbound(script_step)` — Mock 채널에 회신을 넣는다. 운영 API 가 아니다.

### 10.3 공통 오류 응답 (`docs/23` 12절)

모든 실패는 `{ code, message, request_id }` 모양이다. 스택·내부 경로를 돌려주지 않는다.

| 코드 | 언제 | 출처 |
| --- | --- | --- |
| `CONTENT_CHANGED` (409) | 승인 요청의 지문이 지금 내용과 다름 | `18` I.3 |
| `PLAN_SUPERSEDED` (409) | 계획이 교체된 메시지 | 같음 |
| `ALREADY_SENT` (409) | 이미 보낸 메시지 취소 | 같음 |
| `NUMBER_CHECK_FAILED` (422) | 숫자 검사 실패 초안 승인 시도 | `18` D.2 (`BLOCKED_NUMBER_CHECK`) |
| `RECIPIENT_NOT_ELIGIBLE` (403) + `NOT_VERIFIED`·`NOT_APPROVED`·`NOT_ACTIVE`·`COUNTERPARTY_INACTIVE` | Contact Gate | `18` D.5 |
| `NOT_IN_TEST_ALLOWLIST` (403) | 개발 안전장치 | `18` G.5 |
| `SIMULATION_MISMATCH` (409) | 가상 메시지를 실채널로 | `18` J.3 |
| `SENDING_PAUSED` (409) | kill switch 꺼짐 | FR-SND-12 |
| `CHANNEL_DISCONNECTED` (503) | 연동 끊김(Slice 2) | `18` I.3 |

**Q-66 오류 코드 초안**(`system_error.error_code`, 확정 아님): `CHANNEL_TIMEOUT` · `CHANNEL_RATE_LIMITED` · `CHANNEL_SERVER_ERROR` · `CHANNEL_RESPONSE_INVALID` · `EXTRACTION_PROVIDER_FAILED` · `EXTRACTION_OUTPUT_INVALID` · `CONTENT_MISSING`(부재 + 파기 감사 없음) · `CONTENT_PURGE_MISMATCH`(감사 성공 + 내용 남음) · `INBOUND_WATERMARK_EXPIRED` · `OUTBOX_JOB_FAILED`. Slice 2 에서 채널 접두어(`GMAIL_`)를 붙인다(`docs/23` 6.2).

---

## 11. 구현 Phase

> **Phase 0 은 Backend 결정(Q-64) · DB 결정(Q-68) · T-080(P0 물리 설계) 뒤에 시작한다.** 솔버 위치(Q-65)는 기다리지 않는다. 각 Phase 는 한 번의 Coding Agent 작업 단위이고, 끝날 때마다 Claude/Codex 검토 → 사용자 승인 → commit 이다(`docs/17`).

### 11.0 Phase 0 — Backend 뼈대 (**T-003 을 흡수**)

- 입력: 결정된 Backend·DB 기술 · T-080 결과
- 구현: `back/`·`ai/` 프로젝트 · 설정(`CERA_COMMS_MODE=mock` · `CERA_LLM_MODE=replay` · `CERA_TEST_RECIPIENT_ALLOWLIST` · kill switch) · `.env.example` · **주입 가능한 시계(`as_of`)** · 세 경계 공통 오류 처리 · 구조화 로그 · `request_id`/`trace_id` · 테스트 러너 · OpenAPI 생성 뼈대 · `AGENTS.md` 6절 명령
- 테스트: 오류 경계가 `{code, message, request_id}` 를 돌려준다 · 시계를 주입한다 · 로그에 비밀값이 없다
- 완료: 빈 API 가 뜨고 테스트가 돈다. **T-003 을 선행 태스크로 따로 두지 않는다** — 기술 결정 없이 뼈대를 만들 수 없고, 뼈대의 모양은 이 계획이 정한다

### 11.1 Phase 1 — P0 저장소 + 시드 + 감사·오류 기록기 + 내용 저장소 포트

- 입력: T-080 의 P0 29개 물리 설계
- 구현: 29개 표 마이그레이션 · 저장소 계층 · **시드 로더**(시나리오 팩을 **읽기만** 해서 거래처 2곳·연락처·주소·시설·차량 풀·스냅샷·실행 1개·`SYSTEM`/운영자 actor·scenario 행) · 감사 기록기 · `system_error` 기록기 · **내용 저장소 포트(put/get/purge) + 부재 판정(29.8.1)**
- 테스트: 불변 표에 UPDATE·DELETE 경로 없음 · 시드가 `is_simulated = true` · 내용 put→get→purge→"파기됨" · **감사 없는 부재 → `system_error`(`CONTENT_MISSING`)** · 감사 성공 + 내용 남음 → `CONTENT_PURGE_MISMATCH`
- 완료: 시드된 세계가 DB 에 있고 조회된다

### 11.2 Phase 2 — Registry + Contact Gate

- 구현: 주소 3상태 조회 · **6조건 판정(순수 함수)** · 실패 사유 5종 · 개발 안전장치 · 판정 결과 조회(Query)
- 테스트: 네 가지 게이트 실패 각각(K.2 #4) · 안전장치 밖 주소(K.2 #5) · 판정에 AI 없음
- 완료: `GetContactEligibility` 가 막힌 이유를 구분해 돌려준다

### 11.3 Phase 3 — 초안 · 구조화 값 · 숫자 검사

- 구현: `CreateInquiryDraft` · 질문 항목(대상 개체·사실 키·**범위를 Backend 가 확정**) · 구조화 값 주입(출처 = 실행 + gap 경로) · DraftWriter 템플릿 · **숫자 검사(순수 함수)** · 수정·재생성은 새 메시지 · 내용은 내용 저장소
- 테스트: 본문 숫자가 구조화 값 밖이면 `BLOCKED_NUMBER_CHECK` · 출처 없는 값 제외 · 수정 후 재검사 · AI 없이 초안 생성
- 완료: 승인 화면에 올라갈 수 있는 초안만 `PENDING_APPROVAL`

### 11.4 Phase 4 — 승인 · 무효화

- 구현: `ApproveMessage`(멱등) · 승인 사본 동결(문장 참조 + 구조화 값 사본 + 지문 + 수신자) · 승인 시 Contact Gate · 무효화 행(내용 변경 · **계획 교체** · 사용자 취소) · 만료(`expires_at`) · 유효한 승인 **여섯 조건 조회**
- 테스트: 같은 요청 두 번 → 승인 1건 · 승인 뒤 내용 변경 → 새 메시지 + 옛 승인 `INVALIDATED(CONTENT_CHANGED)` · 수신자 변경 → 재승인 · **새 실행(같은 맥락)이 생기면 미발송 승인 `INVALIDATED(PLAN_SUPERSEDED)`**(K.2 #10) · 만료 → 발송 불가
- 완료: "유효한 승인"이 조회 하나로 판정된다

### 11.5 Phase 5 — Outbox · Mock 발송 · 멱등 · 화해 (**J.4 2단계의 핵심**)

- 구현: Outbox 픽업(`QUEUED`) · 매 시도 전 재검사(게이트·안전장치·승인 지문·계획 유효성) · **시도 행 선커밋** · Mock `send`(헤더 `X-CERA-Message`) · 결과 1회 기록 · 재시도 분류(일시/인증/영구/정책/반송) · 백오프 · **재기동 시 결과 없는 시도 → `lookup_sent` 먼저** · kill switch · 시뮬레이션 불일치 차단 · Outbox 작업에 `trace_id` 전달
- 테스트: 승인 없는 발송 경로 없음(K.2 #3 — 코드 경로 전수) · **호출 중 강제 종료 → 재기동 → 중복 0**(K.2 #2 · NFR-22) · 결과 `UNKNOWN` → 화해로 `SUCCESS` · 일시 실패 재시도 · 영구 실패 재시도 금지 · kill switch 꺼짐 → 승인은 되고 발송 대기
- 완료: 한 승인 = 한 번 발송이 장애 주입 아래서도 성립

### 11.6 Phase 6 — 수신 · 원문 · 발신자 매핑

- 구현: `fetch_inbound(watermark)` 폴링 작업 · 원문 → 내용 저장소 + `raw_input` · **중복 수신 제거**(외부 id UNIQUE) · 스레드 상관(`In-Reply-To`/`References`) · **CERA 스레드 밖 메일은 저장하지 않음** · 발신자 → 주소 → 연락처 → 거래처(등록부) · Quarantine(미등록 · 다른 주소 · 전달 · 스레드 불일치) · **Q-44 시각 선택**(두 시각 → `payload`) · **지난 계획 판정(4.3)** · 빈 본문·자동 회신은 추출 없이 저장
- 테스트: 스레드 밖 메일 미수집(K.2 #8) · 같은 회신 두 번 → 1번 처리 · 미등록 발신자 → 보류, 사실 없음 · 미래 `Date` → 채널 수신 시각 + 거부 사유 · 지연 도착 → `Date` 유지
- 완료: 모든 회신이 "처리 대상" 또는 "보류(사유)" 중 하나로 떨어진다

### 11.7 Phase 7 — 추출 · 검증기

- 구현: 구조화 채널이면 **AI 호출 없이** 스키마 검증 · 비정형이면 ReplyExtractor(녹화 재생) · 추출 기록(인용은 내용 참조 + 지문, 검증기 결과) · **검증기 7종**(스키마 · 인용 원문 대조 · 수량·시각·단위 · 스레드 문맥 · 발신자 등록부 · 모호 표현 · 거절/실패) · `ask_id` → question_item 한 줄로 대상·사실 키·범위 · 묻지 않은 주장은 `unmapped_statements` · 입력 신뢰도(HIGH/MEDIUM/LOW + 사유)
- 테스트: 구조화 채널에서 추출 포트 호출 0회(K.2 #6) · 출력에 내부 식별자 없음(K.2 #7) · **원문에 없는 인용 → 값 탈락**(K.2 #11) · 틀린 숫자·단위 없음 → 탈락 · 모호 표현 → LOW + 확인 요청 · 프롬프트 인젝션 회신 fixture
- 완료: 통과한 후보만 사건 후보가 된다

### 11.8 Phase 8 — 사건 · Reconciliation subset · 현재 사실

- 구현: 사건 append(부류 · 유형 · 출처 3축 · 신뢰도 · 멱등 키 · 스키마 판 · 업무 상관 id = 스레드) · 주체 링크 1건 · 추출 검토 `ACCEPTED` + `created_event_id` · **Reconciliation subset(8.3 규칙표)** · 현재 사실 6차원 · 충돌 · 확인 요청(V3·V4·V9) · 최소 정정 쓰기 경로
- 테스트: 같은 회신 재처리 → 사건 수 불변(NFR-23 · I-25) · **회신만으로 CONFIRMED 불가 — PROVISIONAL + 확인 요청**(K.2 #9) · 불리한 큰 감소 → `HELD`(R10) + `APPROVAL_BLOCKED` · 지난 시간창 → `EXPIRED` · `canonical_fact` 전부 지우고 재계산 → 동일(I-7)
- 완료: 회신 한 통이 잠정 사실과 확인 요청으로 끝난다

**Slice 1 의 Reconciliation 규칙**(`18` F.5 의 부분집합 — 새 규칙 없음, `18` N.3)

| 쓴다 | 쓰지 않는다(이번 범위) |
| --- | --- |
| R1 · R2 · R3 · R4-a · R4-b · R4-d · R6 · R10 · R11 | R5(마일스톤) · R7(교차 사실) · R8(추정) · R9(정정 — 최소 경로만) |

### 11.9 Phase 9 — 사람 확인 · [지금도 맞음]

- 구현: `ConfirmFact`/`RejectFact`/`RevokeVerification` → `VERIFICATION` 사건 + 확인 대상(**한 확인 = 한 좌표**, I-26) + 요청 처리면 처리 기록(둘 다 남는다) · 재계산 → CONFIRMED · `verification_basis = HUMAN_VERIFICATION` · `ReaffirmFact`(사람 관측 사건 — M-6 임시 동작) · 여러 후보 중 선택(FR-XAI-13)
- 테스트: **확인 사건이 현재 사실을 바꾼다** · 좌표가 다른 대상 섞기 거부 · 요청 처리와 확인 사건이 각각 남는다 · 계획 승인은 사실을 CONFIRMED 로 올리지 않는다(I-22 — 이 Slice 에 계획 승인은 없지만 경로가 없음을 확인)
- 완료: 잠정 → 사람 확인 → 확정이 화면까지 간다

### 11.10 Phase 10 — API 계약 · 프론트 연결

- 구현: OpenAPI(이 슬라이스 endpoint) · `packages/` 타입 생성 · `ApiProvider`(통신·확인 큐·Data Trust·타임라인·자원 사실만) · `CeraCommandClient`(mock/api) · 9.2 의 화면 행동 · 실제/가상 배지 · 혼재 기간 표시
- 테스트: 생성 계약 = 실제 응답(NFR-28) · **MockProvider 기본값으로 30대 시나리오 재생 통과**(K.2 #12) · `validate:scenario` · `typecheck` · `lint` · `build` · `smoke`
- 완료: 운영자가 화면에서 승인·확인을 누르면 Backend 에 기록된다
- **주의**: 프론트 트랙(Antigravity 디자인 작업)이 끝난 뒤 시작한다. `data/scenarios/` 는 수정하지 않는다(`18` N.4)

### 11.11 Phase 11 — Slice 1 인수 시험

- 15절 DoD 전체를 시나리오 시험으로 돈다. 두 상대(운송사 비정형 · ODCY 구조화)로 루프 완주 · 장애 주입 전 종류 · 감사로 전체 추적

### 11.12 Phase 순서와 병렬

```
0 → 1 → 2 → 3 → 4 → 5 ─┐
                 │       ├→ 8 → 9 → 10 → 11
                 └→ 6 → 7┘
```

- 5(Outbox)와 6~7(수신·추출)은 **4 뒤에 병렬** 가능하다 — Mock 이 회신을 직접 넣을 수 있기 때문이다.
- 8 의 **엔진(순수 함수)** 은 1 뒤 언제든 먼저 시험할 수 있다(입력 = 사건 목록).

### 11.13 Slice 2 골격 — Tech Validation (착수 전 별도 계획 보강)

거래처·연락처·주소 등록·수정·비활성화(FR-CPY 쓰기 · 감사) · 주소 확인 메일(FR-EVF 전부 · 토큰 해시·72h `[ASSUMPTION]`·1회용·재발송 무효화 · 공개 확인 링크) → `contact_verification`·`channel_connection` · Gmail OAuth(설치형 앱 루프백 · `gmail.send`+`gmail.readonly` · 전용 계정 · `label:CERA`) · `format=raw` · `history_id` 워터마크·만료 복구 · 실제 왕복 · **실제 발송은 (1) Contact Gate (2) 개발 안전장치 (3) "승인 없는 발송 경로 없음" 시험이 모두 통과한 뒤에만 켠다**(`18` N.4) · 요율 회신(`commercial_offer`) · 최대 보관일 · 반송 처리 · `internalDate` 의미 확인(`[TO VERIFY]`).

### 11.14 Slice 3 골격 — 실제 추출

`ai/` 에 실제 LLM 구현 · 녹화 재생 병행 · 프롬프트 판 관리 · 평가 세트(T-034 · T-049 와 경계) · `validate:scenario` 금지 표현 검사 보정 · 비용·시간 상한(FR-XAI-11).

---

## 12. 트랜잭션 경계

| # | 경계 | 한 트랜잭션에 묶는 것 | 주의 |
| --- | --- | --- | --- |
| T1 | 초안 생성 | 스레드 · 질문 · 메시지 · 구조화 값 · 메시지↔질문 · 상태 `DRAFTED`/`PENDING_APPROVAL` · 감사 | **내용 객체를 먼저 저장**하고 행을 커밋한다. 행 없는 내용(고아)은 허용, **내용 없는 행은 금지** |
| T2 | 승인 | 승인 행 · 승인 구조화 사본 · 승인 문장 참조 · 상태 `APPROVED` · 감사 | 승인 문장 내용 객체는 먼저 저장 |
| T3 | 무효화 | 무효화 행 · 상태 전이 · 감사 | 계획 교체는 **새 실행 등록과 같은 트랜잭션**에서 미발송 승인을 무효화한다 |
| T4 | 발송 준비 | 상태 `QUEUED`(게이트 통과 시) | |
| T5 | **발송 시도 선커밋** | 시도 행(`result` 비어 있음) | **외부 호출 전에 커밋.** 이 경계가 중복 방지의 전제 |
| T6 | 발송 결과 | 시도 결과 5컬럼(1회) · 상태 `SENT`/`DELIVERY_FAILED` · 감사 · (필요하면) `system_error` | 호출 뒤 별도 트랜잭션 |
| T7 | 수신 | 원문 기록 · 메시지(INBOUND) · 스레드 연결 또는 보류 | 원문 내용 먼저 저장. 중복이면 UNIQUE 에 걸려 전체 무시 |
| T8 | 추출 | 추출 기록(들) · 인용 내용 참조 | 추출 포트 호출은 트랜잭션 **밖** |
| T9 | 사건 생성 | 사건 · 주체 링크 · 추출 검토 `ACCEPTED` | 사건 멱등 키 충돌이면 전체 무시(로그만) |
| T10 | 재계산 | 현재 사실 · 충돌 · 확인 요청(파생 덮어쓰기) | 파생이라 **재실행 가능**. T9 와 분리해도 된다 |
| T11 | 사람 확인 | `VERIFICATION` 사건 · 확인 대상 · (요청 처리면) 처리 기록 · 감사 | 그다음 T10 |
| T12 | 파기(시험 명령) | 내용 제거 **확인 뒤** 감사 `CONTENT_PURGED`·`SUCCESS` | 기록 행은 건드리지 않는다(29.8.1) |

---

## 13. 멱등 경계

| 무엇 | 장치 | 같은 요청이 두 번 오면 |
| --- | --- | --- |
| 초안 생성 | (실행, gap, 주소)의 열린 초안 | 기존 초안 |
| **승인** | (메시지, 지문) | 승인 1건(FR-APV-10) |
| 무효화 | `invalidates_approval_id` 부분 유일 | 무효화 1건(I-17) |
| **발송** | `send_attempt.idempotency_key` UNIQUE(채널 + 메시지 + 지문 + 승인) **+ 재시도 전 `lookup_sent`** | 두 번 나가지 않는다. **멱등 키만으로는 부족하다** — 채널에 멱등 개념이 없으므로 조회가 핵심(`18` H.2) |
| 수신 | `comm_message`(채널, 외부 id) UNIQUE · `raw_input`(출처, 전달 키) UNIQUE | 한 번만 처리 |
| 사건 | `event.idempotency_key` UNIQUE(원천 · 주체 · 사실 키 · **범위** · 부류 · **주장 위치**) | 사건 수 불변(NFR-23) |
| 사람 확인 | 확인 사건의 멱등 키(대상 사건 집합) | 확인 1건 |
| 확인 요청 | `request_key` UNIQUE | 재계산해도 같은 요청 |
| 추출 | **멱등이 아니다** — 다시 추출하면 새 행 + 이전 행 `SUPERSEDED` | 사건은 사건 멱등 키가 막는다 |

**물리 형식(직렬화·해시 알고리즘·주장 위치 형식)은 T-080.**

---

## 14. 테스트 전략

### 14.1 층

| 층 | 대상 | 도구 조건 |
| --- | --- | --- |
| **Unit** | 순수 함수: Contact Gate · 숫자 검사 · 검증기 · Q-44 시각 선택 · 멱등 키 재료 · Reconciliation subset · 부재 판정 | DB·네트워크 없이 |
| **Integration** | 트랜잭션 경계 · UNIQUE · 불변 규칙 · Outbox + Mock 채널 · 수신 · 내용 저장소 | 격리된 DB, 주입된 시계 |
| **Scenario / Acceptance** | 두 상대 루프 완주 · 장애 주입 · 화면 연결 · 30대 시나리오 재생 | Mock 채널 스크립트 + 녹화 재생 |

### 14.2 필수 시험 목록 (사용자 지정 + 정본)

| ID | 시험 | 층 | Phase |
| --- | --- | --- | --- |
| A-01 | 승인 없는 업무 메시지 발송 경로 없음 | Acceptance(+정적 경로 점검) | 5 |
| A-02 | 승인 뒤 내용 변경 → 발송 불가, 새 메시지 재승인 | Integration | 4 |
| A-03 | **옛 계획 메시지 차단**(새 실행 → `PLAN_SUPERSEDED`) | Integration | 4 |
| A-04 | 수신자 변경 → 재승인 | Integration | 4 |
| A-05 | 승인 만료 → 발송 불가 | Integration | 4 |
| A-06 | 같은 승인 요청 두 번 → 승인 1건 | Integration | 4 |
| S-01 | **중복 발송 차단** | Integration | 5 |
| S-02 | **발송 중 재기동**(시도 선커밋 뒤 강제 종료) → 화해 → 중복 0 | Acceptance | 5 |
| S-03 | 결과 `UNKNOWN` → `lookup_sent` → `SUCCESS` | Integration | 5 |
| S-04 | 영구 실패 재시도 금지 · 일시 실패 백오프 | Integration | 5 |
| S-05 | kill switch 꺼짐 → 승인 가능, 발송 대기 | Integration | 5 |
| G-01~04 | Contact Gate 실패 4종 각각 | Unit | 2 |
| G-05 | 개발 안전장치 밖 → 차단 | Unit | 2 |
| G-06 | **가상(시드 등록부·시나리오) 메시지는 실채널로 나갈 수 없다** — 시험용으로 **"실채널"을 선언한 어댑터**(`is_simulated = false` 고정)에 넘기면 Dispatcher 가 `SIMULATION_MISMATCH` 로 막고 **외부 호출 0회**. Gmail 없이 시험한다 | Integration + **Acceptance** | 5 · 11 |
| G-07 | 반대 방향: 실채널 선언 어댑터의 수신은 `is_simulated = false` 로 고정되고 호출자가 바꿀 수 없다(FR-SND-13 · J.3) | Integration | 6 |
| I-01 | 회신 원문 보존·재파싱 가능 | Integration | 6 |
| I-02 | 스레드 밖 메일 미수집 | Integration | 6 |
| I-03 | **미등록 발신자 → 보류, 사실 없음** | Acceptance | 6 |
| I-04 | 같은 회신 두 번 → 1번 처리 | Integration | 6 |
| I-05 | 미래 `Date` → 채널 수신 시각 + 거부 사유 / 지연 `Date` 유지 | Unit | 6 |
| I-06 | **지난 계획 기준 회신**(같은 사고의 Run 1 문의 · 현재 Run 3): 사건 정상 생성 · **현재 사실 후보로 정상 판정**(같은 뿌리) · 지난 시간창이면 `EXPIRED` · **현재 문의의 답으로 연결되지 않음 · 재계산 실행이 생기지 않음 · 기존 실행·스냅샷 불변** · "지난 계획 기준" 표시(4.3 A~F) | Acceptance | 6·8 |
| I-07 | 정상 회신: 검증 통과 값이 **사람 승인 없이 사건이 되고**, 현재 사실은 PROVISIONAL(또는 OBSERVED) — 사람 확인은 그 뒤 | Acceptance | 8 |
| X-01 | **틀린 숫자 추출 탈락** | Unit | 7 |
| X-02 | **인용 불일치 → 값 탈락** | Unit | 7 |
| X-03 | 구조화 채널 → 추출 포트 호출 0회 | Integration | 7 |
| X-04 | 추출 출력에 내부 식별자·권한·신뢰도 없음(스키마) | Unit | 7 |
| X-05 | 프롬프트 인젝션 회신 → 지시 무시 | Unit | 7 |
| E-01 | 같은 회신 재처리 → 사건 수 불변 | Integration | 8 |
| E-02 | 범위가 다른 두 주장 → 서로 다른 사건·사실·충돌 없음 | Unit | 8 |
| E-03 | **회신 하나만으로 CONFIRMED 불가** | Acceptance | 8 |
| E-04 | 불리한 큰 감소 → `HELD` + `APPROVAL_BLOCKED` | Unit | 8 |
| E-05 | `canonical_fact` 삭제 후 재계산 → 동일(I-7) | Integration | 8 |
| V-01 | **사람 확인 사건이 현재 사실을 바꾼다** | Acceptance | 9 |
| V-02 | 좌표가 다른 대상 섞기 거부(I-26) | Unit | 9 |
| V-03 | 요청 처리 기록과 확인 사건이 각각 남는다 | Integration | 9 |
| C-01 | **이미 파기된 내용 → "파기됨"으로 보인다** | Integration | 1 |
| C-02 | **감사 없는 내용 부재 → `system_error`(`CONTENT_MISSING`)** | Integration | 1 |
| C-03 | 파기가 기록·참조·지문을 바꾸지 않는다 | Integration | 1 |
| R-01 | 오류 응답이 `{code, message, request_id}` · 로그·감사에 비밀 없음 | Integration | 0 |
| F-01 | **30대 시나리오 재생(MockProvider) 통과** | Acceptance | 10 |

### 14.3 `docs/18` K.2 성공 판정 → 시험

> **`docs/18` 에는 성공 판정이 12개 있다.** N.2 #13 과 QUEUE 의 T-069 완료 조건은 "13개"라고 적었지만 K.2 목록 자체는 12개다(19절 정본 불일치 1).

| K.2 | 판정 | 시험 | Slice |
| --- | --- | --- | --- |
| 1 | 실제 Gmail 2계정 사이 루프 완주 | Mock 으로는 **Phase 11 루프 완주**, 실제는 Slice 2 | 1 → **2** |
| 2 | 같은 승인으로 두 번 안 나감(강제 종료 포함) | S-01 · S-02 | **1** |
| 3 | 승인 없는 발송 경로 없음 | A-01 | **1** |
| 4 | 게이트 실패 4종 | G-01~04 | **1** |
| 5 | 개발 안전장치 | G-05 | **1** |
| 6 | 구조화 채널 LLM 미호출 | X-03 | **1** |
| 7 | LLM 출력에 내부 식별자·강도 없음 | X-04 | **1**(스키마) · 3(실제 LLM) |
| 8 | CERA 스레드 밖 메일 미수집 | I-02 | **1** · 2(Gmail `label`) |
| 9 | 회신이 CONFIRMED 를 만들지 않음 | E-03 | **1** |
| 10 | 계획 교체 → 미발송 승인 자동 취소 | A-03 | **1** |
| 11 | 원문에 없는 근거 → 반영 안 됨 | X-02 | **1** |
| 12 | 30대 시나리오 재생 통과 | F-01 | **1** |

### 14.4 `docs/19` 20절 체크리스트 34개 → Slice

| Slice | 닫히는 항목 |
| --- | --- |
| **Slice 1** | 7 · 8 · 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16(Mock) · 17 · 18(스위치) · 20 · 21 · 22 · 23(녹화) · 24 · 25 · 26 · 27 · 28 · 29 · 30 · 31 · 32 · 33 · 34 |
| **Slice 2** | **1 · 2**(거래처·연락처 등록 — FR-CPY 쓰기) · **3 · 4 · 5**(주소 확인 메일) · **6**(관계 승인) · **16·18 실채널** · **19**(실제 회신) |

> Slice 1 은 등록부를 **시드**로 채우고 조회·판정만 한다. 등록·수정·비활성화 명령(FR-CPY)은 확인 메일 흐름과 함께 Slice 2 에서 만든다 — 확인 없이 주소를 쓸 수 없으므로 둘은 한 묶음이다.
| **Slice 3** | 23 의 실제 LLM 추출 |

---

## 15. Slice 1 완료 조건 (Definition of Done) — 19항목

1. Mock 채널 **두 상대**(운송사 비정형 · ODCY 구조화)로 초안 → 승인 → 발송 → 회신 → 추출 → 사건 → 잠정 사실 → 사람 확인 → 확정 사실 루프가 **끝까지** 돈다
2. 승인 없는 업무 메시지 발송 경로가 **없음을 시험이 증명**한다
3. 같은 메시지는 **한 번만** 나간다 — 강제 종료·재기동을 섞어도
4. 결과를 모르는 발송은 **재전송 전에 조회로 화해**한다
5. 승인 뒤 내용·수신자가 바뀌거나 **계획이 교체되면** 발송되지 않는다
6. Contact Gate 실패 사유 4종 + 개발 안전장치가 각각 막고 **이유가 보인다**
7. 숫자 검사를 통과하지 못한 초안은 **승인 화면에 오르지 않는다**
8. 미등록 발신자·다른 주소·스레드 불일치 회신은 **보류**되고 사실이 되지 않는다
9. CERA 스레드 밖 메일은 **저장되지 않는다**
10. 구조화 회신에서 **AI 호출이 0회**다
11. 원문에 없는 인용·틀린 숫자·단위 없는 값은 **반영되지 않는다**
12. 회신 하나로 사실이 **CONFIRMED 가 되지 않는다** — PROVISIONAL + 확인 요청
13. **사람 확인 뒤** 현재 사실이 재계산돼 CONFIRMED 가 되고 화면에 반영된다
14. 지난 계획 기준 회신은 **사건과 근거는 남되 현재 계획에 자동 반영되지 않는다** — 현재 문의의 답이 되지 않고 재계산 계기가 되지 않으며 "지난 계획 기준"으로 표시된다. 사건을 막는 새 승인 단계는 없다
15. 같은 회신을 두 번 처리해도 **사건·상태가 같다**
16. 내용 부재는 **파기 감사가 있을 때만 "파기됨"**, 없으면 `system_error`
17. 감사·Activity 로 흐름 전체를 **추적**할 수 있고, 감사·로그에 **비밀·본문이 없다**
18. **기존 30대 시나리오 재생이 깨지지 않는다** — 계획·위험·비용은 계속 "시뮬레이션"으로 보인다
19. **시드된(가상) 연락처·시나리오 데이터는 어떤 경로로도 실채널로 나가지 않는다** — 실채널을 선언한 시험용 어댑터로 증명한다(G-06). Slice 2 에서 Gmail 을 켜기 전의 안전 조건이다

---

## 16. 기술 결정에 필요한 조건 (선택은 하지 않는다)

### 16.1 Backend 가 필요로 하는 것

| 조건 | 왜 |
| --- | --- |
| 트랜잭션 제어(명시적 경계) | 12절 T1~T12, 특히 **T5 선커밋** |
| 백그라운드 작업 · 재시도 · 스케줄(Outbox · 수신 폴링) · 단일 워커 보장 | Phase 5·6 |
| 순수 함수 모듈 분리(엔진이 저장·네트워크를 import 하지 않게) | ADR-029 |
| 구조화 출력 스키마 검증(JSON Schema 급) | 추출 계약 · 시험 X-04 |
| OpenAPI 생성 → TypeScript 타입 파이프라인 | ADR-028 결정 4 |
| 공통 예외 처리 · 구조화 로그 · 추적 id 전파(비동기 작업까지) | `docs/23` |
| 시계 주입 · 시험 격리 · 강제 종료/재기동 시험이 쉬움 | 시험 S-02 |
| 원 단위 정수·Asia/Seoul 시각을 안전하게 다룸 | `01` 규칙 7 |

### 16.2 DB 가 필요로 하는 것

| 조건 | 왜 |
| --- | --- |
| 관계 무결성(FK) · UNIQUE · **부분 유일 제약** | I-8 · I-17 · 17.2 목록 |
| 트랜잭션(ACID) · 동시성 제어 | 승인 멱등 · Outbox |
| **UPDATE·DELETE 금지를 강제하거나 쉽게 막는 수단** | append-only 표 |
| JSON 저장 | `payload` · 신뢰도 사유 · 검증기 결과 |
| **타임존이 있는 시각** | 모든 시각 |
| 로컬 개발 편의 + 운영 이전 경로 | Slice 1 은 로컬, Pilot 이후 운영 |
| 마이그레이션 도구 | T-080 |
| (내용 저장소) 행 밖 내용의 저장·삭제 | `22` 29절 |

### 16.3 Q-64 · Q-68 (· Q-65) 을 고를 때 쓸 평가 기준

| 기준 | 비중 판단에 쓸 질문 |
| --- | --- |
| Slice 1 적합도 | 위 16.1 조건을 **추가 라이브러리 없이** 얼마나 채우나 |
| 1인 개발 문맥 전환 | 프론트(TypeScript)와 언어가 같은가 |
| 트랜잭션·Outbox 패턴 성숙도 | 선커밋·재시도·단일 워커를 검증된 방식으로 쓰나 |
| 계약 생성 | OpenAPI → TS 타입이 매끄러운가 |
| **솔버 경로(Q-65)** | 나중에 최적화를 어디서 돌리나 — Slice 1 은 솔버가 **필요 없으므로 막지 않는다**(`docs/23` 3.3) |
| DB 로컬 → 운영 이전 | 같은 방언으로 이어지나 |
| 사용자 실무 경험 · 포트폴리오 목표 | `docs/23` 3.2 |

---

### 16.4 결정 순서와 T-080 의 선행조건

```
T-069 승인
  → Q-64  Backend 언어·프레임워크            (사용자)
  → Q-68  DB 제품 · 접근 방식 · 마이그레이션 도구 (사용자 — Backend 와 맞물린다)
  → T-080 P0 29개 물리 설계                   (결정된 기술 위에서)
  → Phase 0 Backend 뼈대 · Phase 1 마이그레이션
```

| 결정 | T-080 을 막나 | 왜 |
| --- | --- | --- |
| **Q-64** Backend | ~~막는다~~ **해소 (2026-09-21, ADR-033 — NestJS + TypeScript)** | 접근 방식·마이그레이션 도구·트랜잭션 표현이 언어에 따라 갈린다 — 이제 TypeScript 위에서 Q-68 을 고른다 |
| **Q-68** DB | **막는다** | 물리 타입(시각·JSON·해시) · 부분 유일 제약 · append-only 강제 방식이 **제품마다 다르다**. 물리 설계는 제품 없이 쓸 수 없다 |
| Q-65 솔버 | 막지 않는다 | Slice 1 은 솔버가 없다. `recovery_run` 은 시드다(`docs/23` 3.3) |

> **DB 선택은 지금까지 Open Question 번호가 없었다.** ADR-004(SQLite → PostgreSQL, **Proposed**)와 `docs/23` 2절·13절의 "미결 — T-069 뒤 사용자가 Backend 와 함께 결정"에만 있었고, 여러 곳에서 "Backend·DB 결정(Q-64·Q-65)"으로 묶여 적혔는데 **Q-65 는 솔버**다. 그래서 **Q-68 을 새로 등록**했다(`docs/15`). 특정 DB 제품은 고르지 않았다.

## 17. T-080 으로 넘기는 것

- **P0 29개 표의 물리 설계**(논리 컬럼 전부) — P1·DEFERRED 는 이번에 물리 설계하지 않는다
- 17.2 의 UNIQUE · **부분 유일 제약** 표현(I-8 · I-17 · 해제 부분 유일) · 다형 참조 검사 방식
- **append-only 강제 방식**
- `event_id` 형식(정렬 가능) · **`idempotency_key` 직렬화·해시·주장 위치 형식** · **`schema_version` 형식** · 코드값 물리 표현
- `input_confidence_reasons` · `validator_result` · `payload` JSON 구조 세부
- **보관 관리 내용 저장소의 물리 위치**와 참조 형식
- 시각 타입 · 금액 타입 · 인덱스(조회 10.1 기준)
- `request_id` · `trace_id` 헤더 이름·형식(`docs/23` 13절)
- L13-5 의 뿌리 실행 id 물리 복사 여부

**T-080 에서 하지 않는 것**: 기술 선택(그 전에 사용자가 Q-64 · Q-68 을 정한다) · P1/DEFERRED 표.

---

## 18. `docs/18` N.2 의 15가지에 대한 답

| # | 질문 | 답 |
| --- | --- | --- |
| 1 | Backend 기술 뼈대 · T-003 | **T-003 을 Phase 0 으로 흡수**한다. 언어(Q-64)는 **결정 — NestJS + TypeScript(ADR-033, 2026-09-21)**. DB(Q-68)는 사용자 결정(16.3 기준 · 16.4 순서) |
| 2 | 최소 DB 스키마 | **P0 29개**(5.1) → T-080 |
| 3 | 거래처·연락처·검증 모델 · Q-48 | 표는 `22` 10절 그대로. **Q-48(개인/공용 메일함)은 지금 넣지 않는다** — `19` 4.3 이 "첫 구현은 구분 없이"로 정했다. 확인 토큰은 Slice 2 |
| 4 | Gmail OAuth·어댑터 | **Slice 2**(11.13). Slice 1 은 같은 포트의 Mock |
| 5 | Outbox·멱등 | Phase 5 — 시도 선커밋 · `lookup_sent` 화해 · **단일 워커** · 백오프 최대 5회·상한 10분 `[ASSUMPTION]`(`18` H.3) · 스케줄 주기는 설정값 |
| 6 | 확인 메일 흐름 | **Slice 2**(11.13). 확인 메일은 G4 밖이지만 개발 안전장치는 적용 |
| 7 | 초안·승인·발송 API | 10.2 · 오류 코드 10.3 · 지문은 **수신자 + 제목 + 본문 + 구조화 값**(I-11) · 승인 멱등 · 계획 교체 자동 무효화(T3) |
| 8 | 회신 수신 폴링 | Phase 6 — 워터마크 포트(Mock 은 가짜 워터마크, Gmail `history_id` 는 Slice 2) · 중복 제거 UNIQUE · Quarantine → 보류함 화면 |
| 9 | AI 추출 인터페이스 | 7.1 ReplyExtractor — `ask_id` 기반 · 녹화 재생 · 프롬프트 판은 추출 기록에 · 실패·거절 → 확인 요청. **`ai/` 는 DB·네트워크 클라이언트 없음** |
| 10 | Event·Reconciliation 최소 subset | 11.8 규칙표 · 사실 키 3개(5.4) · 사람 확인은 T-081 구조(`22` 11.2a) · 전체로 확장되는 같은 구조 |
| 11 | OpenAPI 구성 | Backend 가 정본, `packages/` 에 TS 생성, 혼재 기간 표시(9.1). **파일 위치·생성 도구는 기술 결정 뒤 Phase 0** |
| 12 | Frontend Mock → Real 범위 | 9.2 — 통신·확인 큐·Data Trust·타임라인·자원 사실만. MockProvider 기본값 유지 |
| 13 | 테스트 전략 | 14절 · K.2 **12개** 매핑(14.3) · 크래시-재기동(S-02) · 네트워크 없는 채널 시험(Mock + 녹화 fixture) · `validate:scenario` 금지 표현 검사 보정은 Slice 3 |
| 14 | 구현 순서 | 11절 — **J.4 2단계(Mock 루프 완주)가 Slice 1 전체**로 독립돼 있고 실제 발송은 Slice 2 마지막에 켠다 |
| 15 | Antigravity 작업 단위 | 20절 |

---

## 19. OPEN · 금지선 확인 · 정본 불일치

### 19.1 이 계획이 확정하지 않은 것 (금지선 확인)

| 항목 | 확인 |
| --- | --- |
| **M-6**(`OBSERVATION_REFRESH` 신선도 갱신) | **확정하지 않았다.** MVP 임시 동작(사건 없음 + [지금도 맞음])만 구현한다 |
| **Q-46**(상대방 입력 Source 모델) | **확정하지 않았다.** 이번 Slice 에 그 채널이 없다 |
| Q-48 | "지금 넣을지"만 답했다(넣지 않는다) |
| `docs/19` 23절 기술 목록 · Q-64 · Q-65 · Q-68 | 선택하지 않았다. 평가 기준만 16.3 · 순서는 16.4 |
| Solver · Risk · Cost · Desktop · Public API · 인증 · 배포 | 넣지 않았다(`18` N.3) |
| 새 Reconciliation 규칙 | 만들지 않았다 — `18` F.5 의 부분집합 |
| `docs/05` 결정 뒤집기 · `docs/21` 수정 | 없다 |

### 19.2 여전히 OPEN

| # | 무엇 | 언제 |
| --- | --- | --- |
| ~~**Q-64**~~ | Backend 언어·프레임워크 | **CLOSED (2026-09-21, T-083)** — Main Backend = TypeScript + NestJS, AI Server = 별도 Python 런타임(ADR-033) |
| **Q-68** | **DB 제품 · 접근 방식(ORM/쿼리) · 마이그레이션 도구** — 2026-09-21 신규 등록. 초안 기록은 ADR-004(SQLite → PostgreSQL, Proposed) | **Q-64 뒤 사용자** — **T-080 선행** |
| Q-65 | 솔버 위치·언어 | T-036 재개 뒤. **Slice 1 · T-080(P0) 을 막지 않는다** |
| Q-66 | 오류 코드 목록 — 10.3 에 초안 | 구현 |
| Q-67 | 로그 저장소·관측 제품 | 첫 배포 |
| Q-47 | 회신 없음 규칙 — Slice 1 은 "응답 없음" 표시만 | 사례 |
| Q-49 ~ Q-52 | 같은 주소 여러 거래처 · 다른 주소 회신 자동 연결 · 회신 기한 · 승인 만료 기본값 — 임시 처리(보류 + 사람 · 설정값) | 사례 |
| Q-45(기간) | 보관 기간 숫자 | Pilot |
| `internalDate` 의미 | `[TO VERIFY]` | Slice 2 |

### 19.3 발견한 정본 불일치 (고치지 않고 보고 — 한 건만 문서 수정)

| # | 무엇 | 처리 |
| --- | --- | --- |
| 1 | `docs/18` N.2 #13 · QUEUE T-069 완료 조건이 K.2 성공 판정을 **"13개"** 라 적었지만 K.2 는 **12개**다 | **`docs/18` N.2 #13 의 숫자만 12로 고쳤다**(사실 정정). QUEUE 완료 조건에도 주석 |
| 2 | `docs/18` 절 순서(J.6 가 J.5 앞, M.3~M.5 가 M.2 앞) · N.2 아래 머리 없는 옛 표 | 내용 문제가 아니라 표기 문제. **후속 정리 후보**로만 적는다 |
| 3 | `docs/18` C 표의 `ai/` 행에 "결정론 검증기"가 남아 있다 — ADR-029 · D.3 · O 는 검증기를 Backend 에 둔다 | 이 계획은 **Backend** 로 둔다(6절). **정리 완료 (2026-09-21, T-083)** — `docs/18` C 표·규칙 5·6 을 ADR-033 에 맞췄다 |
| 4 | QUEUE T-003 이 "uv/pyproject(Python 3.12)"로 적혀 있다 — Backend 언어는 미결(Q-64) | T-003 은 **이 계획의 Phase 0 으로 흡수**된다(QUEUE 에 표시) |
| 5 | `docs/12` 로드맵에 Tech Validation 단계가 없다(ADR-027 · `01` 6절에만 있다) | 로드맵 정리는 T-069 범위 밖 — 후속 후보 |
| 6 | 논리 모델에 **부족분(gap) 표가 없다** — `docs/18` D.2 는 `gap_id` 를, `docs/22` 15.4 는 `source_path` 를 쓴다 | 충돌이 아니다. gap 은 **계산 결과 안의 위치**이고 `source_path` 로 가리키면 된다. 계획 도메인이 합류할 때(P1) 다시 본다 |

---

## 20. Coding Agent(Antigravity) 작업 단위

각 단위 공통: **Architecture Decision 과 Scope 를 바꾸지 않는다. 계획과 다른 설계가 필요하면 구현하지 말고 멈추고 보고한다. commit·push 하지 않는다**(`18` N.4 · `docs/17`). `docs/` · `data/scenarios/` 는 변경 금지 영역.

| 단위 | Goal | 변경 가능 | 변경 금지 | 완료 조건 · 시험 |
| --- | --- | --- | --- | --- |
| U0 | Phase 0 뼈대 | `back/` · `ai/` · `packages/` 뼈대 · `.env.example` | `front/` · `docs/` · `data/` | R-01 · 빈 API · 테스트 러너 |
| U1 | Phase 1 저장소·시드·기록기·내용 저장소 | `back/` | 위와 같음 | C-01~03 · 불변 표 쓰기 경로 없음 |
| U2 | Phase 2 등록부·게이트 | `back/` | | G-01~05 |
| U3 | Phase 3 초안·숫자 검사 | `back/` · `ai/`(템플릿 포트) | | 숫자 검사 시험 |
| U4 | Phase 4 승인·무효화 | `back/` | | A-02~06 |
| U5 | Phase 5 Outbox·Mock 발송 | `back/`(`comms` · `channels`) | 실채널 코드(시험용 "실채널 선언" 어댑터는 시험 코드에만) | A-01 · S-01~05 · G-06 |
| U6 | Phase 6 수신·매핑 | `back/` | | I-01~06 |
| U7 | Phase 7 추출·검증기 | `back/` · `ai/`(추출 포트·녹화 재생) | `ai/` 의 DB·네트워크 클라이언트 | X-01~05 |
| U8 | Phase 8 사건·상태 | `back/`(`state`) | 새 Reconciliation 규칙 | E-01~05 |
| U9 | Phase 9 사람 확인 | `back/` | | V-01~03 |
| U10 | Phase 10 API·프론트 | `back/` · `packages/` · `front/web/src/data/` · 해당 화면 | `data/scenarios/` · 계획·위험·비용 화면 로직 | F-01 · `validate:scenario`·`typecheck`·`lint`·`build`·`smoke` |
| U11 | Phase 11 인수 | 시험만 | 기능 코드 | 15절 DoD 19항목 · G-06 인수 시험 포함 |

**다음 태스크로 쪼갤 때**: T-041 · T-048 · T-049 · T-051 의 외부 통신 부분은 위 단위가 대신한다(로드맵 백로그 재조정). 태스크 번호는 이 계획이 승인되면 QUEUE 에 등록한다.

### 20.1 QUEUE 등록 규칙 — 코드·마이그레이션 단위가 먼저 "실행 가능"으로 보이면 안 된다

사용자 결정은 **`NEEDS_HUMAN` 태스크**로 등록해 의존으로 잇는다(`AGENTS.md` 3.5). **2026-09-21 등록**: Q-64 = **T-083** · Q-68 = **T-084** · U0~U11 = **T-085 ~ T-096**(QUEUE).

```
T-069 (DONE)
  → [NEEDS_HUMAN] Q-64 Backend 언어·프레임워크 결정
  → [NEEDS_HUMAN] Q-68 DB 제품·접근 방식·마이그레이션 도구 결정
  → T-080 P0 29개 물리 설계
  → U0 → U1 → U2 → U3 → U4 ─┬→ U5 ──────────┐
                              └→ U6 → U7 ──────┼→ U8 → U9 → U10 → U11
```

| 단위 | 의존 | 비고 |
| --- | --- | --- |
| U0 | **T-080** (따라서 Q-64 · Q-68) | 코드 시작점. **T-080 이 `DONE` 이 되기 전에는 `TODO` 여도 실행 가능 목록에 넣지 않는다** |
| U1 | U0 | 첫 마이그레이션 |
| U2 | U1 | |
| U3 | U2 | |
| U4 | U3 | |
| U5 | U4 | |
| U6 | U4 | U5 와 병렬 |
| U7 | U6 | |
| U8 | U7 · U5 | 엔진(순수 함수) 시험은 U1 뒤 먼저 할 수 있지만 **단위 완료는 U7 · U5 뒤** |
| U9 | U8 | |
| U10 | U9 · U5 · **프론트 트랙(Antigravity 디자인 작업) 반영 완료** | `front/web` 충돌 방지 |
| U11 | U10 | 인수 |

- **Q-65(솔버)는 어느 단위의 의존도 아니다.** Slice 1 에 솔버가 없다.
- T-080 의 의존(QUEUE)도 같은 순서로 맞춘다: T-069 · Q-64 · Q-68.
