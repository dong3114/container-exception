# 23. 런타임 플랫폼 · 오류 처리 · 관측성 (Runtime Platform & Observability)

- 상태: **Draft — T-079 최종 승인과 함께 검토 통과** (2026-09-18). 문서 구조·원칙은 검토를 통과했지만 **ADR-030·031 은 Proposed 이고 기술 선택은 확정이 아니다**
- 관련 ADR: **ADR-030**(오류·관측성 원칙, Proposed) · **ADR-031**(런타임 방향: Backend 우선 후보·Web First·Desktop Client·AI 분리 조건, Proposed) · ADR-002(백엔드 스택 Python, Proposed) · ADR-024(Monorepo, Accepted) · ADR-026~028(외부 통신, Accepted) · ADR-029(결정론 엔진 분리, Accepted)
- 이 문서가 답하는 질문: **"CERA 프로그램이 어디서 돌고, 실패했을 때 무엇을 어디에 남기며, 어떤 기술을 언제 고르는가"**

> **이 문서는 기술을 최종 결정하지 않는다.** 아래에서 쓰는 말은 세 가지뿐이다.
>
> | 표현 | 뜻 |
> | --- | --- |
> | **현재 우선 후보** | 지금 근거로 가장 유력하다. 뒤집힐 수 있다 |
> | **사용자 최종 결정 필요** | 사용자가 정한다. 에이전트가 닫지 않는다 |
> | **T-069 뒤 사용자가 결정 → T-080 에 반영** | T-069 가 첫 구현 슬라이스와 그 요구사항을 확정하면 → **사용자가** Backend·DB 기술을 결정하고 → T-080 이 **결정된 기술을** 물리 설계에 반영한다. **T-080 이 기술을 처음 고르는 단계가 아니다** |
>
> 반대로 **오류 처리의 행동 원칙**(무엇을 분리하고 무엇을 남기나)은 기술 선택과 무관하게 지금 정한다. 어느 언어로 만들어도 같아야 하기 때문이다.

---

## 1. 범위 (Scope)

| 이 문서가 정본인 것 | 정본이 다른 곳에 있는 것 |
| --- | --- |
| 오류 처리 경계·흐름, 무엇을 DB 에 남기고 무엇을 로그에만 두나 | `system_error` **표 모양**(컬럼·제약) → `docs/22` 16.2a |
| 요청 id · 추적 id 원칙 | 업무 상관 id(`correlation_id`) → `docs/05` 4.2 |
| 외부 연동 오류의 **정규화**(분류·코드·재시도 가능 판정) | 발송 중복 방지·재시도 **정책** → `docs/18` H절 · `docs/19` |
| Backend 언어·프레임워크 **후보와 판단 근거** | 모듈 경계·저장소 배치 → `docs/07` · ADR-024·029 |
| Web First · Desktop 전략 · `DesktopBridge` | 화면 구성 → `docs/16` |
| AI 런타임을 언제 따로 떼나 | LLM 이 **무엇을 하고 무엇을 하지 않나** → `docs/01` 3절 · `docs/06` · `docs/18` O절 |
| API 계약 방향(OpenAPI) | 계약 전환 결정 자체 → ADR-028 |

**하지 않는 것**: 제품 코드, 프레임워크 설치, 실제 endpoint·URL·DTO, 로그·관측 제품 선택, LLM 공급자·모델 선택, 솔버 선택.

## 2. 현재 기술 기준선 (Current Technology Baseline)

