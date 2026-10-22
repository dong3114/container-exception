import { Global, Module } from '@nestjs/common';
import { CLOCK, SystemClock } from './time/clock.js';
import { ID_GENERATOR, UuidV7Generator } from './id/uuid.js';
import { DOMAIN_SIGNALS, DomainSignals } from './signals/domain-signals.js';

/** 시계 · ID 생성기 · 업무 사건 알림(T-104). 시험에서는 `overrideProvider(CLOCK)` 로 FakeClock 을 넣는다. */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7Generator },
    { provide: DOMAIN_SIGNALS, useValue: new DomainSignals() },
  ],
  exports: [CLOCK, ID_GENERATOR, DOMAIN_SIGNALS],
})
export class SharedModule {}
