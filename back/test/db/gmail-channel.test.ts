import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { WorkerModule } from '../../src/app/worker.module.js';
import { CHANNEL_ADAPTERS, type ChannelAdapter, type ChannelType } from '../../src/channel/channel-adapter.js';
import { GmailChannelAdapter } from '../../src/channel/gmail-channel-adapter.js';
import { GmailClient } from '../../src/channel/gmail/gmail-client.js';
import { fromBase64Url } from '../../src/channel/gmail/gmail-mime.js';
import { InboundProcessor } from '../../src/communication/inbound-processor.js';
import { OutboxDispatcher } from '../../src/communication/outbox-dispatcher.js';
import type { Env } from '../../src/config/env.js';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../../src/content/content-store.js';
import { ACCOUNT, FakeGmail, PARTNER, reply } from '../fake-gmail.js';
import { T0, hashOf, registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-118 — Gmail 채널(가짜 Gmail 서버, 네트워크 없음): 승인 → Outbox → Worker → Gmail 발송 → 회신 → CERA 가 아는 스레드만 수집 →
 * 원문 보존 · 발신자 판정 → 정상. 실제 Google 왕복은 기술검증(docs/18 G.8)에서 사람 계정으로 따로 확인한다.
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-gmail-content-'));
const mockDir = mkdtempSync(join(tmpdir(), 'cera-gmail-mock-'));
const ACTOR = 'X-CERA-Actor-Id';
const BLOCKED = 'not-allowlisted@example.invalid';
const env = (extra: Partial<Record<keyof Env, string>> = {}) =>
  testEnv({ CERA_CONTENT_DIR: contentDir, CERA_MOCK_CHANNEL_DIR: mockDir, CERA_TEST_RECIPIENT_ALLOWLIST: PARTNER, CERA_SEND_RECONCILE_AFTER_MS: '0', ...extra });

let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let worker: INestApplicationContext;
let inbound: InboundProcessor;
let outbox: OutboxDispatcher;
const gmail = new FakeGmail();

/** 두 프로세스(API · Worker) 모두 같은 가짜 Gmail 을 쓰는 GMAIL 어댑터를 단다(설정 CERA_GMAIL_ENABLED 와 같은 효과). */
function attachGmail(ctx: INestApplicationContext) {
  const client = new GmailClient({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, 5_000, gmail.fetch);
  (ctx.get(CHANNEL_ADAPTERS) as Map<ChannelType, ChannelAdapter>).set('GMAIL', new GmailChannelAdapter(client, { accountEmail: ACCOUNT, maxMessageBytes: 1_000_000, lookupDays: 30 }));
}

beforeAll(async () => {
  api = await createApiApp(env());
  await api.init();
  attachGmail(api);
  http = request(api.getHttpServer());
  db = appPool();
  worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(env()), { logger: false });
  attachGmail(worker);
  inbound = worker.get(InboundProcessor);
  outbox = worker.get(OutboxDispatcher);
});

afterAll(async () => {
  await api.close();
  await worker.close();
  await db.end();
  rmSync(contentDir, { recursive: true, force: true });
  rmSync(mockDir, { recursive: true, force: true });
});

/** 실제(시뮬레이션 아님) 계획 실행 + GMAIL 주소(확인 · 승인 · 활성). */
async function world(address: string, opts: { simulatedRun?: boolean } = {}) {
  const r = await registry(db);
  const gmailAddressId = v7();
  await db.query(
    `INSERT INTO cera.contact_channel_address (address_id, contact_id, channel_type, normalized_address,
       email_verification_status, relationship_status, communication_status, verified_at, approved_by_actor_id, approved_at)
     VALUES ($1, $2, 'GMAIL', $3, 'VERIFIED', 'APPROVED', 'ACTIVE', $4, $5, $4)`,
    [gmailAddressId, r.contactId, address, T0, r.humanId],
  );
  const snapshotId = v7();
  const runId = v7();
  const sim = opts.simulatedRun ?? false;
  const scenarioId = sim ? v7() : null;
  if (scenarioId) await db.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'gmail sim', $2, $2)", [scenarioId, T0]);
  await db.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', $4, $2, $5)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`), sim, scenarioId],
  );
  await db.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'OPERATOR_REQUEST', 'TECH-VALIDATION', 'o1', 'FEASIBLE', $3, $4)`,
    [runId, snapshotId, sim, T0],
  );
  const truckPoolId = v7();
  await db.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Gmail 셔틀', 'PARTNER', $2)", [truckPoolId, r.counterpartyId]);
  return { ...r, gmailAddressId, runId, truckPoolId };
}

type World = Awaited<ReturnType<typeof world>>;

const draftBody = (w: World) => ({
  address_id: w.gmailAddressId,
  intent: 'TRUCK_SLOT',
  target_id: w.truckPoolId,
  source_run_id: w.runId,
  values: [
    { key: 'quantity', value_number: 2, unit: 'TRUCK' },
    { key: 'date', value_text: '2026-10-28' },
    { key: 'window_from', value_text: '15:00' },
    { key: 'window_to', value_text: '17:00' },
  ],
});

async function approvedAndQueued(w: World) {
  const d = (await http.post('/communication/drafts').send(draftBody(w)).expect(201)).body;
  expect(d.message.channel_type).toBe('GMAIL');
  expect(d.message.is_simulated).toBe(false);
  await http.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  await http.post(`/communication/drafts/${d.message.message_id}/send`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  return { messageId: d.message.message_id as string, threadId: d.thread.thread_id as string };
}

let w: World;
let sent: { messageId: string; threadId: string };

describe('Gmail send — the same approval → Outbox → Worker path as Mock', () => {
  it('sends the approved copy once; records the RFC822 Message-ID and the Gmail thread id', async () => {
    w = await world(PARTNER);
    sent = await approvedAndQueued(w);
    const before = gmail.sent.length;
    expect(await outbox.processMessage(sent.messageId)).toBe('SENT');
    expect(gmail.sent.length).toBe(before + 1);
    const mail = gmail.sent.at(-1)!;
    const text = Buffer.from(fromBase64Url(mail.raw)).toString('utf8');
    expect(text).toContain(`X-CERA-Message: ${sent.messageId}`);
    expect(text).toContain(`To: ${PARTNER}`);

    const attempt = (await db.query('SELECT result, provider_message_id FROM cera.send_attempt WHERE message_id = $1', [sent.messageId])).rows;
    expect(attempt).toEqual([{ result: 'SUCCESS', provider_message_id: `<${mail.id}@mail.gmail.com>` }]);
    const thread = (await db.query('SELECT external_thread_id, thread_status, is_simulated FROM cera.comm_thread WHERE thread_id = $1', [sent.threadId])).rows[0];
    expect(thread).toEqual({ external_thread_id: mail.threadId, thread_status: 'WAITING_REPLY', is_simulated: false });

    // 다시 돌려도 두 번 나가지 않는다
    await outbox.runCycle();
    expect(gmail.sent.length).toBe(before + 1);
  });

  it('a recipient outside the development allowlist is blocked before anything is written (two layers — G.5)', async () => {
    const other = await world(BLOCKED);
    const res = await http.post('/communication/drafts').send(draftBody(other)).expect(403);
    expect(res.body.code).toBe('RECIPIENT_NOT_ELIGIBLE');
  });

  it('values from a simulated (scenario) run can never go to Gmail (J.3)', async () => {
    const sim = await world(`sim-${v7()}@example.invalid`, { simulatedRun: true });
    const res = await http.post('/communication/drafts').send(draftBody(sim));
    expect([403, 422]).toContain(res.status);
  });
});

describe('Gmail inbound — only CERA threads, raw kept, sender checked by the registry', () => {
  it('a reply in the CERA thread is stored as RFC822, attached to the inquiry, and the quote is not in the preview', async () => {
    const mail = gmail.sent.at(-1)!;
    const replyRaw = reply({ inReplyTo: `<${mail.id}@mail.gmail.com>`, body: '네, 15~17시 2대 가능합니다.\n\nOn Tue, Oct 27, 2026 at 3:00 PM CERA <a@x> wrote:\n> 2대 가능할까요?' });
    gmail.inbox.push({ id: `in-${v7()}`, threadId: mail.threadId, internalDate: String(Date.parse('2026-10-27T06:11:00Z')), labelIds: ['INBOX'], raw: replyRaw });
    // CERA 가 모르는 스레드의 편지 — 읽지도, 저장하지도 않는다
    gmail.inbox.push({ id: `stray-${v7()}`, threadId: 'unknown-thread', internalDate: '0', labelIds: ['INBOX'], raw: reply({ inReplyTo: '<x@y>', body: 'hello' }) });
    gmail.calls = [];

    const summary = await inbound.runCycle();
    expect(summary.NORMAL).toBeGreaterThanOrEqual(1);
    expect(gmail.calls.some((c) => c.includes('unknown-thread'))).toBe(false);
    const stray = (await db.query("SELECT count(*)::int AS n FROM cera.raw_input WHERE source_name = 'GMAIL' AND source_record_key LIKE 'stray-%'")).rows[0].n;
    expect(stray).toBe(0);

    const raw = (await db.query("SELECT * FROM cera.raw_input WHERE source_name = 'GMAIL' AND source_record_key = $1", [gmail.inbox.at(-2)!.id])).rows[0];
    expect(raw).toMatchObject({ source_type: 'EMAIL', is_simulated: false });
    const bytes = await api.get<ContentStore>(CONTENT_STORE).get(raw.payload_ref);
    expect(bytes).not.toBe(ABSENT);
    expect(Buffer.from(bytes as Uint8Array).toString('base64url')).toBe(replyRaw); // 원문 바이트 그대로

    const draft = (await http.get(`/communication/drafts/${sent.messageId}`).expect(200)).body;
    expect(draft.message.status).toBe('REPLIED');
    expect(draft.replies).toEqual([expect.objectContaining({ status: 'NORMAL', from_address: PARTNER, preview: '네, 15~17시 2대 가능합니다.', thread_id: sent.threadId })]);

    // 같은 편지는 다시 받지 않는다(원문도 다시 내려받지 않는다)
    gmail.calls = [];
    expect((await inbound.runCycle()).NORMAL).toBe(0);
    expect(gmail.calls.filter((c) => c.startsWith('GET /gmail/v1/users/me/messages/in-'))).toEqual([]);
  });

  it('a reply from an address the registry does not know is held, not attached', async () => {
    // 첫 스레드에 등록부에 없는 사람이 끼어든 경우
    const mail = gmail.sent.at(-1)!;
    const id = `in-${v7()}`;
    gmail.inbox.push({ id, threadId: mail.threadId, internalDate: String(Date.parse('2026-10-27T06:20:00Z')), labelIds: ['INBOX'], raw: reply({ inReplyTo: `<${mail.id}@mail.gmail.com>`, body: '저도 가능', from: 'stranger@example.invalid' }) });
    await inbound.runCycle();
    const raw = (await db.query("SELECT raw_input_id FROM cera.raw_input WHERE source_name = 'GMAIL' AND source_record_key = $1", [id])).rows[0];
    expect(raw).toBeDefined();
    expect((await db.query("SELECT count(*)::int AS n FROM cera.comm_message WHERE channel_type = 'GMAIL' AND external_message_id = $1", [id])).rows[0].n).toBe(0);
  });
});

describe('Gmail failures (docs/18 H.3)', () => {
  it('a revoked token fails the message without retrying (AUTH is not transient)', async () => {
    const s = await approvedAndQueued(w);
    gmail.tokenStatus = 400;
    const fresh = new GmailClient({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, 5_000, gmail.fetch);
    (worker.get(CHANNEL_ADAPTERS) as Map<ChannelType, ChannelAdapter>).set('GMAIL', new GmailChannelAdapter(fresh, { accountEmail: ACCOUNT, maxMessageBytes: 1_000_000, lookupDays: 30 }));
    const before = gmail.sent.length;
    expect(await outbox.processMessage(s.messageId)).toBe('FAILED');
    gmail.tokenStatus = 200;
    expect(gmail.sent.length).toBe(before);
    const attempt = (await db.query('SELECT result, error_code FROM cera.send_attempt WHERE message_id = $1', [s.messageId])).rows;
    expect(attempt).toEqual([{ result: 'PERMANENT_FAILURE', error_code: 'GMAIL_TOKEN_REVOKED' }]);
    attachGmail(worker);
  });

  it('sent but the answer was lost (UNKNOWN) → reconciled from the sent box, never sent twice', async () => {
    const s = await approvedAndQueued(w);
    const before = gmail.sent.length;
    // Gmail 이 받아서 보냈지만 응답이 오는 길에 끊겼다
    const realFetch = gmail.fetch;
    const lossy = async (url: string, init: RequestInit) => {
      const res = await realFetch(url, init);
      if (url.endsWith('/messages/send')) {
        const e = new Error('socket hang up');
        e.name = 'TimeoutError';
        throw e;
      }
      return res;
    };
    const client = new GmailClient({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, 5_000, lossy);
    (worker.get(CHANNEL_ADAPTERS) as Map<ChannelType, ChannelAdapter>).set('GMAIL', new GmailChannelAdapter(client, { accountEmail: ACCOUNT, maxMessageBytes: 1_000_000, lookupDays: 30 }));
    expect(await outbox.processMessage(s.messageId)).toBe('UNKNOWN');
    expect(gmail.sent.length).toBe(before + 1);

    attachGmail(worker);
    const cycle = await outbox.runCycle({ reconcileAfterMs: 0 });
    expect(cycle.reconciled).toBeGreaterThanOrEqual(1);
    expect(gmail.sent.length).toBe(before + 1); // 다시 보내지 않았다
    const attempts = (await db.query('SELECT result, provider_message_id FROM cera.send_attempt WHERE message_id = $1 ORDER BY attempt_no', [s.messageId])).rows;
    expect(attempts).toEqual([{ result: 'SUCCESS', provider_message_id: `<${gmail.sent.at(-1)!.id}@mail.gmail.com>` }]);
    expect((await http.get(`/communication/drafts/${s.messageId}`).expect(200)).body.message.status).toBe('SENT');
  });
});
