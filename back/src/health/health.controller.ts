import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
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
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseHealth) private readonly database: DatabaseHealth,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get('live')
  live(): HealthBody {
    return { status: 'ok', app: 'up', checked_at: this.clock.now().toSeoulIso() };
  }

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthBody> {
    const dbUp = await this.database.ping();
    if (!dbUp) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: dbUp ? 'ok' : 'degraded', app: 'up', db: dbUp ? 'up' : 'down', checked_at: this.clock.now().toSeoulIso() };
  }
}
