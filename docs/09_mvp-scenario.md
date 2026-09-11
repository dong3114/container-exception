# 09. MVP 시나리오

- 상태: Draft (기획 v0.2)
- 최종 수정: 2026-09-11
- 시나리오 ID: `busan-wh-capacity-01`
- 데이터 팩 작성: T-037 (`data/scenarios/busan-wh-capacity-01.yaml`)

이 시나리오가 PoC의 **기준 데모**다. 설계·구현·시뮬레이터·인터뷰가 모두 이 시나리오를 돌릴 수 있어야 한다. 모든 값은 `SIMULATED`이고, 금액은 엔진이 계산한다. 이 문서의 금액은 목표 모양을 보여주는 **예시값**이다.

---

## 1. 설정

| 항목 | 값 | 태그 |
| --- | --- | --- |
| 항만·범위 | 부산항, Import FCL | ADR-010 |
| 컨테이너 | 30대 (20ft·40ft Dry 혼합), 선사 3곳(가상 `CARRIER_A/B/C`), 선사별 Tariff 상이 | `SIMULATED` |
| LFD 분포 | D0 마감 6대, D1 마감 8대, D2 마감 10대, D3 이후 6대 | `[ASSUMPTION]` T-037에서 조정 |
| 창고 | Warehouse A: 하루 20대, 입고 08:00~17:00 | `SIMULATED` |
| 트럭 | 8대 (슬롯별 가용 대수는 시나리오에서 지정) | `SIMULATED` |
| ODCY | ODCY A, ODCY B (+ 선택 ODCY C). 규격별 잔여 용량·보관료·핸들링료 | `SIMULATED` |
| 반출 슬롯 | 슬롯별 VBS 가용량 | `SIMULATED` |
| 초기 계획 | D0에 20대 창고 입고 예정, 나머지 10대는 D1 | `SIMULATED` |
| 계약 | 합성 계약서 3건(선사별). 사전에 추출·확인을 끝낸 CONFIRMED 규칙으로 시작 (옵션: 데모 중 1건 추출·확인 장면) | `SIMULATED` |
| 공공 API | 합성 fixture(실제 응답 구조를 본뜬 것)로 초기화·교차 검증 장면 연출 | `SIMULATED` |

## 2. 타임라인

시각은 시뮬레이션 시계(D0 = 데모 날짜) 기준이다.

| 시각 | 사건 | 담당 | 결과 (상태·화면) |
| --- | --- | --- | --- |
| D0 08:00 | 초기 상태 적재: CSV(Watchlist) + 공공 API fixture + 사전 확인 이벤트 | Intake, State | 30대 표시, 사실별 출처 배지. 일부 사실 OBSERVED |
| D0 09:30 | (선택) 교차 검증: 공공 API fixture상 컨테이너 X는 "터미널 장치", 사용자 기록은 "반출 완료" | Reconciliation, Verification | Conflict 1건 → 확인 요청 → 운영자 [확인] |
| **D0 11:00** | **Warehouse A 설비 문제. 수용량 20 → 8** | 창고 담당자 [수용량 변경] (변형 B: 창고 메일) | `WAREHOUSE_CAPACITY_CHANGED` (HUMAN_UI / 창고 담당자 A, `change_reason = EQUIPMENT_FAILURE` → 8, CONFIRMED). 변형 B는 창고 메일(EMAIL + LLM, 강도 1) → 기존 값이 신선하면 충돌(R4-b), 아니면 보류(R10 HELD) → 확인 뒤 반영 (`05_event-and-state.md` 부록 A.1, A.7.8~9) |
| 11:00:01 | 영향 탐지 | Risk | 오늘 입고 예정 20대 중 **12대 영향**. 영향 컨테이너 빨간 강조 |
| 11:00:02 | Baseline Exposure 계산 | Risk, Cost | 예: 기존 계획 예상비용 **6,420,000원** |
| 11:00:03 | Recovery 계산 | Optimizer | Plan v1: 예) Warehouse 8 / ODCY A 5 / ODCY B 4 / Terminal Wait 3. Recovery 예상비용 **2,850,000원**, Potential Saving **3,570,000원**. 트럭 부족 슬롯 표시 |
| 11:00:05 | 문의 초안 3건 | Communication | 운송사 차량 가용성, ODCY 자리·보관료, 창고 추가 수용 가능성 |
| 11:05 | 운영자 검토·승인 → 가상 발송 | 운영자, Communication | 메일 3건 SENT (가상 메일함) |
| 11:40 | 회신: 운송사 "15시 2대, 17시 1대 가능합니다." | 시나리오 스크립트 → Response | `TRUCK_AVAILABILITY_REPORTED` ×2 (PROVISIONAL) |
| 11:45 | 회신: ODCY "40FT Dry 4대, 2일 보관 가능합니다. 일 보관료 35,000원입니다." | Response | `YARD_CAPACITY_REPORTED`, `RATE_QUOTE_RECEIVED` (PROVISIONAL) |
| 11:50 | 회신: 창고 "추가 수용 불가" | Response | `WAREHOUSE_CAPACITY_CHANGED` 없음 (현 8 유지 확인) |
| 11:50:01 | 자원 상태 갱신 → 재최적화 | State, Re-optimization | Plan v2 (잠정 입력 3건 표시). 금액·배정 변화 |
| 11:55 | 운영자 Plan v2 승인 | 운영자 | `PLAN_APPROVAL` 기록(잠정 입력 3건 인지), 배정 잠금. 잠정 입력은 **PROVISIONAL로 남고** V9 확인 요청 생성. 운영자가 운송사·ODCY와 통화 뒤 [확인]하면 그때 CONFIRMED (데모에서는 "확인 + 승인" 묶음 버튼으로 한 번에 보여줄 수 있으나 기록은 따로) |

