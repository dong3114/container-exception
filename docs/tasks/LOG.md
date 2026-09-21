# 작업 인계 로그

- 새 항목은 **맨 위**에 추가한다. 기존 항목은 수정하지 않는다(append-only).
- 다음 에이전트는 최근 3개 항목을 읽고 시작한다.

## 템플릿

```markdown
## YYYY-MM-DD · T-NNN · 에이전트명
- 상태: 완료 | 중단 | 차단
- 한 일:
  - ...
- 변경 파일:
  - ...
- 검증: 실행한 테스트·확인 방법과 결과
- 남은 일 / 다음 한 걸음:
  - ...
- 큐 변경: 추가·상태변경한 태스크 ID
- 주의사항: 다음 작업자가 알아야 할 것
```

---

## 2026-09-18 · T-070 주변 문서 동기화 · Claude Code (claude-opus-5)
- 상태: **완료 — T-070 DONE** (사용자 검토 → 판정 B → `docs/05`·`docs/18` 정리 후 종료). **미커밋 — commit 은 사용자 지시 대기**
- 목적: 확정된 설계(`21` 승인 · `22` rev.2.2 · `23` · ADR-026~031)를 주변 문서에 맞춰, 다음 에이전트가 오래된 문서를 읽고 잘못 구현하지 않게 한다. 새 설계 없음
- 한 일
  - `docs/04`: 1절 엔티티를 `21`·`22` 요약으로(B/L 독립 + `container_bl`, Destination·Carrier 는 역할, Facility·TruckPool, 통신 개념) · 3절 마스터 기준선 vs 사실 · 4절 견적 3층(CommercialOffer 근거 → 요율 사실 → 현재 요율) · 5절 비용 3종 · 7절 운영자 입력 4갈래 신설
  - `docs/07`: Python·FastAPI·SQLite 확정 표현 → "미결 — `23`", 모듈 그림에 오류 처리·채널, 2.2절 외부 통신 흐름, 3절 "(초안)", **4절을 `22` 대응표로 교체(X-10)**, 구현 상태 명시
  - `docs/13`: 닫힌 결정 반영(Facility · Destination · Actor · MBL/HBL · Resource · RateQuote → CommercialOffer · 저장 이름) + 4.1절 통신·상업 용어 19개(X-11)
  - `docs/19`: 문의 메시지 vs 발송 시도(X-12) · 확인 메일에 업무 질문·숫자 금지 · 승인 기록 방식 · 기술 실패는 사건이 아님 · 절 참조 정정
  - `AGENTS.md` 1.1: `ai/` = LLM·비정형 처리만, 결정론 엔진 = `back/`(ADR-029) · `back/`·`ai/`·`packages/`·`infra/`·루트 README 정리
  - `docs/18`: 머리 주석 + **본문** D.1(논리 설계 대응표) · E.1(발송 중·재시도는 `send_attempt`) · E.4 · H.2(발송 시도 행 기반 화해) · H.3 · H.4(무효화 행·`expires_at`) · K.1 · N.2
  - `docs/05`: 정본 관계 주석(개념 규칙 = `05`+`21`, 표·필드 = `22`)과 **결정 대기 네 곳** 표시 · `docs/06` G4 · `docs/12` T-041 · `docs/16` 라벨 · `docs/15` X-10~X-13 표시
- **새로 발견 → T-081 로 분리**: `docs/22` 의 `event` 가 `docs/05` 4.2 와 대조되지 않았다 — 사람 확인(VERIFICATION)·정정 사건 표현 없음, 검증기 `confidence` 자리 없음, 출처 종류 값 목록 두 벌(ADR-020 vs `22`), `idempotency_key`·`event_type`·`schema_version`·`extraction.method` 미표현. T-079 검증이 `22` 내부 정합성과 Markdown↔작업표 대조에만 집중해 놓쳤다
- 검증: `git diff --check` 통과 · staged 0건 · `docs/21`·`docs/22`·`docs/23` 변경 0건 · 제품 코드 변경 0건(`front/web` 기존 diff 그대로) · `docs/18` 에 `comm_message_events` 가 발송 시도 정본으로 남은 곳 0건(대응표의 옛 이름 칸만)
- 큐 변경: T-070 DONE → 완료 섹션 · **T-081 신설(P0, T-069 의존)** · 순서 T-081 → T-069 → Backend·DB 기술 결정 → T-080
- 다음 한 걸음: 사용자 지시 시 commit → T-081
- 주의사항: T-081 결정 전까지 사람 확인 사건·검증기 confidence·출처 종류 값은 **`docs/05`·`docs/22` 어느 쪽으로도 구현하지 않는다**

## 2026-09-18 · T-079 DONE — Minor Cleanup 4건 + 종료 처리 · Claude Code (claude-opus-5)
- 상태: **완료 — T-079 DONE** (사용자 + ChatGPT rev.2.2 최종 승인). **미커밋 — commit 은 사용자 지시 대기**
- 경과: 읽기 전용 최종 검증 판정 **B(READY AFTER MINOR CLEANUP)** — 구조 문제·blocker 없음, 표현 4건만 → 사용자가 4건 정리 + 종료를 지시
- 고친 것 (4건, 새 설계 판단 없음)
  1. **QUEUE 순서 통일**: "다음 추천" 번호 목록을 T-070(1) → T-069(2, Q-44·Q-45·L-13·첫 슬라이스) → Backend·DB 기술 결정(3, 사용자) → T-080(4) → 구현(5) 로 재배열. T-069 제목의 "다음 작업 / 1순위" 제거, T-070 을 "다음 작업 / 1순위"로. "실행 가능"·"앞으로의 순서"·T-080 의존·T-079 완료 블록의 옛 후속 순서 표기를 같은 순서로 맞춤
  2. **기술 결정 시점 표현 통일**: "T-080 때 닫는다 / T-080 에서 확정" → **"T-069 가 첫 슬라이스·요구사항 확정 → 사용자가 Backend·DB 결정 → T-080 이 결정된 기술을 물리 설계에 반영"**. `docs/23`(머리 표 · 2절 · 3.1 · 3.3 · 13절)에 더해 **같은 표현이 있던 `docs/14` ADR-031(요약·상태 줄) · `docs/01` 7절 · `docs/22` 28절 5번**도 같은 뜻으로 맞췄다(후보 상태는 그대로, 기술 확정 없음)
  3. **`docs/22` 1.3 요약 표에 `plan_decision` 행 추가**: `DECISION_RECORD` · `APPEND_ONLY` — 13.5 와 같은 의미(결정이 바뀌면 새 결정 행)
  4. **작업표 `message_approval`**: `approved_subject` · `approved_body_text` 제약을 "APPROVED 이고 원 메시지에 값이 있으면 필수" 로 Markdown 과 일치
- 종료 처리: QUEUE T-079-R·T-079 DONE, `진행 중` 비움 · CURRENT 를 **IDLE**(다음 작업 T-070)로 — T-073~T-079 경과는 이 LOG 에 있으므로 CURRENT 에서 뺐다(이전 내용은 `687d458` 의 CURRENT 에 남아 있다) · `docs/22` 상태 "rev.2.2 최종" · `docs/README.md`·`AGENTS.md` 상태 표기
- **최종 상태**: `docs/21` 승인·동결(무변경) · `docs/22` rev.2.2 최종 — **MVP 51 · Next 1 · MVP 에서 만들지 않음 2 = 54**(작업표 블록 52 · 컬럼 557) · `docs/23` 추가(ADR-030·031 Proposed, 기술 최종 결정 아님)
- 검증: `git diff --check` 통과 · 4건 Markdown ↔ 작업표 차이 0 · QUEUE 순서 충돌 0 · 기술 결정 시점 충돌 0("T-080 에서 확정" 류 표현 0건) · `plan_decision` 변경 방식 충돌 0 · staged 0건
- 하지 않은 것: 새 표 · `docs/21` 수정 · 기술 확정 · `AGENTS.md` 1.1절 `ai/` 행(T-070) · `front/web/`·`data/Proposal/`·`scripts/` · staging·commit·push
- 다음 한 걸음: **사용자 지시 시 commit** → **T-070**
- 주의사항: 바로 아래 항목(같은 날 rev.2.2 정리)의 "최종 검토 대기"는 당시 상태다. 2026-09-17 항목들의 "미커밋"은 rev.2.1 이 `687d458` 로 저장되기 전 표현이다

## 2026-09-18 · T-079 최종 정리(rev.2.2) + 런타임·관측성 문서화 · Claude Code (claude-opus-5)
- 상태: 완료 (**사용자 + ChatGPT 최종 검토 대기 · rev.2.2 미커밋**). rev.2.1 은 이미 `687d458` 에 저장돼 있다 — 바로 아래 2026-09-17 항목의 "미커밋"은 당시 표현이다(LOG 는 append-only 라 고치지 않았다)
- 지시: ① T-079 최종 검증에서 나온 A~E 정합성 5건 + 표현 잔재 정리 ② 시스템·외부 연동 오류 추적 구조를 설계 문서에 반영 ③ Backend·Web·Desktop 기술 방향이 기존 문서에 있으면 갱신, 정본이 없으면 새 문서 **하나**. 기술을 최종 결정하지 않는다. 제품 코드·SQL·staging·commit·push 금지. `docs/21` 수정 금지
- 조사 결과: 관측성·오류 처리 정본 문서 **없음**(`observability`·`trace_id`·`system_error` 0건). Backend 기술은 ADR-002(Python/FastAPI, **Proposed**)·`docs/07` 3절·`docs/01` 7절(초안)에만 있음. Desktop 은 ADR-024 "방향(미확정)"·`docs/07` 6절·루트 README 에 "Tauri 검토" 한 줄씩. NestJS·Spring·Electron 언급 0건. `docs/17` 의 AI 협업 역할은 사용자가 말한 역할과 **이미 일치**(수정 불필요)
- 한 일
  - `docs/22` **rev.2.2**: A `message_approval` 컬럼 표 "조건부" + 무결성 규칙 1~8 · B `send_attempt`(15.7.3)·`extraction`(15.9.1) 생애주기 · C `value_path` NOT NULL + "전체" 표시(물리 문자열은 T-080) · D `is_simulated` 2건 표기 · E `<RECOVERY_CONTEXT_REF>` · 유효 승인 **여섯 조건** 통일 · 안티패턴·절 번호 · 17.1 표 · 17.3 논리 연결 키 행 · L-1 · 머리의 커밋 표기(설계 입력 `1b97905` / rev.2.1 저장 `687d458`, 자기 최신 커밋은 적지 않음) · 28절 새 순서 · `vessel_call` 컬럼 표기
  - **`system_error` 추가**(16.2a): 분류 `EVIDENCE` · `APPEND_ONLY` · 20컬럼 · 다형 관련 개체(DB FK 없음, 쓰기 경로 존재 검사 예외) · I-18~I-20 · 27.8 Gmail 503 walkthrough · 27.6 H(4항목, 총 30항목) · 23절 "개념 모델 밖 기술 운영 표" · 21절 Activity Timeline 에 섞지 않음
  - 작업표: A~E 반영, `system_error` 블록, `00_목록` 51/1/2/54, `10_OpenDecisions` 제목·L-1·Q-66
  - **`docs/23_runtime-platform-and-observability.md` 신설**: 기준선 · Backend 후보 비교(**현재 우선 후보 NestJS + TypeScript**, Spring Boot 후보 유지, Python ADR-002 기록 유지) · **솔버 위험(3.3)** · 세 기록 분리 · 세 경계 공통 오류 처리 · DB vs 로그 기준 · 비밀 금지 · `request_id`·`trace_id`(업무 `correlation_id` 와 구분) · 공통 Integration Client · 오류 정규화 예시 · Web First · Desktop = Client · Electron 첫 후보/Tauri 나중 · `DesktopBridge` · AI 런타임 분리 조건 · OpenAPI · 미룬 결정과 시점
  - ADR-030(오류·관측성) · ADR-031(런타임 방향) **Proposed**. ADR-002·024 에 2026-09-18 주석
  - `docs/01` 6절(로그·오류 기록 비밀 금지)·7절(Backend 미결), `docs/07` 3·6절 참조 주석, `docs/12` 7절 Desktop 한 줄, `docs/13` 용어 5개, `docs/15` Q-64~Q-67, `docs/README.md`·`AGENTS.md`·루트 `README.md` 색인·Desktop 문구
