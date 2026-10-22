# ai/ — CERA AI Server (LLM·비정형 처리)

**이 영역은 LLM·비정형 처리와 Agent 추론 런타임을 맡는다** (ADR-029 · ADR-033 Accepted · **ADR-036 Accepted 2026-10-22** — LangGraph Agent Runtime 은 T-104 부터. Agent 는 CERA Backend Tool API 와 LLM 공급자만 부르고, DB · 메일 · 공공 API 를 직접 부르지 않는다). 위험·비용·Tariff·Reconciliation·최적화·Solver 같은 **결정론 엔진은 `back/`에 있다** — "숫자는 결정론 엔진에서만 나온다"(`docs/01_project-rules.md` 3절).

## 지금 있는 것 (T-092 U7 · 2026-10-07)

| 무엇 | 파일 |
| --- | --- |
| 회신 추출 계약 v1 (`docs/18` D.3) — 요청: 물은 질문(`ask_id` · 답할 칸 · 단위 · 시간창) · 기준일 · 정확한 원문 텍스트 / 응답: 값 **후보** + 원문 그대로의 인용 | `cera_ai/contracts.py` (pydantic, 모르는 키 거부) · 공유 견본과 JSON Schema `packages/contracts/ai/` |
| HTTP 서버(FastAPI) — `GET /health` · `POST /v1/extractions/reply` | `cera_ai/app.py` · 실행 `python -m cera_ai` |
| 프롬프트 — 물은 질문에만 답하게 하고, 회신을 데이터로 다룬다(회신 안의 지시를 따르지 않음), 인용은 글자 그대로 | `cera_ai/extraction.py` |
| LLM 공급자 **포트** + **녹화 재생**(Recorded replay — LLM 호출 없음) + **실제 공급자 자리** | `cera_ai/providers.py` · 녹화 `fixtures/replay/*.json`(합성 문장 — 실제 메일 아님) |

- **LLM 공급자·모델은 아직 정하지 않았다**(ADR-033 미결). `CERA_LLM_MODE=live` 는 어댑터가 선택될 때까지 `PROVIDER_NOT_CONFIGURED` 로 거부한다. 공급자를 고를 때 `LlmProvider` 를 구현하는 어댑터 하나를 더하고 그 결정을 ADR 로 남긴다. 비밀값(API 키)은 서버 환경변수로만 — 저장소 · 프론트에 두지 않는다
- 녹화 재생은 요청의 `message_text` sha256 으로 녹화를 찾는다. 응답의 `model_version` 은 `replay:<판>` — 화면은 "녹화 재생 — LLM 미실행"으로 보여준다
- **stateless**: 요청 사이에 아무것도 기억하지 않는다. 여러 인스턴스로 띄워도 같은 입력 → 같은 출력
- 로그: 요청 id · 메시지 id · 결과 · 지연 · 사용량만. 원문 · 인용 · 비밀값은 남기지 않는다

## Agent Tool Client (T-103 · ADR-036)

| 무엇 | 파일 |
| --- | --- |
| Tool Registry — Backend 가 만든 계약 파일 `packages/contracts/agent-tools/agent-tools.v1.json` 을 읽는다(DTO 를 손으로 쓰지 않는다). 프레임워크 중립 — T-104 가 LangGraph Tool 로 감싼다 | `cera_ai/tools/registry.py` |
| 작은 JSON Schema 검사기 — 생성된 계약이 쓰는 키워드만, 그 밖은 거부 | `cera_ai/tools/schema_check.py` |
| Backend Tool Client — `Authorization: Bearer` 서비스 토큰 · `X-CERA-Agent-Run-Id` · `Idempotency-Key` · 입력/출력 계약 검사 · 타입 있는 결과(시간 초과 · 거부도 예외가 아니라 결과) · 토큰은 URL · 로그 · repr 에 없다 | `cera_ai/tools/client.py` · `client_from_env()`(`CERA_AGENT_MODE=on` · `CERA_BACKEND_TOOL_URL` · `CERA_AGENT_TOOL_TOKEN`) |

- Agent 가 할 수 있는 일은 Tool 9개뿐이다(읽기 · 외부 읽기 · 초안 제안 · 승인 요청). 승인 · 발송 · 사실 확정 · 계획 확정 Tool 은 없다
- DB · data.go.kr · UNI-PASS · 메일 채널을 직접 부르지 않는다 — 모두 Backend Tool 을 거친다

