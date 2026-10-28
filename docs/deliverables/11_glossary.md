# 11. CERA 용어집 (산출물 공통)

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 확정(2026-10-28 구현 기준 · T-132 반영) — 코드값이 바뀌면 함께 고친다 |
| 기준 | HEAD `5881529` · 코드값 정본 `back/src/db/schema/codes.ts` · 화면 문구 정본 `front/web/src/components/ops/opsLabels.ts` · `front/web/src/components/agent/agentLabels.ts` |
| 관련 문서 | [문서 INDEX](CERA_DOCUMENT_INDEX.md) · 기존 기획 용어집 [`docs/13_glossary.md`](../13_glossary.md)(설계 시점 용어 — 구현과 다르면 이 문서가 우선) |

이 용어집은 산출물 문서 10종이 같은 말을 같은 뜻으로 쓰게 하기 위한 것이다. **코드값은 원문 그대로** 적고, 사용자가 이해하는 뜻을 함께 적는다.

## 1. 업무 개념

| 용어(코드) | 쉬운 한국어 | 뜻 |
| --- | --- | --- |
| Recovery Run (`recovery_run`) | 복구 실행 | 예외 하나를 놓고 "무엇을 믿을 수 있고 무엇을 할지"를 판단하는 한 건의 작업 단위. 시나리오 시드로 만들거나(시뮬레이션 실행) 운영자가 만든다(실제 실행) |
| Scenario run / Live run | 시뮬레이션 실행 / 실제 실행 | `contains_simulated = true` 면 합성 시나리오에서 만든 실행, false 면 운영자가 넣은 운영 기록으로 계산하는 실행 |
| Planning Snapshot (`planning_snapshot`) | 계획 기준 스냅숏 | 실행이 기대는 기준 시각(`as_of`)과 사실 지문(fingerprint) 묶음 |
| Information Gap | 정보 공백 | 계획을 세우는 데 필요한데 아직 믿을 만한 값이 없는 사실(현재 구현: 시설 수용량 `FACILITY_CAPACITY`, 트럭 가용 `TRUCK_AVAILABILITY`). Backend 결정론 규칙이 판정한다 |
| Counterparty (`counterparty`) | 거래처 | 운송사 · ODCY · 창고 · 선사 · 터미널(`COUNTERPARTY_ROLE`) |
| Contact (`counterparty_contact`) | 담당자 | 거래처에 속한 사람 |
| Channel Address (`contact_channel_address`) | 연락 주소 | 담당자의 메일 주소 등. 채널 `GMAIL` · `MOCK` · `PORTAL`(PORTAL 은 코드값만 있고 어댑터 없음) |
| Registry | 등록부 | 거래처 · 담당자 · 주소 · 시설 · 트럭 풀을 관리하는 기준 정보 |
| Contact Gate | 연락 자격 검사 | 이 주소로 지금 보내도 되는지 Backend 가 결정론으로 판정(거래처 활성 · 담당자 활성 · 주소 확인 · 관계 승인 · 통신 활성 · Mock/Real 일치 · 개발 안전장치). 승인 때와 발송 직전에 두 번 |
| Inquiry / Draft (`comm_message`, OUTBOUND) | 문의 / 초안 | 거래처에 보낼 메시지. 구조화 값(수량 · 날짜 · 시간대)이 정본이고 문장은 그 값으로 만든다 |
| Intent | 문의 종류 | `TRUCK_SLOT`(트럭 배차 가능 대수) · `FACILITY_CAPACITY`(시설 반입 가능 수량) |
| Approval (`message_approval`) | 발송 승인 | 사람이 내용 지문(`content_hash`)을 확인하고 남기는 승인. 유효 기한이 있다 |
| Send Request / Outbox | 발송 요청 / 발송 대기열 | 승인 뒤 사람이 발송을 요청하면 `QUEUED` 가 되고 Worker 가 보낸다 |
| Reply (`comm_message`, INBOUND) | 회신 / 답장 | 거래처가 보낸 메일. 원문은 내용 저장소에 보존한다 |
| Extraction (`extraction`) | 추출 / 추출 후보 | AI 가 답장에서 읽어 낸 값 후보(값 + 원문 인용). **사실이 아니다** |
| Validator | 결정론 검증기 | AI 후보를 원문 · 질문과 대조하는 규칙(`back/src/communication/extraction-rules.ts`) |
| Candidate | 후보 | 검증 전·후의 추출 값. 검증 통과 후보만 사건(Event)이 될 자격이 있다 |
| Event (`event`) | 사건 | 출처 · 시각 · 신뢰 근거를 가진 관측 기록(`OBSERVATION` · `CORRECTION` · `VERIFICATION`). 고치지 않고 쌓는다 |
| Truth / Canonical Fact (`canonical_fact`) | 사실 / 현재 사실 | 사건들로부터 Reconciliation 이 계산한 "지금 믿는 값". 다시 계산할 수 있는 파생 표 |
| Reconciliation | 사실 대조 · 판정 | 같은 사실에 대한 사건들 중 현재 값을 정하는 결정론 규칙(`back/src/truth/reconcile-rules.ts`) |
| Provisional | 임시 사실 | AI 추출 등 약한 근거로 들어온 값. 계획에 쓸 수 있지만 경고 · 벌점이 붙고 사람 확인을 기다린다 |
| Confirmed | 확정 사실 | 사람이 확인했거나 사람이 직접 넣은 값 |
| Observed | 관측 사실 | 사람 확인은 없지만 근거 강도가 2 이상인 값 |
| Manual Fact | 직접 입력 | 운영자 · 현장 담당자가 확인한 값을 직접 넣는 것(`OPERATOR_DIRECT_ENTRY`). 바로 확정 |
| Freshness | 신선도 | 값이 얼마나 최근인가(`FRESH` · `AGING` · `STALE` · `EXPIRED` · `UNKNOWN` · `N_A`) |
| Conflict (`conflict`) | 충돌 | 같은 사실에 서로 다른 값이 있는 상태(`NONE` · `DISSENT` · `OPEN`) |
| Operational Baseline | 운영 기준 계획 | 어느 복구 실행에도 속하지 않은 예정 반입(원래 계획, `planning_container_record.recovery_run_id IS NULL`). 예외 탐지기가 이것과 수용량 사실을 비교한다(T-132) |
| Operational Exception (`operational_exception`) | 운영 예외 | 결정론 탐지기가 찾은 문제 하나(첫 유형 `WAREHOUSE_CAPACITY_SHORTAGE` — 창고 수용량 부족). 근거는 관측 기록(`operational_exception_observation`) |
| Exception Detector | 예외 탐지기 | 운영 기준 계획 + Truth 로 예외를 찾아 복구 실행을 만드는 결정론 서비스(LLM 아님, Agent 를 시작하지 않음) |
| Private Staging | 개인 검증 환경 | 실제 Gmail · 상용 LLM · 공공데이터 · 실제 운영 입력을 쓰는 비공개 배포(`infra/staging`). 공개 데모와 코드는 같고 설정 · 데이터는 다르다 |
| Planning Input | 운영 입력 | 실제 실행의 계획 재료: 컨테이너 · 요율 · 시설 계획 정보(CSV 또는 행) |
| Input Readiness | 입력 준비도 | 실제 실행이 계산 가능한지, 빠진 값이 무엇인지(필드 단위) |
| Cost / Risk Engine | 비용 · 위험 계산 | 컨테이너 × 선택지마다 비용(원)과 위험 벌점을 결정론으로 계산(`back/src/planning/engine/cost-engine.ts`) |
| Baseline | 기준안 | "아무것도 바꾸지 않을 때"의 비용 — 절감액 비교 기준 |
| Solver | 최적화 엔진 | HiGHS 0-1 MIP. 총 예상 손실(비용 + 위험 벌점)이 가장 작은 배정을 찾는다. **LLM 이 아니다** |
| Recovery Plan (`recovery_plan`) | 복구 계획 | Solver 결과를 저장한 판(version). 컨테이너별 조치(`recovery_plan_item`) |
| Plan Action | 조치 | `KEEP_CURRENT_PLAN`(그대로) · `MOVE_TO_WAREHOUSE`(다른 창고) · `MOVE_TO_ODCY`(ODCY 로) · `WAIT_AT_TERMINAL`(터미널 대기) |
| Plan Approval | 계획 승인 | 사람이 계획 판을 승인하는 결정. **실행 지시가 아니다**(배차 · 발송은 일어나지 않는다) |
| Outdated | 다시 계산 필요 | 계획이 기대던 사실 · 입력이 바뀌어 그 판을 더 쓰지 않는 상태 |
| Superseded | 새 판에 밀림 | 더 새로운 판이 생겨 이전 판이 대체된 상태 |
| Re-plan | 재계산 | 지금 사실로 새 판을 만드는 것(`POST /planning/runs/{runId}/plans`) |
| Follow-up (`plan_follow_up`) | 후속 요청 | 승인된 계획에 필요한 외부 요청 초안(ODCY 반입 · 협력 트럭) |
| Correction / Cancellation | 정정 / 취소 요청 | 이미 보낸 후속 요청이 새 계획과 맞지 않을 때 새로 만드는 정정 · 취소 초안. 원래 보낸 메일은 고치지 않는다 |
| Contact Selection (`contact_selection`) | 받는 주소 선택 | 연락 가능한 담당자가 여럿일 때 사람이 이번 한 건의 받는 주소를 고른 기록 |
| Agent Run (`agent_run`) | Agent 실행 | LangGraph 그래프 한 번의 실행 기록. 사람 · 외부를 기다리며 멈췄다 이어 간다 |
| Agent Tool | Agent 도구 | Agent 가 부를 수 있는 Backend 의 정해진 기능 14개(`/internal/agent-tools/{tool}`). 부작용은 이것으로만 |
| Checkpoint (`agent_checkpoint`) | 실행 체크포인트 | Agent 그래프의 실행 상태. **업무 사실이 아니다** |
| Reconciler | 재조정기 | Worker 가 주기마다 "기다리던 기록이 바뀐 실행 · 재시도 시각이 된 실행"을 깨운다 |
| Audit (`audit_log`) | 감사 기록 | 누가 무엇을 했는지(승인 · 발송 요청 · 로그인 등) 남기는 기록 |
| System Error (`system_error`) | 시스템 오류 기록 | 운영용 오류 행(메시지 · 스택 없음) |
| ContentStore | 내용 저장소 | 메일 원문 · 첨부 · 체크포인트 같은 큰 내용을 DB 밖 파일로 보관(DB 에는 참조와 해시만) |
| Portfolio Demo Mode | 공개 포트폴리오 데모 모드 | 인터넷 공개 체험 배포. Gmail · 상용 LLM · 공공데이터를 설정 단계에서 막는다(ADR-039) |
| System of Action / Exception Recovery Layer | 실행 연결 계층 / 예외 복구 계층 | 기존 WMS · TMS · ERP 를 대체하지 않고, 예외가 났을 때 판단과 후속 행동을 연결하는 층 |

