# 04. CERA 데이터 분석서

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 확정(2026-10-28 구현 기준) |
| 기준 | HEAD `5881529` + T-132 · T-133 · 코드값 `back/src/db/schema/codes.ts` · 내용 저장소 `back/src/content/*` · 공공데이터 `back/src/public-data/*` |
| 관련 문서 | [05 DB 설계](05_data-model-and-tables.md) · [06 아키텍처](06_system-architecture.md) · [08 운영](08_nfr-and-operations.md) · 출처 카탈로그(설계 시점) [`docs/11_data-sources.md`](../11_data-sources.md) |

> 제목의 "빅데이터"에 대해: CERA 는 Hadoop · Spark · Data Lake 같은 대용량 처리 계층이 **없다**. 현재 다루는 것은 운영 데이터 · 공공 데이터 · 메시지 · AI 추출 · 사실 · 계획 · 감사 데이터이며 모두 PostgreSQL(+ 원문 파일 저장소)에 있다. 이 문서는 그 데이터의 출처 · 흐름 · 품질 · 활용을 분석한다.

## 1. 데이터 소스

| # | 데이터명 | 발생 주체 | 수집 방법 | 형태 | 갱신 | 신뢰 수준(코드) | 저장 위치 | 활용 기능 | 개인정보 | 보존 | 실제/합성 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 시나리오 팩(30대) | 개발팀 | 시드(`npm run db:seed`) | JSON 파일(`data/scenarios/busan-wh-capacity-01`) | 수동 | `is_simulated = true` | `scenario` · `planning_snapshot` · `recovery_run` · 등록부 · 첫 사건 | 시연 · 시험 실행 | 없음(합성) | 저장소 | **합성** |
| 2 | 운영 입력 — 컨테이너 | 운영자 | CSV · 행(JSON), 검증 후 저장 | 구조화 | 실행마다 | `FILE_IMPORT` · 사람 입력 | `planning_input_batch` · `planning_container_record` · `container` | 실제 실행 계획 | 없음 | 무기한(append-only) | 시연은 **합성** · 운영자 입력은 실제 가능 |
| 3 | 운영 입력 — 계약 요율 | 운영자 | CSV · 행 | 구조화(원 정수) | 변경 시 새 행 | 사람 입력 | `tariff_rate` | 비용 계산 | 없음 | 무기한 | **합성**(실제 계약서 없음) |
| 4 | 운영 입력 — 시설 계획 정보 | 운영자 | CSV · 행 | 구조화 | 변경 시 새 행 | 사람 입력 | `facility_planning_profile` | 시설 제약 | 없음 | 무기한 | **합성** |
| 5 | 현장 직접 입력 사실 | 운영자 · 현장 담당자 | 화면 · API(`POST /truth/facts/manual`) | 구조화 + 출처 메모 | 수시 | `HUMAN_UI` → 확정 | `raw_input` · `event` | 사실 · 계획 | 없음(메모 자유 문장 주의) | 무기한 | 시연은 합성 |
| 6 | 등록부(거래처 · 담당자 · 주소) | 관리자 · 시드 | 화면 · API · 시드 | 구조화 | 수시 | 관계 승인 · 메일 확인 상태 | `counterparty` · `counterparty_contact` · `contact_channel_address` | 문의 대상 · Contact Gate · 발신자 판정 | **있음**(담당자 이름 · 메일 주소) | 무기한(상태 변경으로 비활성) | 시드는 합성(`*.invalid`) · Gmail 기술 검증 때만 테스트 계정 |
| 7 | 보낸 문의 | Agent · 운영자 | 초안 · 승인 · 발송 | 구조화 값 + 문장 | 건별 | 구조화 값이 정본 | `comm_message` · `comm_message_structured_field` · 원문 `COMM_MESSAGE_CONTENT` | 문의 · 감사 | 받는 주소 | 무기한 | Mock / 실제(Gmail) |
| 8 | 받은 회신 | 외부 거래처 | Worker 수신(Gmail · Mock) | 비정형 메일 | 건별 | `EMAIL` · 발신자 판정 결과 | `raw_input` · `comm_message`(INBOUND) · 원문 `RAW_INPUT_PAYLOAD` | 추출 · 감사 | **있음**(메일 원문) | 원문 파기 기능은 있으나 자동 보존 정책 없음[미확정] | Mock / 실제(10-27 1건 검증) |
| 9 | AI 추출 후보 | AI Server(LLM · 녹화 재생) | Worker → AI | 구조화 후보 + 원문 인용 | 회신마다(재시도 포함) | 사건이 되면 `LLM_EXTRACTED` · `validator_result` · `model_version` | `extraction` · 인용 `EXTRACTION_SOURCE_QUOTE` | 후보 → 임시 사실 | 인용 일부 | 무기한 | 녹화 재생 / 상용 Gemini smoke 1건 |
| 10 | 공공데이터 — 선박 입항(DS-03) | 해양수산부(data.go.kr) | Backend 어댑터(live · replay) | XML/JSON 응답 → 정규화 | 조회할 때 | `PUBLIC_API` — 최신 상태로 취급하지 않음 | `public_data_fetch` · `raw_input` · `vessel_call` | 맥락 · Agent Tool | 없음 | 원본 보존(gitignore 폴더) | **실제**(10-22 live 검증) · replay 는 마스킹 fixture |
| 11 | 공공데이터 — 적하목록(DS-02) | 해양수산부(data.go.kr) | 위와 같음 | 위와 같음 | 조회할 때 | 위와 같음 | `container` · `bl` · `container_bl` · `external_identifier` | 컨테이너 식별 | 없음(실제 B/L 은 커밋 금지) | 위와 같음 | **실제** |
| 12 | 사실(현재 값) | Reconciliation | 사건에서 계산 | 구조화 + 상태 차원 | 사건 변화 · 주기 재판정 | 값 · 신선도 · 충돌 · 쓸 수 있음 | `canonical_fact` · `conflict` · `verification_request` | 계획 · 화면 | 없음 | 다시 계산 가능(파생) | 입력에 따름 |
| 13 | 비용 · 위험 · 계획 | Cost Engine · Solver | 계산 | 구조화(원 정수) | 재계산마다 새 판 | 결정론 | `recovery_plan` · `recovery_plan_item` | 승인 · 후속 | 없음 | 무기한(판 누적) | 입력에 따름 |
| 14 | Agent 실행 기록 | LangGraph · Backend | Tool · Runtime API | 단계 · Tool 호출 · 체크포인트 | 실행 중 | 실행 상태(업무 사실 아님) | `agent_run` · `agent_step` · `agent_tool_call` · `agent_checkpoint(_write)` · `AGENT_CHECKPOINT` | 재개 · 관측 | 없음 | 무기한[미확정 — 보관 주기 T-108 잔여] | — |
| 15 | 감사 · 시스템 오류 | Backend | 트랜잭션 안 기록 | 구조화(메시지 · 스택 없음) | 행동마다 | — | `audit_log` · `system_error` | 감사 · 장애 분석 | actor id | 무기한(append-only) | — |
| 16 | 사용자 · 세션 | 관리자 · 시드 | API · 시드 | 구조화(비밀번호 해시 · 토큰 지문) | 로그인마다 | — | `user_account` · `user_session` | 인증 | 로그인 id · 표시 이름 | 세션은 만료 · 철회(행 유지) | 시드 계정은 합성 |
| 17 | 운영 기준 계획(원래 반입 계획 — T-132) | 운영자 | CSV · 행, 검증 후 저장(`POST /planning/inputs/containers`) | 구조화 | 계획이 바뀔 때 새 판 | `FILE_IMPORT` · 사람 입력 | `planning_input_batch` · `planning_container_record`(`recovery_run_id` NULL) | 예외 탐지의 예정 수요 · 자동 실행의 입력 | 없음 | 무기한(append-only) | 시연은 **합성** · Staging 은 실제 입력 가능 |
| 18 | 운영 예외 · 관측 기록(T-132) | 예외 탐지기(결정론) | 사실 · 운영 입력 변경 알림 · Worker 주기 | 구조화(예정 · 수용량 · 부족 · 근거 jsonb + 해시) | 근거가 바뀔 때만 | 근거 `CONFIRMED` · `PROVISIONAL` · 판단 불가 기록 | `operational_exception` · `operational_exception_observation` | 복구 실행 자동 생성 · 화면 개요 | 없음 | 무기한(관측 append-only · 예외 삭제 불가) | 범위 `SCENARIO` 는 **합성** · `LIVE` 는 실제 |
| 19 | Worker heartbeat(T-133) | Worker 프로세스 | 주기마다 덮어씀 | 구조화(시각 · 주기 ms · 실패 단계 · 채널별 수신 확인 코드) | 수 초마다 | 실행 상태(업무 사실 아님) | `runtime_heartbeat` | 운영 시스템 상태 | 없음(코드만) | 한 행 · 삭제 불가 | 실제 프로세스 |

