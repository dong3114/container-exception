# Task Brief 템플릿

> Task Brief는 **WHAT / WHY**만 정한다. 변경 파일·API·DB 같은 **HOW는 Implementation Plan**(`docs/tasks/plans/`)에서 정한다.
> 보통은 `docs/tasks/CURRENT.md` 상단 칸에 바로 채운다. 길어지면 `docs/tasks/briefs/T-NNN-<slug>.md`로 따로 두고 CURRENT에서 링크한다.
> 흐름 설명: `docs/17_ai-development-workflow.md`

```markdown
# Task: T-NNN 제목

## Goal
이번 작업으로 달성할 것 (한두 문장)

## Why
왜 지금 필요한가. 어떤 가설·문제를 검증하거나 해결하나

## Scope
- 이번에 하는 것

## Out of Scope
- 이번에 하지 않는 것 (다음 Task 몫, 금지된 것 포함)

## Existing Decisions
- 따라야 할 Accepted ADR·규칙·사람 지시 (번호와 한 줄 요지)
- 판정 대기(Proposed)지만 전제로 삼는 것은 따로 표시

## Open Questions
- 사용자 판단 또는 현업 검증이 필요한 것. 누가·언제 답하나

## Expected User Value
- 끝나면 사용자·현업이 무엇을 할 수 있게 되나

## Completion Criteria
- [ ] 확인 가능한 조건 (실행할 검증 명령 포함)
- [ ] 관련 docs·ADR·QUEUE·LOG 동기화

## Required Review
- 누가 무엇을 검토하나 (Orchestrator 리뷰 / ChatGPT 독립 리뷰 / 사용자 승인 지점)

## Handoff Notes
- 다음 Orchestrator가 먼저 알아야 할 것
```