| 영역 | 상태 | 내용 | 근거 |
| --- | --- | --- | --- |
| Frontend | **구현됨** | Next.js + React + TypeScript, 2D SVG 운영 지도, MockProvider | ADR-022(Proposed), `docs/16` |
| 저장소 | **Accepted** | 하나의 Private Monorepo, `front/`·`back/`·`ai/`·`packages/`·`data/`·`docs/`·`infra/` | ADR-024 |
| 결정론 엔진 위치 | **Accepted** | Tariff·Cost·Risk·Reconciliation·Optimize·Solver 는 `back/`, `ai/` 는 LLM·비정형 처리만 | ADR-029 |
| API 계약 | **Accepted (외부 통신 슬라이스부터)** | Backend OpenAPI 를 계약 정본으로, TypeScript 타입 생성 | ADR-028 |
| Backend 언어 | **미결** | 기록상 초안은 Python 3.12 + FastAPI(ADR-002 **Proposed**). **현재 우선 후보는 NestJS + TypeScript**(ADR-031 **Proposed**, 3절) | 이 문서 3절 |
| DB 제품 · ORM | **미결** | 초안 SQLite → PostgreSQL(ADR-004 Proposed). T-069 뒤 사용자가 Backend 와 함께 결정 → T-080 에 반영 | `docs/22` 28절 |
| 솔버 | **미결 (DEFERRED)** | 후보 CP-SAT 등. T-036 | ADR-007 |
| LLM 공급자·모델 | **미결 — 구현 시점 선택** | 요구사항은 "무엇을 하나"이지 "어느 제품인가"가 아니다 | `docs/07` 3절 D |
| Desktop | **미결 — MVP 에 없음** | Web First. 첫 후보 Electron, Tauri 는 나중 재평가(8~9절) | ADR-031 |
| 오류 처리·관측성 | **원칙 Proposed** | 세 기록 분리 + `system_error` + 공통 오류 처리 + 요청·추적 id | ADR-030, 4~6절 |

> **기존 문서와 어긋나는 곳**: `docs/07` 1·2·3절과 `docs/01` 7절은 아직 "Python 3.12 · FastAPI"를 적고 있다. 두 곳 모두 **초안(Proposed)** 이었고 이번에 "미결 — `docs/23` 참조"로 표시만 바꿨다. 본문 전면 정리는 **T-070**(주변 문서 동기화)에서 한다.

## 3. Backend 후보 (Backend Candidates)

### 3.1 현재 판단

**현재 우선 후보: NestJS + TypeScript.** 단 **사용자 최종 결정 필요**이며, **T-069 가 첫 구현 슬라이스와 요구사항을 확정한 뒤 사용자가 결정**하고 **T-080 은 그 결정을 물리 설계에 반영**한다. Java / Spring Boot 는 후보로 남는다. 기록상의 Python / FastAPI(ADR-002) 도 폐기하지 않았다 — 결정이 나면 ADR-002 를 `Superseded` 로 바꾼다.

### 3.2 비교

| 기준 | **NestJS + TypeScript** (현재 우선 후보) | **Java / Spring Boot** (후보 유지) | Python / FastAPI (ADR-002 초안) |
| --- | --- | --- | --- |
| Frontend 와 언어 | **같다.** 스키마·타입 공유가 쉽다 | 다르다. OpenAPI 생성으로 메운다 | 다르다. OpenAPI 생성으로 메운다 |
| 1인 개발 문맥 전환 | **적다** | 크다 | 중간 |
| 사용자 경험 | 회사에서 실제 사용 | Java 프로젝트에서 전역 예외 처리 + 오류 DB 기록 경험 | — |
| 구조 | Module · DI · Guard · Pipe · Interceptor · ExceptionFilter — Spring 계열 경험과 잘 맞는다 | 가장 성숙한 트랜잭션·영속성·운영 패턴 | 가볍다. 구조는 직접 세워야 한다 |
| 전역 오류 처리 | ExceptionFilter + Interceptor 로 충분하다 | `@ControllerAdvice` · Filter · Interceptor | 예외 핸들러 · 미들웨어 |
| Outbox · 재시도 · 연동 어댑터 | 충분하다 | 충분하다 | 충분하다 |
| Desktop(Electron) 과의 연속성 | **Node/TypeScript 생태계가 이어진다** | 없다 | 없다 |
| **최적화 솔버** | **약점.** OR-Tools 공식 배포에 Node.js 바인딩이 없다 `[TO VERIFY]`. 3.3 참고 | OR-Tools Java 바인딩이 있다 `[TO VERIFY]` | 가장 강하다 |
| 포트폴리오 가치 | TypeScript 풀스택 | Java/Spring 백엔드 — 목표가 이것이면 충분한 선택 이유다 | — |

### 3.3 NestJS 를 고를 때 반드시 같이 답할 것 — 솔버

ADR-029(Accepted)는 **최적화·솔버를 Backend 결정론 영역**에 둔다. Backend 가 TypeScript 이면 솔버를 어디서 돌릴지가 따로 남는다. **이것이 NestJS 선택의 가장 큰 기술 위험이다.** 지금 정하지 않고 선택지만 적는다.

