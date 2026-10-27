import { describe, expect, it } from 'vitest';
import { ChannelSendError, type OutboundMessage } from '../../src/channel/channel-adapter.js';
import { GmailChannelAdapter, maskAddress } from '../../src/channel/gmail-channel-adapter.js';
import { GmailApiError, GmailClient, classifyStatus } from '../../src/channel/gmail/gmail-client.js';
import { buildMime, fromBase64Url, htmlToText, parseMail, stripQuoted, toBase64Url } from '../../src/channel/gmail/gmail-mime.js';
import { readInboundSurface } from '../../src/channel/inbound-raw.js';

import { ACCOUNT, FakeGmail, PARTNER, reply } from '../fake-gmail.js';

function setup() {
  const gmail = new FakeGmail();
  let now = 1_800_000_000_000;
  const client = new GmailClient({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, 5_000, gmail.fetch, () => now);
  const adapter = new GmailChannelAdapter(client, { accountEmail: ACCOUNT, maxMessageBytes: 100_000, lookupDays: 30 });
  return { gmail, client, adapter, advance: (ms: number) => (now += ms) };
}

const outbound = (over: Partial<OutboundMessage> = {}): OutboundMessage => ({
  ceraMessageId: 'msg-1',
  ceraThreadId: 'thr-1',
  externalThreadId: null,
  to: PARTNER,
  subject: '[CERA] 반입 가능 여부 문의',
  bodyText: '안녕하세요.\n내일 10대 반입 가능할까요?',
  contentHash: 'sha256:x',
  isSimulated: false,
  ...over,
});

describe('Gmail MIME', () => {
  it('builds a UTF-8 text/plain mail with CERA headers and round-trips through the parser', async () => {
    const mime = buildMime({ from: ACCOUNT, to: PARTNER, subject: '반입 문의', bodyText: '내일 10대\n가능?', ceraMessageId: 'm1', ceraThreadId: 't1' });
    expect(mime).toContain('X-CERA-Message: m1');
    expect(mime).toContain('X-CERA-Thread: t1');
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/);
    const parsed = await parseMail(new TextEncoder().encode(mime));
    expect(parsed.subject).toBe('반입 문의');
    expect(parsed.bodyText).toBe('내일 10대\n가능?');
    expect(parsed.ceraMessage).toBe('m1');
  });

  it('does not let a newline in a header value create another header (header injection)', () => {
    const mime = buildMime({ from: ACCOUNT, to: `${PARTNER}\r\nBcc: evil@example.invalid`, subject: 'a\r\nBcc: x', bodyText: 'b', ceraMessageId: 'm', ceraThreadId: 't' });
    expect(mime.split('\r\n').filter((l) => l.startsWith('Bcc:'))).toEqual([]);
  });

  it('strips quoted previous mail (English · Korean Gmail intros · > lines) and keeps the answer', () => {
    expect(stripQuoted('네 가능합니다. 8대요.\n\nOn Tue, Oct 27, 2026 at 3:00 PM CERA <a@x> wrote:\n> 10대 가능?')).toBe('네 가능합니다. 8대요.');
    expect(stripQuoted('8대 가능\n\n2026년 10월 27일 (화) 오후 3:00, CERA <a@x>님이 작성:\n> 10대')).toBe('8대 가능');
    expect(stripQuoted('8대 가능\n> 10대 가능?\n>')).toBe('8대 가능');
    expect(stripQuoted('> only quote')).toBe('> only quote'); // 남는 것이 없으면 원래 텍스트
  });

  it('turns HTML into text without scripts, styles or remote resources', () => {
    const text = htmlToText('<html><head><style>x{}</style></head><body><img src="https://track.example/p.gif"><script>alert(1)</script><p>8대&nbsp;가능</p><br>감사&amp;합니다</body></html>');
    expect(text).toBe('8대 가능\n\n감사&합니다');
    expect(text).not.toContain('track');
  });
});

