import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { type ActorRow, ApprovalRepository, type LockedMessage } from './approval.repository.js';
import { approvalRowState, liveApproval } from './approval-rules.js';
import { type DraftInspection, DraftService, assertUuid, parse } from './draft.service.js';
import type { ApproverListDto, DraftDto } from './dto.js';

const HASH = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const approveSchema = z.object({ content_hash: HASH }).strict();
const rejectSchema = z.object({ reason: z.string().trim().min(1).max(500), content_hash: HASH }).strict();
const revokeSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() }).strict();

/** 승인자 헤더 — 인증이 생기기 전 개발용(T-089 사용자 결정 ①). 서버가 활성 HUMAN actor 인지 확인한다. */
export const ACTOR_HEADER = 'x-cera-actor-id';

/**
 * 발송 승인(G4) — 승인 · 반려 · 승인 취소(T-089 U4 · T-069 `ApproveMessage` · `RejectMessage` · `RevokeApproval`).
 *
 * - 승인은 **메시지 id 가 아니라 그 순간의 정확한 내용**에 대한 것이다: 요청이 운영자가 본 `content_hash` 를 가져오고,
 *   승인 행은 그 지문 · 수신자 · 계획 실행 · 제목 · 본문 사본(`MESSAGE_APPROVAL_CONTENT`) · 구조화 값 사본을 고정한다(FR-APV-02).
 * - 승인 직전에 다시 본다: 최신 수정본인가 · 내용 지문 대조 · 숫자 검사 · Contact Gate · 근거 계획이 교체되지 않았나.
 * - 같은 메시지 + 같은 지문의 승인은 하나(FR-APV-10). 동시 요청은 메시지 행 잠금으로 줄 세우고, M12 가드가 DB 에서도 막는다.
 * - Backend 만 승인을 결정한다. 화면은 지문을 보낼 뿐 `approved = true` 같은 값을 쓰지 않는다. AI 는 관여하지 않는다.
 * - 상태는 전부 PostgreSQL 에 있다 — 어느 API 인스턴스로 요청이 가도 같은 결과(LB 대비).
 */
@Injectable()
export class ApprovalService {
  private readonly ttlMs: number;

  constructor(
    @Inject(DraftService) private readonly drafts: DraftService,
    @Inject(ApprovalRepository) private readonly approvals: ApprovalRepository,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(ENV) env: Env,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
  ) {
    this.ttlMs = env.CERA_APPROVAL_TTL_MINUTES * 60_000;
  }

  async approvers(): Promise<ApproverListDto> {
    const rows = await this.approvals.listActiveHumans();
    return { approvers: rows.map((a) => ({ actor_id: a.actorId, display_name: a.displayName })) };
  }

