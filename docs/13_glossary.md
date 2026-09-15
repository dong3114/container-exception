# 13. 용어집

- 상태: Living (기획 v0.2)
- 최종 수정: 2026-09-15 (T-060 시각 품질·신선도 UNKNOWN, Prototype 용어). 이전: 2026-09-11 (T-032: 출처 3축·근거 강도·상태 차원·fact_kind·단계 용어 반영. v0.2: 이벤트·상태·에이전트 용어 추가, `08_glossary.md`에서 이름 변경)
- 코드 식별자는 `코드 표기` 열을 따른다.

## 1. 물류·통관

| 용어 | 코드 표기 | 설명 |
| --- | --- | --- |
| D&D | `dnd` | Demurrage & Detention. 무료 기간을 넘겨 컨테이너를 쓸 때 선사가 부과하는 비용 |
| Demurrage | `demurrage` | 터미널 안에 있는 적컨테이너가 무료 기간을 넘겼을 때 부과 (보통 양하 → 반출) |
| Detention | `detention` | 터미널 밖으로 나간 컨테이너를 기한 안에 반납하지 않았을 때 부과 (보통 반출 → 공컨 반납) |
| Combined D&D | `combined_dnd` | Demurrage와 Detention을 하나의 무료 기간·요율로 합산하는 방식 |
| Split D&D | `split_dnd` | Demurrage와 Detention을 따로 계산하는 방식 |
| Storage | `storage` | 터미널 자체 보관료(선사 D&D와 별개) |
| Free Time | `free_days` | 과금 없이 쓸 수 있는 기간(일) |
| LFD | `lfd` | Last Free Day. 무료 기간의 마지막 날 |
| Tariff | `tariff` | 선사·터미널이 공시한 요율표 |
| 특약 | `special_terms` | 화주와 선사 간 별도 합의 조건(Free Time 연장 등) |
| B/L | `bl` | Bill of Lading, 선하증권 |
| MBL / HBL | `mbl_no` / `hbl_no` | Master B/L(선사 발행) / House B/L(포워더 발행) |
| 화물관리번호 | `cargo_mgmt_no` | 관세청이 화물에 부여하는 관리번호 (UNI-PASS `cargMtNo`) |
| 적하목록 | `manifest` | 선박에 실린 화물 목록. 적하목록관리번호 + MSN으로 식별 |
| 적하목록관리번호 | `manifest_no` | 적하목록을 식별하는 번호 (해수부 `mrNum`) |
| MSN | `msn` | Master B/L Sequence Number |
| 호출부호 | `call_sign` | 선박 무선 호출부호 (해수부 `clsgn`) |
| 항만청코드 | `port_authority_code` | PORT-MIS 계열 API의 3자리 항만청 코드 (`prtAgCd`, 부산 `020`) |
| 입항연도 / 입항횟수 | `call_year` / `call_seq` | 선박이 그 해 몇 번째로 입항했는지 (`etryptYear` / `etryptCo`, 3자리) |
| 입항 건 | `VesselCall` | 항만청코드 + 입항연도 + 입항횟수 + 호출부호로 식별하는 선박 한 번의 입항. 해수부 외항화물컨테이너정보의 조회 키 |
| 처리이력 | `history` | UNI-PASS 화물통관진행정보의 처리 단계별 이력 행(처리구분, 반출입일시, 장치장) |
| 양하 | `discharge` | 선박에서 컨테이너를 내림 |
| 반입 / 반출 | `gate_in` / `gate_out` | 터미널·장치장에 들어옴 / 나감 |
| 장치장 | `bonded_area` / `shed` | 통관 전 화물을 보관하는 장소 (UNI-PASS `shedNm`) |
| 수입신고수리 | `customs_cleared` | 세관이 수입신고를 수리함 → 반출 가능 조건 중 하나 |
| D/O | `delivery_order` | Delivery Order, 화물인도지시서. 선사가 발행하며 반출 조건 중 하나 |
| ODCY | `odcy` | Off-Dock Container Yard. 부두 밖 컨테이너 장치장 |
| VBS | `vbs` | Vehicle Booking System. 터미널 반출입 차량 예약 시스템 |
| Gate | `gate` | 터미널 출입구. Gate 처리 시간·버퍼 |
| 공컨 반납 | `empty_return` | 적출 뒤 빈 컨테이너를 선사 지정 장소에 반납 |
| 적출 | `devanning` | 컨테이너에서 화물을 꺼냄 |
| Reefer | `reefer` | 냉동·냉장 컨테이너. 전원(plug) 필요 |
| DG | `is_dg` | Dangerous Goods, 위험물 |
| FCL / LCL | `fcl` / `lcl` | 컨테이너 단위 화물 / 혼재 화물 |
| TEU | `teu` | 20ft 환산 단위 (40ft = 2 TEU) |
| TMS / WMS / ERP / EDI / FMS | — | 운송관리 / 창고관리 / 전사자원 / 전자문서교환 / 포워딩관리 시스템 |
| UNI-PASS | `unipass` | 관세청 전자통관시스템 |
| PORT-MIS | `portmis` | 해양수산부 항만운영정보시스템 |

