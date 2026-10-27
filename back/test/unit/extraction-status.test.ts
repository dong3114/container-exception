import { describe, expect, it } from 'vitest';
import type { AttemptLog } from '../../src/communication/extraction.repository.js';
import { extractionStatus, retryDelayMs } from '../../src/communication/extraction-status.js';

const at = (min: number) => `2026-10-27 04:${String(min).padStart(2, '0')}:00.000+00`;
const failure = (min: number, code = 'EXTRACTION_PROVIDER_FAILED', providerCode: string | null = 'NO_RECORDING', retryable = true) => ({ at: at(min), code, operation: 'extractReply', providerCode, retryable });
const retryAt = (min: number, id = `r${min}`) => ({ retryRequestId: id, messageId: 'm', commandId: id, requestedByActorId: 'human', requestedAt: at(min), priorState: 'FAILED', priorFailedAttempts: 0, note: null, isSimulated: false });
const log = (over: Partial<AttemptLog>): AttemptLog => ({ failures: [], completions: [], retries: [], ...over });
const PASSED = [{ validation: 'PASSED' as const, review_status: 'ACCEPTED' }];
const REJECTED = [{ validation: 'REJECTED' as const, review_status: 'REJECTED' }];

describe('extractionStatus (T-092 · T-124) — state, attempts and retry from the stored record only', () => {
  it('nothing yet → WAITING; automatic failures below the limit → RETRYING (no retry button); at the limit → FAILED, needs review', () => {
    expect(extractionStatus(log({}), [], 3)).toMatchObject({ state: 'WAITING', needs_review: false, retry: { available: false, blocked_reason: 'EXTRACTION_IN_PROGRESS' } });
    expect(extractionStatus(log({ failures: [failure(1)] }), [], 3)).toMatchObject({ state: 'RETRYING', failed_attempts: 1, retry: { available: false } });
    const s = extractionStatus(log({ failures: [failure(1), failure(2), failure(3)] }), [], 3);
    expect(s).toMatchObject({ state: 'FAILED', failure_kind: 'AI_CALL_FAILED', provider_code: 'NO_RECORDING', needs_review: true, retry: { available: true, blocked_reason: null } });
    expect(s.attempts.map((a) => [a.attempt_no, a.trigger, a.result])).toEqual([[1, 'AUTO', 'FAILED'], [2, 'AUTO', 'FAILED'], [3, 'AUTO', 'FAILED']]);
  });

  it('a human retry opens exactly one attempt: RUNNING until recorded, then FAILED (no automatic retry) or DONE — earlier attempts stay', () => {
    const base = [failure(1), failure(2), failure(3)];
    const running = extractionStatus(log({ failures: base, retries: [retryAt(4)] }), [], 3);
    expect(running).toMatchObject({ state: 'RETRYING', retry: { available: false, blocked_reason: 'EXTRACTION_IN_PROGRESS' } });
    expect(running.attempts.at(-1)).toMatchObject({ attempt_no: 4, trigger: 'HUMAN_RETRY', result: 'RUNNING', retry_request_id: 'r4', requested_by_actor_id: 'human' });
    const failedAgain = extractionStatus(log({ failures: [...base, failure(5)], retries: [retryAt(4)] }), [], 3);
    expect(failedAgain).toMatchObject({ state: 'FAILED', failed_attempts: 4, retry: { available: true } });
    expect(failedAgain.attempts.at(-1)).toMatchObject({ trigger: 'HUMAN_RETRY', result: 'FAILED' });
    // a human retry on a reply that never hit the limit is impossible (blocked while RETRYING) — and a failed human attempt never counts toward the automatic limit
    const done = extractionStatus(log({ failures: base, retries: [retryAt(4)], completions: [{ at: at(6), action: 'EXTRACTION_COMPLETED' }] }), PASSED, 3);
    expect(done).toMatchObject({ state: 'DONE', failure_kind: null, needs_review: false, retry: { available: false, blocked_reason: 'EXTRACTION_NOT_REQUIRED' } });
    expect(done.attempts.map((a) => a.trigger)).toEqual(['AUTO', 'AUTO', 'AUTO', 'HUMAN_RETRY']);
  });

  it('"the model found no answer" and "every answer was rejected" are told apart from an AI call failure', () => {
    expect(extractionStatus(log({ completions: [{ at: at(1), action: 'EXTRACTION_NO_CANDIDATE_UNPARSEABLE' }] }), [], 3)).toMatchObject({ state: 'NO_CANDIDATE', no_candidate_outcome: 'UNPARSEABLE', failure_kind: 'NO_ANSWER_FOUND', needs_review: true, retry: { available: true } });
    expect(extractionStatus(log({ completions: [{ at: at(1), action: 'EXTRACTION_COMPLETED' }] }), REJECTED, 3)).toMatchObject({ state: 'DONE', failure_kind: 'VALIDATOR_REJECTED', needs_review: true, retry: { available: true } });
    expect(extractionStatus(log({ completions: [{ at: at(1), action: 'EXTRACTION_SKIPPED_NO_CONTENT' }] }), [], 3)).toMatchObject({ state: 'SKIPPED', failure_kind: 'NOT_EXTRACTABLE', retry: { available: false, blocked_reason: 'NOT_EXTRACTABLE' } });
  });

  it('T-125: a failure that would repeat stops at once (human review); a transient one waits base × 3^(n−1) before the next automatic attempt', () => {
    const backoff = { baseMs: 10_000, maxMs: 120_000 };
    expect([1, 2, 3, 4, 5].map((n) => retryDelayMs(n, backoff))).toEqual([10_000, 30_000, 90_000, 120_000, 120_000]);
    expect(retryDelayMs(1, { baseMs: 0, maxMs: 0 })).toBe(0);
    // NO_RECORDING · 출력 형식 오류처럼 다시 해도 같은 실패 → 한도 전에도 FAILED, 사람 검토 · 다시 추출 가능
    const repeat = extractionStatus(log({ failures: [failure(1, 'EXTRACTION_PROVIDER_FAILED', 'NO_RECORDING', false)] }), [], 3, backoff);
    expect(repeat).toMatchObject({ state: 'FAILED', failed_attempts: 1, needs_review: true, next_attempt_at: null, retry: { available: true } });
    // 일시 실패(시간 초과 · 서버 장애) → RETRYING + 다음 자동 시도 시각
    const transient = extractionStatus(log({ failures: [failure(1, 'EXTRACTION_TIMEOUT', null, true), failure(2, 'AI_SERVER_UNAVAILABLE', null, true)] }), [], 3, backoff);
    expect(transient).toMatchObject({ state: 'RETRYING', needs_review: false, retry: { available: false, blocked_reason: 'EXTRACTION_IN_PROGRESS' } });
    expect(transient.next_attempt_at).toBe('2026-10-27T04:02:30.000Z'); // 두 번째 실패 04:02 + 30초
  });
});
