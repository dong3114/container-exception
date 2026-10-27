import { DOMAIN_SIGNALS, type DomainSignals } from '../shared/signals/domain-signals.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_CLIENT, type AiClient, type Ask, type ExtractionRequest, REPLY_EXTRACT_SCHEMA, REPLY_TIMEZONE } from '../ai/ai-client.js';
import { replyDateOf } from '../truth/date-scope.js';
import { readInboundSurface } from '../channel/inbound-raw.js';
import { ContentService } from '../content/content-service.js';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../content/content-store.js';
import { TransactionRunner } from '../db/transaction.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION, type AuditAction } from '../persistence/catalog.js';
import { SystemErrorRecorder } from '../persistence/system-error-recorder.js';
import { type MaterialValue, canonicalHash, sha256Bytes } from '../shared/hash/hash.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import { DraftService } from './draft.service.js';
import { EXTRACTION_COMPONENT, EXTRACTION_OPERATION, type ExtractionInsert, ExtractionRepository } from './extraction.repository.js';
import { buildAsk, validateAnswers } from './extraction-rules.js';
import { PromotionService } from '../truth/promotion.service.js';

export type ExtractResult = 'EXTRACTED' | 'NO_CANDIDATE' | 'FAILED' | 'SKIPPED' | 'DUPLICATE';

const UNIT_FORMAT = /^[A-Z0-9][A-Z0-9_]*$/;

/**
 * 회신 추출(T-092 U7 · docs/18 D.3 · docs/22 15.9 · T-069 11.7). Worker 가 수신 주기 다음에 부른다.
 *
 *   1. 대상: 정상 회신(INBOUND 메시지 — 스레드 연결 · 등록 발신자 판정을 이미 통과). 보류 메일은 메시지가 없어 대상이 아니다(AI 호출 0회)
 *   2. Backend 가 질문(무엇을 물었나) · 기준일 · 정확한 원문 텍스트를 정해 AI Server 에 보낸다 — 트랜잭션 밖, 시간 제한
 *   3. 응답은 후보일 뿐: 결정론 검증기가 답마다 검사(질문 범위 · 인용 원문 대조 · 형식 · 단위 · 값-인용 · 상충)
 *   4. 인용을 내용 저장소에 넣고(트랜잭션 밖) → 한 트랜잭션: 추출 행(통과 = PENDING, 탈락 = REJECTED · SYSTEM) + 완료 감사
 *
 * **추출은 사실을 만들지 않는다** — 통과한 후보를 임시 사실(사건)로 올릴지는 승격 판정(`PromotionService`, T-093)이 같은 트랜잭션에서 따로 정한다.
 * 기술 실패는 `system_error` — 원문 · 회신은 그대로, 다음 주기에 재시도.
 */
@Injectable()
export class ExtractionProcessor {
  private readonly logger = new Logger('ExtractionProcessor');
  private readonly maxAttempts: number;

  constructor(
    @Inject(ExtractionRepository) private readonly repo: ExtractionRepository,
    @Inject(DraftService) private readonly drafts: DraftService,
    @Inject(PromotionService) private readonly promotion: PromotionService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(CONTENT_STORE) private readonly store: ContentStore,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(SystemErrorRecorder) private readonly errors: SystemErrorRecorder,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(DOMAIN_SIGNALS) private readonly signals: DomainSignals,
    @Inject(ENV) env: Env,
  ) {
    this.maxAttempts = env.CERA_EXTRACTION_MAX_ATTEMPTS;
  }

  async runCycle(): Promise<Record<ExtractResult, number>> {
    const summary: Record<ExtractResult, number> = { EXTRACTED: 0, NO_CANDIDATE: 0, FAILED: 0, SKIPPED: 0, DUPLICATE: 0 };
    for (const id of await this.repo.pendingMessageIds(10, this.maxAttempts)) {
      const result = await this.extractOne(id);
      summary[result] += 1;
      // 커밋 뒤 알림(T-105) — 회신을 기다리던 Agent 를 깨우는 최적화(정확성은 재조정)
      if (result !== 'DUPLICATE') this.signals.emit({ type: 'REPLY_EXTRACTED', inboundMessageId: id });
    }
    return summary;
  }

