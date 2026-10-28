import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ContentService } from '../content/content-service.js';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../content/content-store.js';
import type { DbTransaction } from '../db/database.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { RegistryReader } from '../persistence/registry-reader.js';
import { type ChannelType, type DevSafetyPolicy, type GateResult, evaluateContactGate } from '../registry/contact-gate.js';
import { BusinessRuleError, SystemError, ValidationError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { CHANNEL_ADAPTERS, type ChannelAdapter, type ChannelType as AdapterChannel, type OutboundMessage } from '../channel/channel-adapter.js';
import type { ChannelAdapters } from '../channel/channel.module.js';
import { type ApprovalRecord, ApprovalRepository } from './approval.repository.js';
import { InboundService } from './inbound.service.js';
import { SendRepository } from './send.repository.js';
import { type AttemptRow, RECONCILED_FOUND, RECONCILED_NOT_SENT, type SendBlockReason, dispatchState, nextAttemptAt, sendBlocks } from './send-rules.js';
import { approvalBlocks, isUsableForSend, liveApproval, summarizeApprovals } from './approval-rules.js';
import { type DraftProse, TemplateDraftProse, askTag } from './draft-prose.js';
import { DraftRepository, type FieldInsert, type TargetRow } from './draft.repository.js';
import type { ApprovalDecisionDto, ApprovalSnapshotDto, DraftDto, DraftListDto, RunListDto, StructuredValueDto } from './dto.js';
import { INQUIRY_INTENTS, INTENTS, type InquiryIntent, type StructuredValue, targetFactKey, validateIntentValues } from './inquiry-intents.js';
import { type ContentField, type MessageText, canonicalDecimal, messageContentHash, messageTextBytes, parseMessageText } from './message-content.js';
import { type NumberCheckResult, checkDraftNumbers } from './number-check.js';

const uuid = z.string().uuid();
const valueSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(60),
    value_number: z.number().finite().nullable().optional(),
    value_text: z.string().max(200).nullable().optional(),
    unit: z.string().regex(/^[A-Z0-9][A-Z0-9_]*$/).nullable().optional(),
    source_path: z.string().min(1).max(120).nullable().optional(),
  })
  .strict();
const createSchema = z
  .object({
    address_id: uuid,
    intent: z.enum(INQUIRY_INTENTS as [InquiryIntent, ...InquiryIntent[]]),
    target_id: uuid.nullable().optional(),
    source_run_id: uuid.nullable().optional(),
    scenario_id: uuid.nullable().optional(),
    values: z.array(valueSchema).min(1).max(20),
  })
  .strict();
const revisionSchema = z
  .object({
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(4000),
    // 출처는 받지 않는다 — 수정본의 값이 계획 값과 같으면 출처를 이어받고, 다르면 사람 입력 값이 된다.
    values: z.array(valueSchema.omit({ source_path: true })).min(1).max(20).optional(),
  })
  .strict();

const ASK_ID = 'Q1';
const LIST_LIMIT = 20;
/** 수정본을 만들 수 있는 상태 — 아직 발송 단계(QUEUED 이후)로 넘어가지 않은 메시지. */
const REVISABLE = new Set(['DRAFTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']);
/** 질문의 대상(사실 키)을 정하는 값 — 수정본에서 바꾸면 다른 질문이 된다(새 문의로). */
const QUESTION_DEFINING_KEYS: Record<InquiryIntent, readonly string[]> = {
  TRUCK_SLOT: ['date', 'window_from', 'window_to'],
  FACILITY_CAPACITY: ['date', 'size_type'],
};
const PURPOSE_INTENT: Record<string, InquiryIntent> = { SLOT_REQUEST: 'TRUCK_SLOT', CAPACITY_CHECK: 'FACILITY_CAPACITY' };

type LoadedDraft = NonNullable<Awaited<ReturnType<DraftRepository['loadDraft']>>>;

export interface SendCheck {
  blocks: SendBlockReason[];
  /** 살아 있는 승인(발송 시도의 `approval_id` 가 될 행). */
  live: ApprovalRecord | null;
  attempts: AttemptRow[];
  adapter: ChannelAdapter | null;
  /** 통과했을 때만 — 승인 사본에서 만든 보낼 내용. */
  outbound: OutboundMessage | null;
}

/** 초안 한 건을 판정하는 데 필요한 사실(읽기 · 승인 명령이 같은 판정을 쓴다). */
export interface DraftInspection {
  loaded: LoadedDraft;
  values: StructuredValue[];
  targetName: string;
  text: MessageText | null;
  /** 꺼낸 내용 + 구조화 값 + 수신자로 다시 계산한 `msg-content/1` = 행의 `content_hash`. */
  contentHashMatches: boolean;
  check: NumberCheckResult | null;
  gate: GateResult | null;
  sourceRunId: string | null;
  /** 값의 출처 실행을 대체한 새 실행(있으면 계획이 바뀌었다). */
  successorRunId: string | null;
  approvals: ApprovalRecord[];
}

/**
 * 문의 초안(T-088 U3 · T-069 `CreateInquiryDraft` · docs/19 FR-COM-04~13) + 승인 상태 읽기(T-089 U4).
 *
 * 순서: Contact Gate → 값 형식 · 출처 확인 → 문장(템플릿 포트) → 숫자 검사(순수) → 내용 저장(트랜잭션 밖 —
 * 외부 I/O) → **한 트랜잭션**: 스레드 · 질문 · 메시지 · 구조화 값 · 상태 전이. 숫자 검사를 통과한 초안만
 * `PENDING_APPROVAL`(승인 화면에 올라갈 수 있음), 실패하면 `DRAFTED` 에 머문다(`BLOCKED_NUMBER_CHECK`).
 *
 * 메시지 지문은 `msg-content/1`(수신자 · 제목 · 본문 · 구조화 값, docs/24 8.2) — 승인은 이 지문에 대한 승인이다.
 * Contact Gate 는 여기서 한 번 통과했다고 끝이 아니다 — U4 승인 시점 · U5 발송 직전에 다시 부른다(FR-ELG-03).
 * 상태는 모두 DB 에 있다. 이 서비스는 요청 사이에 아무것도 기억하지 않는다(LB 뒤 여러 인스턴스 가능).
 */