## 2. 상태값

### 2.1 Agent 실행 상태 (`AGENT_RUN_STATUS`)

| 코드 | 화면 표현 | 뜻 |
| --- | --- | --- |
| `CREATED` | 생성됨 | 만들었지만 시작 전 |
| `RUNNING` | 실행 중 | 그래프가 도는 중 |
| `WAITING_HUMAN` | 사람 대기 | 사람의 승인 · 확인 · 선택을 기다림(사유는 2.2) |
| `WAITING_EXTERNAL` | 외부 대기 | 발송 · 회신 등 바깥 일을 기다림 |
| `WAITING_RUNTIME` | 재시도 대기 | AI Server 일시 장애로 다시 시도할 시각을 기다림 |
| `COMPLETED` · `FAILED` · `CANCELLED` | 완료 · 실패 · 취소 | 끝난 상태(`AGENT_RUN_TERMINAL`) |

### 2.2 대기 사유 (`agent_run.waiting_reason` — 그래프 · 화면이 쓰는 값)

| 코드 | 사용자 의미 |
| --- | --- |
| `HUMAN_APPROVAL_REQUIRED` | 문의 초안 승인이 필요합니다 |
| `HUMAN_ACTION_REQUIRED` | 문의 초안을 고쳐야 합니다(숫자 검사 등 미통과) |
| `AWAITING_SEND_REQUEST` | 승인된 문의의 발송 요청이 필요합니다(승인만으로는 나가지 않음) |
| `AWAITING_DELIVERY` | 발송 대기열에서 나가기를 기다립니다 |
| `AWAITING_REPLY` / `AWAITING_REPLIES` | 상대 업체의 답장을 기다립니다 |
| `REPLY_REVIEW_REQUIRED` | 답장이 왔지만 AI 가 내용을 확정하지 못했습니다(다시 추출 또는 직접 입력) |
| `AWAITING_FACT_VERIFICATION` | 임시 값의 사람 확인이 필요합니다 |
| `CONTACT_REGISTRATION_REQUIRED` | 연락 가능한 담당자가 없습니다(등록 필요 — 관리자) |
| `CONTACT_SELECTION_REQUIRED` | 연락할 담당자를 선택해야 합니다(여럿이라 CERA 가 고르지 않음) |
| `AWAITING_PLAN_DECISION` | 복구 계획 승인이 필요합니다 |

