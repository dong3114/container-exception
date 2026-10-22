import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import { actor, agentRun, agentToolCall, commMessage, commThread, planningSnapshot, recoveryRun } from '../db/schema/index.js';
import type { Sha256Hash } from '../shared/hash/hash.js';
import type { ToolCategory } from './registry.js';

export interface AgentRunRow {
  agentRunId: string;
  recoveryRunId: string;
  goal: string;
  status: string;
  agentActorId: string;
  createdByActorId: string;
  runtimeVersion: string | null;
  traceId: string | null;
  startedAt: string;
  finishedAt: string | null;
  isSimulated: boolean;
}

export interface ToolCallStart {
  toolCallId: string;
  agentRunId: string;
  toolName: string;
  toolVersion: string;
  category: ToolCategory;
  idempotencyKey: string | null;
  inputHash: Sha256Hash;
  startedAt: string;
  requestId: string | null;
  traceId: string | null;
}

export interface ToolCallEnd {
  status: 'SUCCEEDED' | 'FAILED' | 'REJECTED';
  outputHash?: Sha256Hash | null;
  resultRef?: { type: string; id: string } | null;
  errorCode?: string | null;
  finishedAt: string;
  durationMs: number;
}

type Q = Database | DbTransaction;

/** Agent 실행 · Tool 호출 기록(M16). 입력 · 출력은 지문만 — 원문 · 비밀값을 복제하지 않는다. */
@Injectable()
export class AgentRunRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findAgentActorId(): Promise<string | null> {
    const rows = await this.db
      .select({ id: actor.actorId })
      .from(actor)
      .where(and(eq(actor.actorType, 'AI_AGENT'), eq(actor.isActive, true)))
      .orderBy(asc(actor.actorId))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async findActor(actorId: string) {
    const rows = await this.db.select({ actorType: actor.actorType, isActive: actor.isActive }).from(actor).where(eq(actor.actorId, actorId)).limit(1);
    return rows[0] ?? null;
  }

  async findRecoveryRun(runId: string) {
    const rows = await this.db
      .select({ runId: recoveryRun.runId, containsSimulated: recoveryRun.containsSimulated, scenarioId: planningSnapshot.scenarioId })
      .from(recoveryRun)
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId))
      .where(eq(recoveryRun.runId, runId))
      .limit(1);
    return rows[0] ?? null;
  }

  async insertRun(r: AgentRunRow): Promise<void> {
    await this.db.insert(agentRun).values(r);
  }

  async findRun(agentRunId: string): Promise<AgentRunRow | null> {
    const rows = await this.db.select().from(agentRun).where(eq(agentRun.agentRunId, agentRunId)).limit(1);
    return rows[0] ?? null;
  }

  async finishRun(agentRunId: string, status: 'FINISHED' | 'CANCELLED', at: string): Promise<boolean> {
    const rows = await this.db
      .update(agentRun)
      .set({ status, finishedAt: at })
      .where(and(eq(agentRun.agentRunId, agentRunId), eq(agentRun.status, 'ACTIVE')))
      .returning({ id: agentRun.agentRunId });
    return rows.length > 0;
  }

  /** STARTED 행. 같은 실행 · Tool · 멱등 키의 진행 중 · 성공 행이 이미 있으면(부분 유일) false. */
  async insertStarted(c: ToolCallStart): Promise<boolean> {
    const rows = await this.db
      .insert(agentToolCall)
      .values({ ...c, status: 'STARTED' })
      .onConflictDoNothing()
      .returning({ id: agentToolCall.toolCallId });
    return rows.length > 0;
  }

  /** 실행 전 거부(인자 · 범위 · 멱등 키). 처음부터 끝난 행. */
  async insertRejected(c: ToolCallStart, errorCode: string, finishedAt: string): Promise<void> {
    await this.db.insert(agentToolCall).values({ ...c, status: 'REJECTED', errorCode, finishedAt, durationMs: 0 });
  }

  /** STARTED → 끝. 이미 끝났으면(시간 초과로 먼저 FAILED 등) false — 호출자의 트랜잭션이면 그 트랜잭션을 되돌려야 한다. */
  async finish(q: Q | null, toolCallId: string, end: ToolCallEnd): Promise<boolean> {
    const rows = await (q ?? this.db)
      .update(agentToolCall)
      .set({
        status: end.status,
        outputHash: end.outputHash ?? null,
        resultRefType: end.resultRef?.type ?? null,
        resultRefId: end.resultRef?.id ?? null,
        errorCode: end.errorCode ?? null,
        finishedAt: end.finishedAt,
        durationMs: end.durationMs,
      })
      .where(and(eq(agentToolCall.toolCallId, toolCallId), eq(agentToolCall.status, 'STARTED')))
      .returning({ id: agentToolCall.toolCallId });
    return rows.length > 0;
  }

  async findLive(agentRunId: string, toolName: string, idempotencyKey: string) {
    const rows = await this.db
      .select()
      .from(agentToolCall)
      .where(
        and(
          eq(agentToolCall.agentRunId, agentRunId),
          eq(agentToolCall.toolName, toolName),
          eq(agentToolCall.idempotencyKey, idempotencyKey),
          inArray(agentToolCall.status, ['STARTED', 'SUCCEEDED']),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listCalls(agentRunId: string, limit = 200) {
    return this.db.select().from(agentToolCall).where(eq(agentToolCall.agentRunId, agentRunId)).orderBy(desc(agentToolCall.startedAt), desc(agentToolCall.toolCallId)).limit(limit);
  }

  // ── 범위 ──

  /** 메시지가 속한 스레드 · 그 스레드의 계획 실행. */
  async messageScope(messageId: string): Promise<{ threadId: string; relatedRunId: string | null } | null> {
    const rows = await this.db
      .select({ threadId: commThread.threadId, relatedRunId: commThread.relatedRunId })
      .from(commMessage)
      .innerJoin(commThread, eq(commThread.threadId, commMessage.threadId))
      .where(and(eq(commMessage.messageId, messageId), eq(commMessage.direction, 'OUTBOUND')))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 계획 실행에 묶인 스레드의 보내는 메시지(대체되지 않은 것 — 스레드마다 최신 수정본). */
  async outboundMessagesOfRun(recoveryRunId: string): Promise<string[]> {
    const rows = await this.db
      .select({ messageId: commMessage.messageId })
      .from(commMessage)
      .innerJoin(commThread, eq(commThread.threadId, commMessage.threadId))
      .where(and(eq(commThread.relatedRunId, recoveryRunId), eq(commMessage.direction, 'OUTBOUND'), sql`${commMessage.currentStatus} <> 'CLOSED'`))
      .orderBy(asc(commMessage.createdAt), asc(commMessage.messageId));
    return rows.map((r) => r.messageId);
  }
}