## 2. 이벤트·상태 (v0.2)

| 용어 | 코드 표기 | 설명 |
| --- | --- | --- |
| System of Record / Decision / Action | — | 사실을 기록·보관하는 시스템(FMS, UNI-PASS) / 그 사실로 판단하고 실행을 돕는 층(CERA) |
| Event | `Event` | 출처가 "무엇이 언제 일어났다"고 주장한 기록. append-only. 현실 그 자체가 아니다 |
| Event Store | `events` | Event를 추가만 하는 저장소 |
| source_type | `source_type` | 출처 **채널**: HUMAN_UI, FILE_IMPORT, EMAIL, DOCUMENT, PUBLIC_API, PARTNER_SYSTEM, INFERENCE (ADR-020). 옛 HUMAN_CONFIRMED 등은 폐기 |
| source_role / source_org | `source_role`, `source_org` | 현실에서 누가 말했나(OPERATOR, WAREHOUSE, TRUCKING …)와 그 조직. 권한 판정 기준 |
| Source Authority | `authority_matrix` | 사실 계열 × 역할별 권한 등급 A / S / W / – (`05` 3.2) |
| 근거 강도 | `strength` | Event가 그 사실에 대해 얼마나 강한 근거인가(0~3). 채널 × 권한 × 확인 × 추출 신뢰도 (`05` 3.3). 전역 우선순위를 대체 |
| Source Priority (폐기) | — | 옛 전역 출처 순위. ADR-019로 대체 |
| Confidence | `confidence` | Event 입력 품질(HIGH / MEDIUM / LOW). 결정론적 검증기가 정한다(`05` 4.6) |
| fact_kind | `fact_kind` | 사실 종류: MILESTONE / STATE / OFFER / TERM / IDENTITY / PLAN / FORECAST. 종류마다 선택 규칙이 다르다 |
| FORECAST | `forecast.*` | 외부 예정·예상 또는 CERA 예측(ETA 등). 관측 사실과 다른 키이며, 실제 사건이 생기면 판단에서 빠진다 |
| 사실 계열 | `family` | 권한·신선도 기준을 묶는 단위(customs, warehouse_capacity, truck_availability …) |
| event_class | `event_class` | OBSERVATION(주장) / CORRECTION(정정) / VERIFICATION(사람 확인) |
| source_event_time / source_recorded_at / received_at / recorded_at | — | 현실 발생 시각 / 출처 기록·발신 시각 / CERA 수신 운영 시각 / DB 기록 벽시계 시각 |
| 근거 시각 | `evidence_time` | Event가 값을 보증하는 시각. `source_event_time` → `source_recorded_at` → `received_at` 순서의 폴백으로 정한다(`05` 5.2). 수신 시각에서 지연을 빼서 추정하지 않는다 |
| 근거 시각 품질 | `evidence_time_quality` | 근거 시각을 어디서 얻었나: EVENT_TIME / RECORDED_TIME(한 단계 낮음) / RECEIVED_ONLY(현실 시각 아님 → 신선도 `UNKNOWN`). 옛 이름 `temporal_quality` (T-060) |
| 시각 신뢰도 | `temporal_confidence` | 근거 시각을 얼마나 믿나: HIGH(EVENT_TIME) / MEDIUM(RECORDED_TIME) / LOW(RECEIVED_ONLY) |
| 신선도 모름 | `freshness_status = UNKNOWN` | 근거 시각을 몰라 나이를 계산할 수 없음. STALE(오래됨)과 다르다. 중요 사실이면 STALE처럼 승인 게이트 |
| Freshness | `freshness_status` | FRESH / AGING / STALE / EXPIRED / N_A. 저장하지 않고 `as_of`로 계산 |
| τ / δ_m | `clock_tolerance_tau`, `milestone_tolerance` | 동시로 보는 근거 시각 차이 / 같은 마일스톤으로 보는 시각 차이 (`[TO VERIFY]`) |
| fact_key | `fact_key` | 사실의 키(예: `milestone.gate_out_at`, `capacity.day(D)`). 카탈로그 `05` 4.3 |
| Reconciliation | `reconcile` | 같은 사실에 대한 여러 Event를 R1~R12로 정리해 이긴 값을 정하고 충돌을 찾는 과정 |
| Canonical Operational State | `canonical_facts` | Reconciliation 결과. 사실마다 값·차원별 상태·근거 Event·규칙 추적·설명 |
| value_status | `value_status` | 값을 누가 보증하나: CONFIRMED / OBSERVED / PROVISIONAL / INFERRED / UNKNOWN |
| conflict_status / hold_status | — | 충돌 NONE / DISSENT / OPEN, 보류 NONE / HELD |
| decision_usability | `decision_usability` | 엔진이 보는 종합 판단: USABLE / USABLE_WITH_WARNING / APPROVAL_BLOCKED / UNUSABLE (`05` 8.4) |
| Fact status (폐기) | — | 옛 단일 enum(CONFIRMED~UNKNOWN). 위 차원들로 분리(ADR-020) |
| Provisional | `PROVISIONAL` | 상대방이 제안·보고한 자원·견적 값(강도 1). 정책이 허용하면 계획에 쓸 수 있다. **계획 승인으로는 확인되지 않는다** |
| verification_basis | `verification_basis` | CONFIRMED의 근거: HUMAN_VERIFICATION / AUTHORITATIVE_SYSTEM / POLICY_EVIDENCE |
| Fact Verification | `VERIFICATION` Event | "이 사실이 현실인가"에 대한 사람의 확인. 사실 상태를 바꾼다 |
| Plan Approval | `PLAN_APPROVAL` 결정 기록 | "이 스냅샷 기준으로 이 계획을 실행해도 되는가"에 대한 승인. Event Store 밖(`plan_decisions`)에 기록하며 사실 상태를 바꾸지 않는다 |
| Held | `HELD` | 약한 근거가 주장한 불리한 큰 변경. 확인 전까지 기존 값 유지 (R10) |
| Conflict | `Conflict` | 자동으로 정할 근거가 없는 출처 간 차이(동률 동시 충돌, 약한 새 근거 vs 강한 신선 근거, 단계 역행) |
| Dissent | `DISSENT` | 강도에서 져 자동 기각된 다른 값. 기록만 하고 판단은 막지 않음 |
| 기각 | `overruled_event_ids` | 확인 요청 처리 때 사람이 고르지 않은 후보. 같은 충돌이 다시 열리지 않게 함 |
| Verification Request | `VerificationRequest` | 사람에게 보내는 확인 요청(V1~V8). [확인] [수정] [거절] |
| Human Confirmation | `HUMAN_UI` / `VERIFICATION` | 사람의 직접 입력(그 자체로 확인) 또는 다른 Event에 대한 확인. 정식 입력 채널 |
| Planning Snapshot | `planning_snapshots` | 엔진 입력용으로 고정한 Canonical State (`05` 14절) |
| fingerprint | `fingerprint` | Canonical Fact 결정론 필드의 해시. 재현성 검증용 |
| 짧은 액션 | `action` | 긴 폼 대신 버튼 하나로 사실을 보고·확인하는 UI 동작 |
| 일일 집계 보고 | `WAREHOUSE_DAILY_REPORT` | 목적지 단위 예정·도착·입고·대기·잔여 수용 대수 보고 |
| Milestone | `milestone.*` | 컨테이너 생애주기 타임스탬프 사실(MILESTONE) |
| Phase | `phase` | 사실에서 유도한 컨테이너 단계 10개(ARRIVING~COMPLETED). 저장하지 않는 뷰. 옛 S0~S9 (`04` 2.2, ADR-021) |
| Exception | `exception.<CODE>` | 컨테이너 자체의 예외 사실(CUSTOMS_HOLD, RECEIVER_REJECT …) |
| 자원 조건 / 영향 | `condition`, `impacts` | 자원 상태에서 나온 조건(WAREHOUSE_CAPACITY_REDUCED 등)과, Risk가 계산한 컨테이너별 영향(사실 아님) |
| ready_at | `ready_at` | 반출 가능 시각 = max(양하, 통관 수리, D/O). 하나라도 없거나 CUSTOMS_HOLD면 null |
| Resource | `Resource` | 창고 수용량, 트럭 풀, ODCY, 반출 슬롯 |
| RateQuote | `RateQuote` | 메일·문서로 받은 견적(보관료, 운임 등). 유효기간을 가진다 |
| Provenance | `provenance` | 값의 출처 메타데이터. v0.2에서는 Event의 source 필드와 Canonical Fact의 `winning_event_id`로 표현 |
| is_simulated | `is_simulated` | 시나리오에서 나온 값 표시 |