### 2.3 메시지 상태 (`MESSAGE_STATUS`)

`DRAFTED`(초안) → `PENDING_APPROVAL`(승인 대기) → `APPROVED`(승인됨) / `REJECTED`(반려) → `QUEUED`(발송 대기) → `SENT`(보냄) / `DELIVERY_FAILED`(발송 실패) → `REPLIED`(답장 받음) → `CLOSED`(닫힘)

### 2.4 승인 결정 (`APPROVAL_DECISION`)

`APPROVED` · `REJECTED` · `REVISION_REQUESTED` · `REVOKED`(사람이 취소) · `INVALIDATED`(무효 — 원인 `INVALIDATION_CAUSE`: `USER_REVOKED` · `PLAN_SUPERSEDED`(계획이 바뀜) · `CONTENT_CHANGED`(내용 바뀜))

### 2.5 발송 시도 결과 (`SEND_RESULT`)

`SUCCESS` · `RETRYABLE_FAILURE`(다시 시도) · `PERMANENT_FAILURE`(중단) · `UNKNOWN`(결과 모름 — 화해 대상)

### 2.6 사실 상태

| 구분 | 코드 | 뜻 |
| --- | --- | --- |
| 값 상태(`VALUE_STATUS`) | `CONFIRMED` · `OBSERVED` · `PROVISIONAL` · `INFERRED` · `UNKNOWN` | 1절 참고. `INFERRED` 는 코드값만 있고 현재 판정 규칙이 만들지 않는다 |
| 화면 사실 상태(`fact_state`, API) | `PROVISIONAL` · `CONFIRMED` · `OBSERVED` · `NEEDS_REVIEW` · `STALE` · `REVOKED` · `UNKNOWN` | 화면용 요약(`back/src/truth/reconcile-rules.ts` `FactState`) |
| 쓸 수 있음(`DECISION_USABILITY`) | `USABLE` · `USABLE_WITH_WARNING` · `APPROVAL_BLOCKED` · `UNUSABLE` | 계획에 써도 되는지 |
| 후보 검토(`REVIEW_STATUS`) | `PENDING` · `ACCEPTED` · `REJECTED` · `SUPERSEDED` | 추출 후보의 처리 상태 |

