import PostalMime from 'postal-mime';

/**
 * Gmail 원문(RFC822) 만들기 · 읽기(T-118 · docs/18 G.6). 네트워크 · DB 를 쓰지 않는 순수 코드다.
 *
 * - 보내는 편지: text/plain UTF-8 한 덩어리 + CERA 식별 헤더(`X-CERA-Message` · `X-CERA-Thread`). HTML 을 만들지 않는다
 * - 받은 편지: 원문 바이트를 그대로 보존하고(정본), 여기서는 겉정보 · 본문 텍스트를 **읽기만** 한다.
 *   HTML 만 있는 편지는 태그를 걷어 낸 텍스트만 쓴다 — 렌더링하지 않으므로 원격 이미지 · 추적 픽셀 · 스크립트가 실행될 길이 없다
 * - 회신 본문의 인용(이전 편지)은 추출 입력에서 뺀다 — CERA 가 보낸 질문의 숫자가 상대 답처럼 읽히지 않게.
 *   원문에는 그대로 남는다
 */

export interface MimeOutbound {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  ceraMessageId: string;
  ceraThreadId: string;
  /** 같은 대화의 앞 편지 Message-ID — Gmail 이 같은 스레드로 묶으려면 필요하다. */
  inReplyTo?: string | null;
  references?: readonly string[];
}

const CRLF = '\r\n';

/** RFC 2047 encoded-word(UTF-8 base64). ASCII 만이면 그대로. */
export function encodeHeaderWord(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

/** 헤더 값에 줄바꿈이 끼어 다른 헤더가 생기지 않게(헤더 주입 방지). */
function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function buildMime(m: MimeOutbound): string {
  const body = Buffer.from(m.bodyText.replace(/\r?\n/g, CRLF), 'utf8').toString('base64');
  const headers = [
    `From: ${headerValue(m.from)}`,
    `To: ${headerValue(m.to)}`,
    `Subject: ${encodeHeaderWord(m.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    `X-CERA-Message: ${headerValue(m.ceraMessageId)}`,
    `X-CERA-Thread: ${headerValue(m.ceraThreadId)}`,
  ];
  if (m.inReplyTo) headers.push(`In-Reply-To: ${headerValue(m.inReplyTo)}`);
  if (m.references && m.references.length > 0) headers.push(`References: ${m.references.map(headerValue).join(' ')}`);
  return [...headers, '', ...(body.match(/.{1,76}/g) ?? [])].join(CRLF) + CRLF;
}

export const toBase64Url = (bytes: Uint8Array | string): string => Buffer.from(bytes).toString('base64url');
export const fromBase64Url = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64url'));

export interface ParsedMail {
  from: string;
  to: string[];
  subject: string;
  messageId: string | null;
  dateHeader: string | null;
  inReplyTo: string | null;
  references: string[];
  /** 추출 · 미리보기 입력 — text/plain 우선, 없으면 HTML 에서 걷어 낸 텍스트. 인용은 뺐다. */
  bodyText: string;
  /** 원래 X-CERA-Message(CERA 가 보낸 편지면 있다). */
  ceraMessage: string | null;
}

const ids = (value: string | undefined | null): string[] => (value ?? '').split(/\s+/).map((s) => s.trim()).filter(Boolean);

export async function parseMail(raw: Uint8Array): Promise<ParsedMail> {
  const mail = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' });
  const header = (name: string) => mail.headers.find((h) => h.key === name.toLowerCase())?.value ?? null;
  const text = mail.text && mail.text.trim().length > 0 ? mail.text : htmlToText(mail.html ?? '');
  return {
    from: mail.from?.address ?? '',
    to: (mail.to ?? []).flatMap((a) => ('address' in a && a.address ? [a.address] : 'group' in a && a.group ? a.group.map((g) => g.address ?? '') : [])).filter(Boolean),
    subject: mail.subject ?? '',
    messageId: mail.messageId ?? null,
    dateHeader: header('date'),
    inReplyTo: mail.inReplyTo ?? null,
    references: ids(mail.references),
    bodyText: stripQuoted(text),
    ceraMessage: header('x-cera-message'),
  };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** HTML → 텍스트. 렌더링이 아니라 문자 걷어 내기 — 스크립트 · 스타일 · 주석을 버리고 태그를 지운다. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
      if (e[0] === '#') {
        const code = e[1]?.toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[e.toLowerCase()] ?? whole;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Gmail 의 인용 머리줄: "On Tue, Oct 27, 2026 at 3:00 PM A <a@x> wrote:" · "2026년 10월 27일 (화) 오후 3:00, A <a@x>님이 작성:"
const QUOTE_INTRO = [/^On .{4,200} wrote:\s*$/, /^20\d\d년 .{4,200}작성:\s*$/, /^-{2,}\s*(Original Message|원본 메시지)\s*-{2,}\s*$/i];

/**
 * 회신 본문에서 인용된 이전 편지를 뺀다(보수적으로): 인용 머리줄 또는 `>` 로 시작하는 연속 줄부터 끝까지.
 * 머리줄이 두 줄로 접힌 경우(Gmail 의 긴 주소)도 앞줄과 이어 본다. 남는 것이 없으면 원래 텍스트를 쓴다.
 */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let cut = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    const joined = i + 1 < lines.length ? `${line} ${lines[i + 1]!.trim()}` : line;
    if (QUOTE_INTRO.some((re) => re.test(line))) { cut = i; break; }
    if (QUOTE_INTRO.some((re) => re.test(joined)) && lines[i + 1]!.trim().length > 0) { cut = i; break; }
    if (line.startsWith('>') && lines.slice(i).every((l) => l.trim() === '' || l.trim().startsWith('>'))) { cut = i; break; }
  }
  const kept = lines.slice(0, cut).join('\n').trim();
  return kept.length > 0 ? kept : text.trim();
}
