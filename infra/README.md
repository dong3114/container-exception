# infra/ — 로컬 실행 · 배포 구성 영역

**Docker 사용법의 정본은 이 파일이다.** 다른 문서(`AGENTS.md` 6절 · `docs/24` 18.13)는 여기를 가리킨다.

Docker 만이 유일한 개발 방식은 아니다. 평소 화면·코드 개발은 호스트에서 `npm run dev:*` · `python -m cera_ai` · `npm run dev`(Vite HMR)로 하고, **전체 재현 · 시연 · 다른 PC 에서 똑같이 띄우기**에 Docker Compose 를 쓴다. 클라우드 배포 구성은 아직 없다.

## 구성 (`infra/local/compose.yaml`)

| profile | 서비스 | 하는 일 | 호스트 포트(루프백만) |
| --- | --- | --- | --- |
| (항상) | `postgres` | PostgreSQL **18.6**(판 고정) | 55442 |
| `app` | `migrate` → `api` · `worker` · `ai` | migration(한 번 실행 후 종료) → Main Backend API · Worker(Outbox · 수신 · 추출) · Python AI Server + Agent Runtime | 3100 · — · 8100 |
| `web` | `web` | Control Tower 정적 빌드 + nginx (`/backend/*` → `api`) | 3000 |
| `llm` | `llm` | 로컬 소형 모델 서버(llama.cpp, OpenAI 호환) | 8080 |
| `eval` | `eval` | 평가 CLI(`python -m cera_ai.evals`, T-099) — 실행하고 끝남 | — |

이미지: `back/Dockerfile`(API · Worker · migrate 한 이미지) · `ai/Dockerfile`(AI 서버 · 평가 CLI 한 이미지, 빌드 맥락 = 저장소 루트 — Agent Runtime 이 `packages/contracts` 를 읽는다) · `front/web/Dockerfile`(빌드 맥락 = 저장소 루트, `front/web/Dockerfile.dockerignore`).
GPU 는 `infra/local/compose.gpu.yaml` 을 하나 더 겹쳐 쓴다(`llm` 만 바뀐다).

경계: 브라우저는 `web` → `api` 만 부른다(AI 서버 · 모델 서버 · DB 에 직접 가지 않는다 — `docs/23` 7.1). `api` → `ai`(추출 요청), `ai` → `api`(Agent Tool, 서비스 토큰), `ai` → `llm`(`local` 공급자). 호스트 포트는 전부 `127.0.0.1` 에만 연다.

## 명령 (저장소 루트에서)

처음 한 번: `infra/local/.env.example` → `infra/local/.env`(DB 비밀번호 · 모델). `back/.env` · `ai/.env` 는 없어도 기동되지만 토큰 · API 키가 비어 있다. 컨테이너 안 주소(DB `postgres:5432`, AI `ai:8100` …)는 compose 가 `.env` 값을 덮어쓴다. 아래 `DC` = `docker compose -f infra/local/compose.yaml --env-file infra/local/.env`.

```text
DC up -d --wait                                                  # DB 만
DC --profile app up -d --build                                   # + migration · API · Worker · AI
DC --profile app --profile web up -d --build                     # + 화면 http://127.0.0.1:3000
DC --profile app --profile web --profile llm up -d --build       # + 로컬 모델
DC --profile app run --rm migrate npm run db:seed               # 첫 실행 뒤 시드(반복 안전)
DC --profile app --profile web --profile llm --profile eval down # 정지(데이터 삭제는 down -v)
```

GPU: 위에 `-f infra/local/compose.gpu.yaml` 를 compose.yaml 뒤에 추가한다. 필요 조건과 확인된 범위는 아래 "GPU".

## 시연 · 테스트 콘솔 (`/demo`)

30대 합성 시나리오 한 판(현장 값 입력 → Agent 문의 → 사람 승인 · 발송 → Mock 회신 → 임시 사실 → 계획 v1 → 확인 → v2 → 정정 → v3 → 승인)을 화면 한 곳에서 단계별로 따라간다. 숫자는 전부 Backend 결과다. 평소 개발 DB 와 데이터를 나누려고 프로젝트 이름을 따로 준다(`-p cera-demo`). `compose.demo.yaml` 이 Agent 를 켜고 Mock 수신함을 시연 전용 폴더로 바꾼다(.env 는 그대로, 토큰은 `back/.env` · `ai/.env` 의 `CERA_AGENT_TOOL_TOKEN`).

```text
DEMO="docker compose -p cera-demo -f infra/local/compose.yaml -f infra/local/compose.demo.yaml --env-file infra/local/.env"
$DEMO --profile app --profile web up -d --build --wait && $DEMO --profile app run --rm migrate npm run db:seed   # → http://127.0.0.1:3000/demo
$DEMO --profile app --profile web down -v && rm -rf data/raw/mock-channel-demo                                  # 처음부터 다시
cd front/web && node scripts/demo-walkthrough.mjs                                                               # 브라우저로 11단계 자동 확인(깨끗한 상태에서)
```