/**
 * 호출자가 초안 만들기를 다르게 쓸 때(T-103 Agent Tool). 기본값은 지금까지와 같다(사람 화면 · 시스템 행위자 · 숫자 검사 통과 시 승인 대기).
 * - `actorId`: 상태 전이를 기록할 행위자(Agent Tool 은 AI_AGENT — 승인 결정 주체는 DB 가 HUMAN 으로 막는다)
 * - `submitForApproval: false`: 숫자 검사를 통과해도 `DRAFTED` 에 둔다 — 승인 대기는 `requestApproval` 이 따로 한다
 * - `inTransaction`: 초안을 쓰는 같은 트랜잭션 안에서 부른다(Tool 호출 기록 성공 표시를 초안과 한 번에 커밋하려고)
 */
export interface DraftCreateOptions {
  actorId?: string;
  submitForApproval?: boolean;
  inTransaction?: (tx: DbTransaction, messageId: string) => Promise<void>;
}

@Injectable()
export class DraftService {
  private readonly prose: DraftProse = new TemplateDraftProse();
  private readonly safety: DevSafetyPolicy;
  private readonly sendingPaused: boolean;
  private readonly retryBaseMs: number;

  constructor(
    @Inject(DraftRepository) private readonly drafts: DraftRepository,
    @Inject(ApprovalRepository) private readonly approvals: ApprovalRepository,
    @Inject(RegistryReader) private readonly registry: RegistryReader,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(CONTENT_STORE) private readonly store: ContentStore,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(SendRepository) private readonly sends: SendRepository,
    @Inject(InboundService) private readonly inboundReads: InboundService,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapters,
    @Inject(ENV) env: Env,
  ) {
    this.safety = { appEnv: env.APP_ENV, allowlist: env.CERA_TEST_RECIPIENT_ALLOWLIST };
    this.sendingPaused = env.CERA_SENDING_PAUSED;
    this.retryBaseMs = env.CERA_SEND_RETRY_BASE_MS;
  }

  async create(body: unknown, options: DraftCreateOptions = {}): Promise<DraftDto> {
    const req = parse(createSchema, body);

    // 1. 받는 사람 — 등록부 + Contact Gate(판정은 순수 함수, AI 없음)
    const address = await this.registry.findAddress(req.address_id);
    if (!address) throw new BusinessRuleError('ADDRESS_NOT_FOUND', 'No contact address with this id', 404);
    const gate = this.gate(address);
    if (!gate.eligible) {
      throw new BusinessRuleError('RECIPIENT_NOT_ELIGIBLE', `Recipient is not eligible: ${gate.reasons.map((r) => r.code).join(', ')}`, 403);
    }

    // 2. 값 — 형식(문의 종류) · 출처(계획 실행)
    const values: StructuredValue[] = req.values.map((v) => ({
      key: v.key,
      valueNumber: v.value_number ?? null,
      valueText: v.value_text ?? null,
      unit: v.unit ?? null,
      sourcePath: v.source_path ?? null,
    }));
    assertIntentValues(req.intent, values);
    const run = req.source_run_id ? await this.drafts.findRun(req.source_run_id) : null;
    if (req.source_run_id && !run) throw new BusinessRuleError('RUN_NOT_FOUND', 'No recovery run with this id', 404);
    if (!run && values.some((v) => v.sourcePath)) {
      throw new ValidationError('SOURCE_RUN_REQUIRED', 'A value with source_path needs source_run_id', ['source_run_id']);
    }

    // 3. 질문 대상 — Backend 가 확정한다
    const spec = INTENTS[req.intent];
    const target = await this.target(req.intent, req.target_id ?? null, address.counterpartyId);

    // 4. 가상 / 실제 — MOCK 채널은 가상(시나리오 필요), 가상 계획 값은 실채널로 못 나간다(G-06 · J.3)
    const isSimulated = address.channelType === 'MOCK';
    const scenarioId = isSimulated ? (run?.scenarioId ?? req.scenario_id ?? null) : null;
    if (isSimulated && !scenarioId) throw new ValidationError('SCENARIO_REQUIRED', 'A MOCK-channel draft needs a scenario (source run or scenario_id)', ['scenario_id']);
    if (!isSimulated && run?.containsSimulated) {
      throw new BusinessRuleError('SIMULATION_MISMATCH', 'Values from a simulated plan cannot go to a real channel', 422);
    }

    // 5. 문장 — 구조화 값을 입력으로(템플릿). AI 문장이 오더라도 이 자리에서, 트랜잭션 밖에서.
    const ctx = {
      intent: req.intent,
      askId: ASK_ID,
      counterpartyName: address.counterpartyName,
      contactName: address.personName,
      targetName: target.name,
      values,
    };
    const text = this.prose.compose(ctx);
    const check = checkDraftNumbers({ texts: [text.subject, text.body], fields: values, literals: text.literals });

    const messageId = this.ids.newId();
    const sourceRunId = run?.runId ?? null;
    const fields = values.map((v) => toFieldRow(messageId, v, v.sourcePath ? sourceRunId : null));

    // 6. 내용 저장(트랜잭션 밖). 4단계(참조 + 지문을 행에 넣기)가 실패하면 고아 내용만 남는다(docs/24 16.2).
    const messageText = { subject: text.subject, bodyText: text.body };
    const ref = await this.storeText('COMM_MESSAGE_CONTENT', messageText);
    const contentHash = messageContentHash({ toAddressId: address.addressId, text: messageText, fields: fields.map(toContentField) });

    // 7. 한 트랜잭션
    const now = this.clock.now().toDb();
    const actorId = options.actorId ?? (await this.systemActor());
    const threadId = this.ids.newId();
    const questionItemId = this.ids.newId();
    await this.tx.run(async (tx) => {
      await this.drafts.insertThread(tx, {
        threadId,
        channelType: address.channelType,
        counterpartyId: address.counterpartyId,
        contactId: address.contactId,
        purpose: spec.purpose,
        relatedRunId: sourceRunId,
        threadStatus: 'OPEN',
        openedAt: now,
        lastActivityAt: now,
        isSimulated,
        scenarioId,
      });
      await this.drafts.insertQuestion(tx, {
        questionItemId,
        threadId,
        askId: ASK_ID,
        questionType: spec.questionType,
        questionText: text.subject.replace(askTag(ASK_ID), '').trim().slice(0, 500),
        targetEntityType: spec.targetEntityType,
        targetEntityId: target.id,
        targetFactKey: targetFactKey(req.intent, values, target.kind),
        targetApplicabilityScopeType: 'GLOBAL',
        targetApplicabilityScopeRef: '',
        expectedValueType: 'NUMBER',
        expectedUnit: spec.expectedUnit,
        questionStatus: 'DRAFTED',
        isSimulated,
      });
      await this.writeMessage(tx, {
        messageId,
        threadId,
        address,
        isSimulated,
        scenarioId,
        stored: { ref, contentHash },
        draftedBy: this.prose.draftedBy,
        fields,
        questionItemId,
        check,
        actorId,
        now,
        submitForApproval: options.submitForApproval ?? true,
      });
      await options.inTransaction?.(tx, messageId);
    });
    return this.get(messageId);
  }

