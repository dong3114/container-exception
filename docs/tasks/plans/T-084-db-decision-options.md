# T-084 — Q-68 DB 기술 결정: 비교 결과 (결정 완료 — Option A)

- 상태: **결정 완료 (2026-09-22, 사용자 결정 — Option A).** 비교 작성 2026-09-21, Claude Code. **결정의 정본은 ADR-034** 이고, 이 문서는 선택지를 비교한 기록으로 남는다
- **결정**: **PostgreSQL + Drizzle ORM(SQL-aware Hybrid) + drizzle-kit 이 만든 SQL migration 을 사람이 검토·저장소에 기록한 뒤 명시 적용.** SQLite 는 쓰지 않는다(ADR-004 Superseded). DB 권한·스키마·migration 은 Main Backend 만. 운영 자동 동기화·`push` 정본 사용 금지. Prisma · Kysely · TypeORM · MikroORM 은 후보 제외. `docs/15` Q-68 CLOSED
- **주의 — 4절은 확정이 아니다.** 4절의 방향 제안(BIGINT = TS number, advisory lock + `SKIP LOCKED`, 트리거를 Slice 1 부터 등)은 **사용자 결정에 포함되지 않았다.** 그 항목들은 T-080 / U0 에서 비교해 정한다(ADR-034 결정 8~11). 5절 Option A 의 "트리거·권한은 custom migration" 도 append-only 차단 **수단**을 정한 것이 아니다 — 수단은 T-080 에서 비교한다(ADR-034 결정 9)
- 기준: HEAD `12a849a` · ADR-033(Main Backend = TypeScript + NestJS) · T-069 계획 12절(T1~T12) · 16.1 · 16.2 · `docs/22` rev.2.4
- 결정 범위: A. DB 제품 · B. NestJS DB 접근 방식 · C. Migration 방식. **정하지 않는 것**: DDL · 인덱스 이름 · 물리 타입 세부 · 풀 크기 · 배포 구성 · HA · 클라우드 · 백업 · 관측 · 큐 · 내용 저장소 제품 → T-080 / U0
- Python AI Server 는 DB 에 연결하지 않는다(ADR-033). Python DB 라이브러리는 고르지 않는다

## 1. CERA 가 DB 에 요구하는 것 (근거)

- `APPEND_ONLY` 표 다수: `event` · `event_verification_target` · `message_approval` · `plan_decision` · `operator_planning_constraint` · `system_error` 등(`docs/22` 변경 방식 표)
- **결과 컬럼 1회 갱신**: `send_attempt` · `extraction`(생성 내용 불변 + 정해진 결과만 한 번)
- **진짜 부분 유일 최소 2곳**: 컨테이너당 `PRIMARY` B/L 1건(`docs/22` 604) · 사건당 `SUBJECT` 1건(1157). `invalidates_approval_id` · `releases_constraint_id` 는 NULL 허용 일반 UNIQUE 로 충분
- 트랜잭션 T1~T12, 특히 **T5 발송 시도 선커밋**(외부 호출 전 커밋)
- 멱등 키 UNIQUE + "충돌만 무시" · DB Outbox 단일 워커 폴링 · JSON(`payload`) · 타임존 시각 · 원 정수 `BIGINT` · 로컬 → 운영 같은 방언

## 2. DB 제품 비교

| 기준 | PostgreSQL | MySQL 8 | SQLite |
| --- | --- | --- | --- |
| 무결성 | 강함 | 보통(우회) | 약함(동적 타입, STRICT 아니면) |
| transaction | ACID · **DDL 도 트랜잭션** | ACID · **DDL 은 암묵 커밋** | ACID · 쓰기 1개 |
| 부분 유일 | partial unique index 등으로 구현 가능 | 없음 → 생성 컬럼 + UNIQUE 우회 | partial index 로 구현 가능 |
| 멱등 삽입 | `ON CONFLICT DO NOTHING`(UNIQUE 충돌만) | `INSERT IGNORE` 는 다른 오류도 삼킴 — 위험 | `ON CONFLICT` |
| JSON | `jsonb` | JSON | JSON 함수 |
| timezone | `timestamptz`(UTC 시점, 원 오프셋 버림) | TIMESTAMP 2038 한계·세션 tz 의존 / DATETIME tz 없음 | 전용 타입 없음 |
| worker/outbox | `FOR UPDATE SKIP LOCKED` + advisory lock | SKIP LOCKED + `GET_LOCK` | 없음 |
| append-only | 트리거 + GRANT/REVOKE | 트리거(권한은 약함) | 트리거만 |
| local dev | 설치 필요 | 설치 필요 | 파일 하나 |
| 운영 migration | 안전(트랜잭션 DDL) | 부분 실패 위험 | 운영 부적합 |

