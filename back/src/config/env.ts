import { existsSync } from 'node:fs';
import { z } from 'zod';

/**
 * 실행 환경 설정. 모든 값은 환경변수에서 오고 기동 시 한 번 검증한다.
 * 비밀값(DB 비밀번호 등)은 저장소에 두지 않는다 — `.env`(gitignore) 또는 배포 환경변수.
 *
 * - DATABASE_URL: 실행 앱 역할(cera_app) 연결. API · Worker 가 쓴다
 * - MIGRATION_DATABASE_URL: migration 소유 역할(cera_owner) 연결. drizzle-kit · migrate 명령만 쓴다(docs/24 12.2)
 * - CERA_CONTENT_DIR: 로컬·시험 내용 저장소 뿌리(실제 메일·원문은 커밋하지 않는다 — gitignore 된 경로)
 * - CERA_TEST_RECIPIENT_ALLOWLIST: 개발 안전장치 수신 주소 목록(값은 로그에 남기지 않는다)
 * - CERA_APPROVAL_TTL_MINUTES: 발송 승인 유효 기한(분, 기본 1440)
 */
export const APP_ENVS = ['local', 'test', 'staging', 'production'] as const;
export const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

const postgresUrl = z
  .string()
  .min(1)
  .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgres:// URL');

export const envSchema = z.object({
  APP_ENV: z.enum(APP_ENVS),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('log'),
  DATABASE_URL: postgresUrl,
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(600_000).default(30_000),
  MIGRATION_DATABASE_URL: postgresUrl.optional(),
  // 내용 저장소 로컬 어댑터의 뿌리(docs/24 16.3). 기본값은 저장소 루트의 gitignore 된 data/raw/content/(back 에서 실행 기준)
  CERA_CONTENT_DIR: z.string().min(1).default('../data/raw/content'),
  // 개발 안전장치(docs/18 G.5 · FR-ELG-05): 비운영 환경에서 실채널(GMAIL · PORTAL)로 나갈 수 있는 수신 주소 목록.
  // 쉼표로 나눈다. 비어 있으면 실채널 발송은 전부 막힌다(fail-closed). 제품 Contact Gate 를 대신하지 않는다.
  CERA_TEST_RECIPIENT_ALLOWLIST: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((a) => a.trim().toLowerCase()).filter((a) => a.length > 0)),
  // 발송 승인 유효 기한(docs/19 FR-APV-07 — 설정값). 지나면 그 승인으로는 보낼 수 없고 다시 승인해야 한다.
  // 기본 24시간 [ASSUMPTION] — Pilot 운영 주기로 조정한다.
  CERA_APPROVAL_TTL_MINUTES: z.coerce.number().int().min(1).max(10_080).default(1_440),
  // ── 발송(T-090 U5 · docs/24 14절 · docs/18 H.3) ──
  // 실제 발송 차단 스위치(FR-SND-12): true 면 발송 요청 · 승인은 되지만 Worker 가 보내지 않는다(발송 대기에 머문다).
  CERA_SENDING_PAUSED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Mock 채널 "보낸 편지함" 뿌리(gitignore 된 data/raw/ 아래). 네트워크를 쓰지 않는다.
  CERA_MOCK_CHANNEL_DIR: z.string().min(1).default('../data/raw/mock-channel'),
  // Mock 장애 주입(시험 · 시연 전용). production 에서는 none 만 허용한다(아래 refine).
  CERA_MOCK_CHANNEL_FAULT: z.enum(['none', 'transient', 'permanent', 'timeout_after_send', 'crash_after_send']).default('none'),
  // Worker 폴링 주기 — 기본 5초 [ASSUMPTION](docs/24 14 결정 7)
  CERA_OUTBOX_POLL_MS: z.coerce.number().int().min(200).max(600_000).default(5_000),
  // 일시 실패 재시도: 최대 시도 수 · 첫 간격(지수 백오프, 상한 10분) [ASSUMPTION](docs/18 H.3)
  CERA_SEND_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  CERA_SEND_RETRY_BASE_MS: z.coerce.number().int().min(0).max(600_000).default(30_000),
  // 결과 없는 시도를 화해하기 전 기다리는 시간 — 다른 워커가 아직 보내는 중일 수 있다(재기동 직후에는 이 시간이 지난 시도만 본다)
  CERA_SEND_RECONCILE_AFTER_MS: z.coerce.number().int().min(0).max(3_600_000).default(60_000),
}).refine((e) => e.APP_ENV !== 'production' || e.CERA_MOCK_CHANNEL_FAULT === 'none', {
  path: ['CERA_MOCK_CHANNEL_FAULT'],
  message: 'fault injection is not allowed in production',
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment configuration: ${issues.join('; ')}`);
    this.name = 'EnvValidationError';
  }
}

/** 검증 실패 메시지에는 키 이름과 이유만 남기고 값(비밀일 수 있다)은 남기지 않는다. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}

/** 로컬 개발 편의: 작업 디렉터리에 `.env` 가 있으면 읽는다(이미 있는 환경변수는 덮어쓰지 않는다). */
export function loadDotEnvIfPresent(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
