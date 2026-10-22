# back/ — CERA Backend 영역

**U0(T-085) 뼈대 + U1(T-086) 영속 기반이 있다** — NestJS API · Worker 진입점, PostgreSQL(Drizzle) 연결, 설정 검증, Clock · UUIDv7 · KRW(bigint) · SHA-256/JCS · 트랜잭션 경계 · 요청/추적/업무 상관 id · 공통 오류 · health, 그리고 **P0 29표 스키마 · migration M01~M10(트리거 · 권한) · 감사/`system_error` 기록기 · ContentStore(로컬 파일) · 시드 · OpenAPI 뼈대**. **업무 기능(초안 · 승인 · 발송 · 수신 · 사건 흐름)은 아직 없다**(U2 이후). 명령은 `AGENTS.md` 6절.

| 경로 | 무엇 |
| --- | --- |
| `src/main.ts` · `src/worker.ts` | API 프로세스 · Worker 프로세스 진입점(같은 코드베이스 — ADR-033) |
| `src/config/` | 환경변수 검증(zod) |
| `src/db/` | Pool · Drizzle · `TransactionRunner`(외부 I/O 는 트랜잭션 밖 — `assertOutsideTransaction`) · `migrate.ts` · `sqlstate.ts`(트리거 전용 코드 CE001~CE006) |
| `src/db/schema/` | P0 29표 Drizzle 스키마 — 파일이 migration 층과 같다(`m01-foundation` … `m06-derived`) · `codes.ts`(CLOSED 코드 값) · `_common.ts`(이름 규칙 · CHECK 도구) |
| `drizzle/migrations/` | **검토된 SQL migration** M01~M06(drizzle-kit 생성) + M07~M13(사람이 쓴 custom: append-only · 열/한 번 채움 가드 · 발송/승인/사건 가드 · 지연 트리거 · GRANT) + **M14(생성: 공공데이터 6표) · M15(custom: 가드 · GRANT)** — T-102. 앞으로만 |
| `src/public-data/` | **공공데이터(T-102 · ADR-036 결정 3)** — DS-03 선박운항 · DS-02 외항화물컨테이너. `adapters/`(전송 포트 · 실제 HTTP · 녹화 재생) · `parsing/` · `normalization/`(순수) · 원장 · 원문 · 개체 · PUBLIC_API 사건 · 개발 API `/public-data/*`. 모드 `CERA_PUBLIC_DATA_MODE` |
| `src/persistence/` | `AuditRecorder` · `SystemErrorRecorder`(별도 트랜잭션) · `RegistryReader` · `EventWriter`(사람 입력 경로) · `catalog.ts`(CATALOG 코드 정본) |
| `src/content/` | `ContentStore` 포트 · `LocalFileContentStore`(`CERA_CONTENT_DIR`) · `ContentService`(생성 4단계 · 파기 4단계 · 손실 판정) |
| `src/seed/` | Slice 1 시드(`npm run db:seed`, local·test 만, 고정 UUIDv7, 반복 실행 안전) |
| `src/http/openapi.ts` · `src/openapi/` | `GET /openapi.json` · `npm run openapi:emit` → `packages/contracts/openapi.json` |
| `src/communication/` | **문의 초안**(T-088 U3): `number-check.ts` · `inquiry-intents.ts` · `draft-prose.ts`(템플릿 포트 — 순수) · `DraftService`(한 트랜잭션) · `POST /communication/drafts` · `GET /communication/drafts` · `GET /communication/drafts/{messageId}` · `POST /communication/drafts/{messageId}/revisions` · `GET /planning/runs` · **발송 승인**(T-089 U4): `approval-rules.ts` · `message-content.ts`(순수 — 유효한 승인 · `msg-content/1`) · `ApprovalService` · `PlanSupersessionService` · `POST /communication/drafts/{messageId}/approve` · `.../reject` · `POST /communication/approvals/{approvalId}/revoke` · `GET /communication/approvers`(결정 명령 헤더 `X-CERA-Actor-Id`) · **발송**(T-090 U5): `send-rules.ts`(순수 — 발송 판정 · 화면 상태 · 백오프) · `SendService`(`POST /communication/drafts/{messageId}/send` — Outbox 등록만) · `OutboxDispatcher`(Worker — 화해 · 픽업 · 시도 선커밋 · 발송 · 결과) |
| `src/communication/` (수신) | **수신**(T-091 U6): `inbound-rules.ts`(순수 — Q-44 근거 시각 · 스레드 연결 · 발신자 판정 · 보류 사유) · `InboundProcessor`(Worker — 원문 보존 · `raw_input` · INBOUND 메시지 · 보류) · `InboundService` · `GET /communication/inbound` |
| `src/ai/` | **AI Server 클라이언트**(T-092): `ai-client.ts` — `POST /v1/extractions/reply`(HTTP · 시간 제한 · 응답 엄격 스키마 · 기술 실패 분류). 계약 견본 `packages/contracts/ai/` |
| `src/communication/` (추출) | **회신 추출**(T-092 U7): `extraction-rules.ts`(순수 — 질문 만들기 · 검증기 7종) · `ExtractionProcessor`(Worker — 정상 회신만, AI 호출은 트랜잭션 밖, 후보는 `extraction` 에만) · `ExtractionRepository` |
| `src/dev/` | 개발 전용 도구 — `mock-reply.ts`(`npm run mock:reply`, production 거부) |
| `src/channel/` | **채널 어댑터**(T-090 · T-091 `fetchInbound`): `ChannelAdapter` 포트(`docs/18` J.1) · `MockChannelAdapter`(네트워크 없음 — 파일 보낸 편지함 `CERA_MOCK_CHANNEL_DIR`, 장애 주입 `CERA_MOCK_CHANNEL_FAULT`) |
| `src/registry/` | 등록부 조회 · **Contact Gate**(T-087 U2): `contact-gate.ts` 순수 판정(6조건 · 사유 6종 · 개발 안전장치) · `GET /registry/counterparties` · `GET /registry/addresses/{addressId}/eligibility` |
| `src/shared/` | `time/`(Instant · Clock) · `id/`(UUIDv7) · `money/`(Krw) · `hash/`(SHA-256 · JCS) · `context/`(request/trace/correlation id) · `errors/` |
| `src/http/` · `src/health/` | 요청 문맥 미들웨어 · 공통 오류 응답 · `/health` |
| `test/unit/` · `test/db/` | 단위 시험 · 로컬 PostgreSQL 시험. DB 시험은 `global-setup` 이 **빈 `cera_test` 에 M01→M11 을 처음부터** 적용하고, `schema-catalog` 시험이 `docs/24` 22절과 컬럼 349개를 대조한다 |

