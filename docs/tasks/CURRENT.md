# CERA Current Task

> 지금 진행 중인 작업 **하나**의 인수인계 문서다. Claude와 Codex 중 누가 이어받든 이 파일에서 시작한다.
> 예정 작업은 `QUEUE.md`, 끝난 작업은 `LOG.md`에 있다. 사용법: `docs/17_ai-development-workflow.md` 5·6절.
> 대화 내용을 옮겨 적지 않는다. 결정된 것, 진행 상태, blocker, 다음 한 걸음만 남긴다.

상태 값: `IDLE` · `DESIGNING` · `PLANNING` · `AWAITING_APPROVAL` · `IMPLEMENTING` · `REVIEWING` · `DOC_SYNC` · `COMMIT_READY`

---

## Status

**IDLE** — **T-085 (U0 Backend Foundation) DONE** (2026-09-23 최종 검토·커밋, Claude Code). 진행 중인 Task 는 없다. **다음은 T-086(U1)** 이고 실행 가능하다. 아직 시작하지 않았다.

T-085 경과는 `LOG.md` 맨 위 항목. Backend 뼈대 정본은 `back/`(구조는 `back/README.md`), 로컬 DB 는 `infra/local/`, 명령은 `AGENTS.md` 6절.

- **다음 세션 시작 순서**: ① Docker Desktop 켜기(꺼져 있으면 DB 시험 불가) ② `docker compose -f infra/local/compose.yaml --env-file infra/local/.env up -d --wait` ③ `cd back && npm test`(61 통과 확인) ④ T-086(U1) 착수
- 로컬 비밀번호는 `infra/local/.env` · `back/.env`(둘 다 gitignore, 이 PC 에만 있음). 지우면 `.env.example` 로 다시 만들고 DB 볼륨도 `down -v` 로 초기화해야 한다
- **U0 가 남긴 것**: 제품 스키마 `back/src/db/schema/index.ts` 는 비어 있다 · 제품 migration `back/drizzle/` 은 아직 없다(U1 첫 migration 과 함께 생긴다) · `system_error` 기록은 U1 에 `ApiErrorFilter` 로 붙인다 · drizzle-kit 개발 의존성 moderate 4건은 **dev 전용**(`npm audit --omit=dev` = 0건)이라 판 유지

## 지금 확정된 상태

| 항목 | 상태 |
| --- | --- |
| 개념 데이터 모델 `docs/21` | **승인·동결** (T-076). T-081 에서도 변경 0건 |
| 논리 DB 설계 `docs/22` + 작업표 | **rev.2.5** (T-080 검토로 발송 시도·한 번 채움·INBOUND 정리. 그 전 rev.2.4 = Q-44·Q-45). **MVP 52 · Next 1 · MVP 에서 만들지 않음 2 = 55**(변화 없음) · 작업표 블록 53 · **컬럼 587** · 흐름 검증 **64개 PASS** |
| Event·State 정합성 | `docs/05` 4.2 ↔ `docs/22` 대응 **누락 0건**(`docs/22` 23.1). ADR-020 상태 차원 복구. `docs/05` 머리의 "결정 대기" 해소 |
| 출처 어휘 | **`source_type` 7값 · `source_role` · `extraction_method` 3축**(사용자 결정 C). **Q-46 은 OPEN** |
| 런타임·오류 처리·관측성 `docs/23` | 정본. ADR-030 **Proposed** · ADR-031 은 Desktop·Web First 부분만 Proposed(결정 1·2·8 은 ADR-033 이 대체) |
| Backend 언어 | **결정 — Main Backend = TypeScript + NestJS**(모듈형 모놀리스, API + Worker) · **AI Server = 별도 Python 런타임**(권한 없음, HTTP/JSON). **ADR-033 Accepted**, ADR-002 Superseded, Q-64 CLOSED |
| 물리 설계 `docs/24` | **승인 (T-080 DONE 2026-09-22)**. 논리 기준 `docs/22` rev.2.5 · P0 29표 · 349컬럼 |
| DB · ORM · 마이그레이션 | **결정 — PostgreSQL + Drizzle ORM(SQL-aware Hybrid) + drizzle-kit 검토 SQL migration**, SQLite 미사용. **ADR-034 Accepted**, ADR-004 Superseded, Q-68 CLOSED (2026-09-22). 비교 기록 `plans/T-084-db-decision-options.md` |

