import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/auth.decorators.js';
import { SystemStatusService } from './system-status.service.js';

/**
 * 운영 화면의 시스템 상태(T-133). `system.monitor`(ADMIN · OPERATOR)만 — 데모 방문자 · 현장 담당자는 볼 수 없다.
 * 업무 숫자(예외 · 실행 · 승인 대기)는 기존 업무 API 가 정본이고, 여기는 CERA 자체가 일하고 있는지만 답한다.
 */
@ApiTags('ops')
@Controller('ops')
export class OpsController {
  constructor(@Inject(SystemStatusService) private readonly status: SystemStatusService) {}

  @RequirePermission('system.monitor')
  @Get('system-status')
  @ApiOperation({ summary: 'System health for the operations dashboard — API · PostgreSQL · Redis · Worker heartbeat · AI · LLM · Gmail · public data · waiting work (PostgreSQL is the source; no hosts, paths, keys or tokens)' })
  @ApiOkResponse({ schema: { type: 'object' } })
  systemStatus() {
    return this.status.status();
  }
}
