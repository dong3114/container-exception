# 작업 인계 로그

- 새 항목은 **맨 위**에 추가한다. 기존 항목은 수정하지 않는다(append-only).
- 다음 에이전트는 최근 3개 항목을 읽고 시작한다.

## 템플릿

```markdown
## YYYY-MM-DD · T-NNN · 에이전트명
- 상태: 완료 | 중단 | 차단
- 한 일:
  - ...
- 변경 파일:
  - ...
- 검증: 실행한 테스트·확인 방법과 결과
- 남은 일 / 다음 한 걸음:
  - ...
- 큐 변경: 추가·상태변경한 태스크 ID
- 주의사항: 다음 작업자가 알아야 할 것
```

---

## 2026-09-16 · T-071 External Communication 구현 전 요구사항 명세 · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 사람 검토·승인 대기**). 기준 커밋 `2c37c28` 위의 문서 변경만. 제품 코드 0건
- 지시: 아키텍처·책임 경계가 확정됐으니 "무엇을 구현해야 하는지 / 어떤 상태가 있어야 하는지 / 어떤 입력과 결과가 필요한지 / 어떤 실패를 처리해야 하는지 / 언제 완료로 볼지"를 **구현 계획을 세울 수 있을 만큼** 구체화. **구현 기술은 고정하지 말 것**
- 한 일:
  1. **`docs/19_external-communication-requirements.md` 신규.** `18`(왜 이 구조인가)과 역할을 분리하고 내용을 복사하지 않았다. 사용자 흐름 A~J를 기술 용어 없이 먼저 적고, 그 아래 요구사항을 ID로 붙였다
  2. **요구사항 그룹 9개 신설**: `FR-CPY`(거래처·연락처·주소) `FR-EVF`(이메일 확인) `FR-ELG`(발송 자격) `FR-APV`(승인) `FR-SND`(실제 발송) `FR-INB`(회신 수신) `FR-XAI`(AI 추출 계약) `FR-STC`(구조화 채널) `FR-EVL`(사건·상태 반영). 기존 그룹 확장: `FR-COM-04~` `FR-UI-09~` `FR-AUD-02~` `NFR-12~30`. `03`의 `FR-<그룹>-NN` 체계를 그대로 따랐다
  3. **실패·예외 35+ 상황 표**(상황 → 시스템 행동 → 사용자 화면 → 재시도 가능 → 사람 확인 필요). 지시받은 목록에 더해 직접 찾은 것: 같은 주소가 두 거래처에 등록, 첨부만 있고 본문 없음, 발송 기능이 꺼져 있음, 회신 없이 기한 경과, 인증 문제와 개별 실패의 구분
  4. **사용자에게 보이는 상태 이름**을 내부 enum보다 먼저 고정(메시지 8개·묶음 7개·주소 6개)
  5. **완료 조건 34개 체크리스트**, **우선순위 3단계**(첫 구현 / 다음 / 나중), **화면 매핑**(연락 루프와 그 결과 자원 사실까지만 실제, 위험·비용·계획은 계속 시나리오)
  6. **열린 질문 재분류**: 구현 전 필수(Q-44 근거 시각, Q-45 보관 기간) / 구현 중 사례 보고 결정(M-6, Q-47, Q-48) / 범위 밖(Q-46) / 신규 Q-49~Q-52
  7. **Q-48(공용 업무 메일함) 분석**: 확인 절차·발송 자격·권한 판정에는 차이가 **없고**, 회신 발신자 처리·퇴사 처리·표시 이름에는 차이가 **있다**. 첫 구현을 막지 않으므로 구분 없이 진행하고 구현 형태는 확정하지 않았다
  8. **`docs/03` 모순 해소**: FR-ING-07(Gmail `Could/Pilot` → `Must`/Tech Validation), FR-COM-02("가상 메일함만" → Tech Validation부터 실제 발송), FR-ING-05(발신자 분류는 등록부 조회), FR-RSP-01(추출과 Event 생성의 주체 분리), NFR-03(검증 기준 3개로 구체화)
- 핵심 원칙 (23절에 명시): **요구사항은 행동과 계약만 정의하고 구현 기술을 고르지 않는다.** AI 모델·공급자·버전·SDK, 외부 API 호출 순서, 인증·DB·큐 라이브러리, 솔버·최적화 방식, 데스크톱 기술, 배포 환경을 전부 열어 뒀다. 같은 행동을 여러 기술로 만들 수 있고 어느 것이 나은지는 만들기 직전 상황에 달려 있기 때문이다. 단 책임 경계·사람 승인 게이트·발송 자격·사건 설계·원문 보존·중복 발송 금지는 이미 정해졌고 바꾸지 않는다
- 변경 파일: 신규 `docs/19_external-communication-requirements.md` / 수정 `docs/03`, `docs/15`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: 제품 영역(`front/`·`back/`·`ai/`·`data/`·`packages/`·`infra/`) 변경 0건, 폴더 이동·패키지 설치·API·DB 생성 없음. 문서만 바꿔 코드 검증 명령은 돌리지 않음
- 남은 일 / 다음 한 걸음: **T-069 Implementation Plan.** 착수 전에 사용자에게 **Q-45·Q-44**를 먼저 묻는다
- 큐 변경: T-071 DONE 추가. T-069가 다음 1순위(입력이 `19` 24절 + `18` N절로 늘어남)
- 주의사항:
  - `19`는 **미커밋**이다. 사용자 승인 뒤 커밋한다
  - `19`가 외부 통신 요구사항의 **정본**이다. `03` 2.7절은 요약이고 19를 가리킨다
  - 계획에서 확정하면 안 되는 것: M-6, Q-46, `19` 23절 기술 선택 목록

## 2026-09-16 · T-068 External Communication Architecture RFC + AI/Backend 책임 경계 Audit · Claude Code (claude-opus-5)
- 상태: 완료 (사용자 승인 뒤 **커밋함**). baseline `5972420` 위의 문서 변경만. 제품 코드 0건
- 지시: ① Mock으로만 존재하던 외부 연락 루프(초안 → 사람 승인 → 발송 → 실제 회신 → 구조화 → Operational Event → 화면)를 구현 가능한 수준으로 설계 ② 같은 날 2차로 **AI/LLM과 Backend·결정론 엔진의 책임 경계 재정리** ③ 3차로 승인 결정 반영 + 문서 동기화 + 커밋. 구현·폴더 이동 금지
- 한 일:
  1. **RFC 작성** `docs/18_external-communication.md` (A~O절): 기능 흐름, Front/Back/AI 책임, 도메인 모델, 상태 전이, Event/State 연결, Gmail OAuth·최소 권한, 실패·중복·재시도, API 후보, Mock→Real 전환, MVP 범위, 미루는 것, 열린 결정, Planner Handoff, **O절 CERA 전체 책임 경계표**
  2. **책임 경계 Audit**: RFC 초안 자체에서 7건(LLM이 `entity_id`·`fact_key` 출력 / `send_allowlist`가 제품·개발 혼재 / 허용 조건 축이 "실제 현업인가" / 구조화 채널 분기 없음 / 회신 결과 단일 분류 / Contact 개념 부재 / 경계표 부재), 기존 정본에서 8건(`11` "모호하면 LLM 분류", `06` 10개 중 7개가 결정론인데 Agent, `04` LLM → DB 구조체 직결 도식, `07` 순수 엔진 중 `state`만 `back/`, 3개 README의 `ai/` 배정, `03` FR 3건, `02`·`09`·`10`·`12`의 Agent 표현) 발견. 고칠 수 있는 것은 고치고 나머지는 T-070으로
  3. **승인 결정 반영**: `01` 6·6.1절 **`Tech Validation` 단계 신설**(PoC "가상 메일함만" 규칙과의 충돌을 삭제가 아니라 단계 정의로 해소), `02` 6절 제품 단계, `01` 3절 LLM 사용 기준·금지 경계, ADR-026·027·028·029 **모두 Accepted**, ADR-024 `ai/` 영역 정의 개정 주석
