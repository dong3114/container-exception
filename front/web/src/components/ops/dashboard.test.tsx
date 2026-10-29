import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OperationalException } from "@/api/exceptions";
import type { SystemStatus } from "@/api/systemStatus";
import { ActionRequired } from "./ActionRequired";
import { ExceptionBoard } from "./ExceptionBoard";
import type { Me } from "@/api/auth";
import { MeContext } from "@/app/MeContext";
import { ModeBadge } from "./ModeBadge";
import { OperationalInput } from "./OperationalInput";
import { SystemHealth } from "./SystemHealth";
import { age, coreLines, integrationLines, queueText } from "./systemStatusText";

/** T-133 운영 Dashboard — 시스템 상태 카드 · 대체 경로 문구 · 자동 탐지 예외 · Agent 시작 할 일 · 배포 모드 */
const RUN = "0190aaaa-0000-7000-8000-00000000c0de";

interface Over {
  redis?: "up" | "down" | "disabled";
  worker?: number | null;
  ai?: boolean;
  overall?: SystemStatus["overall"];
  gmail?: SystemStatus["integrations"]["gmail"];
}

function status(over: Over = {}): SystemStatus {
  const redis = over.redis ?? "up";
  const workerAge = over.worker === undefined ? 5 : over.worker;
  const ai = over.ai ?? true;
  return {
    checked_at: "2026-10-28T14:31:00.000+09:00",
    mode: "PRIVATE_STAGING",
    overall: over.overall ?? { status: "HEALTHY", reasons: [] },
    core: {
      api: { level: "HEALTHY", version: "0.1.0", commit: "abc1234", uptime_seconds: 3725 },
      database: { level: "HEALTHY", connected: true, latency_ms: 3 },
      redis: { level: redis === "up" ? "HEALTHY" : redis === "down" ? "DEGRADED" : "DISABLED", state: redis, fallback: redis === "up" ? null : "POSTGRES_POLLING" },
      worker: { level: workerAge === null || workerAge > 90 ? "DOWN" : workerAge > 30 ? "DEGRADED" : "HEALTHY", last_seen_at: null, last_seen_seconds_ago: workerAge, last_cycle_ms: 120, failed_steps: [], queue_consumer: redis === "up" },
      ai_server: { level: ai ? "HEALTHY" : "DOWN", reachable: ai, provider_mode: ai ? "COMMERCIAL" : null },
      agent_runtime: { level: ai ? "HEALTHY" : "DOWN", reachable: ai, tools_enabled: true },
    },
    integrations: {
      llm: ai
        ? { level: "HEALTHY", mode: "COMMERCIAL", provider: "gemini", model: "gemini-3.8-flash", last_success_at: "2026-10-28T14:31:00.000+09:00", last_failure_at: null, last_failure_code: null }
        : { level: "DOWN", provider: null },
      gmail: over.gmail ?? { level: "HEALTHY", enabled: true, connection: "CONNECTED", connection_checked_at: null, last_error_code: null, last_send_at: "2026-10-27T10:00:00.000+09:00", last_send_failure_at: null, last_receive_at: null },
      public_data: { level: "HEALTHY", mode: "LIVE", last_request_at: null, last_outcome: null, last_success_at: null },
    },
    queues: { send: { count: 2, oldest_age_seconds: 84, retrying: 0 }, extraction: { count: 0, oldest_age_seconds: null }, extraction_retry: { count: 0, oldest_age_seconds: null }, agent_retry: { count: 0, oldest_age_seconds: null } },
  };
}

