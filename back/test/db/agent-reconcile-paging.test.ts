import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RecoveryContextService } from '../../src/agent-tools/context.service.js';
import { AgentReconciler } from '../../src/agent-tools/reconciler.js';
import { RuntimeStoreRepository } from '../../src/agent-tools/runtime-store.repository.js';
import { createApiApp } from '../../src/app/create-api.js';
import { DraftService } from '../../src/communication/draft.service.js';
import { RecoveryPlanService } from '../../src/planning/recovery-plan.service.js';
import { ContactSelectionRepository } from '../../src/registry/contact-selection.repository.js';
import { RegistryService } from '../../src/registry/registry.service.js';
import { CLOCK } from '../../src/shared/time/clock.js';
import { TruthService } from '../../src/truth/truth.service.js';
import { T0, actor, hashOf } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-108 재조정 — 기다리는 실행을 한 쪽(limit)만 읽으면, 깨울 일이 없는 실행이 그만큼 쌓였을 때 그 뒤의 실행은 폴링으로 다시 보이지 않는다
 * (updated_at 이 바뀌지 않아 같은 쪽만 반복). 재조정은 실행 id 순으로 마지막 쪽까지 이어 읽는다.
 */
let api: INestApplication;
let db: pg.Pool;
const ids = { human: '', agent: '' };

beforeAll(async () => {
  api = await createApiApp(testEnv({}));
  await api.init();
  db = appPool();
  ids.human = await actor(db, 'HUMAN');
  ids.agent = await actor(db, 'AI_AGENT');
});

afterAll(async () => {
  await api.close();
  await db.end();
});

/** 쓸 수 있는 주소가 없는 ODCY 운영사의 시설 */
async function facilityWithoutUsableContact(): Promise<string> {
  const cp = v7();
  const f = v7();
  await db.query("INSERT INTO cera.counterparty (counterparty_id, display_name, source_role) VALUES ($1, $2, 'ODCY')", [cp, `재조정 ODCY ${cp.slice(-8)}`]);
  await db.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'ODCY', $2)", [f, `재조정 시설 ${f.slice(-8)}`]);
  await db.query('UPDATE cera.facility SET operator_counterparty_id = $2 WHERE facility_id = $1', [f, cp]);
  return f;
}

async function simulatedRun(): Promise<string> {
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'reconcile paging', $2, $2)", [scenarioId, T0]);
  await db.query(`INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id) VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`, [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId]);
  await db.query(`INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at) VALUES ($1, $2, 'EXCEPTION_DETECTED', 'PAGING', 'o1', 'FEASIBLE', true, $3)`, [runId, snapshotId, T0]);
  return runId;
}

async function waitingRun(recoveryRunId: string, reason: string, facilityId: string): Promise<string> {
  const id = v7();
  await db.query(`INSERT INTO cera.agent_run (agent_run_id, recovery_run_id, goal, status, created_by_actor_id, agent_actor_id, started_at, is_simulated) VALUES ($1, $2, 'close gaps', 'CREATED', $3, $4, $5, true)`, [id, recoveryRunId, ids.human, ids.agent, T0]);
  await db.query("UPDATE cera.agent_run SET status = 'RUNNING', updated_at = $2 WHERE agent_run_id = $1", [id, T0]);
  await db.query("UPDATE cera.agent_run SET status = 'WAITING_HUMAN', waiting_reason = $2, pending_ref_type = 'FACILITY', pending_ref_id = $3, updated_at = $4 WHERE agent_run_id = $1", [id, reason, facilityId, T0]);
  return id;
}

describe('T-108 reconciler sees every waiting run', () => {
  it('more waiting runs than one page: the reconciler reads page after page, so the newest runs are still woken by polling', async () => {
    const facilityId = await facilityWithoutUsableContact(); // 쓸 수 있는 주소 없음 → 고르기 대기 실행은 다시 판정하러 깨워야 한다
    const recoveryRunId = await simulatedRun();
    const mine = [await waitingRun(recoveryRunId, 'CONTACT_SELECTION_REQUIRED', facilityId), await waitingRun(recoveryRunId, 'CONTACT_SELECTION_REQUIRED', facilityId), await waitingRun(recoveryRunId, 'CONTACT_SELECTION_REQUIRED', facilityId)];
    const resumed: string[] = [];
    const reconciler = new AgentReconciler(
      api.get(RuntimeStoreRepository),
      { resume: async (id: string) => (resumed.push(id), { already: false }) } as never,
      api.get(DraftService),
      api.get(TruthService),
      api.get(RecoveryContextService),
      api.get(RecoveryPlanService),
      api.get(CLOCK),
      { CERA_AGENT_RECONCILE_ENABLED: true } as never,
      { subscribe: () => undefined } as never,
      api.get(RegistryService),
      api.get(ContactSelectionRepository),
    );
    // 한 쪽 = 1건. 예전에는 가장 오래된 1건만 봤다 — 이 시험의 실행 셋은 다른 시험의 기다리는 실행 뒤에 있어 보이지 않았다
    await reconciler.runOnce(1);
    expect(mine.every((id) => resumed.includes(id))).toBe(true);
  });
});
