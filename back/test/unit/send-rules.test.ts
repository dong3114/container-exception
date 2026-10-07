import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ChannelSendError } from '../../src/channel/channel-adapter.js';
import { MockChannelAdapter } from '../../src/channel/mock-channel-adapter.js';
import type { ApprovalRow } from '../../src/communication/approval-rules.js';
import { type AttemptRow, type SendFacts, dispatchState, nextAttemptAt, sendBlocks } from '../../src/communication/send-rules.js';
import { UuidV7Generator } from '../../src/shared/id/uuid.js';
import { FakeClock } from '../../src/shared/time/clock.js';
import { Instant } from '../../src/shared/time/instant.js';

const at = (iso: string) => Instant.parseIso(iso);
const NOW = at('2026-10-07T10:00:00+09:00');
const H = `sha256:${'a'.repeat(64)}`;
const ADDR = 'addr-1';
const approved = (extra: Partial<ApprovalRow> = {}): ApprovalRow => ({
  approvalId: 'a1',
  decision: 'APPROVED',
  invalidatesApprovalId: null,
  invalidationCause: null,
  decidedAt: at('2026-10-07T09:00:00+09:00'),
  expiresAt: at('2026-10-08T09:00:00+09:00'),
  approvedContentHash: H,
  approvedToAddressId: ADDR,
  ...extra,
});
const ok: SendFacts = {
  status: 'APPROVED',
  messageContentHash: H,
  messageToAddressId: ADDR,
  isSimulated: true,
  approvals: [approved()],
  liveCopyVerified: true,
  contentHashMatches: true,
  recipientEligible: true,
  planSuperseded: false,
  hasSuccessfulAttempt: false,
  adapter: { declaresSimulated: true },
};

describe('sendBlocks — the one rule the send request and the worker share', () => {
  it('a valid approval of the current content to the current recipient passes', () => {
    expect(sendBlocks(ok, NOW)).toEqual([]);
    expect(sendBlocks({ ...ok, status: 'QUEUED' }, NOW)).toEqual([]);
  });

  it('every approval failure has its own reason', () => {
    expect(sendBlocks({ ...ok, approvals: [] }, NOW)).toEqual(['APPROVAL_MISSING']);
    expect(sendBlocks({ ...ok, approvals: [approved({ expiresAt: at('2026-10-07T09:30:00+09:00') })] }, NOW)).toEqual(['APPROVAL_EXPIRED']);
    const ended = (decision: 'REVOKED' | 'INVALIDATED'): ApprovalRow => ({
      ...approved({ approvalId: 'x', decision, invalidatesApprovalId: 'a1', invalidationCause: decision === 'REVOKED' ? 'USER_REVOKED' : 'CONTENT_CHANGED' }),
    });
    expect(sendBlocks({ ...ok, approvals: [approved(), ended('REVOKED')] }, NOW)).toEqual(['APPROVAL_REVOKED']);
    expect(sendBlocks({ ...ok, approvals: [approved(), ended('INVALIDATED')] }, NOW)).toEqual(['APPROVAL_INVALIDATED']);
    expect(sendBlocks({ ...ok, messageContentHash: `sha256:${'b'.repeat(64)}` }, NOW)).toEqual(['APPROVAL_CONTENT_MISMATCH']);
    expect(sendBlocks({ ...ok, messageToAddressId: 'addr-2' }, NOW)).toEqual(['APPROVAL_RECIPIENT_MISMATCH']);
    expect(sendBlocks({ ...ok, liveCopyVerified: false }, NOW)).toEqual(['APPROVAL_COPY_INVALID']);
  });

  it('content · Contact Gate · plan · channel · simulation · status', () => {
    expect(sendBlocks({ ...ok, contentHashMatches: false, recipientEligible: false, planSuperseded: true }, NOW)).toEqual([
      'CONTENT_HASH_MISMATCH',
      'RECIPIENT_NOT_ELIGIBLE',
      'PLAN_SUPERSEDED',
    ]);
    expect(sendBlocks({ ...ok, adapter: null }, NOW)).toEqual(['CHANNEL_UNAVAILABLE']);
    // G-06: 가상 메시지를 "실채널" 어댑터에 넘기면 막는다 — 외부 호출 전에
    expect(sendBlocks({ ...ok, adapter: { declaresSimulated: false } }, NOW)).toEqual(['SIMULATION_MISMATCH']);
    expect(sendBlocks({ ...ok, isSimulated: false, adapter: { declaresSimulated: false } }, NOW)).toEqual([]);
    expect(sendBlocks({ ...ok, status: 'PENDING_APPROVAL', approvals: [] }, NOW)).toEqual(['NOT_APPROVED', 'APPROVAL_MISSING']);
    expect(sendBlocks({ ...ok, status: 'SENT' }, NOW)).toEqual(['ALREADY_SENT']);
    expect(sendBlocks({ ...ok, hasSuccessfulAttempt: true }, NOW)).toEqual(['ALREADY_SENT']);
    expect(sendBlocks({ ...ok, status: 'CLOSED' }, NOW)).toEqual(['MESSAGE_SUPERSEDED']);
  });
});

