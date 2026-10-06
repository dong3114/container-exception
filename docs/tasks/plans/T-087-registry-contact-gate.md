# T-087 구현 계획 — U2 Registry · Contact Gate · 개발 안전장치

- 상태: **DONE (2026-10-06 커밋)** — 승인 (작성 2026-10-06 Claude Code · **사용자 결정 2026-10-06: D1~D4 권장안 채택, D5 기본안(추가)**)
- 기준: HEAD `17399b8` · T-069 계획 6절 A · 11.2 · 10.1 `GetContactEligibility` · 10.3 · 14.2 G-01~05 · 20절 U2 · `docs/18` D.5 · G.5 · `docs/19` FR-ELG-01~06 · FR-CPY-11 · `docs/24` 12 · 22절 · ADR-028 · ADR-029 · ADR-033 · ADR-034
- 성격: HOW. WHAT/WHY 는 `docs/tasks/CURRENT.md` Task Brief

---

## 1. 무엇을 만드나 (한 장)

```
seed 등록부 ──► RegistryReader(+조회 2개) ──► ContactGate.evaluate()  ◄── 순수 함수(DB·네트워크·LLM import 없음)
                                                │       ▲
                                                │       └── DevSafetyPolicy(APP_ENV · CERA_TEST_RECIPIENT_ALLOWLIST)
                                                ▼
                         GET /registry/counterparties                    (주소마다 자격 요약 — FR-CPY-11)
                         GET /registry/addresses/{addressId}/eligibility (조건별 통과/실패 · 사유 코드 — FR-ELG-04)
                                                ▼
                                   OpenAPI 스키마 → packages/contracts/openapi.json
```

U2 는 **읽기 + 판정**만 한다. 등록부 쓰기(등록 · 확인 메일 · 관계 승인 · 통신 중지)와 승인 · 발송 시점의 게이트 호출은 다음 단위(U4 · U5)가 이 판정 함수를 부른다.

## 2. 판정 — `ContactGate` (순수 함수)

### 2.1 입력 · 출력

```ts
evaluate(input: {
  counterparty: { isActive: boolean };
  contact: { isActive: boolean };
  address: { channelType: 'GMAIL' | 'MOCK' | 'PORTAL'; normalizedAddress: string;
             emailVerificationStatus; relationshipStatus; communicationStatus };
}, safety: DevSafetyPolicy) => {
  eligible: boolean;
  conditions: { condition: ConditionCode; passed: boolean }[];   // 6조건 — 항상 전부 돌려준다
  reasons: { code: ReasonCode; layer: 'PRODUCT_RULE' | 'DEV_SAFETY' }[];  // 막힌 것 전부(첫 하나만 아님)
}
```

### 2.2 6조건(FR-ELG-01) → 데이터 → 사유 코드

| # | 조건(FR-ELG-01) | 데이터 | 실패 코드 |
| --- | --- | --- | --- |
| ① | 거래처 활성 | `counterparty.is_active` | `COUNTERPARTY_INACTIVE` |
| ② | 담당 연락처 활성 | `counterparty_contact.is_active` | **`CONTACT_INACTIVE`** ← 결정 D1 |
| ③ | 주소 활성 | `contact_channel_address.communication_status <> 'INACTIVE'` | `NOT_ACTIVE` |
| ④ | 주소 확인 완료 | `email_verification_status = 'VERIFIED'` | `NOT_VERIFIED` |
| ⑤ | 업무 관계 승인 | `relationship_status = 'APPROVED'` | `NOT_APPROVED` |
| ⑥ | 통신 활성 | `communication_status = 'ACTIVE'` | `NOT_ACTIVE` |
| + | 개발 안전장치(FR-ELG-05 · G.5) | 아래 2.3 | `NOT_IN_TEST_ALLOWLIST`(layer `DEV_SAFETY`) |

- 주소 표에는 `is_active` 가 없다 — ③ · ⑥ 은 같은 열(`communication_status`)을 본다. `PAUSED` 는 ③ 통과 · ⑥ 실패, `INACTIVE` 는 둘 다 실패지만 **사유 코드는 `NOT_ACTIVE` 하나**만 낸다(중복 사유 없음).
- 사유 코드는 HTTP 오류 코드가 아니라 **판정 결과 값**이다. 승인 · 발송이 막힐 때(U4 · U5) `RECIPIENT_NOT_ELIGIBLE`(403) 바디에 같은 코드를 싣는다(T-069 10.3).

### 2.3 개발 안전장치 — `DevSafetyPolicy` ← 결정 D2

