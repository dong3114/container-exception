/**
 * 업무 사건 알림(T-104) — 업무 흐름이 끝난 뒤 "무엇이 바뀌었다"만 알린다. 큰 이벤트 버스가 아니다.
 * 보내는 쪽(예: 승인 서비스)은 받는 쪽(Agent Coordinator)을 모른다 — 모듈 사이 순환 의존 없이 기다리던 실행을 깨운다.
 * 알림은 업무 기록이 커밋된 **뒤**에 보낸다. 받는 쪽 실패가 업무 흐름을 되돌리지 않는다(받는 쪽이 기록 · 재시도).
 */
export type DomainSignal =
  | { type: 'APPROVAL_DECIDED'; messageId: string; decision: 'APPROVED' | 'REJECTED' | 'REVOKED' }
  | { type: 'INBOUND_REPLY_RECEIVED'; externalMessageId: string }
  | { type: 'REPLY_EXTRACTED'; inboundMessageId: string }
  // T-124: 사람이 회신 하나의 추출을 다시 요청했다 — Worker 의 추출 주기를 바로 깨운다(정확성은 폴링)
  | { type: 'EXTRACTION_RETRY_REQUESTED'; inboundMessageId: string }
  | { type: 'PLAN_SUPERSEDED'; recoveryRunId: string }
  // T-093: 현재 사실이 바뀌었다(승격 · 확인 · 거절 · 정정) — 사실을 기다리던 Agent 실행을 깨우는 최적화(정확성은 재조정)
  | { type: 'FACT_CHANGED'; entityId: string; factKey: string }
  // T-114: 계획 판 상태가 바뀌었다(사실 변경으로 OUTDATED · 사람 승인) — 그 판을 기다리던 Agent 실행을 깨운다
  | { type: 'PLAN_CHANGED'; recoveryRunId: string; planId: string; status: 'OUTDATED' | 'APPROVED' }
  // T-121: 발송 대기열에 들어갔다 · 일시 실패로 재시도가 예약됐다 · 나갔다 — 실행 큐(Redis)가 Worker 를 바로 깨우는 데 쓴다(정확성은 폴링)
  | { type: 'SEND_REQUESTED'; messageId: string }
  | { type: 'SEND_RETRY_SCHEDULED'; messageId: string; delayMs: number; attempt: number }
  | { type: 'MESSAGE_SENT'; messageId: string }
  // T-123: 운영 기록(컨테이너 계획 정보 · 요율 · 시설 계획 정보)이 바뀌었다 — 그 기록에 기댄 계획 판을 다시 본다(OUTDATED)
  | { type: 'OPERATIONAL_INPUT_CHANGED'; kind: 'CONTAINERS' | 'RATES' | 'FACILITY_PROFILES'; recoveryRunId: string | null };

export const DOMAIN_SIGNALS = Symbol('CERA_DOMAIN_SIGNALS');

type Listener = (signal: DomainSignal) => void | Promise<void>;

export class DomainSignals {
  private readonly listeners: Listener[] = [];

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
  }

  /** 받는 쪽을 기다리지 않는다(업무 응답을 늦추지 않게). 받는 쪽의 오류는 받는 쪽이 남긴다. */
  emit(signal: DomainSignal): void {
    for (const listener of this.listeners) {
      try {
        void Promise.resolve(listener(signal)).catch(() => undefined);
      } catch {
        // 받는 쪽 오류가 보내는 쪽을 깨지 않는다
      }
    }
  }
}
