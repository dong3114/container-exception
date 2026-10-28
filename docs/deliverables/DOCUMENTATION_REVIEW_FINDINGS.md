# DOCUMENTATION REVIEW FINDINGS (2026-10-28)

| 항목 | 내용 |
| --- | --- |
| 상태 | 보고만 — **코드 · 기존 문서는 고치지 않았다**(Backend Core FROZEN). 조치 여부는 사용자 결정 |
| 기준 | HEAD `5881529` · 산출물 작성 중 코드 · 스키마 · 계약 · 기존 문서를 대조하며 발견 |
| 관련 | [문서 INDEX](CERA_DOCUMENT_INDEX.md) |

## 1. 코드 · 설정 관찰 (버그로 단정하지 않음)

| # | 발견 | 근거 | 영향 · 판단 |
| --- | --- | --- | --- |
| F-1 | AI Server 의 `POST /v1/extractions/reply` 는 서비스 토큰을 검사하지 않는다(Agent `start` · `resume` 은 Bearer 토큰 검사) | `ai/cera_ai/app.py` | 낮음 — 로컬은 루프백 바인딩(127.0.0.1:8100), 공개 배포는 내부망이라 외부에서 닿지 않는다. 네트워크 경계가 깨지면 누구나 추출 요청(비용 발생 가능 — live 모드일 때)을 보낼 수 있다 |
| F-2 | 원문 파기 기능(`ContentService.purgeRecorded`)을 부르는 곳이 없다 — 자동 보존 기간 정책 없음 | `back/src/content/content-service.ts` · 호출처 검색 0 | 실제 메일 원문을 운영할 때 보존 정책 결정 필요[미확정] |
| F-3 | `verification_request_handling` 표 · 가드는 있으나 사람용 API 가 없다 | migration · Controller 목록(부록 B) | 충돌 해소는 사실 확인 · 정정으로만 가능 |
| F-4 | 코드값만 있고 구현이 없는 값: `VALUE_STATUS.INFERRED`(판정 규칙이 만들지 않음) · `CHANNEL_TYPE.PORTAL` · `PUBLIC_DATA_PROVIDER.UNIPASS` · `RUN_TRIGGER_TYPE` 중 `FACT_CORRECTION` · `CONSTRAINT_CHANGE` · `REPLY_RECEIVED` · `SCHEDULED`(코드에서 쓰는 곳 없음 — 시드 · 예외 탐지기(T-132)는 `EXCEPTION_DETECTED`, 사람이 만든 실행은 `OPERATOR_REQUEST`) | `codes.ts` · 사용처 검색 | 문서에 [향후] 로 표시. 화면 · 시험이 이 값을 기대하지 않는지 확인 권장 |
| F-5 | 추출 "시도" 이력은 별도 컬럼 없이 감사 · `system_error` · `extraction_retry_request` 에서 조합된다 | `extraction` 표 컬럼 · API 응답 `attempts` | 분석(성공률 등)을 하려면 조합 규칙을 알아야 한다 |
| F-6 | 요청 한도 · 로그인 실패 수 · 하루 Agent 한도가 프로세스 메모리에 있다 | `http/public-guards.ts` · `auth.service.ts` | 단일 API 전제에서는 문제 없음 — 다중 인스턴스 시 [향후] |
| F-7 | (T-133 E2E 에서 관찰) 등록부에 복구 대안(ODCY · 트럭 풀)이 하나도 없고 요율도 없는 새 환경에서 Agent 를 시작하면 물을 공백 없이 비용 계산으로 가 `CAPABILITY_NOT_AVAILABLE` 로 실행이 `FAILED` 로 끝난다 | Staging E2E · `agent_step` | 업무 로직(FROZEN)이라 고치지 않음 — Staging 첫 준비 때 시설 · 트럭 풀 · 요율을 먼저 넣으면 정상 흐름(연락처 등록 대기). "준비 안 됨"을 사람 대기로 둘지는 사용자 결정 |

## 2. 기존 문서와 현재 구현의 불일치 (기존 문서는 고치지 않음)

| # | 문서 | 불일치 | 현재 구현 |
| --- | --- | --- | --- |
| D-1 | `AGENTS.md` 1절 "현재 단계" 첫 줄 | "U0 · … · U7 완료", 코드 행에 `ai/` 가 "README만 있는 빈 책임 영역" | 실제로는 T-131 까지 구현 · AI Server 동작 |
| D-2 | `AGENTS.md` 6절 Agent Tool 설명 | 모든 Tool 호출에 `Idempotency-Key` 가 필요한 것처럼 읽힘 | 계약상 변경 Tool(`create_inquiry_draft` · `request_approval` · `propose_recovery_plan`)만 필수 |
| D-3 | `docs/03_requirements.md` · `docs/19` | 설계 시점 요구사항 ID(FR-OPR · FR-NTF · FR-UI 등)에 미구현 항목 포함 | 구현 기준 ID 는 [02](02_requirements-analysis.md) — 대응은 비고 열 |
| D-4 | `docs/13_glossary.md` | 설계 시점 용어 | 코드값 기준 용어는 [11](11_glossary.md) |
| D-5 | `docs/24` 머리말 | "Slice 1 P0 29표" 등 당시 범위 | 현재 54표 · M40(22절 표별 명세는 시험이 대조해 최신) |
| D-6 | `README.md`(T-131 전 판 기준 설명) | — | T-131 에서 이미 다시 썼다(현재 일치) |