## 3. 위험·최적화

| 용어 | 코드 표기 | 설명 |
| --- | --- | --- |
| SlackTime | `slack_minutes` | 마감까지 남은 시간에서 필요 리드타임·버퍼를 뺀 실질 여유 |
| Risk Grade | `grade` | LOW / WATCH / HIGH / CRITICAL |
| Exposure | `exposure_krw` | 앞으로 생길 것으로 예상되는 비용 |
| Baseline | `baseline` | 비교 기준. 현재 계획을 새 제약 아래에서 그대로 밀고 갈 때 |
| Recovery Plan | `recovery_plan` | 최적화로 만든 대체계획 |
| Potential Saving | `potential_saving_krw` | Baseline 비용 − Recovery 비용 (시뮬레이션 기준). 옛 "Recoverable Exposure" |
| Current Exposure (KPI) | `current_exposure_krw` | 조치하지 않을 때 추가비용 = Baseline TotalCost − 정상 직송 운임 `[PROPOSED]` Q-02 (Prototype, `16` 11절 G-3) |
| Recoverable Exposure (KPI) | `recoverable_exposure_krw` | Control Tower KPI 라벨. 최신 Simulated Recovery Plan의 Potential Saving과 같은 값 `[PROPOSED]` Q-02 |
| Simulated Recovery Plan | — | 엔진이 아니라 시나리오에 명시한 계획(`result_kind = SCENARIO_RESULT`). "Solver가 계산했다"고 쓰지 않는다 |
| Realized Saving | `realized_saving_krw` | 실제 실행된 계획 기준 절감액 (Pilot) |
| Re-optimization | — | 입력 사실이 바뀌어 계획을 다시 계산하는 것. 승인된 배정은 잠근다 |
| Recovery Run | `RecoveryRun` | 최적화 실행 한 번의 기록(입력 해시, 정책·규칙 버전, seed, 결과) |
| CP-SAT | — | OR-Tools의 제약 프로그래밍 + SAT 솔버. CERA의 현재 솔버 **후보**(ADR-007 Reopened, T-036에서 결정) |
| MILP | — | 혼합정수선형계획 |
| VRP | — | 차량경로문제 |

