import { Module } from '@nestjs/common';
import { FactActionService } from './fact-actions.service.js';
import { PromotionService } from './promotion.service.js';
import { TruthController } from './truth.controller.js';
import { TruthQueryService } from './truth-query.service.js';
import { TruthRepository } from './truth.repository.js';
import { TruthService } from './truth.service.js';
import { CorroborationService } from './corroboration.service.js';

/**
 * 사실 파이프라인(T-093): 검증된 후보 → 임시 사실(PROVISIONAL) → 사람 확인 → 정식 사실(CONFIRMED) · 거절 · 정정.
 * 사건(Event)이 원천이고 `canonical_fact` 는 사건에서 다시 만드는 파생이다(docs/05). Python AI Server 는 이 모듈에 닿지 않는다 — 후보만 낸다(ADR-029).
 * 영속(감사 · 내용 저장소 · EventWriter)·공유(시계 · ID · 알림) 모듈은 전역이다.
 */
@Module({
  controllers: [TruthController],
  providers: [TruthRepository, TruthService, PromotionService, FactActionService, TruthQueryService, CorroborationService],
  exports: [TruthRepository, TruthService, PromotionService, CorroborationService],
})
export class TruthModule {}
