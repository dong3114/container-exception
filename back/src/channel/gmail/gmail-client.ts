import { ChannelSendError, type SendFailureKind } from '../channel-adapter.js';

/**
 * Gmail REST 호출(T-118 · docs/18 G.3 · G.4 · H.3). Google SDK 없이 `fetch` 만 쓴다.
 *
 * - 인증: OAuth 2.0 Installed App 로 받은 **refresh token** 으로 access token 을 갱신한다. access token 은 메모리에만 둔다
 * - scope: `gmail.send` + `gmail.readonly` 뿐(라벨 · 삭제 권한 없음)
 * - 오류 분류(H.3): 401 → 토큰을 한 번 새로 받아 다시, 그래도 401 · 토큰 갱신 거부(invalid_grant) → AUTH(재시도 금지)
 *   · 403 의 rate limit → TRANSIENT, 그 밖 403 → AUTH(scope 부족 · 계정 정지) · 429 · 5xx → TRANSIENT · 그 밖 4xx → PERMANENT
 *   · 시간 초과 · 연결 끊김 → UNKNOWN(보냈는지 모른다 — 다시 보내기 전에 조회로 화해한다)
 * - 로그 · 오류 메시지에 토큰 · 본문 · 전체 주소를 넣지 않는다
 */
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'] as const;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class GmailApiError extends ChannelSendError {
  constructor(kind: SendFailureKind, code: string, message: string, readonly status: number | null) {
    super(kind, code, message);
    this.name = 'GmailApiError';
  }
}

export interface GmailHeader { name: string; value: string }
export interface GmailMessageMeta {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  sizeEstimate?: number;
  payload?: { headers?: GmailHeader[] };
}

export function headerOf(m: GmailMessageMeta, name: string): string | null {
  const lower = name.toLowerCase();
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? null;
}

export function classifyStatus(status: number, reason: string | null): { kind: SendFailureKind; code: string } {
  if (status === 401) return { kind: 'AUTH', code: 'GMAIL_UNAUTHORIZED' };
  if (status === 403) {
    if (reason && /rateLimit|quota/i.test(reason)) return { kind: 'TRANSIENT', code: 'GMAIL_RATE_LIMITED' };
    return { kind: 'AUTH', code: 'GMAIL_FORBIDDEN' };
  }
  if (status === 429) return { kind: 'TRANSIENT', code: 'GMAIL_RATE_LIMITED' };
  if (status >= 500) return { kind: 'TRANSIENT', code: 'GMAIL_SERVER_ERROR' };
  if (status === 404) return { kind: 'PERMANENT', code: 'GMAIL_NOT_FOUND' };
  return { kind: 'PERMANENT', code: 'GMAIL_REJECTED' };
}

export class GmailClient {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly credentials: GmailCredentials,
    private readonly timeoutMs: number,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  /** 토큰을 새로 받는다(연동 상태 확인에도 쓴다). 거부되면 AUTH. */
  async refreshAccessToken(): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      refresh_token: this.credentials.refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await this.raw(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() }, false);
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !json.access_token) {
      this.accessToken = null;
      if (res.status >= 500) throw new GmailApiError('TRANSIENT', 'GMAIL_TOKEN_SERVER_ERROR', `token endpoint ${res.status}`, res.status);
      // invalid_grant = refresh token 만료 · 취소 → 사람이 다시 동의해야 한다
      throw new GmailApiError('AUTH', json.error === 'invalid_grant' ? 'GMAIL_TOKEN_REVOKED' : 'GMAIL_TOKEN_REJECTED', `token refresh rejected (${json.error ?? res.status})`, res.status);
    }
    this.accessToken = json.access_token;
    // 만료 1분 전에 미리 갱신
    this.accessTokenExpiresAt = this.nowMs() + Math.max(0, (json.expires_in ?? 3600) - 60) * 1000;
  }

  async send(rawBase64Url: string, threadId: string | null): Promise<{ id: string; threadId: string }> {
    return this.call('POST', '/messages/send', { raw: rawBase64Url, ...(threadId ? { threadId } : {}) }, true);
  }

  async getMetadata(id: string, headers: readonly string[]): Promise<GmailMessageMeta> {
    const q = new URLSearchParams({ format: 'metadata' });
    for (const h of headers) q.append('metadataHeaders', h);
    return this.call('GET', `/messages/${encodeURIComponent(id)}?${q}`);
  }

  async getRaw(id: string): Promise<{ id: string; threadId: string; raw: string; internalDate: string; labelIds?: string[]; sizeEstimate?: number }> {
    return this.call('GET', `/messages/${encodeURIComponent(id)}?format=raw`);
  }

  async getThread(threadId: string, headers: readonly string[]): Promise<{ id: string; messages?: GmailMessageMeta[] } | null> {
    const q = new URLSearchParams({ format: 'metadata' });
    for (const h of headers) q.append('metadataHeaders', h);
    try {
      return await this.call('GET', `/threads/${encodeURIComponent(threadId)}?${q}`);
    } catch (error) {
      if (error instanceof GmailApiError && error.status === 404) return null; // 지워진 스레드
      throw error;
    }
  }

  async listMessages(query: string, pageToken: string | null): Promise<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }> {
    const q = new URLSearchParams({ q: query, maxResults: '100' });
    if (pageToken) q.set('pageToken', pageToken);
    return this.call('GET', `/messages?${q}`);
  }

  async profile(): Promise<{ emailAddress: string }> {
    return this.call('GET', '/profile');
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, isSend = false): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!this.accessToken || this.nowMs() >= this.accessTokenExpiresAt) await this.refreshAccessToken();
      const res = await this.raw(
        `${API}${path}`,
        {
          method,
          headers: { authorization: `Bearer ${this.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
        isSend,
      );
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401 && attempt === 0) {
        this.accessToken = null; // 토큰이 서버 쪽에서 먼저 만료됐다 — 한 번만 새로 받는다
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; status?: string } };
      const reason = json.error?.errors?.[0]?.reason ?? json.error?.status ?? null;
      const c = classifyStatus(res.status, reason);
      throw new GmailApiError(c.kind, c.code, `Gmail API ${method} ${res.status}${reason ? ` (${reason})` : ''}`, res.status);
    }
    throw new GmailApiError('AUTH', 'GMAIL_UNAUTHORIZED', 'Gmail API rejected a fresh token', 401);
  }

  /** 시간 제한 · 네트워크 오류 분류. 발송 요청에서 응답을 못 받으면 UNKNOWN(보냈을 수 있다), 읽기면 TRANSIENT. */
  private async raw(url: string, init: RequestInit, isSend: boolean): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new GmailApiError(isSend ? 'UNKNOWN' : 'TRANSIENT', timeout ? 'GMAIL_TIMEOUT' : 'GMAIL_NETWORK_ERROR', timeout ? 'Gmail did not answer in time' : 'Gmail network error', null);
    }
  }
}
