# back/ — CERA Backend 영역

**U0(T-085) 뼈대가 있다** — NestJS API · Worker 진입점, PostgreSQL(Drizzle) 연결, 설정 검증, Clock · UUIDv7 · KRW(bigint) · SHA-256/JCS · 트랜잭션 경계 · 요청/추적/업무 상관 id · 공통 오류 · health. **제품 스키마(P0 29표)와 업무 기능은 아직 없다**(U1 이후). 명령은 `AGENTS.md` 6절.

| 경로 | 무엇 |
| --- | --- |
| `src/main.ts` · `src/worker.ts` | API 프로세스 · Worker 프로세스 진입점(같은 코드베이스 — ADR-033) |
| `src/config/` | 환경변수 검증(zod) |
| `src/db/` | Pool · Drizzle · `TransactionRunner`(외부 I/O 는 트랜잭션 밖 — `assertOutsideTransaction`) · `migrate.ts` · `schema/`(U1) |
| `src/shared/` | `time/`(Instant · Clock) · `id/`(UUIDv7) · `money/`(Krw) · `hash/`(SHA-256 · JCS) · `context/`(request/trace/correlation id) · `errors/` |
| `src/http/` · `src/health/` | 요청 문맥 미들웨어 · 공통 오류 응답 · `/health` |
| `test/unit/` · `test/db/` | 단위 시험 · 로컬 PostgreSQL 시험(일회용 스키마 `cera_spike_*`) |

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

**Main Backend = TypeScript + NestJS**(ADR-033 Accepted, 2026-09-21) — 모듈형 모놀리스, 같은 코드베이스의 API + Worker 프로세스. DB = **PostgreSQL + Drizzle ORM + drizzle-kit 검토 SQL migration**(ADR-034 Accepted, 2026-09-22 — SQLite 미사용, 스키마·migration 소유자는 이 영역). 미확정 사항: 물리 설계(T-080), 솔버 실행 위치(Q-65, Slice 1 을 막지 않음), 메일 연동 방식(Q-33). 구현은 T-080 뒤 T-085(U0 뼈대)부터 시작한다.

위험·비용·Tariff·최적화 같은 결정론 엔진은 **이 영역(`back/`)에 둔다**(ADR-029). `ai/`는 LLM·비정형 처리만 맡는다(`ai/README.md`). 화면과 주고받는 계약은 이 영역의 API 명세(OpenAPI)를 정본으로 삼는다(ADR-028, `packages/README.md`).
