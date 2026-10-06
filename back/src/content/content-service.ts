import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../db/database.js';
import type { ContentCategory } from '../db/schema/_common.js';
import { auditLog } from '../db/schema/index.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION, SYSTEM_ERROR_CATEGORY, SYSTEM_ERROR_CODE } from '../persistence/catalog.js';
import { SystemErrorRecorder } from '../persistence/system-error-recorder.js';
import { SystemError } from '../shared/errors/cera-error.js';
import { sha256Bytes, type Sha256Hash } from '../shared/hash/hash.js';
import { ABSENT, CONTENT_STORE, type ContentRef, type ContentState, type ContentStore, judgeContentState, type StoredContent } from './content-store.js';

/** 내용을 가리키는 기록 하나 = (범주, 기록 id, 참조). 감사 `target_type` · `target_id` 와 같은 키다(docs/24 17절). */
export interface RecordedContent {
  category: ContentCategory;
  recordId: string;
  ref: ContentRef;
  isSimulated: boolean;
  scenarioId?: string | null;
}

/**
 * 내용 생성 · 파기 · 점검 흐름(docs/24 16.2 · 17절, Q-45 규칙 docs/22 29.8.1).
 * 이 서비스의 메서드는 DB 트랜잭션 **밖**에서 부른다 — 내용 저장소는 외부 I/O 다.
 */
@Injectable()
export class ContentService {
  constructor(
    @Inject(CONTENT_STORE) private readonly store: ContentStore,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(SystemErrorRecorder) private readonly systemErrors: SystemErrorRecorder,
  ) {}

  /**
   * 생성 1~3단계: put → exists → 저장 바이트 지문 대조. 4단계(참조 + 지문을 기록 행에 넣고 커밋)는 호출자의 트랜잭션이 한다.
   * 4단계가 실패하면 내용은 고아로 남는다(정리 대상 — 기록이 가리키지 않으므로 파기 감사 대상이 아니다).
   * "참조는 있는데 내용이 없는" 행은 이 흐름에서 생기지 않는다.
   */
  async storeVerified(
    category: ContentCategory,
    bytes: Uint8Array,
    mediaType: string,
    expectedSha256?: Sha256Hash,
  ): Promise<StoredContent> {
    const stored = await this.store.put(category, bytes, mediaType);
    if (!(await this.store.exists(stored.ref))) {
      await this.recordContentError('storeVerified', SYSTEM_ERROR_CODE.CONTENT_NOT_STORED, `Content was not found right after it was stored (${category})`, true);
      throw new SystemError('CONTENT_NOT_STORED', 'Content was not found right after it was stored');
    }
    const readBack = await this.store.get(stored.ref);
    const actual = readBack === ABSENT ? null : sha256Bytes(readBack);
    const expected = expectedSha256 ?? sha256Bytes(bytes);
    if (actual !== expected || stored.sha256 !== expected) {
      await this.recordContentError('storeVerified', SYSTEM_ERROR_CODE.CONTENT_HASH_MISMATCH, `Stored content fingerprint does not match (${category})`, false);
      throw new SystemError('CONTENT_HASH_MISMATCH', 'Stored content fingerprint does not match');
    }
    return stored;
  }

