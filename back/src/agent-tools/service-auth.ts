import { Inject, Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ToolGatewayError } from './tool-errors.js';

/**
 * Agent 서비스 인증(T-103 · T-104 공용): `Authorization: Bearer <CERA_AGENT_TOOL_TOKEN>` 만. SHA-256 지문을 시간 일정 비교.
 * Tool API(/internal/agent-tools)와 Runtime API(/internal/agent-runtime)가 같은 규칙을 쓴다. 토큰은 기록 · 로그에 없다.
 */
@Injectable()
export class AgentServiceAuth {
  private readonly digest: Buffer | null;
  private readonly enabled: boolean;

  constructor(@Inject(ENV) env: Env) {
    this.enabled = env.CERA_AGENT_TOOLS_ENABLED;
    this.digest = env.CERA_AGENT_TOOL_TOKEN ? sha256(env.CERA_AGENT_TOOL_TOKEN) : null;
  }

  verify(authorization: string | undefined): void {
    if (!this.enabled || !this.digest) {
      throw new ToolGatewayError('AGENT_TOOLS_DISABLED', 503, 'Agent tools are disabled (CERA_AGENT_TOOLS_ENABLED=false)');
    }
    const m = /^Bearer ([^\s]{1,512})$/.exec(authorization?.trim() ?? '');
    if (!m || !timingSafeEqual(sha256(m[1]!), this.digest)) {
      throw new ToolGatewayError('UNAUTHORIZED_AGENT', 401, 'A valid agent service token is required (Authorization: Bearer …)');
    }
  }
}

function sha256(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
