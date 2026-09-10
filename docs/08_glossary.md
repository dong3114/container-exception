# 08. 용어집

- 상태: Draft v0.1
- 최종 수정: 2026-09-10
- 코드 식별자는 `코드 표기` 열을 따른다.

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
| MSN | `msn` | Master B/L Sequence Number |
| 호출부호 | `call_sign` | 선박 무선 호출부호 |
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
| TMS / WMS / ERP / EDI | — | 운송관리 / 창고관리 / 전사자원 / 전자문서교환 시스템 |
| UNI-PASS | `unipass` | 관세청 전자통관시스템 |
| PORT-MIS | `portmis` | 해양수산부 항만운영정보시스템 |
| Watchlist | `watchlist` | 사용자가 감시 대상으로 등록한 B/L·컨테이너 목록 |
| ContainerState | `ContainerState` | 컨테이너의 정규화된 현재 상태 스냅샷 |
| ContainerEvent | `ContainerEvent` | 상태를 바꾸는 개별 사건(양하, 수리, 반출 등) |
| Milestone | `milestones` | 이벤트가 채우는 타임스탬프. 메인 상태는 여기서 유도 |
| Exception | `exceptions` | 메인 상태 위에 겹쳐 붙는 예외 플래그 |
| SlackTime | `slack_minutes` | 마감까지 남은 시간에서 필요 리드타임·버퍼를 뺀 실질 여유 |
| Risk Grade | `grade` | LOW / WATCH / HIGH / CRITICAL |
| Exposure | `exposure_krw` | 앞으로 생길 것으로 예상되는 비용 |
| Baseline | `baseline` | 비교 기준이 되는 현재 계획 |
| Recovery Plan | `recovery_plan` | 최적화로 만든 대체계획 |
| Recoverable Exposure | `recoverable_krw` | Baseline 비용 − Recovery 비용 |
| Scenario | `scenario` | 가상 자원(ODCY, 트럭, VBS) 설정 묶음 |
| as_of | `as_of` | 계산 기준시각 |
| Provenance | `provenance` | 값의 출처 메타데이터 |
| CP-SAT | — | OR-Tools의 제약 프로그래밍 + SAT 솔버 |
| MILP | — | 혼합정수선형계획 |
| VRP | — | 차량경로문제 |
| Gate (PoC) | — | 단계 진행 여부를 판정하는 Go/No-Go 관문 (터미널 Gate와 구분) |
| ADR | — | Architecture Decision Record, 설계 결정 기록 |
