import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { corroboration, event, eventEntityLink } from '../db/schema/index.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { CORROBORATION_RULE_VERSION, type CorroborationJudgement, judgeClaim } from './corroboration-rules.js';
import { isPublicVerifiable, isTimestampFact } from './public-authority.js';
import { freshnessOf } from './reconcile-rules.js';
import { freshnessPolicyFor } from './truth-policy.js';
import { toFactEvent } from './truth.repository.js';

/** 교차 확인을 다시 보는 주장 사건의 기간 [ASSUMPTION] — 그보다 오래된 주장은 새 공공 근거가 와도 다시 비교하지 않는다 */
const CLAIM_LOOKBACK_DAYS = 14;
const SWEEP_LIMIT = 500;

export interface CorroborationView {
  corroboration_id: string;
  claim_event_id: string;
  public_event_id: string | null;
  entity_type: string;
  entity_id: string;
  fact_key: string;
  result: string;
  reason_code: string;
  claim_value: string | null;
  public_value: string | null;
  difference_minutes: number | null;
  tolerance_minutes: number | null;
  public_freshness: string | null;
  claim_source: string;
  evaluated_as_of: string;
  rule_version: string;
  is_simulated: boolean;
}

/**
 * 공공 근거 교차 확인(T-136 · Phase 3). 업체 주장(업체 회신에서 승격된 사건 · 사람이 전달한 업체 진술)마다, 같은 사실의 가장 최근 공공 관측과
 * 결정론으로 비교해 결과를 남긴다(append-only · 같은 주장 · 같은 공공 근거 · 같은 규칙 판은 한 번).
 *
 * - 언제: 사실이 바뀌었다는 알림(업체 회신 승격 · 사람 입력 · 공공데이터 수집 뒤) + Worker 주기(알림을 놓쳐도 같은 결과)
 * - 무엇과: 같은 주체 id · 같은 사실 키 · 같은 시뮬레이션 구분의 PUBLIC_API 사건 중 권한 판정이 있는 것(public-authority) — 이름 유사도로 짝짓지 않는다
 * - 공공 근거가 늦게 오면: 처음엔 NO_PUBLIC_EVIDENCE, 나중에 MATCH / CONFLICT 행이 새로 생긴다(이력)
 * 판정 결과는 Truth(applyCorroboration — CONFLICT 면 사람 검토) · 계획(검증 위험 벌점)이 쓴다. 외부 호출 · LLM 없음.
 */
