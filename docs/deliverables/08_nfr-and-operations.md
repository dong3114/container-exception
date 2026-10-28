# 08. CERA 비기능 요구사항 및 운영 설계서

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 확정(2026-10-28 구현 기준) |
| 기준 | HEAD `5881529` + T-132 · T-133 · 설정 정본 `back/src/config/env.ts` · `ai/cera_ai/config.py` · 운영 정본 [`infra/README.md`](../../infra/README.md)(로컬 · 새 설치 · 백업/복원 · 장애 복구) · [`infra/portfolio/README.md`](../../infra/portfolio/README.md)(공개 배포 runbook) · [`infra/staging/README.md`](../../infra/staging/README.md)(Private Staging runbook) |
| 원칙 | **실측 · 시험으로 확인한 숫자만** 적는다. SLA 는 정하지 않았다[미확정]. 비상 상한 값은 `[ASSUMPTION / DEVELOPMENT SAFETY CEILING]` |
| 관련 문서 | [02 요구사항](02_requirements-analysis.md) 8절(NFR 목록) · [06 아키텍처](06_system-architecture.md) |

## 1. 비기능 영역별 분석

### 1.1 보안 (Security)

| 항목 | 구현 | 검증 |
| --- | --- | --- |
| 역할 권한(RBAC) | 역할 4 · 권한 15 · 전역 Guard · 선언 없는 변경 경로 거부 | `db/auth.test.ts` · `db/portfolio.test.ts` |
| 세션 | 32바이트 난수 토큰 · DB 에는 sha256 지문 · HttpOnly · SameSite=Strict · production Secure 강제 · 역할 · 비밀번호 변경 시 세션 끊김 · 기본 720분 [ASSUMPTION] | `db/auth.test.ts` |
| 비밀번호 | scrypt(N=16384) · 상수 시간 비교 · 없는 계정도 같은 시간 · 실패 사유 하나 | `db/auth.test.ts` |
| 비밀값 | `.env`(gitignore) · 설정 오류에 값 없음 · 화면 번들은 비밀 아닌 환경변수 2개만 | `unit/env-example.test.ts` · `front/web/src/app/portfolio.test.tsx` |
| OAuth | Gmail refresh token 은 `back/.env` 만 · 로그 금지 · 공개 데모는 Gmail 기동 거부 | `unit/config.test.ts` · `unit/portfolio.test.ts` |
| 외부 발송 게이트 | 사람 승인(지문 · 기한) + 사람 발송 요청 + Contact Gate 두 번 + DB 가 HUMAN 승인만 허용 + 발송 차단 스위치 | `db/approvals.test.ts` · `db/send.test.ts` |
| 개발 안전장치 | 비운영 환경 실채널은 수신 허용 목록만(비면 전부 차단) | `unit/contact-gate.test.ts` |
| production 설정 방어 | dev-header · 장애 주입 · 공공데이터 replay · Secure 없는 쿠키 · AI replay 를 production 에서 기동 거부 | `unit/config.test.ts` · `ai/tests/test_config.py` |
| 공개 배포 | 포트폴리오 모드(외부 경로 기동 거부) · 데모 방문자 역할 · 실채널 403 · Origin 검사(CSRF 2차) · CORS 미개방 · API 보안 헤더 · nginx CSP · HSTS · IP 요청 한도 · 하루 Agent 한도 · `/backend/internal/*` 404 · 내부망 | `unit/portfolio.test.ts` · `db/portfolio.test.ts` · 10-28 로컬 HTTPS E2E 45항목 |
| 오류 노출 | `{code, message, request_id}` 만 · 5xx 는 일반 문구 | `http/error.filter.ts` · `db/portfolio.test.ts` |

### 1.2 가용성 · 복구 (Availability · Recoverability)

