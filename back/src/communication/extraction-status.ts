import { Instant } from '../shared/time/instant.js';
import type { AttemptLog } from './extraction.repository.js';

/**
 * 회신 하나의 추출 상태 · 시도 이력 · 사람 재시도 가능 여부(순수 — T-092 · T-124). 저장된 기록(실패 · 완료 감사 · 재시도 요청)만 시간순으로 본다.
 *
 * - 시도 = 기술 실패 한 건 또는 완료 감사 한 건. 사람이 재시도를 요청하면 다음 시도 하나가 `HUMAN_RETRY` 다(요청 하나 = 시도 하나)
 * - 자동 한도(`maxAttempts`)는 자동 시도의 기술 실패만 센다 — 사람 재시도는 한도를 되돌리지도, 쓰지도 않는다
 * - "답장이 왔다" ≠ "질문에 답을 얻었다": 통과 후보가 없으면 `needs_review` — 사람이 다시 읽게 하거나 사실을 직접 넣는다
 */
export const EXTRACTION_STATES = ['WAITING', 'DONE', 'NO_CANDIDATE', 'SKIPPED', 'RETRYING', 'FAILED'] as const;
export type ExtractionState = (typeof EXTRACTION_STATES)[number];

/** 왜 값을 못 얻었나 — AI 호출 자체의 실패와 모델이 답을 못 찾은 것을 나눈다 */
export const FAILURE_KINDS = ['AI_CALL_FAILED', 'NO_ANSWER_FOUND', 'VALIDATOR_REJECTED', 'NOT_EXTRACTABLE'] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

export const RETRY_BLOCKS = ['EXTRACTION_IN_PROGRESS', 'EXTRACTION_NOT_REQUIRED', 'NOT_EXTRACTABLE'] as const;
export type RetryBlock = (typeof RETRY_BLOCKS)[number];

export interface AttemptView {
  attempt_no: number;
  trigger: 'AUTO' | 'HUMAN_RETRY';
  /** RUNNING = 사람이 요청했고 아직 결과가 없다 */
  result: 'FAILED' | 'DONE' | 'NO_CANDIDATE' | 'SKIPPED' | 'RUNNING';
  at: string;
  error_code: string | null;
  provider_code: string | null;
  outcome: string | null;
  retry_request_id: string | null;
  requested_by_actor_id: string | null;
}

export interface ExtractionStatus {
  state: ExtractionState;
  no_candidate_outcome: string | null;
  failed_attempts: number;
  last_error_code: string | null;
  provider_code: string | null;
  failure_kind: FailureKind | null;
  needs_review: boolean;
  attempts: AttemptView[];
  retry: { available: boolean; blocked_reason: RetryBlock | null };
}

type TimelineEntry =
  | { kind: 'RETRY'; at: string; id: string; actor: string }
  | { kind: 'FAILURE'; at: string; code: string; providerCode: string | null }
  | { kind: 'COMPLETION'; at: string; action: string };

const NO_CANDIDATE_PREFIX = 'EXTRACTION_NO_CANDIDATE_';

export function extractionStatus(log: AttemptLog, candidates: { validation: 'PASSED' | 'REJECTED'; review_status: string }[], maxAttempts: number): ExtractionStatus {
  // 같은 시각이면 요청이 먼저(요청 뒤에 그 시도가 기록된다)
  const order = { RETRY: 0, FAILURE: 1, COMPLETION: 1 } as const;
  const timeline: TimelineEntry[] = [
    ...log.retries.map((r): TimelineEntry => ({ kind: 'RETRY', at: r.requestedAt, id: r.retryRequestId, actor: r.requestedByActorId })),
    ...log.failures.map((f): TimelineEntry => ({ kind: 'FAILURE', at: f.at, code: f.code, providerCode: f.providerCode })),
    ...log.completions.map((c): TimelineEntry => ({ kind: 'COMPLETION', at: c.at, action: c.action })),
  ].sort((a, b) => Instant.fromDb(a.at).compareTo(Instant.fromDb(b.at)) || order[a.kind] - order[b.kind]);

  const attempts: AttemptView[] = [];
  let open: { id: string; actor: string; at: string } | null = null;
  for (const e of timeline) {
    if (e.kind === 'RETRY') {
      open = { id: e.id, actor: e.actor, at: e.at };
      continue;
    }
    const manual: { id: string; actor: string } | null = open;
    open = null;
    const base = { attempt_no: attempts.length + 1, trigger: manual ? ('HUMAN_RETRY' as const) : ('AUTO' as const), at: e.at, retry_request_id: manual?.id ?? null, requested_by_actor_id: manual?.actor ?? null };
    if (e.kind === 'FAILURE') attempts.push({ ...base, result: 'FAILED', error_code: e.code, provider_code: e.providerCode, outcome: null });
    else attempts.push({ ...base, result: completionResult(e.action), error_code: null, provider_code: null, outcome: e.action.startsWith(NO_CANDIDATE_PREFIX) ? e.action.slice(NO_CANDIDATE_PREFIX.length) : null });
  }
  if (open) attempts.push({ attempt_no: attempts.length + 1, trigger: 'HUMAN_RETRY', result: 'RUNNING', at: open.at, error_code: null, provider_code: null, outcome: null, retry_request_id: open.id, requested_by_actor_id: open.actor });

  const settled = attempts.filter((a) => a.result !== 'RUNNING');
  const last = settled.at(-1) ?? null;
  const failures = settled.filter((a) => a.result === 'FAILED');
  const autoFailures = failures.filter((a) => a.trigger === 'AUTO').length;
  const lastFailure = failures.at(-1) ?? null;
  const passed = candidates.some((c) => c.validation === 'PASSED');

  let state: ExtractionState = 'WAITING';
  if (open) state = 'RETRYING';
  else if (last?.result === 'FAILED') state = last.trigger === 'HUMAN_RETRY' || autoFailures >= maxAttempts ? 'FAILED' : 'RETRYING';
  else if (last) state = last.result as ExtractionState;

  let failureKind: FailureKind | null = null;
  if (state === 'FAILED') failureKind = 'AI_CALL_FAILED';
  else if (state === 'NO_CANDIDATE') failureKind = 'NO_ANSWER_FOUND';
  else if (state === 'SKIPPED') failureKind = 'NOT_EXTRACTABLE';
  else if (state === 'DONE' && !passed) failureKind = 'VALIDATOR_REJECTED';

  let blocked: RetryBlock | null = null;
  if (state === 'WAITING' || state === 'RETRYING') blocked = 'EXTRACTION_IN_PROGRESS';
  else if (passed) blocked = 'EXTRACTION_NOT_REQUIRED';
  else if (state === 'SKIPPED') blocked = 'NOT_EXTRACTABLE';

  return {
    state,
    no_candidate_outcome: state === 'NO_CANDIDATE' ? (last?.outcome ?? null) : null,
    failed_attempts: failures.length,
    last_error_code: lastFailure?.error_code ?? null,
    provider_code: lastFailure?.provider_code ?? null,
    failure_kind: failureKind,
    needs_review: failureKind !== null,
    attempts,
    retry: { available: blocked === null, blocked_reason: blocked },
  };
}

function completionResult(action: string): AttemptView['result'] {
  if (action.startsWith(NO_CANDIDATE_PREFIX)) return 'NO_CANDIDATE';
  if (action.startsWith('EXTRACTION_SKIPPED_')) return 'SKIPPED';
  return 'DONE';
}