| 선택지 | 뜻 | 주의 |
| --- | --- | --- |
| ① TypeScript 안에서 푼다 | JS/WASM 기반 선형·정수 계획 솔버, 또는 문제를 min-cost flow 등으로 풀 수 있으면 직접 구현 | 규모·성능·제약 표현력 확인 필요 (T-036) |
| ② 결정론 솔버 워커를 Python 으로 분리 | NestJS → 솔버 워커(입력 = 스냅샷, 출력 = 배정). **순수 결정론이며 AI 가 아니다** | ADR-029 에 따라 **`ai/` 가 아니라 `back/` 영역의 워커**다. 11절의 "Python AI 서비스"와 다른 것이다 |
| ③ Backend 를 Java/Python 으로 | 솔버 바인딩 문제가 사라진다 | 3.2 의 다른 장점을 포기한다 |

- **T-036(최적화 모델) 이 아직 DEFERRED 다.** 문제 규모(컨테이너 30대 안팎)와 제약 형태가 정해지기 전에 솔버 언어를 못 박지 않는다.
- 그래서 **T-069 뒤 사용자가 Backend 언어를 결정할 때 이 표를 같이 본다.** 첫 구현 슬라이스(T-069 외부 통신)는 솔버가 필요 없으므로 이 문제가 첫 슬라이스를 막지는 않는다.

### 3.4 어느 언어든 지켜야 하는 것

언어가 바뀌어도 `docs/01` 규칙은 그대로다: 금액은 **원 단위 정수**(JS 라면 `Number.MAX_SAFE_INTEGER` 안에서 정수만, 외화·환율은 소수 라이브러리) · 시각은 **Asia/Seoul 이 붙은 값** · 핵심 로직은 `as_of` 주입 · 결정론 엔진은 DB·네트워크·LLM 을 import 하지 않는다 · 외부 호출은 녹화 fixture 로 테스트.

## 4. 오류 처리와 관측성 (Error Handling / Observability)

사용자 요구: **서버 내부 오류와 서버 간·외부 시스템 호출 오류를 한 곳에서 추적하고**, 어디서 · 어떤 요청/실행에서 · 어떤 외부 호출이 실패했는지, 재시도 가능한지, 관련 Message·SendAttempt·RecoveryRun 이 무엇인지 확인할 수 있어야 한다. 단순히 "오류 테이블 하나"가 아니라 아래 구조를 원칙으로 둔다.

### 4.1 세 가지 기록을 섞지 않는다

| 기록 | 답하는 질문 | 어디 | 예 |
| --- | --- | --- | --- |
| **Operational Event** | 현실 세계에서 무엇이 사실이라고 주장됐나 | `event` | 창고 A 수용량 8 TEU |
| **Audit** | CERA 안에서 **누가** 무엇을 했나 | `audit_log` | 운영자 A 가 메시지 발송 승인 |
| **System / Integration Error** | CERA 안이나 외부 호출에서 **어떤 기술적 실패**가 났나 | 구조화 로그 + (중요하면) `system_error` | Gmail API 503 |

그리고 **업무 결과 기록**은 따로 있다.

| 기록 | 답하는 질문 |
| --- | --- |
| `send_attempt` | 이 발송 시도가 어떻게 끝났나 (`docs/22` 15.7) |
| `message_status_transition` | 이 메시지의 업무 상태가 어떻게 바뀌었나 |

```
Gmail API timeout
  → 현실 Event 아님          (현실에 대한 주장이 아니다)
  → 사람의 Audit 자체도 아님  (사람의 행위가 아니다. 발송을 누른 행위는 원래대로 감사에 남는다)
  → send_attempt 결과 기록    "이 시도는 RETRYABLE_FAILURE 로 끝났다"
  → system_error 기록 가능    "back-worker 의 channels.gmail.send_message 에서 GMAIL_TIMEOUT, 재시도 가능, trace=…"
```

**같은 실패가 두 곳에 남아도 역할이 다르다.** 운영자는 통신 화면에서 `send_attempt` 를 보고, 개발자는 `trace_id` 로 `system_error` 와 로그를 본다.

### 4.2 공통 오류 처리 흐름 — 세 경계, 한 기록기

