# 22. CERA 논리 데이터 모델 (Logical Data Model)

- 상태: **rev.2.6 — T-102 공공데이터(DS-03 · DS-02) 실제 연동 (2026-10-22, 사용자 승인: `vessel_call` P0 승격).** MVP **54** · Next **0** · 만들지 않음 2 = **56**, 컬럼 **612**(+25). 물리는 `docs/24` 22.30~22.35 · M14/M15. 짝 작업표(xlsx)는 아직 rev.2.5 표기다 — 이 문서 rev.2.6 블록이 우선. 이전 상태: **rev.2.5 — T-080 물리 설계가 찾은 논리 모순 정리 (2026-09-22).** 표·컬럼 수 변화 없음(52 · 587). 발송 시도의 멱등·재시도·`UNKNOWN` 화해 · 한 번 채움(`sent_at` · `external_thread_id`) · 받은 메시지의 `drafted_by` · `current_status` · 표기 정정 4건 — 아래 rev.2.5 표. 이전: **rev.2.4 — Q-44 · Q-45 사용자 결정 반영 (2026-09-21).** rev.2.3(T-081 DONE, 사용자 최종 승인) 위에 **메일 근거 시각 선택 규칙(11.2e)** 과 **기록·내용 분리 보관 구조(29절)** 를 더했다. **논리 테이블 수 변화 없음(52).** 흐름 검증 **64개 전부 PASS**. 이전: rev.2.3 — T-081 DONE, 47개 PASS. rev.2.2 까지의 검증이 **이 문서 내부 정합성과 작업표 대조에만** 집중해, Event 속성의 정본인 **`docs/05` 4.2 와 한 번도 대조되지 않은 채** 승인됐다는 것이 T-070 에서 드러났다. rev.2.3 은 **새 설계를 벌리지 않고** 그 누락만 복구한다
- 설계 입력 기준 커밋: `1b97905` (이 설계가 읽은 요구사항·개념 모델 전 단계 문서의 기준). rev.2.1 최초 저장 커밋: `687d458`. rev.2.2 저장 커밋: `8d47a99`. **이 문서는 자기 자신의 최신 커밋을 적지 않는다** — 최신 상태는 `git log` 가 정본이다
- 승인된 입력: **`docs/21_cera-conceptual-data-model.md` rev.3 (T-076 최종 승인)**. 이 문서는 그 개념을 **DB 구조로 옮기는 것**이며 개념을 다시 열지 않는다. **rev.2.3 에서도 `docs/21` 변경 0건**
- 짝 산출물: **`docs/22_cera-logical-data-model.xlsx`** — 테이블·컬럼·타입·제약·예시를 DB 명세 형태로 본 것. **11 시트**(`00_목록` · `01_물류핵심` ~ `09_감사운영` · `10_OpenDecisions`), 테이블 블록 **53개**(MVP 52 + Next 1), 컬럼 **587개**(rev.2.4 — 내용 컬럼을 참조 + 지문으로 바꾸며 +1. rev.2.3 은 586, rev.2.2 는 52블록·557). 기본키 노랑 · 외래키 초록 · 유일 제약 분홍 · **분류와 변경 방식을 둘 다 표기**
- 다음 단계: ~~T-079~~ → ~~T-070 주변 문서 동기화~~ → ~~T-081 논리 모델 후속~~ → **T-069 구현 계획(첫 슬라이스 확정)** ← 다음 → Backend·DB 기술 결정 → **T-080 물리 설계(첫 슬라이스에 필요한 표부터)** — 28절
- 런타임·오류 처리·관측성의 행동 규칙은 **`docs/23_runtime-platform-and-observability.md`** 가 정본이다. 이 문서는 그중 **DB 에 남는 `system_error` 표**만 다룬다
- **2026-09-21 T-069: L-13 CLOSED** — 복구 맥락 = `recovery_run` 계보의 뿌리 실행 id(4절 L-13 · I-35 · I-36). **새 표·새 컬럼 없음**, 논리 테이블 수 52 그대로
- **사용자 결정 D-1~D-5 는 모두 닫혔다**(25절). **C(출처 어휘)는 2026-09-21 사용자 결정으로 닫혔다** — 11.2c. **Q-44 CLOSED · Q-45 구조 CLOSED(기간 OPEN)** — 2026-09-21 사용자 결정, 11.2e · 29절

> **rev.2.6 (T-102 · 2026-10-22 사용자 승인) 에서 고친 것** — 실제 공공 API(DS-03 선박운항정보 · DS-02 외항화물컨테이너정보) 응답을 받으려고 물류 핵심 표를 처음 만든다. 개념 모델(`docs/21`) 변경 없음. **API 응답의 모든 필드를 열로 옮기지 않는다** — CERA 가 쓰는 식별 정보 + 원문 참조만 열이고, 시각 · 선석 · 규격 같은 사실은 PUBLIC_API 사건이다(안티패턴 1).
>
> | # | 고친 것 | 어디 |
> | --- | --- | --- |
> | **G-1** | **`vessel_call` Next → MVP**. DS-02 는 B/L 로 조회할 수 없고 입항 건 키(항만 · 연도 · 횟수 · 호출부호)로만 조회된다 — 키를 보관할 표가 필요하다. 원천 필드 중 선명만 열, 선종 · 국적 · 출항지 · 톤수 · 선원 수 · 신고업체는 원문에만 | 8.5 |
> | **G-2** | 공공데이터로 등록되는 개체(`vessel_call` · `bl` · `container`)에 **처음 알게 된 원문 참조 `first_raw_input_id`** + `is_simulated` + `registered_at` | 8.1 · 8.2 · 8.5 |
> | **G-3** | `bl.bl_type` 에 **`UNKNOWN`** — DS-02 `blNo` 가 MBL 인지 HBL 인지 원천이 말하지 않는다(Q-04). 지어내지 않는다 | 8.2 |
> | **G-4** | **L-16 물리 잠정안**: `(bl_type, bl_no, bl_year)` NULLS NOT DISTINCT 유일. 다른 선사의 같은 번호가 실제로 보이면 다시 연다 | 8.2 |
> | **G-5** | `container` 는 이번에 **공공데이터가 채우는 열만** 만든다(번호 · CERA 규격 · 처음 입항 건). 선사 · 목적지 · 화물 설명 · 업무 우선순위는 쓰는 Task 에서. `size_type` 값 = `20DRY` · `40DRY` · `40HC` · `20RF` · `40RF` · `OTHER`(ISO 6346 에서 결정론 변환, 원래 코드는 사건 값) | 8.1 |
> | **G-6** | `external_identifier` 에 근거 원문 `source_raw_input_id` + `is_simulated`(근거 사건이 없는 식별자 — 적하목록관리번호). MSN 값 = `<적하목록관리번호>-<MSN>`(적하목록 안에서만 유일) | 8.4 |
> | **G-7** | **`public_data_fetch` 신설**(EVIDENCE · APPEND_ONLY) — 공공 API 호출 원장. 요청 시각 · 받은 시각 · 안전한 조회 조건 · HTTP 상태 · 결과 코드 · 결과 종류(실패 포함) · 원문 참조 · 호출 주체 · 실제/녹화. `raw_input` 은 원문 한 건이고, 원문이 없는 실패(전송 실패)와 호출 한도(Q-05) 근거는 원장이 담는다. **인증키는 어느 열에도 없다** | 8.6 |
> | **G-8** | `container_bl` 은 물리에서 **APPEND_ONLY**(정정은 사건) | 8.3 |

> **rev.2.5 (T-080 물리 설계 검토 · 2026-09-22 사용자 결정) 에서 고친 것** — 새 표 **0개** · 새 컬럼 **0개**(52표 · 587컬럼 그대로). 개념 모델(`docs/21`) 변경 없음. 물리 설계는 `docs/24`.
>
> | # | 고친 것 | 어디 |
> | --- | --- | --- |
> | **F-1** | `send_attempt.idempotency_key` 는 **시도마다 다르다**(재료 = 메시지 + 시도 번호). 논리 발송의 신원은 **메시지**. 중복 발송은 **메시지당 `SUCCESS` 1건 · 미확정 1건 · 재전송 전 `lookup_sent`** 가 막는다 — 옛 규칙(UNIQUE 키 재료 = 채널 + 메시지 + 지문 + 승인)은 "재시도 = 새 행"과 함께 설 수 없었다 | 15.7 · 15.7.3 규칙 6·7 · 17.2 |
> | **F-2** | **`UNKNOWN` 은 확정 결과가 아니다.** 화해만 `UNKNOWN` → `SUCCESS` / `RETRYABLE_FAILURE` 로 한 번 더 바꾼다. 새 표 없음 | 1.3 · 15.7 · 15.7.3 규칙 2·4 · 15.8.1 · I-18 |
> | **F-3** | `comm_message.sent_at` — `NULL` → 값 **한 번**(발송 성공 확인 뒤) | 1.3 · 15.3 |
> | **F-4** | `comm_thread.external_thread_id` — `NULL` → 값 **한 번**(첫 발송 뒤 채널이 줄 때). 유일 범위는 채널 종류 그대로(연결 참조 없음) | 1.3 · 15.1 |
> | **F-5** | `comm_message.drafted_by` · `current_status` 는 **`OUTBOUND` 만 필수**, `INBOUND` 는 비어 있다(받은 메시지에 가짜 내부 값을 넣지 않는다) | 15.3 |
> | 표기 | 감사 `result` = `SUCCESS` · `FAILURE`(29.8 의 `FAILED` 정정) · `evidence_strength` 값 = 강도 `0`~`3`(`docs/05` 3.3) · `evidence_time_quality` 작업표 예시 정정 · `event_entity_link.link_role` 필수 · 사람 명령의 `source_record_key` = 명령 id | 29.8 · 11.4 · 11.3 · 11.1 |

> **rev.2.4 (Q-44 · Q-45 사용자 결정) 에서 고친 것** — 새 표 **0개**, 논리 테이블 수 **52 그대로**.
>
> | # | 고친 것 | 어디 |
> | --- | --- | --- |
> | **Q-44** | 메일의 `source_recorded_at` 선택 규칙 — `Date` 가 정상이고 채널 수신 시각보다 **미래가 아니면** `Date`, 아니면 채널 수신 시각 + `date_header_rejected`. 원래 두 시각은 `event.payload` 에 보존 | **11.2e** · I-28 |
> | **Q-45** | **기록과 내용의 분리.** 원문·메시지 제목·본문·승인 문장·추출 인용·제안 조건 원문을 **참조 + 지문**으로 바꿨다(`message_content_ref` · `approved_content_ref` · `source_quote_ref`+`_hash` · `conditions_content_ref`+`conditions_hash`). `raw_input` 에 `attachment_manifest` | 11.1 · 12.3 · 15.3 · 15.5 · 15.9 · **29절** |
> | Q-45 | 파기 가능 조건 · 파기 감사(`audit_log` 기존 컬럼) · 파기 여부는 조회로 · 재현성 ≠ 재처리 | 29.7 ~ 29.9 · I-29 ~ I-34 · 안티패턴 11 |
> | + | 흐름 검증 **17항목 추가(총 64)** · walkthrough **27.12 메일 시각 · 27.13 내용 파기** · **정상 파기 vs 데이터 손실 구분**(29.8.1 · I-34) | 27 · 29 |
>
> **Q-45 에서 닫지 않은 것**: 보관 기간 **숫자**(Pilot 정책) · 물리 저장 위치 · 연락처 익명화·법적 보관 의무(`[TO VERIFY]`).

> **rev.2.3 (T-081) 에서 고친 것** — **승인된 규칙의 누락 복구**다. 새 제품 설계 없음. 표 **+1**(`event_verification_target`), 표 삭제 0.
>
> | # | 고친 것 | 근거 | 어디 |
> | --- | --- | --- | --- |
> | **A** | **사람 확인(`VERIFICATION`)·정정 사건**을 표현할 수 있게 했다. `event_class` · `verification_action` · `verification_method` + **새 표 `event_verification_target`** | 승인된 `docs/21` 9절 · `docs/20` **A-17**(ADR-028 `Accepted`) · `docs/03` FR-OPT-06 | 11.2 · **11.2a** |
> | **B** | **검증기 신뢰도**를 사건에 복구. `input_confidence_level` · `input_confidence_reasons`. `input_quality`(형태)와 **다른 축**임을 명시 | `docs/20` **A-02** · `docs/05` 4.6 · ADR-019(`Accepted`) 강도표 | 11.2 · **11.2b** |
> | **C** | **출처 3축 통일**(사용자 결정). `source_kind` 6값 → **`source_type` 7값**(ADR-020) · `source_role` · **`extraction_method`** 신설 · `source_id` 추가 | ADR-020 **`Accepted (구조 한정)`** | 11.1 · 11.2 · **11.2c** |
> | **D** | `docs/05` 4.2 의 나머지 누락 복구: `event_type` · `schema_version` · `correlation_id` · `payload` · **`idempotency_key` UNIQUE**(재료에 **적용 범위·주장 위치** 포함) | `docs/05` 4.2(승인된 `docs/21` 7절이 정본으로 위임) | 11.2 · **11.2d** |
> | **E** | **현재 사실의 상태 차원 복구.** 한 칸에 합쳐져 있던 것을 `value_status` · `freshness_status` · `conflict_status` · `hold_status` · `decision_usability` + `verification_basis` 로. **의미 불명이던 `canonical_fact.confidence` 제거** | ADR-020 **`Accepted`** `docs/14:252` · `docs/21` 10.2 | 11.4 · **11.4.2** |
> | **F** | **스냅샷에 상태 6차원 + 판(version) 동결** → **I-12 확장** | `docs/05` 11.5 승인 규칙 · FR-OPT-06 | **13.2.1** |
> | **G** | `extraction` 에 `schema_version` · `input_hash` · **`validator_result`**(모델 자기 점수와 구분) | 승인된 `docs/21` 13절 | 15.9 · **15.9.2** |
> | **H** | 반송·승인 취소·숫자 검사 실패 등을 **기존 구조 어디에 매핑하는지** 문서화. **새 상태 값·새 표 없음** | `docs/23` 4.1 · L-15 | **15.8.1** |
> | **+** | 무결성 규칙 **I-21 ~ I-27** · 흐름 검증 **17항목 추가(총 47)** · walkthrough **27.9 정정 · 27.10 재처리 멱등 · 27.11 범위별 멱등** | | 17.5 · 27 |
>
> **`docs/05` 4.2 의 29개 필드 전체 대응표는 23.1 절에 있다 — 누락 0건.**
>
> **주의**: `ADR-017` 은 현재 **`Proposed`** 다(`docs/14:205`). 위 A 의 근거는 ADR-017 이 아니라 **승인된 개념 모델과 Accepted ADR-028·020** 이다.

> **rev.2.2 (최종 정리) 에서 고친 것** — 최종 검증에서 나온 정합성 5건 + 기술 운영 표 1개 + 표현 잔재.
>
> | # | 고친 것 | 어디 |
> | --- | --- | --- |
> | A | `message_approval` 의 컬럼 표가 `approved_content_hash` 를 **모든 행 필수**로 적고 있었다 → **`APPROVED` 행만 필수**. 행 종류별 필수 규칙을 무결성 규칙으로도 적었다 | 15.5 · 15.5.0 |
> | B | `extraction` · `send_attempt` 가 `APPEND_ONLY` 로 적혀 있었지만 결과 컬럼을 나중에 채운다 → **생성 내용은 불변 + 정해진 결과 컬럼만 한 번 갱신**(`CONTROLLED_UPDATE`) | 15.7.3 · 15.9.1 · 1.3 |
> | C | `planning_snapshot_input.value_path` 가 **PK 일부인데 NULL 허용**이었다 → **NOT NULL**. 행 전체·판 전체를 뜻할 때도 논리적 "전체" 표시를 넣는다 | 13.2b |
> | D | `verification_request_handling` · `message_status_transition` 의 `is_simulated` 가 작업표에만 있었다 → **Markdown 누락**이었다(20절 목록에는 이미 있었다) | 11.7 · 15.8 |
> | E | 작업표의 복구 맥락 예시가 `RUN-0001` 이었다 → **자리표시자 `<RECOVERY_CONTEXT_REF>`**. 식별 방식은 L-13 이 정한다 | 4절 L-13 · 11.4.1 · 11.6.1 · 15.2.1 · 27.3 · 작업표 |
> | + | **`system_error` 신규**(기술 운영 표). `event`·`audit_log`·`send_attempt` 와 역할이 다르다 | 16.2a |
> | + | 표현 잔재: 안티패턴 번호 · 흐름 검증 절 번호 · 17.1 표 깨짐 · 17.3 논리 연결 키 누락 · 유효 승인 조건 개수 · L-1 설명 · 28절 순서 | 각 절 |
>
> **rev.2.1 에서 고친 것** (9건) — **새 테이블 0개.** 정합성만 맞췄다.
>
> | # | 고친 것 | 어디 |
> | --- | --- | --- |
> | 1 | **`conflict` 에 적용 범위 추가.** 충돌은 같은 범위 안에서만 생긴다 | 11.5.1 |
> | 2 | **`verification_request` 에 적용 범위 추가** | 11.6.1 |
> | 3 | **`request_key` 재료에 적용 범위 포함** | 11.7.2 |
> | 4 | **`question_item` 에 대상 적용 범위 추가.** Backend 가 질문 만들 때 확정한다 | 15.2.1 |
> | 5 | **`question_item.verification_request_key` 도 DB 외래키가 아니다** | 15.2.2 |
> | 6 | **발송 지문 비교 대상을 메시지 종류별로 분리** | 15.7.2 |
> | 7 | **승인 행 종류별 필수 컬럼 분리** | 15.5.0 |
> | 8 | **분류(Classification)와 변경 방식(Mutation Policy) 분리** | 1 |
> | 9 | **`contact_verification` 의 생애주기 갱신 명시** | 10.4.1 |
>
> **rev.2 에서 고친 것** — 자세한 내용은 각 절에 적었다.
>
> | # | 고친 것 | 어디 |
> | --- | --- | --- |
> | 1 | `raw_input.payload_hash` 유일 제약 제거 · 출처 전달 키 도입 | 11.1 |
> | 2 | 확인 요청 처리 기록의 `request_key` 를 **DB 외래키가 아닌 논리 연결 키**로 | 11.7.1 |
> | 3 | `request_key` 재료에서 **파생 대리키 제거** | 11.7.2 |
> | 4 | 계획 조건·마스터 기본값·요율을 **스냅샷에 얼린다**(표 2개 신규) | 13.2a · 13.2b |
> | 5 | 승인 시점에 **구조화 숫자까지 고정**(표 2개 신규) | 15.4 · 15.6 |
> | 6 | 승인의 **취소·만료·계획 교체 무효**를 UPDATE 없이 | 15.5.1 |
> | 7 | **주소 확인 메일**을 업무 승인 게이트의 예외로 | 15.3.1 · 15.7.1 |
> | 8 | `ACTUAL_REPORTED` 를 **MVP 계산 결과에서 제거** | 14.2 |
> | 9 | `event.source_tier` 제거 → **원천 축만 남기고 근거 강도는 파생으로** | 11.2 · 11.4 |
> | 10 | **사건마다 SUBJECT 정확히 1건** | 11.3 |
> | 11 | `bl` 을 **번호 하나 + 종류 + 부모 참조**로 | 8.2 |
> | 12 | **적용 범위와 유효 기간을 분리** | 22 |
> | 13 | 계획 조건 **해제도 새 행**(append-only 모순 제거) | 13.6 |

> **이 문서가 답하는 질문**: "CERA에 무엇이 존재하는가"가 아니라 **"승인된 개념을 DB에서 어떤 테이블·컬럼·관계·제약으로 표현할 것인가"**.
>
> **여전히 정하지 않는 것**(이 문서 안에서): DB 제품(PostgreSQL·MySQL·SQLite) · ORM · Backend 언어 · 실제 `CREATE TABLE` · vendor 전용 타입 · 인덱스 세부 · 파티션 · 복제 · 큐 · 배포 · 마이그레이션 도구 · API endpoint · LLM 공급자·모델 · 솔버와 그 내부 표현 · 위험·신선도·근거 강도의 실제 임계값.

## 0. 논리 타입 표기 (vendor 중립)

| 표기 | 뜻 |
| --- | --- |
| `STRING(n)` | 문자열. 길이는 후보값이며 DB 제품 확정이 아니다 |
| `TEXT` | 길이 제한 없는 문자열 |
| `INTEGER` · `BIGINT` | 정수 |
| `DECIMAL(p,s)` | 고정소수 (수량·환율) |
| `BOOLEAN` | 참·거짓 |
| `TIMESTAMP_TZ` | **시간대가 붙은 시각** (Asia/Seoul). 시간대 없는 시각 타입은 쓰지 않는다 |
| `DATE` | 날짜 |
| `TIME` | 시각(시·분) |
| `JSON` | 구조화 값. 조회 대상이 아닌 부가 정보·원문 구조 보관용 |
| `CODE` | 코드값. 물리 표현(DB enum / 코드 테이블 / 앱 상수)은 18절에서 분류 |
| `REF(table)` | 다른 테이블 참조 |
| `HASH` | 내용 해시 (길이는 물리 설계) |

**금액**: 원화는 `BIGINT`(원 단위 정수). 외화는 7절의 금액 컬럼 묶음.

## 1. 두 가지 축: 분류와 변경 방식

**rev.2.1 수정** — rev.2 는 분류 하나에 "이 데이터가 무엇인가"와 "어떻게 고치는가"를 같이 담았다. 그래서 `SOURCE_OF_TRUTH` = 덧붙이기만 이라고 적었는데, 실제 설계에는 **정해진 컬럼만 고치는 곳**이 있다(`contact_verification.used_at` · `comm_thread.thread_status` · `comm_message.current_status`). 두 축을 나눈다.

### 1.1 분류 (Classification) — 이 데이터가 시스템에서 무슨 역할인가

| 분류 | 뜻 |
| --- | --- |
| `SOURCE_OF_TRUTH` | 잃으면 복구할 수 없다 |
| `EVIDENCE` | 근거·원문 보관 |
| `DERIVED_MATERIALIZED` | 파생이지만 저장한다. **지우고 재생성 가능해야 한다** |
| `PERSISTED_OUTPUT` | 계산 결과를 이력으로 보존한다. **Source of Truth 가 아니다** |
| `DECISION_RECORD` | 사람의 결정 기록 |
| `MASTER` | 등록 정보 |
| `SIMULATION_ONLY` | 시뮬레이션 자산 |

### 1.2 변경 방식 (Mutation Policy) — 만든 뒤 어떻게 다루나

| 방식 | 뜻 |
| --- | --- |
| `APPEND_ONLY` | 행을 만든 뒤 **어떤 컬럼도 고치지 않는다.** 정정·해제·무효화는 전부 새 행 |
| `REBUILDABLE` | 전부 지우고 원천에서 다시 만들 수 있다. 재계산이 덮어쓴다 |
| `CONTROLLED_UPDATE` | **정해진 컬럼만**, 정해진 생애주기로 고친다. 그 컬럼과 조건을 표마다 명시한다 |
| `IMMUTABLE_AFTER_CREATE` | 만든 뒤 **내용**은 고치지 않는다 |
| `CACHE_UPDATE` | 다른 표를 접어 둔 값이라 갱신한다. **지워도 원본에서 다시 만든다** |
| `VERSION_REPLACEMENT` | 고치지 않고 **새 판**을 만들어 갈아 끼운다 |

> **"Source of Truth = 무조건 덧붙이기만"이라는 일반 문장은 쓰지 않는다.** 덧붙이기는 표마다 붙는 명시적 불변식이지 분류에서 자동으로 따라오는 성질이 아니다.

### 1.3 두 축의 조합 (대표적인 것)

| 표 | 분류 | 변경 방식 | 무엇이 고쳐지나 |
| --- | --- | --- | --- |
| `event` | `SOURCE_OF_TRUTH` | `APPEND_ONLY` | 아무것도. 정정은 새 행, 확인도 새 행 (rev.2.3) |
| `event_verification_target` | `SOURCE_OF_TRUTH` | `APPEND_ONLY` (rev.2.3 신규) | 아무것도. 확인 취소는 `REVOKE` 사건이다 (11.2a) |
| `message_approval` | `DECISION_RECORD` | `APPEND_ONLY` | 아무것도. 무효화는 새 행 |
| `operator_planning_constraint` | `DECISION_RECORD` | `APPEND_ONLY` | 아무것도. 해제는 새 행 |
| `plan_decision` | `DECISION_RECORD` | `APPEND_ONLY` | 아무것도. 결정이 바뀌면 새 결정 행이다 (13.5) |
| `canonical_fact` | `DERIVED_MATERIALIZED` | `REBUILDABLE` | 재계산이 전부 덮어쓴다 |
| `conflict` · `verification_request` | `DERIVED_MATERIALIZED` | `REBUILDABLE` | 같다 |
| `comm_message` | `SOURCE_OF_TRUTH` | **내용 `IMMUTABLE_AFTER_CREATE` + 포인터 `CACHE_UPDATE` + 한 번 채움** (rev.2.5) | `current_status` · `current_approval_id`(캐시) + **`sent_at` 은 `NULL` → 값 한 번**(발송 성공이 확인된 뒤). **제목·본문·구조화 값은 절대 아니다** |
| `send_attempt` | `SOURCE_OF_TRUTH` | **요청 `IMMUTABLE_AFTER_CREATE` + 결과 `CONTROLLED_UPDATE`** (rev.2.2 · rev.2.5) | 결과 5컬럼(`finished_at` · `result` · `error_code` · `error_message` · `provider_message_id`)만 — `NULL` → 결과 한 번, **`UNKNOWN` 이면 화해로 한 번 더**(`SUCCESS` 또는 재전송 가능 실패). 식별·승인·지문·멱등 키는 절대 아니다 (15.7.3) |
| `extraction` | `EVIDENCE` | **추출 결과 `IMMUTABLE_AFTER_CREATE` + 검토 `CONTROLLED_UPDATE`** (rev.2.2) | 검토 4컬럼(`review_status` · `reviewed_by_actor_id` · `reviewed_at` · `created_event_id`)만. **후보 값·인용·모델 판은 절대 아니다** (15.9.1) |
| `system_error` | `EVIDENCE` | `APPEND_ONLY` (rev.2.2 신규) | 아무것도. 오류 발생 기록 자체는 고치지 않는다 (16.2a) |
| `contact_verification` | `SOURCE_OF_TRUTH` | `CONTROLLED_UPDATE` | `used_at` · `result` 만 (10.4) |
| `comm_thread` | `SOURCE_OF_TRUTH` | `CONTROLLED_UPDATE` | `thread_status` · `last_activity_at` + **`external_thread_id` 는 `NULL` → 값 한 번**(첫 발송 뒤 채널이 줄 때, rev.2.5) |
| `question_item` | `SOURCE_OF_TRUTH` | `CONTROLLED_UPDATE` | `question_status` 만. **대상 개체·사실 키·범위는 절대 아니다** |
| `tariff_rule` | `MASTER` | `VERSION_REPLACEMENT` | 아무것도. 새 판을 만든다 |
| `container` · `facility` · `counterparty` 등 | `MASTER` | `CONTROLLED_UPDATE` | 등록 정보. 삭제 대신 `is_active = false` |
| `scenario` | `SIMULATION_ONLY` | `CONTROLLED_UPDATE` | 시나리오 메타 |

**표마다의 변경 방식은 각 절 머리에 적혀 있다.** 위는 읽는 법을 보여 주는 요약이다.

> **rev.2.4 — 내용 파기는 위 어느 표의 `UPDATE` 도 아니다.** 원문·본문·인용·승인 문장·조건 원문은 기록 행 밖의 **보관 관리 내용**이고, 기록 행은 참조와 지문만 갖는다. 파기되는 것은 내용이지 행이 아니다(29절).

## 2. 전체 테이블 목록

| 구분 | 개수 | 바뀐 과정 |
| --- | --- | --- |
| **MVP 논리 테이블** | **54** | rev.1 46 → rev.2 50 (**+4**) → rev.2.2 51 (**+1**, `system_error`) → rev.2.3 **52** (**+1**, `event_verification_target`) → **rev.2.6 54** (**+2**: `vessel_call` 승격 · `public_data_fetch` 신설) · rev.2.4 **52** (변화 없음 — 보관 관리 내용은 표가 아니다, 29.1) |
| Next (구조만 두고 MVP 에서 쓰지 않음) | **0** | rev.2.6 에서 `vessel_call` 이 MVP 로 |
| **MVP 에서 만들지 않음** (요구가 생기면 다시 연다) | **2** (`exception_case` · `operational_plan_batch`) | rev.2 에서 **OPEN → 결정 완료**(D-4 · D-5) |
| 표에 적은 것 전체 | **56** | 49 → 53 → 54 → 55 → 56 |

**rev.2.3 에서 늘어난 표 1개** — `event_verification_target`(11.2a). 새 업무 개념이 아니라 **승인된 `docs/21` 9절의 확인 부류(`VERIFICATION`)가 무엇을 가리키는지**를 담는 관계 표다. 개념 모델을 다시 열지 않는다. 같은 rev 에서 **표가 줄어든 곳은 없다.**

**rev.2.2 에서 늘어난 표 1개** — `system_error`. **업무 도메인 개념이 아니라 기술 운영(관측성) 표**다. 승인된 개념 모델(`docs/21`)의 저장 개념이 아니므로 개념 모델을 다시 열지 않고, 23절 추적표에 "개념 모델 밖 기술 운영 표"로 따로 적었다. 행동 규칙(무엇을 기록하나·어떻게 기록하나)의 정본은 `docs/23` 이다.

**rev.2 에서 늘어난 표 4개** — 전부 **"계산·승인에 실제로 쓴 값을 얼린다"** 는 같은 이유다.

| 새 표 | 왜 필요했나 |
| --- | --- |
| `planning_snapshot_constraint` | 당시 걸려 있던 **운영자 계획 조건**을 재현하려고 |
| `planning_snapshot_input` | 당시 쓴 **마스터 기본값·요율 규칙·정책 판**을 재현하려고 |
| `comm_message_structured_field` | 메시지의 **숫자를 문장에서 분리**하고 출처를 남기려고 |
| `message_approval_structured_field` | 운영자가 **승인한 그 숫자**를 얼리려고 |

**삭제된 표는 없다.**

| 도메인 | 테이블 |
| --- | --- |
| A. 물류 핵심 (6 — rev.2.6) | `container` · `bl` · `container_bl` · `external_identifier` · `vessel_call`(rev.2.6 MVP) · **`public_data_fetch`**(rev.2.6) |
| B. 시설·자원 (5) | `facility` · `facility_warehouse` · `facility_terminal` · `facility_odcy` · `truck_pool` |
| C. 거래처·연락처 (5) | `counterparty` · `counterparty_contact` · `contact_channel_address` · `contact_verification` · `channel_connection` |
| D. 사건·현재 상태 (8) | `raw_input` · `event` · `event_entity_link` · **`event_verification_target`**(rev.2.3) · `canonical_fact` · `conflict` · `verification_request` · `verification_request_handling` |
| E. 계약·요율 (4) | `contract` · `tariff_rule` · `commercial_offer` · `commercial_offer_item` |
| F. 계획·최적화 (8) | `planning_snapshot` · `planning_snapshot_fact` · **`planning_snapshot_constraint`** · **`planning_snapshot_input`** · `recovery_run` · `assignment` · `plan_decision` · `operator_planning_constraint` |
| G. 위험·비용 (4) | `risk_assessment` · `cost_result` · `cost_line_item` · `cost_line_link` |
| H. 외부 통신 (10) | `comm_thread` · `question_item` · `comm_message` · **`comm_message_structured_field`** · `comm_message_question` · `message_approval` · **`message_approval_structured_field`** · `message_status_transition` · `send_attempt` · `extraction` |
| I. 주체·감사·운영 (3) | `actor` · `audit_log` · **`system_error`**(rev.2.2) |
| J. 시뮬레이션 (1) | `scenario` |
| MVP 에서 만들지 않음 | `exception_case`(D-5) · `operational_plan_batch`(D-4) |

## 3. 테이블로 만들지 않은 개념과 그 이유

승인된 개념 모델에서 **저장 개념이 아니라고 판정된 것**은 테이블이 되지 않는다. 여기서 다시 확인한다.

| 개념 | 테이블이 아닌 이유 | 어디에 있나 |
| --- | --- | --- |
| Destination (목적지) | 관계에 붙은 역할 | `container.destination_facility_id` + `assignment.to_facility_id` |
| Carrier (선사) | 거래처의 역할 | `container.carrier_counterparty_id` → `counterparty` |
| SlotPool (VBS) | 터미널의 자원 단위 | 슬롯 가용은 `event`/`canonical_fact` 의 사실 (주체 = 터미널) |
| Resource Availability (수용량·가용 대수) | **마스터가 아니라 사실** | `event` → `canonical_fact` |
| Rate Fact (요율 사실) | 사실 | `event` → `canonical_fact` (`fact_kind = TERM`) |
| Canonical Rate (현재 요율) | 현재 사실의 한 종류 | `canonical_fact` |
| Applied Rate (적용 요율) | 계산 결과의 일부 | `cost_line_item.tariff_rule_id` + `cost_line_link` |
| Route Leg (구간) | 값 객체 | 구간 운임은 사실 키의 파라미터, 배정은 `from/via/to_facility_id` |
| Money | 값 객체 | `cost_line_item` 의 금액 컬럼 묶음 (7절) |
| Phase (단계) | 파생. **원본으로 저장 금지** | 조회 시 유도 (21절) |
| Impacts (자원 영향) | 계산 결과, 저장 안 함 | `risk_assessment` 의 산출값 |
| Activity Timeline | 조합 뷰 | 다섯 원본을 합쳐 조회 |
| Operational Plan (개별 예정 값) | PLAN 종류의 사실 | `event` → `canonical_fact` |
| Extraction Candidate | 추출 기록의 내용 | `extraction.candidate_value_text` + `source_quote_ref`(인용은 보관 관리 내용, 29절) |
| Structured Draft Field | 메시지가 싣는 값 | **`comm_message_structured_field`** (값 · 단위 · 출처 실행 · 출처 질문 · 출처 경로) |
| Truck (개별 차량) | MVP 아님 | — (도입 시 `truck` 신설, `assignment` 에 컬럼 추가) |

### 3.1 만들지 않는 안티패턴 (논리 설계 금지 목록)

| # | 금지 | 이 설계에서 어떻게 피했나 |
| --- | --- | --- |
| 1 | `container.current_phase` 를 원본처럼 저장 | `container` 에 상태 컬럼이 **없다**. 단계는 조회 시 유도 |
| 2 | `facility_warehouse.capacity` 를 현재값 하나로 덮어쓰기 | 일별 수용량은 **사실**이다. 마스터에는 `default_capacity_per_day`(평시 기준선)만 두고 이름으로 구분 |
| 3 | `comm_message.approved = true` 하나로 승인 이력 표현 | `message_approval` 덧붙이기 테이블 + 메시지에는 **현재 승인 포인터만** |
| 4 | 제안 금액과 현재 요율을 둘 다 정본으로 | `commercial_offer_item` 은 `EVIDENCE`, 계산 정본은 `canonical_fact` **하나** |
| 5 | 계획 조건을 `facility.is_active = false` 로 변환 | `operator_planning_constraint` 별도 테이블. 자원 마스터·사실을 건드리지 않는다 |
| 6 | 위험·비용 값을 사용자가 UPDATE | `risk_assessment`·`cost_result`·`cost_line_item` 은 `PERSISTED_OUTPUT` **덧붙이기만** |
| 7 | 스냅샷이 현재 사실을 FK 로만 가리켜 과거 입력이 변함 | **`planning_snapshot_fact` 로 값을 복사**한다 (13.2절) |
| 8 | `audit_log` 를 Operational Event 로 사용 | 두 테이블이 분리돼 있고 `audit_log` 는 현재 상태에 영향을 주지 않는다 |
| 9 | 추출 결과를 바로 `canonical_fact` 로 저장 | `extraction` → (검증) → `event` → Reconciliation → `canonical_fact` |
| 10 | 시나리오 데이터를 실제와 구분 불가하게 저장 | 모든 입구 테이블에 `is_simulated` + `scenario_id`, 조회 규칙 (20절) |
| **11** | **민감한 내용(원문·본문·인용·승인 문장)을 불변 기록 행의 컬럼에 직접 저장** — 그러면 파기하려면 불변 규칙을 깨야 한다 | 기록에는 **참조 + 지문**만, 내용은 **보관 관리 내용**으로 (29절, rev.2.4) |

---

## 4. 열린 질문 판정 (논리 설계 전에 정리)

각 질문을 **문제 → 근거 → 선택지 → 장단점 → 추천 → 되돌리기 난이도 → 사용자 결정 필요 여부 → 스키마 반영**으로 정리했다.
**근거가 충분하지 않은 것은 억지로 확정하지 않고 `OPEN — 사용자 결정 필요`로 남겼다.**

> **rev.2 갱신**: 사용자 결정 **D-1~D-5 가 모두 닫혔다**(25절). 그리고 검토에서 rev.1 의 판정 두 건에 문제가 있어 고쳤다 — **Q-59**(`request_key` 재료에 파생 대리키가 들어가 있었다)와 **L-3b**(적용 대상을 사실의 주체로만 정할 수 있다고 본 것). 신규 열린 질문 **L-13 ~ L-16** 을 아래에 더했다.

### Q-54 외부 시스템 식별자 저장 구조

- **문제**: 화물관리번호·적하목록관리번호·MSN 은 관세청·해수부가 발급한다. B/L 컬럼인가, 별도 구조인가.
- **근거**: `docs/21` 7절이 이들을 `EXTERNAL_REFERENCE` 로 분류. `docs/data/field-dictionary.md` 가 7개 속성 정의. 통신 쪽에도 외부 id(외부 메시지·스레드)가 있다.
- **선택지**: ① B/L 컬럼 ② 범용 `external_identifier` 테이블 ③ 둘 다.
- **장단점**: ①은 단순하지만 출처가 늘 때마다 컬럼이 는다. ②는 일반적이지만 매 조회에 조인이 붙는다.
- **추천 ③ (용도로 나눈다)**: **조회 경로에서 매번 쓰이는 외부 id 는 컬럼**(`comm_message.external_message_id`, `comm_thread.external_thread_id` — 수신 멱등 판정에 필수), **발급 기관이 여러 곳이고 늘어나는 화물·통관 식별자는 `external_identifier` 테이블**.
- **되돌리기**: 쉬움(컬럼 추가·데이터 이관).
- **사용자 결정**: 불필요.
- **반영**: `external_identifier(owner_type, owner_id, issuing_system, id_type, id_value)` + `UNIQUE(issuing_system, id_type, id_value)`.

### Q-55 Facility 논리 구조

- **문제**: 단일 다형 / 공통 + 타입별 상세 / 타입별 분리.
- **근거**: `docs/20` 10.2 — 공통은 식별·위치·시간 운영 조건이고, **용량의 차원·요율·규격 제한·보관 제한이 종류마다 다르다**. `docs/07` 4절은 단일 다형(JSON), `docs/05` 14.1과 시나리오는 타입별 분리로 서로 달랐다.
- **선택지**: ① 단일 테이블 + JSON ② 공통 + 타입별 상세 ③ 완전 분리.
- **장단점**: ①은 제약을 걸 수 없고 타입별 필수값을 강제 못 한다. ③은 시설이라는 공통 참조(구간·위치·목적지)를 잃는다.
- **추천 ②**: `facility`(공통) + `facility_warehouse` / `facility_terminal` / `facility_odcy`(1:1 상세). 상세 테이블의 PK 가 곧 `facility_id` 이므로 조인이 단순하고 타입별 NOT NULL 을 걸 수 있다.
- **되돌리기**: 보통.
- **사용자 결정**: 불필요.
- **반영**: B 도메인 4개 테이블. `facility.facility_type` 이 어느 상세 테이블이 있어야 하는지를 정한다.

### Q-58 환율·환율 기준일

- **문제**: 독립 엔티티인가, 요율 규칙 내부인가, 계산 결과 내부인가.
- **근거**: `docs/01` 5.3 — 외화는 **환율과 기준일을 함께 기록한 뒤** 원화로 바꾼다. 저장소에 환율 시계열 요구가 없다.
- **추천**: **독립 테이블을 만들지 않는다.** 환산이 일어나는 곳(비용 줄)에 금액 컬럼 묶음으로 둔다. 요율 규칙의 외화 구간은 규칙 본문에 통화를 남기고, **환산 결과와 그때 쓴 환율은 비용 줄에 남는다**.
- **되돌리기**: 쉬움(나중에 환율 테이블을 추가해도 과거 기록은 그대로 재현된다).
- **사용자 결정**: 불필요.
- **반영**: `cost_line_item` 의 `original_currency` · `original_amount` · `fx_rate` · `fx_rate_basis_date` · `amount_krw`.

### Q-59 확인 요청의 파생 목록과 사람 처리 이력

- **문제**: 목록은 파생인데 사람의 처리는 원본이다. 파생 테이블을 지우면 처리 이력이 사라진다.
- **근거**: `docs/05` 11.2, `docs/20` 7.2.
- **추천**: 두 테이블로 나누고, 처리 이력이 파생 테이블의 **대리키를 참조하지 않게** 한다. `verification_request` 에 결정적 `request_key` 를 두고 `verification_request_handling` 은 그 키로 잇는다.
- **되돌리기**: **어려움.** 처음부터 이렇게 하지 않으면 재생성 한 번에 이력이 끊긴다.
- **사용자 결정**: 불필요(구조 문제).
- **반영**: `verification_request(request_key UNIQUE)` · `verification_request_handling(request_key)` — **DB 외래키가 아니라 논리 연결 키**(11.7.1).

> **rev.2 정정 두 가지.**
>
> 1. rev.1 은 `request_key` 의 재료에 **`conflict_id` 를 넣었다.** `conflict` 는 파생이라 재계산 때 대리키가 달라질 수 있고, 그러면 같은 상황인데 키가 바뀌어 **과거 처리 기록을 못 찾는다.** 이 구조가 막으려던 바로 그 문제다. 재료를 **불변 정보**로 바꿨다(11.7.2).
> 2. rev.1 은 처리 기록의 `request_key` 를 **DB 외래키**라고 적었는데, 그러면 "요청이 사라져도 기록은 남는다"와 동시에 성립할 수 없다. **논리 연결 키**로 고쳤다(11.7.1).

### Q-60 비용 줄의 저장 구조와 귀속

- **문제**: 비용 줄이 배정 하나에만 붙지 않는다. 계획 전체·여러 컨테이너 공통·시설·요율 규칙·요율 사실에 걸릴 수 있다.
- **근거**: `docs/21` 15절, rev.2 에서 귀속을 완화함.
- **선택지**: ① nullable FK 를 여러 개 둔다 ② 별도 연결 테이블.
- **장단점**: ①은 컬럼이 5~8개 비어 있는 희소 구조가 되고 무슨 역할로 붙었는지를 표현하지 못한다.
- **추천 ②**: `cost_line_item` 은 **부모(`cost_result_id`)만 필수**로 두고, 귀속과 근거를 **`cost_line_link(link_role, target_type, target_id)`** 한 테이블로 표현한다. `link_role` 은 `ATTRIBUTION`(어느 대상 때문에 생긴 비용인가) / `BASIS`(어느 요율·제안·규칙이 근거인가).
- **되돌리기**: 보통.
- **사용자 결정**: 불필요.
- **반영**: G 도메인 `cost_line_item` + `cost_line_link`.

### Q-62 Actor 저장 구조

- **문제**: 승인·확인·결정이 가리킬 주체. 인증·조직·권한 모델은 만들지 않는다.
- **근거**: `docs/21` 4.5 · `docs/15` Q-62.
- **추천**: **최소 테이블 하나.** `actor(actor_id, actor_type, display_name, is_active)`. `actor_type` 은 운영자·CERA 시스템·(향후) 서비스 계정을 표현할 수 있으면 충분하고 **값을 필요 이상으로 늘리지 않는다**.
- **되돌리기**: 쉬움.
- **사용자 결정**: 불필요.
- **반영**: I 도메인.

### Q-63 사실 키의 날짜·시간창 표현

- **문제**: `capacity.day(2026-10-13)` 처럼 파라미터를 문자열에 인코딩한다. 범위 질의·인덱싱·타입 안전성이 약하다.
- **근거**: `docs/20` 8절 #13, `docs/05` 4.3.
- **선택지**: ① 문자열 유지 ② 파라미터 컬럼 분해 ③ 둘 다.
- **장단점**: ①은 10/13~10/15 창고 수용량 같은 범위 질의가 어렵다. ②는 **사건의 불변성**과 충돌한다 — 사건은 원문 그대로의 키를 보존해야 한다.
- **추천 ③ (층을 나눈다)**: **`event.fact_key` 는 문자열 그대로 보존**(불변·계약 유지). **파생인 `canonical_fact` 에만 파라미터를 분해한 컬럼**(`fact_name` · `param_date` · `param_slot_start` · `param_size_type`)을 둔다. 파생 테이블은 언제든 재생성되므로 분해 규칙이 바뀌어도 안전하다.
- **되돌리기**: 쉬움(파생 쪽만 다시 만든다).
- **사용자 결정**: 불필요.
- **반영**: `event.fact_key STRING(120)` + `canonical_fact` 의 분해 컬럼 4개.

### L-1 QuestionItem 저장 구조

- **문제**: 회신 값을 사실 키로 **LLM 없이** 매핑해야 한다.
- **근거**: `docs/18` D.3 — LLM 은 `ask_id` + 값 + 원문 인용만 낸다. 매핑은 Backend.
- **추천**: `question_item` 을 `comm_thread` 의 종속 테이블로 두고, **질문을 만들 때 대상을 미리 확정해 컬럼으로 저장**한다: `target_entity_type` · `target_entity_id` · `target_fact_key` · **`target_applicability_scope_type` · `target_applicability_scope_ref`**(rev.2.1) · `expected_value_type` · `expected_unit`. 그러면 추출 결과 매핑은 **`ask_id` 로 행 하나를 찾는 것**으로 끝나고, **개체·사실 키·적용 범위가 전부 그 행에서 나온다.** LLM 이 사실 키나 범위를 정할 여지가 구조적으로 사라진다(15.2.1).
- **되돌리기**: 어려움(추출 계약과 맞물린다).
- **사용자 결정**: 불필요.
- **반영**: `question_item`, `UNIQUE(thread_id, ask_id)`.

### L-2 Container 와 B/L 의 관계

- **문제**: MVP 는 Import FCL 로 N:1 이지만 혼재(LCL)를 구조로 배제하지 않기로 했다.
- **근거**: `docs/21` 5.1 — ER 은 N:1, 코드표에 혼재 코드 관측, 초기 범위는 FCL.
- **선택지**: ① `container.bl_id` 컬럼 ② 연결 테이블 `container_bl`.
- **장단점**: ①은 단순하지만 LCL 이 오면 스키마 변경 + 데이터 이관이 필요하다. ②는 지금 조인이 하나 늘지만 나중에 제약만 풀면 된다.
- **추천 ②**: `container_bl(container_id, bl_id, link_role)` + **MVP 에서는 컨테이너당 주 B/L 1건을 강제하는 부분 유일 제약**. 구조는 열어 두고 동작은 FCL 로 제한한다.
- **되돌리기**: ①을 골랐다가 바꾸는 것은 **어려움**. ②는 제약만 푸는 것이라 쉬움.
- **사용자 결정**: **완료 — D-1 CLOSED (2026-09-17): `container_bl` 연결 테이블을 유지한다.** MVP 는 FCL 이지만 LCL·혼재 확장을 구조로 막지 않는다(25절).
- **반영**: `container_bl` + 주 B/L 부분 유일 제약.

### L-3 RateQuote / CommercialOffer 구조

- **문제**: 제안 묶음이 독립 테이블이어야 하는가. 헤더 + 항목이 필요한가.
- **근거**: `docs/21` 5.6 — 제안 묶음(A) / 요율 사실(B) / 현재 요율(C) 세 층. 한 통의 메일이 보관료·핸들링료·최대 보관일을 함께 담는다.
- **추천**: **`commercial_offer`(헤더) + `commercial_offer_item`(항목)**, 분류는 **`EVIDENCE`**. 항목은 상대가 제시한 값 그대로 보관하고, **계산에 쓰는 값의 정본은 `canonical_fact` 하나**다. 항목에서 만들어진 사건을 `commercial_offer_item.created_event_id` 로 연결해 추적한다.
- **되돌리기**: 보통.
- **사용자 결정**: **완료 — D-2 CLOSED (2026-09-17): `commercial_offer` + `commercial_offer_item` 을 MVP 에 만든다.** 근거(Evidence)이고 계산 정본은 여전히 현재 사실이다(25절).
- **반영**: E 도메인 2개.

### L-3b 운영자 직접 입력 요율의 적용 대상·기간

- **문제**: 우리 제2창고라 보관료 0원 이 **언제까지, 무엇에** 적용되는가. 정하지 않으면 한 번의 입력이 영구 현재 요율처럼 남는다.
- **근거**: `docs/15` L-3b, `docs/21` 12.5.2 B.
- **추천(구조, rev.2 수정)**: 상대의 견적과 **같은 경로**(사건 → 현재 사실)를 타되, **시간 범위와 적용 대상 범위를 서로 다른 두 축으로 나눈다**.
  - **유효 기간(Validity)** = `event.valid_from` · `event.valid_until` → `canonical_fact` 가 이어받는다
  - **적용 대상 범위(Applicability Scope)** = `event.applicability_scope_type` · `applicability_scope_ref` → `canonical_fact` 가 이어받는다
- **되돌리기**: 범위 축을 나중에 넣는 것은 **어렵다.** 그 전에 들어온 "0원"들이 범위 없이 저장돼 있어 무엇에 적용되는지 되살릴 수 없다.
- **사용자 결정**: **완료 (D-3 CLOSED)** — 안전한 기본값은 **현재 복구 맥락에만 적용**.
- **반영**: `event` · `canonical_fact` 의 범위 2컬럼 + 22절.

> **rev.1 의 판단이 틀렸던 부분.** rev.1 은 "적용 대상은 **사실 키의 주체**로 자연스럽게 정해진다(시설 단위 요율은 그 시설에만 적용)"고 적었다. 그런데 주체가 창고 B 라는 것은 **"창고 B 에 관한 이야기"라는 뜻이지 "창고 B 의 모든 건에 적용된다"는 뜻이 아니다.**
>
> ```
> "Warehouse B 는 이번 건 보관료 0원"      ← 이번 복구 맥락에만
> "Warehouse B 는 A 계약 건만 0원"          ← 특정 계약에만
> "Warehouse B 는 이 컨테이너만 0원"        ← 특정 컨테이너에만
> "Warehouse B 는 이제부터 계속 0원"        ← 시설 전체에 계속
> ```
>
> 네 가지 모두 **주체는 창고 B 이고 fact_key 도 같다.** 주체만으로는 구분되지 않는다. 그래서 범위 축을 따로 둔다(22절).

### L-4 시설 운영 조건이 마스터인가 사실인가

- **문제**: 받는 규격·당일 마감·이동 시간·왕복 슬롯이 마스터 컬럼인가 사실인가.
- **근거**: `docs/21` 8.4 F-5 — 오늘만 마감이 당겨졌다가 생기면 사실이어야 한다.
- **추천**: **둘 다, 역할을 나눠서.** 마스터 컬럼은 **기본값(평시 조건)**이고, 날짜·슬롯별로 달라지는 관측은 **사실**로 들어와 그날에 한해 기본값을 이긴다. 계산은 그날 사실이 있으면 사실, 없으면 마스터 기본값으로 읽는다.
- **되돌리기**: 쉬움.
- **사용자 결정**: 불필요(단, 어떤 조건이 실제로 날마다 바뀌는지는 현업 검증 대상).
- **반영**: `facility_warehouse` 등의 컬럼 이름에 **`default_`** 접두를 붙여 기본값임을 드러낸다.

### L-5 운영 계획의 배차 자원 수준

- **문제**: 시나리오의 운영 계획에는 차량 id 가 있는데 개별 차량은 MVP 가 아니다.
- **근거**: `docs/21` 5.4 · 8.4 F-2.
- **추천**: `plan.*` 사실을 **차량이 아니라 풀·슬롯 수준**으로 둔다(`plan.truck_pool`, `plan.depart_slot`). 개별 차량이 도입되면 그때 사실 키를 추가한다.
- **되돌리기**: 쉬움.
- **사용자 결정**: 불필요.
- **반영**: 사실 키 카탈로그(T-034)에 반영할 항목. 테이블 변경 없음.

### L-6 예외 건의 종결 표현

- **문제**: 예외가 언제 해소됐는지를 사실에서 유도할지 사람의 선언으로 둘지.
- **추천**: **L-10 과 함께 결정한다.** 예외 건을 테이블로 만들면 종결은 그 테이블의 컬럼이고, 파생 뷰로 두면 사실에서 유도해야 한다.
- **사용자 결정**: **L-10 에 포함**.

### L-7 발송 시도를 별도 테이블로 둘지

- **문제**: 메시지의 `attempt_count` · `last_error` 로 충분한가.
- **근거**: `docs/19` 가 실패 사유 코드와 재시도 가능 여부를 요구한다.
- **추천**: **별도 `send_attempt` 테이블.** 시도마다 시각·결과·실패 코드·채널 응답을 남겨야 몇 번째 시도가 왜 실패했는지를 설명할 수 있다. 메시지에는 요약값(마지막 시도 참조)만 둔다.
- **되돌리기**: 보통(요약값만 있으면 과거 시도 이력을 복구할 수 없다).
- **사용자 결정**: 불필요.
- **반영**: H 도메인 `send_attempt`.

### L-8 시나리오 데이터의 저장소 분리

- **문제**: 시나리오 데이터를 제품 저장소와 같은 곳에 둘지.
- **근거**: ADR-018 — 시나리오 사건은 **실제 입력과 같은 경로**를 타고 표시만 다르다.
- **추천**: **같은 테이블에 두되 두 겹으로 구분한다.** ① 입구 테이블(`raw_input`·`event`)에 `is_simulated`(필수)와 `scenario_id`(참조) ② **모든 운영 조회는 `is_simulated = false` 를 기본 필터로 한다**. 계산 결과에는 `contains_simulated` 를 전파해 화면이 `SCENARIO_RESULT` 로 표시할 수 있게 한다.
- **되돌리기**: 쉬움(분리가 필요해지면 나중에 스키마를 나눌 수 있다).
- **사용자 결정**: 불필요.
- **반영**: 20절.

### L-9 운영 계획 묶음(Aggregate)

- **문제**: 여러 컨테이너의 예정이 한 업로드·한 버전에서 왔음을 추적하려면 별도 집합체가 필요한가.
- **근거**: `docs/21` 12.4.
- **관찰**: **이미 그 역할을 하는 것이 있다.** 한 번의 업로드는 `raw_input` 한 건이고, 거기서 나온 모든 `plan.*` 사건은 같은 `raw_input_id` 를 가진다. 어느 계획에서 온 예정인가와 묶음 단위 되돌리기는 그 참조로 답할 수 있다. 교체는 새 `raw_input` + 새 사건이다.
- **추천**: **MVP 에서 `operational_plan_batch` 를 만들지 않는다.** 묶음에 **이름·상태·담당·승인 같은 생애주기**가 필요해지는 시점에 만든다.
- **되돌리기**: 쉬움(나중에 헤더 테이블을 추가하고 기존 `raw_input` 을 매핑).
- **사용자 결정**: **완료 — D-4 CLOSED (2026-09-17): MVP 에서 만들지 않는다.**
- **반영**: 16.5 절에 **만들지 않는 결정**과 **다시 여는 조건**으로 기록. 테이블은 만들지 않았다.

### L-10 ExceptionCase

- **문제**: 파생 뷰로 충분한가, 운영 Case 테이블이 필요한가.
- **근거**: `docs/21` 5.11 — **담당·처리 상태·종결 주체는 사실에서 유도할 수 없다.** 시나리오의 예외 객체에는 상태 이력이 있다. 그러나 `docs/03`·`docs/19` 에 예외 건의 담당자 배정·종결 승인 요구사항이 **명시돼 있지 않다**.
- **추천(당시)**: 근거가 갈렸다. 제품 성격(예외 복구)은 필요하다고 말하고, 요구사항 문서는 요구하지 않았다. 억지로 확정하지 않았다.
- **사용자 결정**: **완료 — D-5 CLOSED FOR MVP (2026-09-17): MVP 에서 만들지 않는다.** `Event → Risk → RecoveryRun → Communication → Reply → Re-run` 폐쇄 루프에 필수가 아니다. L-6(종결 표현)도 여기에 함께 닫혔다. **영원히 필요 없다는 뜻은 아니다**(16.4 의 다시 여는 조건).
- **반영**: 16.4 절에 **만들지 않는 결정**과 **다시 여는 조건**으로 기록. 예외 목록은 파생 조회(21절).

### L-11 MessageApproval

- **문제**: 한 메시지에 승인이 여러 건 생기는 생애주기를 어떻게 보존하는가.
- **근거**: `docs/21` 12.3.
- **추천**: **`message_approval` 덧붙이기 테이블.** 승인 시점의 **수신 주소·제목·본문 해시·구조화 값**을 그 행에 고정한다. 메시지에는 **현재 유효 승인 포인터(`current_approval_id`)만** 둔다 — 포인터는 편의이고 **이력의 정본은 승인 테이블**이다. 발송 직전 검사는 `send_attempt.approval_id` 가 가리키는 승인의 `approved_content_hash` 와 실제 발송 본문 해시가 같은지 본다.
- **되돌리기**: 어려움(승인 컬럼 한 벌로 시작하면 과거 승인이 사라진다).
- **사용자 결정**: 불필요.
- **반영**: H 도메인.

### L-12 OperatorPlanningConstraint

- **문제**: 적용 범위·유효기간·강제/선호 구분·변경 이력·스냅샷 포함 방식.
- **근거**: `docs/21` 12.5.4.
- **추천(구조, rev.2 수정)**: **독립 테이블 `operator_planning_constraint`**, 분류 `DECISION_RECORD`, **진짜 덧붙이기** — 해제는 `released_at` 을 채우는 UPDATE 가 아니라 **`action = RELEASE` 인 새 행**이다(13.6). `enforcement` 로 강제/선호를 구분하고 대상은 `target_type` + `target_id` 로 표현한다. **솔버 표현은 정하지 않는다.**
- **적용 범위**: **기본값 = 현재 복구 맥락**(`scope_type = RECOVERY_CONTEXT`). 더 넓은 범위는 운영자가 **명시적으로** 고른다.
- **사용자 결정**: **완료 (D-3 CLOSED)**.
- **반영**: F 도메인 + `planning_snapshot_constraint`(13.2a) + 22절.

> **rev.1 의 모순.** "덧붙이기 전용(해제는 `released_at` 기록)"이라고 적었는데, **빈 칸을 나중에 채우는 것이 바로 UPDATE 다.** 덧붙이기 전용이라는 말과 같이 갈 수 없어서 고쳤다.
>
> **범위 기본값도 바꿨다.** rev.1 은 "해제 전까지 계속"을 기본으로 제안했는데, 그러면 **"이번 건에서는 ODCY A 를 쓰지 마"가 다음 사고까지 조용히 살아남는다.** 운영자가 잊으면 이유를 모르는 제약이 계산을 계속 바꾼다. 안전한 쪽은 **좁은 기본값**이다.

---

### L-13 복구 맥락(Recovery Context)을 무엇으로 식별하나 **(rev.2 신규 · 2026-09-21 CLOSED — T-069)**

- **문제**: D-3 의 기본값이 "현재 복구 맥락에만 적용"인데, **그 맥락의 식별자가 아직 없다.** `exception_case` 를 만들지 않기로 했으므로(D-5) 대신 무엇을 쓸지 정해야 한다.
- **후보**: ① `recovery_run` 계보의 뿌리 실행 id ② 최초 계기가 된 사건 id ③ 대상 컨테이너 집합의 지문 ④ 운영자 세션.
- **지금 하는 것**: `applicability_scope_ref` · `scope_ref` 를 **문자열**로 두고 무엇을 담을지는 열어 둔다. `recovery_run.previous_run_id` 계보가 이미 있으므로 ①이 가장 가깝다.
- **예시 표기 (rev.2.2)**: 이 문서와 작업표의 예시는 복구 맥락 참조를 **`<RECOVERY_CONTEXT_REF>`** 라는 자리표시자로 쓴다. 이것은 **별도 `RecoveryContext` 테이블이 있다는 뜻이 아니다.** 2026-09-21 결론 뒤에는 **"그 맥락의 뿌리 `recovery_run` id"** 로 읽는다(아무 실행 id 가 아니라 **뿌리** 실행 id).
- **사용자 결정**: 지금은 불필요. **T-069 구현 계획에서 답한다.**
- **결론 (2026-09-21, T-069 — CLOSED)**: **① 복구 맥락 = `recovery_run` 계보(`previous_run_id` 사슬)의 뿌리 실행 id.** `applicability_scope_type = RECOVERY_CONTEXT` 인 모든 곳(`event` · `canonical_fact` · `conflict` · `verification_request` · `question_item` · `operator_planning_constraint` · `planning_snapshot_fact`)의 범위 참조에 이 값이 들어간다. **새 표·새 컬럼·새 개념 없음.** ExceptionCase 는 다시 만들지 않는다(D-5).
  - **근거**: `docs/03` 2.6.1 이 "CERA 가 먼저 계산 → 운영자가 입력을 고친다 → 재계산"으로 흐름을 고정했다. 범위 있는 입력(운영자 계획 조건 · 이번 건 요율 · 문의)은 **모두 첫 계산 뒤에** 생기므로 "실행 전 범위"가 필요 없다. ② 계기 사건은 `OPERATOR_REQUEST`·`SCHEDULED` 처럼 사건이 없는 맥락을 표현하지 못하고, ③ 컨테이너 집합 지문은 대상이 바뀌면 맥락이 바뀌며, 별도 안정 id 는 컬럼과 발급 규칙이 필요하고 이름만 바꾼 ExceptionCase 가 되기 쉽다.
  - **규칙**: 뿌리 = `previous_run_id` 가 빈 실행이고 **자기 `run_id` 가 곧 맥락**이다 · **같은 사고를 다시 계산하면 반드시 `previous_run_id` 를 이어받는다**(이어받지 않으면 새 맥락 — 이전 맥락의 범위 있는 입력은 따라가지 않는다, D-3 과 같은 방향) · 범위 참조 값은 **존재하는 뿌리 실행 id** 여야 하고 쓰기 경로에서 검사한다(다형 문자열, 17.4 규칙 2) · 뿌리는 **조회로** 구한다(물리 복사는 T-080 판단) — I-35 · I-36
  - **지난 계획 기준 회신**(`docs/19` FR-INB-09): 스레드의 `related_run_id` 가 그 맥락의 **현재 실행이 아니거나 다른 맥락**이면 저장·추출·검증을 거쳐 **사건은 정상적으로 만들고 현재 사실의 후보도 된다**(R1 제외 대상이 아니다). **같은 사고 안이면 현재 실행과 같은 뿌리이므로 정상 근거다** — 범위는 이 판정의 장치가 아니다. **현재 계획에 자동 반영하지 않는 것**은 ① 계획·스냅샷이 불변 기록이라는 것 ② 자동 재계산 계기가 되지 않는다는 것 ③ 답이 자기 스레드의 질문에만 연결된다는 것이 보장한다. "지난 계획 기준"으로 표시한다. 사건을 막는 새 승인 단계는 없다. 자세한 처리는 `docs/tasks/plans/T-069-external-communication-slice.md` 4.3절

### L-14 적용 범위의 **값 목록과 선택 정책** **(rev.2 신규 · rev.2.1 확장 · OPEN)**

두 가지를 한 질문군으로 묶어 둔다.

**① 값 목록**

- **문제**: 범위 종류를 어디까지 둘 것인가. 후보는 `GLOBAL` · `RECOVERY_CONTEXT` · `CONTRACT` · `CONTAINER` · `FACILITY_ALL` · `TIME_BOUND` 정도다.
- **지금 하는 것**: **enum 을 확정하지 않는다.** 확정한 것은 **기본값이 `RECOVERY_CONTEXT`**(운영자 입력)이고 **`GLOBAL` 이 기본 저장값**이라는 것뿐이다.

**② 범위 선택 정책 (Scope Resolution Policy)** — rev.2.1 추가

- **문제**: 한 계산에 적용 가능한 범위가 여럿일 때 **어느 것을 쓰나.**
- **왜 지금 못 정하나**: `CONTRACT` · `CONTAINER` · `RECOVERY_CONTEXT` 는 **서로 다른 축**이라 "좁다/넓다"로 한 줄에 세울 수 없다. 현업 조합이 확인되기 전에 우선순위를 박으면 틀린 답을 고정한다.
- **확정한 것**: 범위는 식별자에 포함된다 · 같은 범위 안에서만 Reconciliation 한다 · **결정론적 선택 정책이 반드시 있어야 한다** · 실제로 쓴 범위는 스냅샷에 남는다(22.2).
- **어디서 정하나**: 비용·상태 결정 정책 또는 **T-069 구현 계획**.

- **사용자 결정**: 현업 검증 뒤. **별도 OPEN 항목으로 늘리지 않고 여기서 관리한다.**

### L-15 `message_kind` 의 값 목록 **(rev.2 신규 · OPEN)**

- **문제**: 지금은 `BUSINESS` · `CONTACT_VERIFICATION` 둘이면 충분하다. 나중에 알림·재촉·시스템 안내가 생기면 늘어난다.
- **지금 하는 것**: **둘만 둔다.** 늘리는 것은 쉽고, 미리 만든 값은 쓰이지 않으면 혼란만 준다.
- **사용자 결정**: 불필요.

### L-16 `bl` 의 업무 유일 제약 **(rev.2 신규 · OPEN)**

- **문제**: `(bl_type, bl_no, bl_year)` 가 정말 유일한가.
- **근거**: 번호 + 연도가 조회 키라는 것은 `[VERIFIED S-02]`. **번호가 연도 안에서 유일한지는 확인된 적이 없다.** DS-02 의 `blNo` 가 MBL 인지 HBL 인지도 `[TO VERIFY]`(Q-04).
- **지금 하는 것**: **논리 업무 식별 후보로만 적는다.** 실제 `UNIQUE` 는 실데이터 확인(T-005·T-006) 뒤 물리 설계에서 확정한다.
- **사용자 결정**: 불필요. 실데이터 확인 대상.

---

## 5. 식별자 전략

세 가지를 **섞지 않는다**.

| 종류 | 예 | 논리 설계에서 |
| --- | --- | --- |
| **내부 식별자** | `container_id` · `event_id` · `message_id` | 모든 테이블의 PK. **형식(UUID·ULID·정수)은 물리 설계에서 정한다.** 다만 `event_id` 는 **정렬 가능해야 한다**(동률 판정의 마지막 기준이 사건 id 이므로) |
| **업무 식별자** | `container_no`(ISO 6346) · `bl_no`(+ `bl_type`·`bl_year`) | 별도 컬럼. **PK 로 쓰지 않는다** (오타 정정·재발급 시 참조가 깨진다). `bl` 의 실제 `UNIQUE` 는 **확인 뒤 확정**(L-16) |
| **외부 시스템 식별자** | 화물관리번호 · 적하목록번호 · MSN · 채널 메시지 id | `external_identifier` 테이블, 또는 조회 경로에 쓰이는 것은 컬럼 + `UNIQUE` (Q-54) |

## 6. 시간 모델

- **모든 실제 시각은 `TIMESTAMP_TZ`**. 시간대 없는 시각 타입을 쓰지 않는다(`docs/01` 5.2).
- 사건의 네 시각 축을 컬럼으로 유지한다: `source_event_time`(발생·관측) · `source_recorded_at`(출처 기록·발신) · `received_at`(CERA 수신, 운영 시각) · `recorded_at`(DB 기록 벽시계).
- **근거 시각(`evidence_time`)은 저장하지 않는다.** 세 단계 폴백으로 계산되며 파생인 `canonical_fact` 에만 결과(`evidence_time` · `evidence_time_quality` · `temporal_confidence`)를 물질화한다.
- **적용 기간이 있는 개념**은 `valid_from` · `valid_until` 을 가진다: `tariff_rule` · `commercial_offer` · TERM 종류 사건과 그 현재 사실(L-3b).
- 기준 시각(`as_of`)은 **계산의 입력**이므로 `planning_snapshot` · `canonical_fact` · `risk_assessment` 에 남는다.

## 7. 금액 모델

원화는 **원 단위 정수**(`BIGINT`). 외화가 섞이면 **재현 가능한 다섯 값**을 함께 남긴다(Q-58).

| 컬럼 | 타입 | 뜻 |
| --- | --- | --- |
| `amount_krw` | `BIGINT` | 계산에 쓰는 원화 정수 |
| `original_currency` | `CODE` | 원 통화 (외화가 아니면 `KRW`) |
| `original_amount` | `DECIMAL(18,4)` | 원 통화 금액 |
| `fx_rate` | `DECIMAL(18,6)` | 적용 환율 |
| `fx_rate_basis_date` | `DATE` | 환율 기준일 |

**Money 를 독립 테이블로 만들지 않는다.** 이 묶음은 `cost_line_item` 에 놓이고, 필요해지면 다른 계산 결과 테이블에도 같은 묶음을 쓴다.

---

## 8. A. 물류 핵심

### 8.1 `container` — 컨테이너

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** — 등록 정보만. 삭제 대신 `is_active = false` · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 내부 식별자 | `container_id` | `STRING(30)` | 예 | **PK** | 내부용. 업무 번호와 다르다 |
| 컨테이너 번호 | `container_no` | `STRING(11)` | 예 | **UNIQUE** | ISO 6346. 체크디지트 검증 |
| 규격·종류 | `size_type` | `CODE` | 예 | | 20DRY · 40DRY · 40RF |
| 선사 | `carrier_counterparty_id` | `REF(counterparty)` | 아니오 | FK | 거래처의 선사 역할 |
| 목적지 시설 | `destination_facility_id` | `REF(facility)` | 아니오 | FK | **역할 참조**. 별도 destination 테이블 없음 |
| 입항 건 | `vessel_call_id` | `REF(vessel_call)` | 아니오 | FK | Next. MVP 는 비워 둔다 |
| 화물 설명 | `cargo_description` | `STRING(200)` | 아니오 | | 사람용 메모 |
| 업무 우선순위 | `business_priority` | `CODE` | 아니오 | | 사용자가 정한 중요도 |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | | 기본 `false` |
| 등록 시각 | `registered_at` | `TIMESTAMP_TZ` | 예 | | |
| 활성 | `is_active` | `BOOLEAN` | 예 | | 삭제 대신 비활성화 |

> **상태 컬럼이 없다.** 단계·위치·통관 상태·마일스톤은 전부 사실이며 `canonical_fact` 에 있다(안티패턴 1).

### 8.2 `bl` — 선하증권 **(rev.2 구조 변경)**

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 내부 식별자 | `bl_id` | `STRING(30)` | 예 | **PK** | |
| **B/L 번호** | `bl_no` | `STRING(40)` | 예 | 업무 식별 후보 | **한 행에 번호는 하나**. MASTER 행이면 MBL 번호, HOUSE 행이면 HBL 번호 |
| B/L 종류 | `bl_type` | `CODE` | 예 | 업무 식별 후보 | `MASTER` / `HOUSE` / **`UNKNOWN`**(rev.2.6 — 원천이 말하지 않을 때, G-3) |
| 상위 B/L | `parent_bl_id` | `REF(bl)` | 아니오 | FK | HOUSE → MASTER (자기 참조). MASTER 행은 비어 있다 |
| B/L 연도 | `bl_year` | `INTEGER` | 아니오 | 업무 식별 후보 | 공공 API 조회에서 번호와 짝으로 쓰인다 |
| 선사 | `carrier_counterparty_id` | `REF(counterparty)` | 아니오 | FK | |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | | |

> 화물관리번호·적하목록관리번호·MSN 은 **여기 컬럼이 아니라** `external_identifier` 에 있다(Q-54).

**왜 `mbl_no` + `hbl_no` 두 컬럼을 두지 않는가**

개념 모델은 MBL·HBL 을 **B/L 의 종류**로 보고 B/L 끼리 부모–자식 관계를 갖는다고 했다. 한 행에 두 번호를 같이 두면 같은 사실을 두 가지 모양으로 표현하게 되고(한 행의 두 컬럼 vs 두 행의 부모–자식), 조회·유일 제약·연결이 전부 두 갈래가 된다. **종류 + 번호 하나 + 부모 참조**면 둘 다 표현된다.

> **수집 쪽 주의**: 공공 API(DS-01) 응답은 `mblNo` 와 `hblNo` 를 **한 레코드에 함께** 준다 `[VERIFIED S-02]`. 어댑터가 그 한 레코드를 **MASTER 행 + HOUSE 행**으로 나눠 넣는다. 나누는 규칙은 구현 계획의 몫이다.

**`bl_no` 의 유일성은 아직 닫지 않는다** — 저장소 근거가 이렇다.

| 확인된 것 | 출처 |
| --- | --- |
| 조회는 `화물관리번호` 하나, **또는** (`mblNo`\|`hblNo`) + `blYy` 로 한다 | `docs/data/field-dictionary.md` `[VERIFIED S-02]` |
| `blYy`(B/L 연도)는 번호로 조회할 때 **필수**다 | 같은 곳 `[VERIFIED S-02]` |
| `blPt`(B/L 유형) 필드는 있으나 **코드 의미는 미확인** | 같은 곳 `[TO VERIFY]` |
| DS-02 의 `blNo` 가 MBL 인지 HBL 인지 **미확인** | 같은 곳 `[TO VERIFY]` · Q-04 |

번호 + 연도가 조회 키라는 것까지가 확인된 사실이고, **번호가 연도 안에서 전 세계적으로 유일한지는 확인되지 않았다.** 그래서 `(bl_type, bl_no, bl_year)` 를 **논리 업무 식별 후보**로만 적고, 실제 `UNIQUE` 제약은 **실데이터 확인 뒤 물리 설계에서 확정**한다(신규 **L-16**). 근거 없이 지금 닫으면 정상 데이터를 거절하는 제약이 된다.

### 8.3 `container_bl` — 컨테이너와 B/L 연결

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP · **L-2 → D-1 CLOSED: 연결 테이블 유지**

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 컨테이너 | `container_id` | `REF(container)` | 예 | **PK 일부**, FK | |
| B/L | `bl_id` | `REF(bl)` | 예 | **PK 일부**, FK | |
| 연결 역할 | `link_role` | `CODE` | 예 | | `PRIMARY` / `CONSOLIDATED` |

- **MVP 제약**: 컨테이너당 `link_role = PRIMARY` 인 행이 **정확히 1건**(부분 유일 제약). 혼재(LCL)가 범위에 들어오면 이 제약만 푼다.
- 이 테이블을 두는 이유: `container.bl_id` 컬럼으로 시작하면 LCL 도입 시 **스키마 변경 + 데이터 이관**이 필요하다.

### 8.4 `external_identifier` — 외부 시스템 식별자 (rev.2.6 — `source_raw_input_id` · `is_simulated` 추가, G-6)

- 분류 **`EVIDENCE`** · 변경 **`APPEND_ONLY`** — 정정은 새 행 · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 식별자 행 id | `external_identifier_id` | `STRING(40)` | 예 | **PK** | |
| 소유 대상 종류 | `owner_type` | `CODE` | 예 | | `BL` · `CONTAINER` · `VESSEL_CALL` |
| 소유 대상 id | `owner_id` | `STRING(30)` | 예 | | 다형 참조 |
| 발급 시스템 | `issuing_system` | `CODE` | 예 | | `KCS`(관세청) · `MOF`(해수부) 등 |
| 식별자 종류 | `id_type` | `CODE` | 예 | | `CARGO_MGMT_NO` · `MANIFEST_NO` · `MSN` |
| 값 | `id_value` | `STRING(40)` | 예 | **UNIQUE**(issuing_system, id_type, id_value) | |
| 근거 사건 | `source_event_id` | `REF(event)` | 아니오 | FK | 어디서 알게 됐나 |

### 8.5 `vessel_call` — 입항 건 **(rev.2.6 — Next → MVP)**

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · **MVP(rev.2.6)**. DS-03 이 채우고 DS-02 조회 키로 쓴다. 물리 `docs/24` 22.30. 열 추가: `first_raw_input_id` · `is_simulated` · `registered_at`(G-2). 바뀔 수 있는 열 = `vessel_name` · `is_active`.
- (rev.2.5 까지) MVP 아님 — 구조만 정의.
- 키: `vessel_call_id` PK, `UNIQUE(port_authority_code, call_year, call_seq, call_sign)`.
- 컬럼: `vessel_call_id` · `port_authority_code CODE` · `call_year INTEGER` · `call_seq INTEGER` · `call_sign STRING(20)` · `vessel_name STRING(100)` · `is_active` (rev.2.2 — 작업표와 맞춰 적음).
- 이유: 같은 배로 온 컨테이너에 입항 지연이 공통으로 걸릴 때 필요하다. 지금은 컨테이너별 도착 사실로 충분하다.

### 8.6 `public_data_fetch` — 공공 API 호출 원장 **(rev.2.6 신설, G-7)**

- 분류 **`EVIDENCE`** · 변경 **`APPEND_ONLY`** · MVP · 물리 `docs/24` 22.35
- 한 행 = 페이지 하나를 한 번 물어본 것. 성공 · 데이터 없음 · 상대 오류 · 전송 실패 · 해석 실패 모두 남는다. 응답 본문이 왔으면 `raw_input` 1건을 가리킨다(UNIQUE)
- 열: `fetch_id` · `provider`(DATA_GO_KR · UNIPASS) · `dataset` · `operation` · `request_params`(안전한 조회 조건 — **키 없음**) · `page_no` · `mode`(LIVE · REPLAY) · `requested_at` · `received_at` · `http_status` · `result_code` · `outcome` · `total_count` · `item_count` · `raw_input_id` · `requested_by_actor_id` · `trace_id` · `is_simulated`
- 규칙: `mode = REPLAY` ⇔ `is_simulated`(녹화 재생은 시뮬레이션 — 규칙 9). 전송 실패만 원문 · 받은 시각이 없다
- 왜 `raw_input` 만으로 안 되나: `raw_input` 은 **원문 한 건**이다. 무엇을 언제 어떤 조건으로 물었는지(요청 시각 · 페이지 · 조건), 원문이 없는 실패, 호출 한도 사용량(Q-05)은 원문 행에 없다

---

## 9. B. 시설·자원

### 9.1 `facility` — 시설 (공통)

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** — 등록 정보만. 삭제 대신 `is_active = false` · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 시설 식별자 | `facility_id` | `STRING(30)` | 예 | **PK** | |
| 시설 종류 | `facility_type` | `CODE` | 예 | | `WAREHOUSE` · `TERMINAL` · `ODCY` (향후 `FACTORY` · `EMPTY_DEPOT`) |
| 시설명 | `facility_name` | `STRING(100)` | 예 | | |
| 지역 | `area` | `STRING(100)` | 아니오 | | |
| 운영 시작·종료 | `default_open_time` · `default_close_time` | `TIME` | 아니오 | | **기본값**. 그날 값이 다르면 사실이 이긴다(L-4) |
| 활성 | `is_active` | `BOOLEAN` | 예 | | **운영자의 이번엔 쓰지 마를 여기에 쓰지 않는다**(안티패턴 5) |

### 9.2 `facility_warehouse` / `facility_terminal` / `facility_odcy` — 시설 상세

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP · 각각 `facility_id` 가 **PK 이자 FK**(1:1)

| 테이블 | 고유 컬럼 (모두 `default_` 기본값) |
| --- | --- |
| `facility_warehouse` | `default_capacity_per_day INTEGER` · `default_receiving_from` · `default_receiving_to TIME` · `default_last_departure_for_same_day TIME` · `default_accepted_size_types STRING(50)` · `default_travel_minutes_from_terminal INTEGER` |
| `facility_terminal` | `default_gate_open/close TIME` |
| `facility_odcy` | `default_gate_close TIME` · `default_round_trip_slots INTEGER` · `default_accepted_size_types STRING(50)` · `rejects_note STRING(200)` |

> **일별 수용량·최대 보관일·요율은 여기 없다.** 전부 사실이다(안티패턴 2). 여기 값은 **평시 기준선**이고 이름의 `default_` 가 그것을 드러낸다.

### 9.3 `truck_pool` — 차량 풀

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 |
| --- | --- | --- | --- | --- |
| 풀 식별자 | `truck_pool_id` | `STRING(30)` | 예 | **PK** |
| 풀 이름 | `pool_name` | `STRING(100)` | 예 | |
| 소유 구분 | `ownership` | `CODE` | 예 | `OWN` / `PARTNER` |
| 소유 거래처 | `owner_counterparty_id` | `REF(counterparty)` | 아니오 | FK |
| 활성 | `is_active` | `BOOLEAN` | 예 | |

> 슬롯별 가용 대수는 **사실**이다. 개별 차량 테이블은 MVP 에 없다(Q-57).

---

## 10. C. 거래처·연락처

3단계(`counterparty` → `counterparty_contact` → `contact_channel_address`)를 유지한다.

### 10.1 `counterparty` — 거래처

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP · **역할 판정의 정본**

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 거래처 id | `counterparty_id` | `STRING(30)` | 예 | **PK** | |
| 표시 이름 | `display_name` | `STRING(100)` | 예 | | |
| 현실 역할 | `source_role` | `CODE` | 예 | | `TRUCKING`·`ODCY`·`WAREHOUSE`·`SHIPPING_LINE`·`TERMINAL`. **권한 판정의 입력** |
| 조직 코드 | `org_code` | `STRING(30)` | 아니오 | | |
| 활성 | `is_active` | `BOOLEAN` | 예 | | |

### 10.2 `counterparty_contact` — 담당 연락처

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP · `counterparty_id` FK

`contact_id` PK · `person_name` · `team` · `note` · `is_active`.

### 10.3 `contact_channel_address` — 채널 주소 (**발송 자격의 정본**)

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP · `contact_id` FK

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 주소 id | `address_id` | `STRING(30)` | 예 | **PK** | |
| 연락처 | `contact_id` | `REF(counterparty_contact)` | 예 | FK | |
| 채널 | `channel_type` | `CODE` | 예 | **UNIQUE**(channel_type, normalized_address) | `GMAIL` · `MOCK` · `PORTAL` |
| 정규화 주소 | `normalized_address` | `STRING(200)` | 예 | 위 복합 유일 | |
| **주소 확인 상태** | `email_verification_status` | `CODE` | 예 | | `UNVERIFIED`·`PENDING`·`VERIFIED`·`FAILED`·`EXPIRED` |
| **업무 관계 승인 상태** | `relationship_status` | `CODE` | 예 | | `PENDING`·`APPROVED`·`REJECTED` |
| **통신 활성 상태** | `communication_status` | `CODE` | 예 | | `ACTIVE`·`PAUSED`·`INACTIVE` |
| 확인 시각 | `verified_at` | `TIMESTAMP_TZ` | 아니오 | | |
| 승인 주체·시각 | `approved_by_actor_id` · `approved_at` | `REF(actor)` · `TIMESTAMP_TZ` | 아니오 | FK | |

> **세 상태를 한 컬럼으로 합치지 않는다.** 서로 다른 질문이고 바꾸는 주체가 다르다. 발송 자격은 셋의 AND + 거래처 활성 + (개발 환경) 수신자 제한이며 **승인 시점과 발송 직전에 각각 검사**한다.

### 10.4 `contact_verification` — 주소 소유 확인

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`CONTROLLED_UPDATE`** — 아래 두 컬럼만 · MVP

`verification_id` PK · `address_id` FK · `token_hash HASH` · `issued_at` · `expires_at` · `used_at` · `result CODE` · `requested_by_actor_id` FK.

#### 10.4.1 무엇이 불변이고 무엇이 바뀌나 (rev.2.1 수정)

27.4 흐름에서 **상대가 링크를 클릭하면 `used_at` 과 `result` 가 갱신된다.** 그래서 이 표를 "덧붙이기만"이라고 부르면 사실과 다르다. 두 부분으로 나눠 적는다.

| 부분 | 컬럼 | 변경 |
| --- | --- | --- |
| **발급 기록 (불변)** | `verification_id` · `address_id` · `token_hash` · `issued_at` · `expires_at` · `requested_by_actor_id` | **만든 뒤 절대 고치지 않는다** |
| **사용 결과 (정해진 생애주기)** | `used_at` · `result` | `PENDING` → `VERIFIED` / `EXPIRED` / `INVALIDATED` **한 방향으로 한 번만** |

**Integrity Rules**

1. `result` 는 `PENDING` 에서 출발해 **종료 상태로 한 번만** 간다. 종료 상태에서 되돌아오지 않는다.
2. `result = VERIFIED` 이면 `used_at` 이 **NOT NULL** 이고 `expires_at` 이전이어야 한다.
3. **발급 기록 6컬럼은 어떤 경우에도 UPDATE 하지 않는다.**
4. 재발송은 **새 행**이고, 이전 행은 `result = INVALIDATED` 로 닫는다.

> 이 정도의 생애주기를 위해 별도 이력 표(`contact_verification_event` 같은 것)를 **만들지 않는다.** 상태가 한 방향으로 한 번 가고 되돌아오지 않으므로, 잃어버리는 이력이 없다.

> **토큰 값 자체를 저장하지 않는다**(해시만). 재발송은 새 행이고 이전 토큰을 무효화한다.

### 10.5 `channel_connection` — 채널 연결

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP

`channel_connection_id` PK · `channel_type CODE` · `account_ref STRING(200)` · `scopes JSON` · **`credential_reference STRING(200)`** · `granted_at` · `expires_at` · `status CODE`.

> **비밀값(토큰) 자체를 DB 에 넣지 않는다.** 이 테이블은 연결 상태·권한 범위·만료만 담고, 실제 값은 `.env` 또는 OS 보안 저장소에 있으며 여기에는 **참조**만 둔다.

---

## 11. D. 사건·상태 (이 설계의 심장)

이 도메인이 CERA 의 정본이다. **`raw_input` → `event` → `canonical_fact`** 가 한 방향으로만 흐른다.

### 11.1 `raw_input` — 원천 입력

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP
- 한 번의 수집(API 1회 호출 · 메일 1통 · 계획 업로드 1건 · 폼 제출 1건)이 한 행이다.

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 입력 id | `raw_input_id` | `STRING(40)` | 예 | **PK** | |
| 출처 종류(채널) | `source_type` | `CODE` | 예 | | **rev.2.3 값 변경.** `HUMAN_UI`·`FILE_IMPORT`·`EMAIL`·`DOCUMENT`·`PUBLIC_API`·`PARTNER_SYSTEM`·`INFERENCE` (ADR-020). `event.source_type` 과 **같은 값 집합**이다 — 11.2c |
| 출처 이름 | `source_name` | `STRING(60)` | 예 | | `S-01` 같은 카탈로그 키 또는 채널명 |
| 요청 내용 | `request_ref` | `STRING(300)` | 아니오 | | 조회 파라미터(민감값 마스킹) |
| 원문 위치 | `payload_ref` | `STRING(300)` | 아니오 | | **보관 관리 내용 참조**(29절). 원문(RFC822 등)은 행에 넣지 않는다. **내용이 파기돼도 이 참조는 남는다** — rev.2.4 |
| 원문 지문 | `payload_hash` | `HASH` | 예 | **UNIQUE 아님** | 내용 지문. 무결성 확인·비교용이며 **행 생성을 막지 않는다**. **원문이 파기돼도 남는다** |
| **첨부 목록** | `attachment_manifest` | `JSON` | 아니오 | | **rev.2.4 신규.** 첨부마다 **지문 · 크기 · 형식**만. **파일명·내용은 넣지 않는다**(파일명도 원문의 일부다). 첨부 내용은 원문 안에 있고 원문과 함께 파기된다 — 29.4 |
| **출처 전달 키** | `source_record_key` | `STRING(200)` | 아니오 | **UNIQUE**(source_name, source_record_key) | 출처가 주는 **같은 전달·수집 건 식별자**. 줄 때만 쓴다 |
| 출처 기록 시각 | `source_recorded_at` | `TIMESTAMP_TZ` | 아니오 | | 메일이면 **Q-44 규칙으로 고른 값**(11.2e). 원래 두 시각은 사건의 `payload` 에 남는다 |
| 수신 시각 | `received_at` | `TIMESTAMP_TZ` | 예 | | |
| 수집 주체 | `collected_by_actor_id` | `REF(actor)` | 아니오 | FK | 시스템·운영자 |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | | |

> **계획 업로드 1건 = `raw_input` 1행**이다. 그래서 별도 `operational_plan_batch` 를 MVP 에 만들지 않는다(L-9 / **D-4 CLOSED**).
> 실제 메일 본문·실제 응답 원문은 **커밋 대상이 아니며**(`docs/01` 6절) 저장 위치 정책은 물리 설계에서 정한다.

**`payload_hash` 에 유일 제약을 걸지 않는 이유** (rev.2 수정)

```
09:00  API 조회 → 창고 A 수용량 8        ← raw_input 1행
10:00  API 재조회 → 창고 A 수용량 8      ← 응답 본문이 글자 하나까지 같을 수 있다
```

**"10시에 같은 값을 다시 관측했다"는 새로운 수집 사실이다.** 신선도(`freshness_status`)와 근거 시각이 이 관측으로 달라진다. 내용이 같다는 이유로 행을 막으면 **CERA 는 09시 이후로 아무것도 확인하지 못한 상태**가 된다. 그래서 `payload_hash` 는 **지문일 뿐**이고 중복 차단 장치가 아니다.

**중복 처리는 출처가 주는 전달 식별자로 한다.**

| 출처 | `source_record_key` 에 들어가는 것 |
| --- | --- |
| 메일 채널 | 외부 메시지 id (`comm_message.external_message_id` 와 같은 값) |
| Webhook | delivery id |
| 공공 API | 출처가 응답 건 식별자를 줄 때만. **없으면 비워 둔다** |
| 사람 입력·업로드 | 화면 명령은 **명령 id**(화면 클라이언트가 명령마다 만든 전달 식별자 — 같은 명령의 재시도를 한 건으로 모은다, rev.2.5). 업로드는 보통 없다 |

- **출처가 주지 않으면 비워 둔다.** CERA 가 지어내지 않는다. `NULL` 이 여럿이어도 유일 제약에 걸리지 않는다.
- 같은 내용을 여러 번 수집하면 **`raw_input` 은 여러 행**이 되고 **사건도 여러 건**이 된다. 그 여러 사건 중 무엇이 현재 사실이 되는지는 Reconciliation 이 정한다(동일 값이면 최신 관측이 신선도를 갱신한다).

### 11.2 `event` — 사건 (**Append-only 정본**)

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`APPEND_ONLY`** (절대 UPDATE 하지 않는다) · MVP

> **rev.2.3 에서 `docs/05` 4.2 와 한 줄씩 대조했다.** 빠져 있던 13개 개념(사건 부류 · 확인 2필드 · 업무 사건 유형 · 스키마 판 · 멱등 키 · 업무 상관 id · 부가 속성 · 출처 주체 · 추출 방식 · 검증기 신뢰도 2필드 · 출처 종류 값 목록)을 복구했다. 전체 대응표는 **23.1절**.

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 사건 id | `event_id` | `STRING(40)` | 예 | **PK** | **정렬 가능해야 한다**(R 규칙 최종 tie-break) |
| **스키마 판** | `schema_version` | `STRING(20)` | 예 | | **rev.2.3 신규.** 이 행을 어느 계약 판으로 읽어야 하나 — 11.2d |
| 원천 입력 | `raw_input_id` | `REF(raw_input)` | 예 | FK | 모든 사건은 원천이 있다 |
| **사건 부류** | `event_class` | `CODE` | 예 | | **rev.2.3 신규.** `OBSERVATION` · `CORRECTION` · `VERIFICATION` (`docs/05` 4.1) — 11.2a |
| **업무 사건 유형** | `event_type` | `CODE` | 예 | | **rev.2.3 신규.** `WAREHOUSE_CAPACITY_CHANGED` 같은 **업무 의미**. `fact_key` 와 다른 축이다 — 11.2d |
| 사실 종류 | `fact_kind` | `CODE` | **조건부** | | `MILESTONE`·`STATE`·`OFFER`·`TERM`·`IDENTITY`·`PLAN`·`FORECAST`. **`VERIFICATION` 이면 비어 있다** |
| **사실 키** | `fact_key` | `STRING(120)` | **조건부** | | `discharge.actual` · `warehouse.capacity@2026-09-18` 같은 **불변 문자열**. 여기서는 쪼개지 않는다(Q-63). **`VERIFICATION` 이면 비어 있다** |
| 값 | `value_text` | `TEXT` | 아니오 | | 원형 그대로. **주장한 값만 넣는다 — 원문 인용·문장을 넣지 않는다**(인용은 `extraction` 의 보관 관리 내용, 29.2) — rev.2.4 |
| 값(수치) | `value_number` | `DECIMAL(18,4)` | 아니오 | | 수치형일 때만 |
| 값(시각) | `value_timestamp` | `TIMESTAMP_TZ` | 아니오 | | 시각형일 때만 |
| 값(코드) | `value_code` | `CODE` | 아니오 | | 코드형일 때만 |
| 단위 | `value_unit` | `CODE` | 아니오 | | |
| 적용 시작·종료 | `valid_from` · `valid_until` | `TIMESTAMP_TZ` | 아니오 | | **시간 범위**(Validity). TERM·OFFER 에서 사용(L-3b) |
| **적용 대상 범위 종류** | `applicability_scope_type` | `CODE` | 예 | | **무엇에 적용되나**(Scope). 기본값 `GLOBAL`. 운영자 입력은 `RECOVERY_CONTEXT` — 22절 |
| **적용 대상 범위 참조** | `applicability_scope_ref` | `STRING(60)` | 예 | | 범위의 대상 id. `GLOBAL` 이면 빈 문자열 |
| 관측 시각 | `source_event_time` | `TIMESTAMP_TZ` | 아니오 | | |
| 출처 기록 시각 | `source_recorded_at` | `TIMESTAMP_TZ` | 아니오 | | |
| 수신 시각 | `received_at` | `TIMESTAMP_TZ` | 예 | | |
| **출처 종류(채널)** | `source_type` | `CODE` | 예 | | **rev.2.3 — 이름·값 변경**(옛 `source_kind`). `HUMAN_UI`·`FILE_IMPORT`·`EMAIL`·`DOCUMENT`·`PUBLIC_API`·`PARTNER_SYSTEM`·`INFERENCE` (ADR-020) — 11.2c |
| **수집 시점 역할** | `source_role_at_ingestion` | `CODE` | 아니오 | | 주장한 거래처가 **그때** 가졌던 역할. 나중에 역할이 바뀌어도 당시 값이 남는다 |
| **출처 주체** | `source_id` | `STRING(60)` | 아니오 | | **rev.2.3 신규.** 채널 안의 **안정적인 주체 식별자**(`DS-01` · 발신자 등록 id · 파트너 시스템 id). 사람·거래처 참조와 다른 축 — 11.2c |
| **추출 방식** | `extraction_method` | `CODE` | 예 | | **rev.2.3 신규.** `DIRECT` · `RULE_PARSED` · `LLM_EXTRACTED` · `CALCULATED` (ADR-020 3축의 셋째) — 11.2c |
| **입력 품질** | `input_quality` | `CODE` | 예 | | `STRUCTURED`(폼·API·CSV) · `SEMI_STRUCTURED` · `UNSTRUCTURED`(자유 문장). **입력의 형태**이지 판정 결과가 아니다 — 11.2b |
| **검증기 신뢰도** | `input_confidence_level` | `CODE` | 예 | | **rev.2.3 신규.** `HIGH`·`MEDIUM`·`LOW`. **결정론 검증기가 정한다**(`docs/05` 4.6) — 11.2b |
| **신뢰도 사유** | `input_confidence_reasons` | `JSON` | 아니오 | | **rev.2.3 신규.** 어느 검사에서 깎였나. 표를 따로 만들지 않는다 — 11.2b |
| 신뢰 주체 | `asserted_by_counterparty_id` | `REF(counterparty)` | 아니오 | FK | 누가 주장했나 |
| 입력 주체 | `entered_by_actor_id` | `REF(actor)` | 아니오 | FK | 사람이 입력했으면 |
| **정정 대상** | `supersedes_event_id` | `REF(event)` | 아니오 | FK(자기참조) | **정정은 새 행 + 이 참조**다. 원래 행을 고치지 않는다. `CORRECTION` 필수 |
| 정정 사유 | `supersede_reason` | `STRING(200)` | 아니오 | | |
| **확인 행위** | `verification_action` | `CODE` | **조건부** | | **rev.2.3 신규.** `CONFIRM`·`REJECT`·`REVOKE`. **`VERIFICATION` 필수** — 11.2a |
| **확인 방법** | `verification_method` | `CODE` | **조건부** | | **rev.2.3 신규.** `DIRECT_REVIEW`·`REQUEST_RESOLUTION`. **`VERIFICATION` 필수** — 11.2a |
| 추출 근거 | `extraction_id` | `REF(extraction)` | 아니오 | FK | LLM 후보에서 왔으면 |
| **업무 상관 id** | `correlation_id` | `STRING(60)` | 아니오 | | **rev.2.3 신규.** 메일 스레드 · 복구 실행 · 확인 흐름 · 시나리오 단계. **기술 추적 `trace_id` 와 다른 것**(`docs/23` 5절) |
| **멱등 키** | `idempotency_key` | `HASH` | 예 | **UNIQUE** | **rev.2.3 신규.** 같은 주장을 두 번 사건으로 만들지 않는다. 논리 재료는 **11.2d** |
| **부가 속성** | `payload` | `JSON` | 아니오 | | **rev.2.3 신규.** `change_reason` · `forecast_kind` · `tz_assumed` 같은 **종류별 부가 정보만**. 핵심 구조를 여기 밀어 넣지 않는다 — 11.2d |
| 기록 시각 | `recorded_at` | `TIMESTAMP_TZ` | 예 | | |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | | |
| 시나리오 | `scenario_id` | `REF(scenario)` | 아니오 | FK | `is_simulated = true` 일 때만 |

**Integrity Rules**
1. `event` 에 대한 UPDATE·DELETE 는 허용하지 않는다. 정정은 `supersedes_event_id` 를 가진 **새 행**이다.
2. `supersedes_event_id` 는 **자기 자신을 가리킬 수 없고 순환할 수 없다**.
3. 정정 사건의 `fact_kind` 와 대상 개체는 원래 사건과 같아야 한다.
4. `is_simulated = false` 인 사건은 `scenario_id` 가 비어 있어야 한다.
5. **`event_class` 별 필수 조합** (rev.2.3 — 옛 규칙 5 를 부류별로 나눴다)

   | `event_class` | `fact_kind`·`fact_key` | 네 값 컬럼 중 최소 하나 | `supersedes_event_id` | 확인 2필드 | `event_verification_target` |
   | --- | --- | --- | --- | --- | --- |
   | `OBSERVATION` | **필수** | **필수** | 비어 있다 | 비어 있다 | 0건 |
   | `CORRECTION` | **필수** | 값 없음 = 철회이므로 **선택** | **필수** | 비어 있다 | 0건 |
   | `VERIFICATION` | **비어 있다** | 비어 있다 | 비어 있다 | **필수** | **`TARGET` 1건 이상** |

6. **사건마다 `link_role = SUBJECT` 인 `event_entity_link` 가 정확히 1건**이다(11.3절). `VERIFICATION` 도 예외가 아니다 — 확인 대상 사실의 주체를 그대로 가리킨다.
7. **근거 강도(Evidence Strength)는 `event` 에 저장하지 않는다.** 여기에는 당시 입력에서 알 수 있었던 원천 축만 둔다.
8. **확인 상태·대체 상태·역할을 `event` 에 저장하지 않는다**(rev.2.3). `docs/05` 6.1 이 "기준 시각마다 계산"이라고 정했다. 저장하면 불변성과 재현성이 깨진다.
9. `idempotency_key` 는 **모든 부류에 필수**다. 확인·정정도 두 번 들어오면 한 건이어야 한다.

**`source_tier` 를 없앤 이유** (rev.2 수정)

근거 강도는 출처 종류 · 역할 · 권한 · 검증 상태 · 입력 품질 · 신선도 · **정책 판**을 함께 보고 **계산**되는 값이다. 그것을 append-only 인 `event` 의 원천 컬럼으로 저장하면 두 가지가 깨진다.

1. **정책이 바뀌면 과거 사건의 등급이 틀린 값이 된다.** 그런데 `event` 는 UPDATE 할 수 없으므로 고칠 방법이 없다.
2. 같은 사건 집합으로 근거 강도를 **다시 계산할 수 없게 된다.** 재현성이 이 설계의 전제다.

그래서 `event` 에는 **원천 축**(`source_type` · `source_role_at_ingestion` · `source_id` · `extraction_method` · `input_quality` · `input_confidence_level` · `asserted_by_counterparty_id` · `entered_by_actor_id` · `extraction_id`)만 두고, **계산 결과인 근거 강도는 파생인 `canonical_fact` 에 `evidence_strength` + `evidence_policy_version` 으로 둔다**(11.4절). 정책 판이 바뀌면 재계산하면 된다.

> **rev.2.3 주의**: 위 목록에 `input_confidence_level` 이 들어간 것은 **강도를 저장한다는 뜻이 아니다.** 검증기 신뢰도는 *수신 때 한 번 결정론적으로 판정되는 입력 사실*이고, 근거 강도는 *그것을 포함한 여러 축을 정책으로 합친 계산 결과*다(11.2b).

### 11.2a `event_verification_target` — 확인이 무엇을 가리키나 **(rev.2.3 신규)**

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

**왜 필요한가.** rev.2.2 까지 `docs/22` 에는 **사람이 사실을 확인했다는 기록이 없었다.** `canonical_fact.verification_status` 에 `VERIFIED` 값은 있는데 그 값을 만들 경로가 논리 모델 안에 없었다 — 도달할 수 없는 값이었다.

| 근거 | 내용 |
| --- | --- |
| 승인된 `docs/21` 9절 | "사람이 사실을 확인했다 → Operational Event **인가: 예(확인 부류)** → **사실 상태를 바꾼다**" |
| 승인된 `docs/21` 12.2 · `docs/20` **A-17** | "사실 확인 · 계획 승인 · 발송 승인은 **서로를 대신하지 않는다.** 각각 따로 기록된다" (ADR-028 `Accepted`) |
| ADR-020 **`Accepted (구조 한정)`** | `value_status` 의 `CONFIRMED` 와 `verification_basis` 를 전제한다 |
| `docs/03` FR-OPT-06 (`Must`) | 계획 승인은 입력 사실을 `CONFIRMED` 로 올리지 않는다 — 둘이 **다른 기록**이어야 성립한다 |

> **`ADR-017` 은 현재 `Proposed`** 다(`docs/14:205`). 위 근거는 ADR-017 이 아니라 **승인된 개념 모델과 Accepted ADR-028·020** 에서 나온다. ADR-017 을 Accepted 로 인용하지 않는다.

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 확인 사건 | `verification_event_id` | `REF(event)` | 예 | **PK 일부**, FK | `event_class = VERIFICATION` 인 행만 |
| 대상 사건 | `target_event_id` | `REF(event)` | 예 | **PK 일부**, FK | 확인·거절·기각된 사건 |
| 대상 역할 | `target_role` | `CODE` | 예 | **PK 일부** | `TARGET`(확인·거절 대상) · `OVERRULED`(요청 처리에서 **고르지 않은** 후보) |

**Integrity Rules**

1. `verification_event_id` 가 가리키는 행은 **반드시 `event_class = VERIFICATION`** 이다.
2. `target_event_id` 가 가리키는 행은 **`VERIFICATION` 이 아니다.** 확인을 확인하지 않는다. 확인의 취소는 `verification_action = REVOKE` 이고, 그 행의 `TARGET` 은 **원래의 사실 주장**이다.
3. 확인 사건마다 `target_role = TARGET` 인 행이 **1건 이상**이다.
4. `target_role = OVERRULED` 는 0건 이상이며 `verification_method = REQUEST_RESOLUTION` 일 때만 생긴다.
5. **이 표는 UPDATE·DELETE 하지 않는다.** 확인을 되돌리려면 `REVOKE` 사건을 새로 넣는다.
6. `is_simulated` 컬럼을 두지 않는다. 부모 `event` 가 `SOURCE_OF_TRUTH` · `APPEND_ONLY` 라 **재생성으로 사라지지 않기 때문**이다(`verification_request_handling` 이 스스로 가져야 했던 이유와 반대다 — 11.7).
7. **한 확인 사건의 모든 대상은 같은 현재 사실 좌표 안에 있어야 한다** (rev.2.3 보강 — 11.2a.1). 좌표 = **SUBJECT 개체**(`entity_type` + `entity_id`) + **`fact_key`** + **적용 범위**(`applicability_scope_type` + `applicability_scope_ref`). `TARGET` 과 `OVERRULED` 를 가리지 않고 **전부** 같아야 한다.
8. **확인 사건 자신의 SUBJECT 와 적용 범위도 그 좌표와 같아야 한다.** 확인 사건은 `fact_key` 를 갖지 않으므로(규칙 5), 그 확인이 **어느 현재 사실을 움직이는지는 대상들의 좌표에서 나온다**.

#### 11.2a.1 왜 좌표를 하나로 묶는가 **(rev.2.3 보강)**

이것은 새 설계가 아니라 **이미 정해진 것들이 동시에 성립하려면 반드시 필요한 제약**이다. 셋이 맞물린다.

| 이미 정해진 것 | 어디 |
| --- | --- |
| 사건마다 `link_role = SUBJECT` 인 링크가 **정확히 1건** | 11.3 · I-8 |
| `canonical_fact` 의 키 = 개체 + `fact_key` + **적용 범위** | 11.4 · 11.4.1 |
| 확인 요청 하나 = **한 좌표**(범위가 다르면 다른 확인 문제) | 11.6.1 · `request_key` 재료 11.7.2 |

**묶지 않으면 무엇이 깨지나**

```
확인 사건 V  →  TARGET   = 창고A 수용량(GLOBAL)
             →  OVERRULED = 창고B 보관료(RECOVERY_CONTEXT)   ← 다른 좌표
```

1. **SUBJECT 가 정해지지 않는다.** 규칙 6 은 확인 사건도 SUBJECT 를 정확히 1건 가지라고 하는데, 대상이 창고 A 와 창고 B 에 걸쳐 있으면 **둘 중 무엇을 가리켜야 하는지 결정되지 않는다.** I-8 이 성립하지 않는다.
2. **`OVERRULED` 의 의미가 무너진다.** `OVERRULED` 는 "**같은 질문**에 대해 사람이 고르지 않은 후보"이고 R1 이 그것을 기각한다. 다른 좌표의 주장은 애초에 경쟁자가 아니었으므로, 기각하면 **다툰 적 없는 사실을 조용히 죽인다.**
3. **11.6.1 과 어긋난다.** 확인 요청은 이미 좌표 단위다. 그 요청을 처리해 만든 확인 사건이 좌표를 넘나들면 `request_key` 로 다시 붙일 수 없다.

**여러 사실을 한 번에 확인하고 싶다면 확인 사건도 여러 건이다.** 화면에서 버튼 하나로 묶어 보여 주는 것은 UI 의 일이고, 기록은 좌표마다 하나씩 남는다 — `docs/05` 11.5 의 "UI 묶음 동작"이 **체크한 사실마다 `VERIFICATION` 을 하나씩 만든다**고 적은 것과 같은 규칙이다.

> **범위(scope)만 같고 `fact_key` 가 다른 경우도 막는다.** "창고 A 의 9/18 수용량"과 "창고 A 의 9/19 수용량"은 `fact_key` 가 다르므로 **다른 현재 사실**이고, 따라서 다른 확인이다.

**왜 JSON 배열이 아니라 연결 표인가**

`docs/05` 4.2 는 `target_event_ids` · `overruled_event_ids` 를 목록으로 적었지만, 이 둘은 **표시용이 아니라 Reconciliation 의 입력**이다.

```
R1 기각:  이 사건이 어느 확인 처리에서 OVERRULED 로 찍혔나?
          → target_event_id 로 역방향 조회가 필요하다
6.1 계산: 이 사건의 verification_status 는?
          → target_event_id = e 인 확인 사건 중 as_of 이전 가장 늦은 것
```

JSON 배열이면 **매 계산마다 모든 확인 사건의 배열을 풀어야** 한다. `conflict.event_ids` 가 JSON 인 것과 다르다 — 그쪽은 화면에 함께 보여 주기 위한 목록이고 역방향 조회 대상이 아니다.

**확인 요청 처리 기록으로 대신하지 않는다**

| | `verification_request_handling` (11.7) | `event`(VERIFICATION) + 이 표 |
| --- | --- | --- |
| 답하는 질문 | 사람이 **이 요청을 어떻게 처리했나** | 사람이 **이 사실이 맞다고 했나** |
| 분류 | `DECISION_RECORD` | `SOURCE_OF_TRUTH` (사실 주장) |
| 요청 없이 생길 수 있나 | 아니오 | **예** — `verification_method = DIRECT_REVIEW` |
| 현재 사실을 바꾸나 | 아니오 | **예** — 강도 상향 · `value_status` |

`REQUEST_RESOLUTION` 으로 확인하면 **두 기록이 같이 남는다**: 처리 기록 1건(`handling_type = RESOLVED`, `resolving_event_id` = 그 확인 사건)과 확인 사건 1건. 둘 중 하나로 다른 하나를 대신하지 않는다.

### 11.2b 입력 품질과 검증기 신뢰도는 다른 축이다 **(rev.2.3 신규)**

rev.2.2 의 `event` 에는 `input_quality` 만 있었고 `docs/05` 4.2 가 **필수**로 정한 `confidence` 가 없었다. 둘은 다른 질문이다.

| | `input_quality` | `input_confidence_level` |
| --- | --- | --- |
| 묻는 것 | 입력이 **어떤 형태**로 왔나 | 이 입력을 **얼마나 믿을 수 있다고 판정**했나 |
| 값 | `STRUCTURED` · `SEMI_STRUCTURED` · `UNSTRUCTURED` | `HIGH` · `MEDIUM` · `LOW` |
| 정하는 것 | 채널·형식 | **결정론 검증기**(`docs/05` 4.6) |
| 같은 값이 나올 수 있나 | 폼 입력도 자유 문장도 형태는 고정 | 같은 폼 입력이어도 단위가 없으면 `LOW` 로 떨어진다 |

**왜 없으면 안 되는가.** `docs/05` 3.3 근거 강도표의 행이 신뢰도로 갈린다.

```
EMAIL (LLM, 신뢰도 MEDIUM)  →  권한 A 1 · S 1 · W 0
EMAIL · DOCUMENT (신뢰도 LOW) →  전부 0   ← 후보 자격 없음
```

신뢰도가 없으면 **이 표를 색인할 수 없고 근거 강도를 계산할 수 없다.** 근거 강도는 Reconciliation 전체의 입력이므로 R1~R12 가 통째로 돌지 않는다. `docs/20` **A-02**(확정 규칙)도 "모든 사건에 … **신뢰도** … 가 있어야 한다"고 요구한다.

**모든 경로에 있어야 한다.** `extraction` 행이 없는 경로(사람 입력 · 공공 API · 파일 가져오기)도 신뢰도를 갖는다. 그래서 `extraction` 에 두지 않고 `event` 컬럼으로 둔다.

| 경로 | 신뢰도를 정하는 검사 |
| --- | --- |
| `HUMAN_UI` · 구조화 파일·API | 스키마·단위 검사 통과 → `HIGH`(사람·파트너) 또는 `MEDIUM`(공공 API·파일) |
| `EMAIL` · `DOCUMENT` + LLM | 4.6 의 7가지 검사. 모두 통과해도 **`HIGH` 가 되지 않는다** |
| 어느 경로든 모호 표현·단위 없음·인용 불일치 | `LOW` + 확인 요청 |

**사유는 표를 만들지 않는다.** `input_confidence_reasons` 는 구조화 값 목록(`JSON`)이다. 사유는 조회·조인 대상이 아니라 화면 설명과 감사용이고, 검사 목록은 정책(`docs/05` 4.6)이 바뀌면 같이 바뀐다. 표로 고정하면 정책 판마다 스키마를 바꿔야 한다.

> **`model_confidence` 와 다르다.** `extraction.model_confidence` 는 LLM 이 스스로 매긴 점수이고 `docs/05` 4.6 이 "쓰지 않는다"고 못박았다. `input_confidence_level` 은 **결정론 검증기의 판정**이다.

### 11.2c 출처는 세 축이다 **(rev.2.3 — 사용자 결정 C)**

**2026-09-21 사용자 결정**: 출처 어휘를 ADR-020 의 3축으로 통일한다.

| 축 | 컬럼 | 묻는 것 | 값 |
| --- | --- | --- | --- |
| **채널** | `source_type` | 어떤 **경로**로 들어왔나 | `HUMAN_UI` · `FILE_IMPORT` · `EMAIL` · `DOCUMENT` · `PUBLIC_API` · `PARTNER_SYSTEM` · `INFERENCE` |
| **역할** | `source_role_at_ingestion` | 현실에서 **누구의 역할**로 말했나 | 등록부가 결정론적으로 정한다(`docs/05` 3.2) |
| **추출 방식** | `extraction_method` | 원문에서 값을 **어떻게 뽑았나** | `DIRECT` · `RULE_PARSED` · `LLM_EXTRACTED` · `CALCULATED` |

**무엇이 바뀌었나.** rev.2.2 는 `source_kind` 6값(`PUBLIC_API`·`EMAIL`·`DOCUMENT`·`HUMAN_INPUT`·`PLAN_UPLOAD`·`INTERNAL`)을 썼는데, 이것은 ADR-020 이 고정한 목록과 다르고 **채널과 입력 형태가 섞여 있었다.**

| 옛 값 | 새 표현 | 왜 |
| --- | --- | --- |
| `HUMAN_INPUT` | `source_type = HUMAN_UI` | 같은 개념. ADR-020 의 이름을 쓴다 |
| `PLAN_UPLOAD` | `source_type = FILE_IMPORT` + `fact_kind = PLAN` | **업로드는 채널이고 계획은 사실 종류다.** 한 값에 섞으면 "메일로 온 계획"을 표현할 수 없다 |
| `INTERNAL` | **의미를 보고 나눈다** | 아래 |

**`INTERNAL` 을 문자열 치환하지 않는 이유.** 이 값은 두 가지를 한 칸에 담고 있었다.

| 실제로 무엇이었나 | 새 표현 |
| --- | --- |
| CERA 엔진이 만든 추정값(R8 빈칸 채움) | `source_type = INFERENCE` + `extraction_method = CALCULATED` + `source_role = CERA_ENGINE` |
| CERA 안의 다른 모듈이 옮긴 값 | **사건이 아닐 가능성이 높다.** 계산 결과는 `risk_assessment`·`cost_result` 로 가고 `event` 로 오지 않는다(안티패턴 8 · I-13). 사건으로 만들어야 한다면 원래 출처의 축을 그대로 쓴다 |

**두 축을 섞지 않는다.** `source_type` 은 경로, `extraction_method` 는 방법이다.

| 상황 | `source_type` | `extraction_method` |
| --- | --- | --- |
| 운영자가 화면에서 직접 입력 | `HUMAN_UI` | `DIRECT` |
| 공공 API 구조화 응답을 어댑터가 파싱 | `PUBLIC_API` | `RULE_PARSED` |
| 파트너 TMS 가 구조화 필드로 보냄 | `PARTNER_SYSTEM` | `DIRECT` |
| 메일 자유 문장에서 LLM 추출 | `EMAIL` | `LLM_EXTRACTED` |
| 계약서 PDF 에서 LLM 추출 | `DOCUMENT` | `LLM_EXTRACTED` |
| CSV 업로드 | `FILE_IMPORT` | `RULE_PARSED` |
| 엔진 추정 | `INFERENCE` | `CALCULATED` |

- **`extraction_method = LLM_EXTRACTED` 이면 `extraction_id` 가 있어야 한다**(I-23). 반대로 `extraction_id` 가 없다고 해서 값이 저절로 믿을 만해지지는 않는다 — 신뢰도는 11.2b 가 따로 정한다.
- **AI 사용 여부와 채널을 혼동하지 않는다.** `EMAIL` 이어도 구조화 회신이면 `DIRECT`·`RULE_PARSED` 다(ADR-026 의 `capabilities().structured_reply`).

> **`raw_input.source_type` 도 같은 7값으로 맞췄다**(11.1). 같은 이름이 두 표에서 다른 값 집합을 가리키던 상태를 없앴다.

> **Q-46 은 닫지 않는다.** 이 7값은 **현재 ADR 기준으로 논리 모델을 정렬한 것**이지 영구 확정 enum 이 아니다. ADR-020 본문도 "각 축의 **값 목록이 현장에 충분한지**는 아직 승인되지 않았다"고 적어 두었다(`docs/14:256`). 상대방이 직접 입력한 구조화 값(모바일 응답 링크·거래처 포털)을 `HUMAN_UI` 로 넣으면 **CERA 사용자 입력과 같은 강도가 되어 권한 모델이 무너진다**(`docs/18` M.4). 그 해법(`actor_type` 신설 여부 포함)은 **권한 모델과 함께 Q-46 에서 정한다.** 그래서 18절 코드값 정책은 `source_type` 과 `source_role_at_ingestion` 을 **"업무가 늘릴 수 있는 값"**(코드 테이블)으로 다룬다. `extraction_method` 는 4값이 안정적이고 로직이 직접 의존하므로(I-23) 고정 목록 쪽이다.

### 11.2d 멱등 키 · 업무 사건 유형 · 스키마 판 · 부가 속성 **(rev.2.3 신규)**

#### 멱등 키 (`idempotency_key`)

**왜 `raw_input` 의 유일 제약으로 부족한가.** 11.1 의 `UNIQUE(source_name, source_record_key)` 는 **같은 전달 건을 두 번 수집하는 것**을 막는다. 그런데 이 설계는 **한 원문 → 여러 사건**이다(11.1 · `docs/05` 4.4). 그래서 같은 `raw_input` 을 **다시 처리**하면(파서 수정 · 재시도 · 장애 복구) 같은 주장이 사건으로 중복 생성되고, 수집 쪽 제약은 이것을 전혀 막지 못한다.

**논리 재료** — `docs/05` 4.2 의 `hash(raw_ref, entity, fact_key)` 를 **그대로 쓰지 않는다.** rev.2 에서 적용 범위가 사실의 식별자에 들어왔기 때문이다(11.4.1).

| 재료 | 왜 필요한가 |
| --- | --- |
| `raw_input_id` (또는 사람 액션의 주장 위치) | 어느 원천에서 온 주장인가 |
| **SUBJECT 개체** (`entity_type` · `entity_id`) | 어느 개체의 사실인가 |
| `fact_key` | 어느 사실인가 |
| **`applicability_scope_type` · `applicability_scope_ref`** | **범위가 다르면 다른 사실이다.** 빼면 `GLOBAL` 15,000원과 `RECOVERY_CONTEXT` 0원이 같은 키가 되어 **둘째 입력이 조용히 사라진다** |
| `event_class` | 같은 사실에 대한 관측·정정·확인은 서로 다른 사건이다 |
| **주장 위치(claim locator)** | 한 원문 안에 **같은 개체·같은 사실 키가 여러 번** 나올 수 있다(일일 보고의 날짜별 줄). 구분자가 없으면 두 번째 줄이 중복으로 버려진다 |

- `VERIFICATION` 은 `fact_key` 가 없으므로 **대상 사건 id 들의 정렬된 집합**이 그 자리를 대신한다.
- **직렬화 방식 · 해시 알고리즘 · 주장 위치의 형식은 물리 설계(T-080)** 에서 정한다. 여기서 정하는 것은 "무엇을 넣고 무엇을 빼는가"다.
- 중복이 들어오면 **거부가 아니라 무시**다(`docs/05` 4.5 "무시(로그만)"). 기술 오류가 아니므로 `system_error` 로 가지 않는다.

#### 업무 사건 유형 (`event_type`)

`fact_key` 와 **역할이 다르다.**

| | `event_type` | `fact_key` |
| --- | --- | --- |
| 묻는 것 | 업무적으로 **무슨 일**이 있었나 | **어느 사실**을 주장하나 |
| 예 | `WAREHOUSE_CAPACITY_CHANGED` | `warehouse.capacity@2026-09-18` |
| 쓰는 곳 | 어댑터 매핑 · Activity Timeline · 사건 카탈로그 | Reconciliation · `canonical_fact` 키 |
| 카탈로그 | `docs/05` 4.4 | `docs/05` 4.3 |

한 `event_type` 이 여러 사건을 만들 수 있다(`WAREHOUSE_DAILY_REPORT` 하나 → `intake.*` 여러 건). 반대로 같은 `fact_key` 를 **다른 업무 의미**로 주장할 수도 있다. 둘 중 하나로 다른 하나를 유도하지 않는다.

> `data/scenarios/busan-wh-capacity-01/events.json` 이 이미 이 값을 **17건** 담고 있다. 시나리오가 쓰는 값이 논리 모델에 없던 상태였다.

#### 스키마 판 (`schema_version`)

`event` 는 append-only 다. 스키마가 진화해도 **과거 행을 고칠 수 없다.** 그래서 "이 행을 어느 계약 판으로 읽어야 하는가"를 행 자신이 들고 있어야 한다. **나중에는 넣을 수 없다** — 이미 쌓인 행에는 값이 없기 때문이다. 판 문자열의 형식은 물리 설계에서 정한다.

#### 부가 속성 (`payload`)

**잡동사니 저장소로 만들지 않는다.** 아래는 계속 **정식 컬럼·관계**로 유지한다.

```
SUBJECT · fact_key · 적용 범위 · 출처 3축 · 시각들 · 값 · 신뢰도 · 확인 · 멱등 키
```

`payload` 에 들어가는 것은 **사건 종류별 부가 정보**뿐이다.

| 키 | 무엇 | 쓰는 곳 |
| --- | --- | --- |
| `change_reason` | 수용량이 왜 줄었나 | R6 의 "변화 선언" 예외 판정(값 목록은 **Q-34 OPEN**) |
| `forecast_kind` | `SCHEDULED` · `ESTIMATED` · `PREDICTED` | `forecast.eta` 의 해석 |
| `tz_assumed` | 원천에 타임존이 없어 어댑터가 붙였다 | `docs/20` **A-03** 이 "그 사실을 기록한다"고 요구 |
| `date_header_raw` · `channel_received_at` · `recorded_at_basis` · `date_header_rejected` 등 | 메일의 원래 두 시각과 선택 결과 (rev.2.4) | **Q-44** 재판정·감사 — 11.2e |

**판단 기준**: 조회·조인·제약의 대상이면 컬럼이고, 설명·감사용이면 `payload` 다. 새 키를 넣기 전에 이 기준을 먼저 적용한다.

### 11.2e 메일의 출처 기록 시각 — 두 시각 중 무엇을 고르나 **(rev.2.4 · Q-44 사용자 결정)**

**2026-09-21 사용자 결정 — Q-44 CLOSED.** 메일에는 시각이 둘 있다.

| 시각 | 누가 붙이나 | 성질 |
| --- | --- | --- |
| **`Date` 헤더** (RFC 5322) | 발신자 쪽 메일 프로그램 | 발신자가 **바꿀 수 있다** |
| **채널 수신 시각** (Gmail `internalDate`) | 채널(Google) | 발신자가 바꿀 수 없다. 정확한 의미는 **`[TO VERIFY]`** — Tech Validation 에서 확인 |

**선택 규칙 (결정론)**

```
if  Date 헤더가 있고
and 정상 파싱되고                (타임존 해석 포함. 타임존이 없으면 A-03 — Asia/Seoul + tz_assumed)
and Date ≤ 채널 수신 시각         (채널이 받은 것보다 미래가 아니다)
then  source_recorded_at = Date                       recorded_at_basis = DATE_HEADER
else  source_recorded_at = 채널 수신 시각              recorded_at_basis = CHANNEL_RECEIVED
      date_header_rejected = true
      date_header_reject_reason = MISSING | UNPARSEABLE | AFTER_CHANNEL_RECEIVED
```

**왜 방향에 따라 다르게 보나** — 위험한 쪽은 **근거 시각이 실제보다 늦게 찍히는 것**이다. 오래된 주장이 최신처럼 보이면 R4-a "최근 우선"에서 진짜 최신 관측을 이긴다.

```
09:00  담당자가 "지금 8대" 메일 작성 (Date = 09:00)
10:00  다른 출처가 "12대" 관측
11:00  메일이 늦게 도착 (채널 수신 = 11:00)

채널 수신 시각을 쓰면 → 11:00 의 주장이 된다 → 10:00 관측을 이긴다   ← 틀렸다
Date 를 쓰면           → 09:00 의 주장이다   → 10:00 관측이 이긴다   ← 맞다
```

| `Date` 가 채널 수신 시각보다 | 무엇을 쓰나 | 왜 안전한가 |
| --- | --- | --- |
| **과거** (늦게 도착) | `Date` — **허용** | 주장이 약해지는 쪽이다. 발신자가 일부러 과거로 적어도 자기 주장만 약해진다 |
| **미래** | 채널 수신 시각 + `date_header_rejected` | 발신자가 미래로 적어 **최신처럼 위장하는 것을 막는다**. 근거 시각은 **채널이 받은 시각보다 늦을 수 없다** |

- **허용 오차는 두지 않는다**(MVP 규칙: `Date > 채널 수신 시각` 이면 거부). 시계 오차 때문에 허용 오차가 필요하다고 드러나면 **정책 파라미터로 추가**하고 값은 `[TO VERIFY]` 로 둔다. 기존 `clock_tolerance_tau`(τ, "동시로 보는 시각 차이")와는 뜻이 달라 **같은 값을 재사용하지 않는다**.
- 아주 오래된 `Date`(예: 시계가 크게 틀린 발신자)는 거부하지 않는다. 주장이 약해지는 안전한 방향이다.

**원래 두 시각을 버리지 않는다 — `event.payload` 에 남긴다**

| `payload` 키 | 값 |
| --- | --- |
| `date_header_raw` | `Date` 헤더 원래 문자열 (없으면 비움) |
| `date_header_parsed` | 파싱한 시각 (실패면 비움) |
| `channel_received_at` | 채널 수신 시각(Gmail `internalDate`) |
| `recorded_at_basis` | `DATE_HEADER` · `CHANNEL_RECEIVED` |
| `date_header_rejected` | `true` / `false` |
| `date_header_reject_reason` | `MISSING` · `UNPARSEABLE` · `AFTER_CHANNEL_RECEIVED` |

**왜 컬럼이 아니라 `payload` 인가** (11.2d 판단 기준 적용). 이 값들은 조회·조인·제약의 대상이 아니다. 선택 결과는 이미 정식 컬럼 `source_recorded_at` 에 있고, 원래 두 시각은 **설명·감사와 정책이 바뀔 때의 재판정**에만 쓰인다. 한 메일에서 나온 사건이 여럿이면 같은 값이 각 사건에 반복되지만, 모두 같은 원문에서 결정론적으로 나오므로 서로 어긋나지 않는다(정규화 여부는 물리 설계).

**원문이 파기돼도 재판정할 수 있다.** 원래 `Date` 문자열은 원문(RFC822) 안에도 있지만, 원문은 가장 먼저 파기되는 내용이다(29절). 두 시각을 사건에 남겨 두었으므로 **선택 정책이 나중에 바뀌어도 원문 없이 다시 판정할 수 있다.** 사건 행은 고치지 않는다 — 재판정은 근거 시각을 **계산하는 쪽**(파생)에서 한다.

### 11.3 `event_entity_link` — 사건이 가리키는 개체

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`APPEND_ONLY`** (덧붙이기) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 |
| --- | --- | --- | --- | --- |
| 사건 | `event_id` | `REF(event)` | 예 | **PK 일부**, FK |
| 개체 종류 | `entity_type` | `CODE` | 예 | **PK 일부** (`CONTAINER`·`BL`·`FACILITY`·`COUNTERPARTY`·`TRUCK_POOL`·`VESSEL_CALL`) |
| 개체 id | `entity_id` | `STRING(30)` | 예 | **PK 일부** |
| 역할 | `link_role` | `CODE` | **예** (rev.2.5 표기 정정 — I-8 이 이 값으로 SUBJECT 를 센다) | `SUBJECT`(사실의 주체) / `CONTEXT`(맥락) |

**Integrity Rules** (rev.2 수정)

1. **사건마다 `link_role = SUBJECT` 인 행이 정확히 1건**이다. 부분 유일 제약으로 강제한다.
2. `link_role = CONTEXT` 는 0건 이상 얼마든지 둘 수 있다.
3. **다형 참조**라 DB FK 로 강제할 수 없다. `entity_type` 별 존재 검사는 **쓰기 경로에서 반드시 수행한다**(17절).

**왜 SUBJECT 를 하나로 고정하는가**

`canonical_fact` 의 키가 (`entity_type`, `entity_id`, `fact_key`) 다. 사건이 주체를 여럿 가지면 **한 사건이 어느 현재 사실로 가는지가 결정되지 않는다.** 사실 하나에 주장 하나 — 이 대응이 깨지면 Reconciliation 이 결정론이 아니게 된다.

| 상황 | SUBJECT | CONTEXT |
| --- | --- | --- |
| 창고 A 의 9/18 수용량이 8 TEU 로 줄었다 | **창고 A** | (없어도 된다) |
| 영향받는 컨테이너 12대는? | **주체가 아니다.** 위험·영향 **계산 결과**다(`risk_assessment`) | 굳이 남기려면 CONTEXT |
| B/L 단위로 통관 상태가 왔다 | **B/L** | 관련 컨테이너들 |
| 컨테이너 한 대가 반출됐다 | **그 컨테이너** | B/L · 터미널 |

> 컨테이너 12대에 **각각** 사실을 남기고 싶다면 그것은 **12건의 사건**이다. 한 건이 아니다. 창고 수용량 감소는 창고의 사실이고, 그것이 12대에 미치는 영향은 **계산이지 사실이 아니다**.

### 11.4 `canonical_fact` — 현재 사실 (**파생·물질화**)

- 분류 **`DERIVED_MATERIALIZED`** · 변경 **`REBUILDABLE`** (재계산으로 덮어쓴다) · MVP
- **원칙: 이 테이블 전체를 지워도 `event` 만으로 똑같이 복원된다.** 여기에만 있는 정보는 없어야 한다(I-7 재현 테스트).

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 개체 종류 | `entity_type` | `CODE` | 예 | **PK 일부** | |
| 개체 id | `entity_id` | `STRING(30)` | 예 | **PK 일부** | |
| 사실 키 | `fact_key` | `STRING(120)` | 예 | **PK 일부** | `event.fact_key` 와 같은 문자열 |
| **적용 범위 종류** | `applicability_scope_type` | `CODE` | 예 | **PK 일부** | 기본 `GLOBAL`. **범위가 다르면 서로 다른 사실이다** — 11.4.1 |
| **적용 범위 참조** | `applicability_scope_ref` | `STRING(60)` | 예 | **PK 일부** | `GLOBAL` 이면 빈 문자열 |
| 사실 이름 | `fact_name` | `STRING(60)` | 예 | | 파라미터를 뗀 이름(`warehouse.capacity`) |
| 파라미터 · 날짜 | `param_date` | `DATE` | 아니오 | | 조회용 분해(Q-63) |
| 파라미터 · 슬롯 | `param_slot_start` | `TIMESTAMP_TZ` | 아니오 | | |
| 파라미터 · 규격 | `param_size_type` | `CODE` | 아니오 | | |
| 채택 값 | `value_*` (4종 + `value_unit`) | — | | | `event` 와 같은 모양 |
| 적용 기간 | `valid_from` · `valid_until` | `TIMESTAMP_TZ` | 아니오 | | **시간 범위**. 사건에서 물려받는다 |
| **채택 사건** | `winning_event_id` | `REF(event)` | 예 | FK | **어떤 사건이 이겼는지 반드시 남긴다** |
| 적용 규칙 | `applied_rule` | `CODE` | 예 | | `R1`~`R12` 중 승부를 가른 규칙 |
| 규칙 판 | `rule_version` | `STRING(20)` | 예 | | 재계산 재현용 |
| **① 값 보증** | `value_status` | `CODE` | 예 | | **rev.2.3 — 옛 `verification_status` 교체.** `CONFIRMED`·`OBSERVED`·`PROVISIONAL`·`INFERRED`·`UNKNOWN` — 11.4.2 |
| **확인 근거** | `verification_basis` | `CODE` | 아니오 | | **rev.2.3 신규.** `CONFIRMED` 일 때만: `HUMAN_VERIFICATION`·`AUTHORITATIVE_SYSTEM`·`POLICY_EVIDENCE` |
| **② 신선도** | `freshness_status` | `CODE` | 예 | | `FRESH`·`AGING`·`STALE`·`EXPIRED`·`UNKNOWN`·`N_A` |
| **③ 충돌** | `conflict_status` | `CODE` | 예 | | **rev.2.3 — 옛 `has_conflict BOOLEAN` 교체.** `NONE`·`DISSENT`(진 후보 기록, 판단 차단 없음)·`OPEN`(해결 전 판단 차단) |
| **④ 보류** | `hold_status` | `CODE` | 예 | | **rev.2.3 신규.** `NONE`·`HELD`(불리한 큰 변경이 확인을 기다림, R10) |
| **⑤ 결정 가능성** | `decision_usability` | `CODE` | 예 | | **rev.2.3 신규.** `USABLE`·`USABLE_WITH_WARNING`·`APPROVAL_BLOCKED`·`UNUSABLE` (R11). **엔진은 이것 하나만 본다** |
| **근거 강도** | `evidence_strength` | `CODE` | 예 | | **계산 결과**. 원천 축 + 정책으로 판정한다. `event` 에는 없다. 값은 `docs/05` 3.3 의 강도 등급 **`0`·`1`·`2`·`3`**(rev.2.5 표기 정정 — 작업표 예시 `STRONG` 은 정본에 없는 값이었다) |
| **근거 강도 정책 판** | `evidence_policy_version` | `STRING(20)` | 예 | | 어느 정책으로 판정했나. 정책이 바뀌면 재계산한다 |
| 근거 시각 | `evidence_time` | `TIMESTAMP_TZ` | 아니오 | | 3단계 폴백 결과 |
| 근거 시각 품질 | `evidence_time_quality` | `CODE` | 예 | | `EVENT_TIME`·`RECORDED_TIME`·`RECEIVED_ONLY` — 어느 단계에서 왔는지 |
| 시간 신뢰도 | `temporal_confidence` | `CODE` | 예 | | 근거 시각을 얼마나 믿을 수 있나(ADR-014 T-060 주석) |
| 기여 사건 수 | `contributing_event_count` | `INTEGER` | 예 | | |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | **PK 일부** | 실제와 시뮬레이션이 같은 키를 공유하지 않게 한다 |
| 시나리오 | `scenario_id` | `REF(scenario)` | 아니오 | FK | |
| 계산 기준 시각 | `computed_as_of` | `TIMESTAMP_TZ` | 예 | | |
| 계산 시각 | `computed_at` | `TIMESTAMP_TZ` | 예 | | |

- **PK** = (`entity_type`, `entity_id`, `fact_key`, `applicability_scope_type`, `applicability_scope_ref`, `is_simulated`).
- `value` 를 사람이 직접 고치는 경로는 없다. 운영자 수정은 **새 사건**이고 재계산이 이 표를 바꾼다(3.1 안티패턴 9 와 같은 원리 — 현재 사실은 `event` 경로로만 바뀐다).

#### 11.4.1 범위가 다른 현재 사실은 서로를 밀어내지 않는다 **(rev.2 신규 — 흐름 검증에서 발견)**

27절 흐름 검증에서 **rev.2 초안의 모순**이 하나 드러났다.

```
이미 있던 사실:  창고 B 보관료 = 15,000원   (범위 GLOBAL)
운영자 입력:     창고 B 보관료 = 0원        (범위 RECOVERY_CONTEXT = 이번 건)

주체     = FACILITY / FAC-WH-B   ← 같다
fact_key = warehouse.storage_rate ← 같다
```

PK 가 (주체 + 사실 키 + 시뮬레이션)뿐이면 **두 사실이 같은 칸을 놓고 다툰다.** 그러면 0원이 15,000원을 덮어써서, 22절이 막으려던 바로 그 일 — **한 번 입력한 "0원"이 시설 전체로 조용히 퍼지는 것** — 이 PK 수준에서 그대로 일어난다. 반대로 15,000원이 이기면 운영자의 입력이 사라진다.

**둘은 경쟁하는 주장이 아니다.** "평소 얼마인가"와 "이번 건에 얼마인가"는 **서로 다른 질문**이고 둘 다 참일 수 있다. 그래서 **범위를 PK 에 넣어 각각 한 행으로 공존**시킨다.

| 무엇이 정한다 | 어디서 |
| --- | --- |
| **같은 범위 안에서** 누가 이기나 | Reconciliation (R1~R12). 지금까지와 같다 |
| **여러 범위 중** 어느 것을 쓰나 | **계산 시점의 범위 선택 정책(Scope Resolution Policy)**. 아래 참고 |

```
이번 복구 맥락 계산  →  RECOVERY_CONTEXT 행이 있으면 그것,  없으면 GLOBAL 행
다른 건 계산         →  RECOVERY_CONTEXT 행은 보이지 않는다  →  GLOBAL 행
```

**범위 선택 정책은 이번 단계에서 확정하지 않는다** (rev.2.1). 위 예시는 **범위가 둘(`RECOVERY_CONTEXT` · `GLOBAL`)일 때**의 동작이고, 좁은 쪽이 이긴다는 직관이 통한다. 그러나 범위가 늘면 그렇게 간단하지 않다.

```
CONTRACT (A 계약)                          ┐
CONTAINER (CNT-0001)                       ├─ 셋 다 "GLOBAL 보다 좁다". 서로는 누가 더 좁은가?
RECOVERY_CONTEXT (<RECOVERY_CONTEXT_REF>)  ┘
```

**셋은 서로 다른 축**이라 한 줄로 세울 수 없다. `RECOVERY_CONTEXT > CONTAINER > CONTRACT > GLOBAL` 같은 우선순위를 지금 임의로 박으면, 현업이 실제로 쓰는 조합이 확인되기 전에 잘못된 답을 고정하게 된다.

**이번 논리 설계에서 확정한 것은 여기까지다.**

| 확정 | |
| --- | --- |
| 적용 범위는 **현재 사실의 식별자에 포함된다** | 11.4.1 |
| **같은 범위 안에서만** Reconciliation 한다 | 11.4.1 · 11.5.1 |
| 한 계산에 **적용 가능한 범위가 여럿일 수 있다** | 이 절 |
| 계산 시점에 **결정론적인 범위 선택 정책이 필요하다** | 이 절 |
| 어느 범위를 실제로 썼는지는 **스냅샷에 남는다** | 13.2 |

**확정하지 않은 것**: 범위 종류들 사이의 **우선순위 규칙**. 이것은 비용·상태 결정 정책 또는 구현 계획에서 정한다 → **L-14** 에 포함해 관리한다. **새 OPEN 항목을 만들지 않았다.**

**Integrity Rules**

1. `applicability_scope_type = GLOBAL` 이면 `applicability_scope_ref` 는 **빈 문자열**이다.
2. 범위가 다른 두 행은 **충돌(`conflict`)이 아니다.** 충돌 판정은 **같은 범위 안에서만** 한다.
3. 계산이 어느 범위의 행을 썼는지는 `planning_snapshot_fact` 에 그대로 복사돼 남는다.

> `planning_snapshot_fact` 의 PK 에도 같은 이유로 범위 두 컬럼이 들어간다(13.2).

#### 11.4.2 현재 사실의 상태는 한 칸이 아니라 다섯 차원이다 **(rev.2.3 — ADR-020 복구)**

**무엇이 잘못돼 있었나.** rev.2.2 의 `canonical_fact` 는 서로 다른 질문을 한 enum 에 넣고 있었다. 이것은 ADR-020 이 **기각한 대안 바로 그것**이다(`docs/14:253`).

```
rev.2.2:  verification_status = VERIFIED · INFERRED · ASSUMED · UNKNOWN · CONFLICTED
                                                                          ↑
                                          "누가 보증하나" 칸에 "다툼이 있나"가 들어가 있었다
          has_conflict BOOLEAN            ← DISSENT 와 OPEN 을 구분할 수 없다
          hold_status  없음                ← R10 보류를 표현할 수 없다
          decision_usability 없음          ← 엔진이 볼 값이 없다
```

ADR-020 **`Accepted (구조 한정)`**, `docs/14:252`:

> "Canonical Fact는 `value_status`, `freshness_status`, `conflict_status`, `hold_status`를 따로 두고, 엔진은 이를 합친 `decision_usability` 하나를 본다."

승인된 `docs/21` 10.2 도 같은 말을 한다 — "**한 값으로 합치지 않는다**", "**엔진은 결정 가능성 하나만 보면 된다**".

**무엇이 깨져 있었나.** 표현의 문제가 아니라 기능이 세 개 막혀 있었다.

| # | 막힌 것 | 근거 |
| --- | --- | --- |
| 1 | **계획 승인 게이트**. `APPROVAL_BLOCKED` 를 판정할 차원이 없다 | `docs/03` FR-OPT-06 (`Must`) · `docs/05` 11.5 규칙 1 |
| 2 | **R10 보류**. "불리한 큰 변경은 확인 전까지 보류"의 상태를 저장할 곳이 없다 | ADR-019 `Accepted`(`docs/14:235`) |
| 3 | **"사람이 확인했지만 오래됐다"**(CONFIRMED + STALE) 같은 조합 | ADR-020 맥락(`docs/14:248`)이 기각 사유로 든 바로 그 예 |

**복구한 다섯 차원 + 근거 한 개**

| 차원 | 묻는 것 | 무엇이 바꾸나 |
| --- | --- | --- |
| `value_status` | 이 값을 **누가 보증하나** | 새 사건, **사람 확인** |
| `freshness_status` | **얼마나 오래됐나** (모름도 한 값) | 시계(`as_of`), 근거 시각 품질 |
| `conflict_status` | **다툼이 있나** | 새 사건, 사람 확인 |
| `hold_status` | 불리한 큰 변경이 **확인을 기다리나** | R10, 사람 확인 |
| `decision_usability` | **엔진이 이 값으로 판단해도 되나** | 위 네 차원 + 사실의 중요도(R11) |
| `verification_basis` | `CONFIRMED` 가 **무슨 근거로** 됐나 | `docs/05` 6.2 의 세 가지뿐 |

**값 목록은 `docs/05` 6.2 에 정의된 것만 쓴다.** rev.2.2 에만 있던 `VERIFIED` · `ASSUMED` 는 정본에 없는 값이라 쓰지 않는다.

| 옛 값 | 새 표현 | 비고 |
| --- | --- | --- |
| `VERIFIED` | `value_status = CONFIRMED` | `docs/05` 6.2 의 이름 |
| `INFERRED` | `value_status = INFERRED` | 같음 |
| `ASSUMED` | **없앤다** | 정본에 없다. 해당 상황은 `PROVISIONAL`(강도 1) 또는 `INFERRED` 다 |
| `CONFLICTED` | `conflict_status = OPEN` | **다른 축이다.** 값 보증 칸에서 뺀다 |
| (없음) | `value_status = OBSERVED` · `PROVISIONAL` · `UNKNOWN` | 정본에 있는데 빠져 있었다 |

**`confidence` 를 제거했다.** rev.2.2 의 `canonical_fact.confidence DECIMAL(5,4)` 는 **설명 칸이 비어 있었고**, 승인된 문서·ADR·`docs/05` 어디에도 이 숫자의 계산 의미가 정의돼 있지 않다. 정의가 없는 숫자에 새 의미를 만들어 붙이지 않는다.

| 이 설계에서 "얼마나 믿을 수 있나"를 답하는 것 | 어디 | 무엇 |
| --- | --- | --- |
| `event.input_confidence_level` | 사건 | 결정론 **검증기**의 입력 품질 판정 (11.2b) |
| `canonical_fact.evidence_strength` | 현재 사실 | 채널 × 권한 × 확인 × 신뢰도의 **계산 결과** |
| `canonical_fact.value_status` | 현재 사실 | 누가 **보증**하나 |
| `canonical_fact.temporal_confidence` | 현재 사실 | **근거 시각**을 얼마나 믿나 |
| `extraction.model_confidence` | 추출 | LLM **자기 점수**. 쓰지 않는다 |

**같은 이름 `confidence` 를 여러 의미로 두지 않는다.** 그래서 이름이 겹치던 무의미 컬럼 하나를 없애고, 나머지는 각자 다른 이름을 갖는다.

**Integrity Rules** (rev.2.3 추가)

1. `value_status = CONFIRMED` 이면 `verification_basis` 가 **NOT NULL** 이다. 그 밖에는 비어 있다.
2. `verification_basis = HUMAN_VERIFICATION` 은 **`VERIFICATION(CONFIRM)` 사건이 있거나** 이긴 값이 `HUMAN_UI` 직접 입력(강도 ≥ 2)일 때만 선다.
3. **계획 승인은 `verification_basis` 가 아니다.** `plan_decision` 은 `canonical_fact` 의 어느 차원도 바꾸지 않는다(`docs/21` 12.2 A-17 · FR-OPT-06).
4. `conflict_status = OPEN` 이면 같은 범위의 `conflict` 행이 존재한다(11.5.1).
5. `decision_usability` 는 **저장하지만 원천이 아니다.** 독립적으로 쓰거나 사람이 고치는 경로가 없고, 아래 입력에서 **결정론적으로 유도**된다(R11). 같은 입력이면 항상 같은 값이다(I-24).

   | 입력 | 어디서 오나 |
   | --- | --- |
   | `value_status` · `freshness_status` · `conflict_status` · `hold_status` | 같은 행의 네 차원 |
   | **사실의 중요도** | 정책 — 어느 판인지는 **`rule_version`**(R11 규칙 판)과 부모 계산의 `policy_version` 이 정한다 |

   그래서 **판이 바뀌면 같은 네 차원에서 다른 `decision_usability` 가 나올 수 있다.** 이것이 판을 함께 저장·복사하는 이유다(11.4 `rule_version` · 13.2.1).

### 11.5 `conflict` — 충돌

- 분류 **`DERIVED_MATERIALIZED`** · 변경 **`REBUILDABLE`** (재계산으로 덮어쓴다) · MVP

`conflict_id` PK · 대상 **5열**(`entity_type` · `entity_id` · `fact_key` · **`applicability_scope_type`** · **`applicability_scope_ref`**) · `conflict_type CODE` · `event_ids JSON`(대립한 사건들) · `severity CODE` · `detected_rule CODE` · `rule_version` · `blocks_automation BOOLEAN` · `computed_as_of` · `is_simulated` · `scenario_id`.

#### 11.5.1 충돌은 **같은 범위 안에서만** 생긴다 (rev.2.1 수정)

`canonical_fact` 의 식별자에 적용 범위가 들어간 순간(11.4.1), **충돌 판정의 단위도 같이 좁아져야 한다.** rev.2 는 대상을 3열로만 적어 두어 이 규칙을 표현할 수 없었다.

```
창고 B 보관료 = 15,000원   (범위 GLOBAL)
창고 B 보관료 = 0원        (범위 RECOVERY_CONTEXT / <RECOVERY_CONTEXT_REF>)

주체 같다 · 사실 키 같다  →  rev.2 구조에서는 한 충돌로 묶인다  ← 틀렸다
```

이 둘은 **다투는 주장이 아니다.** "평소 얼마인가"와 "이번 건에 얼마인가"는 서로 다른 질문이고 둘 다 참이다. 충돌로 잡으면 운영자에게 **있지도 않은 모순을 확인하라고 요구**하게 되고, `blocks_automation` 이 서면 자동화까지 멈춘다.

**Integrity Rules**

1. 충돌은 (`entity_type`, `entity_id`, `fact_key`, `applicability_scope_type`, `applicability_scope_ref`) 가 **모두 같은** 사건들 사이에서만 만든다.
2. 범위가 다른 두 사건은 **어떤 경우에도 같은 충돌 행에 들어가지 않는다.**
3. `canonical_fact.conflict_status` 는 **같은 범위의 충돌**만 반영한다(rev.2.3 — 옛 `has_conflict`).

> 충돌의 **해소**는 여기에 쓰지 않는다. 해소는 새 사건이거나 확인 요청 처리 기록이다.

### 11.6 `verification_request` — 확인 요청 (**파생**)

- 분류 **`DERIVED_MATERIALIZED`** · 변경 **`REBUILDABLE`** · MVP · **Q-59 의 핵심**

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 요청 id | `verification_request_id` | `STRING(40)` | 예 | **PK** | **파생 대리키. 재계산 때 바뀔 수 있다** |
| **요청 키** | `request_key` | `HASH` | 예 | **UNIQUE** | **결정적 값**. 재계산해도 같다. 재료는 아래 11.6.1 |
| 발생 규칙 | `trigger_rule` | `CODE` | 예 | | 왜 사람에게 물어야 하나 |
| 대상 | `entity_type` · `entity_id` · `fact_key` | — | 예 | | |
| **대상 적용 범위** | `applicability_scope_type` · `applicability_scope_ref` | `CODE` · `STRING(60)` | 예 | | **범위가 다르면 다른 확인 문제다** — 11.6.1 |
| 관련 충돌 | `conflict_id` | `REF(conflict)` | 아니오 | FK | 화면에 같이 보여 주기 위한 참조. **`request_key` 의 재료가 아니다** |
| 우선순위 | `priority` | `CODE` | 예 | | |
| 자동화 차단 | `blocks_automation` | `BOOLEAN` | 예 | | |
| 계산 기준 | `computed_as_of` · `computed_at` | `TIMESTAMP_TZ` | 예 | | |
| 현재 처리 상태 | `current_status` | `CODE` | 예 | | `handling` 을 접은 **캐시** |
| 시뮬레이션 | `is_simulated` · `scenario_id` | — | | FK | |

#### 11.6.1 범위가 다르면 다른 확인 요청이다 (rev.2.1 수정)

```
"창고 B 의 평소 보관료가 얼마인지 확인해 주세요"        (GLOBAL)
"창고 B 의 이번 건 보관료가 얼마인지 확인해 주세요"     (RECOVERY_CONTEXT / <RECOVERY_CONTEXT_REF>)
```

주체도 같고 사실 키도 같지만 **묻는 내용이 다르다.** 범위를 빼면 두 요청이 한 줄로 합쳐져서, 하나를 처리하면 다른 하나도 처리된 것처럼 보인다.

### 11.7 `verification_request_handling` — 확인 요청 처리 기록

- 분류 **`DECISION_RECORD`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 처리 id | `handling_id` | `STRING(40)` | 예 | **PK** | |
| **요청 키** | `request_key` | `HASH` | 예 | **논리 연결 키 (DB FK 아님)** | 대리키가 아니라 결정적 키로 잇는다(Q-59). 11.7.1 참조 |
| 처리 종류 | `handling_type` | `CODE` | 예 | | `ACKNOWLEDGED`·`ASSIGNED`·`ASKED_EXTERNAL`·`RESOLVED`·`DISMISSED`·`SNOOZED` |
| 처리 주체 | `actor_id` | `REF(actor)` | 예 | FK | |
| 처리 시각 | `handled_at` | `TIMESTAMP_TZ` | 예 | | |
| 메모 | `note` | `STRING(500)` | 아니오 | | |
| 연결된 질문 | `question_item_id` | `REF(question_item)` | 아니오 | FK | 외부에 물었으면 |
| 해소 사건 | `resolving_event_id` | `REF(event)` | 아니오 | FK | 사실이 들어와 풀렸으면 |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | | **rev.2.2 표기 보강**(20절 목록에는 이미 있었다). 부모 `verification_request` 는 재생성으로 사라질 수 있으므로 **처리 기록이 실제/시뮬레이션 구분을 스스로 가져야 한다** |

#### 11.7.1 `request_key` 는 DB 외래키가 아니다 (rev.2 수정)

rev.1 은 이 컬럼을 **FK → `verification_request.request_key`** 라고 적었는데, 그러면 바로 아래 문장과 **동시에 성립할 수 없다**.

| 두 요구가 충돌했다 | |
| --- | --- |
| `verification_request` 는 `DERIVED_MATERIALIZED` 다 | 지우고 다시 만들 수 있어야 한다 |
| `verification_request_handling` 은 `DECISION_RECORD` 다 | 절대 잃으면 안 된다 |
| 진짜 DB FK 라면 | **부모를 지우는 순간 자식도 막히거나 함께 사라진다** |

그래서 **`request_key` 를 DB 외래키가 아니라 오래 사는 논리 연결 키(durable logical correlation key)** 로 정한다.

1. DB 가 부모 행의 생존을 **강제하지 않는다.**
2. `verification_request` 를 전부 지웠다 다시 만들어도, 같은 상황이면 **같은 `request_key`** 가 나오므로 과거 처리 기록이 다시 붙는다.
3. 지금 대응하는 요청 행이 **없어도** 처리 기록은 유효하다(상황이 해소돼 요청이 더는 생기지 않는 경우).
4. 무결성은 DB 제약이 아니라 **조회와 점검 작업**으로 지킨다 — 어느 처리 기록도 가리키지 않는 `request_key` 는 "해소된 과거 요청"이며 오류가 아니다.

작업표에서도 이 컬럼은 **외래키 색으로 칠하지 않는다.**

#### 11.7.2 `request_key` 는 무엇으로 만드나 (rev.2 수정)

**파생 대리키를 재료로 쓰지 않는다.** rev.1 은 `conflict` 를 재료에 넣었는데, `conflict_id` 는 파생이라 재계산 때 값이 달라질 수 있다. 그러면 같은 상황인데 `request_key` 가 바뀌어 **과거 처리 기록을 못 찾는다.** 이것이 바로 이 구조가 막으려던 문제다.

재료는 **재생성해도 같은 값이 나오는 것**만 쓴다.

| 재료 | 왜 안전한가 |
| --- | --- |
| `trigger_rule` | 규칙 식별자. 문서가 정본 |
| `entity_type` · `entity_id` | 실제 개체의 키 |
| `fact_key` | 불변 문자열 |
| **`applicability_scope_type` · `applicability_scope_ref`** | **rev.2.1 추가.** 범위가 다르면 다른 확인 요청이므로 키도 달라야 한다 |
| **관련 사건 id 들의 정렬된 집합**(또는 그 지문) | `event_id` 는 **불변**이다. 대립한 사건이 같으면 같은 값이 나온다 |

- **쓰지 않는 것**: `conflict_id` · `verification_request_id` · `canonical_fact` 의 행 식별자 — 전부 파생이거나 재생성 대상이다.
- **범위를 넣지 않으면** `GLOBAL` 요율 충돌과 `RECOVERY_CONTEXT` 요율 충돌이 **같은 `request_key`** 를 갖게 되고, 한쪽 처리 기록이 다른 쪽에 잘못 붙는다(11.6.1).
- `conflict` 를 **참조**하는 것(`verification_request.conflict_id`)은 그대로 둔다. 화면에서 같이 보여 주기 위한 것이고 **키의 재료가 아니다**.
- **해시 알고리즘·인코딩은 물리 설계**에서 정한다. 여기서 정하는 것은 "무엇을 넣고 무엇을 넣지 않는가"다.

> 이 테이블은 **재계산으로 지워지지 않는다**. 확인 요청이 재계산으로 사라졌다가 다시 생겨도, 사람이 무엇을 했는지는 `request_key` 로 다시 붙는다.

---

## 12. E. 계약·요율

### 12.1 `contract` — 계약

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP

`contract_id` PK · `counterparty_id` FK · `contract_name` · `contract_type CODE`(`TRUCKING`·`WAREHOUSE`·`ODCY`·`DEMURRAGE_TERM`) · `valid_from DATE` · `valid_until DATE` · `source_document_ref STRING(300)` · `is_active` · `note`.

> **계약 원문(화주 계약서)은 저장소에 넣지 않는다**(`docs/01` 6절). 여기에는 참조만 둔다.

### 12.2 `tariff_rule` — 요율 규칙

- 분류 **`MASTER`** · 변경 **`VERSION_REPLACEMENT`** (수정 금지 · 새 판으로 교체) · MVP
- **적용된 요율은 과거 계산의 근거**다. 고치면 과거 계산이 설명되지 않는다.

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 규칙 id | `tariff_rule_id` | `STRING(40)` | 예 | **PK** | |
| 계약 | `contract_id` | `REF(contract)` | 아니오 | FK | 계약 없이 공시 요율만 있을 수 있다 |
| 비용 종류 | `cost_type` | `CODE` | 예 | | `DEMURRAGE`·`DETENTION`·`STORAGE`·`TRUCKING`·`HANDLING`·`ODCY`·`EXTRA_MOVE` |
| 적용 조건 | `applies_to` | `JSON` | 아니오 | | 규격·시설·거래처 조건 |
| 계산 방식 | `calc_method` | `CODE` | 예 | | `FLAT`·`PER_DAY`·`TIERED`·`PER_MOVE` |
| 무료 일수 | `free_days` | `INTEGER` | 아니오 | | |
| 구간 | `tier_json` | `JSON` | 아니오 | | 누진 구간표 |
| 단가 | `unit_amount_krw` | `BIGINT` | 아니오 | | |
| 일 경계 기준 | `day_boundary_basis` | `CODE` | 예 | | 자정·게이트아웃 등. **계산 재현에 필요** |
| 적용 기간 | `valid_from` · `valid_until` | `DATE` | 예/아니오 | | |
| 규칙 판 | `rule_version` | `STRING(20)` | 예 | | |
| 출처 | `source_ref` | `STRING(300)` | 아니오 | | |
| 활성 | `is_active` | `BOOLEAN` | 예 | | |

**Integrity Rules**: 같은 (`contract_id`, `cost_type`, `applies_to`) 에 대해 **적용 기간이 겹치는 활성 규칙이 둘 이상이면 안 된다**. 겹치면 계산이 결정론적이지 않다.

### 12.3 `commercial_offer` — 제안 (**L-3 / 사용자 결정 D-2**)

- 분류 **`EVIDENCE`** · 변경 **`CONTROLLED_UPDATE`** — `offer_status` 만(`RECEIVED` → `SUPERSEDED`/`EXPIRED`/`WITHDRAWN`). 금액·조건은 불변 · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 제안 id | `offer_id` | `STRING(40)` | 예 | **PK** | |
| 제안 주체 | `offered_by_counterparty_id` | `REF(counterparty)` | 예 | FK | 누가 제안했나 |
| 제안 경로 | `offer_channel` | `CODE` | 예 | | `EMAIL`·`PHONE`·`HUMAN_INPUT`·`PORTAL` |
| 근거 메시지 | `source_message_id` | `REF(comm_message)` | 아니오 | FK | 메일로 왔으면 |
| 근거 사건 | `source_event_id` | `REF(event)` | 아니오 | FK | |
| 관련 질문 | `question_item_id` | `REF(question_item)` | 아니오 | FK | 무엇을 물어서 받은 답인가 |
| 제안 시각 | `offered_at` | `TIMESTAMP_TZ` | 예 | | |
| 유효 기간 | `valid_from` · `valid_until` | `TIMESTAMP_TZ` | 아니오 | | **비면 적용 범위는 제품 정책**(D-3) |
| 조건 원문 참조 | `conditions_content_ref` | `STRING(300)` | 아니오 | | **rev.2.4 — 옛 `conditions_text`.** 상대가 적은 조건 원문은 **보관 관리 내용**이다(29절). 계산에 쓰는 값은 `commercial_offer_item` 에 구조화돼 있다 |
| 조건 원문 지문 | `conditions_hash` | `HASH` | 아니오 | | **rev.2.4 신규.** 참조가 있으면 필수. 조건 원문이 파기돼도 남는다 |
| 상태 | `offer_status` | `CODE` | 예 | | `RECEIVED`·`SUPERSEDED`·`EXPIRED`·`WITHDRAWN` |
| 시뮬레이션 | `is_simulated` · `scenario_id` | — | | FK | |

### 12.4 `commercial_offer_item` — 제안 줄

- 분류 **`EVIDENCE`** · 변경 **`APPEND_ONLY`** · MVP

`offer_item_id` PK · `offer_id` FK · `cost_type CODE` · `applies_to JSON` · **금액 5종 묶음**(§7) · `unit CODE` · `quantity DECIMAL(12,2)` · **`created_event_id` FK**(이 줄이 만든 OFFER 사건).

> **계산의 정본은 여전히 `canonical_fact` 다.** 제안은 근거이고, 계산에 들어가려면 사건이 되어 사실로 채택되어야 한다(3.1 안티패턴 4 — 제안과 현재 요율의 이중 정본 — 를 피하는 방향). `created_event_id` 가 그 다리다.

---

## 13. F. 계획·최적화

흐름: **`planning_snapshot`(무엇을 믿고 계산했나) → `recovery_run`(어떻게 계산했나) → `assignment`(무엇을 하라는가) → `plan_decision`(사람이 무엇을 정했나)**. 여기에 `operator_planning_constraint`(사람이 건 계획 조건)가 입력으로 붙는다.

> **rev.2 보강 — 스냅샷의 원칙**
>
> **계산에 실제로 쓰인 모든 바뀔 수 있는 입력은, 스냅샷 시점에 값으로 얼리거나 절대 변하지 않는 판(version) 기록을 가리켜야 한다.**
>
> rev.1 은 **사실만** 얼렸다. 그래서 이런 구멍이 있었다.
>
> ```
> 9/18  계산 당시 창고 B 의 default_travel_minutes_from_terminal = 30
> 10/20 마스터를 45 로 고쳤다
> → 9/18 의 실행을 다시 돌리면 다른 결과가 나온다
> ```
>
> 계획 조건·마스터 기본값·요율 규칙도 계산을 바꾼다. 이번 rev.2 에서 **`planning_snapshot_constraint`** 와 **`planning_snapshot_input`** 두 표를 더해 그 구멍을 막았다.

### 13.1 `planning_snapshot` — 계획 입력 스냅샷

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP
- 계산의 **입력을 얼린 것**이다. 이것이 있어야 같은 결과를 다시 만들 수 있다.

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 스냅샷 id | `snapshot_id` | `STRING(40)` | 예 | **PK** | |
| 기준 시각 | `as_of` | `TIMESTAMP_TZ` | 예 | | 주입된 값. 현재 시각을 직접 읽지 않는다 |
| 사실 지문 | `fact_fingerprint` | `HASH` | 예 | | 포함된 사실 전체의 해시 |
| 규칙 판 | `rule_version` | `STRING(20)` | 예 | | |
| 요율 판 | `tariff_version` | `STRING(20)` | 예 | | |
| 정책 판 | `policy_version` | `STRING(20)` | 예 | | |
| 대상 범위 | `scope_ref` | `JSON` | 아니오 | | 어떤 컨테이너 집합인가 |
| **시뮬레이션 포함** | `contains_simulated` | `BOOLEAN` | 예 | | 시뮬레이션 사실이 하나라도 들어갔으면 `true` |
| 생성 시각 | `created_at` | `TIMESTAMP_TZ` | 예 | | |
| 시나리오 | `scenario_id` | `REF(scenario)` | 아니오 | FK | |

### 13.2 `planning_snapshot_fact` — 스냅샷에 담긴 사실

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

`snapshot_id` FK + (`entity_type`, `entity_id`, `fact_key`, `applicability_scope_type`, `applicability_scope_ref`) + **`event_id`** FK + `value_*` 사본 + `valid_from`·`valid_until` 사본 + **상태 6차원 사본** + **판(version) 사본**.

**PK** = (`snapshot_id`, `entity_type`, `entity_id`, `fact_key`, `applicability_scope_type`, `applicability_scope_ref`) — `canonical_fact` 와 같은 이유로 **범위가 키에 들어간다**(11.4.1).

> `canonical_fact` 를 참조만 하면 안 된다. 그 행은 재계산으로 **덮어써진다**. 스냅샷은 **당시 값과 채택 사건을 복사해** 얼려 둔다. 이것이 "재현 가능한 계산"의 전부다.

#### 13.2.1 상태 차원도 함께 얼린다 **(rev.2.3)**

rev.2.2 는 `verification_status` · `evidence_strength` · `confidence` 셋만 복사했다. 그래서 **"그때 왜 이 사실을 계산에 쓸 수 있었나"** 와 **"그때 왜 승인할 수 있었나(없었나)"** 를 나중에 설명할 수 없었다.

| 복사하는 것 | 왜 |
| --- | --- |
| `value_status` | 그때 누가 보증했나 |
| **`verification_basis`** | `CONFIRMED` 였다면 무슨 근거였나 |
| `freshness_status` | 그때 얼마나 오래됐나 — `as_of` 가 바뀌면 지금은 다른 값이 나온다 |
| `conflict_status` | 그때 다툼이 있었나 |
| **`hold_status`** | 그때 보류 중이었나(R10) |
| **`decision_usability`** | **그때 엔진이 써도 되는 값이었나** — 승인 가능 여부의 정본 |
| `evidence_strength` | 그때의 근거 강도 |
| **`evidence_policy_version`** | 어느 강도 정책으로 판정했나 |
| **`rule_version`** | 어느 Reconciliation 규칙 판이었나 |
| `evidence_time` · `evidence_time_quality` · `temporal_confidence` | 신선도 판정의 입력 |

**왜 판(version)까지 복사하나.** `planning_snapshot` 에 이미 `rule_version`·`policy_version` 이 있지만, 그것은 **스냅샷 전체의 판**이다. 사실 한 줄이 어느 판으로 판정됐는지는 그 줄이 들고 있어야 재계산 없이 설명할 수 있다.

**무엇을 복사하지 않나.** `contributing_event_count` 와 `computed_at` 은 복사하지 않는다. 전자는 표시용 집계이고 후자는 스냅샷의 `created_at` 으로 갈음된다.

**그때의 판정을 재현할 수 있나** (rev.2.3 확인). `decision_usability` 는 파생이므로 **값만 복사해서는 "그때 왜 그 값이었나"를 설명하지 못한다.** 판정에 들어간 것이 전부 얼려져 있는지 따졌다.

| R11 판정의 입력 | 스냅샷 어디에 있나 |
| --- | --- |
| `value_status` · `freshness_status` · `conflict_status` · `hold_status` | **`planning_snapshot_fact` 에 네 컬럼 사본** |
| 사실의 중요도 정책 · R11 규칙 판 | **`planning_snapshot_fact.rule_version` 사본** + 부모 `planning_snapshot.policy_version` |
| 판정 결과 자체 | `planning_snapshot_fact.decision_usability` |

**네 입력 + 판 + 결과가 모두 한 스냅샷 안에 있으므로, 지금 규칙이 바뀌었어도 과거 판정을 그대로 설명하고 다시 계산해 대조할 수 있다**(I-27). 계획 승인이 왜 막혔는지(`APPROVAL_BLOCKED`) 또는 왜 통과했는지도 같은 방법으로 설명된다.

> 이 확장으로 **I-12**(스냅샷 하나로 과거를 복원)가 "사실 + 계획 조건 + 마스터 기본값 + 요율·정책 판"에서 **"+ 당시 상태 차원 + 그 판정의 근거"** 까지 넓어진다(17.5 I-12 · I-27).

### 13.2a `planning_snapshot_constraint` — 스냅샷에 담긴 계획 조건 **(rev.2 신규)**

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 스냅샷 | `snapshot_id` | `REF(planning_snapshot)` | 예 | **PK 일부**, FK | |
| 조건 | `constraint_id` | `REF(operator_planning_constraint)` | 예 | **PK 일부**, FK | 어느 조건이었나 (추적용) |
| 조건 종류 | `constraint_type` | `CODE` | 예 | | **당시 값 사본** |
| 강제 수준 | `enforcement` | `CODE` | 예 | | 당시 값 사본 |
| 대상 종류·id | `target_type` · `target_id` | `CODE` · `STRING(30)` | 예/아니오 | | 당시 값 사본 |
| 조건 값 | `constraint_value` | `JSON` | 아니오 | | 당시 값 사본 |
| 적용 범위 | `scope_type` · `scope_ref` | `CODE` · `STRING(60)` | 예/아니오 | | 당시 값 사본 |
| 적용 기간 | `valid_from` · `valid_until` | `TIMESTAMP_TZ` | 아니오 | | 당시 값 사본 |

**왜 참조만으로는 안 되는가**

운영자가 "이번 건에서는 ODCY A 를 쓰지 마"를 걸고 계산했다가, 30분 뒤 해제했다고 하자. 스냅샷이 **현재 살아 있는 조건 행만 FK 로 가리키면**, 그 실행을 다시 열었을 때 조건이 없던 것처럼 보인다. 그러면 **"왜 그때 ODCY A 를 안 썼는지" 설명할 수 없다.** 그래서 `constraint_id` 로 추적은 하되 **여섯 가지 값을 복사해 얼린다**.

### 13.2b `planning_snapshot_input` — 스냅샷에 담긴 그 밖의 입력 **(rev.2 신규)**

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP
- 사실도 계획 조건도 아닌데 **계산을 바꾸는 입력**을 한 표에 담는다.

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 스냅샷 | `snapshot_id` | `REF(planning_snapshot)` | 예 | **PK 일부**, FK | |
| 입력 종류 | `input_kind` | `CODE` | 예 | **PK 일부** | `MASTER_DEFAULT` · `TARIFF_RULE` · `POLICY` |
| 원천 테이블 | `source_table` | `CODE` | 예 | **PK 일부** | `facility_warehouse` · `tariff_rule` 등 |
| 원천 키 | `source_key` | `STRING(60)` | 예 | **PK 일부** | 그 행의 식별자 |
| 값 경로 | `value_path` | `STRING(60)` | **예** | **PK 일부** | `MASTER_DEFAULT` 면 실제 컬럼 경로(`default_travel_minutes_from_terminal` 등). 행 전체·판 전체를 뜻하면 **논리적 "전체" 표시**를 넣는다 — rev.2.2 정정, 아래 참고 |
| 얼린 값 | `frozen_value_text` | `TEXT` | 아니오 | | 사람이 읽는 값 |
| 얼린 값(수치) | `frozen_value_number` | `DECIMAL(18,4)` | 아니오 | | |
| 판 | `source_version` | `STRING(20)` | 아니오 | | 불변 판을 가리킬 수 있으면 여기 |
| 얼린 시각 | `frozen_at` | `TIMESTAMP_TZ` | 예 | | |

**세 가지 입력을 한 표로 묶은 이유**

셋 다 "계산에 실제로 쓴 값을 그대로 남긴다"는 같은 일을 한다. 종류마다 표를 따로 만들면 표 세 개가 거의 같은 모양이 된다. **한 표 + `input_kind`** 가 가장 단순하면서 추적이 된다.

| 입력 종류 | 어떻게 쓰나 | 왜 얼리나 |
| --- | --- | --- |
| **`MASTER_DEFAULT`** | 사실이 없어서 마스터의 `default_*` 값을 대신 쓴 경우 **그 값만** 기록 | 마스터는 수정 가능하다. 나중에 고치면 과거 실행이 재현되지 않는다 |
| **`TARIFF_RULE`** | 실제로 **고려·적용한** `tariff_rule_id` 들 | `tariff_rule` 자체는 수정 금지·판 교체라 **id 참조로 충분**하다. 다만 `tariff_version` 문자열 하나로는 **어느 규칙 집합이었는지** 복원되지 않는다 |
| **`POLICY`** | 위험·신선도·근거 강도 정책의 판 | 판이 바뀌면 판정이 달라진다 |

**`value_path` 는 비어 있을 수 없다** (rev.2.2 수정)

rev.2.1 은 이 컬럼을 PK 일부이면서 NULL 허용으로 적었다. **PK 구성요소가 비어 있을 수 있으면 "하나만 존재해야 하는 조합"이라는 PK 의 뜻이 성립하지 않는다.** 그래서 NOT NULL 로 고친다.

| `input_kind` | `value_path` 에 들어가는 것 |
| --- | --- |
| `MASTER_DEFAULT` | 실제로 쓴 **컬럼 경로** 하나 |
| `TARIFF_RULE` | 규칙 **행 전체**를 가리키므로 논리적 "전체" 표시 |
| `POLICY` | 정책 **판 전체**를 가리키면 "전체" 표시, 정책 안의 특정 값을 얼렸으면 그 경로 |

- "전체" 표시의 **정확한 문자열(예: `*` 또는 빈 문자열 금지 규칙)** 은 물리 설계(T-080)에서 정한다. 논리 설계가 정하는 것은 **비어 있으면 안 된다**는 것까지다.

> **사실이 있으면 마스터 값을 쓰지 않는다.** `MASTER_DEFAULT` 행이 남았다는 것은 "그날 값을 아무도 알려 주지 않아 평시 기준선으로 계산했다"는 뜻이고, 그 자체가 읽을 만한 정보다.

> `tariff_rule` 을 불변 판으로 유지하는 한 **새 테이블을 더 만들지 않았다.** 만약 요율 규칙을 나중에 고칠 수 있게 바꾸면, 그때는 `frozen_value_*` 에 계산에 쓴 값까지 복사해야 한다.

### 13.3 `recovery_run` — 복구 계산 실행

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 실행 id | `run_id` | `STRING(40)` | 예 | **PK** | |
| 입력 스냅샷 | `snapshot_id` | `REF(planning_snapshot)` | 예 | FK | |
| 실행 계기 | `trigger_type` | `CODE` | 예 | | `EXCEPTION_DETECTED`·`OPERATOR_REQUEST`·`FACT_CORRECTION`·`CONSTRAINT_CHANGE`·`REPLY_RECEIVED`·`SCHEDULED` |
| 계기 참조 | `trigger_ref` | `STRING(60)` | 아니오 | | 사건·제약·메시지 id |
| 이전 실행 | `previous_run_id` | `REF(recovery_run)` | 아니오 | FK(자기참조) | **재계산 계보**. 무엇과 비교할지가 정해진다 |
| 목적 함수 판 | `objective_version` | `STRING(20)` | 예 | | |
| 결과 상태 | `run_status` | `CODE` | 예 | | `FEASIBLE`·`INFEASIBLE`·`TIMEOUT`·`ERROR` |
| 미충족 제약 | `unmet_constraints` | `JSON` | 아니오 | | **INFEASIBLE 일 때 무엇이 막았는지 반드시 남긴다** |
| 총 비용 | `total_cost_krw` | `BIGINT` | 아니오 | | `cost_result` 요약 |
| 계산 소요 | `solve_ms` | `INTEGER` | 아니오 | | |
| 시뮬레이션 포함 | `contains_simulated` | `BOOLEAN` | 예 | | 스냅샷에서 전파 |
| 실행 시각 | `executed_at` | `TIMESTAMP_TZ` | 예 | | |

> **솔버 이름·모델 형식은 여기서 정하지 않는다.** 이 테이블은 "무엇을 입력해 무엇이 나왔나"만 담는다.

### 13.4 `assignment` — 배정 (계획의 줄)

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용(실행 결과는 사건으로 온다)) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 배정 id | `assignment_id` | `STRING(40)` | 예 | **PK** | |
| 실행 | `run_id` | `REF(recovery_run)` | 예 | FK | |
| 컨테이너 | `container_id` | `REF(container)` | 예 | FK | |
| 행동 종류 | `action_type` | `CODE` | 예 | | `DIRECT_DELIVERY`·`ODCY_STAGING`·`WAIT`·`RESCHEDULE`·`ALT_WAREHOUSE` |
| 목적지 시설 | `to_facility_id` | `REF(facility)` | 아니오 | FK | |
| 경유 시설 | `via_facility_id` | `REF(facility)` | 아니오 | FK | |
| 차량 풀 | `truck_pool_id` | `REF(truck_pool)` | 아니오 | FK | **개별 차량이 아니다**(L-5) |
| 출발 슬롯 | `depart_slot_start` · `depart_slot_end` | `TIMESTAMP_TZ` | 아니오 | | |
| 도착 예정 | `planned_arrival_at` | `TIMESTAMP_TZ` | 아니오 | | |
| 순서 | `sequence_no` | `INTEGER` | 아니오 | | 같은 컨테이너의 다단계 행동 |
| 배정 비용 | `assigned_cost_krw` | `BIGINT` | 아니오 | | `cost_result` 로 귀속 |
| 시뮬레이션 포함 | `contains_simulated` | `BOOLEAN` | 예 | | |

> 실행 여부(`실제로 나갔는가`)는 여기 컬럼이 아니다. **실행은 사건이고 사실이다**(안티패턴 1·6).

### 13.5 `plan_decision` — 계획 결정 기록

- 분류 **`DECISION_RECORD`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP · **A-16 게이트**

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 결정 id | `plan_decision_id` | `STRING(40)` | 예 | **PK** | |
| 대상 실행 | `run_id` | `REF(recovery_run)` | 예 | FK | |
| 결정 종류 | `decision_type` | `CODE` | 예 | | **값 목록 미확정.** 채택 · 거부 · 기존 계획 유지를 구분해야 한다는 것만 확정 |
| 결정 주체 | `actor_id` | `REF(actor)` | 예 | FK | |
| 결정 시각 | `decided_at` | `TIMESTAMP_TZ` | 예 | | |
| 사유 | `reason` | `STRING(500)` | 아니오 | | |
| 적용 범위 | `scope_ref` | `JSON` | 아니오 | | 일부 컨테이너만 채택할 수 있다 |
| 계획 지문 | `decided_plan_hash` | `HASH` | 예 | | **무엇을 승인했는지 고정.** 이후 재계산과 구분된다 |

- **`UNIQUE(run_id, decision_type, decided_at)`** 이 아니라, 같은 실행에 여러 결정이 시간순으로 쌓일 수 있다. **마지막 유효 결정은 조회로 구한다**(컬럼으로 덮어쓰지 않는다).
- **아직 결정하지 않은 상태**는 이 테이블에 행이 없는 것이고, **의도적으로 기존 계획을 유지하기로 결정한 상태**는 행이 있는 것이다. 둘을 같은 값으로 표현하지 않는다.

### 13.6 `operator_planning_constraint` — 운영자 계획 조건 (**L-12**)

- 분류 **`DECISION_RECORD`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용(해제도 새 행)) · MVP
- **현실 사실이 아니다.** 사람이 계산에 건 조건이다. 그래서 `event` 가 아니라 여기 있다.

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 조건 id | `constraint_id` | `STRING(40)` | 예 | **PK** | |
| 조건 종류 | `constraint_type` | `CODE` | 예 | | `EXCLUDE_FACILITY`·`PREFER_FACILITY`·`FORBID_ACTION`·`PIN_ASSIGNMENT`·`LIMIT_CAPACITY`·`DEADLINE` |
| 강제 수준 | `enforcement` | `CODE` | 예 | | `HARD`(반드시) / `PREFERENCE`(가능하면) |
| 대상 종류 | `target_type` | `CODE` | 예 | | `FACILITY`·`CONTAINER`·`TRUCK_POOL`·`GLOBAL` |
| 대상 id | `target_id` | `STRING(30)` | 아니오 | | `GLOBAL` 이면 비어 있다 |
| 조건 값 | `constraint_value` | `JSON` | 아니오 | | 상한·기한 등 |
| **행위** | `action` | `CODE` | 예 | | **`SET`(건다) / `RELEASE`(푼다)** — rev.2 신규 |
| **해제 대상** | `releases_constraint_id` | `REF(operator_planning_constraint)` | 아니오 | FK(자기참조) | `action = RELEASE` 일 때 어느 `SET` 을 푸는가 |
| 적용 범위 | `scope_type` · `scope_ref` | `CODE` · `STRING(60)` | 예/아니오 | | **기본값 = 현재 복구 맥락(`RECOVERY_CONTEXT`)** — D-3 |
| 적용 기간 | `valid_from` · `valid_until` | `TIMESTAMP_TZ` | 아니오 | | 시간 범위 |
| 사유 | `reason` | `STRING(500)` | 예 | | **왜 걸었는지(풀었는지)는 필수**다. 이유를 모르는 제약이 남지 않게 한다 |
| 결정 주체·시각 | `decided_by_actor_id` · `decided_at` | `REF(actor)` · `TIMESTAMP_TZ` | 예 | FK | `SET` 과 `RELEASE` 모두 |

**Integrity Rules** (rev.2 수정)

1. **행을 고치지 않는다.** `SET` 행은 만들어진 뒤 절대 UPDATE 되지 않는다.
2. **해제는 새 행**이다 — `action = RELEASE` + `releases_constraint_id`.
3. `action = RELEASE` 행은 `releases_constraint_id` 가 **필수**이고, 그 대상은 `action = SET` 이어야 한다.
4. 같은 `SET` 을 두 번 해제할 수 없다(`releases_constraint_id` 부분 유일).
5. **지금 살아 있는 조건** = `SET` 행 중 자신을 가리키는 `RELEASE` 행이 없고 유효 기간 안에 있는 것. **조회로 구한다.**

**`released_at` 을 없앤 이유**

rev.1 은 "덧붙이기 전용(해제는 `released_at` 기록)"이라고 적었는데, **기존 행의 빈 칸을 나중에 채우는 것은 UPDATE 다.** 덧붙이기 전용이라는 말과 같이 갈 수 없다. 결정 기록을 진짜 덧붙이기로 유지하려면 **해제도 하나의 결정이고 따라서 하나의 행**이어야 한다.

이렇게 하면 UPDATE 없이 네 가지가 전부 남는다.

| 질문 | 어디서 답이 나오나 |
| --- | --- |
| 누가 조건을 걸었나 | `SET` 행의 `decided_by_actor_id` |
| 언제 걸었나 | `SET` 행의 `decided_at` |
| 누가 언제 풀었나 | `RELEASE` 행의 `decided_by_actor_id` · `decided_at` |
| 어떤 조건을 풀었나 | `RELEASE` 행의 `releases_constraint_id` |

> **솔버에서 어떤 형태(제약식·페널티)로 쓰일지는 여기서 정하지 않는다.** `enforcement` 가 의도를 담고, 변환은 최적화 설계의 몫이다.

---

## 14. G. 위험·비용

### 14.1 `risk_assessment` — 위험 평가

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP
- **확률이 아니다.** 규칙으로 판정한 결정론적 결과다(FR-RSK-05).

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 평가 id | `risk_assessment_id` | `STRING(40)` | 예 | **PK** | |
| 스냅샷 | `snapshot_id` | `REF(planning_snapshot)` | 예 | FK | |
| 실행 | `run_id` | `REF(recovery_run)` | 아니오 | FK | 계획 전 평가일 수 있다 |
| 대상 종류·id | `target_type` · `target_id` | `CODE` · `STRING(30)` | 예 | | 보통 컨테이너 |
| 위험 종류 | `risk_type` | `CODE` | 예 | | `DEMURRAGE_DEADLINE`·`DETENTION_DEADLINE`·`CAPACITY_SHORTFALL`·`SLOT_MISS`·`DATA_UNVERIFIED` |
| **위험 수준** | `risk_level` | `CODE` | 예 | | `NONE`·`WATCH`·`WARNING`·`CRITICAL`. **확률값이 아니다** |
| 판정 규칙 | `applied_rule` | `CODE` | 예 | | 어떤 규칙이 이 수준을 만들었나 |
| 규칙 판 | `rule_version` | `STRING(20)` | 예 | | |
| 남은 여유 | `margin_value` · `margin_unit` | `DECIMAL(12,2)` · `CODE` | 아니오 | | 남은 시간·수량 |
| 기준 시각 | `as_of` | `TIMESTAMP_TZ` | 예 | | |
| 근거 사실 | `basis_fact_keys` | `JSON` | 예 | | 무엇을 보고 판정했나 |
| 데이터 품질 | `input_verification_summary` | `CODE` | 예 | | 미검증 사실에 기댄 판정인지 표시 |
| 시뮬레이션 포함 | `contains_simulated` | `BOOLEAN` | 예 | | |

### 14.2 `cost_result` — 비용 계산 결과 (묶음)

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 결과 id | `cost_result_id` | `STRING(40)` | 예 | **PK** | |
| 스냅샷 | `snapshot_id` | `REF(planning_snapshot)` | 예 | FK | |
| 실행 | `run_id` | `REF(recovery_run)` | 아니오 | FK | |
| **비용 성격** | `cost_nature` | `CODE` | 예 | | **MVP 는 두 가지뿐이다: `ESTIMATED`(지금 이대로 두면 예상되는 비용) · `PLAN`(이 계획대로 하면 드는 비용)** |
| 대상 범위 | `scope_ref` | `JSON` | 아니오 | | |
| 합계 | `total_amount_krw` | `BIGINT` | 예 | | 줄 합과 일치해야 한다 |
| 요율 판 | `tariff_version` | `STRING(20)` | 예 | | |
| 기준 시각 | `as_of` | `TIMESTAMP_TZ` | 예 | | |
| 시뮬레이션 포함 | `contains_simulated` | `BOOLEAN` | 예 | | |

**`ACTUAL_REPORTED` 를 MVP 에서 뺀 이유** (rev.2 수정)

rev.1 은 `ACTUAL_REPORTED`(사실로 보고된 발생액)를 성격 값에 넣었다. 뺀다.

1. **`cost_result` 는 계산 결과 표다.** "실제로 이만큼 나왔다"는 보고는 **계산이 아니라 현실 주장**이다. 그것의 자리는 `event` → `canonical_fact` 이고, 거기에 이미 갈 수 있다.
2. 계산 결과 표에 현실 보고를 섞으면 **같은 표 안에서 어떤 행은 재현 가능하고 어떤 행은 아니게 된다.** 분류(`PERSISTED_OUTPUT`)가 무너진다.
3. 승인된 개념 모델과 요구사항의 MVP 범위는 **예상 비용 · 계획 비용**까지다. 실제 비용·실현 절감은 Future 다.

| 무엇 | 어디에 | 단계 |
| --- | --- | --- |
| 지금 이대로 두면 예상되는 비용 | `cost_result(cost_nature = ESTIMATED)` | **MVP** |
| 이 계획대로 하면 드는 비용 | `cost_result(cost_nature = PLAN)` | **MVP** |
| "실제로 42만원 나왔습니다" 라는 보고 | `event` → `canonical_fact` (현실 주장) | **MVP 에서도 받을 수는 있다** |
| 실제 비용의 집계·실현 절감 계산 | **Future** — 구조를 지금 만들지 않는다 | Future |
| 청구·지급·미수금 | **범위 밖.** CERA 는 결제·정산 시스템이 아니다 | — |

> 실제 발생액 집계가 제품 요구로 올라오면, 그때 `cost_nature` 에 값을 더할지 별도 표를 둘지 정한다. **지금 미리 자리를 만들어 두지 않는다.**

### 14.3 `cost_line_item` — 비용 줄

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP · **Q-58 · Q-60**

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 줄 id | `cost_line_item_id` | `STRING(40)` | 예 | **PK** | |
| **결과 묶음** | `cost_result_id` | `REF(cost_result)` | 예 | FK | **유일한 필수 부모**(Q-60) |
| 비용 종류 | `cost_type` | `CODE` | 예 | | |
| 적용 요율 | `tariff_rule_id` | `REF(tariff_rule)` | 아니오 | FK | 어떤 규칙으로 계산했나 |
| 수량·단위 | `quantity` · `unit` | `DECIMAL(12,2)` · `CODE` | 아니오 | | |
| 원화 금액 | `amount_krw` | `BIGINT` | 예 | | |
| 원 통화 | `original_currency` | `CODE` | 예 | | |
| 원 통화 금액 | `original_amount` | `DECIMAL(18,4)` | 아니오 | | |
| 환율 | `fx_rate` | `DECIMAL(18,6)` | 아니오 | | |
| 환율 기준일 | `fx_rate_basis_date` | `DATE` | 아니오 | | |
| 계산 설명 | `calc_explain` | `STRING(500)` | 아니오 | | 사람이 읽는 근거 |

### 14.4 `cost_line_link` — 비용 줄의 귀속·근거

- 분류 **`PERSISTED_OUTPUT`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 줄 | `cost_line_item_id` | `REF(cost_line_item)` | 예 | **PK 일부**, FK | |
| 연결 역할 | `link_role` | `CODE` | 예 | **PK 일부** | `ATTRIBUTION`(누구·무엇에 귀속) / `BASIS`(무엇을 근거로) |
| 대상 종류 | `target_type` | `CODE` | 예 | **PK 일부** | `CONTAINER`·`ASSIGNMENT`·`FACILITY`·`COUNTERPARTY`·`EVENT`·`COMMERCIAL_OFFER` |
| 대상 id | `target_id` | `STRING(40)` | 예 | **PK 일부** | |
| 배분 비율 | `share_ratio` | `DECIMAL(9,6)` | 아니오 | | 여러 컨테이너에 걸린 비용을 나눌 때 |

- 이렇게 두면 **컨테이너 1건에 붙는 비용**과 **여러 컨테이너에 공통으로 걸린 비용**을 같은 구조로 쓴다.
- 같은 (`cost_line_item_id`, `link_role = ATTRIBUTION`) 의 `share_ratio` 합은 1 이어야 한다(비율을 쓸 때만).

---

## 15. H. 외부 통신

흐름: **`comm_thread`(대화) → `question_item`(무엇을 묻는가) → `comm_message`(초안) → `message_approval`(A-17 승인) → `send_attempt`(실제 시도) → 회신 `comm_message` → `extraction`(LLM 후보) → `event`**.

> **rev.2 수정 세 가지** — ① 메시지에 **종류**(`message_kind`)를 두어 **주소 확인 메일**이 업무 발송 승인 게이트의 예외임을 구조로 표현했다 ② 승인 시점에 **구조화 숫자**까지 얼린다 ③ 승인의 **취소·만료·계획 교체 무효**를 UPDATE 없이 남긴다.

### 15.1 `comm_thread` — 대화

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`CONTROLLED_UPDATE`** — `thread_status` · `last_activity_at` + **`external_thread_id` 한 번 채움**(rev.2.5) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 대화 id | `thread_id` | `STRING(40)` | 예 | **PK** | |
| 채널 | `channel_type` | `CODE` | 예 | | |
| **외부 대화 id** | `external_thread_id` | `STRING(200)` | 아니오 | **UNIQUE**(channel_type, external_thread_id) | Gmail threadId 등. 조회 경로라 컬럼(Q-54). **rev.2.5: 만들 때 비어 있을 수 있고, 첫 발송 뒤 채널이 id 를 주면 `NULL` → 값 한 번만 채운다. 채운 뒤 바꾸지 않는다.** 유일 범위는 채널 종류다 — 이 표는 채널 연결을 갖지 않고 Tech Validation 은 채널마다 전용 계정 하나다. 한 채널에 연결이 여럿 생기면 범위를 연결로 좁혀야 한다(그때 연결 참조가 필요 — `docs/24` 25절) |
| 상대 거래처 | `counterparty_id` | `REF(counterparty)` | 예 | FK | |
| 상대 연락처 | `contact_id` | `REF(counterparty_contact)` | 아니오 | FK | |
| 목적 | `purpose` | `CODE` | 예 | | `CAPACITY_CHECK`·`RATE_REQUEST`·`SLOT_REQUEST`·`FACT_CONFIRM`·`GENERAL` |
| 관련 실행 | `related_run_id` | `REF(recovery_run)` | 아니오 | FK | |
| 대화 상태 | `thread_status` | `CODE` | 예 | | `OPEN`·`WAITING_REPLY`·`ANSWERED`·`CLOSED` |
| 시작·최근 시각 | `opened_at` · `last_activity_at` | `TIMESTAMP_TZ` | 예 | | |
| 시뮬레이션 | `is_simulated` · `scenario_id` | — | | FK | |

### 15.2 `question_item` — 질문 항목 (**L-1**)

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`CONTROLLED_UPDATE`** — `question_status` 만. **대상 개체·사실 키·적용 범위는 불변** · MVP
- 회신 추출 결과를 **원래 질문에 정확히 되붙이는 열쇠**다.

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 질문 id | `question_item_id` | `STRING(40)` | 예 | **PK** | |
| 대화 | `thread_id` | `REF(comm_thread)` | 예 | FK | |
| **질문 표식** | `ask_id` | `STRING(40)` | 예 | **UNIQUE**(thread_id, ask_id) | 메시지 본문·회신 계약에 실려 나가는 값 |
| 질문 종류 | `question_type` | `CODE` | 예 | | `CAPACITY`·`RATE`·`SLOT`·`CONFIRM_FACT`·`FREE_TEXT` |
| 질문 문구 | `question_text` | `TEXT` | 예 | | |
| **대상 개체 종류** | `target_entity_type` | `CODE` | 아니오 | | 질문을 만들 때 확정한다 |
| **대상 개체 id** | `target_entity_id` | `STRING(30)` | 아니오 | | |
| **대상 사실 키** | `target_fact_key` | `STRING(120)` | 아니오 | | 답이 어떤 사실이 되는가 |
| **대상 적용 범위 종류** | `target_applicability_scope_type` | `CODE` | 아니오 | | **rev.2.1 신규.** 답이 어느 범위의 사실이 되는가 |
| **대상 적용 범위 참조** | `target_applicability_scope_ref` | `STRING(60)` | 아니오 | | |
| 기대 값 형태 | `expected_value_type` | `CODE` | 예 | | `NUMBER`·`TIMESTAMP`·`CODE`·`TEXT`·`BOOLEAN` |
| 기대 단위 | `expected_unit` | `CODE` | 아니오 | | |
| 발생 확인 요청 | `verification_request_key` | `HASH` | 아니오 | **논리 연결 키 (DB FK 아님)** | 확인 요청에서 나온 질문이면. 11.7.1 과 같은 이유 — 15.2.2 |
| 상태 | `question_status` | `CODE` | 예 | | `DRAFTED`·`SENT`·`ANSWERED`·`UNANSWERED`·`CANCELLED` |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | | |

> 대상(개체 · 사실 키 · **적용 범위**)을 **질문 생성 시점에 확정**하므로, 회신이 오면 `ask_id` 한 줄 조회로 어디에 붙일지 정해진다. 추출 결과를 나중에 추측으로 매칭하지 않는다.

#### 15.2.1 질문에 범위까지 못 박는 이유 (rev.2.1 수정)

```
"이번 사고 건에 적용할 창고 B 보관료는 얼마입니까?"     → RECOVERY_CONTEXT / <RECOVERY_CONTEXT_REF>
"앞으로 일반적으로 적용되는 창고 B 보관료는 얼마입니까?" → GLOBAL
```

**개체도 같고 사실 키도 같다. 다른 것은 범위뿐이다.** 질문에 범위가 없으면 회신 값을 사건으로 만들 때 범위를 **누군가 정해야 하는데**, 그때는 이미 늦다.

| 누가 정하나 | 결과 |
| --- | --- |
| **Backend 가 질문 만들 때** ← 이 설계 | 결정론. 회신이 오면 `ask_id` 조회로 범위까지 나온다 |
| LLM 이 회신을 보고 추론 | **ADR-026 위반.** LLM 은 사실 키도 범위도 정하지 않는다 |
| 사람이 회신 처리할 때 매번 | 매번 묻게 되고, 잘못 고르면 "이번 건 0원"이 영구 요율이 된다 |

**AI 의 출력은 그대로다** — `ask_id` + 값 + 단위 + 원문 인용까지. **범위는 AI 가 만지지 않는다.**

#### 15.2.2 `verification_request_key` 도 DB 외래키가 아니다 (rev.2.1 수정)

`verification_request` 는 `DERIVED_MATERIALIZED` 라 **없어졌다 다시 생길 수 있다.** `question_item` 은 사람이 실제로 외부에 보낸 질문의 기록이므로, **지금 존재하는 파생 행의 생존에 의존하면 안 된다.**

`verification_request_handling.request_key` 와 **완전히 같은 취급**이다 — 논리 연결 키이고, DB 가 부모 생존을 강제하지 않으며, 작업표에서도 외래키 색으로 칠하지 않는다.

### 15.3 `comm_message` — 메시지

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`IMMUTABLE_AFTER_CREATE`**(제목·본문·구조화 값·수신자·종류) **+ `CACHE_UPDATE`**(`current_status` · `current_approval_id`) **+ 한 번 채움**(`sent_at`, rev.2.5) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 메시지 id | `message_id` | `STRING(40)` | 예 | **PK** | |
| 대화 | `thread_id` | `REF(comm_thread)` | 예 | FK | |
| 방향 | `direction` | `CODE` | 예 | | `OUTBOUND` / `INBOUND` |
| **메시지 종류** | `message_kind` | `CODE` | 예 | | **`BUSINESS`(업무 메시지) / `CONTACT_VERIFICATION`(주소 확인 메일)** — rev.2 신규 |
| **주소 확인 기록** | `contact_verification_id` | `REF(contact_verification)` | 아니오 | FK | `message_kind = CONTACT_VERIFICATION` 일 때 **필수** |
| 채널 | `channel_type` | `CODE` | 예 | | |
| **외부 메시지 id** | `external_message_id` | `STRING(200)` | 아니오 | **UNIQUE**(channel_type, external_message_id) | 중복 수신 차단(Q-54) |
| 발신 주소 | `from_address` | `STRING(200)` | 아니오 | | |
| 수신 주소 | `to_address_id` | `REF(contact_channel_address)` | 아니오 | FK | 발신 자격 검사 대상 |
| **제목·본문 참조** | `message_content_ref` | `STRING(300)` | 아니오 | | **rev.2.4 — 옛 `subject` · `body_text`.** 제목과 안전한 텍스트 본문을 **한 묶음의 보관 관리 내용**으로 두고 참조만 기록한다(29절). 받은 메일은 원문에서 만든 **안전한 텍스트**다(원본 HTML 아님). **AI 가 쓰는 것은 문장뿐이다** |
| 본문 지문 | `content_hash` | `HASH` | 예 | | 수신자·제목·본문·**구조화 값**을 모두 덮는 지문. **제목·본문이 파기돼도 남는다**(승인·발송 대조는 지문으로 한다) |
| 현재 상태 | `current_status` | `CODE` | **`OUTBOUND` 면 예** | | `message_status_transition` 를 접은 **캐시**. **rev.2.5: 상태 값은 보내는 메시지의 생애주기다 — `INBOUND` 는 비어 있고 상태 전이도 없다**(받은 메시지에 맞는 값이 목록에 없다. 수신 사실은 `received_at` · 스레드 연결 · 원문 기록이 말한다). **INBOUND 의 `NULL` 은 "상태를 모른다"가 아니라 "보내는 메시지 생애주기가 적용되지 않는다"는 뜻이다.** 받은 메시지의 처리 상태는 `raw_input` → `extraction` → `event` 흐름(검토 상태 · 사건 생성 · 보류)에서 관리한다. 규칙: OUTBOUND = `drafted_by` · `current_status` NOT NULL, INBOUND = 둘 다 NULL |
| 현재 승인 | `current_approval_id` | `REF(message_approval)` | 아니오 | FK | **편의 포인터일 뿐. 정본은 `message_approval`** |
| 작성 주체 | `drafted_by` | `CODE` | **`OUTBOUND` 면 예** | | `AI_DRAFT`·`HUMAN`·`TEMPLATE`. **rev.2.5: `INBOUND` 는 비어 있다** — 외부에서 받은 메시지에 CERA 안의 작성 주체를 지어 넣지 않는다. CERA 가 자동으로 만든 초안은 `TEMPLATE`(또는 `AI_DRAFT`)이고, 그 행위 주체는 상태 전이(`DRAFTED`)의 `actor_id` = `SYSTEM` actor 다 |
| 관련 질문들 | (`comm_message_question` 로 연결) | — | | | 한 메시지에 여러 질문 |
| 구조화 값들 | (`comm_message_structured_field` 로 연결) | — | | | **숫자는 본문이 아니라 여기 있다** |
| 시각 | `created_at` · `sent_at` · `received_at` | `TIMESTAMP_TZ` | | | **rev.2.5: `sent_at` 은 처음에 비어 있고, 발송 성공이 확인되면(발송 결과 또는 화해의 `SUCCESS`) 그 시도의 `finished_at` 으로 `NULL` → 값 한 번 채운다. 채운 뒤 바꾸지 않는다** |
| 시뮬레이션 | `is_simulated` · `scenario_id` | — | | FK | |

> 본문에 **API 키·실제 B/L 번호·실제 계약 내용**이 그대로 커밋되는 일이 없도록, 저장소에 들어가는 fixture 는 마스킹·합성만 쓴다(`docs/01` 6절).

#### 15.3.1 `message_kind` 가 필요한 이유 (rev.2 수정)

주소 확인 메일과 업무 메시지는 **성격이 다르다**.

| | 업무 메시지 | 주소 확인 메일 |
| --- | --- | --- |
| 내용 | 수용량 문의 · 요율 요청 · 사실 확인 | 1회용 토큰 링크 |
| 숫자가 들어가나 | 들어간다 | 들어가지 않는다 |
| 상대가 읽고 판단하나 | 그렇다 | 주소 소유만 확인한다 |
| **건별 업무 승인(A-17)** | **반드시 필요** | **예외** — 요구사항이 업무 메시지가 아니라고 규정한다 |

rev.1 은 `send_attempt.approval_id` 를 **무조건 필수**로 못 박아서, 주소 확인 메일을 보낼 방법이 구조적으로 없었다. 그래서 종류를 나눈다.

### 15.4 `comm_message_structured_field` — 메시지의 구조화 값 **(rev.2 신규)**

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용(수정하면 새 메시지)) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 메시지 | `message_id` | `REF(comm_message)` | 예 | **PK 일부**, FK | |
| 값 이름 | `field_key` | `STRING(60)` | 예 | **PK 일부** | `requested_teu` · `requested_slot_start` 등 |
| 값 | `value_text` | `TEXT` | 아니오 | | |
| 값(수치) | `value_number` | `DECIMAL(18,4)` | 아니오 | | **숫자는 여기 들어온다** |
| 단위 | `unit` | `CODE` | 아니오 | | |
| **출처 실행** | `source_run_id` | `REF(recovery_run)` | 아니오 | FK | 이 숫자가 어느 계산에서 나왔나 |
| **출처 질문** | `source_question_item_id` | `REF(question_item)` | 아니오 | FK | 어느 질문의 값인가 |
| **출처 경로** | `source_path` | `STRING(120)` | 아니오 | | 계산 결과 안에서의 위치(예: `assignment[ASG-0001].depart_slot_start`) |

**왜 숫자를 본문 문자열로만 두지 않는가**

CERA 의 발송 초안은 이렇게 만들어진다.

```
숫자   ← 계획·계산에서 주입          (결정론)
문장   ← AI 가 작성                   (LLM)
검사   ← Numeric Validator 가 숫자 대조 (결정론)
승인   ← 운영자가 그 내용을 확인       (사람, A-17)
```

숫자가 본문 문자열 안에만 있으면 **검사도 승인 고정도 문자열 비교**가 된다. 값·단위·출처를 따로 두면 "이 12 TEU 는 `RUN-0001` 의 어느 배정에서 나왔는가"를 되짚을 수 있다(NFR-02 추적성).

### 15.5 `message_approval` — 메시지 승인 (**A-17 게이트 · L-11**)

- 분류 **`DECISION_RECORD`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 승인 id | `approval_id` | `STRING(40)` | 예 | **PK** | |
| 메시지 | `message_id` | `REF(comm_message)` | 예 | FK | |
| 결정 | `decision` | `CODE` | 예 | | `APPROVED`·`REJECTED`·`REVISION_REQUESTED`·**`REVOKED`**·**`INVALIDATED`** — rev.2 확장 |
| **무효 대상** | `invalidates_approval_id` | `REF(message_approval)` | 아니오 | FK(자기참조) | `REVOKED`·`INVALIDATED` 일 때 **필수** |
| **무효 사유 종류** | `invalidation_cause` | `CODE` | 아니오 | | `USER_REVOKED` · `PLAN_SUPERSEDED` · `CONTENT_CHANGED` |
| 결정 주체·시각 | `actor_id` · `decided_at` | — | 예 | FK | |
| **유효 만료 시각** | `expires_at` | `TIMESTAMP_TZ` | 아니오 | | **승인할 때 정하고 이후 고치지 않는다** |
| **승인 시점 제목·본문 참조** | `approved_content_ref` | `STRING(300)` | **조건부** | | **rev.2.4 — 옛 `approved_subject` · `approved_body_text`.** 승인한 제목·본문 그대로의 사본을 **보관 관리 내용**으로 두고 참조만 기록한다(29절). **`APPROVED` 면 메시지에 제목·본문이 있는 범위에서 필수**(15.5.0) |
| 승인 시점 계획 | `approved_plan_run_id` | `REF(recovery_run)` | 아니오 | FK | 어느 계산 결과를 근거로 승인했나. 계획 기반 메시지의 `APPROVED` 면 필수 |
| **승인 내용 지문** | `approved_content_hash` | `HASH` | **조건부** | | 수신자 + 제목 + 본문 + **구조화 값**을 모두 덮는다. **`APPROVED` 면 필수**, 다른 행 종류는 필수 아님(15.5.0) — rev.2.2 정정 |
| 승인 시점 수신자 | `approved_to_address_id` | `REF(contact_channel_address)` | **조건부** | FK | 수신자 바꿔치기 차단. **`APPROVED` 면 필수** |
| 사유 | `reason` | `STRING(500)` | **조건부** | | `REJECTED` · `REVISION_REQUESTED` 면 필수. 무효화일 때도 권장 |

> 승인 뒤 내용이 바뀌면 **새 메시지 + 새 승인**이다. 승인 행을 고쳐 재사용하지 않는다.

#### 15.5.0 행 종류마다 필수 컬럼이 다르다 (rev.2.1 수정)

한 표에 **승인**과 **무효화**가 같이 산다. 모든 행에 승인 사본을 요구하면 **무효화 행이 만들지도 않은 내용을 복사해야 한다.** 종류별로 나눈다.

| `decision` | 반드시 있어야 하는 것 | 없어도 되는 것 |
| --- | --- | --- |
| **`APPROVED`** | `message_id` · `actor_id` · `decided_at` · **`approved_content_hash`** · `approved_to_address_id` · 승인 시점 제목·본문 사본 · **승인 시점 구조화 값 사본**(있는 경우) · 계획 기반이면 `approved_plan_run_id` | `invalidates_approval_id` · `invalidation_cause` |
| **`REJECTED`** · **`REVISION_REQUESTED`** | `message_id` · `actor_id` · `decided_at` · `reason` | **내용 사본은 선택.** 발송 근거가 되지 않으므로 강제하지 않는다. 다만 "무엇을 보고 반려했는지"를 남기고 싶으면 `approved_content_hash` 에 **검토한 내용의 지문**을 넣어도 된다 |
| **`REVOKED`** · **`INVALIDATED`** | `message_id` · `actor_id` · `decided_at` · **`invalidates_approval_id`** · **`invalidation_cause`** | **승인 사본 전부.** 새 내용을 승인한 행이 아니므로 `approved_content_hash` · 제목·본문·구조화 값을 **새로 요구하지 않는다** |

**Integrity Rules**

1. `decision ∈ {REVOKED, INVALIDATED}` 이면 `invalidates_approval_id` 와 `invalidation_cause` 가 **NOT NULL** 이다. 새 `approved_content_hash` 나 승인 사본은 **요구하지 않는다.**
2. 무효화가 가리키는 행은 **`decision = APPROVED`** 여야 한다. 반려나 다른 무효화를 무효화하지 않는다.
3. 무효화가 가리키는 행은 **같은 `message_id`** 에 속해야 한다. 다른 메시지의 승인을 무효화할 수 없다.
4. 한 승인을 가리키는 무효화 행은 **최대 1건**(`invalidates_approval_id` 부분 유일).
5. `decision = APPROVED` 이면 `approved_content_hash` · `approved_to_address_id` 가 **NOT NULL** 이다. 메시지에 제목·본문이 있으면 `approved_content_ref` 도 NOT NULL 이고(rev.2.4), 메시지의 **`comm_message_structured_field` 한 줄마다** `message_approval_structured_field` 사본이 한 줄씩 있어야 한다.
6. `decision ∈ {REJECTED, REVISION_REQUESTED}` 이면 `reason` 이 **NOT NULL** 이다. 승인 성공 행이 아니므로 규칙 5의 사본 조건을 **적용하지 않는다**(검토한 내용의 지문을 남기고 싶으면 넣을 수는 있다).
7. `decision ≠ APPROVED` 인 행은 `invalidates_approval_id` 로 가리켜지지 않고(규칙 2), **발송 근거가 될 수 없다**(15.5.1).
8. 어떤 행도 만들어진 뒤 **UPDATE 되지 않는다**(`expires_at` 포함).

#### 15.5.1 승인의 취소·만료·계획 교체 (rev.2 수정)

rev.1 은 승인을 덧붙이기 전용이라고 했지만 **무효화를 표현할 자리가 없었다.** 그렇다고 기존 승인 행의 상태 컬럼을 UPDATE 하면 덧붙이기가 아니게 된다. 그래서 **무효화도 하나의 결정이고 따라서 하나의 행**으로 둔다.

| 요구 | 어떻게 남나 | UPDATE 필요? |
| --- | --- | --- |
| **만료** | 승인 행의 `expires_at`. **만들 때 정하고 건드리지 않는다** | 없음 |
| **사용자 취소** | 새 행 `decision = REVOKED` + `invalidates_approval_id` + `invalidation_cause = USER_REVOKED` | 없음 |
| **계획 교체로 무효** | 새 행 `decision = INVALIDATED` + `invalidation_cause = PLAN_SUPERSEDED` | 없음 |
| **재승인** | 그냥 새 `APPROVED` 행 | 없음 |

**어떤 승인이 지금 쓸 수 있는가** — 조회로 판정한다.

```
message_id = 지금 보낼 메시지
  AND  decision = APPROVED
  AND  (expires_at 이 비었거나 아직 지나지 않음)
  AND  이 행을 invalidates_approval_id 로 가리키는 행이 없음
  AND  approved_content_hash = 지금 보낼 내용의 지문
  AND  approved_to_address_id = 실제 수신자
```

이 **여섯 조건**이 "유효한 승인"의 정의다. 15.7.1 · 15.7.2 · I-3 · I-9 는 모두 이 정의를 가리킨다(rev.2.2 — 조건 개수 표현 통일).

이렇게 하면 다음 사슬이 전부 복원된다.

```
승인 #1  APPROVED       →  #3 이 INVALIDATED(CONTENT_CHANGED) 로 무효화   ← 왜 무효인지 남는다
승인 #2  APPROVED       →  expires_at 지남                                ← 왜 못 쓰는지 남는다
승인 #4  APPROVED       →  SND-0002 가 이것으로 발송                       ← 무엇으로 보냈는지 남는다
```

`comm_message.current_approval_id` 는 여전히 **편의 포인터일 뿐**이다. 정본은 이 표다.

### 15.6 `message_approval_structured_field` — 승인 시점 구조화 값 **(rev.2 신규)**

- 분류 **`DECISION_RECORD`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 승인 | `approval_id` | `REF(message_approval)` | 예 | **PK 일부**, FK | |
| 값 이름 | `field_key` | `STRING(60)` | 예 | **PK 일부** | |
| 승인 시점 값 | `approved_value_text` · `approved_value_number` · `approved_unit` | — | 아니오 | | **사본** |
| 승인 시점 출처 | `approved_source_run_id` · `approved_source_question_item_id` · `approved_source_path` | — | 아니오 | FK | **사본** |

> `planning_snapshot_fact` 와 같은 생각이다. **가리키지 말고 복사한다.** 초안의 구조화 값은 나중에 바뀔 수 있고, "운영자가 승인한 그 숫자"는 바뀌면 안 된다. `approved_content_hash` 가 이 값들까지 덮으므로 **발송 직전 대조 한 번으로 숫자 바꿔치기를 잡는다**.

### 15.7 `send_attempt` — 발송 시도 (**L-7**)

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`IMMUTABLE_AFTER_CREATE`**(식별·요청 내용) **+ `CONTROLLED_UPDATE`**(결과 5컬럼, 한 번) · MVP — rev.2.2 정정, 15.7.3

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 시도 id | `send_attempt_id` | `STRING(40)` | 예 | **PK** | |
| 메시지 | `message_id` | `REF(comm_message)` | 예 | FK | |
| **승인** | `approval_id` | `REF(message_approval)` | **조건부** | FK | **업무 메시지면 필수**, 주소 확인 메일이면 비어 있다 — 15.7.1 |
| 시도 번호 | `attempt_no` | `INTEGER` | 예 | **UNIQUE**(message_id, attempt_no) | 1, 2, 3 … 재시도마다 1 증가 |
| **멱등 키** | `idempotency_key` | `STRING(100)` | 예 | **UNIQUE** | **rev.2.5 — 시도마다 다르다.** 재료는 **메시지 + 시도 번호**. **논리 발송의 신원은 메시지다**(`message_id` = 헤더 `X-CERA-Message`). 한 메시지의 중복 발송은 이 키가 아니라 **성공 시도 최대 1건 · 미확정 시도 최대 1건 · 재전송 전 `lookup_sent`** 가 막는다(15.7.3) |
| 채널 연결 | `channel_connection_id` | `REF(channel_connection)` | 아니오 | FK | 어느 연결로 나갔나 |
| 발송 내용 지문 | `sent_content_hash` | `HASH` | 예 | | **비교 대상이 메시지 종류에 따라 다르다** — 15.7.2 |
| 시작·종료 시각 | `started_at` · `finished_at` | `TIMESTAMP_TZ` | 예/아니오 | | `started_at` 은 외부 호출 **전에** 기록. `finished_at` 은 결과 기록 때 한 번 |
| 결과 | `result` | `CODE` | **아니오 (결과 기록 전 NULL)** | | `SUCCESS`·`RETRYABLE_FAILURE`·`PERMANENT_FAILURE`·`UNKNOWN`. **NULL = 아직 결과를 기록하지 않음(호출 중이거나 중단됨)**. `UNKNOWN` = 호출은 끝났는데 결과를 모름 — 둘은 다르다. **rev.2.5: `UNKNOWN` 은 최종 결과가 아니라 "아직 확인 안 됨"이다** — 화해만 `SUCCESS` 또는 `RETRYABLE_FAILURE`(보내지 않았음 확인)로 한 번 바꾼다 |
| 채널 오류 | `error_code` · `error_message` | `CODE` · `STRING(500)` | 아니오 | | CERA 내부 오류 코드로 정규화한 값(`docs/23` 6절). **비밀값·토큰·원문 본문을 넣지 않는다** |
| 채널 응답 id | `provider_message_id` | `STRING(200)` | 아니오 | | |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | | Mock 채널 발송 |

#### 15.7.1 발송 승인 게이트는 메시지 종류에 따라 달라진다 (rev.2 수정)

rev.1 은 `approval_id` 를 **NOT NULL** 로 두고 "승인 없는 발송 시도는 절대 존재할 수 없다"고 적었다. 그런데 요구사항은 **주소 확인 메일을 업무 메시지가 아니라고 규정**하고 건별 업무 승인의 예외로 둔다. 둘이 충돌했다. 이렇게 고친다.

| `comm_message.message_kind` | `send_attempt.approval_id` | 그 대신 필요한 것 |
| --- | --- | --- |
| **`BUSINESS`** | **필수** | 유효한 `APPROVED` 승인 (15.5.1 의 여섯 조건 전부) |
| **`CONTACT_VERIFICATION`** | **비어 있어야 한다** | `comm_message.contact_verification_id` 가 **필수** + 토큰 유효 |

**Integrity Rules** — 업무 메시지가 주소 확인으로 위장해 승인을 우회하지 못하게 한다.

1. `message_kind = BUSINESS` 이면 `approval_id` 가 **NOT NULL** 이고, 그 승인은 **같은 `message_id`** 에 속해야 한다.
2. `message_kind = CONTACT_VERIFICATION` 이면 `approval_id` 는 **NULL 이어야 한다**(있으면 거절). 승인을 붙여서 업무 메시지처럼 쓰는 길을 막는다.
3. `message_kind = CONTACT_VERIFICATION` 인 메시지는 **`contact_verification_id` 가 NOT NULL** 이다. 확인 기록 없는 확인 메일은 존재할 수 없다.
4. `message_kind = CONTACT_VERIFICATION` 인 메시지는 **구조화 값을 가질 수 없다**(`comm_message_structured_field` 0건). 숫자가 들어가면 그것은 업무 메시지다.
5. `message_kind = CONTACT_VERIFICATION` 인 메시지는 **`question_item` 과 연결되지 않는다**(`comm_message_question` 0건).
6. `message_kind` 는 메시지를 만들 때 정하고 **바뀌지 않는다**. 바꾸려면 새 메시지다.
7. **두 종류 모두 `audit_log` 에 남는다.** 승인 예외는 감사 예외가 아니다.
8. 주소 확인 메일도 **수신자 주소·토큰 만료·발송 자격의 나머지 규칙**(거래처 활성, 개발 환경 수신자 제한)은 그대로 지킨다.

> 규칙 4·5 가 위장 방지의 핵심이다. 주소 확인 메일은 **토큰 링크만 들어 있는 메일**이고, 숫자나 질문이 붙는 순간 그것은 업무 메시지이므로 승인을 받아야 한다.

#### 15.7.2 발송 지문은 무엇과 비교하나 (rev.2.1 수정)

rev.2 는 `sent_content_hash` 를 "`approved_content_hash` 와 같아야 한다"고만 적었다. **주소 확인 메일에는 승인이 없으므로** 그대로 읽으면 모순이다. 종류별로 나눈다.

| | **`BUSINESS`** | **`CONTACT_VERIFICATION`** |
| --- | --- | --- |
| `approval_id` | 필수 | **NULL** |
| `sent_content_hash` 를 무엇과 비교 | **유효한 승인**의 `approved_content_hash` | **그 메시지 자신**의 `content_hash` |
| 무엇을 막나 | 승인 뒤 내용·수신자·숫자 바꿔치기 | 작성한 내용과 실제 보낸 내용이 달라지는 것 |

**업무 메시지에서 "유효한 승인"이란** (15.5.1 의 여섯 조건과 같다):

```
같은 message_id 에 속하고
decision = APPROVED 이고
expires_at 이 비었거나 아직 지나지 않았고
이 행을 invalidates_approval_id 로 가리키는 행이 없고
approved_content_hash 가 지금 보낼 내용의 지문과 같고
approved_to_address_id 가 실제 수신자와 같다
```

**주소 확인 메일에도 지문 대조는 그대로 한다.** 승인과 비교하지 않을 뿐이고, **"작성한 내용 ≠ 실제 보낸 내용"은 어느 종류에서도 허용되지 않는다.**

> 어느 경우든 지문은 **수신자 + 제목 + 본문 + 구조화 값**을 덮는다. 주소 확인 메일은 구조화 값이 0건이므로 그 부분이 비어 있을 뿐이다.

> **`UNKNOWN`(응답을 못 받음)을 성공·실패로 접지 않는다.** 이 값이 있어야 재시도 정책이 중복 발송을 만들지 않는다.

#### 15.7.3 발송 시도의 생애주기 — 요청은 불변, 결과는 한 번 · `UNKNOWN` 은 화해로 한 번 더 (rev.2.2 수정 · rev.2.5 수정)

rev.2.1 은 이 표를 `APPEND_ONLY` 라고 적었다. 그런데 중복 발송을 막으려면 **외부 호출 전에** 시도 행을 먼저 커밋해야 하고(`docs/18` H.2 — "보냈는지 모르겠다" 상태를 남기기 위해), 결과는 호출이 끝난 뒤에야 안다. 그래서 두 부분으로 나눈다. **결과를 담는 별도 표는 만들지 않는다.**

| 부분 | 컬럼 | 변경 |
| --- | --- | --- |
| **식별·요청 (불변)** | `send_attempt_id` · `message_id` · `approval_id` · `attempt_no` · `idempotency_key` · `channel_connection_id` · `sent_content_hash` · `started_at` · `is_simulated` | **만든 뒤 절대 고치지 않는다** |
| **결과 (정해진 생애주기)** | `finished_at` · `result` · `error_code` · `error_message` · `provider_message_id` | `result = NULL` 에서 **결과로 한 번** 간다. **`UNKNOWN` 만 화해로 한 번 더** 간다(규칙 2) |

**Integrity Rules**

1. 식별·요청 9컬럼은 **어떤 경우에도 UPDATE 하지 않는다.** 재시도는 이 행을 고치지 않고 **새 행**(`attempt_no + 1`)이다.
2. `result` 는 `NULL` 에서 `SUCCESS` · `RETRYABLE_FAILURE` · `PERMANENT_FAILURE` · `UNKNOWN` 중 하나로 **한 번** 간다. **`SUCCESS` · `RETRYABLE_FAILURE` · `PERMANENT_FAILURE` 는 확정 결과**이고 바꾸지 않는다. **`UNKNOWN` 은 확정이 아니다**(rev.2.5) — "이 시도의 결과를 아직 확인하지 못함"이며, **화해(`lookup_sent`)만** 한 번 더 바꿀 수 있다:
   - 채널에서 발송을 찾음 → `UNKNOWN` → **`SUCCESS`**(`provider_message_id` 를 함께 기록)
   - 발송이 없음을 확인 → `UNKNOWN` → **`RETRYABLE_FAILURE`**(`error_code` = 화해 결과 코드 — 보내지 않았음이 확인됐다)
   - 화해가 확인하지 못하면 `UNKNOWN` 그대로 둔다(다시 화해한다). `finished_at` 은 호출이 끝난 시각이라 화해 때 바꾸지 않는다. 화해 결과를 담는 별도 표는 만들지 않는다 — 감사·상태 전이는 기존 구조에 남는다
3. `result` 를 기록할 때 `finished_at` 도 함께 기록한다. `result = SUCCESS` 이면 `error_code` 는 비어 있다.
4. 프로세스가 호출 중에 죽어 `result = NULL` 로 남은 행은 **다시 보내지 않고 먼저 외부 조회로 화해**한다(`docs/18` H.2). 화해 결과(`SUCCESS` 또는 `RETRYABLE_FAILURE`)를 그 행의 결과로 한 번 기록한다.
6. **논리 발송의 신원은 메시지다**(rev.2.5). 한 메시지에 대해 (a) **`SUCCESS` 시도는 최대 1건**, (b) **결과가 `NULL` 이거나 `UNKNOWN` 인 시도는 최대 1건** — 그래서 앞 시도가 확정 실패로 끝나야만 새 시도(`attempt_no + 1`)를 만들 수 있다. **`UNKNOWN` 뒤 곧바로 재전송하지 않는다**: `lookup_sent` → 발송 없음 확인(`RETRYABLE_FAILURE`) → 새 시도 순서다. `SUCCESS` 나 `PERMANENT_FAILURE` 시도가 있는 메시지에는 새 시도를 만들지 않는다.
7. `idempotency_key` 는 **시도마다 다르다**(재료 = 메시지 + 시도 번호). 채널이 멱등 키를 받으면 그 값을 넘기고, 받지 않으면(Gmail) 중복 방지는 규칙 6 과 조회가 한다(`docs/18` H.2 "멱등키만으로는 안 된다").
5. 기술 오류의 상세(어느 구성요소·어떤 예외·재시도 가능 여부·추적 id)는 여기가 아니라 **`system_error`** 에 남는다(16.2a). 이 표는 "이 시도가 어떻게 끝났나"만 답한다.

### 15.8 `message_status_transition` — 메시지 상태 전이

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

`transition_id` PK · `message_id` FK · `status CODE`(`DRAFTED`·`PENDING_APPROVAL`·`APPROVED`·`REJECTED`·`QUEUED`·`SENT`·`DELIVERY_FAILED`·`REPLIED`·`CLOSED`) · `occurred_at` · `actor_id` FK · `send_attempt_id` FK · `note` · **`is_simulated BOOLEAN`**(rev.2.2 표기 보강 — 20절 목록에는 이미 있었다).

> `comm_message.current_status` 는 이 표의 마지막 행을 접어 둔 **캐시**다. 상태의 정본은 여기다(안티패턴 3).

#### 15.8.1 세 축을 섞지 않는다 — 메시지 상태 · 발송 시도 결과 · 승인 상태 **(rev.2.3 신규)**

**새 표도 새 상태 값도 만들지 않는다.** 헷갈리기 쉬운 사건들이 **이미 있는 구조의 어디**로 가는지만 정한다.

| 축 | 어디 | 묻는 것 |
| --- | --- | --- |
| **메시지 상태** | `message_status_transition.status` | 이 **업무 메시지**가 지금 어디까지 갔나 |
| **발송 시도 결과** | `send_attempt.result` (+ `error_code`) | 이 **한 번의 외부 호출**이 어떻게 끝났나 |
| **승인 상태** | `message_approval` 행들 | 사람이 **무엇을 승인·취소했나** |
| (기술 실패) | `system_error` | 프로그램이 **어떻게 실패했나** (`docs/23` 4.1) |

한 사건이 **여러 축에 동시에** 남을 수 있다. 같은 실패가 `send_attempt` 와 `system_error` 두 곳에 남는 것은 중복이 아니다 — 운영자는 앞을 보고 개발자는 뒤를 본다(`docs/23:114`).

| 실제 사건 | 메시지 상태 | 발송 시도 결과 | 승인 | 기술 오류 |
| --- | --- | --- | --- | --- |
| **반송(bounce)** — 보냈는데 되돌아옴 | `DELIVERY_FAILED` | 이미 `SUCCESS` 로 끝난 시도는 **고치지 않는다**(15.7.3). 반송은 그 **뒤에 온 사실** | — | 아니다. 상대 메일함의 업무 사실이다 |
| **영구 실패** — 주소 없음·수신 거부 | `DELIVERY_FAILED` | `PERMANENT_FAILURE` + `error_code` | — | 채널 오류면 함께 기록 |
| **재시도 가능 실패** — 시간 초과·429 | 바뀌지 않는다 (`QUEUED` 유지) | `RETRYABLE_FAILURE` | — | 기록(`GMAIL_TIMEOUT` 등) |
| **보냈는지 모름** | 바뀌지 않는다 | **`UNKNOWN`** — `NULL`(결과 미기록)과 다르다. 화해가 `SUCCESS` 또는 `RETRYABLE_FAILURE` 로 한 번 바꾼다(15.7.3 규칙 2, rev.2.5) | — | 기록 가능 |
| **승인 취소·무효화** | `PENDING_APPROVAL` 로 돌아가지 않는다. **새 메시지가 필요하면 새 메시지다** | — | `REVOKED` · `INVALIDATED` **새 행**(15.5.1) | 아니다 |
| **숫자 검사 실패** — 초안의 구조화 값이 계획과 다름 | 발송으로 가지 않는다 | **시도 자체가 생기지 않는다** | 유효한 승인이 없으므로 I-9 가 막는다 | **아니다. 정책 거부다**(`docs/23:232`) |

**규칙 세 가지**

1. **`send_attempt` 결과 5컬럼은 한 번만 채워진다**(15.7.3). 나중에 온 반송·회신은 **새 사실**이지 옛 시도의 정정이 아니다.
2. **정책 거부는 기술 오류가 아니다.** Contact Gate 불통과 · 승인 지문 불일치 · 숫자 검사 실패는 `system_error` 가 아니라 업무 상태와 `audit_log` 에 남는다.
3. `message_kind = CONTACT_VERIFICATION` 은 승인 축이 **비어 있다**(I-10). 주소 확인 메일은 업무 승인 게이트 밖이다(15.3.1).

> **`message_kind` 값은 늘리지 않는다**(L-15 OPEN). 위 사건들은 전부 기존 9개 상태와 4개 결과 안에서 표현된다.

### 15.9 `extraction` — LLM 추출 후보

- 분류 **`EVIDENCE`** · 변경 **`IMMUTABLE_AFTER_CREATE`**(추출 결과) **+ `CONTROLLED_UPDATE`**(검토 4컬럼) · MVP — rev.2.2 정정, 15.9.1
- **LLM 이 만든 것은 여기까지다.** 여기서 사실로 넘어가는 다리는 사람 또는 결정론 규칙이다(A-15).

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 추출 id | `extraction_id` | `STRING(40)` | 예 | **PK** | |
| 원천 메시지 | `message_id` | `REF(comm_message)` | 아니오 | FK | |
| 원천 입력 | `raw_input_id` | `REF(raw_input)` | 예 | FK | 문서·메일 공통 |
| **질문 표식** | `ask_id` | `STRING(40)` | 아니오 | | `question_item` 으로 되붙는 열쇠(L-1) |
| 후보 값 | `candidate_value_text` | `TEXT` | 예 | | |
| 후보 단위 | `candidate_unit` | `CODE` | 아니오 | | |
| **근거 인용 참조** | `source_quote_ref` | `STRING(300)` | 예 | | **rev.2.4 — 옛 `source_quote`.** 원문 어디서 왔는지 반드시 남긴다. 인용도 원문의 일부라 **보관 관리 내용**이다(29절). 원문보다 오래 둘 수 있다 |
| **근거 인용 지문** | `source_quote_hash` | `HASH` | 예 | | **rev.2.4 신규.** 인용이 파기돼도 **이 사건이 어떤 인용에서 왔는지**의 증거로 남는다 |
| 인용 위치 | `quote_location` | `STRING(100)` | 아니오 | | |
| 모델 판 | `model_version` | `STRING(60)` | 예 | | |
| 프롬프트 판 | `prompt_version` | `STRING(20)` | 예 | | |
| **추출 스키마 판** | `schema_version` | `STRING(20)` | 예 | | **rev.2.3 신규.** 어느 추출 계약(구조화 출력 스키마)으로 뽑았나 |
| **입력 지문** | `input_hash` | `HASH` | 예 | | **rev.2.3 신규.** 무엇을 넣고 뽑았나. 같은 입력·같은 판이면 재실행을 설명할 수 있다 |
| **검증기 결과** | `validator_result` | `JSON` | 예 | | **rev.2.3 신규.** `docs/05` 4.6 검사별 통과/실패. **`model_confidence` 와 다른 것** — 15.9.2 |
| 모델 자기 점수 | `model_confidence` | `DECIMAL(5,4)` | 아니오 | | **근거 강도가 아니다** |
| 처리 상태 | `review_status` | `CODE` | 예 | | `PENDING`·`ACCEPTED`·`REJECTED`·`SUPERSEDED` |
| 채택 주체·시각 | `reviewed_by_actor_id` · `reviewed_at` | — | 아니오 | FK | |
| **생성 사건** | `created_event_id` | `REF(event)` | 아니오 | FK | 채택되면 사건이 되고 여기 연결된다 |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | | |

> **`extraction` 에는 신원·권한·근거 강도·상태·확정 숫자가 없다.** 그것들은 전부 결정론 경로(`event` → `canonical_fact`)에서 정해진다(ADR-026·029).

#### 15.9.1 추출 기록의 생애주기 — 추출 결과는 불변, 검토만 갱신 (rev.2.2 수정)

rev.2.1 은 이 표를 `APPEND_ONLY` 라고 적었지만, 사람이 후보를 채택하거나 거절하면 **검토 컬럼이 나중에 채워진다.** 두 부분으로 나눈다.

| 부분 | 컬럼 | 변경 |
| --- | --- | --- |
| **추출 결과 (불변)** | `extraction_id` · `message_id` · `raw_input_id` · `ask_id` · `candidate_value_text` · `candidate_unit` · **`source_quote_ref`** · **`source_quote_hash`** · `quote_location` · `model_version` · `prompt_version` · **`schema_version`** · **`input_hash`** · **`validator_result`** · `model_confidence` · `is_simulated` | **만든 뒤 절대 고치지 않는다.** LLM 이 낸 것과 검증기가 판정한 것은 그대로 남는다 (rev.2.3 12 → 15 · rev.2.4 **16컬럼** — 인용은 참조 + 지문). 인용 **내용**의 파기는 이 규칙의 UPDATE 가 아니다(29.3) |
| **검토 (정해진 생애주기)** | `review_status` · `reviewed_by_actor_id` · `reviewed_at` · `created_event_id` | `PENDING` → `ACCEPTED` / `REJECTED` / `SUPERSEDED` **한 방향으로 한 번만** |

**Integrity Rules**

1. 추출 결과 **16컬럼**(rev.2.4)은 **어떤 경우에도 UPDATE 하지 않는다.** 다시 추출하면 새 행이고, 이전 행은 `SUPERSEDED` 로 닫는다.
2. `review_status` 는 `PENDING` 에서 출발해 종료 상태로 **한 번만** 간다.
3. `review_status = ACCEPTED` 이면 `created_event_id` 가 NOT NULL 이다(채택 = 사건 생성). `REJECTED` · `SUPERSEDED` 면 비어 있다.
4. `ACCEPTED` · `REJECTED` 는 `reviewed_at` 이 NOT NULL 이다. 사람이 판정했으면 `reviewed_by_actor_id` 도 있다(결정론 규칙이 채택하면 `SYSTEM` 주체).
5. 검토 결과가 사실이 되는 길은 **새 `event` 한 행**뿐이다. 추출 행의 값을 고쳐 사실로 쓰지 않는다.
6. `validator_result` 는 **추출 결과의 일부**다. 나중에 정책이 바뀌어 다시 판정하면 **새 추출 행**이고 이전 행은 `SUPERSEDED` 다 (rev.2.3).

#### 15.9.2 검증기 결과와 모델 자기 점수는 다른 것이다 **(rev.2.3 신규)**

승인된 `docs/21` 13절이 Extraction 의 내용을 이렇게 정의한다:

> "추출 1회의 기록 (모델·프롬프트 버전·**스키마 버전**·**입력 해시**·출력·**검증기 결과**·결과 종류)"

rev.2.2 의 표에는 밑줄 친 셋이 없었다. 이번에 채웠다.

| | `model_confidence` | `validator_result` |
| --- | --- | --- |
| 누가 만드나 | **LLM 자신** | **결정론 검증기**(Backend) |
| 쓰나 | **쓰지 않는다** — `docs/05` 4.6 "LLM이 스스로 매긴 확신도는 쓰지 않는다" | **쓴다** — `event.input_confidence_level` 의 재료 |
| 분류 | 참고 기록 | 판정 근거 |

**구조는 `docs/05` 4.6 의 검사 목록 안에서만 만든다.** 새 평가 체계를 만들지 않는다. 4.6 이 정한 검사는 일곱 가지다 — JSON 스키마 적합 · 인용이 원문에 그대로 있음 · 수량·시각·금액 파싱과 단위 · 스레드 문맥 일치 · 발신자 등록부 조회 · 모호 표현 탐지 · 모델 거절·호출 실패.

`validator_result` 는 **검사별 결과와 그 결과가 신뢰도에 준 영향**을 담는다. `JSON` 인 이유는 `input_confidence_reasons` 와 같다(11.2b) — 검사 목록이 정책과 함께 바뀌므로 표로 고정하면 판마다 스키마를 바꿔야 한다.

**두 곳에 남는 이유.** `extraction.validator_result` 는 *이 추출에 대해 검증기가 무엇을 봤나*이고, `event.input_confidence_reasons` 는 *그래서 이 사건의 입력 신뢰도가 왜 그 등급인가*다. LLM 경로가 아닌 사건(사람 입력·공공 API)은 `extraction` 행이 없으므로 후자만 갖는다.

> **추출 실패는 여기 남지 않는다.** 호출 실패·파싱 실패 같은 기술 실패는 `system_error` 다(`docs/23` 4.3). `validator_result` 는 **추출은 됐는데 검사에서 깎인 것**을 담는다.

### 15.10 `comm_message_question` — 메시지와 질문 연결

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`APPEND_ONLY`** · MVP · **PK** = (`message_id`, `question_item_id`), 둘 다 FK.
- 한 메시지에 여러 질문을 싣고, 한 질문이 재발송으로 여러 메시지에 실릴 수 있다.

---

## 16. I. 주체·감사·운영 / J. 시뮬레이션 / MVP 에서 만들지 않는 것

### 16.1 `actor` — 행위 주체 (**Q-62**)

- 분류 **`MASTER`** · 변경 **`CONTROLLED_UPDATE`** · MVP · 최소 구성

`actor_id` PK · `actor_type CODE`(`HUMAN`·`SYSTEM`·`AI_AGENT`) · `display_name` · `is_active`.

> 로그인·권한·조직은 **여기서 정하지 않는다**. 인증 설계가 오면 이 테이블에 붙인다. 지금 필요한 것은 "누가 결정했나"를 남길 수 있는 참조점 하나다.

### 16.2 `audit_log` — 감사 기록

- 분류 **`SOURCE_OF_TRUTH`** · 변경 **`APPEND_ONLY`** (덧붙이기 전용) · MVP

`audit_id` PK · `occurred_at` · `actor_id` FK · `action CODE` · `target_type`·`target_id` · `before_ref`·`after_ref` · `request_context STRING(300)` · `result CODE` · `is_simulated`.

> 사람의 **결정**은 `plan_decision`·`message_approval`·`verification_request_handling` 에 남는다. `audit_log` 는 그 위에 얹는 **행위 기록**이며, 결정 기록을 대체하지 않는다.

### 16.2a `system_error` — 시스템·연동 오류 기록 **(rev.2.2 신규 · 기술 운영 표)**

- 분류 **`EVIDENCE`** · 변경 **`APPEND_ONLY`** (오류 발생 기록 자체는 고치지 않는다) · MVP
- **업무 도메인 개념이 아니다.** CERA 안이나 외부 시스템 호출에서 난 **기술적 실패**를 나중에 DB 에서 찾아보기 위한 기술 운영(관측성) 표다. 승인된 개념 모델(`docs/21`)의 저장 개념이 아니며, 개념 모델을 다시 열지 않는다(23절).
- **무엇을 여기에 남기고 무엇을 로그에만 두는지, 어떻게 기록하는지**의 정본은 **`docs/23_runtime-platform-and-observability.md`** 4~6절이다(DB vs 로그 기준 4.3, 비밀 금지 4.4, 추적 id 5절, 오류 정규화 6절). 이 절은 **표 모양**만 정한다.

| 한글 | 컬럼 | 타입 | 필수 | 키 | 설명 |
| --- | --- | --- | --- | --- | --- |
| 오류 id | `error_id` | `STRING(40)` | 예 | **PK** | |
| 발생 시각 | `occurred_at` | `TIMESTAMP_TZ` | 예 | | Asia/Seoul |
| 서비스 | `service_name` | `STRING(60)` | 예 | | 어느 배포 단위인가(예: API 서버, 백그라운드 작업자). 이름 목록은 구현 때 |
| 구성요소 | `component_name` | `STRING(100)` | 예 | | 어느 모듈인가(예: `channels.gmail`, `comms.outbox`) |
| 작업 | `operation_name` | `STRING(100)` | 예 | | 무엇을 하다가 났나(예: `send_message`, `fetch_inbound`) |
| **경계** | `error_boundary` | `CODE` | 예 | | `API_REQUEST` · `INTEGRATION` · `BACKGROUND_JOB` — 오류를 잡은 공통 처리 지점(`docs/23` 4절) |
| **오류 분류** | `error_category` | `CODE` | 예 | | CERA 내부 분류(예: 외부 시간 초과 · 외부 인증 · 외부 요청 한도 · 외부 서버 오류 · 외부 응답 형식 오류 · 내부 예상 밖 오류 · 데이터 처리 실패 · 작업 실패). **값 목록은 확정하지 않았다**(Q-66) |
| **오류 코드** | `error_code` | `STRING(60)` | 예 | | 정규화한 코드(예: `GMAIL_TIMEOUT` · `GMAIL_RATE_LIMITED` · `GMAIL_AUTH_EXPIRED` · `EXTERNAL_RESPONSE_INVALID`) |
| **안전한 메시지** | `safe_error_message` | `STRING(500)` | 예 | | 사람이 읽을 요약. **비밀값·토큰·수신자 주소 원문·메일 본문·전체 스택 트레이스를 넣지 않는다** |
| 예외 종류 | `exception_type` | `STRING(200)` | 아니오 | | 프로그램 예외 클래스 이름 |
| **요청 id** | `request_id` | `STRING(64)` | 아니오 | | 한 번의 API 요청·작업 실행을 가리킨다 |
| **추적 id** | `trace_id` | `STRING(64)` | 아니오 | | 서버 안 여러 계층과 외부 호출을 한 흐름으로 잇는다. **업무 상관 id(`docs/05` 의 `correlation_id` — 메일 스레드·복구 실행)와 다른 것이다**(`docs/23` 5절) |
| 대상 외부 시스템 | `target_system` | `CODE` | 아니오 | | 외부 호출 실패일 때(예: `GMAIL` · `UNIPASS` · `DATA_GO_KR` · `LLM_PROVIDER`) |
| HTTP 상태 | `http_status` | `INTEGER` | 아니오 | | 외부 응답·API 응답 코드가 있으면 |
| **재시도 가능** | `retryable` | `BOOLEAN` | 예 | | 분류 규칙이 판정한 값. **재시도를 실제로 했는지는 여기 쓰지 않는다**(발송이면 `send_attempt` 가 답한다) |
| 관련 개체 종류 | `related_entity_type` | `CODE` | 아니오 | 다형 | `COMM_MESSAGE` · `SEND_ATTEMPT` · `RECOVERY_RUN` · `RAW_INPUT` · `EXTRACTION` 등 |
| 관련 개체 id | `related_entity_id` | `STRING(40)` | 아니오 | 다형 | **DB FK 없음**(17.4 — 관련 행이 만들어지다 실패한 경우에도 남아야 한다) |
| 로그 참조 | `raw_log_ref` | `STRING(300)` | 아니오 | | 전체 스택 트레이스·상세 로그가 있는 **외부 로그 저장소의 위치**. 본문을 여기 넣지 않는다 |
| 시뮬레이션 | `is_simulated` | `BOOLEAN` | 예 | | Mock 채널·시나리오 재생 중 난 오류 |
| 시나리오 | `scenario_id` | `REF(scenario)` | 아니오 | FK | `is_simulated = true` 일 때만 |

**Integrity Rules**

1. **행을 고치지 않는다.** 오류가 해결됐는지·사람이 대응했는지·재시도했는지는 이 행에 덮어쓰지 않는다. 발송 재시도는 `send_attempt` 새 행이 답하고, 사람의 행위는 `audit_log` 가 답한다. **이번 단계에서 대응 이력 표(`system_error_handling` 같은 것)는 만들지 않는다.**
2. **현실 사실이 아니다.** `system_error` 는 `event` 를 만들지 않고, `canonical_fact` 나 계산의 입력이 되지 않는다(I-19).
3. **사람의 행위 기록이 아니다.** `audit_log` 를 대신하지 않고, `audit_log` 도 이것을 대신하지 않는다.
4. **모든 로그를 넣지 않는다.** 검색·대응이 필요한 중요한 오류만 남긴다. 정상적인 입력 검증 실패(4xx)·debug/info 로그·반복되는 낮은 가치의 경고는 넣지 않는다(`docs/23` 4.3).
5. 비밀값·토큰·실제 메일 본문·원문 응답·전체 스택 트레이스는 **어느 컬럼에도 넣지 않는다**(I-20, `docs/01` 6절).
6. `is_simulated = true` 이면 `scenario_id` 가 있다(S-2).

**같은 실패가 두 곳에 남을 수 있다 — 역할이 다르다**

```
Gmail API 가 503 을 돌려줬다
  → send_attempt   : result = RETRYABLE_FAILURE, error_code = GMAIL_SERVER_ERROR   "이 발송 시도는 어떻게 끝났나"
  → system_error   : INTEGRATION · GMAIL · 503 · retryable = true · trace_id        "시스템 어디서 어떤 기술 오류가 났나"
  → event          : 만들지 않는다                                                   (현실 세계의 사실이 아니다)
  → audit_log      : 발송을 누른 사람의 행위는 원래대로 남는다. 오류 자체는 감사 기록이 아니다
```

| 표 | 답하는 질문 | 누가 읽나 |
| --- | --- | --- |
| `event` | 현실 세계에서 무엇이 사실이라고 주장됐나 | Reconciliation · 계산 |
| `audit_log` | CERA 안에서 누가 무엇을 했나 | 책임 추적 |
| `send_attempt` | 이 발송 시도가 어떻게 끝났나 | 발송 재시도·화해, 통신 화면 |
| **`system_error`** | **시스템 어디서 어떤 기술 오류가 났나, 다시 해도 되나, 무엇과 관련됐나** | **개발자·운영자** |

### 16.3 `scenario` — 시나리오 (**L-8**)

- 분류 **`SIMULATION_ONLY`** · 변경 **`CONTROLLED_UPDATE`** · MVP

`scenario_id` PK · `scenario_name` · `description` · `data_pack_ref STRING(300)` · `as_of_base TIMESTAMP_TZ` · `created_at` · `is_active`.

- **시뮬레이션용 테이블을 따로 만들지 않는다.** 같은 테이블에 `is_simulated` + `scenario_id` 를 둔다.
- **모든 운영 조회는 `is_simulated = false` 를 건다.** 이 조건이 빠진 조회는 리뷰에서 막는다.
- 계산 산출물은 `contains_simulated` 로 **전파**한다. 시뮬레이션 사실이 하나라도 섞이면 결과에 표시가 남는다(`docs/01` 규칙 9).

### 16.4 `exception_case` — 예외 사건 **(MVP 에서 만들지 않는다 · D-5 CLOSED FOR MVP)**

**결정 (2026-09-17)**: MVP 에서는 **만들지 않는다.** 예외는 **파생 조회**로 본다.

근거: 아래 폐쇄 루프에 이 표가 없어도 아무것도 막히지 않는다.

```
Event → Risk → RecoveryRun → Communication → Reply → Re-run
```

> **"영원히 필요 없다"는 뜻이 아니다.** 아래가 실제 제품 요구로 올라오면 그때 다시 연다: 담당자 배정 · 예외 건 상태 · 종결 · SLA · Case 단위 협업 · 관련 실행과 문의 전체 묶기.
>
> 만들 때는 **결정적 `case_key`** 를 쓴다(`verification_request` 와 같은 이유 — 재계산으로 사라졌다 다시 생겨도 사람의 작업이 끊기지 않아야 한다).

### 16.5 `operational_plan_batch` — 계획 업로드 묶음 **(MVP 에서 만들지 않는다 · D-4 CLOSED)**

**결정 (2026-09-17)**: MVP 에서는 **만들지 않는다.**

```
계획 업로드 1건  =  raw_input 1행  →  여러 plan.* 사건이 같은 raw_input_id 를 공유
```

이 구조로 "어느 업로드에서 온 예정인가"가 이미 답해진다. 지금 표를 만들면 `raw_input` 과 의미가 겹치는 빈 표가 된다.

> **다시 여는 조건**: 배치 자체의 이름 · 배치 상태 · 버전 · 배치 승인 · 묶음 단위 되돌리기/교체 중 하나라도 실제 요구가 되면.

---

## 17. 키·제약·참조 무결성 전략

### 17.1 기본키 (PK)

| 방식 | 쓰는 곳 | 이유 |
| --- | --- | --- |
| **단일 대리키** | 대부분의 테이블 | 업무 번호가 바뀌어도 참조가 깨지지 않는다 |
| **복합 자연키** | `canonical_fact`(**6열**) · `planning_snapshot_fact`(**6열**) · `planning_snapshot_input`(5열) · `cost_line_link`(4열) · `event_entity_link`(3열) · **`event_verification_target`(3열, rev.2.3)** · `planning_snapshot_constraint`(2열) · `container_bl`(2열) · `comm_message_question`(2열) · `comm_message_structured_field`(2열) · `message_approval_structured_field`(2열) | 그 조합 자체가 "하나만 존재해야 하는 것"이다. **PK 구성 컬럼은 전부 NOT NULL 이다**(rev.2.2 — 13.2b `value_path`) |
| **위임 PK(1:1)** | `facility_warehouse` · `facility_terminal` · `facility_odcy` | `facility_id` 가 PK 이자 FK. 상세가 공통보다 먼저 생길 수 없다 |

> **`canonical_fact` 와 `planning_snapshot_fact` 가 6열인 이유**: 개체 2열 + 사실 키 + **적용 범위 2열** + (`canonical_fact` 는 `is_simulated`, `planning_snapshot_fact` 는 `snapshot_id`). rev.2 에서 범위가 키에 들어가면서 4열 → 6열이 됐다(11.4.1).

**업무 번호는 PK 가 아니다**: `container_no` · `bl_no` · `ask_id` · 외부 메시지 id 는 전부 별도 컬럼이다(`bl_no` 의 유일 제약만 L-16 으로 보류).

### 17.2 유일 제약 (UNIQUE) 목록

| 테이블 | 유일 제약 | 무엇을 막는가 |
| --- | --- | --- |
| `container` | `container_no` | 같은 컨테이너 중복 등록 |
| `bl` | **후보** (`bl_type`, `bl_no`, `bl_year`) — **확정 보류**(L-16) | 중복 B/L. 근거가 부족해 지금 닫지 않는다(8.2) |
| `container_bl` | (`container_id`) 중 `link_role = PRIMARY` **1건** | 주 B/L 이 둘이 되는 상태 |
| `external_identifier` | (`issuing_system`, `id_type`, `id_value`) | 같은 외부 번호가 두 개체에 붙는 것 |
| `raw_input` | (`source_name`, `source_record_key`) — **값이 있을 때만** | **같은 전달 건의 중복 처리**. 내용이 같은 재수집은 막지 않는다(11.1) |
| `contact_channel_address` | (`channel_type`, `normalized_address`) | 같은 주소 중복 등록 |
| `verification_request` | `request_key` | 같은 확인 요청이 재계산마다 새로 생기는 것 |
| **`event`** | **`idempotency_key`** (rev.2.3) | **같은 주장을 두 번 사건으로 만드는 것.** 같은 `raw_input` 을 다시 처리해도 사건은 하나다(11.2d) |
| `event_entity_link` | (`event_id`) 중 `link_role = SUBJECT` **1건** | **사건 하나에 주체가 둘이 되는 상태**(11.3) |
| **`event_verification_target`** | PK (`verification_event_id`, `target_event_id`, `target_role`) (rev.2.3) | 같은 확인이 같은 대상을 같은 역할로 두 번 가리키는 것 |
| `message_approval` | (`invalidates_approval_id`) **1건** — 값이 있을 때 | 같은 승인을 두 번 무효화하는 것(15.5.1) |
| `operator_planning_constraint` | (`releases_constraint_id`) **1건** — 값이 있을 때 | 같은 조건을 두 번 해제하는 것(13.6) |
| `question_item` | (`thread_id`, `ask_id`) | 회신 매핑의 모호함 |
| `comm_thread` | (`channel_type`, `external_thread_id`) | 스레드 중복 |
| `comm_message` | (`channel_type`, `external_message_id`) | **중복 수신 처리** |
| `send_attempt` | `idempotency_key`(시도마다 다름) · (`message_id`, `attempt_no`) · **메시지당 `SUCCESS` 1건** · **메시지당 미확정(`NULL`·`UNKNOWN`) 1건** (rev.2.5 — 뒤의 둘은 조건부 유일) | **중복 발송** — 논리 발송의 신원은 메시지다(15.7.3 규칙 6) |
| `facility_*` 상세 | `facility_id` | 1:1 위반 |
| `canonical_fact` | PK 에 **적용 범위 2컬럼 포함** | 범위가 다른 사실이 서로를 덮어쓰는 것(11.4.1) |

### 17.3 외래키와 삭제 정책

**물리 삭제를 기본으로 하지 않는다.** 마스터는 `is_active = false`, 기록은 덧붙이기다.

| 관계 | cardinality | 선택적? | 삭제 의미 |
| --- | --- | --- | --- |
| `event` → `raw_input` | N:1 | 필수 | **삭제 금지**. 원천 없는 사건은 존재할 수 없다 |
| `event` → `event`(정정) | N:0..1 | 선택 | 삭제 금지 (정정 사슬이 끊긴다) |
| `event_entity_link` → `event` | N:1 | 필수 | 사건과 함께만 존재 |
| **`event_verification_target` → `event`(확인)** | N:1 | 필수 | **삭제 금지.** 확인 기록이 끊긴다 (rev.2.3) |
| **`event_verification_target` → `event`(대상)** | N:1 | 필수 | **삭제 금지.** 무엇을 확인했는지 잃는다 (rev.2.3) |
| `canonical_fact` → `event`(채택) | N:1 | 필수 | `canonical_fact` 는 재생성 대상이므로 전체 삭제 후 재계산은 허용 |
| `verification_request_handling` → `verification_request.request_key` | N:1 | **DB FK 아님** | **논리 연결 키.** 요청이 재생성으로 사라져도 처리 기록은 남는다(11.7.1) |
| `question_item.verification_request_key` → `verification_request.request_key` | N:0..1 | **DB FK 아님** | **논리 연결 키.** 사람이 실제로 보낸 질문이 파생 행의 생존에 의존하지 않는다(15.2.2) — rev.2.2 표기 보강 |
| `planning_snapshot_constraint` → `planning_snapshot` | N:1 | 필수 | 스냅샷 삭제 금지 |
| `planning_snapshot_input` → `planning_snapshot` | N:1 | 필수 | 스냅샷 삭제 금지 |
| `planning_snapshot_fact` → `planning_snapshot` | N:1 | 필수 | 스냅샷 삭제 금지 |
| `assignment` → `recovery_run` | N:1 | 필수 | 실행 삭제 금지 |
| `plan_decision` → `recovery_run` | N:1 | 필수 | 삭제 금지 |
| `send_attempt` → `message_approval` | N:0..1 | **조건부 필수** | `message_kind = BUSINESS` 면 필수, `CONTACT_VERIFICATION` 이면 비어 있어야 한다(15.7.1) |
| `comm_message` → `contact_verification` | N:0..1 | 조건부 필수 | `message_kind = CONTACT_VERIFICATION` 이면 필수 |
| `message_approval_structured_field` → `message_approval` | N:1 | 필수 | 승인과 함께만 존재 |
| `comm_message_structured_field` → `comm_message` | N:1 | 필수 | 메시지와 함께만 존재 |
| `message_approval` → `message_approval`(무효화) | N:0..1 | 선택 | 삭제 금지 (무효화 사슬이 끊긴다) |
| `operator_planning_constraint` → 자기 자신(해제) | N:0..1 | 선택 | 삭제 금지 |
| `comm_message` → `message_approval`(현재) | 1:0..1 | 선택 | 포인터일 뿐 |
| `cost_line_item` → `cost_result` | N:1 | 필수 | 삭제 금지 |
| `cost_line_link` → 대상 | N:1 | 다형 | **DB FK 없음**. 쓰기 경로 검증 |
| `container` → `facility`(목적지) | N:0..1 | 선택 | 시설은 비활성화만 |
| `extraction` → `event`(생성) | 1:0..1 | 선택 | 채택 전에는 비어 있다 |
| `system_error` → 관련 개체 | N:0..1 | **다형 · DB FK 없음** | 오류 기록은 관련 행이 지워지거나 재생성돼도 남는다(16.2a) |

### 17.4 다형 참조 (DB FK 로 강제할 수 없는 곳)

`event_entity_link` · `external_identifier` · `cost_line_link` · `risk_assessment` · `operator_planning_constraint` · `audit_log` · `system_error` 은 (`*_type`, `*_id`) 쌍을 쓴다.

> **`system_error` 만 규칙 2 의 예외**다(rev.2.2). 오류는 관련 행이 **만들어지다 실패했을 때**도 기록해야 하므로, 쓰기 경로에서 대상 존재를 강제하지 않는다. 대신 `related_entity_type` 허용값은 규칙 1 대로 한 곳에서 관리한다.

**규칙 3개**
1. `*_type` 의 허용값 목록을 문서와 코드 한 곳에서 관리한다.
2. **쓰기 경로에서 대상 존재를 반드시 검사한다.** DB 가 막아 주지 않으므로 애플리케이션이 막는다.
3. 주기적 무결성 점검(고아 참조 탐지)을 운영 작업으로 둔다.

### 17.5 계산 결과의 무결성

| 규칙 | 내용 |
| --- | --- |
| I-1 | `cost_result.total_amount_krw` = 소속 `cost_line_item.amount_krw` 합 |
| I-2 | `cost_line_link(ATTRIBUTION)` 의 `share_ratio` 합 = 1 (비율을 쓸 때) |
| I-3 | **`message_kind = BUSINESS`** 일 때: `send_attempt.sent_content_hash` = **유효한** `message_approval.approved_content_hash` (15.7.2) |
| **I-3b** | **`message_kind = CONTACT_VERIFICATION`** 일 때: `send_attempt.sent_content_hash` = 그 `comm_message.content_hash`. **승인과 비교하지 않는다** |
| I-4 | `planning_snapshot.contains_simulated` = 담긴 사실에 `is_simulated = true` 가 하나라도 있으면 참 |
| I-5 | `recovery_run`·`assignment`·`risk_assessment`·`cost_result` 의 `contains_simulated` 는 스냅샷에서 전파된다 |
| I-6 | `recovery_run.run_status = INFEASIBLE` 이면 `unmet_constraints` 가 비어 있으면 안 된다 |
| I-7 | `canonical_fact` 전체 삭제 후 `event` 로부터 재계산했을 때 같은 결과가 나와야 한다(재현 테스트) |
| **I-8** | 사건마다 `link_role = SUBJECT` 인 링크가 **정확히 1건**(11.3) |
| **I-9** | `message_kind = BUSINESS` 인 발송 시도는 **유효한 승인**(15.5.1 여섯 조건) 없이 만들 수 없다 |
| **I-10** | `message_kind = CONTACT_VERIFICATION` 인 메시지는 `contact_verification_id` 가 있어야 하고, **승인·구조화 값·질문 연결을 가질 수 없다** |
| **I-11** | 지문은 어느 종류든 **수신자 + 제목 + 본문 + 구조화 값**을 덮는다. 비교 대상만 I-3 / I-3b 로 갈린다 |
| **I-15** | 충돌은 **같은 적용 범위** 안의 사건들 사이에서만 만든다(11.5.1) |
| **I-16** | `verification_request` · `question_item` 은 **대상 적용 범위**를 갖는다. `request_key` 재료에도 범위가 들어간다(11.6.1 · 11.7.2 · 15.2.1) |
| **I-17** | 무효화 행(`REVOKED`·`INVALIDATED`)은 **같은 메시지의 `APPROVED` 행**을 가리키고, 한 승인당 최대 1건이다(15.5.0) |
| **I-12** | 과거 `planning_snapshot` 하나로 **사실 + 계획 조건 + 마스터 기본값 + 요율·정책 판 + 당시 상태 6차원**을 모두 복원할 수 있어야 한다. 특히 **"그때 왜 승인 가능했나(없었나)"** 를 `decision_usability` 사본으로 설명할 수 있어야 한다 (rev.2.3 확장, 13.2.1) |
| **I-13** | `event` 에 근거 강도(Evidence Strength) 컬럼이 없다. 정책 판이 바뀌어도 같은 사건 집합으로 재계산된다 |
| **I-14** | `operator_planning_constraint` 와 `message_approval` 에 UPDATE 경로가 없다. 해제·무효화는 새 행이다 |
| **I-18** | `send_attempt` · `extraction` 의 **불변 부분**은 UPDATE 되지 않고, 결과·검토 컬럼은 **한 방향으로 한 번만** 채워진다(15.7.3 · 15.9.1) — rev.2.2. **예외 하나: `send_attempt.result = UNKNOWN` 은 화해가 `SUCCESS` · `RETRYABLE_FAILURE` 로 한 번 더 바꾼다**(rev.2.5). `comm_message.sent_at` · `comm_thread.external_thread_id` 는 `NULL` → 값 한 번(rev.2.5) |
| **I-19** | `system_error` 는 **현재 사실·계산 결과·승인·발송 판정의 입력이 아니다.** 오류 기록이 `event`·`canonical_fact`·Activity Timeline 으로 흘러가지 않는다(16.2a) — rev.2.2 |
| **I-20** | `system_error` 에 **비밀값·토큰·원문 본문·전체 스택 트레이스를 넣지 않는다.** 필요하면 `raw_log_ref` 참조만 둔다(`docs/23` 4.4) — rev.2.2 |
| **I-21** | **`event_class` 별 필수 조합**이 지켜진다(11.2 규칙 5). `VERIFICATION` 은 사실 키·값을 갖지 않고 `TARGET` 1건 이상을 갖는다 — rev.2.3 |
| **I-22** | **`value_status = CONFIRMED` 는 `verification_basis` 없이 설 수 없다.** 계획 승인(`plan_decision`)은 어떤 경우에도 `verification_basis` 가 되지 않는다(A-17) — rev.2.3 |
| **I-23** | `extraction_method = LLM_EXTRACTED` 이면 `extraction_id` 가 **NOT NULL** 이다. 반대로 `extraction_id` 가 있으면 `extraction_method` 는 `LLM_EXTRACTED` 다 — rev.2.3 |
| **I-24** | `decision_usability` 는 **네 차원 + 사실 중요도 정책에서 유도된다.** `(네 차원, `rule_version`, 중요도 정책 판)` 이 같으면 **항상 같은 값**이 나와야 한다(R11, 결정론). 저장하지만 원천이 아니다 — rev.2.3 |
| **I-25** | **같은 논리 주장은 사건이 하나다.** `event.idempotency_key` 는 적용 범위와 주장 위치를 재료에 포함한다(11.2d) — rev.2.3 |
| **I-26** | **한 확인 사건의 모든 대상은 같은 현재 사실 좌표**(SUBJECT + `fact_key` + 적용 범위) 안에 있고, **확인 사건 자신의 SUBJECT·적용 범위도 그 좌표와 같다**(11.2a 규칙 7·8 · 11.2a.1) — rev.2.3 |
| **I-27** | 과거 `planning_snapshot` 만으로 **그때의 `decision_usability` 판정을 재현**할 수 있다. 네 차원 사본 + `rule_version` 사본 + 스냅샷의 `policy_version` 이 모두 얼려져 있다(13.2.1) — rev.2.3 |
| **I-28** | 메일의 `source_recorded_at` 은 **채널 수신 시각보다 늦을 수 없다.** `Date` 가 없거나 파싱되지 않거나 채널 수신 시각보다 미래면 채널 수신 시각을 쓰고 `date_header_rejected` 를 남긴다. 원래 두 시각은 `payload` 에 있다(11.2e · Q-44) — rev.2.4 |
| **I-29** | **민감한 내용은 기록 행의 컬럼에 직접 들어가지 않는다.** 원문·메시지 제목·본문·승인 문장·추출 인용·제안 조건 원문은 참조(`*_ref`) + 지문으로만 기록에 붙는다(29.1 · 안티패턴 11) — rev.2.4 |
| **I-30** | **파기는 기록 행을 `DELETE`·`UPDATE` 하지 않는다.** 참조와 지문은 파기 뒤에도 그대로 남고, 참조가 가리키던 내용만 "파기됨"이 된다(29.3) — rev.2.4 |
| **I-31** | **진행 중인 흐름이 쓰는 내용은 파기하지 않는다**(29.7 — 미처리 원문 · `PENDING` 추출 · 미발송 업무 메시지 · 유효한 승인 · 열린 확인 요청의 인용 · 유효한 제안) — rev.2.4 |
| **I-32** | **모든 파기는 `audit_log` 에 남는다**(`CONTENT_PURGED` · 내용 범주 · 기록 id · 보관 정책 판 · 주체 · 결과). **파기된 내용은 감사 기록에 복사하지 않는다**(29.8) — rev.2.4 |
| **I-33** | 원문·내용이 파기돼도 **I-7(재계산) · I-12 · I-27(스냅샷 재현) · 감사 · 승인/발송 지문 대조가 성립한다.** 파기로 잃는 것은 **원문 재추출 능력뿐**이다(29.9) — rev.2.4 |
| **I-35** | `applicability_scope_type = RECOVERY_CONTEXT`(및 계획 조건의 `scope_type = RECOVERY_CONTEXT`)인 범위 참조는 **존재하는 뿌리 `recovery_run` id**(`previous_run_id` 가 빈 실행)다. 쓰기 경로에서 검사한다 — L-13 (2026-09-21) |
| **I-36** | **같은 사고의 재계산은 `previous_run_id` 를 이어받는다.** 한 실행의 복구 맥락 = 그 실행 계보의 뿌리. 이어받지 않은 실행은 새 맥락을 연다 — L-13 (2026-09-21) |
| **I-34** | **내용 부재는 성공한 `CONTENT_PURGED` 감사가 있을 때만 정상 파기다.** 감사 없는 부재는 **데이터 손실**, 감사가 성공인데 내용이 남아 있으면 **파기 불일치**이며 둘 다 `system_error` 대상이다. 파기는 부모 기록·참조·지문을 바꾸지 않고, `SUCCESS` 감사는 **내용 제거를 확인한 뒤에만** 남긴다(29.8 · 29.8.1) — rev.2.4 |

---

## 18. 코드값(CODE) 처리 정책

**DB enum 타입을 쓰지 않는다.** 값이 늘 때마다 스키마 변경이 필요하고, 제품마다 동작이 다르다.

| 성격 | 처리 | 예 |
| --- | --- | --- |
| **거의 바뀌지 않고 로직이 의존** | 문자열 컬럼 + 애플리케이션 상수 + 체크 제약(선택) | `direction` · `fact_kind` · `link_role` · `enforcement` · **`event_class`** · **`verification_action`** · **`verification_method`** · **`target_role`** · **`extraction_method`** · **`value_status`** · **`conflict_status`** · **`hold_status`** · **`decision_usability`** · **`verification_basis`** · **`input_confidence_level`** (rev.2.3) |
| **업무가 늘리는 값** | **코드 테이블**(`code_group`, `code_value`, 표시명, 정렬, 활성) | `cost_type` · `facility_type` · `risk_type` · `question_type` · **`event_type`**(사건 카탈로그가 늘어난다) · **`source_type`** · **`source_role_at_ingestion`** (rev.2.3) |
| **아직 값 목록이 없는 것** | 문자열 컬럼 + **`OPEN` 표시**. 임의로 확정하지 않는다 | **`plan_decision.decision_type`** · **`payload.change_reason`**(Q-34) |
| **규칙 식별자** | 문자열. 규칙 문서가 정본 | `applied_rule`(R1~R12) · `trigger_rule` |

> 코드 테이블 자체는 **논리 테이블 수에 넣지 않았다**. 물리 설계에서 한 벌(`code_group`/`code_value`)로 만들지, 값별 테이블로 만들지 정한다.

---

## 19. 논리 ERD (주요 흐름)

```
[raw_input] 1──N [event] ──N [event_entity_link] N── (container / bl / facility / counterparty / truck_pool)
                   │  └─ supersedes ──┐          (CORRECTION)
                   │                  ▼
                   │              [event]
                   │  └─ [event_verification_target] ──> [event]   (VERIFICATION: TARGET / OVERRULED)
                   ├──N──> [canonical_fact]  (파생·물질화, PK = 개체 + 사실키 + 적용범위 + 시뮬)
                   │            │
                   │            ├──> [conflict]
                   │            └──> [verification_request] ──request_key──> [verification_request_handling]
                   │
                   └──> [planning_snapshot] 1──N [planning_snapshot_fact]        (사실 값 복사)
                                 │        1──N [planning_snapshot_constraint]  (계획 조건 복사)
                                 │        1──N [planning_snapshot_input]       (마스터·요율·정책 복사)
                                 ▼
        [operator_planning_constraint] ──입력──> [recovery_run] 1──N [assignment]
          └─ action=RELEASE ─> 자기 자신 (해제도 새 행)
                                 │                    │
                                 │                    ├──> [risk_assessment]
                                 │                    ├──> [cost_result] 1──N [cost_line_item] 1──N [cost_line_link]
                                 │                    └──> [plan_decision]   (사람의 결정, A-16)
                                 │
[contract] 1──N [tariff_rule] ───┘ (요율 근거)

[counterparty] 1──N [counterparty_contact] 1──N [contact_channel_address] 1──N [contact_verification]
                                                      │
[channel_connection]                                  ▼
[comm_thread] 1──N [question_item]          (발송 자격 판정)
      │  └──N [comm_message] ──N [comm_message_question] N── [question_item]
      │              ├──N [comm_message_structured_field]      (숫자 + 출처)
      │              ├──N [message_approval] (A-17) ──1──N [message_approval_structured_field]
      │              │         │                    └──1──N [send_attempt]   (업무 메시지면 승인 필수)
      │              │         └─ invalidates_approval_id ─> 자기 자신 (무효화도 새 행)
      │              ├──N [message_status_transition]
      │              ├── message_kind = CONTACT_VERIFICATION ──> [contact_verification]
      │              └──N [extraction] ──ask_id──> [question_item]
      │                        └── created_event_id ──> [event]
      │
[commercial_offer] 1──N [commercial_offer_item] ── created_event_id ──> [event]

[actor] ──> 모든 결정·승인·감사 기록      [audit_log]      [scenario] ──> is_simulated 자산

[system_error] ··(다형, DB FK 없음)··> comm_message / send_attempt / recovery_run / raw_input / extraction …
               (기술 운영 기록. 위 어느 흐름의 입력도 아니다 — 16.2a)
```

**읽는 법 4가지**
1. **모든 사실은 `event` 에서 나간다.** 사건 하나에 **주체 하나**(11.3).
2. **계산 산출물은 스냅샷을 통해서만 입력에 닿는다.** 현재 사실·계획 조건·마스터를 직접 보지 않는다 — **전부 복사해 얼린다**.
3. **사람의 결정은 계산 산출물 옆에 따로 쌓인다.** 계산 결과를 고치지 않는다.
4. **되돌리기(해제·무효화)도 새 행이다.** 결정 기록(`message_approval` · `operator_planning_constraint` · `plan_decision`)에는 `UPDATE` 로 상태를 바꾸는 곳이 없다. `UPDATE` 가 있는 표는 **정해진 컬럼만, 한 방향으로** 바뀌며 표마다 명시돼 있다(1.3).
5. **`system_error` 는 옆에 붙은 관측 기록이다.** 사실·계산·승인 흐름으로 들어가지 않는다(rev.2.2).

---

## 20. 시뮬레이션·실제 분리 규칙

| 규칙 | 내용 |
| --- | --- |
| S-1 | 시뮬레이션 전용 테이블을 만들지 않는다. 같은 테이블 + `is_simulated` |
| S-2 | `is_simulated = true` 인 행은 `scenario_id` 를 가진다. `false` 면 비어 있어야 한다 |
| S-3 | **모든 운영 조회는 `is_simulated = false` 를 건다.** 기본 조건이 빠진 조회는 리뷰에서 막는다 |
| S-4 | `canonical_fact` 의 PK 에 `is_simulated` 가 들어간다. 실제와 시뮬레이션이 같은 슬롯을 다투지 않는다 |
| S-5 | 계산 산출물은 `contains_simulated` 로 전파하고 **화면에 표시한다** |
| S-6 | 시뮬레이션 데이터로 **실제 외부 발송을 하지 않는다**. Mock 채널만 쓴다 |
| S-7 | `result_kind = SCENARIO_RESULT` 표기는 화면·API 계약의 몫이고, 저장 쪽 근거는 `is_simulated`·`contains_simulated` 다 |

`is_simulated` 를 갖는 테이블: `container` · `bl` · `raw_input` · `event` · `canonical_fact` · `conflict` · `verification_request` · `verification_request_handling` · `commercial_offer` · `commercial_offer_item` · `comm_thread` · `question_item` · `comm_message` · `send_attempt` · `message_status_transition` · `extraction` · `audit_log` · **`system_error`**(rev.2.2).
`contains_simulated` 를 갖는 테이블: `planning_snapshot` · `recovery_run` · `assignment` · `risk_assessment` · `cost_result`.
스냅샷의 자식 표(`planning_snapshot_fact` · `planning_snapshot_constraint` · `planning_snapshot_input`)와 승인·메시지의 자식 표(`comm_message_structured_field` · `message_approval_structured_field`), 그리고 사건의 자식 표(`event_entity_link` · **`event_verification_target`**, rev.2.3)는 **부모에서 판정이 정해지므로 플래그를 따로 두지 않는다.**

> **`verification_request_handling` 이 스스로 `is_simulated` 를 갖는 것과 왜 다른가**(11.7): 그쪽 부모(`verification_request`)는 `DERIVED_MATERIALIZED` 라 **재생성으로 사라질 수 있다.** `event` 는 `SOURCE_OF_TRUTH` · `APPEND_ONLY` 라 사라지지 않으므로 자식이 스스로 들 필요가 없다.

---

## 21. 저장하지 않고 조회로 만드는 것

| 파생 | 어떻게 만드나 | 캐시 테이블? |
| --- | --- | --- |
| **단계(Phase)** | 컨테이너의 마일스톤·상태 사실 조합 규칙 | 필요해지면 `container_phase_cache`(재생성 가능, `DERIVED_MATERIALIZED`). **지금은 만들지 않는다** |
| **Activity Timeline** | `event` + `message_status_transition` + `plan_decision` + `message_approval` + `audit_log` 를 시각순 결합. **`system_error` 는 섞지 않는다**(운영자의 업무 타임라인이 아니라 기술 운영 기록이다. 발송 실패는 `message_status_transition` 으로 이미 보인다) | 아니다 |
| **예외 목록** | 위험 평가 + 수용량 사실 + 마감 규칙 | **아니다.** D-5 CLOSED FOR MVP — 표를 만들지 않는다(16.4) |
| **현재 계획** | `plan_decision` 중 마지막 유효 결정 → 그 `run_id` 의 `assignment` | 아니다 |
| **Impacts (자원 영향)** | 배정 합계 대비 가용량 | 아니다 |
| **거래처 발송 가능 여부** | 주소 3상태 AND + 거래처 활성 | 아니다 (조회 시 판정) |
| **내용이 파기됐는가** (rev.2.4) | **내용 존재 여부 × `audit_log` 의 `CONTENT_PURGED` · `SUCCESS` 행** — 보관 중 / 정상 파기 / **데이터 손실** / 파기 불일치 (29.8.1) | 아니다. **기록 행에 파기 표시 컬럼을 두지 않는다** — 두면 불변 규칙을 깬다 |

> **캐시를 만들 때의 유일한 조건**: 지우고 다시 만들어도 같아야 한다. 그렇지 않으면 그것은 캐시가 아니라 원본이고, 원본은 `event` 에만 있어야 한다.

---

## 22. 적용 범위(Scope)와 유효 기간(Validity)은 다른 축이다 **(rev.2 신규)**

이 절이 이번 rev.2 에서 가장 중요한 수정이다.

### 22.1 두 질문은 다르다

| 축 | 묻는 것 | 컬럼 |
| --- | --- | --- |
| **유효 기간 (Validity)** | **언제까지** 적용되나 | `valid_from` · `valid_until` |
| **적용 대상 범위 (Applicability Scope)** | **무엇에** 적용되나 | `applicability_scope_type` · `applicability_scope_ref` |

rev.1 은 기간만 두고 **범위는 "사실의 주체로 정해진다"고 봤다.** 그것이 틀렸다. 주체가 창고 B 라는 것은 **"창고 B 에 관한 이야기"라는 뜻**일 뿐, "창고 B 의 모든 건에 적용된다"는 뜻이 아니다.

```
운영자 입력: "Warehouse B 는 이번 건 보관료 0원"

주체    = 창고 B          ← 네 해석 모두 같다
fact_key = storage.rate   ← 네 해석 모두 같다

해석 ①  이번 복구 맥락에만       ← 운영자가 실제로 뜻한 것
해석 ②  A 계약 건에만
해석 ③  이 컨테이너에만
해석 ④  창고 B 의 모든 건에 계속  ← rev.1 구조가 조용히 선택하던 것
```

**한 번 입력한 "0원"이 시설 전체의 영구 요율처럼 조용히 퍼지면 안 된다.** 운영자는 이번 건 이야기를 했는데 CERA 가 다음 달 계산까지 0원으로 하고 있으면, 그 잘못은 화면에 드러나지도 않는다.

### 22.2 안전한 기본값은 좁은 쪽이다 (**D-3 결정**)

| | 기본값 | 넓히려면 |
| --- | --- | --- |
| 운영자 직접 입력 요율·상업 조건 (TERM 사건) | **현재 복구 맥락** | 운영자가 **명시적으로** 기간·계약·대상을 고른다 |
| 운영자 계획 조건 (`operator_planning_constraint`) | **현재 복구 맥락** | 같다 |

**왜 좁은 쪽인가.** 두 가지 실수의 값이 다르다.

| 실수 | 결과 |
| --- | --- |
| 범위를 **좁게** 잡았는데 사실은 계속 적용돼야 했다 | 다음 계산에서 운영자가 **다시 입력한다.** 귀찮다 |
| 범위를 **넓게** 잡았는데 사실은 이번만이었다 | 다음 사고에서 **틀린 요율·틀린 제약으로 계산**한다. 아무도 눈치채지 못한다 |

귀찮은 쪽이 낫다. 그리고 **틀린 계산은 조용하다** — 이것이 결정적이다.

### 22.3 두 개념은 같은 범위 구조를 공유하지 않아도 된다

**운영자 계획 조건**과 **운영자 입력 요율**은 성격이 다르다.

| | 계획 조건 | 입력 요율·상업 조건 |
| --- | --- | --- |
| 무엇인가 | **현실 사실이 아니다.** 계산에 건 조건 | **사실이다.** 출처가 있는 상업 조건 |
| 어디 사나 | `operator_planning_constraint` | `event` → `canonical_fact` |
| 범위의 뜻 | "이 계산에 이 조건을 건다" | "이 요율이 이 대상에 적용된다" |
| 범위 컬럼 | `scope_type` · `scope_ref` | `applicability_scope_type` · `applicability_scope_ref` |

**컬럼 이름을 일부러 다르게 뒀다.** 값 목록이 겹칠 수는 있지만, 억지로 하나의 구조로 합치면 "계획 조건인데 사실처럼 보이는 것"이 생긴다. 그것이 개념 모델이 가장 경계한 오염이다(E-37).

### 22.4 아직 정하지 않은 것

- **복구 맥락의 식별자**가 무엇인가 → **L-13**
- `applicability_scope_type` 의 **값 목록** → **L-14**. 지금 확정한 것은 **기본값이 `RECOVERY_CONTEXT` 라는 것** 하나다

> enum 을 지금 과하게 확정하지 않는다. 현업이 실제로 쓰는 범위가 확인되기 전에 닫으면 안 맞는 칸이 생긴다.


### 22.5 적용 범위 전파 점검표 **(rev.2.1 · rev.2.3 에서 한 줄 추가)**

**원칙**: 현재 사실의 식별자에 적용 범위가 들어갔으므로, **그 사실을 만들고·확인하고·충돌 판정하고·질문하고·얼리는 경로 어디에서도 범위가 조용히 사라지면 안 된다.** 반대로 필요 없는 곳에 컬럼을 복제하지도 않는다.

**범위를 갖는 것 (9곳 — rev.2.3 에서 8 → 9)**

| 어디 | 컬럼 | 왜 필요한가 |
| --- | --- | --- |
| `event` | `applicability_scope_type` · `applicability_scope_ref` | **범위가 처음 정해지는 곳.** 사실 주장과 함께 들어온다 |
| **`event.idempotency_key`** | **재료에 포함** (rev.2.3) | 안 넣으면 `GLOBAL` 주장과 `RECOVERY_CONTEXT` 주장이 **같은 키**가 되어 나중 것이 조용히 버려진다(11.2d · 27.11) |
| `canonical_fact` | 같은 2컬럼, **PK 에 포함** | 범위가 다르면 서로 다른 사실이고 공존해야 한다(11.4.1) |
| `conflict` | 같은 2컬럼 | 범위가 다른 사건은 **다투는 것이 아니다**(11.5.1) |
| `verification_request` | 같은 2컬럼 | "평소 얼마" 와 "이번 건 얼마" 는 **다른 확인 문제**다(11.6.1) |
| `request_key` | 재료에 포함 | 안 넣으면 두 확인 요청이 같은 키를 갖는다(11.7.2) |
| `question_item` | `target_applicability_scope_*` | 회신을 사건으로 만들 때 **Backend 가 범위를 알아야 한다**(15.2.1) |
| `planning_snapshot_fact` | 같은 2컬럼, **PK 에 포함** | **어느 범위의 사실로 계산했는지**까지 얼려야 재현된다 |
| `operator_planning_constraint` | `scope_type` · `scope_ref` | 계획 조건의 범위. **사실이 아니므로 컬럼 이름을 따로 쓴다**(22.3) |

**범위를 갖지 않는 것과 그 이유**

| 어디 | 왜 필요 없는가 |
| --- | --- |
| `raw_input` | **수집 기록**이다. 한 번의 수집에서 범위가 다른 사실이 여러 개 나올 수 있다. 범위는 사건 단위로 정해진다 |
| `extraction` | **후보 값 + 원문 인용**까지가 전부다. 범위는 `ask_id` → `question_item` 으로 이미 정해져 있으므로 여기서 다시 들고 있을 이유가 없다. **LLM 이 범위를 만지지 않는다는 경계가 여기서 지켜진다** |
| `commercial_offer` · `commercial_offer_item` | **근거(Evidence)** 다. 제안 자체에는 유효 기간과 조건이 있고, **범위는 그 제안이 사건이 될 때**(`created_event_id`) 정해진다. 근거에 범위를 박으면 "누가 무엇을 제안했나" 와 "그것이 어디에 적용되나" 가 섞인다 |
| `planning_snapshot_constraint` | 부모 `operator_planning_constraint` 의 `scope_type` · `scope_ref` 를 **값으로 복사**한다. 이름이 다를 뿐 범위를 이미 갖고 있다 |
| `event_entity_link` | 사건의 **대상**을 가리킬 뿐이다. 범위는 사건에 있다 |
| `verification_request_handling` | **사람의 행동 기록**이다. 범위는 `request_key` 가 이미 구분한다 |
| `comm_message` · `message_approval` · `send_attempt` | **통신·승인**이지 사실이 아니다. 범위는 실려 나간 `question_item` 에 있다 |
| `risk_assessment` · `cost_result` · `cost_line_item` | **계산 결과**다. 어느 범위의 사실을 썼는지는 `planning_snapshot_fact` 에 남는다 |
| `tariff_rule` · `contract` | 계약·요율 규칙은 **`applies_to` 와 유효 기간**으로 적용 대상을 표현한다. 사실의 범위 축과 다른 것이다 |
| 마스터 표 전부 | 등록 정보다. 범위 개념이 없다 |
| `system_error` | **기술 운영 기록**이다. 사실이 아니므로 적용 범위가 없다(rev.2.2) |

**두 경로를 끝까지 따라가 본 결과**

```
운영자 입력 → event(scope=RECOVERY_CONTEXT) → canonical_fact(scope PK) → planning_snapshot_fact(scope PK) → 계산
                                              └→ conflict(같은 범위끼리만) → verification_request(scope) → request_key(scope 포함)

질문 생성 → question_item(target scope 확정) → comm_message → 회신 → extraction(ask_id) → event(scope = 질문의 scope) → canonical_fact
```

**두 경로 어디에서도 범위가 끊기지 않는다.** 그리고 **LLM 은 `ask_id` + 값 + 단위 + 인용까지만** 내고, 범위는 질문을 만든 Backend 가 이미 정해 둔 것을 그대로 쓴다(ADR-026).

---

## 23. 개념 → 테이블 추적표 (승인된 E-01 ~ E-39 전부)

| 개념 | 테이블 | 분류 |
| --- | --- | --- |
| E-01 Container | `container` | MASTER |
| E-02 BL | `bl` (+ `container_bl`) | MASTER |
| E-03 Facility | `facility` | MASTER |
| E-03a Warehouse | `facility_warehouse` | MASTER |
| E-03b Terminal | `facility_terminal` | MASTER |
| E-03c ODCY | `facility_odcy` | MASTER |
| E-04 Counterparty | `counterparty` | MASTER |
| E-05 Contact | `counterparty_contact` | MASTER |
| E-06 ChannelAddress | `contact_channel_address` | MASTER |
| E-07 ContactVerification | `contact_verification` | SOURCE_OF_TRUTH |
| E-08 TruckPool | `truck_pool` | MASTER |
| E-09 Contract | `contract` | MASTER |
| E-10 TariffRule | `tariff_rule` | MASTER (판 교체) |
| E-11 Event | `event` (+ `event_entity_link` + **`event_verification_target`**) | SOURCE_OF_TRUTH |
| E-12 RawInput | `raw_input` | SOURCE_OF_TRUTH |
| E-13 CanonicalFact | `canonical_fact` | DERIVED_MATERIALIZED |
| E-14 Conflict | `conflict` | DERIVED_MATERIALIZED |
| E-15 VerificationRequest | `verification_request` | DERIVED_MATERIALIZED |
| E-16 VerificationRequestHandling | `verification_request_handling` | DECISION_RECORD |
| E-17 PlanningSnapshot | `planning_snapshot` (+ `planning_snapshot_fact` · `planning_snapshot_constraint` · `planning_snapshot_input`) | PERSISTED_OUTPUT |
| E-18 RecoveryRun | `recovery_run` | PERSISTED_OUTPUT |
| E-19 Assignment | `assignment` | PERSISTED_OUTPUT |
| E-20 PlanDecision | `plan_decision` | DECISION_RECORD |
| E-21 RiskAssessment | `risk_assessment` | PERSISTED_OUTPUT |
| E-22 CostResult | `cost_result` | PERSISTED_OUTPUT |
| E-23 CostLineItem | `cost_line_item` (+ `cost_line_link`) | PERSISTED_OUTPUT |
| E-24 CommThread | `comm_thread` | SOURCE_OF_TRUTH |
| E-25 QuestionItem | `question_item` (+ `comm_message_question`) | SOURCE_OF_TRUTH |
| E-26 CommMessage | `comm_message` (+ `comm_message_structured_field`) | SOURCE_OF_TRUTH |
| E-27 MessageApproval | `message_approval` (+ `message_approval_structured_field`) | DECISION_RECORD |
| E-28 MessageStatusTransition | `message_status_transition` | SOURCE_OF_TRUTH |
| E-29 Extraction | `extraction` | EVIDENCE |
| E-30 ChannelConnection | `channel_connection` | MASTER (메타만) |
| E-31 Actor | `actor` | MASTER |
| E-32 AuditLog | `audit_log` | SOURCE_OF_TRUTH |
| E-33 Scenario | `scenario` | SIMULATION_ONLY |
| E-34 RateQuote / CommercialOffer | `commercial_offer` (+ `commercial_offer_item`) | EVIDENCE — **D-2 CLOSED: 만든다** |
| E-35 OperationalPlan Aggregate | **만들지 않음** (`raw_input` 이 대신한다) | — **D-4 CLOSED** |
| E-36 ExceptionCase | **만들지 않음** (파생 조회) | — **D-5 CLOSED FOR MVP** |
| E-37 OperatorPlanningConstraint | `operator_planning_constraint` | DECISION_RECORD |
| E-38 VesselCall | `vessel_call` (구조만, Next) | MASTER |
| E-39 Truck | **만들지 않음** (Q-57) | — |

**개념에 1:1 로 대응하지 않는 테이블 15개** (rev.2.3) — 14개는 새 개념이 아니라 **관계·시도·속성 묶음·값 고정의 구현**이고, 1개(`system_error`)는 **개념 모델 밖의 기술 운영 표**다.

| 테이블 | 무엇의 구현인가 |
| --- | --- |
| `container_bl` | Container ↔ BL 관계 (L-2) |
| **`event_verification_target`** | **확인 사건(`docs/21` 9절의 VERIFICATION 부류)이 어느 사건을 가리키나** (rev.2.3). 새 개념이 아니라 이미 승인된 사건 부류의 관계다 |
| `comm_message_question` | CommMessage ↔ QuestionItem N:M 관계 |
| `send_attempt` | CommMessage 의 발송 **시도** (L-7) |
| `external_identifier` | `EXTERNAL_REFERENCE` 속성 묶음 (Q-54) |
| `cost_line_link` | CostLineItem 의 귀속·근거 관계 (Q-60) |
| `planning_snapshot_fact` | PlanningSnapshot 이 담는 사실 |
| **`planning_snapshot_constraint`** | PlanningSnapshot 이 담는 **계획 조건 사본** (rev.2) |
| **`planning_snapshot_input`** | PlanningSnapshot 이 담는 **마스터·요율·정책 입력** (rev.2) |
| **`comm_message_structured_field`** | CommMessage 의 **구조화 값**(숫자) (rev.2) |
| **`message_approval_structured_field`** | MessageApproval 이 얼린 **구조화 값 사본** (rev.2) |
| `facility_*` 상세 3개 | Facility 하위 종류 (Q-55) |
| **`system_error`** | **개념 모델 밖 — 기술 운영(관측성) 표** (rev.2.2). 업무 도메인 개념이 아니므로 `docs/21` 을 다시 열지 않는다. 근거·행동 규칙은 `docs/23` |

> **개념 모델 확장이 필요한가?** 아니다. `docs/21` 은 "CERA 업무에 무엇이 존재하는가"를 다루고, `system_error` 는 "CERA 프로그램이 어떻게 실패했는가"를 다룬다. 업무 흐름(사실 → 계산 → 승인 → 발송)의 어느 개념도 이 표에 의존하지 않는다(I-19). 만약 나중에 오류 대응 자체가 업무 기능(담당 배정·종결·SLA)이 되면 그때 개념 모델 확장을 검토한다.

---

### 23.1 `docs/05` 4.2 Event 필드 → 논리 모델 대응표 **(rev.2.3 신규 · 누락 0건)**

**왜 이 표가 정본 대조인가.** 승인된 `docs/21` 7절이 Event 의 속성을 스스로 정의하지 않고 이렇게 위임한다:

> `| Event | (필드 24개) | `docs/05` 4.2가 정본 | — | **불변** | — | 어댑터·출처 |`

따라서 4.2 에 있는데 여기에 대응이 없으면 그것은 "옛 문서와의 차이"가 아니라 **승인된 개념의 누락**이다. rev.2.2 까지 그런 칸이 13개 있었다.

판정: **SAME**(같은 이름) · **RENAMED**(이름만 다름) · **SPLIT**(여러 컬럼·표로 나뉨) · **MOVED**(다른 표로) · **NOT STORED**(저장하지 않는 것이 정본의 결정)

| # | `docs/05` 4.2 필드 | `docs/22` 대응 | 판정 | 근거 |
| --- | --- | --- | --- | --- |
| 1 | `event_id` | `event.event_id` | SAME | 정렬 가능 요구도 같다 |
| 2 | `schema_version` | `event.schema_version` | SAME | **rev.2.3 복구** — 11.2d |
| 3 | `event_class` | `event.event_class` | SAME | **rev.2.3 복구** — 11.2a |
| 4 | `event_type` | `event.event_type` | SAME | **rev.2.3 복구** — 11.2d |
| 5 | `entity_type` | `event_entity_link.entity_type` (`SUBJECT`) | MOVED | 11.3. 주체는 정확히 1건(I-8) |
| 6 | `entity_id` | `event_entity_link.entity_id` (`SUBJECT`) | MOVED | 같음 |
| 7 | `fact_key` | `event.fact_key` | SAME | 문자열 그대로 보존(Q-63) |
| 8 | `value` | `value_text` · `value_number` · `value_timestamp` · `value_code` + `value_unit` | SPLIT | 타입별 컬럼. 11.2 규칙 5 |
| 9 | `payload` | `event.payload` | SAME | **rev.2.3 복구** — 부가 속성만(11.2d) |
| 10 | `related_entity_ids` | `event_entity_link` 의 `link_role = CONTEXT` 행들 | MOVED | 11.3 |
| 11 | `source_type` | `event.source_type` | SAME | **rev.2.3 이름·값 복구**(옛 `source_kind`) — 11.2c |
| 12 | `source_role` | `event.source_role_at_ingestion` | RENAMED | **수집 시점 값**임을 이름에 남겼다 |
| 13 | `source_org` | `event.asserted_by_counterparty_id` | RENAMED | 조직을 문자열이 아니라 거래처 참조로 |
| 14 | `source_id` | `event.source_id` (+ `entered_by_actor_id`) | SPLIT | **rev.2.3 복구.** 채널 안의 주체 식별자와 CERA 사용자 참조를 나눴다 — 11.2c |
| 15 | `source_event_time` | `event.source_event_time` | SAME | |
| 16 | `source_recorded_at` | `event.source_recorded_at` | SAME | 메일은 **Q-44 결정(rev.2.4)** 으로 고른다. 원래 두 시각은 `payload` — 11.2e |
| 17 | `received_at` | `event.received_at` | SAME | |
| 18 | `recorded_at` | `event.recorded_at` | SAME | |
| 19 | `confidence` | `event.input_confidence_level` + `input_confidence_reasons` | SPLIT · RENAMED | **rev.2.3 복구.** 이름을 바꾼 이유는 11.2b |
| 20 | `extraction` | `event.extraction_method` + `event.extraction_id` → `extraction` 표 | SPLIT | **rev.2.3 복구.** 방식은 모든 경로에, 상세는 LLM 경로에만 — 11.2c · 15.9 |
| 21 | `supersedes_event_id` | `event.supersedes_event_id` | SAME | `CORRECTION` 필수 |
| 22 | `target_event_ids` | `event_verification_target` (`target_role = TARGET`) | MOVED | **rev.2.3 복구** — 11.2a |
| 23 | `verification_action` | `event.verification_action` | SAME | **rev.2.3 복구** |
| 24 | `verification_method` | `event.verification_method` | SAME | **rev.2.3 복구** |
| 25 | `overruled_event_ids` | `event_verification_target` (`target_role = OVERRULED`) | MOVED | **rev.2.3 복구** |
| 26 | `correlation_id` | `event.correlation_id` | SAME | **rev.2.3 복구.** `trace_id` 와 다름(`docs/23` 5절) |
| 27 | `raw_ref` | `event.raw_input_id` | RENAMED | FK 로 표현 |
| 28 | `idempotency_key` | `event.idempotency_key` (UNIQUE) | SAME (**재료 확장**) | **rev.2.3 복구.** 적용 범위·주장 위치를 더했다 — 11.2d |
| 29 | `is_simulated` | `event.is_simulated` (+ `scenario_id`) | SAME | S-2 |

**`docs/05` 4.2 가 "저장하지 않는다"고 정한 것** — 여기에도 없는 것이 맞다.

| 필드 | 왜 저장하지 않나 | 대신 어디에 |
| --- | --- | --- |
| `freshness` | `as_of` 마다 달라진다. 저장하면 불변·재현성이 깨진다 | `canonical_fact.freshness_status`(파생) |
| `verification_status`(사건 수준) | 확인은 나중에 일어난다 | `event_verification_target` 에서 **계산**(`docs/05` 6.1) |
| `verified_by` | VERIFICATION 사건의 주체가 곧 확인자다 | `event.entered_by_actor_id` |
| `container_id` | `entity_id` 와 중복 | `event_entity_link` |
| 근거 강도 | 정책 × `as_of` 의 계산 결과 | `canonical_fact.evidence_strength`(I-13) |

**`docs/22` 가 더 가진 것** — `docs/05` 4.2 이후에 승인된 결정에서 왔다. 개념 확장이 아니다.

| 컬럼 | 어디서 왔나 |
| --- | --- |
| `applicability_scope_type` · `applicability_scope_ref` | rev.2 D-3 사용자 결정 (22절) |
| `valid_from` · `valid_until` | L-3b (적용 기간과 범위는 다른 축) |
| `fact_kind` | `docs/05` 2.1 의 사실 종류를 컬럼으로 |
| `input_quality` | rev.2 (11.2b — `confidence` 와 다른 축) |
| `supersede_reason` | 정정 사유를 `payload` 가 아니라 컬럼으로 |
| `scenario_id` | S-2 |

> **누락 0건.** 29개 필드 전부 대응이 있고, 저장하지 않기로 한 5개는 그 결정이 `docs/05` 자신의 것이다.

---

## 24. 문서 간 불일치 (Conceptual Model Issue 아님 — 후속 문서 정리)

승인된 `docs/21` 은 **고치지 않았다**. 아래는 다른 문서와의 표현 차이이며 **T-070 문서 정합성 정리**로 넘긴다.

| # | 문서 | 차이 | 조치 |
| --- | --- | --- | --- |
| **X-10** | `docs/07_backend-architecture.md` | 저장 스키마 설명이 개념 모델 이전 판이다. 논리 테이블 목록과 대조되지 않았다 | T-079 승인 후 `docs/07` 갱신 |
| **X-11** | `docs/13_glossary.md` | `MessageStatusTransition` · `SendAttempt` · `OperatorPlanningConstraint` 의 한/영 표기가 없다 | 용어집 보강 → T-070 |
| **X-12** | `docs/19_external-communication-requirements.md` | 발송 **시도**와 발송 **메시지**를 한 단어로 쓰는 곳이 있다 | 논리 설계 승인 후 용어 통일 → T-070 |
| **X-13** | `docs/04_domain-model.md` | 시설 하위 종류(Warehouse/Terminal/ODCY)의 속성이 마스터 값인지 사실인지 구분이 약하다 | `default_` 접두 규칙 반영 → T-070 |

> **개념 모델 자체의 문제는 발견되지 않았다.** 위 4건은 전부 `docs/21` 이 아니라 **주변 문서**의 표현 차이다.

**X-10 ~ X-13 은 모두 처리됐다 — T-070 DONE (2026-09-18, 커밋 `3b1bda3`).** rev.2.3 에서 확인만 하고 표는 기록으로 남긴다.

| # | 처리 결과 |
| --- | --- |
| X-10 | `docs/07` 4절을 이 문서의 대응표로 교체. 3절의 "Python·FastAPI·SQLite 확정" 표현은 "미결 — `docs/23`" 으로 |
| X-11 | `docs/13` 4.1절에 통신·상업 용어 19개 추가 |
| X-12 | `docs/19` 에서 **문의 메시지**와 **발송 시도**를 용어로 분리 |
| X-13 | `docs/04` 3절에 마스터 기준선 vs 사실 구분, `default_` 접두 규칙 반영 |

> **rev.2.3 에서 새로 발견한 문서 차이는 없다.** 이번에 고친 13개 누락은 주변 문서의 표현 차이가 아니라 **이 문서 자신의 누락**이었고, 전부 이 rev 에서 닫았다(23.1).

---

## 25. 사용자 결정 (5건 — 전부 닫혔다)

**2026-09-17 사용자 + ChatGPT 검토에서 다섯 건 모두 결정됐다.**

| # | 결정 | 상태 |
| --- | --- | --- |
| **D-1** | **`container_bl` 연결 테이블을 유지한다** | **CLOSED** |
| **D-2** | **`commercial_offer` + `commercial_offer_item` 을 MVP 에 만든다** | **CLOSED** |
| **D-3** | **안전한 기본값은 "현재 복구 맥락에만 적용"이다** | **CLOSED** (rev.1 추천에서 **변경됨**) |
| **D-4** | **`operational_plan_batch` 를 MVP 에서 만들지 않는다** | **CLOSED** |
| **D-5** | **`exception_case` 를 MVP 에서 만들지 않는다** | **CLOSED FOR MVP · 나중에 다시 연다** |

### D-1 — Container ↔ B/L 연결 테이블 유지

- MVP 는 FCL 이지만 **LCL·혼재 확장을 구조로 막지 않는다.**
- `container.bl_id` 하나로 시작한 뒤 N:M 으로 바꾸는 것은 **스키마 변경 + 데이터 이관** 비용이 크다.
- 지금은 `link_role = PRIMARY` **1건 제약**으로 FCL 의 단순함을 유지한다.
- **다만 `bl` 자체의 컬럼 구조는 rev.2 에서 바꿨다** — 번호 하나 + 종류 + 부모 참조(8.2).

### D-2 — 제안 묶음을 MVP 에 만든다

- **상대가 언제 무엇을 어떤 조건으로 제안했는지**를 보존하는 **근거(Evidence)** 다.
- **계산에 쓰는 현재 요율의 정본이 아니다.** 계산 정본은 `event`(TERM) → `canonical_fact` 하나다.
- 이중 정본이 생기지 않도록 `commercial_offer_item.created_event_id` 가 다리 역할을 한다.

### D-3 — 기본값은 "현재 복구 맥락" (**rev.1 추천에서 변경**)

rev.1 은 "매번 고르되 UI 기본값은 해제 전까지"를 추천했다. **바꿨다.**

> **"이번 건에서는 ODCY A 를 쓰지 마"가 별도 선택 없이 다음 사고·다음 복구 계획까지 살아남으면 안 된다.**

- 운영자는 범위를 **고를 수 있다.** 다만 **아무것도 고르지 않았을 때의 값**이 좁은 쪽이어야 한다.
- 장기 적용이 필요하면 운영자가 **명시적으로** 기간·계약·대상·해제 전까지를 고른다.
- **계획 조건과 입력 요율은 의미가 달라 같은 범위 구조를 강제로 공유하지 않는다**(22.3).
- 자세한 근거는 **22절**.

### D-4 — 계획 업로드 묶음을 만들지 않는다

```
PLAN 업로드 1회  →  raw_input 1행  →  여러 plan.* 사건 (같은 raw_input_id)
```

- 이 구조로 충분하다. 지금 표를 만들면 `raw_input` 과 의미가 겹친다.
- **다시 검토하는 조건**: 배치 이름 · 배치 상태 · 버전 · 배치 승인 · 묶음 단위 되돌리기/교체.

### D-5 — 예외 Case 를 MVP 에서 만들지 않는다

- 아래 폐쇄 루프에 **필수 테이블이 아니다.**

```
Event → Risk → RecoveryRun → Communication → Reply → Re-run
```

- 현재는 **파생 조회**로 본다.
- **"영원히 필요 없다"는 뜻이 아니다.** 아래가 실제 제품 요구로 올라오면 다시 연다: 담당자 배정 · 예외 건 상태 · 종결 · SLA · Case 단위 협업 · 관련 실행과 문의 전체 묶기.
- 만들 때는 **결정적 `case_key`** 를 쓴다(`verification_request` 와 같은 이유).

### 아직 열려 있는 것 (사용자 결정 대상 아님)

| # | 무엇 | 언제 답하나 |
| --- | --- | --- |
| **L-14** | `applicability_scope_type` 값 목록 | 현업 검증 |
| **L-15** | `message_kind` 값 목록 | 필요해지면 |
| **L-16** | `bl` 의 업무 유일 제약 | 실데이터 확인(T-005·T-006) |
| — | `plan_decision.decision_type` 값 목록 | 물리 설계 |
| **Q-66** | `system_error.error_category` · `error_code` 값 목록 (rev.2.2) | T-069 구현 계획 · 구현 |
| **Q-46** | 상대방이 직접 입력한 구조화 값의 Source 모델 — `source_type` 에 값을 더할지, `actor_type` 축을 신설할지 (rev.2.3) | **권한 모델과 함께.** 11.2c 의 7값은 현재 ADR 기준 정렬이지 영구 확정이 아니다 |
| **Q-34** | `payload.change_reason` 값 목록 (rev.2.3) | T-037 · 인터뷰 |
| **Q-45 (기간)** | 보관 범주별 **실제 보관 기간 숫자** (rev.2.4 — 구조는 CLOSED) | **Pilot 정책** — 고객사 IT · 계약 · 보안·감사 요구 · 개인정보·관련 법률 검토 |

> **C(출처 어휘)는 2026-09-21 사용자 결정으로 닫혔다.** 7값 채택은 **ADR-020 을 따른 것**이고, 값 목록 자체의 현장 적합성은 ADR-020 본문이 "아직 승인되지 않았다"고 적어 둔 그대로 Q-46 에서 계속 본다.

---

## 26. 논리 모델 전체 ≠ 첫 마이그레이션 전체 **(rev.2 신규)**

**MVP 논리 테이블이 52개라고 해서 첫 구현에서 52개를 한꺼번에 만든다는 뜻이 아니다.**

논리 모델은 **전체 지도**다. "이 제품이 다 자랐을 때 데이터가 어떤 모양이어야 하는가"를 그린 것이고, 지금 당장 무엇을 만드는지와는 다른 질문이다.

| 이것은 | 이것이 아니다 |
| --- | --- |
| 전체 구조의 정합성 검증 | 첫 마이그레이션 명세 |
| 나중에 되돌리기 비싼 결정을 지금 피하기 | 지금 52개 표를 만들라는 지시 |
| 어느 표가 무엇의 정본인지 합의 | 구현 순서 |

**첫 구현은 T-069 External Communication Vertical Slice 에 필요한 최소 묶음부터 시작한다.** 그 슬라이스가 실제로 무엇을 건드리는지 보면 대략 이 범위다.

```
거래처·연락처·주소·주소 확인   →  대화·질문 항목·메시지·구조화 값
→  승인(+승인 시점 사본)  →  발송 시도  →  회신  →  추출  →  사건  →  현재 사실
```

계획·최적화·비용·위험 도메인은 그 뒤 슬라이스에서 합류한다.

> **이 문서에서 구현 계획을 쓰지 않는다.** 어느 표를 어느 슬라이스에 넣을지, 어떤 순서로 마이그레이션할지는 **T-069 의 몫**이다. 여기서는 원칙 한 줄만 못 박는다 — **논리 모델 전체를 첫 마이그레이션으로 착각하지 않는다.**

---

## 27. 전체 흐름 검증 (테이블 단위 walkthrough) **(rev.2 신규)**

수정한 논리 모델로 **한 사이클을 실제로 걸어 봤다.** 각 단계에서 네 가지를 물었다 — **어느 표에 INSERT 하나 / UPDATE 가 필요한가 / 정본은 어디인가 / 과거를 재현할 수 있는가.**

### 27.1 예외 발생부터 계획 결정까지

| # | 단계 | INSERT | UPDATE | 정본 |
| --- | --- | --- | --- | --- |
| 1 | 창고 A 가 메일로 "9/18 수용량 8 TEU" 통보 | `raw_input`(`source_record_key` = 메일 id) · `comm_message`(INBOUND · BUSINESS) | 없음 | `raw_input` |
| 2 | 회신에서 값 추출 | `extraction`(후보 + 원문 인용 + **`schema_version`·`input_hash`·`validator_result`**) | 없음 | `extraction`(근거) |
| 3 | 결정론 검증 → 사실로 채택 | `event`(**`event_class = OBSERVATION`** · `event_type = WAREHOUSE_CAPACITY_CHANGED` · STATE · `warehouse.capacity@2026-09-18` = 8 · **`source_type = EMAIL`** · **`extraction_method = LLM_EXTRACTED`** · `input_quality = UNSTRUCTURED` · **`input_confidence_level = MEDIUM`** · `idempotency_key` · `correlation_id` = 스레드) · `event_entity_link`(**SUBJECT = 창고 A, 1건**) | `extraction` **검토 4컬럼**(`ACCEPTED` · `created_event_id`) — 한 번, 15.9.1 | **`event`** |
| 4 | 현재 사실 갱신 | — | `canonical_fact` **재계산 덮어쓰기**. **`value_status = PROVISIONAL`**(메일 LLM · 강도 1) · `freshness_status = FRESH` · `hold_status = NONE` | `event` |
| 5 | 이전 API 값 12 와 충돌 (**같은 범위 `GLOBAL`**) | `conflict`(범위 포함) · `verification_request`(범위 포함, `request_key` = 규칙+주체+사실키+**범위**+**사건 id 집합**) | `canonical_fact.conflict_status = OPEN` → **`decision_usability = APPROVAL_BLOCKED`** | 파생 |
| 6 | 운영자가 확인 요청을 열람 | `verification_request_handling`(ACKNOWLEDGED) | 없음 | **결정 기록** |
| **6a** | **운영자가 창고에 전화해 8 이 맞다고 확인** | **`event`(`event_class = VERIFICATION` · `verification_action = CONFIRM` · `verification_method = REQUEST_RESOLUTION` · `source_type = HUMAN_UI` · `extraction_method = DIRECT` · **사실 키·값 없음**)** · `event_entity_link`(SUBJECT = 창고 A) · **`event_verification_target`**(`TARGET` = 3번 사건, **`OVERRULED`** = API 12 사건) | 없음 | **`event`** |
| **6b** | 확인 요청 처리도 함께 남는다 | `verification_request_handling`(`RESOLVED` · `resolving_event_id` = 6a) | 없음 | **결정 기록** (둘은 서로를 대신하지 않는다 — 11.2a) |
| **6c** | 재계산 | — | `canonical_fact`: **`value_status = CONFIRMED`** · **`verification_basis = HUMAN_VERIFICATION`** · `evidence_strength` 1 → 2(운영자 권한 S) · `conflict_status = NONE`(OVERRULED 는 R1 기각) · **`decision_usability = USABLE`** | `event` |
| **6d** | 확인 요청은 사라진다 | — | `verification_request` 재생성 시 조건이 풀려 **행이 안 생긴다.** 6b 의 처리 기록은 `request_key` 로 그대로 남는다(11.7.1) | 파생 |
| 7 | 계산 입력 얼리기 | `planning_snapshot` · `planning_snapshot_fact`(값 사본 + **상태 6차원 사본** + 판 사본 — 13.2.1) · `planning_snapshot_input`(마스터 기본값·요율 규칙 id·정책 판) | 없음 | 스냅샷 |
| 8 | 위험 평가 | `risk_assessment`(등급 · 여유 · 근거 사실 키) | 없음 | 산출 기록 |
| 9 | 아무것도 안 할 때 비용 | `cost_result`(**ESTIMATED**) · `cost_line_item` · `cost_line_link` | 없음 | 산출 기록 |
| 10 | 복구 계산 v1 | `recovery_run`(RUN-1) · `assignment` · `cost_result`(**PLAN**) | 없음 | 산출 기록 |
| 11 | ODCY 용량이 모자라 물어봐야 함 | `comm_thread` · `question_item`(대상 개체 · 사실 키 · **적용 범위** 확정) | 없음 | `question_item` |
| 12 | 초안 작성 (숫자는 계획에서 주입, 문장은 AI) | `comm_message`(OUTBOUND · **BUSINESS**) · `comm_message_structured_field`(4 TEU + `source_run_id` = RUN-1) · `comm_message_question` | 없음 | `comm_message` |
| 13 | 운영자 승인 (A-17) | `message_approval`(APPROVED · `expires_at` · `approved_plan_run_id` = RUN-1) · `message_approval_structured_field`(숫자 사본) | `comm_message.current_approval_id`(**편의 포인터 캐시**) | **`message_approval`** |
| 14 | 발송 | `send_attempt`(**외부 호출 전에** 커밋 · `approval_id` 필수 · `sent_content_hash` = **유효한 승인의** `approved_content_hash`) · `message_status_transition` · `audit_log` | `send_attempt` **결과 5컬럼**(호출 뒤 한 번, 15.7.3) · `comm_message.current_status`(캐시) | `send_attempt` |
| 15 | ODCY 회신 도착 | `raw_input` · `comm_message`(INBOUND · `external_message_id` UNIQUE 로 중복 수신 차단) | 없음 | `raw_input` |
| 16 | 제안 기록 + 사실화 | `commercial_offer` · `commercial_offer_item` · `extraction`(`ask_id` = ASK-1) · `event`(TERM) | 없음 | 제안은 **근거**, 계산값은 `event` → `canonical_fact` |
| 17 | 재계산 v2 | 새 `planning_snapshot` · `recovery_run`(RUN-2, `previous_run_id` = RUN-1, 계기 `REPLY_RECEIVED`) | 없음 | 산출 기록 |
| 18 | 계획 결정 | `plan_decision`(`decided_plan_hash`) | 없음 | **결정 기록** |

### 27.2 중간 개입 ① "ODCY A 는 이번 건에서 제외"

| # | 단계 | INSERT | UPDATE |
| --- | --- | --- | --- |
| a | 운영자가 조건을 건다 | `operator_planning_constraint`(**`action = SET`** · `enforcement = HARD` · **`scope_type = RECOVERY_CONTEXT`**) | 없음 |
| b | 입력 얼리기 | 새 `planning_snapshot` + **`planning_snapshot_constraint`**(조건 값 6종 사본) | 없음 |
| c | 재계산 | `recovery_run`(RUN-3, 계기 `CONSTRAINT_CHANGE`, `trigger_ref` = OPC-1) | 없음 |
| d | 나중에 해제 | `operator_planning_constraint`(**`action = RELEASE`** · `releases_constraint_id` = OPC-1) | **없음** |

- **`facility.is_active` 를 건드리지 않는다.** 시설은 현실에서 멀쩡하다(안티패턴 5).
- 해제해도 **RUN-3 은 그대로 재현된다.** 스냅샷이 조건 값을 복사해 뒀기 때문이다.
- **기본 범위가 `RECOVERY_CONTEXT` 라서** 다음 사고 계산에는 이 조건이 따라가지 않는다(22.2).

### 27.3 중간 개입 ② "창고 B 는 이번 건 보관료 0원"

| # | 단계 | INSERT | 비고 |
| --- | --- | --- | --- |
| a | 운영자 입력 | `event`(`OBSERVATION` · TERM · **`source_type = HUMAN_UI`** · `extraction_method = DIRECT` · `input_quality = STRUCTURED` · `input_confidence_level = HIGH` · **`applicability_scope_type = RECOVERY_CONTEXT`**) | **상대의 견적과 같은 경로**를 탄다(FR-CON-05) |
| b | 주체 연결 | `event_entity_link`(SUBJECT = 창고 B, 1건) | |
| c | 현재 사실 | `canonical_fact` 에 **범위가 `RECOVERY_CONTEXT` 인 행이 새로 생긴다** | **기존 `GLOBAL` 15,000원 행은 그대로 남는다**(11.4.1) |
| d | 계산 | 이번 건은 좁은 범위 행(0원), 다른 건은 `GLOBAL` 행(15,000원) | 스냅샷에 **어느 범위를 썼는지 복사**된다 |
| e | 재계산 | 새 스냅샷 · `recovery_run`(RUN-4) | |

**이 값을 상대에게 물어본다면** (rev.2.1 확인)

| 단계 | 범위가 어떻게 따라가나 |
| --- | --- |
| `question_item` 생성 | `target_applicability_scope_type = RECOVERY_CONTEXT`, `..._ref = <RECOVERY_CONTEXT_REF>` **을 Backend 가 못 박는다**(식별 방식은 L-13) |
| 회신 → `extraction` | `ask_id` + 값 + 단위 + 원문 인용. **LLM 은 범위를 만지지 않는다** |
| 사건 생성 | `ask_id` → `question_item` 한 줄 조회로 **범위가 그대로 나온다** |
| 충돌이 생기면 | `RECOVERY_CONTEXT` 끼리만 비교한다. `GLOBAL` 15,000원과 다투지 않는다 |
| 확인 요청이 생기면 | 범위를 갖고, `request_key` 도 범위를 포함해 `GLOBAL` 요청과 구분된다 |

> **이 단계에서 rev.2 초안의 모순이 드러났다.** 자세한 내용과 수정은 **11.4.1**. 고치지 않았다면 운영자의 "이번 건 0원"이 **창고 B 의 영구 요율을 덮어써서** 다음 달 계산까지 0원이 됐을 것이다.

### 27.4 주소 확인 메일 (승인 게이트 예외)

| # | 단계 | INSERT | 비고 |
| --- | --- | --- | --- |
| a | 새 연락처 주소 등록 | `contact_channel_address`(3상태 전부 초기값) | |
| b | 확인 토큰 발급 | `contact_verification`(**토큰 해시만**) | 토큰 값 자체는 저장하지 않는다 |
| c | 확인 메일 작성 | `comm_message`(**`message_kind = CONTACT_VERIFICATION`** · `contact_verification_id`) | 구조화 값 0건 · 질문 연결 0건(I-10) |
| d | 발송 | `send_attempt`(**`approval_id` NULL** · `sent_content_hash` = **그 메시지의 `content_hash`**) · `audit_log` | **업무 승인 없이 나간다.** 지문 대조는 그대로 하고 감사도 남는다(15.7.2) |
| e | 상대가 링크 클릭 | — | `contact_verification.used_at`·`result` **갱신**(`CONTROLLED_UPDATE`, 한 방향 1회 — 10.4.1) |
| f | 주소 상태 변경 | — | `contact_channel_address.email_verification_status = VERIFIED` |

- **업무 메시지가 이 길로 새는 것을 규칙 4·5 가 막는다** — 숫자나 질문이 붙는 순간 `CONTACT_VERIFICATION` 이 아니다(15.7.1).

### 27.5 승인이 무효가 되는 세 경우

| 상황 | INSERT | UPDATE |
| --- | --- | --- |
| 운영자가 본문을 고쳤다 | 새 `comm_message` + 새 `message_approval` + `INVALIDATED`(`CONTENT_CHANGED`) 행 | 없음 |
| 승인이 오래돼 만료 | — (`expires_at` 이 만들 때 이미 정해져 있다) | 없음 |
| 계획이 RUN-2 로 바뀌어 RUN-1 기준 승인이 무의미 | `INVALIDATED`(`PLAN_SUPERSEDED`) 행 | 없음 |

**UPDATE 가 한 번도 필요하지 않다.** 승인 #1 이 왜 죽었는지, #2 가 왜 못 쓰이는지, #4 로 무엇을 보냈는지 전부 남는다(15.5.1).

### 27.6 검증 결과 (rev.2.1 재검증 26항목 + rev.2.2 추가 4항목 + rev.2.3 추가 17항목 + **rev.2.4 추가 17항목 = 64항목**)

**A. 사건 · 적용 범위**

| # | 확인 | 결과 |
| --- | --- | --- |
| 1 | 사건마다 SUBJECT 정확히 1건 | **통과** — I-8 · 부분 유일 제약 |
| 2 | 사건의 범위가 현재 사실의 범위로 전파된다 | **통과** — `event` → `canonical_fact` 두 컬럼 상속 |
| 3 | 범위가 다른 현재 사실이 공존한다 | **통과** — PK 에 범위 2컬럼(11.4.1) |
| 4 | 범위가 다르면 충돌이 아니다 | **통과 (rev.2.1 수정)** — I-15 · 11.5.1 |
| 5 | 충돌이 자기 범위를 표현할 수 있다 | **통과 (rev.2.1 수정)** — `conflict` 대상 5열 |
| 6 | 확인 요청이 자기 범위를 표현할 수 있다 | **통과 (rev.2.1 수정)** — 11.6.1 |
| 7 | `request_key` 가 범위까지 포함해 결정적이다 | **통과 (rev.2.1 수정)** — 11.7.2 |
| 8 | 회신을 사건으로 만들 때 필요한 범위를 **LLM 없이 Backend 가** 정할 수 있다 | **통과 (rev.2.1 수정)** — `question_item.target_applicability_scope_*`(15.2.1) |

**B. 확인 이력**

| # | 확인 | 결과 |
| --- | --- | --- |
| 9 | `verification_request` 를 지우고 다시 만들 수 있다 | **통과** — `REBUILDABLE` |
| 10 | 처리 기록·질문의 과거 연결이 **파생 테이블 FK 에 의존하지 않는다** | **통과 (rev.2.1 보강)** — `handling.request_key` 와 `question_item.verification_request_key` **둘 다** 논리 연결 키(11.7.1 · 15.2.2) |

**C. 스냅샷**

| # | 확인 | 결과 |
| --- | --- | --- |
| 11 | 당시 사실 **+ 범위**를 복원할 수 있다 | **통과** — `planning_snapshot_fact` PK 6열 |
| 12 | 당시 계획 조건을 복원할 수 있다 | **통과** — `planning_snapshot_constraint` |
| 13 | 당시 마스터 기본값·요율·정책 입력을 복원할 수 있다 | **통과** — `planning_snapshot_input` |

**D. 메시지 승인**

| # | 확인 | 결과 |
| --- | --- | --- |
| 14 | **`APPROVED` 행만** 승인 내용 사본을 필수로 요구한다 | **통과 (rev.2.1 수정)** — 15.5.0 |
| 15 | `REVOKED`·`INVALIDATED` 는 대상 + 사유로 충분히 표현된다 | **통과 (rev.2.1 수정)** — 승인 사본을 새로 요구하지 않는다 |
| 16 | 무효화 대상은 **같은 메시지의 기존 `APPROVED`** 다 | **통과 (rev.2.1 수정)** — I-17 |
| 17 | 업무 발송: 보낸 지문 = 유효한 승인 지문 | **통과** — I-3 |
| 18 | 주소 확인 발송: 승인 없음 · 보낸 지문 = 메시지 지문 | **통과 (rev.2.1 수정)** — I-3b · 15.7.2 |
| 19 | 업무 메시지가 `CONTACT_VERIFICATION` 으로 승인을 우회할 수 없다 | **통과** — 15.7.1 규칙 2·4·5 |

**E. 변경 방식**

| # | 확인 | 결과 |
| --- | --- | --- |
| 20 | `event` · `plan_decision` · `message_approval` · `operator_planning_constraint` 는 덧붙이기만 | **통과** — 네 표 모두 `APPEND_ONLY`(1.3) |
| 21 | `canonical_fact` 는 재생성 가능하다 | **통과** — `REBUILDABLE` |
| 22 | `comm_message` 의 현재 상태·승인 포인터는 **캐시 갱신**이다 | **통과 (rev.2.1 명시)** — `IMMUTABLE_AFTER_CREATE` + `CACHE_UPDATE`(1.3) |
| 23 | `contact_verification` 의 생애주기 갱신이 분류 정의와 모순되지 않는다 | **통과 (rev.2.1 수정)** — `CONTROLLED_UPDATE`, 갱신 컬럼 2개를 명시(10.4.1) |

**F. 요율 · 비용**

| # | 확인 | 결과 |
| --- | --- | --- |
| 24 | 제안은 근거, 현재 요율은 현재 상태. **이중 정본 없음** | **통과** — `created_event_id` 가 유일한 다리 |
| 25 | 범위가 다른 요율이 서로 덮어쓰지 않는다 | **통과** — 11.4.1 |

**G. 시뮬레이션**

| # | 확인 | 결과 |
| --- | --- | --- |
| 26 | S-1 ~ S-7 그대로 유지 | **통과** — 20절 규칙 변경 없음(`system_error` 는 목록에 추가) |

**H. rev.2.2 최종 정리에서 추가한 확인**

| # | 확인 | 결과 |
| --- | --- | --- |
| 27 | 승인 표의 컬럼 필수 표기와 행 종류별 규칙이 **한 문서 안에서** 일치한다 | **통과 (rev.2.2)** — 15.5 컬럼 표 "조건부" + 15.5.0 무결성 규칙 1~8 |
| 28 | 나중에 채워지는 컬럼이 있는 표가 `APPEND_ONLY` 로 적혀 있지 않다 | **통과 (rev.2.2)** — `send_attempt` · `extraction` 을 불변 부분 + 결과·검토 `CONTROLLED_UPDATE` 로 정정(15.7.3 · 15.9.1) |
| 29 | PK 구성 컬럼 중 NULL 허용이 없다 | **통과 (rev.2.2)** — `planning_snapshot_input.value_path` NOT NULL(13.2b). 복합 PK 10개 표 전부 재확인 |
| 30 | 기술 오류가 사실·감사·발송 기록과 섞이지 않는다 | **통과 (rev.2.2)** — `system_error` 는 `event` 를 만들지 않고 계산 입력이 아니다(I-19 · 27.8) |

**I. rev.2.3 논리 모델 후속(T-081)에서 추가한 확인 — 17항목**

| # | 확인 | 결과 |
| --- | --- | --- |
| 31 | 사람 확인이 **`VERIFICATION` 사건으로 저장**된다 | **통과** — `event_class` + `verification_action`·`verification_method`(11.2a · 27.1 6a) |
| 32 | 어느 사건을 **확인·기각했는지 재현**된다 | **통과** — `event_verification_target`(`TARGET`/`OVERRULED`), 역방향 조회 가능 |
| 33 | 확인 요청 처리 기록과 확인 사건이 **서로를 대신하지 않는다** | **통과** — 27.1 의 6a·6b 가 **둘 다** 남는다. `DIRECT_REVIEW` 는 요청 없이도 성립(11.2a) |
| 34 | `input_quality` 와 `input_confidence_level` 이 **다른 축**이다 | **통과** — 11.2b 비교표. 형태 vs 판정 |
| 35 | **모든 경로**에서 검증기 신뢰도를 표현할 수 있다 | **통과** — `event` 컬럼이므로 `extraction` 행이 없는 사람 입력·공공 API·파일도 갖는다 |
| 36 | `canonical_fact` 에 **의미 불명 `confidence` 가 남지 않았다** | **통과** — 제거(11.4.2). 남은 네 가지는 각자 다른 이름·다른 질문 |
| 37 | `source_type` · `source_role` · `extraction_method` 가 **서로 다른 축**이다 | **통과** — 11.2c 조합표 7행 |
| 38 | `source_type` 7값이 **현재 ADR-020 과 일치**한다 | **통과** — `docs/14:250` 과 글자까지 같다. `raw_input` 도 같은 집합 |
| 39 | **Q-46 이 열려 있다** | **통과** — 11.2c 말미에 명시. 7값은 영구 확정이 아니다 |
| 40 | `event_type` · `schema_version` · `correlation_id` · `source_id` · 멱등 키가 **전부 있다** | **통과** — 23.1 대응표 누락 0건 |
| 41 | `payload` 가 **부가 속성만** 담는다 | **통과** — 11.2d 의 판단 기준 + 핵심 구조 목록 |
| 42 | 상태 **6차원을 독립적으로** 표현한다. R10 `HELD` 와 `APPROVAL_BLOCKED` 가 표현된다 | **통과** — 11.4.2. `decision_usability` 는 넷에서 결정론적으로 유도(I-24) |
| 43 | **I-12**: 과거 스냅샷으로 "그때 왜 승인 가능했나"를 설명할 수 있다 | **통과** — 13.2.1 에서 상태 6차원 + 판 동결 |
| 44 | **I-7**: `canonical_fact` 를 전부 지우고 `event` 로 재계산해도 같다 | **통과** — 아래 근거 |

**44번(I-7)을 다시 따진 이유.** 이번에 `canonical_fact` 에 차원 다섯 개가 늘었다. **늘어난 칸이 전부 `event` 에서 다시 계산되는지**를 확인해야 재현성이 유지된다.

| 늘어난 칸 | 무엇으로 재계산되나 | `event` 만으로 되나 |
| --- | --- | --- |
| `value_status` | 이긴 사건의 강도 + 확인 사건 유무 | **예** — 강도는 원천 축(`source_type`·`source_role`·`input_confidence_level`) + 정책, 확인은 `event_verification_target` |
| `verification_basis` | 확인 사건의 종류 · 권한 A 파트너 여부 | **예** |
| `conflict_status` | 같은 범위 후보들의 값 비교 (R4-b · R6) | **예** |
| `hold_status` | R10 판정(감소율 + 강도) | **예** — 사건들과 정책만 있으면 된다 |
| `decision_usability` | 위 네 차원 + 사실 중요도 (R11) | **예** — I-24 가 결정론을 요구한다 |

**어느 칸도 `canonical_fact` 에만 있는 정보를 쓰지 않는다.** I-7 은 유지된다.

**J. 승인 전 최종 확인 3항목 (rev.2.3 보강)**

| # | 확인 | 결과 |
| --- | --- | --- |
| 45 | 확인 사건의 여러 대상이 **같은 현재 사실 좌표**(SUBJECT + `fact_key` + 적용 범위) 안에 있도록 강제되나 | **통과 (rev.2.3 보강)** — 11.2a 규칙 7·8 로 명시하고 I-26 에 올렸다. **보강 전에는 강제되지 않았다** — 좌표를 넘나들면 I-8(SUBJECT 1건)이 결정되지 않고 `OVERRULED` 가 다툰 적 없는 사실을 기각한다(11.2a.1) |
| 46 | `fact_key` 필수 · 값 최소 1개 규칙이 **`event_class` 별 조건부**로 실제 고쳐졌나 (Markdown ↔ 작업표 둘 다) | **통과** — Markdown 11.2 무결성 규칙 5 의 부류별 표 + 작업표 `event` 블록 제약 칸(`fact_kind`·`fact_key` = "조건부 - VERIFICATION 이면 비움", `value_text` = "OBSERVATION 이면 4종 중 최소 1개 / VERIFICATION 은 비움") |
| 47 | `decision_usability` 가 **네 차원 + 판에서 유도되는 파생**이고, 과거 스냅샷에서 그 판정까지 재현되나 | **통과 (rev.2.3 보강)** — 11.4.2 규칙 5 에 입력표를 넣고 I-24 를 "(네 차원, `rule_version`, 중요도 정책 판)" 으로 고쳤다. 재현은 13.2.1 의 입력표 + **I-27** |

**K. Q-44 · Q-45 사용자 결정 반영 (rev.2.4) — 17항목**

| # | 확인 | 결과 |
| --- | --- | --- |
| 48 | 메일 `source_recorded_at` 선택이 **결정론적**이다 | **통과** — 11.2e 의 규칙은 두 시각만 입력으로 받는다. 27.12 다섯 경우 |
| 49 | **미래 `Date` 헤더가 최신 주장으로 위장할 수 없다** | **통과** — `Date > 채널 수신 시각` 이면 쓰지 않는다(I-28, 27.12 c) |
| 50 | 원래 `Date` · 채널 수신 시각을 **다시 볼 수 있다** | **통과** — `event.payload` 의 여섯 키(11.2e) |
| 51 | **원문 파기 뒤에도** 시각 정책을 다시 판정할 수 있다 | **통과** — 두 시각이 원문이 아니라 사건에 있다 |
| 52 | 원문 파기 뒤 **사건이 고아가 되지 않는다** | **통과** — `raw_input` 행은 지우지 않는다(I-30, 27.13) |
| 53 | `comm_message` **식별·이력이 유지된다** | **통과** — id · 외부 id · `content_hash` · 참조 · 상태 전이 · 발송 시도가 남는다 |
| 54 | **승인 이력이 유지된다** | **통과** — `message_approval` 행 · 지문 · 무효화 사슬이 남는다. 문장 사본만 파기 가능 |
| 55 | **추출 기록의 식별이 유지된다** | **통과** — `extraction` 16컬럼 불변, 인용은 참조 + 지문 |
| 56 | **감사가 유지된다** | **통과** — `audit_log` 는 파기 대상이 아니고 원래 본문이 없다 |
| 57 | `event` → `canonical_fact` **재계산**이 된다 | **통과** — 원문을 읽지 않는다(I-7 · I-33) |
| 58 | `planning_snapshot` **재현**이 된다 | **통과** — I-12 · I-27 · I-33 |
| 59 | 파기로 잃는 것이 **원문 재추출뿐**임이 명확하다 | **통과** — 29.9 표 · "재현성 ≠ 재처리 능력" |
| 60 | **불변 규칙과 파기가 충돌하지 않는다** | **통과** — 파기는 어떤 기록 행도 `UPDATE`·`DELETE` 하지 않는다(29.3 · I-30) |
| 61 | **파기 행위 자체가 감사된다** | **통과** — `CONTENT_PURGED` 감사 행, 본문 복사 금지(29.8 · I-32) |
| 62 | 실제 보관 기간 **숫자가 고정되지 않았다** | **통과** — 정책 파라미터 · Pilot 정책으로 OPEN(29.6 · 29.11 · 25절) |
| 63 | **정상 파기와 데이터 손실을 구분**할 수 있다 | **통과 (rev.2.4 보강)** — 내용 부재 × 성공한 `CONTENT_PURGED` 감사로 판정. 근거 없는 부재는 손실 → `system_error`(29.8.1 · I-34). **보강 전에는 "내용 없음 = 파기됨"으로 읽힐 수 있었다** |
| 64 | 파기가 **부모 기록 · 참조 · 지문을 바꾸지 않고**, 감사 `SUCCESS` 는 제거 확인 뒤에만 남는다 | **통과 (rev.2.4 보강)** — 29.8.1 · I-34 · 27.13 순서 정정(제거 → 확인 → 감사) |

### 27.7 이 검증에서 새로 나온 것

| 무엇 | 처리 |
| --- | --- |
| **(rev.2) 모순 1건** — 범위가 다른 현재 사실이 같은 PK 를 다툰다 | rev.2 에서 수정 — `canonical_fact` · `planning_snapshot_fact` PK 에 범위 2컬럼(11.4.1) |
| **(rev.2.1) 정합성 9건** — 범위가 충돌·확인 요청·질문까지 전파되지 않음, 지문 규칙·승인 행 종류·분류 축의 모순 | **이번에 전부 수정.** 새 테이블 0개 |
| **rev.2.1 에서 새로 발견된 구조 문제** | **없다.** 흐름을 다시 걸었을 때 26항목 전부 통과했다 |
| **(rev.2.2) 정합성 5건 A~E + 표현 잔재** — 최종 검증에서 발견 | **이번에 전부 수정.** 기술 운영 표 `system_error` 1개 추가. 30항목 전부 통과 |
| **(rev.2.3) 누락 13건** — `docs/05` 4.2 와 대조한 적이 없었다 | **이번에 전부 복구**(23.1). 표 1개 추가(`event_verification_target`). **47항목 전부 통과** |
| **(rev.2.3) ADR-020 상태 차원이 한 칸으로 합쳐져 있었다** | **이번에 복구**(11.4.2). 다섯 차원 + `verification_basis`. 의미 없는 `canonical_fact.confidence` 제거 |
| **(rev.2.3 보강) 확인 사건의 대상 좌표가 강제되지 않았다** | 승인 전 최종 확인에서 발견. **11.2a 규칙 7·8 + I-26 으로 닫았다.** 새 표·새 컬럼 없음 |
| **(rev.2.4) 파기가 불변 규칙과 부딪혔다** — 원문 행 삭제 금지 · 본문·인용·승인 사본 UPDATE 금지 | Q-45 결정 반영 중 확인. **기록과 내용을 나눠 닫았다**(29절). 새 표 없음, 논리 테이블 수 그대로 |
| 범위 종류 사이의 **우선순위 규칙** | **확정하지 않았다.** 서로 다른 축이라 지금 박으면 틀린 답을 고정한다 → **L-14** 에 포함(22.2) |
| 상대방 직접 입력의 Source 모델 | **닫지 않았다** → **Q-46 OPEN**(11.2c). 7값은 현재 ADR 기준의 정렬이지 영구 확정 enum 이 아니다 |

> **개념 모델(`docs/21`)의 문제는 이번에도 발견되지 않았다.** 위 수정은 전부 **논리 설계 단계에서 생긴 것**이고 이 문서 안에서 닫혔다. rev.2.3 의 13건은 **주변 문서와의 차이가 아니라 이 문서 자신이 정본(`docs/05` 4.2)과 대조되지 않은 채 승인됐던 것**이다.

**왜 rev.2.2 까지 발견되지 않았나.** rev.1~rev.2.2 의 검증은 **이 문서 내부 정합성**과 **Markdown ↔ 작업표 대조**에 집중했고, `docs/05` 4.2 필드표와 한 줄씩 대조한 적이 없었다. 23.1 의 대응표가 그 대조를 처음으로 고정한다 — 다음 검토부터는 이 표가 점검 목록이다.

### 27.8 기술 오류 한 건 (rev.2.2 신규) — Gmail 503

| # | 단계 | INSERT | UPDATE | 비고 |
| --- | --- | --- | --- | --- |
| a | 승인된 업무 메시지 발송 시작 | `send_attempt`(`attempt_no = 1`, `result = NULL`) · `message_status_transition`(QUEUED) | — | 외부 호출 **전에** 커밋(`docs/18` H.2) |
| b | Gmail 이 503 | `system_error`(`INTEGRATION` · `GMAIL` · `http_status = 503` · `retryable = true` · `request_id` · `trace_id` · 관련 = `SEND_ATTEMPT`) | `send_attempt` 결과 5컬럼(`RETRYABLE_FAILURE` · `GMAIL_SERVER_ERROR`) 한 번 | **`event` 는 만들지 않는다** |
| c | 재시도 | 새 `send_attempt`(`attempt_no = 2`) — 승인·Contact Gate·지문을 **다시 검사** | — | 1번 시도 행은 그대로 |
| d | 성공 | — | 2번 시도 결과 `SUCCESS` 한 번 · `comm_message.current_status`(캐시) | `message_status_transition`(SENT) |

- 운영자는 통신 화면에서 **"1번 실패, 2번 성공"**(`send_attempt`)을 보고, 개발자는 `trace_id` 로 **Backend → Gmail Adapter → Gmail 503** 한 흐름(`system_error` + 구조화 로그)을 찾는다.
- 현재 사실·계산·승인 판정은 이 오류 때문에 바뀌지 않는다.

### 27.9 정정 한 건 (rev.2.3 신규) — "10 이 아니라 8 이었다"

**현실이 바뀐 것과 입력이 틀린 것은 다르다**(`docs/05` 4.1).

| # | 단계 | INSERT | UPDATE | 비고 |
| --- | --- | --- | --- | --- |
| a | 운영자가 수용량을 10 으로 잘못 입력 | `event` E1(`OBSERVATION` · `HUMAN_UI` · `DIRECT` · `input_confidence_level = HIGH` · 값 10) · `event_entity_link`(SUBJECT) | — | |
| b | 현재 사실 | — | `canonical_fact` 값 10 · `value_status = CONFIRMED`(사람 직접 입력) | |
| c | 잘못 넣은 것을 알아챔 | `event` E2(**`event_class = CORRECTION`** · **`supersedes_event_id` = E1** · `supersede_reason` · 값 8 · 같은 `fact_kind`·개체) | **없음 — E1 을 고치지 않는다** | I-1 · 규칙 3 |
| d | 재계산 | — | `canonical_fact` 값 8. E1 은 `supersession_status = SUPERSEDED` 로 **계산될 뿐 저장되지 않는다**(`docs/05` 6.1 · 규칙 8) | |
| e | 철회하고 싶다면 | `event` E3(`CORRECTION` · `supersedes` = E2 · **네 값 컬럼 전부 비움**) | — | 규칙 5 의 `CORRECTION` 행 — 값 없음 = 철회 |

- **확인(`VERIFICATION`)과 섞이지 않는다.** 정정은 `supersedes_event_id`, 확인은 `event_verification_target`. 두 경로가 서로를 건드리지 않는다.
- 과거 어느 시점으로 되감아도 **그때 보였던 값**이 재현된다 — E1 도 E2 도 지워지지 않았기 때문이다.

### 27.10 같은 원문 재처리 (rev.2.3 신규) — 사건이 두 번 생기지 않는다

| # | 단계 | 무슨 일 | 결과 |
| --- | --- | --- | --- |
| a | 메일 1통 수신 | `raw_input` R1 (`source_record_key` = 메일 id) | |
| b | 처리 → 사건 2건 | 같은 메일에 **9/18 8 TEU** 와 **9/19 6 TEU** 가 함께 있었다 → `event` 2건 | 두 건의 `idempotency_key` 가 다르다 — **주장 위치(claim locator)가 다르기 때문**(11.2d) |
| c | 파서를 고쳐 **R1 을 다시 처리** | `raw_input` 은 새로 만들지 않는다(UNIQUE 로 막힌다) | |
| d | 사건 생성 시도 | 같은 재료 → **같은 `idempotency_key`** | **UNIQUE 에 걸려 무시된다**(`docs/05` 4.5 "무시(로그만)"). 기술 오류가 아니므로 `system_error` 로 가지 않는다 |
| e | 결과 | 사건은 여전히 2건 | `canonical_fact` 도 그대로 |

> **rev.2.2 였다면**: `raw_input` 의 UNIQUE 는 **수집**만 막고 **처리**는 막지 않으므로, d 에서 **사건 2건이 더 생겨** 같은 사실이 네 번 주장된 것처럼 보였다. 그러면 `contributing_event_count` 와 동률 판정(R4-a 의 `event_id` tie-break)이 전부 틀어진다.

### 27.11 범위가 다른 두 요율 (rev.2.3 재확인) — 멱등 키도 범위를 구분한다

27.3 의 사례를 **멱등 키 관점**으로 다시 본다.

```
운영자 입력 ①  창고 B 보관료 = 0원     범위 RECOVERY_CONTEXT / <RECOVERY_CONTEXT_REF>
기존 사실  ②  창고 B 보관료 = 15,000원 범위 GLOBAL
```

| 확인 | 결과 |
| --- | --- |
| 서로 다른 현재 사실인가 | **예** — PK 에 범위 2컬럼(11.4.1) |
| 충돌인가 | **아니다** — I-15 · 11.5.1 |
| 멱등 키가 다른가 | **예 (rev.2.3)** — 재료에 `applicability_scope_type`·`applicability_scope_ref` 가 들어간다(11.2d) |
| 범위를 빼면 어떻게 되나 | 두 주장이 **같은 키**가 되어 **나중에 들어온 "이번 건 0원"이 조용히 버려진다.** 운영자는 입력했는데 아무 일도 일어나지 않는 것처럼 보인다 |

> 22.5 의 적용 범위 전파 점검표에 **멱등 키 한 줄이 늘었다.** rev.2.1 이 세운 범위 구조는 **어느 것도 후퇴하지 않았다.**

### 27.12 메일 시각 선택 (rev.2.4 · Q-44)

| 경우 | `Date` | 채널 수신 | `source_recorded_at` | `payload` |
| --- | --- | --- | --- | --- |
| a. 정상 | 10:30 | 10:31 | **10:30** | `recorded_at_basis = DATE_HEADER` |
| b. 늦게 도착 | 09:00 | 11:00 | **09:00** — 과거는 허용 | `DATE_HEADER`, 두 시각 모두 보존 |
| c. 발신자 시계가 미래 | 12:00 | 11:00 | **11:00** | `CHANNEL_RECEIVED` · `date_header_rejected = true` · `AFTER_CHANNEL_RECEIVED` |
| d. `Date` 없음 | — | 11:00 | **11:00** | `CHANNEL_RECEIVED` · `MISSING` |
| e. 파싱 실패 | `"yesterday"` | 11:00 | **11:00** | `CHANNEL_RECEIVED` · `UNPARSEABLE` · 원래 문자열 보존 |

- 어느 경우든 **같은 입력이면 같은 값**이다(결정론). 그리고 **근거 시각이 채널 수신 시각보다 늦어지는 경우가 없다** — c 에서 12:00 을 쓰면 11:00~12:00 사이의 진짜 최신 관측을 이길 수 있었다.
- 원문을 나중에 파기해도(27.13) 표의 두 시각은 사건 `payload` 에 남으므로 **정책이 바뀌면 다시 판정할 수 있다.**

### 27.13 내용 파기 한 건 (rev.2.4 · Q-45)

27.1 의 메일("9/18 수용량 8 TEU")이 흐름을 다 마쳤고 보관 기간이 지났다.

| # | 단계 | 무엇이 일어나나 | 기록 행 |
| --- | --- | --- | --- |
| a | 파기 가능 확인(29.7) | 사건 생성 완료 · 추출 `ACCEPTED` · 열린 확인 요청 없음 → **가능** | 변화 없음 |
| b | 원문 제거 | `payload_ref` 가 가리키던 원문(첨부·HTML 포함)을 제거하고 **없어졌는지 확인** | **`raw_input` 행 그대로** — `payload_ref` · `payload_hash` · `attachment_manifest` · `source_record_key` · 시각 전부 남는다 |
| c | 감사 (제거 확인 뒤) | `audit_log`(`CONTENT_PURGED` · `RAW_INPUT_PAYLOAD` · `raw_input_id` · 보관 정책 판 · `SUCCESS`) → 이제 **정상 파기** | **새 감사 행**. 제거에 실패했으면 `FAILURE` + `system_error` |
| d | (나중) 본문·인용 파기 | `message_content_ref` · `source_quote_ref` 가 가리키던 내용 → 파기됨. 각각 감사 행 | **`comm_message` · `extraction` 행 그대로** — 지문·외부 id·인용 위치·후보 값 남는다 |

**파기 뒤 확인**

| 확인 | 결과 |
| --- | --- |
| 사건이 고아가 되나 | **아니다** — `event.raw_input_id` 가 가리키는 **행은 있다** |
| `canonical_fact` 를 전부 지우고 재계산 | **같다** — 재계산은 원문을 읽지 않는다(I-7) |
| 이 계산을 쓴 과거 스냅샷 재현 | **된다** — 값·상태·판이 복사돼 있다(I-12 · I-27) |
| 이 메일이 어떤 승인·발송과 이어져 있었나 | **보인다** — `message_approval` · `send_attempt` · `message_status_transition` 은 기록이다 |
| "이 사건은 어떤 인용에서 나왔나" | 인용 **문장은 없지만** 인용 지문 · 인용 위치 · `extraction_id` → `raw_input_id` 는 남는다 |
| 원문에서 다시 추출 | **안 된다** — 정상적인 보관 정책의 결과다(29.9) |
| 누가 언제 무슨 정책으로 지웠나 | `audit_log` 에 있다. **본문은 없다** |
| **다른 메일의 원문이 감사 기록 없이 사라져 있다면** | **정상 파기가 아니다** — 데이터 손실로 `system_error`(29.8.1) |

---

## 28. 다음 단계

> **rev.2.2 순서 정정** — rev.2.1 까지는 "물리 설계(T-080) → 구현 계획(T-069)" 순서로 적혀 있었다. **바뀌었다.** 첫 구현 슬라이스가 정해져야 그 슬라이스에 필요한 표만 물리 설계할 수 있다(26절).

1. ~~**이 문서 rev.2.2 + 작업표 최종 검토** (사용자 + ChatGPT) → **T-079 DONE**~~ — **완료 (2026-09-18)**
2. ~~**T-070 주변 문서 동기화**~~ — **완료 (2026-09-18, 커밋 `3b1bda3`)**. X-10~X-13 처리 결과는 24절
3. ~~**이 문서 rev.2.3 + 작업표 검토** → **T-081 DONE**~~ — **완료 (2026-09-21, 사용자 최종 승인)**
3-1. ~~**Q-44 · Q-45 사용자 결정**~~ — **완료 (2026-09-21, rev.2.4)**. Q-44 CLOSED(11.2e) · Q-45 구조 CLOSED / 기간 OPEN(29절)
4. **T-069 외부 통신 구현 계획** ← **다음** — ~~Q-44·Q-45 사용자 결정~~(완료), **L-13 복구 맥락 식별자** 결정, **첫 구현 슬라이스 확정**(어느 표를 먼저 만드나)
5. **Backend·DB 기술 최종 결정** — **Backend 는 결정(2026-09-21, ADR-033 Accepted — Main Backend = TypeScript + NestJS, AI Server = 별도 Python 런타임).** ~~DB 제품·ORM·마이그레이션은 Q-68(T-084) 로 남는다~~ **DB 도 결정(2026-09-22, ADR-034 Accepted — PostgreSQL + Drizzle ORM + drizzle-kit 검토 SQL migration, SQLite 미사용, Q-68 CLOSED)**
6. **T-080 물리 설계** — **논리 표 52개를 한 번에 물리 설계하지 않는다.** 5번에서 **결정된 기술**을 T-069 가 정한 첫 슬라이스에 필요한 표부터 반영한다: 결정된 DB 제품 위의 물리 설정 · `event_id` 형식 · **`idempotency_key` 직렬화·해시·주장 위치 형식**(11.2d) · **`schema_version` 문자열 형식** · 코드값 물리 표현 · 인덱스 · 부분 유일 제약 표현 · `value_path` "전체" 표시 문자열 · 마이그레이션 · 실제 `CREATE TABLE`
6. 구현(Antigravity) → 검토(Claude/Codex) → 사용자 승인 → commit
7. 실데이터 확인 뒤 **L-16 `bl` 유일 제약** 확정 (T-005·T-006)
8. 재현 테스트 설계: **`canonical_fact` 전체 삭제 → `event` 로부터 재계산 → 동일성 확인**(I-7) + **과거 스냅샷 완전 복원**(I-12)

> **이 문서는 여전히 DB 제품·ORM·SQL·인덱스·솔버·LLM 공급자를 확정하지 않는다.** 기술 결정은 이 문서 밖 ADR 에 있다 — Backend = ADR-033, DB·ORM·migration = **ADR-034**(2026-09-22: PostgreSQL + Drizzle ORM + drizzle-kit 검토 SQL migration, SQLite 미사용). 이 논리 모델은 vendor 중립으로 남고, PostgreSQL 위의 물리 표현은 T-080 이 정한다.

---

## 29. 기록과 내용의 분리 — 메일 보관·파기 **(rev.2.4 · Q-45 사용자 결정)**

**2026-09-21 사용자 결정 — Q-45 의 "보관 구조와 파기 방식"은 CLOSED, "실제 보관 기간 숫자"는 OPEN(Pilot 정책).**

> **원칙 한 줄: 행 삭제 ≠ 내용 파기.** 보관 기간이 끝나도 **기록(record)은 남고, 민감한 내용(content)만 없어진다.**

### 29.1 왜 단순히 지우거나 비울 수 없나

이미 정한 규칙들이 **행 삭제도, 내용 컬럼 비우기도** 막는다.

| 이미 정한 규칙 | 단순 파기를 하면 |
| --- | --- |
| `event` → `raw_input` **삭제 금지** — "원천 없는 사건은 존재할 수 없다"(17.3) | 원문 행을 지우면 사건이 **고아**가 된다 |
| `comm_message` 제목·본문 **생성 후 수정 불가**(1.3) | `UPDATE body_text = NULL` 은 이 규칙을 깬다 |
| `extraction` 추출 결과 **UPDATE 금지**(15.9.1 · I-18) | 인용을 비우면 이 규칙을 깬다 |
| `message_approval` **어떤 행도 UPDATE 하지 않는다**(15.5.0 규칙 8) | 승인 사본을 비우면 이 규칙을 깬다 |
| 승인된 `docs/21` 18절 — 원본 기록은 **삭제·수정 금지** | 기록을 지우면 개념 모델과 어긋난다 |

**해법 — 내용을 기록 행 밖에 두고, 기록은 참조와 지문만 갖는다.** 이것은 새 패턴이 아니다. `raw_input.payload_ref` 가 rev.1 부터 "본문을 여기 직접 넣지 않는 선택지를 남긴다"고 적어 둔 방식을 **내용을 담는 다른 표에도 똑같이 적용**한 것이다.

```
기록 (record) — 행. 만든 뒤 고치지 않는다. 절대 지우지 않는다
  ├─ id · 외부 id · 시각 · 구조화 값 · 결정
  ├─ 내용 지문 (hash)       ← 파기 뒤에도 남는다 — "무엇이 있었는지"의 증거
  └─ 내용 참조 (*_ref)      ← 파기 뒤에도 남는다 — 가리키던 곳이 "파기됨"이 될 뿐

보관 관리 내용 (retention-managed content) — 기록 행 밖
  └─ 원문 · 본문 · 첨부 · 인용 · 승인 사본 · 조건 원문
       보관 중  →  (보관 기간 끝 · 조건 충족)  →  파기됨      한 방향, 되돌릴 수 없다
```

**보관 관리 내용의 성질**

1. 기록이 가진 **참조로만** 찾는다. 기록 행의 컬럼에 민감한 내용을 직접 넣지 않는다(안티패턴 11). **참조(`*_ref`)는 부모 기록이 영구히 유지하는 안정적인 내용 식별자다** — 내용이 파기돼도, 손실돼도 참조 값은 바뀌지 않는다.
2. 각 내용은 **자기 지문**을 가지며, 그 지문은 기록 쪽 지문과 같다. 꺼낸 내용이 바뀌지 않았는지 확인할 수 있다.
3. **내용이 없다는 사실만으로 "파기됨"이라고 판단하지 않는다.** 판정은 **내용 존재 여부 × 성공한 `CONTENT_PURGED` 감사 기록** 두 가지로 한다(29.8.1). 감사 근거가 있는 부재만 정상 파기이고, **근거 없는 부재는 데이터 손실**이다.
4. **물리 저장 위치(DB 안의 별도 공간인지, 파일·객체 저장소인지)는 정하지 않는다.** 물리 설계(T-080)의 몫이다.

**새 표도 새 개념도 아니다.** 보관 관리 내용은 논리 테이블이 아니라 **기록이 가리키는 내용의 저장 위치**다(`payload_ref` 가 가리키던 곳과 같은 성격). 개념은 승인된 `docs/21` 13절의 RawInput(받은 원문 그대로)·Attachment(보관만)·필드별 원문 인용 그대로이고, `docs/21` 은 원문 보관 기간을 **Q-45 로 사용자에게 넘겨 두었다**(`docs/21` 23절 "아직 결정하면 안 되는 사항"의 Q-45 — "개념 모델은 원문을 보존한다까지만 쓴다"). 그래서 **논리 테이블 수는 바뀌지 않는다**(52).

> **`docs/21` 18절("원본 기록은 삭제·수정 금지")과의 관계**: 이 설계에서 원본 **기록** 행은 한 번도 지워지거나 고쳐지지 않는다. 없어지는 것은 기록이 가리키던 **내용**이고, 그 보관 기간은 `docs/21` 이 스스로 Q-45 로 남겨 둔 사용자 결정이다. `docs/21` 을 고칠 필요가 없다.

### 29.2 무엇이 기록이고 무엇이 내용인가 — 논리 모델 전수 조사

`docs/22` 의 자유 입력 필드(`TEXT` · `JSON` · 긴 `STRING`)를 전부 확인해 네 부류로 나눴다. **모두 같은 보관 정책을 적용하지 않는다.**

| 부류 | 뜻 | 파기 대상인가 |
| --- | --- | --- |
| **A** | 장기적으로 남겨야 하는 **구조화 기록** | 아니다 |
| **B** | 일정 기간 뒤 파기할 수 있는 **민감 내용** | **예** — 보관 관리 내용 |
| **C** | **감사·운영용 메타데이터**(본문·비밀 없음이 이미 보장됨) | 아니다 |
| **D** | 메일 내용과 **다른 보안·개인정보 정책** 대상 | 이번 파기 정책 밖 — 29.10 |

| 필드 | 무엇 | 부류 | rev.2.4 처리 |
| --- | --- | --- | --- |
| `raw_input` 원문 (RFC822 — 헤더·본문·**HTML**·**첨부** 전부) | 받은 원문 그대로 | **B** | 이미 참조(`payload_ref`) + 지문(`payload_hash`). **첨부 목록**(`attachment_manifest`, 지문·크기·형식만) 추가 |
| `comm_message` 제목·본문 | 메일의 제목과 안전한 텍스트 본문 | **B** | `subject` · `body_text` → **`message_content_ref`**. 지문 `content_hash` 는 원래 있었다 |
| `message_approval` 승인 시점 제목·본문 | 사람이 승인한 문장 사본 | **B** | `approved_subject` · `approved_body_text` → **`approved_content_ref`**. 지문 `approved_content_hash` 는 원래 있었다 |
| `extraction.source_quote` | 원문 발췌 | **B** | → **`source_quote_ref`** + **`source_quote_hash`**(신규) |
| `commercial_offer.conditions_text` | 상대가 적은 조건 원문 | **B** | → **`conditions_content_ref`** + **`conditions_hash`**(신규) |
| `event` 전체 (`value_*` · `payload` 포함) | 사실 주장 | **A** | 그대로. `value_text` 에는 **값만** 넣고 인용·문장을 넣지 않는다(11.2) |
| `event.payload` 의 메일 시각 키 | `Date` 원문 문자열 · 채널 수신 시각 | **A** | 그대로 — 시각일 뿐 내용이 아니다. Q-44 재판정의 근거(11.2e) |
| `canonical_fact` · `conflict` · 스냅샷 표들 | 파생·동결 기록 | **A** | 그대로 |
| `extraction.candidate_value_text` · `candidate_unit` | LLM 이 낸 **값** | **A** | 그대로 — 사건이 된 값과 같은 것이다 |
| `comm_message_structured_field` · `message_approval_structured_field` | 메시지·승인의 **숫자** | **A** | 그대로 |
| `commercial_offer_item` | 제안의 **구조화 금액·조건** | **A** | 그대로 |
| `question_item.question_text` | **CERA 가 만든** 질문 문구 | **A** | 그대로 — 상대의 원문이 아니다 |
| `plan_decision` · `operator_planning_constraint` 의 `reason` · `frozen_value_text` · `calc_explain` | CERA 안의 결정·계산 설명 | **A** | 그대로. 외부 원문을 복사해 넣지 않는다 |
| `comm_message.external_message_id` · `comm_thread.external_thread_id` · `raw_input.source_record_key` · `send_attempt.provider_message_id` | 채널이 준 **식별자** | **A** | 그대로 — **중복 수신 차단(UNIQUE)과 발송 화해(`docs/18` H.2)에 필요**하다 |
| `send_attempt` · `message_status_transition` | 발송 시도·상태 이력 | **A** | 그대로 |
| `audit_log` · `send_attempt.error_message` · `system_error` 메시지 | 감사·오류 | **C** | 그대로. 본문·비밀 금지(NFR-13 · I-20)가 **파기 감사에도** 적용된다(29.8) |
| `raw_input.request_ref` | 조회 파라미터(마스킹) | **C** | 그대로 |
| `comm_message.from_address` · `contact_channel_address.normalized_address` · `counterparty_contact` 이름 | 사람·주소 | **D** | 29.10 |
| `verification_request_handling.note` · `message_status_transition.note` · `container.cargo_description` | 운영자가 쓰는 **내부 메모** | **D** | 이번 파기 대상 아님. 외부 원문·개인정보를 넣지 않는 운영 규칙으로 관리 |

### 29.3 불변 규칙과 파기가 충돌하지 않는 이유

| 규칙 | 파기 뒤에도 지켜지나 | 이유 |
| --- | --- | --- |
| `event` → `raw_input` 삭제 금지 | **예** | `raw_input` **행은 남는다.** 없어지는 것은 `payload_ref` 가 가리키던 원문뿐 |
| `comm_message` 내용 컬럼 불변 | **예** | 행의 컬럼은 `message_content_ref` 와 `content_hash` 다. **둘 다 바뀌지 않는다** |
| `extraction` 16컬럼 UPDATE 금지 | **예** | `source_quote_ref` · `source_quote_hash` 는 바뀌지 않는다 |
| `message_approval` UPDATE 금지 | **예** | `approved_content_ref` · `approved_content_hash` 는 바뀌지 않는다 |
| 승인·발송 대조(I-3 · 15.5.1 여섯 조건) | **예** | 대조는 **지문**으로 한다. 파기는 발송이 끝난 뒤에만 가능하다(29.7) |

**파기는 어떤 기록 행에도 `UPDATE` 나 `DELETE` 를 하지 않는다.** 기록 쪽에서 보면 파기는 "아무 일도 일어나지 않은 것"이고, 무슨 일이 있었는지는 **감사 기록**이 말한다(29.8).

### 29.4 첨부와 HTML

- **원본 HTML 은 따로 저장하지 않는다.** 원문(RFC822) 안에 들어 있을 뿐이고 원문과 함께 파기된다. 그대로 렌더링하지 않고, 스크립트를 실행하지 않고, 원격 자원을 불러오지 않는다(NFR-16 · NFR-17). **사람 화면에는 안전하게 만든 텍스트**(`comm_message` 의 본문)만 보인다.
- **첨부도 원문 안에 있다.** MVP 에서는 **보관과 지문·메타데이터까지만** 다룬다(`attachment_manifest`). 첨부 내용 해석은 계속 범위 밖이다(`docs/21` 13절 · `docs/18` L절). 첨부는 원문과 같은 보관 정책을 탄다.
- `attachment_manifest` 에 **파일명을 넣지 않는다.** 파일명도 원문의 일부이고 민감할 수 있다("계약서_OO상사.pdf"). 지문·크기·형식이면 "무엇이 붙어 있었는지"의 증거로 충분하다.

### 29.5 추출 인용

`source_quote` 는 **이 사건이 원문의 어디에서 왔는지**를 사람이 확인하는 근거라 원문보다 오래 둘 수 있다. 하지만 **원문의 일부**이므로:

- **영구 감사 데이터가 아니다.** 보관 관리 내용(B)이다.
- 인용이 파기돼도 **사건 · 사건의 출처(`extraction_id` → `raw_input_id`) · 인용 지문 · 인용 위치(`quote_location`) · 추출 기록 자체**는 남는다.

### 29.6 보관 순서 (숫자는 정하지 않는다)

| 순서 | 무엇 | 비고 |
| --- | --- | --- |
| **가장 짧게** | 원문(RFC822) · 첨부 · 원본 HTML | 모든 것이 들어 있어 가장 위험하다. 재추출에만 필요하다 |
| **중간** | 안전한 텍스트 본문(`comm_message`) · 추출 인용 · 승인 문장 사본 · 제안 조건 원문 | 사람 확인·분쟁 대응의 근거 |
| **길게 (파기 대상 아님)** | 지문 · 외부 id · 시각 · 사건 · 구조화 값 · 결정 기록 · 발송 시도 · 상태 이력 · 감사 | **기록이다.** 보관 기간 정책으로 지우지 않는다 |

실제 일수는 **정책 파라미터**(보관 범주별)로 두고 지금 정하지 않는다. 파기를 실행할 때 **어느 판의 보관 정책**을 따랐는지는 감사 기록에 남는다(29.8).

### 29.7 지금 파기할 수 없는 내용 — 진행 중인 흐름이 쓰는 것

보관 기간이 지났더라도 **아직 흐름이 쓰고 있는 내용은 파기하지 않는다.** 파기하면 그 흐름이 근거를 잃는다.

| 내용 | 파기할 수 없는 동안 |
| --- | --- |
| 원문(`raw_input`) | 아직 처리되지 않았을 때(사건 생성·격리 판정 전) · 그 원문에서 나온 `extraction` 이 `PENDING` 일 때 |
| 메시지 제목·본문 | 업무 메시지가 **아직 발송되지 않았을 때**(유효한 승인이 있고 `SUCCESS` 발송 시도가 없음) |
| 승인 문장 사본 | 그 승인이 **아직 유효할 때**(15.5.1 여섯 조건) |
| 추출 인용 | `review_status = PENDING` 일 때 · 그 인용에서 나온 사실에 **열린 확인 요청**이 있을 때 |
| 제안 조건 원문 | 제안이 **아직 유효할 때**(`offer_status = RECEIVED` 이고 유효 기간 안) |

### 29.8 파기도 감사 대상이다

파기는 되돌릴 수 없는 행위이므로 `audit_log` 에 남긴다. **새 컬럼 없이 기존 컬럼으로 표현한다.**

| `audit_log` 컬럼 | 파기일 때 |
| --- | --- |
| `action` | `CONTENT_PURGED` |
| `target_type` | 내용 범주 — `RAW_INPUT_PAYLOAD`(첨부 포함) · `COMM_MESSAGE_CONTENT` · `MESSAGE_APPROVAL_CONTENT` · `EXTRACTION_SOURCE_QUOTE` · `COMMERCIAL_OFFER_CONDITIONS` |
| `target_id` | 기록 id (`raw_input_id` · `message_id` · `approval_id` · `extraction_id` · `offer_id`) |
| `actor_id` | 실행 주체 — 보통 `SYSTEM`, 사람이 요청했으면 그 사람 |
| `occurred_at` | 언제 |
| `request_context` | **어느 보관 정책 판**에 의해 (`retention_policy_version`) |
| `result` | `SUCCESS` · `FAILURE` (rev.2.5 표기 정정 — 작업표 값) |
| `before_ref` · `after_ref` | **참조만.** 내용은 절대 넣지 않는다 |

- **파기된 내용을 감사 기록에 복사하지 않는다.** 감사에 본문이 있으면 파기가 무의미해진다(NFR-13 · `docs/23` 4.4).
- 파기 작업이 기술적으로 실패하면 `audit_log`(`result = FAILURE`)와 함께 `system_error` 에도 남는다(`docs/23` 4.1 — 세 기록을 섞지 않되, 같은 실패가 두 곳에 남을 수 있다).
- **"이 내용은 파기됐나"는 저장하지 않고 조회로 만든다** — `audit_log` 의 `CONTENT_PURGED` · `SUCCESS` 행(21절).
- **`result = SUCCESS` 는 내용이 실제로 제거된 것을 확인한 뒤에만 남긴다.** 감사 기록이 삭제보다 앞서면 "감사는 성공, 내용은 그대로"인 상태가 생긴다.

#### 29.8.1 정상 파기와 데이터 손실을 구분한다 **(rev.2.4 보강)**

내용이 없는 이유는 둘 중 하나다 — **보관 정책에 따른 파기**이거나, **저장소 장애·파일 손실·비정상 누락**이다. 둘은 겉보기("내용 없음")가 같으므로 **감사 기록으로만 가를 수 있다.** 새 표·새 컬럼 없이 `audit_log` 와 `system_error` 로 판정한다.

| 내용이 있나 | 그 참조에 대한 **성공한** `CONTENT_PURGED` 감사가 있나 | 판정 | 처리 |
| --- | --- | --- | --- |
| 있다 | 없다 | **보관 중** | 정상 |
| **없다** | **있다** | **정상 파기** | 정상. 화면에는 "보관 정책에 따라 파기됨" |
| **없다** | **없다** | **데이터 손실** — 정상 파기로 간주하지 않는다 | **`system_error`**(저장소 오류·데이터 손실). 운영 대응 대상 |
| 있다 | 있다 | **파기 불일치** — 감사는 성공인데 내용이 남아 있다 | **`system_error`**. 파기를 다시 실행하거나 감사 기록을 대조한다 |

**파기할 때 바뀌는 것과 바뀌지 않는 것**

| 바뀌지 않는다 | 바뀐다 |
| --- | --- |
| 부모 기록 행 · 참조(`*_ref`) · 지문(`*_hash` · `content_hash` · `payload_hash` · `approved_content_hash`) | 참조가 가리키던 **민감한 내용만** 제거된다 |
| | `audit_log` 에 `CONTENT_PURGED` 행이 **추가**된다(덧붙이기) |

- 파기 작업이 **내용 제거 뒤, 감사 기록 전에** 멈추면 그 참조는 "내용 없음 + 감사 없음"이 되어 **손실로 판정**된다. 조용히 넘어가는 대신 **시끄럽게 실패하는 쪽**이다 — 운영자가 확인하고 감사 기록을 보완한다.
- 이 대조는 17.4 규칙 3(주기적 고아 참조 점검)과 같은 **운영 점검 작업**으로 돌린다. 내용을 읽으려다 부재를 만났을 때도 같은 판정을 한다.
- `system_error` 에는 참조와 범주만 남기고 **내용은 남기지 않는다**(I-20 — 어차피 내용이 없다).

### 29.9 파기 뒤에 되는 것과 안 되는 것

**재현성과 재처리 능력은 다른 것이다.**

| | 원문이 있는 동안 | 원문이 파기된 뒤 |
| --- | --- | --- |
| `event` → `canonical_fact` **재계산**(I-7) | 된다 | **된다** — 사건은 원문에 기대지 않는다 |
| 과거 `planning_snapshot` **재현**(I-12 · I-27) | 된다 | **된다** — 스냅샷은 값을 복사해 뒀다 |
| **감사**(누가 무엇을 했나) | 된다 | **된다** — 감사 기록에 본문이 없었으므로 잃는 것이 없다 |
| **Q-44 시각 재판정** | 된다 | **된다** — 두 시각이 사건 `payload` 에 있다(11.2e) |
| 승인·발송 **대조** | 된다 | **된다** — 지문으로 한다 |
| "이 사건은 어디서 왔나" | 된다 | **된다** — 원문 기록 행·지문·외부 id·추출 기록이 남는다 |
| 원문에서 **다시 추출·다시 파싱** | **된다**(`docs/20` A-05) | **안 될 수 있다** |

**A-05 는 유지한다.** "원본을 다시 읽어 재실행할 수 있어야 한다"는 **원문이 보관되어 있는 동안** 보장된다. 원문이 파기된 뒤 재추출할 수 없는 것은 규칙 위반이 아니라 **사용자가 정한 보관 정책의 정상적인 결과**다.

> **Reconciliation 재현성 ≠ 원문 재처리 능력.** 앞의 것은 사건이 있는 한 영원히 보장되고, 뒤의 것은 원문이 있는 동안만 보장된다.

### 29.10 연락처는 다른 문제다

`counterparty_contact` · `contact_channel_address`(그리고 받은 메일의 `from_address`)는 메시지 본문과 **다른 개인정보 문제**다. 발송 자격·권한 판정에 쓰이므로 본문과 같은 방식으로 파기할 수 없다.

- 이번에 정하는 것: **관계가 끝나면 비활성화**(`is_active` · 주소의 통신 활성 상태)할 수 있다. **향후 익명화·삭제 정책이 필요하다.**
- 정하지 않는 것: 실제 익명화 방식, 보관 의무 기간, 법적 요구사항 — **`[TO VERIFY]`**. Q-48(공용 메일함)·향후 개인정보 정책과 함께 본다.

### 29.11 단계별

| 단계 | 정한 것 | 정하지 않은 것 |
| --- | --- | --- |
| **Tech Validation** | **전용 테스트 계정만** 쓴다 · **개인·회사 실메일을 쓰지 않는다** · 테스트에 필요한 최소 데이터만 · **단계가 끝나면 원문·내용을 정리**한다(fixture 로 남길 것은 합성·마스킹본만 — `docs/01` 6절) | 자동 삭제 일수 |
| **Pilot · Production** | 보관 구조와 파기 방식(이 절 전체) | **실제 보관 기간** — 고객사 IT · 계약 · 보안 요구 · 감사 요구 · 개인정보·관련 법률 검토가 필요하다. **Pilot 정책으로 OPEN** |

### 29.12 여기서 닫은 것과 열어 둔 것

| | 상태 |
| --- | --- |
| 기록과 내용의 분리 · 참조 + 지문 · 행 삭제 없음 | **CLOSED** |
| 파기 가능 조건(29.7) · 파기 감사(29.8) | **CLOSED** |
| 보관 순서(29.6) | **CLOSED** — 순서만 |
| 보관 기간 **숫자** | **OPEN** — 정책 파라미터 · Pilot 결정 |
| 물리 저장 위치 · 파기 작업의 실행 방식 · 자동 삭제 스케줄 | **물리 설계·구현**(T-080 이후) |
| 연락처 익명화·법적 보관 의무 | **`[TO VERIFY]`** |