- 테이블 수 (실제로 다시 셈): **MVP 51 · Next 1 · MVP 에서 만들지 않음 2 = 54**. 작업표 블록 52 · 컬럼 557. Markdown 2절 목록 ↔ 작업표 블록 이름 차이 0건
- 검증: Markdown ↔ 작업표 컬럼 대조(차이 0 — 축약 표기 제외), PK 컬럼 NULL 허용 0건, 목록 시트 ↔ 블록의 분류·변경 방식 일치, `git diff --check` 통과, staged 0건, 제품 영역 변경 0건, `docs/21` 변경 0건
- 하지 않은 것: 기술 최종 결정 · 제품 코드 · SQL · 대응 이력 표 · 오류 코드 전체 목록 · L-13 결정 · `back/`·`ai/`·`packages/` README 수정(T-070) · `docs/07` 본문 전면 정리(T-070) · 옛 LOG 항목의 "미커밋" 수정 · staging·commit·push
- 변경 파일: `docs/22_cera-logical-data-model.md`·`.xlsx` · **`docs/23_runtime-platform-and-observability.md`(신규)** · `docs/01` · `docs/07` · `docs/12` · `docs/13` · `docs/14` · `docs/15` · `docs/README.md` · `AGENTS.md` · `README.md` · `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 큐 변경: T-079-R 을 rev.2.2 + `docs/23` 검토로 갱신 · 순서를 T-070 → T-069 → 기술 결정 → T-080 으로 · **T-080 을 템플릿 코드 블록 밖으로 옮기고** 의존·범위(첫 슬라이스부터)를 고침 · T-069·T-070 에 2026-09-18 추가 항목
- 남은 일 / 다음 한 걸음: 사용자 + ChatGPT 최종 검토 → T-079 DONE → T-070
- 주의사항: **Backend 언어는 결정되지 않았다.** NestJS 를 고르면 솔버를 어디서 돌릴지(Q-65)를 같이 답해야 한다. `system_error` 는 업무 개념이 아니며 `event`·계산·Activity Timeline 으로 흘러가지 않는다

## 2026-09-17 · T-079 rev.2.1 최종 정합성 패치 · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — T-079 최종 승인 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건. **새 테이블 0개**
- 지시: rev.2 검토 결과 **전체 구조는 승인 가능하지만 물리 설계 전에 정합성 몇 건을 정리**해야 한다. **새 설계를 벌리지 말고** 지적된 것만 닫는다. 이 작업 뒤 T-079 를 최종 승인·종료한다
- 고친 것 (9건)
  1. **`conflict` 에 적용 범위 2컬럼.** `canonical_fact` 의 식별자에 범위가 들어간 순간 충돌 판정 단위도 좁아져야 한다. `GLOBAL` 15,000원과 `RECOVERY_CONTEXT` 0원을 한 충돌로 묶으면 **있지도 않은 모순을 운영자에게 확인하라고 요구**하고 `blocks_automation` 까지 선다
  2. **`verification_request` 에 적용 범위 2컬럼.** "평소 얼마인지 확인" 과 "이번 건 얼마인지 확인" 은 다른 문제다. 범위를 빼면 한 줄로 합쳐져 하나를 처리하면 다른 것도 처리된 것처럼 보인다
  3. **`request_key` 재료에 범위 포함.** 안 넣으면 두 확인 요청이 같은 키를 갖고 처리 기록이 잘못 붙는다
  4. **`question_item.target_applicability_scope_*` 신규.** "이번 사고 건 보관료" 와 "일반 보관료" 는 개체도 사실 키도 같고 범위만 다르다. **Backend 가 질문 만들 때 확정**해야 회신을 사건으로 만들 때 범위가 결정론적으로 나온다. LLM 출력은 그대로(`ask_id` + 값 + 단위 + 인용) — **범위는 LLM 이 만지지 않는다**(ADR-026)
  5. **`question_item.verification_request_key` 의 FK 표기 제거.** `verification_request` 는 `REBUILDABLE` 이라 없어졌다 다시 생긴다. 사람이 실제로 보낸 질문이 파생 행의 생존에 의존하면 안 된다. `handling.request_key` 와 완전히 같은 취급
  6. **발송 지문 비교 대상 분리.** rev.2 는 "`approved_content_hash` 와 같아야 한다"고만 적어, 승인이 없는 주소 확인 메일에서 모순이었다. 업무 = **유효한 승인**의 지문 / 주소 확인 = **그 메시지의 `content_hash`**. **어느 쪽도 "작성한 내용 != 보낸 내용" 은 허용하지 않는다.** I-3 를 I-3 / I-3b 로 나눴다
  7. **승인 행 종류별 필수 컬럼 분리.** `APPROVED` 만 내용·수신자·지문·구조화 값 사본 필수. `REJECTED`/`REVISION_REQUESTED` 는 사유 필수 + 사본 선택. `REVOKED`/`INVALIDATED` 는 **대상 + 사유 종류만** 필수 — 새 내용을 승인한 행이 아니므로 사본을 요구하지 않는다. 무효화 대상은 **같은 메시지의 `APPROVED`**, 승인당 최대 1건(I-17)
  8. **분류(Classification)와 변경 방식(Mutation Policy) 분리.** rev.2 는 `SOURCE_OF_TRUTH` = 덧붙이기만 이라고 적었는데 실제로는 제어된 UPDATE 가 있다. 두 축으로 나누고 **49개 표 전부에 변경 방식 코드**를 붙였다(`APPEND_ONLY` · `REBUILDABLE` · `CONTROLLED_UPDATE` · `IMMUTABLE_AFTER_CREATE` · `CACHE_UPDATE` · `VERSION_REPLACEMENT`). **"Source of Truth = 무조건 append-only" 라는 일반 문장은 지웠다**
  9. **`contact_verification` 생애주기 명시.** `used_at`·`result` 를 갱신하므로 "덧붙이기만"이 아니다. **발급 기록 6컬럼은 불변**, **사용 결과 2컬럼만 한 방향으로 한 번** 바뀐다. 이 정도를 위해 별도 이력 표를 만들지 않았다
- **적용 범위 전파 점검표 신설**(22.5): 범위를 **갖는 8곳**과 **갖지 않는 곳 + 이유**를 전부 대조했다. `extraction` 에 범위를 두지 않는 것이 LLM 경계를 지키는 방법이고, `commercial_offer` 는 근거라서 범위가 사건으로 갈 때 정해진다
- **범위 선택 정책은 확정하지 않았다.** `CONTRACT`·`CONTAINER`·`RECOVERY_CONTEXT` 는 서로 다른 축이라 "좁다/넓다"로 한 줄에 못 세운다. 확정한 것은 ① 범위는 사실 식별자에 포함 ② 같은 범위끼리만 Reconciliation ③ 결정론적 선택 정책이 필요함 ④ 쓴 범위는 스냅샷에 남음 까지. **L-14 에 포함**하고 새 OPEN 항목을 만들지 않았다
- rev.1/rev.2 잔재 정리 9건: 상단 "12건" → 실제 개수 · Structured Draft Field → `comm_message_structured_field` · L-2/L-3/L-9/L-10 의 "사용자 결정 필요" → D-1~D-5 CLOSED · PK 열 수(4열 → **6열**, 실제로 세어 확인) · ERD 의 `canonical_fact` PK 에 범위 추가 · 21절 "D-5 로 열려 있다" 제거
- 테이블 수: **변화 없음** — MVP 50 · Next 1 · MVP 에서 만들지 않음 2 = **53**
- 검증: 흐름 walkthrough 재실행, **26개 항목 전부 통과**(27.6). **새로 발견된 구조 문제 없음**. `git diff --check` 통과 · staged 0건 · 제품 영역 변경 0건 · Markdown 2절 ↔ 작업표 블록 불일치 0건 · 작업표 잔재 0건
- 하지 않은 것: 새 테이블 · 새 개념 · DB 제품·ORM·SQL·인덱스 · UUID/ULID 확정 · 범위 우선순위 규칙 · L-13 복구 맥락 식별자(T-069) · **`docs/21` 수정** · `docs/04`·`07`·`18`·`19` 수정(T-070) · 제품 코드 변경 · staging·commit·push
- 변경 파일: `docs/22_cera-logical-data-model.md`(2,412행 · 0~28절), `docs/22_cera-logical-data-model.xlsx`(11 시트 · 블록 51 · 컬럼 537 · 681행), `docs/15`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 큐 변경: **T-079-R** 을 rev.2.1 최종 승인으로 갱신. T-080 물리 설계 대기
- 남은 일 / 다음 한 걸음: **T-079 최종 승인** → T-080 물리 설계
- 주의사항: **논리 모델 50개 표 ≠ 첫 마이그레이션 50개 표**(26절). 첫 구현은 T-069 외부 통신 슬라이스의 최소 묶음부터다

## 2026-09-17 · T-079 rev.2 논리 설계 구조 정합성 수정 · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 사용자 + ChatGPT 최종 검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: rev.1 검토 결과 **방향은 좋으나 물리 설계 전에 고쳐야 할 구조 정합성 문제**가 있다. **논리 모델을 갈아엎지 말고 지적된 것만 최소 범위로** 수정한다. `docs/21` 은 승인 문서라 수정 금지
- **사용자 결정 5건 전부 CLOSED**: D-1 연결 테이블 유지 · D-2 제안 묶음 만든다 · **D-3 기본값을 "현재 복구 맥락"으로 변경**(rev.1 추천 뒤집음) · D-4 계획 배치 만들지 않는다 · D-5 예외 Case 만들지 않는다(나중에 다시 연다)
- 고친 것 (13건)
  1. **`raw_input.payload_hash` 유일 제약 제거.** 09시와 10시에 같은 값을 관측해도 **"다시 확인했다"는 새 수집 사실**이다. 내용이 같다고 행을 막으면 신선도가 09시에 멈춘다. 중복 처리는 출처가 주는 `source_record_key` 로만 한다
  2. **`verification_request_handling.request_key` 를 DB 외래키에서 논리 연결 키로.** 파생 테이블을 지울 수 있다는 말과 외래키가 동시에 성립하지 않았다
  3. **`request_key` 재료에서 `conflict_id` 제거.** 파생 대리키라 재계산 때 값이 바뀌어 과거 처리 기록을 못 찾는다 — 이 구조가 막으려던 바로 그 문제였다. 재료를 불변 정보(규칙 + 개체 + `fact_key` + 사건 id 집합)로 바꿨다
  4. **스냅샷 보강 — 신규 `planning_snapshot_constraint` · `planning_snapshot_input`.** rev.1 은 사실만 얼려서, 마스터의 `default_travel_minutes_from_terminal` 을 다음 달에 고치면 과거 실행이 재현되지 않았다. 원칙을 명시했다: **계산에 쓴 모든 바뀔 수 있는 입력은 값으로 얼리거나 불변 판을 가리킨다**
  5. **승인에 구조화 숫자 고정 — 신규 `comm_message_structured_field` · `message_approval_structured_field`.** 숫자가 본문 문자열에만 있으면 검사도 승인 고정도 문자열 비교가 된다. 값·단위·출처(실행·질문·경로)를 나눴다
  6. **승인 생애주기.** `expires_at`(만들 때 정함) + `decision = REVOKED·INVALIDATED` + `invalidates_approval_id` + `invalidation_cause`. **UPDATE 없이** 취소·만료·계획 교체를 남긴다
  7. **주소 확인 메일의 승인 예외.** `comm_message.message_kind`(`BUSINESS`/`CONTACT_VERIFICATION`) + `contact_verification_id`. `send_attempt.approval_id` 는 **조건부 필수**. 위장 방지 규칙 8개를 적었다(구조화 값·질문 연결 0건, 종류 변경 불가, 감사는 남는다)
  8. **`ACTUAL_REPORTED` 제거.** 실제 발생액 보고는 계산 결과가 아니라 **현실 주장**이고 `event` → `canonical_fact` 로 간다. MVP 는 `ESTIMATED` · `PLAN` 둘뿐
  9. **`event.source_tier` 제거.** 근거 강도는 정책으로 **계산되는 값**이라 append-only 원천 컬럼에 두면 정책이 바뀌어도 고칠 수 없다. 원천 축(`source_kind`·`source_role_at_ingestion`·`input_quality`)만 남기고 `canonical_fact.evidence_strength` + `evidence_policy_version` 으로 옮겼다
  10. **사건마다 SUBJECT 정확히 1건.** 주체가 여럿이면 `canonical_fact` 의 키와 대응이 깨진다. 영향받는 컨테이너는 주체가 아니라 **위험 계산 결과**다
  11. **`bl` 단순화.** `mbl_no` + `hbl_no` 두 컬럼 → **번호 하나 + 종류 + 부모 참조**. `(bl_type, bl_no, bl_year)` 는 **업무 식별 후보로만** 두고 실제 `UNIQUE` 는 실데이터 확인 뒤로 미뤘다(L-16) — 번호가 연도 안에서 유일한지는 확인된 적이 없다
  12. **적용 범위와 유효 기간 분리 (22절 신설).** rev.1 은 적용 대상을 "사실의 주체로 정해진다"고 봤는데 틀렸다. 주체가 창고 B 인 것은 "창고 B 이야기"라는 뜻일 뿐이다. `applicability_scope_type`·`applicability_scope_ref` 추가, **기본값은 좁은 쪽**
  13. **계획 조건 해제도 새 행.** `released_at` 을 나중에 채우는 것이 바로 UPDATE 였다. `action = SET/RELEASE` + `releases_constraint_id`
- **흐름 검증(27절)에서 새 모순 1건 발견·수정**: 범위가 다른 현재 사실이 `canonical_fact` 의 같은 PK 를 다퉜다. 운영자의 "이번 건 0원"이 시설 전체 요율을 덮어쓸 수 있었다 → **PK 에 범위 2컬럼 추가**, 계산 시점에 가장 좁은 범위 선택(11.4.1)
- 테이블 수: **MVP 50**(46 → +4) · **Next 1** · **MVP 에서 만들지 않음 2** = **53**. 삭제 0건
- 신규 열린 질문: **L-13** 복구 맥락 식별자(T-069) · **L-14** 범위 값 목록(현업 검증) · **L-15** `message_kind` 값 목록 · **L-16** `bl` 유일 제약(실데이터)
- 하지 않은 것: DB 제품·ORM·`CREATE TABLE`·마이그레이션·인덱스 · UUID/ULID/BIGINT 확정 · API endpoint · 솔버 · LLM 공급자 · **`docs/21` 수정** · `docs/04`·`07`·`18`·`19` 수정(T-070) · 제품 코드 변경 · staging·commit·push
- 변경 파일: `docs/22_cera-logical-data-model.md`(2,138행), `docs/22_cera-logical-data-model.xlsx`(11 시트·블록 51·컬럼 531·678행), `docs/15`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git diff --check` 통과 · staged 0건 · 제품 영역 변경 0건 · Markdown 2절 목록 ↔ 작업표 블록 대조 불일치 0건 · rev.1 잔재(`source_tier`·`ACTUAL_REPORTED`·`mbl_no`/`hbl_no`·`released_at` 채우기) 확정 표현 0건(설명 문단만 남음)
- 큐 변경: **T-079-R** 을 rev.2 검토로 갱신. T-080 물리 설계는 그대로 대기
- 남은 일 / 다음 한 걸음: **rev.2 최종 검토** → T-080 물리 설계
- 주의사항: **논리 모델 50개 표 ≠ 첫 마이그레이션 50개 표**(26절). 첫 구현은 T-069 외부 통신 슬라이스에 필요한 최소 묶음부터다

## 2026-09-17 · T-079 논리 DB 설계 (Logical DB Design) · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 사용자 + ChatGPT 검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 전제: **T-076 에서 개념 모델 rev.3 이 최종 승인**됐다. 승인된 `docs/21` 은 이 작업에서 **한 글자도 고치지 않았다**. 문제가 보이면 고치지 말고 기록하라는 지시를 따랐고, 개념 모델 자체의 문제는 **발견되지 않았다**
- 산출물
  - **`docs/22_cera-logical-data-model.md`** (0~25절, 1,364행): 벤더 중립 논리 타입 · 테이블 분류 7종 · 전체 목록 · 테이블로 만들지 않은 개념 + **금지 안티패턴 10종 각각을 어떻게 피했는지** · **열린 질문 판정 20건** · 도메인 A~J 테이블 명세(기본 정보 · 컬럼 · 관계 · 무결성 규칙) · 식별자/시간/금액 모델 · 키·제약·참조 무결성 · 코드값 정책 · 논리 ERD · 시뮬레이션 분리 · 파생 조회 · **개념→테이블 추적표(E-01~E-39 전부)** · 문서 차이 X-10~X-13 · **사용자 결정 5건**
  - **`docs/22_cera-logical-data-model.xlsx`** (11 시트: `00_목록` · `01_물류핵심` ~ `09_감사운영` · `10_OpenDecisions`): 테이블 블록 **47개** + OPEN 2, 컬럼 **475개**, 데이터 **619행**. RPG 스타일(Arial · 기본키 `FFFF00` / 외래키 `93C47D` / 유일 제약 `F4CCCC` / 한글 필드행 `CFE2F3` / 테이블명 `D0E0E3` · 우측 범례 · 테두리 · 눈금선 끔)
