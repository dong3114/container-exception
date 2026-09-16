# CLAUDE.md

이 프로젝트의 에이전트 지침은 `AGENTS.md`에 있다. 모든 에이전트가 같은 파일을 쓰도록 여기서는 가져오기만 한다.

저장소는 하나의 Monorepo다(`front/web` 화면, `back`·`ai`·`packages`·`infra` 구현 전, `data` 공통 시나리오, `docs` 정본). 구조는 `AGENTS.md` 1.1절과 루트 `README.md`에 있다. Frontend 명령은 `front/web`에서 실행한다.

## Claude Code 전용 메모

- Claude가 Orchestrator를 맡는 세션은 시작 전에 `AGENTS.md` → `docs/tasks/CURRENT.md` → 관련 ADR → `git status` 순서로 확인한다. 같은 Task를 Codex가 이어받을 수 있다(`AGENTS.md` 3.7절).
- 세션을 끝내기 전에 중요한 상태 변경(결정, 진행 상태, blocker, 다음 한 걸음)을 `CURRENT.md`에 반영한다. 대화 내용을 통째로 옮기지 않는다.
- 규칙 본문은 `AGENTS.md`에만 둔다. 여기에 복제하지 않는다.

@AGENTS.md
