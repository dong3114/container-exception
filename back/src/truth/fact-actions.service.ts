import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ContentService } from '../content/content-service.js';
import type { DbTransaction } from '../db/database.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { EventWriter, eventIdempotencyKey } from '../persistence/event-writer.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { canonicalJson } from '../shared/hash/hash.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import type { Role } from './reconcile-rules.js';
import { type Coordinate, TruthRepository } from './truth.repository.js';
import { type FactCoordinateView, TruthService } from './truth.service.js';

/** 사람 명령 헤더 — 인증이 생기기 전 개발용(승인 API 와 같은 방식). 서버가 활성 HUMAN actor 인지 확인한다. */
export const FACT_ACTOR_HEADER = 'x-cera-actor-id';
export const FACT_COMMAND_SOURCE = 'cera-ui';

/** 거절 · 정정 사유 코드 — 늘리지 않는다(분석용 분류). 자유 문장은 note(짧게). */
export const REJECT_REASONS = ['MODEL_MISREAD', 'CONDITIONAL_ANSWER', 'OUTDATED_REPLY', 'WRONG_SENDER_CONTEXT', 'WRONG_UNIT', 'CONFLICTING_EVIDENCE', 'OPERATOR_CORRECTION'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

const uuid = z.string().uuid();
const note = z.string().trim().max(200).optional();
const commandId = uuid.optional();
const confirmSchema = z.object({ command_id: commandId, note }).strict();
const rejectSchema = z.object({ command_id: commandId, reason_code: z.enum(REJECT_REASONS), note }).strict();
const correctSchema = z
  .object({ command_id: commandId, value: z.number().int().min(0).max(999_999), reason_code: z.enum(REJECT_REASONS), note })
  .strict();

type Action = 'CONFIRM' | 'REJECT' | 'CORRECT';

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.') || '(body)');
    throw new ValidationError('INVALID_FACT_REQUEST', `Invalid request: ${fields.join(', ')}`, fields);
  }
  return result.data;
}

const NOT_FOUND = () => new BusinessRuleError('EVENT_NOT_FOUND', 'No fact event with this id', 404);

/**
 * 사람의 확인 · 거절 · 정정(T-093 · docs/05 11.3). 모두 **새 사건**이다 — 기존 사건을 고치지 않는다(append-only).
 *
 *   확인 → VERIFICATION(CONFIRM)        후보가 CONFIRMED 가 된다 (HUMAN_VERIFICATION 근거)
 *   거절 → VERIFICATION(REJECT)         후보가 판정에서 빠진다
 *   정정 → CORRECTION(supersedes 대상)   대상은 SUPERSEDED, 사람이 입력한 새 값이 CONFIRMED (HUMAN_UI 직접 입력)
 *
 * 행위자는 활성 HUMAN actor 뿐이다 — AI · Agent · 시스템은 CONFIRMED 를 만들 수 없다(서비스 검사 + M20 DB 가드).
 */
@Injectable()
export class FactActionService {
  constructor(
    @Inject(TruthRepository) private readonly repo: TruthRepository,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(EventWriter) private readonly events: EventWriter,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
  ) {}

  confirm(eventId: string, actorHeader: string | undefined, body: unknown): Promise<FactCoordinateView> {
    const req = parse(confirmSchema, body);
    return this.act('CONFIRM', eventId, actorHeader, req.command_id, { note: req.note });
  }

  reject(eventId: string, actorHeader: string | undefined, body: unknown): Promise<FactCoordinateView> {
    const req = parse(rejectSchema, body);
    return this.act('REJECT', eventId, actorHeader, req.command_id, { reason_code: req.reason_code, note: req.note });
  }

  correct(eventId: string, actorHeader: string | undefined, body: unknown): Promise<FactCoordinateView> {
    const req = parse(correctSchema, body);
    return this.act('CORRECT', eventId, actorHeader, req.command_id, { reason_code: req.reason_code, note: req.note, value: req.value });
  }

