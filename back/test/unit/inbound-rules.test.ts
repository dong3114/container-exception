import { describe, expect, it } from 'vitest';
import { type SenderCandidate, type ThreadCandidate, classifyInbound, evidenceTime, normalizeAddress, parseDateHeader } from '../../src/communication/inbound-rules.js';
import { Instant } from '../../src/shared/time/instant.js';

const channel = Instant.parseIso('2026-10-07T12:00:00+09:00');
const thread = (id: string, extra: Partial<ThreadCandidate> = {}): ThreadCandidate => ({
  threadId: id,
  counterpartyId: 'cp-1',
  isSimulated: true,
  outboundMessageId: `m-${id}`,
  outboundToAddressId: 'addr-1',
  ...extra,
});
const sender = (extra: Partial<SenderCandidate> = {}): SenderCandidate => ({
  addressId: 'addr-1',
  contactId: 'c-1',
  counterpartyId: 'cp-1',
  counterpartyIsActive: true,
  contactIsActive: true,
  communicationStatus: 'ACTIVE',
  emailVerificationStatus: 'VERIFIED',
  relationshipStatus: 'APPROVED',
  ...extra,
});
const base = { byExternalThread: [thread('t1')], byReplyHeaders: [thread('t1')], senders: [sender()], adapterSimulated: true };

describe('evidence time (Q-44 · docs/22 11.2e)', () => {
  it('uses the Date header only when present, parseable and not after the channel time', () => {
    expect(evidenceTime('Wed, 07 Oct 2026 11:59:30 +0900', channel)).toMatchObject({ basis: 'DATE_HEADER', rejected: false, rejectReason: null });
    expect(evidenceTime('Wed, 07 Oct 2026 12:00:00 +0900', channel).basis).toBe('DATE_HEADER'); // 같은 시각은 미래가 아니다
    expect(evidenceTime(null, channel)).toMatchObject({ basis: 'CHANNEL_RECEIVED', rejectReason: 'MISSING' });
    expect(evidenceTime('  ', channel)).toMatchObject({ rejectReason: 'MISSING' });
    expect(evidenceTime('next tuesday', channel)).toMatchObject({ rejectReason: 'UNPARSEABLE' });
    const future = evidenceTime('Wed, 07 Oct 2026 12:00:01 +0900', channel);
    expect(future).toMatchObject({ basis: 'CHANNEL_RECEIVED', rejectReason: 'AFTER_CHANNEL_RECEIVED' });
    expect(future.sourceRecordedAt.equals(channel)).toBe(true);
    expect(future.dateHeaderParsed?.toIsoUtc()).toBe('2026-10-07T03:00:01.000Z');
    // 아주 오래된 Date 는 거부하지 않는다(주장이 약해지는 안전한 방향)
    expect(evidenceTime('Mon, 01 Jan 2024 00:00:00 GMT', channel).basis).toBe('DATE_HEADER');
  });

  it('parses RFC 5322 dates with offsets only — no guessing a time zone', () => {
    expect(parseDateHeader('7 Oct 2026 03:00 GMT')?.toIsoUtc()).toBe('2026-10-07T03:00:00.000Z');
    expect(parseDateHeader('Wed, 07 Oct 2026 12:00:00 +0900 (KST)')?.toIsoUtc()).toBe('2026-10-07T03:00:00.000Z');
    expect(parseDateHeader('Wed, 07 Oct 2026 12:00:00')).toBeNull(); // 오프셋 없음
    expect(parseDateHeader('30 Feb 2026 10:00:00 +0000')).toBeNull();
    expect(parseDateHeader('2026-10-07T12:00:00+09:00')).toBeNull(); // RFC 5322 형식이 아니다
  });
});

describe('classifyInbound — attach only when exactly one thread and one good registered sender fit', () => {
  it('normal', () => {
    expect(classifyInbound(base)).toMatchObject({ status: 'NORMAL', reasons: [], thread: { threadId: 't1' } });
    expect(classifyInbound({ ...base, byReplyHeaders: [] }).status).toBe('NORMAL');
    expect(classifyInbound({ ...base, byExternalThread: [] }).status).toBe('NORMAL');
  });

  it('thread evidence', () => {
    expect(classifyInbound({ ...base, byExternalThread: [], byReplyHeaders: [] }).reasons).toEqual(['NO_MATCHING_THREAD']);
    expect(classifyInbound({ ...base, byExternalThread: [thread('t2')] }).reasons).toEqual(['AMBIGUOUS_THREAD']);
    expect(classifyInbound({ ...base, adapterSimulated: false }).reasons).toEqual(['SIMULATION_MISMATCH']);
  });

  it('sender evidence (registry only)', () => {
    expect(classifyInbound({ ...base, senders: [] }).reasons).toEqual(['UNKNOWN_SENDER']);
    expect(classifyInbound({ ...base, senders: [sender(), sender({ addressId: 'addr-2' })] }).reasons).toEqual(['AMBIGUOUS_SENDER']);
    expect(classifyInbound({ ...base, senders: [sender({ contactIsActive: false })] }).reasons).toEqual(['SENDER_INACTIVE']);
    expect(classifyInbound({ ...base, senders: [sender({ counterpartyIsActive: false })] }).reasons).toEqual(['SENDER_INACTIVE']);
    expect(classifyInbound({ ...base, senders: [sender({ emailVerificationStatus: 'PENDING' })] }).reasons).toEqual(['SENDER_UNVERIFIED']);
    expect(classifyInbound({ ...base, senders: [sender({ relationshipStatus: 'PENDING' })] }).reasons).toEqual(['SENDER_NOT_APPROVED']);
    expect(classifyInbound({ ...base, senders: [sender({ counterpartyId: 'cp-2' })] }).reasons).toEqual(['OTHER_COUNTERPARTY']);
    expect(classifyInbound({ ...base, senders: [sender({ addressId: 'addr-9' })] }).reasons).toEqual(['DIFFERENT_CONTACT']);
  });

  it('normalizes "Name <address>" to the registry form', () => {
    expect(normalizeAddress('  K운송 배차 <Dispatch@K-Trucking.example.invalid> ')).toBe('dispatch@k-trucking.example.invalid');
    expect(normalizeAddress('PLAIN@Example.Invalid')).toBe('plain@example.invalid');
  });
});
