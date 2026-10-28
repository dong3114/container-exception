import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DATABASE, type Database } from '../db/database.js';
import { actor, contactChannelAddress, counterparty, counterpartyContact, facility } from '../db/schema/index.js';
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
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { COUNTERPARTY_ROLE } from '../db/schema/codes.js';
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
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
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

  /** 활성 HUMAN 인지(등록부를 바꾸는 사람). 권한(registry.manage)은 가드가 먼저 본다 */
  async human(actorHeader: string | undefined): Promise<string> {
    if (!actorHeader || !UUID.test(actorHeader)) throw new ValidationError('ACTOR_REQUIRED', 'X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    const [h] = await this.db.select({ id: actor.actorId }).from(actor).where(and(eq(actor.actorId, actorHeader), eq(actor.actorType, 'HUMAN'), eq(actor.isActive, true))).limit(1);
    if (!h) throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human can change the registry', 403);
    return h.id;
  }

  /** T-127 거래처 등록(실행 중에도). 같은 역할 · 같은 이름(대소문자 · 앞뒤 공백 무시)이 이미 있으면 409 — 같은 회사를 두 번 만들지 않는다. */
  async createCounterparty(actorHeader: string | undefined, body: unknown): Promise<CounterpartySummaryDto> {
    const parsed = z
      .object({ display_name: z.string().trim().min(1).max(100), source_role: z.enum(COUNTERPARTY_ROLE), org_code: z.string().trim().min(1).max(30).optional() })
      .strict()
      .safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_REGISTRY_REQUEST', 'display_name (1-100) and source_role are required', parsed.error.issues.map((i) => i.path.join('.')));
    const actorId = await this.human(actorHeader);
    const { display_name, source_role, org_code } = parsed.data;
    const counterpartyId = this.ids.newId();
    await this.tx.run(async (t) => {
      const same = await t.select({ name: counterparty.displayName }).from(counterparty).where(eq(counterparty.sourceRole, source_role));
      if (same.some((c) => c.name.trim().toLowerCase() === display_name.toLowerCase())) throw new BusinessRuleError('COUNTERPARTY_ALREADY_REGISTERED', 'A counterparty with this role and name already exists', 409);
      await t.insert(counterparty).values({ counterpartyId, displayName: display_name, sourceRole: source_role, orgCode: org_code ?? null, isActive: true });
      await this.audit.record(t, { actorId, action: AUDIT_ACTION.COUNTERPARTY_CREATED, targetType: 'COUNTERPARTY', targetId: counterpartyId, result: 'SUCCESS', isSimulated: false });
    });
    this.signals.emit({ type: 'REGISTRY_CHANGED', counterpartyId });
    return this.summary(counterpartyId);
  }

  /**
   * T-127 연락처 + 주소 등록. 새 주소는 **자동으로 확인 · 승인되지 않는다**(UNVERIFIED · 관계 PENDING · 통신 ACTIVE) —
   * 관리자가 따로 확인 · 승인(`approveAddress`)해야 Contact Gate 를 통과한다. 같은 채널 · 같은 정규화 주소는 한 번만(409).
   */
  async createContact(counterpartyId: string, actorHeader: string | undefined, body: unknown): Promise<CounterpartySummaryDto> {
    if (!UUID.test(counterpartyId)) throw new ValidationError('INVALID_ID', 'counterpartyId must be a UUID', ['counterpartyId']);
    const parsed = z
      .object({
        person_name: z.string().trim().min(1).max(60),
        team: z.string().trim().min(1).max(60).optional(),
        note: z.string().trim().min(1).max(200).optional(),
        channel_type: z.enum(['GMAIL', 'MOCK']),
        address: z.string().trim().min(3).max(200),
      })
      .strict()
      .safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_REGISTRY_REQUEST', 'person_name, channel_type (GMAIL | MOCK) and address are required', parsed.error.issues.map((i) => i.path.join('.')));
    const normalized = normalizeAddress(parsed.data.address);
    if (!EMAIL.test(normalized)) throw new ValidationError('INVALID_ADDRESS', 'address must be an e-mail address', ['address']);
    const actorId = await this.human(actorHeader);
    const [c] = await this.db.select({ active: counterparty.isActive }).from(counterparty).where(eq(counterparty.counterpartyId, counterpartyId)).limit(1);
    if (!c) throw new BusinessRuleError('NOT_FOUND', 'No counterparty with this id', 404);
    if (!c.active) throw new BusinessRuleError('COUNTERPARTY_INACTIVE', 'The counterparty is not active', 409);
    const contactId = this.ids.newId();
    const addressId = this.ids.newId();
    await this.tx.run(async (t) => {
      const [dup] = await t
        .select({ id: contactChannelAddress.addressId })
        .from(contactChannelAddress)
        .where(and(eq(contactChannelAddress.channelType, parsed.data.channel_type), eq(contactChannelAddress.normalizedAddress, normalized)))
        .limit(1);
      if (dup) throw new BusinessRuleError('ADDRESS_ALREADY_REGISTERED', 'This channel address is already registered', 409);
      await t.insert(counterpartyContact).values({ contactId, counterpartyId, personName: parsed.data.person_name, team: parsed.data.team ?? null, note: parsed.data.note ?? null, isActive: true });
      await t.insert(contactChannelAddress).values({ addressId, contactId, channelType: parsed.data.channel_type, normalizedAddress: normalized, emailVerificationStatus: 'UNVERIFIED', relationshipStatus: 'PENDING', communicationStatus: 'ACTIVE' });
      await this.audit.record(t, { actorId, action: AUDIT_ACTION.CONTACT_CREATED, targetType: 'CONTACT_CHANNEL_ADDRESS', targetId: addressId, result: 'SUCCESS', isSimulated: parsed.data.channel_type === 'MOCK' });
    });
    this.signals.emit({ type: 'REGISTRY_CHANGED', counterpartyId });
    return this.summary(counterpartyId);
  }

  /**
   * T-127 관리자의 주소 확인 · 관계 승인 — 사람이 등록부 밖에서(전화 · 기존 거래) 이 주소가 그 회사 담당자의 것임을 확인했다는 기록이다
   * [ASSUMPTION — 메일 소유 확인 흐름(확인 메일 · 링크)은 아직 없다]. 누가 언제 승인했는지 남긴다. 이미 승인된 주소면 그대로 돌려준다.
   */
  async approveAddress(addressId: string, actorHeader: string | undefined): Promise<ContactEligibilityDto> {
    if (!UUID.test(addressId)) throw new ValidationError('INVALID_ID', 'addressId must be a UUID', ['addressId']);
    const actorId = await this.human(actorHeader);
    const [a] = await this.db
      .select({ v: contactChannelAddress.emailVerificationStatus, r: contactChannelAddress.relationshipStatus, channel: contactChannelAddress.channelType, counterpartyId: counterpartyContact.counterpartyId })
      .from(contactChannelAddress)
      .innerJoin(counterpartyContact, eq(counterpartyContact.contactId, contactChannelAddress.contactId))
      .where(eq(contactChannelAddress.addressId, addressId))
      .limit(1);
    if (!a) throw new BusinessRuleError('ADDRESS_NOT_FOUND', 'No address with this id', 404);
    if (a.r === 'REJECTED') throw new BusinessRuleError('ADDRESS_REJECTED', 'A rejected address is not approved again — register a new one', 409);
    if (a.v !== 'VERIFIED' || a.r !== 'APPROVED') {
      const now = this.clock.now().toDb();
      await this.tx.run(async (t) => {
        await t.update(contactChannelAddress).set({ emailVerificationStatus: 'VERIFIED', verifiedAt: now, relationshipStatus: 'APPROVED', approvedByActorId: actorId, approvedAt: now }).where(eq(contactChannelAddress.addressId, addressId));
        await this.audit.record(t, { actorId, action: AUDIT_ACTION.CONTACT_ADDRESS_APPROVED, targetType: 'CONTACT_CHANNEL_ADDRESS', targetId: addressId, result: 'SUCCESS', isSimulated: a.channel === 'MOCK' });
      });
      this.signals.emit({ type: 'REGISTRY_CHANGED', counterpartyId: a.counterpartyId });
    }
    return this.getEligibility(addressId);
  }

  /**
   * T-129 주소 사용 상태 바꾸기(ADMIN · 감사) — ACTIVE(다시 사용) · PAUSED(잠시 중지) · INACTIVE(더는 안 씀: 주소 폐기 · 담당자 퇴사).
   * 행은 지우지 않는다: 보낸 메일의 받는 사람 · 감사는 그대로 이 주소를 가리킨다. 앞으로의 자동 선택 · 초안 · 승인 · 발송만 Contact Gate 가 막는다.
   * 주소가 바뀌면 이 행을 고치지 않고(주소 열은 DB 가 막는다 — M11) 옛 주소를 INACTIVE 로 두고 새 주소를 등록한다.
   * 거절된 주소(REJECTED)는 다시 쓰지 않는다 — 상태를 바꿀 수 없다(409).
   */
  async setAddressStatus(addressId: string, actorHeader: string | undefined, body: unknown): Promise<ContactEligibilityDto> {
    if (!UUID.test(addressId)) throw new ValidationError('INVALID_ID', 'addressId must be a UUID', ['addressId']);
    const parsed = z.object({ communication_status: z.enum(['ACTIVE', 'PAUSED', 'INACTIVE']), reason_code: z.enum(LIFECYCLE_REASON) }).strict().safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_REGISTRY_REQUEST', 'communication_status (ACTIVE | PAUSED | INACTIVE) and reason_code are required', parsed.error.issues.map((i) => i.path.join('.')));
    const actorId = await this.human(actorHeader);
    const row = await this.registry.findAddress(addressId);
    if (!row) throw new BusinessRuleError('ADDRESS_NOT_FOUND', 'No address with this id', 404);
    if (row.relationshipStatus === 'REJECTED') throw new BusinessRuleError('ADDRESS_REJECTED', 'A rejected address is not used again — register a new one', 409);
    const next = parsed.data.communication_status;
    if (row.communicationStatus !== next) {
      await this.tx.run(async (t) => {
        await t.update(contactChannelAddress).set({ communicationStatus: next }).where(eq(contactChannelAddress.addressId, addressId));
        await this.audit.record(t, {
          actorId,
          action: AUDIT_ACTION.CONTACT_ADDRESS_STATUS_CHANGED,
          targetType: 'CONTACT_CHANNEL_ADDRESS',
          targetId: addressId,
          beforeRef: `communication_status=${row.communicationStatus}`,
          afterRef: `communication_status=${next};reason=${parsed.data.reason_code}`,
          result: 'SUCCESS',
          isSimulated: row.channelType === 'MOCK',
        });
      });
      this.signals.emit({ type: 'REGISTRY_CHANGED', counterpartyId: row.counterpartyId });
    }
    return this.getEligibility(addressId);
  }

  /**
   * T-129 주소 거절(ADMIN · 감사) — "이 주소로 더는 연락하지 마세요" 같은 요청을 사람이 확인한 뒤 남긴다(메일을 자동으로 읽어 막지 않는다).
   * 관계 = REJECTED(되돌리지 않는다 — 다시 쓰려면 새로 등록 · 승인). 보낸 메일 기록은 그대로 둔다.
   */
  async rejectAddress(addressId: string, actorHeader: string | undefined, body: unknown): Promise<ContactEligibilityDto> {
    if (!UUID.test(addressId)) throw new ValidationError('INVALID_ID', 'addressId must be a UUID', ['addressId']);
    const parsed = z.object({ reason_code: z.enum(LIFECYCLE_REASON) }).strict().safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_REGISTRY_REQUEST', 'reason_code is required', parsed.error.issues.map((i) => i.path.join('.')));
    const actorId = await this.human(actorHeader);
    const row = await this.registry.findAddress(addressId);
    if (!row) throw new BusinessRuleError('ADDRESS_NOT_FOUND', 'No address with this id', 404);
    if (row.relationshipStatus !== 'REJECTED') {
      await this.tx.run(async (t) => {
        await t.update(contactChannelAddress).set({ relationshipStatus: 'REJECTED' }).where(eq(contactChannelAddress.addressId, addressId));
        await this.audit.record(t, {
          actorId,
          action: AUDIT_ACTION.CONTACT_ADDRESS_REJECTED,
          targetType: 'CONTACT_CHANNEL_ADDRESS',
          targetId: addressId,
          beforeRef: `relationship_status=${row.relationshipStatus}`,
          afterRef: `relationship_status=REJECTED;reason=${parsed.data.reason_code}`,
          result: 'SUCCESS',
          isSimulated: row.channelType === 'MOCK',
        });
      });
      this.signals.emit({ type: 'REGISTRY_CHANGED', counterpartyId: row.counterpartyId });
    }
    return this.getEligibility(addressId);
  }

  /** T-129 담당자 비활성 · 다시 활성(ADMIN · 감사) — 퇴사 · 담당 변경. 비활성 담당자의 주소는 모두 Contact Gate 에서 막힌다(CONTACT_INACTIVE) */
  async setContactActive(contactId: string, actorHeader: string | undefined, body: unknown): Promise<CounterpartySummaryDto> {
    if (!UUID.test(contactId)) throw new ValidationError('INVALID_ID', 'contactId must be a UUID', ['contactId']);
    const parsed = z.object({ is_active: z.boolean(), reason_code: z.enum(LIFECYCLE_REASON) }).strict().safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError('INVALID_REGISTRY_REQUEST', 'is_active and reason_code are required', parsed.error.issues.map((i) => i.path.join('.')));
    const actorId = await this.human(actorHeader);
    const [c] = await this.db.select({ active: counterpartyContact.isActive, counterpartyId: counterpartyContact.counterpartyId }).from(counterpartyContact).where(eq(counterpartyContact.contactId, contactId)).limit(1);
    if (!c) throw new BusinessRuleError('NOT_FOUND', 'No contact with this id', 404);
    if (c.active !== parsed.data.is_active) {
      await this.tx.run(async (t) => {
        await t.update(counterpartyContact).set({ isActive: parsed.data.is_active }).where(eq(counterpartyContact.contactId, contactId));
        await this.audit.record(t, {
          actorId,
          action: AUDIT_ACTION.CONTACT_STATUS_CHANGED,
          targetType: 'COUNTERPARTY_CONTACT',
          targetId: contactId,
          beforeRef: `is_active=${c.active}`,
          afterRef: `is_active=${parsed.data.is_active};reason=${parsed.data.reason_code}`,
          result: 'SUCCESS',
          isSimulated: false,
        });
      });
      this.signals.emit({ type: 'REGISTRY_CHANGED', counterpartyId: c.counterpartyId });
    }
    return this.summary(c.counterpartyId);
  }

  /**
   * T-129 이 거래처에서 지금 쓸 수 있는 주소(활성 거래처 · 활성 담당자 · Contact Gate 통과 · 실행의 Mock/Real 과 같은 종류).
   * Agent 의 find_counterparty · 재조정 · 후속 초안이 같은 규칙을 쓴다 — 몇 개인지만 보고, 둘 이상이면 고르지 않는다.
   */
  async usableAddresses(counterpartyId: string, simulated: boolean): Promise<string[]> {
    const party = (await this.listCounterparties()).counterparties.find((c) => c.counterparty_id === counterpartyId && c.is_active);
    return party ? party.contacts.filter((p) => p.is_active).flatMap((p) => p.addresses.filter((a) => a.eligible && a.is_simulated === simulated).map((a) => a.address_id)) : [];
  }

  /**
   * T-129 사람이 고른 주소가 이 한 건에 쓸 수 있는지 Backend 가 다시 판정한다 — 아무 주소 id 나 받지 않는다.
   * 그 거래처(공백의 주인 · 원래 받은 회사) 소속 · 필요한 역할 · 활성 담당자 · Contact Gate 통과 · 실행의 Mock/Real 과 같은 종류.
   */
  async assertSelectable(addressId: string, expect: { counterpartyId: string; role: string | null; simulated: boolean }): Promise<CounterpartyAddressRow> {
    if (!UUID.test(addressId)) throw new ValidationError('INVALID_ID', 'address_id must be a UUID', ['address_id']);
    const row = await this.registry.findAddress(addressId);
    if (!row) throw new BusinessRuleError('ADDRESS_NOT_FOUND', 'No address with this id', 404);
    if (row.counterpartyId !== expect.counterpartyId) throw new BusinessRuleError('WRONG_COUNTERPARTY', 'This address belongs to a different counterparty than the one this message must go to', 422);
    if (expect.role && row.sourceRole !== expect.role) throw new BusinessRuleError('ROLE_MISMATCH', `This message needs a ${expect.role} counterparty (this one is ${row.sourceRole})`, 422);
    if ((row.channelType === 'MOCK') !== expect.simulated) throw new BusinessRuleError('SIMULATION_MISMATCH', expect.simulated ? 'A scenario run can only use a simulated (MOCK) address' : 'A real run cannot use a simulated (MOCK) address', 422);
    const gate = this.evaluate(row);
    if (!gate.eligible) throw new BusinessRuleError('RECIPIENT_NOT_ELIGIBLE', `Recipient is not eligible: ${gate.reasons.map((r) => r.code).join(', ')}`, 403);
    return row;
  }

  /** 거래처 하나의 요약. 아직 연락처가 없는 거래처(방금 등록)는 목록(주소 기준)에 없으므로 거래처 행으로 만든다 */
  private async summary(counterpartyId: string): Promise<CounterpartySummaryDto> {
    const listed = (await this.listCounterparties()).counterparties.find((c) => c.counterparty_id === counterpartyId);
    if (listed) return listed;
    const [c] = await this.db.select().from(counterparty).where(eq(counterparty.counterpartyId, counterpartyId)).limit(1);
    return { counterparty_id: c!.counterpartyId, display_name: c!.displayName, source_role: c!.sourceRole as CounterpartySummaryDto['source_role'], is_active: c!.isActive, contacts: [] };
  }
}

/** 주소 정규화 — 앞뒤 공백 제거 · 소문자(DB CHECK `normalized_address = lower(btrim(...))` 와 같다) */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** T-129 수명주기 변경 사유(감사에 코드로만 남긴다 — 자유 문장 · 메일 내용 없음) */
export const LIFECYCLE_REASON = ['ADDRESS_UNUSED', 'PERSON_LEFT', 'COUNTERPARTY_REQUEST', 'ENTERED_IN_ERROR', 'OTHER'] as const;

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