## Agent Runtime — `CeraRecoveryGraph` (T-104 · ADR-036)

| 무엇 | 파일 |
| --- | --- |
| 그래프 하나 — START → `load_context` → `observe_public_data`(사람이 기간을 줬을 때만) → `inspect_gaps` → `choose_next_action` →(COMMUNICATION) `prepare_inquiry` → `create_draft` → `request_approval` → `wait_for_human`(interrupt) → `track_message`(권위 상태) → `wait_send_request`(사람의 발송 요청) · `wait_delivery` · `wait_reply`(외부) → `read_reply`(검증된 추출 후보) → `reassess_gaps`(업무 공백 vs 후보 상태) → `build_result` → END(T-105). 다른 분기: PUBLIC_DATA(`fetch_public_data` → 다시 공백) · WAIT_EXTERNAL(`wait_external` interrupt) · COMPLETE · FAIL. 분기는 결정론 코드, 정책 hook 은 허용 행동만 돌려줄 수 있다 | `cera_ai/agent/graph.py` |
| State 는 id · 참조 · 코드 · 카운터만(업무 행 · 원문 · 토큰 없음). 재개 뒤 업무 상태는 Tool 로 다시 읽는다 | `graph.py` `RecoveryState` |
| Tool 호출 — Registry 안의 Tool 만 · 상한(`CERA_AGENT_MAX_STEPS` · `CERA_AGENT_MAX_TOOL_CALLS`) · retryable 실패만 같은 키로 재시도(`CERA_AGENT_MAX_RETRIES`) | `cera_ai/agent/tooling.py` |
| checkpoint — LangGraph `BaseCheckpointSaver` 구현, 저장은 Backend `/internal/agent-runtime/*` 로만(DB 자격증명 없음) | `cera_ai/agent/checkpointer.py` · `backend.py` |
| 실행 — `POST /v1/agent-runs/{id}/start` · `/resume`(Backend Coordinator 만 부른다, Bearer 서비스 토큰). 결과 계약 `agent-runtime/1`. 호출 사이 메모리 상태 없음 → 재시작해도 이어 간다 | `cera_ai/agent/runtime.py` · `app.py` |

- 의존성은 `langgraph==1.2.11` · `langgraph-checkpoint==4.2.0` 만 고정(LangChain Agent · LangSmith 필수 아님 · Multi-Agent 없음)
- Agent 는 보내지 않는다: 승인 뒤 사람이 발송을 요청하고 Backend Worker 가 보낸다. 회신 후보는 사실이 아니다 — 결과는 "후보 도착(확정 전)"으로 끝난다(T-093 이 승격)
- Tool 호출 상한은 대기와 대기 사이 한 구간마다, 단계 상한은 실행 전체. 같은 실행의 시작을 다시 받으면 checkpoint 에서 이어 간다(T-104 durability)
- 녹화 재생 `fixtures/replay/odcy-capacity-yes.json` — 가상 ODCY 수용량 회신(합성, T-105 시연 · E2E)

## 하지 않는 것 (`docs/18` O절 · ADR-033)

DB 접근(커넥션 · ORM 없음) · 채널 · 메일 · 발송 · 발신자 신원 · 거래처 권한 · 사실 키 · 적용 범위 · 근거 강도 · 사건 · 현재 사실 · 승인 · 비용 · 위험 · 솔버. **출력은 언제나 후보**이고, Main Backend(`back/`)의 결정론 검증기가 인용 · 형식 · 단위 · 질문 범위를 확인한 뒤에만 다음 단계로 간다. 브라우저는 이 서버를 부르지 않는다(Main Backend 만).

## 명령 (ai 폴더에서, Python ≥ 3.12)

```text
설치:      pip install -e ".[dev]"            # fastapi · pydantic · uvicorn (+ pytest · httpx)
실행:      python -m cera_ai                  # 127.0.0.1:8100 (CERA_AI_PORT · CERA_AI_HOST)
시험:      python -m pytest -q
계약:      python -m cera_ai.emit_schema      # → packages/contracts/ai/reply-extract.v1.schema.json (시험이 최신인지 검사)
환경변수:  CERA_LLM_MODE=replay|live (기본 replay) · CERA_AI_REPLAY_DIR(기본 fixtures/replay)
Agent:     CERA_AGENT_MODE=on · CERA_AGENT_TOOL_TOKEN(back/.env 와 같은 값) · CERA_BACKEND_TOOL_URL — 켜면 /v1/agent-runs/* 가 열린다
```
