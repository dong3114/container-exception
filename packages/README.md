# packages/ — 공유 계약 영역

**`contracts/openapi.json`** — Main Backend 가 **생성한** OpenAPI 문서(T-086 U1 · T-087 U2: health + 등록부 · 발송 자격 + 공통 오류 스키마). 손으로 고치지 않는다: `back/` 에서 `npm run openapi:emit` 으로 다시 만들고, DB 시험이 최신인지 검사한다.

**`contracts/openapi.d.ts`** — 위 문서에서 **생성한** TypeScript 타입(openapi-typescript, T-087). `front/web/` 에서 `npm run openapi:types` 로 다시 만들고, 프론트 시험이 최신인지 검사한다. 프론트는 `@contracts/openapi` 로 import 한다. 순서: `back` `openapi:emit` → `front/web` `openapi:types` → 둘 다 커밋.

front·back·ai가 함께 쓰는 계약을 둘 자리다: API 스키마, OpenAPI에서 생성한 클라이언트, 공유 타입.

현재 화면용 계약은 `front/web/src/contracts/cera.ts`(TypeScript, 손으로 작성)에 있다. 이번에는 옮기지 않는다.

향후 방향 (Backend를 실제로 만들 때 확정):
- Backend의 **OpenAPI 명세를 계약의 정본**으로 삼는다.
- Frontend TypeScript 타입은 OpenAPI에서 **자동 생성**해 여기에 두고, `cera.ts`의 손 작성 타입을 대체한다. Backend 언어가 무엇이 되든(미결 — `docs/23` 3절) 같은 계약이 두 벌 생기지 않게 하기 위해서다.
- Desktop 앱(검토 중 — Web First, 첫 후보 Electron, `docs/23` 8~9절)이 생기면 같은 계약·클라이언트를 공유한다.
- 외부 통신 슬라이스부터 OpenAPI 정본 전환을 시작한다(ADR-028). 오류 응답 모양(코드 · 문장 · `request_id`)도 계약에 들어간다(`docs/23` 12절).
