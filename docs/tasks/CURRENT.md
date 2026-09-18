# CERA Current Task

> 지금 진행 중인 작업 **하나**의 인수인계 문서다. Claude와 Codex 중 누가 이어받든 이 파일에서 시작한다.
> 예정 작업은 `QUEUE.md`, 끝난 작업은 `LOG.md`에 있다. 사용법: `docs/17_ai-development-workflow.md` 5·6절.
> 대화 내용을 옮겨 적지 않는다. 결정된 것, 진행 상태, blocker, 다음 한 걸음만 남긴다.

상태 값: `IDLE` · `DESIGNING` · `PLANNING` · `AWAITING_APPROVAL` · `IMPLEMENTING` · `REVIEWING` · `DOC_SYNC` · `COMMIT_READY`

---

## Status

**IDLE** — **T-079 논리 DB 설계 DONE (2026-09-18, rev.2.2 최종 승인 — 사용자 + ChatGPT).** 진행 중인 Task 는 없다. **다음 작업은 T-070**(아직 착수 전 — 착수하는 Orchestrator 가 이 파일에 Task Brief 를 채운다).

T-073 ~ T-079 의 경과·판단·검증 기록은 `LOG.md` 2026-09-17 ~ 2026-09-18 항목에 있다. 여기에는 다시 옮기지 않는다.

## 지금 확정된 상태

| 항목 | 상태 |
| --- | --- |
| 개념 데이터 모델 `docs/21` | **승인·동결** (T-076). 이후 단계에서 수정하지 않는다 |
| 논리 DB 설계 `docs/22` + 작업표 | **rev.2.2 최종** (T-079 DONE). **MVP 51 · Next 1 · MVP 에서 만들지 않음 2 = 54**. 작업표 블록 52 · 컬럼 557 |
| 런타임·오류 처리·관측성 `docs/23` | **추가됨.** ADR-030(오류·관측성)·ADR-031(런타임 방향) **Proposed** — **기술 최종 결정 아님** |
| 사용자 결정 D-1 ~ D-5 | 전부 CLOSED (`docs/22` 25절) |
| Backend 언어 | **미결**(Q-64). 현재 우선 후보 NestJS + TypeScript, Spring Boot 후보 유지, Python(ADR-002) 기록 유지 |

## Baseline

| 항목 | 값 |
| --- | --- |
| branch | `main` |
| 최신 커밋 | `687d458` — docs: add CERA conceptual data model and logical DB design (T-079 rev.2.1 저장) |
| 이 커밋 위의 문서 변경 | T-079 rev.2.2 최종 정리 + `docs/23` 신설 + 작업 관리 문서 갱신 — **commit 대기(사용자 승인 필요)** |
| remote | 없음 (push 한 적 없음). **이 PC가 유일한 사본이다** |
| working tree 의 다른 작업 | `front/web/` 12개 파일(Antigravity 디자인 작업) · untracked `data/Proposal/` · `scripts/` — **이 흐름의 작업이 아니다. 수정·스테이징·커밋하지 않는다** |
| last updated | 2026-09-18 |
| current orchestrator | 없음 (IDLE). 직전: Claude Code (claude-opus-5) — T-079 |

## 다음 한 걸음

1. **T-079 산출물 commit** — 사용자 지시가 있을 때만. 대상은 이 흐름의 문서 파일뿐이다(`front/web/`·`data/Proposal/`·`scripts/` 제외)
2. **T-070 주변 문서 동기화** 착수 — 범위는 `QUEUE.md` T-070 항목(2026-09-18 추가 포함)
3. 이후 순서: **T-069**(Q-44 · Q-45 사용자 결정, L-13, 첫 구현 슬라이스 확정) → **Backend·DB 기술 결정**(사용자, Q-64 · Q-65) → **T-080**(결정된 기술을 첫 슬라이스 표부터 물리 설계에 반영) → Antigravity 구현 → Claude/Codex 검토 → 사용자 승인 · commit

## 다음 Orchestrator 가 먼저 알아야 할 것

- **개수는 추측하지 말고 다시 센다.** 정본은 `docs/22` 2절 표, 작업표 `00_목록` 시트가 같은 수를 보여 준다
- **분류(Classification)와 변경 방식(Mutation Policy)은 다른 축이다**(`docs/22` 1절). `send_attempt`·`extraction` 은 "생성 내용 불변 + 결과/검토 컬럼만 한 번 갱신"이다
- **`system_error` 는 기술 운영 표다.** `event`·계산·Activity Timeline 으로 흘러가지 않고, `audit_log`·`send_attempt` 를 대신하지 않는다(`docs/22` 16.2a, `docs/23` 4절)
- **복구 맥락 예시는 `<RECOVERY_CONTEXT_REF>` 자리표시자다.** 식별 방식은 L-13(T-069)이 정한다
- **논리 표 51개 ≠ 첫 마이그레이션.** T-080 은 첫 슬라이스 표부터 한다(`docs/22` 26절)
- **T-080 은 기술을 처음 고르는 단계가 아니다.** Backend·DB 기술은 T-069 뒤 사용자가 정하고 T-080 이 반영한다(`docs/23` 13절)
- 작업표 수정 스크립트는 저장소에 없다(세션 scratchpad 에만 있었다). 작업표를 고칠 때는 `openpyxl` 로 직접 연다. **Markdown 이 정본**이다
- T-070 범위에 이미 올라간 것: `AGENTS.md` 1.1절 `ai/` 행("+ 결정론 엔진")이 ADR-029 와 어긋남 · `docs/07` 의 Python 전제 표현 · README 영역 문구

## 남은 OPEN 질문 (답하는 시점)

| # | 무엇 | 언제 |
| --- | --- | --- |
| Q-44 · Q-45 | 근거 시각 선택 규칙 · 실제 메일 보관·파기 정책 | **T-069 착수 전 사용자 결정** |
| L-13 | 복구 맥락 식별자 | T-069 |
| Q-64 | Backend 언어·프레임워크 | T-069 뒤 사용자 결정 |
| Q-65 | 솔버 실행 위치·언어 (OR-Tools Node 바인딩 `[TO VERIFY]`) | T-036 재개 뒤, Q-64 와 함께. 첫 슬라이스를 막지 않는다 |
| Q-66 | `system_error` 오류 분류·코드 목록 | T-069 · 구현 |
| Q-67 | 로그 저장소·관측 제품 | 첫 배포 환경을 정할 때 |
| L-14 | 적용 범위 값 목록 · 선택 정책 | 현업 검증 |
| L-15 | `message_kind` 값 목록 | 필요해지면 |
| L-16 | `bl` 업무 유일 제약 | 실데이터 확인(T-005·T-006) |
