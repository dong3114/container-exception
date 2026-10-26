import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import { agentCheckpoint, agentCheckpointWrite, agentRun, agentStep } from '../db/schema/index.js';

export interface StepRow {
  stepId: string;
  kind: 'START' | 'NODE' | 'INTERRUPT' | 'RESUME' | 'TERMINAL';
  node: string | null;
  outcome: string;
  detailCode: string | null;
  toolCallId: string | null;
  retryCount: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  traceId: string | null;
}

export interface RunStateUpdate {
  status: 'RUNNING' | 'WAITING_HUMAN' | 'WAITING_EXTERNAL' | 'WAITING_RUNTIME' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentNode?: string | null;
  waitingReason?: string | null;
  pendingRefType?: string | null;
  pendingRefId?: string | null;
  lastErrorCode?: string | null;
  finishedAt?: string | null;
  updatedAt: string;
  /** 생략하면 그대로 둔다 */
  runtimeAttempts?: number;
  nextAttemptAt?: string | null;
  resultSummary?: Record<string, unknown> | null;
}

/**
 * Agent Runtime 실행 상태(M18): 실행 상태 전이 · 단계(관측) · checkpoint · pending write. **업무 사실이 아니다.**
 * 실행 행을 `FOR UPDATE` 로 잡고 단계 순번을 매긴다 — 같은 실행의 기록이 줄을 선다.
 */
