# cera-reply-eval/v1 — CERA 회신 평가셋 (T-099)

부산항 수입 컨테이너 운영에서 CERA 가 운송사 · 창고 · ODCY 에 보낸 **질문 하나**에 상대가 보낸 **짧은 회신**을 읽는 일을 평가한다.
모든 회신은 **합성**이다(실제 메일 · 거래처 · 사람 · 전화 · 차량 번호 없음). 141건 · 14범주 · ko 128 / en 9 / mixed 4.

| 파일 | 무엇 |
| --- | --- |
| `source.py` | 사람이 고치는 원본(정답 포함). `python evals/datasets/cera-reply-eval-v1/source.py` 로 `cases.jsonl` 생성 — 시험이 둘이 같은지 본다 |
| `cases.jsonl` | 생성된 평가 케이스 |
| `review/gold-review.csv` | **사람 검토표**(생성). 엑셀로 열어 `reviewer_decision` 을 채운다 |
| (검토 방법) | `gold-review.csv` 의 `reviewer_decision` 칸에 `OK`(맞음) · `FIX`(틀림 — `source.py` 를 고친 뒤) · `UNSURE`(하나로 정하기 어려움)를 적어 저장한다. 다시 생성해도 이 두 칸은 유지된다 |
| `review/blind-agreement.json` | 정답을 보지 않은 두 번째 라벨링과의 일치 결과(생성) |

## 1. 정답 상태 — 정직하게

- 정답은 이 루브릭으로 **작성**했다. 모델 출력에서 가져오지 않았다. 다만 작성자는 AI(Claude, T-099 1차 세션)다 — **사람이 검토하기 전에는 Gold 가 아니라 Draft 다**.
- `label_status`: `DRAFT_NEEDS_HUMAN_REVIEW`(기본) → 사람 검토 뒤 `HUMAN_VERIFIED`(그대로 맞음) · `HUMAN_CORRECTED`(사람이 고침 — `source.py` 를 고친다) · `HUMAN_DISPUTED`(사람도 하나로 정하기 어렵다 → 평가에서 뺀다).
- `gold_confidence`(생성): 정답을 보지 않은 두 번째 라벨링(같은 루브릭)과 평가에 쓰는 모든 항목이 일치하면 `AGREED`, 하나라도 다르면 `CONTESTED`. `AGREED` 는 **two-model-agreed(AI 교차 검토)** 이지 Human Gold · Verified Gold 가 아니다(2026-10-22: AGREED 119 · CONTESTED 22, 사람 검토 0). **AI 둘의 일치는 사람 검토를 대신하지 않는다** — 사람이 먼저 볼 곳(CONTESTED)을 고르는 데 쓴다.
- 벤치마크는 결과를 세 묶음으로 낸다: 전체(Draft) · `AGREED` · 사람 검토 완료(`HUMAN_VERIFIED` + `HUMAN_CORRECTED`). `CONTESTED` · `HUMAN_DISPUTED` 는 주 지표에서 뺀다.

## 2. 질문(ask)

질문 템플릿 4개(`source.py` `ASKS`): T1 운송사 13일 15:00~17:00 트럭 2대 · T2 운송사 13일 09:00~12:00 트럭 3대 · C1 창고 13일 반입 컨테이너 수량 · C2 ODCY 14일 40HC 반입 수량. 기준일 `reference_date = 2026-10-12`(월) — "내일" = 13일, "모레" = 14일, "오늘" = 12일.
물을 수 있는 항목: 트럭 질문 = `quantity`(TRUCK) · `available_from` · `available_until`(HH:MM), 컨테이너 질문 = `quantity`(CONTAINER).

## 3. 루브릭

### 3.1 추출(extraction) — 값 후보 + 근거

1. **물은 항목만** 뽑는다. 운임 · 단가 · 보관료 · 대기료 · 차번 · 연락처 · 다른 날짜 · 다른 시간대 · 다른 규격 · 회신 시점(예: "오후 4시쯤 알려드리겠다")은 뽑지 않는다(`ignored` 에 적어 둔다).
2. **말하지 않은 값은 만들지 않는다.** 시각을 말하지 않았으면 질문의 시간창을 복사하지 않는다("요청하신 시간대에 2대" → 수량만). "오후" 만으로는 시각이 아니다. "그 정도" · "몇 대" 를 질문의 숫자로 바꾸지 않는다.
3. **값 정규화**: 수량은 정수 문자열("두 대" → `2`, "네 대" → `4`, "한 대" → `1`, "다섯 개" → `5`). 시각은 24시간 `HH:MM`. 트럭 시간창이 오후인 질문(T1)에서 "3시" · "4시 이후" 처럼 오전/오후 없는 시각은 오후로 읽는다(`bare_hour`). "3시 반" → `15:30`.
4. **근거(evidence)**: 회신 원문의 **정확한 부분 문자열**. 받을 수 있는 근거가 여럿이면 모두 적고 첫째가 대표다.
5. **고쳐 말하기**: 정정하면 마지막 값("3대… 정정합니다. 2대만" → `2`). 인용된 이전 메일(`-----Original Message-----` 아래)의 숫자는 답이 아니다.
6. **여러 숫자**: 물은 시간창 · 규격 · 날짜의 숫자만. 합계는 원문에 "총 N대" 가 있을 때만 — 직접 더하지 않는다(R6).
7. **범위**("2~3대" · "한두 대"): 최솟값만, `optional`(뽑지 않아도 감점 없음). 최댓값을 뽑으면 과대 확정이다.
8. **날짜가 다르면** 값을 뽑지 않는다(13일을 물었는데 14일 · 오늘 답) — 답 유형 `UNCLEAR`.
9. **명시한 0** 은 값으로 뽑아도 된다("0대입니다").
10. `optional: true` 인 정답은 빠뜨려도 감점하지 않는다(예: ETA 를 가능 시작 시각으로 볼지).

### 3.2 판정(decision)

- `answer_type`: `AVAILABLE`(가능하다고 답함 — 조건이 붙어도) · `UNAVAILABLE`(물은 것에 대해 안 된다) · `DEFERRED`(나중에 답하겠다) · `UNCLEAR`(답인지 알 수 없음 · 날짜가 다름 · 지시문 뿐).
- `answers_question` = `answer_type ∈ {AVAILABLE, UNAVAILABLE}`.
- `commitment`: `FIRM`(확정적으로 말함) · `CONDITIONAL`(조건 · 추측 · 범위 · "확정은 아니지만" · "~할 것 같다" · "아마") · `UNKNOWN`(DEFERRED · UNCLEAR).
- `needs_human_review` = 아래 사유가 하나라도 있으면 참:
  - **R1** commitment 가 FIRM 이 아님 · **R2** 답 유형이 DEFERRED · UNCLEAR
  - **R3** 지시문 · 신원 주장 같은 주입 문구가 있음 · **R4** 수량이 빠졌거나 일부를 나중에 답한다고 함
  - **R5** 날짜 · 차종이 질문과 맞지 않음 · **R6** 원문에 없는 계산(합계)이 필요함

### 3.3 권한 경계

모델은 **후보**만 낸다. 값의 형식 · 근거 · 단위 · 질문 범위는 Backend 결정론 검증기가 확인하고(`back/src/communication/extraction-rules.ts`, 평가에서는 같은 규칙의 Python 포팅), 어떤 후보도 사실이 아니다(T-093 전). 판정 모델은 확률만 내고 업무 정책(문턱값)은 Backend 가 정한다.