| `APP_ENV` | 채널 `MOCK` | 채널 `GMAIL` · `PORTAL` (실채널) |
| --- | --- | --- |
| `local` · `test` · `staging` | 검사 안 함(밖으로 나가지 않는다) | **`CERA_TEST_RECIPIENT_ALLOWLIST` 에 있어야 통과.** 목록이 비면 **전부 차단**(fail-closed) |
| `production` | 검사 안 함 | 검사 안 함(제품 게이트만) |

- 목록은 쉼표로 나눈 정규화 주소(소문자 · 앞뒤 공백 제거). 설정 검증은 zod(`back/src/config/env.ts`), **값은 로그에 남기지 않는다**.
- 제품 게이트와 섞지 않는다: 목록에 있어도 ①~⑥ 이 실패하면 막힌다(G.5 "두 겹은 서로를 대신하지 못한다").

## 3. 등록부 불변 열 B층 가드 — M11 ← 결정 D3

**발견한 위험(T-086 U1-11 후속)**: 승인 · 발송 가드는 수신자를 **`address_id` 로** 맞춘다. `cera_app` 이 `contact_channel_address.normalized_address` 를 UPDATE 하면 **승인된 메시지가 다른 메일 주소로 나갈 수 있다**. `contact_id` 를 바꾸면 다른 거래처 연락처로 옮겨 게이트를 통과시킬 수 있다. `docs/24` 22절은 이 열들을 이미 "불변(주소 변경 = 새 행)"으로 정했지만 A층만 지킨다.

- 제안: custom migration **M11** `0010_m11_registry_guards.sql` — 기존 `fn_cera_guard_columns` 재사용(새 함수 0)
  - `contact_channel_address`: 바뀔 수 있는 열 = 3상태 · `verified_at` · `approved_by_actor_id` · `approved_at`(22절 그대로). `contact_id` · `channel_type` · `normalized_address` 불변
  - `counterparty_contact`: 바뀔 수 있는 열 = `person_name` · `team` · `note` · `is_active`. `counterparty_id` 불변
- `docs/24` 12.1 예외 목록에 두 표를 더한다(근거: 발송 수신자 · 게이트 주체를 정하는 열). `counterparty` · `facility` · `truck_pool` · `scenario` 는 그대로 A층
- 트리거 70 → 72, 함수 17 그대로

## 4. API · OpenAPI

| 메서드 · 경로 | 돌려주는 것 | 오류 |
| --- | --- | --- |
| `GET /registry/counterparties` | 거래처 → 연락처 → 주소 + **주소마다** `eligible` · `reasons` | — |
| `GET /registry/addresses/{addressId}/eligibility` | 주소 · 채널 · 6조건 통과/실패 · 사유(layer 포함) · `evaluated_at`(주입 clock, +09:00) · `is_simulated`(MOCK 채널 = true) | 404 `ADDRESS_NOT_FOUND` · 400 `INVALID_ID`(UUID 아님) |

- 응답 DTO 는 `@nestjs/swagger` 스키마로 선언해 **OpenAPI 에 실제 모양이 들어가게** 한다 → `npm run openapi:emit` → `packages/contracts/openapi.json`(DB 시험이 최신인지 검사 — 기존 장치)
- 경로 접두어는 `/registry`(전역 `/api` 접두어는 두지 않는다 — 운영 `/api` 는 리버스 프록시가 붙인다, `docs/23` 7.1)
- 인증은 아직 없다(Slice 1 범위 밖 — T-069 2절). 읽기 전용이라 감사 기록 없음

## 5. Frontend ← 결정 D4

- 권장(최소): **생성 타입만** — `openapi-typescript` 로 `packages/contracts/openapi.d.ts` 생성(스크립트 `npm run openapi:types`, 생성물 커밋) · `front/web/src/api/registry.ts` 두 함수(생성 타입 사용)
- 화면 연결은 **`/dev/api` 에 두 경로 추가까지만**. Control Tower 의 시나리오 스레드(K운송 · ODCY A · 창고 A — 시나리오 값)에 실제 시드 등록부 판정을 섞지 않는다(Mock / Real 혼합 금지). 실제 화면 연결은 U10(T-069 9절) 또는 통신 API 가 생기는 U3~U4
- 대안: Control Tower 에 "등록부 · 발송 자격 (Backend)" 카드를 따로 추가 — Real 표시를 붙여 시나리오와 분리

## 6. 시드 ← 결정 D5 (권장: 추가)

지금 시드 주소 2개는 모두 통과 상태다. 시연 · 화면 확인용으로 **막힌 주소 2개**를 더한다(local · test 만, `*.invalid`, 고정 UUIDv7, 반복 실행 안전):
- 창고 A 운영팀 주소: `UNVERIFIED` · `PENDING` · `ACTIVE` → `NOT_VERIFIED` + `NOT_APPROVED`
- K운송 두 번째 연락처 주소: 모두 통과 + `communication_status = PAUSED` → `NOT_ACTIVE`