- 테이블 수: **MVP 46 · Next 1(`vessel_call`) · OPEN 2(`exception_case` · `operational_plan_batch`) = 49**. 개수의 정본은 `docs/22` 2절 표 하나다
- 이번에 답한 것 (정본 `docs/22` 4절, 요약 `docs/15`)
  1. **Q-54** 외부 식별자 — **하이브리드**. 조회 경로 id 는 컬럼(`comm_message.external_message_id` · `comm_thread.external_thread_id`), 발급 기관이 늘어나는 화물·통관 id 는 `external_identifier(issuing_system, id_type, id_value)`
  2. **Q-55** 시설 — **공통 + 1:1 상세** (`facility` + `facility_warehouse`·`facility_terminal`·`facility_odcy`)
  3. **Q-58** 금액 — **Money 테이블 없음**. `cost_line_item` 의 5컬럼 묶음(원화 정수 + 원통화·금액·환율·기준일)
  4. **Q-59** 확인 요청 — **결정적 `request_key`**. 파생 대리키를 참조하면 재계산마다 사람의 처리 이력이 끊긴다
  5. **Q-60** 비용 줄 — 필수 부모는 `cost_result` 하나. 귀속·근거는 `cost_line_link(link_role ∈ ATTRIBUTION·BASIS)`
  6. **Q-62** Actor — 최소 4컬럼. 인증·권한·조직은 나중
  7. **Q-63** 사실 키 — **원본은 문자열 그대로**, 분해 컬럼(`param_date` 등)은 파생 `canonical_fact` 에만
  8. **L-1** 질문 항목 — 질문 생성 시 **대상 개체·사실 키를 확정**해 회신이 `ask_id` 단건 조회로 붙는다. LLM 이 사실 키를 정하지 않는다(ADR-026)
  9. **L-4** `default_` 접두(평시 기준선) · **L-5** 풀·슬롯 수준 배정 · **L-7** `send_attempt` 별도 테이블 · **L-8** 같은 테이블 + `is_simulated`/`contains_simulated` · **L-11** 승인 덧붙이기 + 승인 시점 사본 · **L-12** `operator_planning_constraint`(현실 사실이 아님, 솔버 표현은 미확정)
- **사용자 결정 필요 5건 (숨기지 않았다)**: **D-1** Container↔B/L 연결 테이블(L-2) · **D-2** 제안 묶음 생성(L-3) · **D-3** 운영자 입력의 기본 적용 범위(L-3b·L-12) · **D-4** `operational_plan_batch` 미생성 확정(L-9) · **D-5** `exception_case` 생성 여부(L-10·L-6)
- 설계에서 지킨 선: **정정은 UPDATE 가 아니라 새 행**(`supersedes_event_id`) · **계획 입력은 값을 복사해 얼린다**(`planning_snapshot_fact`) · **계산 결과는 사람이 고치지 않는다**(입력을 고치고 재계산) · **승인 없이 발송 시도 행이 생길 수 없다** · **비밀값은 DB 에 넣지 않는다**(`credential_reference` 참조만) · **모든 운영 조회에 `is_simulated = false`**
- 하지 않은 것: DB 제품(PostgreSQL·MySQL·SQLite) · ORM · 실제 `CREATE TABLE`·마이그레이션 · 인덱스·파티션 · API endpoint · LLM 공급자 · 솔버와 내부 표현 · 위험·신선도 임계값 · `plan_decision.decision_type` 값 목록 · **`docs/21` 수정** · 제품 코드 변경 · staging·commit·push
- 변경 파일: 신규 `docs/22_cera-logical-data-model.md`·`docs/22_cera-logical-data-model.xlsx` / 수정 `docs/15`(상태 20건 + 결론 절 + X-10~X-13), `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git diff --check` 통과. 제품 영역(`back/`·`ai/`·`data/`·`packages/`·`infra/`·`front/`·`scripts/`) 변경 0건. Markdown 2절 테이블 목록과 작업표 블록을 대조해 **불일치 0건**(OPEN 2개는 `10_OpenDecisions` 시트에 있음). Markdown 에 `CREATE TABLE`·DB 제품명·ORM 명이 확정 표현으로 등장하지 않음
- 큐 변경: **T-076 DONE**(개념 모델 승인) · **T-079 DONE** · **T-079-R**(검토 + 결정, NEEDS_HUMAN) 과 **T-080 물리 설계** 신규
- 남은 일 / 다음 한 걸음: **D-1~D-5 결정** → T-080 물리 설계. 그 뒤 T-070 문서 동기화가 X-10~X-13 을 흡수한다
- 주의사항: 논리 설계의 합격 기준은 **재현 테스트**다(`docs/22` I-7) — `canonical_fact` 를 전부 지우고 `event` 로부터 재계산했을 때 같은 결과가 나와야 한다. 나오지 않으면 파생에만 있는 정보가 생긴 것이고 설계 오류다

## 2026-09-17 · T-078 개념 모델 최종 정합성 정리 · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 최종 승인 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: 검토 방향이 승인 가능하다는 판정 뒤, **새 개념을 추가하거나 기존 설계를 다시 흔들지 않고** ① Markdown 표현 불일치 제거 ② 요구사항 ↔ 개념 모델 정합성 ③ 작업표 ↔ Preview ↔ Markdown 번호·개수 동기화 ④ 요구사항에서 아직 선택하지 않은 **구현 기술 선결 표현 제거** ⑤ 최종 승인 가능한 상태로 정리
- 고친 것 (10건):
  1. **후보 개수**: 21.1절 "미확정 후보 3개" → **4개**(OperatorPlanningConstraint 포함). QUEUE 체크리스트도. 최종 기준 MVP **33** / 시설 종류 **3** / 미확정 **4** / Next·보류 **2** / 올리지 않은 것 **16**
  2. **발송 승인 옛 표현 제거**: 9절·12.2절·18절의 "메시지 승인 필드" · "Send Approval · AuditLog" → **MessageApproval + AuditLog**. 12.3절의 "rev.1 은 …로만 봤다"는 **역사 서술이라 유지**
  3. **PlanDecision 통일**: "복구 계획에 대한 사람의 의사결정 기록" + **채택·거부·기존 계획 유지**. **enum 은 논리 설계**. "아직 행동하지 않은 상태"와 "의도적으로 유지하기로 결정한 상태"의 구분을 명시
  4. **계산 결과 용어**: 복구 계획 실행·배정·위험 평가·비용 계산 결과·비용 줄 → **"보존되는 산출 기록"**. 18절에 Source of Truth 와 다르다는 용어 주의 추가
  5. **`FR-CON-04` 구현 중립화**: 저장 구조 대신 **무엇을 보존해야 하는가**(제안 주체·시각·금액·유효기간·조건·원문 근거·관련 질문 항목)
  6. **`NFR-06`**: `pytest` 선결 제거 → 외부 네트워크 없이 자동 테스트 · 녹화 fixture·mock · 로컬 반복 실행
  7. **`NFR-09`**: "단일 DB 파일" 선결 제거 → PoC 최소 구성 로컬 실행, 명령 1~2개
  8. **신규 OPEN L-3b**: 운영자 직접 입력 요율의 **적용 대상·적용 기간**. 기존 L-3 옆에 붙여 질문군을 늘리지 않았다
  9. **작업표(16시트) 동기화** + 데이터 **585행**
  10. **메타 숫자 정정**: docs/21 1.3절 523행 → **585행**, CURRENT 의 "26개"·"523행"
- **미반영 1건 (다음 세션 또는 사용자 조치 필요)**: `docs/21_cera-db-template-preview.xlsx` 가 작업 중 **Excel 에서 열려 있어**(`docs/~$…` 잠금 파일) 덮어쓰지 못했다. 갱신본은 scratchpad `pending/` 에 생성해 뒀고 반영 방법을 `CURRENT.md` Handoff Notes 에 적었다. **E-ID·OPEN 표시는 현재 저장소 판에서도 정확**하며, 남은 차이는 05_계획 표시 번호 순서 · `decision_type` 값 목록 미확정 표시 · Notes 한 줄이다
- 하지 않은 것: 새 엔티티·새 요구사항 그룹 · **법적 책임·면책 문구** · `docs/04`·`docs/07`·`docs/18` 확대 수정(T-070 유지) · `AGENTS.md`·`.gitattributes` 불필요한 변경 · 솔버·enum·DB·ORM·API 확정
- 변경 파일: 수정 `docs/03`, `docs/15`, `docs/21_cera-conceptual-data-model.md`, `docs/21_cera-conceptual-data-model.xlsx`, `docs/README.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git diff --check` 통과. 제품 영역(`back/`·`ai/`·`data/`·`packages/`·`infra/`·`scripts/`) 변경 0건. `front/` 와 다른 작업의 untracked(`data/Proposal/`·`scripts/`) 무변경. 작업표를 openpyxl 로 다시 열어 **옛 표현 잔재 0건**(원본(기록) · PLAN_APPROVAL · 승인·반려 기록 · 미확정 3) 확인
- 남은 일 / 다음 한 걸음: **T-076 최종 승인** + Preview 갱신본 반영. 승인되면 **논리 DB 설계**
- 큐 변경: **T-078 DONE**, T-076 을 "최종 승인" 으로 갱신
- 주의사항: **개수는 `docs/21` 6절 개수 블록 하나만 정본**이다. 다른 절·작업표·부록은 그것을 따른다

## 2026-09-17 · T-077 운영자 개입과 재계산 요구사항 반영 (rev.3) · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 최종 검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: 개념 모델 rev.2 검토가 거의 끝난 시점에, **CERA 운영 UX의 핵심 요구사항 하나**가 정본에 부분적으로만 표현돼 있음이 확인됐다 — "CERA가 위험·D&D·예상 비용·복구안을 먼저 계산해 제시하고, 운영자가 현실 정보 또는 계획 조건을 수정하면 그 입력을 근거로 다시 계산한다". **기존 개념 모델을 대규모 재수정하지 않고 의미만 명확히 한다.** 새 최적화 알고리즘·DB 논리 설계·UI·Backend 는 하지 않는다. front 는 Antigravity 작업이므로 건드리지 않는다
- 한 일:
  1. **`docs/03` 2.6.1절 신설** (운영자 개입과 재계산): `FR-OPR-01~12` + 합격 기준 `AC-OPR-01~10`. 흐름도, **운영자 개입 4종 비교표**, 예시 2개(제2창고 0원 / ODCY A 제외)를 넣었다
  2. **기존 요구사항에 연결**: `FR-RSK-05`(위험 표현 경계 — 확률 모델이 아니다), `FR-CON-05`(운영자 상업 조건 입력도 같은 경로), `FR-VER-04`(개입 4종 구분), `FR-OPT-04·05` 주석, 사용자 여정 4번 확장
  3. **`docs/21` rev.3**: **12.5절 신설**(12.5.1 선계산 / 12.5.2 개입 4종 / 12.5.3 결과 대신 입력 수정 / 12.5.4 계획 조건은 현실 사실이 아니다 / 12.5.5 스냅샷·실행 연결과 재계산 이유 / 12.5.6 무조치도 결정), 4.3절 운영자 계획 조건 행, 11절 선계산 문장 + **비용 3종 표** + 위험 경계, 6.2절 **E-37 OperatorPlanningConstraint**(VesselCall→E-38, Truck→E-39), 6.4절 자원 사실 오염 금지, 15절 관계 3건, 16절 ERD `_CAND` 노드, 25.3·부록 A/B
  4. **작업표 16 시트 동기화**: Overview 개수·주의 2건 추가, ConceptInventory·AttributeCandidates·Events·CalculatedOutputs·Plans_Decisions·Relationships·OpenDecisions 반영. `04_EntityCandidates` **42행**(MVP 33 + 시설종류 3 + 형태 미확정 4 + Next·보류 2)
  5. **RPG Preview 에 `operator_planning_constraint` 블록 추가**: Table Candidate **38개**. `Schema Status: OPEN` · "현실 사실이 아니다" · "값 목록 미확정" 을 Notes 에 적었고, 경고 배너에 "계산 결과 숫자는 사용자 편집 대상이 아니다"를 더했다. `00_목록` 의 제외 목록에 **계산 결과 숫자**와 **자원 사용 불가 플래그**를 추가했다
  6. **`docs/13` 최소 3개 추가**: 운영자 계획 조건 · 예상 비용 · 실제 비용. 용어집 전체 동기화는 T-070 계획을 그대로 뒀다
  7. **`docs/15` 신규 L-12**: 운영자 계획 조건의 적용 범위·유효기간·강제/선호 구분·변경 이력·스냅샷 포함 방식을 **한 질문군으로** 묶었다(세분화하지 않았다)
- 이번에 못박은 경계:
  - **계산은 사람 승인 전에 이미 돌아간다.** 승인은 결과를 채택하는 결정이고, 사실 확인이 아니다
  - **운영자는 결과 숫자를 고치지 않고 입력을 고친다.** "350,000 → 0" 이 아니라 "창고 B 보관료 0원" 을 입력한다
  - **계획 조건은 현실 사실이 아니다.** "이번엔 ODCY A 쓰지 마"를 자원의 가용 사실로 기록하면 그 시설이 현실에서 못 쓰는 자원처럼 오염된다
  - **사실 입력은 기존 사건을 덮어쓰지 않는다.** 새 관측과 정정은 다른 사건 부류다
  - **무조치도 정당한 결정이다.** 복구안 하나를 반드시 승인해야 하는 시스템이 아니다
  - **예상 비용 ≠ 실제 비용.** 실제 비용은 Future 이고 CERA는 결제·송금·Invoice 정산·회계 처리를 하지 않는다
  - **위험은 확률이 아니다.** 등급·여유시간·노출액·자원 제약·데이터 불확실성·원인의 결정론적 평가다
