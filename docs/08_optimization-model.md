# 08. 복구 최적화 모델

- 상태: Draft (기획 v0.2) · **1단계 구현됨(T-112 · T-113 · T-114, 2026-10-26 — 검토 대기) — 실제 모델은 10절**
- 최종 수정: 2026-10-26
- 관련 ADR: ADR-007(솔버 후보 CP-SAT, **Reopened → Proposed**: 솔버는 T-036에서 CP-SAT / MILP / min-cost flow / VRP / scheduling을 비교해 결정), ADR-009(2단계 분해), ADR-006(정수 금액)
- 이 문서의 CP-SAT 언급은 모두 **현재 후보** 기준 예시다. 아래 정식화(3절)는 특정 솔버에 묶이지 않은 0-1 정수 모델로 읽는다.
- 상세 정식화 확정: T-036

---

## 1. 문제

예외(예: 창고 수용량 20 → 8)가 생겼을 때 **영향받은 여러 컨테이너**를 제한된 트럭·ODCY·창고·반출 슬롯에 나눠 배정해 **총비용을 최소화**한다.

- "Plan A/B/C 세 개의 가격 비교"가 아니다. 컨테이너들이 같은 자원을 나눠 쓰므로 한 컨테이너의 선택이 다른 컨테이너의 선택지를 바꾼다. 그래서 조합 최적화가 필요하다(`01_project-rules.md` 4절 금지 주장).
- 옵티마이저는 비용 규칙을 모른다. **비용 엔진이 미리 계산한 KRW 정수 계수**만 받는다. 그래서 "숫자는 결정론적 엔진에서만" 원칙이 지켜진다.

## 2. MVP 규모

| 항목 | 값 `[ASSUMPTION]` |
| --- | --- |
| 대상 컨테이너 | 영향받은 12대 (전체 활성 30대 중), 옵션으로 전체 |
| 계획 기간 | 48시간, 슬롯 2시간 → 24슬롯 |
| 경로 | DIRECT(창고 직송), ODCY_A, ODCY_B (+ ODCY_C), 대기(계획 기간 안에 이동 안 함) |
| 트럭 | 기본 8대 + 회신으로 추가된 대수 |
| 변수 규모 | 12 × (1 + 3 ODCY × 2 입고일) × 24 ≈ 2,000 불리언 → CP-SAT로 수 초 이내 |

규모가 커져도(50대, 72시간) 1단계 모델로 60초 안에 푸는 것이 Gate 기준이다(`12_roadmap.md`).

## 3. 1단계 정식화 (ADR-009)

```text
집합
  C      : 대상 컨테이너
  S      : 슬롯 (2시간 단위)
  D      : 계획 기간의 날짜
  O      : ODCY 후보
  경로 r : DIRECT  또는  (ODCY o, 창고 입고일 d)

변수
  x[c,DIRECT,s]   ∈ {0,1}  c를 슬롯 s에 터미널에서 반출해 창고로 직송
  y[c,o,s,d]      ∈ {0,1}  c를 슬롯 s에 반출해 ODCY o에 두었다가 날짜 d에 창고로 입고
  w[c]            ∈ {0,1}  계획 기간 안에 이동하지 않음(터미널 대기)

제약
  (1) 배정        Σ_s x[c,DIRECT,s] + Σ_{o,s,d} y[c,o,s,d] + w[c] = 1                 ∀c
  (2) 반출 가능    s < ready_slot(c) 이면 x·y = 0   (통관·D/O·예외, CONFIRMED/OBSERVED 사실 기준)
  (3) 장비 적합    경로가 c의 사이즈·타입을 받지 못하면 0 (ODCY 규격별 수용)
  (4) 트럭(1구간)  Σ_c (x[c,DIRECT,s] + Σ_{o,d} y[c,o,s,d]) ≤ Truck_s                ∀s
  (5) 트럭(2구간)  Σ_{c,o,s} y[c,o,s,d] ≤ Truck2_d   (ODCY→창고, 일 단위로 단순화)    ∀d
  (6) 반출 슬롯    Σ_c (x + y)[·,s] ≤ Slot_s   (VBS, SIMULATED)                        ∀s
  (7) ODCY 용량    날짜 t에 o에 머무는 컨테이너 수(규격별) ≤ Cap_{o,t}                   ∀o,t
      보관 기간     d − day(s) ≤ MaxDays_o
  (8) 창고 용량    날짜 d의 입고(직송 + ODCY 2구간) ≤ WarehouseCap_d                     ∀d
      입고 시간대   직송 도착이 창고 시간대 밖이면 x = 0
  (9) 잠금         승인·실행된 배정은 값 고정. 운영자 고정 조건도 여기에

목적
  minimize  Σ cost_direct[c,s]·x + Σ cost_odcy[c,o,s,d]·y + Σ cost_wait[c]·w
          + λ · Σ_c change[c]       (이전 승인 계획과 달라진 컨테이너 수, 재최적화 안정성)
```

