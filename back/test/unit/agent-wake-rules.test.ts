import { describe, expect, it } from 'vitest';
import { planWakeReason, wakeReason } from '../../src/agent-tools/wake-rules.js';

/** T-104 durability — the reconciler wakes a waiting run only from the awaited record's current state. */
const msg = (status: string, approvalState = 'NONE', replies: { status: string; extractionState: string | null }[] = []) => ({ status, approvalState, replies });

describe('wakeReason', () => {
  it('approval: wakes once the message left PENDING_APPROVAL (approved, rejected, …)', () => {
    expect(wakeReason('HUMAN_APPROVAL_REQUIRED', msg('PENDING_APPROVAL'))).toBeNull();
    expect(wakeReason('HUMAN_APPROVAL_REQUIRED', msg('APPROVED', 'ACTIVE'))).toBe('APPROVAL_DECIDED');
    expect(wakeReason('HUMAN_APPROVAL_REQUIRED', msg('REJECTED', 'REJECTED'))).toBe('APPROVAL_DECIDED');
  });

  it('send request · delivery · reply', () => {
    expect(wakeReason('AWAITING_SEND_REQUEST', msg('APPROVED', 'ACTIVE'))).toBeNull();
    expect(wakeReason('AWAITING_SEND_REQUEST', msg('QUEUED', 'ACTIVE'))).toBe('SEND_PROGRESS');
    expect(wakeReason('AWAITING_SEND_REQUEST', msg('APPROVED', 'REVOKED'))).toBe('SEND_PROGRESS');
    expect(wakeReason('AWAITING_DELIVERY', msg('QUEUED', 'ACTIVE'))).toBeNull();
    expect(wakeReason('AWAITING_DELIVERY', msg('SENT', 'ACTIVE'))).toBe('SEND_PROGRESS');
    expect(wakeReason('AWAITING_REPLY', msg('SENT', 'ACTIVE'))).toBeNull();
    expect(wakeReason('AWAITING_REPLY', msg('REPLIED', 'ACTIVE', [{ status: 'NORMAL', extractionState: 'WAITING' }]))).toBeNull(); // not extracted yet
    expect(wakeReason('AWAITING_REPLY', msg('REPLIED', 'ACTIVE', [{ status: 'NORMAL', extractionState: 'RETRYING' }]))).toBeNull();
    expect(wakeReason('AWAITING_REPLY', msg('REPLIED', 'ACTIVE', [{ status: 'NORMAL', extractionState: 'DONE' }]))).toBe('INBOUND_REPLY_RECEIVED');
    expect(wakeReason('AWAITING_REPLY', msg('REPLIED', 'ACTIVE', [{ status: 'NORMAL', extractionState: 'FAILED' }]))).toBe('INBOUND_REPLY_RECEIVED');
  });

  it('unknown or record-less waits are never woken by the reconciler', () => {
    expect(wakeReason('AWAITING_REPLIES', msg('SENT'))).toBeNull();
    expect(wakeReason(null, msg('APPROVED', 'ACTIVE'))).toBeNull();
  });
});

describe('planWakeReason (T-114) — a run waiting on a plan wakes on a human decision or a changed fact, never on its own', () => {
  it('APPROVED → PLAN_APPROVED · OUTDATED / SUPERSEDED → PLAN_OUTDATED · PROPOSED / INFEASIBLE → keep waiting', () => {
    expect(planWakeReason('AWAITING_PLAN_DECISION', 'APPROVED')).toBe('PLAN_APPROVED');
    expect(planWakeReason('AWAITING_PLAN_DECISION', 'OUTDATED')).toBe('PLAN_OUTDATED');
    expect(planWakeReason('AWAITING_PLAN_DECISION', 'SUPERSEDED')).toBe('PLAN_OUTDATED');
    expect(planWakeReason('AWAITING_PLAN_DECISION', 'PROPOSED')).toBeNull();
    expect(planWakeReason('AWAITING_PLAN_DECISION', 'INFEASIBLE')).toBeNull();
    expect(planWakeReason('AWAITING_PLAN_DECISION', null)).toBe('PLAN_MISSING');
    expect(planWakeReason('AWAITING_REPLY', 'APPROVED')).toBeNull(); // another wait is not a plan wait
  });
});
