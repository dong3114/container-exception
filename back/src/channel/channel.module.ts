import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { CHANNEL_ADAPTERS, type ChannelAdapter, type ChannelType } from './channel-adapter.js';
import { GmailChannelAdapter } from './gmail-channel-adapter.js';
import { GmailClient } from './gmail/gmail-client.js';
import { MockChannelAdapter } from './mock-channel-adapter.js';

export type ChannelAdapters = ReadonlyMap<ChannelType, ChannelAdapter>;

/**
 * 채널 어댑터 목록(T-090 U5 · T-118). **MOCK 은 늘 있다**(네트워크 없음). GMAIL 은 `CERA_GMAIL_ENABLED=true` 일 때만 생긴다 —
 * 없으면 GMAIL 메시지는 `CHANNEL_UNAVAILABLE` 로 막힌다. 어느 채널로 나가는지는 받는 주소(`contact_channel_address.channel_type`)가 정한다.
 * Gmail 도 제품 Contact Gate 와 개발 안전장치(allowlist)를 둘 다 통과해야 한다 — 그 판정은 `evaluateContactGate` 한 곳이고,
 * 승인 시점과 발송 직전(Worker)에 각각 한다. PORTAL 어댑터는 아직 없다.
 */
export function buildChannelAdapters(env: Env, ids: IdGenerator, clock: Clock): Map<ChannelType, ChannelAdapter> {
  const adapters = new Map<ChannelType, ChannelAdapter>([['MOCK', new MockChannelAdapter(env.CERA_MOCK_CHANNEL_DIR, ids, clock, env.CERA_MOCK_CHANNEL_FAULT)]]);
  if (env.CERA_GMAIL_ENABLED) {
    const client = new GmailClient(
      { clientId: env.GMAIL_CLIENT_ID ?? '', clientSecret: env.GMAIL_CLIENT_SECRET ?? '', refreshToken: env.GMAIL_REFRESH_TOKEN ?? '' },
      env.CERA_GMAIL_TIMEOUT_MS,
      undefined,
      () => clock.now().epochMs,
    );
    adapters.set(
      'GMAIL',
      new GmailChannelAdapter(client, { accountEmail: env.GMAIL_ACCOUNT_EMAIL ?? '', maxMessageBytes: env.CERA_GMAIL_MAX_MESSAGE_BYTES, lookupDays: env.CERA_GMAIL_LOOKUP_DAYS }),
    );
  }
  return adapters;
}

@Global()
@Module({
  providers: [
    {
      provide: CHANNEL_ADAPTERS,
      inject: [ENV, ID_GENERATOR, CLOCK],
      useFactory: (env: Env, ids: IdGenerator, clock: Clock): ChannelAdapters => buildChannelAdapters(env, ids, clock),
    },
  ],
  exports: [CHANNEL_ADAPTERS],
})
export class ChannelModule {}
