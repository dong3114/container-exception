# packages/ — 공유 계약 영역

**`contracts/openapi.json`** — Main Backend 가 **생성한** OpenAPI 문서(T-086 U1 · T-087 U2: health + 등록부 · 발송 자격 + 공통 오류 스키마). 손으로 고치지 않는다: `back/` 에서 `npm run openapi:emit` 으로 다시 만들고, DB 시험이 최신인지 검사한다.

**`contracts/openapi.d.ts`** — 위 문서에서 **생성한** TypeScript 타입(openapi-typescript, T-087). `front/web/` 에서 `npm run openapi:types` 로 다시 만들고, 프론트 시험이 최신인지 검사한다. 프론트는 `@contracts/openapi` 로 import 한다. 순서: `back` `openapi:emit` → `front/web` `openapi:types` → 둘 다 커밋.

**`contracts/conformance/extraction-validator.v1.json`** — 회신 추출 검증기의 **판정 정답 파일**(T-099). 정본은 Backend 의 TypeScript 검증기(`back/src/communication/extraction-rules.ts`)이고, 이 파일은 그 **출력**이다. 평가 도구(`ai/cera_ai/evals/scoring.py backend_checks`)의 Python 포팅이 같은 판정을 내는지 검사하려고 둔다. 손으로 고치지 않는다.
- TypeScript 검증기를 고치면 `back/` 에서 `npm run validator-conformance:emit` → 파일이 바뀌고, 안 바꾸면 Backend 시험(`validator-conformance.test.ts`)이 깨진다.
- 파일이 바뀌면 Python 포팅이 달라져 `ai/tests/test_validator_conformance.py` 가 깨진다 → 포팅을 맞춘다. Python 이 정본이 아니다.

front·back·ai가 함께 쓰는 계약을 둘 자리다: API 스키마, OpenAPI에서 생성한 클라이언트, 공유 타입.

현재 화면용 계약은 `front/web/src/contracts/cera.ts`(TypeScript, 손으로 작성)에 있다. 이번에는 옮기지 않는다.

향후 방향 (Backend를 실제로 만들 때 확정):
- Backend의 **OpenAPI 명세를 계약의 정본**으로 삼는다.
- Frontend TypeScript 타입은 OpenAPI에서 **자동 생성**해 여기에 두고, `cera.ts`의 손 작성 타입을 대체한다. Backend 언어가 무엇이 되든(미결 — `docs/23` 3절) 같은 계약이 두 벌 생기지 않게 하기 위해서다.
- Desktop 앱(검토 중 — Web First, 첫 후보 Electron, `docs/23` 8~9절)이 생기면 같은 계약·클라이언트를 공유한다.
- 외부 통신 슬라이스부터 OpenAPI 정본 전환을 시작한다(ADR-028). 오류 응답 모양(코드 · 문장 · `request_id`)도 계약에 들어간다(`docs/23` 12절).


## AI 회신 추출 계약 (`contracts/ai/`)

현재판은 `reply-extract.v2.*`(T-111 — 답의 날짜 칸 `DATE` · `reply_date` · `timezone`). `python -m cera_ai.emit_schema` 가 v2 스키마를 쓴다. `reply-extract.v1.*` 는 기록으로 남기며 AI Server 는 v1 요청도 받는다(평가 데이터셋 · 옛 녹화 호환). 모델이 낸 날짜는 후보이고 Backend 가 인용에서 다시 계산한다(`back/src/truth/date-scope.ts`).