  /**
   * 승인 요청(T-103 `request_approval`): `DRAFTED` 초안을 사람의 승인 대기(`PENDING_APPROVAL`)로 올린다. **승인이 아니다.**
   * 승인 직전과 같은 검사를 다시 한다 — 내용 존재 · 지문 일치(`msg-content/1`) · 숫자 검사 · Contact Gate · 계획 교체.
   * 요청자가 Agent 라고 건너뛰는 검사는 없다. 이미 승인 대기면 그대로(멱등). 결과 상태 전이는 요청자 행위자로 남는다.
   */
  async requestApproval(
    messageId: string,
    actorId: string,
    inTransaction?: (tx: DbTransaction) => Promise<void>,
  ): Promise<{ alreadyPending: boolean }> {
    const i = await this.inspect(messageId);
    const { message } = i.loaded;
    const notDrafted = (status: string | null) => new BusinessRuleError('NOT_DRAFTED', `A ${status} message cannot be sent to the approval queue`, 409);
    if (message.currentStatus === 'CLOSED') throw new BusinessRuleError('MESSAGE_SUPERSEDED', 'The message was replaced by a newer revision', 409);
    if (message.currentStatus === 'PENDING_APPROVAL') {
      if (inTransaction) await this.tx.run((tx) => inTransaction(tx));
      return { alreadyPending: true };
    }
    if (message.currentStatus !== 'DRAFTED') throw notDrafted(message.currentStatus);
    if (!i.text) throw new BusinessRuleError('CONTENT_MISSING', 'The message content is missing from the content store', 409);
    if (!i.contentHashMatches) throw new BusinessRuleError('CONTENT_HASH_MISMATCH', 'The stored content does not match the message content hash (msg-content/1)', 409);
    if (!i.check?.passed) {
      throw new BusinessRuleError('BLOCKED_NUMBER_CHECK', `Numbers in the text are not in the structured values: ${i.check?.unmatched.map((t) => t.text).join(', ') ?? ''}`, 422);
    }
    if (!i.gate?.eligible) {
      throw new BusinessRuleError('RECIPIENT_NOT_ELIGIBLE', `Recipient is not eligible: ${(i.gate?.reasons ?? []).map((r) => r.code).join(', ')}`, 403);
    }
    if (i.successorRunId) throw new BusinessRuleError('PLAN_SUPERSEDED', 'The plan run behind these values was replaced by a newer run', 409);

    let alreadyPending = false;
    await this.tx.run(async (tx) => {
      const locked = await this.approvals.lockMessage(tx, messageId);
      if (!locked) throw new BusinessRuleError('DRAFT_NOT_FOUND', 'No outbound draft with this id', 404);
      if (locked.contentHash !== message.contentHash) throw new BusinessRuleError('CONTENT_CHANGED', 'The message changed while the request was checked', 409);
      if (locked.currentStatus === 'PENDING_APPROVAL') {
        alreadyPending = true; // 잠금을 기다리는 사이 같은 요청이 먼저 올렸다
      } else {
        if (locked.currentStatus !== 'DRAFTED') throw notDrafted(locked.currentStatus);
        if (i.sourceRunId) {
          await this.approvals.lockPlanRun(tx, i.sourceRunId);
          if (await this.approvals.findSuccessorRun(i.sourceRunId, tx)) throw new BusinessRuleError('PLAN_SUPERSEDED', 'The plan run behind these values was replaced by a newer run', 409);
        }
        const now = this.clock.now().toDb();
        await this.drafts.insertTransition(tx, {
          id: this.ids.newId(),
          messageId,
          status: 'PENDING_APPROVAL',
          actorId,
          at: now,
          isSimulated: message.isSimulated,
          note: 'approval requested — re-checked content, numbers, Contact Gate and plan',
        });
        await this.audit.record(tx, {
          actorId,
          action: AUDIT_ACTION.APPROVAL_REQUESTED,
          targetType: 'COMM_MESSAGE',
          targetId: messageId,
          result: 'SUCCESS',
          isSimulated: message.isSimulated,
        });
      }
      if (inTransaction) await inTransaction(tx);
    });
    return { alreadyPending };
  }