- 하지 않은 것: 솔버 선택(CP-SAT/MILP) · 제약 표현 형식 · 제약 값 목록(enum) · 제약 DB 테이블 · 위험 확률·ML 모델 · 비용 공식·D&D 공식 변경 · DB 제품·ORM · API endpoint · UI·Backend 구현
- **rev.2 결정을 되돌리지 않았다**: QuestionItem · 견적 3층 · MessageApproval 후보 · OperationalPlan 묶음 OPEN · ExceptionCase OPEN · CostLineItem 귀속 완화 · ChannelConnection · MVP 33개 — 전부 그대로다
- 변경 파일: 수정 `docs/03`, `docs/13`, `docs/15`, `docs/21_cera-conceptual-data-model.md`(rev.3), `docs/21_cera-conceptual-data-model.xlsx`, `docs/21_cera-db-template-preview.xlsx`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git status --porcelain -- back/ ai/ packages/ infra/` 결과 없음. **`data/Proposal/` 이 untracked 로 새로 생겼으나 이 세션이 만들지 않았고 `data/` 는 손대지 않는 영역이라 그대로 뒀다.** `front/` 미커밋 변경은 Antigravity 것이며 읽지도 staging 하지도 않았다. `git diff --check` 통과. 두 워크북을 openpyxl 로 다시 열어 시트·행수·한글·색·범례·경고 배너 확인, 셀의 `**` 0건
- 남은 일 / 다음 한 걸음: **T-076 최종 검토**(rev.2 항목 + rev.3 운영자 개입·재계산). 승인되면 **논리 DB 설계**(L-1~L-12) → **T-070** → **T-069**
- 큐 변경: **T-077 DONE**, T-076 검토 항목에 rev.3 추가
- 주의사항:
  - 산출물은 모두 미커밋이고 **최종 DB 스키마가 아니다**
  - **운영자 계획 조건은 개념만 확정했다.** 표현 방식·값 목록·솔버 형식은 L-12 다
  - 화면을 만들 때 **계산 결과 숫자를 입력 필드로 두지 않는다**
  - **프론트는 Antigravity 소관이다.** `front/` 를 건드리지 않는다

## 2026-09-17 · T-075 개념 데이터 모델 검토 반영 (rev.2) + RPG 스타일 DB Preview · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 재검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: 사용자 + ChatGPT 1차 검토(T-074) 결과를 반영한다. **기존 개념 모델을 폐기하지 않고 수정** — ① 과하게 확정한 개념을 다시 OPEN ② 기존 요구사항 용어와 정렬 ③ Markdown·Excel 개념 목록·개수 동기화 ④ 기존 16시트 Excel 은 개념 검토 작업표로 유지 ⑤ RPG DB 문서 스타일의 별도 Preview Excel 추가. front 는 Antigravity 작업이므로 건드리지 않는다
- 유지한 구조적 결론: 사건 덧붙이기 · 원문 보존 · 사건 → 현재 사실 · 재생성 가능 · 현실/계획/계산 분리 · Facility 상위 개념 · Destination 역할 · 차량 풀 중심 · 개별 차량 비필수 · Actor 개념만 · 사건과 감사 분리 · 활동 타임라인 파생 · 단계·영향 파생 · 계획 스냅샷 · 복구실행/배정/승인 분리 · AI 는 값 후보와 인용까지
- 한 일:
  1. **다시 연 것 5건**: 견적을 **세 층**(제안 묶음 / 요율 사실 / 현재 요율)으로 나누고 묶음을 `OPEN FOR LOGICAL DESIGN` 으로 / 발송 승인을 **독립 불변 결정 기록 후보**로 승격 / 운영 계획 **묶음·버전**을 OPEN / 예외 Case 를 "파생 뷰가 기본안이지만 운영 Case 필요 여부 OPEN" 으로 / 비용 줄 귀속을 배정 하나에서 **비용 계산 결과의 종속 + 선택 귀속**으로 완화
  2. **용어 정렬**: `Ask` → **`QuestionItem`**(새 개념이 아니라 요구사항의 질문 항목이 저장 개념에서만 빠져 있었다. **추출 계약의 `ask_id` 는 깨지 않았다**), `ChannelCredential` → **`ChannelConnection`**(비밀값을 DB 에 담는 것처럼 읽히던 이름)
  3. **개수 전면 재계산**: MVP 저장 개념 후보 **33**(E-01~E-33) + 시설 종류 3 + 형태 미확정 3(E-34~36) + Next·보류 2(E-37·38) + 올리지 않은 것 16. 최소 집합 16 + 17 = 33. `docs/21` 6·21.1·25·부록 A 와 작업표 `04_EntityCandidates`·`01_Overview` 를 모두 맞췄다. **rev.1 의 "26개" 와 작업표 E-28 의 불일치를 해소**
  4. **`docs/21` rev.2 개정**: 3·4·5.6·5.7·5.11·5.12·6·8.4·11·12.3·12.4·14·14.4·15·16·19·20·21·24·25·부록 A/B. 6절·16절(ERD)·25절은 전면 교체. ERD 에서 `ASK` → `QUESTION_ITEM`, `MESSAGE_APPROVAL` 추가, 비용 줄을 `COST_RESULT` 아래로, 제안 묶음은 `_CAND` 접미로 후보 표시, 예외 Case·운영계획 묶음은 **확정 엔티티처럼 그리지 않았다**
  5. **작업표 16 시트 동기화**: 삭제·덮어쓰기 없이 같은 경로·같은 시트 구조를 유지하고 수정 개념을 반영(데이터 567행). Excel 셀의 markdown 강조(`**`)를 제거해 읽기 쉽게 했다
  6. **`docs/21_cera-db-template-preview.xlsx` 신규**: 참조 파일 `C:\Users\PC\Downloads\RPG 문서.xlsx`(2026-09-16)를 **직접 열어** 스타일을 확인했다 — 글꼴 Arial, 테이블 블록 5행(테이블명 / 한글 필드명 / 영문 필드명 / 타입 / 제약) + 예시 데이터, 색(PK `FFFF00` · FK `93C47D` · 한글행 `CFE2F3` · 라벨 `D0E0E3` · 보조 `F4CCCC`), 우측 범례(기본키·외래키), 얇은 테두리, 열 너비 ~15-20. 이 구조를 8 시트(`00_목록` `01_물류핵심` `02_시설자원` `03_사건상태` `04_계약비용` `05_계획` `06_외부통신` `07_감사운영`)에 **Table Candidate 37개**로 재현하고, 각 블록에 합성 예시 2~5행과 우측 Notes(Schema Status / 이유 / 주의 / 샘플 표시)를 붙였다
- 신규 질문: **L-9**(운영 계획 묶음 Aggregate·Version) · **L-10**(예외 운영 Case) · **L-11**(발송 승인 기록 표현). 갱신: L-1(이름 정정) · L-3(제안 묶음과 요율 사실의 관계) · Q-60(귀속 대상)
- 변경 파일: 수정 `docs/21_cera-conceptual-data-model.md`(rev.2), `docs/21_cera-conceptual-data-model.xlsx`, `docs/15`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md` / 신규 **`docs/21_cera-db-template-preview.xlsx`**
- 손대지 않은 것: `docs/18`·ADR 본문·LOG 의 옛 항목(**그때의 기록**). 어긋난 지점만 `docs/21` 24.3절 **X-7·X-8·X-9** 로 등록해 T-070 에서 한 번에 고치도록 했다. `docs/04`·`docs/07` 도 `docs/20` 6.3절 방침대로 승인 뒤 T-070
- 검증: `git status --porcelain -- back/ ai/ data/ packages/ infra/` 결과 없음, `front/` 는 Antigravity 미커밋 변경이 그대로 있고 이 세션이 건드리지 않았다. 두 워크북을 openpyxl 로 다시 열어 시트 수·행수·한글·PK/FK 색·범례·경고 배너 확인, Excel 셀의 `**` 0건, `git check-attr binary` 로 xlsx 바이너리 확인. 문서 Task 라 코드 검증 명령은 돌리지 않음
- 남은 일 / 다음 한 걸음: **T-076 재검토**(개수 일치, 다시 연 5건, 이름 정리, Preview 가 확정 스키마처럼 읽히지 않는지). 승인되면 **논리 DB 설계** → **T-070** → **T-069**
- 큐 변경: T-074 DONE(1차 검토 결과 기록), **T-075 DONE**, **T-076 신규(NEEDS_HUMAN, P0)**
- 주의사항:
  - **산출물 3개 모두 미커밋이고 최종 DB 스키마가 아니다.** Preview 도 Table Candidate 일 뿐이다
  - **작업표(16 시트)와 Preview(8 시트)는 역할이 다르다.** 하나로 합치거나 덮어쓰지 않는다
  - **Markdown 과 Excel 이 어긋나면 임의로 한쪽을 덮어쓰지 않는다.** 어긋난 항목을 보고하고 사람 검토로 넘긴다
  - **`ask_id` 계약은 그대로다.** 개념 이름만 `QuestionItem` 이고, 이름 통일 여부는 논리·API 설계에서 본다
  - **프론트는 Antigravity 소관이다.** `front/` 를 건드리지 않는다

## 2026-09-17 · T-073 CERA Conceptual Data Model (개념 데이터 모델) · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 사람 검토 대기**). 기준 커밋 `1b97905` 위의 문서 변경만. 제품 코드 0건
- 지시: ① 어제(2026-09-16) 작업을 **Git 정본 기준으로 복구**하고 ② 이미 진행된 DB 관련 작업이 있으면 **중복 작성하지 않고 이어서** 진행 ③ 작업 관리 문서를 실제 커밋 상태와 동기화 ④ 다음 단계인 **개념 데이터 모델**을 SQL 없이 작성. 세션 도중 추가 지시: **어제 Excel 작업이 있었는지 먼저 확인하고, 있으면 이어서 쓸 것**. 그리고 **프론트는 Antigravity가 디자인 작업 중이므로 손대지 말 것**
- 한 일:
  1. **Git 정본 확인**: HEAD `1b97905`, T-071·T-072 모두 **커밋됨**. 사용자가 기억한 것과 한 가지 다름 — **작업 트리가 clean이 아니다**(`front/web/src/app/globals.css`, `front/web/src/components/PlaybackBar.tsx` 미커밋 UI 리스타일 = **Antigravity 작업**). 읽기만 하고 건드리지 않았다
  2. **어제 DB 작업 복구**: 저장소 전체·Git 이력·파일명·내용 검색 결과 **존재하는 것은 `docs/20`(DB 설계 전 검토)까지**였다. 개념 모델 초안은 없었다. **Excel·CSV도 전혀 없었다** — git 이력에 xlsx/xls/csv가 단 한 번도 없고, 작업 트리·untracked에도 없다(워크스페이스 전체에서 발견된 csv는 다른 프로젝트 것). 그래서 개념 모델과 작업표를 **새로 만들었다**
  3. **작업 관리 문서 동기화**: QUEUE 머리말·완료 섹션·`사람 지시`, CURRENT 전면 재작성(baseline `2c37c28` → `1b97905`, **중복 `baseline commit` 행 제거**), T-072를 QUEUE·LOG에 **뒤늦게 등록**(사전 등록 없이 사용자 직접 지시로 수행된 경위를 그대로 적었다). `docs/20` 헤더에서 **검토 시작 기준점(`2c37c28` + 당시 미커밋)과 완료 커밋(`1b97905`)을 구분**해 덮어쓰지 않았다
  4. **`docs/21_cera-conceptual-data-model.md` 신규** (25개 절 + 부록 2): 데이터 설계 원칙, 도메인 용어집(56행), Concept Inventory(61행), 독립 엔티티 후보 26개 + **깨지는 기능**, 속성·사실·현실 사건·현재 상태·계산 결과·계획·근거·통신, 개념 관계 46건 + Mermaid 개념 ERD, 생애주기 5종, Source of Truth·이력 정책, 시나리오 역매핑, 외부 통신 요구사항 역매핑, MVP/Next/Future, **제외 물류 영역 18개**, 미확정 사항, 논리 설계 전 질문, Minimum Conceptual Model
  5. **`docs/21_cera-conceptual-data-model.xlsx` 신규** (16 시트·523행): Overview · DomainGlossary · ConceptInventory · EntityCandidates · AttributeCandidates · OperationalFacts · Events · CurrentState · CalculatedOutputs · Plans_Decisions · Contracts_Rates_Cost · Facilities_Resources · Communication · Relationships · ScenarioMapping · OpenDecisions. 헤더 고정·자동 필터·열 너비 적용. **Markdown = 왜 그렇게 보는가 / Excel = 무엇이 후보인가**로 역할을 갈랐다
- 답한 열린 질문 (개념 수준): **Q-53** MVP는 컨테이너 : B/L = N:1(Import FCL 전제 `[ASSUMPTION]`), 다대다는 구조로 배제하지 않음, `Shipment`는 만들지 않음 · **Q-56** Destination은 엔티티가 아니라 **관계에 붙은 역할** · **Q-57** 개별 차량은 **MVP 필수 아님**(풀 + 시간대별 가용량으로 성립) · **Q-61** 활동 타임라인은 **저장하지 않고 조합**(물질화는 허용)
- 엔티티로 올리지 않은 것과 근거: Destination(역할) · 선사(거래처 역할) · 개별 차량(보류) · SlotPool(터미널의 자원 단위) · 자원 가용량(사실) · 견적(사실 + 뷰) · 구간(값 객체) · 금액·환율(값 객체) · 예외(조합 뷰) · 단계·영향(파생) · 계획 버전(복구 계획 실행이 곧 버전) · 활동 타임라인(조합 뷰) · 운영 계획(PLAN 사실) · Shipment · 기사
- **새로 발견한 개념: Ask(문의 항목)** — 회신 값을 사실 키로 매핑하는 결정론 축인데 정본 스키마에 자리가 없다. 저장되지 않으면 LLM이 `fact_key`를 정하게 되어 **ADR-026 위반** → **L-1**, T-069에서 바로 필요
- 사실 카탈로그의 빈 자리 6건(F-1~F-6), 신규 질문 8건(L-1~L-8), 문서·데이터 불일치 6건(X-1~X-6) 등록
- 변경 파일: 신규 `docs/21_cera-conceptual-data-model.md`, `docs/21_cera-conceptual-data-model.xlsx` / 수정 `docs/15`, `docs/20`(헤더), `docs/README.md`, `AGENTS.md`, `.gitattributes`, `docs/tasks/CURRENT.md`·`QUEUE.md`·`LOG.md`
- 검증: `git status --porcelain -- back/ ai/ data/ packages/ infra/` 결과 없음. `front/`의 미커밋 변경 2건은 **Antigravity 작업이며 이 세션이 만들지 않았고 건드리지 않았다**. 문서 Task라 코드 검증 명령은 돌리지 않음. xlsx는 openpyxl로 다시 읽어 시트·행수·한글 무결성 확인(523행), `.gitattributes`에 `*.xlsx binary` 추가 후 `git check-attr`로 확인
- 남은 일 / 다음 한 걸음: **T-074 사람 검토**(과설계 여부, 5절 판정 근거, MVP 구분, 최소 집합, L-1~L-8). 승인되면 **논리 DB 설계** → **T-070 문서 동기화** → **T-069 외부 통신 구현 계획**
- 큐 변경: T-073 DONE, **T-074 신규(NEEDS_HUMAN, P0)**, T-072를 완료 섹션에 뒤늦게 등록, T-069는 삭제하지 않고 **데이터 모델 뒤로 순서만 이동**
- 주의사항:
  - **`docs/21`과 xlsx 모두 미커밋이고 최종 DB 스키마가 아니다.** 논리 설계로 자동 진행하지 않는다
  - xlsx **재생성 스크립트를 저장소에 두지 않았다** — 사람이 직접 편집하는 작업표이므로 자동 생성이 사람의 기록을 덮어쓸 위험이 있다
  - **Q-44·Q-45는 여전히 사용자 결정 대기**다. 개념 모델은 막지 않지만 T-069 착수 전에 필요하다
  - `docs/04`·`docs/07`은 **일부러 고치지 않았다**(`docs/20` 6.3절 방침: 개념 모델 승인 뒤 T-070에서 한 번에)
  - **프론트는 Antigravity 소관이다.** 이 세션 이후에도 `front/`를 건드리지 않는다