  async extractOne(messageId: string): Promise<ExtractResult> {
    const subject = await this.repo.subject(messageId);
    if (!subject) return 'SKIPPED';
    const system = await this.drafts.systemActor();
    // 사람이 연 재시도(T-124)면 그 요청 뒤의 결과만 "끝남"으로 본다 — 이전 시도의 기록은 그대로 두고 새 시도를 덧붙인다
    const retry = await this.repo.openRetry(messageId);
    const since = retry?.requestedAt ?? null;

    // AI 가 읽는 텍스트 = 검증기가 인용을 찾는 텍스트(같은 원문 바이트에서 같은 함수로)
    const bytes = subject.payloadRef ? await this.store.get(subject.payloadRef as Parameters<ContentStore['get']>[0]) : ABSENT;
    const surface = bytes === ABSENT ? null : await readInboundSurface(subject.sourceName, bytes);
    if (!surface) return this.finish(messageId, since, subject.isSimulated, system, AUDIT_ACTION.EXTRACTION_SKIPPED_NO_CONTENT, [], '');
    const asks = subject.questions
      .map((q) => buildAsk({ askId: q.askId, questionType: q.questionType, questionText: q.questionText, expectedUnit: q.expectedUnit, values: subject.askedValues }))
      .filter((a): a is Ask => a !== null);
    if (asks.length === 0) return this.finish(messageId, since, subject.isSimulated, system, AUDIT_ACTION.EXTRACTION_SKIPPED_NO_QUESTION, [], '');

    const request: ExtractionRequest = {
      schema_version: REPLY_EXTRACT_SCHEMA,
      inbound_message_id: messageId,
      // 상대 날짜의 기준 = 질문의 날짜(없으면 회신 근거 시각의 날짜) — 시스템 현재 시각이 아니다
      reference_date: subject.askedValues.date ?? (surface.channelReceivedAt ? Instant.parseIso(surface.channelReceivedAt) : Instant.fromDb(subject.rawReceivedAt)).toSeoulIso().slice(0, 10),
      counterparty_name: subject.counterpartyName.slice(0, 100),
      asks,
      message_text: surface.bodyText,
      // v2: 회신 속 상대 날짜의 기준 = 회신의 근거 시각(Q-44)의 서울 날짜 — 처리 시각이 아니다
      reply_date: replyDateOf(subject.rawSourceRecordedAt, subject.rawReceivedAt),
      timezone: REPLY_TIMEZONE,
    };
    // extract-input/1(docs/24 8.2): AI 포트에 보낸 요청 문서 전체 — 같은 입력이면 같은 지문
    const inputHash = canonicalHash({ k: 'extract-input', v: 1, request: request as unknown as MaterialValue });
    const correlationId = this.ids.newId();

    const result = await this.ai.extractReply(request, correlationId);
    if (!result.ok) {
      await this.errors.record({
        serviceName: 'cera-worker',
        componentName: EXTRACTION_COMPONENT,
        operationName: retry ? EXTRACTION_OPERATION.HUMAN_RETRY : EXTRACTION_OPERATION.AUTO,
        errorBoundary: 'INTEGRATION',
        errorCategory: 'AI_INTEGRATION',
        errorCode: result.code,
        safeErrorMessage: `reply extraction failed (${result.providerCode ?? result.code}) — reply kept${retry ? ' (human-requested attempt)' : ''}`,
        targetSystem: 'AI_SERVER',
        httpStatus: result.httpStatus,
        retryable: result.retryable,
        relatedEntity: { type: 'COMM_MESSAGE', id: messageId },
      });
      this.logger.warn({ msg: 'reply extraction failed', message_id: messageId, correlation_id: correlationId, trigger: retry ? 'HUMAN_RETRY' : 'AUTO', retry_request_id: retry?.retryRequestId ?? null, code: result.code, provider_code: result.providerCode });
      return 'FAILED';
    }
    const response = result.response;
    const validated = validateAnswers(asks, surface.bodyText, response);

    // 인용(원문의 일부)을 내용 저장소에 — 추출 행에는 참조 + 지문만(docs/22 15.9 · 29절)
    const quotes: { ref: string; hash: string }[] = [];
    for (const v of validated) {
      const quoteBytes = new TextEncoder().encode(v.answer.evidence.quote);
      quotes.push({ ref: (await this.content.storeVerified('EXTRACTION_SOURCE_QUOTE', quoteBytes, 'text/plain; charset=utf-8')).ref, hash: sha256Bytes(quoteBytes) });
    }
    const now = this.clock.now().toDb();
    const rows: ExtractionInsert[] = validated.map((v, i) => ({
      extractionId: this.ids.newId(),
      messageId,
      rawInputId: subject.rawInputId,
      askId: v.answer.ask_id.slice(0, 40),
      candidateValueText: v.answer.value,
      candidateUnit: v.answer.unit && UNIT_FORMAT.test(v.answer.unit) ? v.answer.unit : null,
      sourceQuoteRef: quotes[i]?.ref ?? '',
      sourceQuoteHash: quotes[i]?.hash ?? '',
      quoteLocation: v.quoteLocation,
      modelVersion: response.meta.model_version,
      promptVersion: response.meta.prompt_version,
      modelConfidence: v.answer.confidence === null ? null : v.answer.confidence.toFixed(4),
      // 검증 통과 = PENDING(사건 후보 — U8 이 사건을 만들면 ACCEPTED) · 탈락 = 결정론 규칙이 거절(SYSTEM 주체, docs/22 15.9.1 규칙 4)
      reviewStatus: v.passed ? 'PENDING' : 'REJECTED',
      reviewedByActorId: v.passed ? null : system,
      reviewedAt: v.passed ? null : now,
      isSimulated: subject.isSimulated,
      schemaVersion: response.schema_version, // 실제로 쓰인 계약판(v1 AI Server 의 응답이면 v1)
      inputHash,
      validatorResult: v.checks,
    }));
    const action = (rows.length > 0 ? AUDIT_ACTION.EXTRACTION_COMPLETED : `EXTRACTION_NO_CANDIDATE_${response.outcome}`) as AuditAction;
    const outcome = await this.finish(messageId, since, subject.isSimulated, system, action, rows, surface.bodyText);
    this.logger.log({
      msg: 'reply extraction stored',
      trigger: retry ? 'HUMAN_RETRY' : 'AUTO',
      retry_request_id: retry?.retryRequestId ?? null,
      message_id: messageId,
      correlation_id: correlationId,
      model_version: response.meta.model_version,
      latency_ms: response.meta.latency_ms,
      usage: response.meta.usage,
      candidates: rows.length,
      passed: validated.filter((v) => v.passed).length,
    });
    return outcome;
  }

