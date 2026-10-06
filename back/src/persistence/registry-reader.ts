import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { actor, contactChannelAddress, counterparty, counterpartyContact } from '../db/schema/index.js';

export type ActorRow = typeof actor.$inferSelect;

export interface CounterpartyAddressRow {
  counterpartyId: string;
  counterpartyName: string;
  sourceRole: string;
  contactId: string;
  personName: string;
  addressId: string;
  channelType: string;
  normalizedAddress: string;
  emailVerificationStatus: string;
  relationshipStatus: string;
  communicationStatus: string;
}

/**
 * 등록부 읽기(U1 최소 범위). 쓰기·발송 자격 판정(Contact Gate)은 U2(T-087)에서 업무 서비스로 만든다.
 * 표마다 CRUD 저장소를 만들지 않는다 — 쓰임새가 생길 때 그 질의를 더한다.
 */
@Injectable()
export class RegistryReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findActor(actorId: string): Promise<ActorRow | null> {
    const rows = await this.db.select().from(actor).where(eq(actor.actorId, actorId)).limit(1);
    return rows[0] ?? null;
  }

  async listCounterpartyAddresses(): Promise<CounterpartyAddressRow[]> {
    return this.db
      .select({
        counterpartyId: counterparty.counterpartyId,
        counterpartyName: counterparty.displayName,
        sourceRole: counterparty.sourceRole,
        contactId: counterpartyContact.contactId,
        personName: counterpartyContact.personName,
        addressId: contactChannelAddress.addressId,
        channelType: contactChannelAddress.channelType,
        normalizedAddress: contactChannelAddress.normalizedAddress,
        emailVerificationStatus: contactChannelAddress.emailVerificationStatus,
        relationshipStatus: contactChannelAddress.relationshipStatus,
        communicationStatus: contactChannelAddress.communicationStatus,
      })
      .from(counterparty)
      .innerJoin(counterpartyContact, eq(counterpartyContact.counterpartyId, counterparty.counterpartyId))
      .innerJoin(contactChannelAddress, eq(contactChannelAddress.contactId, counterpartyContact.contactId))
      .orderBy(asc(counterparty.displayName), asc(contactChannelAddress.normalizedAddress));
  }
}