## 2026-09-16 · T-072 (사용자 직접 지시) DB 설계 전 요구사항 검토 · Claude Code (claude-opus-5)
> **뒤늦은 기록 (2026-09-17 추가).** 이 작업은 2026-09-16에 끝나 `1b97905`로 커밋됐지만, 그날 세션이 QUEUE·CURRENT·LOG를 갱신하지 못한 채 끊겼다. 과거를 꾸미지 않고 그 경위와 결과만 여기 남긴다.
- 상태: 완료. **커밋 `1b97905`** (T-071과 함께 하나의 문서 기준점으로 묶임)
- 검토 시작 기준점: `2c37c28` + 당시 미커밋이던 T-071 변경 / **완료 커밋: `1b97905`** — 둘은 다른 의미다
- 지시: 사용자 직접 지시. QUEUE에 사전 등록되지 않았다. "어떤 테이블을 만들까"가 아니라 **테이블을 만들기 전에 무엇이 확정돼 있고 무엇을 더 결정해야 하는가**를 가를 것
- 한 일:
  1. **`docs/20_data-model-preconditions.md` 신규**: DB가 반드시 따라야 하는 확정 규칙 24개(A-01~A-24), Proposed 설계 분류(DB 구조를 좌우하는 10건), 시나리오 가정(제품 규칙이 아닌 것), 문서 충돌 D-01~D-06, **원본 / 물질화하는 파생 / 계산 결과 기록 / 조회 시 조립값** 4분류, Event·Canonical State 14문항, 도메인별 분석(Container·B/L·Facility·운송사·차량·계약·요율·비용·통신·감사), 검증 스크립트 규칙 5분류, 식별자 4종, 단계별 결정사항, Planner Handoff
  2. **사용자 결정 7건 반영**: 사건·상태 **구조 승인**(ADR-019·020·021을 `Accepted (구조 한정)`으로 판정, 파라미터 값은 계속 검증) · **B/L은 컨테이너와 별개 개념** · **Facility 공통 상위 개념 사용**(테이블 하나라는 뜻은 아님) · **개별 차량을 MVP 필수로 확정하지 않는다**(이전 결론 철회 → Q-57) · 환율·기준일은 **보존 요구만 확정**(저장 위치는 논리 설계) · **Operational Plan / Recovery Plan 용어 분리** · **Actor 개념만 도입**(인증·권한 모델은 만들지 않는다)
  3. **낡은 표기 정정**: `docs/07` 3절 기술 표를 A~D 4분류로(특정 LLM 공급자·모델은 요구사항이 아니라 구현 시점 선택), `messages` 행의 ADR-028을 **Accepted**로, 실제 발송을 **Tech Validation**으로. `docs/01`·`04`·`05`에서 ADR-019/021을 Proposed로 부르던 곳 정정. `docs/13`에 Facility·Destination·Operational Plan·Recovery Plan·Actor·PLAN 추가·구분. `docs/15`에 Q-53~Q-63 추가
- 판정: **개념 데이터 모델 착수 조건 충족**(18절 6건 모두 처리). 다음은 CERA 전체 개념 데이터 모델이며 **SQL은 아직 쓰지 않는다**
- 변경 파일: 신규 `docs/20_data-model-preconditions.md` / 수정 `docs/01`, `docs/04`, `docs/05`, `docs/07`, `docs/13`, `docs/14`, `docs/15`, `docs/19`(헤더)
- 검증: 제품 영역 변경 0건. 문서만 바꿔 코드 검증 명령은 돌리지 않음
- 남은 일 / 다음 한 걸음: **개념 데이터 모델**(→ 2026-09-17 T-073으로 수행)
- 큐 변경: (당시 누락) → 2026-09-17에 QUEUE 완료 섹션에 등록
- 주의사항: 이 문서의 **검토 시작 기준점을 완료 커밋으로 덮어쓰지 않는다.** 역사적 의미가 다르다

## 2026-09-16 · T-071 External Communication 구현 전 요구사항 명세 · Claude Code (claude-opus-5)
- 상태: 완료 (**미커밋 — 사람 검토·승인 대기**). 기준 커밋 `2c37c28` 위의 문서 변경만. 제품 코드 0건
- 지시: 아키텍처·책임 경계가 확정됐으니 "무엇을 구현해야 하는지 / 어떤 상태가 있어야 하는지 / 어떤 입력과 결과가 필요한지 / 어떤 실패를 처리해야 하는지 / 언제 완료로 볼지"를 **구현 계획을 세울 수 있을 만큼** 구체화. **구현 기술은 고정하지 말 것**
- 한 일:
  1. **`docs/19_external-communication-requirements.md` 신규.** `18`(왜 이 구조인가)과 역할을 분리하고 내용을 복사하지 않았다. 사용자 흐름 A~J를 기술 용어 없이 먼저 적고, 그 아래 요구사항을 ID로 붙였다
  2. **요구사항 그룹 9개 신설**: `FR-CPY`(거래처·연락처·주소) `FR-EVF`(이메일 확인) `FR-ELG`(발송 자격) `FR-APV`(승인) `FR-SND`(실제 발송) `FR-INB`(회신 수신) `FR-XAI`(AI 추출 계약) `FR-STC`(구조화 채널) `FR-EVL`(사건·상태 반영). 기존 그룹 확장: `FR-COM-04~` `FR-UI-09~` `FR-AUD-02~` `NFR-12~30`. `03`의 `FR-<그룹>-NN` 체계를 그대로 따랐다
  3. **실패·예외 35+ 상황 표**(상황 → 시스템 행동 → 사용자 화면 → 재시도 가능 → 사람 확인 필요). 지시받은 목록에 더해 직접 찾은 것: 같은 주소가 두 거래처에 등록, 첨부만 있고 본문 없음, 발송 기능이 꺼져 있음, 회신 없이 기한 경과, 인증 문제와 개별 실패의 구분
  4. **사용자에게 보이는 상태 이름**을 내부 enum보다 먼저 고정(메시지 8개·묶음 7개·주소 6개)
  5. **완료 조건 34개 체크리스트**, **우선순위 3단계**(첫 구현 / 다음 / 나중), **화면 매핑**(연락 루프와 그 결과 자원 사실까지만 실제, 위험·비용·계획은 계속 시나리오)
  6. **열린 질문 재분류**: 구현 전 필수(Q-44 근거 시각, Q-45 보관 기간) / 구현 중 사례 보고 결정(M-6, Q-47, Q-48) / 범위 밖(Q-46) / 신규 Q-49~Q-52
  7. **Q-48(공용 업무 메일함) 분석**: 확인 절차·발송 자격·권한 판정에는 차이가 **없고**, 회신 발신자 처리·퇴사 처리·표시 이름에는 차이가 **있다**. 첫 구현을 막지 않으므로 구분 없이 진행하고 구현 형태는 확정하지 않았다
  8. **`docs/03` 모순 해소**: FR-ING-07(Gmail `Could/Pilot` → `Must`/Tech Validation), FR-COM-02("가상 메일함만" → Tech Validation부터 실제 발송), FR-ING-05(발신자 분류는 등록부 조회), FR-RSP-01(추출과 Event 생성의 주체 분리), NFR-03(검증 기준 3개로 구체화)
- 핵심 원칙 (23절에 명시): **요구사항은 행동과 계약만 정의하고 구현 기술을 고르지 않는다.** AI 모델·공급자·버전·SDK, 외부 API 호출 순서, 인증·DB·큐 라이브러리, 솔버·최적화 방식, 데스크톱 기술, 배포 환경을 전부 열어 뒀다. 같은 행동을 여러 기술로 만들 수 있고 어느 것이 나은지는 만들기 직전 상황에 달려 있기 때문이다. 단 책임 경계·사람 승인 게이트·발송 자격·사건 설계·원문 보존·중복 발송 금지는 이미 정해졌고 바꾸지 않는다
- 변경 파일: 신규 `docs/19_external-communication-requirements.md` / 수정 `docs/03`, `docs/15`, `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: 제품 영역(`front/`·`back/`·`ai/`·`data/`·`packages/`·`infra/`) 변경 0건, 폴더 이동·패키지 설치·API·DB 생성 없음. 문서만 바꿔 코드 검증 명령은 돌리지 않음
- 남은 일 / 다음 한 걸음: **T-069 Implementation Plan.** 착수 전에 사용자에게 **Q-45·Q-44**를 먼저 묻는다
- 큐 변경: T-071 DONE 추가. T-069가 다음 1순위(입력이 `19` 24절 + `18` N절로 늘어남)
- 주의사항:
  - `19`는 **미커밋**이다. 사용자 승인 뒤 커밋한다
  - `19`가 외부 통신 요구사항의 **정본**이다. `03` 2.7절은 요약이고 19를 가리킨다
  - 계획에서 확정하면 안 되는 것: M-6, Q-46, `19` 23절 기술 선택 목록

## 2026-09-16 · T-068 External Communication Architecture RFC + AI/Backend 책임 경계 Audit · Claude Code (claude-opus-5)
- 상태: 완료 (사용자 승인 뒤 **커밋함**). baseline `5972420` 위의 문서 변경만. 제품 코드 0건
- 지시: ① Mock으로만 존재하던 외부 연락 루프(초안 → 사람 승인 → 발송 → 실제 회신 → 구조화 → Operational Event → 화면)를 구현 가능한 수준으로 설계 ② 같은 날 2차로 **AI/LLM과 Backend·결정론 엔진의 책임 경계 재정리** ③ 3차로 승인 결정 반영 + 문서 동기화 + 커밋. 구현·폴더 이동 금지
- 한 일:
  1. **RFC 작성** `docs/18_external-communication.md` (A~O절): 기능 흐름, Front/Back/AI 책임, 도메인 모델, 상태 전이, Event/State 연결, Gmail OAuth·최소 권한, 실패·중복·재시도, API 후보, Mock→Real 전환, MVP 범위, 미루는 것, 열린 결정, Planner Handoff, **O절 CERA 전체 책임 경계표**
  2. **책임 경계 Audit**: RFC 초안 자체에서 7건(LLM이 `entity_id`·`fact_key` 출력 / `send_allowlist`가 제품·개발 혼재 / 허용 조건 축이 "실제 현업인가" / 구조화 채널 분기 없음 / 회신 결과 단일 분류 / Contact 개념 부재 / 경계표 부재), 기존 정본에서 8건(`11` "모호하면 LLM 분류", `06` 10개 중 7개가 결정론인데 Agent, `04` LLM → DB 구조체 직결 도식, `07` 순수 엔진 중 `state`만 `back/`, 3개 README의 `ai/` 배정, `03` FR 3건, `02`·`09`·`10`·`12`의 Agent 표현) 발견. 고칠 수 있는 것은 고치고 나머지는 T-070으로
  3. **승인 결정 반영**: `01` 6·6.1절 **`Tech Validation` 단계 신설**(PoC "가상 메일함만" 규칙과의 충돌을 삭제가 아니라 단계 정의로 해소), `02` 6절 제품 단계, `01` 3절 LLM 사용 기준·금지 경계, ADR-026·027·028·029 **모두 Accepted**, ADR-024 `ai/` 영역 정의 개정 주석
- 핵심 결정:
  - **AI 사용 기준 = "입력이 비정형이고 해석이 필요한가"** (값이 자주 바뀌는가가 아님). 구조화 채널(폼·포털·TMS·CSV)은 LLM을 거치지 않는다. `Form → LLM → Structured Value` 금지
  - **발송 자격 = 거래처 → 담당 연락처 → 이메일 검증 → 관계 승인 → 통신 활성** (제품 게이트, 영구). 개발환경 수신자 제한은 **별개 장치**. 테스트 상대도 같은 검증 흐름을 쓴다(우회 경로 없음)
  - **`ai/`는 LLM·비정형 처리만.** 결정론 엔진(Tariff·Cost·Risk·Reconciliation·Optimize·Solver)은 Backend 영역. 새 `engine/`은 만들지 않음. 적용은 T-003
  - LLM 출력에서 `entity_id`·`fact_key`·역할·강도를 걷어냄. LLM은 `ask_id` + 값 + 원문 인용만 내고 Backend가 매핑
  - AI 책임 4가지는 **현재 MVP 허용 범위**이지 영구 고정 목록이 아니다
- 변경 파일: 신규 `docs/18_external-communication.md` / 수정 `docs/01`(6·6.1절 신설), `docs/02`(6절), `docs/04`(4.1), `docs/06`(1.1절 신설·2·7절), `docs/07`(6.1절 신설·4·6절), `docs/11`(5절), `docs/14`(ADR-024 주석 + ADR-026~029), `docs/15`(Q-44~Q-48), `docs/README.md`, `AGENTS.md`, `docs/tasks/CURRENT.md`·`QUEUE.md`
- 검증: `git status --porcelain -- front/ back/ ai/ data/ packages/ infra/` 결과 없음(제품 코드 무변경), `engine/` 미생성, remote 없음. 문서만 바꿔 코드 검증 명령은 돌리지 않음(baseline 검증은 2026-09-15 T-063 기준 유효)
- 남은 일 / 다음 한 걸음: **T-069 Implementation Plan** — `18` N절의 15가지에 답한다. 계획이 승인돼야 구현 시작
- 큐 변경: T-068 DONE, **T-069 신규(다음 1순위)**, T-070 신규(정본 잔여 반영). 2026-09-15 "Gmail·Backend 구현 금지" 지시는 이 Slice 범위에 한해 해제(Solver·T-036 금지는 유지)
- 주의사항:
  - **M-6**(값이 같은 새 회신의 신선도 갱신), **Q-46**(상대방 포털 입력의 Source 모델), **Q-48**(공용 업무 메일함 구분)은 **열린 상태**다. 구현 계획에서 확정하지 말 것
  - 새 문서·코드에서 결정론 모듈을 "Agent"라고 부르지 않는다. 기존 스키마명(`agent_activity`)·제품명은 개명하지 않았다
  - `ai/README.md`·`back/README.md`·루트 `README.md`의 영역 문구는 제품 폴더 안이라 손대지 않았다 → T-070

## 2026-09-15 · T-067 (사람 지시) AI 협업 개발 Workflow / Orchestrator Handoff · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**). baseline `5972420` 위의 문서 변경만
- 지시: Claude·Codex가 번갈아 Orchestrator를 맡고 ChatGPT(계획·리뷰)·Antigravity(구현)를 함께 쓸 때 방향이 흔들리지 않도록, 인수인계를 Git 문서로 정식화. 제품 기능 구현 금지
- 한 일:
  1. 기존 규칙 점검 후 충돌 4건을 통합: ① `AGENTS.md` 2절의 1회성 `HANDOFF.md` → `CURRENT.md`로 대체(옛 파일이 있으면 옮기고 삭제) ② 3.1절 이어받기 기준 "LOG 중단 인계" → "CURRENT가 IDLE이 아님" ③ 3.6절 중단 기록 → CURRENT ④ `docs/01` 8절 "태스크 완료 조건에 있을 때 커밋" 예외 → 사람 승인 뒤로 일원화
  2. 신규: `docs/17_ai-development-workflow.md`(역할, 정본 순서, 11단계 흐름과 작은 수정 간소화, Handoff 절차, QUEUE·CURRENT·LOG, ChatGPT·Antigravity 지시 최소 항목, Commit Gate), `docs/tasks/CURRENT.md`(Status IDLE — 가짜 Task 없이 현재 상태, 다음 Task 후보는 미확정으로), `docs/tasks/TASK_BRIEF_TEMPLATE.md`
  3. `AGENTS.md`: 읽는 순서에 CURRENT·git status, 3.2 착수 때 CURRENT Task Brief, 3.4 완료 때 CURRENT → LOG, 3.7 Orchestrator Handoff Rule, 규칙 10에 "승인" 추가, 문서 지도. `CLAUDE.md`: Claude 전용 메모 3줄(규칙 복제 없음). 루트 `README.md`: Development Workflow 짧은 표. ADR-025(Accepted, 사람 결정)
  4. CODEX.md·Antigravity 설정 파일은 만들지 않았다(모든 도구가 AGENTS.md·CURRENT.md를 읽는 구조)
- 변경 파일: 신규 `docs/17_ai-development-workflow.md`, `docs/tasks/CURRENT.md`, `docs/tasks/TASK_BRIEF_TEMPLATE.md` / 수정 `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/01_project-rules.md`, `docs/14_decisions.md`, `docs/README.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: `front/web/src`·`data/scenarios`·코드 파일 변경 없음(`git diff --name-status`로 확인). 새·수정 문서의 로컬 링크·경로가 실제 파일을 가리키는지 검사. Frontend 코드가 바뀌지 않아 build는 다시 돌리지 않음
- 남은 일 / 다음 한 걸음: 사람 — T-067 커밋 여부, 다음 제품 Task 선택(CURRENT Open Questions), T-064·T-001
- 큐 변경: T-067 추가·DONE, 사람 지시(Workflow) 추가, QUEUE 머리에 QUEUE·CURRENT·LOG 역할 구분
- 주의사항: 다음 세션(Claude든 Codex든)은 `AGENTS.md` → `docs/tasks/CURRENT.md` → `git status` 순서로 시작한다. CURRENT는 IDLE이며 T-067 변경이 커밋 승인 대기로 적혀 있다