## 2. 실제 / 합성 구분 (2026-10-28)

| 구분 | 내용 | 근거 |
| --- | --- | --- |
| **실제 외부 연동 — 검증됨** | Gmail API(실제 발송 · 실제 회신 · 원문 보존 · Agent 재개, 테스트 계정) | 2026-10-27, `docs/18` G.8 |
| | 공공데이터 DS-03 · DS-02(data.go.kr) | 2026-10-22 live 검증 |
| | 상용 LLM 추출(Gemini `gemini-3.8-flash`) — **합성 회신 1건 smoke** | 2026-10-28, `docs/tasks/QUEUE.md` T-099 |
| **합성 · 운영 입력** | 기업 내부 컨테이너 데이터 · 계약 요율 · 시설 수용량 · 트럭 가용 · 거래처 · 담당자 · 회신 문장 | 시나리오 팩 · 시연 입력 |
| **미확인** | 실제 업무 회신의 상용 LLM 대량 처리 · 실제 고객 시스템 데이터 | [외부 의존] |

시나리오 · Mock 결과는 `is_simulated` · `contains_simulated` 로 표시되고, 실제 실행은 Mock 주소를 쓸 수 없다(`SIMULATION_MISMATCH`).

## 3. 데이터 흐름(Lifecycle)

```text
[수집]  운영 입력(CSV·행) ─┐   사람 직접 입력 ─┐   메일 회신 ─┐   공공 API 응답 ─┐
                            ▼                   ▼              ▼                 ▼
[검증]  행·필드 검증(dry-run)  형식·권한 검증     원문 보존(ContentStore) + raw_input   원본 보존 + 정규화
                            │                   │              │ 스레드·발신자 판정(보류 가능)
                            ▼                   │              ▼
[기록]  운영 기록(append-only: planning_*)      │       AI 추출 → 후보(extraction) → 결정론 검증
                            │                   │              │ 통과 + 승격 조건
                            │                   ▼              ▼
[사건]                      │            event(OBSERVATION · CORRECTION · VERIFICATION) — 고치지 않고 쌓음
                            │                   │
[사실]                      │      Reconciliation → canonical_fact(값·신선도·충돌·쓸 수 있음) — 파생, 재계산 가능
                            ▼                   ▼
[탐지]  운영 기준 계획(예정) × 수용량 사실 → 예외 탐지기(결정론, LLM 없음) → operational_exception + 관측 기록 → 복구 실행 자동 생성
                            ▼
[계획 입력]       입력 준비도 + 계획 스냅숏(as_of · 사실 지문)
                            ▼
[계산]            Cost / Risk Engine(원 정수 · 위험 벌점) → Baseline → HiGHS Solver
                            ▼
[결정]            recovery_plan 판(PROPOSED → 사람 APPROVED / SUPERSEDED / OUTDATED)
                            ▼
[행동]            후속 · 정정 · 취소 초안 → 사람 승인 → 발송 → (다시 회신)
```