오류를 잡는 경계는 세 곳이다. **세 곳 모두 같은 Error Recorder 와 Structured Logger 를 쓴다.** 경계마다 try/catch·로그·DB 기록을 따로 짜지 않는다.

| 경계 | 무엇 | 사용자에게 돌려주는 것 |
| --- | --- | --- |
| **API Request Boundary** | 화면·외부 클라이언트의 요청 처리 | 안전한 오류 응답(코드 · 사람이 읽을 문장 · `request_id`). **스택 트레이스·내부 경로는 돌려주지 않는다** |
| **External Integration Boundary** | Gmail · 공공 API · LLM 등 외부 호출 | 호출한 쪽에 **정규화된 오류**(6절)를 던진다 |
| **Background Job / Worker Boundary** | Outbox 발송, 수신 폴링, 재계산, 동기화 | 작업 상태에 실패 기록. 사람이 볼 곳(통신 화면·알림)에 요약 |

```
API / Worker / Integration Adapter
        │
        ▼
   Exception
        │
        ▼
 공통 예외 처리 (경계마다 하나, 규칙은 하나)
        ├─ 안전한 사용자/API 응답        (API 경계일 때)
        ├─ 구조화 로그                   (항상: 레벨 · 경계 · 구성요소 · 작업 · 오류 코드 · request_id · trace_id)
        ├─ request_id / trace_id 보존
        └─ 정책상 중요한 오류 → system_error   (4.3 기준)
```

- **예상한 업무 오류**(입력 검증 실패, 권한 없음, 승인 조건 불충족 등)와 **예상 밖 오류**(버그, 외부 장애)를 구분한다. 앞의 것은 정상 응답의 한 종류이고, 뒤의 것만 오류 경보 대상이다.
- 프레임워크별 구현(NestJS ExceptionFilter · Spring `@ControllerAdvice` 등)은 **정하지 않는다.** 위 행동을 만족하면 된다.

### 4.3 DB 에 남기는 오류 vs 로그에만 두는 것

`system_error` 는 **로그 저장소를 대신하지 않는다.**

| `system_error` 에 남긴다 | 로그에만 둔다 |
| --- | --- |
| 검색·대응이 필요한 중요한 ERROR | 정상적인 입력 검증 실패(대부분의 4xx) |
| 외부 시스템 호출 실패(시간 초과·인증·요청 한도·5xx·응답 형식 오류) | 사용자의 정상적인 입력 실수 |
| 예상하지 못한 5xx | debug · info 로그 |
| 백그라운드 작업 실패 | 반복되는 낮은 가치의 경고 |
| 데이터 처리 실패(파싱·추출·재계산 실패) | 성공한 요청의 상세 |
| 운영 대응이 필요한 기술 오류 | 전체 스택 트레이스 **본문** (→ 로그, DB 에는 `raw_log_ref` 만) |

- 같은 원인이 짧은 시간에 수백 번 나면 **모두 넣지 않는다.** 묶음·표본 규칙은 구현 때 정한다 `[ASSUMPTION]`.
- 기록 실패가 본래 작업을 막지 않는다. `system_error` 쓰기가 실패하면 로그에만 남기고 원래 오류를 그대로 처리한다.
- 오류가 해결됐는지·누가 대응했는지는 `system_error` 행을 고쳐 남기지 않는다. **이번 단계에서 대응 이력 표는 만들지 않는다**(`docs/22` 16.2a).

### 4.4 비밀·원문을 남기지 않는다

로그와 `system_error` **어디에도** 넣지 않는다: API 키 · OAuth 토큰 · 비밀번호 · 주소 확인 토큰 · 실제 메일 본문 · 실제 공공 API 원문 응답 · 실제 B/L 번호 · 계약서 내용. 외부 응답을 남겨야 하면 **마스킹한 요약**이나 원문 저장소의 **참조**만 둔다(`docs/01` 6절). 전체 스택 트레이스는 외부 로그에만 두고 DB 에는 `raw_log_ref` 만 둔다.

### 4.5 `system_error` 표

컬럼·제약·무결성 규칙의 정본은 `docs/22` 16.2a 다. 요점만:

