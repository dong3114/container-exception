# 코드표 (Code Tables) v0.1

- 상태: Draft v0.1 (T-004 산출물, 사람 검토 전)
- 최종 수정: 2026-09-11 (기획 v0.2: 관련 문서 경로만 갱신)
- 관련: `field-dictionary.md`(출처 ID S-nn, 태그 규칙은 0절, v0.2 읽는 법은 맨 위 주석), `../05_event-and-state.md`(Event 유형)

**원칙**: 이 표에는 1차 출처에서 **관측한 값만** 적는다. 공식 코드표를 찾지 못한 코드는 샘플에서 본 값만 적고 나머지는 `[TO VERIFY]`로 둔다. 추측으로 값을 채우지 않는다. 실제 응답(T-005, T-006)에서 새 값이 나오면 출처를 `실제 응답(날짜)`로 적고 추가한다.

---

## 1. 항만·선박 (DS-02, DS-03)

### 1.1 항만청코드 `prtAgCd`

| 코드 | 항만청명 | 출처 |
| --- | --- | --- |
| `020` | 부산 | `[VERIFIED S-06 요청·응답 샘플]` |
| `622` | 광양 | `[VERIFIED S-04 요청·응답 샘플]` |
| 그 밖의 코드 | — | `[TO VERIFY]` 공식 전체 코드표를 찾지 못함 |

- CERA PoC는 부산만 다룬다(ADR-010) → `020`만 쓴다.

### 1.2 반입반출구분 `tkinTkoutSe` (DS-02)

| 코드 | 명칭(`tkinTkoutNm`) | 출처 |
| --- | --- | --- |
| `II` | 수입 | `[VERIFIED S-04 샘플]` |
| 그 밖의 코드 | — | `[TO VERIFY]` Q-18 |

- 샘플의 명칭이 "수입"이라서, 이 코드는 **게이트 반입/반출이 아니라 적하목록의 수출입 구분**일 가능성이 있다. 확정 전에는 상태 이벤트로 해석하지 않는다.

### 1.3 검색일구분 `deGb` (DS-03 요청)

| 코드 | 의미 | 출처 |
| --- | --- | --- |
| `I` | 입항일 기준 (기본값) | `[VERIFIED S-06]` |
| `O` | 출항일 기준 | `[VERIFIED S-06]` |

### 1.4 DS-03 샘플에서 관측한 값 (전체 코드표 아님)

| 필드 | 관측 값 | 출처 |
| --- | --- | --- |
| `vsslKndCd` / `vsslKndNm` 선박종류 | `41` 풀컨테이너선, `21` 산물선(벌크선) | `[VERIFIED S-06 샘플]` |
| `etryptPurpsCd` / `etryptPurpsNm` 입항목적 | `01` 양적하, `03` 적하 | `[VERIFIED S-06 샘플]` |
| `etryndNm` 입출항구분명 | `입항`, `출항` | `[VERIFIED S-06 샘플]` |
| `reqstSeNm` 신청구분명 | `최종` | `[VERIFIED S-06 샘플]` |
| `ibobprtNm` 내외항구분명 | `외항` | `[VERIFIED S-06 샘플]` |

### 1.5 컨테이너 규격·사이즈 (DS-02)

| 필드 | 관측 값 | 출처 |
| --- | --- | --- |
| `contnStndrd` | `22GP` | `[VERIFIED S-04 샘플]` |
| `contnSize` | `20` | `[VERIFIED S-04 샘플]` |

- `contnStndrd`가 ISO 6346 사이즈·타입 코드(예: `22GP` = 20ft 일반 건화물)를 따르는지는 공식 문서에 없다 `[TO VERIFY]`. 확정 전에는 `equipment.type`을 자동 판정하지 않고, 원천값을 보관한 뒤 매핑표로 바꾼다.

---

## 2. 통관·화물 (DS-01 UNI-PASS API001)