## Baseline

| 항목 | 값 |
| --- | --- |
| branch | `main` |
| 최신 커밋 | T-085 커밋 (`git log -1` 이 정본). 그 전: `8f9d2bf` (T-080) |
| remote | 없음 (push 한 적 없음). **이 PC가 유일한 사본이다** |
| working tree 의 다른 작업 | `front/web/` 12개 파일(Antigravity 디자인 작업) · untracked `data/Proposal/` · `scripts/` — **이 흐름의 작업이 아니다. 수정·스테이징·커밋하지 않는다** |
| last updated | 2026-09-23 |
| current orchestrator | 없음 (IDLE). 직전: Claude Code (claude-opus-5) — T-085 U0 |

## 다음 한 걸음

1. ~~T-083 — Q-64~~ **DONE (NestJS + TypeScript, ADR-033)**
2. ~~T-084 — Q-68~~ **DONE (PostgreSQL + Drizzle ORM + drizzle-kit 검토 SQL migration, ADR-034)**
3. ~~T-080 — P0 29개 물리 설계~~ **DONE (`docs/24`, `docs/22` rev.2.5)**
4. ~~T-085 — U0 Backend 뼈대~~ **DONE (`back/` · `infra/local/`, `docs/24` 18.1)**
5. **T-086 ~ T-096 — U1 ~ U11 구현** ← **다음: T-086(U1)**. U1 이 할 일은 P0 29표 Drizzle 스키마 · migration M01~M10(생성 SQL 사람 검토 → 커밋 → `db:migrate`) · 시드 · 감사/오류 기록기 · 내용 저장소 포트. Q-65(솔버)는 어느 단계도 막지 않는다

## 다음 Orchestrator 가 먼저 알아야 할 것

- **Main Backend(NestJS)가 모든 권한을 갖고, Python AI Server 는 권한이 없다**(ADR-033). AI Server 는 DB·발송·사건·사실·승인을 하지 않고, 가진 외부 클라이언트는 LLM 공급자뿐이며, 출력은 후보다. `back/` 와 `ai/` 는 코드를 공유하지 않고 HTTP 계약으로만 만난다
- **`docs/22` rev.2.5 는 사용자 검토 결과(Q-69)로 고친 최소 변경이다** — 새 표·새 컬럼 0, `docs/21` 0. 22절 표·작업표는 scratchpad 생성기로 만들었고(저장소에 없음) 23절 대응 검사는 `docs/22` 작업표를 다시 읽어 349/349 를 확인했다
- **DB 는 PostgreSQL 하나다(ADR-034).** SQLite 로 개발하지 않는다. Drizzle 을 쓰지만 Full ORM 이 아니다 — Outbox · 멱등 · 부분 유일 · 잠금 · append-only · 핵심 트랜잭션은 PostgreSQL 의미를 드러내 쓰고, DB 가 지킬 수 있는 불변식을 앱 코드로만 흉내 내지 않는다. migration 은 drizzle-kit 생성 SQL 을 사람이 검토·커밋한 뒤에만 적용한다
- **부분 유일은 PostgreSQL 의 UNIQUE 제약 자체가 아니라 partial unique index 등으로 구현한다** — 실제 index SQL 은 T-080
- **T-084 비교 문서 4절(BIGINT = number, advisory lock + SKIP LOCKED 등)은 확정이 아니다.** T-080 에서 비교해 정한다
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
| Q-65 | 솔버 실행 위치·언어 | T-036 재개 뒤. PlanningSnapshot 계약으로 붙인다 — Slice 1 blocker 아님 |
| Q-66 | `system_error` 오류 분류·코드 목록 | T-069 · 구현 |
| Q-67 | 로그 저장소·관측 제품 | 첫 배포 환경을 정할 때 |
| L-14 · L-15 · L-16 | 적용 범위 값·선택 정책 · `message_kind` 값 · `bl` 유일 제약 | 현업 검증 · 필요 시 · 실데이터 확인 |
