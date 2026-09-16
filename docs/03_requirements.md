# 03. 요구사항

- 상태: Draft (기획 v0.2)
- 최종 수정: 2026-09-16 (T-071: 외부 통신 상세 요구사항을 `19`로 분리하고 2.7절에 연결. FR-ING-05·07, FR-COM-02, FR-RSP-01, NFR-03을 ADR-026·027에 맞게 개정). 이전: 2026-09-15 (5절: Control Tower Prototype 메모)
- 우선순위: `Must`(반드시) · `Should`(있으면 좋음) · `Could`(나중)
- 단계: `PoC` · **`Tech Validation`** · `Pilot` · `Scale` (`02_product-definition.md` 6절, ADR-027)
- **외부 통신(거래처·연락처·확인·승인·발송·회신·추출)의 상세 요구사항은 `19_external-communication-requirements.md`가 정본이다.** 이 문서는 전체 지도를 유지한다

---

## 1. 행위자

| 행위자 | 설명 |
| --- | --- |
| 운영자 (Operator) | 포워더·화주 물류 실무자. 상태를 확인하고, 충돌을 해결하고, 복구계획과 발송을 승인한다 |
| 현장 담당자 | 창고·터미널 현장. 짧은 액션으로 사실을 보고·확인한다(도착, 입고, 거절, 수용량 변경) |
| 관리자 (Admin) | 계약·Tariff 확인, 목적지·자원 등록. PoC에서는 운영자와 같은 사람일 수 있다 |
| 외부 이해관계자 | 운송사, ODCY, 창고, 선사. 메일로 문의를 받고 회신한다(PoC에서는 시나리오가 대신한다) |
| 공공 API | UNI-PASS, 해수부 PORT-MIS 계열 (읽기 전용) |
| CERA 에이전트 | `06_agent-architecture.md`의 역할들 |

## 2. 기능 요구사항 (FR)

### 2.1 입력 수집 (Intake)

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
| FR-ING-01 | 모든 입력을 공통 Event 형식으로 바꿔 Event Store에 추가한다(`05_event-and-state.md` 4절) | Must | PoC |
| FR-ING-02 | Watchlist(B/L·컨테이너 목록)와 초기 상태를 CSV/Excel로 받는다. 행 단위 검증(ISO 6346 체크디지트, 중복, 범위 밖 건) 결과를 보여준다 | Must | PoC |
| FR-ING-03 | 사용자 짧은 액션을 Event로 기록한다: [확인] [수정] [도착] [통관 완료] [반출 완료] [입고 완료] [입고 거절] [ODCY 이동] [공컨 반납] [수용량 변경] | Must | PoC |
| FR-ING-04 | 목적지 단위 **일일 집계 보고**를 받는다(예정·도착·입고 완료·대기·잔여 수용 가능 대수) | Must | PoC |
| FR-ING-05 | 수신 메일을 읽어 어느 거래처·역할(운송사·ODCY·창고·선사)의 것인지 **상대방 등록부 조회로 결정론적으로** 분류한다. 등록부에 없으면 보류하고 사람에게 알린다. **LLM에게 "누구인지" 묻지 않는다** (2026-09-16 개정, `19` FR-INB-03·06) | Must | PoC |
| FR-ING-06 | 공공 API(DS-01, DS-03, DS-02)를 읽기 전용으로 동기화해 자동 초기화·교차 검증·히스토리 보강에 쓴다. 응답 원문과 `fetched_at`을 보관한다 | Should | PoC (녹화 fixture로 데모 가능) |
| FR-ING-07 | 실제 메일함(Gmail 등) 연동. **2026-09-16 개정(ADR-027 Accepted)**: `Could/Pilot` → **`Must` / Tech Validation**. 등록·검증·승인된 연락처에만, 건별 사람 승인 뒤 실제 발송·수신. 상세 요구사항은 **`19_external-communication-requirements.md`** | Must | Tech Validation |
| FR-ING-08 | 파트너 시스템(TMS·터미널) 연동 | Could | Scale |