## 7. 파일

| 영역 | 파일 |
| --- | --- |
| 판정 | `back/src/registry/contact-gate.ts`(순수) · `dev-safety.ts`(순수 — 설정값을 인자로) · `reasons.ts`(코드 목록) |
| 서비스 · API | `back/src/registry/registry.service.ts` · `registry.controller.ts` · `dto.ts` · `registry.module.ts` · `ApiModule` 에 등록 |
| 조회 | `back/src/persistence/registry-reader.ts` — 주소 한 건 + 거래처 · 연락처 활성 조회 추가 |
| 설정 | `back/src/config/env.ts` · `back/.env.example` — `CERA_TEST_RECIPIENT_ALLOWLIST` |
| migration | `back/drizzle/migrations/0010_m11_registry_guards.sql` (D3 승인 시) |
| 시드 | `back/src/seed/slice1-fixture.ts` · `slice1-seed.ts` (D5 승인 시) |
| 계약 | `packages/contracts/openapi.json` (+ `openapi.d.ts`, D4) |
| 프론트 | `front/web/src/api/registry.ts` · `src/app/dev/api/page.tsx` 프리셋 (D4) |
| 문서 | `docs/24` 12.1 · 18.3(U2 결과) · `docs/18` D.5 코드 목록(+`CONTACT_INACTIVE`, D1) · `docs/16` 4.1 · CURRENT · QUEUE · LOG |

## 8. 시험

| ID | 무엇 | 층 |
| --- | --- | --- |
| G-01 | 미확인 주소 → `NOT_VERIFIED` | Unit |
| G-02 | 관계 미승인 → `NOT_APPROVED` | Unit |
| G-03 | 통신 중지 · 비활성 → `NOT_ACTIVE`(중복 없이 하나) | Unit |
| G-04 | 거래처 비활성 → `COUNTERPARTY_INACTIVE` · 연락처 비활성 → `CONTACT_INACTIVE` | Unit |
| G-05 | 실채널 · 비운영 환경 · 목록 밖 → `NOT_IN_TEST_ALLOWLIST`(DEV_SAFETY) · 목록 비면 전부 차단 · MOCK 은 검사 안 함 · production 은 검사 안 함 · 목록 안이어도 제품 조건 실패면 차단 | Unit |
| G-a | 여러 조건 실패 → 사유 전부 · 6조건 항상 6행 | Unit |
| G-b | 판정 모듈이 DB · 네트워크 · LLM 을 import 하지 않음(소스 검사) | Unit |
| R-01 | `/registry/counterparties` 시드 → 주소마다 판정 | DB · API |
| R-02 | `/eligibility` 200 · 404 `ADDRESS_NOT_FOUND` · 400 `INVALID_ID` · 공통 오류 바디 | DB · API |
| R-03 | OpenAPI 에 두 경로 + 응답 스키마 · 계약 파일 최신 | DB |
| M-11 | (D3) `cera_app` 이 `normalized_address` · `contact_id` · `channel_type` · `counterparty_id` 변경 → CE002 · 상태 열 변경은 허용 | DB |
| 회귀 | 기존 135 + 프론트 15 · typecheck · build · lint · validate · smoke · fresh M01→M11 · seed 2회 | 전체 |

## 9. 하지 않는 것

등록부 쓰기 API · 확인 메일(D.6) · 승인 · 발송 · Outbox · 인증/권한 · 실채널(Gmail) · AI · 화면의 시나리오 스레드와 실제 판정 결합 · Contact Gate 결과 저장(판정은 매번 계산 — 승인 · 발송 시점 기록은 U4 · U5)

## 10. 결정 (2026-10-06 사용자 — 모두 권장안)

| # | 질문 | 권장 |
| --- | --- | --- |
| D1 | FR-ELG-04 의 "연락처 비활성"에 코드 `CONTACT_INACTIVE` 를 더하나(`docs/18` D.5 목록에 없음) | **더한다** — 정본(FR-ELG-01 ②) 조건을 구분해 보여주라는 요구 |
| D2 | 개발 안전장치 적용 범위 | **실채널(GMAIL · PORTAL) × 비운영 환경, 목록 비면 전부 차단. MOCK · production 은 검사 안 함** |
| D3 | M11 로 등록부 불변 열 B층 가드 | **한다** — 승인 메시지가 다른 주소로 나가는 경로 차단 |
| D4 | 프론트 범위 | **생성 타입 + api 함수 + `/dev/api` 까지**. 화면 카드는 U10 |
| D5 | 막힌 시드 주소 2개 추가 | **추가** |
