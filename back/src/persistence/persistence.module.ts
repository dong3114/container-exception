import { Global, Module } from '@nestjs/common';
import { ContentService } from '../content/content-service.js';
import { CONTENT_STORE } from '../content/content-store.js';
import { LocalFileContentStore } from '../content/local-file-content-store.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { AuditRecorder } from './audit-recorder.js';
import { EventWriter } from './event-writer.js';
import { RegistryReader } from './registry-reader.js';
import { SystemErrorRecorder } from './system-error-recorder.js';

/**
 * 영속 지원(U1): 감사 · 시스템 오류 기록기 · 등록부 읽기 · 내용 저장소 포트(로컬 파일 어댑터) · 내용 흐름.
 * 업무 저장소(초안 · 승인 · 발송 · 수신 · 사건)는 각 U 단위가 자기 쓰임새대로 더한다.
 */
@Global()
@Module({
  providers: [
    AuditRecorder,
    SystemErrorRecorder,
    RegistryReader,
    EventWriter,
    {
      provide: CONTENT_STORE,
      inject: [ENV, ID_GENERATOR, CLOCK],
      useFactory: (env: Env, ids: IdGenerator, clock: Clock) => new LocalFileContentStore(env.CERA_CONTENT_DIR, ids, clock),
    },
    ContentService,
  ],
  exports: [AuditRecorder, SystemErrorRecorder, RegistryReader, EventWriter, CONTENT_STORE, ContentService],
})
export class PersistenceModule {}
