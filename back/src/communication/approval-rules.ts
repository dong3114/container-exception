import type { Instant } from '../shared/time/instant.js';

/**
 * 승인 판정 — 순수 함수(docs/22 15.5 · 15.5.1 · docs/19 FR-APV-01~12 · T-069 11.4).
 *
 * - **유효한 승인**(15.5.1 여섯 조건): 같은 메시지 · `APPROVED` · 만료 전 · 무효화되지 않음 · 승인 지문 = 지금 내용의 지문 ·
 *   승인 수신자 = 실제 수신자. 이 판정이 "발송에 쓸 수 있는가"의 유일한 정의다(U5 Outbox 도 같은 판정 + DB 가드 I-9).
 * - **승인할 수 있는가**: 상태 · 내용 · 숫자 검사 · Contact Gate · 계획 교체 · 이미 살아 있는 승인을 함께 본다.
 *
 * DB · 네트워크 · LLM 을 import 하지 않고, 현재 시각을 읽지 않는다(`asOf` 를 받는다).
 */

export type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | 'REVOKED' | 'INVALIDATED';
export type InvalidationCause = 'USER_REVOKED' | 'PLAN_SUPERSEDED' | 'CONTENT_CHANGED';

export interface ApprovalRow {
  approvalId: string;
  decision: ApprovalDecision;
  invalidatesApprovalId: string | null;
  invalidationCause: InvalidationCause | null;
  decidedAt: Instant;
  expiresAt: Instant | null;
  approvedContentHash: string | null;
  approvedToAddressId: string | null;
}

/** 한 `APPROVED` 행의 지금 상태. `ACTIVE` 만 발송 근거가 될 수 있다(그리고 지문 · 수신자도 맞아야 한다). */
export type ApprovalRowState = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'INVALIDATED';

/** 메시지 단위 승인 상태(화면이 그대로 보여준다). */
export type MessageApprovalState = 'NONE' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'INVALIDATED' | 'REJECTED';

export interface ApprovalSummary {
  state: MessageApprovalState;
  /** 가장 최근 `APPROVED` 행(살아 있든 아니든). */
  latestApproved: ApprovalRow | null;
  latestApprovedState: ApprovalRowState | null;
  /** latestApproved 를 무효화한 행(REVOKED · INVALIDATED). */
  invalidatedBy: ApprovalRow | null;
  /** 최근 반려 행(상태가 REJECTED 일 때). */
  rejection: ApprovalRow | null;
}

export function approvalRowState(row: ApprovalRow, rows: readonly ApprovalRow[], asOf: Instant): ApprovalRowState {
  const killer = rows.find((r) => r.invalidatesApprovalId === row.approvalId);
  if (killer) return killer.decision === 'REVOKED' ? 'REVOKED' : 'INVALIDATED';
  if (row.expiresAt !== null && row.expiresAt.epochMs <= asOf.epochMs) return 'EXPIRED';
  return 'ACTIVE';
}

/** 행 순서: `decided_at` · 같은 시각이면 `approval_id`(UUIDv7 — 만든 순서). */
function byDecided(a: ApprovalRow, b: ApprovalRow): number {
  const d = a.decidedAt.epochMs - b.decidedAt.epochMs;
  return d !== 0 ? d : a.approvalId < b.approvalId ? -1 : a.approvalId > b.approvalId ? 1 : 0;
}

export function summarizeApprovals(rows: readonly ApprovalRow[], asOf: Instant): ApprovalSummary {
  const sorted = [...rows].sort(byDecided);
  const approved = sorted.filter((r) => r.decision === 'APPROVED');
  const latestApproved = approved.at(-1) ?? null;
  const rejection = sorted.filter((r) => r.decision === 'REJECTED' || r.decision === 'REVISION_REQUESTED').at(-1) ?? null;
  if (!latestApproved) {
    return { state: rejection ? 'REJECTED' : 'NONE', latestApproved: null, latestApprovedState: null, invalidatedBy: null, rejection };
  }
  const state = approvalRowState(latestApproved, sorted, asOf);
  const invalidatedBy = sorted.find((r) => r.invalidatesApprovalId === latestApproved.approvalId) ?? null;
  return { state, latestApproved, latestApprovedState: state, invalidatedBy, rejection };
}

