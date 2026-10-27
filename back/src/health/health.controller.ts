import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DatabaseHealth } from '../db/database.module.js';
import { EXECUTION_QUEUE, type ExecutionQueue } from '../queue/execution-queue.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';

interface HealthBody {
  status: 'ok' | 'degraded';
  app: 'up';
  db?: 'up' | 'down';
  /** 실행 큐(Redis, T-121) — 참고용. 내려가도 PostgreSQL 폴링이 같은 일을 하므로 `status` 를 바꾸지 않는다 */
  queue?: 'up' | 'down' | 'disabled';
  checked_at: string;
}

/**
 * - `GET /health/live` : 프로세스가 요청을 받는가(DB 를 보지 않는다) — 살아 있음(liveness)
 * - `GET /health`      : 앱 + DB = 요청을 처리할 준비(readiness). DB 가 안 되면 503 `degraded`. 실행 큐는 상태만 알린다
 * migration 은 compose 의 `migrate`(성공 완료)가 끝난 뒤에만 API · Worker 가 뜬다 — 앱 역할은 migration 이력을 읽지 못한다(권한 설계)
 */
@ApiTags('health')
// 사람 로그인 Guard 밖: 상태 확인
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseHealth) private readonly database: DatabaseHealth,
    @Inject(EXECUTION_QUEUE) private readonly queue: ExecutionQueue,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get('live')
  @ApiOkResponse({ description: 'Process is accepting requests (database not checked)' })
  live(): HealthBody {
    return { status: 'ok', app: 'up', checked_at: this.clock.now().toSeoulIso() };
  }

  @Get()
  @ApiOkResponse({ description: 'Application and database are up (queue state is informational — PostgreSQL polling covers a Redis outage)' })
  @ApiServiceUnavailableResponse({ description: 'Database is unreachable (status degraded)' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthBody> {
    const dbUp = await this.database.ping();
    if (!dbUp) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    const queue = await this.queue.status().catch(() => 'down' as const);
    return { status: dbUp ? 'ok' : 'degraded', app: 'up', db: dbUp ? 'up' : 'down', queue, checked_at: this.clock.now().toSeoulIso() };
  }
}