describe("system health cards", () => {
  it("shows the overall status, every core component and integration, and waiting work with the oldest age", () => {
    const html = renderToStaticMarkup(<SystemHealth status={status()} error={null} />);
    for (const k of ["api", "database", "redis", "worker", "ai_server", "agent_runtime", "llm", "gmail", "public_data"]) expect(html).toContain(`data-testid="health-${k}"`);
    expect(html).toContain('data-status="HEALTHY"');
    expect(html).toContain("빠른 경로 사용 중");
    expect(html).toContain("gemini · gemini-3.8-flash");
    expect(queueText(status().queues.send)).toBe("2건 · 가장 오래 1분 24초");
    expect(age(5)).toBe("5초");
    // 키 · 토큰 · 주소는 화면 모델에 없다
    expect(html).not.toMatch(/token|password|api[_ ]?key|https?:\/\//i);
  });

  it("Redis down reads as a fallback (PostgreSQL polling, no data loss), not as an outage", () => {
    const s = status({ redis: "down", overall: { status: "DEGRADED", reasons: ["QUEUE_FALLBACK_POLLING"] } });
    const redis = coreLines(s).find((l) => l.key === "redis")!;
    expect(redis.level).toBe("DEGRADED");
    expect(redis.text).toContain("PostgreSQL 폴링으로 운영 중");
    expect(redis.text).toContain("업무 데이터 손실 없음");
    const html = renderToStaticMarkup(<SystemHealth status={s} error={null} />);
    expect(html).toContain("일부 지연 · 대체 경로로 운영 중");
    expect(html).not.toContain("중단 — 업무를 기록할 수 없음");
  });

  it("a stopped worker is named with when it was last seen; AI down keeps the manual path", () => {
    const stopped = coreLines(status({ worker: 125 })).find((l) => l.key === "worker")!;
    expect(stopped.level).toBe("DOWN");
    expect(stopped.text).toBe("멈춤 · 마지막 확인 2분 5초 전");
    expect(coreLines(status({ worker: 45 })).find((l) => l.key === "worker")!.text).toContain("지연 · 마지막 확인 45초 전");
    expect(coreLines(status({ ai: false })).find((l) => l.key === "ai_server")!.text).toContain("사람 검토 · 직접 입력");
  });

  it("Gmail auth failure says re-authentication is needed — and never invents a token expiry countdown", () => {
    const failed = status({ gmail: { level: "DOWN", enabled: true, connection: "AUTH_FAILED", connection_checked_at: null, last_error_code: "GMAIL_TOKEN_REVOKED", last_send_at: null, last_send_failure_at: null, last_receive_at: null } });
    const gmail = integrationLines(failed).find((l) => l.key === "gmail")!;
    expect(gmail.text).toContain("다시 인증 필요");
    expect(gmail.text).not.toMatch(/남음|만료까지|days left/);
  });
});

describe("exception board and action", () => {
  const ex: OperationalException = {
    exception_id: "0190aaaa-0000-7000-8000-0000000e0001",
    exception_type: "WAREHOUSE_CAPACITY_SHORTAGE",
    scope: "LIVE",
    is_simulated: false,
    facility_id: "f",
    facility_name: "창고 A",
    window_day: "2026-10-28",
    status: "ACTIVE",
    basis: "CONFIRMED",
    scheduled_demand: 20,
    capacity: 8,
    shortage: 12,
    recovery_run_id: RUN,
    detected_at: "2026-10-28T09:12:00.000+09:00",
    updated_at: "2026-10-28T09:12:00.000+09:00",
    resolved_at: null,
  };

  it("shows the auto-detected warehouse shortage with planned / possible / affected, status and its recovery run", () => {
    const resolved: OperationalException = { ...ex, exception_id: "x2", status: "RESOLVED", resolved_at: "2026-10-28T11:00:00.000+09:00" };
    const html = renderToStaticMarkup(<ExceptionBoard exceptions={[ex, resolved]} runSource={() => "AUTO_DETECTED"} onOpenRun={() => undefined} />);
    expect(html).toContain("자동 탐지");
    // 코드값이 아니라 업무 말이 제목이다(코드는 기술 상세에만)
    expect(html).toContain("창고 A · 창고 수용량 부족");
    expect(html).toMatch(/예정 반입<\/span><b[^>]*>20대<\/b>/);
    expect(html).toMatch(/현재 가능<\/span><b[^>]*>8대<\/b>/);
    expect(html).toMatch(/영향<\/span><b[^>]*>12대<\/b>/);
    expect(html).toContain("● 진행 중");
    expect(html).toContain("복구 실행 #00c0de 열기");
    expect(html).toContain("출처 자동 탐지");
    expect(html).toContain("해소된 예외 1건(기록 보존)");
    expect(html.indexOf("WAREHOUSE_CAPACITY_SHORTAGE")).toBeGreaterThan(html.indexOf("기술 상세"));
  });

  it("compact board (overview) shows only active exceptions, a link to the full list and a plain empty state", () => {
    const resolved: OperationalException = { ...ex, exception_id: "x2", status: "RESOLVED", resolved_at: "2026-10-28T11:00:00.000+09:00" };
    const html = renderToStaticMarkup(<ExceptionBoard compact exceptions={[ex, resolved]} runSource={() => null} onOpenRun={() => undefined} onShowAll={() => undefined} />);
    expect(html).toContain("exception-show-all");
    expect(html).not.toContain("해소된 예외");
    const empty = renderToStaticMarkup(<ExceptionBoard exceptions={[]} runSource={() => null} onOpenRun={() => undefined} />);
    expect(empty).toContain("현재 처리 중인 예외가 없습니다.");
  });

  it("the start-agent action reads as a plain request with an [Agent 시작] button", () => {
    const action = { key: `auto:${RUN}`, runId: RUN, icon: "⚡", title: "복구 조사를 시작해 주세요", detail: "[자동 탐지] 창고 A 수용량 부족", target: null, tab: "agent" as const, ref: null, cta: "Agent 시작" };
    const html = renderToStaticMarkup(<ActionRequired actions={[action]} runLabel={() => "실행"} onOpen={() => undefined} />);
    expect(html).toContain("복구 조사를 시작해 주세요");
    expect(html).toContain("Agent 시작");
  });
});

describe("mode badge", () => {
  it("names the deployment so staging and the public demo are never confused", () => {
    expect(renderToStaticMarkup(<ModeBadge mode="PRIVATE_STAGING" />)).toContain("PRIVATE STAGING");
    expect(renderToStaticMarkup(<ModeBadge mode="PUBLIC_PORTFOLIO_DEMO" />)).toContain("PUBLIC PORTFOLIO DEMO");
    expect(renderToStaticMarkup(<ModeBadge mode="LOCAL" />)).toContain("LOCAL");
    expect(renderToStaticMarkup(<ModeBadge mode={undefined} />)).toBe("");
  });
});

describe("operational baseline input", () => {
  it("without a run the container input is the operational baseline (status column) and needs planning.input", () => {
    const op: Me = { user_id: "u", actor_id: "a", login_id: "op", display_name: "운영자", role: "OPERATOR", permissions: ["read", "planning.input"], via: "SESSION", deployment_mode: "PRIVATE_STAGING" };
    const html = renderToStaticMarkup(
      <MeContext.Provider value={op}>
        <OperationalInput runId={null} />
      </MeContext.Provider>,
    );
    expect(html).toContain("컨테이너(운영 기준 계획)");
    expect(html).toContain("planned_depart_hour,status");
    expect(html).not.toContain("컨테이너(이 실행)");
  });
});
