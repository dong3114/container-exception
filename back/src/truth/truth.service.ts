import { Inject, Injectable } from '@nestjs/common';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../content/content-store.js';
import type { DbTransaction } from '../db/database.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { parseFactKey } from './fact-key.js';
import {
  EVIDENCE_POLICY_VERSION,
  type FactState,
  RECONCILE_RULE_VERSION,
  type Reconciled,
  type Role,
  type ScoredEvent,
  factState,
  reconcile,
} from './reconcile-rules.js';
import { type Coordinate, type CoordinateData, type EventRow, TruthRepository, coordinateKey } from './truth.repository.js';

export interface CoordinateResult {
  data: CoordinateData;
  result: Reconciled;
  state: FactState;
  /** 판정에 이긴 사건의 원본 행 */
  winnerRow: EventRow | null;
}

const sourceRoleFor = (r: EventRow) => r.sourceRoleAtIngestion;

/**
 * 사실 판정의 읽기 · 파생 쓰기(T-093). Event 가 원천이고 `canonical_fact` · `conflict` 는 여기서 언제든 다시 만들 수 있는 파생이다.
 * 읽기 경로(Agent · 화면)는 사건에서 바로 판정한다(`live`) — 파생 표가 늦어도 같은 답이 나온다(R12 결정론).
 */