### 2.2 이벤트·상태 (Event Store / Reconciliation / Canonical State)

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
| FR-EVT-01 | Event는 append-only로 저장하고, 정정은 `supersedes` Event로 한다 | Must | PoC |
| FR-EVT-02 | Event마다 출처 유형, 출처 참조, 발생 시각, 수신 시각, 신뢰도, 확인 상태를 저장한다 | Must | PoC |
| FR-REC-01 | 같은 사실(entity + fact_key)에 대한 여러 Event를 사실 종류·권한·근거 강도·확인·신선도·발생 시각·정정 관계로 정리해 이긴 값을 정하고, 적용 규칙과 근거를 남긴다(`05_event-and-state.md` 8절, ADR-019) | Must | PoC |
| FR-REC-02 | 출처 간 값이 다르고 정해진 조건을 만족하면 Conflict를 만든다(예: 사용자 = 반출 완료, 공공 API = 터미널 장치 중) | Must | PoC |
| FR-REC-03 | 판단에 중요한 사실이 신선도 기준을 넘으면 STALE로 표시하고 확인을 요청한다. 기준값은 설정으로 둔다(ADR-014, Q-24) | Must | PoC |
| FR-STA-01 | 컨테이너·자원(창고·트럭·ODCY·슬롯)·계약의 Canonical State를 만들고, 사실마다 차원별 상태(값 보증 `value_status`, 신선도, 충돌, 보류, 결정 가능성)와 근거 Event·설명을 보여준다(`05_event-and-state.md` 6·9절) | Must | PoC |
| FR-STA-02 | Canonical State는 Event 로그와 정책 버전, `as_of`로 언제든 다시 계산할 수 있다 | Must | PoC |
| FR-STA-03 | 임의 시점(`as_of`)의 상태를 조회할 수 있다(리플레이·시뮬레이션용) | Should | PoC |

### 2.3 확인 (Verification)

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
| FR-VER-01 | Conflict, STALE, 확인 대기 추출 결과에서 확인 요청을 만들고 위험 영향도순으로 정렬한다 | Must | PoC |
| FR-VER-02 | 확인 요청은 짧은 액션으로 처리한다: [확인] [수정] [거절]. 처리 결과는 새 Event(`VERIFICATION`, `HUMAN_UI` 관측, `CORRECTION`)가 된다. 기존 Event는 고치지 않는다(`05_event-and-state.md` 11.3) | Must | PoC |
| FR-VER-03 | 확인 요청 알림을 현장 담당자에게 보낸다(메신저·SMS) | Could | Pilot |

### 2.4 계약·Tariff

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
| FR-CON-01 | 계약서 PDF·메일에서 Free Time, Demurrage, Detention, Combined D&D, Storage, Handling, 운송 요율, 특약, 적용기간, 컨테이너 타입, 항만 조건을 **구조화 후보**로 추출한다 | Must | PoC (합성 계약서 1~3건) |
| FR-CON-02 | 후보는 필드별 원문 근거와 함께 보여주고, 사람이 최초 1회 확인하면 버전이 붙은 확정 규칙이 된다 | Must | PoC |
| FR-CON-03 | 확정 규칙만 Tariff Rule Engine에서 쓴다. LLM은 금액을 계산하지 않는다 | Must | PoC |
| FR-CON-04 | 메일로 온 견적(ODCY 보관료 등)은 RateQuote로 저장하고 유효기간을 둔다 | Must | PoC |

### 2.5 위험 (Risk)

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
| FR-RSK-01 | 컨테이너별 LFD와 다음 마감을 계산한다(확정 Tariff 규칙 + Canonical 마일스톤) | Must | PoC |
| FR-RSK-02 | 예외가 영향을 주는 컨테이너를 찾는다(예: 창고 수용량 감소 → 오늘 입고 예정 중 초과분) | Must | PoC |
| FR-RSK-03 | 위험 유형: LFD 임박·경과, 창고 수용량 부족, 트럭 부족, 슬롯 부족, 수령 거부, 상태 불확실(중요 사실이 `APPROVAL_BLOCKED`: STALE·충돌 OPEN·보류 HELD) | Must | PoC |
| FR-RSK-04 | Baseline 계획 기준 D&D Exposure를 계산한다 | Must | PoC |

