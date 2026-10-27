import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DATABASE, type Database } from '../db/database.js';
import { actor, counterparty, facility } from '../db/schema/index.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION } from '../persistence/catalog.js';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { CounterpartyAddressRow } from '../persistence/registry-reader.js';
import { RegistryReader } from '../persistence/registry-reader.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { type ChannelType, type DevSafetyPolicy, type GateResult, evaluateContactGate } from './contact-gate.js';
import type { AddressStatusDto, ContactEligibilityDto, CounterpartyListDto, CounterpartySummaryDto, FacilityListDto } from './dto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 등록부 조회 + 발송 자격 판정(U2). 판정은 매번 `evaluateContactGate`(순수 함수)로 새로 계산한다 — 저장하지 않는다.
 * 읽기만 하므로 감사 기록을 남기지 않는다(승인 · 발송 시점의 판정 기록은 U4 · U5).
 */
@Injectable()
export class RegistryService {
  private readonly safety: DevSafetyPolicy;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(RegistryReader) private readonly registry: RegistryReader,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) env: Env,
  ) {
    this.safety = { appEnv: env.APP_ENV, allowlist: env.CERA_TEST_RECIPIENT_ALLOWLIST };
  }

  async listCounterparties(): Promise<CounterpartyListDto> {
    const rows = await this.registry.listCounterpartyAddresses();
    const evaluatedAt = this.clock.now().toSeoulIso();
    const byCounterparty = new Map<string, CounterpartySummaryDto>();
    for (const row of rows) {
      let cp = byCounterparty.get(row.counterpartyId);
      if (!cp) {
        cp = {
          counterparty_id: row.counterpartyId,
          display_name: row.counterpartyName,
          source_role: row.sourceRole as CounterpartySummaryDto['source_role'],
          is_active: row.counterpartyIsActive,
          contacts: [],
        };
        byCounterparty.set(row.counterpartyId, cp);
      }
      let contact = cp.contacts.find((c) => c.contact_id === row.contactId);
      if (!contact) {
        contact = { contact_id: row.contactId, person_name: row.personName, team: row.team, is_active: row.contactIsActive, addresses: [] };
        cp.contacts.push(contact);
      }
      const gate = this.evaluate(row);
      contact.addresses.push({ ...addressStatus(row), eligible: gate.eligible, reasons: gate.reasons });
    }
    return { counterparties: [...byCounterparty.values()], evaluated_at: evaluatedAt };
  }

  async listFacilities(): Promise<FacilityListDto> {
    const rows = await this.registry.listFacilities();
    return {
      facilities: rows.map((f) => ({
        facility_id: f.facilityId,
        facility_type: f.facilityType as FacilityListDto['facilities'][number]['facility_type'],
        facility_name: f.facilityName,
        area: f.area,
        operator_counterparty_id: f.operatorCounterpartyId,
      })),
    };
  }

  async getEligibility(addressId: string): Promise<ContactEligibilityDto> {
    if (!UUID.test(addressId)) throw new ValidationError('INVALID_ID', 'addressId must be a UUID', ['addressId']);
    const row = await this.registry.findAddress(addressId);
    if (!row) throw new BusinessRuleError('ADDRESS_NOT_FOUND', 'No contact address with this id', 404);
    const gate = this.evaluate(row);
    return {
      address: addressStatus(row),
      contact: { contact_id: row.contactId, person_name: row.personName, is_active: row.contactIsActive },
      counterparty: { counterparty_id: row.counterpartyId, display_name: row.counterpartyName, is_active: row.counterpartyIsActive },
      eligible: gate.eligible,
      conditions: gate.conditions,
      reasons: gate.reasons,
      dev_safety_applied: gate.devSafetyApplied,
      evaluated_at: this.clock.now().toSeoulIso(),
    };
  }

  private evaluate(row: CounterpartyAddressRow): GateResult {
    return evaluateContactGate(
      {
        counterparty: { isActive: row.counterpartyIsActive },
        contact: { isActive: row.contactIsActive },
        address: {
          channelType: row.channelType as ChannelType,
          normalizedAddress: row.normalizedAddress,
          emailVerificationStatus: row.emailVerificationStatus,
          relationshipStatus: row.relationshipStatus,
          communicationStatus: row.communicationStatus,
        },
      },
      this.safety,
    );
  }

  /**
   * 시설 운영 거래처 지정(운영 준비) — 문의 · 반입 요청의 받는 사람이 정해지는 유일한 길. ADMIN(registry.manage) · 활성 HUMAN · 감사.
   * 거래처 역할이 시설 종류와 맞아야 한다(ODCY 시설 ↔ ODCY 거래처 · 창고 ↔ WAREHOUSE). null = 해제(그 시설은 아무에게도 묻지 않는다).
   */
  async setFacilityOperator(facilityId: string, actorHeader: string | undefined, body: unknown): Promise<FacilityListDto['facilities'][number]> {
    if (!UUID.test(facilityId)) throw new ValidationError('INVALID_ID', 'facilityId must be a UUID', ['facilityId']);
    if (!actorHeader || !UUID.test(actorHeader)) throw new ValidationError('ACTOR_REQUIRED', 'X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    const parsed = z.object({ counterparty_id: z.string().uuid().nullable() }).strict().safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_REGISTRY_REQUEST', 'counterparty_id (uuid or null) is required', ['counterparty_id']);
    const [human] = await this.db.select({ id: actor.actorId }).from(actor).where(and(eq(actor.actorId, actorHeader), eq(actor.actorType, 'HUMAN'), eq(actor.isActive, true))).limit(1);
    if (!human) throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human can change the registry', 403);
    const [f] = await this.db.select({ id: facility.facilityId, type: facility.facilityType }).from(facility).where(eq(facility.facilityId, facilityId)).limit(1);
    if (!f) throw new BusinessRuleError('NOT_FOUND', 'No facility with this id', 404);
    const cp = parsed.data.counterparty_id;
    if (cp) {
      const [c] = await this.db.select({ role: counterparty.sourceRole, active: counterparty.isActive }).from(counterparty).where(eq(counterparty.counterpartyId, cp)).limit(1);
      if (!c) throw new BusinessRuleError('NOT_FOUND', 'No counterparty with this id', 404);
      if (!c.active) throw new BusinessRuleError('COUNTERPARTY_INACTIVE', 'The counterparty is not active', 409);
      if (c.role !== f.type) throw new BusinessRuleError('ROLE_MISMATCH', `A ${f.type} facility needs a ${f.type} counterparty (this one is ${c.role})`, 422);
    }
    await this.tx.run(async (t) => {
      await t.update(facility).set({ operatorCounterpartyId: cp }).where(eq(facility.facilityId, facilityId));
      await this.audit.record(t, { actorId: human.id, action: AUDIT_ACTION.FACILITY_OPERATOR_SET, targetType: 'FACILITY', targetId: facilityId, result: 'SUCCESS', isSimulated: false });
    });
    return (await this.listFacilities()).facilities.find((x) => x.facility_id === facilityId)!;
  }
}

function addressStatus(row: CounterpartyAddressRow): AddressStatusDto {
  return {
    address_id: row.addressId,
    channel_type: row.channelType as AddressStatusDto['channel_type'],
    normalized_address: row.normalizedAddress,
    email_verification_status: row.emailVerificationStatus as AddressStatusDto['email_verification_status'],
    relationship_status: row.relationshipStatus as AddressStatusDto['relationship_status'],
    communication_status: row.communicationStatus as AddressStatusDto['communication_status'],
    is_simulated: row.channelType === 'MOCK',
  };
}