@Injectable()
export class CorroborationService implements OnModuleInit {
  private readonly logger = new Logger('CorroborationService');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
  ) {}

  onModuleInit(): void {
    this.signals.subscribe(async (s) => {
      if (s.type !== 'FACT_CHANGED') return;
      try {
        await this.sweep({ entityId: s.entityId });
      } catch (e) {
        this.logger.warn(`corroboration after fact change failed: ${(e as Error).message}`);
      }
    });
  }

  /** 아직 지금 공공 근거와 비교되지 않은 주장을 비교해 남긴다. 남긴 행 수를 돌려준다(다시 돌려도 늘지 않는다). */
  async sweep(opts: { entityId?: string } = {}): Promise<{ recorded: number; checked: number }> {
    const now = this.clock.now();
    const since = now.plusMs(-CLAIM_LOOKBACK_DAYS * 86_400_000).toDb();
    const claims = await this.db
      .select({ e: event, entityType: eventEntityLink.entityType, entityId: eventEntityLink.entityId })
      .from(event)
      .innerJoin(eventEntityLink, and(eq(eventEntityLink.eventId, event.eventId), eq(eventEntityLink.linkRole, 'SUBJECT')))
      .where(
        and(
          eq(event.eventClass, 'OBSERVATION'),
          ne(event.sourceType, 'PUBLIC_API'),
          // 업체가 말한 것만 주장이다: 업체 회신(EMAIL 승격) · 사람이 전달한 업체 진술. 운영자 자신의 직접 입력은 주장이 아니라 확인 입력이다
          or(eq(event.sourceType, 'EMAIL'), sql`${event.payload}->>'claim_kind' = 'PARTNER_STATEMENT'`),
          gte(event.receivedAt, since),
          opts.entityId ? eq(eventEntityLink.entityId, opts.entityId) : undefined,
        ),
      )
      .orderBy(desc(event.receivedAt))
      .limit(SWEEP_LIMIT);
    let recorded = 0;
    for (const c of claims) {
      if (!c.e.factKey) continue;
      const comparable = isPublicVerifiable(c.entityType, c.e.factKey);
      const pub = comparable ? await this.latestPublic(c.entityId, c.e.factKey, c.e.isSimulated, now) : null;
      const claimValue = toFactEvent(c.e).value;
      const judgement = judgeClaim({ comparable, claimValue, publicObservation: pub ? { value: pub.value, freshness: pub.freshness } : null });
      if (await this.record(c.e.eventId, c.entityType, c.entityId, c.e.factKey, c.e.isSimulated, judgement, pub, claimValue, now)) recorded += 1;
    }
    return { recorded, checked: claims.length };
  }

  private async latestPublic(entityId: string, factKey: string, isSimulated: boolean, now: Instant) {
    const rows = await this.db
      .select({ e: event })
      .from(event)
      .innerJoin(eventEntityLink, and(eq(eventEntityLink.eventId, event.eventId), eq(eventEntityLink.linkRole, 'SUBJECT')))
      .where(and(eq(eventEntityLink.entityId, entityId), eq(event.factKey, factKey), eq(event.sourceType, 'PUBLIC_API'), eq(event.isSimulated, isSimulated), eq(event.eventClass, 'OBSERVATION')))
      .orderBy(desc(event.receivedAt), desc(event.eventId))
      .limit(20);
    // 권한 판정(payload.authority)이 있는 공공 관측만 근거다 — 영역 밖 · 판정 전 수집분은 비교에 쓰지 않는다
    const r = rows.map((x) => x.e).find((e) => {
      const a = (e.payload as { authority?: unknown } | null)?.authority;
      return a === 'A' || a === 'S';
    });
    if (!r) return null;
    const fe = toFactEvent(r);
    return { eventId: r.eventId, value: fe.value, freshness: freshnessOf(fe, now.toIsoUtc(), freshnessPolicyFor(factKey)), valueTimestamp: r.valueTimestamp };
  }

  private async record(
    claimEventId: string,
    entityType: string,
    entityId: string,
    factKey: string,
    isSimulated: boolean,
    j: CorroborationJudgement,
    pub: { eventId: string; value: number | null; freshness: string } | null,
    claimValue: number | null,
    now: Instant,
  ): Promise<boolean> {
    const withPublic = j.result === 'MATCH' || j.result === 'CONFLICT' || j.result === 'STALE_PUBLIC_EVIDENCE';
    const show = (v: number | null) => (v === null ? null : isTimestampFact(factKey) ? Instant.ofEpochMs(v).toSeoulIso() : String(v));
    const rows = await this.db
      .insert(corroboration)
      .values({
        corroborationId: this.ids.newId(),
        claimEventId,
        publicEventId: withPublic && pub ? pub.eventId : null,
        entityType,
        entityId,
        factKey,
        result: j.result,
        reasonCode: j.reason,
        claimValueText: show(claimValue),
        publicValueText: pub ? show(pub.value) : null,
        differenceMinutes: j.differenceMinutes,
        toleranceMinutes: j.toleranceMinutes,
        publicFreshness: pub ? pub.freshness : null,
        evaluatedAsOf: now.toDb(),
        ruleVersion: CORROBORATION_RULE_VERSION,
        isSimulated,
        createdAt: now.toDb(),
      })
      .onConflictDoNothing()
      .returning({ id: corroboration.corroborationId });
    return rows.length > 0;
  }

  /** 화면 · 감사용 목록(최근 순). 주체를 주면 그 주체만. */
  async list(opts: { entityIds?: string[]; limit?: number } = {}): Promise<CorroborationView[]> {
    const rows = await this.db
      .select({ c: corroboration, claimSource: event.sourceType })
      .from(corroboration)
      .innerJoin(event, eq(event.eventId, corroboration.claimEventId))
      .where(opts.entityIds && opts.entityIds.length > 0 ? inArray(corroboration.entityId, opts.entityIds) : undefined)
      .orderBy(desc(corroboration.createdAt))
      .limit(opts.limit ?? 50);
    return rows.map(({ c, claimSource }) => ({
      corroboration_id: c.corroborationId,
      claim_event_id: c.claimEventId,
      public_event_id: c.publicEventId,
      entity_type: c.entityType,
      entity_id: c.entityId,
      fact_key: c.factKey,
      result: c.result,
      reason_code: c.reasonCode,
      claim_value: c.claimValueText,
      public_value: c.publicValueText,
      difference_minutes: c.differenceMinutes,
      tolerance_minutes: c.toleranceMinutes,
      public_freshness: c.publicFreshness,
      claim_source: claimSource,
      evaluated_as_of: Instant.fromDb(c.evaluatedAsOf).toSeoulIso(),
      rule_version: c.ruleVersion,
      is_simulated: c.isSimulated,
    }));
  }

  /** 운영 상태용 — 최근 24시간 결과별 수 · 마지막 판정 시각 */
  async recentSummary(): Promise<{ last_at: string | null; last_24h: Record<string, number> }> {
    const since = this.clock.now().plusMs(-86_400_000).toDb();
    const counts = await this.db
      .select({ result: corroboration.result, n: sql<number>`count(*)::int` })
      .from(corroboration)
      .where(gte(corroboration.createdAt, since))
      .groupBy(corroboration.result);
    const [last] = await this.db.select({ at: corroboration.createdAt }).from(corroboration).orderBy(desc(corroboration.createdAt)).limit(1);
    return { last_at: last ? Instant.fromDb(last.at).toSeoulIso() : null, last_24h: Object.fromEntries(counts.map((c) => [c.result, c.n])) };
  }
}
