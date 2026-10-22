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
 * - 키 목록은 back/.env.example 과 같아야 한다(test/unit/env-example.test.ts 가 검사). 로컬 .env 와의 차이는 npm run env:check
 */
export const APP_ENVS = ['local', 'test', 'staging', 'production'] as const;
export const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

// 비어 있으면 없는 것으로 본다(.env.example 의 빈 자리 그대로 복사해도 기동된다)
const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

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
  // ── 회신 추출(T-092 U7) — Python AI Server(ADR-033). Main Backend 만 부른다(브라우저에 노출하지 않는다) ──
  CERA_AI_SERVER_URL: z.string().url().default('http://127.0.0.1:8100'),
  // LLM 은 느릴 수 있다 — 넘으면 이번 시도는 실패(재시도 가능), 원문 · 회신은 그대로
  CERA_AI_TIMEOUT_MS: z.coerce.number().int().min(500).max(300_000).default(20_000),
  // 같은 회신의 추출 시도 한도(기술 실패 기준) [ASSUMPTION]
  CERA_EXTRACTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  // ── 공공 데이터(docs/11 3절 · T-102 예정) — Main Backend 의 Public Data Adapter 만 부른다. Agent 는 직접 부르지 않는다(ADR-036) ──
  // off = 호출 없음(기본) · replay = 마스킹 fixture 재생(네트워크 없음) · live = 실제 API(키가 있는 출처만, 없으면 그 출처 호출이 PUBLIC_DATA_KEY_MISSING)
  CERA_PUBLIC_DATA_MODE: z.enum(['off', 'replay', 'live']).default('off'),
  // DS-01 UNI-PASS 인증키(crkyCn) — unipass.customs.go.kr 에서 발급. 비밀값: 로그 · 오류에 남기지 않는다
  UNIPASS_API_KEY: optionalSecret,
  // DS-02 · DS-03 공공데이터포털 serviceKey(디코딩 값을 넣는다 — URL 인코딩은 어댑터가 한다)
  DATA_GO_KR_SERVICE_KEY: optionalSecret,
  CERA_PUBLIC_DATA_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(10_000),
  // 조회 한 번에 받는 최대 페이지 수(한 페이지 50행). 개발계정 일일 한도(DS-02 1,000 · DS-03 10,000)를 지키는 상한 [ASSUMPTION]
  CERA_PUBLIC_DATA_MAX_PAGES: z.coerce.number().int().min(1).max(200).default(20),
  // 원본 응답 보존 위치(gitignore 된 data/raw/ 아래). 실제 B/L · 원본 응답은 커밋하지 않는다(규칙 5 · Q-17)
  CERA_PUBLIC_DATA_RAW_DIR: z.string().min(1).default('../data/raw/public-data'),
  // replay 모드가 읽는 마스킹 fixture 위치(커밋 가능한 합성 · 마스킹본만)
  CERA_PUBLIC_DATA_REPLAY_DIR: z.string().min(1).default('../data/fixtures/public-data'),
  // ── Agent Tool API(T-103 · ADR-036 · back/src/agent-tools/) — Python Agent Runtime 이 /internal/agent-tools 를 부를 때만 쓴다 ──
  // false(기본)면 Tool 엔드포인트를 열지 않는다. Agent 는 권한 주체가 아니다 — Tool 이 Backend 권한 검사를 그대로 거친다
  CERA_AGENT_TOOLS_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Agent Runtime → Backend 서비스 토큰(32자 이상). 사람 사용자 권한을 대신하지 않는다(승인 · 확인은 사람만)
  CERA_AGENT_TOOL_TOKEN: optionalSecret,
  // Backend → Agent Runtime(실행 시작 · 재개). 지금은 AI Server 와 같은 프로세스를 가정한다 [ASSUMPTION]
  CERA_AGENT_RUNTIME_URL: z.string().url().default('http://127.0.0.1:8100'),
  // Backend → Agent Runtime 한 번 실행(시작 · 재개)의 시간 제한(ms). 그래프는 interrupt 나 끝에서 돌려준다 [ASSUMPTION]
  CERA_AGENT_RUNTIME_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(120_000),
  // Runtime 일시 장애(연결 실패 · 시간 초과 · 5xx) 때 같은 실행을 몇 번까지 시도하나(첫 시도 포함) · 다음 시도까지 기다림의 시작 값(ms, 2배씩) [ASSUMPTION]
  CERA_AGENT_RUNTIME_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  CERA_AGENT_RUNTIME_RETRY_BASE_MS: z.coerce.number().int().min(100).max(3_600_000).default(30_000),
  // Worker 의 Agent 재조정(기다리던 실행 · 재시도 시각이 된 실행 깨우기) on/off
  CERA_AGENT_RECONCILE_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
}).superRefine((e, ctx) => {
  const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (e.APP_ENV === 'production' && e.CERA_MOCK_CHANNEL_FAULT !== 'none') fail('CERA_MOCK_CHANNEL_FAULT', 'fault injection is not allowed in production');
  // 녹화 응답을 현재 사실처럼 보여 주지 않는다(규칙 9)
  if (e.APP_ENV === 'production' && e.CERA_PUBLIC_DATA_MODE === 'replay') fail('CERA_PUBLIC_DATA_MODE', 'replay is not allowed in production');
  if (e.CERA_PUBLIC_DATA_MODE === 'live' && !e.UNIPASS_API_KEY && !e.DATA_GO_KR_SERVICE_KEY) {
    fail('CERA_PUBLIC_DATA_MODE', 'live needs UNIPASS_API_KEY or DATA_GO_KR_SERVICE_KEY');
  }
  if (e.CERA_AGENT_TOOLS_ENABLED && (e.CERA_AGENT_TOOL_TOKEN ?? '').length < 32) {
    fail('CERA_AGENT_TOOL_TOKEN', 'agent tools need a service token of at least 32 characters');
  }
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