- 분류 `EVIDENCE` · 변경 `APPEND_ONLY` — 오류 발생 기록은 고치지 않는다
- 어디서(`service_name` · `component_name` · `operation_name` · `error_boundary`) · 무엇이(`error_category` · `error_code` · `safe_error_message` · `exception_type`) · 어떤 흐름에서(`request_id` · `trace_id`) · 어느 외부 시스템(`target_system` · `http_status`) · 다시 해도 되나(`retryable`) · 무엇과 관련(`related_entity_type` · `related_entity_id`, 다형 참조, DB FK 없음) · 상세 위치(`raw_log_ref`) · `is_simulated`
- 업무 도메인 개념이 아니다. `event` 를 만들지 않고 계산·승인의 입력이 아니다

## 5. 요청 id · 추적 id (Correlation / Trace)

**MVP 첫 구현부터 넣는다.** 나중에 붙이면 이미 쌓인 로그를 잇지 못한다.

| 식별자 | 무엇을 잇나 | 누가 만드나 |
| --- | --- | --- |
| **`request_id`** | 하나의 API 요청 또는 하나의 작업 실행 | 요청이 들어오는 경계(API · 작업 시작). 클라이언트가 보낸 값이 있으면 받아 쓸 수 있다 |
| **`trace_id`** | 서버 안의 여러 계층과 외부 호출을 **한 흐름**으로 | 흐름의 시작점. 이후 모든 로그·`system_error`·외부 호출에 전파 |

```
Frontend ──(request_id)──> Backend API ──(trace_id 전파)──> Outbox Worker ──> Gmail Adapter ──> Gmail API 503
   │                          │                               │                 │
   └─ 오류 화면에 request_id    └─ 구조화 로그                   └─ 구조화 로그     └─ system_error(trace_id, request_id)
```

→ `trace_id` 하나로 **Frontend → Backend → Gmail Adapter → Gmail API 503** 을 찾을 수 있어야 한다.

**헷갈리기 쉬운 세 가지를 구분한다.**

| 이름 | 성격 | 정본 |
| --- | --- | --- |
| `request_id` · `trace_id` | **기술 추적** — 프로그램이 한 요청을 어떻게 처리했나 | 이 문서 |
| `correlation_id` | **업무 상관** — 메일 스레드 · Recovery Run · 확인 요청 · 시나리오 단계 | `docs/05` 4.2 (`event`) |
| `idempotency_key` | **중복 방지** — 같은 발송·같은 수신을 두 번 처리하지 않기 | `docs/05` · `docs/22` 15.7 |

- 비동기 작업(Outbox 등)은 **작업을 만든 요청의 `trace_id` 를 작업에 실어** 이어 간다. 새 작업 실행마다 `request_id` 는 새로 만들 수 있다.
- 외부로 나가는 호출에는 가능한 범위에서 추적 정보를 싣는다(예: 이미 정한 `X-CERA-Message` 헤더, `docs/18` H.2). 외부 시스템에 내부 식별자를 과하게 노출하지 않는다.
- 사용자 오류 화면에는 `request_id` 를 보여 줘 문의할 때 쓰게 한다.
- **OpenTelemetry 같은 특정 표준·제품은 지금 정하지 않는다.** 위 전파 규칙을 지키면 나중에 붙일 수 있다.
- 헤더 이름·형식(UUID 등)은 구현 때 정한다.

## 6. 외부 연동 실패 정책 (Integration Failure Policy)

### 6.1 공통 Integration Client / Wrapper

각 Adapter(Gmail · 공공 API · LLM …)가 매번 try/catch · 재시도 · 로그를 복붙하지 않는다. **공통 Integration Client(또는 같은 역할의 계층)** 하나가 아래를 맡는다.

| 공통 계층이 하는 일 | Adapter 가 하는 일 |
| --- | --- |
| 시간 제한(timeout) 적용 | 요청 만들기·응답 해석 |
| 실패를 **CERA 내부 분류·코드로 정규화** | 채널 고유의 성공 판정 |
| `retryable` 판정 | 채널 고유의 오류 코드 → 공통 계층에 넘길 단서 |
| 구조화 로그 + 중요하면 `system_error` | — |
| `request_id` · `trace_id` 전파 | — |

**재시도 여부·횟수·간격은 호출한 업무 쪽 정책이 정한다.** 특히 발송은 "보냈는지 모르는 상태"가 있으므로 **재전송 전에 외부 조회로 화해**한다(`docs/18` H.2). 공통 계층은 "다시 해도 되는 종류의 실패인가"만 판정한다.