화면 오른쪽 Agent Activity Log 예시(`10_simulation-spec.md`):

```text
11:00:00 Warehouse A capacity changed 20 → 8 (창고 담당자 확인)
11:00:01 Warehouse exception detected — 12 containers affected
11:00:02 Baseline exposure computed
11:00:03 Evaluating recovery combinations
11:00:03 Recovery plan v1 generated
11:00:05 3 inquiry drafts ready for approval
11:05:10 3 messages sent (simulated)
11:40:12 Carrier reply received — truck availability extracted
11:45:30 ODCY reply received — capacity and rate extracted
11:50:02 Warehouse reply received — no additional capacity
11:50:03 Resource state updated (3 provisional inputs)
11:50:04 Re-optimizing
11:50:05 Recovery plan v2 generated
```

## 3. 예시값의 성격

- 6,420,000 / 2,850,000 / 3,570,000원과 8 / 5 / 4 / 3 배정은 **목표 장면을 설명하는 예시**다 `[ASSUMPTION]`. 실제 화면의 숫자는 엔진이 시나리오 데이터로 계산한 값이다.
- T-037은 시나리오 데이터(Tariff, 요율, LFD, 용량)를 조정해 엔진 결과가 **설명 가능하고 이 예시와 비슷한 모양**이 되게 한다. 숫자를 맞추려고 엔진을 고치지 않는다.
- 회신의 ODCY 4대(40FT Dry)가 Plan v1의 ODCY 배정과 다르면 Plan v2에서 배정이 바뀌어야 한다. 이것이 재최적화 장면이다.

## 4. 데모 성공 기준

| # | 기준 |
| --- | --- |
| 1 | 같은 시나리오·seed로 3번 재생하면 상태·계획·금액이 같다 (NFR-01) |
| 2 | 화면의 모든 금액이 Run ID와 비용 내역으로 연결된다 (NFR-02) |
| 3 | 모든 사실에 출처 배지와 상태(CONFIRMED/OBSERVED/PROVISIONAL …)가 보인다 |
| 4 | 승인 없이 발송·확정되는 것이 없다 (G3, G4) |
| 5 | 예외 입력부터 Plan v1 표시까지 10초 이내 (NFR-04) |
| 6 | 데모 모드로 전체 루프를 3분 안에 보여줄 수 있다 (시계 가속) |
| 7 | LLM 녹화 재생 모드로 네트워크 없이 돈다 |

## 5. 필요한 데이터 (T-037 산출물)

| 데이터 | 형식 | 비고 |
| --- | --- | --- |
| 컨테이너 30대 | CSV + 시나리오 YAML | ISO 6346 체크디지트가 맞는 합성 번호 |
| 초기 Event 세트 | YAML (source_type·시각 포함) | 공공 API fixture 기반 OBSERVED + 사람 확인 |
| 계약 3건 + 확정 TariffRule | 합성 PDF/텍스트 + YAML | 요율은 자리표시 `[ASSUMPTION]` (T-029 조사 반영) |
| 자원 | YAML | 창고·트럭·ODCY·슬롯, 슬롯별 값 |
| 스크립트 이벤트 | YAML (시각, 입력 채널, 내용) | 11:00 예외, 09:30 충돌 |
| 메일 | 합성 메일 원문(발송 초안 기대값, 회신 3건) | Response 추출 평가에도 사용 |
| LLM 녹화 응답 | JSON fixture | 재생 모드 |
| 기대 결과 | 골든 파일 (Plan v1/v2 요약, 금액 범위) | 회귀 테스트 |

## 6. 범위 밖

- 실제 고객 데이터, 실제 메일 발송, 실제 공공 API 호출(데모 경로에서는 fixture)
- 트럭 개별 경로, 게이트 대기열 시뮬레이션
- Export·LCL·Reefer·DG 컨테이너
