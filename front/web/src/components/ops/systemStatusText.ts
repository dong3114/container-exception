import type { DeploymentMode } from "@/api/auth";
import type { ComponentLevel, OverallStatus, QueueLine, SystemStatus } from "@/api/systemStatus";

/**
 * 시스템 상태 → 쉬운 말(T-133). 판정은 Backend 가 한 값을 그대로 쓴다 — 여기서는 문구만 고른다.
 * 원칙: 빨간 경고를 늘어놓지 않는다. 대체 경로로 일이 계속되면 그렇게 말한다(Redis 장애 = PostgreSQL 폴링).
 */

export const MODE_LABEL: Record<DeploymentMode, string> = {
  PUBLIC_PORTFOLIO_DEMO: "PUBLIC PORTFOLIO DEMO",
  PRIVATE_STAGING: "PRIVATE STAGING",
  PRODUCTION: "PRODUCTION",
  LOCAL: "LOCAL",
};

export const MODE_HINT: Record<DeploymentMode, string> = {
  PUBLIC_PORTFOLIO_DEMO: "공개 체험 — 합성 데이터 · Mock 메일 · AI 녹화 재생",
  PRIVATE_STAGING: "비공개 검증 환경 — 실제 운영 입력 · 실제 메일 · 실제 AI 가 켜져 있을 수 있음",
  PRODUCTION: "운영",
  LOCAL: "개발 PC",
};

export const OVERALL_LABEL: Record<OverallStatus, string> = {
  HEALTHY: "정상",
  DEGRADED: "일부 지연 · 대체 경로로 운영 중",
  ACTION_REQUIRED: "사람 조치 필요",
  DOWN: "중단 — 업무를 기록할 수 없음",
};

export const REASON_LABEL: Record<string, string> = {
  DATABASE_DOWN: "PostgreSQL 에 연결할 수 없습니다",
  DATABASE_SLOW: "PostgreSQL 응답이 느립니다",
  WORKER_DOWN: "Worker 가 멈췄습니다 — 발송 · 수신 · 추출이 진행되지 않습니다. Worker 를 다시 시작하세요",
  WORKER_DELAYED: "Worker 확인이 늦거나 일부 단계가 실패했습니다",
  GMAIL_AUTH_FAILED: "Gmail 인증이 거부되었습니다 — 다시 동의(인증)해야 합니다",
  GMAIL_DELAYED: "Gmail 수신 확인이 실패했습니다 — 다음 주기에 다시 시도합니다",
  QUEUE_FALLBACK_POLLING: "Redis 대신 PostgreSQL 폴링으로 운영 중입니다 — 업무 데이터 손실 없음, 응답이 느릴 수 있음",
  AI_UNAVAILABLE: "AI Server 가 응답하지 않습니다 — 답장은 사람이 검토 · 직접 입력할 수 있습니다",
  AGENT_RUNTIME_UNAVAILABLE: "Agent Runtime 이 응답하지 않습니다 — 업무 기록은 그대로입니다",
  LLM_FAILING: "최근 AI 추출이 실패했습니다 — 자동 재시도 · 사람 검토로 이어집니다",
  PUBLIC_DATA_FAILING: "최근 공공데이터 조회가 실패했습니다",
  QUEUE_STALLED: "오래 기다리는 작업이 있습니다",
};

export const LEVEL_LABEL: Record<ComponentLevel, string> = { HEALTHY: "정상", DEGRADED: "지연", DOWN: "장애", DISABLED: "사용 안 함" };
export const LEVEL_CLASS: Record<ComponentLevel, string> = { HEALTHY: "b-green", DEGRADED: "b-amber", DOWN: "b-red", DISABLED: "b-outline" };
export const OVERALL_CLASS: Record<OverallStatus, string> = { HEALTHY: "b-green", DEGRADED: "b-amber", ACTION_REQUIRED: "b-amber", DOWN: "b-red" };

/** 초 → "5초" · "1분 24초" · "2시간 3분" */
export function age(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분${seconds % 60 ? ` ${seconds % 60}초` : ""}`;
  return `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분`;
}

/** 서울 시각 문자열 → "10-28 14:31" */
export function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]} ${m[3]}:${m[4]}` : iso;
}

export interface Line {
  key: string;
  name: string;
  level: ComponentLevel;
  text: string;
}

