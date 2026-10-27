/**
 * 승인된 계획 판 → 필요한 외부 조치(T-116) — 순수 함수. 금액 · 배정을 바꾸지 않고, 판의 배정을 **상대별 요청**으로 묶기만 한다.
 *
 * - ODCY 경유(MOVE_TO_ODCY): ODCY · 날짜별 대수 → 그 ODCY 에 "N대 반입" 요청(FACILITY_CAPACITY 문의 형식)
 * - 협력 운송사 트럭(트럭 id `풀#HHMM-HHMM#번호`): 풀 · 시간창별 대수 → 그 운송사에 "N대 배차" 요청(TRUCK_SLOT 문의 형식)
 * - 원래 계획 유지 · 터미널 대기 · 자사 트럭: 외부 연락이 필요 없다
 * 조치 키는 판 안에서 결정론적이다 — 같은 조치는 한 번만 초안이 된다(plan_follow_up UNIQUE).
 */
export interface PlanItemLike {
  action: string;
  targetRef: string;
  /** 최종 목적지 도착일(ODCY 경유면 ODCY → 창고 날짜) */
  deliveryDay: string;
  /** 터미널 출발 날짜(Asia/Seoul) — ODCY 반입 · 트럭 배차는 이 날 일어난다. 없으면 deliveryDay */
  scheduledDay?: string | null;
  truckRef: string | null;
}

export type FollowUpAction =
  | { action_key: string; kind: 'ODCY_RECEIVE'; intent: 'FACILITY_CAPACITY'; facility_id: string; date: string; quantity: number }
  | { action_key: string; kind: 'PARTNER_TRUCKS'; intent: 'TRUCK_SLOT'; truck_pool_id: string; date: string; window_from: string; window_to: string; quantity: number };

const PARTNER_TRUCK = /^([0-9a-f-]{36})#(\d{2})(\d{2})-(\d{2})(\d{2})#\d+$/;

export function requiredFollowUps(items: readonly PlanItemLike[]): FollowUpAction[] {
  const odcy = new Map<string, { facility_id: string; date: string; n: number }>();
  const trucks = new Map<string, { pool: string; date: string; from: string; to: string; ids: Set<string> }>();
  for (const it of items) {
    const day = it.scheduledDay ?? it.deliveryDay;
    if (it.action === 'MOVE_TO_ODCY') {
      // ODCY 반입은 터미널에서 나가는 날이다(최종 도착일이 아니다)
      const k = `${it.targetRef}|${day}`;
      const cur = odcy.get(k) ?? { facility_id: it.targetRef, date: day, n: 0 };
      cur.n += 1;
      odcy.set(k, cur);
    }
    const m = it.truckRef ? PARTNER_TRUCK.exec(it.truckRef) : null;
    if (m) {
      const from = `${m[2]}:${m[3]}`;
      const to = `${m[4]}:${m[5]}`;
      const k = `${m[1]}|${day}|${from}|${to}`;
      const cur = trucks.get(k) ?? { pool: m[1]!, date: day, from, to, ids: new Set<string>() };
      cur.ids.add(it.truckRef!); // 한 트럭이 여러 번 왕복해도 1대
      trucks.set(k, cur);
    }
  }
  const out: FollowUpAction[] = [
    ...[...odcy.values()].map((o): FollowUpAction => ({ action_key: `ODCY_RECEIVE:${o.facility_id}:${o.date}`, kind: 'ODCY_RECEIVE', intent: 'FACILITY_CAPACITY', facility_id: o.facility_id, date: o.date, quantity: o.n })),
    ...[...trucks.values()].map((t): FollowUpAction => ({
      action_key: `PARTNER_TRUCKS:${t.pool}:${t.date}:${t.from}-${t.to}`,
      kind: 'PARTNER_TRUCKS',
      intent: 'TRUCK_SLOT',
      truck_pool_id: t.pool,
      date: t.date,
      window_from: t.from,
      window_to: t.to,
      quantity: t.ids.size,
    })),
  ];
  return out.sort((a, b) => a.action_key.localeCompare(b.action_key));
}

