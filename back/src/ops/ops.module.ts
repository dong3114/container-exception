import { Module } from '@nestjs/common';
import { HeartbeatRepository } from './heartbeat.repository.js';
import { OpsController } from './ops.controller.js';
import { SystemStatusService } from './system-status.service.js';

/** 운영 가시성(T-133) — Worker heartbeat 기록 · 시스템 상태 모으기. 업무 규칙은 없다 */
@Module({
  controllers: [OpsController],
  providers: [HeartbeatRepository, SystemStatusService],
  exports: [HeartbeatRepository, SystemStatusService],
})
export class OpsModule {}