| 항목 | 구현 | 검증 |
| --- | --- | --- |
| Redis 장애 | PostgreSQL 폴링이 같은 일 · `/health` 전체 상태 유지 | 실측(10-27): 발송 요청 → SENT Redis 있음 153~160 ms · 멈춤 4.3~4.8 s · 멈춘 동안 Worker 주기 실패 0(`docs/24` 18.19) |
| 프로세스 재시작 | 상태를 메모리에 두지 않음 · advisory lock 자동 해제 · Agent 재조정 · 발송 화해 | `db/processes.test.ts` · 10-27 실측(대기 중 api · worker · ai · redis 재시작 → 같은 결과) |
| Agent 내구성 | 체크포인트 = Backend DB · Runtime 장애는 `WAITING_RUNTIME` 재시도 3회 | `db/agent-runtime.test.ts` |
| 외부 공급자 장애 | 메일 재시도 5회 · 결과 모름 화해 · LLM 자동 재시도 3회 → 사람 검토 | `db/send.test.ts` · `db/extraction.test.ts` · 10-28 Gemini 503 → 재시도 성공 |
| 새 설치 | 빈 볼륨에서 compose 두 명령 | 실측: 58 s(10-27, 이미지 빌드 포함 · M32) · 23 s(이미지 빌드 제외 · M33) · 19 s(10-28 · M35) |
| 백업 · 복원 | pg_dump + ContentStore 폴더 · Redis 는 백업 안 함 | 실측(10-27): dump 0.5 s · 376 KB · 복원 0.9 s · 행 수 · 권한 · 트리거 동일 |

### 1.3 감사 가능성 (Auditability)

- 모든 사람 행동에 actor · 감사 행 · `request_id`. 감사 액션 목록은 `back/src/persistence/catalog.ts`(로그인 · 승인 · 발송 · 수신 보류 사유 · 추출 결과 · 사실 판단 · 계획 · 등록부 · 사용자 관리)
- 사건 · 승인 · 상태 전이 · 계획 항목 · 후속 · 선택은 append-only(27표 UPDATE/DELETE 거부 · 38표 TRUNCATE 거부)
- 감사 기록이 실패하면 업무 트랜잭션도 실패(같은 트랜잭션). 시스템 오류 기록은 별도 트랜잭션이라 기록 실패가 원래 처리를 깨지 않음

### 1.4 성능 (Performance)

| 항목 | 실측 | 근거 |
| --- | --- | --- |
| Solver(30대 시나리오) | 0.3~0.6 s | ADR-038 |
| Solver · 비용(실제 실행 소규모) | Solver 39 ms · 비용 2 ms | `docs/tasks/LOG.md` 2026-10-27(T-123) |
| 발송 요청 → SENT(Mock, Redis 있음) | 153~160 ms | `docs/24` 18.19 |
| 회신 → 추출(폴링) | 5.9 s | `infra/README.md` 장애 복구 실측 |
| 상용 LLM 추출 1건(Gemini, 첫 시도 503 → 재시도) | 약 25 s | QUEUE T-099(2026-10-28) |
| 공개 포트폴리오 스택 대기 메모리 | 약 0.42 GB(7 컨테이너 합) | 2026-10-28 `docker stats` |

비상 상한 [ASSUMPTION / DEVELOPMENT SAFETY CEILING]: Solver 30 s · Backend → AI 330 s · 상용 LLM 120 s · 로컬 LLM 300 s · Agent 구동 900 s · Gmail 30 s · 공공데이터 30 s · DB 문장 30 s.

### 1.5 관측 (Observability)

| 수단 | 내용 |
| --- | --- |
| 요청 추적 | `X-Request-Id` · trace id(Agent 실행 · Tool 호출 · 단계에 기록) |
| 로그 | NestJS ConsoleLogger — local 외 JSON 한 줄 · 비밀값 없음 |
| 상태 | `/health/live` · `/health`(db · queue) · AI `/health`(공급자 · agent_runtime) · `GET /agent-runs/runtime` |
| 운영 시스템 상태(T-133) | `GET /ops/system-status`(ADMIN · OPERATOR) + 운영 콘솔 "시스템 상태" — 전체 상태 + 이유 · 구성 요소 9 · 대기 작업 4(PostgreSQL 기준). 판정 규칙 `back/src/ops/system-status.policy.ts`(결정론) |
| Worker heartbeat(T-133) | `runtime_heartbeat` — 주기마다 덮어씀. 30초 이하 정상 · 90초 이하 지연 · 그 이상 멈춤 [ASSUMPTION]. 대기 작업이 15분 넘게 기다리면 DEGRADED [ASSUMPTION] · DB 응답 1초 넘으면 DEGRADED [ASSUMPTION] |
| 실행 통계 | `npm run runtime:stats` — 그래프 · 노드 · Tool · 공공데이터 지연(p50~p99 · max) · 재시도 분포 |
| 오류 행 | `system_error`(경계 · 분류 · 코드 · 재시도 가능 · request/trace id) |
| 없음 | Prometheus · Grafana · OpenTelemetry 지표 스택 · 상태 이력(시계열) · 알림 [향후] — 지금은 현재 상태만 |

