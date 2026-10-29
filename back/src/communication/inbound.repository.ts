import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { DATABASE, type Database, type DbTransaction } from '../db/database.js';
import {
  auditLog,
  commMessage,
  commThread,
  contactChannelAddress,
  counterparty,
  counterpartyContact,
  messageStatusTransition,
  rawInput,
  sendAttempt,
} from '../db/schema/index.js';
import type { SenderCandidate, ThreadCandidate } from './inbound-rules.js';

export type RawInputInsert = typeof rawInput.$inferInsert;
export type MessageInsert = typeof commMessage.$inferInsert;

export interface InboundRow {
  rawInputId: string;
  sourceName: string;
  externalMessageId: string;
  payloadRef: string | null;
  payloadHash: string;
  sourceRecordedAt: string | null;
  receivedAt: string;
  isSimulated: boolean;
  messageId: string | null;
  threadId: string | null;
  fromAddress: string | null;
}

/** 보류 사유는 수신 순간의 판정으로 감사 기록에 남긴다(`INBOUND_HELD_<사유>` — 원문 · 표를 바꾸지 않는다). */
export const HELD_ACTION_PREFIX = 'INBOUND_HELD_';
/** Q-44 거부 사유도 수신 순간의 판정으로 감사 기록에 남긴다(`INBOUND_DATE_REJECTED_<사유>`). 없으면 `Date` 헤더를 썼다. */
export const DATE_REJECTED_ACTION_PREFIX = 'INBOUND_DATE_REJECTED_';

/**
 * 수신(T-091 U6)의 읽기 · 쓰기. 받은 메일 1통 = `raw_input` 1행(원문 참조 · 지문 · 근거 시각). 연결되면 INBOUND `comm_message`
 * 1행(같은 외부 메시지 id). 두 표가 같은 외부 id 로 이어진다 — 연결 컬럼을 새로 만들지 않는다(DB 변경 없음).
 */