export function coreLines(s: SystemStatus): Line[] {
  const { api, database, redis, worker, ai_server, agent_runtime } = s.core;
  return [
    { key: "api", name: "API", level: api.level, text: `정상 · 가동 ${age(api.uptime_seconds)} · v${api.version}${api.commit ? ` (${api.commit.slice(0, 7)})` : ""}` },
    { key: "database", name: "PostgreSQL", level: database.level, text: database.connected ? `연결됨 · 응답 ${database.latency_ms ?? "—"}ms` : "연결 안 됨 — 업무를 기록할 수 없습니다" },
    {
      key: "redis",
      name: "Redis",
      level: redis.level,
      text: redis.state === "up" ? "정상 · 빠른 경로 사용 중" : redis.state === "down" ? "대체 경로 사용 중 — PostgreSQL 폴링으로 운영 중 · 업무 데이터 손실 없음 · 일부 응답이 느려질 수 있음" : "사용 안 함 — PostgreSQL 폴링으로 운영",
    },
    {
      key: "worker",
      name: "Worker",
      level: worker.level,
      text:
        worker.last_seen_seconds_ago === null
          ? "기록 없음 — Worker 가 한 번도 일하지 않았습니다"
          : worker.level === "DOWN"
            ? `멈춤 · 마지막 확인 ${age(worker.last_seen_seconds_ago)} 전`
            : `${worker.level === "HEALTHY" ? "정상" : "지연"} · 마지막 확인 ${age(worker.last_seen_seconds_ago)} 전${worker.failed_steps.length ? ` · 실패 단계 ${worker.failed_steps.join(", ")}` : ""}`,
    },
    {
      key: "ai_server",
      name: "AI Server",
      level: ai_server.level,
      text: ai_server.reachable ? `연결됨 · ${ai_server.provider_mode === "REPLAY" ? "녹화 재생(Replay)" : ai_server.provider_mode === "COMMERCIAL" ? "상용 공급자" : "공급자 미상"}` : "응답 없음 — 답장은 사람 검토 · 직접 입력으로 처리",
    },
    { key: "agent_runtime", name: "Agent Runtime", level: agent_runtime.level, text: agent_runtime.level === "DISABLED" ? "꺼짐(이 배포에서 쓰지 않음)" : agent_runtime.reachable && agent_runtime.level === "HEALTHY" ? "준비됨" : "응답 없음 — 업무 기록은 그대로" },
  ];
}

export function integrationLines(s: SystemStatus): Line[] {
  const { llm, gmail, public_data } = s.integrations;
  const llmName = llm.mode === "REPLAY" ? "녹화 재생(Replay)" : [llm.provider, llm.model].filter(Boolean).join(" · ") || "공급자 미상";
  const llmText =
    llm.level === "DOWN"
      ? `${llmName} · AI Server 응답 없음`
      : `${llmName} · ${llm.level === "HEALTHY" ? "정상" : `최근 실패${llm.last_failure_code ? `(${llm.last_failure_code})` : ""} ${clock(llm.last_failure_at)}`} · 최근 성공 ${clock(llm.last_success_at)}`;
  const gmailText =
    gmail.level === "DISABLED"
      ? "꺼짐 — 실제 메일을 보내지 않음"
      : `${gmail.connection === "CONNECTED" ? "연결됨" : gmail.connection === "AUTH_FAILED" ? `인증 실패${gmail.last_error_code ? `(${gmail.last_error_code})` : ""} — 다시 인증 필요` : gmail.connection === "CHECK_FAILED" ? `수신 확인 실패${gmail.last_error_code ? `(${gmail.last_error_code})` : ""}` : "아직 확인 전"} · 최근 발송 ${clock(gmail.last_send_at)} · 최근 수신 ${clock(gmail.last_receive_at)}`;
  const pdText = public_data.level === "DISABLED" ? "꺼짐" : `${public_data.mode ?? ""} · 최근 조회 ${clock(public_data.last_request_at)}${public_data.last_outcome ? `(${public_data.last_outcome})` : ""} · 최근 성공 ${clock(public_data.last_success_at)}${corroText(public_data.corroboration)}`;
  return [
    { key: "llm", name: "LLM", level: llm.level, text: llmText },
    { key: "gmail", name: "Gmail", level: gmail.level, text: gmailText },
    { key: "public_data", name: "공공데이터", level: public_data.level, text: pdText },
  ];
}

export function queueLines(s: SystemStatus): { key: string; name: string; line: QueueLine }[] {
  return [
    { key: "send", name: "발송 대기", line: s.queues.send },
    { key: "extraction", name: "회신 추출 대기", line: s.queues.extraction },
    { key: "extraction_retry", name: "추출 재시도 대기", line: s.queues.extraction_retry },
    { key: "agent_retry", name: "Agent 재시도 대기", line: s.queues.agent_retry },
  ];
}

export function queueText(q: QueueLine): string {
  if (q.count === 0) return "0건";
  return `${q.count}건 · 가장 오래 ${age(q.oldest_age_seconds)}${q.retrying ? ` · 재시도 중 ${q.retrying}` : ""}`;
}

/** T-136 교차 확인 요약 — 지난 24시간 일치 · 충돌 · 공공 근거 없음 건수(결정론 판정 결과) */
function corroText(c: { last_at: string | null; last_24h: Record<string, number> } | undefined): string {
  if (!c) return "";
  const n = (k: string) => c.last_24h[k] ?? 0;
  return ` · 교차 확인(24시간) 일치 ${n("MATCH")} · 충돌 ${n("CONFLICT")} · 공공 근거 없음 ${n("NO_PUBLIC_EVIDENCE")}`;
}
