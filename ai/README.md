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

## 하지 않는 것 (`docs/18` O절 · ADR-033)

DB 접근(커넥션 · ORM 없음) · 채널 · 메일 · 발송 · 발신자 신원 · 거래처 권한 · 사실 키 · 적용 범위 · 근거 강도 · 사건 · 현재 사실 · 승인 · 비용 · 위험 · 솔버. **출력은 언제나 후보**이고, Main Backend(`back/`)의 결정론 검증기가 인용 · 형식 · 단위 · 질문 범위를 확인한 뒤에만 다음 단계로 간다. 브라우저는 이 서버를 부르지 않는다(Main Backend 만).

## 명령 (ai 폴더에서, Python ≥ 3.12)

```text
설치:      pip install -e ".[dev]"            # fastapi · pydantic · uvicorn (+ pytest · httpx)
실행:      python -m cera_ai                  # 127.0.0.1:8100 (CERA_AI_PORT · CERA_AI_HOST)
시험:      python -m pytest -q
계약:      python -m cera_ai.emit_schema      # → packages/contracts/ai/reply-extract.v1.schema.json (시험이 최신인지 검사)
환경변수:  CERA_LLM_MODE=replay|live (기본 replay) · CERA_AI_REPLAY_DIR(기본 fixtures/replay)
```
