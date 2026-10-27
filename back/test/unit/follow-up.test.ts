import { describe, expect, it } from 'vitest';
import { requiredFollowUps } from '../../src/planning/follow-up.js';

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