  /** 한 트랜잭션: 같은 회신을 줄 세우고, 이미 끝났으면 아무것도 하지 않는다(재시도 · 동시 Worker — 중복 행 없음). */
  private async finish(messageId: string, since: string | null, isSimulated: boolean, system: string, action: AuditAction, rows: ExtractionInsert[], sourceText: string): Promise<ExtractResult> {
    let promoted: { entityId: string; factKey: string }[] = [];
    const outcome = await this.tx.run(async (tx) => {
      await this.repo.lockMessage(tx, messageId);
      if (await this.repo.hasExtractions(tx, messageId, since)) return 'DUPLICATE' as const;
      await this.repo.insert(tx, rows);
      await this.audit.record(tx, { actorId: system, action, targetType: 'COMM_MESSAGE', targetId: messageId, result: 'SUCCESS', isSimulated });
      if (action.startsWith('EXTRACTION_SKIPPED')) return 'SKIPPED' as const;
      // 통과한 후보를 임시 사실로 올릴 자격이 있는가(T-093) — 추출 저장과 한 트랜잭션: 추출이 끝났다고 보이면 승격 판정도 끝나 있다
      if (rows.some((r) => r.reviewStatus === 'PENDING')) {
        const summary = await this.promotion.promoteMessage(tx, messageId, system, sourceText);
        promoted = summary.promoted.map((p) => p.coordinate);
      }
      return rows.length > 0 ? ('EXTRACTED' as const) : ('NO_CANDIDATE' as const);
    });
    for (const c of promoted) this.signals.emit({ type: 'FACT_CHANGED', entityId: c.entityId, factKey: c.factKey });
    return outcome;
  }
}
