import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { CHANNEL_ADAPTERS, type ChannelAdapter, type ChannelType } from './channel-adapter.js';
import { MockChannelAdapter } from './mock-channel-adapter.js';

export type ChannelAdapters = ReadonlyMap<ChannelType, ChannelAdapter>;

/**
 * 채널 어댑터 목록(T-090 U5). Slice 1 은 **MOCK 하나** — 네트워크를 쓰지 않는다. GMAIL · PORTAL 어댑터가 없으므로 그 채널 메시지는
 * `CHANNEL_UNAVAILABLE` 로 막힌다(실채널 발송은 Tech Validation 부터 — ADR-027). Gmail 을 붙일 때도 제품 Contact Gate 와
 * 개발 안전장치(allowlist)를 둘 다 통과해야 한다 — 그 판정은 `evaluateContactGate` 한 곳이다.
 */
@Global()
@Module({
  providers: [
    {
      provide: CHANNEL_ADAPTERS,
      inject: [ENV, ID_GENERATOR, CLOCK],
      useFactory: (env: Env, ids: IdGenerator, clock: Clock): ChannelAdapters =>
        new Map<ChannelType, ChannelAdapter>([['MOCK', new MockChannelAdapter(env.CERA_MOCK_CHANNEL_DIR, ids, clock, env.CERA_MOCK_CHANNEL_FAULT)]]),
    },
  ],
  exports: [CHANNEL_ADAPTERS],
})
export class ChannelModule {}