  /**
   * 사람이 고친 본문(FR-COM-12) · 구조화 값(T-089). **새 메시지**를 만든다(내용 불변) — 질문 연결은 그대로 옮기고 숫자 검사를
   * 다시 한다. 이전 메시지는 `CLOSED`(대체됨). 이전 메시지에 살아 있는 승인이 있으면 같은 트랜잭션에서
   * `INVALIDATED(CONTENT_CHANGED)` 행을 남긴다 — 고친 내용은 다시 승인해야 한다(FR-APV-04 · docs/22 15.5.1).
   * 발송 단계(QUEUED 이후)로 넘어간 메시지는 고칠 수 없다.
   */
  async revise(messageId: string, body: unknown): Promise<DraftDto> {
    assertUuid(messageId, 'messageId');
    const req = parse(revisionSchema, body);
    const loaded = await this.drafts.loadDraft(messageId);
    if (!loaded) throw new BusinessRuleError('DRAFT_NOT_FOUND', 'No outbound draft with this id', 404);
    assertRevisable(loaded.message.currentStatus);
    const addressId = loaded.message.toAddressId;
    const address = addressId ? await this.registry.findAddress(addressId) : null;
    if (!address) throw new SystemError('DRAFT_ADDRESS_MISSING', 'The draft has no registry address');
    const gate = this.gate(address);
    if (!gate.eligible) {
      throw new BusinessRuleError('RECIPIENT_NOT_ELIGIBLE', `Recipient is not eligible: ${gate.reasons.map((r) => r.code).join(', ')}`, 403);
    }
    const question = loaded.questions[0];
    if (!question) throw new SystemError('DRAFT_QUESTION_MISSING', 'The draft has no question item');

    const newId = this.ids.newId();
    const fields = req.values ? this.revisedFields(loaded, req.values, newId) : loaded.fields.map((f) => ({ ...f, messageId: newId }));
    const values = fields.map(fromFieldRow);
    const target = await this.targetName(question.targetEntityType, question.targetEntityId);
    const literals = draftLiterals(address.counterpartyName, address.personName, target, question.askId, values);
    const check = checkDraftNumbers({ texts: [req.subject, req.body], fields: values, literals });
    const messageText = { subject: req.subject, bodyText: req.body };
    const ref = await this.storeText('COMM_MESSAGE_CONTENT', messageText);
    const contentHash = messageContentHash({ toAddressId: address.addressId, text: messageText, fields: fields.map(toContentField) });

    const nowInstant = this.clock.now();
    const now = nowInstant.toDb();
    const actorId = await this.systemActor();
    await this.tx.run(async (tx) => {
      // 같은 메시지의 승인 · 반려와 줄을 선다 — 잠근 뒤 다시 본 상태로 판정한다.
      const locked = await this.approvals.lockMessage(tx, messageId);
      if (!locked) throw new BusinessRuleError('DRAFT_NOT_FOUND', 'No outbound draft with this id', 404);
      assertRevisable(locked.currentStatus);
      await this.writeMessage(tx, {
        messageId: newId,
        threadId: loaded.thread.threadId,
        address,
        isSimulated: loaded.message.isSimulated,
        scenarioId: loaded.message.scenarioId,
        stored: { ref, contentHash },
        draftedBy: 'HUMAN',
        fields,
        questionItemId: question.questionItemId,
        check,
        actorId,
        now,
      });
      const live = liveApproval(await this.approvals.listForMessage(messageId, tx), nowInstant);
      if (live) {
        const invalidationId = this.ids.newId();
        await this.approvals.insertApproval(
          tx,
          {
            approvalId: invalidationId,
            messageId,
            decision: 'INVALIDATED',
            invalidatesApprovalId: live.approvalId,
            invalidationCause: 'CONTENT_CHANGED',
            actorId,
            decidedAt: now,
            reason: `content revised as message ${newId}`,
          },
          [],
        );
        await this.approvals.setCurrentApproval(tx, messageId, null);
        await this.audit.record(tx, {
          actorId,
          action: AUDIT_ACTION.APPROVAL_INVALIDATED,
          targetType: 'MESSAGE_APPROVAL',
          targetId: invalidationId,
          result: 'SUCCESS',
          isSimulated: loaded.message.isSimulated,
        });
      }
      await this.drafts.insertTransition(tx, {
        id: this.ids.newId(),
        messageId,
        status: 'CLOSED',
        actorId,
        at: now,
        isSimulated: loaded.message.isSimulated,
        note: `superseded by revision ${newId}`,
      });
      await this.drafts.touchThread(tx, loaded.thread.threadId, now);
    });
    return this.get(newId);
  }

  /** 초안 한 건의 판정 재료 — 내용 · 지문 대조 · 숫자 검사 · Contact Gate · 계획 교체 · 승인 행. 읽을 때마다 다시 계산한다. */
  async inspect(messageId: string): Promise<DraftInspection> {
    assertUuid(messageId, 'messageId');
    const loaded = await this.drafts.loadDraft(messageId);
    if (!loaded) throw new BusinessRuleError('DRAFT_NOT_FOUND', 'No outbound draft with this id', 404);
    const { message, fields, questions } = loaded;
    const values = fields.map(fromFieldRow);
    const question = questions[0] ?? null;
    const targetName = question ? await this.targetName(question.targetEntityType, question.targetEntityId) : '';
    const text = await this.readText(message.messageContentRef);
    const literals = draftLiterals(loaded.counterpartyName, loaded.contactName ?? '', targetName, question?.askId ?? ASK_ID, values);
    const check = text ? checkDraftNumbers({ texts: [text.subject, text.bodyText], fields: values, literals }) : null;
    const contentHashMatches =
      text !== null &&
      message.toAddressId !== null &&
      messageContentHash({ toAddressId: message.toAddressId, text, fields: fields.map(toContentField) }) === message.contentHash;
    const address = message.toAddressId ? await this.registry.findAddress(message.toAddressId) : null;
    const gate = address ? this.gate(address) : null;
    const sourceRunId = fields.find((f) => f.sourceRunId)?.sourceRunId ?? null;
    // 계획 교체(T-089) + 승인된 계획 판의 후속 문의인데 그 판이 더 이상 승인 상태가 아님(T-116 — OUTDATED · SUPERSEDED) → 같은 PLAN_SUPERSEDED
    const followUp = await this.approvals.findFollowUpPlan(messageId);
    const successorRunId = (sourceRunId ? await this.approvals.findSuccessorRun(sourceRunId) : null) ?? (followUp && followUp.status !== 'APPROVED' ? `plan:${followUp.planId}` : null);
    const approvals = await this.approvals.listForMessage(messageId);
    return { loaded, values, targetName, text, contentHashMatches, check, gate, sourceRunId, successorRunId, approvals };
  }

