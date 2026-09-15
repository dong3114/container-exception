# packages/ — 공유 계약 영역

**현재 비어 있다.**

front·back·ai가 함께 쓰는 계약을 둘 자리다: API 스키마, OpenAPI에서 생성한 클라이언트, 공유 타입.

현재 화면용 계약은 `front/web/src/contracts/cera.ts`(TypeScript, 손으로 작성)에 있다. 이번에는 옮기지 않는다.

향후 방향 (Backend를 실제로 만들 때 확정):
- Backend의 **OpenAPI 명세를 계약의 정본**으로 삼는다.
- Frontend TypeScript 타입은 OpenAPI에서 **자동 생성**해 여기에 두고, `cera.ts`의 손 작성 타입을 대체한다. Python과 TypeScript에 같은 계약이 두 벌 생기지 않게 하기 위해서다.
- Desktop 앱(검토 중)이 생기면 같은 계약·클라이언트를 공유한다.