## 4. 에이전트·시스템

| 용어 | 코드 표기 | 설명 |
| --- | --- | --- |
| Agent | — | 명확한 책임·입출력·트리거를 가진 모듈. 여러 LLM의 대화가 아니다 |
| Orchestrator | `orchestrator` | Event에 반응해 다음 단계를 부르는 결정론적 흐름 제어 |
| Agent Activity | `agent_activity` | 에이전트 단계별 기록. 시뮬레이터 타임라인의 원천 |
| Human Gate | G1~G5 | 사람이 승인·확인해야 넘어가는 지점(`06_agent-architecture.md` 7절) |
| 구조화 출력 | `output_config.format` | LLM 응답을 JSON 스키마에 맞게 받는 API 기능 |
| Evidence | `evidence` | LLM 추출 필드마다 붙이는 원문 인용 |
| 가상 메일함 | `mailbox` (simulated) | PoC에서 실제 발송 대신 쓰는 메일 저장소 |
| Scenario | `scenario` | 초기 상태 + 시각별 스크립트 이벤트 + 스크립트 회신 + 자원 설정 묶음 |
| SimClock | `SimClock` | 시나리오 재생 시계. `as_of`를 공급한다 |
| as_of | `as_of` | 계산 기준시각 |
| PoC / Pilot / Scale | — | 제품 단계. 옛 V0.1/V0.2/V1/V2를 대체(`CHANGELOG.md` 5절) |
| Gate (단계) | — | 단계 진행 여부를 판정하는 Go/No-Go 관문 (터미널 Gate와 구분) |
| ADR | — | Architecture Decision Record, 설계 결정 기록 |
| Watchlist | `watchlist` | 사용자가 관리 대상으로 등록한 B/L·컨테이너 목록 |
| Control Tower | — | Prototype 첫 화면 "CERA Operations Control Tower"(`16_frontend-prototype.md`). KPI·운영 지도·예외·Recovery Console·타임라인·Data Trust를 한 화면에 |
| Frontend Data Contract | `front/web/src/contracts/cera.ts` | 화면이 의존하는 View Model 타입. Mock·API 구현이 같은 계약을 돌려준다 |
| Data Provider | `CeraDataProvider` | 계약을 돌려주는 구현. 지금은 `MockProvider`(시나리오 데이터 팩), 나중에 `ApiProvider` |
| Result Kind | `result_kind` | 숫자의 출처: `SCENARIO_RESULT`(시나리오 명시값) / `ENGINE_RESULT`(결정론 엔진 결과) |
| Scenario Data Pack | `data/scenarios/<id>/` | 시나리오 입력과 명시 결과값 묶음(JSON). Prototype 판은 T-061 |
| DEFERRED (태스크 상태) | — | 폐기가 아니라 보류. 재개 조건을 적는다(`tasks/QUEUE.md` 상태 규칙) |

## 5. 폐기된 용어

| 용어 | 대체 |
| --- | --- |
| ContainerState (v0.1) | Canonical State의 컨테이너 사실 묶음 |
| ContainerEvent (v0.1) | Event (`subject.type = CONTAINER`) |
| Recoverable Exposure (금액 개념으로서) | Potential Saving. 단 2026-09-15부터 Control Tower KPI **라벨**로는 다시 쓴다(값 = 최신 계획의 Potential Saving) |
| V0.1 Risk Radar / V0.2 Recovery Optimizer / V1 / V2 | PoC / Pilot / Scale |
