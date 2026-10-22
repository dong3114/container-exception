import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ContentService } from '../content/content-service.js';
import { DATABASE, type Database } from '../db/database.js';
import {
  actor,
  contactChannelAddress,
  counterparty,
  counterpartyContact,
  facility,
  planningSnapshot,
  rawInput,
  recoveryRun,
  scenario,
  truckPool,
} from '../db/schema/index.js';
import { TransactionRunner } from '../db/transaction.js';
import { EventWriter } from '../persistence/event-writer.js';
import { canonicalHash, canonicalJson } from '../shared/hash/hash.js';
import { Instant } from '../shared/time/instant.js';
import { PACK_FACILITY_IDS, SEED_IDS, SEED_SOURCE_NAME } from './slice1-fixture.js';

const ScenarioFile = z.object({
  scenario_id: z.string(),
  title: z.string(),
  version: z.string(),
  is_simulated: z.literal(true),
  steps: z.array(z.object({ step_id: z.string(), as_of: z.string() })).min(1),
});
const Window = z.object({ from: z.string(), to: z.string() });
const Fact = z.object({ from_step: z.string(), key: z.string(), value: z.number(), trust: z.object({ evidence_time: z.string() }) });
const ResourcesFile = z.object({
  is_simulated: z.literal(true),
  warehouses: z.array(z.object({ id: z.string(), name: z.string(), area: z.string(), receiving_window: Window, facts_timeline: z.array(Fact) })),
  odcys: z.array(z.object({ id: z.string(), name: z.string(), area: z.string() })),
  truck_pools: z.array(z.object({ id: z.string(), name: z.string(), owner: z.string() })),
});
const CommunicationsFile = z.object({
  is_simulated: z.literal(true),
  threads: z.array(z.object({ counterparty: z.string(), counterparty_role: z.string() })),
});
const PlansFile = z.object({
  is_simulated: z.literal(true),
  plans: z.array(z.object({ plan_id: z.string(), generated_at: z.string(), plan_cost_krw: z.number().int().nonnegative() })).min(1),
});

export interface SeedSummary {
  /** 이번 실행에서 새로 넣은 행 수(두 번째 실행은 0). */
  inserted: number;
  capacityEventCreated: boolean;
}

const VERSION = (v: string) => `scenario-${v}`.slice(0, 20);

/**
 * Slice 1 시드(docs/24 21절) — migration 과 분리된 명령. local · test 에서만(run-seed.ts 가 막는다).
 * - 앱 역할로 쓴다: 트리거·권한을 그대로 통과해야 한다
 * - 고정 UUIDv7 + `ON CONFLICT DO NOTHING` → 반복 실행해도 같은 행
 * - 모든 기록 행은 `is_simulated = true` + `scenario_id`, 계획 시드는 `contains_simulated = true`
 * - 창고 수용량 초기 사실은 사람 입력 경로 그대로: 내용 저장(4단계) → raw_input(HUMAN_UI) → event → SUBJECT 링크
 * - gap fixture 는 DB 에 넣지 않는다(Mock 계획 제공자가 팩 파일을 읽는다)
 */
