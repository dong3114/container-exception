import { Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/auth.decorators.js';
import { ExceptionDetectorService } from './exception-detector.service.js';

/**
 * 운영 예외(T-132 · ADR-040) — 결정론 탐지기가 찾은 문제와 그 근거 기록.
 * - `GET /exceptions?status=` · `GET /exceptions/{id}`(관측 기록 = 왜 그렇게 판단했나)
 * - `POST /exceptions/detect`: 지금 한 번 탐지(사람 요청). 평소에는 사실 · 운영 입력 변경 알림과 Worker 주기가 부른다. 탐지가 꺼져 있으면 409
 */
@ApiTags('exceptions')
@Controller('exceptions')
export class ExceptionController {
  constructor(@Inject(ExceptionDetectorService) private readonly detector: ExceptionDetectorService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'RESOLVED'] })
  list(@Query('status') status?: string) {
    return this.detector.list(status);
  }

  @Get(':exceptionId')
  @ApiParam({ name: 'exceptionId', required: true, schema: { type: 'string', format: 'uuid' } })
  get(@Param('exceptionId') exceptionId: string) {
    return this.detector.get(exceptionId);
  }

  @RequirePermission('plan.recalculate')
  @Post('detect')
  @HttpCode(200)
  async detect() {
    return this.detector.detectOnDemand();
  }
}