- **추천 DB: PostgreSQL — 로컬 · 시험 · 운영 모두 같은 것.**
- SQLite: 운영 부적합. 로컬 전용도 비권장 — 잠금·타입·시각 의미가 달라 Outbox·멱등 시험이 PostgreSQL 에서의 통과를 보장하지 못한다. "SQLite → PostgreSQL"(ADR-004 Proposed)은 T-080 물리 설계·트리거·migration 을 두 번 하게 만든다
- MySQL: CERA 요구에서 PostgreSQL 보다 나은 점이 없다. 고객 인프라가 MySQL 만 허용할 때만 재검토 `[ASSUMPTION: 그런 제약은 아직 없음]`

## 3. NestJS DB 접근 도구

| 기준 | Prisma | Drizzle | Kysely | TypeORM | MikroORM |
| --- | --- | --- | --- | --- | --- |
| transaction | interactive tx | 명시적 | 명시적 | 있음 | Unit of Work(암묵 flush) |
| DB 고유 기능 | 부분 인덱스 **preview**(v7.4, `partialIndexes`) · SKIP LOCKED/트리거는 raw | 부분 인덱스 `.where()` · CHECK · `for('update',{skipLocked})` | `forUpdate().skipLocked()` · raw | 일부 | 일부 |
| raw SQL | `$queryRaw` | `sql` 템플릿 | `sql` | query | em.execute |
| migration | Prisma Migrate(`--create-only` 로 SQL 수정) | drizzle-kit generate → SQL 파일, `--custom` 으로 트리거 | 손으로 up/down(kysely-ctl), 자동 diff 없음 | 생성/`synchronize` 위험 | schema diff |
| type safety | 높음 | 높음(TS 스키마) | 높음(DB → codegen) | 약함 | 보통 |
| BIGINT | 항상 JS `BigInt` | 컬럼별 `mode:'number'|'bigint'` | pg 기본 문자열 | 문자열(`parseInt8` 불일치 보고) | bigint/string/number 선택 |
| NestJS | 공식 레시피 | 공식 모듈 없음(직접 provider) | 공식 모듈 없음 | 공식 모듈 | 공식 모듈 |
| CERA 적합 | 조건부 | **높음** | 높음(수고 큼) | **제외** | **제외** |

- TypeORM 제외: `synchronize` 사고 위험 · BIGINT 문자열 · `save` 가 암묵 UPDATE · 타입 약함
- MikroORM 제외: 변경 추적이 flush 때 UPDATE 를 자동 생성 → append-only · T5 선커밋과 충돌 · 학습 비용
- 접근 방식 판단: Full ORM 은 핵심 경로에서 결국 raw SQL 로 빠지고 암묵 동작이 AI Coding Agent 실수를 숨긴다 → **SQL-first 쪽 Hybrid**(스키마·타입 한 곳, 모든 쓰기는 명시 쿼리, 트리거·권한·잠금은 SQL)

## 4. 방향 제안 (참고 — **확정 아님**, T-080 / U0 에서 결정)

