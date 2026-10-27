import { describe, expect, it } from 'vitest';
import { followUpDelta, requiredFollowUps } from '../../src/planning/follow-up.js';

const POOL = '01a0fb92-9b66-7544-aeb3-37f8cf3aa301';
const item = (action: string, targetRef: string, truckRef: string | null = null, deliveryDay = '2026-10-13') => ({ action, targetRef, deliveryDay, truckRef });

describe('approved plan → required follow-ups (T-116)', () => {
  it('groups ODCY receipts per facility and day; partner trucks per pool and window (a truck counted once); no action for keep / wait / own trucks', () => {
    const actions = requiredFollowUps([
      item('MOVE_TO_ODCY', 'odcy-a', `${POOL}#1500-1800#0`),
      item('MOVE_TO_ODCY', 'odcy-a', `${POOL}#1500-1800#0`),
      item('MOVE_TO_ODCY', 'odcy-b', 'TRUCK-03'),
      item('KEEP_CURRENT_PLAN', 'wh-a', `${POOL}#1500-1800#1`),
      item('WAIT_AT_TERMINAL', 'terminal', null, '2026-10-14'),
    ]);
    expect(actions).toEqual([
      { action_key: 'ODCY_RECEIVE:odcy-a:2026-10-13', kind: 'ODCY_RECEIVE', intent: 'FACILITY_CAPACITY', facility_id: 'odcy-a', date: '2026-10-13', quantity: 2 },
      { action_key: 'ODCY_RECEIVE:odcy-b:2026-10-13', kind: 'ODCY_RECEIVE', intent: 'FACILITY_CAPACITY', facility_id: 'odcy-b', date: '2026-10-13', quantity: 1 },
      { action_key: `PARTNER_TRUCKS:${POOL}:2026-10-13:15:00-18:00`, kind: 'PARTNER_TRUCKS', intent: 'TRUCK_SLOT', truck_pool_id: POOL, date: '2026-10-13', window_from: '15:00', window_to: '18:00', quantity: 2 },
    ]);
  });

  it('an ODCY receipt happens on the terminal departure day, not on the final delivery day', () => {
    const [a] = requiredFollowUps([{ action: 'MOVE_TO_ODCY', targetRef: 'odcy-a', deliveryDay: '2026-10-15', scheduledDay: '2026-10-13', truckRef: null }]);
    expect(a).toMatchObject({ date: '2026-10-13', action_key: 'ODCY_RECEIVE:odcy-a:2026-10-13' });
  });

  it('deterministic: the same items in another order give the same actions', () => {
    const a = [item('MOVE_TO_ODCY', 'x'), item('MOVE_TO_ODCY', 'y')];
    expect(requiredFollowUps(a)).toEqual(requiredFollowUps([...a].reverse()));
    expect(requiredFollowUps([])).toEqual([]);
  });
});

describe('T-128 sent follow-ups vs the new plan — deterministic delta', () => {
  const F = '0000000a-0000-7000-8000-00000000f001';
  const POOL = '0000000a-0000-7000-8000-00000000f002';
  const A = 'cp-a';
  const B = 'cp-b';
  const odcy = (q: number) => ({ action_key: `ODCY_RECEIVE:${F}:2026-10-13`, kind: 'ODCY_RECEIVE' as const, intent: 'FACILITY_CAPACITY' as const, facility_id: F, date: '2026-10-13', quantity: q });
  const trucks = (q: number) => ({ action_key: `PARTNER_TRUCKS:${POOL}:2026-10-13:15:00-18:00`, kind: 'PARTNER_TRUCKS' as const, intent: 'TRUCK_SLOT' as const, truck_pool_id: POOL, date: '2026-10-13', window_from: '15:00', window_to: '18:00', quantity: q });
  const sent = (key: string, q: number, kind: 'REQUEST' | 'CORRECTION' | 'CANCELLATION' = 'REQUEST', at = '2026-10-13T01:00:00Z', cp = A) => ({ base_key: key, kind, message_id: `m-${kind}-${at}`, address_id: `addr-${cp}`, counterparty_id: cp, quantity: q, sent_at: at });
  const owner = () => A;

  it('A unchanged → nothing · B removed → cancellation to the original recipient · C modified → correction · D new → request', () => {
    expect(followUpDelta([odcy(3)], [sent(odcy(3).action_key, 3)], owner)).toEqual({ items: [], unchanged: [odcy(3).action_key] });
    const removed = followUpDelta([], [sent(odcy(3).action_key, 3)], owner).items;
    expect(removed).toEqual([expect.objectContaining({ delta: 'REMOVED', kind: 'CANCELLATION', action_key: `CANCEL:${odcy(3).action_key}`, to_address_id: 'addr-cp-a', refers_to_message_id: expect.any(String), action: expect.objectContaining({ quantity: 3, facility_id: F }) })]);
    const modified = followUpDelta([odcy(2)], [sent(odcy(3).action_key, 3)], owner).items;
    expect(modified).toEqual([expect.objectContaining({ delta: 'MODIFIED', kind: 'CORRECTION', action_key: `CORRECT:${odcy(3).action_key}`, previous_quantity: 3, to_address_id: 'addr-cp-a', action: expect.objectContaining({ quantity: 2 }) })]);
    expect(followUpDelta([trucks(2)], [], owner).items).toEqual([expect.objectContaining({ delta: 'ADDED', kind: 'REQUEST', action_key: trucks(2).action_key, to_address_id: null })]);
  });

  it('E the operator changed → cancel at the old company and request at the new one (never mixed)', () => {
    const items = followUpDelta([odcy(3)], [sent(odcy(3).action_key, 3)], () => B).items;
    expect(items.map((i) => [i.kind, i.to_address_id])).toEqual([
      ['CANCELLATION', 'addr-cp-a'],
      ['REQUEST', null],
    ]);
  });

  it('the latest sent message is the promise: a sent correction updates it, a sent cancellation ends it', () => {
    const key = odcy(3).action_key;
    expect(followUpDelta([odcy(2)], [sent(key, 3), sent(key, 2, 'CORRECTION', '2026-10-13T02:00:00Z')], owner).items).toEqual([]);
    expect(followUpDelta([odcy(2)], [sent(key, 3), sent(key, 3, 'CANCELLATION', '2026-10-13T02:00:00Z')], owner).items).toEqual([expect.objectContaining({ kind: 'REQUEST', delta: 'ADDED' })]);
  });
});