@Injectable()
export class Slice1Seed {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(EventWriter) private readonly events: EventWriter,
  ) {}

  async apply(packDir: string): Promise<SeedSummary> {
    const read = <T>(file: string, schema: z.ZodType<T>): T => schema.parse(JSON.parse(readFileSync(join(packDir, file), 'utf8')));
    const sc = read('scenario.json', ScenarioFile);
    const res = read('resources.json', ResourcesFile);
    const comms = read('communications.json', CommunicationsFile);
    const plans = read('plans.json', PlansFile);

    const asOfBase = Instant.parseIso(sc.steps[0]!.as_of).toDb();
    const truckerName = comms.threads.find((t) => t.counterparty_role === 'TRUCKER')?.counterparty ?? 'Trucking (simulated)';
    const odcyName = comms.threads.find((t) => t.counterparty_role === 'ODCY')?.counterparty ?? 'ODCY (simulated)';
    const partnerPool = res.truck_pools.find((p) => p.owner !== 'OPERATOR_ORG');
    const plan = plans.plans[0]!;

    let inserted = 0;
    const count = (rows: unknown[]) => {
      inserted += rows.length;
    };

    await this.tx.run(async (tx) => {
      count(
        await tx
          .insert(scenario)
          .values({
            scenarioId: SEED_IDS.scenario,
            scenarioName: sc.title.slice(0, 100),
            description: `${sc.scenario_id} v${sc.version} — simulated data pack`.slice(0, 300),
            dataPackRef: `data/scenarios/${sc.scenario_id}`,
            asOfBase,
            createdAt: asOfBase,
          })
          .onConflictDoNothing()
          .returning({ id: scenario.scenarioId }),
      );
      count(
        await tx
          .insert(actor)
          .values([
            { actorId: SEED_IDS.actorSystem, actorType: 'SYSTEM', displayName: 'CERA System' },
            { actorId: SEED_IDS.actorOperator, actorType: 'HUMAN', displayName: '운영자 (가상)' },
            { actorId: SEED_IDS.actorAgent, actorType: 'AI_AGENT', displayName: 'CERA Agent Runtime' },
          ])
          .onConflictDoNothing()
          .returning({ id: actor.actorId }),
      );
      count(
        await tx
          .insert(counterparty)
          .values([
            { counterpartyId: SEED_IDS.counterpartyTrucking, displayName: (partnerPool?.name ?? truckerName).slice(0, 100), sourceRole: 'TRUCKING' },
            { counterpartyId: SEED_IDS.counterpartyOdcy, displayName: 'ODCY A (가상)', sourceRole: 'ODCY' },
            { counterpartyId: SEED_IDS.counterpartyWarehouse, displayName: '창고 A (가상)', sourceRole: 'WAREHOUSE' },
          ])
          .onConflictDoNothing()
          .returning({ id: counterparty.counterpartyId }),
      );
      count(
        await tx
          .insert(counterpartyContact)
          .values([
            { contactId: SEED_IDS.contactTrucking, counterpartyId: SEED_IDS.counterpartyTrucking, personName: truckerName.slice(0, 60) },
            { contactId: SEED_IDS.contactOdcy, counterpartyId: SEED_IDS.counterpartyOdcy, personName: odcyName.slice(0, 60) },
            { contactId: SEED_IDS.contactWarehouse, counterpartyId: SEED_IDS.counterpartyWarehouse, personName: '창고 A 운영팀 (가상)' },
            { contactId: SEED_IDS.contactTruckingNight, counterpartyId: SEED_IDS.counterpartyTrucking, personName: '야간 배차 (가상)', team: '야간' },
          ])
          .onConflictDoNothing()
          .returning({ id: counterpartyContact.contactId }),
      );
      const approved = {
        channelType: 'MOCK',
        emailVerificationStatus: 'VERIFIED',
        relationshipStatus: 'APPROVED',
        communicationStatus: 'ACTIVE',
        verifiedAt: asOfBase,
        approvedByActorId: SEED_IDS.actorOperator,
        approvedAt: asOfBase,
      } as const;
      count(
        await tx
          .insert(contactChannelAddress)
          .values([
            { addressId: SEED_IDS.addressTrucking, contactId: SEED_IDS.contactTrucking, normalizedAddress: 'dispatch@k-trucking.example.invalid', ...approved },
            { addressId: SEED_IDS.addressOdcy, contactId: SEED_IDS.contactOdcy, normalizedAddress: 'sales@odcy-a.example.invalid', ...approved },
            // 막힌 주소(T-087): 확인 전 · 관계 승인 전 → NOT_VERIFIED + NOT_APPROVED
            {
              addressId: SEED_IDS.addressWarehouse,
              contactId: SEED_IDS.contactWarehouse,
              normalizedAddress: 'ops@warehouse-a.example.invalid',
              channelType: 'MOCK',
              emailVerificationStatus: 'UNVERIFIED',
              relationshipStatus: 'PENDING',
              communicationStatus: 'ACTIVE',
            },
            // 막힌 주소(T-087): 확인 · 승인됐지만 통신 일시 중지 → NOT_ACTIVE
            {
              addressId: SEED_IDS.addressTruckingNight,
              contactId: SEED_IDS.contactTruckingNight,
              normalizedAddress: 'night-dispatch@k-trucking.example.invalid',
              ...approved,
              communicationStatus: 'PAUSED',
            },
          ])
          .onConflictDoNothing()
          .returning({ id: contactChannelAddress.addressId }),
      );
      count(
        await tx
          .insert(facility)
          .values([
            ...res.warehouses.map((w) => ({
              facilityId: PACK_FACILITY_IDS[w.id] ?? missing(w.id),
              facilityType: 'WAREHOUSE',
              facilityName: w.name,
              area: w.area,
              defaultOpenTime: `${w.receiving_window.from}:00`,
              defaultCloseTime: `${w.receiving_window.to}:00`,
            })),
            ...res.odcys.map((o) => ({
              facilityId: PACK_FACILITY_IDS[o.id] ?? missing(o.id),
              facilityType: 'ODCY',
              facilityName: o.name,
              area: o.area,
            })),
          ])
          .onConflictDoNothing()
          .returning({ id: facility.facilityId }),
      );
      count(
        await tx
          .insert(truckPool)
          .values(
            res.truck_pools.map((p) =>
              p.owner === 'OPERATOR_ORG'
                ? { truckPoolId: SEED_IDS.truckPoolOwnFleet, poolName: p.name, ownership: 'OWN' }
                : { truckPoolId: SEED_IDS.truckPoolPartner, poolName: p.name, ownership: 'PARTNER', ownerCounterpartyId: SEED_IDS.counterpartyTrucking },
            ),
          )
          .onConflictDoNothing()
          .returning({ id: truckPool.truckPoolId }),
      );
      const snapshotFacts = res.warehouses.flatMap((w) =>
        w.facts_timeline.filter((f) => f.from_step === sc.steps[0]!.step_id).map((f) => ({ entity: w.id, key: f.key, value: String(f.value) })),
      );
      count(
        await tx
          .insert(planningSnapshot)
          .values({
            snapshotId: SEED_IDS.planningSnapshot,
            asOf: asOfBase,
            factFingerprint: canonicalHash({ k: 'snap-facts', v: 1, facts: snapshotFacts }),
            ruleVersion: VERSION(sc.version),
            tariffVersion: VERSION(sc.version),
            policyVersion: VERSION(sc.version),
            scopeRef: { data_pack: sc.scenario_id, note: 'Slice 1 seed snapshot (no child tables)' },
            containsSimulated: true,
            createdAt: asOfBase,
            scenarioId: SEED_IDS.scenario,
          })
          .onConflictDoNothing()
          .returning({ id: planningSnapshot.snapshotId }),
      );
      count(
        await tx
          .insert(recoveryRun)
          .values({
            runId: SEED_IDS.recoveryRunRoot,
            snapshotId: SEED_IDS.planningSnapshot,
            triggerType: 'EXCEPTION_DETECTED',
            triggerRef: plan.plan_id,
            objectiveVersion: VERSION(sc.version),
            runStatus: 'FEASIBLE',
            totalCostKrw: BigInt(plan.plan_cost_krw),
            containsSimulated: true,
            executedAt: Instant.parseIso(plan.generated_at).toDb(),
          })
          .onConflictDoNothing()
          .returning({ id: recoveryRun.runId }),
      );
    });

    const capacityEventCreated = await this.seedWarehouseCapacity(res, sc.steps[0]!.step_id);
    if (capacityEventCreated) inserted += 3; // raw_input · event · link
    return { inserted, capacityEventCreated };
  }

  /** 창고 A 의 첫 수용량 사실 — 사람 입력 경로(내용 저장 → raw_input → event → 링크). 이미 있으면 아무것도 하지 않는다. */
  private async seedWarehouseCapacity(res: z.infer<typeof ResourcesFile>, firstStep: string): Promise<boolean> {
    const existing = await this.db
      .select({ id: rawInput.rawInputId })
      .from(rawInput)
      .where(eq(rawInput.rawInputId, SEED_IDS.capacityRawInput))
      .limit(1);
    if (existing.length > 0) return false;

    const warehouse = res.warehouses.find((w) => w.id === 'WAREHOUSE_A') ?? missing('WAREHOUSE_A');
    const fact = warehouse.facts_timeline.find((f) => f.from_step === firstStep) ?? missing(`${warehouse.id} fact`);
    const enteredAt = Instant.parseIso(fact.trust.evidence_time).toDb();
    const command = {
      command: 'REPORT_WAREHOUSE_CAPACITY',
      command_id: SEED_IDS.capacityRawInput,
      facility_id: SEED_IDS.facilityWarehouseA,
      fact_key: fact.key,
      value: String(fact.value),
      unit: 'CONTAINER',
    };
    const bytes = new TextEncoder().encode(canonicalJson({ k: 'seed-command', v: 1, ...command }));
    const stored = await this.content.storeVerified('RAW_INPUT_PAYLOAD', bytes, 'application/json');

    let created = false;
    await this.tx.run(async (tx) => {
      const rawCreated = await this.events.insertRawInput(tx, {
        rawInputId: SEED_IDS.capacityRawInput,
        sourceType: 'HUMAN_UI',
        sourceName: SEED_SOURCE_NAME,
        sourceRecordKey: SEED_IDS.capacityRawInput,
        payloadRef: stored.ref,
        payloadHash: stored.sha256,
        receivedAt: enteredAt,
        collectedByActorId: SEED_IDS.actorOperator,
        isSimulated: true,
      });
      if (!rawCreated) return;
      created =
        (await this.events.recordHumanObservation(tx, {
          eventId: SEED_IDS.capacityEvent,
          rawInputId: SEED_IDS.capacityRawInput,
          eventType: 'WAREHOUSE_CAPACITY_CHANGED',
          factKind: 'STATE',
          factKey: fact.key,
          valueNumber: String(fact.value),
          valueUnit: 'CONTAINER',
          subject: { entityType: 'FACILITY', entityId: SEED_IDS.facilityWarehouseA },
          sourceRoleAtIngestion: 'WAREHOUSE',
          enteredByActorId: SEED_IDS.actorOperator,
          receivedAt: enteredAt,
          recordedAt: enteredAt,
          isSimulated: true,
          scenarioId: SEED_IDS.scenario,
        })) !== null;
    });
    return created;
  }
}

function missing(what: string): never {
  throw new Error(`data pack is missing ${what}`);
}
