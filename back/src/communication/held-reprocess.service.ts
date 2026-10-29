import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { TruthRepository } from '../truth/truth.repository.js';
import { InboundProcessor } from './inbound-processor.js';

/**
 * 보류함 재처리(T-136) 진입점 — 사람만. 담당자를 등록 · 승인했거나 문의 스레드가 생긴 뒤, 보류된 회신을 지금 기준으로 다시 판정한다.
 * 원문 · 보류 기록은 그대로 남고(append-only), 붙으면 회신 메시지가 새로 생긴다 → 추출 · 사실 승격은 평소 규칙(중복 없음). 판정은 InboundProcessor.
 */
@Injectable()
export class HeldReprocessService {
  constructor(
    @Inject(InboundProcessor) private readonly processor: InboundProcessor,
    @Inject(TruthRepository) private readonly truth: TruthRepository,
  ) {}

  async reprocess(rawInputId: string, actorHeader: string | undefined) {
    if (!z.string().uuid().safeParse(rawInputId).success) throw new ValidationError('INVALID_ID', 'raw input id must be a UUID', ['raw_input_id']);
    if (!actorHeader) throw new ValidationError('ACTOR_REQUIRED', 'X-CERA-Actor-Id header is required', ['x-cera-actor-id']);
    if (!z.string().uuid().safeParse(actorHeader).success) throw new ValidationError('INVALID_ID', 'X-CERA-Actor-Id must be a UUID', ['x-cera-actor-id']);
    const human = await this.truth.activeHuman(actorHeader);
    if (!human) throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can reprocess held mail', 403);
    return this.processor.reprocessHeld(rawInputId, human.actorId);
  }
}
