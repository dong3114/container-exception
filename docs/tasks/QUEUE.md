# 작업 큐 (정본)

- 최종 수정: 2026-10-26 (**T-099 체크포인트: 전체 Docker 실행 · 로컬 모델 사다리(Qwen3-4B Local candidate) · Validator conformance 완료 — T-099 는 IN_PROGRESS, 다음은 상용(OpenAI · Gemini) live 평가 · 유지보수 후보 T-108~T-110 추가**) / 이전 2026-10-22 (**T-099 평가 기반 중간 checkpoint 커밋 · origin push(사용자 지시) — T-099 는 IN_PROGRESS 유지. 실제 상용 공급자 평가 대기 — blocker: 실제 API credentials. API 키 없이 T-093 등 큰 작업을 시작하지 않는다.**) 이전: 2026-10-22 (**T-105 DONE(사용자 승인 — 업무 fact state 와 Agent candidate_state 분리 유지). T-099 재개(IN_PROGRESS) — 실제 CERA Runtime 에 넣을 AI 선정. T-093 은 T-099 뒤.**) 이전: 2026-10-22 (**T-105 구현 · 검증 끝 — 사용자 검토 대기(커밋 전). 승인 → 발송 → 회신 → 추출 → 재평가 한 그래프 · 실제 프로세스 E2E(LIVE 공공데이터) · Agent 진행 화면. 시험 Backend 329 · Python 56 · Front 42.**) 이전: 2026-10-22 (**T-104 DONE — 사용자 승인 + durability 보강(재조정 · WAITING_RUNTIME · crash window 시험). 시험 Backend 328 · Python 53 · Front 39. T-105 IN_PROGRESS.**) 이전: 2026-10-22 (**T-104 구현 · 검증 끝 — 사용자 검토 대기(커밋 전).**) 이전: 2026-10-22 (**T-103 DONE — Agent Tool Layer(사용자 승인 · M16 · M17). 다음 T-104 LangGraph Runtime.**) 이전: 2026-10-22 (**T-102 DONE — live 검증(실제 DS-03 · DS-02 응답 확인, 차이 최소 수정: 비표준 시설 코드 · 신청구분 · 입항 신고 일시 = `ARRIVAL_DECLARED` · 데이터 없음 = `00` + 0건).**) 이전: 2026-10-22 (**T-100 DONE(`1c58f08` 설정 정리) · T-101 DONE(ADR-036 Accepted — Agent Runtime 설계) · T-102~T-107 등록 · T-005/T-006 DEPRECATED(→ T-106/T-102) · T-099 재배치(T-105 뒤) · T-102 IN_PROGRESS.**) 이전: 2026-10-07 (**T-092 DONE — U7 회신 추출 파이프라인(Python AI Server · 녹화 재생 · 결정론 검증기) · DB 변경 없음 · 시험 266 + Python 7 + 프론트 39. 다음: T-099(실제 AI 공급자 검증 + CERA 평가셋) → 그 뒤 T-093. 시작하지 않음.**) 이전: 2026-10-07 (**T-091 DONE — U6 수신 · 원문 보존 · 스레드 연결 · 발신자 판정 · 보류함 · DB 변경 없음 · 시험 247 + 프론트 37. 다음: T-092(U7 추출), 시작하지 않음. T-098 은 큐에 유지.**) 이전: 2026-10-07 (**T-090 DONE — U5 Outbox · Mock 발송 · 멱등 · 화해 · M13 · 시험 232 + 프론트 34. 다음: T-091(U6 수신), 시작하지 않음. T-098 은 큐에 유지.**) 이전: 2026-10-07 (**T-089 DONE — U4 발송 승인 · 반려 · 승인 취소 · 무효화 · M12 · 시험 211 + 프론트 27. 다음: T-090(U5), 시작하지 않음.**) 이전: 2026-10-06 (**T-088 DONE — U3 문의 초안 · 구조화 값 · 숫자 검사 · 첫 화면 연결 · DB 변경 없음 · 시험 184 + 프론트 20. 다음: T-089(U4), 시작하지 않음.**) 이전: 2026-10-06 (**T-087 DONE — U2 등록부 · Contact Gate · 개발 안전장치 · M11 · 첫 업무 endpoint 2개 · 시험 156 + 프론트 17. 다음: T-088(U3), 시작하지 않음.**) 이전: 2026-10-06 (**T-086 DONE — U1 영속 기반. 최종 안전성 검토로 3건 수정(`actor_type` 불변 · 계획 기반 승인 = 한 실행 · `system_error` 기록 실패 격리) · 시험 135 통과 · 커밋. 다음: T-087(U2) — 실행 가능, 시작하지 않음.**) 이전: 2026-10-02 (T-086 구현·검증 완료, 검토 대기) 이전: 2026-09-23 (**T-085 DONE — U0 Backend 뼈대. `back/` NestJS + PostgreSQL/Drizzle · `infra/local/` · 시험 61 통과 · 최종 검토 뒤 커밋. 다음: U1(T-086) — 실행 가능.**) 이전: 2026-09-22 (**T-080 DONE**)
- 프로토콜: `AGENTS.md` 3절
- 백로그 원천: `docs/12_roadmap.md`
- 역할 구분: **QUEUE = 예정 작업** · `CURRENT.md` = 지금 진행 중인 작업 하나의 인계 · `LOG.md` = 끝난 작업. 작업을 시작하면 CURRENT에 Task Brief를 채우고, 끝나면 CURRENT → LOG로 옮긴 뒤 CURRENT를 다음 Task 또는 `IDLE`로 둔다(`docs/17_ai-development-workflow.md` 6절)

## 다음 추천 태스크

**(2026-10-22 사용자 승인 — 이 순서가 위의 옛 순서보다 우선한다)** ~~T-100 설정 정리~~ → ~~T-101 Agent Runtime 설계(ADR-036)~~ → ~~T-102 DS-03 + DS-02 Public Data Adapter~~(DONE · live 검증) → ~~T-103 Agent Tool Layer~~(DONE) → ~~T-104 LangGraph Runtime~~(DONE) → ~~T-105 첫 Agent Vertical Slice~~(DONE) → **T-099 재개(진행 중 — 사용자 지시 2026-10-22)** → T-093(U8) → T-106 UNI-PASS Adapter → T-107 Demo Scenario v2 → T-098. 설계 `docs/tasks/plans/T-101-agent-runtime-design.md` 13절.

0. ~~**T-079-R**~~ (DONE 2026-09-18, 사용자 + ChatGPT) — **논리 DB 설계 rev.2.2 최종 승인.** `docs/22` rev.2.2 + 작업표 + `docs/23`(런타임·관측성) 검토 통과. MVP 51 · Next 1 · MVP 에서 만들지 않음 2 = 54. 사용자 결정 D-1~D-5 는 2026-09-17 에 이미 CLOSED. **기술 선택은 승인 대상이 아니었다**(Q-64). 상세는 아래 완료 섹션 T-079
0-z. ~~**T-076**~~ (DONE 2026-09-17, 사용자 + ChatGPT) — **개념 모델 최종 승인.** rev.3 + T-078 정합성 정리를 통과했다. **`docs/21` 은 이제 승인된 기준이고 논리 설계에서 수정하지 않는다.** 원래 항목: **개념 모델 최종 승인 (rev.3 + T-078 정합성 정리).**
0-a. ~~**T-074**~~ (DONE 2026-09-17, 사용자 + ChatGPT) — 1차 개념 모델 검토. 결과: 방향은 유효, **과도한 확정 5건 + 용어 불일치 2건 + 개수 불일치**를 지적 → T-075 로 반영
0-b. ~~**T-077**~~ (DONE 2026-09-17) — 운영자 개입·재계산 요구사항 반영 rev.3. 상세는 아래 완료 섹션
0-b2. ~~**T-075**~~ (DONE 2026-09-17) — 검토 반영 rev.2. 상세는 아래 완료 섹션
0-c. ~~**T-073**~~ (DONE 2026-09-17) — **CERA Conceptual Data Model.** `docs/20`이 "개념 데이터 모델 착수 조건 충족"을 판정했다(18절). 개념과 관계를 정하고 **SQL·테이블·컬럼·기술은 정하지 않는다.** 산출물 `docs/21_cera-conceptual-data-model.md`
   - 개념 모델을 만들면서 답한다: **Q-53**(B/L 개수 관계) · **Q-56**(Destination의 위치) · **Q-57**(개별 차량 MVP 필수 여부) · **Q-61**(활동 타임라인 저장 여부)
   - **확정하지 않는다**: Q-54·55·58·59·60·62·63(논리 설계로 미뤄 둔 것), M-6, Q-46, DB 제품·ORM·API endpoint·LLM 공급자·솔버
1. ~~**T-070**~~ (DONE 2026-09-18) — 주변 문서 동기화. 상세는 완료 섹션
2. ~~**T-081**~~ (DONE 2026-09-21) — 논리 모델 후속, `docs/22` rev.2.3. 상세는 완료 섹션
3. ~~**T-069**~~ (DONE 2026-09-21) — 첫 Vertical Slice 구현 계획. 상세는 완료 섹션 · `docs/tasks/plans/T-069-external-communication-slice.md`
4. ~~**T-083**~~ (DONE 2026-09-21, 사용자 결정) — **Q-64 CLOSED: Main Backend = TypeScript + NestJS**(모듈형 모놀리스, API + Worker) · **AI Server = 별도 Python 런타임**(ADR-033 Accepted). 상세는 완료 섹션
5. ~~**T-084**~~ (DONE 2026-09-22, 사용자 결정·최종 승인) — **Q-68 CLOSED: PostgreSQL + Drizzle ORM(SQL-aware Hybrid) + drizzle-kit 생성 SQL migration 을 사람이 검토·커밋 뒤 명시 적용**(ADR-034 Accepted, SQLite 미사용). 상세는 완료 섹션
6. ~~**T-080**~~ (DONE 2026-09-22, 최종 승인) — P0 29개 물리 설계 `docs/24` · `docs/22` rev.2.5. 상세는 완료 섹션
6-a. ~~**T-097**~~ (DONE 2026-09-22 — 사용자 검토 결과) — **Q-69: 물리 설계가 찾은 논리 모델 충돌 5건 결정**(`docs/24` 25·26절 — F-1 발송 멱등 키 범위 · F-2 `UNKNOWN` 화해 · F-3 `sent_at` · F-4 `external_thread_id` · F-5 INBOUND `drafted_by`) + D-1~D-5 검토. → `docs/22` rev.2.5 로 반영
7. ~~**T-085**~~ (DONE 2026-09-23, 최종 검토·커밋) — **U0 Backend 뼈대.** `back/`(NestJS 12 · API/Worker · Drizzle · 공통 유틸 · `/health`) · `infra/local/`(PostgreSQL 18.6 · 역할 2개) · `docs/24` 18.1 `[TO VERIFY]` 결과. 상세는 완료 섹션
8. **T-086 ~ T-096** (U1 ~ U11) — Slice 1 구현 단위. ~~T-086(U1)~~ · ~~T-087(U2)~~ · ~~T-088(U3)~~ DONE 2026-10-06 · ~~T-089(U4)~~ · ~~T-090(U5)~~ · ~~T-091(U6)~~ · ~~T-092(U7)~~ DONE 2026-10-07 · ← **다음: T-099 실제 AI 공급자 검증 + CERA 평가셋 → 그 뒤 T-093(U8)**(사용자 결정 2026-10-07, 시작하지 않음). 한 단위씩: 구현 → Claude/Codex 검토 → 사용자 승인 → commit

9. **T-098** (TODO, T-090 뒤) — **실제 서비스 화면 전환**: 운영자 · 관리자(완전히 다른 화면) · 현장 담당자 역할별 앱 · 로그인 · 페이지 분리. 투자 · 공모전 시연 영상용(시연 표현 최소화 — 표시 범위는 Plan 에서 결정). 사용자 결정 2026-10-07 — 아래 T-098 항목

**병행 (사람 몫, 위 순서를 막지 않는다)**: **T-064** (NEEDS_HUMAN, P0) Control Tower Prototype 검토 · **T-001** (NEEDS_HUMAN, P0) 기획 v0.2 + T-032 결과 검토. **에이전트 병행 후보**: **T-034** 메일 Event 스키마 + LLM 추출 계약 (T-069 입력과 겹치므로 T-069 계획 안에 흡수할지 T-069 에서 판단)

**앞으로의 순서 (2026-09-23 갱신, 이 목록과 위 번호가 같은 순서다)**: ~~`T-079`~~ → ~~`T-070`~~ → ~~`T-081`~~ → ~~`T-069 구현 계획`~~ → ~~`T-083 Q-64 Backend 결정`~~(NestJS) → ~~`T-084 Q-68 DB 결정`~~(PostgreSQL + Drizzle) → ~~`T-080 P0 29개 물리 설계`~~ → ~~`T-085 U0 뼈대`~~ → ~~`T-086 U1 스키마·migration·시드`~~ → ~~`T-087 U2`~~ → ~~`T-088 U3`~~ → ~~`T-089 U4`~~ → ~~`T-090 U5`~~ → ~~`T-091 U6`~~ → ~~`T-092 U7`~~ → **`T-099 공급자 검증`** → `T-093 U8` → … → `T-096 U11 인수` (각 단위: Antigravity 구현 → Claude/Codex 검토 → 사용자 승인 · commit). **Q-65(솔버)는 이 줄의 어느 단계도 막지 않는다**

> **프론트엔드 (2026-10-06 사용자 지시로 갱신)**: 실제 Backend 와 연결되는 운영 Control Tower 로 간다. **구현 도구는 Antigravity 에 고정하지 않는다** — Orchestrator 가 적절한 Coding Agent/Tool 을 고르고 최종 diff·시험을 직접 검토한다. 한 파일을 여러 Agent 가 동시에 고치지 않는다. 2026-10-06 상태: Vite + React SPA(CSR, ADR-035) · 디자인 정리 커밋 · Backend 연결 경계(`docs/16` 4.1). 화면별 실제 API 연결은 T-087 부터 엔드포인트가 생기는 순서대로. ~~(2026-09-17) 별도 트랙 — Orchestrator 는 `front/` 를 건드리지 않는다~~

실행 가능(TODO + 의존 해소): T-017, T-029, T-034, T-035, T-040, T-030, T-082 (7개). **주 흐름: T-092(U7) DONE(2026-10-07) → T-099(실제 AI 공급자 검증 + CERA 평가셋) 실행 가능 → 그 뒤 T-093(U8). 그 뒤 추출(T-092) 쪽으로, T-098(역할별 실제 화면 · 인증)은 적절한 시점에(사용자 결정 2026-10-07).** **T-087~T-096(U2~U11)은 앞 단위가 DONE 될 때마다 하나씩 풀린다.** T-065는 T-064 뒤, T-036은 DEFERRED(재개 조건: T-064·T-065), T-037은 아래 사람 지시로 대기.

> **T-086(U1) DONE(2026-10-06).** P0 29표 · M01~M10 · 트리거 70 · 권한 · 감사/`system_error` · ContentStore · 시드 · OpenAPI 뼈대가 커밋됐다. 결과는 `docs/24` 18.2(U1-1~U1-11). migration 은 `npm run db:generate` → **생성 SQL 을 사람이 검토** → 커밋 → `npm run db:migrate`(소유 역할) 순서다. `push` 는 쓰지 않는다. **커밋된 migration 파일은 고치지 않는다 — 바꿀 것은 M11 부터 새 migration 으로.**

**사람 지시**
- (2026-10-22) **ADR-036 승인.** NestJS = 권한 · 업무 사실 / Python + LangGraph = Agent 추론 · 오케스트레이션. Agent 는 DB · 공공 API · 승인 · 발송 · 사실 확정을 직접 하지 않고, 모든 권위 부작용은 NestJS typed Tool/API 로. checkpoint 는 실행 상태일 뿐 업무 사실이 아니다. ADR-015 는 "LLM 에 Tool 을 주지 않는다 · LLM Planner 금지" 부분만 대체(루프 폭주 방지 · 결정론 안전 규칙 · 승인/발송 권한 · 숫자 계산 권한 유지). ADR-033 결정 3·4 는 Backend Tool API 허용에 필요한 부분만 개정. ADR-029 · ADR-034 유지.
- (2026-10-22) **2026-09-11 의 "T-004 사람 검토 전 공공 API 실제 호출 금지" 지시를 해제한다.** 실데이터 개발 · 검증 가능. 단 실제 비밀값 · 실제 B/L · 컨테이너 · 개인정보성 값 커밋 금지, 원문 provenance 보존, replay fixture 는 마스킹 · 합성 값만.
- (2026-10-22) **`vessel_call` 을 MVP/P0 로 승격**(`docs/22` rev.2.6, T-102). API 응답 전부를 컬럼으로 옮기지 않고 CERA 가 쓰는 필드 + 원문 참조 · provenance 중심. DB 변경은 M14 부터, M01~M13 수정 금지.
- (2026-10-22) T-005 · T-006 은 DEPRECATED(삭제하지 않고 "새 구조로 대체" 기록) → T-106 · T-102. T-100 · T-101 은 별도 커밋. T-102 는 커밋 전 사용자 보고, **T-103 은 T-102 검토 전 시작 금지.** push 금지.
- (2026-09-21) **Q-44 = 선택지 ②**(방향별 — 미래 `Date` 만 거부, 원래 두 시각 보존), **Q-45 = 선택지 ①**(기록과 내용 분리, 행 삭제 ≠ 내용 파기, 기간 숫자는 Pilot 정책). 결정 반영과 Q-45 에 필요한 최소 논리 구조 보완까지만 한다. **T-069 본문 · T-080 · Backend/DB 기술 선택 · 제품 코드 · staging/commit/push 금지.** L-13 은 T-069 에서, ExceptionCase 는 다시 만들지 않는다. T-082 는 시작하지 않는다.
- (2026-09-21) **T-081 의 C(출처 어휘)는 선택지 ① 로 간다** — `source_type` 7값 · `source_role` · `extraction_method` 3축. **Q-46 은 닫지 않는다.** 7값이 영구 확정 enum 이라는 뜻이 아니라 현재 ADR 기준으로 논리 모델을 맞추는 것이다. `docs/21` 수정 금지, 구현 코드·SQL·물리 설계 금지, staging/commit/push 금지.
- (2026-09-18) **T-070 은 새로 발견된 논리 모델 문제 때문에 다시 열지 않는다.** `docs/05`·`docs/18` 의 오래된 표현만 정리하고 닫는다. 새로 발견된 Event·provenance 문제는 **별도 논리 모델 후속 Task(T-081)** 로 분리하고 **T-069 보다 먼저** 처리한다. `docs/21` 은 수정하지 않는다. T-081 은 등록만 하고 아직 시작하지 않는다.
- (2026-09-18) **T-079 최종 정리 + 런타임·관측성 문서화.** A~E 정합성 5건과 표현 잔재를 닫고, 시스템·외부 연동 오류 추적 구조(`system_error`, 세 기록 분리, `request_id`·`trace_id`)를 설계 문서에 넣는다. Backend·Web·Desktop 기술 방향은 **기록하되 최종 결정으로 닫지 않는다**(현재 우선 후보 NestJS + TypeScript, Spring Boot 후보 유지, Web First, Desktop = Client · Electron 첫 후보 · Tauri 나중, Python AI 서비스는 Python 전용 요구가 생길 때만). 순서는 **T-070 → T-069 → 기술 결정 → T-080**, T-080 은 **첫 슬라이스 표부터**. `docs/21` 수정 금지. `front/web/`·`data/Proposal/`·`scripts/` 수정·스테이징 금지. 제품 코드·SQL 금지. **staging·commit·push 금지.** 작업 관리 문서의 "미커밋" 표현 정리는 T-079 최종 승인 뒤 사용자가 함께 정리한다(이번에는 새 기록만 덧붙였다).
- (2026-09-17) **어제(2026-09-16) 작업을 Git 정본 기준으로 복구하고 이어서 진행한다.** ① 실제 Git 상태를 먼저 확인한다 ② 어제 이미 진행된 DB 관련 작업을 찾아 **중복 작성하지 않고 이어받는다** ③ 작업 관리 문서(QUEUE·CURRENT·LOG)를 실제 커밋 상태와 맞춘다 ④ 다음 작업은 **Conceptual Data Model(T-073)**. **T-069를 삭제하지 않고 순서만 데이터 모델 뒤로 옮긴다** — 순서는 `요구사항 → DB 설계 전 검토 → 개념 데이터 모델 → 논리 DB 설계 → 구현 계획`이다. **Q-44·Q-45는 외부 통신 구현 계획 전에 필요하지만 개념 데이터 모델을 막지 않는다.** 개념 모델 단계에서 SQL·DDL·ORM·DB 제품·API endpoint·LLM 공급자·솔버를 확정하지 않는다. 제품 코드는 건드리지 않는다. **임의로 commit·push 하지 않는다(특히 push 금지).**
- (2026-09-16) **T-068을 사용자 지시로 착수했다. 설계(Task Brief + Architecture/RFC)까지만 하고 구현은 하지 않는다.** 이번에 만들지 않는 것: Solver, 실제 Recovery Optimization, Tauri·Rust·Desktop, Public API 연동, Contract Parser 전체, Multi-tenancy, Production infra. **Gmail을 현업의 최종 채널로 가정하지 않는다** — "실제 외부 통신 Loop를 기술적으로 검증하는 첫 채널"로만 다룬다.
- (2026-09-16) **T-068 설계 승인 + 문서 기준점 커밋.** ADR-026·027·028·029 모두 `Accepted`. **`Tech Validation` 단계 신설로 실제 Gmail 발송이 가능해졌다**(등록·검증·승인된 연락처 + 건별 승인 + 개발환경 수신자 제한). **2026-09-15의 "Gmail·Backend 구현 금지" 지시는 External Communication Vertical Slice 범위에 한해 해제된다.** 단 **Implementation Plan(T-069)이 승인돼야 구현을 시작한다.** Solver·T-036 금지는 그대로 유지. ADR-029의 폴더 배치 적용은 T-003.
- (2026-09-11) T-004 결과를 사람이 검토하기 전에는 T-005 이후(공공 API 실호출)로 넘어가지 않는다.
- (2026-09-11) 기획 v0.2 재정렬 결과는 사람이 검토하기 전까지 커밋하지 않는다. → 같은 날 세션 끝에 **사람 요청으로 커밋함**(`af47569`). 이후 커밋도 사람 요청 시에만.
- (2026-09-11) **T-032 결과를 사람이 검토하기 전에는 T-036, T-037, Phase 1 코드 작업으로 넘어가지 않는다.** → 2026-09-14 지시로 **Frontend Prototype(T-060~T-063)만 예외**로 수행했다. Backend·Solver·Phase 1 코드 금지는 유지.
- (2026-09-11) T-032는 조건부 승인됐고 4개 패치를 반영했다. **사람 최종 검토 전까지 T-036 착수, 솔버 확정 금지.**
- (2026-09-14) **T-036을 보류(DEFERRED)하고 30대 시나리오 + Frontend Prototype(Control Tower)을 먼저 만든다.** Prototype이 끝나도 Solver·Backend로 넘어가지 않는다. 커밋은 사람 승인 전 금지. (T-060~T-063으로 수행, 2026-09-15 완료)
- (2026-09-15) **AI 협업 개발 Workflow를 따른다(ADR-025).** 한 Task 한 Orchestrator(Claude 또는 Codex), 인계는 `CURRENT.md`, 사용자 승인 없이 commit·push 금지. 다음 제품 Task는 사용자가 아직 고르지 않았다(후보: 현업 검증 / Gmail 연락 루프 / 결정론 코어 — 확정 아님). (T-067)
- (2026-09-15) **CERA는 하나의 Private Monorepo로 유지한다.** 영역: `front/`·`back/`·`ai/`·`packages/`·`data/`·`docs/`·`infra/`. 저장소를 나누지 않는다. Backend·Gmail·LLM·Solver·Tauri 구현은 아직 시작하지 않는다. (T-066, ADR-024)