### 2.7 계획 상태 (`PLAN_STATUS`) · Solver 상태 (`SOLVER_STATUS`)

- 계획: `PROPOSED`(제안) · `APPROVED`(승인) · `SUPERSEDED`(새 판에 밀림) · `OUTDATED`(다시 계산 필요) · `INFEASIBLE`(해 없음)
- Solver: `OPTIMAL` · `FEASIBLE` · `INFEASIBLE` · `TIME_LIMIT` · `ERROR`

### 2.7b 운영 예외 (T-132)

| 구분 | 코드 | 뜻 |
| --- | --- | --- |
| 종류(`EXCEPTION_TYPE`) | `WAREHOUSE_CAPACITY_SHORTAGE` | 창고 수용량 부족(예정 반입 > 확정 수용량) |
| 범위(`EXCEPTION_SCOPE`) | `LIVE` · `SCENARIO` | 실제 운영 기준 계획 · 합성 시나리오(시연) |
| 상태(`EXCEPTION_STATUS`) | `ACTIVE` · `RESOLVED` | 진행 중 · 해소(끝 — 다시 부족하면 새 예외) |
| 근거(`EXCEPTION_BASIS`) | `CONFIRMED` · `PROVISIONAL` | 확정 · 관측 사실 / 임시 사실(실행을 자동으로 만들지 않음) |
| 관측(`EXCEPTION_OBSERVATION_KIND`) | `DETECTED` · `CHANGED` · `RESOLVED` · `INDETERMINATE` | 처음 발견 · 근거 변화 · 해소 · 판단 불가 |
| 실행 출처(`source`, API) | `AUTO_DETECTED` · `MANUAL` · `SCENARIO` | 탐지기 · 사람 · 시나리오 시드가 만든 실행 — 화면 "자동 탐지" 배지 |

### 2.8 후속 요청 (`FOLLOW_UP_KIND`) · 막힌 이유

- 종류: `REQUEST`([요청]) · `CORRECTION`([정정]) · `CANCELLATION`([취소])
- 막힌 이유(화면): `NO_ELIGIBLE_CONTACT`(보낼 수 있는 담당자 없음 — 다른 회사로 대신 보내지 않음) · `CONTACT_SELECTION_REQUIRED`(담당자가 여러 명 — 고르세요)

