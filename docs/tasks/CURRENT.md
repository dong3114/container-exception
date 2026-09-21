# CERA Current Task

> 지금 진행 중인 작업 **하나**의 인수인계 문서다. Claude와 Codex 중 누가 이어받든 이 파일에서 시작한다.
> 예정 작업은 `QUEUE.md`, 끝난 작업은 `LOG.md`에 있다. 사용법: `docs/17_ai-development-workflow.md` 5·6절.
> 대화 내용을 옮겨 적지 않는다. 결정된 것, 진행 상태, blocker, 다음 한 걸음만 남긴다.

상태 값: `IDLE` · `DESIGNING` · `PLANNING` · `AWAITING_APPROVAL` · `IMPLEMENTING` · `REVIEWING` · `DOC_SYNC` · `COMMIT_READY`

---

## Status

**IDLE** — **Q-44 · Q-45 Decision Closure DONE (2026-09-21, 사용자 최종 승인).** 진행 중인 Task 는 없다. **다음 작업은 T-069**(아직 착수 전 — 착수하는 Orchestrator 가 이 파일에 Task Brief 를 채운다). T-069 를 막는 사용자 결정은 없다.

| 결정 | 상태 |
| --- | --- |
| **Q-44** 메일 근거 시각 | **CLOSED** — `Date` 가 채널 수신 시각보다 미래가 아니면 `Date`, 아니면 채널 수신 시각 + 거부 표시. 원래 두 시각은 `event.payload` (`docs/22` 11.2e) |
| **Q-45** 메일 보관·파기 | **구조·파기 방식 CLOSED** — 기록과 내용 분리, 행 삭제 ≠ 내용 파기, 참조 + 지문, 파기 감사 (`docs/22` 29절). **기간 숫자는 OPEN(Pilot 정책)** |

T-081 경과는 `LOG.md` 2026-09-21 항목에 있다.

## 지금 확정된 상태

| 항목 | 상태 |
| --- | --- |
| 개념 데이터 모델 `docs/21` | **승인·동결** (T-076). T-081 에서도 변경 0건 |
| 논리 DB 설계 `docs/22` + 작업표 | **rev.2.4** (T-081 DONE 위에 Q-44·Q-45 반영). **MVP 52 · Next 1 · MVP 에서 만들지 않음 2 = 55**(변화 없음) · 작업표 블록 53 · **컬럼 587** · 흐름 검증 **64개 PASS** |
| Event·State 정합성 | `docs/05` 4.2 ↔ `docs/22` 대응 **누락 0건**(`docs/22` 23.1). ADR-020 상태 차원 복구. `docs/05` 머리의 "결정 대기" 해소 |
| 출처 어휘 | **`source_type` 7값 · `source_role` · `extraction_method` 3축**(사용자 결정 C). **Q-46 은 OPEN** |
| 런타임·오류 처리·관측성 `docs/23` | 정본. ADR-030·031 **Proposed** — 기술 최종 결정 아님 |
| Backend 언어 | **미결**(Q-64). 현재 우선 후보 NestJS + TypeScript |

## Baseline

| 항목 | 값 |
| --- | --- |
| branch | `main` |
| 최신 커밋 | Q-44·Q-45 Decision Closure 커밋 (`git log -1` 이 정본). 그 전: `c16e1d7` (T-081) |
| remote | 없음 (push 한 적 없음). **이 PC가 유일한 사본이다** |
| working tree 의 다른 작업 | `front/web/` 12개 파일(Antigravity 디자인 작업) · untracked `data/Proposal/` · `scripts/` — **이 흐름의 작업이 아니다. 수정·스테이징·커밋하지 않는다** |
| last updated | 2026-09-21 |
| current orchestrator | 없음 (IDLE). 직전: Claude Code (claude-opus-5) — Q-44·Q-45 Decision Closure |

## 다음 한 걸음