### 2.6 복구 최적화 (Recovery Optimization)

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
| FR-OPT-01 | 영향받은 컨테이너들을 창고 직송·ODCY 경유·터미널 대기 경로와 시간 슬롯에 배정하는 비용 최소 계획을 계산한다(`08_optimization-model.md`) | Must | PoC |
| FR-OPT-02 | Baseline 비용, Recovery 비용, Potential Saving, 컨테이너별 비용 변화, 영향을 준 제약을 보여준다 | Must | PoC |
| FR-OPT-03 | 계획에 쓰인 입력 가운데 PROVISIONAL·STALE·충돌·보류·가상값이 있으면 표시한다(Planning Snapshot의 `provisional_inputs`, `approval_blockers`, `held_candidates`) | Must | PoC |
| FR-OPT-04 | 운영자가 일부 배정을 고정하거나 제약을 추가해 다시 실행할 수 있다 | Should | PoC |
| FR-OPT-05 | 자원 정보가 바뀌면 재최적화한다. 승인·실행된 배정은 잠그고, 계획 변경을 최소화한다 | Must | PoC |
| FR-OPT-06 | 계획 승인(Plan Approval)과 사실 확인(Fact Verification)을 분리해 기록한다. 계획 승인은 결정 기록(`PLAN_APPROVAL`)만 남기고 입력 사실을 CONFIRMED로 올리지 않는다. PROVISIONAL 입력은 "잠정 입력으로 인지"를 명시해야 승인할 수 있고, `APPROVAL_BLOCKED` 입력이 있으면 승인할 수 없다. "확인 + 승인" 묶음 UI는 허용하되 두 기록은 따로 남긴다(`05_event-and-state.md` 11.5) | Must | PoC |

### 2.7 커뮤니케이션·회신 (Communication / Response)

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
> **상세 요구사항은 `19_external-communication-requirements.md`에 있다** (2026-09-16, T-071). 아래는 요약이고, 거래처·연락처 등록, 이메일 주소 확인, 발송 자격, 승인, 실제 발송, 회신 수신, AI 추출 계약, 실패 처리는 19번 문서가 정본이다. 19번은 `FR-CPY`·`FR-EVF`·`FR-ELG`·`FR-APV`·`FR-SND`·`FR-INB`·`FR-XAI`·`FR-STC`·`FR-EVL` 그룹과 `FR-COM-04~`·`FR-UI-09~`·`FR-AUD-02~`·`NFR-12~`를 쓴다.

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
| FR-COM-01 | 계획과 부족 자원에서 연락 메일 초안을 만든다(운송사 차량 문의, ODCY 자리·요율 문의, 창고 추가 수용 문의). 수량·시각은 계획 값에서 넣는다 | Must | PoC |
| FR-COM-02 | 초안은 사람이 승인해야 발송된다. **PoC 발송은 가상 메일함으로만 간다. Tech Validation 단계부터는 등록·검증·승인된 연락처에 실제로 발송한다**(2026-09-16 개정, ADR-027. `19` FR-ELG·FR-APV·FR-SND) | Must | PoC |
| FR-COM-03 | 발송 메일과 회신을 스레드로 묶는다 | Must | PoC |
| FR-RSP-01 | 회신에서 가능/불가, 수량, 시각, 비용, 조건을 **값 후보로** 추출하고, **서버가 검증·매핑한 뒤** 자원 Event(PROVISIONAL)로 만들어 요약을 보여준다. **LLM이 Event를 만들지 않는다**(2026-09-16 개정, `19` FR-XAI-05·06) | Must | PoC |
| FR-RSP-02 | 추출이 불확실하면(스키마 불일치, 근거 없음, 모호) 확인 요청으로 보낸다 | Must | PoC |

