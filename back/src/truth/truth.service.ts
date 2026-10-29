import { Inject, Injectable } from '@nestjs/common';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../content/content-store.js';
import type { DbTransaction } from '../db/database.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { parseFactKey } from './fact-key.js';
import { freshnessPolicyFor } from './truth-policy.js';
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
  /** 판정 기준 시각(+09:00) — 신선도 · 만료가 이 시각 기준이다 */
  asOf: string;
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

  /**
   * 사건에서 바로 판정(파생 표를 거치지 않는다).
   * `knownBy` = 이 시각까지 CERA 가 **알 수 있었던** 사건만 쓴다(기본 = asOf). 과거 as_of 로 판정할 때 그 뒤에 기록된 사건이 섞이지 않게 한다.
   * 무효 점검(refreshOutdated)처럼 "판의 as_of 로 신선도를 보되 지금까지 들어온 사건으로" 비교할 때만 knownBy 를 따로 준다.
   */
  evaluate(data: CoordinateData, asOf = this.clock.now(), knownBy: Instant = asOf): CoordinateResult {
    data = knownAsOf(data, knownBy);
    const result = reconcile(data.events, data.verifications, asOf.toIsoUtc(), undefined, freshnessPolicyFor(data.coordinate.factKey));
    const winnerRow = result.winner ? (data.rows.find((r) => r.eventId === result.winner?.eventId) ?? null) : null;
    return { data, result, state: factState(result), winnerRow, asOf: asOf.toSeoulIso() };
  }

  /**
   * `asOf` = 판정 기준 시각. 계획 실행 안에서는 그 계획의 스냅샷 시각을 넘긴다(계획은 그 시각의 그림이다 — 시스템 현재 시각이 아니다, 규칙 6).
   * 생략하면 지금(`materialize` 의 파생 표처럼 실행 문맥이 없을 때).
   */
  async liveForSubjects(subjectIds: readonly string[], sim: { isSimulated: boolean; scenarioId: string | null }, asOf?: Instant, knownBy?: Instant): Promise<CoordinateResult[]> {
    const data = await this.repo.subjectData(subjectIds, sim);
    return data.map((d) => this.evaluate(d, asOf, knownBy ?? asOf));
  }

  async liveForCoordinate(c: Coordinate, asOf?: Instant): Promise<CoordinateResult> {
    return this.evaluate(await this.repo.coordinateData(c), asOf);
  }

  /**
   * 좌표 하나를 다시 판정해 `canonical_fact` · `conflict` 를 쓴다. 호출자의 트랜잭션 안에서(사건 쓰기와 같은 커밋) 좌표 잠금을 쥔 채로 부른다.
   * 자격 있는 후보가 없으면 행을 지운다 — 행이 없다 = 값 없음(UNKNOWN).
   */
  async materialize(tx: DbTransaction, c: Coordinate): Promise<CoordinateResult> {
    const asOf = this.clock.now(); // 파생 표의 신선도는 "쓴 시각" 기준(`computed_as_of`). 읽기는 각자의 기준 시각으로 다시 판정한다
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

  /**
   * 신선도 재판정(Worker 주기 · T-111): 파생 표의 각 좌표를 지금 기준 시각으로 다시 써서 FRESH → AGING → STALE · EXPIRED 가
   * 파생 표에도 반영되게 한다. 읽기(Agent · 화면)는 원래 사건에서 직접 판정하므로 이 작업이 늦어도 답은 같다 — 이것은 투영 갱신이다.
   * 바뀐 좌표 수와 걸린 시간을 돌려준다(관측: 실행 시간 기록).
   */
  async refreshDerived(run: (work: (tx: DbTransaction) => Promise<void>) => Promise<void>, limit = 500): Promise<{ checked: number; changed: number; ms: number }> {
    const started = performance.now(); // 소요 시간 관측용(단조 시계) — 판정 기준 시각이 아니다
    const rows = await this.repo.canonicalCoordinates(limit);
    let changed = 0;
    for (const c of rows) {
      await run(async (tx) => {
        await this.repo.lockCoordinate(tx, c.coordinate);
        const out = await this.materialize(tx, c.coordinate);
        if (out.result.freshness !== c.freshness || out.result.usability !== c.usability || !out.result.winner) changed += 1;
      });
    }
    return { checked: rows.length, changed, ms: Math.round(performance.now() - started) };
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
        freshness_status: r.result.freshness,
        evaluated_as_of: r.asOf,
        revoked_by_event_id: r.result.revokedBy,
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
  freshness_status: string;
  evaluated_as_of: string;
  revoked_by_event_id: string | null;
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

/**
 * 사건이 CERA 에 **알려진 시각**(T-136 · 시각 불변식) — 과거 as_of 판정에 미래 사건이 섞이지 않게 한다.
 * - 실제(LIVE): `received_at` = CERA 가 그 사건을 기록한 시각. 사건 시각(source_event_time)이 과거여도 그 뒤에 들어왔으면 그때는 몰랐다
 * - 시뮬레이션: 시나리오 시계는 실제 시계와 다르다. 시나리오 세계의 시각(source_event_time)이 있으면 그것, 없으면(시연 화면의 직접 입력처럼
 *   "시나리오의 지금" 들어온 사건) 시나리오 as_of 에 알려진 것으로 본다
 * 확인 · 거절 · 철회(VERIFICATION)도 같은 규칙 — 실제는 received_at, 시뮬레이션은 늘 알려진 것으로 본다.
 */
export function knownAsOf(data: CoordinateData, knownBy: Instant): CoordinateData {
  const cut = knownBy.toIsoUtc();
  const known = (r: CoordinateData['rows'][number]): boolean => {
    const t = r.isSimulated ? r.sourceEventTime : r.receivedAt;
    return t === null || Instant.fromDb(t).toIsoUtc() <= cut;
  };
  const rows = data.rows.filter(known);
  if (rows.length === data.rows.length && data.coordinate.isSimulated) return data;
  const ids = new Set(rows.map((r) => r.eventId));
  const verifications = data.verifications.filter((v) => data.coordinate.isSimulated || v.receivedAt <= cut);
  return { ...data, rows, events: data.events.filter((e) => ids.has(e.eventId)), verifications };
}