const attempt = (n: number, result: AttemptRow['result'], finished: string | null, errorCode: string | null = null): AttemptRow => ({
  sendAttemptId: `s${n}`,
  attemptNo: n,
  approvalId: 'a1',
  startedAt: at('2026-10-07T10:00:00+09:00'),
  finishedAt: finished ? at(finished) : null,
  result,
  errorCode,
  errorMessage: null,
  providerMessageId: null,
});

describe('dispatchState · nextAttemptAt', () => {
  it('SENDING is an open or unknown attempt, not a status code (docs/18 H.2)', () => {
    expect(dispatchState('APPROVED', [])).toBe('NOT_REQUESTED');
    expect(dispatchState('QUEUED', [])).toBe('QUEUED');
    expect(dispatchState('QUEUED', [attempt(1, null, null)])).toBe('SENDING');
    expect(dispatchState('QUEUED', [attempt(1, 'UNKNOWN', '2026-10-07T10:00:05+09:00')])).toBe('SENDING');
    expect(dispatchState('QUEUED', [attempt(1, 'RETRYABLE_FAILURE', '2026-10-07T10:00:05+09:00')])).toBe('RETRY_WAIT');
    expect(dispatchState('SENT', [attempt(1, 'SUCCESS', '2026-10-07T10:00:05+09:00')])).toBe('SENT');
    expect(dispatchState('DELIVERY_FAILED', [attempt(1, 'PERMANENT_FAILURE', '2026-10-07T10:00:05+09:00')])).toBe('FAILED');
  });

  it('exponential backoff capped at 10 minutes; reconciled-not-sent retries at once', () => {
    expect(nextAttemptAt([], 30_000)).toBeNull();
    expect(nextAttemptAt([attempt(1, 'RETRYABLE_FAILURE', '2026-10-07T10:00:00+09:00')], 30_000)?.toIsoUtc()).toBe('2026-10-07T01:00:30.000Z');
    expect(nextAttemptAt([attempt(1, 'RETRYABLE_FAILURE', '2026-10-07T10:00:00+09:00'), attempt(2, 'RETRYABLE_FAILURE', '2026-10-07T10:00:00+09:00')], 30_000)?.toIsoUtc()).toBe(
      '2026-10-07T01:01:00.000Z',
    );
    expect(nextAttemptAt([attempt(9, 'RETRYABLE_FAILURE', '2026-10-07T10:00:00+09:00')], 30_000)?.toIsoUtc()).toBe('2026-10-07T01:10:00.000Z');
    expect(nextAttemptAt([attempt(1, 'RETRYABLE_FAILURE', '2026-10-07T10:00:00+09:00', 'RECONCILED_NOT_SENT')], 30_000)?.toIsoUtc()).toBe('2026-10-07T01:00:00.000Z');
  });
});

describe('MockChannelAdapter — a local "mail server" with a sent box (no network)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cera-mock-unit-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const message = (id: string) => ({
    ceraMessageId: id,
    ceraThreadId: 't-1',
    externalThreadId: null,
    to: 'dispatch@example.invalid',
    subject: 's',
    bodyText: 'b',
    contentHash: H,
    isSimulated: true,
  });

  it('send writes one record with X-CERA-Message; lookupSent finds it from a fresh instance (restart)', async () => {
    const a = new MockChannelAdapter(dir, new UuidV7Generator(), new FakeClock(NOW));
    expect(a.capabilities()).toMatchObject({ threading: true, structured_reply: false });
    const receipt = await a.send(message('m-1'));
    expect(receipt.externalMessageId).toMatch(/^mock-msg-/);
    expect(receipt.externalThreadId).toBe('mock-thread-t-1');
    const restarted = new MockChannelAdapter(dir, new UuidV7Generator(), new FakeClock(NOW));
    expect(await restarted.lookupSent('m-1')).toBe(receipt.externalMessageId);
    expect(await restarted.lookupSent('m-unknown')).toBeNull();
  });

  it('fault injection: transient / permanent send nothing; timeout_after_send sends then loses the answer; crash_after_send sends then dies', async () => {
    const a = new MockChannelAdapter(dir, new UuidV7Generator(), new FakeClock(NOW), 'transient');
    await expect(a.send(message('m-2'))).rejects.toMatchObject({ kind: 'TRANSIENT' });
    a.setFault('permanent');
    await expect(a.send(message('m-2'))).rejects.toMatchObject({ kind: 'PERMANENT' });
    expect(await a.lookupSent('m-2')).toBeNull();
    a.setFault('timeout_after_send');
    await expect(a.send(message('m-3'))).rejects.toBeInstanceOf(ChannelSendError);
    expect(await a.lookupSent('m-3')).not.toBeNull();
    const crashing = new MockChannelAdapter(dir, new UuidV7Generator(), new FakeClock(NOW), 'crash_after_send', () => {
      throw new Error('process died');
    });
    await expect(crashing.send(message('m-4'))).rejects.toThrow('process died');
    expect(await crashing.lookupSent('m-4')).not.toBeNull();
  });
});
