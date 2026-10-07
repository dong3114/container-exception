import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { InboundListDto } from './dto.js';
import { InboundService } from './inbound.service.js';

/**
 * 받은 메일(T-091 U6) — 읽기 전용. 회신은 Worker 가 채널에서 가져온다. 이 API 에는 "가짜 회신 만들기"가 없다
 * (개발 · 시험용 회신 주입은 `npm run mock:reply` CLI — production 에서 거부).
 */
@ApiTags('communication')
@Controller('communication')
export class InboundController {
  constructor(@Inject(InboundService) private readonly inbound: InboundService) {}

  @Get('inbound')
  @ApiOperation({ summary: 'Received mail, newest first: attached replies (NORMAL) and the hold box (HOLD) with the reason decided at receipt' })
  @ApiQuery({ name: 'status', required: false, enum: ['NORMAL', 'HOLD'] })
  @ApiOkResponse({ type: InboundListDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_STATUS', schema: { $ref: '#/components/schemas/ErrorResponse' } })
  list(@Query('status') status?: string): Promise<InboundListDto> {
    return this.inbound.list(status);
  }
}