  async get(messageId: string): Promise<DraftDto> {
    const i = await this.inspect(messageId);
    const { message, thread, fields, questions } = i.loaded;
    const question = questions[0] ?? null;
    const run = i.sourceRunId ? await this.drafts.findRun(i.sourceRunId) : null;
    const asOf = this.clock.now();

    const blocked = approvalBlocks({
      status: message.currentStatus ?? '',
      contentPresent: i.text !== null,
      contentHashMatches: i.contentHashMatches,
      numberCheckPassed: i.check?.passed ?? false,
      recipientEligible: i.gate?.eligible ?? false,
      planSuperseded: i.successorRunId !== null,
      hasLiveApproval: liveApproval(i.approvals, asOf) !== null,
    });

    return {
      message: {
        message_id: message.messageId,
        thread_id: message.threadId,
        status: message.currentStatus as DraftDto['message']['status'],
        drafted_by: message.draftedBy as DraftDto['message']['drafted_by'],
        channel_type: message.channelType as DraftDto['message']['channel_type'],
        is_simulated: message.isSimulated,
        content_hash: message.contentHash,
        subject: i.text?.subject ?? null,
        body: i.text?.bodyText ?? null,
        created_at: Instant.fromDb(message.createdAt).toSeoulIso(),
      },
      thread: {
        thread_id: thread.threadId,
        purpose: thread.purpose as DraftDto['thread']['purpose'],
        thread_status: thread.threadStatus as DraftDto['thread']['thread_status'],
        counterparty_id: thread.counterpartyId,
        counterparty_name: i.loaded.counterpartyName,
        contact_id: thread.contactId,
        contact_name: i.loaded.contactName,
        address_id: message.toAddressId,
        normalized_address: i.loaded.normalizedAddress,
        related_run_id: thread.relatedRunId,
        opened_at: Instant.fromDb(thread.openedAt).toSeoulIso(),
      },
      question: question && {
        question_item_id: question.questionItemId,
        ask_id: question.askId,
        question_type: question.questionType,
        question_text: question.questionText,
        target_entity_type: question.targetEntityType,
        target_entity_id: question.targetEntityId,
        target_name: i.targetName,
        target_fact_key: question.targetFactKey,
        expected_value_type: question.expectedValueType,
        expected_unit: question.expectedUnit,
        question_status: question.questionStatus,
      },
      structured_values: fields.map(toValueDto),
      plan_based: i.sourceRunId !== null,
      source_run: run && { run_id: run.runId, trigger_ref: run.triggerRef, contains_simulated: run.containsSimulated },
      number_check: i.check && {
        status: i.check.status,
        passed: i.check.passed,
        tokens: i.check.tokens.map(toTokenDto),
        unmatched: i.check.unmatched.map(toTokenDto),
        not_mentioned: i.check.notMentioned,
      },
      contact_gate: i.gate && { eligible: i.gate.eligible, reasons: i.gate.reasons },
      approval_ready: blocked.length === 0,
      blocked_reasons: blocked,
      approval: await this.approvalView(i, asOf),
      revision: await this.revisionView(message.messageId, thread.threadId),
      dispatch: await this.dispatchView(i, asOf),
      replies: await this.inboundReads.forThread(thread.threadId),
    };
  }

  async list(): Promise<DraftListDto> {
    const ids = await this.drafts.listDraftIds(LIST_LIMIT);
    const drafts = [];
    for (const id of ids) drafts.push(await this.get(id));
    return { drafts };
  }

  async listRuns(): Promise<RunListDto> {
    const runs = await this.drafts.listRuns(LIST_LIMIT);
    return {
      runs: runs.map((r) => ({
        run_id: r.runId,
        trigger_ref: r.triggerRef,
        executed_at: Instant.fromDb(r.executedAt).toSeoulIso(),
        contains_simulated: r.containsSimulated,
        scenario_id: r.scenarioId,
        // T-132: 누가 이 실행을 시작했나 — 탐지기(AUTO_DETECTED) · 사람(MANUAL) · 합성 시나리오 시드(SCENARIO)
        source: r.exception || r.triggerRef?.startsWith('EXCEPTION:') ? ('AUTO_DETECTED' as const) : r.containsSimulated ? ('SCENARIO' as const) : ('MANUAL' as const),
        exception: r.exception
          ? { exception_id: r.exception.exceptionId, status: r.exception.status, basis: r.exception.basis, facility_id: r.exception.facilityId, facility_name: r.exception.facilityName, window_day: r.exception.windowDay, scheduled_demand: r.exception.scheduledDemand, capacity: r.exception.capacity, shortage: r.exception.shortage }
          : null,
      })),
    };
  }

  /** 내용 문서 저장(트랜잭션 밖) — 메시지 · 승인 사본이 같은 모양(JCS `{subject, body_text}`). */
  async storeText(category: 'COMM_MESSAGE_CONTENT' | 'MESSAGE_APPROVAL_CONTENT', text: MessageText): Promise<string> {
    const stored = await this.content.storeVerified(category, messageTextBytes(text), 'application/json');
    return stored.ref;
  }

  async readText(ref: string | null): Promise<MessageText | null> {
    if (!ref) return null;
    const bytes = await this.store.get(ref as Parameters<ContentStore['get']>[0]);
    if (bytes === ABSENT) return null;
    return parseMessageText(bytes);
  }

  async systemActor(): Promise<string> {
    const id = await this.drafts.findSystemActorId();
    if (!id) throw new SystemError('SYSTEM_ACTOR_MISSING', 'No active SYSTEM actor is registered');
    return id;
  }

