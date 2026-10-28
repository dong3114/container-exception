#!/usr/bin/env bash
# CERA 공개 포트폴리오 데모 초기화(T-131 · ADR-039) — 체험 환경을 시드 직후 상태로 되돌린다.
#
#   infra/portfolio/reset-demo.sh                 # 지금 바로 초기화(약 30~60초 화면이 "Backend 응답 없음")
#   infra/portfolio/reset-demo.sh --if-idle 20    # 누군가 들어온 적이 있고(세션 있음) 마지막 조작이 20분보다 오래됐을 때만
#
# 서버 cron 예(10분마다 확인 · 한가할 때만 초기화 + 매일 04:00 강제):
#   */10 * * * * cd /opt/cera && infra/portfolio/reset-demo.sh --if-idle 20 >> /var/log/cera-reset.log 2>&1
#   0 4 * * *    cd /opt/cera && infra/portfolio/reset-demo.sh >> /var/log/cera-reset.log 2>&1
#
# 무엇을 지우나: 포트폴리오 DB 볼륨(pgdata) + 내용 볼륨(content: Mock 메일 · 원문 · Agent 체크포인트) — 합성 데이터뿐이다.
# 업무 기록 append-only 정책과 다른 일이다: 이 스크립트는 **이 포트폴리오 compose 프로젝트만** 다룬다(이름 cera-portfolio,
# compose 파일이 CERA_PORTFOLIO_DEMO_MODE=true 를 고정한다). 개인 운영(Private Operation) 배포 · 로컬 개발 DB 는 건드리지 않는다.
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=infra/portfolio/.env
COMPOSE_FILE=infra/portfolio/compose.yaml
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }
grep -q 'CERA_PORTFOLIO_DEMO_MODE: "true"' "$COMPOSE_FILE" || { echo "refusing: $COMPOSE_FILE is not the portfolio demo"; exit 1; }
P=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
PROJECT=cera-portfolio
now() { date '+%Y-%m-%d %H:%M:%S'; }

if [ "${1:-}" = "--if-idle" ]; then
  IDLE_MIN="${2:-20}"
  # 세션이 하나도 없으면 시드 직후 그대로다 → 할 일 없음. 있으면 마지막 로그인 · 감사 기록 시각부터 지난 초
  Q="SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM cera.user_session) THEN -1
            ELSE extract(epoch FROM now() - greatest((SELECT max(created_at) FROM cera.user_session), (SELECT max(occurred_at) FROM cera.audit_log)))::int END"
  SECS=$("${P[@]}" exec -T postgres psql -U postgres -d cera -tAc "$Q" 2>/dev/null || echo "error")
  if [ "$SECS" = "error" ] || [ -z "$SECS" ]; then echo "$(now) idle check failed — not resetting"; exit 0; fi
  if [ "$SECS" -lt 0 ]; then echo "$(now) untouched since last reset"; exit 0; fi
  if [ "$SECS" -lt $((IDLE_MIN * 60)) ]; then echo "$(now) in use (last activity ${SECS}s ago)"; exit 0; fi
  echo "$(now) idle for ${SECS}s — resetting"
fi

echo "$(now) reset: removing app containers (web · caddy keep serving the page)"
# 볼륨을 지우려면 그 볼륨을 쓰는 컨테이너(멈춘 것 포함)가 없어야 한다
"${P[@]}" rm -sf api worker ai migrate postgres >/dev/null
docker volume rm "${PROJECT}_pgdata" "${PROJECT}_content" >/dev/null
echo "$(now) reset: starting fresh (migration runs once)"
"${P[@]}" up -d --wait >/dev/null
"${P[@]}" run --rm seed | tail -3
echo "$(now) reset: done"