핵심 원칙: **AI 출력 ≠ 사실.** AI 는 후보만 만들고, 후보는 결정론 검증과 승격 조건을 통과해야 사건이 되며, 그 사건도 사람 확인 전에는 임시(`PROVISIONAL`)다.

## 4. 데이터 품질 정책 (구현 기준)

| 차원 | 구현 |
| --- | --- |
| 완전성(Completeness) | 정보 공백 판정(필요 사실 대비) · 입력 준비도(필드 단위 빠진 값) · 요율 · 사실이 없으면 비용을 지어내지 않고 선택지를 실행 불가로 |
| 유효성(Validity) | 운영 입력 행 · 필드 검증(dry-run 먼저) · 297개 DB CHECK(코드값 · 형식 · 시간 순서) · 문의 숫자 검사 · 추출 결정론 검증(인용 · 값 · 단위 · 범위 · 형식) |
| 신선도(Freshness) | 명시 유효 시간 우선 + 계열별 시작값 [ASSUMPTION] → `FRESH` · `AGING`(경고) · `STALE`(다시 묻기) · `EXPIRED` · 근거 시각 품질(`EVENT_TIME` · `RECORDED_TIME` · `RECEIVED_ONLY`) |
| 일관성(Consistency) | 구조화 값이 정본(문장은 파생) · 승인 사본 고정 · 계획 해시 · 스냅숏 사실 지문 · 시뮬레이션 플래그를 FK 에 포함 |
| 출처(Provenance) | 모든 사건에 `raw_input`(출처 유형 · 수집자) · 추출 id · 원문 인용 · 입력한 사람 · 단언한 거래처 |
| 권위(Authority) | 근거 강도(`EVIDENCE_STRENGTH` 0~3) · 사람 확인 · 권위 시스템 · 정책 근거(`VERIFICATION_BASIS`) — 사람 확인 · 사람 입력 → 확정 |
| 충돌(Conflict) | 같은 사실의 다른 값 → `DISSENT` · `OPEN` → 쓸 수 있음 판정에 반영 |
| 중복(Duplicate) | 외부 메시지 id UNIQUE(수신) · 등록부 주소 · 시설 · 트럭 풀 중복 409 · 운영 입력 같은 내용만 저장 · 진행 중 예외는 정체마다 하나(부분 유일 인덱스) |
| 멱등(Idempotency) | 발송 요청 · Tool 호출(멱등 키) · 시드 · migration 반복 안전 · 결과 모르는 발송은 화해 |

