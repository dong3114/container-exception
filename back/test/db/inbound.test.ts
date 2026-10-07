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
import { CHANNEL_ADAPTERS } from '../../src/channel/channel-adapter.js';
import type { ChannelAdapters } from '../../src/channel/channel.module.js';
import type { MockChannelAdapter, SimulatedReply } from '../../src/channel/mock-channel-adapter.js';
import { InboundProcessor } from '../../src/communication/inbound-processor.js';
import { OutboxDispatcher } from '../../src/communication/outbox-dispatcher.js';
import type { Env } from '../../src/config/env.js';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../../src/content/content-store.js';
import { sha256Bytes } from '../../src/shared/hash/hash.js';
import { T0, hashOf, registry, type Registry } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-091 U6 — 회신 수신: Mock 수신함 → Worker 수신 주기 → 원문 보존(내용 저장소 + raw_input) → 스레드 연결 · 발신자 판정 → 정상 / 보류.
 * 내용은 해석하지 않는다(LLM 없음 · 사건 없음).
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-inbound-content-'));
const mockDir = mkdtempSync(join(tmpdir(), 'cera-inbound-mock-'));
const ACTOR = 'X-CERA-Actor-Id';
const env = (extra: Partial<Record<keyof Env, string>> = {}) => testEnv({ CERA_CONTENT_DIR: contentDir, CERA_MOCK_CHANNEL_DIR: mockDir, ...extra });

let api: INestApplication;
let http: ReturnType<typeof request>;
let app: pg.Pool;
let worker: INestApplicationContext;
let mock: MockChannelAdapter;
let inbound: InboundProcessor;
let outbox: OutboxDispatcher;

beforeAll(async () => {
  api = await createApiApp(env());
  await api.init();
  http = request(api.getHttpServer());
  app = appPool();
  worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(env()), { logger: false });
  mock = (worker.get(CHANNEL_ADAPTERS) as ChannelAdapters).get('MOCK') as MockChannelAdapter;
  inbound = worker.get(InboundProcessor);
  outbox = worker.get(OutboxDispatcher);
});

afterAll(async () => {
  await api.close();
  await worker.close();
  await app.end();
  rmSync(contentDir, { recursive: true, force: true });
  rmSync(mockDir, { recursive: true, force: true });
});

interface World extends Registry {
  runId: string;
  truckPoolId: string;
  from: string;
}

async function world(): Promise<World> {
  const r = await registry(app);
  const scenarioId = v7();
  const snapshotId = v7();
  const runId = v7();
  const truckPoolId = v7();
  await app.query("INSERT INTO cera.scenario (scenario_id, scenario_name, as_of_base, created_at) VALUES ($1, 'inbound scenario', $2, $2)", [scenarioId, T0]);
  await app.query(
    `INSERT INTO cera.planning_snapshot (snapshot_id, as_of, fact_fingerprint, rule_version, tariff_version, policy_version, contains_simulated, created_at, scenario_id)
     VALUES ($1, $2, $3, 'r1', 't1', 'p1', true, $2, $4)`,
    [snapshotId, T0, hashOf(`snap-${snapshotId}`), scenarioId],
  );
  await app.query(
    `INSERT INTO cera.recovery_run (run_id, snapshot_id, trigger_type, trigger_ref, objective_version, run_status, contains_simulated, executed_at)
     VALUES ($1, $2, 'EXCEPTION_DETECTED', 'RP-IN', 'o1', 'FEASIBLE', true, $3)`,
    [runId, snapshotId, T0],
  );
  await app.query("INSERT INTO cera.truck_pool (truck_pool_id, pool_name, ownership, owner_counterparty_id) VALUES ($1, 'Test 셔틀', 'PARTNER', $2)", [
    truckPoolId,
    r.counterpartyId,
  ]);
  return { ...r, runId, truckPoolId, from: `dispatch-${r.addressId}@example.invalid` };
}