---

## 상태 규칙

| 상태 | 의미 |
| --- | --- |
| `TODO` | 대기 |
| `IN_PROGRESS` | 진행 중 (`담당`에 에이전트명/날짜) |
| `BLOCKED` | 막힘 (`차단 사유`, `해소 조건` 필수) |
| `NEEDS_HUMAN` | 사람만 할 수 있음. 에이전트는 수행하지 않는다 |
| `DONE` | 완료 조건 충족, `완료` 섹션으로 이동 |
| `DEPRECATED` | 기획 변경으로 폐기. ID는 다시 쓰지 않는다 |
| `DEFERRED` | 폐기가 아니라 **보류**. `보류 사유`와 `재개 조건`을 적는다. 재개 조건이 풀리면 `TODO`로 되돌린다 (2026-09-15 추가) |

우선순위: `P0`(지금 막고 있는 것) > `P1`(이번 단계) > `P2`(다음 단계 준비).

## 태스크 템플릿

```markdown
### T-NNN: 제목
- 상태: TODO | 우선: P1 | 단계: Phase N | 담당: -
- 의존: T-xxx, T-yyy
- 참조 문서: docs/..., docs/...
- 목표: 한두 문장
- 작업 내용:
  - ...
- 산출물: 경로
- 완료 조건:
  - [ ] ...
  - [ ] 영향받은 docs 갱신
- 완료 후 큐잉 힌트: 어떤 태스크가 풀리는지, 후속으로 만들 만한 것
```

---

## 진행 중

- **T-099** 실제 AI 공급자 검증 + CERA Eval — **MODEL_EVAL_CONTINUOUS**(연속 평가, 사용자 지시 2026-10-26; 상태 칸은 IN_PROGRESS 유지). 평가 인프라 · 141건 데이터셋 · LocalProvider · 로컬 사다리 · Validator conformance 는 끝. **MVP 임시 기본값 = 로컬 Qwen3-4B-Instruct-2507 Q4_K_M**(API 비용 0 · 현재 하드웨어에서 동작 · 교체 가능 · 결정론 검증이 보호) — **최종 Production 선정은 Deferred**. 상용(OpenAI · Gemini · Anthropic · Jev) 평가는 이번 순서에서 하지 않으며 키를 요구하지 않는다(필요할 때 같은 Eval 로 다시). ADR-037: 구조 한정 Accepted · 선정 Deferred. 파인튜닝은 사람 보정 데이터가 쌓인 뒤 검토. 상세 `CURRENT.md`

## 대기 — P0

### T-097 — (NEEDS_HUMAN) Q-69 물리 설계가 찾은 논리 모델 충돌 결정

- 상태: **DONE (2026-09-22 사용자 검토 결과 — `docs/22` rev.2.5 반영, T-080 과 함께 커밋)** · 우선순위 **P0** · 담당: 사용자 · 등록 2026-09-22(T-080 중)
- 무엇: `docs/24` **25·26절**. 논리 모델(`docs/22`)을 바꿔야 풀리는 5건 — **F-1** `send_attempt.idempotency_key` UNIQUE ↔ 재시도 새 행(권고: 진행 중·성공 1건 부분 유일) · **F-2** `UNKNOWN` 뒤 화해(권고: `UNKNOWN → SUCCESS` 한 번) · **F-3** `comm_message.sent_at`(권고: CACHE) · **F-4** `comm_thread.external_thread_id`(권고: NULL → 값 한 번, Slice 2 전) · **F-5** INBOUND `drafted_by`(권고: OUTBOUND 만 필수). 함께 검토: D-1 ID(UUIDv7) · D-2 코드 표 없음 · D-3 KRW API 문자열 · D-4 append-only A+B+C · D-5 내용 저장소 DB 밖 · 표기 정리 F-6~F-8 · 확인 F-9~F-11
- 왜 막나: F-1 · F-2 · F-5 는 Slice 1 시험(S-04 재시도 · S-03 화해 · 수신 저장)을 직접 막고 F-3 은 컬럼 의미를 비운다
- 결정 뒤 에이전트 할 일: `docs/22`(+ 작업표) 반영 → `docs/24` 맞춤 → T-080 검토 → DONE
- 풀리는 것: **T-080**

### T-082 — 시나리오 fixture 의 `event_type` 값이 `docs/05` 4.4 카탈로그에 없다

- 상태: `TODO` · 우선순위 **`P2`** · 단계: Phase 0.5 · 담당: —
- 의존: 없음 (T-069·T-080 을 막지 않는다)
- 발견 경위: T-081 (2026-09-21). `event_type` 을 논리 모델에 복구하면서 시나리오 fixture 와 대조했다
- 문제: `data/scenarios/busan-wh-capacity-01/events.json` 이 쓰는 9개 값 중 **3개가 `docs/05` 4.4 카탈로그에 없다**

  | fixture 값 | 4.4 카탈로그의 대응으로 보이는 것 |
  | --- | --- |
  | `CUSTOMS_PROGRESS_OBSERVED` | `CUSTOMS_STATUS_REPORTED` |
  | `LOCATION_OBSERVED` | `LOCATION_REPORTED` |
  | `PLAN_ENTERED` | `PLAN_SET` |

- 왜 지금 고치지 않았나: **T-081 범위 밖**이다(논리 모델이 아니라 시나리오 데이터·검증 스크립트). 그리고 `data/` 는 `front/web` Prototype 과 검증 스크립트가 함께 쓰므로 **프론트 트랙과 조율이 필요하다**
- 판단할 것: 카탈로그를 fixture 에 맞출지, fixture 를 카탈로그에 맞출지. **어느 쪽이든 `docs/05` 4.4 와 `data/` 와 `front/web/scripts/validate-scenario.mjs` 가 같은 목록을 봐야 한다**
- 하지 않을 것: 논리 모델 변경(이미 `event_type` 은 코드 테이블 값으로 두었다 — `docs/22` 18절)
- 완료 조건
  - [ ] 세 값의 정본을 정한다
  - [ ] `docs/05` 4.4 · `data/scenarios/` · 검증 스크립트가 일치한다
  - [ ] 프론트 트랙(Antigravity)과 충돌하지 않는 시점에 반영

### T-076: (NEEDS_HUMAN) 개념 데이터 모델 rev.2 재검토 + 논리 설계 착수 판정
- 상태: **NEEDS_HUMAN** | 우선: **P0** | 단계: Phase 0.5 → 1 | 담당: 사람 (+ ChatGPT 독립 리뷰)
- 의존: T-075 (DONE, 2026-09-17, 미커밋). 이전 라운드: T-073 작성 → T-074 1차 검토
- 참조 문서: **`docs/21_cera-conceptual-data-model.md`**, 짝 작업표 **`docs/21_cera-conceptual-data-model.xlsx`**, `docs/20` 22절
- 목표: 개념 데이터 모델을 승인하거나 고칠 곳을 지정한다. 승인되면 **논리 DB 설계**와 **T-070 문서 동기화**가 풀린다.
- 사람이 해야 할 것:
  - [ ] `docs/21` 6절 저장 개념 후보 **33개(+ 시설 종류 3, 형태 미확정 4, Next·보류 2, 올리지 않은 것 16)** — **과설계가 없는지.** 각 행의 "깨지는 기능"이 실제로 맞는지
  - [ ] **개수가 문서·작업표 전체에서 일치하는지** (6절 · 21.1절 · 25절 · 부록 A · `04_EntityCandidates` · `01_Overview`)
  - [ ] rev.2 에서 다시 연 5건이 적절한지: **견적 3층(5.6)** · **발송 승인 독립 기록(12.3)** · **운영 계획 묶음(12.4)** · **예외 Case(5.11)** · **비용 줄 귀속(15절)**
  - [ ] 이름 정리(14.4절)가 요구사항과 맞는지: `Ask` → **`QuestionItem`**(계약 필드 `ask_id` 유지), `ChannelCredential` → **`ChannelConnection`**
  - [ ] **RPG 스타일 DB Preview**(`docs/21_cera-db-template-preview.xlsx`)가 확정 스키마처럼 읽히지 않는지 — 경고 배너와 Schema Status: OPEN 표시 확인
  - [ ] `docs/21` 5절 판정 근거 — 특히 5.1(B/L 개수 관계) · 5.3(Destination) · 5.4(개별 차량) · 5.6(견적 이중 표현) · 5.11(예외) · 5.12(활동 타임라인)
  - [ ] `docs/21` 21절 MVP / Next / Future 구분과 25절 Minimum Conceptual Model
  - [ ] **rev.3 항목**: `docs/03` 2.6.1절이 실제 운영 흐름과 맞는지 · 운영자 개입 4종 구분이 충분한지 · **운영자 계획 조건(E-37)을 저장 개념 후보로 둔 판단**이 맞는지 · 예상·계획·실제 비용 구분 · 위험 표현 경계
  - [ ] `docs/21` 24.2절 신규 질문 **L-1~L-12** — 특히 **L-1(질문 항목 보관)·L-11(발송 승인 기록)** 은 T-069에서 바로 필요하다
  - [ ] 작업표 `16_OpenDecisions` 시트에서 **Conceptual Model Blocker** 열이 전부 「아니오」인지 확인
  - [ ] **Q-44(근거 시각 선택 규칙)·Q-45(메일 보관 기간·파기 정책)** 결정 — 개념 모델을 막지는 않지만 T-069 착수 전에 필요하다
  - [ ] 커밋 여부 결정 (T-073 · T-075 · T-077 산출물이 모두 미커밋)
- 완료 조건:
  - [ ] 개념 모델 승인 또는 수정 지시
  - [ ] 다음 단계 확정: 논리 DB 설계 → T-070 동기화 → T-069
- 완료 후 큐잉 힌트: 논리 DB 설계 태스크 신규, T-070(`docs/04`·`docs/07` 동기화), T-069(외부 통신 구현 계획)

### T-064: Control Tower Prototype 사람 검토 + 현업 검증 질문
- 상태: NEEDS_HUMAN | 우선: P0 | 단계: Phase 0.5 | 담당: 사람
- 의존: T-063
- 참조 문서: docs/16_frontend-prototype.md (3절 실행, 8절 단계별 화면, 11절 발견사항), data/scenarios/busan-wh-capacity-01/README.md, docs/15_open-questions.md Q-02·Q-37~Q-43, docs/14_decisions.md ADR-022·023
- 목표: Prototype이 "현업에게 보여주고 업무 흐름 검증 질문을 할 수 있는 수준"인지 판단하고, 화면·데이터 요구사항 수정 방향을 정한다.
- 작업 내용:
  - `cd front/web && npm install && npm run build && npm run start` → http://localhost:3000 에서 Play Scenario 또는 다음 이벤트로 9단계 재생
  - 30초 이해 테스트(처음 보는 사람), 13절 질문 1~9 확인
  - 숫자·용어·표현 검토: Current/Recoverable Exposure 정의(Q-02), v2가 v1보다 비싼 장면(Q-43), 신뢰 범주 6개
  - ADR-022(Next.js + 2D SVG), ADR-023(Prototype 우선 순서) 판정
  - 발견사항 G-1~G-13 중 반영할 것 선택, Q-37~Q-42 방향
  - 커밋 여부 결정
- 산출물: 검토 결과 (에이전트가 T-065에서 문서에 반영)
- 완료 조건:
  - [ ] Prototype 수정 필요 항목 목록 또는 "그대로 인터뷰에 쓴다" 결정
  - [ ] ADR-022·023 판정
  - [ ] T-036 재개 시점 결정
- 완료 후 큐잉 힌트: T-065가 풀린다. 인터뷰(T-058)로 바로 가면 T-017을 먼저.

### T-001: 기획 v0.2 검토 및 ADR 판정
- 상태: NEEDS_HUMAN | 우선: P0 | 단계: Phase 0 | 담당: 사람
- 의존: T-031
- 참조 문서: docs/CHANGELOG.md, docs/02_product-definition.md, docs/05_event-and-state.md, docs/14_decisions.md, docs/15_open-questions.md, docs/data/field-dictionary.md
- 목표: 기획 v0.2와 주요 설계 결정을 확정해 스키마·코드 작업을 시작할 수 있게 한다.
- 작업 내용:
  - 기획 v0.2 재정렬 결과 검토(`CHANGELOG.md` 1~4절: 변경, 폐기된 가정, 삭제 문서, 이전 지도) → 커밋 여부 결정
  - ADR 판정: **ADR-011~018** (신규), **ADR-019·020·021** (T-032), ADR-002(백엔드 스택), ADR-016(웹 + Three.js), ADR-001·004·005·006·009·010
  - T-032 결과 검토: `05_event-and-state.md`(특히 3.2 권한 매트릭스, 3.3 강도표, 8절 R1~R12, 부록 A 사례 결과), `04_domain-model.md` 2절
  - T-004 결과 검토(필드 사전, 코드표)
  - 질문 답변: Q-15(공모전), Q-17(UNI-PASS 가이드 복제 금지 문구), Q-21(체인포털 문의 여부), Q-23(권한 매트릭스에 대한 감), Q-36(잠정 입력 인지 승인 정책), Q-01·Q-02·Q-07
  - T-032 패치 최종 검토(ADR-007 재개, 계획 승인·사실 확인 분리, 근거 시각 3단계, FORECAST)
  - Gate 1·2 기준(`12_roadmap.md` 3·4절) 확인
- 산출물: `14_decisions.md`, `15_open-questions.md` 갱신 (판정 결과는 에이전트가 반영)
- 완료 조건:
  - [ ] ADR-011, 012, 013, 015, 016, 017, 018, 019, 020, 021 판정
  - [ ] ADR-002 판정 (T-003 선행 조건)
  - [ ] 판정 결과를 에이전트가 문서에 반영
- 완료 후 큐잉 힌트: T-003이 풀린다. 판정이 바뀌면 영향받는 명세 태스크 범위를 수정한다.

## 대기 — P1

### T-085 ~ T-096 — Slice 1 구현 단위 U0 ~ U11 (T-069 계획 20절)

> 공통: 상세는 `docs/tasks/plans/T-069-external-communication-slice.md` 11절(Phase) · 14절(시험) · 20절(단위·변경 가능 영역). **모두 `TODO` 이지만 T-080 이 DONE 이 되기 전에는 실행 가능하지 않다.** Architecture·Scope 를 바꾸지 않고, 계획과 다른 설계가 필요하면 멈추고 보고한다. commit·push 는 사용자 승인 뒤. **Q-65(솔버)는 어느 단위의 의존도 아니다.**

| ID | 단위 | 목적 | 의존 | 완료 조건(시험) | REAL / MOCK |
| --- | --- | --- | --- | --- | --- |
| ~~**T-085**~~ | U0 | Phase 0 — Backend 뼈대(**T-003 흡수**) · **DONE (2026-09-23)** — 아래 완료 섹션 | ~~**T-080**~~ | 오류 경계 `{code,message,request_id}` · 시계 주입 · 추적 id · 테스트 러너 (OpenAPI 뼈대는 U1 로) | 전부 REAL(뼈대). 채널·AI 설정은 mock/replay 기본값 |
| ~~**T-086**~~ (`DONE` 2026-10-06) | U1 | Phase 1 — P0 29개 마이그레이션 · 시드 · 감사/오류 기록기 · 내용 저장소 포트 · **OpenAPI 뼈대(T-085 에서 이월)** | ~~T-085~~ | 불변 표 쓰기 경로 없음 · 시드 `is_simulated` · 내용 부재 판정 C-01~03 | 저장·기록기 REAL / 시드 데이터 MOCK |
| ~~**T-087**~~ (`DONE` 2026-10-06) | U2 | Phase 2 — 등록부 · Contact Gate · 개발 안전장치 | T-086 | 게이트 실패 4종 + 안전장치 G-01~05 | 판정 REAL / 등록부 상태 시드(MOCK) |
| ~~**T-088**~~ (`DONE` 2026-10-06) | U3 | Phase 3 — 초안 · 구조화 값 · 숫자 검사 | T-087 | 숫자 검사 실패는 승인 화면에 못 오름 · AI 없이 초안 | 숫자 검사·주입 REAL / 부족분 fixture·문장 템플릿 MOCK |
| ~~**T-089**~~ (`DONE` 2026-10-07) | U4 | Phase 4 — 발송 승인 · 무효화(내용 변경 · 계획 교체 · 취소 · 만료) | ~~T-088~~ | A-02~06 | 전부 REAL |
| ~~**T-090**~~ (`DONE` 2026-10-07) | U5 | Phase 5 — Outbox · Mock 발송 · 멱등 · 화해(`lookup_sent`) · kill switch · **메시지 상태 전이 규칙 검토(T-089 기술 부채 ②)** | ~~T-089~~ | A-01 · S-01~05 · **G-06(가상 데이터 실채널 차단)** | Outbox·멱등 REAL / 채널 MOCK |
| ~~**T-091**~~ (`DONE` 2026-10-07) | U6 | Phase 6 — 수신 · 원문 · 발신자 매핑 · Quarantine · Q-44 시각 | T-089 (**T-090 과 병렬**) | I-01~07 · G-07 | 처리 REAL / 회신 MOCK |
| ~~**T-092**~~ (`DONE` 2026-10-07) | U7 | Phase 7 — 추출 · 검증기 · 구조화 채널 AI 우회 | T-091 | X-01~05 | 검증기 REAL / 추출 포트 녹화 재생(MOCK) |
| ~~**T-093**~~ (`DONE` 2026-10-26) | U8 | Phase 8 — 사실 파이프라인: 후보 → 임시 사실(PROVISIONAL) 사건 → 사람 확인(CONFIRMED · 거절 · 정정) · 충돌 · 보류 · 시간창 subset · 날짜 표현 확인 · 공백 · Agent 깨우기. 기록 `docs/24` 18.14 | ~~T-092~~ · ~~T-090~~ · T-102 | E-01~05 · 회신만으로 CONFIRMED 불가 | 전부 REAL(규칙은 `18` F.5 부분집합) |
| **T-094** | U9 | Phase 9 — 확인 요청 큐(`verification_request` V1/V4 · 처리 기록 `verification_request_handling`) · [지금도 맞음] · 후보 없이 사람 값 직접 입력 · `REVOKE` API. (사람 확인 · 거절 · 정정 자체는 T-093 에서 구현됨) | T-093 | V-01~03 | 전부 REAL |
| **T-095** | U10 | Phase 10 — OpenAPI · `CeraCommandClient` · 화면 연결(통신·확인 큐·Data Trust·타임라인) | T-094 · T-090 · **프론트 디자인 작업(Antigravity) 반영 완료** | F-01 · `validate:scenario`·`typecheck`·`lint`·`build`·`smoke` · MockProvider 기본값 유지 | 통신·확인 화면 REAL / 계획·위험·비용 화면은 시나리오 |
| **T-096** | U11 | Phase 11 — Slice 1 인수 시험 | T-095 | 계획 15절 **DoD 19항목** | 시험만 |

### T-100 ~ T-107 — Agent Runtime · 실제 공공데이터 트랙 (사용자 승인 2026-10-22, ADR-036)

