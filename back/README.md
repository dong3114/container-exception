# back/ — CERA Backend 영역

**현재 구현 전.** 코드, 프로젝트 설정, DB 스키마는 아직 없다. 아래는 **설계상 책임**이다.

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

미확정 사항: **언어·프레임워크**(현재 우선 후보 NestJS + TypeScript, Spring Boot·Python/FastAPI(ADR-002) 후보 유지 — T-069 뒤 사용자 결정, `docs/23` 3절), DB 제품(ADR-004 초안: SQLite → PostgreSQL), 솔버 실행 위치(Q-65), 메일 연동 방식(Q-33). 구현은 T-069 구현 계획이 승인된 뒤 시작한다(뼈대 T-003 의 선후는 T-069 가 정한다).

위험·비용·Tariff·최적화 같은 결정론 엔진은 **이 영역(`back/`)에 둔다**(ADR-029). `ai/`는 LLM·비정형 처리만 맡는다(`ai/README.md`). 화면과 주고받는 계약은 이 영역의 API 명세(OpenAPI)를 정본으로 삼는다(ADR-028, `packages/README.md`).