## 5. 데이터 보안

| 대상 | 정책(구현) |
| --- | --- |
| 원문 메일(Raw Email) | DB 밖 ContentStore 파일(`cref:v1:<범주>:<id>` 참조 + 해시만 DB). 실제 메일 원문 커밋 금지(규칙 5) · 경로는 gitignore. 파기는 감사와 함께(`CONTENT_PURGED`) — 자동 보존 기간 정책은 없음[미확정] |
| OAuth(Gmail) | client id · secret · refresh token 은 `back/.env` 만(로그 금지). 공개 데모는 Gmail 을 켜면 기동 거부 |
| API Key(LLM · 공공데이터) | `ai/.env` · `back/.env` 만. 설정 오류 메시지는 키 이름만 · 공개 데모 AI 컨테이너에는 상용 키를 넘기지 않음 |
| 연락처 | 시드 · 시연은 `*.invalid` 합성 주소 · 실제 주소는 커밋 금지 · 받는 사람은 Contact Gate 통과 주소만 |
| ContentStore | 로컬 파일 어댑터(운영 제품은 [미확정]) · 백업 시 DB 와 함께 |
| 감사 | append-only · 메시지 · 스택 · 비밀값 없음 |
| 세션 · 비밀번호 | 토큰 지문 · scrypt 해시만 저장 |
| 백업 | pg_dump + ContentStore 폴더(`infra/README.md`) — 백업 파일 암호화는 [미확정] |

## 6. 현재 데이터 활용 단계

현재는 **운영 의사결정(Operational Decision)** 중심이다: 지금 무엇을 믿을지 정하고, 창고 수용량 부족을 스스로 찾고(T-132), 계획을 계산하고, 승인 · 후속을 연결한다. 분석 대시보드는 **없다**. 관측 도구는 `npm run runtime:stats`(그래프 · Tool · 공공데이터 지연 분포) 하나다.

## 7. 향후 분석 가능 데이터 [향후]

아래는 **DB 에 근거 데이터가 실제로 있는 것만** 적었다. 화면 · 집계는 구현되지 않았다.

| 분석 주제 | 근거 데이터(실제 컬럼 · 표) |
| --- | --- |
| 연락 응답 시간 | `message_status_transition`(SENT 시각) ↔ INBOUND `comm_message` 수신 시각 |
| AI 추출 성공률 · 실패 유형 | `extraction`(후보 · `validator_result` · `review_status` · `model_version`) + 시도 결과는 감사 `EXTRACTION_*` · `system_error`(`EXTRACTION_PROVIDER_FAILED` 등) · `extraction_retry_request` 에서 조합 |
| 사람 개입률 | `agent_step`(단계 종류 `INTERRUPT` · `RESUME` · 노드 · 소요 시간) · `agent_run.waiting_reason`(현재 값만 — 이력 컬럼 없음) · 사실 확인 · 정정 사건 수 · 재추출 요청 |
| 계획 변경 횟수 · 이유 | `recovery_plan`(`version` · `plan_status` · `outdated_reasons` · `outdated_at`) |
| 복구 비용 · 절감 | `recovery_plan.objective_krw` · `base_cost_krw` · `risk_penalty_krw` · `baseline_total_krw` · `saving_krw` · 계산 시간 `cost_ms` · `solve_ms` |
| Solver 선택 패턴 | `recovery_plan_item.action` 분포 |
| 시설별 수용 실패 · 변동 | 시설 수용량 사건(`event` + `event_entity_link`) 시계열 · 예외 관측 기록(`operational_exception_observation` — 예정 · 수용량 · 부족 · 근거 사건) |
| 예외 빈도 · 해소 시간 | `operational_exception`(`detected_at` · `resolved_at` · 시설 · 날짜) — 지금은 한 유형(창고 수용량 부족)만 |
| 거래처별 응답 · 정정 | 스레드 · 회신 · 정정 후속(`plan_follow_up`) |

확장 단계 [향후]: 기술(Descriptive — 위 집계) → 진단(Diagnostic — 지연 원인) → 예측(Predictive — 수용 감소 · 응답 지연 예측) → 처방(Prescriptive — 현재 Solver 를 확장). 예외 유형 빈도 분석은 예외 유형 코드가 하나(`WAREHOUSE_CAPACITY_SHORTAGE`)뿐이라 유형 간 비교는 아직 할 수 없다.
