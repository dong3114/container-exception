import { sql } from 'drizzle-orm';
import { boolean, check, integer, jsonb, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { cera, ckIn, n, tstz } from './_common.js';
import { RUNTIME_COMPONENT } from './codes.js';

/** 마지막 주기 결과. 실패 코드는 `^[A-Z][A-Z0-9_]*$` 만 담는다 */
export interface HeartbeatDetail {
  failed_steps: string[];
  inbound: Record<string, { ok: boolean; code?: string }>;
}

/**
 * M39 실행 프로세스 heartbeat(T-133). Worker 가 주기를 한 번 돌 때마다 "언제 마지막으로 일했나"를 남긴다 — 운영 화면이
 * 프로세스 메모리가 아니라 DB 로 Worker 가 실제로 일하는지 판단한다(API 가 여러 개여도 같은 답).
 *
 * - 종류마다 한 행(갱신). Worker 가 여럿이면 마지막으로 일한 쪽이 덮어쓴다 — "누군가 일하고 있다"가 알고 싶은 것이다
 * - 업무 사실이 아니라 실행 상태다. 지우지 않는다(M40 가드)
 */
export const runtimeHeartbeat = cera.table(
  'runtime_heartbeat',
  {
    component: text('component').notNull(),
    instanceId: uuid('instance_id').notNull(),
    startedAt: tstz('started_at').notNull(),
    lastSeenAt: tstz('last_seen_at').notNull(),
    lastCycleMs: integer('last_cycle_ms').notNull(),
    lastCycleErrors: integer('last_cycle_errors').notNull(),
    queueConsumer: boolean('queue_consumer').notNull(),
    /** 마지막 주기의 단계별 결과(코드만 — 문장 · 비밀 없음): 실패한 단계 · 채널별 수신 확인 결과 */
    cycleDetail: jsonb('cycle_detail').$type<HeartbeatDetail>().notNull(),
  },
  (t) => [
    primaryKey({ name: n('pk_runtime_heartbeat'), columns: [t.component] }),
    ckIn('runtime_heartbeat', t.component, RUNTIME_COMPONENT),
    check(n('ck_runtime_heartbeat__numbers'), sql`${t.lastCycleMs} >= 0 AND ${t.lastCycleErrors} >= 0`),
    check(n('ck_runtime_heartbeat__time_order'), sql`${t.lastSeenAt} >= ${t.startedAt}`),
  ],
);