공식 코드표를 찾지 못했다. S-02(연계 가이드 v3.6)에는 필드 정의만 있고 코드값 목록은 없다. 아래는 공식 샘플(항공 화물 1건)에서 관측한 값이다.

### 2.1 진행상태코드 `prgsStCd` / 진행상태 `prgsStts`

| 필드 | 관측 값 | 출처 |
| --- | --- | --- |
| `prgsStCd` | `CAGE12` | `[VERIFIED S-02 샘플]` |
| `prgsStts` | `반출완료` | `[VERIFIED S-02 샘플]` |

- 같은 샘플에서 `CAGE12`와 `반출완료`가 함께 나왔지만, 이 둘이 서로의 코드·명칭 짝인지는 **공식 문서에 없다** `[TO VERIFY]`.
- 전체 코드표: `[TO VERIFY]` (UNI-PASS 사이트 추가 문서, 또는 T-005 실제 응답에서 수집).

### 2.2 통관진행상태 `csclPrgsStts`

| 관측 값 | CERA 해석 (제안) | 출처 |
| --- | --- | --- |
| `수입신고수리` | `CUSTOMS_CLEARED` 후보 | 값은 `[VERIFIED S-02 샘플]`, 해석은 `[ASSUMPTION]` |
| 그 밖의 값 | — | `[TO VERIFY]` |

### 2.3 B/L유형 `blPt` / `blPtNm`

| 코드 | 명칭 | 출처 |
| --- | --- | --- |
| `C` | Consol | `[VERIFIED S-02 샘플]` |
| 그 밖의 코드 | — | `[TO VERIFY]` |

- FCL/LCL 범위 필터(ADR-010)에 쓸 수 있는지는 전체 코드를 확인한 뒤 판단한다.

### 2.4 처리구분 `cargTrcnRelaBsopTpcd` (처리이력) → Event (`source_type = PUBLIC_API`)

| 관측 값 | 함께 나온 `rlbrCn` | CERA `event_type` (제안) | 출처 |
| --- | --- | --- | --- |
| `반출신고` | `수입신고 수리후 반출` | `GATE_OUT` 후보. 단, 장치장이 ODCY면 ODCY 반출일 수 있음 | 값은 `[VERIFIED S-02 샘플]`, 매핑은 `[ASSUMPTION]` |
| 그 밖의 값 | — | — | `[TO VERIFY]` Q-12 |

- T-005에서 실제 처리이력을 모아 이 표를 채운다. 양하·반입·수입신고·수리 행이 있는지가 핵심이다.

### 2.5 Y/N 계열 플래그 (관측 값만)

| 필드 | 관측 값 | 출처 |
| --- | --- | --- |
| `rlseDtyPridPassTpcd` 반출의무과태료여부 | `N` | `[VERIFIED S-02 샘플]` |
| `dclrDelyAdtxYn` 신고지연가산세여부 | `N` | `[VERIFIED S-02 샘플]` |
| `mtTrgtCargYnNm` 관리대상화물여부명 | `N` | `[VERIFIED S-02 샘플]` |

- 필드 이름이 "~명"인데 샘플 값이 `N`이다. 실제 값이 문자열 명칭인지 Y/N인지 `[TO VERIFY]`.

### 2.6 단위

| 필드 | 관측 값 | 출처 |
| --- | --- | --- |
| `wghtUt` | `KG` | `[VERIFIED S-02 샘플]` |
| `pckUt` | `CT` | `[VERIFIED S-02 샘플]` |

---

## 3. 에러 코드

### 3.1 UNI-PASS (DS-01)

