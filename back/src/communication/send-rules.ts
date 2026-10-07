import type { Instant } from '../shared/time/instant.js';
import { type ApprovalRow, isUsableForSend, liveApproval, summarizeApprovals } from './approval-rules.js';

/**
 * 발송 판정 — 순수 함수(T-090 U5 · docs/22 15.5.1 · 15.7 · docs/18 H.2 · H.3 · docs/19 FR-SND-01~13).
 *
 * **같은 규칙을 두 곳이 쓴다**: 발송 요청 API(빠른 실패)와 Worker 의 시도 직전(최종 안전 검사, FR-SND-08). 둘 다 이 함수를 부른다 —
 * 규칙을 두 번 구현하지 않는다. DB 가드(M08 I-9 · M13)가 마지막 방어선이다.
 *
 * DB · 네트워크 · LLM 을 import 하지 않고, 현재 시각을 읽지 않는다(`asOf` 를 받는다).
 */

export const SEND_BLOCK_REASONS = [
  'ALREADY_SENT',
  'MESSAGE_SUPERSEDED',
  'NOT_APPROVED',
  'APPROVAL_MISSING',
  'APPROVAL_EXPIRED',
  'APPROVAL_REVOKED',
  'APPROVAL_INVALIDATED',
  'APPROVAL_CONTENT_MISMATCH',
  'APPROVAL_RECIPIENT_MISMATCH',
  'APPROVAL_COPY_INVALID',
  'CONTENT_HASH_MISMATCH',
  'RECIPIENT_NOT_ELIGIBLE',
  'PLAN_SUPERSEDED',
  'SIMULATION_MISMATCH',
  'CHANNEL_UNAVAILABLE',
] as const;
export type SendBlockReason = (typeof SEND_BLOCK_REASONS)[number];

export interface SendFacts {
  status: string;
  messageContentHash: string;
  messageToAddressId: string | null;
  isSimulated: boolean;
  approvals: readonly ApprovalRow[];
  /** 살아 있는 승인의 사본(제목 · 본문 · 구조화 값)을 다시 해시하면 승인 지문과 같다. 살아 있는 승인이 없으면 무시. */
  liveCopyVerified: boolean;
  /** 꺼낸 메시지 내용 + 구조화 값 + 수신자로 다시 계산한 지문 = 행의 `content_hash`. */
  contentHashMatches: boolean;
  recipientEligible: boolean;
  planSuperseded: boolean;
  hasSuccessfulAttempt: boolean;
  /** 이 메시지 채널의 어댑터. 없으면 CHANNEL_UNAVAILABLE. */
  adapter: { declaresSimulated: boolean } | null;
}

/**
 * 지금 보내면 안 되는 이유(전부). 빈 배열이면 **유효한 승인**(15.5.1 여섯 조건) · 사본 온전 · 내용 온전 · 자격 · 계획 · 채널이 모두 통과.
 * 상태는 `APPROVED`(요청 전) 또는 `QUEUED`(Worker) 여야 한다.
 */
export function sendBlocks(f: SendFacts, asOf: Instant): SendBlockReason[] {
  const out: SendBlockReason[] = [];
  if (f.hasSuccessfulAttempt || f.status === 'SENT' || f.status === 'REPLIED') return ['ALREADY_SENT'];
  if (f.status === 'CLOSED') return ['MESSAGE_SUPERSEDED'];
  if (f.status !== 'APPROVED' && f.status !== 'QUEUED') out.push('NOT_APPROVED');

  const live = liveApproval(f.approvals, asOf);
  if (!live) {
    const state = summarizeApprovals(f.approvals, asOf).state;
    out.push(state === 'EXPIRED' ? 'APPROVAL_EXPIRED' : state === 'REVOKED' ? 'APPROVAL_REVOKED' : state === 'INVALIDATED' ? 'APPROVAL_INVALIDATED' : 'APPROVAL_MISSING');
  } else if (!isUsableForSend(live, f.approvals, { contentHash: f.messageContentHash, toAddressId: f.messageToAddressId }, asOf)) {
    if (live.approvedContentHash !== f.messageContentHash) out.push('APPROVAL_CONTENT_MISMATCH');
    if (live.approvedToAddressId !== f.messageToAddressId) out.push('APPROVAL_RECIPIENT_MISMATCH');
  } else if (!f.liveCopyVerified) {
    out.push('APPROVAL_COPY_INVALID');
  }
  if (!f.contentHashMatches) out.push('CONTENT_HASH_MISMATCH');
  if (!f.recipientEligible) out.push('RECIPIENT_NOT_ELIGIBLE');
  if (f.planSuperseded) out.push('PLAN_SUPERSEDED');
  if (!f.adapter) out.push('CHANNEL_UNAVAILABLE');
  else if (f.isSimulated && !f.adapter.declaresSimulated) out.push('SIMULATION_MISMATCH');
  return out;
}

export interface AttemptRow {
  sendAttemptId: string;
  attemptNo: number;
  approvalId: string | null;
  startedAt: Instant;
  finishedAt: Instant | null;
  result: 'SUCCESS' | 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE' | 'UNKNOWN' | null;
  errorCode: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
}

/** 화해 결과 표식(docs/24 14 결정 5): 보내지 않았음 확인 = `error_code` · 이미 나간 것을 찾음 = `error_message`(성공에는 오류 코드를 둘 수 없다). */
export const RECONCILED_NOT_SENT = 'RECONCILED_NOT_SENT';
export const RECONCILED_FOUND = 'reconciled: found in channel (lookup_sent)';

/** 화면이 보는 발송 상태(docs/19 15.1). `SENDING` 은 상태 코드가 아니라 결과 없는 · 미확정 시도다(docs/18 H.2). */
export type DispatchState = 'NOT_REQUESTED' | 'QUEUED' | 'SENDING' | 'RETRY_WAIT' | 'SENT' | 'FAILED';

export function dispatchState(status: string, attempts: readonly AttemptRow[]): DispatchState {
  if (status === 'SENT' || status === 'REPLIED') return 'SENT';
  if (status === 'DELIVERY_FAILED') return 'FAILED';
  if (status !== 'QUEUED') return 'NOT_REQUESTED';
  const last = [...attempts].sort((a, b) => a.attemptNo - b.attemptNo).at(-1);
  if (!last) return 'QUEUED';
  if (last.result === null || last.result === 'UNKNOWN') return 'SENDING';
  if (last.result === 'RETRYABLE_FAILURE') return 'RETRY_WAIT';
  return 'QUEUED';
}

/** 다음 시도 가능 시각 — 지수 백오프(첫 간격 × 2^(n-1), 상한 10분, docs/18 H.3 [ASSUMPTION]). 시도가 없으면 즉시. */
export function nextAttemptAt(attempts: readonly AttemptRow[], baseMs: number): Instant | null {
  const last = [...attempts].sort((a, b) => a.attemptNo - b.attemptNo).at(-1);
  if (!last || last.result !== 'RETRYABLE_FAILURE' || !last.finishedAt) return null;
  // 화해로 "보내지 않았음"이 확인된 시도는 기다리지 않는다 — 채널 장애가 아니라 중단이었다.
  if (last.errorCode === RECONCILED_NOT_SENT) return last.finishedAt;
  const delay = Math.min(baseMs * 2 ** (last.attemptNo - 1), 10 * 60_000);
  return last.finishedAt.plusMs(delay);
}