### 1.6 유지보수성 (Maintainability)

- 계약 생성본 + 시험: OpenAPI(`npm run openapi:emit` · 화면 타입 `npm run openapi:types`) · Agent Tool 계약 · AI 계약 · 검증기 conformance(TypeScript ↔ Python 같은 판정)
- 설정 키: `.env.example` ↔ 스키마 시험(Backend · AI) · `npm run env:check`
- migration: drizzle-kit 생성 → 사람 검토 → 기록 · 이력 해시 고정 · `push` 금지
- 결정론 엔진은 순수 모듈(DB · 네트워크 · LLM · 현재 시각 import 없음)

### 1.7 배포 (Deployment)

| 구성 | 내용 |
| --- | --- |
| 로컬 | `infra/local/compose.yaml` profile `app` · `web` · `llm` · `eval`(포트 루프백) · 시연 겹침 `compose.demo.yaml` |
| 공개 포트폴리오 | `infra/portfolio/`: Caddy(80 · 443 만 공개) → nginx → API · Worker · AI · PostgreSQL · Redis(내부망) · `restart: unless-stopped` · 메모리 상한 · migration 한 번 · 포트폴리오 시드 · `reset-demo.sh` |
| Private Staging | `infra/staging/`(T-132): 프로젝트 `cera-staging` · 웹 `127.0.0.1:${CERA_STAGING_WEB_PORT:-3400}` · 선택 Caddy(profile `edge`, HTTPS + Basic Auth) · 실제 Gmail · 상용 LLM · 공공데이터 live · 예외 탐지 켬 · 포트폴리오 모드 끔 · 데이터 유지(초기화 스크립트 없음) · 첫 준비 `bootstrap` profile(`npm run db:bootstrap`) |

### 1.8 데이터 무결성 (Data Integrity)

- DB CHECK 300 · FK 116(시뮬레이션 플래그 포함 복합 FK) · 업무 불변식 트리거(승인 결정은 HUMAN 만 · 발송 결과 한 번 · 상태 전이 규칙 · 확정 사실 근거 · 사건 권위 · 링크 검사 · 예외는 RESOLVED 가 끝 · 진행 중 예외는 정체마다 하나)
- 금액 원 정수 · 시각 `timestamptz` · 기준시각 `as_of` 주입
- 실제 DB ↔ 물리 명세 대조 시험(`db/schema-catalog.test.ts`)

## 2. 최신 시험 결과 (2026-10-28)

| 범위 | 결과 |
| --- | --- |
| Backend(`npm test` — unit + DB) | 63 파일 · 605 통과 |
| Python(`python -m pytest -q`) | 99 통과(이 PC 는 pytest 기본 임시 폴더 권한 때문에 `--basetemp` 지정 필요 — 환경 문제) |
| Front(`npm test`) | 17 파일 · 116 통과 · typecheck · lint 오류 0 · build(소스맵 0) |
| 브라우저 E2E | 운영 콘솔 전 구간 · `/demo` 12단계 · LIVE · 공개 포트폴리오(로컬 HTTPS) 45항목 — 페이지 오류 0 · 5xx 0 |
| 운영 Dashboard E2E(T-133) | 로컬 Private Staging 브라우저 46/46 — 관리자 로그인 · 모드 배지 · 시스템 정상(9 구성 요소, Gemini · Gmail · 공공데이터 live) · 화면에서 운영 기준 계획 CSV 검증 → 저장 · 수용량 10 → 4 → 자동 예외(10/4/6) · 복구 실행 · 할 일 [Agent 시작] → WAITING_HUMAN · Redis 중단 → DEGRADED(PostgreSQL 폴링) · 업무 계속(3 정정 → 영향 7) · 복구 → HEALTHY · AI 중단 → DEGRADED(사실 손실 없음) · Worker 중단 → 30초 지연 → DOWN · ACTION_REQUIRED → 복구 → HEALTHY · 실제 Gmail 발송 0 · 페이지 오류 0 / 공개 포트폴리오 회귀 30/30 + 보안 18/18(방문자 시스템 상태 403 · 화면에 없음) |
| 예외 자동 탐지 E2E(T-132) | 공개 포트폴리오(새 볼륨) 24/24 — 자동 예외(예정 20 · 가능 8 · 부족 12) · 자동 실행에서 `/demo` 3~12단계 · 배지 · 개요 숫자 · 페이지 오류 0 · 5xx 0 / 로컬 Private Staging 27/27 — 시나리오 팩 없이 운영 기준 계획 + 수용량 정정 → 자동 예외 · 실행, Worker · Redis · API 재시작 뒤 예외 1 · 실행 1, 해소 · 재발 · 수요 감소 해소, 실제 Gmail 발송 0(발송 일시정지) |

