import { Inject, Injectable } from '@nestjs/common';
import type { DbTransaction } from '../db/database.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { ApprovalRepository } from './approval.repository.js';
import { liveApproval } from './approval-rules.js';

/**
 * 계획 교체 → 미발송 승인 자동 무효화(docs/19 FR-APV-06 · T-069 11.4 · 12절 T3 · docs/18 K.2 #10).
 *
 * 새 실행(`previous_run_id` = 옛 실행)을 **등록하는 트랜잭션 안에서** 부른다 — 그래서 HTTP endpoint 가 없다(T-089 사용자 결정 ③:
 * 실행 등록은 Solver · 계획 단위가 만든다). 옛 실행을 근거로 한 살아 있는 승인마다 `INVALIDATED(PLAN_SUPERSEDED)` 새 행을
 * SYSTEM 행위자로 남긴다. 이미 나갔거나 나가는 중인 메시지는 건드리지 않는다(되돌릴 수 없다 — 회신 처리 쪽 일, T-069 4.3 B).
 *
 * 승인 쪽과 같은 advisory lock(M12 `fn_cera_lock_plan_run`)으로 줄을 선다: 승인이 먼저 커밋되면 여기서 보고 무효화하고,
 * 여기가 먼저면 승인 가드가 새 실행을 보고 거부한다. 아직 승인 전인 초안은 승인 시점 검사(PLAN_SUPERSEDED)가 막는다.
 */
@Injectable()
export class PlanSupersessionService {
  constructor(
    @Inject(ApprovalRepository) private readonly approvals: ApprovalRepository,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** @returns 무효화한 승인 id 들(무효화 행이 아니라 무효가 된 `APPROVED` 행). */
  async invalidateForNewRun(tx: DbTransaction, newRunId: string, systemActorId: string): Promise<string[]> {
    const run = await this.approvals.findRunPrevious(tx, newRunId);
    if (!run?.previousRunId) return [];
    const oldRunId = run.previousRunId;
    await this.approvals.lockPlanRun(tx, oldRunId);

    const now = this.clock.now();
    const invalidated: string[] = [];
    const candidates = await this.approvals.listApprovedForRun(tx, oldRunId);
    for (const messageId of new Set(candidates.map((c) => c.messageId))) {
      const locked = await this.approvals.lockMessage(tx, messageId);
      if (!locked) continue;
      const live = liveApproval(await this.approvals.listForMessage(messageId, tx), now);
      if (!live || !candidates.some((c) => c.approvalId === live.approvalId)) continue;
      if (await this.approvals.hasSentOrSending(tx, messageId)) continue;
      const rowId = this.ids.newId();
      await this.approvals.insertApproval(
        tx,
        {
          approvalId: rowId,
          messageId,
          decision: 'INVALIDATED',
          invalidatesApprovalId: live.approvalId,
          invalidationCause: 'PLAN_SUPERSEDED',
          actorId: systemActorId,
          decidedAt: now.toDb(),
          reason: `plan run ${oldRunId} superseded by ${newRunId}`,
        },
        [],
      );
      await this.approvals.setCurrentApproval(tx, messageId, null);
      await this.audit.record(tx, {
        actorId: systemActorId,
        action: AUDIT_ACTION.APPROVAL_INVALIDATED,
        targetType: 'MESSAGE_APPROVAL',
        targetId: rowId,
        result: 'SUCCESS',
        isSimulated: locked.isSimulated,
      });
      invalidated.push(live.approvalId);
    }
    return invalidated;
  }
}
