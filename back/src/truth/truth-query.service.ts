import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DATABASE, type Database } from '../db/database.js';
import { commThread, corroboration, event, planningSnapshot, recoveryRun } from '../db/schema/index.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { RECONCILE_RULE_VERSION } from './reconcile-rules.js';
import { TruthRepository, coordinateKey } from './truth.repository.js';
import { TruthService, type CoordinateResult } from './truth.service.js';
import type { FactListDto, OpenConflictListDto } from './dto.js';

/** 이 판정이 아직 다루지 않는 것 — 화면 · Agent 가 사실을 과대 해석하지 않게 응답에 싣는다. */
export const TRUTH_LIMITATIONS = [
  'FRESHNESS_IS_AN_ASSUMPTION — per-family freshness values are generous starting points [ASSUMPTION]; an explicit valid_until wins',
  'SINGLE_REPLY_IS_NOT_AUTHORITY — an emailed answer is at most PROVISIONAL until a human confirms it',
  'NO_SOLVER — no recovery optimisation uses these values yet (T-036)',
] as const;

/** 사실 목록 읽기(화면). 계획 실행이 물은 좌표들 + 그 개체의 모든 사실. */
@Injectable()
export class TruthQueryService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TruthRepository) private readonly repo: TruthRepository,
    @Inject(TruthService) private readonly truth: TruthService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async forRun(runId: string | undefined, asOfParam?: string): Promise<FactListDto> {
    if (!runId || !z.string().uuid().safeParse(runId).success) throw new ValidationError('INVALID_ID', 'recovery_run_id must be a UUID', ['recovery_run_id']);
    const [run] = await this.db
      .select({ id: recoveryRun.runId, asOf: planningSnapshot.asOf, scenarioId: planningSnapshot.scenarioId, containsSimulated: recoveryRun.containsSimulated })
      .from(recoveryRun)
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId))
      .where(eq(recoveryRun.runId, runId))
      .limit(1);
    if (!run) throw new BusinessRuleError('RUN_NOT_FOUND', 'No recovery run with this id', 404);
    // 판정 기준 시각: 호출자가 준 as_of → 없으면 실제 실행 = 지금, 시뮬레이션 실행 = 시나리오(스냅샷) 시각
    let override: Instant | null = null;
    if (asOfParam !== undefined) {
      try {
        override = Instant.parseIso(asOfParam);
      } catch {
        throw new ValidationError('INVALID_AS_OF', 'as_of must be ISO 8601 with an offset', ['as_of']);
      }
    }
    const asOf = override ?? (run.containsSimulated ? Instant.fromDb(run.asOf) : this.clock.now());
    const asked = await this.repo.runCoordinates(runId);
    const results = new Map<string, CoordinateResult>();
    for (const c of asked) results.set(coordinateKey(c), await this.truth.liveForCoordinate(c, asOf));
    // 물은 적 없는 좌표라도 같은 개체에 값이 있으면 같이 보여 준다(사람이 입력한 수용량 등)
    for (const sim of [false, true]) {
      // 물어본 개체 + 계획의 모든 활성 자원(창고 · ODCY · 차량 풀) — 운영자가 직접 입력한 사실도 목록에 남는다
      const subjects = [...new Set([...asked.filter((c) => c.isSimulated === sim).map((c) => c.entityId), ...(await this.repo.activeResourceIds())])];
      for (const r of await this.truth.liveForSubjects(subjects, { isSimulated: sim, scenarioId: sim ? run.scenarioId : null }, asOf)) {
        if (!results.has(coordinateKey(r.data.coordinate))) results.set(coordinateKey(r.data.coordinate), r);
      }
    }
    // T-137: 이 실행의 회신이 주장한 선박 입항 일시 — 공공 관측과의 교차 확인 결과(일치 · 충돌)가 그 사실 상태에 있다
    for (const v of await this.repo.runVesselClaimSubjects(runId)) {
      const c = { entityType: 'VESSEL_CALL', entityId: v.entityId, factKey: 'declared_arrival', scopeType: 'GLOBAL', scopeRef: '', isSimulated: v.isSimulated };
      if (!results.has(coordinateKey(c))) results.set(coordinateKey(c), await this.truth.liveForCoordinate(c, asOf));
    }
    return { evaluated_at: asOf.toSeoulIso(), rule_version: RECONCILE_RULE_VERSION, limitations: [...TRUTH_LIMITATIONS], facts: await this.truth.view([...results.values()]) };
  }

  /**
   * T-137 — 사람이 아직 판단하지 않은 공공 근거 충돌(Action Required). 지난 14일 CONFLICT 판정이 있는 좌표 가운데 **지금도** Truth 가
   * 사람 검토(NEEDS_REVIEW · PUBLIC_EVIDENCE_CONFLICT)로 보는 것만 — 사람이 확인 · 정정했거나 새 근거로 풀린 충돌은 나오지 않는다(판정은 Truth 규칙).
   */
  async openConflicts(): Promise<OpenConflictListDto> {
    const now = this.clock.now();
    const rows = await this.db
      .select({ c: corroboration, runId: commThread.relatedRunId })
      .from(corroboration)
      .innerJoin(event, eq(event.eventId, corroboration.claimEventId))
      .leftJoin(commThread, sql`${commThread.threadId}::text = ${event.correlationId}`)
      .where(and(eq(corroboration.result, 'CONFLICT'), gte(corroboration.createdAt, now.plusMs(-14 * 86_400_000).toDb())))
      .orderBy(desc(corroboration.createdAt))
      .limit(100);
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const key = `${r.c.entityType}:${r.c.entityId}:${r.c.factKey}:${r.c.isSimulated}`;
      if (!latest.has(key)) latest.set(key, r);
    }
    const open: { r: (typeof rows)[number]; live: CoordinateResult }[] = [];
    for (const r of latest.values()) {
      const live = await this.truth.liveForCoordinate({ entityType: r.c.entityType, entityId: r.c.entityId, factKey: r.c.factKey, scopeType: 'GLOBAL', scopeRef: '', isSimulated: r.c.isSimulated }, now);
      if (live.state === 'NEEDS_REVIEW' && live.result.conflictType === 'PUBLIC_EVIDENCE_CONFLICT') open.push({ r, live });
    }
    const names = await this.repo.entityNames(open.map((o) => o.r.c.entityId));
    return {
      conflicts: open.map(({ r }) => ({
        corroboration_id: r.c.corroborationId,
        entity_type: r.c.entityType,
        entity_id: r.c.entityId,
        entity_name: names.get(r.c.entityId) ?? null,
        fact_key: r.c.factKey,
        recovery_run_id: r.runId ?? null,
        claim_value: r.c.claimValueText,
        public_value: r.c.publicValueText,
        difference_minutes: r.c.differenceMinutes,
        tolerance_minutes: r.c.toleranceMinutes,
        detected_at: Instant.fromDb(r.c.createdAt).toSeoulIso(),
        is_simulated: r.c.isSimulated,
      })),
    };
  }
}