| 판정 | 내용 | 출처 |
| --- | --- | --- |
| 오류 | `tCnt = -1`. `ntceInfo`에 한글 오류 메시지. 모든 오류 코드는 `-1` 하나 | `[VERIFIED S-02]` |
| HTTP 상태 | 오류여도 **200** | `[VERIFIED S-08]` |
| 목록 응답 | `ntceInfo`가 `[N00]`으로 시작 → 오류가 아니라 여러 건 목록 | `[VERIFIED S-02]` |
| 관측 메시지 | `존재하지 않는 인증키입니다.` | `[VERIFIED S-02 예시]` |
| 관측 메시지 | `인증키(crkyCn)는 필수입력입니다.` | `[VERIFIED S-08]` |
| 그 밖의 메시지 (조회 결과 없음, 3년 초과 등) | — | `[TO VERIFY]` T-005 |

- 메시지가 한글 자유 문장이므로, 파서는 `tCnt=-1`이면 오류로 보고 **메시지 원문을 그대로 기록**한다. 메시지별 분기(재시도 여부 등)는 실제 메시지를 모은 뒤 정한다.

### 3.2 공공데이터포털 게이트웨이 (DS-02, DS-03)

**정상 봉투**: `response/header/resultCode = 00`, `resultMsg = NORMAL_SERVICE` `[VERIFIED S-04, S-06]`

**오류 봉투 (실제 관측)** `[VERIFIED S-08]`:

```xml
<OpenAPI_ServiceResponse>
  <cmmMsgHeader>
    <errMsg>SERVICE_KEY_IS_NULL</errMsg>
    <returnAuthMsg>서비스 접근거부</returnAuthMsg>
    <returnReasonCode>20</returnReasonCode>
  </cmmMsgHeader>
</OpenAPI_ServiceResponse>
```

HTTP 401과 함께 왔다(키 없이 호출, DS-02·DS-03 모두 같음).

**코드표가 두 가지다. 같은 숫자가 다른 뜻으로 쓰인다.**

| 코드 | 활용가이드 S-04·S-06 (2018~2024 양식) | 포털 에러코드 안내 S-03 (현행 게이트웨이) |
| --- | --- | --- |
| `01` | APPLICATION_ERROR | APPLICATION_ERROR |
| `04` | — | HTTP_ERROR |
| `05` | — | SERVICETIMEOUT_ERROR |
| `10` | INVALID_SERVICE_KEY_ERROR | **INVALID_REQUEST_PARAMETER_ERROR** |
| `11` | INVALID_REQUEST_PARAMETER_ERROR | — |
| `12` | NO_OPENAPI_SERVICE_ERROR | NO_OPENAPI_SERVICE_ERROR |
| `20` | SERVICE_ACCESS_DENIED_ERROR | SERVICE_KEY_IS_NULL / PERMISSION_DENIED / SERVICE_ACCESS_DENIED_ERROR |
| `22` | LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR | 같음 (포털 설명: "**일일** 호출 허용량 초과") |
| `23` | — | LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR |
| `29` | — | BLACKLIST_IP_ACCESS_ERROR |
| `30` | SERVICE_KEY_IS_NOT_REGISTERED_ERROR | 같음 |
| `31` | DEADLINE_HAS_EXPIRED_ERROR | 같음 |
| `32` | UNREGISTERED_IP_ERROR | — |
| `99` | UNKNOWN_ERROR | — |

출처: 가이드 열은 `[VERIFIED S-04, S-06]`, 포털 열은 `[VERIFIED S-03]`.

**파서 규칙**:
- 루트가 `OpenAPI_ServiceResponse`면 게이트웨이 오류다. `errMsg` **문자열**로 분기한다.
- 루트가 `response`인데 `resultCode ≠ 00`이면 기관 API 오류다. `resultCode`와 `resultMsg`를 함께 기록한다.
- 재시도: `01`·`04`·`05`·`23`은 지수 백오프로 재시도한다. `22`는 다음 한도 초기화 때까지 멈춘다. 키·권한 오류(`20`·`30`·`31`)는 재시도하지 않고 알린다 `[ASSUMPTION]`.
- 문자열로 분기해도 되는지(게이트웨이가 errMsg를 일관되게 주는지)는 T-006 실제 응답으로 확인한다 `[TO VERIFY]`.