- 대기(`w`)는 계획 기간이 끝날 때까지 터미널에 머무는 경우다. 다음 날 직송은 `x[c,DIRECT,s]`(다음 날 슬롯)로 표현된다. 시나리오의 "Terminal Wait 3"은 이 둘 중 하나로 나타난다.
- 2구간 트럭을 일 단위 용량(5)으로 단순화한 것은 `[ASSUMPTION]`이다. 시나리오 결과가 부자연스러우면 T-036에서 슬롯 단위로 바꾼다.
- `λ`(계획 변경 벌점)는 KRW 단위의 작은 값이다 `[ASSUMPTION]`. 회신마다 계획이 크게 뒤집히는 것을 막는다.

## 4. 비용 계수 (비용 엔진이 계산)

| 계수 | 포함 항목 (`04_domain-model.md` 5절) |
| --- | --- |
| `cost_direct[c,s]` | 반출 시각까지 Demurrage(또는 Combined) + 터미널 보관료 + 터미널→창고 운임 + 반출 이후 Detention 예상(반납 리드타임 `[ASSUMPTION]`) + 입고 지연 벌점 |
| `cost_odcy[c,o,s,d]` | 반출 시각까지 Demurrage + 터미널→ODCY 운임 + ODCY 핸들링(입·출) + 보관료 × 일수 + ODCY→창고 운임 + Detention 예상 + 입고 지연 벌점 |
| `cost_wait[c]` | 계획 기간 끝까지 누적 D&D·보관료 + 기간 이후 추정 비용(보수적 상한) + 입고 지연 벌점 |

- 모든 계수는 KRW 정수다(ADR-006).
- 옵티마이저의 입력은 **Planning Snapshot 하나**다(`05_event-and-state.md` 14절). 스냅샷의 `provisional_inputs`, `approval_blockers`, `held_candidates`를 계획 결과에 그대로 옮겨 기록하고, Run에는 `snapshot_hash`를 저장한다.

## 5. Baseline (`04_domain-model.md` 6.5)

- **현재 계획을 새 제약 아래에서 그대로 밀고 갈 때**의 비용이다. 예: 오늘 20대 입고 예정 → 창고가 8대만 받으면, LFD 순으로 8대 입고, 나머지 12대는 터미널 대기 후 다음 날 이후 직송.
- Baseline도 같은 자원 제약과 같은 비용 엔진으로 계산한다.
- `Potential Saving = Baseline − Recovery`. 화면에는 항상 "시뮬레이션 기준"을 붙인다.

## 6. 재최적화

| 트리거 | 동작 |
| --- | --- |
| 활성 계획에 쓰인 자원 사실 변경(회신, 현장 보고) | 새 입력으로 재실행, 이전 계획을 초기해(warm start)로 |
| 컨테이너 사실 변경(확인, 충돌 해결) | 해당 컨테이너가 계획 대상이면 재실행 |
| 계획 거절·수정 | 운영자 고정 조건을 반영해 재실행 |
| 승인된 배정 | 잠금(9). 이미 발송·실행된 것은 바꾸지 않는다 |

- 입력 해시가 이전과 같으면 재실행하지 않는다. 디바운스를 둔다(`06_agent-architecture.md` 3절).

## 7. 출력