> 공통: 설계 정본 `docs/tasks/plans/T-101-agent-runtime-design.md`(4~13절). Agent 는 권한 주체가 아니다 — 모든 부작용 · 권위 상태 전이는 NestJS typed Tool/API. 공공 API 는 Backend Adapter 만 부른다. 각 Task: 구현 → 사용자 보고 → 승인 → commit. push 없음.

| ID | 이름 | 목적 | 사용자에게 생기는 것 | 주요 파일 | DB | credential | 의존 | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ~~**T-100**~~ | Runtime 설정 정리 | `.env` 가 코드에 뒤처지지 않게 | `npm run env:check` · `python -m cera_ai.config` · 기동 시 조합 검사 | `back/src/config/env.ts` · `ai/cera_ai/config.py` · `.env.example` 2개 · 시험 2개 | 없음 | 없음 | — | **DONE** `1c58f08` |
| ~~**T-101**~~ | Agent Runtime 설계 | 두 오케스트레이션 · Tool 경계 · checkpoint 원칙 확정 | ADR-036 Accepted | 설계 문서 · `docs/14` | 없음 | 없음 | 사용자 승인 | **DONE** |
| **T-102** | DS-03 선박운항 + DS-02 컨테이너 Public Data Adapter | 실제 부산 입항 · 컨테이너 데이터를 원문 · 출처와 함께 수집 | 입항 건 · 컨테이너 목록 조회(개발 API) | `back/src/public-data/*` · `data/fixtures/public-data/` | **M14**(공공데이터 6표 — `vessel_call` 승격 · `public_data_fetch` 신설, `docs/22` rev.2.6) · **M15**(가드 · GRANT) | `DATA_GO_KR_SERVICE_KEY` | T-100 · T-101 | **DONE** — 사용자 승인 + live 검증(2026-10-22, DS-03 181건 · DS-02 1,227행 등) |
| **T-103** | Agent Tool Layer v1 | Agent 가 쓸 수 있는 typed Tool | Tool 계약 · 서비스 토큰 · 실행 범위 · 부작용 등급 · 감사 | `back/src/agent-tools/*` · `packages/contracts/agent-tools.json` | **M16** `agent_run` · `agent_tool_call` + **M17** 가드(`agent_step` · `agent_checkpoint` 는 T-104 에서 필요할 때) | 없음(토큰 로컬 생성) | T-101 · ~~T-102~~ | **DONE**(2026-10-22 사용자 승인) |
| **T-104** | Agent Runtime 기반 (LangGraph) | 그래프 실행 뼈대 | 실행 시작 · interrupt · resume · 상한 · 추적 | `ai/cera_ai/agent/*` · `ai/pyproject.toml` · `back/src/agent-tools/coordinator.ts` 외 | **M18** `agent_step` · `agent_checkpoint` · `agent_checkpoint_write` + `agent_run` 생애주기 · **M19** 가드 | 없음(replay) | T-103 | **DONE**(2026-10-22 사용자 승인) |
| **T-105** | 첫 Agent Vertical Slice — "정보 공백 하나를 Agent 가 메운다" | 공공데이터로 풀 공백은 Tool 로, 안 되는 공백은 문의 초안 → 승인 interrupt → Mock 발송 → 회신 interrupt → 추출 · 판정 → Backend 검증 · 솔버 없음은 정직하게 표시(설계 9.3) | 실행 타임라인(노드 · Tool · interrupt · resume) — `/dev` 수준 | 그래프 노드 · Coordinator · `/dev` 화면 | 없음 예상 | 없음(replay) / 선택: LLM 키 | ~~T-104~~ · ~~T-102~~ | **DONE**(2026-10-22 사용자 승인) |
| **T-108** | Agent 실행 화면 계약 · 재조정 확장 (T-105 후속) | 화면 · 운영 규모 | Agent 실행 보기 OpenAPI DTO(지금은 느슨한 object — 화면이 자체 타입) · 재조정 페이지 넘김(기다리는 실행이 100건 넘으면 오래된 것만 보는 문제) · checkpoint 보관 · 정리 주기 | `back/src/agent-tools/` · `front/web/src/api/agentRuns.ts` | 없음 예상 | 없음 | T-105 | TODO · P2 |
| **T-106** | UNI-PASS Adapter (DS-01) | 통관 진행 · 반출입 이력 | 실제 B/L 의 통관 진행 조회 | `back/src/public-data/` 아래 DS-01 어댑터 | 작음(필요 시 M16+) | `UNIPASS_API_KEY` + 실제 B/L 5~20건(T-002) | T-102 · T-002 | TODO |
| **T-107** | Demo Scenario v2 (REAL 공공 + SYNTHETIC 사설) | 실제 부산 사건 기반 시연 | 실제 입항 · 컨테이너 + 합성 창고 · 트럭 · 요율 · 회신 | `data/scenarios/` v2 | 없음 | `DATA_GO_KR_SERVICE_KEY` | T-102 (T-106 있으면 더 좋음) | TODO |

### T-099 — 실제 AI 공급자 검증 + CERA 추출 평가셋 (T-093 전에)

- 상태: TODO(재배치 — 2026-10-12 중단, WIP `5ba83ab`) | 우선: P1 | 단계: Slice 1 | 담당: -(직전 Claude Code / 2026-10-12)
- 의존: ~~T-092~~ · **T-105**(사용자 결정 2026-10-22 — Agent Runtime 기반 · 실제 공공데이터 Tool 기반 뒤에 재개. 폐기 아님). 재개 시 범위에 **Tool Selection · Workflow 평가와 single-call vs graph 비교**를 더한다(설계 12.2). **T-093(U8)은 이 작업 뒤에 시작한다**(사용자 결정 2026-10-07)
- 목적(사용자 지시 2026-10-07): 새 제품 기능이 아니라 **"실제 모델이 CERA 의 한국어 · 영어 물류 회신을 얼마나 정확하게 읽는가"** 를 확인한다. 공급자를 감으로 고르지 않는다
- 범위:
  - **CERA 전용 작은 평가셋**(합성 회신 — 실제 메일 아님): 확정 답 · 조건부 답 · 부분 답 · 질문 밖 정보(단가 등) · 모호 표현 · 한국어 · 영어 · 프롬프트 인젝션
  - 비교 지표: 값 추출 정확도 · 근거 인용 정확도 · 질문 범위 위반률 · 스키마 실패율 · 조건부 표현 처리 · 지연 · 비용
  - 후보: 생성형 추출 = 상용 LLM 공급자 1~2개 · 판정(decision) = **"TypeSafe Jev"**(사용자 표기 그대로 — 정체 · 라이선스 `[TO VERIFY]`) 와 필요하면 비교 판정 모델 · 로컬 기준선 = 상용 사용 가능한 Hugging Face 분류/NLI 모델 후보
  - Jev 는 값 추출 대체제가 아니라 확정 답인가 · 조건부 답인가 · 질문에 실제로 답했는가 · 사람 확인이 필요한가 같은 **확률적 판정 후보**로 검토한다
- 하지 않는 것: 공급자 결정을 문서에 확정(결정은 평가 결과와 함께 ADR 로 사용자 승인) · Event · PROVISIONAL · T-098
- 산출물(제안): 평가셋 · 평가 실행기 · 결과표 · 공급자 선택 ADR(Proposed) · 선택된 어댑터(`ai/cera_ai/providers.py` 자리)
- 비밀값: API 키는 서버 환경변수(`.env`, gitignore)만

### T-098 — 실제 서비스 화면으로 전환: 역할별 앱(운영자 · 관리자 · 현장 담당자) · 로그인 · 페이지 분리

- 상태: TODO | 우선: P1 | 단계: Slice 1 → 시연 | 담당: -
- 의존: **T-090**(사용자 결정 2026-10-07 — 발송을 먼저 끝낸다). 착수 전 Brief → Plan → 사용자 승인(`docs/17` 전체 흐름 — 여러 영역 · Architecture 변경)
- 배경(사용자 지시 2026-10-07): 지금 `front/web` 은 한 화면 재생형 시연(Control Tower + 실제 연결 카드 1개)이다. 역할마다 보는 화면이 다른 **실제 페이지**로 간다. 영상 편집은 사용자가 한다
- **사용자 결정(2026-10-07)**:
  1. 역할 = **운영자** · **관리자** · **현장 담당자**(`docs/03` 1절). 외부 거래처는 화면 없음(메일 회신 — 정본 그대로)
  2. **관리자는 운영자와 완전히 다른 화면**(별도 콘솔: 등록부 · 계약/Tariff · 목적지 · 자원 · 사용자 관리)
  3. 영상 용도 = **투자 · 공모전 시연**. 사용자 추가 지시: **시나리오 · 더미 표현은 최소화(없애도 됨)**. → 에이전트 권고: 카드마다 붙은 "시나리오 · Mock · Solver 아님" 배지와 재생 바 같은 시연 장치는 없애고, 데이터는 현실적인 가상 데이터로. 다만 **아직 실행되지 않은 엔진(Solver · 비용 · 위험)의 결과를 실제 계산 결과처럼 보이게 하는 것은 `AGENTS.md` 규칙 9 · `docs/01` 4절과 충돌** — 전역 표시 1곳(예: 화면 구석 "데모 환경")으로 줄이는 안을 Plan 에서 사용자에게 제시. 표시를 완전히 없애려면 규칙 9 개정(사용자 결정)이 먼저
  4. 순서 = **T-090 먼저**, 그 뒤 이 Task
- Plan 에서 정할 것(사용자 승인 필요): 로그인 · 세션 방식(인증 최소안 — T-089 기술 부채 ① `X-CERA-Actor-Id` 교체) · 역할 모델(`actor` 확장 또는 새 표 — DB 변경이면 M13+ · 새 ADR) · 라우터 선택(ADR-035 미선택) · 화면 지도(SCR-01~09 → 역할별 페이지, T-040 Wireflow 흡수 여부) · 현장 담당자 화면 범위(짧은 보고 · 확인 — SCR-03 · 모바일 폭) · 첫 조각(앱 뼈대 + 통신 · 승인 화면 이전)
- 하지 않는 것: 외부 거래처 포털 · 실제 메일 발송 · 실제 고객 데이터
- 완료 후 큐잉 힌트: 역할별 화면 조각 Task 들 · T-095(U10)와 범위 정리

### T-073: CERA Conceptual Data Model (개념 데이터 모델) — **DONE, 아래 완료 섹션 참조**
- 상태: **DONE (사람 검토 대기)** | 우선: P1 | 단계: Phase 0.5 → 1 | 담당: Claude Code / 2026-09-17
- 의존: **T-072 (DONE, `1b97905`)** — `docs/20` 18절이 착수 조건 충족을 판정했다. T-069는 의존이 아니라 **후속**이다
- 참조 문서: **`docs/20_data-model-preconditions.md`(특히 3·7·8~17·18·19·22절)**, `docs/05_event-and-state.md`, `docs/04_domain-model.md`, `docs/07_backend-architecture.md` 4절, `docs/13_glossary.md`, `docs/01_project-rules.md`, `docs/14_decisions.md`, `docs/19_external-communication-requirements.md`, `docs/15_open-questions.md`, `data/scenarios/busan-wh-capacity-01/*`, `front/web/scripts/validate-scenario.mjs`
- 목표: **테이블이 아니라 개념과 관계를 정한다.** CERA가 현실에서 다루는 데이터가 각각 무엇인지(독립 대상 / 속성 / 코드값 / 운영 사실·관측 / 현실 사건 / 현재 상태 / 계산 결과 / 계획·결정 / 외부 참조 / 근거·원문 / 범위 밖) 분류하고, 무엇으로 식별되며 무엇과 관계가 있는지, 원본인지 파생인지, 시간 축이 필요한지, MVP 필수인지를 확정한다
- 작업 내용:
  - `docs/20` 22.6의 개념 목록을 하나씩 분류(9분류) + 식별·관계·원본/파생·시간축·MVP 필수 여부를 함께 적는다
  - **과설계 방지 질문을 모든 독립 엔티티 후보에 적용**: "독립 관리하지 않으면 CERA의 어떤 기능이 실제로 깨지는가". 답을 못 하면 속성·사실·값 객체·뷰·미래 범위로 낮춘다
  - 절대 섞지 않을 것: 원본 사실 vs 현재 믿는 상태 / 관측 vs 예상 vs 사용자 계획 vs 실제 결과 / 계약 요율 vs 견적 vs 적용 요율 vs 예상·계획·실제 비용 / 거래처 vs 연락처 vs 주소 / 통신 기록 vs 추출된 운영 사실 / 감사 기록 vs Operational Event
  - Accepted ADR과 Proposed ADR을 구분해 표시한다(**ADR-028은 Accepted**. 옛 표기를 정본으로 삼지 않는다)
  - `validate-scenario.mjs` 규칙을 **CERA 전체 불변 규칙 / 현재 시나리오 전용 규칙**으로 갈라 적는다
  - 30대 시나리오 역매핑 + 외부 통신 요구사항 역매핑, MVP / Next / Future 구분, 명시적 제외 물류 영역, Minimum Conceptual Model
- 산출물: **`docs/21_cera-conceptual-data-model.md`** (25개 절)
- 하지 않는 것: SQL DDL · 테이블·컬럼·PK/FK·자료형·인덱스 · ORM · migration · DB 제품(SQLite/PostgreSQL) 확정 · API endpoint 확정 · LLM 공급자·모델 확정 · 솔버 확정 · Backend 구현 · Frontend 변경 · **제품 코드 수정**
- 완료 조건:
  - [ ] `docs/21`에 25개 절이 모두 있다
  - [ ] 모든 독립 엔티티 후보에 "깨지는 기능" 근거가 붙어 있다
  - [ ] Q-53 · Q-56 · Q-57 · Q-61에 대한 **개념 수준 결론**이 있다
  - [ ] Q-54·55·58·59·60·62·63과 M-6·Q-46을 **확정하지 않았음**이 문서에 명시돼 있다
  - [ ] 저장소 근거와 외부 도메인 확장이 구분 표시돼 있다(`docs/20` 22.7)
  - [ ] SQL·DDL·기술 선택이 문서에 없다
  - [ ] `git status`에 `front/`·`back/`·`ai/`·`data/`·`packages/`·`infra/` 변경이 없다
  - [ ] **사람 검토 대기 상태로 끝낸다**(논리 DB 설계로 자동 진행하지 않는다). 승인 없이 commit 하지 않는다
- 완료 후 큐잉 힌트: 논리 DB 설계 태스크(개념 모델 승인 뒤), T-070(`docs/04`·`docs/07` 동기화가 개념 모델 결과를 기다리고 있다), T-069(외부 통신 구현 계획), T-034(메일 Event 스키마)

### T-065: Prototype 발견 요구사항을 정본에 반영
- 상태: TODO | 우선: P1 | 단계: Phase 0.5 | 담당: -
- 의존: T-064
- 참조 문서: docs/16_frontend-prototype.md 11절, docs/04_domain-model.md 2.3·4.3·6.4, docs/05_event-and-state.md 4.3·11.5, docs/08_optimization-model.md 6·7절, docs/15_open-questions.md Q-02·Q-37~Q-42
- 목표: T-064 판단에 따라 G-1~G-13을 `04`·`05`·`07`·`08`에 반영하고, Prototype 화면·데이터 팩을 고친다.
- 작업 내용:
  - `08` 7절 출력에 범위 분리(`route_summary_20`/`recovery_action_summary_12`/`unchanged_direct`/`cost_scope`), `result_kind` 추가 (G-1·G-2)
  - `04` 6.4 Exposure 정의 확정안 (G-3, Q-02), `04` 4.3 RateQuote 구조화 조건 (G-9), `04` 2.3 위치 값 (G-10, Q-42)
  - `05` 11.5 / `08` 6절에 승인 계획의 입력 변경 상태 (G-4, Q-37), 값 변경 없는 회신 처리 (G-7, Q-40), 다음 날 수용량 전망 (G-6, Q-38)
  - 사람이 요청한 Prototype 화면 수정, `validate:scenario`·`smoke` 재통과
- 산출물: 정본 갱신, `front/web/`·데이터 팩 수정
- 완료 조건:
  - [ ] T-064 결정 항목 전부 반영 또는 보류 사유 기록
  - [ ] `npm run validate:scenario`, `typecheck`, `lint`, `build`, `smoke` 통과
- 완료 후 큐잉 힌트: T-036 재개(DEFERRED → TODO), T-040·T-038 범위 재조정.

### T-036: Recovery 최적화 모델 명세
- 상태: **DEFERRED** (2026-09-15) | 우선: P1 | 단계: Phase 0 → 0.5 뒤 | 담당: -
- 보류 사유: 운영 데이터·제약이 검증되기 전에 수학모델을 먼저 고정하면 가정을 과도하게 설계할 위험이 있다. Prototype-led Discovery에 따라 Control Tower Prototype과 현업 검증을 먼저 한다(2026-09-14 사람 지시, ADR-023, `12_roadmap.md` 2.5절). 삭제가 아니라 보류다.
- 재개 조건: T-064(사람 검토) 완료 + T-065 반영. 재개 때 입력에 `16_frontend-prototype.md` 11절(G-2·G-4·G-5·G-8)과 Q-37·Q-39·Q-41을 더한다
- 의존: T-064, T-065 (2026-09-15 추가)
- 참조 문서: docs/08_optimization-model.md, **docs/05_event-and-state.md 14절(Planning Snapshot 입력 계약)**, docs/04_domain-model.md 5·6절, docs/09_mvp-scenario.md, docs/16_frontend-prototype.md 11절, docs/15_open-questions.md Q-01·Q-07·Q-39·Q-41
- 목표: MVP 시나리오를 풀 수 있는 1단계 모델을 수식·데이터 입력·비용 계수 정의까지 확정하고, **솔버를 선택한다**(ADR-007 Reopened).
- 작업 내용:
  - **솔버 비교**: 확정한 문제 구조로 CP-SAT / MILP / min-cost flow / VRP / scheduling을 비교해 가장 단순하고 검증 가능한 것을 고르고, ADR-007을 Accepted 또는 Superseded로 다시 올린다(Q-35)
  - 변수·제약·목적의 최종 형태(ODCY 2구간 트럭 단순화 유지 여부, 대기 표현, λ)
  - 비용 계수 계산 절차(어느 비용 항목을 어떤 입력으로)와 손 검산 예제 3건
  - Baseline 휴리스틱 절차, Recovery 대상 선정 규칙(Q-01)
  - 재최적화 트리거·잠금·디바운스, 재현성(단일 워커·타이브레이크)
  - `resource_gaps` 산출 규칙(Communication 입력)
- 산출물: `docs/08_optimization-model.md` 확정판
- 완료 조건:
  - [ ] 12대 영향 장면을 손으로 풀 수 있을 만큼 작은 예제(3대·2 ODCY·4슬롯)의 정답 표
  - [ ] Q-01, Q-07 갱신
- 완료 후 큐잉 힌트: T-045가 풀린다(T-043 뒤).

### T-037: MVP 시나리오 데이터 팩 (정식 Event fixture 판)
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-032, T-061 (2026-09-15: Prototype 판 데이터 팩이 컨테이너·자원·타임라인·결과값을 이미 정함)
- 참조 문서: docs/09_mvp-scenario.md (0절), data/scenarios/busan-wh-capacity-01/, docs/05_event-and-state.md, docs/04_domain-model.md, docs/11_data-sources.md
- 목표: `busan-wh-capacity-01` 시나리오를 재생 가능한 데이터로 만든다(코드 없이 YAML·CSV·텍스트). **2026-09-15 범위 조정**: 컨테이너 30대·자원·스크립트 시각·기대 결과는 T-061 JSON을 원천으로 쓰고, 이 태스크는 그 위에 T-032 스키마 전체를 만족하는 Event fixture, 합성 메일 원문, 공공 API 합성 fixture, 합성 계약서를 더한다. 사람 지시(2026-09-11)에 따라 T-032 사람 검토 뒤 착수.
- 작업 내용:
  - 컨테이너 30대(합성 ISO 6346 번호), 선사 3곳 Tariff(자리표시 `[ASSUMPTION]`), LFD 분포
  - 자원(창고·트럭·ODCY·슬롯) 슬롯별 값, 초기 계획
  - 시각별 스크립트 이벤트(09:30 충돌, 11:00 예외), 합성 메일(발송 기대 초안 3건, 회신 3건)
  - 공공 API 합성 fixture(실제 응답 구조를 본뜬 것, 식별자 합성)
  - 기대 결과 범위(Plan v1·v2 모양, 금액 범위)
- 산출물: `data/scenarios/busan-wh-capacity-01.yaml`, `data/scenarios/busan-wh-capacity-01/` (CSV, 메일, fixture)
- 완료 조건:
  - [ ] 모든 Event가 T-032 스키마를 만족
  - [ ] 모든 가정값에 태그
  - [ ] `09_mvp-scenario.md` 갱신
- 완료 후 큐잉 힌트: T-038, T-046, T-017이 풀린다.

### T-029: 공개 D&D Tariff 원문 조사
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: 없음
- 참조 문서: docs/04_domain-model.md 4·5절, docs/15_open-questions.md Q-08·Q-09
- 목표: 선사 공개 Tariff 원문을 조사해 TariffRule 스키마가 표현해야 할 규칙과 계약 추출 대상 필드를 찾는다.
- 작업 내용:
  - 한국(부산) 수입 기준 공개 D&D Tariff 2~3개 선사 조사(공개 여부부터)
  - 선사별 Free Time, 기산 이벤트, 역일/영업일, 휴일 제외, Combined/Split, 요율 구간, 통화, 만료 시각
  - 현재 TariffRule 초안으로 표현할 수 없는 규칙 목록
  - 합성 계약서(T-037)의 현실성 기준 제안
