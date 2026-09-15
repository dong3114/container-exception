# back/ — CERA Backend 영역

**현재 구현 전.** 코드, 프로젝트 설정(pyproject 등), DB 스키마는 아직 없다.

앞으로 이 영역이 맡을 일 (설계: `docs/07_backend-architecture.md`, `docs/05_event-and-state.md`):

- API (화면용 조회 API 계약: `docs/16_frontend-prototype.md` 5절, `docs/07_backend-architecture.md` 5절)
- 인증·권한
- DB와 Event 저장(append-only), Canonical State 물질화
- 외부 연동: 메일(Gmail 등), 공공 API, 파일 업로드
- 사람 승인(계획 승인, 발송 승인)과 감사 로그
- 백그라운드 작업, 화면으로 변경 알림(push)

미확정 사항: 언어·프레임워크(ADR-002 — Python/FastAPI 후보), DB(ADR-004 — SQLite로 시작 후 PostgreSQL 후보), 메일 연동 방식(Q-33). 착수 태스크는 T-003(저장소 초기화)이며 사람 검토(T-001) 뒤에 한다.

위험·비용·Tariff·최적화 같은 결정 엔진은 `ai/`에 둔다(`ai/README.md`). 화면과 주고받는 계약은 이 영역의 API 명세(OpenAPI)를 정본으로 삼는 방향이다(`packages/README.md`).