### 2.9 등록부 주소 상태

- 메일 확인(`EMAIL_VERIFICATION_STATUS`): `UNVERIFIED` · `PENDING` · `VERIFIED` · `FAILED` · `EXPIRED`
- 관계(`RELATIONSHIP_STATUS`): `PENDING` · `APPROVED` · `REJECTED`
- 통신(`COMMUNICATION_STATUS`): `ACTIVE` · `PAUSED`(잠시 중지) · `INACTIVE`(사용 안 함 — 예: 퇴사)

## 3. 역할 (`USER_ROLE`)

| 코드 | 화면 표현 | 요약 |
| --- | --- | --- |
| `ADMIN` | 관리자 | 운영자 권한 + 등록부 변경 + 사용자 관리 |
| `OPERATOR` | 운영자 | Agent · 문의 · 승인 · 발송 요청 · 사실 판단 · 직접 입력 · 재추출 · 운영 입력 · 재계산 · 계획 승인 · 공공데이터 · 받는 주소 선택 |
| `FIELD_OPERATOR` | 현장 담당자 | 조회 + 현장 값 직접 입력 |
| `DEMO_VISITOR` | 데모 방문자 | 공개 포트폴리오 전용. 운영자에서 운영 입력 · 공공데이터를 뺀 권한 |

권한 정본: `back/src/auth/permissions.ts`. 자세한 표는 [02 요구사항 분석서](02_requirements-analysis.md) 2절.

## 4. 자주 보는 오류 코드

| 코드 | 사용자 의미 |
| --- | --- |
| `AUTH_REQUIRED` (401) | 로그인이 필요합니다 |
| `PERMISSION_DENIED` (403) | 이 역할로는 할 수 없습니다 |
| `PERMISSION_NOT_DECLARED` (403) | 권한이 선언되지 않은 변경 경로 — 막힘(개발 실수 방지) |
| `INVALID_CREDENTIALS` (401) | 로그인 실패(계정 존재 여부를 알려 주지 않음) |
| `LOGIN_RATE_LIMITED` (429) | 실패가 많아 잠시 막힘 |
| `RECIPIENT_NOT_ELIGIBLE` (403) | 이 주소로는 보낼 수 없습니다(Contact Gate) |
| `CONTENT_CHANGED` (409) | 확인한 뒤 내용이 바뀌었습니다 — 다시 확인 |
| `PLAN_SUPERSEDED` (409) | 계획이 바뀌어 이 승인을 쓸 수 없습니다 |
| `WRONG_COUNTERPARTY` (422) | 그 회사의 담당자가 아닙니다 |
| `NOT_WAITING_FOR_CONTACT_SELECTION` (409) | 지금 담당자 선택을 기다리고 있지 않습니다 |
| `EXTRACTION_PROVIDER_FAILED` | AI 공급자 호출 실패(추출 시도 기록 · 사람 검토로) |
| `PORTFOLIO_DEMO_REAL_CHANNEL_BLOCKED` (403) | 공개 데모에서는 실제 채널로 보내지 않습니다 |
| `DEMO_REPLY_NOT_ALLOWED` (400) | 공개 데모의 Mock 답장은 정해진 문장만 |
| `ORIGIN_NOT_ALLOWED` (403) | 다른 사이트에서 온 변경 요청 |
| `RATE_LIMITED` · `DEMO_QUOTA_EXCEEDED` (429) | 요청이 많음 · 하루 데모 한도 |
| `EXCEPTION_DETECTION_OFF` (409) | 이 배포에서는 예외 자동 탐지가 꺼져 있습니다 |
| `FACILITY_ALREADY_REGISTERED` · `TRUCK_POOL_ALREADY_REGISTERED` (409) | 같은 이름의 시설 · 트럭 풀이 이미 있습니다 |
| `SYSTEM_ACTOR_MISSING` | 시스템 행위자가 없습니다 — `npm run db:bootstrap` |

## 5. 표기 규칙

- 금액은 원(KRW) 정수, 시각은 시간대가 붙은 값(DB `timestamptz`, 화면 Asia/Seoul)
- `[미확정]` 정하지 않음 · `[ASSUMPTION]` 가정한 값 · `[향후]` 구현하지 않음 · `[외부 의존]` 외부 조건(키 · 고객 시스템 등)이 필요