  /**
   * 발송 판정(T-090) — 발송 요청 API(빠른 실패)와 Worker 의 시도 직전(최종 검사)이 **같은 이 함수**를 부른다.
   * 규칙은 순수 함수 `sendBlocks`(유효한 승인 여섯 조건 · 사본 온전 · 내용 온전 · Contact Gate · 계획 교체 · 채널) 하나다.
   * 통과하면 보낼 내용(`outbound`)을 **승인 사본에서** 만든다 — 화면 문자열을 다시 조합하지 않는다.
   */
  async sendCheck(i: DraftInspection, asOf: Instant): Promise<SendCheck> {
    const { message, thread } = i.loaded;
    const attempts = await this.sends.attempts(message.messageId);
    const live = liveApproval(i.approvals, asOf);
    const liveRecord = live ? (i.approvals.find((a) => a.approvalId === live.approvalId) ?? null) : null;
    const copy = liveRecord ? await this.approvalCopy(liveRecord) : null;
    const adapter = this.adapters.get(message.channelType as AdapterChannel) ?? null;
    const blocks = sendBlocks(
      {
        status: message.currentStatus ?? '',
        messageContentHash: message.contentHash,
        messageToAddressId: message.toAddressId,
        isSimulated: message.isSimulated,
        approvals: i.approvals,
        liveCopyVerified: copy?.verified ?? false,
        contentHashMatches: i.contentHashMatches,
        recipientEligible: i.gate?.eligible ?? false,
        planSuperseded: i.successorRunId !== null,
        hasSuccessfulAttempt: attempts.some((a) => a.result === 'SUCCESS'),
        adapter,
      },
      asOf,
    );
    let outbound: OutboundMessage | null = null;
    if (blocks.length === 0 && liveRecord && copy?.text && i.loaded.normalizedAddress) {
      outbound = {
        ceraMessageId: message.messageId,
        ceraThreadId: thread.threadId,
        externalThreadId: thread.externalThreadId,
        to: i.loaded.normalizedAddress,
        subject: copy.text.subject,
        bodyText: copy.text.bodyText,
        contentHash: liveRecord.approvedContentHash ?? '',
        isSimulated: message.isSimulated,
      };
    }
    return { blocks, live: liveRecord, attempts, adapter, outbound };
  }

  /** 화면의 발송 요약(docs/19 15.1 · FR-SND-11) — 내부 멱등 키 같은 기술 값은 내보내지 않는다. */
  private async dispatchView(i: DraftInspection, asOf: Instant): Promise<DraftDto['dispatch']> {
    const check = await this.sendCheck(i, asOf);
    const status = i.loaded.message.currentStatus ?? '';
    const transitions = await this.sends.transitions(i.loaded.message.messageId);
    const lastQueued = [...transitions].reverse().find((t) => t.status === 'QUEUED') ?? null;
    const last = transitions.at(-1);
    const beforeLast = transitions.at(-2);
    const dequeued = status === 'APPROVED' && last?.status === 'APPROVED' && beforeLast?.status === 'QUEUED' ? last.note : null;
    const lastAttempt = check.attempts.at(-1) ?? null;
    const state = dispatchState(status, check.attempts);
    const next = state === 'RETRY_WAIT' ? nextAttemptAt(check.attempts, this.retryBaseMs) : null;
    return {
      state,
      can_request_send: status === 'APPROVED' && check.blocks.length === 0,
      blocked_reasons: status === 'APPROVED' || status === 'QUEUED' ? check.blocks : [],
      queued_at: lastQueued ? lastQueued.occurredAt.toSeoulIso() : null,
      sent_at: i.loaded.message.sentAt ? Instant.fromDb(i.loaded.message.sentAt).toSeoulIso() : null,
      approval_id_used: lastAttempt?.approvalId ?? null,
      next_attempt_at: next ? next.toSeoulIso() : null,
      dequeued_reason: dequeued,
      sending_paused: this.sendingPaused,
      attempts: check.attempts.map((a) => ({
        attempt_no: a.attemptNo,
        started_at: a.startedAt.toSeoulIso(),
        finished_at: a.finishedAt?.toSeoulIso() ?? null,
        result: a.result,
        error_code: a.errorCode,
        reconciled: a.errorCode === RECONCILED_NOT_SENT || a.errorMessage === RECONCILED_FOUND,
      })),
    };
  }

  /**
   * 승인 사본(제목 · 본문 · 구조화 값) — 승인 순간 고정한 그대로. 다시 해시해 `approved_content_hash` 와 같으면 `verified`.
   * 화면 표시와 발송(T-090)이 같은 사본 · 같은 검증을 쓴다 — 발송 내용은 화면 문자열이 아니라 이 사본에서 만든다.
   */
  async approvalCopy(approval: ApprovalRecord) {
    const copies = await this.approvals.copiesFor(approval.approvalId);
    const text = await this.readText(approval.approvedContentRef);
    const fields: ContentField[] = copies.map((c) => ({
      fieldKey: c.fieldKey,
      valueText: c.approvedValueText,
      valueNumber: c.approvedValueNumber,
      unit: c.approvedUnit,
    }));
    const verified =
      text !== null &&
      approval.approvedToAddressId !== null &&
      messageContentHash({ toAddressId: approval.approvedToAddressId, text, fields }) === approval.approvedContentHash;
    return { copies, text, fields, verified };
  }

  /** 승인 축(docs/22 15.8.1) — 승인 행들로 지금 상태 · 사본 · 이력을 만든다. 사본은 다시 해시해 온전한지 본다. */
  private async approvalView(i: DraftInspection, asOf: Instant): Promise<DraftDto['approval']> {
    const summary = summarizeApprovals(i.approvals, asOf);
    const { message } = i.loaded;
    const latest = summary.latestApproved ? (i.approvals.find((a) => a.approvalId === summary.latestApproved?.approvalId) ?? null) : null;
    let current: ApprovalSnapshotDto | null = null;
    if (latest && summary.latestApprovedState) {
      const { copies, text: copyText, verified: copyVerified } = await this.approvalCopy(latest);
      current = {
        approval_id: latest.approvalId,
        state: summary.latestApprovedState,
        approver_actor_id: latest.actorId,
        approver_name: latest.actorName,
        decided_at: latest.decidedAt.toSeoulIso(),
        expires_at: latest.expiresAt?.toSeoulIso() ?? null,
        approved_content_hash: latest.approvedContentHash ?? '',
        approved_to_address_id: latest.approvedToAddressId ?? '',
        approved_plan_run_id: latest.approvedPlanRunId,
        subject: copyText?.subject ?? null,
        body: copyText?.bodyText ?? null,
        structured_values: copies.map((c) =>
          toValueDto({
            fieldKey: c.fieldKey,
            valueNumber: c.approvedValueNumber,
            valueText: c.approvedValueText,
            unit: c.approvedUnit,
            sourceRunId: c.approvedSourceRunId,
            sourcePath: c.approvedSourcePath,
          }),
        ),
        copy_verified: copyVerified,
      };
    }
    const endedBy = summary.invalidatedBy ? i.approvals.find((a) => a.approvalId === summary.invalidatedBy?.approvalId) : undefined;
    const rejection = summary.rejection ? i.approvals.find((a) => a.approvalId === summary.rejection?.approvalId) : undefined;
    return {
      state: summary.state,
      usable_for_send:
        latest !== null && current?.copy_verified === true && isUsableForSend(latest, i.approvals, { contentHash: message.contentHash, toAddressId: message.toAddressId }, asOf),
      current,
      ended_by: endedBy ? toDecisionDto(endedBy) : null,
      rejection: rejection ? toDecisionDto(rejection) : null,
      history: i.approvals.map(toDecisionDto),
    };
  }

