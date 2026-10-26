import { Inject, Injectable } from '@nestjs/common';
import { readInboundSurface } from '../channel/inbound-raw.js';
import { ABSENT, CONTENT_STORE, type ContentStore } from '../content/content-store.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { BusinessRuleError } from '../shared/errors/cera-error.js';
import { Instant } from '../shared/time/instant.js';
import type { InboundExtractionDto, InboundItemDto, InboundListDto } from './dto.js';
import { ExtractionRepository } from './extraction.repository.js';
import { type Check, failedCodes } from './extraction-rules.js';
import { InboundRepository } from './inbound.repository.js';
import { type DateRejectReason, type HoldReason, normalizeAddress } from './inbound-rules.js';
import { TruthRepository } from '../truth/truth.repository.js';

const PREVIEW = 300;
const LIMIT = 50;

/**
 * 받은 메일 읽기(T-091 U6) — 보류함(`GetHoldBox`) · 스레드의 회신. 원문은 내용 저장소에서 꺼내 겉정보만 보여 준다(해석하지 않는다).
 * 근거 시각(`raw_input.source_recorded_at`)과 Q-44 거부 사유(감사 `INBOUND_DATE_REJECTED_<사유>`)는 수신 순간 서버가 정해 영속한 값이다 —
 * 원문을 다시 읽어 계산하지 않는다(원문은 파기될 수 있다, docs/22 11.2e · 29절). 원문은 겉정보(제목 · 미리보기)에만 쓴다.
 */
@Injectable()
export class InboundService {
  constructor(
    @Inject(InboundRepository) private readonly inbound: InboundRepository,
    @Inject(CONTENT_STORE) private readonly store: ContentStore,
    @Inject(ExtractionRepository) private readonly extractions: ExtractionRepository,
    @Inject(TruthRepository) private readonly truth: TruthRepository,
    @Inject(ENV) env: Env,
  ) {
    this.maxAttempts = env.CERA_EXTRACTION_MAX_ATTEMPTS;
  }

  private readonly maxAttempts: number;

  async list(status: string | undefined): Promise<InboundListDto> {
    if (status !== undefined && status !== 'NORMAL' && status !== 'HOLD') {
      throw new BusinessRuleError('INVALID_STATUS', 'status must be NORMAL or HOLD', 422);
    }
    const items = await this.items(await this.inbound.listInbound(LIMIT));
    return { items: status ? items.filter((i) => i.status === status) : items };
  }

  async forThread(threadId: string): Promise<InboundItemDto[]> {
    return this.items(await this.inbound.listInbound(LIMIT, threadId));
  }

  /** 정상 회신의 AI 제안 — 추출 행(검증 결과 포함) · 완료 감사 · 기술 실패에서 상태를 만든다. 인용은 내용 저장소에서. */
  private async extractionView(messageIds: string[]): Promise<Map<string, InboundExtractionDto>> {
    const out = new Map<string, InboundExtractionDto>();
    if (messageIds.length === 0) return out;
    const rows = await this.extractions.forMessages(messageIds);
    const done = await this.extractions.completions(messageIds);
    const failures = await this.extractions.failures(messageIds);
    const blocked = await this.truth.blockedReasons(rows.filter((x) => x.reviewStatus === 'PENDING').map((x) => x.extractionId));
    for (const id of messageIds) {
      const candidates: InboundExtractionDto['candidates'] = [];
      for (const x of rows.filter((row) => row.messageId === id)) {
        const checks = x.validatorResult as unknown as Check[];
        const bytes = await this.store.get(x.sourceQuoteRef as Parameters<ContentStore['get']>[0]);
        const failed = failedCodes(checks);
        candidates.push({
          extraction_id: x.extractionId,
          ask_id: x.askId,
          field: checks.find((c) => c.check === 'FIELD')?.detail_code ?? '',
          value: x.candidateValueText,
          unit: x.candidateUnit,
          evidence_quote: bytes === ABSENT ? null : new TextDecoder().decode(bytes),
          validation: failed.length === 0 ? 'PASSED' : 'REJECTED',
          failed_reasons: failed,
          review_status: x.reviewStatus as InboundExtractionDto['candidates'][number]['review_status'],
          generated_by: x.modelVersion.startsWith('replay:') ? 'RECORDED_REPLAY' : 'LLM',
          fact_event_id: x.createdEventId,
          promotion_blocked_reasons: [...new Set(blocked.get(x.extractionId) ?? [])],
        });
      }
      const fail = failures.get(id);
      const action = done.get(id) ?? null;
      const noCandidate = action?.startsWith('EXTRACTION_NO_CANDIDATE_') ?? false;
      let state: InboundExtractionDto['state'] = 'WAITING';
      if (candidates.length > 0) state = 'DONE';
      else if (noCandidate) state = 'NO_CANDIDATE';
      else if (action?.startsWith('EXTRACTION_SKIPPED_')) state = 'SKIPPED';
      else if (fail) state = fail.count >= this.maxAttempts ? 'FAILED' : 'RETRYING';
      out.set(id, {
        state,
        no_candidate_outcome: noCandidate && action ? action.slice('EXTRACTION_NO_CANDIDATE_'.length) : null,
        candidates,
        failed_attempts: fail?.count ?? 0,
        last_error_code: fail?.lastCode ?? null,
      });
    }
    return out;
  }