아래는 **설계상 책임**이다.

앞으로 이 영역이 맡을 일 (설계: `docs/07_backend-architecture.md`, `docs/05_event-and-state.md`, 저장 구조: `docs/22_cera-logical-data-model.md`):

- API (화면용 조회 API 계약: `docs/16_frontend-prototype.md` 5절, `docs/07_backend-architecture.md` 5절)
- 인증·권한
- DB와 Event 저장(append-only), Canonical State 물질화
- 외부 연동: Channel Adapter(가상 메일함 → Gmail 등), OAuth, Outbox·발송 시도, 수신 원문 보존, 발신자 등록부로 역할·권한 판정, 공공 API, 파일 업로드
- LLM 추출 결과의 검증(인용·스키마·단위)과 사건 생성 — 추출 자체는 `ai/`
- 사람 승인(계획 결정, 발송 승인)과 감사 로그
- 오류 처리·관측성: 공통 오류 처리, 구조화 로그, `request_id`·`trace_id`, 중요한 오류의 `system_error` 기록(`docs/23` 4~6절)
- **결정론 엔진**: Reconciliation·Tariff·LFD·비용·위험·복구 최적화·Solver (ADR-029). 순수 함수로 두고 DB·네트워크·LLM 을 import하지 않는다
- 백그라운드 작업, 화면으로 변경 알림(push)

**Main Backend = TypeScript + NestJS**(ADR-033 Accepted, 2026-09-21) — 모듈형 모놀리스, 같은 코드베이스의 API + Worker 프로세스. DB = **PostgreSQL + Drizzle ORM + drizzle-kit 검토 SQL migration**(ADR-034 Accepted, 2026-09-22 — SQLite 미사용, 스키마·migration 소유자는 이 영역). 미확정 사항: 물리 설계(T-080), 솔버 실행 위치(Q-65, Slice 1 을 막지 않음), 메일 연동 방식(Q-33). 구현: T-085(U0 뼈대) → T-086(U1 영속 기반) → U2(T-087)부터 업무 기능.

위험·비용·Tariff·최적화 같은 결정론 엔진은 **이 영역(`back/`)에 둔다**(ADR-029). `ai/`는 LLM·비정형 처리만 맡는다(`ai/README.md`). 화면과 주고받는 계약은 이 영역의 API 명세(OpenAPI)를 정본으로 삼는다(ADR-028, `packages/README.md`).
