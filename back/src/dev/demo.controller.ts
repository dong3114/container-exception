import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { Public, RequirePermission } from '../auth/auth.decorators.js';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { CHANNEL_ADAPTERS } from '../channel/channel-adapter.js';
import type { ChannelAdapters } from '../channel/channel.module.js';
import type { MockChannelAdapter } from '../channel/mock-channel-adapter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { operationalException, planningSnapshot, recoveryRun } from '../db/schema/index.js';
import { SEED_IDS } from '../seed/slice1-fixture.js';
import { Instant } from '../shared/time/instant.js';
import { EXECUTION_QUEUE, type ExecutionQueue } from '../queue/execution-queue.js';
import { ValidationError } from '../shared/errors/cera-error.js';

const mockReplyBody = z
  .object({
    reply_to_message_id: z.string().uuid(),
    body: z.string().min(1).max(2_000),
    from: z.string().email().max(200).optional(),
  })
  .strict();

/**
 * 공개 포트폴리오 데모에서 Mock 업체가 보낼 수 있는 답장(T-131). 방문자가 아무 문장이나 넣어 다른 방문자 화면에 보이지 않게 **이 목록만** 받는다.
 * 녹화 재생(ai/fixtures/replay)에 있는 문장 + 일부러 녹화가 없는 문장(추출 실패 → 사람 검토 경로). 화면의 선택지(front/web DemoPage)와 같은 문장이다.
 */
export const PORTFOLIO_REPLY_BODIES: readonly string[] = [
  '오후 3시 이후 차량 4대 가능합니다.',
  '확인했습니다. 요청하신 대로 가능합니다.',
  '확인 후 다시 연락드리겠습니다.',
  '대당 18만원이면 가능합니다.',
  '내일 다시 확인해 보겠습니다. 담당자 부재중입니다.',
  '10월 13일에 ODCY A에서 컨테이너 2대 받을 수 있습니다.',
];

/**
 * **시연 · 테스트 도우미** — `APP_ENV` 가 local · test 이거나 공개 포트폴리오 데모(`CERA_PORTFOLIO_DEMO_MODE`)일 때만 API 에 붙는다(api.module.ts). 제품 API 가 아니라 OpenAPI 계약에도 없다.
 *
 * - `GET /dev/demo/status`: 시연에 필요한 설정이 켜져 있는지(Agent Tool · AI Server · 공공데이터 · Gmail) + 시드 계획 실행 id
 * - `POST /dev/demo/mock-reply`: Mock 상대 업체가 그 문의에 답장한 것처럼 **Mock 수신함**에 한 통을 넣는다(`npm run mock:reply` 와 같은 일).
 *   그 뒤는 실제 코드 그대로다 — Worker 가 가져가 원문 보존 · 발신자 판정 · 추출 · 사실 판정을 한다. 실채널(Gmail)에는 아무것도 하지 않는다
 */