  async approve(messageId: string, actorHeader: string | undefined, body: unknown): Promise<DraftDto> {
    assertUuid(messageId, 'messageId');
    const req = parse(approveSchema, body);
    const approver = await this.resolveApprover(actorHeader);
    const i = await this.drafts.inspect(messageId);
    const asOf = this.clock.now();

    // 이미 같은 내용으로 살아 있는 승인이 있으면 그것이 답이다(멱등 — 사본을 다시 만들지 않는다).
    const live = liveApproval(i.approvals, asOf);
    if (live && live.approvedContentHash === req.content_hash) return this.drafts.get(messageId);
    this.assertApprovable(i, req.content_hash, live !== null);

    // 승인 사본(제목 · 본문)은 트랜잭션 밖에서 먼저 저장한다 — 행 없는 내용(고아)은 허용, 내용 없는 행은 금지(T-069 12절 T2).
    const text = i.text;
    if (!text) throw new BusinessRuleError('CONTENT_MISSING', 'The message content is missing from the content store', 409);
    const copyRef = await this.drafts.storeText('MESSAGE_APPROVAL_CONTENT', text);

    const { message, fields } = i.loaded;
    const now = this.clock.now();
    await this.tx.run(async (tx) => {
      const locked = await this.lockAndRecheck(tx, messageId);
      const rows = await this.approvals.listForMessage(messageId, tx);
      const liveNow = liveApproval(rows, now);
      if (liveNow) {
        // 잠금을 기다리는 사이 다른 요청이 같은 내용을 승인했다 — 그 승인이 답이다.
        if (liveNow.approvedContentHash === req.content_hash) return;
        throw new BusinessRuleError('ALREADY_APPROVED', 'The message already has a live approval', 409);
      }
      if (locked.contentHash !== req.content_hash) throw contentChanged();
      if (locked.currentStatus !== 'PENDING_APPROVAL' && locked.currentStatus !== 'APPROVED') throw notPending(locked.currentStatus);
      if (i.sourceRunId) {
        // 계획 교체와 줄을 선다(M12 와 같은 advisory lock) — 잠근 뒤 새 실행이 보이면 거부.
        await this.approvals.lockPlanRun(tx, i.sourceRunId);
        if (await this.approvals.findSuccessorRun(i.sourceRunId, tx)) throw planSuperseded();
      }

      const approvalId = this.ids.newId();
      await this.approvals.insertApproval(
        tx,
        {
          approvalId,
          messageId,
          decision: 'APPROVED',
          actorId: approver.actorId,
          decidedAt: now.toDb(),
          expiresAt: now.plusMs(this.ttlMs).toDb(),
          approvedContentRef: copyRef,
          approvedPlanRunId: i.sourceRunId,
          approvedContentHash: locked.contentHash,
          approvedToAddressId: locked.toAddressId,
        },
        fields.map((f) => ({
          approvalId,
          fieldKey: f.fieldKey,
          approvedValueText: f.valueText,
          approvedValueNumber: f.valueNumber,
          approvedUnit: f.unit,
          approvedSourceRunId: f.sourceRunId,
          approvedSourceQuestionItemId: f.sourceQuestionItemId,
          approvedSourcePath: f.sourcePath,
        })),
      );
      await this.approvals.insertTransition(tx, {
        id: this.ids.newId(),
        messageId,
        status: 'APPROVED',
        actorId: approver.actorId,
        at: now.toDb(),
        isSimulated: message.isSimulated,
        note: locked.currentStatus === 'APPROVED' ? `re-approved (${approvalId})` : `approved (${approvalId})`,
      });
      await this.approvals.setCurrentApproval(tx, messageId, approvalId);
      await this.audit.record(tx, {
        actorId: approver.actorId,
        action: AUDIT_ACTION.MESSAGE_APPROVED,
        targetType: 'MESSAGE_APPROVAL',
        targetId: approvalId,
        afterRef: copyRef,
        result: 'SUCCESS',
        isSimulated: message.isSimulated,
      });
    });
    this.signals.emit({ type: 'APPROVAL_DECIDED', messageId, decision: 'APPROVED' }); // 커밋 뒤 — 기다리던 Agent 실행을 깨운다(T-104)
    return this.drafts.get(messageId);
  }