- **Migration**: 운영에서 자동 동기화(`push` · `synchronize` · `db push`) 금지. 커밋·검토된 migration 파일만 적용
- **Append-only 강제**: ① 앱 저장소는 insert 만 ② **DB 트리거**로 UPDATE·DELETE·TRUNCATE 거부 + 결과 컬럼 "NULL → 값 1회" 트리거 — **Slice 1 부터** ③ 앱/migration 계정 권한 분리 — 시기는 T-080/U0
- **Outbox**: advisory lock 으로 단일 워커 보장 + `FOR UPDATE SKIP LOCKED` 폴링. 워커가 죽으면 잠금 자동 해제 → 재기동 안전. 다중 워커로 그대로 확장. 큐 제품 불필요
- **BIGINT**: KRW 는 `Number.MAX_SAFE_INTEGER` 안 → DB `BIGINT` + TS number + 안전 정수 검사가 가장 단순. JS `BigInt` 는 `JSON.stringify` 에서 오류 → 쓰면 직렬화 계층 필요
- **Timezone**: `timestamptz` 는 원 오프셋을 버림 → 원문은 이미 `event.payload`(Gmail Date/internalDate) + `tz_assumed` 로 보존. **node-postgres 는 `Date` 로 바꾸며 µs → ms 로 자름** → 정밀도 ms 로 맞추거나 string 모드. T-080/U0 결정

## 5. 사용자 선택지 — **선택: Option A** (2026-09-22)

- **Option A (추천)**: **PostgreSQL + Drizzle(SQL-first Hybrid) + drizzle-kit 생성 SQL migration 검토·커밋, 트리거·권한은 custom migration, 운영 `push` 금지**
  - 좋은 점: TS 스키마 한 곳 → 타입·migration SQL. 부분 유일(partial unique index `.where()`)·CHECK·SKIP LOCKED·BIGINT number 모드를 스키마·쿼리에서 표현 가능. 코드 양 적당
  - 단점: ORM 편의 포기 · SQL 지식 필요 · NestJS provider·트랜잭션 전달 직접 작성 · 자동 diff 검토 필수(rename 등) · `push` 금지 장치 필요 · 버전 변화 추적 `[TO VERIFY: 1.0 정식 여부]`
- **Option B**: **PostgreSQL + Kysely + 손으로 쓴 migration(kysely-ctl) + DB 에서 타입 생성(kysely-codegen)** — 가장 명시적, 가장 수고로움. `[TO VERIFY: 옛 skipLocked 순서 버그 #614 해결 여부]`
- **Option C**: **PostgreSQL + Prisma + Prisma Migrate(`--create-only` 로 SQL 검토), 잠금·트리거는 raw SQL** — CRUD 가장 편함. 부분 인덱스 preview(VARCHAR 조건 drift 버그 #29415) · BIGINT 항상 BigInt · v7 설정 변화 `[TO VERIFY]`

## 6. 선택 뒤 할 일 — **모두 완료 (2026-09-22, 최종 승인 · 커밋)**

1. 사용자가 A/B/C 중 선택(또는 수정)
2. ADR 추가(Accepted) · ADR-004 처리(SQLite 부분 Superseded) · `docs/15` Q-68 CLOSED · `docs/07` 3절 DB 줄 · `docs/23` 13절 · T-069 계획 16.4 · AGENTS · QUEUE(T-084 DONE, T-080 실행 가능) · CURRENT · LOG
3. 검증 → 사용자 승인 → 커밋. 그다음 T-080(P0 29개 물리 설계)

## 7. T-080 으로 넘길 것

실제 DDL·타입·인덱스 이름 · 부분 유일 목록 최종 확인 · append-only / 1회 갱신 트리거 SQL · 권한 분리 시기 · 시각 정밀도 · BIGINT 매핑 규칙 · advisory lock 키 규칙 · 시험 격리(스키마 분리/트랜잭션 롤백) · 로컬 PostgreSQL 설치 방식(`[TO VERIFY]` PGlite 호환) · NestJS 연결 구조(U0)

## 출처

- Prisma Indexes v7: https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/indexes · v7.4 changelog: https://www.prisma.io/changelog/2026-02-11 · issue #29415: https://github.com/prisma/orm/issues/29415
- Drizzle: https://orm.drizzle.team/docs/column-types/pg · https://orm.drizzle.team/docs/indexes-constraints · https://orm.drizzle.team/docs/kit-custom-migrations · https://orm.drizzle.team/docs/select
- Kysely: https://kysely.dev/docs/migrations · issue #614: https://github.com/kysely-org/kysely/issues/614
- MikroORM: https://mikro-orm.io/docs/custom-types
- TypeORM: https://github.com/typeorm/typeorm/issues/8583 · https://github.com/typeorm/typeorm/issues/11057