@Injectable()
export class TruthService {
  constructor(
    @Inject(TruthRepository) readonly repo: TruthRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CONTENT_STORE) private readonly store: ContentStore,
  ) {}

  /** 사건에서 바로 판정(파생 표를 거치지 않는다). */
  evaluate(data: CoordinateData, asOf = this.clock.now()): CoordinateResult {
    const result = reconcile(data.events, data.verifications, asOf.toIsoUtc());
    const winnerRow = result.winner ? (data.rows.find((r) => r.eventId === result.winner?.eventId) ?? null) : null;
    return { data, result, state: factState(result), winnerRow };
  }

  /**
   * `asOf` = 판정 기준 시각. 계획 실행 안에서는 그 계획의 스냅샷 시각을 넘긴다(계획은 그 시각의 그림이다 — 시스템 현재 시각이 아니다, 규칙 6).
   * 생략하면 지금(`materialize` 의 파생 표처럼 실행 문맥이 없을 때).
   */
  async liveForSubjects(subjectIds: readonly string[], sim: { isSimulated: boolean; scenarioId: string | null }, asOf?: Instant): Promise<CoordinateResult[]> {
    const data = await this.repo.subjectData(subjectIds, sim);
    return data.map((d) => this.evaluate(d, asOf));
  }

  async liveForCoordinate(c: Coordinate, asOf?: Instant): Promise<CoordinateResult> {
    return this.evaluate(await this.repo.coordinateData(c), asOf);
  }

  /**
   * 좌표 하나를 다시 판정해 `canonical_fact` · `conflict` 를 쓴다. 호출자의 트랜잭션 안에서(사건 쓰기와 같은 커밋) 좌표 잠금을 쥔 채로 부른다.
   * 자격 있는 후보가 없으면 행을 지운다 — 행이 없다 = 값 없음(UNKNOWN).
   */
  async materialize(tx: DbTransaction, c: Coordinate): Promise<CoordinateResult> {
    const asOf = this.clock.now();
    const out = this.evaluate(await this.repo.coordinateData(c, tx), asOf);
    const { result, winnerRow } = out;
    if (!result.winner || !winnerRow) {
      await this.repo.deleteCanonicalFact(tx, c);
      await this.repo.replaceConflicts(tx, c, []);
      return out;
    }
    const parts = parseFactKey(c.factKey);
    const w = result.winner;
    const now = asOf.toDb();
    await this.repo.upsertCanonicalFact(tx, {
      entityType: c.entityType,
      entityId: c.entityId,
      factKey: c.factKey,
      applicabilityScopeType: c.scopeType,
      applicabilityScopeRef: c.scopeRef,
      factName: parts.factName,
      paramDate: parts.paramDate,
      paramSlotStart: parts.paramSlotStart,
      paramSizeType: parts.paramSizeType,
      valueNumber: winnerRow.valueNumber,
      valueUnit: winnerRow.valueUnit,
      valueText: winnerRow.valueText,
      valueCode: winnerRow.valueCode,
      valueTimestamp: winnerRow.valueTimestamp,
      validFrom: winnerRow.validFrom,
      validUntil: winnerRow.validUntil,
      winningEventId: w.eventId,
      appliedRule: result.appliedRule ?? 'R4-a',
      ruleVersion: RECONCILE_RULE_VERSION,
      valueStatus: result.status,
      verificationBasis: result.verificationBasis,
      evidenceStrength: String(w.strength),
      evidencePolicyVersion: EVIDENCE_POLICY_VERSION,
      evidenceTime: Instant.parseIso(w.evidenceTime).toDb(),
      evidenceTimeQuality: w.evidenceTimeQuality,
      temporalConfidence: w.evidenceTimeQuality === 'EVENT_TIME' ? 'HIGH' : w.evidenceTimeQuality === 'RECORDED_TIME' ? 'MEDIUM' : 'LOW',
      freshnessStatus: result.freshness,
      conflictStatus: result.conflictStatus,
      holdStatus: result.holdStatus,
      decisionUsability: result.usability,
      contributingEventCount: result.contributingEventCount,
      isSimulated: c.isSimulated,
      scenarioId: winnerRow.scenarioId,
      computedAsOf: now,
      computedAt: now,
    });
    const conflicts =
      result.conflictStatus === 'NONE' || result.conflictEventIds.length < 2
        ? []
        : [
            {
              conflictId: this.ids.newId(),
              entityType: c.entityType,
              entityId: c.entityId,
              factKey: c.factKey,
              applicabilityScopeType: c.scopeType,
              applicabilityScopeRef: c.scopeRef,
              conflictType: result.conflictType ?? 'DISSENT',
              eventIds: result.conflictEventIds,
              severity: result.conflictStatus === 'OPEN' ? 'HIGH' : 'LOW',
              detectedRule: result.appliedRule ?? 'R4-a',
              ruleVersion: RECONCILE_RULE_VERSION,
              blocksAutomation: result.conflictStatus === 'OPEN',
              computedAsOf: now,
              isSimulated: c.isSimulated,
              scenarioId: winnerRow.scenarioId,
            },
          ];
    await this.repo.replaceConflicts(tx, c, conflicts);
    return out;
  }

  // ── 화면 · API 용 보기 ──
  async view(results: readonly CoordinateResult[]): Promise<FactCoordinateView[]> {
    const names = await this.repo.entityNames([...new Set(results.map((r) => r.data.coordinate.entityId))]);
    const extractionIds = [...new Set(results.flatMap((r) => r.data.rows.map((x) => x.extractionId)).filter((x): x is string => x !== null))];
    const extractions = new Map((await this.repo.extractionsByIds(extractionIds)).map((x) => [x.extractionId, x]));
    const out: FactCoordinateView[] = [];
    for (const r of results) {
      const c = r.data.coordinate;
      const candidates: FactCandidateView[] = [];
      for (const row of r.data.rows) {
        const scored = r.result.scored.find((s) => s.eventId === row.eventId) as ScoredEvent;
        const ex = row.extractionId ? extractions.get(row.extractionId) : undefined;
        const quote = ex ? await this.readQuote(ex.sourceQuoteRef) : null;
        candidates.push({
          event_id: row.eventId,
          event_class: row.eventClass as 'OBSERVATION' | 'CORRECTION',
          role: r.result.roles.get(row.eventId) ?? 'OUTDATED',
          value: row.valueNumber === null ? null : Number(row.valueNumber),
          unit: row.valueUnit,
          valid_from: row.validFrom ? Instant.fromDb(row.validFrom).toSeoulIso() : null,
          valid_until: row.validUntil ? Instant.fromDb(row.validUntil).toSeoulIso() : null,
          source_type: row.sourceType,
          source_role: sourceRoleFor(row),
          evidence_strength: scored.strength,
          verification: scored.verification,
          verified_by_human: scored.verifiedByHuman,
          received_at: Instant.fromDb(row.receivedAt).toSeoulIso(),
          evidence_time: Instant.parseIso(scored.evidenceTime).toSeoulIso(),
          supersedes_event_id: row.supersedesEventId,
          extraction_id: row.extractionId,
          evidence_quote: quote,
          generated_by: ex ? (ex.modelVersion.startsWith('replay:') ? 'RECORDED_REPLAY' : 'LLM') : row.sourceType === 'HUMAN_UI' ? 'HUMAN' : 'SYSTEM',
          model_version: ex?.modelVersion ?? null,
          prompt_version: ex?.promptVersion ?? null,
        });
      }
      candidates.sort((a, b) => (a.received_at < b.received_at ? 1 : a.received_at > b.received_at ? -1 : 0));
      const w = r.result.winner;
      out.push({
        entity_type: c.entityType,
        entity_id: c.entityId,
        entity_name: names.get(c.entityId) ?? null,
        fact_key: c.factKey,
        applicability_scope: { type: c.scopeType, ref: c.scopeRef },
        is_simulated: c.isSimulated,
        fact_state: r.state,
        value_status: r.result.status,
        conflict_status: r.result.conflictStatus,
        hold_status: r.result.holdStatus,
        decision_usability: r.result.usability,
        applied_rule: r.result.appliedRule,
        rule_version: RECONCILE_RULE_VERSION,
        current: w
          ? {
              event_id: w.eventId,
              value: w.value,
              unit: w.unit,
              valid_from: w.validFrom ? Instant.parseIso(w.validFrom).toSeoulIso() : null,
              valid_until: w.validUntil ? Instant.parseIso(w.validUntil).toSeoulIso() : null,
              evidence_strength: w.strength,
              verified_by_human: r.result.status === 'CONFIRMED' && r.result.verificationBasis === 'HUMAN_VERIFICATION',
              verification_basis: r.result.verificationBasis,
            }
          : null,
        held_event_id: r.result.heldEventId,
        candidates,
      });
    }
    return out.sort((a, b) => (a.entity_name ?? '').localeCompare(b.entity_name ?? '') || a.fact_key.localeCompare(b.fact_key));
  }

  private async readQuote(ref: string): Promise<string | null> {
    try {
      const bytes = await this.store.get(ref as Parameters<ContentStore['get']>[0]);
      return bytes === ABSENT ? null : new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }
}

