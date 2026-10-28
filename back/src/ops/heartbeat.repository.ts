import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { type HeartbeatDetail, runtimeHeartbeat } from '../db/schema/m39-runtime-heartbeat.js';

export interface HeartbeatBeat {
  instanceId: string;
  startedAt: string;
  lastSeenAt: string;
  lastCycleMs: number;
  lastCycleErrors: number;
  queueConsumer: boolean;
  detail: HeartbeatDetail;
}

/**
 * Worker heartbeat(T-133 · M39). Worker 가 주기를 마칠 때마다 한 행을 덮어쓴다 — 운영 화면은 프로세스 메모리가 아니라 이 행으로
 * "Worker 가 실제로 일하고 있나"를 판단한다(API 가 여러 개여도 같은 답).
 */
@Injectable()
export class HeartbeatRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async beat(b: HeartbeatBeat): Promise<void> {
    const values = { instanceId: b.instanceId, startedAt: b.startedAt, lastSeenAt: b.lastSeenAt, lastCycleMs: b.lastCycleMs, lastCycleErrors: b.lastCycleErrors, queueConsumer: b.queueConsumer, cycleDetail: b.detail };
    await this.db
      .insert(runtimeHeartbeat)
      .values({ component: 'WORKER', ...values })
      .onConflictDoUpdate({ target: runtimeHeartbeat.component, set: values, setWhere: sql`${runtimeHeartbeat.lastSeenAt} <= ${b.lastSeenAt}::timestamptz` });
  }

  async worker(): Promise<(HeartbeatBeat & { component: 'WORKER' }) | null> {
    const [row] = await this.db.select().from(runtimeHeartbeat).where(eq(runtimeHeartbeat.component, 'WORKER')).limit(1);
    if (!row) return null;
    return { component: 'WORKER', instanceId: row.instanceId, startedAt: row.startedAt, lastSeenAt: row.lastSeenAt, lastCycleMs: row.lastCycleMs, lastCycleErrors: row.lastCycleErrors, queueConsumer: row.queueConsumer, detail: row.cycleDetail };
  }
}