  /** 반려(FR-APV · docs/18 E.1 `PENDING_APPROVAL → REJECTED`). 사유 필수. 무엇을 보고 반려했는지 지문을 남긴다(docs/22 15.5.0). */
  async reject(messageId: string, actorHeader: string | undefined, body: unknown): Promise<DraftDto> {
    assertUuid(messageId, 'messageId');
    const req = parse(rejectSchema, body);
    const approver = await this.resolveApprover(actorHeader);
    const i = await this.drafts.inspect(messageId);
    const { message } = i.loaded;
    if (message.currentStatus === 'REJECTED') return this.drafts.get(messageId); // 멱등
    if (message.currentStatus === 'CLOSED') throw superseded();
    if (message.currentStatus !== 'PENDING_APPROVAL') throw notPending(message.currentStatus);
    if (message.contentHash !== req.content_hash) throw contentChanged();

    const now = this.clock.now().toDb();
    await this.tx.run(async (tx) => {
      const locked = await this.lockAndRecheck(tx, messageId);
      if (locked.currentStatus === 'REJECTED') return;
      if (locked.currentStatus !== 'PENDING_APPROVAL') throw notPending(locked.currentStatus);
      const approvalId = this.ids.newId();
      await this.approvals.insertApproval(
        tx,
        {
          approvalId,
          messageId,
          decision: 'REJECTED',
          actorId: approver.actorId,
          decidedAt: now,
          approvedContentHash: locked.contentHash,
          reason: req.reason,
        },
        [],
      );
      await this.approvals.insertTransition(tx, {
        id: this.ids.newId(),
        messageId,
        status: 'REJECTED',
        actorId: approver.actorId,
        at: now,
        isSimulated: message.isSimulated,
        note: `rejected (${approvalId})`,
      });
      await this.audit.record(tx, {
        actorId: approver.actorId,
        action: AUDIT_ACTION.MESSAGE_REJECTED,
        targetType: 'MESSAGE_APPROVAL',
        targetId: approvalId,
        result: 'SUCCESS',
        isSimulated: message.isSimulated,
      });
    });
    this.signals.emit({ type: 'APPROVAL_DECIDED', messageId, decision: 'REJECTED' });
    return this.drafts.get(messageId);
  }

  /**
   * 승인 취소(FR-APV-08) — 새 행 `REVOKED(USER_REVOKED)`. 승인 행은 고치지 않는다(docs/22 15.5.1). 메시지 상태는
   * `PENDING_APPROVAL` 로 돌아가지 않는다(15.8.1) — 같은 내용을 다시 승인하면 새 `APPROVED` 행이다. 이미 나간 메시지는 취소할 수 없다.
   */
  async revoke(approvalId: string, actorHeader: string | undefined, body: unknown): Promise<DraftDto> {
    assertUuid(approvalId, 'approvalId');
    const req = parse(revokeSchema, body ?? {});
    const approver = await this.resolveApprover(actorHeader);
    const target = await this.approvals.findApproval(approvalId);
    if (!target) throw new BusinessRuleError('APPROVAL_NOT_FOUND', 'No approval with this id', 404);
    if (target.decision !== 'APPROVED') throw new BusinessRuleError('NOT_AN_APPROVAL', `A ${target.decision} decision cannot be revoked`, 409);

    const now = this.clock.now();
    await this.tx.run(async (tx) => {
      const locked = await this.approvals.lockMessage(tx, target.messageId);
      if (!locked) throw new BusinessRuleError('DRAFT_NOT_FOUND', 'No outbound draft with this id', 404);
      const rows = await this.approvals.listForMessage(target.messageId, tx);
      const state = approvalRowState(target, rows, now);
      if (state === 'REVOKED' || state === 'INVALIDATED') return; // 멱등 — 이미 끝난 승인
      if (await this.approvals.hasSentOrSending(tx, target.messageId)) {
        throw new BusinessRuleError('ALREADY_SENT', 'The message has been sent or is being sent — its approval can no longer be revoked', 409);
      }
      const revocationId = this.ids.newId();
      await this.approvals.insertApproval(
        tx,
        {
          approvalId: revocationId,
          messageId: target.messageId,
          decision: 'REVOKED',
          invalidatesApprovalId: approvalId,
          invalidationCause: 'USER_REVOKED',
          actorId: approver.actorId,
          decidedAt: now.toDb(),
          reason: req.reason ?? null,
        },
        [],
      );
      await this.approvals.setCurrentApproval(tx, target.messageId, null);
      await this.audit.record(tx, {
        actorId: approver.actorId,
        action: AUDIT_ACTION.APPROVAL_REVOKED,
        targetType: 'MESSAGE_APPROVAL',
        targetId: revocationId,
        result: 'SUCCESS',
        isSimulated: locked.isSimulated,
      });
    });
    this.signals.emit({ type: 'APPROVAL_DECIDED', messageId: target.messageId, decision: 'REVOKED' });
    return this.drafts.get(target.messageId);
  }