  /** 수정 사슬 — 같은 스레드의 이전 · 다음 메시지. 이전 메시지의 승인을 이 수정이 무효화했으면 "내용 변경으로 재승인 필요". */
  private async revisionView(messageId: string, threadId: string): Promise<DraftDto['revision']> {
    const ids = await this.approvals.threadMessageIds(threadId);
    const at = ids.indexOf(messageId);
    const previous = at > 0 ? (ids[at - 1] ?? null) : null;
    const next = at >= 0 && at < ids.length - 1 ? (ids[at + 1] ?? null) : null;
    let invalidated: DraftDto['revision']['previous_approval_invalidated'] = null;
    if (previous) {
      const rows = await this.approvals.listForMessage(previous);
      if (rows.some((r) => r.decision === 'INVALIDATED' && r.invalidationCause === 'CONTENT_CHANGED')) invalidated = 'CONTENT_CHANGED';
    }
    return { previous_message_id: previous, next_message_id: next, previous_approval_invalidated: invalidated };
  }

  /**
   * 수정본의 구조화 값. 질문 대상을 정하는 값은 그대로여야 하고, 바뀐 값은 계획 출처를 잃는다(계획 숫자로 위장하지 않는다 —
   * docs/01 3절 · docs/03 2.6.1). 같은 값은 출처를 이어받는다.
   */
  private revisedFields(loaded: LoadedDraft, input: NonNullable<z.infer<typeof revisionSchema>['values']>, newId: string): FieldInsert[] {
    const intent = PURPOSE_INTENT[loaded.thread.purpose];
    if (!intent) throw new BusinessRuleError('VALUES_NOT_REVISABLE', `Values of a ${loaded.thread.purpose} inquiry cannot be revised`, 422);
    const values: StructuredValue[] = input.map((v) => ({
      key: v.key,
      valueNumber: v.value_number ?? null,
      valueText: v.value_text ?? null,
      unit: v.unit ?? null,
      sourcePath: null,
    }));
    assertIntentValues(intent, values);
    const before = new Map(loaded.fields.map((f) => [f.fieldKey, f]));
    for (const key of QUESTION_DEFINING_KEYS[intent]) {
      const old = before.get(key);
      const now = values.find((v) => v.key === key);
      if ((old?.valueText ?? null) !== (now?.valueText ?? null)) {
        throw new BusinessRuleError('QUESTION_TARGET_CHANGED', `"${key}" defines what is asked — create a new inquiry instead of revising this one`, 422);
      }
    }
    return values.map((v) => {
      const row = toFieldRow(newId, v, null);
      const old = before.get(v.key);
      if (old && sameValue(old, row)) {
        return { ...row, sourceRunId: old.sourceRunId ?? null, sourceQuestionItemId: old.sourceQuestionItemId ?? null, sourcePath: old.sourcePath ?? null };
      }
      return row;
    });
  }

  private async writeMessage(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    m: {
      messageId: string;
      threadId: string;
      address: { addressId: string; channelType: string };
      isSimulated: boolean;
      scenarioId: string | null;
      stored: { ref: string; contentHash: string };
      draftedBy: 'TEMPLATE' | 'AI_DRAFT' | 'HUMAN';
      fields: FieldInsert[];
      questionItemId: string;
      check: NumberCheckResult;
      actorId: string;
      now: string;
      submitForApproval?: boolean;
    },
  ): Promise<void> {
    await this.drafts.insertDraftMessage(
      tx,
      {
        messageId: m.messageId,
        threadId: m.threadId,
        direction: 'OUTBOUND',
        messageKind: 'BUSINESS',
        channelType: m.address.channelType,
        toAddressId: m.address.addressId,
        messageContentRef: m.stored.ref,
        contentHash: m.stored.contentHash,
        currentStatus: 'DRAFTED',
        draftedBy: m.draftedBy,
        createdAt: m.now,
        isSimulated: m.isSimulated,
        scenarioId: m.scenarioId,
      },
      m.fields,
      m.questionItemId,
      { id: this.ids.newId(), actorId: m.actorId, at: m.now },
    );
    // 숫자 검사를 통과한 초안만 승인 화면으로(FR-COM-07 · T-069 11.3). 실패하면 DRAFTED 에 머문다.
    // Agent 초안(submitForApproval = false)은 통과해도 DRAFTED — 승인 대기는 requestApproval 이 따로 올린다(T-103)
    if (m.check.passed && m.submitForApproval !== false) {
      await this.drafts.insertTransition(tx, {
        id: this.ids.newId(),
        messageId: m.messageId,
        status: 'PENDING_APPROVAL',
        actorId: m.actorId,
        at: m.now,
        isSimulated: m.isSimulated,
        note: 'number check passed',
      });
    }
  }

  gate(address: NonNullable<Awaited<ReturnType<RegistryReader['findAddress']>>>): GateResult {
    return evaluateContactGate(
      {
        counterparty: { isActive: address.counterpartyIsActive },
        contact: { isActive: address.contactIsActive },
        address: {
          channelType: address.channelType as ChannelType,
          normalizedAddress: address.normalizedAddress,
          emailVerificationStatus: address.emailVerificationStatus,
          relationshipStatus: address.relationshipStatus,
          communicationStatus: address.communicationStatus,
        },
      },
      this.safety,
    );
  }