describe('Gmail client error classes (docs/18 H.3)', () => {
  it.each([
    [401, null, 'AUTH'],
    [403, 'insufficientPermissions', 'AUTH'],
    [403, 'userRateLimitExceeded', 'TRANSIENT'],
    [429, null, 'TRANSIENT'],
    [500, null, 'TRANSIENT'],
    [503, null, 'TRANSIENT'],
    [400, 'invalidArgument', 'PERMANENT'],
  ] as const)('%i %s → %s', (status, reason, kind) => {
    expect(classifyStatus(status, reason).kind).toBe(kind);
  });

  it('refresh token rejected (invalid_grant) → AUTH, never retried as transient', async () => {
    const { gmail, adapter } = setup();
    gmail.tokenStatus = 400;
    const err = await adapter.send(outbound()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChannelSendError);
    expect((err as ChannelSendError).kind).toBe('AUTH');
    expect((err as ChannelSendError).code).toBe('GMAIL_TOKEN_REVOKED');
    expect(gmail.sent).toHaveLength(0);
  });

  it('an access token rejected once is refreshed once and the call goes through', async () => {
    const { gmail, adapter } = setup();
    await adapter.send(outbound());
    gmail.expireTokenOnce = true;
    await adapter.send(outbound({ ceraMessageId: 'msg-2' }));
    expect(gmail.tokens).toBe(2);
    expect(gmail.sent).toHaveLength(2);
  });

  it('send without an answer (timeout / network) → UNKNOWN so the dispatcher reconciles before resending', async () => {
    const { gmail, adapter } = setup();
    const e = new Error('aborted');
    e.name = 'TimeoutError';
    gmail.throwOnSend = e;
    const err = (await adapter.send(outbound()).catch((x: unknown) => x)) as GmailApiError;
    expect(err.kind).toBe('UNKNOWN');
    expect(err.code).toBe('GMAIL_TIMEOUT');
  });

  it('429 on send → TRANSIENT', async () => {
    const { gmail, adapter } = setup();
    await adapter.send(outbound()); // token
    gmail.next = { status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED' } } };
    const err = (await adapter.send(outbound({ ceraMessageId: 'msg-2' })).catch((x: unknown) => x)) as GmailApiError;
    expect(err.kind).toBe('TRANSIENT');
  });

  it('5xx on send → TRANSIENT (retried with backoff); a non-auth 4xx → PERMANENT (a person fixes the request — no retry)', async () => {
    const { gmail, adapter } = setup();
    await adapter.send(outbound()); // token
    gmail.next = { status: 503, body: { error: { status: 'UNAVAILABLE' } } };
    expect(((await adapter.send(outbound({ ceraMessageId: 'msg-2' })).catch((x: unknown) => x)) as GmailApiError).kind).toBe('TRANSIENT');
    gmail.next = { status: 400, body: { error: { status: 'INVALID_ARGUMENT' } } };
    expect(((await adapter.send(outbound({ ceraMessageId: 'msg-3' })).catch((x: unknown) => x)) as GmailApiError).kind).toBe('PERMANENT');
  });
});

describe('GmailChannelAdapter', () => {
  it('sends the approved text with X-CERA headers and returns the RFC822 Message-ID + Gmail thread id', async () => {
    const { gmail, adapter } = setup();
    const receipt = await adapter.send(outbound());
    expect(receipt).toEqual({ externalMessageId: '<g1@mail.gmail.com>', externalThreadId: 't1' });
    const parsed = await parseMail(fromBase64Url(gmail.sent[0]!.raw));
    expect(parsed.ceraMessage).toBe('msg-1');
    expect(parsed.to).toEqual([PARTNER]);
    expect(parsed.bodyText).toContain('10대 반입');
  });

  it('refuses a simulated message (Mock and Real never mix — J.3)', async () => {
    const { gmail, adapter } = setup();
    const err = (await adapter.send(outbound({ isSimulated: true })).catch((x: unknown) => x)) as ChannelSendError;
    expect(err.kind).toBe('PERMANENT');
    expect(gmail.calls).toEqual([]);
  });

  it('a follow-up in the same thread carries threadId and In-Reply-To/References', async () => {
    const { gmail, adapter } = setup();
    await adapter.send(outbound());
    await adapter.send(outbound({ ceraMessageId: 'msg-2', externalThreadId: 't1' }));
    expect(gmail.sent[1]!.threadId).toBe('t1');
    const parsed = await parseMail(fromBase64Url(gmail.sent[1]!.raw));
    expect(parsed.inReplyTo).toBe('<g1@mail.gmail.com>');
  });

  it('lookupSent finds a sent mail by X-CERA-Message, null when the whole sent box was checked', async () => {
    const { adapter } = setup();
    await adapter.send(outbound());
    expect(await adapter.lookupSent('msg-1')).toBe('<g1@mail.gmail.com>');
    expect(await adapter.lookupSent('msg-404')).toBeNull();
  });

  it('reads only CERA-known threads; skips its own mail; keeps raw RFC822 bytes; strips the quote from the text', async () => {
    const { gmail, adapter } = setup();
    const r = await adapter.send(outbound());
    gmail.inbox.push({ id: 'in-1', threadId: 't1', internalDate: String(Date.parse('2026-10-27T06:11:00Z')), labelIds: ['INBOX'], raw: reply({ inReplyTo: r.externalMessageId, body: '네, 8대 가능합니다.\n\nOn Tue, Oct 27, 2026 at 3:00 PM CERA <a@x> wrote:\n> 10대 반입 가능할까요?' }) });
    gmail.inbox.push({ id: 'other', threadId: 't-unknown', internalDate: '0', labelIds: ['INBOX'], raw: reply({ inReplyTo: '<x>', body: 'spam' }) });

    expect((await adapter.fetchInbound(null)).messages).toEqual([]); // 범위 없이는 아무것도 읽지 않는다
    const stored = new Set<string>();
    const { messages } = await adapter.fetchInbound(null, { externalThreadIds: ['t1'], alreadyStored: async (id) => stored.has(id) });
    expect(messages).toHaveLength(1);
    const m = messages[0]!;
    expect(m.externalMessageId).toBe('in-1');
    expect(m.externalThreadId).toBe('t1');
    expect(m.mediaType).toBe('message/rfc822');
    expect(m.from).toBe(PARTNER);
    expect(m.inReplyTo).toBe('<g1@mail.gmail.com>');
    expect(m.channelReceivedAt).toBe('2026-10-27T06:11:00.000Z');
    expect(m.bodyText).toBe('네, 8대 가능합니다.');
    expect(toBase64Url(m.raw)).toBe(gmail.inbox[0]!.raw); // 원문 바이트 그대로(인용 포함)
    expect(gmail.calls.some((c) => c.includes('t-unknown'))).toBe(false);

    stored.add('in-1');
    expect((await adapter.fetchInbound(null, { externalThreadIds: ['t1'], alreadyStored: async (id) => stored.has(id) })).messages).toEqual([]);
  });

  it('skips oversized mail without storing it', async () => {
    const { gmail, adapter } = setup();
    await adapter.send(outbound());
    gmail.inbox.push({ id: 'big', threadId: 't1', internalDate: '0', labelIds: ['INBOX'], sizeEstimate: 999_999, raw: reply({ inReplyTo: '<g1@mail.gmail.com>', body: 'x' }) });
    expect((await adapter.fetchInbound(null, { externalThreadIds: ['t1'], alreadyStored: async () => false })).messages).toEqual([]);
  });

  it('an HTML-only reply becomes plain text for the surface reader too (same function as extraction)', async () => {
    const raw = fromBase64Url(reply({ inReplyTo: '<g1@mail.gmail.com>', body: '<div>8대 가능<img src="https://t.example/x.gif"></div>', html: true }));
    const surface = await readInboundSurface('GMAIL', raw);
    expect(surface?.bodyText).toBe('8대 가능');
    expect(surface?.from).toBe(PARTNER);
    expect(surface?.channelReceivedAt).toBeNull();
  });

  it('status masks the account and reports a revoked token', async () => {
    const { gmail, adapter } = setup();
    expect(await adapter.status()).toEqual({ connected: true, account: 'c***@example.invalid', code: null });
    gmail.tokenStatus = 400;
    expect((await adapter.status()).code).toBe('GMAIL_TOKEN_REVOKED');
    expect(maskAddress('kim@x.com')).toBe('k***@x.com');
  });
});