/**
 * 이미 보낸 후속 문의와 새 판의 조치 비교(T-128) — 순수 함수 · 결정론(LLM 이 차이를 판단하지 않는다).
 * "약속" = 조치 키마다 **발송된** 마지막 후속(요청 · 정정은 그 수량, 취소는 약속 없음). 새 판과 비교해:
 *   UNCHANGED(같은 수량 · 같은 상대) → 아무것도 하지 않는다(같은 요청을 다시 보내지 않는다)
 *   MODIFIED(수량이 바뀜, 같은 상대) → 원래 받는 사람에게 정정
 *   REMOVED(새 판에 없음) → 원래 받는 사람에게 취소
 *   상대가 바뀜(시설 운영 거래처 · 풀 소유 변경) → 옛 상대에게 취소 + 새 상대에게 새 요청(한 업체에 둘을 섞지 않는다)
 *   ADDED(약속 없음) → 새 요청
 * 조치 키: 요청 = 원래 키, 정정 = `CORRECT:` + 키, 취소 = `CANCEL:` + 키 — 판마다 한 번(plan_follow_up UNIQUE)이라 다시 불러도 같은 초안
 */
export type FollowUpKind = 'REQUEST' | 'CORRECTION' | 'CANCELLATION';
export interface SentFollowUp {
  base_key: string;
  kind: FollowUpKind;
  message_id: string;
  address_id: string;
  counterparty_id: string;
  quantity: number;
  sent_at: string;
}
export interface FollowUpPlanItem {
  delta: 'ADDED' | 'MODIFIED' | 'REMOVED' | 'CONTACT_CHANGED';
  kind: FollowUpKind;
  action_key: string;
  action: FollowUpAction;
  /** 정정 · 취소가 가리키는 이미 보낸 메시지 */
  refers_to_message_id: string | null;
  /** 정정 · 취소는 원래 받는 사람에게 보낸다(같은 역할의 다른 회사로 대신 보내지 않는다) */
  to_address_id: string | null;
  previous_quantity: number | null;
}

export const baseKeyOf = (actionKey: string) => actionKey.replace(/^(CORRECT|CANCEL):/, '');

/** 조치 키 → 조치(약속을 취소할 때 원래 날짜 · 시간창을 키에서 되살린다). */
export function actionFromKey(key: string, quantity: number): FollowUpAction | null {
  const o = /^ODCY_RECEIVE:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (o) return { action_key: key, kind: 'ODCY_RECEIVE', intent: 'FACILITY_CAPACITY', facility_id: o[1]!, date: o[2]!, quantity };
  const t = /^PARTNER_TRUCKS:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(key);
  if (t) return { action_key: key, kind: 'PARTNER_TRUCKS', intent: 'TRUCK_SLOT', truck_pool_id: t[1]!, date: t[2]!, window_from: t[3]!, window_to: t[4]!, quantity };
  return null;
}

export function followUpDelta(next: readonly FollowUpAction[], sent: readonly SentFollowUp[], ownerOf: (a: FollowUpAction) => string | null): { items: FollowUpPlanItem[]; unchanged: string[] } {
  const promised = new Map<string, SentFollowUp>();
  for (const s of [...sent].sort((a, b) => a.sent_at.localeCompare(b.sent_at) || a.message_id.localeCompare(b.message_id))) {
    if (s.kind === 'CANCELLATION') promised.delete(s.base_key);
    else promised.set(s.base_key, s);
  }
  const items: FollowUpPlanItem[] = [];
  const unchanged: string[] = [];
  const nextBy = new Map(next.map((a) => [a.action_key, a]));
  for (const [key, p] of promised) {
    const n = nextBy.get(key);
    const cancel = (delta: FollowUpPlanItem['delta']): FollowUpPlanItem | null => {
      const action = actionFromKey(key, p.quantity);
      return action ? { delta, kind: 'CANCELLATION', action_key: `CANCEL:${key}`, action, refers_to_message_id: p.message_id, to_address_id: p.address_id, previous_quantity: null } : null;
    };
    if (!n) {
      const c = cancel('REMOVED');
      if (c) items.push(c);
      continue;
    }
    if (ownerOf(n) !== p.counterparty_id) {
      const c = cancel('CONTACT_CHANGED');
      if (c) items.push(c);
      items.push({ delta: 'CONTACT_CHANGED', kind: 'REQUEST', action_key: key, action: n, refers_to_message_id: null, to_address_id: null, previous_quantity: null });
      continue;
    }
    if (n.quantity !== p.quantity) items.push({ delta: 'MODIFIED', kind: 'CORRECTION', action_key: `CORRECT:${key}`, action: n, refers_to_message_id: p.message_id, to_address_id: p.address_id, previous_quantity: p.quantity });
    else unchanged.push(key);
  }
  for (const n of next) if (!promised.has(n.action_key)) items.push({ delta: 'ADDED', kind: 'REQUEST', action_key: n.action_key, action: n, refers_to_message_id: null, to_address_id: null, previous_quantity: null });
  return { items: items.sort((a, b) => a.action_key.localeCompare(b.action_key)), unchanged: unchanged.sort() };
}
