import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ContentService } from '../content/content-service.js';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../content/content-store.js';
import { TransactionRunner } from '../db/transaction.js';
import { RegistryReader } from '../persistence/registry-reader.js';
import { type ChannelType, type DevSafetyPolicy, type GateResult, evaluateContactGate } from '../registry/contact-gate.js';
import { BusinessRuleError, SystemError, ValidationError } from '../shared/errors/cera-error.js';
import { sha256Bytes } from '../shared/hash/hash.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { type DraftProse, TemplateDraftProse, askTag } from './draft-prose.js';
import { DraftRepository, type FieldInsert, type RunRow, type TargetRow } from './draft.repository.js';
import type { DraftDto, DraftListDto, RunListDto } from './dto.js';
import { INQUIRY_INTENTS, INTENTS, type InquiryIntent, type StructuredValue, targetFactKey, validateIntentValues } from './inquiry-intents.js';
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
const revisionSchema = z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(4000) }).strict();

const ASK_ID = 'Q1';
const LIST_LIMIT = 20;

/**
 * 문의 초안 만들기(T-088 U3 · T-069 `CreateInquiryDraft` · docs/19 FR-COM-04~13).
 *
 * 순서: Contact Gate → 값 형식 · 출처 확인 → 문장(템플릿 포트) → 숫자 검사(순수) → 내용 저장(트랜잭션 밖 —
 * 외부 I/O) → **한 트랜잭션**: 스레드 · 질문 · 메시지 · 구조화 값 · 상태 전이. 숫자 검사를 통과한 초안만
 * `PENDING_APPROVAL`(승인 화면에 올라갈 수 있음), 실패하면 `DRAFTED` 에 머문다(`BLOCKED_NUMBER_CHECK`).
 *
 * Contact Gate 는 여기서 한 번 통과했다고 끝이 아니다 — U4 승인 시점 · U5 발송 직전에 다시 부른다(FR-ELG-03).
 * 상태는 모두 DB 에 있다. 이 서비스는 요청 사이에 아무것도 기억하지 않는다(LB 뒤 여러 인스턴스 가능).
 */
@Injectable()
export class DraftService {
  private readonly prose: DraftProse = new TemplateDraftProse();
  private readonly safety: DevSafetyPolicy;

  constructor(
    @Inject(DraftRepository) private readonly drafts: DraftRepository,
    @Inject(RegistryReader) private readonly registry: RegistryReader,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(CONTENT_STORE) private readonly store: ContentStore,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(ENV) env: Env,
  ) {
    this.safety = { appEnv: env.APP_ENV, allowlist: env.CERA_TEST_RECIPIENT_ALLOWLIST };
  }

