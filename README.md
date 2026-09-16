# CERA — Container Exception Recovery Agent

부산항 수입 컨테이너 운영에서 여러 곳(공공 API, 메일, 계약서, 현장 담당자)에 흩어진 사실을 모아 **지금 무엇을 믿을 수 있는지** 정리하고, 예외(창고 수용량 급감, D&D 마감 임박 등)가 생기면 트럭·ODCY·창고 제약 안에서 **총비용이 가장 적은 복구 계획**과 연락 초안을 사람 승인 아래 돕는 시스템이다.

> 현재 상태 (2026-09-16): **웹 Control Tower Prototype만 실제로 동작한다.** 30대 가상 시나리오를 재생해 보여 주며, 화면의 위험·비용·계획·메일은 모두 시나리오에 적어 둔 값(SIMULATED)이다. Backend·DB·LLM·Solver·Gmail 연동은 아직 코드가 없다.
>
> 다음 단계는 **외부 연락 루프**(문의 초안 → 사람 승인 → 실제 발송 → 회신 → 구조화 → 상태 반영)다. 설계와 책임 경계는 확정했고(`docs/18_external-communication.md`), 지금은 **구현 계획을 쓰는 단계**다.

## 저장소 구조

CERA는 **하나의 Private Monorepo**로 관리한다. Git 저장소는 하나이고, 안에서 코드 책임 영역만 나눈다. 배포할 때는 서비스별 Docker Image로 나눌 수 있으므로 Git 저장소를 나눌 필요는 없다(ADR-024).

| 폴더 | 무엇을 담당하나 | 지금 실제 상태 |
| --- | --- | --- |
| `front/` | 사용자에게 보이는 화면 | `front/web/`에 Next.js Control Tower Prototype **있음** |
| `back/` | 중앙 API, DB, Event 저장, 외부 연동(메일 등), 승인·감사, 그리고 **모든 결정론 계산**(Reconciliation·Tariff·비용·위험·최적화·Solver) | 구현 전 (README만) |
| `ai/` | **LLM·비정형 처리만**: 메일 회신·계약서 해석, 문의 문장 작성, 결과 설명. 위험·비용·최적화는 여기 있지 않다 | 구현 전 (README만) |
| `packages/` | front·back·ai가 함께 쓰는 계약(API 스키마, 공유 타입) | 비어 있음 (README만) |
| `data/` | 공통 시나리오·테스트 데이터 | `data/scenarios/busan-wh-capacity-01/` 30대 시나리오 **있음** |
| `docs/` | 제품·기술 정본 문서, 설계 결정(ADR), 작업 큐·로그 | **있음** — 색인은 `docs/README.md` |
| `infra/` | 배포 구성(Docker, 클라우드) | 구현 전 (README만) |

- AI 개발 도구(Claude Code, Codex 등)는 루트의 `AGENTS.md`부터 읽는다. `CLAUDE.md`는 `AGENTS.md`를 가져온다.
- **`ai/`와 `back/`의 경계 (ADR-029)**: AI를 쓰는 기준은 *"값이 자주 바뀌는가"*가 아니라 **"입력이 비정형이고 해석이 필요한가"**다. 메일 본문·계약서처럼 사람이 자유롭게 쓴 글만 AI가 읽고, 응답 폼·포털·TMS·CSV처럼 이미 구조화된 입력은 Backend가 검증만 한다. 위험·비용·최적화는 규칙과 계수로 답이 정해지므로 결정론 계산이며 AI가 아니다. 전체 책임 경계표는 `docs/18_external-communication.md` O절. **폴더 배치 적용은 Backend 뼈대를 만들 때(T-003)이고, `ai/README.md`·`back/README.md`는 아직 옛 설명이다.**
- 향후 방향(미확정): Frontend는 **Web 우선**. 현업 담당자용 Desktop 앱은 필요성이 검증되면 기존 React 화면을 **Tauri로 재사용하는 방안을 검토**한다(확정 기술 아님).

## 실행 (Frontend Prototype)

Node.js 22 기준.

```bash
cd front/web
npm install

npm run dev                 # 개발 서버 → http://localhost:3000

npm run build               # 또는 프로덕션 빌드 후 실행
npm run start               # → http://localhost:3000
```

검사:

```bash
cd front/web
npm run validate:scenario   # 시나리오 데이터 합계·용량·KPI·금지 표현 검사
npm run typecheck
npm run lint
npm run smoke               # 서버를 띄운 상태에서 브라우저(Edge/Chrome)로 9단계 재생 확인
```

화면에서 **Play Scenario** 또는 **다음 이벤트**를 누르면 정상 운영 → 창고 장애(20 → 8) → 복구 계획 v1 → 운송사·ODCY 회신 → 재계획 v2 순서로 재생된다. 자세한 내용은 `docs/16_frontend-prototype.md`.

## Development Workflow

여러 AI 도구(Claude, Codex, ChatGPT, Antigravity)를 역할별로 쓰되, 인수인계는 대화가 아니라 Git 안의 문서로 한다.

| 문서 | 역할 |
| --- | --- |
| `AGENTS.md` | 전체 작업 규칙 (모든 AI 도구가 먼저 읽음) |
| `docs/tasks/CURRENT.md` | **현재** 진행 중인 작업의 인수인계 |
| `docs/tasks/QUEUE.md` | **예정** 작업 |
| `docs/tasks/LOG.md` | **끝난** 작업 기록 |

상세: `docs/17_ai-development-workflow.md`. 사용자 승인 없이 commit·push 하지 않는다.

## 규칙 요약

- 확인되지 않은 물류 현실을 추측해 사실처럼 쓰지 않는다. 값에는 검증 태그(`[VERIFIED]` `[ASSUMPTION]` `[TO VERIFY]`)를 붙인다.
- 숫자(비용·배정)는 결정론 엔진에서만 나온다. LLM은 해석·초안·설명만 하고, 결과는 사람 확인 전 후보다.
- 외부 연락·실행은 사람 승인 뒤에만 한다.
- Mock·Simulated 값과 실제 값을 화면과 데이터에서 구분한다.
- 비밀정보(API 키, OAuth 토큰), 실제 B/L·메일 원문은 커밋하지 않는다.

전체 규칙: `AGENTS.md`, `docs/01_project-rules.md`.
