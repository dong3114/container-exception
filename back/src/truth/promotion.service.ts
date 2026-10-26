import { Inject, Injectable } from '@nestjs/common';
import type { extraction } from '../db/schema/index.js';
import type { DbTransaction } from '../db/database.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION, type AuditAction } from '../persistence/catalog.js';
import { eventIdempotencyKey } from '../persistence/event-writer.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { replyDateOf, sentenceAround } from './date-scope.js';
import { parseFactKey } from './fact-key.js';
import { type BlockReason, evaluatePromotion } from './promotion-rules.js';
import { type Coordinate, TruthRepository } from './truth.repository.js';
import { TruthService } from './truth.service.js';

type ExtractionRow = typeof extraction.$inferSelect;

interface Candidate {
  row: ExtractionRow;
  field: string;
  validated: boolean;
  ambiguous: boolean;
}

export interface PromotionSummary {
  promoted: { eventId: string; coordinate: Coordinate }[];
  blocked: { extractionId: string; reasons: BlockReason[] }[];
}

export const PROMOTION_RULE = 'promotion/2';

/** 추출 행의 인용 위치(`chars:<시작>-<끝>`)로 원문에서 인용을 다시 꺼낸다(내용 저장소를 트랜잭션 안에서 부르지 않는다). */
function quoteText(source: string, location: string | null): string {
  const m = location ? /^chars:(\d+)-(\d+)$/.exec(location) : null;
  return m ? source.slice(Number(m[1]), Number(m[2])) : '';
}

function candidateOf(row: ExtractionRow): Candidate {
  const checks = (row.validatorResult ?? []) as { check: string; passed: boolean; detail_code: string | null }[];
  return {
    row,
    field: checks.find((c) => c.check === 'FIELD')?.detail_code ?? '',
    validated: checks.every((c) => c.passed),
    ambiguous: checks.some((c) => c.check === 'AMBIGUITY'),
  };
}

/**
 * 검증을 통과한 추출 후보 → 임시 사실(PROVISIONAL, T-093). 추출 저장과 **같은 트랜잭션**에서 부른다 — 회신을 기다리던 Agent 는
 * 추출이 끝났다고 보이는 순간 승격 판정도 끝난 상태를 본다(그 사이 틈이 없다).
 *
 * 승격 = 후보를 **사건(OBSERVATION)** 으로 남기는 것이다(새 사건 엔진 없음 — Event 아키텍처 그대로). 그 사건이 현재 값이 되는지는
 * 사실 판정(`reconcile-rules.ts`)이 정한다 — 모델의 확신도나 후보의 새로움이 아니다. 탈락한 후보는 PENDING 으로 남고 사유가 감사에 남는다.
 * 사건 payload 에는 원문 · 인용 본문을 넣지 않는다 — 추출 id · 인용 참조 · 지문 · 모델 출처(재현·분석용 연결 고리)만.
 */