### 2.8 시뮬레이션·화면

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
| FR-SIM-01 | 시나리오 파일(초기 상태 + 시각별 스크립트 이벤트 + 스크립트 회신)을 시뮬레이션 시계로 재생한다. 재생되는 이벤트는 실제 입력과 **같은 파이프라인**을 탄다 | Must | PoC |
| FR-SIM-02 | 같은 시나리오·seed로 재생하면 같은 상태·계획·금액이 나온다 | Must | PoC |
| FR-UI-01 | Operations Dashboard: 활성 컨테이너, 위험 분포, D&D Exposure, 확인 대기 수, 데이터 신선도 | Must | PoC |
| FR-UI-02 | Container Detail: 마일스톤 타임라인, 사실별 출처 배지·상태, Conflict, 비용 내역 | Must | PoC |
| FR-UI-03 | Event Verification UI: 확인 요청 목록과 짧은 액션 | Must | PoC |
| FR-UI-04 | Recovery Console: Baseline vs Recovery, 배정표, 자원 사용률, 제약 영향, 재실행, 승인 | Must | PoC |
| FR-UI-05 | Communication 화면: 초안 검토·수정·승인, 스레드, 회신 추출 결과 | Must | PoC |
| FR-UI-06 | Contract/Tariff UI: 추출 후보와 원문 근거, 확인, 규칙 버전 | Must | PoC |
| FR-UI-07 | Operations Simulator + Agent Activity Timeline(`10_simulation-spec.md`). 현재 Prototype 구현: 2D SVG(`16_frontend-prototype.md`). Three.js 2.5D는 향후 선택지(ADR-016·022 판정 전) | Must | PoC |
| FR-UI-08 | 목적지·자원 등록 화면 | Should | PoC (시나리오 파일로 대체 가능) |

### 2.9 감사·알림

| ID | 요구사항 | 우선 | 단계 |
| --- | --- | --- | --- |
| FR-AUD-01 | 모든 에이전트 단계와 사람 액션을 Agent Activity / Audit Log에 남긴다(누가, 언제, 무엇을, 근거) | Must | PoC |
| FR-NTF-01 | 앱 안 알림: 위험 등급 상승, 새 Conflict, 확인 요청, 회신 도착, 재계획 완료 | Must | PoC |
| FR-NTF-02 | 외부 알림 채널(메일·메신저) | Could | Pilot (Q-28) |

## 3. 비기능 요구사항 (NFR)

| ID | 요구사항 | 기준 (PoC) |
| --- | --- | --- |
| NFR-01 결정론·재현성 | 같은 입력이면 같은 상태·계획·금액 | 시나리오 3회 재생 결과의 해시가 같다 |
| NFR-02 추적성 | 화면의 모든 숫자·상태는 근거(Event, 규칙 버전, Run ID)로 거슬러 올라갈 수 있다 | Container Detail·Recovery Console에서 한 번의 클릭으로 근거를 연다 |
| NFR-03 안전성 (Human-in-the-loop) | 외부 발송·실행은 사람 승인 없이 일어나지 않는다. **LLM 출력은 결정론 검증기를 통과해야만** 후보 Event가 되고, 사람 확인 전 CONFIRMED가 될 수 없다. 컨테이너 사실·계약 조건은 확인 전 Canonical State에 반영되지 않는다(자원·견적 사실은 PROVISIONAL, 불리한 큰 변경은 보류) | ① 승인 없는 발송 경로가 코드에 없음 ② **검증기를 거치지 않고 Event가 만들어지는 경로가 없음** ③ **자격 없는 수신자로 발송되지 않음** — 셋 다 테스트로 확인 (2026-09-16 개정, `19` 20절) |
| NFR-04 응답 시간 | 예외 입력부터 새 계획 표시까지 | 30대 기준 10초 이내 `[ASSUMPTION]` (솔버 5초 이내) |
| NFR-05 LLM 비용·지연 | 추출·초안은 건당 수 초. 데모 1회 LLM 비용 상한을 설정으로 둔다 | 녹화 응답으로 오프라인 데모 가능 |
| NFR-06 테스트 가능성 | 테스트는 네트워크 없이 통과한다(공공 API·LLM 녹화 fixture) | CI 없이 로컬 `pytest` |
| NFR-07 보안·개인정보 | 실제 식별자·메일 본문·계약서를 커밋하지 않는다. 비밀은 `.env` | `01_project-rules.md` 6절 |
| NFR-08 관측성 | Agent Activity가 실시간으로 화면에 흐른다 | 이벤트 발생부터 타임라인 표시까지 1초 이내 `[ASSUMPTION]` |
| NFR-09 단순성 | 단일 백엔드 프로세스 + 단일 DB 파일로 로컬에서 실행된다 | 명령 1~2개로 데모 실행 |
| NFR-10 시각화 성능 | 시뮬레이터가 노트북에서 부드럽게 돈다 | 컨테이너 100개·트럭 10대에서 30fps 이상 `[ASSUMPTION]` |
| NFR-11 언어 | UI는 한국어. 코드 식별자는 영어 | — |