## 2026-09-15 · T-066 (사람 지시) Private Monorepo 재정렬 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**)
- 지시: 저장소를 나누지 않고 하나의 Private Monorepo 안에서 `front/`·`back/`·`ai/`·`packages/`·`data/`·`docs/`·`infra/` 책임 영역으로 재정렬. 기능 추가·Backend·Gmail·LLM·Solver·Tauri 금지. Frontend Prototype을 깨뜨리지 않는 것이 최우선
- 한 일:
  1. 사전 확인: git 상태(미커밋 18개 변경 + 새 파일 40개, 약 2만 줄), 비밀정보 파일 없음, 커밋 제외 대상 5종 확인. 이동 전 파일 87개(node_modules·.next·.git 제외)의 SHA-256 목록을 세션 scratchpad에 기록
  2. 사용자가 띄운 `next start --port 3001`(web/에서 실행 중, 폴더 잠금 원인)을 사용자 승인 뒤 종료
  3. `web/` → `front/web/` 이동. `web/`은 한 번도 커밋되지 않은 폴더라 `git mv`가 불가능해 일반 이동(같은 드라이브 이름 변경)을 썼다. node_modules 21,299개 파일 포함 그대로 이동
  4. 경로 수정: `next.config.ts`(Turbopack root = 두 단계 위), `tsconfig.json`(`@scenario/*` → `../../data/scenarios/*`), `scripts/validate-scenario.mjs`(저장소 루트·금지 표현 검사 경로), `scripts/smoke-browser.mjs`(시나리오 경로), `src/data/mock/fixture.ts` 주석, `.gitignore`(`.next/`·`.smoke/`·`next-env.d.ts`를 위치와 무관한 패턴으로)
  5. 영역 생성: `back/`·`ai/`·`packages/`·`infra/`에 README.md만. 루트 `README.md` 신규. `AGENTS.md` 1.1절(저장소 구조), 4절 규칙 9(Mock/Simulated/Real 구분)·10(요청 없이 commit/push 금지), 6절 명령(`cd front/web`). `CLAUDE.md`에 구조 한 단락. ADR-024(Accepted, 사람 결정)
  6. 문서: `docs/07` 6절을 Monorepo 레이아웃 + 옛 `src/cera` 모듈의 back/ai 배치표로 교체, 3절에 "구현된 것은 프론트엔드 줄뿐" 명시. `web/` 경로 38곳을 `front/web/`으로(AGENTS·01·07·12·13·16·README·QUEUE·데이터 팩 README). LOG의 옛 항목과 ADR 본문은 규칙대로 고치지 않고 CHANGELOG 7절 경로 대응표에 `web/ → front/web/` 추가
  7. 오해 표현 정정: 시나리오 JSON 4개의 "LLM (녹화 재생)"·"LLM 추출 녹화값"·"녹화된 값" 17곳 → "SIMULATED — 시나리오 작성값 (LLM 미실행)" 계열. 숫자·구조 변경 없음. 문서의 "Three.js Operations Simulator"(02·03·10·12·AGENTS·docs/README) → "현재 Prototype 2D / Three.js는 향후 선택지"
- 변경 파일:
  - 이동: `web/**` → `front/web/**`
  - 신규: `README.md`, `back/README.md`, `ai/README.md`, `packages/README.md`, `infra/README.md`
  - 수정: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `front/web/{next.config.ts, tsconfig.json, scripts/validate-scenario.mjs, scripts/smoke-browser.mjs, src/data/mock/fixture.ts}`, `data/scenarios/busan-wh-capacity-01/{scenario, events, communications, resources}.json`·`README.md`, `docs/01·02·03·07·10·12·13·14·16`, `docs/README.md`, `docs/CHANGELOG.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
  - 삭제: 없음
- 검증 (`front/web`에서): `validate:scenario` 2,133개 통과(숫자 동일: Baseline 4,650,000 / v1 3,835,000 / v2 3,855,000), `typecheck` 통과, `lint` 경고 0, `build` 통과, `smoke`(Edge 헤드리스) 135개 항목 통과 — 30대·9단계·KPI·지도 경로별 칸 수·Recovery Console·v1/v2·Communications·Timeline·상세 서랍, 콘솔 오류 0. 이동 전후 파일 해시 대조로 유실 없음 확인
- 남은 일 / 다음 한 걸음:
  - 사람: 커밋 여부 결정(원격 백업 없음, 미커밋 약 2만 줄), T-064 Prototype 검토, T-001
  - 에이전트: 변화 없음(T-017·T-034·T-035 등 실행 가능)
- 큐 변경: T-066 추가·DONE, T-003 범위를 `back/`·`ai/` 뼈대로 조정, 사람 지시(Monorepo 유지) 추가
- 주의사항:
  - 이제 Frontend 명령은 모두 `front/web`에서 실행한다. 사용자가 쓰던 3001번 서버는 종료했으므로 `cd front/web && npm run start`로 다시 띄워야 한다
  - `front/web/.next/`(빌드 산출물)는 옛 경로가 들어 있어 이동 뒤 다시 빌드했다. 삭제하지 않았다
  - 남은 하드코딩(화면 문구·입고 예정 대수·시간대)은 이번 범위가 아니라 그대로다(감사 보고 F-4)

## 2026-09-15 · T-060~T-063 (사람 지시) Prototype-led Discovery — Event/State 마무리 + 30대 시나리오 + Control Tower Prototype · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 T-064 대기, **커밋하지 않음** — 사람 지시)
- 지시 (2026-09-14 퇴근 전 사람 지시, 2026-09-15 실행): T-036을 보류하고 30대 시나리오 + Next.js Control Tower Prototype을 먼저 만든다. Solver·Backend·DB·실연동·LLM 금지. 끝나면 멈춘다. 이 지시가 HANDOFF.md 5절 순서(T-001 판정 → T-036)보다 우선한다
- 변경 이유 (로드맵): 실제 운영 데이터와 제약이 검증되지 않은 상태에서 수학모델을 먼저 고정하면 가정을 과도하게 설계할 위험이 있다. Prototype-led Discovery를 실제 개발 순서에 적용한 것이며 기획 후퇴가 아니다(ADR-023)
- 한 일:
  1. **T-060** `05` 5.2: RECEIVED_ONLY → STALE 취급(T-032 패치 ③) 폐기. `freshness = UNKNOWN`, `temporal_confidence = LOW`, `evidence_time_quality = RECEIVED_ONLY`. 중요 사실이면 STALE처럼 게이트(`FRESHNESS_UNKNOWN`). `temporal_quality` → `evidence_time_quality` 이름 변경을 07·11·13·14에 전파. Event/State 설계 완료 상태로 표시
  2. **로드맵**: `12` 2.5절 Phase 0.5 추가, T-036 DEFERRED(삭제 아님), QUEUE에 `DEFERRED` 상태 추가, ADR-023
  3. **T-061** 30대 데이터 팩(JSON 9개): 영향 12대·직송 유지 8대·그 밖 10대, Reefer 4, 트럭 8대 근무 시간, ODCY A/B 제약, 회신 3건, Plan v1·v2, 위험 상태 4개, 확인 요청. 금액은 단가에서 합산(Baseline 4,650,000 / v1 3,835,000 / v2 3,855,000원)
  4. **T-062** Frontend Data Contract(`cera.ts`) + `CeraDataProvider` + MockProvider. 컴포넌트는 fixture를 import하지 않음
  5. **T-063** Control Tower(Next.js 16, 2D SVG), Reset·이전·다음·Play, 컨테이너 상세 서랍. 검증 스크립트 2개(`validate:scenario`, `smoke`)
  6. 문서: `16_frontend-prototype.md`(신규), `09` 0절, `10`·`07`·`03`·`01` 7절·`13`·`14`(ADR-022·023, ADR-014·016 주석)·`15`(Q-37~Q-43, Q-02)·`README`·`CHANGELOG` 갱신. `HANDOFF.md` 반영 후 삭제
- `[PROPOSED]` 시나리오 fixture 수정 이유 (09 예시값과 다름):
  - 예시 6,420,000 / 2,850,000 / 3,570,000원은 산식이 없다. 운송비 포함 TotalCost를 단가(`[ASSUMPTION]`)에서 합산했고, 예시를 맞추려 단가를 역산하지 않았다
  - 예시 배정 8/5/4/3(합 20)은 "원래 창고 대상 20대 배치"로 해석해 v1에 유지하고, "영향 12대 Recovery Actions"(5/4/3 = 12)를 따로 셌다 → Affected 12 = Actions 12
  - v2가 v1보다 20,000원 비싸다(절감 815,000 → 795,000). v1이 가정한 ODCY A 5대가 회신에서 4대라 1대가 실행 불가였고, 운송사 추가 트럭으로 C008을 옮겨 일부 만회했다. "회신이 계획 가정을 바로잡는다"는 장면으로 의도했다(Q-43)
  - 회신 11:40~11:50 → 11:15~11:20 (지시 타임라인), D0 10/05(대체공휴일) → 10/13(화), Reefer 4대 추가(지시 요구, "ODCY 불가 → 직송"으로만 사용)
- 변경 파일:
  - 신규: `docs/16_frontend-prototype.md`, `data/scenarios/busan-wh-capacity-01/` (scenario·containers·resources·events·risk·plans·communications·activity·verifications `.json`, `README.md`), `web/` (package.json·package-lock.json·tsconfig.json·next.config.ts·eslint.config.mjs, `src/app/`·`src/contracts/`·`src/data/`·`src/components/`, `scripts/validate-scenario.mjs`·`scripts/smoke-browser.mjs`)
  - 갱신: `docs/01_project-rules.md`, `03_requirements.md`, `05_event-and-state.md`, `07_backend-architecture.md`, `09_mvp-scenario.md`, `10_simulation-spec.md`, `11_data-sources.md`, `12_roadmap.md`, `13_glossary.md`, `14_decisions.md`, `15_open-questions.md`, `README.md`, `CHANGELOG.md`, `tasks/QUEUE.md`, `tasks/LOG.md`, `AGENTS.md`, `.gitignore`
  - 삭제: `HANDOFF.md` (1회성 인계, 내용은 QUEUE·LOG·docs에 있음)
- 검증:
  - `npm run validate:scenario` 통과 (2,133개 검사: 비용 항목·계획 합계, 절감 = Baseline − Plan, 20대·12대 합, ODCY 용량·규격·최대 보관일, 창고 일자별 용량, 트럭 근무 시간·중복·당일 마감, K운송 트럭 시점, KPI = 위험 상태, 확인 대기 수, ISO 6346, +09:00, KRW 정수, 금지 표현)
  - `npm run typecheck`, `npm run lint`(경고 0), `npm run build` 통과
  - `npm run smoke` (Edge 헤드리스, `next start`): 9단계 전부 시계·KPI 6개·예외·계획 비용·절감·조치 12행·"= 12대"·지도 경로별 칸 수를 fixture와 대조 통과, S5 재계획 경고·S7 변경 표시·C007/C003 상세·Reset·Play 확인, 콘솔 오류 0. 스크린샷을 직접 보고 레이아웃 수정(Recovery Console 전체 폭, 표 줄바꿈, 입항 전 컨테이너를 터미널 밖으로)
- 남은 일 / 다음 한 걸음:
  - 사람: **T-064** Prototype 검토(실행법 `16` 3절), ADR-022·023 판정, 커밋 여부. T-001도 여전히 대기
  - 에이전트(검토 뒤): T-065 → T-036 재개. 병행 가능: T-017(인터뷰 가이드), T-034, T-035
- 큐 변경: T-060·T-061·T-062·T-063 DONE, T-064(NEEDS_HUMAN)·T-065 추가, T-036 DEFERRED(재개 조건 T-064·T-065), T-037 범위 조정(T-061 위에 정식 Event fixture), T-017 의존 T-037 → T-063, T-003 web 항목 선행 완료 표시, 상태 규칙에 DEFERRED
- 주의사항:
  - 데이터 팩 JSON은 세션 scratchpad의 작성 스크립트로 한 번 생성했다(커밋 안 함). 이제 JSON이 정본이며, 고칠 때는 JSON을 직접 고치고 `validate:scenario`로 합계를 확인한다
  - 화면 숫자는 엔진 결과가 아니다(`SCENARIO_RESULT`). "Solver가 계산했다" 류 표현은 validator가 막는다
  - ESLint 10은 `eslint-config-next` 16.3.5의 react 플러그인과 호환되지 않아 9를 쓴다(설치 시 deprecated 경고는 무시해도 됨)
  - `web/.smoke/`(스크린샷), `.next/`, `node_modules/`는 `.gitignore`
  - 사람 지시로 Backend·Solver·Phase 1 코드로 넘어가지 않았다

## 2026-09-11 · T-032 패치 (사람 조건부 승인 후 4개 수정) · Claude Code (claude-opus-5)
- 상태: 완료 (사람 최종 검토 대기, **커밋하지 않음**. T-036·솔버 확정·코드 금지)
- 지시: T-032 전체 방향은 조건부 승인. 기존 설계를 유지한 채 4개만 최소 수정·재검증
- 한 일:
  1. **ADR-007 Reopened → Proposed**. 재개 이유: Accepted 상태는 v0.1 원본 기획서 승계였고, V0.2 Master Planning 정본에서 솔버는 "현재 후보"이며 CP-SAT / MILP / min-cost flow / VRP / scheduling 비교가 Open Question이다. 직전 T-031·T-032 보고와 LOG에서 이 ADR을 `[DECIDED]`로 유지한 것은 정본과 충돌했으므로 바로잡는다. 선택은 T-036(Q-35). ADR-008은 `[DECIDED]` 유지. 01 규칙의 `[DECIDED]` 예시를 ADR-008로 교체. 06·07·08·12·13·CHANGELOG의 CP-SAT 확정 표현을 "후보"로 정리
  2. **Plan Approval / Fact Verification 분리** (ADR-017 결정 (2) 개정): `PLAN_APPROVAL`은 Event Store 밖 결정 기록(`plan_decisions`, append-only). 계획 승인으로 입력 사실을 CONFIRMED로 올리지 않음. CONFIRMED 근거 `verification_basis` = HUMAN_VERIFICATION / AUTHORITATIVE_SYSTEM / POLICY_EVIDENCE. PROVISIONAL 입력은 `ALLOW_WITH_ACK`(잠정 입력 인지 명시)로 승인 가능, 승인 뒤 V9 확인 요청. `APPROVAL_BLOCKED`는 사실 단위 행동으로만 해제. "확인 + 승인" 묶음 UI는 허용하되 `VERIFICATION` Event와 `PLAN_APPROVAL` 기록을 따로 남김. 승인 때 차단 확인·입력 불변 확인. `verification_method = PLAN_APPROVAL` 삭제
  3. **근거 시각 단순화**: `max(...)` 공식과 공공 API 지연 허용 ∞를 폐기하고 3단계 폴백(EVENT_TIME → RECORDED_TIME → RECEIVED_ONLY) + `temporal_quality`로 바꿈. 수신 시각에서 지연을 빼지 않음. 옛 공식이 막던 오류는 "STATE의 `source_event_time` = 관측 시각, 변경 시각은 `payload.changed_at`" 어댑터 매핑 정의로 막음(결정론 예시 05 5.2). 공공 API RECEIVED_ONLY → STALE 취급. [지금도 맞음] 액션 추가(옛 Event 확인만으로는 신선해지지 않음)
  4. **FORECAST 사실 종류 추가**: `plan.eta` → `forecast.eta`(`forecast_kind`: SCHEDULED / ESTIMATED / PREDICTED). `milestone.ata`와 다른 키. 실제 입항이 생기면 R7-f로 판단에서 빠짐. INFERENCE는 FORECAST만 채움(R8). PLAN은 CERA 사용자의 예정만
- 재검증: 6개 CASE 재적용. 값이 바뀐 CASE는 없음. 바뀐 부분은 CASE 2 표기(OBSERVED → CONFIRMED/AUTHORITATIVE_SYSTEM), CASE 3 근거 시각 설명, CASE 4(승인해도 PROVISIONAL 유지, V9), CASE 5(G2·G3 분리 절차), CASE 6(차단 해제 경로). A.7.4를 FORECAST로 재작성. Planning Snapshot 구조 변경 없음(`forecast` 필드 추가, PROVISIONAL 규칙 문구, 승인 검사는 기존 값·winner_event_id로 가능)
- 변경 파일: `docs/05_event-and-state.md`, `docs/14_decisions.md`, `docs/01_project-rules.md`, `docs/03_requirements.md`, `docs/04_domain-model.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/15_open-questions.md`, `docs/CHANGELOG.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 큐 변경: T-032 완료 항목에 패치 기록. T-036에 솔버 비교·ADR-007 결정 추가. T-001에 패치 검토·Q-36 추가. 사람 지시 추가
- 주의사항: ADR-019·020·021은 Proposed 유지. 바로 아래 T-032 항목의 "ADR-007·008 `[DECIDED]` 유지" 문구는 이 항목으로 정정한다(LOG는 append-only)