  private async items(rows: Awaited<ReturnType<InboundRepository['listInbound']>>): Promise<InboundItemDto[]> {
    const reasons = await this.inbound.holdReasons(rows.filter((r) => !r.messageId).map((r) => r.rawInputId));
    // 근거 시각 · 기준 · 거부 사유는 수신 순간 서버가 정해 영속한 값만 쓴다(원문 재계산이 아니다)
    const dateRejections = await this.inbound.dateRejections(rows.map((r) => r.rawInputId));
    const extractionView = await this.extractionView(rows.map((r) => r.messageId).filter((m): m is string => m !== null));
    const labels = await this.inbound.threadLabels([...new Set(rows.map((r) => r.threadId).filter((t): t is string => t !== null))]);
    const out: InboundItemDto[] = [];
    for (const r of rows) {
      const bytes = r.payloadRef ? await this.store.get(r.payloadRef as Parameters<ContentStore['get']>[0]) : ABSENT;
      const surface = bytes === ABSENT ? null : readInboundSurface(r.sourceName, bytes);
      const channelReceivedAt = surface ? Instant.parseIso(surface.channelReceivedAt) : Instant.fromDb(r.receivedAt);
      const rejectReason = (dateRejections.get(r.rawInputId) ?? null) as DateRejectReason | null;
      const from = r.fromAddress ?? (surface ? normalizeAddress(surface.from) : null);
      const sender = from ? await this.inbound.senderLabel(r.sourceName, from) : null;
      out.push({
        raw_input_id: r.rawInputId,
        message_id: r.messageId,
        status: r.messageId ? 'NORMAL' : 'HOLD',
        hold_reasons: r.messageId ? [] : ((reasons.get(r.rawInputId) ?? []) as HoldReason[]),
        from_address: from,
        sender_label: sender ? { counterparty_name: sender.counterpartyName, contact_name: sender.contactName } : null,
        subject: surface?.subject ?? null,
        preview: surface ? surface.bodyText.slice(0, PREVIEW) : null,
        channel_received_at: channelReceivedAt.toSeoulIso(),
        received_at: Instant.fromDb(r.receivedAt).toSeoulIso(),
        evidence_time: Instant.fromDb(r.sourceRecordedAt ?? r.receivedAt).toSeoulIso(),
        evidence_basis: rejectReason ? 'CHANNEL_RECEIVED' : 'DATE_HEADER',
        date_header_reject_reason: rejectReason,
        thread_id: r.threadId,
        thread_counterparty_name: r.threadId ? (labels.get(r.threadId)?.counterpartyName ?? null) : null,
        is_simulated: r.isSimulated,
        content_available: surface !== null,
        extraction: r.messageId ? (extractionView.get(r.messageId) ?? null) : null,
      });
    }
    return out;
  }
}