```json
{
  "run_id": "run_...", "as_of": "...", "trigger": "WAREHOUSE_CAPACITY_CHANGED",
  "scenario_id": "busan-wh-capacity-01", "seed": 42,
  "input_hash": "sha256(...)", "policy_version": "...", "rule_versions": ["..."],
  "solver": { "status": "OPTIMAL | FEASIBLE", "time_ms": 0, "gap": 0.0 },
  "baseline_cost_krw": 0, "recovery_cost_krw": 0, "potential_saving_krw": 0,
  "contains_simulated": true,
  "provisional_inputs": [ { "event_id": "...", "fact_key": "available.slot(...)" } ],
  "assignments": [ { "container_no": "...", "route": "ODCY_A", "slot": "...", "delivery_day": "...",
                     "cost_krw": 0, "baseline_cost_krw": 0, "locked": false } ],
  "summary_by_route": { "WAREHOUSE_DIRECT": 8, "ODCY_A": 5, "ODCY_B": 4, "TERMINAL_WAIT": 3 },
  "binding_constraints": [ { "type": "WAREHOUSE_CAP", "ref": "WAREHOUSE_A@D0", "note": "..." } ],
  "resource_gaps": [ { "type": "TRUCK", "slot": "...", "needed": 3, "available": 1 } ]
}
```

- `resource_gaps`가 Communication Agent의 입력이 된다(무엇을 누구에게 물을지).
- `binding_constraints`와 컨테이너별 비용 차이가 LLM 설명의 입력이다. 설명의 숫자는 이 JSON에 있는 값만 쓴다.

## 8. 재현성

- CP-SAT는 여러 워커를 쓰면 같은 목적값의 다른 해가 나올 수 있다. 데모 재현을 위해 **단일 워커 + 고정 seed + 시간 제한**으로 돌리고, 동률 해를 가르는 결정론적 타이브레이크(컨테이너 번호순 작은 벌점)를 넣는다 `[ASSUMPTION]`, T-045에서 검증.
- 재현 테스트: 같은 시나리오를 3회 재생해 `assignments` 해시가 같아야 한다(NFR-01).

## 9. 범위 밖

- 2단계(개별 트럭 배정·순서, VRP)는 Pilot 이후다(ADR-009). 1단계 결과가 2단계에서 실행 불가능할 수 있다.
- 대안 모델(MILP, min-cost flow) 비교는 규모가 커질 때 한다.

## 10. 구현 (T-112 · T-113 · T-114, 2026-10-26 — 사용자 검토 대기)

3절 정식화를 MVP 규모에 맞게 이렇게 옮겼다. 상세 기록 · 숫자 · 시험은 `docs/24` 18.17, Solver 선택은 ADR-038(Proposed).

| 3절 | 구현 | 비고 |
| --- | --- | --- |
| 슬롯 2시간 · 24슬롯 | **정시 1시간**, 계획일(D0)의 트럭 출발 정시. 다음 날 이후 운송은 트럭을 제약하지 않는다 [ASSUMPTION] | 시나리오 트럭 명부가 1시간 단위 |
| x · y · w | 선택지 y(KEEP · ODCY(o, 입고일) · 대기(입고일) · 다른 창고) + 트럭 배정 z(선택지 × 트럭 × 출발 정시) + 계획 불가 s(큰 벌점, 설명용) | 입고일도 결정 변수 |
| (4) 트럭 1구간 | **트럭마다** 시간창 · 왕복 점유(ODCY B 2시간). 합계 용량이 아니라 한 대 한 시각 한 일 | 2시간 일은 같은 트럭 연속 2시각 |
| (5) 트럭 2구간 · (6) 반출 슬롯 | 모델 밖 [ASSUMPTION] | 데이터 없음 |
| (7) ODCY 용량 | D0 반입 용량(규격별 사실), 보관 한도 사실이 있으면 입고일 제한 | 일별 점유는 다음 단계 |
| (8) 창고 용량 | 날짜별 사실 − 계획 대상이 아닌 컨테이너가 이미 약속한 수 | 입고 마감 → 마지막 출발 정시 |
| (9) 잠금 · λ | 없음 — 대신 판 관리(새 판 · 옛 판 SUPERSEDED) · 같은 입력이면 같은 판 | 재최적화 안정성은 동률 해소 2단계 |
| 목적 | Σ(base + 위험 벌점) + 협력 트럭 잠정 벌점. 계수는 Cost Engine 출력(KRW 정수) | 옵티마이저는 비용 규칙을 모른다 |
| 8절 재현성 | HiGHS 단일 스레드 · seed 0 · gap 0 + 3단계 결정론 동률 해소 · 입력 지문(`input_hash`) | 시험이 같은 입력 → 같은 할당 확인 |
| 5절 Baseline | 규칙 `baseline/1`(원래 출발 순서로 오늘 용량만큼 KEEP, 나머지 대기 · LFD 순 입고일) — **같은 비용표** | 시나리오 Baseline 4,650,000 재현 |

