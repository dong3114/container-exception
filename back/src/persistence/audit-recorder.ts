import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import { auditLog } from '../db/schema/index.js';
import { currentContext } from '../shared/context/request-context.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import type { AuditAction, AuditTargetType } from './catalog.js';

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  beforeRef?: string | null;
  afterRef?: string | null;
  result: 'SUCCESS' | 'FAILURE';
  isSimulated: boolean;
}

/**
 * `audit_log` 기록(append-only — 이 클래스에는 수정·삭제 메서드가 없다, docs/24 12.1 A층).
 * - `record(tx, …)`: 행위와 **같은 트랜잭션**. 행위가 롤백되면 감사도 남지 않는다(docs/24 15절)
 * - `recordStandalone(…)`: 행위 트랜잭션 밖에서 남겨야 하는 감사(T12 파기 실패 `FAILURE`) — 단독 문장 = 자기 트랜잭션
 * 요청 문맥은 id 만 남긴다(내용·비밀값 없음).
 */
@Injectable()
export class AuditRecorder {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async record(tx: DbTransaction, entry: AuditEntry): Promise<string> {
    const row = this.toRow(entry);
    await tx.insert(auditLog).values(row);
    return row.auditId;
  }

  async recordStandalone(entry: AuditEntry): Promise<string> {
    const row = this.toRow(entry);
    await this.db.insert(auditLog).values(row);
    return row.auditId;
  }

  private toRow(entry: AuditEntry): typeof auditLog.$inferInsert & { auditId: string } {
    return {
      auditId: this.ids.newId(),
      occurredAt: this.clock.now().toDb(),
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      beforeRef: entry.beforeRef ?? null,
      afterRef: entry.afterRef ?? null,
      requestContext: requestContextSummary(),
      result: entry.result,
      isSimulated: entry.isSimulated,
    };
  }
}

/** `request_context` 컬럼(300자): 상관 id 들만. */
export function requestContextSummary(): string | null {
  const ctx = currentContext();
  if (!ctx) return null;
  const parts = [`request_id=${ctx.requestId}`, `trace_id=${ctx.traceId}`];
  if (ctx.correlationId) parts.push(`correlation_id=${ctx.correlationId}`);
  return parts.join(';').slice(0, 300);
}
