import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DatabaseHealth } from '../db/database.module.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';

interface HealthBody {
  status: 'ok' | 'degraded';
  app: 'up';
  db?: 'up' | 'down';
  checked_at: string;
}

/**
 * - `GET /health/live` : 프로세스가 요청을 받는가(DB 를 보지 않는다)
 * - `GET /health`      : 앱 + DB. DB 가 안 되면 503 `degraded`
 */
@ApiTags('health')
// 사람 로그인 Guard 밖: 상태 확인
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseHealth) private readonly database: DatabaseHealth,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get('live')
  @ApiOkResponse({ description: 'Process is accepting requests (database not checked)' })
  live(): HealthBody {
    return { status: 'ok', app: 'up', checked_at: this.clock.now().toSeoulIso() };
  }

  @Get()
  @ApiOkResponse({ description: 'Application and database are up' })
  @ApiServiceUnavailableResponse({ description: 'Database is unreachable (status degraded)' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthBody> {
    const dbUp = await this.database.ping();
    if (!dbUp) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: dbUp ? 'ok' : 'degraded', app: 'up', db: dbUp ? 'up' : 'down', checked_at: this.clock.now().toSeoulIso() };
  }
}
