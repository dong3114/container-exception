import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { BusinessRuleError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { ApprovalRepository } from './approval.repository.js';
import { ApprovalService } from './approval.service.js';
import { DraftService, assertUuid, parse } from './draft.service.js';
import type { DraftDto } from './dto.js';
import { SendRepository } from './send.repository.js';
import { type SendBlockReason, sendBlocks } from './send-rules.js';
import { liveApproval } from './approval-rules.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

const sendSchema = z.object({ content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/) }).strict();

/**
 * 발송 요청(T-090 U5 · docs/24 14 · 15 T4). **지금 네트워크로 보내는 것이 아니라**, 검증 뒤 Outbox 에 넣는다:
 * 한 트랜잭션에서 `APPROVED → QUEUED` 전이 + 감사. 실제 발송은 별도 Worker 가 한다(외부 I/O 는 트랜잭션 밖).
 *
 * - 빠른 실패: Worker 와 **같은 판정**(`DraftService.sendCheck` → 순수 `sendBlocks`)으로 막힌 이유를 바로 돌려준다
 * - 멱등: 이미 대기 · 발송 중 · 발송 완료면 아무것도 하지 않고 지금 상태를 돌려준다(버튼 두 번 · 요청 재시도)
 * - DB 방어: M13 이 "유효한 승인 없는 QUEUED"를 거부한다
 */
@Injectable()
export class SendService {
  constructor(
    @Inject(DraftService) private readonly drafts: DraftService,
    @Inject(ApprovalService) private readonly approvalsService: ApprovalService,
    @Inject(ApprovalRepository) private readonly approvals: ApprovalRepository,
    @Inject(SendRepository) private readonly sends: SendRepository,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async requestSend(messageId: string, actorHeader: string | undefined, body: unknown): Promise<DraftDto> {
    assertUuid(messageId, 'messageId');
    const req = parse(sendSchema, body);
    const operator = await this.approvalsService.resolveApprover(actorHeader);
    const i = await this.drafts.inspect(messageId);
    const { message } = i.loaded;
    // 공개 포트폴리오 데모(T-131): 실제 채널로는 발송 요청 자체를 받지 않는다. 설정(env.ts)이 Gmail 을 이미 끄지만 API 에서도 한 번 더 막는다
    if (this.env.CERA_PORTFOLIO_DEMO_MODE && message.channelType !== 'MOCK') {
      throw new BusinessRuleError('PORTFOLIO_DEMO_REAL_CHANNEL_BLOCKED', 'The portfolio demo sends only through the mock channel', 403);
    }
    const status = message.currentStatus ?? '';
    // 멱등: 이미 요청됐거나 끝난 발송은 다시 넣지 않는다
    if (status === 'QUEUED' || status === 'SENT' || status === 'REPLIED' || status === 'DELIVERY_FAILED') return this.drafts.get(messageId);
    if (message.contentHash !== req.content_hash) {
      throw new BusinessRuleError('CONTENT_CHANGED', 'The content changed since it was reviewed — reload and review the current content', 409);
    }
    const check = await this.drafts.sendCheck(i, this.clock.now());
    if (check.blocks.length > 0) throw blocked(check.blocks);

    const now = this.clock.now();
    await this.tx.run(async (tx) => {
      const locked = await this.approvals.lockMessage(tx, messageId);
      if (!locked) throw new BusinessRuleError('DRAFT_NOT_FOUND', 'No outbound draft with this id', 404);
      if (locked.currentStatus === 'QUEUED' || locked.currentStatus === 'SENT') return; // 동시 요청 — 앞선 요청이 넣었다
      // 잠근 뒤 승인 행을 다시 본다(그 사이 취소 · 무효화 · 만료)
      const rows = await this.approvals.listForMessage(messageId, tx);
      const live = liveApproval(rows, now);
      const again = sendBlocks(
        {
          status: locked.currentStatus ?? '',
          messageContentHash: locked.contentHash,
          messageToAddressId: locked.toAddressId,
          isSimulated: locked.isSimulated,
          approvals: rows,
          liveCopyVerified: live !== null && live.approvalId === check.live?.approvalId,
          contentHashMatches: i.contentHashMatches,
          recipientEligible: i.gate?.eligible ?? false,
          planSuperseded: i.successorRunId !== null,
          hasSuccessfulAttempt: (await this.sends.attempts(messageId, tx)).some((a) => a.result === 'SUCCESS'),
          adapter: check.adapter,
        },
        now,
      );
      if (again.length > 0) throw blocked(again);
      await this.sends.insertTransition(tx, {
        id: this.ids.newId(),
        messageId,
        status: 'QUEUED',
        actorId: operator.actorId,
        at: now.toDb(),
        isSimulated: locked.isSimulated,
        note: `send requested with approval ${live?.approvalId}`,
      });
      await this.audit.record(tx, {
        actorId: operator.actorId,
        action: AUDIT_ACTION.SEND_REQUESTED,
        targetType: 'COMM_MESSAGE',
        targetId: messageId,
        result: 'SUCCESS',
        isSimulated: locked.isSimulated,
      });
    });
    this.signals.emit({ type: 'SEND_REQUESTED', messageId }); // 커밋 뒤 — 실행 큐가 Worker 를 바로 깨운다(놓쳐도 폴링)
    return this.drafts.get(messageId);
  }
}

/** 막힌 이유 → 응답(첫 이유가 코드, 전부는 메시지). 정책 거부는 기술 오류가 아니다(docs/22 15.8.1 규칙 2). */
function blocked(reasons: SendBlockReason[]): BusinessRuleError {
  const first = reasons[0] ?? 'NOT_APPROVED';
  return new BusinessRuleError(first, `Cannot send: ${reasons.join(', ')}`, first === 'RECIPIENT_NOT_ELIGIBLE' ? 403 : 409);
}