### 6.2 정규화 — 분류와 코드 예시

| 원인 | 오류 분류(예) | 오류 코드(예) | `retryable` |
| --- | --- | --- | --- |
| 시간 초과 | 외부 시간 초과 | `GMAIL_TIMEOUT` | 예 (발송은 화해 먼저) |
| 연결 실패 | 외부 연결 실패 | `GMAIL_CONNECTION_FAILED` | 예 |
| 401 / 403 | 외부 인증 | `GMAIL_AUTH_EXPIRED` | **아니오** — 사람이 재동의 (`docs/18` H.3) |
| 429 | 외부 요청 한도 | `GMAIL_RATE_LIMITED` | 예 (`Retry-After` 존중) |
| 5xx | 외부 서버 오류 | `GMAIL_SERVER_ERROR` | 예 |
| 응답 형식·스키마가 다름 | 외부 응답 형식 오류 | `EXTERNAL_RESPONSE_INVALID` | 보통 아니오 |

- **전체 값 목록은 지금 확정하지 않는다**(Q-66). 위는 방향을 보여 주는 예시다. 채널이 늘면 접두어(`GMAIL_` · `UNIPASS_` · `LLM_` …)로 늘린다.
- 발송의 업무 분류(일시 · 인증 · 영구 · 정책 · 반송)와 재시도 정책의 정본은 `docs/18` H.3 이다. 이 표는 그 판정에 들어가는 **기술 신호를 한 가지 말로 바꾸는 것**이다.
- **정책 거부**(Contact Gate 불통과, 승인 지문 불일치 등)는 기술 오류가 아니다. `system_error` 가 아니라 업무 상태·감사로 남는다.

## 7. Web First

**MVP 는 Web 으로만 만든다.** CERA 의 가치는 데스크톱 포장이 아니라 아래 폐쇄 루프다.

```
예외 발생 → 현재 상태 → Risk / Cost → Recovery Plan → 문의 → 승인 → 발송 → 회신 → 재계산
```

이 루프가 Web 에서 돌기 전에는 Desktop 을 만들지 않는다.

## 8. Desktop 전략

### 8.1 Desktop 은 Client 다

**Desktop 앱 안에 CERA 의 정본 Backend 와 DB 를 한 덩어리로 넣지 않는다.**

```
Web Browser            ┐
  또는                  ├──>  Central CERA Backend  ──>  Database
Electron/Tauri Client  ┘
```

여러 운영자가 **같은** Event · CanonicalFact · Approval · Message · RecoveryRun · PlanDecision 을 봐야 한다. 앱마다 DB 가 있으면 "누가 승인했나"·"현재 사실이 무엇인가"가 기기마다 달라진다. Desktop 은 **화면 + 운영체제 연동 계층**이다.

### 8.2 언제 만드나

현업 필요성이 확인되고(예: 알림·트레이·파일 끌어놓기가 실제로 업무를 바꾼다는 인터뷰 결과) **Web 폐쇄 루프가 동작한 뒤**다. 지금 일정에 넣지 않는다.

## 9. Electron vs Tauri

| | **Electron** — 첫 Desktop 후보 | **Tauri** — 나중 재평가 |
| --- | --- | --- |
| 화면 재사용 | 기존 React/Next 화면 | 기존 React/Next 화면 |
| 언어 | TypeScript/Node — Frontend·(우선 후보) Backend 와 같다 | Rust 를 더 관리해야 한다 |
| 1인 개발 비용 | 낮다 | 언어·도구 복잡도가 는다 |
| 운영체제 기능 | Windows 알림 · 트레이 · 시작 프로그램 · 파일 열기/저장 · 끌어놓기 · 로컬 보안 저장소 · 클립보드 · 로컬 연동을 붙이기 쉽다 | 가능하다. 권한 경계가 더 엄격하다 |
| 크기·메모리 | Chromium 포함 — 설치 크기와 메모리가 크다 | 작은 실행 파일, 낮은 메모리(WebView 사용) |

**현재 판단**: Desktop 이 필요해지면 **Electron 이 첫 후보**다. 크기·메모리가 CERA 같은 업무용 앱에서 **실제로 문제가 되는지 확인한 뒤** 판단한다. Tauri 는 **배포 크기 · 메모리 · 네이티브 보안 요구가 실제 문제가 될 때** 재평가한다. **지금 Rust/Tauri 를 먼저 들이지 않는다.**