  async create(body: unknown): Promise<DraftDto> {
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
    const issues = validateIntentValues(req.intent, values);
    if (issues.length > 0) {
      throw new ValidationError('INVALID_DRAFT_VALUES', `Invalid values: ${issues.map((i) => `${i.field} ${i.problem}`).join(', ')}`, issues.map((i) => i.field));
    }
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

    // 6. 내용 저장(트랜잭션 밖). 4단계(참조 + 지문을 행에 넣기)가 실패하면 고아 내용만 남는다(docs/24 16.2).
    const stored = await this.storeContent(text.subject, text.body);

    // 7. 한 트랜잭션
    const now = this.clock.now().toDb();
    const actorId = await this.systemActor();
    const threadId = this.ids.newId();
    const questionItemId = this.ids.newId();
    const messageId = this.ids.newId();
    const sourceRunId = run?.runId ?? null;
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
        stored,
        draftedBy: this.prose.draftedBy,
        fields: values.map((v) => toFieldRow(messageId, v, v.sourcePath ? sourceRunId : null)),
        questionItemId,
        check,
        actorId,
        now,
      });
    });
    return this.get(messageId);
  }

  /**
   * 사람이 고친 본문(FR-COM-12). **새 메시지**를 만든다(내용 불변) — 구조화 값 · 질문 연결은 그대로 옮기고 숫자 검사를 다시 한다.
   * 이전 초안은 `CLOSED`(대체됨). 승인 · 발송 단계로 넘어간 메시지는 고칠 수 없다.
   */
  async revise(messageId: string, body: unknown): Promise<DraftDto> {
    assertUuid(messageId, 'messageId');
    const req = parse(revisionSchema, body);
    const loaded = await this.drafts.loadDraft(messageId);
    if (!loaded) throw new BusinessRuleError('DRAFT_NOT_FOUND', 'No outbound draft with this id', 404);
    const status = loaded.message.currentStatus;
    if (status !== 'DRAFTED' && status !== 'PENDING_APPROVAL') {
      throw new BusinessRuleError('DRAFT_NOT_EDITABLE', `A ${status} message cannot be revised`, 409);
    }
    const addressId = loaded.message.toAddressId;
    const address = addressId ? await this.registry.findAddress(addressId) : null;
    if (!address) throw new SystemError('DRAFT_ADDRESS_MISSING', 'The draft has no registry address');
    const gate = this.gate(address);
    if (!gate.eligible) {
      throw new BusinessRuleError('RECIPIENT_NOT_ELIGIBLE', `Recipient is not eligible: ${gate.reasons.map((r) => r.code).join(', ')}`, 403);
    }
    const question = loaded.questions[0];
    if (!question) throw new SystemError('DRAFT_QUESTION_MISSING', 'The draft has no question item');
    const values = loaded.fields.map(fromFieldRow);
    const target = await this.targetName(question.targetEntityType, question.targetEntityId);
    const literals = draftLiterals(address.counterpartyName, address.personName, target, question.askId, values);
    const check = checkDraftNumbers({ texts: [req.subject, req.body], fields: values, literals });
    const stored = await this.storeContent(req.subject, req.body);

    const now = this.clock.now().toDb();
    const actorId = await this.systemActor();
    const newId = this.ids.newId();
    await this.tx.run(async (tx) => {
      await this.writeMessage(tx, {
        messageId: newId,
        threadId: loaded.thread.threadId,
        address,
        isSimulated: loaded.message.isSimulated,
        scenarioId: loaded.message.scenarioId,
        stored,
        draftedBy: 'HUMAN',
        fields: loaded.fields.map((f) => ({ ...f, messageId: newId })),
        questionItemId: question.questionItemId,
        check,
        actorId,
        now,
      });
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

  async get(messageId: string): Promise<DraftDto> {
    assertUuid(messageId, 'messageId');
    const loaded = await this.drafts.loadDraft(messageId);
    if (!loaded) throw new BusinessRuleError('DRAFT_NOT_FOUND', 'No outbound draft with this id', 404);
    const { message, thread, fields, questions } = loaded;
    const values = fields.map(fromFieldRow);
    const question = questions[0] ?? null;
    const targetName = question ? await this.targetName(question.targetEntityType, question.targetEntityId) : '';
    const contentText = await this.readContent(message.messageContentRef);
    const literals = draftLiterals(loaded.counterpartyName, loaded.contactName ?? '', targetName, question?.askId ?? ASK_ID, values);
    const check = contentText ? checkDraftNumbers({ texts: [contentText.subject, contentText.body], fields: values, literals }) : null;
    const address = message.toAddressId ? await this.registry.findAddress(message.toAddressId) : null;
    const gate = address ? this.gate(address) : null;
    const sourceRunId = fields.find((f) => f.sourceRunId)?.sourceRunId ?? null;
    const run = sourceRunId ? await this.drafts.findRun(sourceRunId) : null;

    const blocked: DraftDto['blocked_reasons'] = [];
    if (!check) blocked.push('CONTENT_MISSING');
    else if (!check.passed) blocked.push('BLOCKED_NUMBER_CHECK');
    if (gate && !gate.eligible) blocked.push('RECIPIENT_NOT_ELIGIBLE');
    if (message.currentStatus !== 'PENDING_APPROVAL') blocked.push('NOT_PENDING_APPROVAL');

    return {
      message: {
        message_id: message.messageId,
        thread_id: message.threadId,
        status: message.currentStatus as DraftDto['message']['status'],
        drafted_by: message.draftedBy as DraftDto['message']['drafted_by'],
        channel_type: message.channelType as DraftDto['message']['channel_type'],
        is_simulated: message.isSimulated,
        content_hash: message.contentHash,
        subject: contentText?.subject ?? null,
        body: contentText?.body ?? null,
        created_at: Instant.fromDb(message.createdAt).toSeoulIso(),
      },
      thread: {
        thread_id: thread.threadId,
        purpose: thread.purpose as DraftDto['thread']['purpose'],
        thread_status: thread.threadStatus as DraftDto['thread']['thread_status'],
        counterparty_id: thread.counterpartyId,
        counterparty_name: loaded.counterpartyName,
        contact_id: thread.contactId,
        contact_name: loaded.contactName,
        address_id: message.toAddressId,
        normalized_address: loaded.normalizedAddress,
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
        target_name: targetName,
        target_fact_key: question.targetFactKey,
        expected_value_type: question.expectedValueType,
        expected_unit: question.expectedUnit,
        question_status: question.questionStatus,
      },
      structured_values: fields.map((f) => ({
        key: f.fieldKey,
        value_number: f.valueNumber === null ? null : normalizeDecimal(f.valueNumber),
        value_text: f.valueText,
        unit: f.unit,
        source_run_id: f.sourceRunId,
        source_path: f.sourcePath,
      })),
      plan_based: sourceRunId !== null,
      source_run: run && { run_id: run.runId, trigger_ref: run.triggerRef, contains_simulated: run.containsSimulated },
      number_check: check && {
        status: check.status,
        passed: check.passed,
        tokens: check.tokens.map(toTokenDto),
        unmatched: check.unmatched.map(toTokenDto),
        not_mentioned: check.notMentioned,
      },
      contact_gate: gate && { eligible: gate.eligible, reasons: gate.reasons },
      approval_ready: blocked.length === 0,
      blocked_reasons: blocked,
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
      })),
    };
  }

  private async writeMessage(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    m: {
      messageId: string;
      threadId: string;
      address: { addressId: string; channelType: string };
      isSimulated: boolean;
      scenarioId: string | null;
      stored: { ref: string; sha256: string };
      draftedBy: 'TEMPLATE' | 'AI_DRAFT' | 'HUMAN';
      fields: FieldInsert[];
      questionItemId: string;
      check: NumberCheckResult;
      actorId: string;
      now: string;
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
        contentHash: m.stored.sha256,
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
    if (m.check.passed) {
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

  private gate(address: NonNullable<Awaited<ReturnType<RegistryReader['findAddress']>>>): GateResult {
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

  private async systemActor(): Promise<string> {
    const id = await this.drafts.findSystemActorId();
    if (!id) throw new SystemError('SYSTEM_ACTOR_MISSING', 'No active SYSTEM actor is registered');
    return id;
  }

  private async storeContent(subject: string, body: string): Promise<{ ref: string; sha256: string }> {
    const bytes = new TextEncoder().encode(JSON.stringify({ subject, body }));
    const stored = await this.content.storeVerified('COMM_MESSAGE_CONTENT', bytes, 'application/json');
    return { ref: stored.ref, sha256: sha256Bytes(bytes) };
  }

  private async readContent(ref: string | null): Promise<{ subject: string; body: string } | null> {
    if (!ref) return null;
    const bytes = await this.store.get(ref as Parameters<ContentStore['get']>[0]);
    if (bytes === ABSENT) return null;
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { subject?: unknown; body?: unknown };
    return typeof parsed.subject === 'string' && typeof parsed.body === 'string' ? { subject: parsed.subject, body: parsed.body } : null;
  }
}

/** 숫자 검사가 보지 않는 고정 문구 — 템플릿과 같은 규칙으로 DB 행에서 다시 만든다(초안을 다시 읽을 때 같은 판정). */
export function draftLiterals(counterpartyName: string, contactName: string, targetName: string, askId: string, values: readonly StructuredValue[]): string[] {
  const textValues = values.filter((v) => v.valueText && !/^\d{4}-\d{2}-\d{2}$/.test(v.valueText) && !/^\d{2}:\d{2}$/.test(v.valueText));
  return [counterpartyName, contactName, targetName, askTag(askId), ...textValues.map((v) => v.valueText as string)];
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

function normalizeDecimal(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

function toTokenDto(t: { text: string; kind: string; matchedField: string | null }) {
  return { text: t.text, kind: t.kind as 'DATE' | 'TIME' | 'MONEY' | 'QUANTITY', matched_field: t.matchedField };
}

function assertUuid(value: string, field: string): void {
  if (!uuid.safeParse(value).success) throw new ValidationError('INVALID_ID', `${field} must be a UUID`, [field]);
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.') || '(body)');
    throw new ValidationError('INVALID_DRAFT_REQUEST', `Invalid request: ${fields.join(', ')}`, fields);
  }
  return result.data;
}