  /** 승인 직전 재검증(트랜잭션 밖 — 내용 저장소 읽기 포함). 막히는 이유가 여럿이면 가장 앞의 것을 돌려준다. */
  private assertApprovable(i: DraftInspection, requestHash: string, hasLiveApproval: boolean): void {
    const { message } = i.loaded;
    if (message.currentStatus === 'CLOSED') throw superseded();
    if (message.contentHash !== requestHash) throw contentChanged();
    if (hasLiveApproval) throw new BusinessRuleError('ALREADY_APPROVED', 'The message already has a live approval', 409);
    if (!i.text) throw new BusinessRuleError('CONTENT_MISSING', 'The message content is missing from the content store', 409);
    if (!i.contentHashMatches) {
      throw new BusinessRuleError('CONTENT_HASH_MISMATCH', 'The stored content does not match the message content hash (msg-content/1)', 409);
    }
    if (!i.check?.passed) {
      const found = i.check?.unmatched.map((t) => t.text).join(', ') ?? '';
      throw new BusinessRuleError('NUMBER_CHECK_FAILED', `Numbers in the text are not in the structured values: ${found}`, 422);
    }
    if (!i.gate?.eligible) {
      throw new BusinessRuleError('RECIPIENT_NOT_ELIGIBLE', `Recipient is not eligible: ${(i.gate?.reasons ?? []).map((r) => r.code).join(', ')}`, 403);
    }
    if (i.successorRunId) throw planSuperseded();
    // 내용 판정을 먼저 돌려준다 — 숫자 검사에 걸린 초안은 DRAFTED 에 있지만 운영자에게 필요한 답은 "숫자가 다르다"이다.
    if (message.currentStatus !== 'PENDING_APPROVAL' && message.currentStatus !== 'APPROVED') throw notPending(message.currentStatus);
  }

  /** 메시지 행을 잠그고 대체 여부를 다시 본다(잠금을 기다리는 사이 수정본이 생겼을 수 있다). */
  private async lockAndRecheck(tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0], messageId: string): Promise<LockedMessage> {
    const locked = await this.approvals.lockMessage(tx, messageId);
    if (!locked) throw new BusinessRuleError('DRAFT_NOT_FOUND', 'No outbound draft with this id', 404);
    if (locked.currentStatus === 'CLOSED') throw superseded();
    return locked;
  }

  /** 결정 · 발송 요청을 하는 운영자(헤더 — 인증 전 개발용). 활성 HUMAN actor 만. */
  async resolveApprover(header: string | undefined): Promise<ActorRow> {
    const value = header?.trim();
    if (!value) throw new ValidationError('ACTOR_REQUIRED', 'The X-CERA-Actor-Id header is required for approval decisions', [ACTOR_HEADER]);
    assertUuid(value, ACTOR_HEADER);
    const found = await this.approvals.findActor(value);
    if (!found || !found.isActive || found.actorType !== 'HUMAN') {
      throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can decide approvals', 403);
    }
    return found;
  }
}

const contentChanged = () =>
  new BusinessRuleError('CONTENT_CHANGED', 'The content changed since it was reviewed — reload and review the current content', 409);
const superseded = () => new BusinessRuleError('MESSAGE_SUPERSEDED', 'This draft was replaced by a newer revision — review the latest one', 409);
const planSuperseded = () => new BusinessRuleError('PLAN_SUPERSEDED', 'The recovery plan behind these values was replaced by a newer run', 409);
const notPending = (status: string | null) => new BusinessRuleError('NOT_PENDING_APPROVAL', `A ${status} message is not awaiting approval`, 409);
