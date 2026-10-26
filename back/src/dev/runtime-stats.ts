import pg from 'pg';
import { loadDotEnvIfPresent, parseEnv } from '../config/env.js';

/**
 * **관측 → 상한 조정**(개발 · 운영 보조 도구, 제품 API 아님). 지금 기록된 실행 기록에서 분포(p50 · p90 · p95 · p99 · max)를 계산한다.
 * 새 저장 구조를 만들지 않는다 — `agent_step` · `agent_tool_call` · `agent_run` · `public_data_fetch` · `system_error` 를 읽기만 한다.
 *
 *   npm run runtime:stats            # 표로 출력
 *   npm run runtime:stats -- --json  # JSON
 *
 * 상한(`CERA_AGENT_MAX_STEPS` 등)은 이 분포를 보고 줄인다(예: 정상 실행 500건의 단계 p99 = 22 → 100 을 40 으로). 숫자를 먼저 정하지 않는다.
 * 모델 추론 시간은 DB 에 저장하지 않는다 — AI Server 로그(`local llm call … total_ms`)와 평가 결과(`ai/evals/runs/` 의 각 실행 `metrics.json`)에 있다.
 */
const PCT = `count(*) AS n,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY v) AS p50,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY v) AS p90,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY v) AS p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY v) AS p99,
  max(v) AS max`;

const QUERIES: Record<string, string> = {
  // 그래프 한 번 구동(시작 · 재개 → 다음 interrupt · 끝) — Backend → Python 요청 하나가 붙잡는 시간. 사람 · 외부 대기는 들어가지 않는다
  graph_invocation_ms: `
    WITH s AS (
      SELECT agent_run_id, seq, kind, started_at, finished_at,
             count(*) FILTER (WHERE kind IN ('START', 'RESUME')) OVER (PARTITION BY agent_run_id ORDER BY seq) AS seg
        FROM cera.agent_step),
    g AS (
      SELECT agent_run_id, seg, extract(epoch FROM max(finished_at) - min(started_at)) * 1000 AS v
        FROM s WHERE seg > 0 GROUP BY agent_run_id, seg HAVING bool_or(kind IN ('INTERRUPT', 'TERMINAL')))
    SELECT ${PCT} FROM g`,
  node_ms: `SELECT ${PCT} FROM (SELECT duration_ms AS v FROM cera.agent_step WHERE kind = 'NODE') x`,
  tool_call_ms: `SELECT ${PCT} FROM (SELECT duration_ms AS v FROM cera.agent_tool_call WHERE duration_ms IS NOT NULL) x`,
  public_data_ms: `SELECT ${PCT} FROM (SELECT extract(epoch FROM received_at - requested_at) * 1000 AS v FROM cera.public_data_fetch WHERE received_at IS NOT NULL AND mode = 'LIVE') x`,
  steps_per_run: `SELECT ${PCT} FROM (SELECT count(*) AS v FROM cera.agent_step WHERE kind = 'NODE' GROUP BY agent_run_id) x`,
  tool_calls_per_run: `SELECT ${PCT} FROM (SELECT count(*) AS v FROM cera.agent_tool_call GROUP BY agent_run_id) x`,
  retries_per_run: `SELECT ${PCT} FROM (SELECT sum(retry_count) AS v FROM cera.agent_step GROUP BY agent_run_id) x`,
  runtime_attempts_per_run: `SELECT ${PCT} FROM (SELECT runtime_attempts AS v FROM cera.agent_run) x`,
};

/** 상한 · 시간 초과로 끝난 것 — "상한이 너무 낮은가 / 그래프가 이상하게 도는가"를 가르는 재료(일반 업무 실패와 따로 센다). */
const LIMIT_CODES = `
  SELECT 'agent_run' AS source, last_error_code AS code, count(*) AS n FROM cera.agent_run
   WHERE last_error_code IN ('LOOP_LIMIT_REACHED', 'TOOL_CALL_LIMIT_REACHED', 'RETRY_LIMIT_REACHED', 'AGENT_RUNTIME_TIMEOUT', 'AGENT_RUNTIME_UNAVAILABLE') GROUP BY 2
  UNION ALL
  SELECT 'agent_tool_call', error_code, count(*) FROM cera.agent_tool_call WHERE error_code IN ('TOOL_TIMEOUT', 'UPSTREAM_TIMEOUT') GROUP BY 2
  UNION ALL
  SELECT 'system_error', error_code, count(*) FROM cera.system_error WHERE error_code IN ('EXTRACTION_TIMEOUT', 'AGENT_RUNTIME_TIMEOUT', 'PUBLIC_DATA_TRANSPORT_FAILED')
      OR safe_error_message LIKE '%MODEL_TIMEOUT%' GROUP BY 2
  ORDER BY 1, 2`;

const round = (x: unknown) => (x === null || x === undefined ? null : Math.round(Number(x)));

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const env = parseEnv(process.env);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1, options: '-c TimeZone=UTC' });
  try {
    const out: Record<string, unknown> = {};
    for (const [name, sql] of Object.entries(QUERIES)) {
      const r = (await pool.query(sql)).rows[0] ?? {};
      out[name] = { n: Number(r.n ?? 0), p50: round(r.p50), p90: round(r.p90), p95: round(r.p95), p99: round(r.p99), max: round(r.max) };
    }
    out.limit_and_timeout_counts = (await pool.query(LIMIT_CODES)).rows.map((r) => ({ source: r.source, code: r.code, n: Number(r.n) }));
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    console.table(Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'limit_and_timeout_counts')));
    console.table(out.limit_and_timeout_counts);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