- 산출물: `docs/data/tariff-research.md`
- 완료 조건:
  - [ ] 선사마다 출처 URL·확인일·태그
  - [ ] Q-08, Q-09 1차 결론
  - [ ] `docs/README.md` 색인 등록
- 완료 후 큐잉 힌트: T-033 입력.

### T-033: Contract·Tariff·RateQuote 스키마
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-029
- 참조 문서: docs/04_domain-model.md 4절, docs/06_agent-architecture.md 6절, docs/data/tariff-research.md
- 목표: 계약 추출 후보(DRAFT) → 확정 규칙(CONFIRMED) 흐름의 스키마를 확정한다. (옛 T-008 대체)
- 작업 내용:
  - TariffRule(D&D·Storage·Handling·Transport), RateQuote, Contract 스키마와 필드별 evidence 구조
  - 규칙 선택 순서, 버전 관리, 확인 UI에 필요한 필드
  - LFD 계산 규칙 명세와 손 검산 예제 5건
- 산출물: `docs/04_domain-model.md` 4절 확정, `schemas/tariff_rule.schema.json` 초안
- 완료 조건:
  - [ ] T-029에서 찾은 규칙을 모두 표현하거나, 못 하는 것을 목록으로 남김
  - [ ] Q-08, Q-09 갱신
- 완료 후 큐잉 힌트: T-043, T-050이 풀린다.

### T-034: 메일 Event 스키마 + LLM 추출 계약 + 평가 세트 설계
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-032
- 참조 문서: docs/05_event-and-state.md 4.3절, docs/06_agent-architecture.md 6절, docs/11_data-sources.md 5절
- 목표: 메일(운송사·ODCY·창고 회신, 창고 예외 메일)을 어떤 스키마로 추출하고 어떻게 검증·평가할지 정한다.
- 작업 내용:
  - TruckAvailability, YardCapacity, WarehouseCapacity, RateQuote, Exception 추출 스키마(필드별 evidence)
  - 검증기 규칙 목록, 신뢰도 결정 표
  - 합성 메일 평가 세트 설계(정상·모호·거절·조건부 각 유형), 목표 정확도(Gate 2 기준)
  - 녹화 fixture 형식
- 산출물: `docs/06_agent-architecture.md` 6절 갱신, `schemas/extraction/*.schema.json` 초안, 평가 세트 목록
- 완료 조건:
  - [ ] 시나리오 회신 3건이 스키마로 표현됨
  - [ ] R-6 검증 방법 구체화
- 완료 후 큐잉 힌트: T-039, T-049가 풀린다.

### T-035: Risk 모델 명세
- 상태: TODO | 우선: P1 | 단계: Phase 0 | 담당: -
- 의존: T-032
- 참조 문서: docs/04_domain-model.md 6절, docs/09_mvp-scenario.md
- 목표: 위험 유형별 판정식, 영향 컨테이너 탐지, 등급, Exposure 계산 절차를 확정한다.
- 작업 내용:
  - WAREHOUSE_SHORTFALL 영향 컨테이너 선정 규칙(어느 12대인가)
  - STATE_UNCERTAIN(중요 사실의 `decision_usability = APPROVAL_BLOCKED`)의 위험 반영 방식. 입력은 Planning Snapshot(`05` 14절)
  - 등급 기준(Q-14), Exposure 정의(Q-02) 확정안
- 산출물: `docs/04_domain-model.md` 6절 확정판
- 완료 조건:
  - [ ] 시나리오 11:00 장면의 영향 판정을 손으로 재현하는 예제
- 완료 후 큐잉 힌트: T-044가 풀린다.

### T-003: 저장소 초기화
- 상태: **DEPRECATED (2026-09-21)** — T-069 승인으로 **T-085(U0 Backend 뼈대)** 에 흡수됐다. 이 ID 는 다시 쓰지 않는다 | 우선: P1 | 단계: Phase 0 | 담당: -
- **2026-09-21 — T-069 계획이 이 태스크를 구현 Phase 0 으로 흡수한다**(`docs/tasks/plans/T-069-external-communication-slice.md` 11.0). 아래 "uv/pyproject(Python 3.12)" 표현은 옛 초안이다 — Backend 언어는 미결(Q-64). T-069 가 승인되면 이 항목은 Phase 0 작업 단위(U0)로 대체된다
- 의존: T-001 (ADR-002, ADR-016 판정)
- 참조 문서: docs/07_backend-architecture.md 3·6·7절, docs/01_project-rules.md 6·7절
- 목표: 코드 작업의 뼈대를 만든다(`back/` + `ai/`). 2026-09-15: Monorepo 영역(`front/`·`back/`·`ai/`·`packages/`·`infra/`)과 루트 `README.md`는 T-066에서 먼저 만들었다(ADR-024)
- 작업 내용:
  - ~~`git init`, `.gitignore`~~ — 2026-09-10 사용자 지시로 선행 완료. `.gitignore`는 필요하면 보강
  - uv + `pyproject.toml` (Python 3.12 후보, ADR-002), `back/`·`ai/` 패키지 뼈대(옛 계획 `src/cera/` → `07` 6절 배치표), back·ai 공통 `domain` 패키지 위치 결정, 영역별 `tests/`, ruff·pytest 설정
  - ~~`web/` Vite + React + TypeScript 뼈대~~ — 2026-09-15 T-063에서 **Next.js로 선행 생성**(ADR-022 Proposed), T-066에서 `front/web/`으로 이동. 판정이 바뀌면 여기서 조정
  - `.env.example`, `policy.yaml`(가정값 + 태그, `back/` config 아래)
  - ~~사람용 `README.md`~~ — T-066에서 선행
  - `AGENTS.md` 6절 개발 명령어 채우기, 코드·커밋 메시지 언어 결정
- 산출물: 저장소 뼈대
- 완료 조건:
  - [ ] `uv run pytest` 통과(빈 테스트 1개 이상), `uv run ruff check` 통과
  - [ ] web 개발 서버 기동 확인
  - [ ] AGENTS.md 6절 갱신
- 완료 후 큐잉 힌트: T-041이 풀린다(T-032 뒤).

## 대기 — P2

> **T-099 점검에서 나온 유지보수 후보 (2026-10-26)** — 근거 위치를 오케스트레이터가 직접 대조한 것만 올렸다(하위 에이전트 보고 중 "모듈 순환 없음"은 **틀렸다**: `persistence` ↔ `content` 순환이 있다). 지금 feature 작업을 멈추고 하지 않는다. 사용자가 순서를 정한다.

### T-108: AI 설정 읽기 통합 (os.environ → Settings)
- 상태: TODO | 우선: P2 | 단계: Phase 1 | 담당: -
- 의존: 없음 (T-099 와 독립)
- 참조 문서: `ai/cera_ai/config.py`, `AGENTS.md` 6절
- 목표: 설정 키 이름 · 검증이 `config.py` 한 곳이라는 원칙을 모듈 코드에도 적용한다.
- 근거(직접 확인 2026-10-26): `os.environ` 직접 읽기 — `llm_adapters.py`(키 · `CERA_LLM_EFFORT` · `CERA_LOCAL_LLM_*`), `providers.py:95-101`(`CERA_LLM_MODE/PROVIDER/MODEL`, `CERA_AI_REPLAY_DIR`), `decision.py:161`(`OPENROUTER_API_KEY`), `app.py:125`(`CERA_AGENT_TOOL_TOKEN`), `__main__.py:14`(`CERA_AI_LOG_LEVEL`), `tools/client.py:146`. 평가 CLI 의 자체 `.env` 파서 `evals/__main__.py:207-218`. 기본 포트 3100/8100 이 `back/src/config/env.ts:31,63,88` 과 `config.py:26,47` 에 각각 있음
- 완료 조건: [ ] `Settings` 를 주입받는 형태로 바꾸되 외부 동작 불변 [ ] `.env` 읽기 한 곳 [ ] 기존 시험 통과

### T-109: 큰 파일 책임 분리 (기능 변경 없음)
- 상태: TODO | 우선: P2 | 단계: Phase 1 | 담당: -
- 의존: 해당 영역 feature 작업 사이의 빈 구간
- 목표: 한 파일에 여러 책임이 모인 곳을 나눈다. 대규모 refactor 로 feature 를 멈추지 않는다 — 다음에 그 파일을 고치는 Task 가 시작될 때 함께 한다.
- 근거(직접 확인 2026-10-26, 줄 수): `back/src/communication/draft.service.ts` 955 · `communication/dto.ts` 654 · `public-data/public-data.service.ts` 589 · `public-data.repository.ts` 430 · `db/schema/m04-communication.ts` 521 · `ai/cera_ai/agent/graph.py` 455 · `ai/cera_ai/decision.py` 330(공급자 5종 `Jev` · `LlmJudge` · `Nli` · `Prior` · `Recorded` 가 한 파일)
- 완료 조건: [ ] 책임별 분리 [ ] 공개 API 불변 [ ] 시험 통과

### T-110: 모듈 순환 · CI · ai 의존성 고정
- 상태: TODO | 우선: P2 | 단계: Phase 1 | 담당: -
- 의존: 없음
- 목표: (1) `back/src/persistence` ↔ `content` 모듈 순환 해소 — `persistence.module.ts:2-4` 가 `content/*` 를 import 하고, `content/content-service.ts:7-9` 가 `persistence/*` 를 import 한다(파일 단위 순환은 아니지만 모듈 경계가 흐리다). (2) `.github` 가 없다 — typecheck · 시험 · `docker compose config` 와 conformance(`validator-conformance.test.ts` · `test_validator_conformance.py`) · 계약 최신 여부 시험을 GitHub 에서 자동 실행하는 CI(검증기 drift 자체는 T-099 에서 시험으로 해결됨 — 자동 실행만 남음). (3) `ai/` 의존성 lockfile(지금은 상한만 있다)
- 완료 조건: [ ] 순환 제거 또는 의도 문서화 [ ] CI 가 conformance 두 시험을 돌림 [ ] ai lockfile

### T-111: Truth Lifecycle Hardening (Solver 전 필수)
- 상태: **DONE (2026-10-26, 사용자 승인)** | 우선: P0 | 단계: Phase 1 | 담당: Claude Code / 2026-10-26 · 기록 `docs/24` 18.16
- 의존: ~~T-093~~
- 목표: 사실이 바뀌거나 틀렸을 때 안전하게 되돌린다 — Solver 가 낡은 · 철회된 값을 현재 사실로 쓰지 않게.
  (1) **철회 · 무효화**: 확정 값이 더는 유효하지 않은데 새 값이 없는 경우(예: 10:00 CONFIRMED 4대 → 14:00 업체 사정 변경). 현재 스키마의 `VERIFICATION(REVOKE)` · 값 없는 `CORRECTION`(철회 — 판정 규칙은 이미 있음) 중 무엇으로 표현할지 설계 + 사람 API
  (2) **신선도(Q-24)**: 명시적 `valid_from` · `valid_until` 이 있으면 그것 우선. 없는 운영 사실은 계열별 정책(창고 수용량 · 차량 가용 · 게이트 · 선석 관측) — 임의 TTL 금지, 계열별로 정한다. 주기 재판정
  (3) **사람 직접 입력**: AI 후보 없이 운영자가 사실을 입력("창고 B 오늘 6대", 전화 확인) — HUMAN_UI 사건 · 감사 · 출처
  (4) **날짜를 담는 회신 계약** `reply-extract/2`(답의 날짜 칸) + 검증기 · conformance — 지금은 `date-scope.ts` 가 날짜 표현이 질문 날짜와 다르면 막기만 한다
  (5) **확인 요청 큐** 필요성 검토(`verification_request` V1/V4 · 처리 기록 — T-094 와 합칠지)
- 완료 조건: [x] 철회 · 무효화 → 현재 사실에서 빠짐 · 공백 다시 열림 · Agent 깨움 [x] 신선도가 판정 · R11 에 반영 [x] 직접 입력 API + 화면 [x] `reply-extract/2` [x] 시험 · Docker E2E · 브라우저. (5) 확인 요청 큐 = T-098 로 미룸(검토 결과)
- 후속 후보(작게): 차량 풀 목록 API(화면 직접 입력 대상) · 화면의 as_of 선택기 · 신선도 시작값 조정(관측 후)
- **T-112 · T-113 · T-114 DONE(2026-10-26).** 다음(2026-10-27 사용자 스프린트 지시 — 영역마다 구현 → 시험 → 전체 regression → 명시 staging → commit → normal push): 1 Real Gmail Channel → 2 Redis execution queue → 3 Authentication / RBAC → 4 Full UI redesign → 5 Final integration fixes. 그 밖 실행 가능: T-115 · T-116 · T-117

### T-112: Cost / Risk Engine (결정론)
- 상태: **DONE (2026-10-26, 사용자 승인 — 커밋 · push)** | 우선: P0 | 단계: Phase 1 | 담당: Claude Code / 2026-10-26 · 기록 `docs/24` 18.17
- 의존: ~~T-111~~
- 목표: 컨테이너 × 복구 선택지마다 비용 · 위험을 결정론으로 계산(순수 함수, LLM · DB · HTTP 없음). 비용 항목별 출처 · 가정 표시, 사실 상태(CONFIRMED · PROVISIONAL · AGING · STALE · REVOKED · CONFLICTED · UNKNOWN) 반영, 실행 가능 여부 · 이유, Baseline 도 같은 엔진
- 완료 조건: [x] 30대 시나리오 비용 계산(Baseline 4,650,000 · v1 3,835,000 · v2 3,855,000 재현) [x] 시험 A~N(unit 16)

### T-113: Recovery Solver
- 상태: **DONE (2026-10-26, 사용자 승인 — 커밋 · push)** | 우선: P0 | 단계: Phase 1 | 담당: Claude Code / 2026-10-26 · ADR-038 Proposed(HiGHS MIP)
- 의존: T-112
- 목표: Cost Engine 출력으로 총 예상 손실 최소 할당(용량 · 차량 · 시간창 · 한 컨테이너 한 행동). 결과 상태(OPTIMAL · FEASIBLE · INFEASIBLE · TIME_LIMIT · ERROR) · 불가 원인 설명 · 결정론
- 완료 조건: [x] 30대 해(S7 OPTIMAL 5,815,000 · ≈0.5 s) [x] 시험(unit 12 — 전수 조사 대조 · 결정론 · 사실 변경)

### T-114: Recovery Plan Integration
- 상태: **DONE (2026-10-26, 사용자 승인 — 커밋 · push)** | 우선: P0 | 단계: Phase 1 | 담당: Claude Code / 2026-10-26
- 의존: T-113
- 목표: 제안 계획 저장(PROPOSED · 판 관리) · 사용한 사실 기록 · 사실 변경 → 계획 OUTDATED → Agent 재계산 · 화면 · Docker E2E
- 완료 조건: [x] M22 · M23(표 2) [x] 판 관리 · OUTDATED · 사람 승인 [x] Agent Tool 4 · 그래프(plan_recovery) [x] 화면 계획 패널 [x] Docker E2E v1 → v2 → v3 → 승인 → PLAN_APPROVED [x] 시험(Backend 426 · Python 85 · Front 79)

### T-115: 실제 계획 실행의 컨테이너 · 요율 입력 연결
- 상태: TODO | 우선: P1 | 단계: Phase 1 | 담당: -
- 의존: T-114
- 목표: 지금은 시뮬레이션 계획 실행만 계산된다(시나리오 팩). 공공데이터 컨테이너(T-102) · 확정 Tariff 를 계획 실행에 묶어 실제 실행도 `PLANNING_INPUT_UNAVAILABLE` 없이 계산되게 한다(없는 값은 NOT_AVAILABLE 그대로)

### T-116: 승인된 계획 → 후속 문의 초안(사람 승인)
- 상태: TODO | 우선: P1 | 단계: Phase 1 | 담당: -
- 의존: T-114
- 목표: 승인된 계획의 ODCY 반입 · 협력 트럭 배정을 상대 업체 문의 초안으로 만든다(초안 → 사람 승인 → 발송 — 기존 경로). 배차 · 예약 Write 는 하지 않는다(규칙 4)

### T-117: Solver 모델 확장 후보 — 다음 날 트럭 · ODCY 일별 점유 · 벌점 보정
- 상태: TODO | 우선: P2 | 단계: Phase 1 | 담당: -
- 의존: T-114
- 목표: `docs/08` 10절에서 모델 밖에 둔 것(다음 날 운송 트럭 · ODCY 일별 점유 · 반출 슬롯)과 정책 벌점 · 협력 회신 해석 [ASSUMPTION] 을 관측 뒤 보정. 규모가 커지면 CP-SAT 재비교(ADR-038 대안 a)

### T-038: Three.js Simulator 상세 명세
- 상태: TODO | 우선: P2 | 단계: Phase 0~3 | 담당: -
- 의존: T-037
- 참조 문서: docs/10_simulation-spec.md, docs/09_mvp-scenario.md
- 목표: 장면 배치·오브젝트·상태→시각 매핑·SSE 메시지 형식·카메라 경로를 구현 가능한 수준으로 정한다.
- 산출물: `docs/10_simulation-spec.md` 확정판(와이어프레임 포함)
- 완료 조건:
  - [ ] 시나리오 타임라인의 각 단계에 대응하는 화면 상태 표
- 완료 후 큐잉 힌트: T-056.

### T-039: Communication·Response Agent 명세
- 상태: TODO | 우선: P2 | 단계: Phase 0~2 | 담당: -
- 의존: T-034
- 참조 문서: docs/06_agent-architecture.md, docs/05_event-and-state.md 5.3절
- 목표: 문의 초안 템플릿(구조화 값 + LLM 문장), 승인 흐름, 스레드 규칙, 회신 → Event 흐름을 확정한다.
- 산출물: `docs/06_agent-architecture.md` 갱신
- 완료 조건:
  - [ ] 시나리오 발송 초안 3건의 기대 형태
  - [ ] 숫자 검사 규칙 명세
- 완료 후 큐잉 힌트: T-051.

### T-040: UI Wireflow
- 상태: TODO | 우선: P2 | 단계: Phase 0~3 | 담당: -
- 의존: 없음
- 참조 문서: docs/03_requirements.md 5절, docs/09_mvp-scenario.md
- 목표: SCR-01~09의 화면 흐름과 짧은 액션 UX를 정한다.
- 산출물: `docs/ui/wireflow.md` (텍스트 와이어프레임 + 흐름도)
- 완료 조건:
  - [ ] 시나리오 한 바퀴를 화면 이동으로 따라갈 수 있음
  - [ ] `docs/README.md` 색인 등록
- 완료 후 큐잉 힌트: T-054.

### T-017: Prototype 기반 인터뷰 가이드
- 상태: TODO | 우선: P2 | 단계: Phase 3 준비 → 0.5 | 담당: -
- 의존: T-063 (2026-09-15: T-037 대신 Control Tower Prototype을 보여주며 묻는다)
- 참조 문서: docs/02_product-definition.md 9절, docs/15_open-questions.md (Q-37~Q-43 포함), docs/09_mvp-scenario.md, docs/16_frontend-prototype.md 8절
- 목표: 데모를 보여준 뒤 "무엇이 틀렸는가"를 묻는 인터뷰 질문지를 만든다(v0.2에서 방향 변경: 아이디어 인터뷰 → Prototype 인터뷰).
- 작업 내용:
  - 대상별(포워더, 화주 물류팀, 운송사, ODCY, 창고) 30~45분 질문지
  - R-2~R-8, Q-23~Q-31 검증 문항 대응표
  - 시나리오 장면별 "현장과 다른 점" 질문, 결과 기록 템플릿
- 산출물: `docs/research/interview-guide.md`, `docs/research/interview-template.md`
- 완료 조건:
  - [ ] 각 리스크·질문 ID에 문항 2개 이상
  - [ ] 유도 질문 금지("D&D가 문제죠?")
  - [ ] `docs/README.md` 색인 등록
- 완료 후 큐잉 힌트: T-058(인터뷰 수행, NEEDS_HUMAN).

### T-030: DS-03 전체 필드 사전 + UNI-PASS 추가 API 명세 조사
- 상태: TODO | 우선: P2 | 단계: 병행 | 담당: -
- 의존: 없음
- 참조 문서: docs/data/field-dictionary.md 4.2·4.4·6·7절, docs/15_open-questions.md Q-12·Q-20·Q-22
- 목표: 양하(S1)·반출(S5) 이벤트와 B/L→컨테이너 목록을 줄 수 있는 공식 API를 1차 출처로 찾아 필드 사전의 빈칸을 줄인다. (v0.2: 공공 API의 역할이 초기화·교차 검증·히스토리 보강으로 줄어 P1 → P2)
- 작업 내용:
  - DS-03(15006353) 전체 필드를 field-dictionary 형식으로 정리
  - UNI-PASS API020, API021, API038, API048, API005의 공식 명세 탐색(공공데이터포털 개별 데이터셋 먼저)
  - 로그인이 필요하면 T-002 준비물에 명시
- 산출물: `docs/data/field-dictionary.md` v0.2, `docs/data/code-tables.md` 갱신
- 완료 조건:
  - [ ] DS-03 필드 전부 매핑(또는 "미사용")
  - [ ] UNI-PASS 후보 5개 각각 "명세 확보 / 로그인 필요 / 없음" 결론
