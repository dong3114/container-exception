import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import type { Env } from '../config/env.js';

const ORDER: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

/** 로컬은 사람이 읽는 형식, 그 밖은 JSON 한 줄(구조화 로그 — docs/23 4.2). 비밀값·본문은 로그에 넣지 않는다. */
export function createLogger(env: Pick<Env, 'APP_ENV' | 'LOG_LEVEL'>, context: string): ConsoleLogger {
  const logLevels = ORDER.slice(0, ORDER.indexOf(env.LOG_LEVEL) + 1);
  return new ConsoleLogger(context, { logLevels, json: env.APP_ENV !== 'local', colors: env.APP_ENV === 'local' });
}