@Injectable()
export class PromotionService {
  constructor(
    @Inject(TruthRepository) private readonly repo: TruthRepository,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** `sourceText` = AI 가 읽은 회신 본문(검증기가 인용을 찾은 같은 텍스트) — 인용이 든 문장의 날짜 표현을 확인한다. 모르면 빈 문자열(날짜 확인 불가로 막힌다). */
  async promoteMessage(tx: DbTransaction, messageId: string, systemActorId: string, sourceText: string): Promise<PromotionSummary> {
    const summary: PromotionSummary = { promoted: [], blocked: [] };
    const ctx = await this.repo.promotionContext(tx, messageId);
    if (!ctx) return summary;
    const now = this.clock.now();

    for (const q of ctx.questions) {
      const mine = ctx.extractions.filter((x) => x.askId === q.askId).map(candidateOf);
      const quantity = mine.filter((c) => c.field === 'quantity' && c.row.reviewStatus === 'PENDING' && c.validated);
      const first = quantity[0];
      if (!first) continue;
      const entity = q.target ? await this.repo.entityFacts(tx, q.target.entityType, q.target.entityId) : null;
      const siblings = mine.filter((c) => c.field !== 'quantity').map((c) => ({ extractionId: c.row.extractionId, field: c.field, value: c.row.candidateValueText, validated: c.validated, reviewStatus: c.row.reviewStatus }));
      const decision = evaluatePromotion({
        extraction: {
          extractionId: first.row.extractionId,
          askId: q.askId,
          field: first.field,
          value: first.row.candidateValueText,
          unit: first.row.candidateUnit,
          validated: first.validated,
          ambiguous: first.ambiguous,
          reviewStatus: first.row.reviewStatus,
          createdEventId: first.row.createdEventId,
        },
        siblings,
        question: { questionType: q.questionType, status: q.status, expectedUnit: q.expectedUnit, target: q.target, asked: q.target ? parseFactKey(q.target.factKey).asked : { date: null, windowFrom: null, windowTo: null } },
        entity: entity ? { type: entity.type, facilityType: entity.facilityType, ownerCounterpartyId: entity.ownerCounterpartyId } : null,
        sender: { counterpartyId: ctx.counterpartyId, role: ctx.counterpartyRole },
        planSuperseded: ctx.planSuperseded,
        isSimulated: ctx.isSimulated,
        scenarioId: ctx.scenarioId,
        replySentence: sourceText ? sentenceAround(sourceText, quoteText(sourceText, first.row.quoteLocation)) : '',
        replyDate: replyDateOf(ctx.rawSourceRecordedAt, ctx.rawReceivedAt),
      });

      if (!decision.ok) {
        if (decision.reasons.includes('NOT_PENDING')) continue;
        for (const reason of decision.reasons) {
          await this.audit.record(tx, { actorId: systemActorId, action: `FACT_PROMOTION_BLOCKED_${reason}` as AuditAction, targetType: 'EXTRACTION', targetId: first.row.extractionId, result: 'SUCCESS', isSimulated: ctx.isSimulated });
        }
        summary.blocked.push({ extractionId: first.row.extractionId, reasons: decision.reasons });
        continue;
      }

      const target = q.target as NonNullable<typeof q.target>;
      const coordinate: Coordinate = { entityType: target.entityType, entityId: target.entityId, factKey: target.factKey, scopeType: target.scopeType, scopeRef: target.scopeRef, isSimulated: ctx.isSimulated };
      await this.repo.lockCoordinate(tx, coordinate);
      const plan = decision.plan;
      const idempotencyKey = eventIdempotencyKey({
        rawInputId: ctx.rawInputId,
        claimLocator: `ask:${q.askId}`,
        subject: { entityType: target.entityType, entityId: target.entityId },
        factKey: target.factKey,
        targets: null,
        scope: { type: target.scopeType, ref: target.scopeRef },
        eventClass: 'OBSERVATION',
      });
      const eventId = this.ids.newId();
      const inserted = await this.repo.insertEvent(tx, {
        eventId,
        schemaVersion: 'ev-1',
        rawInputId: ctx.rawInputId,
        eventClass: 'OBSERVATION',
        eventType: plan.eventType,
        factKind: plan.factKind,
        factKey: target.factKey,
        valueNumber: String(plan.value),
        valueUnit: plan.unit,
        validFrom: Instant.parseIso(plan.validFrom).toDb(),
        validUntil: Instant.parseIso(plan.validUntil).toDb(),
        applicabilityScopeType: target.scopeType,
        applicabilityScopeRef: target.scopeRef,
        sourceEventTime: null,
        sourceRecordedAt: ctx.rawSourceRecordedAt,
        receivedAt: ctx.rawReceivedAt,
        sourceType: ctx.rawSourceType,
        sourceRoleAtIngestion: ctx.counterpartyRole,
        extractionMethod: 'LLM_EXTRACTED',
        inputQuality: 'UNSTRUCTURED',
        inputConfidenceLevel: 'MEDIUM',
        inputConfidenceReasons: [{ code: 'BACKEND_VALIDATOR_PASSED' }, { code: `SENDER_AUTHORITY_${plan.authority}` }],
        assertedByCounterpartyId: ctx.counterpartyId,
        enteredByActorId: systemActorId,
        extractionId: first.row.extractionId,
        correlationId: ctx.threadId,
        idempotencyKey,
        payload: {
          claim_locator: `ask:${q.askId}`,
          // 수신 때 판정한 상대 권한(docs/05 3.2) — 강도 계산의 재료. 사건이 불변이라 그때의 판정이 그대로 남는다
          authority: plan.authority,
          ask_id: q.askId,
          thread_id: ctx.threadId,
          inbound_message_id: ctx.messageId,
          promotion: { rule: PROMOTION_RULE },
          // 원문 · 인용 본문이 아니라 연결 고리만(추출 → 원문). 모델이 만든 오류와 사람이 고친 결과를 나중에 이을 수 있게 한다
          extraction: {
            extraction_id: first.row.extractionId,
            model_version: first.row.modelVersion,
            prompt_version: first.row.promptVersion,
            schema_version: first.row.schemaVersion,
            input_hash: first.row.inputHash,
            source_quote_ref: first.row.sourceQuoteRef,
            source_quote_hash: first.row.sourceQuoteHash,
            quote_location: first.row.quoteLocation,
          },
        },
        recordedAt: now.toDb(),
        isSimulated: ctx.isSimulated,
        scenarioId: ctx.scenarioId,
      });
      const actualId = inserted ? eventId : ((await this.repo.eventIdByKey(tx, idempotencyKey)) ?? eventId);
      if (!inserted) {
        // 같은 원천 · 같은 질문의 주장이 이미 사건이다. 같은 값이면 그 사건에 이어 주고, 값이 다르면(다시 읽은 결과가 달라졌다) 조용히 합치지 않는다
        const existing = await this.repo.eventById(actualId, tx);
        if (!existing || Number(existing.valueNumber) !== plan.value) {
          await this.audit.record(tx, { actorId: systemActorId, action: 'FACT_PROMOTION_BLOCKED_DUPLICATE_CLAIM' as AuditAction, targetType: 'EXTRACTION', targetId: first.row.extractionId, result: 'SUCCESS', isSimulated: ctx.isSimulated });
          summary.blocked.push({ extractionId: first.row.extractionId, reasons: ['DUPLICATE_CLAIM'] });
          continue;
        }
      }
      if (inserted) {
        await this.repo.insertLinks(tx, [
          { eventId, entityType: target.entityType, entityId: target.entityId, linkRole: 'SUBJECT' },
          { eventId, entityType: 'COUNTERPARTY', entityId: ctx.counterpartyId, linkRole: 'CONTEXT' },
        ]);
      }
      // 같은 질문의 같은 값 후보(중복)와 시간창 칸 후보는 이 사건에 반영된 것으로 본다
      const sameValue = quantity.filter((c) => c.row.candidateValueText === first.row.candidateValueText).map((c) => c.row.extractionId);
      await this.repo.acceptExtractions(tx, [...sameValue, ...plan.siblingExtractionIds], actualId, systemActorId, now.toDb());
      if (inserted) {
        await this.audit.record(tx, { actorId: systemActorId, action: AUDIT_ACTION.FACT_PROVISIONAL_CREATED, targetType: 'EVENT', targetId: eventId, result: 'SUCCESS', isSimulated: ctx.isSimulated });
      }
      await this.truth.materialize(tx, coordinate);
      summary.promoted.push({ eventId: actualId, coordinate });
    }
    return summary;
  }
}