> 이전 문서(ADR-024 방향 · `docs/07` 6절 · 루트 README)는 "Tauri 재사용 검토"라고 적었다. 그것은 **확정이 아니었고**, 이번에 "Electron 첫 후보, Tauri 나중 재평가"로 갱신했다(ADR-031 Proposed).

## 10. DesktopBridge

나중에 Electron ↔ Tauri 를 바꾸거나 Web 과 함께 쓰려면, 화면 코드가 특정 데스크톱 런타임 API 를 여기저기 직접 부르면 안 된다. **한 인터페이스 뒤에 숨긴다.**

```
DesktopBridge (개념)
  notify()          알림
  openFile()        파일 열기
  saveFile()        파일 저장
  secureStore()     로컬 보안 저장
  clipboard()       클립보드
  getNetworkState() 네트워크 상태

WebDesktopBridge       브라우저 기능으로 대체하거나 "지원 안 함"
ElectronDesktopBridge  Electron API
TauriDesktopBridge     Tauri API
```

- 정확한 메서드·타입은 **구현 때** 정한다. 지금은 원칙만: **화면은 `DesktopBridge` 만 안다.**
- `DesktopBridge` 는 **업무 로직을 갖지 않는다.** 승인·발송·계산은 여전히 중앙 Backend 가 한다(`docs/01` 7절 — 화면에 비즈니스 로직을 넣지 않는다).
- `front/web` 의 `CeraDataProvider`(읽기)·`CeraCommandClient`(쓰기, ADR-028)와 같은 방식의 경계다.

## 11. AI 런타임 분리 (AI Runtime Split)

### 11.1 지금

현재 AI 가 하는 일은 **이메일 초안 문장 · 회신 구조화 추출 · 계약/문서 추출 · 자연어 설명**이다. 이 수준에서는 **Backend 가 LLM API 를 직접 호출해도 충분하다.** 처음부터 Python AI 마이크로서비스를 만들지 않는다.

- ADR-029 의 **`ai/` 영역 경계는 그대로다** — LLM 코드는 `ai/` 패키지에 모이고, 결정론 엔진은 그것을 import 하지 않는다. 다만 `ai/` 는 **별도 서비스가 아니라 같은 Backend 프로세스 안의 모듈**로 시작할 수 있다(언어는 Backend 결정을 따른다).
- LLM 출력이 후보일 뿐이라는 규칙(`docs/01` 3절, ADR-026)은 런타임 배치와 무관하다.

### 11.2 Python 서비스를 따로 떼는 조건

"AI 니까 Python" 이 아니라 **Python 전용 요구가 실제로 생길 때** 뗀다.

| 떼는 신호 | 예 |
| --- | --- |
| 로컬 추론 | PyTorch · Transformers 로컬 모델 |
| 문서 처리 파이프라인 | OCR 파이프라인 |
| 자체 모델 | 커스텀 ML 모델 학습·서빙 |
| GPU | GPU 추론 |
| 데이터 처리 | Python 중심 데이터 처리가 핵심이 될 때 |

그때 구조: **Backend → Python AI Service** (내부 API 호출). Python AI Service 도 DB 커넥션·외부 발송 권한을 갖지 않는다(ADR-029, `docs/07` 6절).

> **솔버는 여기 해당하지 않는다.** 솔버 워커를 Python 으로 떼는 경우(3.3 ②)는 **결정론 엔진**이고 `back/` 영역이다. "AI 서비스"라고 부르지 않는다(`AGENTS.md` 4절 규칙 11 — 결정론 모듈을 "Agent"·"AI"라고 부르지 않는다).

**LLM 공급자·모델은 여전히 확정하지 않는다**(`docs/07` 3절 D).

## 12. API 계약 (OpenAPI)

- 방향: **Backend OpenAPI 를 계약 정본**으로 두고 TypeScript 타입을 `packages/` 에 생성한다(ADR-028, 외부 통신 슬라이스부터).
- 목표: **Next.js Web · Electron Client · 향후 외부 Client 가 같은 Backend API 계약을 쓴다.** Desktop 용 별도 API 를 만들지 않는다.
- 오류 응답도 계약의 일부다 — 오류 코드 · 사람이 읽을 문장 · `request_id` 를 담는 **공통 오류 응답 모양**을 계약에 둔다. 모양의 세부는 구현 계획에서 정한다.
- **이번에 확정하지 않는 것**: 실제 endpoint · URL · DTO 세부 · 코드 생성 도구.

