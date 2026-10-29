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
import { type InquiryIntent, type StructuredValue, targetFactKey } from '../communication/inquiry-intents.js';
import { Instant } from '../shared/time/instant.js';
import { nextDate, seoulToUtcIso } from './promotion-rules.js';
import type { Role } from './reconcile-rules.js';
import { type Coordinate, TruthRepository } from './truth.repository.js';
import { type FactCoordinateView, TruthService } from './truth.service.js';
import { CorroborationService } from './corroboration.service.js';

/** 사람 명령 헤더 — 인증이 생기기 전 개발용(승인 API 와 같은 방식). 서버가 활성 HUMAN actor 인지 확인한다. */
export const FACT_ACTOR_HEADER = 'x-cera-actor-id';
export const FACT_COMMAND_SOURCE = 'cera-ui';

/** 거절 · 정정 사유 코드 — 늘리지 않는다(분석용 분류). 자유 문장은 note(짧게). */
export const REJECT_REASONS = ['MODEL_MISREAD', 'CONDITIONAL_ANSWER', 'OUTDATED_REPLY', 'WRONG_SENDER_CONTEXT', 'WRONG_UNIT', 'CONFLICTING_EVIDENCE', 'OPERATOR_CORRECTION'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];
/** 철회 사유(T-111) — 세분화하지 않는다: 상대가 말을 거둠 · 운영자가 무효화 · 운영 상황이 바뀌어 더는 유효하지 않음(새 값 없음) */
export const REVOKE_REASONS = ['SOURCE_WITHDREW', 'OPERATOR_INVALIDATED', 'OUTDATED_OPERATIONAL_STATE'] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];
export const MANUAL_ENTRY_INTENT = 'OPERATOR_DIRECT_ENTRY';

const uuid = z.string().uuid();
const note = z.string().trim().max(200).optional();
const commandId = uuid.optional();
const confirmSchema = z.object({ command_id: commandId, note }).strict();
const rejectSchema = z.object({ command_id: commandId, reason_code: z.enum(REJECT_REASONS), note }).strict();
const correctSchema = z
  .object({ command_id: commandId, value: z.number().int().min(0).max(999_999), reason_code: z.enum(REJECT_REASONS), note })
  .strict();
const revokeSchema = z.object({ command_id: commandId, reason_code: z.enum(REVOKE_REASONS), note }).strict();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const manualSchema = z
  .object({
    command_id: commandId,
    // 일반 AI · Agent 흐름과 섞이지 않게 "운영자가 직접 사실을 입력한다"는 의도를 명시해야 한다
    intent: z.literal(MANUAL_ENTRY_INTENT),
    kind: z.enum(['TRUCK_SLOT', 'FACILITY_CAPACITY']),
    target_id: uuid,
    date: z.string().regex(DATE),
    window_from: z.string().regex(TIME).optional(),
    window_to: z.string().regex(TIME).optional(),
    size_type: z.string().regex(/^[0-9]{2}[A-Z]{2,4}$/).optional(),
    value: z.number().int().min(0).max(999_999),
    // 어디서 확인했나(전화 · 방문 · 메신저 …) — 출처 없는 사람 입력은 받지 않는다
    source_note: z.string().trim().min(1).max(200),
    // 상대가 그 말을 한 시각(+09:00 등 오프셋 필수). 없으면 입력 시각
    observed_at: z.string().optional(),
    scenario_id: uuid.optional(),
  })
  .strict()
  .refine((b) => b.kind !== 'TRUCK_SLOT' || (b.window_from !== undefined && b.window_to !== undefined && b.window_from < b.window_to), { message: 'TRUCK_SLOT needs window_from < window_to', path: ['window_from'] });

/**
 * T-136 업체 진술(사람이 전달) — 전화 · 메신저로 업체(선사 · 터미널 · 운송사)가 공공데이터로 확인할 수 있는 사실(선박 입항 일시)을 말했을 때,
 * 운영자가 "업체가 이렇게 말했다"를 그대로 남긴다. 운영자의 확인이 아니다(권한 W → 강도 1 → 임시). 공공 근거 교차 확인(Corroboration)의 주장이 된다.
 */
const partnerStatementSchema = z
  .object({
    command_id: commandId,
    intent: z.literal('PARTNER_STATEMENT'),
    vessel_call_id: uuid,
    // 업체가 말한 입항(신고) 일시 — 오프셋 필수(+09:00)
    arrival_at: z.string().min(16).max(40),
    // 누가 · 어떻게 말했나(예: "K해운 배차 담당 전화") — 출처 없는 진술은 받지 않는다
    source_note: z.string().trim().min(1).max(200),
    observed_at: z.string().optional(),
  })
  .strict();