export interface FactCandidateView {
  event_id: string;
  event_class: 'OBSERVATION' | 'CORRECTION';
  role: Role;
  value: number | null;
  unit: string | null;
  valid_from: string | null;
  valid_until: string | null;
  source_type: string;
  source_role: string | null;
  evidence_strength: number;
  verification: 'UNVERIFIED' | 'CONFIRMED' | 'REJECTED';
  verified_by_human: boolean;
  received_at: string;
  evidence_time: string;
  supersedes_event_id: string | null;
  extraction_id: string | null;
  evidence_quote: string | null;
  generated_by: 'LLM' | 'RECORDED_REPLAY' | 'HUMAN' | 'SYSTEM';
  model_version: string | null;
  prompt_version: string | null;
}

export interface FactCoordinateView {
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  fact_key: string;
  applicability_scope: { type: string; ref: string };
  is_simulated: boolean;
  fact_state: FactState;
  value_status: string;
  conflict_status: string;
  hold_status: string;
  decision_usability: string;
  applied_rule: string | null;
  rule_version: string;
  current: {
    event_id: string;
    value: number | null;
    unit: string | null;
    valid_from: string | null;
    valid_until: string | null;
    evidence_strength: number;
    verified_by_human: boolean;
    verification_basis: string | null;
  } | null;
  held_event_id: string | null;
  candidates: FactCandidateView[];
}

export { coordinateKey };