@Injectable()
export class RuntimeStoreRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async lockRun(tx: DbTransaction, agentRunId: string) {
    const rows = await tx.select().from(agentRun).where(eq(agentRun.agentRunId, agentRunId)).for('update');
    return rows[0] ?? null;
  }

  /** 지금 상태가 `from` 중 하나일 때만 바꾼다(한 요청만 이긴다 — 중복 시작 · 재개 방지). */
  async transition(tx: DbTransaction, agentRunId: string, from: readonly string[], to: RunStateUpdate): Promise<boolean> {
    const rows = await tx
      .update(agentRun)
      .set({
        status: to.status,
        currentNode: to.currentNode ?? null,
        waitingReason: to.waitingReason ?? null,
        pendingRefType: to.pendingRefType ?? null,
        pendingRefId: to.pendingRefId ?? null,
        lastErrorCode: to.lastErrorCode ?? null,
        finishedAt: to.finishedAt ?? null,
        updatedAt: to.updatedAt,
        nextAttemptAt: to.nextAttemptAt ?? null,
        ...(to.runtimeAttempts === undefined ? {} : { runtimeAttempts: to.runtimeAttempts }),
        ...(to.resultSummary === undefined ? {} : { resultSummary: to.resultSummary }),
      })
      .where(and(eq(agentRun.agentRunId, agentRunId), inArray(agentRun.status, [...from])))
      .returning({ id: agentRun.agentRunId });
    return rows.length > 0;
  }

  async setCurrentNode(tx: DbTransaction, agentRunId: string, node: string, at: string): Promise<void> {
    await tx.update(agentRun).set({ currentNode: node, updatedAt: at }).where(and(eq(agentRun.agentRunId, agentRunId), eq(agentRun.status, 'RUNNING')));
  }

  async insertStep(tx: DbTransaction, agentRunId: string, s: StepRow): Promise<number> {
    const [next] = await tx
      .select({ seq: sql<number>`coalesce(max(${agentStep.seq}), 0)::int + 1` })
      .from(agentStep)
      .where(eq(agentStep.agentRunId, agentRunId));
    const seq = next?.seq ?? 1;
    await tx.insert(agentStep).values({ ...s, agentRunId, seq });
    return seq;
  }

  async steps(agentRunId: string, limit = 200) {
    return this.db.select().from(agentStep).where(eq(agentStep.agentRunId, agentRunId)).orderBy(desc(agentStep.seq)).limit(limit);
  }

  async runsWaitingFor(refType: string, refId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: agentRun.agentRunId })
      .from(agentRun)
      .where(and(inArray(agentRun.status, ['WAITING_HUMAN', 'WAITING_EXTERNAL']), eq(agentRun.pendingRefType, refType), eq(agentRun.pendingRefId, refId)));
    return rows.map((r) => r.id);
  }

  /** 재조정 대상: 업무 기록을 기다리는 실행(오래 기다린 것부터). */
  async waitingOnRecords(limit: number) {
    return this.db
      .select({ agentRunId: agentRun.agentRunId, waitingReason: agentRun.waitingReason, pendingRefType: agentRun.pendingRefType, pendingRefId: agentRun.pendingRefId })
      .from(agentRun)
      .where(and(inArray(agentRun.status, ['WAITING_HUMAN', 'WAITING_EXTERNAL']), isNotNull(agentRun.pendingRefId)))
      .orderBy(asc(agentRun.updatedAt), asc(agentRun.agentRunId))
      .limit(limit);
  }

  async recoveryRunOf(agentRunId: string): Promise<string | null> {
    const rows = await this.db.select({ id: agentRun.recoveryRunId }).from(agentRun).where(eq(agentRun.agentRunId, agentRunId)).limit(1);
    return rows[0]?.id ?? null;
  }

  /** 다시 시도할 시각이 된 WAITING_RUNTIME 실행. */
  async dueRetries(now: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: agentRun.agentRunId })
      .from(agentRun)
      .where(and(eq(agentRun.status, 'WAITING_RUNTIME'), lte(agentRun.nextAttemptAt, now)))
      .orderBy(asc(agentRun.nextAttemptAt), asc(agentRun.agentRunId))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async hasCheckpoint(agentRunId: string): Promise<boolean> {
    const rows = await this.db.select({ id: agentCheckpoint.checkpointRowId }).from(agentCheckpoint).where(eq(agentCheckpoint.agentRunId, agentRunId)).limit(1);
    return rows.length > 0;
  }

  async listRuns(limit: number) {
    return this.db.select().from(agentRun).orderBy(desc(agentRun.startedAt), desc(agentRun.agentRunId)).limit(limit);
  }

  // ── checkpoint ──

  async insertCheckpoint(
    tx: DbTransaction,
    c: { checkpointRowId: string; agentRunId: string; checkpointNs: string; checkpointId: string; parentCheckpointId: string | null; contentRef: string; contentHash: string; metaSource: string | null; metaStep: number | null; createdAt: string },
  ): Promise<boolean> {
    const rows = await tx.insert(agentCheckpoint).values(c).onConflictDoNothing().returning({ id: agentCheckpoint.checkpointRowId });
    return rows.length > 0;
  }

  /** LangGraph 와 같은 규칙: 보통 쓰기(idx ≥ 0)는 처음 것이 남고, 특수 쓰기(idx < 0 — 오류 · interrupt · resume)는 덮어쓴다. */
  async upsertWrite(
    tx: DbTransaction,
    w: { agentRunId: string; checkpointNs: string; checkpointId: string; taskId: string; writeIdx: number; taskPath: string; channel: string; valueType: string; valueB64: string; valueHash: string; createdAt: string },
  ): Promise<void> {
    const insert = tx.insert(agentCheckpointWrite).values(w);
    if (w.writeIdx < 0) {
      await insert.onConflictDoUpdate({
        target: [agentCheckpointWrite.agentRunId, agentCheckpointWrite.checkpointNs, agentCheckpointWrite.checkpointId, agentCheckpointWrite.taskId, agentCheckpointWrite.writeIdx],
        set: { channel: w.channel, valueType: w.valueType, valueB64: w.valueB64, valueHash: w.valueHash, taskPath: w.taskPath, createdAt: w.createdAt },
      });
    } else {
      await insert.onConflictDoNothing();
    }
  }

  /** 최신(또는 지정 · 그 이전) checkpoint 들. LangGraph checkpoint id 는 시간순으로 정렬되는 문자열이다. */
  async checkpoints(agentRunId: string, q: { checkpointNs: string | null; checkpointId: string | null; before: string | null; limit: number }) {
    const where = [eq(agentCheckpoint.agentRunId, agentRunId)];
    if (q.checkpointNs !== null) where.push(eq(agentCheckpoint.checkpointNs, q.checkpointNs));
    if (q.checkpointId) where.push(eq(agentCheckpoint.checkpointId, q.checkpointId));
    if (q.before) where.push(lt(agentCheckpoint.checkpointId, q.before));
    return this.db
      .select()
      .from(agentCheckpoint)
      .where(and(...where))
      .orderBy(desc(agentCheckpoint.checkpointId))
      .limit(q.limit);
  }

  async writes(agentRunId: string, checkpointNs: string, checkpointIds: string[]) {
    if (checkpointIds.length === 0) return [];
    return this.db
      .select()
      .from(agentCheckpointWrite)
      .where(and(eq(agentCheckpointWrite.agentRunId, agentRunId), eq(agentCheckpointWrite.checkpointNs, checkpointNs), inArray(agentCheckpointWrite.checkpointId, checkpointIds)))
      .orderBy(agentCheckpointWrite.taskId, agentCheckpointWrite.writeIdx);
  }
}