## 2026-09-11 · T-032 Event·Source·Canonical State 설계 확정안 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음**. 사람 지시: 검토 전 T-036·T-037·Phase 1 코드 착수 금지)
- 작업 전 상태: v0.2 재정렬 미커밋, T-001 미수행(ADR-007·008만 Accepted). 05에 R1~R8(Proposed)과 7개 상태 단일 enum이 있었음. 발견한 모순: ① R3이 전역 출처 순위 ② 상태 enum이 차원 혼합 ③ `source_type`이 채널과 확인·추출 여부 혼합 ④ 01 규칙 3절("LLM 결과는 확정 전 Canonical State를 바꾸지 못한다")과 ADR-017(자원 사실 PROVISIONAL 반영) 충돌 ⑤ `[DECIDED]`·`[PROPOSED]` 태그 없음
- 한 일:
  - `05_event-and-state.md` 전면 재작성(확정안): 결정 수준 표기, 사실 종류 6개, 출처 3축 + 권한 매트릭스 + 근거 강도, Event 스키마(필드별 필수·생성자·불변·용도, 요청 필드 처리 근거), fact_key·event_type 카탈로그, Validation/Quarantine, 추출 검증기, 네 개의 시각과 근거 시각·신선도, 상태 차원 분리, 충돌 범주 C1~C10과 결과 유형, Reconciliation 의사코드 + R1~R12 결정표 + 옛 R1~R8 대응, Canonical Fact 스키마·"왜 이 값인가"·fingerprint, 정정·철회·확인 취소, 확인 요청 V1~V8과 사람 액션 → Event, Planning Snapshot(엔진 입력 계약), 정책 파라미터
  - 부록 A: 필수 CASE 1~6 적용 결과 + 경계 사례 10개 + 규칙 사용표(R1~R12 모두 사용) + MVP 11:00 사건 표현
  - `04_domain-model.md` 2절: 단일 enum / Milestone Composition / Hybrid 비교 → Hybrid 채택안, 단계 유도 규칙(Q-22 해결), Phase 1 최소 모델, 예외 오버레이를 컨테이너 예외·자원 조건·영향으로 분리
  - ADR-019(Reconciliation Policy), ADR-020(출처 3축·상태 차원), ADR-021(Hybrid) 추가. ADR-012 전역 우선순위 규칙 Superseded 표시, ADR-005·014에 주석
  - 01 규칙: `[DECIDED]`·`[PROPOSED]` 태그 추가(사용자 요청), LLM 결과 반영 규칙을 ADR-017과 일치시킴(모순 ④ 해소), Event 필수 필드 갱신
  - 옛 용어(HUMAN_CONFIRMED 등, 단일 상태 enum, S0~S9, 05 옛 절 번호) 참조를 03·06·07·08·09·10·11·12·13·15·field-dictionary에서 정리
  - 작성 중 발견해 고친 것: 확인 요청을 처리해도 R4-b가 같은 충돌을 다시 여는 루프 → `overruled_event_ids`(기각) 추가 / 추출 검증기 표가 빠졌던 것 → 05 4.6으로 복원
- 변경 파일: `docs/05_event-and-state.md`(재작성), `docs/04_domain-model.md`, `docs/01_project-rules.md`, `docs/03_requirements.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/14_decisions.md`, `docs/15_open-questions.md`, `docs/CHANGELOG.md`, `docs/data/field-dictionary.md`, `AGENTS.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md`
- 검증: 코드 없음. 6개 CASE와 경계 사례를 결정표에 손으로 적용(부록 A), 규칙 사용표로 R1~R12 전부 사용 확인. 05 전체를 다시 읽어 절 간 모순 수정(참조 절 번호, location 권한 계열, 스냅샷 예시). 옛 용어는 grep으로 전수 확인
- 완료 기준 Q1~Q10: 모두 답할 수 있음(최종 보고 참조). Q10 — T-036은 `05` 14절 Planning Snapshot만 입력으로 쓰면 되므로 추가 상태 설계 없이 시작 가능
- DoD 조정: JSON Schema 수작업 파일은 만들지 않고 T-041(Pydantic 생성)로 이동. 이유는 QUEUE 완료 항목에 기록
- 남은 일 / 다음 한 걸음:
  - 사람: T-001 — ADR-019·020·021 판정, 권한 매트릭스(3.2)·강도표(3.3)·부록 A 결과가 현장 감각과 맞는지, Q-23·Q-24·Q-34
  - 에이전트(검토 뒤): T-036 → T-037, 병행 T-035·T-029
- 큐 변경: T-032 DONE. T-001 범위에 T-032 검토 추가. T-036 참조에 Planning Snapshot 추가. T-035 문구 갱신. 사람 지시 추가
- 주의사항:
  - `[DECIDED]`(Accepted) 결정은 바꾸지 않았다(ADR-007·008). ADR-012·005·014는 Proposed라 주석으로 개정했다
  - 요청의 CASE 3에서 메일 Event를 "PROVISIONAL"이라 했지만, 설계상 메일에서 뽑은 **컨테이너 사실**은 확인 전 후보 자격이 없다(강도 0). PROVISIONAL은 자원·제안·견적 사실에만 쓴다(부록 A.3에 명시)
  - 모든 파라미터 값(τ, δ_m, 신선도, θ)은 PoC 데모용 `[ASSUMPTION]`이다. 특히 τ가 "동시 충돌"과 "그 사이 현실 변화"를 가른다(A.5)

## 2026-09-11 · T-031 (사용자 지시) 기획 v0.2 전면 재정렬 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기, **커밋하지 않음** — 사용자 지시)
- 변경 이유 (사용자 지시 요약):
  - 공공데이터의 실제 반영 속도(SLA)를 신뢰할 수 없으므로, 공공데이터를 단일 진실원천으로 두는 v0.1 구조를 버린다.
  - CERA를 "여러 출처의 운영 사실 → 신뢰도 기반 Canonical Operational State → 예외 탐지 → 비용 최소 복구 → 연락·회신 반영 → 재최적화"를 수행하는 System of Decision/Action으로 재정의한다.
  - 사람 입력·이메일·계약서를 정식 입력원으로, 멀티에이전트(역할 분리)·Three.js 시뮬레이터·Prototype-led Discovery를 설계에 넣는다. 초기 범위(부산 Import FCL 30대)는 넓히지 않는다.
  - 기존 문서가 새 기획과 충돌하면 삭제하되 검증 결과·질문·ADR·폐기 사유는 보존한다.
