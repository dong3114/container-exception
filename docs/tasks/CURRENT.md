# CERA Current Task

> 지금 진행 중인 작업 **하나**의 인수인계 문서다. Claude와 Codex 중 누가 이어받든 이 파일에서 시작한다.
> 예정 작업은 `QUEUE.md`, 끝난 작업은 `LOG.md`에 있다. 사용법: `docs/17_ai-development-workflow.md` 5·6절.
> 대화 내용을 옮겨 적지 않는다. 결정된 것, 진행 상태, blocker, 다음 한 걸음만 남긴다.

상태 값: `IDLE` · `DESIGNING` · `PLANNING` · `AWAITING_APPROVAL` · `IMPLEMENTING` · `REVIEWING` · `DOC_SYNC` · `COMMIT_READY`

---

## Status

**IDLE** — **T-083 DONE (2026-09-21, 사용자 결정 Q-64): Main Backend = TypeScript + NestJS, AI Server = 별도 Python 런타임(ADR-033 Accepted).** 진행 중인 Task 는 없다. **다음은 사람 결정 T-084(Q-68 DB)** 이고, 그 뒤 T-080(P0 29개 물리 설계) → T-085~T-096(U0~U11 구현)이다. 에이전트가 바로 집을 주 흐름 작업은 없다.

T-083 경과는 `LOG.md` 맨 위 항목, T-069 경과는 그 아래 항목, 계획 본문은 `docs/tasks/plans/T-069-external-communication-slice.md` 에 있다.

## 지금 확정된 상태

| 항목 | 상태 |
| --- | --- |
| 개념 데이터 모델 `docs/21` | **승인·동결** (T-076). T-081 에서도 변경 0건 |
| 논리 DB 설계 `docs/22` + 작업표 | **rev.2.4** (T-081 DONE 위에 Q-44·Q-45 반영). **MVP 52 · Next 1 · MVP 에서 만들지 않음 2 = 55**(변화 없음) · 작업표 블록 53 · **컬럼 587** · 흐름 검증 **64개 PASS** |
| Event·State 정합성 | `docs/05` 4.2 ↔ `docs/22` 대응 **누락 0건**(`docs/22` 23.1). ADR-020 상태 차원 복구. `docs/05` 머리의 "결정 대기" 해소 |
| 출처 어휘 | **`source_type` 7값 · `source_role` · `extraction_method` 3축**(사용자 결정 C). **Q-46 은 OPEN** |
| 런타임·오류 처리·관측성 `docs/23` | 정본. ADR-030 **Proposed** · ADR-031 은 Desktop·Web First 부분만 Proposed(결정 1·2·8 은 ADR-033 이 대체) |
| Backend 언어 | **결정 — Main Backend = TypeScript + NestJS**(모듈형 모놀리스, API + Worker) · **AI Server = 별도 Python 런타임**(권한 없음, HTTP/JSON). **ADR-033 Accepted**, ADR-002 Superseded, Q-64 CLOSED |
| DB · ORM · 마이그레이션 | **미결 — Q-68 (T-084, 다음)** |

## Baseline

| 항목 | 값 |
| --- | --- |
| branch | `main` |
| 최신 커밋 | T-083 커밋 (`git log -1` 이 정본). 그 전: `cad92ed` (T-069) |
| remote | 없음 (push 한 적 없음). **이 PC가 유일한 사본이다** |
| working tree 의 다른 작업 | `front/web/` 12개 파일(Antigravity 디자인 작업) · untracked `data/Proposal/` · `scripts/` — **이 흐름의 작업이 아니다. 수정·스테이징·커밋하지 않는다** |
| last updated | 2026-09-21 |
| current orchestrator | 없음 (IDLE). 직전: Claude Code (claude-opus-5) — T-083 문서 반영 |

## 다음 한 걸음

1. ~~T-083 — Q-64~~ **DONE (NestJS + TypeScript, ADR-033)**
2. **T-084 — Q-68 DB 제품·접근 방식·마이그레이션 도구 결정**(사용자, `NEEDS_HUMAN`) ← **다음**. 기준: 계획 16.2 · 이제 TypeScript 위에서 고른다
3. **T-080 — P0 29개 물리 설계**(T-084 뒤에만 실행 가능)
4. **T-085 ~ T-096 — U0 ~ U11 구현**(T-080 DONE 뒤에만). Q-65(솔버)는 어느 단계도 막지 않는다

## 다음 Orchestrator 가 먼저 알아야 할 것

