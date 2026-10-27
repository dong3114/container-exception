import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { Public, RequirePermission } from '../auth/auth.decorators.js';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { CHANNEL_ADAPTERS } from '../channel/channel-adapter.js';
import type { ChannelAdapters } from '../channel/channel.module.js';
import type { MockChannelAdapter } from '../channel/mock-channel-adapter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import { planningSnapshot, recoveryRun } from '../db/schema/index.js';
import { SEED_IDS } from '../seed/slice1-fixture.js';
import { Instant } from '../shared/time/instant.js';
import { ValidationError } from '../shared/errors/cera-error.js';

const mockReplyBody = z
  .object({
    reply_to_message_id: z.string().uuid(),
    body: z.string().min(1).max(2_000),
    from: z.string().email().max(200).optional(),
  })
  .strict();

/**
 * **시연 · 테스트 도우미(개발 전용)** — `APP_ENV` 가 local · test 일 때만 API 에 붙는다(`DemoModule`). 제품 API 가 아니라 OpenAPI 계약에도 없다.
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
    return {
      app_env: this.env.APP_ENV,
      agent_tools_enabled: this.env.CERA_AGENT_TOOLS_ENABLED,
      ai_server: aiServer,
      public_data_mode: this.env.CERA_PUBLIC_DATA_MODE,
      gmail_enabled: this.env.CERA_GMAIL_ENABLED,
      sending_paused: this.env.CERA_SENDING_PAUSED,
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
