import { Global, Module } from '@nestjs/common';
import { CLOCK, SystemClock } from './time/clock.js';
import { ID_GENERATOR, UuidV7Generator } from './id/uuid.js';

/** 시계 · ID 생성기. 시험에서는 `overrideProvider(CLOCK)` 로 FakeClock 을 넣는다. */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7Generator },
  ],
  exports: [CLOCK, ID_GENERATOR],
})
export class SharedModule {}
