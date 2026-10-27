import { toBase64Url } from '../src/channel/gmail/gmail-mime.js';

/** 시험용 가짜 Gmail(unit · db 시험이 같이 쓴다). 실제 Google 에 연결하지 않는다. */
export const ACCOUNT = 'cera-ops@example.invalid';
export const PARTNER = 'partner@example.invalid';

/** 가짜 Gmail(네트워크 없음): 보낸 편지 · 스레드 · 받은 편지를 메모리에 둔다. 토큰 갱신 · 장애를 흉내 낸다. */
export class FakeGmail {
  tokens = 0;
  sent: { id: string; threadId: string; raw: string }[] = [];
  inbox: { id: string; threadId: string; raw: string; internalDate: string; labelIds: string[]; sizeEstimate?: number }[] = [];
  next: { status: number; body?: unknown } | null = null;
  tokenStatus = 200;
  throwOnSend: Error | null = null;
  calls: string[] = [];
  expireTokenOnce = false;

  fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const u = new URL(url);
    this.calls.push(`${init.method} ${u.pathname}`);
    if (u.hostname === 'oauth2.googleapis.com') {
      this.tokens += 1;
      return this.tokenStatus === 200
        ? json(200, { access_token: `tok-${this.tokens}`, expires_in: 3600 })
        : json(this.tokenStatus, { error: 'invalid_grant' });
    }
    const auth = (init.headers as Record<string, string>).authorization;
    if (this.expireTokenOnce) {
      this.expireTokenOnce = false;
      return json(401, { error: { status: 'UNAUTHENTICATED' } });
    }
    if (!auth?.startsWith('Bearer tok-')) return json(401, {});
    if (this.next) {
      const n = this.next;
      this.next = null;
      return json(n.status, n.body ?? {});
    }
    const path = u.pathname.replace('/gmail/v1/users/me', '');
    if (path === '/messages/send') {
      if (this.throwOnSend) throw this.throwOnSend;
      const body = JSON.parse(String(init.body)) as { raw: string; threadId?: string };
      const id = `g${this.sent.length + 1}`;
      const threadId = body.threadId ?? `t${this.sent.length + 1}`;
      this.sent.push({ id, threadId, raw: body.raw });
      return json(200, { id, threadId, labelIds: ['SENT'] });
    }
    if (path === '/messages') {
      return json(200, { messages: this.sent.map((s) => ({ id: s.id, threadId: s.threadId })) });
    }
    const thread = /^\/threads\/(.+)$/.exec(path);
    if (thread) {
      const tid = decodeURIComponent(thread[1]!);
      const all = [
        ...this.sent.filter((s) => s.threadId === tid).map((s) => ({ ...this.meta(s.id, s.raw), labelIds: ['SENT'] })),
        ...this.inbox.filter((m) => m.threadId === tid).map((m) => ({ ...this.meta(m.id, m.raw), labelIds: m.labelIds, sizeEstimate: m.sizeEstimate ?? 100 })),
      ];
      return all.length === 0 ? json(404, {}) : json(200, { id: tid, messages: all });
    }
    const msg = /^\/messages\/([^/]+)$/.exec(path);
    if (msg) {
      const id = decodeURIComponent(msg[1]!);
      const found = this.sent.find((s) => s.id === id) ?? this.inbox.find((m) => m.id === id);
      if (!found) return json(404, {});
      if (u.searchParams.get('format') === 'raw') {
        const inbox = this.inbox.find((m) => m.id === id);
        return json(200, { id, threadId: found.threadId, raw: found.raw, internalDate: inbox?.internalDate ?? '0' });
      }
      return json(200, this.meta(id, found.raw));
    }
    if (path === '/profile') return json(200, { emailAddress: ACCOUNT });
    return json(404, {});
  };

  /** 원문에서 헤더 몇 개를 메타로(Gmail metadata 형식). Message-ID 가 없으면 Gmail 이 붙인 것처럼. */
  private meta(id: string, raw: string) {
    const text = Buffer.from(raw, 'base64url').toString('utf8');
    const head = text.split(/\r?\n\r?\n/)[0]!;
    const headers = head.split(/\r?\n/).map((l) => {
      const i = l.indexOf(':');
      return { name: l.slice(0, i), value: l.slice(i + 1).trim() };
    });
    if (!headers.some((h) => h.name.toLowerCase() === 'message-id')) headers.push({ name: 'Message-ID', value: `<${id}@mail.gmail.com>` });
    return { id, threadId: '', payload: { headers } };
  }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function reply(opts: { inReplyTo: string; body: string; from?: string; html?: boolean }): string {
  const lines = [
    `From: Partner <${opts.from ?? PARTNER}>`,
    `To: ${ACCOUNT}`,
    'Subject: =?UTF-8?B?' + Buffer.from('Re: [CERA] 반입 가능 여부 문의').toString('base64') + '?=',
    'Date: Tue, 27 Oct 2026 06:10:00 +0000',
    'Message-ID: <reply-1@mail.example.invalid>',
    `In-Reply-To: ${opts.inReplyTo}`,
    `References: ${opts.inReplyTo}`,
    'MIME-Version: 1.0',
    `Content-Type: ${opts.html ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.body, 'utf8').toString('base64'),
  ];
  return toBase64Url(lines.join('\r\n'));
}