- 핵심 결정:
  - **AI 사용 기준 = "입력이 비정형이고 해석이 필요한가"** (값이 자주 바뀌는가가 아님). 구조화 채널(폼·포털·TMS·CSV)은 LLM을 거치지 않는다. `Form → LLM → Structured Value` 금지
  - **발송 자격 = 거래처 → 담당 연락처 → 이메일 검증 → 관계 승인 → 통신 활성** (제품 게이트, 영구). 개발환경 수신자 제한은 **별개 장치**. 테스트 상대도 같은 검증 흐름을 쓴다(우회 경로 없음)
  - **`ai/`는 LLM·비정형 처리만.** 결정론 엔진(Tariff·Cost·Risk·Reconciliation·Optimize·Solver)은 Backend 영역. 새 `engine/`은 만들지 않음. 적용은 T-003
  - LLM 출력에서 `entity_id`·`fact_key`·역할·강도를 걷어냄. LLM은 `ask_id` + 값 + 원문 인용만 내고 Backend가 매핑
  - AI 책임 4가지는 **현재 MVP 허용 범위**이지 영구 고정 목록이 아니다
- 변경 파일: 신규 `docs/18_external-communication.md` / 수정 `docs/01`(6·6.1절 신설), `docs/02`(6절), `docs/04`(4.1), `docs/06`(1.1절 신설·2·7절), `docs/07`(6.1절 신설·4·6절), `docs/11`(5절), `docs/14`(ADR-024 주석 + ADR-026~029), `docs/15`(Q-44~Q-48), `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`
- 검증: `git status --porcelain -- front/ back/ ai/ data/ packages/ infra/` 결과 없음(제품 코드 무변경), `engine/` 미생성, remote 없음. 문서만 바꿔 코드 검증 명령은 돌리지 않음(baseline 검증은 2026-09-15 T-063 기준 유효)
- 남은 일 / 다음 한 걸음: **T-069 Implementation Plan** — `18` N절의 15가지에 답한다. 계획이 승인돼야 구현 시작
- 큐 변경: T-068 DONE, **T-069 신규(다음 1순위)**, T-070 신규(정본 잔여 반영). 2026-09-15 "Gmail·Backend 구현 금지" 지시는 이 Slice 범위에 한해 해제(Solver·T-036 금지는 유지)
- 주의사항:
  - **M-6**(값이 같은 새 회신의 신선도 갱신), **Q-46**(상대방 포털 입력의 Source 모델), **Q-48**(공용 업무 메일함 구분)은 **열린 상태**다. 구현 계획에서 확정하지 말 것
  - 새 문서·코드에서 결정론 모듈을 "Agent"라고 부르지 않는다. 기존 스키마명(`agent_activity`)·제품명은 개명하지 않았다
  - `ai/README.md`·`back/README.md`·루트 `README.md`의 영역 문구는 제품 폴더 안이라 손대지 않았다 → T-070

## 2026-09-15 · T-067 (사람 지시) AI 협업 개발 Workflow / Orchestrator Handoff · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**). baseline `5972420` 위의 문서 변경만
- 지시: Claude·Codex가 번갈아 Orchestrator를 맡고 ChatGPT(계획·리뷰)·Antigravity(구현)를 함께 쓸 때 방향이 흔들리지 않도록, 인수인계를 Git 문서로 정식화. 제품 기능 구현 금지
- 한 일:
  1. 기존 규칙 점검 후 충돌 4건을 통합: ① `AGENTS.md` 2절의 1회성 `HANDOFF.md` → `CURRENT.md`로 대체(옛 파일이 있으면 옮기고 삭제) ② 3.1절 이어받기 기준 "LOG 중단 인계" → "CURRENT가 IDLE이 아님" ③ 3.6절 중단 기록 → CURRENT ④ `docs/01` 8절 "태스크 완료 조건에 있을 때 커밋" 예외 → 사람 승인 뒤로 일원화
  2. 신규: `docs/17_ai-development-workflow.md`(역할, 정본 순서, 11단계 흐름과 작은 수정 간소화, Handoff 절차, QUEUE·CURRENT·LOG, ChatGPT·Antigravity 지시 최소 항목, Commit Gate), `docs/tasks/CURRENT.md`(Status IDLE — 가짜 Task 없이 현재 상태, 다음 Task 후보는 미확정으로), `docs/tasks/TASK_BRIEF_TEMPLATE.md`
  3. `AGENTS.md`: 읽는 순서에 CURRENT·git status, 3.2 착수 때 CURRENT Task Brief, 3.4 완료 때 CURRENT → LOG, 3.7 Orchestrator Handoff Rule, 규칙 10에 "승인" 추가, 문서 지도. `CLAUDE.md`: Claude 전용 메모 3줄(규칙 복제 없음). 루트 `README.md`: Development Workflow 짧은 표. ADR-025(Accepted, 사람 결정)
  4. CODEX.md·Antigravity 설정 파일은 만들지 않았다(모든 도구가 AGENTS.md·CURRENT.md를 읽는 구조)
