# 02. 제품 브리프

- 상태: Draft v0.1 (원본 기획서 V0.1, 2026-09-09 기준 요약)
- 최종 수정: 2026-09-10

## 1. 정의

**CERA — Container Exception Recovery Agent**
공공 항만·통관 데이터 기반 컨테이너 비용위험 선제복구 오퍼레이터.

> 관세청·해양수산부의 컨테이너 상태 데이터와 화주의 선사 계약조건을 결합해 D&D 및 물류지연 비용 위험을 선제 탐지하고,
> 제한된 트럭·야적장·시간 슬롯 안에서 여러 컨테이너의 최적 복구계획을 산출하는 한국형 Agentic Logistics Operator.

**장기 정의**: 한국 항만 물류에서 예외 상황이 생겼을 때 사람이 여러 시스템과 전화·엑셀을 뒤지는 대신,
현재 상태와 제약조건을 바탕으로 가장 경제적인 복구계획을 계산하고 실행까지 연결하는 Operations Agent.

## 2. 제품 철학

```text
Verified State → New Event → Risk Detection → Cost Exposure → Constraint Optimization
→ Recovery Plans → Policy Gate → Human Approval / Bounded Action → New State → Re-optimization
```

## 3. 문제

- 통관 지연, 목적지 창고 만차, 공장 장애, 트럭 부족, 터미널 슬롯(VBS) 부족, 기상·항만 혼잡 때문에 컨테이너 반출 계획이 쉽게 깨진다.
- 운영자는 LFD, 선사별 계약, 터미널 상태, 운송비, ODCY 비용, 목적지 입고 가능시간을 **동시에** 비교해야 한다.
- 컨테이너 1~2대는 엑셀로 처리할 수 있지만, 위험 컨테이너가 수십 대가 되면 **제한된 자원을 어떻게 나눌지의 문제**가 된다. → 최적화가 필요해지는 지점.

## 4. 고객 가설

| 순위 | 고객 후보 | 문제 강도 | 데이터 접근 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | 중소·중견 포워더 | 높음 | 중~높음 | 다선사·다화주 관리, 반복 작업 |
| 2 | 수입 화주 물류팀 | 중~높음 | 높음 | 자사 화물 중심, 구매력 있음 |
| 3 | 3PL/운송사 | 중간 | 높음 | 배차 자원 보유, D&D 책임 구조 확인 필요 |
| 장기 | 터미널/선사 | 높음 | 매우 높음 | 영업주기가 길고 기존 시스템 장벽이 큼 |

`[TO VERIFY]` 첫 유료 고객 유형은 현업 인터뷰 10~20명으로 검증한다(`10_open-questions.md` R-2).

## 5. 경쟁 포지셔닝

| 구분 | 글로벌 플랫폼(project44, FourKites 등) | CERA 초기 포지션 |
| --- | --- | --- |
| 커버리지 | 글로벌 다항만·다선사 | 한국 항만·통관·로컬 실행망의 깊이 |
| 강점 | 대규모 Visibility/D&D 데이터 | 국내 운영 예외복구 워크플로 |
| 데이터 | 자체 글로벌 연결망 | UNI-PASS/PORT-MIS + 국내 계약·자원 |
| 첫 고객 | 대형 Shipper/LSP 중심 가능 | 중소·중견 포워더/수입 화주 (가설) |

- 글로벌 제품이 "Visibility만 제공한다"고 주장하지 않는다. LFD, D&D 비용, Hold, 통관, Yard/Task orchestration까지 상당한 기능을 제공한다.
- `[TO VERIFY]` 한국형 Recovery 실행 공백이 실제로 있는지는 경쟁제품 데모 비교와 고객 인터뷰로 확인한다(R-5).

## 6. 제품 범위 (버전)

| 버전 | 이름 | 핵심 | 하지 않는 것 |
| --- | --- | --- | --- |
| V0.1 | Public Data Risk Radar | 공공 API 연동, 상태 정규화, Tariff 수기 등록, LFD·D&D Exposure 계산, 위험도 대시보드 | 최적화, LLM, 실행 |
| V0.2 | Recovery Optimizer | 실제 상태 + 가상 ODCY/Truck/VBS 자원, 다중 컨테이너 최적화, Baseline 대비 비용 비교 | 실행 |
| V1 | Human-approved Execution | 작업지시(Command) 생성, 운영자 승인 | 외부 시스템 자동예약 |
| V2 | Closed-loop Operator | TMS/VBS/ODCY/EDI 연동: 예약 → 배차 → 모니터링 → 재최적화 | — |

상세 계획은 `07_roadmap.md`.

## 7. KPI

| KPI | 정의 |
| --- | --- |
| Risk Detection Accuracy | 실제 위험 건을 사전에 포착한 비율 |
| D&D Exposure | 앞으로 예상되는 추가비용 |
| Recoverable Exposure | 대체계획으로 줄일 수 있는 비용 |
| Recovery Saving | 실제 또는 시뮬레이션 기준 순절감액 |
| False Alert Rate | 대응이 필요 없었던 경보의 비율 |
| Operator Acceptance Rate | 추천안이 승인된 비율 |
| Planning Time Reduction | 기존 수작업 대비 계획 시간 감소율 |

## 8. 비즈니스 모델 가설

- **SaaS Subscription**: 관리 컨테이너 수·기능에 따른 월 구독.
- **Gain Sharing**: 검증 가능한 순절감액의 일부를 성과 기반으로 과금. 산정 기준 검증 필요.
- **Enterprise Integration**: TMS/EDI/ERP/터미널 연계, 맞춤 Rule Engine 구축비.
- **하지 않음**: 초기에 ODCY·운송사 중개수수료를 핵심 BM으로 두지 않는다. 특정 공급자에게서 수수료를 받으면 추천 엔진의 중립성이 흔들린다.

## 9. 확정하지 않을 주장

`01_project-rules.md` 4절 참고. 요약: LFD 완벽 계산, ODCY = D&D 제거, 경쟁사 실행기능 부재, VBS 공개 Write API 자동예약, 3안 비교 = 최적화, MVP 완전 자율배차.

## 10. 원본 기획서 대비 정정·보완 사항

| 항목 | 원본 | 이 문서 | 근거 |
| --- | --- | --- | --- |
| 해수부 반출입 API 링크 | data.go.kr 15011649 | 15131742 `해양수산부_외항화물컨테이너정보`로 대체 후보 | 원본 링크 404 (2026-09-10 확인), Q-03 |
| 대시보드 수치 | HIGH 22 + CRITICAL 12 = 34, 콘솔 "37 containers" | 불일치로 기록 | Q-01 |
| 금액 | RECOVERABLE ₩18,720,000 vs 현재계획 ₩18,420,000 | 개념 정의 필요 | Q-02 |
