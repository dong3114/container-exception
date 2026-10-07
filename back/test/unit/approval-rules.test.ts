import { describe, expect, it } from 'vitest';
import {
  type ApprovalRow,
  approvalBlocks,
  isUsableForSend,
  liveApproval,
  summarizeApprovals,
} from '../../src/communication/approval-rules.js';
import { canonicalDecimal, messageContentHash, messageTextBytes, parseMessageText } from '../../src/communication/message-content.js';
import { Instant } from '../../src/shared/time/instant.js';

const at = (iso: string) => Instant.parseIso(iso);
const H = `sha256:${'a'.repeat(64)}`;
const ADDR = '01a11040-0000-7000-8000-000000000005';

const approved = (id: string, decided: string, expires: string | null = null, hash = H): ApprovalRow => ({
  approvalId: id,
  decision: 'APPROVED',
  invalidatesApprovalId: null,
  invalidationCause: null,
  decidedAt: at(decided),
  expiresAt: expires ? at(expires) : null,
  approvedContentHash: hash,
  approvedToAddressId: ADDR,
});
const ending = (id: string, target: string, decided: string, cause: 'USER_REVOKED' | 'PLAN_SUPERSEDED' | 'CONTENT_CHANGED'): ApprovalRow => ({
  approvalId: id,
  decision: cause === 'USER_REVOKED' ? 'REVOKED' : 'INVALIDATED',
  invalidatesApprovalId: target,
  invalidationCause: cause,
  decidedAt: at(decided),
  expiresAt: null,
  approvedContentHash: null,
  approvedToAddressId: null,
});

describe('valid approval — the six conditions (docs/22 15.5.1)', () => {
  const now = at('2026-10-07T10:00:00+09:00');
  const msg = { contentHash: H, toAddressId: ADDR };

  it('a live approval of the same content and recipient is usable', () => {
    const rows = [approved('a1', '2026-10-07T09:00:00+09:00', '2026-10-08T09:00:00+09:00')];
    expect(liveApproval(rows, now)?.approvalId).toBe('a1');
    expect(isUsableForSend(rows[0] as ApprovalRow, rows, msg, now)).toBe(true);
    expect(summarizeApprovals(rows, now).state).toBe('ACTIVE');
  });

  it('expired · revoked · invalidated · other content · other recipient are not usable', () => {
    const expired = [approved('a1', '2026-10-06T09:00:00+09:00', '2026-10-07T09:00:00+09:00')];
    expect(summarizeApprovals(expired, now).state).toBe('EXPIRED');
    expect(isUsableForSend(expired[0] as ApprovalRow, expired, msg, now)).toBe(false);

    const revoked = [approved('a1', '2026-10-07T09:00:00+09:00'), ending('r1', 'a1', '2026-10-07T09:30:00+09:00', 'USER_REVOKED')];
    expect(summarizeApprovals(revoked, now)).toMatchObject({ state: 'REVOKED', invalidatedBy: { approvalId: 'r1' } });
    expect(liveApproval(revoked, now)).toBeNull();

    const changed = [approved('a1', '2026-10-07T09:00:00+09:00'), ending('i1', 'a1', '2026-10-07T09:30:00+09:00', 'CONTENT_CHANGED')];
    expect(summarizeApprovals(changed, now).state).toBe('INVALIDATED');

    const rows = [approved('a1', '2026-10-07T09:00:00+09:00')];
    expect(isUsableForSend(rows[0] as ApprovalRow, rows, { ...msg, contentHash: `sha256:${'b'.repeat(64)}` }, now)).toBe(false);
    expect(isUsableForSend(rows[0] as ApprovalRow, rows, { ...msg, toAddressId: 'other' }, now)).toBe(false);
  });

  it('re-approval after a revoke: the newest APPROVED row is the live one', () => {
    const rows = [
      approved('a1', '2026-10-07T09:00:00+09:00'),
      ending('r1', 'a1', '2026-10-07T09:10:00+09:00', 'USER_REVOKED'),
      approved('a2', '2026-10-07T09:20:00+09:00'),
    ];
    expect(liveApproval(rows, now)?.approvalId).toBe('a2');
    expect(summarizeApprovals(rows, now)).toMatchObject({ state: 'ACTIVE', latestApproved: { approvalId: 'a2' }, invalidatedBy: null });
  });
});

