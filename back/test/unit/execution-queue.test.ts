import { describe, expect, it } from 'vitest';
import { DisabledExecutionQueue, jobIdOf } from '../../src/queue/execution-queue.js';

describe('execution queue (T-121)', () => {
  it('one waiting job per (type, entity); a delayed retry does not collide with an immediate job', () => {
    expect(jobIdOf({ job_type: 'OUTBOX_SEND', entity_id: 'm1' })).toBe('OUTBOX_SEND__m1');
    expect(jobIdOf({ job_type: 'OUTBOX_SEND', entity_id: 'm1' }, 30_000)).toBe('OUTBOX_SEND__m1__d30');
    expect(jobIdOf({ job_type: 'AGENT_RECONCILE', entity_id: 'cycle' })).not.toContain(':');
  });

  it('without Redis the queue is disabled and never throws', async () => {
    const q = new DisabledExecutionQueue();
    expect(q.enabled).toBe(false);
    expect(await q.enqueue()).toBe(false);
    expect(await q.status()).toBe('disabled');
  });
});
