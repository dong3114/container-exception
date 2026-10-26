import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DATABASE, type Database } from '../db/database.js';
import { planningSnapshot, recoveryRun } from '../db/schema/index.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { RECONCILE_RULE_VERSION } from './reconcile-rules.js';
import { TruthRepository, coordinateKey } from './truth.repository.js';
import { TruthService, type CoordinateResult } from './truth.service.js';
import type { FactListDto } from './dto.js';

/** 이 판정이 아직 다루지 않는 것 — 화면 · Agent 가 사실을 과대 해석하지 않게 응답에 싣는다. */
export const TRUTH_LIMITATIONS = [
  'FRESHNESS_NOT_EVALUATED — freshness policy (Q-24) is not decided; a value does not age',
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

  async forRun(runId: string | undefined): Promise<FactListDto> {
    if (!runId || !z.string().uuid().safeParse(runId).success) throw new ValidationError('INVALID_ID', 'recovery_run_id must be a UUID', ['recovery_run_id']);
    const [run] = await this.db
      .select({ id: recoveryRun.runId, asOf: planningSnapshot.asOf, scenarioId: planningSnapshot.scenarioId })
      .from(recoveryRun)
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId))
      .where(eq(recoveryRun.runId, runId))
      .limit(1);
    if (!run) throw new BusinessRuleError('RUN_NOT_FOUND', 'No recovery run with this id', 404);
    // 이 계획 실행의 기준 시각으로 판정한다 — 시스템 시계가 아니라 계획이 보는 그 시각
    const asOf = Instant.fromDb(run.asOf);
    const asked = await this.repo.runCoordinates(runId);
    const results = new Map<string, CoordinateResult>();
    for (const c of asked) results.set(coordinateKey(c), await this.truth.liveForCoordinate(c, asOf));
    // 물은 적 없는 좌표라도 같은 개체에 값이 있으면 같이 보여 준다(사람이 입력한 수용량 등)
    for (const sim of [false, true]) {
      const subjects = [...new Set(asked.filter((c) => c.isSimulated === sim).map((c) => c.entityId))];
      for (const r of await this.truth.liveForSubjects(subjects, { isSimulated: sim, scenarioId: sim ? run.scenarioId : null }, asOf)) {
        if (!results.has(coordinateKey(r.data.coordinate))) results.set(coordinateKey(r.data.coordinate), r);
      }
    }
    return { evaluated_at: this.clock.now().toSeoulIso(), rule_version: RECONCILE_RULE_VERSION, limitations: [...TRUTH_LIMITATIONS], facts: await this.truth.view([...results.values()]) };
  }
}
