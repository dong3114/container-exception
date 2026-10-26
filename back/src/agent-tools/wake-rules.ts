/**
 * 기다리는 Agent 실행을 깨울 때가 됐는지(순수 — T-104 durability · T-105 · T-093).
 *
 * 실행은 "무엇을 기다리는지"(대기 사유)와 "어느 업무 기록을"(대기 대상 = 메시지) 남긴다. 이 함수는 그 기록의 **지금 권위 상태**만 보고
 * 기다리던 일이 일어났는지 정한다. 알림(DomainSignals)을 놓쳐도 이 판정이 같은 결론을 낸다 — 정확성은 DB 상태가 보장한다.
 * 깨우는 것은 판단이 아니다: 깨어난 그래프가 Tool 로 상태를 다시 읽고 다음 행동을 정한다(아직이면 다시 기다린다).
 */
export interface AwaitedMessage {
  status: string;
  approvalState: string;
  replies: { status: string; extractionState: string | null }[];
  /** 이 문의가 물은 사실들의 지금 상태(T-093) — `fact_state` 가 PROVISIONAL 이고 충돌 · 보류가 없으면 "사람 확인을 기다리는 중" */
  facts?: { awaitingConfirmation: boolean }[];
}

/**
 * 계획 판을 기다리는 실행(T-114, 대기 대상 = RECOVERY_PLAN). 제안 · 실행 불가 판은 사람 결정이나 사실 변경을 기다린다 —
 * 사람이 승인했거나(APPROVED) 기댄 사실이 바뀌었거나(OUTDATED) 새 판에 밀렸으면(SUPERSEDED) 깨운다. 깨어난 그래프가 판 상태를 다시 읽는다.
 */
export function planWakeReason(waitingReason: string | null, planStatus: string | null): string | null {
  if (waitingReason !== 'AWAITING_PLAN_DECISION') return null;
  if (planStatus === null) return 'PLAN_MISSING';
  if (planStatus === 'APPROVED') return 'PLAN_APPROVED';
  if (planStatus === 'OUTDATED' || planStatus === 'SUPERSEDED') return 'PLAN_OUTDATED';
  return null;
}

/** 추출이 더 진행되지 않는 상태(후보가 있든 없든). RETRYING · WAITING 은 아직이다. */
export const EXTRACTION_SETTLED = ['DONE', 'NO_CANDIDATE', 'SKIPPED', 'FAILED'] as const;

export function wakeReason(waitingReason: string | null, m: AwaitedMessage): string | null {
  switch (waitingReason) {
    case 'HUMAN_APPROVAL_REQUIRED':
    case 'HUMAN_ACTION_REQUIRED':
      return m.status === 'PENDING_APPROVAL' || m.status === 'DRAFTED' ? null : 'APPROVAL_DECIDED';
    case 'AWAITING_SEND_REQUEST':
      return m.status === 'APPROVED' && m.approvalState === 'ACTIVE' ? null : 'SEND_PROGRESS';
    case 'AWAITING_DELIVERY':
      return m.status === 'QUEUED' ? null : 'SEND_PROGRESS';
    case 'AWAITING_REPLY': {
      const settled = m.replies.some((r) => r.status === 'NORMAL' && r.extractionState !== null && (EXTRACTION_SETTLED as readonly string[]).includes(r.extractionState));
      return settled || m.status === 'CLOSED' ? 'INBOUND_REPLY_RECEIVED' : null;
    }
    // 임시 사실이 사람 확인을 기다리는 동안은 계속 기다린다 — 확인 · 거절 · 정정 · 충돌로 더는 "확인 대기"가 아니면 깨운다
    case 'AWAITING_FACT_VERIFICATION':
      return m.facts && m.facts.some((f) => f.awaitingConfirmation) ? null : 'FACT_STATE_CHANGED';
    default:
      return null;
  }
}