/** 문의 → 승인 → 발송 요청 → Worker 발송까지(SENT). */
async function sentInquiry(w: World) {
  const d = (
    await http
      .post('/communication/drafts')
      .send({
        address_id: w.addressId,
        intent: 'TRUCK_SLOT',
        target_id: w.truckPoolId,
        source_run_id: w.runId,
        values: [
          { key: 'quantity', value_number: 2, unit: 'TRUCK', source_path: 'resource_gaps[0].needed' },
          { key: 'date', value_text: '2026-10-13' },
          { key: 'window_from', value_text: '15:00' },
          { key: 'window_to', value_text: '17:00' },
        ],
      })
      .expect(201)
  ).body;
  await http.post(`/communication/drafts/${d.message.message_id}/approve`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  await http.post(`/communication/drafts/${d.message.message_id}/send`).set(ACTOR, w.humanId).send({ content_hash: d.message.content_hash }).expect(200);
  expect(await outbox.processMessage(d.message.message_id)).toBe('SENT');
  const sent = (await mock.sentRecords()).find((r) => r.headers['X-CERA-Message'] === d.message.message_id);
  if (!sent) throw new Error('not sent');
  return { messageId: d.message.message_id as string, threadId: d.thread.thread_id as string, sent };
}

const rawRow = async (externalMessageId: string) =>
  (await app.query("SELECT * FROM cera.raw_input WHERE source_name = 'MOCK' AND source_record_key = $1", [externalMessageId])).rows;
const inboundMessages = async (externalMessageId: string) =>
  (await app.query("SELECT * FROM cera.comm_message WHERE direction = 'INBOUND' AND channel_type = 'MOCK' AND external_message_id = $1", [externalMessageId])).rows;
const heldItem = async (rawInputId: string) =>
  (await http.get('/communication/inbound?status=HOLD').expect(200)).body.items.find((i: { raw_input_id: string }) => i.raw_input_id === rawInputId);

async function reply(options: SimulatedReply) {
  const r = await mock.simulateReply(options);
  const summary = await inbound.runCycle();
  return { r, summary };
}

describe('A · F. a normal reply is preserved, attached to its inquiry and shown on the draft', () => {
  it('raw original stored and verified · raw_input · INBOUND message (no outbound lifecycle) · outbound REPLIED · thread ANSWERED', async () => {
    const w = await world();
    const s = await sentInquiry(w);
    const { r } = await reply({ replyToCeraMessageId: s.messageId, body: '15:00~17:00 2대 가능합니다.' });

    const [raw] = await rawRow(r.external_message_id);
    expect(raw).toMatchObject({ source_type: 'EMAIL', source_name: 'MOCK', is_simulated: true });
    expect(raw.payload_ref).toMatch(/^cref:v1:RAW_INPUT_PAYLOAD:/);
    // 원문 = 내용 저장소의 바이트, 지문 = 그 바이트의 sha256
    const bytes = await api.get<ContentStore>(CONTENT_STORE).get(raw.payload_ref);
    expect(bytes).not.toBe(ABSENT);
    expect(sha256Bytes(bytes as Uint8Array)).toBe(raw.payload_hash);
    expect(JSON.parse(new TextDecoder().decode(bytes as Uint8Array)).headers['X-CERA-Message']).toBeUndefined();

    const [msg] = await inboundMessages(r.external_message_id);
    expect(msg).toMatchObject({ thread_id: s.threadId, drafted_by: null, current_status: null, from_address: w.from, content_hash: raw.payload_hash, message_content_ref: null });
    const transitions = (await app.query('SELECT status FROM cera.message_status_transition WHERE message_id = $1 ORDER BY occurred_at, transition_id', [s.messageId])).rows.map((x) => x.status);
    expect(transitions.at(-1)).toBe('REPLIED');
    expect((await app.query('SELECT thread_status FROM cera.comm_thread WHERE thread_id = $1', [s.threadId])).rows[0].thread_status).toBe('ANSWERED');
    expect((await app.query('SELECT count(*)::int AS n FROM cera.message_status_transition WHERE message_id = $1', [msg.message_id])).rows[0].n).toBe(0);

    const draft = (await http.get(`/communication/drafts/${s.messageId}`).expect(200)).body;
    expect(draft.message.status).toBe('REPLIED');
    expect(draft.replies).toEqual([
      expect.objectContaining({
        status: 'NORMAL',
        hold_reasons: [],
        from_address: w.from,
        subject: r.headers.Subject,
        preview: '15:00~17:00 2대 가능합니다.',
        thread_id: s.threadId,
        evidence_basis: 'DATE_HEADER',
        content_available: true,
        sender_label: { counterparty_name: 'Test Trucking', contact_name: 'Dispatcher' },
      }),
    ]);
    // 사실(Event)은 만들지 않는다 — 추출은 다음 단위
    expect((await app.query('SELECT count(*)::int AS n FROM cera.event WHERE raw_input_id = $1', [raw.raw_input_id])).rows[0].n).toBe(0);
  });
});

describe('B. the same reply fetched again is stored once', () => {
  it('two fetch cycles and a direct re-ingest → one raw_input, one message', async () => {
    const w = await world();
    const s = await sentInquiry(w);
    const { r, summary } = await reply({ replyToCeraMessageId: s.messageId });
    expect(summary.NORMAL).toBeGreaterThanOrEqual(1);
    const again = await inbound.runCycle();
    expect(again.NORMAL).toBe(0);
    const { messages } = await mock.fetchInbound(null);
    const same = messages.find((m) => m.externalMessageId === r.external_message_id);
    if (!same) throw new Error('missing');
    expect(await inbound.ingest(mock, same)).toBe('DUPLICATE');
    expect(await rawRow(r.external_message_id)).toHaveLength(1);
    expect(await inboundMessages(r.external_message_id)).toHaveLength(1);
  });
});

describe('C. sender is checked against the registry — anything doubtful is held, never discarded', () => {
  it('unknown sender → HOLD UNKNOWN_SENDER (original kept, visible in the hold box)', async () => {
    const w = await world();
    const s = await sentInquiry(w);
    const { r } = await reply({ replyToCeraMessageId: s.messageId, from: 'stranger@example.invalid' });
    const [raw] = await rawRow(r.external_message_id);
    expect(raw).toBeDefined();
    expect(await inboundMessages(r.external_message_id)).toHaveLength(0);
    const item = await heldItem(raw.raw_input_id);
    expect(item).toMatchObject({ status: 'HOLD', hold_reasons: ['UNKNOWN_SENDER'], from_address: 'stranger@example.invalid', subject: r.headers.Subject, sender_label: null, message_id: null });
    expect(item.received_at).toMatch(/\+09:00$/);
    expect((await http.get(`/communication/drafts/${s.messageId}`).expect(200)).body.message.status).toBe('SENT'); // 보류는 문의 상태를 바꾸지 않는다
  });

  it('inactive · unverified address → HOLD', async () => {
    const w = await world();
    const s = await sentInquiry(w);
    await app.query("UPDATE cera.contact_channel_address SET communication_status = 'PAUSED' WHERE address_id = $1", [w.addressId]);
    const inactive = await reply({ replyToCeraMessageId: s.messageId });
    expect((await heldItem((await rawRow(inactive.r.external_message_id))[0].raw_input_id)).hold_reasons).toEqual(['SENDER_INACTIVE']);
    await app.query("UPDATE cera.contact_channel_address SET communication_status = 'ACTIVE', email_verification_status = 'UNVERIFIED' WHERE address_id = $1", [w.addressId]);
    const unverified = await reply({ replyToCeraMessageId: s.messageId });
    expect((await heldItem((await rawRow(unverified.r.external_message_id))[0].raw_input_id)).hold_reasons).toEqual(['SENDER_UNVERIFIED']);
  });

  it('a registered address of another counterparty → OTHER_COUNTERPARTY; another address of the same counterparty → DIFFERENT_CONTACT', async () => {
    const w = await world();
    const s = await sentInquiry(w);
    const other = await registry(app);
    const fromOther = await reply({ replyToCeraMessageId: s.messageId, from: `dispatch-${other.addressId}@example.invalid` });
    const otherItem = await heldItem((await rawRow(fromOther.r.external_message_id))[0].raw_input_id);
    expect(otherItem.hold_reasons).toEqual(['OTHER_COUNTERPARTY']);
    expect(otherItem.sender_label).toEqual({ counterparty_name: 'Test Trucking', contact_name: 'Dispatcher' }); // 누구 주소인지는 보여 준다

    const contact2 = v7();
    const address2 = v7();
    await app.query("INSERT INTO cera.counterparty_contact (contact_id, counterparty_id, person_name) VALUES ($1, $2, '야간 배차')", [contact2, w.counterpartyId]);
    await app.query(
      `INSERT INTO cera.contact_channel_address (address_id, contact_id, channel_type, normalized_address, email_verification_status, relationship_status, communication_status, verified_at, approved_by_actor_id, approved_at)
       VALUES ($1, $2, 'MOCK', $3, 'VERIFIED', 'APPROVED', 'ACTIVE', $4, $5, $4)`,
      [address2, contact2, `night-${address2}@example.invalid`, T0, w.humanId],
    );
    const fromColleague = await reply({ replyToCeraMessageId: s.messageId, from: `Night Desk <NIGHT-${address2}@example.invalid>` });
    const colleague = await heldItem((await rawRow(fromColleague.r.external_message_id))[0].raw_input_id);
    expect(colleague.hold_reasons).toEqual(['DIFFERENT_CONTACT']);
    expect(colleague.sender_label).toEqual({ counterparty_name: 'Test Trucking', contact_name: '야간 배차' });
  });
});

describe('D. which inquiry it answers — attach only when exactly one thread fits', () => {
  it('external thread id alone · reply headers alone → NORMAL; no evidence → NO_MATCHING_THREAD; two different threads → AMBIGUOUS_THREAD', async () => {
    const w = await world();
    const a = await sentInquiry(w);
    const b = await sentInquiry(w);

    const byThread = await reply({ replyToCeraMessageId: a.messageId, inReplyTo: null });
    expect((await inboundMessages(byThread.r.external_message_id))[0]?.thread_id).toBe(a.threadId);

    const byHeader = await reply({ replyToCeraMessageId: b.messageId, externalThreadId: null });
    expect((await inboundMessages(byHeader.r.external_message_id))[0]?.thread_id).toBe(b.threadId);

    const orphan = await reply({ from: w.from, subject: '문의 드립니다' });
    expect((await heldItem((await rawRow(orphan.r.external_message_id))[0].raw_input_id)).hold_reasons).toEqual(['NO_MATCHING_THREAD']);

    const crossed = await reply({ replyToCeraMessageId: a.messageId, externalThreadId: b.sent.external_thread_id });
    expect((await heldItem((await rawRow(crossed.r.external_message_id))[0].raw_input_id)).hold_reasons).toEqual(['AMBIGUOUS_THREAD']);
    expect(await inboundMessages(crossed.r.external_message_id)).toHaveLength(0);
  });
});

describe('E. evidence time (docs/22 11.2e — Q-44)', () => {
  it('valid Date → DATE_HEADER; missing · unparseable · later than the channel → channel time with the reason', async () => {
    const w = await world();
    const s = await sentInquiry(w);
    const channel = '2026-10-07T03:00:00.000Z';
    const cases = [
      { dateHeader: 'Wed, 07 Oct 2026 11:58:00 +0900', basis: 'DATE_HEADER', reason: null, recorded: '2026-10-07T02:58:00.000Z' },
      { dateHeader: null, basis: 'CHANNEL_RECEIVED', reason: 'MISSING', recorded: channel },
      { dateHeader: 'yesterday afternoon', basis: 'CHANNEL_RECEIVED', reason: 'UNPARSEABLE', recorded: channel },
      { dateHeader: 'Wed, 07 Oct 2026 13:00:00 +0900', basis: 'CHANNEL_RECEIVED', reason: 'AFTER_CHANNEL_RECEIVED', recorded: channel },
    ] as const;
    // 원문이 파기돼도 같은 답이 나오는지 마지막에 확인한다
    for (const c of cases) {
      const { r } = await reply({ replyToCeraMessageId: s.messageId, dateHeader: c.dateHeader, channelReceivedAt: channel });
      const [raw] = await rawRow(r.external_message_id);
      expect(new Date(raw.source_recorded_at).toISOString()).toBe(c.recorded);
      const item = (await http.get(`/communication/drafts/${s.messageId}`).expect(200)).body.replies.find((x: { raw_input_id: string }) => x.raw_input_id === raw.raw_input_id);
      expect(item).toMatchObject({ evidence_basis: c.basis, date_header_reject_reason: c.reason });
      // 거부 사유는 서버측 영속 기록(감사)에 수신 순간 남는다 — 원문을 지워도 재현된다
      const audit = (await app.query("SELECT action FROM cera.audit_log WHERE target_type = 'RAW_INPUT' AND target_id = $1 AND action LIKE 'INBOUND_DATE_REJECTED_%'", [raw.raw_input_id])).rows.map((x) => x.action);
      expect(audit).toEqual(c.reason ? [`INBOUND_DATE_REJECTED_${c.reason}`] : []);
      // 원문을 없애도(파기 상황) 기준 · 사유 · 시각은 그대로 — 화면 값은 원문 재계산이 아니다
      await rmSync(join(contentDir, 'RAW_INPUT_PAYLOAD', raw.payload_ref.split(':').at(-1).slice(0, 2), raw.payload_ref.split(':').at(-1)), { force: true });
      const after = (await http.get(`/communication/drafts/${s.messageId}`).expect(200)).body.replies.find((x: { raw_input_id: string }) => x.raw_input_id === raw.raw_input_id);
      expect(after).toMatchObject({ content_available: false, evidence_basis: c.basis, date_header_reject_reason: c.reason, evidence_time: item.evidence_time });
    }
  });
});
