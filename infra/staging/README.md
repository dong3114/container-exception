# CERA Private Staging / Live Test Runbook (T-132 · ADR-040)

공개 포트폴리오 데모(`infra/portfolio`)와 **같은 코드 · 다른 설정 · 다른 데이터**로 실제 업무 흐름을 검증하는 개인 환경이다. 일반 인터넷 방문자용이 아니다.

| | 공개 포트폴리오 데모 | Private Staging |
| --- | --- | --- |
| 구성 | `infra/portfolio/compose.yaml`(프로젝트 `cera-portfolio`) | `infra/staging/compose.yaml`(프로젝트 `cera-staging`) |
| 사용자 | 외부 방문자(DEMO_VISITOR · [데모 시작]) | 개발자 · 운영자(ADMIN · OPERATOR · FIELD_OPERATOR 정식 로그인) |
| 데이터 | 합성 시나리오 · 자동 초기화 | 실제 운영 입력 · **유지**(초기화 스크립트 없음) |
| 메일 | Mock 만(Gmail 을 켜면 기동 거부) | 실제 Gmail(허용 목록 주소로만 — 비운영 환경 안전장치) |
| LLM | 녹화 재생만 | 상용 LLM(`CERA_LLM_MODE=live`) 또는 녹화 재생 |
| 공공데이터 | 꺼짐 | live(키) 가능 |
| DB · Redis · ContentStore · 세션 | 이 프로젝트의 볼륨 | 이 프로젝트의 볼륨 — **서로 공유하지 않는다** |
| 접근 | 인터넷 공개(HTTPS) | 루프백(SSH 터널) 또는 HTTPS + Basic Auth + 정식 로그인 |

관리자만 우회해서 데모에서 실제 Gmail 을 쓰는 길은 없다 — 환경 자체가 다르다(`CERA_PORTFOLIO_DEMO_MODE` 가 다르고, 데모는 설정 단계에서 실제 채널을 거부한다).

## 1. 준비

```bash
cp infra/staging/.env.example infra/staging/.env && chmod 600 infra/staging/.env
# 비밀번호 4개 · 토큰 · 허용 출처 · 사람 계정 비밀번호(12자+)를 채운다
# 실제 Gmail: back 에서 npm run gmail:auth → GMAIL_* · CERA_GMAIL_ENABLED=true · CERA_TEST_RECIPIENT_ALLOWLIST(받을 시험 주소)
# 상용 LLM: CERA_LLM_MODE=live · CERA_LLM_PROVIDER=gemini · CERA_LLM_MODEL=<모델> · GEMINI_API_KEY
# 공공데이터: CERA_PUBLIC_DATA_MODE=live · DATA_GO_KR_SERVICE_KEY
```

## 2. 기동 · 첫 준비

```bash
S="docker compose -f infra/staging/compose.yaml --env-file infra/staging/.env"
$S up -d --build --wait          # postgres → migrate(한 번) → api · worker · ai → web(127.0.0.1:3400)
$S run --rm bootstrap            # SYSTEM · AI_AGENT 행위자 + 사람 계정. 합성 데이터 없음 · 반복 안전
```

- `bootstrap` 을 건너뛰면 Worker 가 `SYSTEM_ACTOR_MISSING` 으로 발송 · 수신 · 탐지를 하지 못한다
- 시나리오 시드(`db:seed`)는 staging 에서 거부된다 — 거래처 · 담당자 · 시설은 관리자가 등록한다(운영 콘솔 · `/registry` API)

## 3. 접근

- **SSH 터널(권장, 공개 주소 없음)**: `ssh -L 3400:127.0.0.1:3400 <서버>` → 브라우저 `http://127.0.0.1:3400`
- **인터넷 주소**: `.env` 의 `CERA_DOMAIN` · `CERA_ACME_EMAIL` · `CERA_STAGING_BASIC_AUTH_USER` · `CERA_STAGING_BASIC_AUTH_HASH`(`docker run --rm caddy:2.8.4 caddy hash-password --plaintext '<비번>'`, 작은따옴표로) → `$S --profile edge up -d`. HTTPS + Basic Auth + 정식 로그인 세 겹
- 더 막고 싶으면 서버 방화벽 IP 허용 목록 · VPN · Cloudflare Access 를 앞에 둔다(필수 아님)
- 같은 서버에 포트폴리오 데모가 이미 80 · 443 을 쓰고 있으면 edge 를 켤 수 없다 — SSH 터널을 쓰거나 다른 서버에 둔다(한 Caddy 로 두 사이트를 묶는 구성은 [향후])

