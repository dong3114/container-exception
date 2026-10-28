import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import { contactSelection } from '../db/schema/index.js';
import { Instant } from '../shared/time/instant.js';
import type { ContactSelectionDto } from './dto.js';

type Row = typeof contactSelection.$inferSelect;

/**
 * T-129 사람의 받는 주소 선택 기록(M34, append-only). 다시 고르면 새 행 — 범위마다 **가장 최근 행**이 선택이다.
 * 프로세스 메모리에 두지 않는다: API · Worker · Redis 를 다시 띄워도 누가 무엇을 골랐는지 DB 에서 읽는다.
 */
@Injectable()
export class ContactSelectionRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async insert(tx: DbTransaction, row: typeof contactSelection.$inferInsert): Promise<void> {
    await tx.insert(contactSelection).values(row);
  }

  /** 기다리는 Agent 실행의 공백 주체 하나에 대한 가장 최근 선택 */
  async latestForAgentRun(agentRunId: string, subjectId: string): Promise<Row | null> {
    const rows = await this.db
      .select()
      .from(contactSelection)
      .where(and(eq(contactSelection.agentRunId, agentRunId), eq(contactSelection.subjectId, subjectId)))
      .orderBy(desc(contactSelection.selectedAt), desc(contactSelection.selectionId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 계획 판의 후속 조치 하나에 대한 가장 최근 선택 */
  async latestForFollowUp(planId: string, actionKey: string): Promise<Row | null> {
    const rows = await this.db
      .select()
      .from(contactSelection)
      .where(and(eq(contactSelection.planId, planId), eq(contactSelection.actionKey, actionKey)))
      .orderBy(desc(contactSelection.selectedAt), desc(contactSelection.selectionId))
      .limit(1);
    return rows[0] ?? null;
  }

  async find(selectionId: string): Promise<Row | null> {
    const rows = await this.db.select().from(contactSelection).where(eq(contactSelection.selectionId, selectionId)).limit(1);
    return rows[0] ?? null;
  }
}

export function selectionView(r: Row): ContactSelectionDto {
  return {
    selection_id: r.selectionId,
    scope_type: r.scopeType as ContactSelectionDto['scope_type'],
    agent_run_id: r.agentRunId,
    plan_id: r.planId,
    action_key: r.actionKey,
    subject_type: r.subjectType as ContactSelectionDto['subject_type'],
    subject_id: r.subjectId,
    address_id: r.addressId,
    selected_by_actor_id: r.selectedByActorId,
    selected_at: Instant.fromDb(r.selectedAt).toSeoulIso(),
    note: r.note,
  };
}