- 변경 파일: 신규 `docs/17_ai-development-workflow.md`, `docs/tasks/CURRENT.md`, `docs/tasks/TASK_BRIEF_TEMPLATE.md` / 수정 `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/01_project-rules.md`, `docs/14_decisions.md`, `docs/README.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: `front/web/src`·`data/scenarios`·코드 파일 변경 없음(`git diff --name-status`로 확인). 새·수정 문서의 로컬 링크·경로가 실제 파일을 가리키는지 검사. Frontend 코드가 바뀌지 않아 build는 다시 돌리지 않음
- 남은 일 / 다음 한 걸음: 사람 — T-067 커밋 여부, 다음 제품 Task 선택(CURRENT Open Questions), T-064·T-001
- 큐 변경: T-067 추가·DONE, 사람 지시(Workflow) 추가, QUEUE 머리에 QUEUE·CURRENT·LOG 역할 구분
- 주의사항: 다음 세션(Claude든 Codex든)은 `AGENTS.md` → `docs/tasks/CURRENT.md` → `git status` 순서로 시작한다. CURRENT는 IDLE이며 T-067 변경이 커밋 승인 대기로 적혀 있다

## 2026-09-15 · T-066 (사람 지시) Private Monorepo 재정렬 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**)
- 지시: 저장소를 나누지 않고 하나의 Private Monorepo 안에서 `front/`·`back/`·`ai/`·`packages/`·`data/`·`docs/`·`infra/` 책임 영역으로 재정렬. 기능 추가·Backend·Gmail·LLM·Solver·Tauri 금지. Frontend Prototype을 깨뜨리지 않는 것이 최우선
- 한 일:
  1. 사전 확인: git 상태(미커밋 18개 변경 + 새 파일 40개, 약 2만 줄), 비밀정보 파일 없음, 커밋 제외 대상 5종 확인. 이동 전 파일 87개(node_modules·.next·.git 제외)의 SHA-256 목록을 세션 scratchpad에 기록
  2. 사용자가 띄운 `next start --port 3001`(web/에서 실행 중, 폴더 잠금 원인)을 사용자 승인 뒤 종료
  3. `web/` → `front/web/` 이동. `web/`은 한 번도 커밋되지 않은 폴더라 `git mv`가 불가능해 일반 이동(같은 드라이브 이름 변경)을 썼다. node_modules 21,299개 파일 포함 그대로 이동
  4. 경로 수정: `next.config.ts`(Turbopack root = 두 단계 위), `tsconfig.json`(`@scenario/*` → `../../data/scenarios/*`), `scripts/validate-scenario.mjs`(저장소 루트·금지 표현 검사 경로), `scripts/smoke-browser.mjs`(시나리오 경로), `src/data/mock/fixture.ts` 주석, `.gitignore`(`.next/`·`.smoke/`·`next-env.d.ts`를 위치와 무관한 패턴으로)
  5. 영역 생성: `back/`·`ai/`·`packages/`·`infra/`에 README.md만. 루트 `README.md` 신규. `AGENTS.md` 1.1절(저장소 구조), 4절 규칙 9(Mock/Simulated/Real 구분)·10(요청 없이 commit/push 금지), 6절 명령(`cd front/web`). `CLAUDE.md`에 구조 한 단락. ADR-024(Accepted, 사람 결정)
  6. 문서: `docs/07` 6절을 Monorepo 레이아웃 + 옛 `src/cera` 모듈의 back/ai 배치표로 교체, 3절에 "구현된 것은 프론트엔드 줄뿐" 명시. `web/` 경로 38곳을 `front/web/`으로(AGENTS·01·07·12·13·16·README·QUEUE·데이터 팩 README). LOG의 옛 항목과 ADR 본문은 규칙대로 고치지 않고 CHANGELOG 7절 경로 대응표에 `web/ → front/web/` 추가
  7. 오해 표현 정정: 시나리오 JSON 4개의 "LLM (녹화 재생)"·"LLM 추출 녹화값"·"녹화된 값" 17곳 → "SIMULATED — 시나리오 작성값 (LLM 미실행)" 계열. 숫자·구조 변경 없음. 문서의 "Three.js Operations Simulator"(02·03·10·12·AGENTS·docs/README) → "현재 Prototype 2D / Three.js는 향후 선택지"
- 변경 파일:
  - 이동: `web/**` → `front/web/**`
  - 신규: `README.md`, `back/README.md`, `ai/README.md`, `packages/README.md`, `infra/README.md`
  - 수정: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `front/web/{next.config.ts, tsconfig.json, scripts/validate-scenario.mjs, scripts/smoke-browser.mjs, src/data/mock/fixture.ts}`, `data/scenarios/busan-wh-capacity-01/{scenario, events, communications, resources}.json`·`README.md`, `docs/01·02·03·07·10·12·13·14·16`, `docs/README.md`, `docs/CHANGELOG.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
  - 삭제: 없음
- 검증 (`front/web`에서): `validate:scenario` 2,133개 통과(숫자 동일: Baseline 4,650,000 / v1 3,835,000 / v2 3,855,000), `typecheck` 통과, `lint` 경고 0, `build` 통과, `smoke`(Edge 헤드리스) 135개 항목 통과 — 30대·9단계·KPI·지도 경로별 칸 수·Recovery Console·v1/v2·Communications·Timeline·상세 서랍, 콘솔 오류 0. 이동 전후 파일 해시 대조로 유실 없음 확인
- 남은 일 / 다음 한 걸음:
  - 사람: 커밋 여부 결정(원격 백업 없음, 미커밋 약 2만 줄), T-064 Prototype 검토, T-001
  - 에이전트: 변화 없음(T-017·T-034·T-035 등 실행 가능)
- 큐 변경: T-066 추가·DONE, T-003 범위를 `back/`·`ai/` 뼈대로 조정, 사람 지시(Monorepo 유지) 추가
- 주의사항:
  - 이제 Frontend 명령은 모두 `front/web`에서 실행한다. 사용자가 쓰던 3001번 서버는 종료했으므로 `cd front/web && npm run start`로 다시 띄워야 한다
  - `front/web/.next/`(빌드 산출물)는 옛 경로가 들어 있어 이동 뒤 다시 빌드했다. 삭제하지 않았다
  - 남은 하드코딩(화면 문구·입고 예정 대수·시간대)은 이번 범위가 아니라 그대로다(감사 보고 F-4)

## 2026-09-15 · T-060~T-063 (사람 지시) Prototype-led Discovery — Event/State 마무리 + 30대 시나리오 + Control Tower Prototype · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 T-064 대기, **커밋하지 않음** — 사람 지시)
- 지시 (2026-09-14 퇴근 전 사람 지시, 2026-09-15 실행): T-036을 보류하고 30대 시나리오 + Next.js Control Tower Prototype을 먼저 만든다. Solver·Backend·DB·실연동·LLM 금지. 끝나면 멈춘다. 이 지시가 HANDOFF.md 5절 순서(T-001 판정 → T-036)보다 우선한다
- 변경 이유 (로드맵): 실제 운영 데이터와 제약이 검증되지 않은 상태에서 수학모델을 먼저 고정하면 가정을 과도하게 설계할 위험이 있다. Prototype-led Discovery를 실제 개발 순서에 적용한 것이며 기획 후퇴가 아니다(ADR-023)
- 한 일:
  1. **T-060** `05` 5.2: RECEIVED_ONLY → STALE 취급(T-032 패치 ③) 폐기. `freshness = UNKNOWN`, `temporal_confidence = LOW`, `evidence_time_quality = RECEIVED_ONLY`. 중요 사실이면 STALE처럼 게이트(`FRESHNESS_UNKNOWN`). `temporal_quality` → `evidence_time_quality` 이름 변경을 07·11·13·14에 전파. Event/State 설계 완료 상태로 표시
  2. **로드맵**: `12` 2.5절 Phase 0.5 추가, T-036 DEFERRED(삭제 아님), QUEUE에 `DEFERRED` 상태 추가, ADR-023
  3. **T-061** 30대 데이터 팩(JSON 9개): 영향 12대·직송 유지 8대·그 밖 10대, Reefer 4, 트럭 8대 근무 시간, ODCY A/B 제약, 회신 3건, Plan v1·v2, 위험 상태 4개, 확인 요청. 금액은 단가에서 합산(Baseline 4,650,000 / v1 3,835,000 / v2 3,855,000원)
  4. **T-062** Frontend Data Contract(`cera.ts`) + `CeraDataProvider` + MockProvider. 컴포넌트는 fixture를 import하지 않음
  5. **T-063** Control Tower(Next.js 16, 2D SVG), Reset·이전·다음·Play, 컨테이너 상세 서랍. 검증 스크립트 2개(`validate:scenario`, `smoke`)
  6. 문서: `16_frontend-prototype.md`(신규), `09` 0절, `10`·`07`·`03`·`01` 7절·`13`·`14`(ADR-022·023, ADR-014·016 주석)·`15`(Q-37~Q-43, Q-02)·`README`·`CHANGELOG` 갱신. `HANDOFF.md` 반영 후 삭제
- `[PROPOSED]` 시나리오 fixture 수정 이유 (09 예시값과 다름):
  - 예시 6,420,000 / 2,850,000 / 3,570,000원은 산식이 없다. 운송비 포함 TotalCost를 단가(`[ASSUMPTION]`)에서 합산했고, 예시를 맞추려 단가를 역산하지 않았다
  - 예시 배정 8/5/4/3(합 20)은 "원래 창고 대상 20대 배치"로 해석해 v1에 유지하고, "영향 12대 Recovery Actions"(5/4/3 = 12)를 따로 셌다 → Affected 12 = Actions 12
  - v2가 v1보다 20,000원 비싸다(절감 815,000 → 795,000). v1이 가정한 ODCY A 5대가 회신에서 4대라 1대가 실행 불가였고, 운송사 추가 트럭으로 C008을 옮겨 일부 만회했다. "회신이 계획 가정을 바로잡는다"는 장면으로 의도했다(Q-43)
  - 회신 11:40~11:50 → 11:15~11:20 (지시 타임라인), D0 10/05(대체공휴일) → 10/13(화), Reefer 4대 추가(지시 요구, "ODCY 불가 → 직송"으로만 사용)
- 변경 파일:
  - 신규: `docs/16_frontend-prototype.md`, `data/scenarios/busan-wh-capacity-01/` (scenario·containers·resources·events·risk·plans·communications·activity·verifications `.json`, `README.md`), `web/` (package.json·package-lock.json·tsconfig.json·next.config.ts·eslint.config.mjs, `src/app/`·`src/contracts/`·`src/data/`·`src/components/`, `scripts/validate-scenario.mjs`·`scripts/smoke-browser.mjs`)
  - 갱신: `docs/01_project-rules.md`, `03_requirements.md`, `05_event-and-state.md`, `07_backend-architecture.md`, `09_mvp-scenario.md`, `10_simulation-spec.md`, `11_data-sources.md`, `12_roadmap.md`, `13_glossary.md`, `14_decisions.md`, `15_open-questions.md`, `README.md`, `CHANGELOG.md`, `tasks/QUEUE.md`, `tasks/LOG.md`, `AGENTS.md`, `.gitignore`
  - 삭제: `HANDOFF.md` (1회성 인계, 내용은 QUEUE·LOG·docs에 있음)
- 검증:
  - `npm run validate:scenario` 통과 (2,133개 검사: 비용 항목·계획 합계, 절감 = Baseline − Plan, 20대·12대 합, ODCY 용량·규격·최대 보관일, 창고 일자별 용량, 트럭 근무 시간·중복·당일 마감, K운송 트럭 시점, KPI = 위험 상태, 확인 대기 수, ISO 6346, +09:00, KRW 정수, 금지 표현)
  - `npm run typecheck`, `npm run lint`(경고 0), `npm run build` 통과
  - `npm run smoke` (Edge 헤드리스, `next start`): 9단계 전부 시계·KPI 6개·예외·계획 비용·절감·조치 12행·"= 12대"·지도 경로별 칸 수를 fixture와 대조 통과, S5 재계획 경고·S7 변경 표시·C007/C003 상세·Reset·Play 확인, 콘솔 오류 0. 스크린샷을 직접 보고 레이아웃 수정(Recovery Console 전체 폭, 표 줄바꿈, 입항 전 컨테이너를 터미널 밖으로)
- 남은 일 / 다음 한 걸음:
  - 사람: **T-064** Prototype 검토(실행법 `16` 3절), ADR-022·023 판정, 커밋 여부. T-001도 여전히 대기
  - 에이전트(검토 뒤): T-065 → T-036 재개. 병행 가능: T-017(인터뷰 가이드), T-034, T-035
- 큐 변경: T-060·T-061·T-062·T-063 DONE, T-064(NEEDS_HUMAN)·T-065 추가, T-036 DEFERRED(재개 조건 T-064·T-065), T-037 범위 조정(T-061 위에 정식 Event fixture), T-017 의존 T-037 → T-063, T-003 web 항목 선행 완료 표시, 상태 규칙에 DEFERRED
- 주의사항:
  - 데이터 팩 JSON은 세션 scratchpad의 작성 스크립트로 한 번 생성했다(커밋 안 함). 이제 JSON이 정본이며, 고칠 때는 JSON을 직접 고치고 `validate:scenario`로 합계를 확인한다
  - 화면 숫자는 엔진 결과가 아니다(`SCENARIO_RESULT`). "Solver가 계산했다" 류 표현은 validator가 막는다
  - ESLint 10은 `eslint-config-next` 16.3.5의 react 플러그인과 호환되지 않아 9를 쓴다(설치 시 deprecated 경고는 무시해도 됨)
  - `web/.smoke/`(스크린샷), `.next/`, `node_modules/`는 `.gitignore`
  - 사람 지시로 Backend·Solver·Phase 1 코드로 넘어가지 않았다

## 2026-09-11 · T-032 패치 (사람 조건부 승인 후 4개 수정) · Claude Code (claude-opus-5)
- 상태: 완료 (사람 최종 검토 대기, **커밋하지 않음**. T-036·솔버 확정·코드 금지)
- 지시: T-032 전체 방향은 조건부 승인. 기존 설계를 유지한 채 4개만 최소 수정·재검증
- 한 일:
  1. **ADR-007 Reopened → Proposed**. 재개 이유: Accepted 상태는 v0.1 원본 기획서 승계였고, V0.2 Master Planning 정본에서 솔버는 "현재 후보"이며 CP-SAT / MILP / min-cost flow / VRP / scheduling 비교가 Open Question이다. 직전 T-031·T-032 보고와 LOG에서 이 ADR을 `[DECIDED]`로 유지한 것은 정본과 충돌했으므로 바로잡는다. 선택은 T-036(Q-35). ADR-008은 `[DECIDED]` 유지. 01 규칙의 `[DECIDED]` 예시를 ADR-008로 교체. 06·07·08·12·13·CHANGELOG의 CP-SAT 확정 표현을 "후보"로 정리
  2. **Plan Approval / Fact Verification 분리** (ADR-017 결정 (2) 개정): `PLAN_APPROVAL`은 Event Store 밖 결정 기록(`plan_decisions`, append-only). 계획 승인으로 입력 사실을 CONFIRMED로 올리지 않음. CONFIRMED 근거 `verification_basis` = HUMAN_VERIFICATION / AUTHORITATIVE_SYSTEM / POLICY_EVIDENCE. PROVISIONAL 입력은 `ALLOW_WITH_ACK`(잠정 입력 인지 명시)로 승인 가능, 승인 뒤 V9 확인 요청. `APPROVAL_BLOCKED`는 사실 단위 행동으로만 해제. "확인 + 승인" 묶음 UI는 허용하되 `VERIFICATION` Event와 `PLAN_APPROVAL` 기록을 따로 남김. 승인 때 차단 확인·입력 불변 확인. `verification_method = PLAN_APPROVAL` 삭제
  3. **근거 시각 단순화**: `max(...)` 공식과 공공 API 지연 허용 ∞를 폐기하고 3단계 폴백(EVENT_TIME → RECORDED_TIME → RECEIVED_ONLY) + `temporal_quality`로 바꿈. 수신 시각에서 지연을 빼지 않음. 옛 공식이 막던 오류는 "STATE의 `source_event_time` = 관측 시각, 변경 시각은 `payload.changed_at`" 어댑터 매핑 정의로 막음(결정론 예시 05 5.2). 공공 API RECEIVED_ONLY → STALE 취급. [지금도 맞음] 액션 추가(옛 Event 확인만으로는 신선해지지 않음)
  4. **FORECAST 사실 종류 추가**: `plan.eta` → `forecast.eta`(`forecast_kind`: SCHEDULED / ESTIMATED / PREDICTED). `milestone.ata`와 다른 키. 실제 입항이 생기면 R7-f로 판단에서 빠짐. INFERENCE는 FORECAST만 채움(R8). PLAN은 CERA 사용자의 예정만
- 재검증: 6개 CASE 재적용. 값이 바뀐 CASE는 없음. 바뀐 부분은 CASE 2 표기(OBSERVED → CONFIRMED/AUTHORITATIVE_SYSTEM), CASE 3 근거 시각 설명, CASE 4(승인해도 PROVISIONAL 유지, V9), CASE 5(G2·G3 분리 절차), CASE 6(차단 해제 경로). A.7.4를 FORECAST로 재작성. Planning Snapshot 구조 변경 없음(`forecast` 필드 추가, PROVISIONAL 규칙 문구, 승인 검사는 기존 값·winner_event_id로 가능)
- 변경 파일: `docs/05_event-and-state.md`, `docs/14_decisions.md`, `docs/01_project-rules.md`, `docs/03_requirements.md`, `docs/04_domain-model.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/15_open-questions.md`, `docs/CHANGELOG.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 큐 변경: T-032 완료 항목에 패치 기록. T-036에 솔버 비교·ADR-007 결정 추가. T-001에 패치 검토·Q-36 추가. 사람 지시 추가
- 주의사항: ADR-019·020·021은 Proposed 유지. 바로 아래 T-032 항목의 "ADR-007·008 `[DECIDED]` 유지" 문구는 이 항목으로 정정한다(LOG는 append-only)

## 2026-09-11 · T-032 Event·Source·Canonical State 설계 확정안 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**. 사람 지시: 검토 전 T-036·T-037·Phase 1 코드 착수 금지)
- 작업 전 상태: v0.2 재정렬 미커밋, T-001 미수행(ADR-007·008만 Accepted). 05에 R1~R8(Proposed)과 7개 상태 단일 enum이 있었음. 발견한 모순: ① R3이 전역 출처 순위 ② 상태 enum이 차원 혼합 ③ `source_type`이 채널과 확인·추출 여부 혼합 ④ 01 규칙 3절("LLM 결과는 확정 전 Canonical State를 바꾸지 못한다")과 ADR-017(자원 사실 PROVISIONAL 반영) 충돌 ⑤ `[DECIDED]`·`[PROPOSED]` 태그 없음
- 한 일:
  - `05_event-and-state.md` 전면 재작성(확정안): 결정 수준 표기, 사실 종류 6개, 출처 3축 + 권한 매트릭스 + 근거 강도, Event 스키마(필드별 필수·생성자·불변·용도, 요청 필드 처리 근거), fact_key·event_type 카탈로그, Validation/Quarantine, 추출 검증기, 네 개의 시각과 근거 시각·신선도, 상태 차원 분리, 충돌 범주 C1~C10과 결과 유형, Reconciliation 의사코드 + R1~R12 결정표 + 옛 R1~R8 대응, Canonical Fact 스키마·"왜 이 값인가"·fingerprint, 정정·철회·확인 취소, 확인 요청 V1~V8과 사람 액션 → Event, Planning Snapshot(엔진 입력 계약), 정책 파라미터
  - 부록 A: 필수 CASE 1~6 적용 결과 + 경계 사례 10개 + 규칙 사용표(R1~R12 모두 사용) + MVP 11:00 사건 표현
  - `04_domain-model.md` 2절: 단일 enum / Milestone Composition / Hybrid 비교 → Hybrid 채택안, 단계 유도 규칙(Q-22 해결), Phase 1 최소 모델, 예외 오버레이를 컨테이너 예외·자원 조건·영향으로 분리
  - ADR-019(Reconciliation Policy), ADR-020(출처 3축·상태 차원), ADR-021(Hybrid) 추가. ADR-012 전역 우선순위 규칙 Superseded 표시, ADR-005·014에 주석
  - 01 규칙: `[DECIDED]`·`[PROPOSED]` 태그 추가(사용자 요청), LLM 결과 반영 규칙을 ADR-017과 일치시킴(모순 ④ 해소), Event 필수 필드 갱신
  - 옛 용어(HUMAN_CONFIRMED 등, 단일 상태 enum, S0~S9, 05 옛 절 번호) 참조를 03·06·07·08·09·10·11·12·13·15·field-dictionary에서 정리
  - 작성 중 발견해 고친 것: 확인 요청을 처리해도 R4-b가 같은 충돌을 다시 여는 루프 → `overruled_event_ids`(기각) 추가 / 추출 검증기 표가 빠졌던 것 → 05 4.6으로 복원
- 변경 파일: `docs/05_event-and-state.md`(재작성), `docs/04_domain-model.md`, `docs/01_project-rules.md`, `docs/03_requirements.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/14_decisions.md`, `docs/15_open-questions.md`, `docs/CHANGELOG.md`, `docs/data/field-dictionary.md`, `AGENTS.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: 코드 없음. 6개 CASE와 경계 사례를 결정표에 손으로 적용(부록 A), 규칙 사용표로 R1~R12 전부 사용 확인. 05 전체를 다시 읽어 절 간 모순 수정(참조 절 번호, location 권한 계열, 스냅샷 예시). 옛 용어는 grep으로 전수 확인
- 완료 기준 Q1~Q10: 모두 답할 수 있음(최종 보고 참조). Q10 — T-036은 `05` 14절 Planning Snapshot만 입력으로 쓰면 되므로 추가 상태 설계 없이 시작 가능
- DoD 조정: JSON Schema 수작업 파일은 만들지 않고 T-041(Pydantic 생성)로 이동. 이유는 QUEUE 완료 항목에 기록
- 남은 일 / 다음 한 걸음:
  - 사람: T-001 — ADR-019·020·021 판정, 권한 매트릭스(3.2)·강도표(3.3)·부록 A 결과가 현장 감각과 맞는지, Q-23·Q-24·Q-34
  - 에이전트(검토 뒤): T-036 → T-037, 병행 T-035·T-029
- 큐 변경: T-032 DONE. T-001 범위에 T-032 검토 추가. T-036 참조에 Planning Snapshot 추가. T-035 문구 갱신. 사람 지시 추가
- 주의사항:
  - `[DECIDED]`(Accepted) 결정은 바꾸지 않았다(ADR-007·008). ADR-012·005·014는 Proposed라 주석으로 개정했다
  - 요청의 CASE 3에서 메일 Event를 "PROVISIONAL"이라 했지만, 설계상 메일에서 뽑은 **컨테이너 사실**은 확인 전 후보 자격이 없다(강도 0). PROVISIONAL은 자원·제안·견적 사실에만 쓴다(부록 A.3에 명시)
  - 모든 파라미터 값(τ, δ_m, 신선도, θ)은 PoC 데모용 `[ASSUMPTION]`이다. 특히 τ가 "동시 충돌"과 "그 사이 현실 변화"를 가른다(A.5)

## 2026-09-11 · T-031 (사용자 지시) 기획 v0.2 전면 재정렬 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음** — 사용자 지시)
- 변경 이유 (사용자 지시 요약):
  - 공공데이터의 실제 반영 속도(SLA)를 신뢰할 수 없으므로, 공공데이터를 단일 진실원천으로 두는 v0.1 구조를 버린다.
  - CERA를 "여러 출처의 운영 사실 → 신뢰도 기반 Canonical Operational State → 예외 탐지 → 비용 최소 복구 → 연락·회신 반영 → 재최적화"를 수행하는 System of Decision/Action으로 재정의한다.
  - 사람 입력·이메일·계약서를 정식 입력원으로, 멀티에이전트(역할 분리)·Three.js 시뮬레이터·Prototype-led Discovery를 설계에 넣는다. 초기 범위(부산 Import FCL 30대)는 넓히지 않는다.
  - 기존 문서가 새 기획과 충돌하면 삭제하되 검증 결과·질문·ADR·폐기 사유는 보존한다.
- 한 일:
  1. 저장소 전체 문서(AGENTS, CLAUDE, docs/01~10, data/*, QUEUE, LOG) 검토 → 충돌 목록과 KEEP/MODIFY/DEPRECATE/NEW 분류(`docs/CHANGELOG.md` 1~4절)
  2. **삭제 전에** 문서 이전 지도 작성(`docs/CHANGELOG.md` 4절): 삭제할 문서, 이유, 유효 내용을 옮긴 곳
  3. 새 정본 구조로 재편하고 문서 작성: 제품 정의, 요구사항, 도메인 모델, 이벤트·상태, 에이전트, 백엔드, 최적화, MVP 시나리오, 시뮬레이터, 데이터 출처, 로드맵
  4. ADR-011~018 추가(Proposed). ADR-001~010 본문은 그대로 두고 v0.2 주석을 추가. ADR-003(Streamlit)은 Superseded by ADR-016
  5. Open Questions: R-6~R-8, Q-23~Q-33 추가. Q-01~Q-22·R-1~R-5 보존(주석 추가), Q-10·Q-16 CLOSED
  6. QUEUE 재정렬: T-031 DONE, T-032~T-040 신규, T-007·T-008 DEPRECATED, 옛 백로그 ID 폐기, T-002/T-005/T-006/T-030 P2로 조정
  7. 옛 문서·원본 기획서 삭제(아래), 참조 경로 정리
- 삭제한 파일 (모두 `ef6b85b`에 있어 git으로 복원 가능):
  - `docs/02_product-brief.md` → `02_product-definition.md`, `01` 4절, `11`, `15`로 이전
  - `docs/03_data-strategy.md` → `11_data-sources.md`, `05_event-and-state.md`로 이전 (T-004 VERIFIED 요약 포함)
  - `docs/04_service-flow.md` → `03_requirements.md`, `09_mvp-scenario.md`로 이전
  - `docs/05_domain-model.md` → `04_domain-model.md`, `05_event-and-state.md`, `08_optimization-model.md`로 이전
  - `docs/06_architecture.md` → `07_backend-architecture.md`로 이전
  - `docs/07_roadmap.md` → `12_roadmap.md`, `CHANGELOG.md` 6절로 이전
  - `docs/08_glossary.md`, `docs/09_decisions.md`, `docs/10_open-questions.md` → `13_glossary.md`, `14_decisions.md`, `15_open-questions.md`로 이름 변경(내용 전부 보존 + 추가)
  - 루트 `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf` / `.docx` → 사용자 허락으로 삭제. 유효 내용은 v0.1 문서 세트를 거쳐 v0.2로 이전됨
- 변경 파일:
  - 신규: `docs/CHANGELOG.md`, `docs/02_product-definition.md`, `docs/03_requirements.md`, `docs/04_domain-model.md`, `docs/05_event-and-state.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/14_decisions.md`, `docs/15_open-questions.md`
  - 갱신: `AGENTS.md`, `docs/README.md`, `docs/01_project-rules.md`, `docs/data/field-dictionary.md`(v0.2 읽기 주석, 참조 경로. 확인된 사실은 그대로), `docs/data/code-tables.md`(참조 경로), `docs/tasks/QUEUE.md`
- 폐기된 가정 (상세 `CHANGELOG.md` 2절 D-1~D-14): 공공데이터 단일 진실원천, 공공 API → State 직결, D&D Risk Radar가 제품 핵심, Plan A/B/C 비교 중심 최적화 설명, VBS 자동 Write, 공공데이터만으로 LFD 계산, DS-02 컨테이너 이벤트, 15011649 소멸, V0.1 LLM 없음, Streamlit UI, 폴링 중심 수집, 37대 데모, 공공 API 기반 Gate 1, 공공 API 선행 개발 순서
- 검증:
  - 삭제 대상 11개 파일이 모두 마지막 커밋에 있음을 `git cat-file`로 확인한 뒤 삭제(`git rm`이 아닌 `rm`, 인덱스 변경 없음)
  - 삭제된 파일명을 참조하는 곳을 grep으로 전수 확인 → 이름 변경 주석, CHANGELOG 대응표, LOG의 과거 기록만 남음(의도)
  - 옛 단계 명칭·Streamlit·폐기 ID 참조를 grep → 역사·주석 맥락에서만 남음
  - 코드 없음. 테스트 없음
- 남은 일 / 다음 한 걸음:
  - 사람: **T-001** — 기획 v0.2 검토, ADR-011~018 판정, 삭제 목록 확인 후 커밋 여부 결정, Q-15·Q-17·Q-21·Q-23 답변
  - 에이전트: T-032(Event·Canonical 스키마) → T-036(최적화 명세) → T-037(시나리오 데이터 팩). 병행 T-029
- 큐 변경: T-031 DONE. T-032~T-040 추가. T-007·T-008 DEPRECATED. T-009~T-016·T-018~T-028 폐기(재사용 금지). T-001 범위 변경(v0.2 검토). T-017을 Prototype 인터뷰 가이드로 변경. T-002·T-005·T-006·T-030 우선순위 P2
- 주의사항:
  - 커밋 전 백업: 재정렬 직전 작업 트리(T-004 미커밋 변경 포함)를 세션 scratchpad `backup_pre_v02/`에 복사해 두었다(세션 한정). 영구 복원 경로는 git `ef6b85b` + 이 LOG
  - 이 LOG의 아래쪽(과거) 항목에 나오는 파일 경로는 v0.1 기준이다. `docs/CHANGELOG.md` 7절 표로 읽는다
  - 제품 단계 명칭이 V0.1/V0.2/V1/V2 → **PoC/Pilot/Scale**로 바뀌었다. "기획 v0.2"는 문서 버전이지 제품 단계가 아니다
  - 시나리오 금액(6,420,000 / 2,850,000 / 3,570,000원)은 예시값이다. 엔진 결과처럼 쓰지 말 것

## 2026-09-11 · T-004 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기. 사람 지시: 검토 전에는 T-005 이후로 넘어가지 않는다)
- 한 일:
  - 공공데이터포털 상세 페이지 4개(15126268, 15131742, 15006353, 15011649)와 첨부 공식 가이드 3종을 받아 원문을 직접 읽었다. 포털 페이지에 포함된 Swagger 2.0 명세 2개도 추출했다
  - 인증키 없이 3개 엔드포인트에 GET을 1회씩 보내 엔드포인트가 살아 있는지와 오류 봉투 형식을 확인했다(데이터 수신 없음)
  - `docs/data/field-dictionary.md` v0.1 작성: API별 기본 정보 17개 항목, 요청·응답 필드, **CERA Mapping**(공식 필드 → 정규화 필드 → 도메인 엔티티 → 엔진 용도), 공공 API가 주지 않는 데이터, ContainerState 역매핑, T-007 스키마 제안, 파서 규칙
  - `docs/data/code-tables.md` v0.1 작성: 1차 출처에서 관측한 코드값만, 에러코드(UNI-PASS / 포털 게이트웨이)
- 변경 파일:
  - 신규: `docs/data/field-dictionary.md`, `docs/data/code-tables.md`
  - 갱신: `docs/03_data-strategy.md`(1·2.1·3·4·5·7·8절), `docs/02_product-brief.md`(10절), `docs/05_domain-model.md`(2.1 주 출처 열, Q-22 링크. 상태 유도 규칙은 **손대지 않음**), `docs/08_glossary.md`, `docs/10_open-questions.md`, `docs/07_roadmap.md`, `docs/README.md`, `AGENTS.md`(5절 문서 지도), `docs/tasks/QUEUE.md`
- **새로 VERIFIED된 사실** (출처 ID는 field-dictionary 0.2절):
  - DS-01 엔드포인트 `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo`, 개발계 호스트 `tunipass.customs.go.kr:38010`, GET, XML, 인증 `crkyCn` (S-02, S-08). T-000의 블로그 근거를 공식 문서로 대체
  - DS-01 요청 `cargMtNo` 또는 `mblNo`/`hblNo` + `blYy`, 응답 기본정보 38개 필드 + 처리이력(0..n) 13개 필드와 크기 (S-02)
  - DS-01 오류는 HTTP 200 + `tCnt=-1` + 한글 `ntceInfo`. 여러 건이면 `[N00]` 목록 응답. 조회 기간은 2023-06-17부터 3년 이내. IP로는 호출 불가 (S-02, S-08)
  - DS-02 엔드포인트 `https://apis.data.go.kr/1192000/CargFrghtContnOut/ContnInfo`. 필수 키는 **`prtAgCd` + `etryptYear` + `etryptCo` + `clsgn`**(입항 건). `numOfRows` 최대 50, 개발계정 1,000, 30 tps, 갱신주기 "실시간" 표기, 응답 17개 필드 (S-03, S-04)
  - DS-02 응답에 **컨테이너별 반출입 일시 필드가 없다**. 시각 필드는 선박 `etryndDt`뿐이다 (S-03, S-04)
  - 포털 게이트웨이 오류는 `OpenAPI_ServiceResponse/cmmMsgHeader` 봉투 + HTTP 401 (S-08). 가이드와 포털의 에러코드 번호 체계가 다르다(예: 10번) (S-03, S-04)
  - DS-03 후보 `해양수산부_선박운항정보`(15006353) `VsslEtrynd5/Info5`: 항만 + 기간으로 조회하면 `etryptYear`·`etryptCo`·`clsgn`·`mrNum`·입출항 일시·선석을 준다. 부산 `prtAgCd=020` (S-05, S-06)
- **기존 문서에서 틀려서 정정한 사실**:
  - "15011649 → 404, 사라짐" → 옛 URL(`/dataset/`)만 404다. 데이터셋은 **파일데이터(XLSX, 100행, 1회성)** `해양수산부_컨테이너반출입정보_20230112`로 있고, 오픈API가 아니다. 현재 오픈API 후보는 15131742 (Q-03 CLOSED)
  - "DS-02는 BL번호로 조회" → 입항 건 키로만 조회된다. 조인 경로를 B/L → DS-01 → DS-03 → DS-02로 바꿨다
  - "DS-02가 컨테이너 단위 반출입 이벤트(S1·S5·S9)를 준다" → 공식 명세상 아니다. DS-02를 **적하목록 스냅샷 출처**로 다시 분류했다. 반출 이벤트 1차 후보는 DS-01 처리이력
  - "DS-01 응답의 장치장명(`shedNm`)" → 기본정보가 아니라 처리이력 행의 필드다
  - T-000 응답 태그 목록의 `csclPrgsStts`, `prgsStCd`, `etprDt`, `cntrGcnt` 등은 공식 문서와 일치했다(정정 없음)
- **아직 확인 못한 항목** (`[TO VERIFY]`):
  - 코드표: `prgsStCd`, `csclPrgsStts`, 처리구분(`cargTrcnRelaBsopTpcd`), `blPt`, `spcnCargCd`, `tkinTkoutSe`(Q-18), `prtAgCd`(부산·광양 외). 공식 코드표를 찾지 못해 샘플 값만 적었다
  - DS-01 호출 한도, 갱신주기·실제 지연(R-1), 14자리 일시의 형식·타임존(Q-19), 목록 응답 태그명, 여러 컨테이너 B/L의 `cntrNo`·이력(Q-20), 포털 활용신청이 따로 필요한지
  - DS-02 트래픽 단위(일로 추정, Q-05), 조회 가능 기간, `blNo`가 MBL/HBL 중 무엇인지, `contnStndrd`가 ISO 6346 코드인지, `etryndDt`가 입항/출항 중 무엇인지
  - 화물관리번호 ↔ 적하목록관리번호·MSN 관계(Q-04, 길이만 맞는 가설), DS-03 매칭 규칙, ETA 출처
  - 양하(S1) 시각의 공식 출처(Q-22와 연결), DS-04 체인포털 공개 API(Q-21)
  - UNI-PASS API020·021·038·048·005 명세(T-030)
- **T-002에서 사용자에게 필요한 준비물** (QUEUE T-002에 상세):
  1. UNI-PASS 회원가입 → OpenAPI사용관리에서 API001 신청 → 인증키(`crkyCn`). 가능하면 API020·021·038·048도 신청하고 한도를 기록
  2. 공공데이터포털 활용신청 2건: 15131742(외항화물컨테이너정보), **15006353(선박운항정보, 새로 필요)**. 트래픽 단위 기록
  3. 로컬 `.env`에 `UNIPASS_API_KEY`, `DATA_GO_KR_SERVICE_KEY` (커밋 금지)
  4. 실제 B/L 5~20건: MBL(필수)·HBL·**B/L 연도**(필수)·입항항(부산)·대략 입항일·선박명·컨테이너 번호/개수. 반출·반납이 끝난 건과 아직 터미널에 있는 건을 섞고, 3년 이내 건만
- 검증: DoD 4항목 확인(DS-01·02 필드 1차 출처 정리 / Q-03 CLOSED·Q-04 갱신 / 필드→ContainerState 매핑(7절) / README 색인). 공식 문서 docx 3종의 SHA-256을 필드 사전에 기록. 문서 간 교차 참조(Q-17~Q-22, T-030, S-01~S-08)는 수동 확인. 코드 없음
- 남은 일 / 다음 한 걸음:
  - 사람: T-004 결과 검토(특히 Q-17 UNI-PASS 가이드 복제 금지 문구 판단, Q-21), T-001, T-002
  - 에이전트(검토와 무관하게 가능): T-029, T-030, T-017
- 큐 변경: T-004 DONE. T-030 신규. T-002·T-005·T-006·T-007 내용 갱신(T-006 범위 변경: DS-03 클라이언트 추가, 지연 측정을 DS-01 기준으로). T-001에 T-004 검토 추가
- 주의사항:
  - UNI-PASS 연계 가이드 원문과 샘플은 저장소에 넣지 말 것(Q-17). 필요하면 S-02 경로에서 다시 받는다
  - DS-02를 폴링 이벤트 출처로 설계하지 말 것. 개발계정 1,000건은 입항 건 스냅샷용
  - 05의 S1 도달 불가 문제(Q-22)는 일부러 고치지 않았다. T-007/T-009에서 처리

## 2026-09-10 · (사용자 지시) git 초기화 · Claude Code (claude-opus-5)
- 상태: 완료 (원격 푸시는 사람 작업 대기)
- 한 일:
  - 커밋 전 민감정보 점검: md 문서(키·토큰·이메일 패턴 없음), 원본 기획서 DOCX(본문이 PDF와 동일, 메타데이터 작성자 `python-docx`), PDF(작성자 `python-docx`, 생성기 LibreOffice) → 개인정보·비밀정보 없음
  - `git init -b main`, 로컬 user.name/user.email 설정(저장소 로컬 한정), `.gitignore` 추가, 첫 커밋
- 변경 파일: `.gitignore`(신규), `docs/tasks/QUEUE.md`(T-003에서 git init 항목 완료 표시), `docs/tasks/LOG.md`
- 검증: `git status`, `git log`로 커밋 작성자 확인
- 남은 일 / 다음 한 걸음:
  - 사람: GitHub에 private 저장소 생성 → remote 연결 → 해당 계정으로 인증 후 push
- 큐 변경: 없음 (T-003 범위 일부 선행)
- 주의사항: 이 PC의 Git Credential Manager에는 다른 GitHub 계정이 저장돼 있다. remote URL에 사용자명을 넣어(`https://<user>@github.com/...`) 계정을 구분할 것.

## 2026-09-10 · T-000 · Claude Code (claude-opus-5)
- 상태: 완료
- 한 일:
  - 원본 기획서 `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf`(13쪽)를 읽고 문서 체계 초안을 만듦
  - 공공데이터포털·웹에서 공공 API 확인
    - `관세청_화물통관진행정보`(15126268): 존재, XML, 개발 자동승인/운영 심의승인, UNI-PASS 가입 필요, 3년 이내 조회
    - 기획서의 해수부 링크(dataset/15011649)는 404. `해양수산부_외항화물컨테이너정보`(15131742)를 대체 후보로 찾음(필드: 항만명, 입항년도, 호출부호, 선박명, 적하목록관리번호, BL번호, MSN, 입출항일시, 반출입구분, 컨테이너번호·규격·사이즈)
    - UNI-PASS 엔드포인트·파라미터·응답 태그는 2차 출처(블로그)에서만 확인 → `[TO VERIFY]`
  - 기획서 내부 불일치 기록: 34대 vs 37대(Q-01), ₩18,720,000 vs ₩18,420,000(Q-02), RequiredHandlingBuffer 누락(Q-06)
  - 기획서에 없던 설계를 제안(ADR Proposed): 상태 = 마일스톤 유도 + 예외 오버레이, 최적화 2단계 분해, 위험 등급 기준, Baseline 정의, 적응형 폴링, Watchlist 온보딩
- 변경 파일: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/01_project-rules.md` ~ `docs/10_open-questions.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md` (모두 신규)
- 검증: 문서 간 교차 참조(태스크 ID, ADR 번호, 질문 ID)를 수동 확인. 코드 없음.
- 남은 일 / 다음 한 걸음:
  - 사람: T-001(검토·ADR 승인), T-002(API 키)
  - 에이전트: T-004(공식 명세·필드 사전) 또는 T-017(인터뷰 가이드)
- 큐 변경: T-001~T-008, T-017, T-029를 큐에 등록. T-000 DONE.
- 주의사항: 모든 문서가 Draft다. 사람 승인 전에는 ADR Proposed 내용을 확정 사실처럼 코드에 굳히지 말 것. 원본 기획서 PDF/DOCX는 루트에 그대로 있음(이동 여부 Q-16). DOCX는 PDF와 같은 내용으로 보고 따로 열어보지 않음.