## 3. 운영 절차 요약

| 작업 | 로컬(`infra/local`) | 공개 포트폴리오(`infra/portfolio`) |
| --- | --- | --- |
| 배포 · 기동 | `docker compose ... --profile app --profile web up -d --build --wait` | `$P up -d --build --wait` |
| migration | `migrate` 컨테이너(자동) · 개발은 `npm run db:migrate` | `migrate` 컨테이너(자동) |
| 시드 | `... run --rm migrate npm run db:seed`(local · test) | `$P run --rm seed`(포트폴리오 모드만) |
| 재시작 | `docker compose ... restart api worker` | `$P restart api worker` |
| 로그 | `docker compose ... logs -f api` | `$P logs -f api` |
| 상태 | `/health` · AI `/health` | `https://<도메인>/backend/health` |
| 백업 · 복원 | `infra/README.md` 운영 준비 절 | `infra/portfolio/README.md` 5절 |
| 초기화 | `down -v` → `up` → `db:seed` | `reset-demo.sh` · `--if-idle 20`(cron) |
| OAuth 갱신 | `cd back && npm run gmail:auth`(Testing 모드 약 7일) | 해당 없음(Gmail 꺼짐) |
| 키 교체 | `.env` 수정 → 해당 컨테이너 재기동 | `infra/portfolio/README.md` 6절 |

Private Staging(`infra/staging`)은 기동 · 첫 준비(`--profile bootstrap run --rm bootstrap`) · 시설 · 거래처 등록 · 운영 기준 계획 입력 · 백업 · 키 교체를 [`infra/staging/README.md`](../../infra/staging/README.md) 에 따로 적었다. 공개 데모와 볼륨 · 비밀값을 공유하지 않는다.

## 4. 운영 위험 · 한계

| 항목 | 내용 |
| --- | --- |
| 요청 한도 · 로그인 실패 수 | 프로세스 메모리 — API 여러 개면 따로 셈 [향후] |
| ContentStore | 로컬 파일 어댑터만 — 여러 호스트 배포 시 공유 저장소 필요 [향후] |
| 원문 보존 기간 | 파기 기능은 있으나(`ContentService.purgeRecorded`) 자동 보존 정책 · 호출 경로 없음 [미확정] |
| 체크포인트 보관 | 보관 주기 없음(T-108 잔여) [향후] |
| Gmail 토큰 | Testing 모드 약 7일 만료 [외부 의존] |
| 공개 데모 | 공유 상태(방문자별 격리 없음) · 초기화로 되돌림 — ADR-039 Proposed |
| 운영 상태 판정 | 현재 상태만(이력 없음) · 임계값은 [ASSUMPTION] · Gmail 토큰 만료 시각은 알 수 없어 표시하지 않음(연결 확인 실패 · 인증 거부만) · AI 공급자 상태는 최근 추출 기록 기준(추출이 없으면 "최근 성공 —") |
| 예외 탐지 범위 | 창고 수용량 부족 한 유형 · 수용량은 확정 사실만 단정(임시 · 오래됨은 실행을 만들지 않음) · 탐지 주기 30초 [ASSUMPTION] · Agent 는 자동 시작하지 않음 — ADR-040 |
