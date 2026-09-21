# CERA Current Task

> 지금 진행 중인 작업 **하나**의 인수인계 문서다. Claude와 Codex 중 누가 이어받든 이 파일에서 시작한다.
> 예정 작업은 `QUEUE.md`, 끝난 작업은 `LOG.md`에 있다. 사용법: `docs/17_ai-development-workflow.md` 5·6절.
> 대화 내용을 옮겨 적지 않는다. 결정된 것, 진행 상태, blocker, 다음 한 걸음만 남긴다.

상태 값: `IDLE` · `DESIGNING` · `PLANNING` · `AWAITING_APPROVAL` · `IMPLEMENTING` · `REVIEWING` · `DOC_SYNC` · `COMMIT_READY`

---

## Status

**IDLE** — **T-070 주변 문서 동기화 DONE (2026-09-18).** 진행 중인 Task 는 없다. **다음 작업은 T-081**(논리 모델 후속 — 아직 착수 전. 착수하는 Orchestrator 가 이 파일에 Task Brief 를 채운다).

T-070 경과는 `LOG.md` 2026-09-18 항목에 있다. 여기에는 다시 옮기지 않는다.

## 지금 확정된 상태

| 항목 | 상태 |
| --- | --- |
| 개념 데이터 모델 `docs/21` | **승인·동결** (T-076). 수정하지 않는다 |
| 논리 DB 설계 `docs/22` + 작업표 | **rev.2.2** (T-079 DONE). MVP 51 · Next 1 · MVP 에서 만들지 않음 2 = 54. **단 `event` 표가 `docs/05` 4.2 와 대조되지 않은 부분이 발견돼 T-081 에서 보완한다** |
| 런타임·오류 처리·관측성 `docs/23` | 정본. ADR-030·031 **Proposed** — 기술 최종 결정 아님 |
| 주변 문서 | T-070 에서 `docs/04`·`07`·`13`·`19`·`05`·`18`·AGENTS·README 를 `21`·`22`·`23` 에 맞춤 |
| Backend 언어 | **미결**(Q-64). 현재 우선 후보 NestJS + TypeScript, Spring Boot·Python(ADR-002) 후보 유지 |

## Baseline

| 항목 | 값 |
| --- | --- |
| branch | `main` |
| 최신 커밋 | `8d47a99` — docs: finalize logical DB design and runtime observability (T-079 DONE) |
| 이 커밋 위의 문서 변경 | **T-070 결과 — commit 대기(사용자 승인 필요)** |
| remote | 없음 (push 한 적 없음). **이 PC가 유일한 사본이다** |
| working tree 의 다른 작업 | `front/web/` 12개 파일(Antigravity 디자인 작업) · untracked `data/Proposal/` · `scripts/` — **이 흐름의 작업이 아니다. 수정·스테이징·커밋하지 않는다** |
| last updated | 2026-09-18 |
| current orchestrator | 없음 (IDLE). 직전: Claude Code (claude-opus-5) — T-070 |

## 다음 한 걸음

1. **T-070 산출물 commit** — 사용자 지시가 있을 때만. 대상은 이 흐름의 문서 파일뿐이다(`front/web/`·`data/Proposal/`·`scripts/` 제외)
2. **T-081 논리 모델 후속** — 범위는 `QUEUE.md` 대기 — P0 의 T-081 항목(A 사람 확인·정정 사건 표현 · B 검증기 confidence · C 출처 종류 값 목록 · D `21`→`22` 재대조). **`docs/21` 수정 금지**
3. 이후 순서: **T-069**(Q-44 · Q-45 사용자 결정, L-13, 첫 구현 슬라이스 확정) → **Backend·DB 기술 결정**(사용자, Q-64 · Q-65) → **T-080**(결정된 기술을 첫 슬라이스 표부터) → Antigravity 구현 → Claude/Codex 검토 → 사용자 승인 · commit

## 다음 Orchestrator 가 먼저 알아야 할 것

- **정본 관계**: Event·State 의 **개념 규칙**은 `docs/05` + 승인된 `docs/21`, **표·필드·제약**은 `docs/22`. 둘이 어긋난 네 곳(사람 확인 사건 · 검증기 confidence · 출처 종류 값 · 4.2 나머지 필드)은 **T-081 결정 전까지 어느 쪽으로도 구현하지 않는다**(`docs/05` 머리 주석)
- **통신 기록의 역할**: `comm_message` = 업무 메시지·승인할 내용(불변) · `message_status_transition` = 메시지 상태 · `send_attempt` = 외부 전송 시도(재시도 = 새 행) · `message_approval` = 발송 승인(덧붙이기) · `audit_log` = 감사 대상 행위 · `system_error` = 기술 오류(`docs/18` 머리 주석·D.1)
- **개수는 추측하지 말고 다시 센다.** 정본은 `docs/22` 2절, 작업표 `00_목록` 시트
- **T-080 은 기술을 처음 고르는 단계가 아니다.** Backend·DB 기술은 T-069 뒤 사용자가 정한다(`docs/23` 13절)
- 작업표 수정 스크립트는 저장소에 없다. 작업표를 고칠 때는 `openpyxl` 로 직접 연다. **Markdown 이 정본**이다

## 남은 OPEN 질문 (답하는 시점)

| # | 무엇 | 언제 |
| --- | --- | --- |
| T-081 A~D | 사람 확인 사건 표현 · 검증기 confidence · 출처 종류 값 목록 · `21`→`22` 재대조 | **T-081 (T-069 전)** |
| Q-44 · Q-45 | 근거 시각 선택 규칙 · 실제 메일 보관·파기 정책 | T-069 착수 전 사용자 결정 |
| L-13 | 복구 맥락 식별자 | T-069 |
| Q-64 | Backend 언어·프레임워크 | T-069 뒤 사용자 결정 |
| Q-65 | 솔버 실행 위치·언어 (OR-Tools Node 바인딩 `[TO VERIFY]`) | T-036 재개 뒤, Q-64 와 함께 |
| Q-66 | `system_error` 오류 분류·코드 목록 | T-069 · 구현 |
| Q-67 | 로그 저장소·관측 제품 | 첫 배포 환경을 정할 때 |
| L-14 · L-15 · L-16 | 적용 범위 값·선택 정책 · `message_kind` 값 · `bl` 유일 제약 | 현업 검증 · 필요 시 · 실데이터 확인 |