## 4. 사용자 여정 (요약)

1. **온보딩**: 계약서를 올리고 → 추출 후보를 확인해 규칙을 확정한다 → 목적지·자원을 등록한다(PoC는 시나리오 파일).
2. **Watchlist**: CSV를 올리고 → 검증 결과를 확인한다 → 공공 API 초기 조회로 빈 값을 채운다(OBSERVED).
3. **일상 운영**: 대시보드에서 위험과 확인 대기를 보고 → 현장 보고·충돌을 짧은 액션으로 처리한다.
4. **예외 대응**: 예외가 들어오면(사람 액션 또는 메일) → 영향 컨테이너·Exposure를 확인하고 → Recovery 계획을 검토한다 → 연락 초안을 승인·발송한다 → 회신이 반영된 재계획을 검토·승인한다.
5. **사후**: 실행 결과를 입력하고 → 절감액과 로그를 확인한다(Pilot).

전체 흐름의 구체 예는 `09_mvp-scenario.md`.

## 5. 화면 목록

| ID | 화면 | 우선 | 주요 내용 |
| --- | --- | --- | --- |
| SCR-01 | Operations Dashboard | Must | KPI, 위험 분포, 확인 대기, 신선도, 예외 목록 |
| SCR-02 | Container Detail | Must | 마일스톤, 사실별 출처·상태, Conflict, 비용 내역 |
| SCR-03 | Event Verification | Must | 확인 요청 큐, 짧은 액션 |
| SCR-04 | Recovery Console | Must | 계획 비교, 배정표, 제약, 승인 |
| SCR-05 | Communication | Must | 초안·승인·스레드·회신 추출 |
| SCR-06 | Contract / Tariff | Must | 추출 후보·근거·확인·버전 |
| SCR-07 | Operations Simulator | Must | 운영 지도 + Agent Activity Timeline (현재 2D SVG, Three.js 2.5D는 선택지) |
| SCR-08 | Watchlist / Import | Must | CSV 업로드·검증 |
| SCR-09 | 목적지·자원 | Should | 창고 수용량, ODCY, 트럭 |

화면 사이의 흐름(Wireflow)은 T-040에서 만든다.

**2026-09-15 Prototype**: SCR-01(대시보드)·SCR-04(Recovery Console 요약)·SCR-07(운영 지도, 2D)·SCR-05(연락 스레드 요약)·SCR-02(컨테이너 상세 서랍)를 한 화면 "CERA Operations Control Tower"로 먼저 만들었다(`16_frontend-prototype.md`). 데이터는 시나리오 데이터 팩의 명시값이고, 사람 액션(SCR-03 확인, 승인 버튼)은 재생 단계로만 보여준다. 화면별 분리 여부는 Prototype 검토(T-064) 뒤 T-040·T-065에서 정한다.

## 6. 알림 정책 (초안)

| 트리거 | PoC | Pilot |
| --- | --- | --- |
| 위험 등급 상승(→ HIGH, → CRITICAL) | 앱 배지 | 메일·메신저 |
| LFD 경과(과금 중) | 앱 배지 | 메일·메신저 |
| 새 Conflict / 확인 요청 | 앱 배지 | 현장 담당자 메신저 |
| 회신 도착·재계획 완료 | 앱 배지 + 타임라인 | 메일 |
| 데이터 STALE | 앱 배지 | 메일 |

`[TO VERIFY]` 외부 채널(메일, 카카오 알림톡, 슬랙 등)은 Prototype 인터뷰 뒤 정한다.
