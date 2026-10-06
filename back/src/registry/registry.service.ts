import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { CounterpartyAddressRow } from '../persistence/registry-reader.js';
import { RegistryReader } from '../persistence/registry-reader.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { type ChannelType, type DevSafetyPolicy, type GateResult, evaluateContactGate } from './contact-gate.js';
import type { AddressStatusDto, ContactEligibilityDto, CounterpartyListDto, CounterpartySummaryDto } from './dto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 등록부 조회 + 발송 자격 판정(U2). 판정은 매번 `evaluateContactGate`(순수 함수)로 새로 계산한다 — 저장하지 않는다.
 * 읽기만 하므로 감사 기록을 남기지 않는다(승인 · 발송 시점의 판정 기록은 U4 · U5).
 */
@Injectable()
export class RegistryService {
  private readonly safety: DevSafetyPolicy;

  constructor(
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
