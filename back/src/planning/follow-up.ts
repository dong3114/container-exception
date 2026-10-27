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