  private async resolveHuman(actorHeader: string | undefined): Promise<string> {
    if (!actorHeader) throw new ValidationError('ACTOR_REQUIRED', 'X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    if (!uuid.safeParse(actorHeader).success) throw new ValidationError('INVALID_ID', 'X-CERA-Actor-Id must be a UUID', ['x-cera-actor-id']);
    const human = await this.repo.activeHuman(actorHeader);
    if (!human) throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can confirm, reject or correct a fact', 403);
    return human.actorId;
  }

  private async act(action: Action, eventId: string, actorHeader: string | undefined, commandIdIn: string | undefined, detail: { reason_code?: RejectReason; note?: string; value?: number }): Promise<FactCoordinateView> {
    if (!uuid.safeParse(eventId).success) throw new ValidationError('INVALID_ID', 'eventId must be a UUID', ['eventId']);
    const humanId = await this.resolveHuman(actorHeader);
    const target = await this.repo.eventById(eventId);
    if (!target || (target.eventClass !== 'OBSERVATION' && target.eventClass !== 'CORRECTION') || !target.factKey) throw NOT_FOUND();
    const coordinate: Coordinate = { entityType: target.subjectType, entityId: target.subjectId, factKey: target.factKey, scopeType: target.applicabilityScopeType, scopeRef: target.applicabilityScopeRef, isSimulated: target.isSimulated };

    // 사람 명령의 원본 사본(내용 저장소) — 트랜잭션 밖. 같은 명령 id 의 재시도는 같은 raw_input 한 행으로 모인다
    const commandIdValue = commandIdIn ?? this.ids.newId();
    const payload = new TextEncoder().encode(canonicalJson({ k: 'fact-command', v: 1, command: action, command_id: commandIdValue, target_event_id: eventId, reason_code: detail.reason_code ?? null, note: detail.note ?? null, value: detail.value ?? null }));
    const stored = await this.content.storeVerified('RAW_INPUT_PAYLOAD', payload, 'application/json');
    const now = this.clock.now();

    const changed = await this.tx.run(async (tx) => {
      await this.repo.lockCoordinate(tx, coordinate);
      const current = this.truth.evaluate(await this.repo.coordinateData(coordinate, tx), now);
      const role: Role | undefined = current.result.roles.get(eventId);
      const verification = current.result.scored.find((s) => s.eventId === eventId)?.verification;
      if (!role) throw NOT_FOUND();

      // 이미 원하는 상태면 새 사건을 만들지 않는다(멱등) — 같은 버튼을 두 번 눌러도 사건 하나
      if (action === 'CONFIRM' && verification === 'CONFIRMED') return false; // 사람이 입력한 값 · 이미 확인한 값
      if (action === 'REJECT' && role === 'REJECTED') return false;
      if (role === 'SUPERSEDED') throw new BusinessRuleError('EVENT_SUPERSEDED', 'This value was already replaced by a correction — act on the newer one', 409);
      if (action !== 'REJECT' && role === 'REJECTED') throw new BusinessRuleError('ALREADY_REJECTED', 'This candidate was rejected', 409);
      if (action === 'CORRECT') {
        if (target.valueNumber !== null && Number(target.valueNumber) === detail.value) throw new BusinessRuleError('VALUE_UNCHANGED', 'The corrected value equals the current value — confirm it instead', 422);
        if (target.valueNumber === null) throw new BusinessRuleError('NOT_CORRECTABLE', 'A withdrawn value cannot be corrected', 422);
      }

      const rawInputId = this.ids.newId();
      const rawCreated = await this.events.insertRawInput(tx, {
        rawInputId,
        sourceType: 'HUMAN_UI',
        sourceName: FACT_COMMAND_SOURCE,
        sourceRecordKey: commandIdValue,
        payloadRef: stored.ref,
        payloadHash: stored.sha256,
        receivedAt: now.toDb(),
        collectedByActorId: humanId,
        isSimulated: target.isSimulated,
      });
      if (!rawCreated) return false; // 같은 명령의 재시도 — 이미 처리됨

      const base = {
        schemaVersion: 'ev-1',
        rawInputId,
        applicabilityScopeType: target.applicabilityScopeType,
        applicabilityScopeRef: target.applicabilityScopeRef,
        receivedAt: now.toDb(),
        sourceType: 'HUMAN_UI',
        sourceRoleAtIngestion: 'OPERATOR',
        extractionMethod: 'DIRECT',
        inputQuality: 'STRUCTURED',
        inputConfidenceLevel: 'HIGH',
        enteredByActorId: humanId,
        correlationId: null,
        recordedAt: now.toDb(),
        isSimulated: target.isSimulated,
        scenarioId: target.scenarioId,
      } as const;
      const newEventId = this.ids.newId();
      const subject = { entityType: target.subjectType, entityId: target.subjectId };
      const scope = { type: target.applicabilityScopeType, ref: target.applicabilityScopeRef };

      if (action === 'CORRECT') {
        const key = eventIdempotencyKey({ rawInputId, claimLocator: '/', subject, factKey: target.factKey, targets: null, scope, eventClass: 'CORRECTION' });
        await this.repo.insertEvent(tx, {
          ...base,
          eventId: newEventId,
          eventClass: 'CORRECTION',
          eventType: 'CORRECTION',
          factKind: target.factKind,
          factKey: target.factKey,
          valueNumber: String(detail.value),
          valueUnit: target.valueUnit,
          // 정정은 대상의 근거 시각 · 적용 시간을 이어받는다("그때의 값이 사실은 이것" — docs/05 10절)
          validFrom: target.validFrom,
          validUntil: target.validUntil,
          sourceEventTime: target.sourceEventTime,
          sourceRecordedAt: target.sourceRecordedAt,
          supersedesEventId: eventId,
          supersedeReason: detail.reason_code ?? null,
          idempotencyKey: key,
          payload: { claim_locator: '/', authority: 'S', correction_reason: detail.reason_code, note: detail.note ?? null, corrected_event_id: eventId },
        });
        await this.repo.insertLinks(tx, [{ eventId: newEventId, entityType: subject.entityType, entityId: subject.entityId, linkRole: 'SUBJECT' }]);
        await this.audit.record(tx, { actorId: humanId, action: AUDIT_ACTION.FACT_CORRECTED, targetType: 'EVENT', targetId: newEventId, result: 'SUCCESS', isSimulated: target.isSimulated });
      } else {
        const key = eventIdempotencyKey({ rawInputId, claimLocator: '/', subject, factKey: null, targets: [eventId], scope, eventClass: 'VERIFICATION' });
        await this.repo.insertEvent(tx, {
          ...base,
          eventId: newEventId,
          eventClass: 'VERIFICATION',
          eventType: 'VERIFICATION_RECORDED',
          verificationAction: action,
          verificationMethod: 'DIRECT_REVIEW',
          idempotencyKey: key,
          payload: { claim_locator: '/', authority: 'S', target_event_id: eventId, reason_code: detail.reason_code ?? null, note: detail.note ?? null },
        });
        await this.repo.insertLinks(tx, [{ eventId: newEventId, entityType: subject.entityType, entityId: subject.entityId, linkRole: 'SUBJECT' }]);
        await this.repo.insertVerificationTargets(tx, [{ verificationEventId: newEventId, targetEventId: eventId, targetRole: 'TARGET' }]);
        await this.audit.record(tx, { actorId: humanId, action: action === 'CONFIRM' ? AUDIT_ACTION.FACT_CONFIRMED : AUDIT_ACTION.FACT_REJECTED, targetType: 'EVENT', targetId: newEventId, result: 'SUCCESS', isSimulated: target.isSimulated });
      }
      await this.truth.materialize(tx as DbTransaction, coordinate);
      return true;
    });

    if (changed) this.signals.emit({ type: 'FACT_CHANGED', entityId: coordinate.entityId, factKey: coordinate.factKey });
    const [view] = await this.truth.view([await this.truth.liveForCoordinate(coordinate)]);
    return view as FactCoordinateView;
  }
}