1. **T-069 외부 통신 구현 계획** — ~~Q-44 · Q-45 먼저 묻기~~(**2026-09-21 결정됨**). 계획 안에서 **L-13 복구 맥락 식별자**(후보: 최초 `recovery_run` · 최초 계기 사건 · 컨테이너 집합 지문 · 별도 안정 id — **ExceptionCase 는 다시 만들지 않는다**)와 **첫 실제 구현 범위(어느 표부터)** 를 정한다
2. **Backend · DB 기술 선택** — 사용자(Q-64 · Q-65). T-069 가 정한 첫 범위를 보고 정한다
3. **T-080 물리 설계** — 결정된 기술을 **첫 범위에 필요한 표만**. T-081 이 넘긴 것(멱등 키 직렬화·해시·주장 위치 형식, `schema_version` 형식, JSON 구조 세부)이 여기서 닫힌다

## 다음 Orchestrator 가 먼저 알아야 할 것

- **`docs/21` 7절이 Event 속성의 정본을 `docs/05` 4.2 로 위임**해 두었다. Event 필드를 바꿀 때는 `docs/22` 23.1 대응표를 함께 고친다
- **`ADR-017` 은 `Proposed`** 다. 사람 확인 사건의 근거는 승인된 `docs/21` 9절·12.2 와 `docs/20` A-17(근거 ADR-028 Accepted) · ADR-020 Accepted 다
- **확인 사건 하나 = 현재 사실 좌표 하나**(I-26). 여러 사실을 한 번에 확인하려면 확인 사건도 여러 건이다
- `decision_usability` 는 **저장하지만 원천이 아니다**(I-24). 과거 판정은 스냅샷의 네 차원 + `rule_version` + `policy_version` 으로 재현한다(I-27)
- **개수는 추측하지 말고 다시 센다.** 정본은 `docs/22` 2절, 작업표 `00_목록` 시트
- **T-082(P2)**: 시나리오 fixture 의 `event_type` 3개가 `docs/05` 4.4 카탈로그에 없다. 프론트 트랙과 조율 필요. T-069 를 막지 않는다
- **메일 내용은 기록 행에 직접 넣지 않는다**(`docs/22` 29절 · 안티패턴 11). 원문·본문·인용·승인 문장·조건 원문은 참조 + 지문이다. 파기는 행을 지우거나 고치지 않는다
- **내용 부재 ≠ 파기.** 성공한 `CONTENT_PURGED` 감사가 있어야 정상 파기이고, 없으면 데이터 손실(`system_error`)이다(I-34)
- **재현성 ≠ 원문 재처리 능력.** 원문이 파기돼도 재계산·스냅샷 재현·감사는 된다. 안 되는 것은 원문에서 다시 추출하는 것뿐이다(`docs/20` A-05 는 "원문이 보관된 동안" 보장)

## 남은 OPEN 질문 (답하는 시점)

| # | 무엇 | 언제 |
| --- | --- | --- |
| Q-45 (기간) | 보관 범주별 **실제 보관 기간 숫자** · 연락처 익명화·법적 보관 의무 `[TO VERIFY]` | **Pilot 정책** (고객사 IT · 계약 · 보안·감사 · 법률 검토) |
| Q-44 후속 | Gmail `internalDate` 의 정확한 의미 `[TO VERIFY]` | Tech Validation |
| L-13 | 복구 맥락 식별자 | T-069 |
| Q-46 | 상대방 직접 입력의 Source 모델(`actor_type` 신설 여부 포함) | 권한 모델과 함께 |
| Q-34 | `payload.change_reason` 값 목록 | T-037 · 인터뷰 |
| Q-64 | Backend 언어·프레임워크 | T-069 뒤 사용자 결정 |
| Q-65 | 솔버 실행 위치·언어 | T-036 재개 뒤, Q-64 와 함께 |
| Q-66 | `system_error` 오류 분류·코드 목록 | T-069 · 구현 |
| Q-67 | 로그 저장소·관측 제품 | 첫 배포 환경을 정할 때 |
| L-14 · L-15 · L-16 | 적용 범위 값·선택 정책 · `message_kind` 값 · `bl` 유일 제약 | 현업 검증 · 필요 시 · 실데이터 확인 |
