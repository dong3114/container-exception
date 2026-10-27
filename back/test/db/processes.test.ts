/** API · Worker 가 같은 코드베이스의 별도 프로세스로 뜨는지(ADR-033). 실제 node 프로세스를 띄운다. */
import { execFile, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL } from './support.js';

const run = promisify(execFile);
const TSX = join('node_modules', 'tsx', 'dist', 'cli.mjs');

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  // --once 는 발송 주기도 한 번 돈다(T-090) — Mock 보낸 편지함은 임시 디렉터리로
  return { ...process.env, APP_ENV: 'test', LOG_LEVEL: 'log', DATABASE_URL: TEST_DATABASE_URL, CERA_MOCK_CHANNEL_DIR: join(tmpdir(), 'cera-proc-mock'), ...extra };
}

describe('process entry points', () => {
  it('worker bootstraps (DB check) and exits cleanly with --once', async () => {
    const { stdout, stderr } = await run(process.execPath, [TSX, 'src/worker.ts', '--once'], { env: childEnv() });
    expect(`${stdout}${stderr}`).toContain('worker bootstrapped');
  });

  it('the mock reply tool (dev only) refuses to run in production', async () => {
    const error = await run(process.execPath, [TSX, 'src/dev/mock-reply.ts', '--from', 'x@example.invalid'], {
      env: childEnv({ APP_ENV: 'production', CERA_SESSION_COOKIE_SECURE: 'true', CERA_AUTH_MODE: 'session' }),
    }).catch((e: { code: number; stderr: string }) => e);
    expect((error as { code: number }).code).toBe(1);
    expect((error as { stderr: string }).stderr).toContain('disabled in production');
  });

  it('worker refuses to start with an invalid configuration and does not echo secret values', async () => {
    const secret = 'super-secret-password-123';
    const error = await run(process.execPath, [TSX, 'src/worker.ts', '--once'], {
      env: childEnv({ DATABASE_URL: `mysql://u:${secret}@h/db` }),
    }).catch((e: { code: number; stderr: string }) => e);
    expect((error as { code: number }).code).toBe(1);
    expect((error as { stderr: string }).stderr).toContain('DATABASE_URL');
    expect((error as { stderr: string }).stderr).not.toContain(secret);
  });

  it('API process listens and serves /health, then stops on SIGTERM', async () => {
    const port = String(31_000 + Math.floor(Math.random() * 1000));
    const child = spawn(process.execPath, [TSX, 'src/main.ts'], { env: childEnv({ API_PORT: port }) });
    try {
      let body: unknown;
      for (let i = 0; i < 60 && body === undefined; i += 1) {
        await new Promise((r) => setTimeout(r, 500));
        body = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json()).catch(() => undefined);
      }
      expect(body).toMatchObject({ status: 'ok', db: 'up' });
    } finally {
      // 종료까지 기다린다 — 자식 프로세스를 남기지 않고, 종료 신호를 실제로 처리하는지 확인한다.
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await exited;
    }
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});
