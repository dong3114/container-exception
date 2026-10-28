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
  /** `passedCandidates` = 결정론 검증을 통과한 후보 수(T-124 — 사람 재시도가 쓸 만한 후보를 냈는가) */
  replies: { status: string; extractionState: string | null; passedCandidates?: number }[];
  /**
   * 이 문의가 물은 사실들의 지금 상태(T-093) — `awaitingConfirmation` = PROVISIONAL(사람 확인 대기) ·
   * `hasValue` = 값이 생겼다(확인 · 공식 기록 · 임시 · 검토 필요 — 사람 직접 입력 포함, T-124)
   */
  facts?: { awaitingConfirmation: boolean; hasValue?: boolean }[];
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
    // 회신은 왔지만 쓸 만한 값이 없어 사람을 기다린다(T-124): 사람이 사실을 직접 넣었거나(값이 생김) 다시 읽게 한 시도가 통과 후보를 내면 깨운다.
    // 다시 읽게 했는데 또 실패하면 계속 기다린다 — 실행은 "답을 얻었다"고 꾸미지 않는다
    case 'REPLY_REVIEW_REQUIRED':
      if (m.facts?.some((f) => f.hasValue)) return 'FACT_STATE_CHANGED';
      return m.replies.some((r) => r.status === 'NORMAL' && (r.passedCandidates ?? 0) > 0) ? 'EXTRACTION_RETRIED' : null;
    default:
      return null;
  }
}

/**
 * 연락처 때문에 사람을 기다리는 실행(운영 준비 · T-127 · T-129, 대기 대상 = 공백 주체). 공백이 아직 열려 있을 때만 부른다.
 * `usable` = 공백 주인에게서 이 실행이 지금 쓸 수 있는 주소들 · `selected` = 사람이 이 실행 · 이 주체에 고른 가장 최근 주소.
 * - 등록 대기: 쓸 수 있는 주소가 하나라도 생기면 깨운다(그래프가 하나면 초안 · 여럿이면 고르기 대기로 바꾼다)
 * - 고르기 대기: 사람이 고른 주소가 지금도 쓸 수 있으면 깨운다. 고를 필요가 없어져도(하나만 남음 · 모두 막힘) 깨워 그래프가 다시 판정하게 한다.
 *   쓸 수 있는 주소가 여전히 둘 이상이고 쓸 만한 선택이 없으면 그대로 기다린다(첫 주소를 임의로 고르지 않는다)
 */
export function contactWakeReason(waitingReason: string | null, usable: readonly string[], selected: string | null): string | null {
  if (waitingReason === 'CONTACT_REGISTRATION_REQUIRED') return usable.length > 0 ? 'REGISTRY_CHANGED' : null;
  if (waitingReason === 'CONTACT_SELECTION_REQUIRED') {
    if (selected && usable.includes(selected)) return 'CONTACT_SELECTED';
    return usable.length >= 2 ? null : 'REGISTRY_CHANGED';
  }
  return null;
}