- 완료 후 큐잉 힌트: 쓸 만한 API가 있으면 T-005/T-006 범위에 추가.

### T-002: 공공 API 키 발급
- 상태: NEEDS_HUMAN | 우선: **P0**(2026-10-22 — T-102 실제 호출 · T-106 의 선행) | 단계: 병행 | 담당: 사람
- 의존: 없음
- 참조 문서: docs/11_data-sources.md 3절, docs/data/field-dictionary.md 2.1·3.1·4.2절
- 목표: 공공 API 실호출에 필요한 인증키를 확보한다. (v0.2: PoC 데모의 선행 조건이 아니라서 P0 → P2)
- 작업 내용:
  - **UNI-PASS 인증키 (DS-01)**: unipass.customs.go.kr 회원가입 → `My메뉴 > 서비스관리 > OpenAPI사용관리` → "화물통관 진행정보"(API001) 체크 → "OPEN API 신청". 즉시 승인되고 인증키가 발급된다. 이 키가 `crkyCn`이다
    - 같은 화면에서 한도(일일 호출 수)가 보이면 기록한다(Q-05)
    - 선택: API020(컨테이너내역), API021(입항보고 해상), API038(하선신고 목록), API048(반출신고)도 같이 신청해 두면 T-030·T-005에 도움이 된다. 신청 화면에서 각 API 명세 문서를 받을 수 있으면 받아 둔다(저장소에는 넣지 않음, Q-17)
  - **공공데이터포털 serviceKey (DS-02, DS-03)**: data.go.kr 회원가입 → 활용신청 2건(개발단계 자동승인)
    - `해양수산부_외항화물컨테이너정보` (15131742) — 개발계정 1,000
    - `해양수산부_선박운항정보` (15006353) — 개발계정 10,000. DS-02 조회 키(입항횟수)를 얻는 데 필요
    - `관세청_화물통관진행정보`(15126268)는 포털 유형이 `LINK`라서 실제 키는 UNI-PASS에서 받는다. 포털 활용신청도 필요한지 모르므로, 신청 버튼이 있으면 해 두고 결과를 기록한다
    - 발급 뒤 마이페이지의 활용신청 상세에서 인증키(인코딩·디코딩 형태가 따로 보이면 둘 다)와 트래픽 한도·단위(일/시간)를 확인해 기록한다(Q-05). 가이드는 키를 URL 인코딩해 보내라고 적었다 `[VERIFIED S-04]`
  - 로컬 `.env`에 저장 (커밋 금지): `UNIPASS_API_KEY=`, `DATA_GO_KR_SERVICE_KEY=`
  - **테스트용 실제 B/L 5~20건** 준비 (외부 공유 금지). 건마다 MBL(필수)·HBL(있으면)·**B/L 연도**(필수)·입항항(부산 권장)·대략 입항일·선박명·컨테이너 번호와 개수·FCL 여부. 반출·반납이 끝난 건과 아직 터미널에 있는 건을 섞고, 3년 이내 건만
  - 원본 응답·B/L 목록은 `data/raw/`에만 둔다
- 완료 조건:
  - [ ] UNI-PASS 인증키 발급 완료
  - [ ] data.go.kr 15131742, 15006353 활용신청 승인
  - [ ] 트래픽 한도·단위 기록(Q-05)
  - [ ] 샘플 B/L 목록을 `data/raw/`에 로컬 보관

### T-005: UNI-PASS 어댑터 및 실제 호출
- 상태: **DEPRECATED (2026-10-22) — 새 구조로 대체됨 → T-106.** 옛 Python Main Backend 경로(`intake/adapters/public_api.py`)를 전제로 했다. 지금은 NestJS `back/src/public-data/` (ADR-033 · ADR-036). 목표 · 완료 조건(실제 응답 5건 · 네트워크 없는 시험 · 필드 사전 갱신)은 T-106 이 이어받는다. ID 재사용 금지 | 우선: P2 | 단계: 병행 | 담당: -
- 의존: T-002, T-003, T-004(완료), T-032, **T-004 결과 사람 검토(T-001)**
- 참조 문서: docs/11_data-sources.md 3절, docs/data/field-dictionary.md 2·5·8절, docs/data/code-tables.md 2·3.1절, docs/05_event-and-state.md 7절
- 목표: 실제 응답을 확보하고, UNI-PASS 응답을 `PUBLIC_API` Event로 바꾸는 읽기 전용 어댑터를 만든다(v0.2: 상태 직결이 아니라 Event 후보 생성).
- 작업 내용:
  - `intake/adapters/public_api.py`의 UNI-PASS 부분: 조회(화물관리번호 / MBL·HBL + 연도), 목록 응답(`[N00]`) 처리, 오류 판정(HTTP 200 + `tCnt=-1`), 원문 보관
  - 샘플 B/L 실제 호출 → `data/raw/` → 마스킹본 `data/fixtures/`
  - 처리이력 처리구분 값 수집(`code-tables.md` 2.4, Q-12), 일시 형식·타임존(Q-19), 여러 컨테이너 B/L(Q-20), `prgsStCd` 값, 화물관리번호 구성(Q-04)
- 완료 조건:
  - [ ] 실제 응답 5건 이상, 마스킹 fixture 커밋 가능 상태
  - [ ] 테스트는 네트워크 없이 통과
  - [ ] 필드 사전의 `[TO VERIFY]` 항목 갱신
- 완료 후 큐잉 힌트: T-006, 시나리오 fixture 현실성 보정.

### T-006: 선박운항정보·외항화물컨테이너정보 어댑터, 조인 검증, 반영 지연 측정
- 상태: **DEPRECATED (2026-10-22) — 새 구조로 대체됨 → T-102**(DS-03 · DS-02 어댑터). 조인 성공률 · 반영 지연(R-1) 측정은 DS-01 이 필요하므로 T-106 으로 넘어간다. ID 재사용 금지 | 우선: P2 | 단계: 병행 | 담당: -
- 의존: T-002, T-003, T-005, **T-004 결과 사람 검토(T-001)**
- 참조 문서: docs/11_data-sources.md 3절, docs/data/field-dictionary.md 3·4.2·5절, docs/15_open-questions.md R-1·Q-24
- 목표: B/L → 입항 건 → 컨테이너 목록 조인이 실제로 되는지 검증하고, 공공 API 반영 지연을 잰다(R-1, 신선도 기준 Q-24의 근거).
- 작업 내용:
  - DS-03(`VsslEtrynd5/Info5`), DS-02(`ContnInfo`) 읽기 전용 어댑터. 페이지 반복, 게이트웨이 오류 봉투 처리
  - 조인 경로 검증: DS-03 매칭 규칙, `blNo`가 MBL/HBL 중 무엇인지, Q-04
  - `tkinTkoutSe` 전체 값(Q-18), 공컨 반납 정보 부재 확인(Q-13), 트래픽 한도(Q-05)
  - 반영 지연 측정은 DS-01 처리이력 기준: 샘플 B/L을 며칠간 조회해 `rlbrDttm`과 처음 관측된 시각 비교
- 산출물: 어댑터, fixture, `docs/research/api-latency-report.md`
- 완료 조건:
  - [ ] 조인 성공률 기록 (참고 기준: 옛 Gate 1 "실 B/L 20건 중 90% 이상", `CHANGELOG.md` D-13)
  - [ ] 반영 지연 측정값(중앙값, 최대) 또는 측정 불가 사유
  - [ ] R-1 갱신, Q-24 기준값 제안
- 완료 후 큐잉 힌트: 신선도 정책 값 확정.

## 완료

### T-105 — 첫 Agent Vertical Slice · **DONE (2026-10-22, 사용자 승인)**

- 한 그래프에서 공공데이터(LIVE) → 공백 → 초안 → 승인 interrupt → 사람의 발송 요청 → Worker 발송 → WAITING_EXTERNAL → 회신 · 추출(T-092) → `gap-rules/1` 재평가(업무 `state` vs `candidate_state`) → 결과. Tool `get_reply_candidates` · 수신 · 추출 알림 + 재조정 · Control Tower Agent 진행 화면 · 실제 프로세스 E2E. 기록 `docs/24` 18.12. 후속 T-108(P2)

### T-104 — LangGraph Agent Runtime · **DONE (2026-10-22, 사용자 승인)**

- `CeraRecoveryGraph`(`ai/cera_ai/agent/`) · Backend Coordinator · Runtime API · `BackendCheckpointSaver` · M18 · M19 · 재조정(`AgentReconciler`, Worker) · `WAITING_RUNTIME`(일시 장애 재시도 상한) · 두 프로세스 E2E(Python 재시작 · 신호 유실 뒤 API 재기동 → 재조정 → 같은 실행 완료) · crash window 시험(부작용 1건). 기록 `docs/24` 18.11 · `docs/22` rev.2.8

### T-101 — Agent Runtime 설계 · **DONE (2026-10-22, 사용자 승인)**

- 담당: Claude Code (claude-opus-5-5) / 2026-10-22
- 산출물: `docs/tasks/plans/T-101-agent-runtime-design.md`(두 오케스트레이션 · Tool Layer · Public Data Layer · Human-in-the-loop · Graph State · 첫 Slice · 평가 · 작업 순서) · `docs/14` **ADR-036 Accepted**(ADR-015 일부 대체 · ADR-033 결정 3·4 일부 개정) · QUEUE 재정렬(T-102~T-107 · T-005/T-006 DEPRECATED · T-099 재배치) · 정본 짧은 동기화(`docs/06` · `docs/23` · `ai/README.md` · `back/README.md` · AGENTS.md)
- 공공 API 재확인(2026-10-22, 공식 포털 · 가이드): DS-01 · DS-02 · DS-03 정상 · 무료. DS-02/03 가이드 새 PDF(수정 2026-10-06). 상세는 설계 7.1절
- `docs/22` rev.2.6(`vessel_call` 승격)은 필드 대조가 필요해 T-102 에서 한다

### T-100 — Runtime 설정 정리 · **DONE (2026-10-22, 커밋 `1c58f08`)**

- 산출물: `back/src/config/env.ts`(공공데이터 · Agent Tool 설정 + production 금지 조합) · `back/.env.example` · `npm run env:check` · `ai/cera_ai/config.py`(기동 시 검사) · `ai/.env.example` · 시험(`back/test/unit/env-example.test.ts` · `ai/tests/test_config.py` — `.env.example` ↔ 코드 키 양방향)
- 검증: Backend unit 113 · typecheck · AI pytest 32. 로컬 `back/.env` 는 비밀 파일이라 고치지 않음(빠진 키는 `npm run env:check` 로 확인)

### T-092 — U7 회신 추출 파이프라인 · **DONE (2026-10-07, 사용자 승인 뒤 커밋)**

- 담당: Claude Code (claude-opus-5-5) / 2026-10-07 · 기준 커밋 `4f78fec`
- 산출물: `ai/` Python AI Server(FastAPI · 계약 v1 · 프롬프트 · LLM 공급자 포트 + 녹화 재생 + 실제 어댑터 자리 · DB · 채널 없음 · stateless) · `packages/contracts/ai/`(견본 + JSON Schema) · `back/src/ai/ai-client.ts` · `extraction-rules.ts`(검증기) · `ExtractionProcessor` · `ExtractionRepository` · Worker 추출 주기 · `InboundItemDto.extraction` · 프론트 `ExtractionView`("AI 제안") · `docs/24` 18.8(U7-1~7)
- DB 변경 없음(M13 그대로)
- 검증: Backend 266 · Python 7 · Front 39 · E2E(PostgreSQL + API + Worker + Python AI Server 녹화 재생 + 화면)
- 실제 LLM 공급자는 호출하지 않았다(공급자 미정 — ADR-033). 녹화 재생(Recorded) 공급자로 E2E 검증, 사용자 승인으로 완료 인정(2026-10-07). 후속: 답 칸 이름의 정식 위치(U7-7, U8 에서 판단) · 재추출(SUPERSEDED) 명령 · `unmapped_statements` 미저장 · Gmail RFC822 텍스트 추출(Slice 2)
- 다음: **T-099** 실제 AI 공급자 검증 + CERA 평가셋 → 그 뒤 T-093

### T-091 — U6 수신 · 원문 보존 · 스레드 연결 · 발신자 판정 · **DONE (2026-10-07, 사용자 승인 뒤 커밋)**

- 담당: Claude Code (claude-opus-5-5) / 2026-10-07 · 기준 커밋 `cd0565f`
- 산출물: `ChannelAdapter.fetchInbound` · Mock 수신함 · 개발 CLI `npm run mock:reply`(production 거부) · `back/src/communication/`(순수 `inbound-rules.ts` · `InboundProcessor` · `InboundRepository` · `InboundService` · `GET /communication/inbound`) · `DraftDto.replies` · Worker 수신 주기(`cera.inbound.poller`) · 프론트 `RepliesPanel` · `InboundLog`(보류함) · OpenAPI + 생성 타입 · `docs/24` 18.7(U6-1~7) · `docs/16`
- DB 변경 없음(M13 그대로). 보류 사유 · Q-44 거부 사유는 수신 순간 감사 기록으로 영속
- 검증: Backend 247 · Front 37 · 헤드리스 Edge(발송 → Mock 회신 → 수신 → 화면 · 반복 수신 1건 · 미등록 발신자 보류 · 스레드 밖 보류)
- 후속(사용자 결정 2026-10-07, blocker 아님): 보류 회신을 사람이 문의에 연결하는 명령(`LinkHeldInbound`) 없음 · 수신 워터마크 미저장(Mock 은 매 주기 전체 + UNIQUE) · 원문 읽기는 MOCK 형식만(Gmail RFC822 는 Slice 2) · 반송 · 전달 · 자동 회신 판별 없음. **채널은 Mock 이다 — 실제 메일 수신이라고 쓰지 않는다**
- 다음: **T-092(U7) 추출** — 정상 회신 원문에서 AI 가 값 후보 + 원문 인용만, 결정론 검증기가 거른다

### T-090 — U5 Outbox · Mock 발송 · 멱등 · 화해 · **DONE (2026-10-07, 사용자 승인 뒤 커밋)**

- 담당: Claude Code (claude-opus-5-5) / 2026-10-07 · 기준 커밋 `6dd6a3c`
- 산출물: **M13** `0012_m13_message_lifecycle_guards.sql`(상태 전이 가드 — T-089 기술 부채 ② 해소) · `back/src/channel/`(`ChannelAdapter` 포트 · `MockChannelAdapter`) · `back/src/communication/`(순수 `send-rules.ts` · `SendService` · `SendRepository` · `OutboxDispatcher`) · `WorkerRunner`(세션 advisory lock · 폴링 · `--once`) · `POST /communication/drafts/{id}/send` · `DraftDto.dispatch` · 프론트 `DispatchPanel` · OpenAPI + 생성 타입 · `docs/24` 18.6(U5-1~9) · `docs/16`
- 검증: Backend 232 · Front 34 · migrate 재실행(함수 20 · 트리거 74 · 이력 13) · 헤드리스 Edge(발송 → 완료 · 재요청 1통 · Gate 차단) · 실제 프로세스 크래시 → `lookup_sent` 복구 · UNKNOWN 화해
- 기술 부채 4건(사용자 결정 2026-10-07, T-090 blocker 아님 — 후속 Task): ① `X-CERA-Actor-Id` 임시 인증(인증 구현에서 교체) ② kill switch 실행 중 전환 명령 없음(설정값만) ③ `DELIVERY_FAILED` 수동 재시도 명령 없음 ④ 장시간 채널 호출 + 향후 다중 Worker 에서 화해 대기 시간(60초) 위험. **채널은 Mock 이다 — 실제 Gmail 발송이 되었다고 문서 · 화면에 쓰지 않는다**
- 다음: **T-091(U6) 수신** — 회신 원문 보존 · 스레드 연결 · 발신자 판정 · 정상/보류 분리(LLM 없음)

### T-089 — U4 발송 승인 · 반려 · 승인 취소 · 무효화 · **DONE (2026-10-07, 사용자 승인 뒤 커밋)**

- 담당: Claude Code (claude-opus-5-5) / 2026-10-07 · 기준 커밋 `36ae8b2`
- 산출물: **M12** `0011_m12_approval_guards.sql`(메시지 단위 승인 가드 · 계획 실행 advisory lock) · `back/src/communication/`(순수 `approval-rules.ts` · `message-content.ts` — 정본 `msg-content/1` · `ApprovalService` · `PlanSupersessionService` · `ApprovalRepository`) · `POST .../drafts/{id}/approve` · `.../reject` · `POST /communication/approvals/{id}/revoke` · `GET /communication/approvers` · 수정 API `values` · `DraftDto.approval` · `revision` · OpenAPI + 생성 타입 · 프론트 승인 영역 · `docs/24` 18.5(U4-1~9) · `docs/16`
- 검증: Backend 211 · Front 27 · migrate 재실행(함수 19 · 트리거 73 · 이력 12) · API 인스턴스 2개 동시 승인 → 1건 · 헤드리스 Edge(생성 → 승인 → 수정 → 옛 승인 무효 → 재승인 → 취소 → 재승인 → 반려)
- 기술 부채 2건(사용자 결정 2026-10-07, T-089 blocker 아님): ① `X-CERA-Actor-Id` 승인자 헤더는 인증 전 임시 장치 — 인증 구현에서 교체 ② 메시지 상태 전이 순서는 DB 가 완전히 강제하지 않음 — T-090 발송 lifecycle 구현 때 실제 전이 규칙과 함께 검토
- 다음: **T-090(U5) Outbox · Mock 발송**

### T-088 — U3 문의 초안 · 구조화 값 · 숫자 검사 · **DONE (2026-10-06, 사용자 승인 뒤 커밋)**

- 담당: Claude Code (claude-opus-5-5) / 2026-10-06 · 기준 커밋 `c7cdb5b`
- 산출물: `back/src/communication/`(순수 `number-check.ts` · `inquiry-intents.ts` · `draft-prose.ts` 템플릿 포트 · `DraftService` 한 트랜잭션) · `POST/GET /communication/drafts` · `GET /communication/drafts/{id}` · `POST .../revisions` · `GET /planning/runs` · `GET /registry/facilities` · OpenAPI + 생성 타입 · `front/web/src/components/drafts/` · `src/api/drafts.ts` · `.act-btn` · `docs/24` 18.4
- DB 변경 없음(M11 그대로)
- 검증: Backend 184 · Front 20 · fresh M01→M11 · seed · 빌드본 API 실제 호출 · 헤드리스 브라우저(생성 → 통과 → 수량 · 날짜 고침 → 차단)
- 다음: **T-089(U4) 승인 · 무효화**

### T-087 — U2 Registry · Contact Gate · 개발 안전장치 · **DONE (2026-10-06, 사용자 승인 뒤 커밋)**

- 담당: Claude Code (claude-opus-5-5) / 2026-10-06 · 기준 커밋 `17399b8` · Plan `docs/tasks/plans/T-087-registry-contact-gate.md`(D1~D5 권장안)
- 산출물: `back/src/registry/`(순수 판정 `contact-gate.ts` · 서비스 · 컨트롤러 · DTO) · `RegistryReader` 조회 2개 · `CERA_TEST_RECIPIENT_ALLOWLIST` · **M11** `0010_m11_registry_guards.sql`(등록부 불변 열 가드) · 시드 +5행(막힌 주소 2) · `GET /registry/counterparties` · `GET /registry/addresses/{addressId}/eligibility` · `packages/contracts/openapi.json` 스키마 + `openapi.d.ts` 생성 타입 · `front/web/src/api/registry.ts` · `docs/24` 18.3
- 검증: Backend 156 · Front 17 · fresh M01→M11(트리거 72) · seed 25 → 0 · 빌드본 API 실제 호출 · Worker `--once` · smoke · 프록시
- 다음: **T-088(U3)**

### T-086 — U1 영속 기반 · **DONE (2026-10-06, 최종 안전성 검토 뒤 커밋)**

- 담당: Claude Code (claude-opus-5-5) / 구현 2026-10-02 · 최종 검토 2026-10-06 · 기준 커밋 `b7103de`
- 산출물: `back/src/db/schema/`(P0 29표) · `back/drizzle/migrations/`(M01~M06 생성 SQL + M07~M10 custom — 함수 17 · 트리거 70 · CE001~CE006 · 표 단위 GRANT) · `back/src/persistence/`(AuditRecorder · SystemErrorRecorder · RegistryReader · EventWriter) · `back/src/content/`(ContentStore 포트 · 로컬 어댑터 · ContentService) · `back/src/seed/` · `back/src/http/openapi.ts` · `packages/contracts/openapi.json` · `docs/24` 18.2
- 최종 검토(2026-10-06)로 고친 것: **① `actor_type` 불변**(고치기 전 `cera_app` 이 SYSTEM → HUMAN 변경 가능함을 실제 확인 → `tg_actor__guard_columns`) **② 계획 기반 승인 = 한 실행**(값의 `source_run_id` 둘 이상 CE006 · `approved_plan_run_id` = 그 실행) **③ `system_error` 기록 실패가 원래 오류를 덮거나 처리되지 않은 rejection 을 내지 않음**. `docs/24` 12.1(마스터 열 가드 예외) · 12.3 · 18.2 U1-11
- 검증(2026-10-06): 시험 **135 통과**(회귀 +9) · typecheck · build · fresh DB M01→M10(2회, 이력 10행 · 29표 · 함수 17 · 트리거 70) · seed 2회(20 → 0) · 빌드본 API `/health` 200 `db:up` · Worker `--once` 0 · `drizzle-kit check` · 생성 차이 0 · `git diff --check`
- 남은 위험: 다른 마스터의 "불변" 열(`contact_channel_address.normalized_address` 등)은 A층 책임 — B층 강제 여부는 후속 판단(U2 에서 Contact Gate 와 함께) · 상태 캐시는 삽입 순서를 따름 · T3/T6 메시지 행 잠금은 U4·U5
- 다음: **T-087(U2)**