/** 살아 있는 승인(만료 전 · 무효화 안 됨). 같은 메시지에 둘 이상은 없다(M12 가드). */
export function liveApproval(rows: readonly ApprovalRow[], asOf: Instant): ApprovalRow | null {
  return [...rows]
    .sort(byDecided)
    .reverse()
    .find((r) => r.decision === 'APPROVED' && approvalRowState(r, rows, asOf) === 'ACTIVE') ?? null;
}

/** 15.5.1 여섯 조건 — 이 승인으로 지금 이 내용을 이 수신자에게 보낼 수 있는가. */
export function isUsableForSend(
  row: ApprovalRow,
  rows: readonly ApprovalRow[],
  message: { contentHash: string; toAddressId: string | null },
  asOf: Instant,
): boolean {
  return (
    row.decision === 'APPROVED' &&
    approvalRowState(row, rows, asOf) === 'ACTIVE' &&
    row.approvedContentHash === message.contentHash &&
    row.approvedToAddressId !== null &&
    row.approvedToAddressId === message.toAddressId
  );
}

export const APPROVAL_BLOCK_REASONS = [
  'CONTENT_MISSING',
  'CONTENT_HASH_MISMATCH',
  'BLOCKED_NUMBER_CHECK',
  'RECIPIENT_NOT_ELIGIBLE',
  'PLAN_SUPERSEDED',
  'MESSAGE_SUPERSEDED',
  'NOT_PENDING_APPROVAL',
  'ALREADY_APPROVED',
] as const;
export type ApprovalBlockReason = (typeof APPROVAL_BLOCK_REASONS)[number];

export interface ApprovalFacts {
  status: string;
  contentPresent: boolean;
  /** 꺼낸 내용 + 구조화 값 + 수신자로 다시 계산한 지문 = 행의 `content_hash`. */
  contentHashMatches: boolean;
  numberCheckPassed: boolean;
  recipientEligible: boolean;
  /** 값의 출처 실행을 대체한 새 실행이 있다. */
  planSuperseded: boolean;
  hasLiveApproval: boolean;
}

/**
 * 지금 승인할 수 없는 이유(전부). 빈 배열이면 승인할 수 있다.
 * 상태: `PENDING_APPROVAL` → 첫 승인 · `APPROVED` + 살아 있는 승인 없음 → 재승인(취소 · 만료 뒤, 15.5.1 "재승인 = 새 APPROVED 행").
 * 승인 취소 · 무효화는 `PENDING_APPROVAL` 로 돌아가지 않는다(15.8.1). 대체된 메시지(`CLOSED`)는 승인하지 않는다.
 */
export function approvalBlocks(f: ApprovalFacts): ApprovalBlockReason[] {
  const out: ApprovalBlockReason[] = [];
  if (!f.contentPresent) out.push('CONTENT_MISSING');
  else {
    if (!f.contentHashMatches) out.push('CONTENT_HASH_MISMATCH');
    if (!f.numberCheckPassed) out.push('BLOCKED_NUMBER_CHECK');
  }
  if (!f.recipientEligible) out.push('RECIPIENT_NOT_ELIGIBLE');
  if (f.planSuperseded) out.push('PLAN_SUPERSEDED');
  if (f.status === 'CLOSED') out.push('MESSAGE_SUPERSEDED');
  else if (f.status === 'APPROVED') {
    if (f.hasLiveApproval) out.push('ALREADY_APPROVED');
  } else if (f.status !== 'PENDING_APPROVAL') out.push('NOT_PENDING_APPROVAL');
  return out;
}