## 13. 미룬 결정과 결정 시점 (Deferred Decisions & Timing)

| 결정 | 지금 상태 | 언제 · 어디서 |
| --- | --- | --- |
| Backend 언어·프레임워크 | **현재 우선 후보 NestJS + TypeScript**, Spring Boot 후보 유지, **사용자 최종 결정 필요** (Q-64) | T-069 로 첫 슬라이스 확정 → **Backend·DB 기술 결정** → T-080 |
| 솔버 실행 위치·언어 | 미결 (Q-65) | T-036 재개 뒤. Backend 결정 때 3.3 표를 함께 본다 |
| DB 제품 · ORM · 마이그레이션 도구 | 미결 | T-069 뒤 사용자 결정(Backend 와 함께) → T-080 에 반영. 마이그레이션 도구 세부는 T-080 |
| `system_error` 분류·코드 값 목록 | 예시만 (Q-66) | T-069 · 구현 |
| 로그 저장소·관측 제품(OpenTelemetry 등) | 미결 (Q-67) | 첫 배포 환경을 정할 때 |
| `request_id`·`trace_id` 헤더 이름·형식 | 미결 | 구현 |
| 오류 묶음·표본 규칙 | 미결 `[ASSUMPTION]` | 구현 |
| Desktop 착수 여부·시점 | **MVP 에 없음** | 현업 인터뷰(T-064·T-017) + Web 폐쇄 루프 동작 뒤 |
| Electron / Tauri | Electron 첫 후보, Tauri 나중 재평가 | Desktop 착수 시점 |
| Python AI 서비스 분리 | 하지 않음 | 11.2 신호가 실제로 생길 때 |
| LLM 공급자·모델 | 미결 — 구현 시점 선택 | 구현 |
| 공통 오류 응답 모양 | 방향만 | T-069 구현 계획 |

**작업 순서** (2026-09-18 기준, `docs/tasks/QUEUE.md` 가 정본):

```
T-079 최종 정리(이번) → 사용자 + ChatGPT 최종 검토 → T-079 DONE
→ T-070 주변 문서 동기화 (docs/04 · 07 · 13 · 19 …)
→ T-069 외부 통신 구현 계획 (Q-44 · Q-45 결정, L-13 결정, 첫 구현 슬라이스 확정)
→ Backend · DB 최종 기술 결정
→ T-080 물리 설계 (첫 슬라이스에 필요한 표부터 — 논리 표 전체를 한 번에 하지 않는다)
→ Antigravity 구현 → Claude/Codex 검토 → 사용자 승인 / commit
```

## 14. 다른 문서와의 관계

| 문서 | 관계 |
| --- | --- |
| `docs/01` | 규칙이 이긴다. 7절 백엔드 줄을 "미결 — 이 문서 참조"로 표시했다. 6절에 로그·오류 기록의 비밀 금지를 한 줄 더했다 |
| `docs/05` | 업무 상관 id(`correlation_id`)의 정본. 기술 추적 id 와 구분한다(5절) |
| `docs/07` | 모듈 경계·저장소 배치의 정본. 기술 스택 표는 **T-070 에서 이 문서 기준으로 정리**한다 |
| `docs/12` | 단계별 일정. Web First · Desktop 은 Pilot 이후 선택지로만 적는다 |
| `docs/14` | ADR-030(오류·관측성) · ADR-031(런타임 방향) — 둘 다 Proposed |
| `docs/15` | Q-64 ~ Q-67 (이 문서의 미결 항목) |
| `docs/17` | AI 협업 역할(사용자 = 최종 결정, Claude 또는 Codex = Orchestrator, ChatGPT = 계획 보조·독립 검토, Antigravity = 구현). 이 문서는 그 흐름을 바꾸지 않는다 |
| `docs/18` · `docs/19` | 발송 재시도·중복 방지·실패 분류의 정본. 이 문서는 기술 오류 정규화·기록만 더한다 |
| `docs/22` | `system_error` 표 모양(16.2a)의 정본 |
