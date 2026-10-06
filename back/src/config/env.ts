import { existsSync } from 'node:fs';
import { z } from 'zod';

/**
 * 실행 환경 설정. 모든 값은 환경변수에서 오고 기동 시 한 번 검증한다.
 * 비밀값(DB 비밀번호 등)은 저장소에 두지 않는다 — `.env`(gitignore) 또는 배포 환경변수.
 *
 * - DATABASE_URL: 실행 앱 역할(cera_app) 연결. API · Worker 가 쓴다
 * - MIGRATION_DATABASE_URL: migration 소유 역할(cera_owner) 연결. drizzle-kit · migrate 명령만 쓴다(docs/24 12.2)
 * - CERA_CONTENT_DIR: 로컬·시험 내용 저장소 뿌리(실제 메일·원문은 커밋하지 않는다 — gitignore 된 경로)
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
