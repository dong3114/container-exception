# ai/ — CERA AI / Decision Engine 영역

**현재 구현 전.** 코드, Python 환경, LLM SDK, Solver(OR-Tools 등)는 아직 없다.

"AI"라는 이름이지만 **LLM만 들어가는 곳이 아니다.** 판단을 돕는 두 종류의 코드가 여기에 온다.

| 종류 | 후보 책임 | 성격 |
| --- | --- | --- |
| LLM 기반 해석 | LLM Provider, 메일 회신 파서, 계약서 파서, 구조화 추출, 결과 설명 문장 | 결과는 **후보**다. 사람 확인 전에는 확정되지 않는다(ADR-008) |
| 결정론 엔진 | Tariff·LFD, 비용(Cost), 위험(Risk), 복구 최적화(Recovery Optimization), Solver | 같은 입력이면 같은 결과. 숫자는 여기서만 나온다 |

규칙 (`docs/01_project-rules.md` 3절):
- 결정론 엔진(tariff·cost·risk·optimize)은 LLM 클라이언트를 import하지 않는다. 같은 `ai/` 안에서도 두 종류는 서로 다른 패키지로 나눈다.
- 엔진 입력은 Planning Snapshot(`docs/05_event-and-state.md` 14절)이고, `as_of`를 주입받는다.

미확정 사항: 솔버 선택(ADR-007, Q-35 — CP-SAT는 후보일 뿐), 최적화 수식(T-036, 현재 DEFERRED), 위험 모델(T-035), Tariff 규칙(T-029·T-033), LLM 추출 계약(T-034).

지금 화면의 위험·비용·계획 v1·v2는 이 영역의 결과가 아니라 `data/scenarios/`에 적어 둔 시나리오 값이다.