@ApiExcludeController()
@Controller('dev/demo')
export class DemoController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapters,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(EXECUTION_QUEUE) private readonly queue: ExecutionQueue,
  ) {}

  @Public() // 로그인 전에도 시연 환경을 점검할 수 있게(local · test 에만 붙는 경로)
  @Get('status')
  async status() {
    let aiServer: 'up' | 'down' = 'down';
    try {
      const res = await fetch(new URL('/health', this.env.CERA_AI_SERVER_URL), { signal: AbortSignal.timeout(2_000) });
      aiServer = res.ok ? 'up' : 'down';
    } catch {
      aiServer = 'down';
    }
    // 시드 시나리오 실행의 계획 날짜(스냅숏 기준 시각의 서울 날짜) — 직접 입력 · 문의 날짜가 이 날이다
    const seed = await this.db
      .select({ asOf: planningSnapshot.asOf })
      .from(recoveryRun)
      .innerJoin(planningSnapshot, eq(planningSnapshot.snapshotId, recoveryRun.snapshotId))
      .where(eq(recoveryRun.runId, SEED_IDS.recoveryRunRoot))
      .limit(1);
    const asOf = seed[0] ? Instant.fromDb(seed[0].asOf) : null;
    // T-132: 탐지기가 시나리오에서 예외를 찾아 만든 복구 실행(가장 최근) — 시연 화면은 이 실행을 따라간다. 없으면 시드 실행
    const auto = await this.db
      .select({ runId: operationalException.recoveryRunId, exceptionId: operationalException.exceptionId, status: operationalException.status })
      .from(operationalException)
      .where(and(eq(operationalException.scope, 'SCENARIO'), isNotNull(operationalException.recoveryRunId)))
      .orderBy(desc(operationalException.detectedAt))
      .limit(1);
    return {
      app_env: this.env.APP_ENV,
      agent_tools_enabled: this.env.CERA_AGENT_TOOLS_ENABLED,
      ai_server: aiServer,
      public_data_mode: this.env.CERA_PUBLIC_DATA_MODE,
      gmail_enabled: this.env.CERA_GMAIL_ENABLED,
      sending_paused: this.env.CERA_SENDING_PAUSED,
      auth_mode: this.env.CERA_AUTH_MODE,
      exception_detection: this.env.CERA_EXCEPTION_DETECTION,
      active_run_id: auto[0]?.runId ?? SEED_IDS.recoveryRunRoot,
      auto_exception: auto[0] ? { exception_id: auto[0].exceptionId, status: auto[0].status, recovery_run_id: auto[0].runId } : null,
      portfolio_demo: this.env.CERA_PORTFOLIO_DEMO_MODE,
      execution_queue: await this.queue.status(),
      seed: {
        present: asOf !== null,
        scenario_run_id: SEED_IDS.recoveryRunRoot,
        operator_actor_id: SEED_IDS.actorOperator,
        as_of: asOf?.toSeoulIso() ?? null,
        plan_date: asOf?.toSeoulIso().slice(0, 10) ?? null,
        facilities: { warehouse_a: SEED_IDS.facilityWarehouseA, warehouse_b: SEED_IDS.facilityWarehouseB, odcy_a: SEED_IDS.facilityOdcyA, odcy_b: SEED_IDS.facilityOdcyB },
        truck_pool_partner: SEED_IDS.truckPoolPartner,
      },
    };
  }

  @RequirePermission('communication.draft')
  @Post('mock-reply')
  @HttpCode(200)
  async mockReply(@Body() body: unknown) {
    const parsed = mockReplyBody.safeParse(body);
    if (!parsed.success) throw new ValidationError('INVALID_DEMO_REQUEST', 'reply_to_message_id (uuid) and body are required', parsed.error.issues.map((i) => i.path.join('.')));
    if (this.env.CERA_PORTFOLIO_DEMO_MODE) {
      // 공개 데모: 정해진 문장만 · 발신자는 합성(.invalid) 주소만 — 방문자가 만든 글이 다른 방문자 화면에 섞이지 않게
      if (!PORTFOLIO_REPLY_BODIES.includes(parsed.data.body.trim())) throw new ValidationError('DEMO_REPLY_NOT_ALLOWED', 'The portfolio demo accepts only the listed sample replies', ['body']);
      if (parsed.data.from && !/@[a-z0-9.-]+\.invalid$/i.test(parsed.data.from)) throw new ValidationError('DEMO_REPLY_NOT_ALLOWED', 'The portfolio demo accepts only synthetic (.invalid) senders', ['from']);
    }
    const mock = this.adapters.get('MOCK') as MockChannelAdapter | undefined;
    if (!mock) throw new ValidationError('MOCK_CHANNEL_MISSING', 'The mock channel is not configured', []);
    try {
      const r = await mock.simulateReply({ replyToCeraMessageId: parsed.data.reply_to_message_id, body: parsed.data.body, ...(parsed.data.from ? { from: parsed.data.from } : {}) });
      return { injected: r.external_message_id, from: r.headers.From, thread: r.external_thread_id, note: 'The worker picks it up on its next cycle' };
    } catch (error) {
      throw new ValidationError('NOT_IN_MOCK_SENT_BOX', error instanceof Error ? error.message : 'not sent through the mock channel', ['reply_to_message_id']);
    }
  }
}