type Action = 'CONFIRM' | 'REJECT' | 'CORRECT' | 'REVOKE';

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.') || '(body)');
    throw new ValidationError('INVALID_FACT_REQUEST', `Invalid request: ${fields.join(', ')}`, fields);
  }
  return result.data;
}

/** 응답 판정 기준 시각(선택) — 화면은 목록이 쓴 `evaluated_at` 을 넘긴다(시뮬레이션 사실은 시나리오 시각). 사건의 기록 시각과는 무관하다 */
function parseAsOf(asOf: string | undefined): Instant | null {
  if (asOf === undefined || asOf === '') return null;
  try {
    return Instant.parseIso(asOf);
  } catch {
    throw new ValidationError('INVALID_AS_OF', 'as_of must be ISO 8601 with an offset', ['as_of']);
  }
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
    @Inject(CorroborationService) private readonly corroborations: CorroborationService,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(EventWriter) private readonly events: EventWriter,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
  ) {}

  confirm(eventId: string, actorHeader: string | undefined, body: unknown, asOf?: string): Promise<FactCoordinateView> {
    const req = parse(confirmSchema, body);
    return this.act('CONFIRM', eventId, actorHeader, req.command_id, { note: req.note }, asOf);
  }

  reject(eventId: string, actorHeader: string | undefined, body: unknown, asOf?: string): Promise<FactCoordinateView> {
    const req = parse(rejectSchema, body);
    return this.act('REJECT', eventId, actorHeader, req.command_id, { reason_code: req.reason_code, note: req.note }, asOf);
  }

  correct(eventId: string, actorHeader: string | undefined, body: unknown, asOf?: string): Promise<FactCoordinateView> {
    const req = parse(correctSchema, body);
    return this.act('CORRECT', eventId, actorHeader, req.command_id, { reason_code: req.reason_code, note: req.note, value: req.value }, asOf);
  }

  /** 철회(T-111): 이 값(과 그 시점까지의 값)은 더는 현재 사실이 아니다 — 새 값 없이. 기존 사건은 그대로 남는다(값 없는 CORRECTION). */
  revoke(eventId: string, actorHeader: string | undefined, body: unknown, asOf?: string): Promise<FactCoordinateView> {
    const req = parse(revokeSchema, body);
    return this.act('REVOKE', eventId, actorHeader, req.command_id, { reason_code: req.reason_code, note: req.note }, asOf);
  }

  /**
   * 운영자 직접 입력(T-111): AI 후보 없이 사람이 확인한 사실(전화 · 방문 등)을 넣는다. 사람의 직접 입력(HUMAN_UI)이라 바로 CONFIRMED 다 —
   * 대신 활성 HUMAN · 명시적 의도(`OPERATOR_DIRECT_ENTRY`) · 출처 메모 · 감사가 반드시 있다. 고칠 때는 정정(대체 + 새 사건)이다(UPDATE 없음).
   */
  /** T-136: 사람이 전달한 업체 진술(선박 입항 일시) — 임시 주장으로 남고, 공공 관측과 교차 확인된다. 사실을 확정하지 않는다 */
  async enterPartnerStatement(actorHeader: string | undefined, body: unknown): Promise<FactCoordinateView> {
    const req = parse(partnerStatementSchema, body);
    const humanId = await this.resolveHuman(actorHeader);
    const now = this.clock.now();
    let arrivalAt: Instant;
    let observedAt: Instant | null = null;
    try {
      arrivalAt = Instant.parseIso(req.arrival_at);
      if (req.observed_at !== undefined) observedAt = Instant.parseIso(req.observed_at);
    } catch {
      throw new ValidationError('INVALID_FACT_REQUEST', 'arrival_at / observed_at must be ISO 8601 with an offset', ['arrival_at']);
    }
    if (observedAt && observedAt.isAfter(now)) throw new ValidationError('INVALID_FACT_REQUEST', 'observed_at cannot be in the future', ['observed_at']);
    const commandIdValue = req.command_id ?? this.ids.newId();
    const call = await this.repo.vesselCall(req.vessel_call_id);
    if (!call) throw new BusinessRuleError('TARGET_NOT_FOUND', 'No vessel call with this id', 404);
    const coordinate: Coordinate = { entityType: 'VESSEL_CALL', entityId: call.id, factKey: 'declared_arrival', scopeType: 'GLOBAL', scopeRef: '', isSimulated: call.isSimulated };
    const payloadBytes = new TextEncoder().encode(canonicalJson({ k: 'fact-command', v: 1, command: 'PARTNER_STATEMENT', command_id: commandIdValue, vessel_call_id: call.id, arrival_at: arrivalAt.toIsoUtc(), source_note: req.source_note, observed_at: req.observed_at ?? null }));
    const stored = await this.content.storeVerified('RAW_INPUT_PAYLOAD', payloadBytes, 'application/json');
    const changed = await this.tx.run(async (tx) => {
      await this.repo.lockCoordinate(tx, coordinate);
      const rawInputId = this.ids.newId();
      const rawCreated = await this.events.insertRawInput(tx, { rawInputId, sourceType: 'HUMAN_UI', sourceName: FACT_COMMAND_SOURCE, sourceRecordKey: commandIdValue, payloadRef: stored.ref, payloadHash: stored.sha256, receivedAt: now.toDb(), collectedByActorId: humanId, isSimulated: call.isSimulated });
      if (!rawCreated) return false;
      const eventId = this.ids.newId();
      const subject = { entityType: 'VESSEL_CALL', entityId: call.id };
      await this.repo.insertEvent(tx, {
        eventId,
        schemaVersion: 'ev-1',
        rawInputId,
        eventClass: 'OBSERVATION',
        eventType: 'ARRIVAL_DECLARED',
        factKind: 'STATE',
        factKey: 'declared_arrival',
        valueTimestamp: arrivalAt.toDb(),
        applicabilityScopeType: 'GLOBAL',
        applicabilityScopeRef: '',
        sourceEventTime: observedAt ? observedAt.toDb() : null,
        receivedAt: now.toDb(),
        sourceType: 'HUMAN_UI',
        sourceRoleAtIngestion: 'OPERATOR',
        extractionMethod: 'DIRECT',
        inputQuality: 'STRUCTURED',
        inputConfidenceLevel: 'MEDIUM',
        enteredByActorId: humanId,
        idempotencyKey: eventIdempotencyKey({ rawInputId, claimLocator: '/', subject, factKey: 'declared_arrival', targets: null, scope: { type: 'GLOBAL', ref: '' }, eventClass: 'OBSERVATION' }),
        // 권한 W = 업체의 주장(운영자 확인이 아니다) · claim_kind 로 교차 확인 대상임을 남긴다
        payload: { claim_locator: '/', authority: 'W', claim_kind: 'PARTNER_STATEMENT', entry: 'PARTNER_STATEMENT', source_note: req.source_note },
        recordedAt: now.toDb(),
        isSimulated: call.isSimulated,
        scenarioId: call.scenarioId,
      });
      await this.repo.insertLinks(tx, [{ eventId, entityType: subject.entityType, entityId: subject.entityId, linkRole: 'SUBJECT' }]);
      await this.audit.record(tx, { actorId: humanId, action: AUDIT_ACTION.PARTNER_STATEMENT_RECORDED, targetType: 'EVENT', targetId: eventId, result: 'SUCCESS', isSimulated: call.isSimulated });
      return true;
    });
    // 진술은 곧바로 공공 관측과 교차 확인한다 — 응답의 사실 상태가 그 결과(일치 · 충돌)를 이미 반영한다(알림 · Worker 주기는 같은 결과를 다시 만들지 않는다)
    if (changed) await this.corroborations.sweep({ entityId: coordinate.entityId });
    if (changed) this.signals.emit({ type: 'FACT_CHANGED', entityId: coordinate.entityId, factKey: coordinate.factKey });
    const [view] = await this.truth.view([await this.truth.liveForCoordinate(coordinate)]);
    return view as FactCoordinateView;
  }

  async enter(actorHeader: string | undefined, body: unknown, asOf?: string): Promise<FactCoordinateView> {
    const req = parse(manualSchema, body);
    const viewAsOf = parseAsOf(asOf);
    const humanId = await this.resolveHuman(actorHeader);
    const now = this.clock.now();
    let observedAt: Instant | null = null;
    if (req.observed_at !== undefined) {
      try {
        observedAt = Instant.parseIso(req.observed_at);
      } catch {
        throw new ValidationError('INVALID_FACT_REQUEST', 'observed_at must be ISO 8601 with an offset', ['observed_at']);
      }
      if (observedAt.isAfter(now)) throw new ValidationError('INVALID_FACT_REQUEST', 'observed_at cannot be in the future', ['observed_at']);
    }
    const target = await this.repo.entityFacts(this.repo.db, req.kind === 'TRUCK_SLOT' ? 'TRUCK_POOL' : 'FACILITY', req.target_id);
    if (!target) throw new BusinessRuleError('TARGET_NOT_FOUND', 'No truck pool / facility with this id', 404);
    let eventType: 'TRUCK_AVAILABILITY_REPORTED' | 'WAREHOUSE_CAPACITY_CHANGED' | 'YARD_CAPACITY_REPORTED';
    let factKind: 'OFFER' | 'STATE';
    let unit: 'TRUCK' | 'CONTAINER';
    if (req.kind === 'TRUCK_SLOT') [eventType, factKind, unit] = ['TRUCK_AVAILABILITY_REPORTED', 'OFFER', 'TRUCK'];
    else if (target.facilityType === 'WAREHOUSE') [eventType, factKind, unit] = ['WAREHOUSE_CAPACITY_CHANGED', 'STATE', 'CONTAINER'];
    else if (target.facilityType === 'ODCY') [eventType, factKind, unit] = ['YARD_CAPACITY_REPORTED', 'OFFER', 'CONTAINER'];
    else throw new BusinessRuleError('TARGET_NOT_SUPPORTED', 'Only warehouse / ODCY capacity and truck slots can be entered', 422);
    if (req.scenario_id && !(await this.repo.scenarioExists(req.scenario_id))) throw new BusinessRuleError('SCENARIO_NOT_FOUND', 'No scenario with this id', 404);

    // 사실 키 = 문의가 쓰는 것과 같은 규칙(같은 좌표에 모인다)
    const values: StructuredValue[] = [
      { key: 'date', valueText: req.date, valueNumber: null, unit: null, sourcePath: null },
      ...(req.window_from ? [{ key: 'window_from', valueText: req.window_from, valueNumber: null, unit: null, sourcePath: null }] : []),
      ...(req.window_to ? [{ key: 'window_to', valueText: req.window_to, valueNumber: null, unit: null, sourcePath: null }] : []),
      ...(req.size_type ? [{ key: 'size_type', valueText: req.size_type, valueNumber: null, unit: null, sourcePath: null }] : []),
    ];
    const factKey = targetFactKey(req.kind as InquiryIntent, values, target.facilityType ?? undefined);
    const validFrom = req.kind === 'TRUCK_SLOT' ? seoulToUtcIso(req.date, req.window_from as string) : seoulToUtcIso(req.date, '00:00');
    const validUntil = req.kind === 'TRUCK_SLOT' ? seoulToUtcIso(req.date, req.window_to as string) : seoulToUtcIso(nextDate(req.date), '00:00');
    const isSimulated = req.scenario_id !== undefined;
    const coordinate: Coordinate = { entityType: target.type, entityId: req.target_id, factKey, scopeType: 'GLOBAL', scopeRef: '', isSimulated };

    const commandIdValue = req.command_id ?? this.ids.newId();
    const payloadBytes = new TextEncoder().encode(canonicalJson({ k: 'fact-command', v: 1, command: 'ENTER', command_id: commandIdValue, intent: req.intent, kind: req.kind, target_id: req.target_id, fact_key: factKey, value: req.value, source_note: req.source_note, observed_at: req.observed_at ?? null }));
    const stored = await this.content.storeVerified('RAW_INPUT_PAYLOAD', payloadBytes, 'application/json');

    const changed = await this.tx.run(async (tx) => {
      await this.repo.lockCoordinate(tx, coordinate);
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
        isSimulated,
      });
      if (!rawCreated) return false; // 같은 명령의 재시도 — 이미 들어갔다
      const eventId = this.ids.newId();
      const subject = { entityType: target.type, entityId: req.target_id };
      await this.repo.insertEvent(tx, {
        eventId,
        schemaVersion: 'ev-1',
        rawInputId,
        eventClass: 'OBSERVATION',
        eventType,
        factKind,
        factKey,
        valueNumber: String(req.value),
        valueUnit: unit,
        validFrom: Instant.parseIso(validFrom).toDb(),
        validUntil: Instant.parseIso(validUntil).toDb(),
        applicabilityScopeType: 'GLOBAL',
        applicabilityScopeRef: '',
        sourceEventTime: observedAt ? observedAt.toDb() : null,
        receivedAt: now.toDb(),
        sourceType: 'HUMAN_UI',
        sourceRoleAtIngestion: 'OPERATOR',
        extractionMethod: 'DIRECT',
        inputQuality: 'STRUCTURED',
        inputConfidenceLevel: 'HIGH',
        enteredByActorId: humanId,
        idempotencyKey: eventIdempotencyKey({ rawInputId, claimLocator: '/', subject, factKey, targets: null, scope: { type: 'GLOBAL', ref: '' }, eventClass: 'OBSERVATION' }),
        payload: { claim_locator: '/', authority: 'S', entry: MANUAL_ENTRY_INTENT, source_note: req.source_note },
        recordedAt: now.toDb(),
        isSimulated,
        scenarioId: req.scenario_id ?? null,
      });
      await this.repo.insertLinks(tx, [{ eventId, entityType: subject.entityType, entityId: subject.entityId, linkRole: 'SUBJECT' }]);
      await this.audit.record(tx, { actorId: humanId, action: AUDIT_ACTION.FACT_ENTERED_MANUALLY, targetType: 'EVENT', targetId: eventId, result: 'SUCCESS', isSimulated });
      await this.truth.materialize(tx as DbTransaction, coordinate);
      return true;
    });
    if (changed) this.signals.emit({ type: 'FACT_CHANGED', entityId: coordinate.entityId, factKey: coordinate.factKey });
    // 응답은 호출자가 준 기준 시각(목록과 같은 as_of)으로 판정한다 — 없으면 지금
    const [view] = await this.truth.view([await this.truth.liveForCoordinate(coordinate, viewAsOf ?? undefined)]);
    return view as FactCoordinateView;
  }

  private async resolveHuman(actorHeader: string | undefined): Promise<string> {
    if (!actorHeader) throw new ValidationError('ACTOR_REQUIRED', 'X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    if (!uuid.safeParse(actorHeader).success) throw new ValidationError('INVALID_ID', 'X-CERA-Actor-Id must be a UUID', ['x-cera-actor-id']);
    const human = await this.repo.activeHuman(actorHeader);
    if (!human) throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can confirm, reject or correct a fact', 403);
    return human.actorId;
  }

  private async act(action: Action, eventId: string, actorHeader: string | undefined, commandIdIn: string | undefined, detail: { reason_code?: RejectReason | RevokeReason; note?: string; value?: number }, asOf?: string): Promise<FactCoordinateView> {
    const viewAsOf = parseAsOf(asOf);
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
      if (action === 'REJECT' && role === 'REJECTED') return false;
      if (action === 'REVOKE' && role === 'REVOKED') return false;
      if (role === 'REVOKED') throw new BusinessRuleError('EVENT_REVOKED', 'This value was withdrawn — enter or wait for a new value instead', 409);
      if (action === 'CONFIRM' && verification === 'CONFIRMED') return false; // 사람이 입력한 값 · 이미 확인한 값
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

      if (action === 'REVOKE') {
        // 값 없는 정정 = 철회. 근거 시각은 철회한 지금 — 그 시각까지의 값은 현재 사실에서 빠지고, 그 뒤의 새 근거만 경쟁한다
        const key = eventIdempotencyKey({ rawInputId, claimLocator: '/', subject, factKey: target.factKey, targets: null, scope, eventClass: 'CORRECTION' });
        await this.repo.insertEvent(tx, {
          ...base,
          eventId: newEventId,
          eventClass: 'CORRECTION',
          eventType: 'CORRECTION',
          factKind: target.factKind,
          factKey: target.factKey,
          supersedesEventId: eventId,
          supersedeReason: detail.reason_code ?? null,
          idempotencyKey: key,
          payload: { claim_locator: '/', authority: 'S', withdrawal: true, revoke_reason: detail.reason_code, note: detail.note ?? null, revoked_event_id: eventId },
        });
        await this.repo.insertLinks(tx, [{ eventId: newEventId, entityType: subject.entityType, entityId: subject.entityId, linkRole: 'SUBJECT' }]);
        await this.audit.record(tx, { actorId: humanId, action: AUDIT_ACTION.FACT_REVOKED, targetType: 'EVENT', targetId: newEventId, result: 'SUCCESS', isSimulated: target.isSimulated });
      } else if (action === 'CORRECT') {
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
          verificationAction: action as 'CONFIRM' | 'REJECT',
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
    // 응답은 호출자가 준 기준 시각(목록과 같은 as_of)으로 판정한다 — 없으면 지금
    const [view] = await this.truth.view([await this.truth.liveForCoordinate(coordinate, viewAsOf ?? undefined)]);
    return view as FactCoordinateView;
  }
}