describe('approvalBlocks — why it cannot be approved now', () => {
  const ok = {
    status: 'PENDING_APPROVAL',
    contentPresent: true,
    contentHashMatches: true,
    numberCheckPassed: true,
    recipientEligible: true,
    planSuperseded: false,
    hasLiveApproval: false,
  };

  it('a clean pending draft has no blocks; re-approval of APPROVED without a live approval is allowed', () => {
    expect(approvalBlocks(ok)).toEqual([]);
    expect(approvalBlocks({ ...ok, status: 'APPROVED' })).toEqual([]);
  });

  it('lists every reason', () => {
    expect(approvalBlocks({ ...ok, status: 'APPROVED', hasLiveApproval: true })).toEqual(['ALREADY_APPROVED']);
    expect(approvalBlocks({ ...ok, status: 'CLOSED' })).toEqual(['MESSAGE_SUPERSEDED']);
    expect(approvalBlocks({ ...ok, status: 'DRAFTED', numberCheckPassed: false })).toEqual(['BLOCKED_NUMBER_CHECK', 'NOT_PENDING_APPROVAL']);
    expect(approvalBlocks({ ...ok, contentHashMatches: false, recipientEligible: false, planSuperseded: true })).toEqual([
      'CONTENT_HASH_MISMATCH',
      'RECIPIENT_NOT_ELIGIBLE',
      'PLAN_SUPERSEDED',
    ]);
    expect(approvalBlocks({ ...ok, contentPresent: false, status: 'QUEUED' })).toEqual(['CONTENT_MISSING', 'NOT_PENDING_APPROVAL']);
  });
});

describe('msg-content/1 (docs/24 8.2)', () => {
  const text = { subject: '[문의 Q1] 트럭 2대', bodyText: '트럭 2대를 부탁드립니다.' };
  const fields = [
    { fieldKey: 'quantity', valueText: null, valueNumber: '2.0000', unit: 'TRUCK' },
    { fieldKey: 'date', valueText: '2026-10-13', valueNumber: null, unit: null },
  ];

  it('covers recipient, subject, body and structured values; field order and decimal form do not matter', () => {
    const base = messageContentHash({ toAddressId: ADDR, text, fields });
    expect(base).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(messageContentHash({ toAddressId: ADDR, text, fields: [...fields].reverse().map((f) => (f.fieldKey === 'quantity' ? { ...f, valueNumber: 2 } : f)) })).toBe(base);
    expect(messageContentHash({ toAddressId: 'other', text, fields })).not.toBe(base);
    expect(messageContentHash({ toAddressId: ADDR, text: { ...text, bodyText: `${text.bodyText} ` }, fields })).not.toBe(base);
    expect(messageContentHash({ toAddressId: ADDR, text, fields: fields.map((f) => (f.fieldKey === 'quantity' ? { ...f, valueNumber: 3 } : f)) })).not.toBe(base);
    expect(messageContentHash({ toAddressId: ADDR, text, fields: fields.map((f) => (f.fieldKey === 'quantity' ? { ...f, unit: 'TEU' } : f)) })).not.toBe(base);
  });

  it('stores the text as JCS {subject, body_text} and reads it back (the T-088 {subject, body} form is still readable)', () => {
    expect(new TextDecoder().decode(messageTextBytes(text))).toBe('{"body_text":"트럭 2대를 부탁드립니다.","subject":"[문의 Q1] 트럭 2대"}');
    expect(parseMessageText(messageTextBytes(text))).toEqual(text);
    expect(parseMessageText(new TextEncoder().encode('{"subject":"s","body":"b"}'))).toEqual({ subject: 's', bodyText: 'b' });
    expect(parseMessageText(new TextEncoder().encode('not json'))).toBeNull();
  });

  it('canonicalDecimal', () => {
    expect(['2', '2.0000', '2.50', '0.0', '010', '-1.20'].map(canonicalDecimal)).toEqual(['2', '2', '2.5', '0', '10', '-1.2']);
    expect(canonicalDecimal(2.5)).toBe('2.5');
    expect(() => canonicalDecimal('1e3')).toThrow();
  });
});