- 한 일:
  1. 저장소 전체 문서(AGENTS, CLAUDE, docs/01~10, data/*, QUEUE, LOG) 검토 → 충돌 목록과 KEEP/MODIFY/DEPRECATE/NEW 분류(`docs/CHANGELOG.md` 1~4절)
  2. **삭제 전에** 문서 이전 지도 작성(`docs/CHANGELOG.md` 4절): 삭제할 문서, 이유, 유효 내용을 옮긴 곳
  3. 새 정본 구조로 재편하고 문서 작성: 제품 정의, 요구사항, 도메인 모델, 이벤트·상태, 에이전트, 백엔드, 최적화, MVP 시나리오, 시뮬레이터, 데이터 출처, 로드맵
  4. ADR-011~018 추가(Proposed). ADR-001~010 본문은 그대로 두고 v0.2 주석을 추가. ADR-003(Streamlit)은 Superseded by ADR-016
  5. Open Questions: R-6~R-8, Q-23~Q-33 추가. Q-01~Q-22·R-1~R-5 보존(주석 추가), Q-10·Q-16 CLOSED
  6. QUEUE 재정렬: T-031 DONE, T-032~T-040 신규, T-007·T-008 DEPRECATED, 옛 백로그 ID 폐기, T-002/T-005/T-006/T-030 P2로 조정
  7. 옛 문서·원본 기획서 삭제(아래), 참조 경로 정리
- 삭제한 파일 (모두 `ef6b85b`에 있어 git으로 복원 가능):
  - `docs/02_product-brief.md` → `02_product-definition.md`, `01` 4절, `11`, `15`로 이전
  - `docs/03_data-strategy.md` → `11_data-sources.md`, `05_event-and-state.md`로 이전 (T-004 VERIFIED 요약 포함)
  - `docs/04_service-flow.md` → `03_requirements.md`, `09_mvp-scenario.md`로 이전
  - `docs/05_domain-model.md` → `04_domain-model.md`, `05_event-and-state.md`, `08_optimization-model.md`로 이전
  - `docs/06_architecture.md` → `07_backend-architecture.md`로 이전
  - `docs/07_roadmap.md` → `12_roadmap.md`, `CHANGELOG.md` 6절로 이전
  - `docs/08_glossary.md`, `docs/09_decisions.md`, `docs/10_open-questions.md` → `13_glossary.md`, `14_decisions.md`, `15_open-questions.md`로 이름 변경(내용 전부 보존 + 추가)
  - 루트 `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf` / `.docx` → 사용자 허락으로 삭제. 유효 내용은 v0.1 문서 세트를 거쳐 v0.2로 이전됨
- 변경 파일:
  - 신규: `docs/CHANGELOG.md`, `docs/02_product-definition.md`, `docs/03_requirements.md`, `docs/04_domain-model.md`, `docs/05_event-and-state.md`, `docs/06_agent-architecture.md`, `docs/07_backend-architecture.md`, `docs/08_optimization-model.md`, `docs/09_mvp-scenario.md`, `docs/10_simulation-spec.md`, `docs/11_data-sources.md`, `docs/12_roadmap.md`, `docs/13_glossary.md`, `docs/14_decisions.md`, `docs/15_open-questions.md`
  - 갱신: `AGENTS.md`, `docs/README.md`, `docs/01_project-rules.md`, `docs/data/field-dictionary.md`(v0.2 읽기 주석, 참조 경로. 확인된 사실은 그대로), `docs/data/code-tables.md`(참조 경로), `docs/tasks/QUEUE.md`
- 폐기된 가정 (상세 `CHANGELOG.md` 2절 D-1~D-14): 공공데이터 단일 진실원천, 공공 API → State 직결, D&D Risk Radar가 제품 핵심, Plan A/B/C 비교 중심 최적화 설명, VBS 자동 Write, 공공데이터만으로 LFD 계산, DS-02 컨테이너 이벤트, 15011649 소멸, V0.1 LLM 없음, Streamlit UI, 폴링 중심 수집, 37대 데모, 공공 API 기반 Gate 1, 공공 API 선행 개발 순서
- 검증:
  - 삭제 대상 11개 파일이 모두 마지막 커밋에 있음을 `git cat-file`로 확인한 뒤 삭제(`git rm`이 아닌 `rm`, 인덱스 변경 없음)
  - 삭제된 파일명을 참조하는 곳을 grep으로 전수 확인 → 이름 변경 주석, CHANGELOG 대응표, LOG의 과거 기록만 남음(의도)
  - 옛 단계 명칭·Streamlit·폐기 ID 참조를 grep → 역사·주석 맥락에서만 남음
  - 코드 없음. 테스트 없음
- 남은 일 / 다음 한 걸음:
  - 사람: **T-001** — 기획 v0.2 검토, ADR-011~018 판정, 삭제 목록 확인 후 커밋 여부 결정, Q-15·Q-17·Q-21·Q-23 답변
  - 에이전트: T-032(Event·Canonical 스키마) → T-036(최적화 명세) → T-037(시나리오 데이터 팩). 병행 T-029
- 큐 변경: T-031 DONE. T-032~T-040 추가. T-007·T-008 DEPRECATED. T-009~T-016·T-018~T-028 폐기(재사용 금지). T-001 범위 변경(v0.2 검토). T-017을 Prototype 인터뷰 가이드로 변경. T-002·T-005·T-006·T-030 우선순위 P2
- 주의사항:
  - 커밋 전 백업: 재정렬 직전 작업 트리(T-004 미커밋 변경 포함)를 세션 scratchpad `backup_pre_v02/`에 복사해 두었다(세션 한정). 영구 복원 경로는 git `ef6b85b` + 이 LOG
  - 이 LOG의 아래쪽(과거) 항목에 나오는 파일 경로는 v0.1 기준이다. `docs/CHANGELOG.md` 7절 표로 읽는다
  - 제품 단계 명칭이 V0.1/V0.2/V1/V2 → **PoC/Pilot/Scale**로 바뀌었다. "기획 v0.2"는 문서 버전이지 제품 단계가 아니다
  - 시나리오 금액(6,420,000 / 2,850,000 / 3,570,000원)은 예시값이다. 엔진 결과처럼 쓰지 말 것

## 2026-09-11 · T-004 · Claude Code (claude-opus-5)
- 상태: 완료 (사람 검토 대기. 사람 지시: 검토 전에는 T-005 이후로 넘어가지 않는다)
- 한 일:
  - 공공데이터포털 상세 페이지 4개(15126268, 15131742, 15006353, 15011649)와 첨부 공식 가이드 3종을 받아 원문을 직접 읽었다. 포털 페이지에 포함된 Swagger 2.0 명세 2개도 추출했다
  - 인증키 없이 3개 엔드포인트에 GET을 1회씩 보내 엔드포인트가 살아 있는지와 오류 봉투 형식을 확인했다(데이터 수신 없음)
  - `docs/data/field-dictionary.md` v0.1 작성: API별 기본 정보 17개 항목, 요청·응답 필드, **CERA Mapping**(공식 필드 → 정규화 필드 → 도메인 엔티티 → 엔진 용도), 공공 API가 주지 않는 데이터, ContainerState 역매핑, T-007 스키마 제안, 파서 규칙
  - `docs/data/code-tables.md` v0.1 작성: 1차 출처에서 관측한 코드값만, 에러코드(UNI-PASS / 포털 게이트웨이)
- 변경 파일:
  - 신규: `docs/data/field-dictionary.md`, `docs/data/code-tables.md`
  - 갱신: `docs/03_data-strategy.md`(1·2.1·3·4·5·7·8절), `docs/02_product-brief.md`(10절), `docs/05_domain-model.md`(2.1 주 출처 열, Q-22 링크. 상태 유도 규칙은 **손대지 않음**), `docs/08_glossary.md`, `docs/10_open-questions.md`, `docs/07_roadmap.md`, `docs/README.md`, `AGENTS.md`(5절 문서 지도), `docs/tasks/QUEUE.md`
- **새로 VERIFIED된 사실** (출처 ID는 field-dictionary 0.2절):
  - DS-01 엔드포인트 `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo`, 개발계 호스트 `tunipass.customs.go.kr:38010`, GET, XML, 인증 `crkyCn` (S-02, S-08). T-000의 블로그 근거를 공식 문서로 대체
  - DS-01 요청 `cargMtNo` 또는 `mblNo`/`hblNo` + `blYy`, 응답 기본정보 38개 필드 + 처리이력(0..n) 13개 필드와 크기 (S-02)
  - DS-01 오류는 HTTP 200 + `tCnt=-1` + 한글 `ntceInfo`. 여러 건이면 `[N00]` 목록 응답. 조회 기간은 2023-06-17부터 3년 이내. IP로는 호출 불가 (S-02, S-08)
  - DS-02 엔드포인트 `https://apis.data.go.kr/1192000/CargFrghtContnOut/ContnInfo`. 필수 키는 **`prtAgCd` + `etryptYear` + `etryptCo` + `clsgn`**(입항 건). `numOfRows` 최대 50, 개발계정 1,000, 30 tps, 갱신주기 "실시간" 표기, 응답 17개 필드 (S-03, S-04)
  - DS-02 응답에 **컨테이너별 반출입 일시 필드가 없다**. 시각 필드는 선박 `etryndDt`뿐이다 (S-03, S-04)
  - 포털 게이트웨이 오류는 `OpenAPI_ServiceResponse/cmmMsgHeader` 봉투 + HTTP 401 (S-08). 가이드와 포털의 에러코드 번호 체계가 다르다(예: 10번) (S-03, S-04)
  - DS-03 후보 `해양수산부_선박운항정보`(15006353) `VsslEtrynd5/Info5`: 항만 + 기간으로 조회하면 `etryptYear`·`etryptCo`·`clsgn`·`mrNum`·입출항 일시·선석을 준다. 부산 `prtAgCd=020` (S-05, S-06)
- **기존 문서에서 틀려서 정정한 사실**:
  - "15011649 → 404, 사라짐" → 옛 URL(`/dataset/`)만 404다. 데이터셋은 **파일데이터(XLSX, 100행, 1회성)** `해양수산부_컨테이너반출입정보_20230112`로 있고, 오픈API가 아니다. 현재 오픈API 후보는 15131742 (Q-03 CLOSED)
  - "DS-02는 BL번호로 조회" → 입항 건 키로만 조회된다. 조인 경로를 B/L → DS-01 → DS-03 → DS-02로 바꿨다
  - "DS-02가 컨테이너 단위 반출입 이벤트(S1·S5·S9)를 준다" → 공식 명세상 아니다. DS-02를 **적하목록 스냅샷 출처**로 다시 분류했다. 반출 이벤트 1차 후보는 DS-01 처리이력
  - "DS-01 응답의 장치장명(`shedNm`)" → 기본정보가 아니라 처리이력 행의 필드다
  - T-000 응답 태그 목록의 `csclPrgsStts`, `prgsStCd`, `etprDt`, `cntrGcnt` 등은 공식 문서와 일치했다(정정 없음)
- **아직 확인 못한 항목** (`[TO VERIFY]`):
  - 코드표: `prgsStCd`, `csclPrgsStts`, 처리구분(`cargTrcnRelaBsopTpcd`), `blPt`, `spcnCargCd`, `tkinTkoutSe`(Q-18), `prtAgCd`(부산·광양 외). 공식 코드표를 찾지 못해 샘플 값만 적었다
  - DS-01 호출 한도, 갱신주기·실제 지연(R-1), 14자리 일시의 형식·타임존(Q-19), 목록 응답 태그명, 여러 컨테이너 B/L의 `cntrNo`·이력(Q-20), 포털 활용신청이 따로 필요한지
  - DS-02 트래픽 단위(일로 추정, Q-05), 조회 가능 기간, `blNo`가 MBL/HBL 중 무엇인지, `contnStndrd`가 ISO 6346 코드인지, `etryndDt`가 입항/출항 중 무엇인지
  - 화물관리번호 ↔ 적하목록관리번호·MSN 관계(Q-04, 길이만 맞는 가설), DS-03 매칭 규칙, ETA 출처
  - 양하(S1) 시각의 공식 출처(Q-22와 연결), DS-04 체인포털 공개 API(Q-21)
  - UNI-PASS API020·021·038·048·005 명세(T-030)
- **T-002에서 사용자에게 필요한 준비물** (QUEUE T-002에 상세):
  1. UNI-PASS 회원가입 → OpenAPI사용관리에서 API001 신청 → 인증키(`crkyCn`). 가능하면 API020·021·038·048도 신청하고 한도를 기록
  2. 공공데이터포털 활용신청 2건: 15131742(외항화물컨테이너정보), **15006353(선박운항정보, 새로 필요)**. 트래픽 단위 기록
  3. 로컬 `.env`에 `UNIPASS_API_KEY`, `DATA_GO_KR_SERVICE_KEY` (커밋 금지)
  4. 실제 B/L 5~20건: MBL(필수)·HBL·**B/L 연도**(필수)·입항항(부산)·대략 입항일·선박명·컨테이너 번호/개수. 반출·반납이 끝난 건과 아직 터미널에 있는 건을 섞고, 3년 이내 건만
- 검증: DoD 4항목 확인(DS-01·02 필드 1차 출처 정리 / Q-03 CLOSED·Q-04 갱신 / 필드→ContainerState 매핑(7절) / README 색인). 공식 문서 docx 3종의 SHA-256을 필드 사전에 기록. 문서 간 교차 참조(Q-17~Q-22, T-030, S-01~S-08)는 수동 확인. 코드 없음
- 남은 일 / 다음 한 걸음:
  - 사람: T-004 결과 검토(특히 Q-17 UNI-PASS 가이드 복제 금지 문구 판단, Q-21), T-001, T-002
  - 에이전트(검토와 무관하게 가능): T-029, T-030, T-017
- 큐 변경: T-004 DONE. T-030 신규. T-002·T-005·T-006·T-007 내용 갱신(T-006 범위 변경: DS-03 클라이언트 추가, 지연 측정을 DS-01 기준으로). T-001에 T-004 검토 추가
- 주의사항:
  - UNI-PASS 연계 가이드 원문과 샘플은 저장소에 넣지 말 것(Q-17). 필요하면 S-02 경로에서 다시 받는다
  - DS-02를 폴링 이벤트 출처로 설계하지 말 것. 개발계정 1,000건은 입항 건 스냅샷용
  - 05의 S1 도달 불가 문제(Q-22)는 일부러 고치지 않았다. T-007/T-009에서 처리

## 2026-09-10 · (사용자 지시) git 초기화 · Claude Code (claude-opus-5)
- 상태: 완료 (원격 푸시는 사람 작업 대기)
- 한 일:
  - 커밋 전 민감정보 점검: md 문서(키·토큰·이메일 패턴 없음), 원본 기획서 DOCX(본문이 PDF와 동일, 메타데이터 작성자 `python-docx`), PDF(작성자 `python-docx`, 생성기 LibreOffice) → 개인정보·비밀정보 없음
  - `git init -b main`, 로컬 user.name/user.email 설정(저장소 로컬 한정), `.gitignore` 추가, 첫 커밋
- 변경 파일: `.gitignore`(신규), `docs/tasks/QUEUE.md`(T-003에서 git init 항목 완료 표시), `docs/tasks/LOG.md`
- 검증: `git status`, `git log`로 커밋 작성자 확인
- 남은 일 / 다음 한 걸음:
  - 사람: GitHub에 private 저장소 생성 → remote 연결 → 해당 계정으로 인증 후 push
- 큐 변경: 없음 (T-003 범위 일부 선행)
- 주의사항: 이 PC의 Git Credential Manager에는 다른 GitHub 계정이 저장돼 있다. remote URL에 사용자명을 넣어(`https://<user>@github.com/...`) 계정을 구분할 것.

## 2026-09-10 · T-000 · Claude Code (claude-opus-5)
- 상태: 완료
- 한 일:
  - 원본 기획서 `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf`(13쪽)를 읽고 문서 체계 초안을 만듦
  - 공공데이터포털·웹에서 공공 API 확인
    - `관세청_화물통관진행정보`(15126268): 존재, XML, 개발 자동승인/운영 심의승인, UNI-PASS 가입 필요, 3년 이내 조회
    - 기획서의 해수부 링크(dataset/15011649)는 404. `해양수산부_외항화물컨테이너정보`(15131742)를 대체 후보로 찾음(필드: 항만명, 입항년도, 호출부호, 선박명, 적하목록관리번호, BL번호, MSN, 입출항일시, 반출입구분, 컨테이너번호·규격·사이즈)
    - UNI-PASS 엔드포인트·파라미터·응답 태그는 2차 출처(블로그)에서만 확인 → `[TO VERIFY]`
  - 기획서 내부 불일치 기록: 34대 vs 37대(Q-01), ₩18,720,000 vs ₩18,420,000(Q-02), RequiredHandlingBuffer 누락(Q-06)
  - 기획서에 없던 설계를 제안(ADR Proposed): 상태 = 마일스톤 유도 + 예외 오버레이, 최적화 2단계 분해, 위험 등급 기준, Baseline 정의, 적응형 폴링, Watchlist 온보딩
- 변경 파일: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/01_project-rules.md` ~ `docs/10_open-questions.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md` (모두 신규)
- 검증: 문서 간 교차 참조(태스크 ID, ADR 번호, 질문 ID)를 수동 확인. 코드 없음.
- 남은 일 / 다음 한 걸음:
  - 사람: T-001(검토·ADR 승인), T-002(API 키)
  - 에이전트: T-004(공식 명세·필드 사전) 또는 T-017(인터뷰 가이드)
- 큐 변경: T-001~T-008, T-017, T-029를 큐에 등록. T-000 DONE.
- 주의사항: 모든 문서가 Draft다. 사람 승인 전에는 ADR Proposed 내용을 확정 사실처럼 코드에 굳히지 말 것. 원본 기획서 PDF/DOCX는 루트에 그대로 있음(이동 여부 Q-16). DOCX는 PDF와 같은 내용으로 보고 따로 열어보지 않음.
