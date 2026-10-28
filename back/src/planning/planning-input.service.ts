import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import { container, facility, facilityPlanningProfile, planningContainerRecord, planningInputBatch, planningSnapshot, recoveryRun, tariffRate } from '../db/schema/index.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { canonicalHash } from '../shared/hash/hash.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { TruthRepository } from '../truth/truth.repository.js';
import type { ContainerRecordIn, ProfileIn, RateIn } from './live-input.js';
import {
  type ContainerRow,
  type ImportContext,
  type ImportKind,
  type ProfileRow,
  type RateRow,
  type RowError,
  type ValidatedImport,
  readTable,
  validateContainers,
  validateProfiles,
  validateRates,
} from './operational-import.js';

const uuid = z.string().uuid();
const importSchema = z
  .object({
    command_id: uuid,
    dry_run: z.boolean().optional(),
    csv: z.string().optional(),
    rows: z.array(z.record(z.string(), z.unknown())).optional(),
    source_label: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .refine((b) => (b.csv === undefined) !== (b.rows === undefined), { message: 'give exactly one of csv or rows' });
const createRunSchema = z.object({ command_id: uuid, note: z.string().trim().min(1).max(200).optional() }).strict();

export interface ImportReport {
  kind: ImportKind;
  dry_run: boolean;
  /** 저장했는가(검증만 했으면 false). 오류가 하나라도 있으면 아무것도 저장하지 않는다(한 묶음 = 한 트랜잭션) */
  stored: boolean;
  replayed: boolean;
  batch_id: string | null;
  recovery_run_id: string | null;
  content_hash: string;
  row_count: number;
  valid_rows: number;
  invalid_rows: number;
  changes: { new: number; changed: number; unchanged: number };
  errors: RowError[];
  note: string;
}

type Head = { id: string; identity: string; contentHash: string };

/**
 * 실제 계획 입력(T-123) — 운영자가 내부 시스템에서 내보낸 값을 받아 **판(version)** 으로 쌓는다. Truth 를 우회하지 않는다:
 * 시간에 따라 바뀌는 값(그날 수용량 · 차량 가용)은 여기서 받지 않고 Truth 사실 입력(`POST /truth/facts/manual`)으로 간다.
 *
 * - 검증만(dry_run) 또는 저장. 오류가 하나라도 있으면 저장하지 않는다 — 일부만 들어간 컨테이너 목록 · 요율표로 계산되면 그 계획이 틀린다
 * - 같은 내용의 행은 새 판을 만들지 않는다(unchanged). 다른 내용이면 새 판이 옛 판을 밀어낸다(supersedes, 지우지 않는다)
 * - 같은 명령 id 의 재요청 = 같은 묶음(replayed). 같은 명령 id 에 다른 내용 = 409
 * - 저장 뒤 OPERATIONAL_INPUT_CHANGED → 그 기록에 기댄 계획 판을 다시 본다(OUTDATED)
 */
@Injectable()
export class PlanningInputService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(TruthRepository) private readonly truthRepo: TruthRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
  ) {}

  // ------------------------------------------------------------------ 실제 계획 실행 만들기

  /** 실제(시뮬레이션 아닌) 계획 실행 — 기준 시각 = 지금, 계획일 = 그 서울 날짜. 시나리오 팩과 섞이지 않는다. 같은 명령 id = 같은 실행 */
  async createLiveRun(actorHeader: string | undefined, body: unknown): Promise<{ recovery_run_id: string; plan_day: string; created: boolean; mode: 'LIVE' }> {
    const human = await this.human(actorHeader);
    const parsed = createRunSchema.safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_RUN_REQUEST', 'command_id (uuid) is required', ['command_id']);
    const triggerRef = `LIVE:${parsed.data.command_id}`;
    const now = this.clock.now();
    return this.tx.run(async (t) => {
      await t.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cera.live_run:${triggerRef}`}))`);
      const [existing] = await t.select({ runId: recoveryRun.runId, asOf: planningSnapshot.asOf }).from(recoveryRun).innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId)).where(eq(recoveryRun.triggerRef, triggerRef)).limit(1);
      if (existing) return { recovery_run_id: existing.runId, plan_day: Instant.fromDb(existing.asOf).toSeoulIso().slice(0, 10), created: false, mode: 'LIVE' as const };
      const snapshotId = this.ids.newId();
      const runId = this.ids.newId();
      await t.insert(planningSnapshot).values({
        snapshotId,
        asOf: now.toDb(),
        factFingerprint: canonicalHash({ k: 'snap-facts', v: 1, facts: [] }),
        ruleVersion: 'live-run/1',
        tariffVersion: 'live-run/1',
        policyVersion: 'live-run/1',
        scopeRef: { kind: 'LIVE_RUN', note: parsed.data.note ?? 'Live recovery run — operational inputs from people, no scenario values' },
        containsSimulated: false,
        createdAt: now.toDb(),
        scenarioId: null,
      });
      await t.insert(recoveryRun).values({ runId, snapshotId, triggerType: 'OPERATOR_REQUEST', triggerRef, objectiveVersion: 'live-run/1', runStatus: 'FEASIBLE', totalCostKrw: null, containsSimulated: false, executedAt: now.toDb() });
      await this.audit.record(t, { actorId: human, action: AUDIT_ACTION.LIVE_RUN_CREATED, targetType: 'RECOVERY_RUN', targetId: runId, result: 'SUCCESS', isSimulated: false });
      return { recovery_run_id: runId, plan_day: now.toSeoulIso().slice(0, 10), created: true, mode: 'LIVE' as const };
    });
  }

  // ------------------------------------------------------------------ 일괄 입력

  importContainers(runId: string, actorHeader: string | undefined, body: unknown): Promise<ImportReport> {
    return this.importBatch('CONTAINERS', runId, actorHeader, body);
  }
  /**
   * 운영 기준 계획(T-132) — 어느 복구 실행에도 속하지 않은 예정 반입. 내부 시스템에서 내보낸 "원래 계획"을 그대로 넣고,
   * 예외 탐지기가 이것과 Truth 수용량을 비교한다(사람이 복구 실행을 먼저 만들 필요가 없다). 검증 · 판 · 멱등 규칙은 실행 입력과 같다
   */
  importBaselineContainers(actorHeader: string | undefined, body: unknown): Promise<ImportReport> {
    return this.importBatch('CONTAINERS', null, actorHeader, body);
  }
  importRates(actorHeader: string | undefined, body: unknown): Promise<ImportReport> {
    return this.importBatch('RATES', null, actorHeader, body);
  }
  importProfiles(actorHeader: string | undefined, body: unknown): Promise<ImportReport> {
    return this.importBatch('FACILITY_PROFILES', null, actorHeader, body);
  }

  private async importBatch(kind: ImportKind, runId: string | null, actorHeader: string | undefined, body: unknown): Promise<ImportReport> {
    const human = await this.human(actorHeader);
    const parsed = importSchema.safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_IMPORT_REQUEST', 'command_id (uuid) and exactly one of csv (text) or rows (array); dry_run optional', parsed.error.issues.map((i) => i.path.join('.') || 'body'));
    const req = parsed.data;
    const ctx = await this.context(kind, runId);
    const table = readTable(kind, req);
    const dryRun = req.dry_run === true;
    const base = { kind, dry_run: dryRun, recovery_run_id: runId, replayed: false, batch_id: null };
    if ('errors' in table) return this.rejected({ ...base, content_hash: '', row_count: 0, valid_rows: 0, errors: table.errors });
    const v = this.validate(kind, table.rows, ctx, runId);
    if (v.errors.length > 0) return this.rejected({ ...base, content_hash: v.content_hash, row_count: table.rows.length, valid_rows: v.rows.length, errors: v.errors });

    const diff = (heads: Head[]) => {
      const by = new Map(heads.map((h) => [h.identity, h]));
      const out = { new: [] as typeof v.rows, changed: [] as { row: (typeof v.rows)[number]; head: Head }[], unchanged: 0 };
      for (const r of v.rows) {
        const h = by.get(r.identity);
        if (!h) out.new.push(r);
        else if (h.contentHash !== r.content_hash) out.changed.push({ row: r, head: h });
        else out.unchanged += 1;
      }
      return out;
    };
    const report = (d: ReturnType<typeof diff>, extra: Partial<ImportReport>): ImportReport => ({
      ...base,
      stored: false,
      content_hash: v.content_hash,
      row_count: v.rows.length,
      valid_rows: v.rows.length,
      invalid_rows: 0,
      changes: { new: d.new.length, changed: d.changed.length, unchanged: d.unchanged },
      errors: [],
      note: '',
      ...extra,
    });
    if (dryRun) {
      const d = diff(await this.heads(kind, runId));
      return report(d, { note: `Validation only — nothing stored. ${d.new.length} new, ${d.changed.length} changed (a new version supersedes the current one), ${d.unchanged} unchanged.` });
    }

    const result = await this.tx.run(async (t) => {
      await t.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cera.planning_input:${kind}:${runId ?? 'global'}`}))`);
      const [prev] = await t.select().from(planningInputBatch).where(and(eq(planningInputBatch.submittedByActorId, human), eq(planningInputBatch.commandId, req.command_id))).limit(1);
      if (prev) {
        if (prev.inputKind !== kind || prev.recoveryRunId !== runId || prev.contentHash !== v.content_hash) throw new BusinessRuleError('COMMAND_ID_REUSED', 'This command_id was already used for different input', 409);
        return { replayed: true as const, batchId: prev.batchId, d: { new: [], changed: [], unchanged: prev.unchangedCount }, accepted: prev.acceptedCount };
      }
      const d = diff(await this.heads(kind, runId, t));
      const batchId = this.ids.newId();
      const now = this.clock.now().toDb();
      await t.insert(planningInputBatch).values({
        batchId,
        inputKind: kind,
        recoveryRunId: runId,
        commandId: req.command_id,
        submittedByActorId: human,
        sourceType: req.csv !== undefined ? 'CSV' : 'ROWS',
        sourceLabel: req.source_label ?? null,
        contentHash: v.content_hash,
        rowCount: v.rows.length,
        acceptedCount: d.new.length + d.changed.length,
        unchangedCount: d.unchanged,
        submittedAt: now,
      });
      const writes = [...d.new.map((row) => ({ row, supersedes: null as string | null })), ...d.changed.map((c) => ({ row: c.row, supersedes: c.head.id }))];
      if (writes.length) await this.insertRows(t, kind, batchId, runId, now, writes);
      await this.audit.record(t, { actorId: human, action: AUDIT_ACTION.PLANNING_INPUT_IMPORTED, targetType: 'PLANNING_INPUT_BATCH', targetId: batchId, result: 'SUCCESS', isSimulated: false });
      return { replayed: false as const, batchId, d, accepted: writes.length };
    });
    if (!result.replayed && result.accepted > 0) this.signals.emit({ type: 'OPERATIONAL_INPUT_CHANGED', kind, recoveryRunId: runId });
    return report(result.d as ReturnType<typeof diff>, {
      stored: true,
      replayed: result.replayed,
      batch_id: result.batchId,
      note: result.replayed ? 'Same command_id and content — the earlier batch is returned, nothing new stored.' : `Stored as one batch: ${result.accepted} new version(s); unchanged rows add nothing.`,
    });
  }

  private rejected(r: Omit<ImportReport, 'stored' | 'invalid_rows' | 'changes' | 'note'>): ImportReport {
    const invalid = new Set(r.errors.filter((e) => e.row > 0).map((e) => e.row)).size;
    const report: ImportReport = { ...r, stored: false, invalid_rows: invalid, changes: { new: 0, changed: 0, unchanged: 0 }, note: 'Nothing stored: fix the listed rows and send the whole file again (one batch is stored all-or-nothing).' };
    if (r.dry_run) return report;
    throw new BusinessRuleError('INVALID_PLANNING_INPUT', `${r.errors.length} error(s) — nothing stored`, 422, report as unknown as Record<string, unknown>);
  }

  private validate(kind: ImportKind, rows: { row: number; cells: Record<string, string> }[], ctx: ImportContext, runId: string | null): ValidatedImport<ContainerRow | RateRow | ProfileRow> {
    if (kind === 'CONTAINERS') return validateContainers(rows, ctx, runId);
    if (kind === 'RATES') return validateRates(rows, ctx);
    return validateProfiles(rows, ctx);
  }

  private async insertRows(t: DbTransaction, kind: ImportKind, batchId: string, runId: string | null, now: string, writes: { row: ContainerRow | RateRow | ProfileRow; supersedes: string | null }[]): Promise<void> {
    const hashOf = (r: unknown) => (r as { content_hash: string }).content_hash;
    if (kind === 'CONTAINERS') {
      await t.insert(planningContainerRecord).values(
        writes.map(({ row, supersedes }) => {
          const r = row as ContainerRow;
          return { recordId: this.ids.newId(), batchId, recoveryRunId: runId, containerNo: r.container_no, containerId: r.container_id, sizeType: r.size_type, carrierCode: r.carrier_code, priority: r.priority, lfd: r.lfd, pickupReady: r.pickup_ready, currentTerminal: r.current_terminal, destinationFacilityId: r.destination_facility_id, plannedDay: r.planned_day, plannedDepartHour: r.planned_depart_hour, alternateDestinationAllowed: r.alternate_destination_allowed, recordStatus: r.record_status, rowNo: r.row_no, contentHash: hashOf(row), supersedesRecordId: supersedes, recordedAt: now };
        }),
      );
    } else if (kind === 'RATES') {
      await t.insert(tariffRate).values(
        writes.map(({ row, supersedes }) => {
          const r = row as RateRow;
          return { rateId: this.ids.newId(), batchId, rateType: r.rate_type, carrierCode: r.carrier_code, fromRef: r.from_ref, toRef: r.to_ref, sizeType: r.size_type, amount: BigInt(r.amount), unit: r.unit, effectiveFrom: r.effective_from, effectiveUntil: r.effective_until, sourceNote: r.source_note, recordStatus: r.record_status, rowNo: r.row_no, contentHash: hashOf(row), supersedesRateId: supersedes, recordedAt: now };
        }),
      );
    } else {
      await t.insert(facilityPlanningProfile).values(
        writes.map(({ row, supersedes }) => {
          const r = row as ProfileRow;
          return { profileId: this.ids.newId(), batchId, facilityId: r.facility_id, accepts: r.accepts, openFromHour: r.open_from_hour, lastDepartureHour: r.last_departure_hour, tripHours: r.trip_hours, maxStorageDays: r.max_storage_days, recordStatus: r.record_status, rowNo: r.row_no, contentHash: hashOf(row), supersedesProfileId: supersedes, recordedAt: now };
        }),
      );
    }
  }

  /** 지금 판(밀리지 않은 것) — 철회(WITHDRAWN) 판도 판이다(같은 내용이면 새 판 없음). */
  private async heads(kind: ImportKind, runId: string | null, q: Database | DbTransaction = this.db): Promise<Head[]> {
    if (kind === 'CONTAINERS') {
      return (await this.containerHeads(runId, q)).map((r) => ({ id: r.recordId, identity: r.containerNo, contentHash: r.contentHash }));
    }
    if (kind === 'RATES') return (await this.rateHeads(q)).map((r) => ({ id: r.rateId, identity: [r.rateType, r.carrierCode ?? '', r.fromRef ?? '', r.toRef ?? '', r.sizeType ?? '', r.effectiveFrom].join('|'), contentHash: r.contentHash }));
    return (await this.profileHeads(q)).map((r) => ({ id: r.profileId, identity: r.facilityId, contentHash: r.contentHash }));
  }

  /** runId = null → 운영 기준 계획(T-132) */
  private containerHeads(runId: string | null, q: Database | DbTransaction = this.db) {
    return q
      .select()
      .from(planningContainerRecord)
      .where(and(runId === null ? isNull(planningContainerRecord.recoveryRunId) : eq(planningContainerRecord.recoveryRunId, runId), sql`NOT EXISTS (SELECT 1 FROM cera.planning_container_record s WHERE s.supersedes_record_id = ${planningContainerRecord.recordId})`))
      .orderBy(asc(planningContainerRecord.containerNo));
  }
  private rateHeads(q: Database | DbTransaction = this.db) {
    return q.select().from(tariffRate).where(sql`NOT EXISTS (SELECT 1 FROM cera.tariff_rate s WHERE s.supersedes_rate_id = ${tariffRate.rateId})`).orderBy(asc(tariffRate.rateType), asc(tariffRate.effectiveFrom));
  }
  private profileHeads(q: Database | DbTransaction = this.db) {
    return q.select().from(facilityPlanningProfile).where(sql`NOT EXISTS (SELECT 1 FROM cera.facility_planning_profile s WHERE s.supersedes_profile_id = ${facilityPlanningProfile.profileId})`).orderBy(asc(facilityPlanningProfile.facilityId));
  }

  // ------------------------------------------------------------------ 읽기 · 계획 입력 원천

  async containers(runId: string) {
    await this.liveRun(runId);
    const rows = await this.containerHeads(runId);
    return { recovery_run_id: runId, records: rows.map((r) => this.containerView(r)) };
  }
  /** 운영 기준 계획의 지금 판(T-132) */
  async baselineContainers() {
    const rows = await this.containerHeads(null);
    return { recovery_run_id: null, scope: 'OPERATIONAL_BASELINE' as const, records: rows.map((r) => this.containerView(r)) };
  }
  async rates() {
    return { records: (await this.rateHeads()).map((r) => ({ rate_id: r.rateId, rate_type: r.rateType, carrier_code: r.carrierCode, from_ref: r.fromRef, to_ref: r.toRef, size_type: r.sizeType, amount: Number(r.amount), unit: r.unit, effective_from: r.effectiveFrom, effective_until: r.effectiveUntil, source_note: r.sourceNote, record_status: r.recordStatus, batch_id: r.batchId, supersedes_rate_id: r.supersedesRateId, recorded_at: Instant.fromDb(r.recordedAt).toSeoulIso() })) };
  }
  async profiles() {
    return { records: (await this.profileHeads()).map((r) => ({ profile_id: r.profileId, facility_id: r.facilityId, accepts: r.accepts, open_from_hour: r.openFromHour, last_departure_hour: r.lastDepartureHour, trip_hours: r.tripHours, max_storage_days: r.maxStorageDays, record_status: r.recordStatus, batch_id: r.batchId, supersedes_profile_id: r.supersedesProfileId, recorded_at: Instant.fromDb(r.recordedAt).toSeoulIso() })) };
  }
  async batch(batchId: string) {
    if (!uuid.safeParse(batchId).success) throw new ValidationError('INVALID_ID', 'batch id must be a UUID', ['batchId']);
    const [b] = await this.db.select().from(planningInputBatch).where(eq(planningInputBatch.batchId, batchId)).limit(1);
    if (!b) throw new BusinessRuleError('NOT_FOUND', 'No planning input batch with this id', 404);
    return { batch_id: b.batchId, kind: b.inputKind, recovery_run_id: b.recoveryRunId, source_type: b.sourceType, source_label: b.sourceLabel, content_hash: b.contentHash, submitted_by_actor_id: b.submittedByActorId, submitted_at: Instant.fromDb(b.submittedAt).toSeoulIso(), row_count: b.rowCount, accepted_count: b.acceptedCount, unchanged_count: b.unchangedCount };
  }

  private containerView(r: typeof planningContainerRecord.$inferSelect) {
    return { record_id: r.recordId, container_no: r.containerNo, container_id: r.containerId, size_type: r.sizeType, carrier_code: r.carrierCode, priority: r.priority, lfd: r.lfd, pickup_ready: r.pickupReady, current_terminal: r.currentTerminal, destination_facility_id: r.destinationFacilityId, planned_day: r.plannedDay, planned_depart_hour: r.plannedDepartHour, alternate_destination_allowed: r.alternateDestinationAllowed, record_status: r.recordStatus, batch_id: r.batchId, supersedes_record_id: r.supersedesRecordId, recorded_at: Instant.fromDb(r.recordedAt).toSeoulIso() };
  }

  /** 계획 입력 원천(지금 판, ACTIVE 만): 이 실행의 컨테이너 · 계획일에 유효한 요율 · 시설 계획 정보 · 기록 없는 범위 안 공공 컨테이너. */
  async operationalSources(runId: string, planDay: string): Promise<{ containers: ContainerRecordIn[]; rates: RateIn[]; profiles: ProfileIn[]; unrecordedPublicContainers: string[] }> {
    const recs = (await this.containerHeads(runId)).filter((r) => r.recordStatus === 'ACTIVE');
    const rates = (await this.rateHeads()).filter((r) => r.recordStatus === 'ACTIVE' && r.effectiveFrom <= planDay && (r.effectiveUntil === null || r.effectiveUntil >= planDay));
    const profiles = (await this.profileHeads()).filter((r) => r.recordStatus === 'ACTIVE');
    const recorded = new Set((await this.containerHeads(runId)).map((r) => r.containerNo));
    const pub = await this.publicContainers(runId);
    return {
      containers: recs.map((r) => ({ record_id: r.recordId, container_no: r.containerNo, container_id: r.containerId, size_type: r.sizeType, carrier_code: r.carrierCode, priority: r.priority as ContainerRecordIn['priority'], lfd: r.lfd, pickup_ready: r.pickupReady, current_terminal: r.currentTerminal, destination_facility_id: r.destinationFacilityId, planned_day: r.plannedDay, planned_depart_hour: r.plannedDepartHour, alternate_destination_allowed: r.alternateDestinationAllowed, content_hash: r.contentHash })),
      rates: rates.map((r) => ({ rate_id: r.rateId, rate_type: r.rateType, carrier_code: r.carrierCode, from_ref: r.fromRef, to_ref: r.toRef, size_type: r.sizeType, amount: Number(r.amount), effective_from: r.effectiveFrom, content_hash: r.contentHash })),
      profiles: profiles.map((r) => ({ profile_id: r.profileId, facility_id: r.facilityId, accepts: r.accepts, open_from_hour: r.openFromHour, last_departure_hour: r.lastDepartureHour, trip_hours: r.tripHours, max_storage_days: r.maxStorageDays, content_hash: r.contentHash })),
      unrecordedPublicContainers: [...pub.keys()].filter((no) => !recorded.has(no)).sort(),
    };
  }

  /** 범위 안 공공데이터 컨테이너(스냅숏 scope_ref.vessel_call_ids) — 아무 컨테이너나 끌어오지 않는다. */
  private async publicContainers(runId: string): Promise<Map<string, { id: string; sizeType: string | null }>> {
    const [snap] = await this.db.select({ scope: planningSnapshot.scopeRef }).from(planningSnapshot).innerJoin(recoveryRun, eq(recoveryRun.snapshotId, planningSnapshot.snapshotId)).where(eq(recoveryRun.runId, runId)).limit(1);
    const scoped = z.array(z.string().uuid()).safeParse((snap?.scope as { vessel_call_ids?: unknown } | null)?.vessel_call_ids);
    if (!scoped.success || scoped.data.length === 0) return new Map();
    const rows = await this.db.select({ id: container.containerId, no: container.containerNo, size: container.sizeType }).from(container).where(and(inArray(container.vesselCallId, scoped.data), eq(container.isActive, true), eq(container.isSimulated, false)));
    return new Map(rows.map((r) => [r.no, { id: r.id, sizeType: r.size }]));
  }

  private async context(kind: ImportKind, runId: string | null): Promise<ImportContext> {
    const facilities = (await this.db.select({ id: facility.facilityId, name: facility.facilityName, type: facility.facilityType, isActive: facility.isActive }).from(facility)).map((f) => ({ ...f }));
    if (kind !== 'CONTAINERS') return { planDay: null, facilities, publicContainers: new Map() };
    // 운영 기준 계획: 기준 날짜 = 오늘(서울). 공공데이터 범위가 없으므로 컨테이너는 행에 적힌 그대로
    if (runId === null) return { planDay: this.clock.now().toSeoulIso().slice(0, 10), facilities, publicContainers: new Map() };
    const run = await this.liveRun(runId);
    return { planDay: run.planDay, facilities, publicContainers: await this.publicContainers(runId!) };
  }

  private async liveRun(runId: string): Promise<{ planDay: string }> {
    if (!uuid.safeParse(runId).success) throw new ValidationError('INVALID_ID', 'recovery run id must be a UUID', ['runId']);
    const [row] = await this.db.select({ sim: recoveryRun.containsSimulated, asOf: planningSnapshot.asOf }).from(recoveryRun).innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId)).where(eq(recoveryRun.runId, runId)).limit(1);
    if (!row) throw new BusinessRuleError('NOT_FOUND', 'No recovery run with this id', 404);
    // 시뮬레이션 실행은 시나리오 팩이 입력이다 — 실제 운영 기록을 그 실행에 섞지 않는다
    if (row.sim) throw new BusinessRuleError('NOT_A_LIVE_RUN', 'This is a simulated (scenario) run — operational inputs go to live runs only', 409);
    return { planDay: Instant.fromDb(row.asOf).toSeoulIso().slice(0, 10) };
  }

  private async human(actorHeader: string | undefined): Promise<string> {
    if (!actorHeader) throw new ValidationError('ACTOR_REQUIRED', 'X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    if (!uuid.safeParse(actorHeader).success) throw new ValidationError('INVALID_ID', 'X-CERA-Actor-Id must be a UUID', ['x-cera-actor-id']);
    const h = await this.truthRepo.activeHuman(actorHeader);
    if (!h) throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can enter planning inputs', 403);
    return h.actorId;
  }
}
