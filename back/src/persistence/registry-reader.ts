import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { actor, contactChannelAddress, counterparty, counterpartyContact, facility } from '../db/schema/index.js';

export type ActorRow = typeof actor.$inferSelect;

export interface CounterpartyAddressRow {
  counterpartyId: string;
  counterpartyName: string;
  sourceRole: string;
  counterpartyIsActive: boolean;
  contactId: string;
  personName: string;
  team: string | null;
  contactIsActive: boolean;
  addressId: string;
  channelType: string;
  normalizedAddress: string;
  emailVerificationStatus: string;
  relationshipStatus: string;
  communicationStatus: string;
}

const addressColumns = {
  counterpartyId: counterparty.counterpartyId,
  counterpartyName: counterparty.displayName,
  sourceRole: counterparty.sourceRole,
  counterpartyIsActive: counterparty.isActive,
  contactId: counterpartyContact.contactId,
  personName: counterpartyContact.personName,
  team: counterpartyContact.team,
  contactIsActive: counterpartyContact.isActive,
  addressId: contactChannelAddress.addressId,
  channelType: contactChannelAddress.channelType,
  normalizedAddress: contactChannelAddress.normalizedAddress,
  emailVerificationStatus: contactChannelAddress.emailVerificationStatus,
  relationshipStatus: contactChannelAddress.relationshipStatus,
  communicationStatus: contactChannelAddress.communicationStatus,
};

/**
 * 등록부 읽기. 발송 자격 판정은 `registry/contact-gate.ts`(순수 함수)가 하고, 이 클래스는 판정 입력(거래처 · 연락처 ·
 * 주소 상태)을 한 질의로 모아 줄 뿐이다. 표마다 CRUD 저장소를 만들지 않는다 — 쓰임새가 생길 때 그 질의를 더한다.
 */
@Injectable()
export class RegistryReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findActor(actorId: string): Promise<ActorRow | null> {
    const rows = await this.db.select().from(actor).where(eq(actor.actorId, actorId)).limit(1);
    return rows[0] ?? null;
  }

  async listCounterpartyAddresses(): Promise<CounterpartyAddressRow[]> {
    return this.addressQuery().orderBy(
      asc(counterparty.displayName),
      asc(counterpartyContact.personName),
      asc(contactChannelAddress.normalizedAddress),
    );
  }

  /** 주소 한 건과 그 연락처 · 거래처(발송 자격 판정 입력). 없으면 null. */
  async findAddress(addressId: string): Promise<CounterpartyAddressRow | null> {
    const rows = await this.addressQuery().where(eq(contactChannelAddress.addressId, addressId)).limit(1);
    return rows[0] ?? null;
  }

  /** 활성 시설(창고 · ODCY · 터미널) — 문의 대상 고르기. */
  async listFacilities(): Promise<{ facilityId: string; facilityType: string; facilityName: string; area: string | null; operatorCounterpartyId: string | null }[]> {
    return this.db
      .select({ facilityId: facility.facilityId, facilityType: facility.facilityType, facilityName: facility.facilityName, area: facility.area, operatorCounterpartyId: facility.operatorCounterpartyId })
      .from(facility)
      .where(eq(facility.isActive, true))
      .orderBy(asc(facility.facilityType), asc(facility.facilityName));
  }

  private addressQuery() {
    return this.db
      .select(addressColumns)
      .from(counterparty)
      .innerJoin(counterpartyContact, eq(counterpartyContact.counterpartyId, counterparty.counterpartyId))
      .innerJoin(contactChannelAddress, eq(contactChannelAddress.contactId, counterpartyContact.contactId))
      .$dynamic();
  }
}