Mock 회신은 개발 도우미 `POST /dev/demo/mock-reply`(APP_ENV local · test 에서만 붙고 OpenAPI 계약에 없다)로 넣는다. AI 는 녹화 재생이라 정해진 문장에만 답한다 — 콘솔의 회신 프리셋이 그 문장들이다.

## 로컬 모델 평가 (T-099)

```text
DC --profile eval run --rm eval extract --dataset cera-reply-eval-v1 --provider local --model <이름> --limit 5
bash infra/local/eval-ladder.sh 5                                # 작은 모델부터 차례로(모델 표 · 라이선스는 스크립트 머리)
CERA_COMPOSE_EXTRA=infra/local/compose.gpu.yaml bash infra/local/eval-ladder.sh 5
```

- 모델은 처음 켤 때 Hugging Face 에서 받아 `llm-cache` 볼륨에 둔다(저장소에 넣지 않는다). `infra/local/.env` 의 `CERA_LLM_HF` 가 `llm` 이 올리는 모델이다. **MVP 임시 기본값은 `unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M`**(최종 Production 선정 아님 — ADR-037, 설정만 바꿔 교체). 이 모델을 AI 서버가 쓰게 하려면 `ai/.env` 에서 `CERA_LLM_MODE=live` 만 바꾼다(`CERA_LLM_PROVIDER=local` · `CERA_LLM_MODEL=qwen3-4b-instruct-2507-q4_k_m` 은 `ai/.env.example` 에 이미 있다). 모델이 값을 틀리게 읽는 것은 정상이다 — Backend 검증과 사실 파이프라인(후보 → 임시 사실 → 사람 확인)이 사실이 되기 전에 걸러 낸다.
- **Windows Git Bash**: `/srv/...` 같은 컨테이너 경로를 인자로 주지 않는다 — `C:/Program Files/Git/...` 로 바뀌어 결과가 컨테이너 안에 갇힌다(`--out-dir` 를 생략하면 기본 경로가 `ai/evals/runs/` 로 연결돼 있다).
- 로컬 모델의 출력도 후보일 뿐이다. 판정은 Backend 검증기가 한다(ADR-029). 평가 결과는 모델 선정 근거이지 Production 결정이 아니다(규칙 9).

## Agent Runtime (LangGraph) 를 Docker 로

기본은 꺼져 있다. 켜려면 `back/.env` 의 `CERA_AGENT_TOOLS_ENABLED=true` 와 `ai/.env` 의 `CERA_AGENT_MODE=on`, 두 파일의 `CERA_AGENT_TOOL_TOKEN`(32자 이상, 같은 값). 켠 뒤 `GET /agent-runs/runtime` 이 `reachable: true` · `tool_count: 10` 이면 연결된 것이다. 시작은 `POST /agent-runs`(헤더 `X-CERA-Actor-Id`)와 `POST /agent-runs/{id}/start`.
- `ai` 이미지는 Backend 가 생성한 Tool 계약(`packages/contracts/agent-tools/`)을 읽는다 — 그래서 `ai` 빌드 맥락도 저장소 루트다.
- **로컬 모델의 첫 요청은 느리다**(모델 적재). 시간 제한은 정상적인 느린 실행을 막지 않는 넉넉한 비상 상한이다(Backend → AI 330초 · 모델 요청 300초 · 그래프 구동 900초 — `[ASSUMPTION / DEVELOPMENT SAFETY CEILING]`, 정본 `docs/24` 18.15). 사람 · 업체를 기다리는 동안은 시간 제한이 걸리지 않는다. 분포는 `back` 에서 `npm run runtime:stats` 로 보고 상한을 줄인다.

## GPU

`DC` 에 `compose.gpu.yaml` 을 겹치면 `llm` 이 `ghcr.io/ggml-org/llama.cpp:server-cuda` 로 `-ngl 99`(전 층 GPU) 실행된다. Docker Desktop(WSL2)에서 NVIDIA 드라이버가 있으면 `docker run --gpus all` 이 동작한다.
검증 범위(2026-10-26): GTX 1650(Turing, VRAM 4GB)에서 동작 확인. **GTX 1080(Pascal)은 이 환경에 없어 직접 확인하지 못했다 `[TO VERIFY]`.** 호환이 안 되면 CPU(`compose.gpu.yaml` 을 빼면 된다)가 fallback 이다.

## 기타

- `infra/local/postgres-init/01-roles.sh`: 최초 초기화 때 역할 `cera_owner`(migration 소유) · `cera_app`(실행 앱)과 DB `cera` · `cera_test` 를 만든다(`docs/24` 12.2). 표 권한은 migration 이 준다.
- 비밀값은 `.env`(gitignore)에만 둔다 — 이미지에 굽지 않는다(`*/.dockerignore` 가 `.env` 를 뺀다).
- 앞으로 둘 것: 클라우드 배포, 리버스 프록시·TLS, 로그·관측 제품(Q-67, `docs/23` 4·5절).

원칙: 하나의 Monorepo 에서 서비스별 이미지로 나눠 배포한다(ADR-024). 비밀정보는 저장소에 두지 않는다(`docs/01_project-rules.md` 6절).
