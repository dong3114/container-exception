import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadDotEnvIfPresent } from '../config/env.js';
import { GMAIL_SCOPES } from '../channel/gmail/gmail-client.js';

/**
 * Gmail 연동 동의(T-118 · docs/18 G.4 · G.8) — **사람이 직접 한 번** 실행한다. OAuth 2.0 Installed App + 루프백 리다이렉트 + PKCE.
 *
 *   npm run gmail:auth                  # 브라우저에서 CERA 전용 Gmail 계정으로 동의 → back/.env 에 GMAIL_REFRESH_TOKEN · GMAIL_ACCOUNT_EMAIL 기록
 *   npm run gmail:auth -- --print       # .env 를 건드리지 않고 화면에만(직접 옮겨 적을 때)
 *
 * 필요: back/.env 의 GMAIL_CLIENT_ID · GMAIL_CLIENT_SECRET(Google Cloud 의 "데스크톱 앱" OAuth client).
 * 토큰은 `.env`(gitignore)에만 둔다 — 저장소 · DB · 로그에 넣지 않는다. scope 는 gmail.send + gmail.readonly 뿐이다.
 */
async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in back/.env first');
  const printOnly = process.argv.includes('--print');

  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');

  const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/') return void res.writeHead(404).end();
      const got = url.searchParams.get('code');
      const ok = got && url.searchParams.get('state') === state;
      res.writeHead(ok ? 200 : 400, { 'content-type': 'text/plain; charset=utf-8' }).end(ok ? 'CERA Gmail 연동 완료 — 이 창을 닫아도 됩니다.' : 'CERA Gmail 연동 실패 — 터미널을 확인하세요.');
      server.close();
      if (ok) resolve({ code: got, redirectUri });
      else reject(new Error(`authorization failed: ${url.searchParams.get('error') ?? 'state mismatch'}`));
    });
    let redirectUri = '';
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GMAIL_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      }).toString();
      console.log('\n브라우저에서 아래 주소를 열고 **CERA 전용 Gmail 계정**으로 로그인해 동의하세요(개인 · 회사 계정 금지):\n');
      console.log(auth.toString());
      console.log('\n기다리는 중…');
    });
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: code.code, client_id: clientId, client_secret: clientSecret, redirect_uri: code.redirectUri, grant_type: 'authorization_code', code_verifier: verifier }).toString(),
  });
  const token = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; scope?: string; error?: string };
  if (!tokenRes.ok || !token.refresh_token || !token.access_token) throw new Error(`token exchange failed: ${token.error ?? tokenRes.status} (no refresh token — revoke the old grant and retry)`);
  const profile = (await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${token.access_token}` } })).json()) as { emailAddress?: string };
  const email = profile.emailAddress ?? '';
  console.log(`\n연동 계정: ${email} · scope: ${token.scope ?? ''}`);

  if (printOnly) {
    console.log(`\nback/.env 에 넣으세요(커밋 금지):\nGMAIL_ACCOUNT_EMAIL=${email}\nGMAIL_REFRESH_TOKEN=${token.refresh_token}`);
    return;
  }
  setEnvKeys('.env', { GMAIL_ACCOUNT_EMAIL: email, GMAIL_REFRESH_TOKEN: token.refresh_token });
  console.log('back/.env 에 GMAIL_ACCOUNT_EMAIL · GMAIL_REFRESH_TOKEN 을 기록했습니다(값은 화면에 표시하지 않음). CERA_GMAIL_ENABLED=true 로 켜고 API · Worker 를 다시 띄우세요.');
}

/** .env 의 키를 바꾸거나 덧붙인다(다른 줄은 그대로). */
function setEnvKeys(path: string, values: Record<string, string>): void {
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, () => line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  }
  writeFileSync(path, text);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
