import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { DataGoKrHttpTransport, DisabledTransport, PUBLIC_DATA_TRANSPORT, ReplayTransport } from './adapters/transport.js';
import { PublicDataController } from './public-data.controller.js';
import { PublicDataRepository } from './public-data.repository.js';
import { PublicDataService } from './public-data.service.js';

/**
 * 공공데이터(T-102 · ADR-036 결정 3): 공공 API 는 이 모듈의 어댑터만 부른다. 전송은 설정으로 고른다 —
 * `off` 꺼짐 · `replay` 녹화 재생(합성 fixture, 네트워크 없음) · `live` 실제 data.go.kr(키 필요). 시험은 PUBLIC_DATA_TRANSPORT 를 바꾼다.
 */
@Module({
  controllers: [PublicDataController],
  providers: [
    PublicDataRepository,
    PublicDataService,
    {
      provide: PUBLIC_DATA_TRANSPORT,
      inject: [ENV, CLOCK],
      useFactory: (env: Env, clock: Clock) => {
        if (env.CERA_PUBLIC_DATA_MODE === 'replay') return new ReplayTransport(env.CERA_PUBLIC_DATA_REPLAY_DIR, clock);
        if (env.CERA_PUBLIC_DATA_MODE === 'live') return new DataGoKrHttpTransport(env.DATA_GO_KR_SERVICE_KEY, env.CERA_PUBLIC_DATA_TIMEOUT_MS, clock);
        return new DisabledTransport();
      },
    },
  ],
  exports: [PublicDataService],
})
export class PublicDataModule {}
