# CERA 공개 포트폴리오 배포 Runbook (T-131 · ADR-039)

인터넷에 공개하는 **안전한 체험 환경**을 한 대의 Linux 서버(VPS · 클라우드 VM)에 Docker Compose 로 올리고 혼자 관리하기 위한 문서다. 특정 클라우드에 묶이지 않는다.

## 0. 무엇이 켜지고 무엇이 막히나

| 서비스 | 역할 | 인터넷 노출 |
| --- | --- | --- |
| `caddy` | HTTPS 종단(Let's Encrypt 자동 발급 · 갱신) · HSTS | **80 · 443 만** |
| `web` | 정적 화면(nginx) · `/backend/*` → api · 보안 헤더(CSP 등) · IP 별 초당 요청 제한 · `/backend/internal/*` 404 | 없음(caddy 뒤) |
| `api` | NestJS Main Backend(빌드본 `node dist/main.js`) | 없음(내부망) |
| `worker` | 발송(Mock) · 수신 · 추출 · Agent 재조정 | 없음 |
| `ai` | Python AI Server + Agent Runtime(녹화 재생만) | 없음 |
| `postgres` · `redis` | 업무 정본 · 실행 큐(비밀번호) | 없음(외부로 나가는 길도 없는 `internal` 망) |
| `migrate` | migration 한 번(끝나야 api · worker 가 뜬다) | — |
| `seed` | 포트폴리오 시드(`run --rm seed` 로만) | — |

공개 데모 모드(`CERA_PORTFOLIO_DEMO_MODE=true`, compose 가 고정)에서 Backend 는 **Gmail · 실제 수신 허용 목록 · 공공데이터 · dev-header 인증 · 장애 주입**이 켜진 설정이면 기동하지 않는다. AI Server 는 상용 LLM 모드면 기동하지 않는다(키도 넘기지 않는다). 방문자는 [데모 시작] → `DEMO_VISITOR` 세션(비밀번호 없음, 관리 권한 없음)으로 들어온다.

## 1. 서버 준비

- 추천 최소 사양: **2 vCPU · 4 GB RAM · 20 GB SSD**(컨테이너 메모리 상한 합 ≈ 3.3 GB · 실측 사용 ≈ 0.5 GB 대기 상태) · Ubuntu 24.04 LTS 등
- Docker Engine + Compose v2. 방화벽은 **22(SSH) · 80 · 443 만** 연다
- 도메인의 A(/AAAA) 레코드를 서버 IP 로

```bash
sudo mkdir -p /opt/cera && sudo chown $USER /opt/cera
git clone <저장소 주소> /opt/cera && cd /opt/cera
cp infra/portfolio/.env.example infra/portfolio/.env && chmod 600 infra/portfolio/.env
# 비밀값 만들기(각각 다른 값): openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-40
nano infra/portfolio/.env      # CERA_DOMAIN · CERA_PUBLIC_ORIGIN · 비밀번호 4개 · 토큰 · ACME 메일
```

## 2. 배포 (처음 · 업데이트 같음)

```bash
cd /opt/cera
P="docker compose -f infra/portfolio/compose.yaml --env-file infra/portfolio/.env"
git pull                        # 업데이트 때
$P up -d --build --wait         # postgres → migrate(한 번) → api · worker · ai → web → caddy
$P run --rm seed                # 처음 한 번(반복 실행 안전). "Portfolio demo visitor: created"
curl -fsS https://<도메인>/backend/health   # {"status":"ok",...}
```

- **migration**: `migrate` 컨테이너만 실행한다(api 를 여러 개 띄워도 migration 은 한 번). 반복 실행 안전. 실패하면 api · worker 가 뜨지 않는다 → `$P logs migrate`
- **시드**: `CERA_PORTFOLIO_DEMO_MODE` 가 아니면 시드 명령이 거부한다 — 개인 운영 DB 에 데모 데이터가 실수로 들어가지 않는다

## 3. 재시작 · 로그 · 상태

```bash
$P ps                               # 모두 Up(healthy)인가
$P restart api worker               # 앱만
$P logs -f --tail=200 api           # API 오류(JSON 한 줄 로그, request_id 로 찾기)
$P logs --tail=200 worker           # 발송 · 수신 · 추출 실패
$P logs --tail=200 ai               # AI Server · Agent Runtime
$P exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping'   # PONG
curl -fsS https://<도메인>/backend/health   # db · queue 상태(비밀값 없음)
```

모든 컨테이너는 `restart: unless-stopped` — 서버 재부팅 · 프로세스 장애 뒤 자동으로 다시 뜬다. Redis 가 멈춰도 업무는 PostgreSQL 폴링으로 계속된다(느려질 뿐).

## 4. 데모 초기화

공개 데모는 여러 방문자가 **같은 상태**를 쓴다. `reset-demo.sh` 가 DB · 내용 볼륨을 지우고 시드를 다시 넣는다(약 30~60초, 그동안 화면은 "Backend 응답 없음" 후 자동 회복 · 방문자 세션은 끊겨 [데모 시작]을 다시 누른다).

```bash
infra/portfolio/reset-demo.sh                # 지금 초기화
infra/portfolio/reset-demo.sh --if-idle 20   # 방문 흔적(세션)이 있고 20분 동안 조작이 없을 때만
```

cron(권장):

```cron
*/10 * * * * cd /opt/cera && infra/portfolio/reset-demo.sh --if-idle 20 >> /var/log/cera-reset.log 2>&1
0 4 * * *    cd /opt/cera && infra/portfolio/reset-demo.sh >> /var/log/cera-reset.log 2>&1
```

- 공개 인터넷에 초기화 API 는 없다(서버 cron · 운영자만)
- 이 스크립트는 `cera-portfolio` 프로젝트의 볼륨만 지운다. 업무 기록 append-only 정책은 개인 운영 DB 의 규칙이고, 데모 DB 는 합성 데이터라 통째로 다시 만든다

## 5. 백업 · 복원

데모 데이터는 합성이고 초기화로 언제든 다시 만들 수 있어 **백업은 필수가 아니다**. 데모 상태를 보존하고 싶을 때:

```bash
mkdir -p backups && TS=$(date +%Y%m%d-%H%M)
$P exec -T postgres pg_dump -U postgres -Fc cera > backups/cera-$TS.dump
docker run --rm -v cera-portfolio_content:/c -v "$PWD/backups":/b alpine tar czf /b/content-$TS.tgz -C /c .
```

복원(빈 볼륨에):

```bash
$P rm -sf api worker ai
$P exec -T postgres psql -U postgres -c "DROP DATABASE cera WITH (FORCE)" -c "CREATE DATABASE cera OWNER cera_owner"
$P exec -T postgres psql -U postgres -d cera -c 'REVOKE ALL ON DATABASE cera FROM PUBLIC; GRANT CONNECT, TEMPORARY ON DATABASE cera TO cera_app; REVOKE ALL ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO cera_owner;'
$P exec -T postgres pg_restore -U postgres -d cera --no-owner --role=cera_owner < backups/cera-<TS>.dump
docker run --rm -v cera-portfolio_content:/c -v "$PWD/backups":/b alpine sh -c 'rm -rf /c/* && tar xzf /b/content-<TS>.tgz -C /c'
$P up -d --wait
```

(DB + ContentStore 를 함께 복원해야 원문 · Agent 체크포인트가 맞는다. 운영 DB 의 전체 절차는 `infra/README.md` 백업/복원 절.)

## 6. 키 · 비밀번호 교체

| 무엇 | 방법 |
| --- | --- |
| `CERA_AGENT_TOOL_TOKEN` | `.env` 값 바꾸기 → `$P up -d api worker ai`(셋이 같은 값을 읽는다) |
| `CERA_REDIS_PASSWORD` | `.env` 바꾸기 → `$P up -d redis api worker` |
| DB 비밀번호 | 초기화 스크립트 실행 전에 `.env` 를 바꾸면 새 볼륨이 새 값으로 만들어진다(데모 DB). 볼륨을 유지하려면 `ALTER ROLE cera_app PASSWORD '...'` 뒤 `.env` 를 맞추고 `$P up -d api worker` |
| 관리자 계정 | `.env` 에 `CERA_SEED_ADMIN_PASSWORD`(12자+) → `$P run --rm seed`. 공개 데모 운영에는 필요 없다 |
| 상용 LLM 키 · Gmail OAuth | **공개 데모에는 넣지 않는다.** 실제 Gmail · 상용 LLM 은 개인 운영(Private) 배포에서만 — `back/.env` · `ai/.env` 와 `infra/README.md`(Gmail 은 `npm run gmail:auth`, Testing 모드 토큰 약 7일) |

## 7. 관측 (추가 스택 없이)

- API 오류: `$P logs api | grep '"level":"error"'` — 응답의 `request_id` 로 찾는다(방문자에게는 스택 · SQL · 경로가 보이지 않는다)
- Worker 실패 · AI 공급자 실패: `$P logs worker` · `$P logs ai`
- Redis · DB: `/backend/health` 의 `queue` · `db`
- 요청 한도: 429 `RATE_LIMITED`(IP 별) · `DEMO_QUOTA_EXCEEDED`(하루 Agent 실행 전체 한도 — `.env` 의 `CERA_PORTFOLIO_MAX_AGENT_RUNS_PER_DAY`)

## 8. 로컬에서 이 구성을 시험하기

```bash
# infra/portfolio/.env: CERA_DOMAIN=localhost · CERA_PUBLIC_ORIGIN=https://localhost:18443 · CERA_HTTP_PORT=18080 · CERA_HTTPS_PORT=18443 · CERA_HSTS_MAX_AGE=0
$P up -d --build --wait && $P run --rm seed
# → https://localhost:18443 (Caddy 내부 인증서 — 브라우저 경고는 로컬에서만)
$P down -v    # 끝나면 볼륨까지 지운다
```