## 4. 실제 데이터 넣기 → 자동 예외 탐지

1. 관리자: 시설(창고 · ODCY) · 거래처 · 담당자 · 주소 등록 · 승인(실제 주소는 허용 목록 안에서)
2. 운영자: 운영 기준 계획 = 원래 반입 계획 CSV → 운영 콘솔 "운영 기준 계획 입력"(검증만 → 저장) 또는 `POST /planning/inputs/containers`(실행 없이). **복구 대안(ODCY · 트럭 풀)과 요율도 먼저 넣는다** — 대안이 하나도 없으면 Agent 가 물을 곳 없이 비용 계산으로 가 실패한다(FINDINGS F-7). 요율 · 시설 계획 정보 → `/planning/inputs/rates` · `/facility-profiles`
3. 현장 · 운영자: 그날 창고 수용량 → `POST /truth/facts/manual`(첫 값) · 바뀌면 `POST /truth/events/{id}/correct`
4. CERA: 예정 반입 > 확정 수용량이면 예외(`/exceptions`) + 복구 실행(출처 AUTO_DETECTED)을 스스로 만든다
5. 운영자: 운영 콘솔 "지금 해야 할 일"의 "복구 조사를 시작해 주세요" [Agent 시작] → 문의 수량을 정해 Agent 시작 → 초안 승인 → 발송 요청 → (실제 Gmail) → 회신 → (상용 LLM) 추출 → 사실 → 계획 → 승인

## 5. 운영

**운영 Dashboard(T-133)**: 관리자 · 운영자로 로그인하면 운영 콘솔 첫 화면이 지금 해야 할 일 → 현재 예외(이력) → 복구 실행 → 운영 기준 계획 입력 → **시스템 상태** 순이다. 위 배지가 `PRIVATE STAGING` 인지 먼저 본다.

| 화면 표시 | 뜻 · 할 일 |
| --- | --- |
| 시스템 정상 | 모든 구성 요소 정상 |
| 일부 지연 · 대체 경로로 운영 중 | 업무는 계속된다. 예: Redis 장애 → PostgreSQL 폴링(데이터 손실 없음, 느릴 수 있음) · AI 장애 → 답장은 사람 검토 · 직접 입력 → `$S start redis` / `$S start ai` |
| 사람 조치 필요 | Worker 멈춤(마지막 확인 90초 넘음 — 발송 · 수신 · 추출이 서 있음) → `$S start worker` · Gmail 인증 거부 → 아래 토큰 갱신 |
| 중단 | PostgreSQL 에 닿지 않음 → `$S ps postgres` · 로그 |

- 빌드 commit 을 화면에 보이려면 `.env` 에 `CERA_BUILD_COMMIT=$(git rev-parse --short HEAD)`(git 해시만 표시) → `$S up -d api`
- 상태 API: `GET /backend/ops/system-status`(ADMIN · OPERATOR 세션) — 주소 · 키 · 경로를 내주지 않는다. 장기 지표 · 알림은 없다(현재 상태만)

```bash
$S ps ; $S logs -f --tail=200 api ; $S logs --tail=200 worker
$S restart api worker
curl -fsS http://127.0.0.1:3400/backend/health
```

- 백업 · 복원: 데이터가 유지되므로 정기 백업을 권한다 — `infra/portfolio/README.md` 5절 명령에서 프로젝트 이름만 `cera-staging` 으로(`$S exec -T postgres pg_dump …` · `cera-staging_content` 볼륨)
- Gmail 토큰 갱신(Testing 모드 약 7일): `cd back && npm run gmail:auth` → `.env` 의 `GMAIL_REFRESH_TOKEN` 교체 → `$S up -d api worker`
- LLM 키 교체: `.env` → `$S up -d ai`
- 긴급 발송 차단: `.env` 의 `CERA_SENDING_PAUSED=true` → `$S up -d worker`