### T-085 — U0 Backend 뼈대 · **DONE (2026-09-23, 최종 검토 뒤 커밋)**

- 담당: Claude Code (claude-opus-5) / 구현 2026-09-22 · 독립 최종 검토 2026-09-23 · 기준 커밋 `8f9d2bf`
- 산출물: **`back/`** (NestJS 12.0.4 · ESM · TypeScript 5.9.3 — API `src/main.ts` · Worker `src/worker.ts` · `config/`(zod) · `db/`(Pool · Drizzle · `TransactionRunner` · `migrate.ts` · 빈 `schema/`) · `shared/`(Instant · Clock · UUIDv7 · Krw · SHA-256/JCS · 문맥 · 오류) · `http/` · `health/` · `test/`) · **`infra/local/`**(PostgreSQL **18.6 고정** · `127.0.0.1` 만 · 역할 `cera_owner`/`cera_app` · DB `cera`/`cera_test`) · `docs/24` 18.1 · `back/README` · `infra/README` · `AGENTS.md` 6절
- 검증(2026-09-23 재실행): `typecheck` · `build` · 시험 **61 통과**(unit 37 · db 24, 실제 PostgreSQL 18.6) **2회 연속 동일**(반복 실행 가능) · 빌드본으로 API(`/health` 200 `db:up` · `/health/live` · 404 공통 오류 바디 · SIGTERM 종료) · Worker(`--once` 종료 0 · idle 뒤 SIGTERM 종료) · `db:migrate`("적용할 것 없음")
- 역할 경계 **직접 확인**: `pg_stat_activity` 에서 실행 프로세스(`cera-api`)가 `cera_app` 으로 접속 · `cera_app` 은 superuser/createdb/createrole/bypassrls 전부 없음 · `cera_owner` 의 멤버 아님 · `public`·DB `CREATE` 권한 없음 · 시험에서 DDL·`TRUNCATE`·`DISABLE TRIGGER` 42501 거부
- 최종 검토에서 고친 것 2건: **① `compose.yaml` 이미지 `postgres:18`(떠다니는 태그) → `postgres:18.6` 고정**(digest 동일 확인, 볼륨 보존) · **② `processes.test.ts` 가 API 자식 프로세스를 종료까지 기다리지 않던 것**(종료 대기 + 종료 확인 추가)
- **완료 조건 중 미이행 1건 — `OpenAPI 뼈대 (R-01)` 는 U1(T-086)로 옮겼다.** U0 에는 업무 endpoint 가 `/health` 뿐이라 계약 문서를 만들 대상이 없다. `packages/`(공유 계약)는 그대로 비어 있다
- 남긴 것(U1 몫): 제품 스키마 · migration `back/drizzle/` · 시드 · `system_error` 기록 · ContentStore · Outbox · 채널 · AI Server
- 알려진 위험(판 유지): drizzle-kit → 옛 esbuild 개발 서버 advisory **moderate 4건은 dev 전용**(`npm audit --omit=dev` = 0건). 강제 수정은 drizzle-kit 0.18 로 내려가므로 하지 않는다
- 다음: **T-086(U1)**

### T-080 — 물리 DB 설계 (Slice 1 P0 29표) · **DONE (2026-09-22, 사용자 + ChatGPT 최종 승인)**

- 담당: Claude Code (claude-opus-5) / 2026-09-22 · 기준 커밋 `4db8608`
- 산출물: **`docs/24_cera-physical-data-model.md`** + 작업표 · **`docs/22` rev.2.5**(+ 작업표) · `docs/18` H.2 · T-069 계획 13절 사후 주석
- 결론: UUIDv7(`uuid`, 앱 생성, 시드 fixture 고정 값) · ENUM 없음(CHECK 54 · 형식 CHECK + Backend 카탈로그 27 · 규칙 id 2) · `timestamptz(3)` · `bigint` → TS `bigint` → API 문자열 · jsonb 6곳 + `uuid[]` 1 · SHA-256 + JCS · 사건 멱등 `evk/1` · FK RESTRICT(CASCADE 0) · 복합 FK 13 · append-only A + B + C(표 단위 권한) · 부분 유일 U-1~U-7 · Outbox = advisory lock + SKIP LOCKED + U-6·U-7 · `ContentStore` DB 밖(생성·파기 일관성) · migration M01~M10 앞으로만 · 시드 local·test
- 논리 모순 해소(T-097 · Q-69): 발송 = 메시지 · 시도별 멱등 키 · 메시지당 성공 1 · 미확정 1 · `UNKNOWN` 화해만 한 번 · `sent_at` · `external_thread_id` 한 번 채움 · INBOUND `drafted_by`·`current_status` NULL(생애주기 미적용 — 수신 처리는 raw_input → extraction → event)
- 검증: `docs/22` rev.2.5 작업표 587 · P0 29표 **349/349** 순서 일치 · 인수 18항목 + 시나리오 점검 PASS
- 다시 열 조건: 한 채널에 연결 여럿(`external_thread_id` · `external_message_id` 유일 범위 → 연결 참조) · 비동기 trace 저장 근거 · 운영 가상 마스터
- 제품 코드 0 · SQL/migration 0 · `docs/21` 0
- 다음: **T-085(U0)**

### T-084 — Q-68 DB 제품·접근 방식·마이그레이션 도구 결정 · **DONE (2026-09-22, 사용자 결정·최종 승인)**

- 담당: 사용자(결정) · 비교·문서 반영 Claude Code (claude-opus-5) / 2026-09-21~22 · 기준 커밋 `12a849a`
- 결정: **DB = PostgreSQL**(로컬·시험·운영 모두 — **SQLite 미사용**) · **접근 = Drizzle ORM, SQL-aware Hybrid**(Outbox · 멱등 · 부분 유일 · 잠금 · append-only · 핵심 트랜잭션 · Reconciliation 원자 갱신은 PostgreSQL 의미를 드러내 쓴다) · **Migration = drizzle-kit 생성 SQL → 사람 검토 → 저장소 기록 → 명시 적용**(운영 자동 동기화 · `push` 정본 사용 · 검토 없는 파괴적 migration 금지) · **DB 권한·스키마·migration 은 Main Backend 만**(AI Server 는 DB 접근 없음) · Prisma · Kysely · TypeORM · MikroORM 후보 제외
- 산출물: **ADR-034 Accepted** · ADR-004 **Superseded by ADR-034** · `docs/15` **Q-68 CLOSED** · `docs/07` 3절 DB 줄 · `docs/23` 2·13절 · `docs/22` 포인터(논리 모델 변경 0건) · `docs/01` 7절 · `back/README` · T-069 계획 16.4·17·19절 · `plans/T-084-db-decision-options.md`(결정 완료로 전환) · `AGENTS.md`
- T-080 / U0 로 넘긴 것: 물리 타입 · PK/ID 표현 · FK · UNIQUE · 부분 유일 인덱스 · append-only 차단 수단(trigger · 권한 · 저장소 제한) · JSON 물리 구조 · 멱등 직렬화/해시 · 주장 위치 형식 · `schema_version` 형식 · **BIGINT ↔ TS 경계**(bigint · 문자열 · serializer) · **시각 물리 매핑**(타입 · UTC 저장 · 타임존 정보 보존) · 워커 잠금(SKIP LOCKED · advisory lock · 폴링 주기) · 내용 저장소 물리 참조 · migration 순서·명령 · 로컬 PostgreSQL 실행 방식 · 버전 · 연결 풀
- 여전히 OPEN: **Q-65**(솔버) · Q-66 · Q-67 · U0 선택
- 제품 코드 0건 · 패키지 설치 0건 · SQL/migration 0건 · `docs/21` 변경 0건
- 다음: **T-080**(P0 29개)

### T-083 — Q-64 Backend 언어·프레임워크 결정 · **DONE (2026-09-21, 사용자 결정)**

- 담당: 사용자(결정) · 문서 반영 Claude Code (claude-opus-5) / 2026-09-21 · 기준 커밋 `cad92ed`
- 결정: **Main Backend = TypeScript + NestJS**, 모듈형 모놀리스(같은 코드베이스의 API + Worker 프로세스) · **AI Server = 별도 Python 런타임**(FastAPI 또는 동등 — 구체 패키지는 구현 시점). AI Server 는 DB·발송·사건·사실·승인 권한이 없고 출력은 후보다(ADR-026·029 유지). 비교 후보 Spring Boot 는 채택하지 않음. Python/FastAPI 는 Main Backend 후보에서 제외
- 함께 정한 원칙: 큐 제품 없이 DB Outbox + 단일 워커 폴링 · OpenAPI → `packages/` 생성 TS 타입(Frontend 는 Backend 내부 타입 import 금지) · 스키마 단일 원천(라이브러리는 U0) · 외부 호출은 트랜잭션 밖(T-069 12절) · AI Server 호출은 HTTP/JSON + timeout · 제한 재시도 · `correlation_id`/`trace_id` · 장애 격리
- 산출물: **ADR-033 Accepted** · ADR-002 **Superseded by ADR-033** · ADR-031 결정 1·2·8 **Superseded**(나머지 Proposed) · `docs/15` **Q-64 CLOSED** · `docs/07` 1·2·3·6절 · `docs/23` 2·3·11·13절 · `docs/01` 7절 · `back/`·`ai/` README · `AGENTS.md` · T-069 계획 사후 주석 · `docs/16` 1절 · `docs/22` 다음 작업 5번(한 줄씩) · **`docs/18` C절 AI 경계**(LLM 공급자 호출만 허용, 결정론 검증은 Main Backend)
- 여전히 OPEN: **Q-68**(DB·ORM·마이그레이션 → T-084) · **Q-65**(솔버 — PlanningSnapshot 계약으로 나중에 붙인다, Slice 1 blocker 아님) · U0 선택(스키마 라이브러리 · 버전 · HTTP · 로깅 · 스케줄러)
- 제품 코드 0건 · 패키지 설치 0건 · `docs/21` 변경 0건
- 다음: **T-084(Q-68)** → T-080 → T-085~T-096

### T-069 — 첫 실제 구현 Vertical Slice 구현 계획 · **DONE (2026-09-21, 사용자 최종 승인)**

- 담당: Claude Code (claude-opus-5) / 2026-09-21 · 기준 커밋 `3106772`
- 산출물: `docs/tasks/plans/T-069-external-communication-slice.md`
- 결론: **Slice 1 = Mock External Communication Loop**(`18` J.4 1·2단계) · Slice 2 Tech Validation(등록·확인 메일·Gmail) · Slice 3 실제 LLM · **L-13 CLOSED**(`recovery_run` 계보의 뿌리 실행 id, `docs/22` I-35·I-36) · **P0 29 · P1 14 · DEFERRED 9** · Phase 0~11(T-003 흡수) · DoD 19항목
- 검토 반영: 정상 회신은 검증 통과 값이 사건 → PROVISIONAL → 사람 확인 → CONFIRMED(**사건 생성 승인 게이트 없음**) · 지난 계획 기준 회신은 사건·후보가 되지만 계획 불변 · 자동 재최적화 없음 · 스레드 안 질문 매핑으로 **현재 계획에 자동 반영되지 않음**(범위와 다른 축) · DB 선택 **Q-68 신규** · 가상 데이터 실발송 차단 G-06 인수 시험
- 다음: **T-083(Q-64) → T-084(Q-68) → T-080 → T-085~T-096** · Q-65 는 Slice 1 blocker 아님
- 제품 코드 0건 · `docs/21` 변경 0건 · `docs/18` N.2 #13 "13개" → 12개 정정

### Q-44 · Q-45 Decision Closure · **DONE (2026-09-21, 사용자 최종 승인)**
- 상태: **DONE** (2026-09-21) — 승인 전 최종 확인(정상 파기 vs 데이터 손실, I-34) 포함 | 담당: Claude Code / 2026-09-21
- 결정: **Q-44 CLOSED**(메일 근거 시각 — `Date` 가 채널 수신 시각보다 미래가 아니면 `Date`, 아니면 채널 수신 시각. 원래 두 시각 보존) · **Q-45 구조 CLOSED / 기간 OPEN**(기록과 내용 분리, 행 삭제 ≠ 내용 파기, 파기 감사)
- 산출물: `docs/22` **rev.2.4**(11.2e · 29절 · I-28~I-33 · 안티패턴 11 · walkthrough 27.12·27.13 · 정상 파기 vs 데이터 손실 구분 I-34 · 검증 64개 PASS) + 작업표(블록 53 · 컬럼 587) · **ADR-032 Accepted** · `docs/05` 5.2 · `docs/15` · `docs/18` F.2(rev.2.3 필드명 정리 포함) · G.7 · `docs/19` NFR-21 · `docs/23` 4.4
- **새 표 0개 · 논리 테이블 수 52 그대로 · `docs/21` 변경 0건 · 제품 코드 0건**
- 이것이 끝나면 **T-069 를 시작할 수 있다**(T-069 를 막던 사용자 결정 없음)

### T-081 — 논리 모델 후속 (Event · 사람 확인 · 출처 · 검증 신뢰도) · **DONE (2026-09-21)**

- 담당: Claude Code (claude-opus-5) / 2026-09-21 · 기준 커밋 `3b1bda3` 위의 문서 변경 · **사용자 최종 승인 2026-09-21**
- 산출물: `docs/22_cera-logical-data-model.md` **rev.2.3** + `docs/22_cera-logical-data-model.xlsx`
- 한 일: `docs/05` 4.2 와 한 줄씩 대조해 **누락 13건 복구**(29개 필드 대응표 23.1 — 누락 0건) · A 확인·정정 사건(`event_class` + 확인 2필드 + **새 표 `event_verification_target`**) · B 검증기 신뢰도(`input_confidence_level`) · **C 출처 3축 통일(사용자 결정, `source_type` 7값)** · D `event_type`·`schema_version`·`idempotency_key`(범위·주장 위치 포함)·`correlation_id`·`payload`·`source_id`·`extraction_method` · **ADR-020 상태 차원 복구**(`canonical_fact` 6차원, 의미 불명 `confidence` 제거) · 스냅샷 상태·판 동결(I-12 확장) · `extraction` 3컬럼 · 메시지 상태 매핑 문서화
- 승인 전 최종 확인 3항목: 확인 대상 좌표 일치(**I-26 보강**) · `event_class` 별 조건부 무결성(이미 반영) · `decision_usability` 파생·재현(**I-24 수정 · I-27 보강**)
- 최종 상태: **MVP 52 · Next 1 · MVP 에서 만들지 않음 2 = 55** · 작업표 블록 **53** · 컬럼 **586** · 흐름 검증 **47개 전부 PASS**
- `docs/21` 변경 0건 · 제품 코드 변경 0건 · **Q-46 OPEN 유지**
- 남긴 것: **T-082**(시나리오 fixture `event_type` 3개가 `docs/05` 4.4 카탈로그에 없음, P2) · 물리 설계로 넘긴 것(멱등 키 직렬화·해시·주장 위치 형식, `schema_version` 형식, JSON 구조 세부)

### T-070 — 주변 문서 동기화 · **DONE (2026-09-18)**

- 담당: Claude Code (claude-opus-5) / 2026-09-18 · 기준 커밋 `8d47a99` 위의 문서 변경
- 한 일: 확정된 설계(`21` 승인 · `22` rev.2.2 · `23` · ADR-026~031)를 주변 문서에 동기화 — `docs/04`(엔티티·시설 마스터 vs 사실·견적 3층·비용 3종·운영자 입력 4갈래) · `docs/07`(Python 확정 표현 → 미결, 4절 → `22` 대응표, 오류 처리·외부 통신 흐름) · `docs/13`(닫힌 결정 반영 + 4.1절 통신·상업 용어) · `docs/19`(메시지 vs 발송 시도, 확인 메일 제한, 승인 기록 방식, 기술 실패 ≠ 사건) · `AGENTS.md` 1.1(`ai/` = LLM 만, 결정론 엔진 = `back/`) · `back/`·`ai/`·`packages/`·`infra/`·루트 README · `docs/18` 본문(D.1 · E.1 · E.4 · H.2~H.4 · K.1 · N.2 를 `send_attempt`·`message_approval`·`message_status_transition` 구조로) · `docs/05` 정본 관계 주석 · `docs/06` G4 · `docs/12` T-041 · `docs/16` 라벨 · `docs/15` X-10~X-13 표시
- 원래 항목 중 이미 T-068 등에서 끝나 있던 것: `01` 6절 · `02` 6절 · `03` FR-ING-07·FR-COM-02·FR-ING-05·FR-RSP-01·NFR-03 · `06` 7절
- **남긴 것**: 새로 발견된 논리 모델 문제(사람 확인 사건 표현 · 검증기 confidence · 출처 종류 값 목록 · `05` 4.2 필드 대조) → **T-081** 로 분리. `docs/16` 6절 Real 채널 행은 미반영(오해 위험 낮음). `front/web/src/contracts/cera.ts` 산문 필드 출처 구분은 계약 개정 때
- `docs/21`·`docs/22`·`docs/23` 변경 0건 · 제품 코드 변경 0건
- (원래 항목 기록) 원제목: `Tech Validation` 단계 + 통신 요구사항 + **책임 경계 Audit 잔여분**을 정본에 반영 — **다음 작업**
- 상태: **DONE (2026-09-18)** | 우선: P1 | 단계: Phase 0.5 | 담당: Claude Code (claude-opus-5) / 2026-09-18
- 의존: **T-068 사용자 승인** (ADR-027 Accepted 필요. 아래 Audit 잔여분은 ADR-029 판정 필요)
- 참조 문서: docs/18_external-communication.md 부록, docs/01 6절, docs/02 6절, docs/03 2.1·2.7절, docs/05 4.4·5.2절, docs/06 7절, docs/07 4·5·6절, docs/11 5절
- 목표: ADR-026·027·028 판정 결과를 정본 문서에 반영해 코드와 문서가 어긋나지 않게 한다.
- 작업 내용:
  - `01` 6절·`02` 6절에 `Tech Validation` 단계와 세 조건(허용목록·테스트 주소·건별 승인) 추가
  - `03` FR-ING-07(Gmail 연동) 등급 조정, FR-COM-02의 "가상 메일함으로만" 수정, 발송 실패·중복 방지 FR 신설
  - `06` 7절 G4 행에 실제 발송·승인 해시·감사 요건 추가
  - `07` 4·5·6절: `messages` → `comm_*` 분리, 새 엔드포인트, `back/channels` 배치, 새 설정 키
  - `05` 4.4에 값 미변경 회신 처리(M-6 결정), 5.2 어댑터 매핑에 메일 채널 행
  - ~~`11` 5절 메일함 행 갱신~~ (T-068에서 선행 완료)
- **책임 경계 Audit 잔여분** (T-068에서 발견했으나 이번에 고치지 않은 것):
  - **ADR-029 판정 뒤**: `ai/README.md`·`back/README.md`·루트 `README.md`의 영역 책임 문구, `07` 6절 배치표, ADR-024 영역 표 (제품 폴더 안이라 T-068에서 손대지 않았다). 코드 이동 자체는 T-003
  - `03` FR-ING-05(발신자 분류 주체 = Backend 등록부 명시), FR-RSP-01(추출과 Event 생성 주체 분리), NFR-03(측정 기준에 "결정론 검증기 통과" 추가), FR-ING-07 등급
  - `02`·`09`·`10`·`12`·`CHANGELOG`의 "Agent Activity"·"Agentic System" 표현: 결정론 계산(Baseline 계산, plan generated, 재최적화)이 AI가 한 일처럼 읽히는 곳. **전면 개명이 아니라 오해가 큰 곳만** 정리한다(`06` 1.1절이 정본)
  - `front/web/src/contracts/cera.ts`의 `RiskView.explanation`·`RecoveryAction.rationale`·`MessageView.extraction.method`: 산문 필드의 출처(엔진 템플릿 / LLM)가 타입으로 구분되지 않는다 → 계약 개정 때 반영
- 산출물: 위 문서 갱신
- 완료 조건:
  - [ ] 승인된 M절 결정 7건이 전부 반영되거나 보류 사유 기록
  - [ ] ADR-029 판정 결과 반영 (승인이면 3개 README + `07` 6절 + ADR-024, 부결이면 사유 기록)
  - [ ] `18`의 부록 표와 실제 문서 상태가 일치
- **2026-09-18 추가 (T-079 최종 정리 결과)**: `docs/07` 1·2·3절의 Python·FastAPI 전제 표현을 `docs/23`(런타임 후보는 미결, 현재 우선 후보 NestJS) 기준으로 정리 · `docs/07` 4절 저장 스키마를 `docs/22` rev.2.2(표 51개, `system_error` 포함)와 대조(X-10) · `docs/04` 엔티티 표(X-13) · `docs/13` 용어(X-11 + 분류·변경 방식) · `docs/19` 발송 시도/메시지 용어(X-12) · **`AGENTS.md` 1.1절 `ai/` 행이 아직 "+ 결정론 엔진"** 이라 ADR-029 와 어긋난다 → 함께 정리. `back/`·`ai/`·`packages/` README 문구도 이때(제품 폴더라 이번에는 손대지 않았다)
- 완료 후 큐잉 힌트: T-069(Implementation Plan) 작성의 전제가 정리된다.