  /**
   * 파기 2~4단계: purge → 없어졌는지 확인 → `CONTENT_PURGED` · `SUCCESS` 감사.
   * 1단계(진행 중 흐름이 쓰는 내용이 아닌가 — docs/22 29.7)는 호출자가 먼저 확인한다(보관 일정 작업은 U1 범위 밖).
   * 2~3단계가 실패하면 `FAILURE` 감사(별도 트랜잭션) + `system_error`. 기록 행 · 참조 · 지문은 바꾸지 않는다.
   */
  async purgeRecorded(target: RecordedContent, actorId: string): Promise<'PURGED' | 'ALREADY_PURGED'> {
    let outcome: 'PURGED' | 'NOT_FOUND';
    try {
      outcome = await this.store.purge(target.ref);
      if (await this.store.exists(target.ref)) throw new Error('content still present after purge');
    } catch (error) {
      await this.audit
        .recordStandalone({
          actorId,
          action: AUDIT_ACTION.CONTENT_PURGED,
          targetType: target.category,
          targetId: target.recordId,
          beforeRef: target.ref,
          result: 'FAILURE',
          isSimulated: target.isSimulated,
        })
        .catch(() => undefined); // 감사 기록 실패가 system_error 기록과 원래 오류를 덮지 않게
      await this.systemErrors.record({
        serviceName: 'cera-api',
        componentName: 'ContentService',
        operationName: 'purgeRecorded',
        errorBoundary: 'INTEGRATION',
        errorCategory: SYSTEM_ERROR_CATEGORY.CONTENT_STORE,
        errorCode: SYSTEM_ERROR_CODE.CONTENT_PURGE_FAILED,
        safeErrorMessage: `Content purge failed (${target.category})`,
        cause: error,
        targetSystem: 'CONTENT_STORE',
        retryable: true,
        relatedEntity: { type: target.category, id: target.recordId },
        scenarioId: target.scenarioId ?? null,
      });
      throw new SystemError('CONTENT_PURGE_FAILED', 'Content purge failed', { cause: error });
    }
    if (outcome === 'NOT_FOUND') {
      // 이미 없던 내용: 앞선 성공 파기 감사가 있으면 반복 요청(멱등)이고, 없으면 데이터 손실이다 — 성공으로 덮지 않는다(I-34).
      if (await this.hasSuccessfulPurgeAudit(target)) return 'ALREADY_PURGED';
      await this.recordMissing(target);
      throw new SystemError('CONTENT_MISSING', 'Recorded content is missing without a purge audit');
    }
    await this.tx.run((tx) =>
      this.audit.record(tx, {
        actorId,
        action: AUDIT_ACTION.CONTENT_PURGED,
        targetType: target.category,
        targetId: target.recordId,
        beforeRef: target.ref,
        result: 'SUCCESS',
        isSimulated: target.isSimulated,
      }),
    );
    return 'PURGED';
  }

  /** 점검(읽을 때 · 주기): 판정하고, 손실·불일치면 `system_error`(참조·범주만, 내용 없음)를 남긴다. */
  async inspect(target: RecordedContent): Promise<ContentState> {
    const exists = await this.store.exists(target.ref);
    const purged = await this.hasSuccessfulPurgeAudit(target);
    const state = judgeContentState(exists, purged);
    if (state === 'MISSING') await this.recordMissing(target);
    if (state === 'PURGE_MISMATCH') {
      await this.systemErrors.record({
        serviceName: 'cera-api',
        componentName: 'ContentService',
        operationName: 'inspect',
        errorBoundary: 'BACKGROUND_JOB',
        errorCategory: SYSTEM_ERROR_CATEGORY.DATA_INTEGRITY,
        errorCode: SYSTEM_ERROR_CODE.CONTENT_PURGE_MISMATCH,
        safeErrorMessage: 'Content exists although a purge succeeded',
        retryable: false,
        relatedEntity: { type: target.category, id: target.recordId },
        scenarioId: target.scenarioId ?? null,
      });
    }
    return state;
  }

  private async recordMissing(target: RecordedContent): Promise<void> {
    await this.systemErrors.record({
      serviceName: 'cera-api',
      componentName: 'ContentService',
      operationName: 'contentCheck',
      errorBoundary: 'BACKGROUND_JOB',
      errorCategory: SYSTEM_ERROR_CATEGORY.DATA_INTEGRITY,
      errorCode: SYSTEM_ERROR_CODE.CONTENT_MISSING,
      safeErrorMessage: 'Recorded content is missing without a purge audit',
      retryable: false,
      relatedEntity: { type: target.category, id: target.recordId },
      scenarioId: target.scenarioId ?? null,
    });
  }

  private async recordContentError(operation: string, code: string, safeMessage: string, retryable: boolean): Promise<void> {
    await this.systemErrors.record({
      serviceName: 'cera-api',
      componentName: 'ContentService',
      operationName: operation,
      errorBoundary: 'INTEGRATION',
      errorCategory: SYSTEM_ERROR_CATEGORY.CONTENT_STORE,
      errorCode: code,
      safeErrorMessage: safeMessage,
      targetSystem: 'CONTENT_STORE',
      retryable,
    });
  }

  private async hasSuccessfulPurgeAudit(target: RecordedContent): Promise<boolean> {
    const rows = await this.db
      .select({ id: auditLog.auditId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, AUDIT_ACTION.CONTENT_PURGED),
          eq(auditLog.result, 'SUCCESS'),
          eq(auditLog.targetType, target.category),
          eq(auditLog.targetId, target.recordId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