  private async target(intent: InquiryIntent, targetId: string | null, counterpartyId: string): Promise<TargetRow> {
    if (intent === 'TRUCK_SLOT') {
      // 대상을 주지 않으면 그 운송사가 가진 트럭 풀(정확히 하나일 때만)을 Backend 가 정한다.
      if (!targetId) {
        const owned = await this.drafts.findOwnedTruckPools(counterpartyId);
        if (owned.length !== 1) {
          throw new BusinessRuleError('TARGET_REQUIRED', `target_id is required (${owned.length} active truck pools belong to this counterparty)`, 422);
        }
        return owned[0] as TargetRow;
      }
      const pool = await this.drafts.findTruckPool(targetId);
      if (!pool) throw new BusinessRuleError('TARGET_NOT_FOUND', 'No active truck pool with this id', 404);
      // 운송사에게는 그 운송사의 트럭만 묻는다
      if (pool.ownerCounterpartyId !== counterpartyId) {
        throw new BusinessRuleError('TARGET_COUNTERPARTY_MISMATCH', 'The truck pool does not belong to this counterparty', 422);
      }
      return pool;
    }
    if (!targetId) throw new ValidationError('TARGET_REQUIRED', 'target_id (facility) is required for a capacity inquiry', ['target_id']);
    const site = await this.drafts.findFacility(targetId);
    if (!site) throw new BusinessRuleError('TARGET_NOT_FOUND', 'No active facility with this id', 404);
    if (site.kind !== 'WAREHOUSE' && site.kind !== 'ODCY') {
      throw new BusinessRuleError('TARGET_NOT_SUPPORTED', 'Capacity inquiries are for warehouses and ODCYs', 422);
    }
    return site;
  }

  private async targetName(entityType: string | null, entityId: string | null): Promise<string> {
    if (!entityId) return '';
    if (entityType === 'TRUCK_POOL') return (await this.drafts.findTruckPool(entityId))?.name ?? '';
    if (entityType === 'FACILITY') return (await this.drafts.findFacility(entityId))?.name ?? '';
    return '';
  }
}

/** 숫자 검사가 보지 않는 고정 문구 — 템플릿과 같은 규칙으로 DB 행에서 다시 만든다(초안을 다시 읽을 때 같은 판정). */
export function draftLiterals(counterpartyName: string, contactName: string, targetName: string, askId: string, values: readonly StructuredValue[]): string[] {
  const textValues = values.filter((v) => v.valueText && !/^\d{4}-\d{2}-\d{2}$/.test(v.valueText) && !/^\d{2}:\d{2}$/.test(v.valueText));
  return [counterpartyName, contactName, targetName, askTag(askId), ...textValues.map((v) => v.valueText as string)];
}

function assertRevisable(status: string | null): void {
  if (!status || !REVISABLE.has(status)) {
    throw new BusinessRuleError('DRAFT_NOT_EDITABLE', `A ${status} message cannot be revised`, 409);
  }
}

function assertIntentValues(intent: InquiryIntent, values: readonly StructuredValue[]): void {
  const issues = validateIntentValues(intent, values);
  if (issues.length > 0) {
    throw new ValidationError('INVALID_DRAFT_VALUES', `Invalid values: ${issues.map((i) => `${i.field} ${i.problem}`).join(', ')}`, issues.map((i) => i.field));
  }
}

function toFieldRow(messageId: string, v: StructuredValue, sourceRunId: string | null): FieldInsert {
  return {
    messageId,
    fieldKey: v.key,
    valueText: v.valueText,
    valueNumber: v.valueNumber === null ? null : String(v.valueNumber),
    unit: v.unit,
    sourceRunId,
    sourcePath: v.sourcePath,
  };
}

function fromFieldRow(f: FieldInsert): StructuredValue {
  return {
    key: f.fieldKey,
    valueNumber: f.valueNumber === null || f.valueNumber === undefined ? null : Number(f.valueNumber),
    valueText: f.valueText ?? null,
    unit: f.unit ?? null,
    sourcePath: f.sourcePath ?? null,
  };
}

function toContentField(f: FieldInsert): ContentField {
  return { fieldKey: f.fieldKey, valueText: f.valueText ?? null, valueNumber: f.valueNumber ?? null, unit: f.unit ?? null };
}

function sameValue(a: FieldInsert, b: FieldInsert): boolean {
  const num = (v: string | null | undefined) => (v === null || v === undefined ? null : canonicalDecimal(v));
  return (a.valueText ?? null) === (b.valueText ?? null) && num(a.valueNumber) === num(b.valueNumber) && (a.unit ?? null) === (b.unit ?? null);
}

function toValueDto(f: {
  fieldKey: string;
  valueNumber?: string | null;
  valueText?: string | null;
  unit?: string | null;
  sourceRunId?: string | null;
  sourcePath?: string | null;
}): StructuredValueDto {
  return {
    key: f.fieldKey,
    value_number: f.valueNumber === null || f.valueNumber === undefined ? null : canonicalDecimal(f.valueNumber),
    value_text: f.valueText ?? null,
    unit: f.unit ?? null,
    source_run_id: f.sourceRunId ?? null,
    source_path: f.sourcePath ?? null,
  };
}

function toDecisionDto(a: ApprovalRecord): ApprovalDecisionDto {
  return {
    approval_id: a.approvalId,
    decision: a.decision,
    invalidation_cause: a.invalidationCause,
    invalidates_approval_id: a.invalidatesApprovalId,
    actor_name: a.actorName,
    actor_type: a.actorType,
    decided_at: a.decidedAt.toSeoulIso(),
    reason: a.reason,
  };
}

function toTokenDto(t: { text: string; kind: string; matchedField: string | null }) {
  return { text: t.text, kind: t.kind as 'DATE' | 'TIME' | 'MONEY' | 'QUANTITY', matched_field: t.matchedField };
}

export function assertUuid(value: string, field: string): void {
  if (!uuid.safeParse(value).success) throw new ValidationError('INVALID_ID', `${field} must be a UUID`, [field]);
}

export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.') || '(body)');
    throw new ValidationError('INVALID_DRAFT_REQUEST', `Invalid request: ${fields.join(', ')}`, fields);
  }
  return result.data;
}