### T-079 — 논리 DB 설계 (Logical DB Design) · **DONE (2026-09-18, rev.2.2 최종 승인 — 사용자 + ChatGPT)**

- **최종 상태 (2026-09-18)**: `docs/22` **rev.2.2 최종** + 작업표. **MVP 51 · Next 1 · MVP 에서 만들지 않음 2 = 54** (rev.2.2 에 기술 운영 표 `system_error`). 작업표 블록 52 · 컬럼 557. `docs/21` 은 승인·동결(한 번도 수정하지 않음). **`docs/23` 런타임·오류 처리·관측성 문서 추가**(ADR-030·031 Proposed — 기술 최종 결정 아님). rev.2.1 은 `687d458` 에 저장됐다(아래 옛 기록의 "미커밋"은 당시 표현). 후속: **T-070 → T-069 → Backend·DB 기술 결정 → T-080**
- (아래는 rev.1 완료 시점 기록)

- 담당: Claude Code (claude-opus-5) / 2026-09-17 · 기준 커밋 `1b97905` 위의 문서 변경만
- 입력: **승인된 `docs/21` 개념 모델 rev.3**(T-076). 이 작업에서 `docs/21` 은 **수정하지 않았다**
- 산출물
  - **`docs/22_cera-logical-data-model.md`** (0~25절, 1,364행): 논리 타입 표기 · 테이블 분류 7종 · 전체 목록 · 테이블로 만들지 않은 개념 + **금지 안티패턴 10종** · **열린 질문 판정 20건** · 도메인 A~J 테이블 명세 · 식별자/시간/금액 모델 · 키·제약·참조 무결성 · 코드값 정책 · 논리 ERD · 시뮬레이션 분리 · 파생 조회 · **개념→테이블 추적표(E-01~E-39 전부)** · 문서 차이 X-10~X-13 · **사용자 결정 5건**
  - **`docs/22_cera-logical-data-model.xlsx`** (11 시트, 테이블 블록 47 + OPEN 2, 컬럼 475, 데이터 619행): RPG 스타일. 기본키 노랑 / 외래키 초록 / 유일 제약 분홍, 모든 시트에 "확정 스키마가 아님" 배너
- 테이블 수: **MVP 46 · Next 1(`vessel_call`) · OPEN 2(`exception_case` · `operational_plan_batch`) = 49**
- 주요 설계 판단
  - **사건 → 현재 사실**이 한 방향으로만 흐른다. `canonical_fact` 는 전부 지워도 `event` 로 복원돼야 한다(I-7)
  - **정정은 UPDATE 가 아니라 `supersedes_event_id` 를 가진 새 행**
  - **계획 입력을 얼린다**: `planning_snapshot_fact` 가 사실의 **값을 복사**한다. 현재 사실을 FK 로만 가리키면 과거 계산의 입력이 바뀐다
  - **확인 요청은 결정적 `request_key`** 로 사람의 처리 이력과 이어진다(Q-59). 파생 대리키를 참조했다면 재계산마다 이력이 끊겼을 것이다
  - **운영자 계획 조건은 현실 사실이 아니다** — `operator_planning_constraint`(`DECISION_RECORD`). 시설을 못 쓰게 한다고 `facility.is_active` 를 끄지 않는다
  - **승인 없이 발송 시도 행이 생길 수 없다** — `send_attempt.approval_id` NOT NULL + `idempotency_key` UNIQUE + 승인 내용 지문 대조
  - **비밀값을 DB 에 넣지 않는다** — `channel_connection.credential_reference` 는 참조만
- 사용자 결정 필요 5건: **D-1** Container↔B/L 연결 테이블(L-2) · **D-2** 제안 묶음 생성(L-3) · **D-3** 운영자 입력의 기본 적용 범위(L-3b·L-12) · **D-4** `operational_plan_batch` 미생성 확정(L-9) · **D-5** `exception_case` 생성 여부(L-10·L-6)
- 하지 않은 것: DB 제품·ORM·`CREATE TABLE`·마이그레이션·인덱스·파티션 · API endpoint · LLM 공급자 · 솔버와 내부 표현 · 임계값 · `decision_type` 값 목록 · **`docs/21` 수정** · 제품 코드 변경 · staging/commit/push
- 변경 파일: 신규 `docs/22_cera-logical-data-model.md`·`.xlsx` / 수정 `docs/15`(20건 상태 갱신 + 결론 절 + X-10~X-13), `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 후속 (rev.1 당시 순서 — **2026-09-18 에 T-070 → T-069 → Backend·DB 기술 결정 → T-080 으로 바뀌었다**, 위 최종 상태 줄이 정본): ~~T-079-R → T-080 → T-070~~

### T-076 — 개념 데이터 모델 최종 승인 · DONE (2026-09-17, 사용자 + ChatGPT)

- rev.3 + T-078 정합성 정리를 통과했다. **`docs/21_cera-conceptual-data-model.md` 는 승인된 기준**이 됐고, 이후 단계에서 임의로 수정하지 않는다
- 개념 단계 종료. 다음은 논리 DB 설계(T-079)

### T-078: 개념 모델 최종 정합성 정리 — DONE (2026-09-17, **최종 승인 대기 · 미커밋**)
- 기준 커밋: `1b97905`. 제품 코드 변경 0건. **새 개념·새 요구사항 그룹을 추가하지 않았고 rev.2 · rev.3 결정을 다시 흔들지 않았다**
- 지시: 검토 방향 승인 가능 판정 뒤 ① Markdown 내부 표현 불일치 제거 ② 요구사항 ↔ 개념 모델 정합성 ③ 작업표 ↔ Preview ↔ Markdown 번호·개수 동기화 ④ 요구사항에서 **아직 선택하지 않은 구현 기술** 선결 표현 제거 ⑤ 최종 승인 가능한 상태로 정리
- 고친 것:
  1. **후보 개수**: 21.1절의 "미확정 후보 **3개**" → **4개**(OperatorPlanningConstraint 포함). QUEUE 검토 체크리스트도 갱신. 최종 기준 — MVP **33** / 시설 종류 **3** / 미확정 **4** / Next·보류 **2** / 올리지 않은 것 **16**
  2. **발송 승인 옛 표현 제거**: 9절 "감사 기록 + 메시지 승인 필드" · 12.2절 "메시지 승인 필드 + 감사 기록" · 18절 "Send Approval · AuditLog" → **MessageApproval(발송 승인 결정 기록) + AuditLog**. 12.3절의 "rev.1 은 …로만 봤다"는 **역사 서술이라 그대로 뒀다**
  3. **PlanDecision 의미 통일**: "복구 계획에 대한 사람의 의사결정 기록"으로 정리하고 **채택 · 거부 · 기존 계획 유지(위험 감수)** 를 담아야 한다고 적었다. **결정 종류 값(enum)은 논리 설계**. 그리고 **"아직 아무 행동도 하지 않은 상태"와 "검토한 뒤 의도적으로 유지하기로 결정한 상태"는 다르다**를 명시(값으로 확정하지 않음)
  4. **계산 결과의 "원본" 용어 정리**: 복구 계획 실행·배정·위험 평가·비용 계산 결과·비용 줄을 **"보존되는 산출 기록"** 으로 바꾸고, 18절에 **Source of Truth 와 다르다**는 용어 주의를 넣었다. 원본 기록은 사건·원문·계획 결정·발송 승인 결정·확인 처리 이력이다
  5. **`FR-CON-04` 구현 중립화**: "RateQuote로 저장하고 유효기간을 둔다" → **제안 단위로 보존하고 제안 주체·시각·금액·유효기간·조건·원문 근거·관련 질문 항목을 추적할 수 있어야 한다. 저장 형태는 논리 설계**
  6. **`NFR-06`**: "CI 없이 로컬 `pytest`" → **외부 네트워크 없이 자동 테스트 · 녹화 fixture·mock · 로컬 반복 실행**. 테스트 도구·CI 는 구현 기술 결정 뒤 `07`에서
  7. **`NFR-09`**: "단일 백엔드 프로세스 + 단일 DB 파일" → **PoC 최소 구성 로컬 실행, 명령 1~2개**. 저장소가 파일인지 프로세스인지는 요구사항에서 정하지 않는다(ADR-004)
  8. **신규 OPEN L-3b**: 운영자가 직접 입력한 요율·상업 조건의 **적용 대상(scope)·적용 기간(validity)**. 새 질문군을 늘리지 않고 L-3 옆에 붙였다. "한 번의 0원 입력이 영구 현재 요율처럼 남는 구조" 를 논리 설계에서 막아야 한다고 적었다
  9. **작업표(16시트) 동기화**: 산출 기록 용어, PlanDecision 행, Overview 용어 주의, L-3b. 데이터 **585행**
  10. **메타 숫자**: docs/21 1.3절 "데이터 523행" → **585행**(실제 계산값). CURRENT 의 "26개"·"523행" 도 정정
- **Preview 갱신본 미반영 (전달 필요)**: 작업 중 `docs/21_cera-db-template-preview.xlsx` 가 **Excel 에서 열려 있어**(`docs/~$…` 잠금 파일) 덮어쓸 수 없었다. 갱신본은 scratchpad `pending/` 에 만들어 뒀고, 반영 방법과 갱신 내용은 `CURRENT.md` Handoff Notes 에 적었다. **E-ID(E-37/38/39)와 OPEN 표시는 현재 저장소 판에서도 이미 정확하다** — 남은 차이는 05_계획 표시 번호 순서, `decision_type` 값 목록 미확정 표시, Notes 한 줄
- 하지 않은 것: 새 엔티티·새 요구사항 그룹 · 법적 책임·면책 문구 · `docs/04`·`docs/07`·`docs/18` 확대 수정(T-070 유지) · `AGENTS.md`·`.gitattributes` 불필요한 변경 · 솔버·enum·DB·ORM·API 확정
- 검증: `git diff --check` 통과, 제품 영역(`back/`·`ai/`·`data/`·`packages/`·`infra/`·`scripts/`) 변경 0건, `front/` 및 다른 작업의 untracked 파일 무변경, 작업표 옛 표현 잔재 0건
- 남은 일 / 다음 한 걸음: **T-076 최종 승인** + Preview 갱신본 반영. 승인되면 **논리 DB 설계**(Q-54·55·58·59·60·62·63 + L-1~L-12 + L-3b)
- 큐 변경: **T-078 DONE**, T-076 을 "최종 승인" 으로 갱신
- 주의사항: **개수는 `docs/21` 6절 개수 블록 하나만 정본으로 본다.** 다른 절·작업표·부록은 그것을 따른다

### T-077: 운영자 개입과 재계산 요구사항 반영 (rev.3) — DONE (2026-09-17, **최종 검토 대기 · 미커밋**)
- 기준 커밋: `1b97905`. 제품 코드 변경 0건. **`front/` 는 Antigravity 작업이므로 읽기만 했다**
- 지시: 검토 중 확인된 **운영 UX 핵심 요구사항 하나**를 정본에 명확히 반영한다 — "CERA가 위험·D&D·예상 비용·복구안을 먼저 계산해 제시하고, 운영자가 현실 정보 또는 계획 조건을 수정하면 그 입력을 근거로 다시 계산한다". **기존 개념 모델을 대규모 재수정하지 않고 의미만 명확히 한다.** 새 최적화 알고리즘·DB 논리 설계는 하지 않는다
- 한 일:
  1. **`docs/03` 2.6.1절 신설** — `FR-OPR-01~12` + 합격 기준 `AC-OPR-01~10`. CERA 선계산 / 결과 숫자 직접 수정 금지 / 사실·요율·계획 조건·계획 결정 **네 경로 분리** / 재계산 / 재계산 이유 추적 / 예상·계획·실제 비용 구분 / 위험은 확률이 아니라 결정론적 평가 / CERA는 결제·정산 시스템이 아니다. 예시 2개(제2창고 0원 · ODCY A 제외)를 넣었다
  2. **기존 요구사항에 연결** — `FR-RSK-05`(위험 표현 경계), `FR-CON-05`(운영자 상업 조건 입력), `FR-VER-04`(개입 4종 구분), `FR-OPT-04·05` 주석, 사용자 여정 4번 확장
  3. **`docs/21` rev.3** — 12.5절 신설(선계산 · 개입 4종 · 결과 대신 입력 수정 · 계획 조건은 현실 사실이 아님 · 스냅샷·실행 연결과 재계산 이유 추적 · 무조치도 결정), 4.3절에 운영자 계획 조건 행, 11절에 선계산 문장 + 비용 3종 표 + 위험 경계, 6.2절에 **E-37 OperatorPlanningConstraint** 추가(VesselCall→E-38, Truck→E-39), 6.4절에 자원 사실 오염 금지, 15절 관계 3건, 16절 ERD 에 `_CAND` 노드, 25.3·부록 A/B 갱신
  4. **작업표 16 시트 동기화** — Overview 개수·주의 2건, ConceptInventory·AttributeCandidates·Events·CalculatedOutputs·Plans_Decisions·Relationships·OpenDecisions 반영. `04_EntityCandidates` 42행(33 + 시설종류 3 + 형태 미확정 4 + Next·보류 2)
  5. **RPG Preview 에 `operator_planning_constraint` 블록 추가** — Table Candidate 38개. `Schema Status: OPEN` 과 "현실 사실이 아니다", "값 목록 미확정"을 Notes 에 적었다. 경고 배너에 "계산 결과 숫자는 사용자 편집 대상이 아니다"를 더했다
  6. **`docs/13` 최소 추가 3개** — 운영자 계획 조건 · 예상 비용 · 실제 비용. 용어집 전체 동기화는 T-070 계획을 그대로 뒀다
  7. **`docs/15` 신규 L-12** — 운영자 계획 조건의 적용 범위·유효기간·강제/선호 구분·변경 이력·스냅샷 포함 방식을 **한 질문군으로** 묶었다
- 핵심 경계 (이번에 못박은 것):
  - **계산 결과는 계속 계산 결과다.** 운영자가 개입해도 위험·비용은 현실 사실이 되지 않는다
  - **운영자는 결과 숫자를 고치지 않고 입력을 고친다.** "350,000원 → 0원" 이 아니라 "창고 B 보관료 0원" 을 입력한다
  - **"이번엔 ODCY A 쓰지 마"는 현실 사실이 아니다.** 자원의 가용 사실로 기록하면 그 시설이 현실에서 못 쓰는 자원처럼 오염된다
  - **무조치도 정당한 결정이다.** 복구안 하나를 반드시 승인해야 하는 시스템이 아니다
  - **예상 비용 ≠ 실제 비용.** 실제 비용은 Future 이고 CERA는 결제·정산을 하지 않는다
  - **위험은 확률 예측이 아니다.** 등급·여유시간·노출액·자원 제약·데이터 불확실성·원인의 결정론적 평가다
- 하지 않은 것: 솔버 선택 · 제약 표현 형식 · 제약 값 목록(enum) · 제약 테이블 · 위험 확률 모델 · 비용 공식 변경 · DB·ORM·API·UI·Backend
- rev.2 결정을 되돌리지 않았다: QuestionItem · 견적 3층 · MessageApproval 후보 · OperationalPlan OPEN · ExceptionCase OPEN · CostLineItem 귀속 · ChannelConnection · MVP 33 — 모두 그대로다
- 변경 파일: 수정 `docs/03`, `docs/13`, `docs/15`, `docs/21_cera-conceptual-data-model.md`(rev.3), `docs/21_cera-conceptual-data-model.xlsx`, `docs/21_cera-db-template-preview.xlsx`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: 제품 영역 변경 0건(`back/`·`ai/`·`data/`·`packages/`·`infra/`), `front/` 미커밋 변경은 Antigravity 것이며 손대지 않음, `git diff --check` 통과, 두 워크북 openpyxl 재확인(작업표 16시트 · Preview 8시트 38블록 · 한글·색·범례 정상 · 셀의 `**` 0건)
- 남은 일 / 다음 한 걸음: **T-076 최종 검토.** 승인되면 논리 DB 설계(L-1~L-12) → T-070 → T-069
- 큐 변경: **T-077 DONE**, T-076 검토 항목에 rev.3 추가
- 주의사항: 산출물은 모두 미커밋이고 **최종 DB 스키마가 아니다.** 운영자 계획 조건은 개념만 확정했고 표현 방식은 L-12 다

### T-075: 개념 데이터 모델 검토 반영 (rev.2) + RPG 스타일 DB Preview — DONE (2026-09-17, **재검토 대기 · 미커밋**)
- 기준 커밋: `1b97905`. 제품 코드 변경 0건. **`front/` 는 Antigravity 작업이므로 읽기만 했다**
- 지시: 사용자 + ChatGPT 1차 검토(T-074) 결과 반영. **폐기·재설계가 아니라 수정** — ① 과하게 확정한 개념을 다시 OPEN ② 기존 요구사항 용어와 정렬 ③ Markdown·Excel 개념 목록·개수 동기화 ④ 기존 16시트 작업표는 개념 검토용으로 유지 ⑤ **RPG DB 문서 스타일의 별도 Preview Excel 추가**
- 다시 연 것 5건: **견적**(제안 묶음 / 요율 사실 / 현재 요율 **세 층**, 묶음은 `OPEN FOR LOGICAL DESIGN`) · **발송 승인**(독립 불변 결정 기록 후보로 승격) · **운영 계획 묶음**(Aggregate·버전 필요 여부 OPEN) · **예외 Case**(파생 뷰가 기본안이지만 운영 Case 필요 여부 OPEN) · **비용 줄 귀속**(배정 하나로 고정하지 않음)
- 용어 정렬 2건: **`Ask` → `QuestionItem`**(새 개념이 아니라 요구사항의 질문 항목이 저장 개념에서만 빠져 있었다. **계약 필드명 `ask_id` 는 유지**) · **`ChannelCredential` → `ChannelConnection`**(비밀값을 DB 에 담는 것처럼 읽히던 이름. 담는 것은 연결 상태·권한·만료이고 비밀값은 참조만)
- 개수 재계산: **MVP 저장 개념 후보 33** (E-01~E-33) + 시설 종류 3 + 형태 미확정 3 (E-34~36) + Next·보류 2 (E-37·38) + 올리지 않은 것 16. 최소 집합 **16 + 17 = 33**. 문서 6·21.1·25·부록 A 와 작업표 `04_EntityCandidates`·`01_Overview` 를 모두 맞췄다
- 신규 질문: **L-9**(운영 계획 묶음) · **L-10**(예외 운영 Case) · **L-11**(발송 승인 기록). 갱신: L-1(이름) · L-3(제안 묶음 관계) · Q-60(귀속 대상)
- 산출물:
  - `docs/21_cera-conceptual-data-model.md` **rev.2** (1,340여 행): 3·4·5.6·5.7·5.11·5.12·6·8.4·11·12.3·12.4·14·14.4·15·16·19·20·21·24·25·부록 A/B 수정. 6절·16절·25절은 전면 교체
  - `docs/21_cera-conceptual-data-model.xlsx` **16 시트 유지** (개념 검토 작업표, 데이터 567행): 수정 개념 전부 반영, Markdown 과 개수 일치
  - **`docs/21_cera-db-template-preview.xlsx` 신규** (8 시트, Table Candidate 37개): RPG DB 문서 스타일. 참조 파일(`RPG 문서.xlsx`)을 직접 열어 글꼴(Arial)·5행 블록 구조·색(PK `FFFF00` / FK `93C47D` / 한글행 `CFE2F3` / 라벨 `D0E0E3`)·우측 범례·테두리를 확인해 재현했다
- 파생값은 Preview 에서 제외: 단계 · 영향 · 신선도·결정가능성 · 노출·절감 KPI · 활동 타임라인 · 예외 뷰 · 화면 조립 뷰 · 운영계획 묶음(OPEN) · 개별 차량 · 입항 건 → `00_목록` 시트에 이유와 함께 적었다
- 과거 기록은 다시 쓰지 않았다: `docs/18`·ADR 본문, LOG 의 옛 항목은 **그때의 기록**이므로 유지하고, 정본과 어긋난 지점만 `docs/21` 24.3절 **X-7·X-8·X-9** 로 등록해 T-070 에서 한 번에 고치도록 했다
- 검증: 제품 영역 변경 0건 확인, 두 워크북을 openpyxl 로 다시 열어 시트·행수·한글·색·범례·경고 배너 확인, Excel 셀의 markdown 강조(`**`) 0건, `.gitattributes` 로 xlsx binary 확인
- 남은 일 / 다음 한 걸음: **T-076 재검토.** 승인되면 논리 DB 설계 → T-070 → T-069
- 큐 변경: T-074 DONE(1차 검토), **T-075 DONE**, **T-076 신규(NEEDS_HUMAN, P0)**
- 주의사항: **산출물 3개 모두 미커밋이고 최종 DB 스키마가 아니다.** Preview 도 Table Candidate 일 뿐이다

### T-073: CERA Conceptual Data Model (개념 데이터 모델) — DONE (2026-09-17, **사람 검토 대기 · 미커밋**)
- 기준 커밋: `1b97905`. 제품 코드 변경 0건 (`front/`·`back/`·`ai/`·`data/`·`packages/`·`infra/`)
- 산출물: **`docs/21_cera-conceptual-data-model.md`**(25개 절 + 부록 2개, 1,270여 행), **`docs/21_cera-conceptual-data-model.xlsx`**(검토용 작업표 16 시트·523행) / 수정 `docs/15`(Q-53·56·57·61 결론 + L-1~L-8 신규), `docs/20`(검토 시작 기준점과 완료 커밋 구분), `docs/README.md`, `AGENTS.md`, `.gitattributes`(xlsx binary), `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 요약: 테이블이 아니라 **개념과 관계**를 정했다. 11분류(엔티티·속성·코드·운영 사실·현실 사건·현재 상태·계산·계획·외부 참조·근거·보류)로 전체 개념을 판정하고, **모든 독립 엔티티 후보에 "독립 관리하지 않으면 깨지는 기능"** 을 붙였다. SQL·DDL·기술 선택은 하지 않았다
- 답한 열린 질문: **Q-53**(MVP는 컨테이너:B/L = N:1, Import FCL 전제. 다대다는 구조로 배제하지 않음) · **Q-56**(Destination은 엔티티가 아니라 역할) · **Q-57**(개별 차량은 MVP 필수 아님) · **Q-61**(활동 타임라인은 저장하지 않고 조합)
- 엔티티로 올리지 않은 것: Destination · 선사 · 개별 차량 · SlotPool · 자원 가용량 · 견적 · 구간 · 금액·환율 · 예외 · 단계·영향 · 계획 버전 · 활동 타임라인 · 운영 계획 · Shipment · 기사
- **새로 발견한 개념: Ask(문의 항목)** — 회신 값을 사실 키로 매핑하는 결정론 축인데 정본 스키마에 자리가 없었다. 없으면 LLM이 `fact_key`를 정하게 되어 ADR-026 위반 (→ L-1, T-069에서 바로 필요)
- 새로 만든 질문 8개(L-1~L-8)와 문서·데이터 불일치 6건(X-1~X-6)을 등록했다. X-5(`docs/04` 엔티티 표)는 `docs/20` 6.3절 방침대로 **개념 모델 승인 뒤 T-070에서 한 번에** 고친다
- 확정하지 않은 것: Q-54·55·58·59·60·62·63(논리 설계), M-6, Q-46, DB 제품·ORM·API endpoint·LLM 공급자·솔버
- **2026-09-17 rev.2 정정 (T-075)**: 위 rev.1 기술 중 **`Ask` 는 `QuestionItem` 으로 이름이 정정됐고**(새 개념이 아니라 요구사항에 이미 있던 질문 항목), **견적 결론은 세 층으로 완화**됐고, **발송 승인은 독립 기록 후보로 승격**됐고, **운영 계획 묶음·예외 Case 는 다시 OPEN** 이 됐다. 엔티티 후보 개수도 다시 셌다(MVP 33). 현재 정본은 `docs/21` rev.2 다