- **Main Backend(NestJS)가 모든 권한을 갖고, Python AI Server 는 권한이 없다**(ADR-033). AI Server 는 DB·발송·사건·사실·승인을 하지 않고, 가진 외부 클라이언트는 LLM 공급자뿐이며, 출력은 후보다. `back/` 와 `ai/` 는 코드를 공유하지 않고 HTTP 계약으로만 만난다
- **솔버(Q-65)는 NestJS 결정과 별개다.** TypeScript 로 강제하지 않고, PlanningSnapshot 계약 뒤에 나중에 붙인다
- **`docs/21` 7절이 Event 속성의 정본을 `docs/05` 4.2 로 위임**해 두었다. Event 필드를 바꿀 때는 `docs/22` 23.1 대응표를 함께 고친다
- **`ADR-017` 은 `Proposed`** 다. 사람 확인 사건의 근거는 승인된 `docs/21` 9절·12.2 와 `docs/20` A-17(근거 ADR-028 Accepted) · ADR-020 Accepted 다
- **확인 사건 하나 = 현재 사실 좌표 하나**(I-26). 여러 사실을 한 번에 확인하려면 확인 사건도 여러 건이다
- `decision_usability` 는 **저장하지만 원천이 아니다**(I-24). 과거 판정은 스냅샷의 네 차원 + `rule_version` + `policy_version` 으로 재현한다(I-27)
- **개수는 추측하지 말고 다시 센다.** 정본은 `docs/22` 2절, 작업표 `00_목록` 시트
- **T-082(P2)**: 시나리오 fixture 의 `event_type` 3개가 `docs/05` 4.4 카탈로그에 없다. 프론트 트랙과 조율 필요. 주 흐름을 막지 않는다
- **지난 계획 기준 회신**은 사건·현재 사실 후보가 되지만 현재 계획에 자동 반영되지 않는다 — 보장은 계획 불변 · 자동 재최적화 없음 · 스레드 안 질문 매핑이다. **범위(L-13)와 다른 축**이다(계획 4.3)
- **사건 생성을 사람이 승인하는 게이트는 없다.** 사람 확인은 잠정 사실을 확인·기각하는 단계다
- **메일 내용은 기록 행에 직접 넣지 않는다**(`docs/22` 29절 · 안티패턴 11). 원문·본문·인용·승인 문장·조건 원문은 참조 + 지문이다. 파기는 행을 지우거나 고치지 않는다
- **내용 부재 ≠ 파기.** 성공한 `CONTENT_PURGED` 감사가 있어야 정상 파기이고, 없으면 데이터 손실(`system_error`)이다(I-34)
- **재현성 ≠ 원문 재처리 능력.** 원문이 파기돼도 재계산·스냅샷 재현·감사는 된다. 안 되는 것은 원문에서 다시 추출하는 것뿐이다(`docs/20` A-05 는 "원문이 보관된 동안" 보장)

## 남은 OPEN 질문 (답하는 시점)

| # | 무엇 | 언제 |
| --- | --- | --- |
| Q-45 (기간) | 보관 범주별 **실제 보관 기간 숫자** · 연락처 익명화·법적 보관 의무 `[TO VERIFY]` | **Pilot 정책** (고객사 IT · 계약 · 보안·감사 · 법률 검토) |
| Q-44 후속 | Gmail `internalDate` 의 정확한 의미 `[TO VERIFY]` | Tech Validation |
| Q-46 | 상대방 직접 입력의 Source 모델(`actor_type` 신설 여부 포함) | 권한 모델과 함께 |
| Q-34 | `payload.change_reason` 값 목록 | T-037 · 인터뷰 |
| **Q-68** | **DB 제품 · 접근 방식 · 마이그레이션 도구**(2026-09-21 신규) | **다음 — T-084 사용자 결정**(Q-64 CLOSED) — **T-080 선행** |
| Q-65 | 솔버 실행 위치·언어 | T-036 재개 뒤. PlanningSnapshot 계약으로 붙인다 — Slice 1 blocker 아님 |
| Q-66 | `system_error` 오류 분류·코드 목록 | T-069 · 구현 |
| Q-67 | 로그 저장소·관측 제품 | 첫 배포 환경을 정할 때 |
| L-14 · L-15 · L-16 | 적용 범위 값·선택 정책 · `message_kind` 값 · `bl` 유일 제약 | 현업 검증 · 필요 시 · 실데이터 확인 |