@Injectable()
export class InboundRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async threadScenarioId(threadId: string): Promise<string | null> {
    const rows = await this.db.select({ s: commThread.scenarioId }).from(commThread).where(eq(commThread.threadId, threadId)).limit(1);
    return rows[0]?.s ?? null;
  }

  /** 받은 메일 1통의 원문 기록(보류 재처리 — T-136). */
  async rawInputById(rawInputId: string) {
    const rows = await this.db
      .select({
        rawInputId: rawInput.rawInputId,
        sourceType: rawInput.sourceType,
        sourceName: rawInput.sourceName,
        sourceRecordKey: rawInput.sourceRecordKey,
        payloadRef: rawInput.payloadRef,
        payloadHash: rawInput.payloadHash,
        receivedAt: rawInput.receivedAt,
        isSimulated: rawInput.isSimulated,
      })
      .from(rawInput)
      .where(eq(rawInput.rawInputId, rawInputId))
      .limit(1);
    const r = rows[0];
    return r && r.sourceName && r.sourceRecordKey && r.payloadHash ? { ...r, sourceName: r.sourceName, sourceRecordKey: r.sourceRecordKey, payloadHash: r.payloadHash } : null;
  }

  /** 이 외부 메시지가 이미 회신 메시지로 붙었나(채널 · 외부 id 유일) */
  async messageIdFor(channelType: string, externalMessageId: string, q: Database | DbTransaction = this.db): Promise<string | null> {
    const rows = await q
      .select({ id: commMessage.messageId })
      .from(commMessage)
      .where(and(eq(commMessage.channelType, channelType), eq(commMessage.externalMessageId, externalMessageId), eq(commMessage.direction, 'INBOUND')))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** 같은 보류 회신의 재처리를 한 줄로(두 사람이 동시에 눌러도 메시지는 하나) */
  async lockRawInput(tx: DbTransaction, rawInputId: string): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cera.inbound.reprocess:${rawInputId}`}))`);
  }

  async rawInputExists(sourceName: string, externalMessageId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: rawInput.rawInputId })
      .from(rawInput)
      .where(and(eq(rawInput.sourceName, sourceName), eq(rawInput.sourceRecordKey, externalMessageId)))
      .limit(1);
    return rows.length > 0;
  }

  /** 수신 폴링 범위(T-118): 이 채널에서 CERA 가 보낸(외부 스레드 id 가 생긴) 열린 스레드 중 최근 활동이 있는 것. */
  async activeExternalThreadIds(channelType: string, sinceDb: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: commThread.externalThreadId })
      .from(commThread)
      .where(
        and(
          eq(commThread.channelType, channelType),
          isNotNull(commThread.externalThreadId),
          inArray(commThread.threadStatus, ['WAITING_REPLY', 'ANSWERED']),
          gte(commThread.lastActivityAt, sinceDb),
        ),
      )
      .orderBy(desc(commThread.lastActivityAt))
      .limit(200);
    return rows.map((r) => r.id).filter((x): x is string => Boolean(x));
  }

  /** 외부 스레드 id(채널 안에서 유일) → 스레드 + 그 스레드의 마지막 보낸(발송 완료) 메시지. */
  async threadsByExternalId(channelType: string, externalThreadId: string): Promise<ThreadCandidate[]> {
    const threads = await this.db
      .select({ threadId: commThread.threadId, counterpartyId: commThread.counterpartyId, isSimulated: commThread.isSimulated })
      .from(commThread)
      .where(and(eq(commThread.channelType, channelType), eq(commThread.externalThreadId, externalThreadId)));
    const out: ThreadCandidate[] = [];
    for (const t of threads) {
      const last = await this.db
        .select({ messageId: commMessage.messageId, toAddressId: commMessage.toAddressId })
        .from(commMessage)
        .where(and(eq(commMessage.threadId, t.threadId), eq(commMessage.direction, 'OUTBOUND'), isNotNull(commMessage.sentAt)))
        .orderBy(desc(commMessage.sentAt), desc(commMessage.messageId))
        .limit(1);
      out.push({ ...t, outboundMessageId: last[0]?.messageId ?? null, outboundToAddressId: last[0]?.toAddressId ?? null });
    }
    return out;
  }

  /** In-Reply-To · References 의 외부 id → 그 id 로 **성공한** 발송 시도 → 보낸 메시지 → 스레드. */
  async threadsByProviderIds(channelType: string, providerIds: readonly string[]): Promise<ThreadCandidate[]> {
    if (providerIds.length === 0) return [];
    const rows = await this.db
      .select({
        threadId: commThread.threadId,
        counterpartyId: commThread.counterpartyId,
        isSimulated: commThread.isSimulated,
        outboundMessageId: commMessage.messageId,
        outboundToAddressId: commMessage.toAddressId,
      })
      .from(sendAttempt)
      .innerJoin(commMessage, eq(commMessage.messageId, sendAttempt.messageId))
      .innerJoin(commThread, eq(commThread.threadId, commMessage.threadId))
      .where(and(eq(sendAttempt.result, 'SUCCESS'), inArray(sendAttempt.providerMessageId, [...providerIds]), eq(commMessage.channelType, channelType)));
    return rows;
  }

  /** 같은 채널의 정규화 주소 → 주소 · 연락처 · 거래처(등록부). 주소는 채널 안에서 유일하지만 판정은 개수로 한다. */
  async sendersByAddress(channelType: string, normalizedAddress: string): Promise<SenderCandidate[]> {
    return this.db
      .select({
        addressId: contactChannelAddress.addressId,
        contactId: counterpartyContact.contactId,
        counterpartyId: counterparty.counterpartyId,
        counterpartyIsActive: counterparty.isActive,
        contactIsActive: counterpartyContact.isActive,
        communicationStatus: contactChannelAddress.communicationStatus,
        emailVerificationStatus: contactChannelAddress.emailVerificationStatus,
        relationshipStatus: contactChannelAddress.relationshipStatus,
      })
      .from(contactChannelAddress)
      .innerJoin(counterpartyContact, eq(counterpartyContact.contactId, contactChannelAddress.contactId))
      .innerJoin(counterparty, eq(counterparty.counterpartyId, counterpartyContact.counterpartyId))
      .where(and(eq(contactChannelAddress.channelType, channelType), eq(contactChannelAddress.normalizedAddress, normalizedAddress)));
  }

  /** T7(docs/24 15): 충돌(같은 출처 · 같은 외부 id)이면 아무것도 넣지 않고 null — 그 트랜잭션의 나머지를 하지 않는다. */
  async insertRawInput(tx: DbTransaction, row: RawInputInsert): Promise<string | null> {
    const rows = await tx.insert(rawInput).values(row).onConflictDoNothing().returning({ id: rawInput.rawInputId });
    return rows[0]?.id ?? null;
  }

  async insertInboundMessage(tx: DbTransaction, row: MessageInsert): Promise<void> {
    await tx.insert(commMessage).values(row);
  }

  async outboundStatus(tx: DbTransaction, messageId: string): Promise<string | null> {
    const rows = await tx.select({ s: commMessage.currentStatus }).from(commMessage).where(eq(commMessage.messageId, messageId)).for('update');
    return rows[0]?.s ?? null;
  }

  async insertRepliedTransition(tx: DbTransaction, t: { id: string; messageId: string; actorId: string; at: string; isSimulated: boolean; note: string }): Promise<void> {
    await tx.insert(messageStatusTransition).values({
      transitionId: t.id,
      messageId: t.messageId,
      status: 'REPLIED',
      occurredAt: t.at,
      actorId: t.actorId,
      note: t.note,
      isSimulated: t.isSimulated,
    });
  }

  async markThreadAnswered(tx: DbTransaction, threadId: string, at: string): Promise<void> {
    await tx
      .update(commThread)
      .set({ threadStatus: 'ANSWERED', lastActivityAt: at })
      .where(and(eq(commThread.threadId, threadId), inArray(commThread.threadStatus, ['OPEN', 'WAITING_REPLY'])));
  }

  /** 받은 메일 목록(최근 순) — 원문 행 + 연결된 메시지(있으면). 채널 수신 원천만(`EMAIL`). `source_name` = 채널 코드(MOCK · GMAIL). */
  async listInbound(limit: number, threadId?: string): Promise<InboundRow[]> {
    const rows = await this.db
      .select({
        rawInputId: rawInput.rawInputId,
        sourceName: rawInput.sourceName,
        externalMessageId: rawInput.sourceRecordKey,
        payloadRef: rawInput.payloadRef,
        payloadHash: rawInput.payloadHash,
        sourceRecordedAt: rawInput.sourceRecordedAt,
        receivedAt: rawInput.receivedAt,
        isSimulated: rawInput.isSimulated,
        messageId: commMessage.messageId,
        threadId: commMessage.threadId,
        fromAddress: commMessage.fromAddress,
      })
      .from(rawInput)
      .leftJoin(
        commMessage,
        and(eq(commMessage.direction, 'INBOUND'), eq(commMessage.externalMessageId, rawInput.sourceRecordKey), eq(commMessage.channelType, rawInput.sourceName)),
      )
      .where(and(eq(rawInput.sourceType, 'EMAIL'), threadId ? eq(commMessage.threadId, threadId) : sql`true`))
      .orderBy(desc(rawInput.receivedAt), desc(rawInput.rawInputId))
      .limit(limit);
    return rows.map((r) => ({ ...r, externalMessageId: r.externalMessageId ?? '' }));
  }

  /** 수신 순간의 Q-44 거부 사유(감사 기록) — 원문 없이도 남는다. */
  async dateRejections(rawInputIds: readonly string[]): Promise<Map<string, string>> {
    return new Map([...(await this.auditByPrefix(rawInputIds, DATE_REJECTED_ACTION_PREFIX))].map(([k, v]) => [k, v[0] ?? '']));
  }

  /** 수신 순간의 보류 사유(감사 기록). */
  async holdReasons(rawInputIds: readonly string[]): Promise<Map<string, string[]>> {
    return this.auditByPrefix(rawInputIds, HELD_ACTION_PREFIX);
  }

  private async auditByPrefix(rawInputIds: readonly string[], prefix: string): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (rawInputIds.length === 0) return out;
    const rows = await this.db
      .select({ targetId: auditLog.targetId, action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.targetType, 'RAW_INPUT'), inArray(auditLog.targetId, [...rawInputIds]), like(auditLog.action, `${prefix}%`)))
      .orderBy(asc(auditLog.occurredAt), asc(auditLog.auditId));
    for (const r of rows) out.set(r.targetId, [...(out.get(r.targetId) ?? []), r.action.slice(prefix.length)]);
    return out;
  }

  /** 스레드 · 거래처 · 연락처 이름(화면 표시). */
  async threadLabels(threadIds: readonly string[]): Promise<Map<string, { counterpartyName: string; contactName: string | null }>> {
    const out = new Map<string, { counterpartyName: string; contactName: string | null }>();
    if (threadIds.length === 0) return out;
    const rows = await this.db
      .select({ threadId: commThread.threadId, counterpartyName: counterparty.displayName, contactName: counterpartyContact.personName })
      .from(commThread)
      .innerJoin(counterparty, eq(counterparty.counterpartyId, commThread.counterpartyId))
      .leftJoin(counterpartyContact, eq(counterpartyContact.contactId, commThread.contactId))
      .where(inArray(commThread.threadId, [...threadIds]));
    for (const r of rows) out.set(r.threadId, { counterpartyName: r.counterpartyName, contactName: r.contactName });
    return out;
  }

  /** 보낸 주소의 등록 소속(보류함에서 "누구인지" 보여 주기 — 판정이 아니라 표시). */
  async senderLabel(channelType: string, normalizedAddress: string): Promise<{ counterpartyName: string; contactName: string } | null> {
    const rows = await this.db
      .select({ counterpartyName: counterparty.displayName, contactName: counterpartyContact.personName })
      .from(contactChannelAddress)
      .innerJoin(counterpartyContact, eq(counterpartyContact.contactId, contactChannelAddress.contactId))
      .innerJoin(counterparty, eq(counterparty.counterpartyId, counterpartyContact.counterpartyId))
      .where(and(eq(contactChannelAddress.channelType, channelType), eq(contactChannelAddress.normalizedAddress, normalizedAddress)))
      .limit(1);
    return rows[0] ?? null;
  }
}