### T-072: (사용자 직접 지시) DB 설계 전 요구사항 검토 — DONE (2026-09-16, 사용자·ChatGPT 검토 반영 후 **커밋 `1b97905`**)
- **QUEUE에 사전 등록 없이 사용자 직접 지시로 수행됐다.** 그래서 2026-09-17 동기화 때 이 항목을 뒤늦게 등록했다(과거를 꾸미지 않고 경위를 그대로 남긴다)
- 검토 시작 기준점: `2c37c28` + 당시 미커밋이던 T-071 변경 / **완료 커밋: `1b97905`** — 둘은 다른 의미이며 같은 것으로 덮어쓰지 않는다
- 산출물: **`docs/20_data-model-preconditions.md`**(신규), `docs/14`(**ADR-019·020·021을 `Accepted (구조 한정)`으로 판정** + 상태값 신설), `docs/15`(Q-53~Q-63 추가, 닫힌 질문 표시), `docs/13`(Facility·Destination·Operational Plan·Recovery Plan·Actor·PLAN 용어 추가·구분), `docs/07`(3절 기술 표를 A~D 4분류로, 4절 `messages` ADR-028을 **Accepted**로 정정, 2.1절 실제 발송을 Tech Validation으로), `docs/01`·`docs/04`·`docs/05`(ADR-019/021을 Proposed로 부르던 곳 정정), `docs/19` 헤더
- 요약: "어떤 테이블을 만들까"가 아니라 **"테이블을 만들기 전에 무엇이 확정돼 있고 무엇을 더 결정해야 하는가"**를 갈랐다. DB가 반드시 따라야 하는 확정 규칙 24개(A-01~A-24), Proposed 설계 분류, 시나리오 가정(제품 규칙이 아닌 것), 문서 충돌 D-01~D-06, **원본 / 물질화하는 파생 / 계산 결과 기록 / 조회 시 조립값** 4분류, Event·Canonical State 14문항, 도메인별 분석(Container·B/L·Facility·운송사·차량·계약·요율·비용·통신·감사), 검증 스크립트 규칙 5분류, 식별자 4종, 단계별 결정사항, Planner Handoff
- 사용자 결정 7건: ① 사건·상태 **구조 승인**(파라미터 값은 계속 검증) ② **B/L은 컨테이너와 별개 개념** ③ **Facility 공통 상위 개념 사용**(테이블 하나라는 뜻은 아님) ④ **개별 차량을 MVP 필수로 확정하지 않는다**(이전 결론 철회 → Q-57) ⑤ 환율·기준일은 **보존 요구만 확정**, 저장 위치는 논리 설계 ⑥ **Operational Plan / Recovery Plan 용어 분리** ⑦ **Actor 개념만 도입**, 인증·권한 모델은 만들지 않는다
- 판정: **개념 데이터 모델 착수 조건 충족.** 다음은 CERA 전체 개념 데이터 모델이며 **SQL은 아직 쓰지 않는다** → T-073
- 제품 코드 변경 없음

### T-071: External Communication 구현 전 요구사항 명세 — DONE (2026-09-16, 사용자 검토 후 **커밋 `1b97905`**)
- 산출물: **`docs/19_external-communication-requirements.md`**, `docs/03`(2.7절을 19로 연결 + FR-ING-05·07·FR-COM-02·FR-RSP-01·NFR-03 개정), `docs/15`(Q-49~Q-52 추가, Q-44·Q-45를 구현 전 필수로 표시), `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`
- 요약: `18`이 "왜 이 구조인가"라면 `19`는 **"정확히 무엇을 만들어야 하는가"**다. 사용자 흐름 A~J, 요구사항 그룹 9개 신설(`FR-CPY`·`FR-EVF`·`FR-ELG`·`FR-APV`·`FR-SND`·`FR-INB`·`FR-XAI`·`FR-STC`·`FR-EVL`) + 기존 그룹 확장(`FR-COM-04~`·`FR-UI-09~`·`FR-AUD-02~`·`NFR-12~30`), 실패·예외 35+ 상황 표, 사용자에게 보이는 상태 이름, 완료 조건 34개, 우선순위 3단계, Implementation Planner Handoff
- 특징: **구현 기술을 고정하지 않았다.** AI 모델·공급자·SDK, 외부 API 호출 순서, 인증·DB·큐 라이브러리, 솔버, 배포 환경을 전부 열어 뒀다(23절). 요구사항은 행동과 계약만 정의한다
- 열린 질문 분류: **구현 전 필수**(Q-44 근거 시각, Q-45 보관 기간) / **구현 중 사례 보고 결정**(M-6, Q-47, Q-48) / **범위 밖**(Q-46) / **신규**(Q-49~Q-52)
- 제품 코드 변경 없음
- **2026-09-17 정정**: 이 항목은 오랫동안 "사람 검토 대기 · 미커밋"으로 남아 있었지만, 실제로는 T-072와 함께 `1b97905`로 커밋됐다. 커밋 시점에 QUEUE·CURRENT·LOG를 갱신하지 못해 생긴 차이다

### T-068: CERA External Communication Vertical Slice v0.1 — 설계(Architecture RFC) + AI/Backend 책임 경계 Audit — DONE (2026-09-16, 사용자 결정 반영 및 커밋 `2c37c28`)
- 산출물: **`docs/18_external-communication.md`**(A~O절 RFC), **ADR-026·027·028·029 모두 Accepted**, `docs/01` 3·6·6.1절(**Tech Validation 단계 신설**), `docs/02` 6절, `docs/04` 4.1, `docs/06` 1.1절(**10개 중 LLM은 3개**)·2·7절, `docs/07` 4·6·6.1절, `docs/11` 5절, `docs/15`(Q-44~Q-48), `docs/tasks/CURRENT.md`
- 요약: Mock으로만 있던 외부 연락 루프(초안 → 사람 승인 → 발송 → 실제 회신 → 구조화 → Event 후보 → 화면)를 구현 가능한 수준으로 설계했다. Gmail은 **최종 채널이 아니라 첫 기술검증 채널**로 두고 Channel Adapter 뒤에 뒀다. 같은 날 2차 지시로 **AI/LLM vs Backend·결정론 엔진 책임 경계 Audit**을 수행해 RFC 초안 자체 7건 + 기존 정본 8건의 오배치를 찾아 고쳤다.
- 핵심 결정: ① **AI 사용 기준 = "입력이 비정형인가"** (값이 자주 바뀌는가가 아님) — 구조화 채널은 LLM을 거치지 않는다 ② 발송 자격 = **거래처 → 담당 연락처 → 이메일 검증 → 관계 승인 → 통신 활성**(제품 게이트)이며 개발용 수신자 제한은 별개 장치 ③ `ai/`는 LLM·비정형 처리만, 결정론 엔진은 Backend 영역(새 `engine/` 만들지 않음, 적용은 T-003) ④ OpenAPI를 API 계약 정본으로 전환 시작
- 열린 채로 남긴 것: **M-6**(값이 같은 새 회신의 신선도 갱신), **Q-46**(상대방 포털 입력의 Source 모델 — 채널·역할·입력주체 축 분리), **Q-48**(공용 업무 메일함 구분)
- 제품 코드 변경 없음(`front/`·`back/`·`ai/`·`data/`·`packages/`·`infra/`), 폴더 이동 없음, `engine/` 미생성

### T-067: (사람 지시) AI 협업 개발 Workflow / Orchestrator Handoff 규칙 — DONE (2026-09-15, 사람 검토 대기)
- 산출물: `docs/17_ai-development-workflow.md`, `docs/tasks/CURRENT.md`(IDLE), `docs/tasks/TASK_BRIEF_TEMPLATE.md`, ADR-025, `AGENTS.md` 2절·3.1·3.2·3.4·3.6·3.7절·4절 규칙 10·5절, `CLAUDE.md` Claude 전용 메모, 루트 `README.md` Development Workflow, `docs/01` 8절 commit 문구, `docs/README.md` 색인
- 요약: 사용자 = 최종 결정, Orchestrator = Claude 또는 Codex(한 Task 하나), ChatGPT = Planner/Reviewer, Antigravity = Implementer. 인계 정본은 대화가 아니라 CURRENT.md. 제품 코드·데이터 변경 없음

### T-066: (사람 지시) Private Monorepo 재정렬 — DONE (2026-09-15, 사람 검토 대기)
- 산출물: `web/` → `front/web/` 이동, `back/`·`ai/`·`packages/`·`infra/` README, 루트 `README.md`, `AGENTS.md` 1.1절·4절(규칙 9·10)·6절, `CLAUDE.md`, `docs/07` 6절, ADR-024, `.gitignore`, 경로 참조 수정(`next.config.ts`, `tsconfig.json`, 검사 스크립트 2개, docs 9개)
- 요약: 저장소 하나 안에서 책임 영역만 나눴다. 기능 추가 없음. 이동 전후 파일 해시 대조로 유실 0 확인. 시나리오 JSON의 "LLM 녹화" 표현 17곳을 "시나리오 작성값 (LLM 미실행)"으로 바꾸고, 문서의 Three.js 표현을 "현재 Prototype 2D / 향후 선택지"로 정리. validate·typecheck·lint·build·smoke(135항목) 통과

### T-063: CERA Operations Control Tower Prototype + Scenario Playback — DONE (2026-09-15, 사람 검토 대기 T-064)
- 산출물: `front/web/` (Next.js 16 · React 19 · TypeScript), `front/web/src/components/*`, `front/web/scripts/smoke-browser.mjs`, `docs/16_frontend-prototype.md`, ADR-022·023
- 요약: 한 화면에 KPI 6개, 추상 2D 운영 지도(정상·막힌·Recovery·잠정 경로, 트럭 시간대별 부하), Exception Panel, Recovery Console(Baseline·Plan·Saving, 20대 배치 = 20 · 영향 12대 Actions = 12, 조치 12행과 근거·변경), Activity Timeline, Communications, Data Trust, 30대 표와 상세 서랍. Reset·이전·다음 이벤트·Play로 S0~S8 재생. 검증: typecheck·lint·build 통과, Edge 헤드리스 smoke에서 9단계 화면 값을 fixture와 대조해 전부 통과, 콘솔 오류 0

### T-062: Frontend Data Contract + Mock Data Provider — DONE (2026-09-15)
- 산출물: `front/web/src/contracts/cera.ts` (View Model v0.1), `front/web/src/data/provider.ts` (`CeraDataProvider`, 엔드포인트 대응), `front/web/src/data/mock/` (`fixture.ts`, `mock-provider.ts`), `front/web/src/data/index.ts`
- 요약: 8개 개념 엔드포인트(`/operations/today`, `/containers`, `/risks`, `/resources`, `/recovery-plans/current`, `/communications`, `/activity`, `/data-trust`)와 같은 모양을 MockProvider가 돌려준다. `as_of` 주입, 응답 `meta.result_kind`·`is_simulated`. 컴포넌트는 fixture를 import하지 않는다. `07` 5절에 화면용 조회 API 추가

### T-061: 30대 Scenario Data Pack (Prototype 판) — DONE (2026-09-15)
- 산출물: `data/scenarios/busan-wh-capacity-01/` (JSON 9개 + README), `front/web/scripts/validate-scenario.mjs`, `09_mvp-scenario.md` 0절
- 요약: 의도 설계(Faker 없음). 창고 A 20 → 8, 영향 12대, 트럭 8대(근무 시간 상이) + K운송, ODCY A(40FT Dry 전용 5 → 4)·B(Dry 6, Reefer 불가), Reefer 4대, 통관 대기·STALE·RECEIVED_ONLY 사례. Baseline 4,650,000 / v1 3,835,000(절감 815,000) / v2 3,855,000(절감 795,000)원 — 09 예시값을 복사하지 않고 단가에서 합산(`[PROPOSED]` fixture 수정, README 4절). `validate:scenario` 2,133개 검사 통과
- 작성 도구: JSON은 세션 scratchpad의 작성 스크립트로 한 번 생성한 뒤 **명시값으로 커밋 대상**에 둔다(엔진이 아님). 이후 수정은 JSON 직접 + validator

### T-060: Event/State 마무리 — RECEIVED_ONLY는 STALE이 아니라 신선도 UNKNOWN — DONE (2026-09-15)
- 산출물: `docs/05_event-and-state.md` 5.2·5.3·6.2·8.4·9.1·14·15절, `11`·`13`·`14`(ADR-014 주석)·`07` 갱신
- 요약: 발생·기록 시각 없이 수신 시각만 있으면 `freshness = UNKNOWN`, `temporal_confidence = LOW`, `evidence_time_quality = RECEIVED_ONLY`(옛 `temporal_quality`). "모른다" ≠ "오래됐다". 중요 사실이면 STALE처럼 확인·재조회·승인 게이트(`FRESHNESS_UNKNOWN`). 이것으로 Event/State 설계는 완료 상태(사람 검토 T-001은 별도)

### T-032: Event·Source·Canonical State 스키마 + Reconciliation 규칙표 — DONE (2026-09-11, 사람 검토 대기)
- 산출물: `docs/05_event-and-state.md` 확정안(Event 스키마 4절, Source Model 3절, 시간·신선도 5절, 상태 차원 6절, 충돌 7절, R1~R12 8절, Canonical Fact 9절, 정정 10절, 확인 정책 11절, Planning Snapshot 14절, 정책 파라미터 15절, 검증 사례 부록 A), `docs/04_domain-model.md` 2절(Hybrid 상태 모델), ADR-019·020·021(Proposed)
- 요약: 전역 출처 순위를 폐기하고 권한 매트릭스 + 근거 강도 + 최근 우선(강도 가드·동시 충돌·불리한 변경 보류)으로 Reconciliation을 정의했다. 출처를 채널·역할·추출 방식으로, Canonical 상태를 값 보증·신선도·충돌·보류·결정 가능성으로 나눴다. 6개 필수 CASE와 10개 경계 사례에 적용했고 R1~R12를 모두 썼다. Q-22 해결.
- DoD 조정: `schemas/*.schema.json` 수작업 초안은 만들지 않았다. `07_backend-architecture.md`가 JSON Schema를 Pydantic 모델에서 생성하기로 정했으므로, 지금 손으로 쓰면 두 벌이 생긴다. 스키마는 `05` 4·9·14절 표로 고정했고 파일 생성은 T-041로 옮겼다.
- field-dictionary 7.1 제안 채택 여부: VesselCall(`VESSEL_CALL` 엔티티, `vessel_call.link`), 원천 코드 보존(`payload`)은 채택. `manifest_no`·`msn`은 `bl.link`의 B/L 엔티티 속성으로 T-041에서 정한다.
- **패치 (2026-09-11, 사람 조건부 승인 후)**: ① ADR-007 Reopened → Proposed(솔버는 T-036) ② Plan Approval과 Fact Verification 분리(ADR-017 개정, `05` 11.5, `plan_decisions`) ③ 근거 시각 3단계 폴백 + `temporal_quality`(지연 허용 ∞ 폐기) ④ `FORECAST` 사실 종류 + `forecast.eta`. 6개 CASE 재검증 완료. 사람 최종 검토 대기.

### T-031: 기획 v0.2 전면 재정렬 — DONE (2026-09-11)
- 산출물: `docs/CHANGELOG.md`(신규), `docs/02`~`12`(신규 정본), `docs/13_glossary.md`·`14_decisions.md`·`15_open-questions.md`(이름 변경 + 갱신), `docs/01_project-rules.md`·`README.md`·`AGENTS.md`·`data/*`·`QUEUE.md` 갱신. v0.1 문서 7개와 원본 기획서 PDF/DOCX 삭제
- 요약: 공공데이터 중심 D&D Risk Radar에서 다중 출처 Canonical Operational State + 예외 복구 + 커뮤니케이션 루프를 갖춘 System of Decision/Action으로 재정의했다. Event·Source Priority·Reconciliation, 10개 에이전트 역할, 모듈형 모놀리스 백엔드, MVP 시나리오, Three.js 시뮬레이터 요구사항, ADR-011~018을 작성했다. 검증 결과와 기존 질문은 모두 이전·보존했다.

### T-004: 공공 API 공식 명세 확보 및 필드 사전 초안 — DONE (2026-09-11)
- 산출물: `docs/data/field-dictionary.md`, `docs/data/code-tables.md` (신규), 당시 `docs/03_data-strategy.md`·`02`·`05`·`08`·`10`·`README.md`·`AGENTS.md` 갱신 (v0.2에서 해당 내용은 `11_data-sources.md` 등으로 이전)
- 요약: 공식 가이드 3종(UNI-PASS 연계가이드 v3.6, 해수부 활용가이드 2종)과 포털 Swagger로 DS-01·DS-02 요청·응답 필드를 VERIFIED로 정리하고 CERA Mapping을 붙였다. DS-02는 입항 건 단위 조회이고 컨테이너별 이벤트 일시가 없다는 점을 확인해 조인 경로와 R-1 측정 방식을 바꿨다. 15011649 기록을 정정했다(Q-03 CLOSED).

### T-000: 문서 초안 세트 작성 — DONE (2026-09-10)
- 산출물: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/01`~`10`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md` (v0.2에서 재편, `docs/CHANGELOG.md` 4절)
- 요약: 원본 기획서 V0.1을 바탕으로 규칙·데이터 전략·서비스 플로우·도메인 모델·아키텍처·로드맵·ADR·미확정 사항을 초안으로 작성. 공공 API 2종을 웹에서 1차 확인.

## 폐기 (DEPRECATED)

| ID | 제목 | 폐기일 | 사유 / 대체 |
| --- | --- | --- | --- |
| T-007 | ContainerState / ContainerEvent 스키마 확정 | 2026-09-11 | 상태 모델이 Event·Canonical State로 바뀜 → **T-032** |
| T-008 | TariffRule 스키마 및 선사 1곳 Tariff 구조화 | 2026-09-11 | 계약 추출 → 확인 흐름으로 바뀜 → **T-033** (스키마), T-043 (엔진) |
| T-009~T-016, T-018~T-028 | v0.1 로드맵 백로그(미착수) | 2026-09-11 | 옛 버전 체계. 새 백로그는 `12_roadmap.md`의 T-041~T-059. 이 ID들은 다시 쓰지 않는다 |

## 백로그 (로드맵에서 꺼낼 후보)

T-041 ~ T-059: `docs/12_roadmap.md` 3~5절. 의존이 풀리면 위 템플릿으로 옮겨 적는다.


### Truth Layer 완료 → 핵심 계산 단계 (2026-10-26 사용자 지시 — 남은 개발 약 2일, 모델 · 후순위 작업 중단)
**~~T-111~~ DONE → T-112 Cost / Risk Engine → T-113 Recovery Solver → T-114 Recovery Plan Integration(Agent · 재계산 · 화면 · E2E)**

### (옛) T-093 후속 순서 (2026-10-26 사용자 지시 — Solver 전에 Truth Lifecycle 보강)
**T-111 Truth Lifecycle Hardening → Cost / Risk Engine → Solver(Q-65) → Recovery Plan 생성 → 실제 이메일 채널 → 역할 · 인증 UI(T-098) → 연속 모델 평가 / 파인튜닝(사람 보정 데이터 이후)**
