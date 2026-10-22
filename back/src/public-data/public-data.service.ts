import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ContentService } from '../content/content-service.js';
import type { DbTransaction } from '../db/database.js';
import { TransactionRunner } from '../db/transaction.js';
import { AuditRecorder } from '../persistence/audit-recorder.js';
import { AUDIT_ACTION, SYSTEM_ERROR_CATEGORY, SYSTEM_ERROR_CODE } from '../persistence/catalog.js';
import { SystemErrorRecorder } from '../persistence/system-error-recorder.js';
import { currentContext } from '../shared/context/request-context.js';
import { BusinessRuleError, ValidationError } from '../shared/errors/cera-error.js';
import { ID_GENERATOR, type IdGenerator } from '../shared/id/uuid.js';
import { CLOCK, type Clock } from '../shared/time/clock.js';
import { Instant } from '../shared/time/instant.js';
import {
  containerManifestParams,
  type DatasetSpec,
  DS02_CONTAINER_MANIFEST,
  DS03_VESSEL_CALL,
  requestRef,
  vesselCallParams,
} from './adapters/datasets.js';
import { PUBLIC_DATA_TRANSPORT, type PublicDataTransport } from './adapters/transport.js';
import {
  BUSAN_PORT_AUTHORITY_CODE,
  type FetchPage,
  type FetchSummary,
  type ManifestContainerView,
  type ManifestFetchResult,
  type NormalizationIssue,
  type Provenance,
  type PublicDataDataset,
  type VesselCallFetchResult,
  type VesselCallSearch,
  type VesselCallView,
} from './contracts.js';
import { iso6346CheckDigitValid, normalizeManifestLine } from './normalization/container-manifest.js';
import { daysBetween, isCalendarDate, toCompactDate } from './normalization/public-time.js';
import { normalizeVesselCall } from './normalization/vessel-call.js';
import { type ClassifiedFetch, classifyFetch } from './parsing/outcome.js';
import type { XmlRecord } from './parsing/xml-envelope.js';
import { PublicDataRepository } from './public-data.repository.js';

export const MAX_SEARCH_DAYS = 31;
const ACTOR_HEADER = 'x-cera-actor-id';
const CALL_SIGN = /^[A-Z0-9]{1,10}$/;

interface PageContext {
  rawInputId: string;
  receivedAt: Instant;
  recordedAt: string;
  isSimulated: boolean;
  issues: NormalizationIssue[];
}

/**
 * 공공데이터 capability(T-102): DS-03 입항 건 · DS-02 적하목록 컨테이너. Agent Tool(T-103)은 이 서비스만 부른다.
 *
 * 한 페이지의 흐름(재현 가능한 원문 우선):
 *   전송(트랜잭션 밖) → 원문 바이트를 내용 저장소에 먼저(저장 후 지문 확인) → 한 트랜잭션에 raw_input · 호출 원장 · 감사 ·
 *   정규화 결과(개체 · PUBLIC_API 사건 · 외부 식별자). 정규화는 원문에서 다시 돌릴 수 있는 결정론 규칙이다.
 * 실패도 원장에 남는다(전송 실패는 원문 없이). 인증키는 전송 구현만 알고, 원장 · 원문 메타 · 감사 · 오류 기록에 없다.
 */
@Injectable()
export class PublicDataService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PUBLIC_DATA_TRANSPORT) private readonly transport: PublicDataTransport,
    @Inject(PublicDataRepository) private readonly repo: PublicDataRepository,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(AuditRecorder) private readonly audit: AuditRecorder,
    @Inject(SystemErrorRecorder) private readonly systemErrors: SystemErrorRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  status() {
    const enabled = this.env.CERA_PUBLIC_DATA_MODE !== 'off';
    return {
      mode: this.env.CERA_PUBLIC_DATA_MODE.toUpperCase() as 'OFF' | 'REPLAY' | 'LIVE',
      max_pages: this.env.CERA_PUBLIC_DATA_MAX_PAGES,
      datasets: [DS03_VESSEL_CALL, DS02_CONTAINER_MANIFEST].map((d) => ({
        dataset: d.dataset,
        operation: d.operation,
        available: enabled && this.transport.isAvailable(d.dataset),
      })),
    };
  }

  /** DS-03: 부산 · 기간(입항일 기준)의 입항 건을 받아 등록하고, 입항 신고 일시 · 선석을 사건으로 남긴다. */
  async fetchVesselCalls(search: VesselCallSearch, actorHeader: string | undefined): Promise<VesselCallFetchResult> {
    return this.fetchVesselCallsAs(search, await this.requireRequester(actorHeader));
  }

  /**
   * 이미 확인된 행위자로 부른다 — Agent Tool(T-103)은 서비스 토큰 + 실행 기록이 정한 AI_AGENT 행위자로 이 길을 쓴다.
   * 사람 헤더를 흉내 내지 않는다. 원장 `requested_by_actor_id` 에 그 행위자가 남는다.
   */
  async fetchVesselCallsAs(search: VesselCallSearch, actorId: string): Promise<VesselCallFetchResult> {
    this.requireAvailable(DS03_VESSEL_CALL.dataset);
    const { from, to } = search;
    if (!isCalendarDate(from) || !isCalendarDate(to)) throw new ValidationError('INVALID_DATE', 'from and to must be calendar dates (YYYY-MM-DD, Asia/Seoul)', ['from', 'to']);
    const span = daysBetween(from, to);
    if (span < 0 || span > MAX_SEARCH_DAYS - 1) throw new ValidationError('INVALID_DATE_RANGE', `to must be on or after from, at most ${MAX_SEARCH_DAYS} days`, ['from', 'to']);
    const callSign = search.callSign ? search.callSign.trim().toUpperCase() : null;
    if (callSign && !CALL_SIGN.test(callSign)) throw new ValidationError('INVALID_CALL_SIGN', 'call_sign must be 1-10 letters or digits', ['call_sign']);

    const touched = new Set<string>();
    const summary = await this.fetchAllPages(
      DS03_VESSEL_CALL,
      (pageNo) => vesselCallParams({ portAuthorityCode: BUSAN_PORT_AUTHORITY_CODE, sde: toCompactDate(from), ede: toCompactDate(to), callSign, pageNo }),
      actorId,
      async (tx, items, ctx) => {
        for (const [index, item] of items.entries()) {
          const id = await this.ingestVesselCall(tx, item, index, ctx);
          if (id) touched.add(id);
        }
      },
    );
    return { summary, vessel_calls: await this.vesselCallViews([...touched]) };
  }

  /** DS-02: 등록된 입항 건 하나의 수입 적하목록(B/L ↔ 컨테이너 · 규격)을 받는다. */
  async fetchContainerManifest(vesselCallId: string, actorHeader: string | undefined): Promise<ManifestFetchResult> {
    return this.fetchContainerManifestAs(vesselCallId, await this.requireRequester(actorHeader));
  }

  /** 이미 확인된 행위자로 부른다(Agent Tool). */
  async fetchContainerManifestAs(vesselCallId: string, actorId: string): Promise<ManifestFetchResult> {
    this.requireAvailable(DS02_CONTAINER_MANIFEST.dataset);
    const [call] = await this.repo.vesselCalls({ ids: [vesselCallId], limit: 1 });
    if (!call) throw new BusinessRuleError('VESSEL_CALL_NOT_FOUND', 'Vessel call not found', 404);
    if (call.isSimulated !== (this.transport.mode === 'REPLAY')) {
      throw new BusinessRuleError('PUBLIC_DATA_SIMULATION_MISMATCH', 'A replayed vessel call cannot be combined with live data (or the other way round)', 409);
    }
    const callSeq = String(call.seq).padStart(3, '0');
    const summary = await this.fetchAllPages(
      DS02_CONTAINER_MANIFEST,
      (pageNo) => containerManifestParams({ portAuthorityCode: call.port, callYear: call.year, callSeq, callSign: call.callSign, pageNo }),
      actorId,
      async (tx, items, ctx) => {
        for (const [index, item] of items.entries()) {
          await this.ingestManifestLine(tx, item, index, ctx, { id: call.id, year: call.year, seq: callSeq, callSign: call.callSign });
        }
      },
    );
    const [view] = await this.vesselCallViews([call.id]);
    return { summary, vessel_call: view!, containers: await this.containerViews(call.id) };
  }

  async listVesselCalls(limit: number): Promise<VesselCallView[]> {
    const rows = await this.repo.vesselCalls({ limit });
    return this.vesselCallViews(rows.map((r) => r.id));
  }

  async vesselCallDetail(vesselCallId: string): Promise<{ vessel_call: VesselCallView; containers: ManifestContainerView[] }> {
    const [view] = await this.vesselCallViews([vesselCallId]);
    if (!view) throw new BusinessRuleError('VESSEL_CALL_NOT_FOUND', 'Vessel call not found', 404);
    return { vessel_call: view, containers: await this.containerViews(vesselCallId) };
  }

  async fetchLedger(limit: number) {
    return (await this.repo.fetches(limit)).map((f) => ({
      fetch_id: f.fetchId,
      dataset: f.dataset,
      operation: f.operation,
      request_params: f.requestParams,
      page_no: f.pageNo,
      mode: f.mode,
      requested_at: Instant.fromDb(f.requestedAt).toSeoulIso(),
      received_at: f.receivedAt ? Instant.fromDb(f.receivedAt).toSeoulIso() : null,
      http_status: f.httpStatus,
      result_code: f.resultCode,
      outcome: f.outcome,
      total_count: f.totalCount,
      item_count: f.itemCount,
      raw_input_id: f.rawInputId,
      is_simulated: f.isSimulated,
    }));
  }

  // ── 페이지 흐름 ──

  private async fetchAllPages(
    spec: DatasetSpec,
    paramsFor: (pageNo: number) => Record<string, string>,
    actorId: string,
    ingest: (tx: DbTransaction, items: XmlRecord[], ctx: PageContext) => Promise<void>,
  ): Promise<FetchSummary> {
    const pages: FetchPage[] = [];
    const issues: NormalizationIssue[] = [];
    let totalCount: number | null = null;
    let outcome: FetchSummary['outcome'] = 'NO_DATA';
    let truncated = false;
    for (let pageNo = 1; ; pageNo++) {
      if (pageNo > this.env.CERA_PUBLIC_DATA_MAX_PAGES) {
        truncated = true;
        break;
      }
      const page = await this.fetchPage(spec, paramsFor(pageNo), pageNo, actorId, ingest, issues);
      pages.push(page.page);
      if (pageNo === 1) {
        outcome = page.page.outcome;
        totalCount = page.totalCount;
      } else if (page.page.outcome !== 'SUCCESS' && page.page.outcome !== 'NO_DATA') {
        outcome = page.page.outcome; // 중간 페이지 실패 — 앞 페이지 결과는 이미 남았다
      }
      if (page.page.outcome !== 'SUCCESS') break;
      if (totalCount === null || pageNo * spec.pageSize >= totalCount) break;
    }
    return { dataset: spec.dataset, mode: this.transport.mode, outcome, total_count: totalCount, pages, truncated, issues };
  }

  private async fetchPage(
    spec: DatasetSpec,
    params: Record<string, string>,
    pageNo: number,
    actorId: string,
    ingest: (tx: DbTransaction, items: XmlRecord[], ctx: PageContext) => Promise<void>,
    issues: NormalizationIssue[],
  ): Promise<{ page: FetchPage; totalCount: number | null }> {
    const fetchId = this.ids.newId();
    const isSimulated = this.transport.mode === 'REPLAY';
    const traceId = currentContext()?.traceId ?? null;
    const result = await this.transport.get(spec, params);
    const base = {
      fetchId,
      dataset: spec.dataset,
      operation: spec.operation,
      requestParams: params,
      pageNo,
      mode: this.transport.mode,
      requestedAt: result.requestedAt.toDb(),
      requestedByActorId: actorId,
      traceId,
      isSimulated,
    };

    if (!result.ok) {
      if (result.errorCode === 'REPLAY_FIXTURE_NOT_FOUND') {
        throw new BusinessRuleError('REPLAY_FIXTURE_NOT_FOUND', 'No replay fixture matches this request (see data/fixtures/public-data/index.json)', 422);
      }
      await this.tx.run(async (tx) => {
        await this.repo.insertFetch(tx, { ...base, receivedAt: null, httpStatus: null, resultCode: result.errorCode, outcome: 'TRANSPORT_ERROR', totalCount: null, itemCount: null, rawInputId: null });
        await this.auditFetch(tx, actorId, fetchId, 'FAILURE', isSimulated);
      });
      await this.recordFailure(spec, 'TRANSPORT_ERROR', null, result.errorCode, fetchId);
      return { page: { fetch_id: fetchId, page_no: pageNo, outcome: 'TRANSPORT_ERROR', http_status: null, result_code: result.errorCode, item_count: null, raw_input_id: null }, totalCount: null };
    }

    const classified: ClassifiedFetch = classifyFetch(result);
    const stored = await this.content.storeVerified('RAW_INPUT_PAYLOAD', result.bytes, result.mediaType);
    const rawInputId = this.ids.newId();
    const recordedAt = this.clock.now().toDb();
    await this.tx.run(async (tx) => {
      if (isSimulated) await this.repo.ensureReplayScenario(tx, result.requestedAt.toDb());
      await this.repo.insertRawInput(tx, {
        rawInputId,
        sourceName: spec.sourceName,
        requestRef: requestRef(spec, params),
        payloadRef: stored.ref,
        payloadHash: stored.sha256,
        // 호출 하나 = 원문 하나. 같은 조건을 다시 물어도 새 근거다(docs/05 4.5)
        sourceRecordKey: fetchId,
        receivedAt: result.receivedAt.toDb(),
        collectedByActorId: actorId,
        isSimulated,
      });
      await this.repo.insertFetch(tx, {
        ...base,
        receivedAt: result.receivedAt.toDb(),
        httpStatus: result.httpStatus,
        resultCode: classified.resultCode,
        outcome: classified.outcome,
        totalCount: classified.totalCount,
        itemCount: classified.outcome === 'SUCCESS' ? classified.items.length : classified.outcome === 'NO_DATA' ? 0 : null,
        rawInputId,
      });
      await this.auditFetch(tx, actorId, fetchId, classified.outcome === 'SUCCESS' || classified.outcome === 'NO_DATA' ? 'SUCCESS' : 'FAILURE', isSimulated);
      if (classified.outcome === 'SUCCESS') {
        await ingest(tx, classified.items, { rawInputId, receivedAt: result.receivedAt, recordedAt, isSimulated, issues });
      }
    });
    if (classified.outcome === 'UPSTREAM_ERROR' || classified.outcome === 'PARSE_ERROR') {
      await this.recordFailure(spec, classified.outcome, result.httpStatus, classified.reason ?? classified.resultCode, fetchId);
    }
    return {
      page: {
        fetch_id: fetchId,
        page_no: pageNo,
        outcome: classified.outcome,
        http_status: result.httpStatus,
        result_code: classified.resultCode,
        item_count: classified.outcome === 'SUCCESS' ? classified.items.length : null,
        raw_input_id: rawInputId,
      },
      totalCount: classified.totalCount,
    };
  }

  // ── 정규화 결과 쓰기 ──

  private async ingestVesselCall(tx: DbTransaction, item: XmlRecord, index: number, ctx: PageContext): Promise<string | null> {
    const { value: v, issues } = normalizeVesselCall(item, index, ctx.receivedAt);
    ctx.issues.push(...issues);
    if (!v) return null;
    const upserted = await this.repo.upsertVesselCall(tx, {
      id: this.ids.newId(),
      portAuthorityCode: v.portAuthorityCode,
      callYear: v.callYear,
      callSeq: Number(v.callSeq),
      callSign: v.callSign,
      vesselName: v.vesselName,
      rawInputId: ctx.rawInputId,
      isSimulated: ctx.isSimulated,
      at: ctx.recordedAt,
    });
    if (upserted.id === null) {
      ctx.issues.push({ item_index: index, code: 'VESSEL_CALL_SIMULATION_MISMATCH' });
      return null;
    }
    const subject = { entityType: 'VESSEL_CALL' as const, entityId: upserted.id };
    const common = { rawInputId: ctx.rawInputId, receivedAt: ctx.receivedAt.toDb(), recordedAt: ctx.recordedAt, isSimulated: ctx.isSimulated, subject };
    if (v.arrival) {
      // 입항 신고 일시 — 실제 입항(접안) 마일스톤이 아니다. 지난 일시라도 `milestone.arrived` 로 쓰지 않는다(2026-10-22 live 검토)
      const finalDeclaration = v.arrival.requestKind === '최종';
      await this.repo.insertEvent(tx, {
        ...common,
        eventId: this.ids.newId(),
        claimLocator: `/items/${index}/details/${v.arrival.detailIndex}/etryptDt`,
        eventType: 'ARRIVAL_DECLARED',
        factKind: 'STATE',
        factKey: 'declared_arrival',
        valueTimestamp: v.arrival.at.toDb(),
        sourceEventTime: null, // 신고가 언제 이루어졌는지는 응답에 없다
        confidence: finalDeclaration ? 'MEDIUM' : 'LOW',
        confidenceReasons: ['PUBLIC_API_DECLARATION', ...(finalDeclaration ? [] : ['DECLARATION_NOT_FINAL']), ...(v.arrival.tzAssumed ? ['TZ_ASSUMED'] : [])],
        payload: {
          dataset: 'MOF_VESSEL_CALL',
          basis: 'PORT_MIS_ENTRY_DECLARATION',
          request_kind: v.arrival.requestKind,
          relative_to_received: v.arrival.relativeToReceived,
          ...(v.arrival.tzAssumed ? { tz_assumed: true } : {}),
        },
      });
    }
    if (v.berth && (v.berth.code || v.berth.name)) {
      await this.repo.insertEvent(tx, {
        ...common,
        eventId: this.ids.newId(),
        claimLocator: `/items/${index}/details/${v.berth.detailIndex}/laidupFclty`,
        eventType: 'LOCATION_REPORTED',
        factKind: 'STATE',
        factKey: 'location',
        valueCode: v.berth.code,
        valueText: v.berth.name,
        sourceEventTime: null,
        confidence: v.berth.code ? 'MEDIUM' : 'LOW',
        confidenceReasons: ['PUBLIC_API_DECLARATION', ...(v.berth.code ? [] : ['NONSTANDARD_FACILITY_CODE'])],
        payload: { dataset: 'MOF_VESSEL_CALL', location_kind: 'BERTH', ...(v.berth.code ? {} : { raw_facility_code: v.berth.rawCode }) },
      });
    }
    if (v.importManifestNo) {
      const r = await this.repo.insertExternalIdentifier(tx, {
        id: this.ids.newId(),
        ownerType: 'VESSEL_CALL',
        ownerId: upserted.id,
        idType: 'MANIFEST_NO',
        idValue: v.importManifestNo,
        rawInputId: ctx.rawInputId,
        isSimulated: ctx.isSimulated,
      });
      if (r === 'OTHER_OWNER') ctx.issues.push({ item_index: index, code: 'MANIFEST_NO_OTHER_OWNER' });
    }
    return upserted.id;
  }

  private async ingestManifestLine(
    tx: DbTransaction,
    item: XmlRecord,
    index: number,
    ctx: PageContext,
    call: { id: string; year: number; seq: string; callSign: string },
  ): Promise<void> {
    const { value: line, issues } = normalizeManifestLine(item, index);
    ctx.issues.push(...issues);
    if (!line) return;
    // 응답이 물은 입항 건의 것인지 되짚는다(다른 건이 섞이면 쓰지 않는다)
    if (line.callSign !== call.callSign || line.callYear !== String(call.year) || line.callSeq !== call.seq) {
      ctx.issues.push({ item_index: index, code: 'MANIFEST_KEY_MISMATCH' });
      return;
    }
    const blRow = await this.repo.upsertBl(tx, { id: this.ids.newId(), blNo: line.blNo, rawInputId: ctx.rawInputId, isSimulated: ctx.isSimulated, at: ctx.recordedAt });
    const containerRow = await this.repo.upsertContainer(tx, {
      id: this.ids.newId(),
      containerNo: line.containerNo,
      sizeType: line.sizeType,
      vesselCallId: call.id,
      rawInputId: ctx.rawInputId,
      isSimulated: ctx.isSimulated,
      at: ctx.recordedAt,
    });
    if (blRow.id === null || containerRow.id === null) {
      ctx.issues.push({ item_index: index, code: 'MANIFEST_SIMULATION_MISMATCH' });
      return;
    }
    if (containerRow.otherVesselCall) ctx.issues.push({ item_index: index, code: 'CONTAINER_ON_OTHER_VESSEL_CALL' });
    if ((await this.repo.linkContainerBl(tx, containerRow.id, blRow.id)) === 'OTHER_PRIMARY') ctx.issues.push({ item_index: index, code: 'CONTAINER_ON_OTHER_BL' });
    if (line.manifestNo && /^[A-Z0-9]{1,20}$/.test(line.manifestNo)) {
      if ((await this.repo.insertExternalIdentifier(tx, { id: this.ids.newId(), ownerType: 'VESSEL_CALL', ownerId: call.id, idType: 'MANIFEST_NO', idValue: line.manifestNo, rawInputId: ctx.rawInputId, isSimulated: ctx.isSimulated })) === 'OTHER_OWNER') {
        ctx.issues.push({ item_index: index, code: 'MANIFEST_NO_OTHER_OWNER' });
      }
      if (line.msn) {
        // MSN 은 적하목록 안에서만 유일하다 → 값 = 적하목록관리번호-MSN
        const r = await this.repo.insertExternalIdentifier(tx, { id: this.ids.newId(), ownerType: 'BL', ownerId: blRow.id, idType: 'MSN', idValue: `${line.manifestNo}-${line.msn}`, rawInputId: ctx.rawInputId, isSimulated: ctx.isSimulated });
        if (r === 'OTHER_OWNER') ctx.issues.push({ item_index: index, code: 'MSN_OTHER_OWNER' });
      }
    }
    const subject = { entityType: 'CONTAINER' as const, entityId: containerRow.id };
    const confidence = line.checkDigitValid ? ('MEDIUM' as const) : ('LOW' as const);
    const reasons = ['PUBLIC_API_MANIFEST', ...(line.checkDigitValid ? [] : ['CONTAINER_CHECK_DIGIT_MISMATCH'])];
    const common = { rawInputId: ctx.rawInputId, receivedAt: ctx.receivedAt.toDb(), recordedAt: ctx.recordedAt, isSimulated: ctx.isSimulated, subject, sourceEventTime: null, confidence, confidenceReasons: reasons, factKind: 'IDENTITY' as const };
    const payload = { dataset: 'MOF_CONTAINER_MANIFEST' };
    await this.repo.insertEvent(tx, {
      ...common,
      eventId: this.ids.newId(),
      claimLocator: `/items/${index}/clsgn`,
      eventType: 'VESSEL_CALL_LINKED',
      factKey: 'identity.vessel_call',
      valueText: call.id,
      context: { entityType: 'VESSEL_CALL', entityId: call.id },
      payload,
    });
    await this.repo.insertEvent(tx, {
      ...common,
      eventId: this.ids.newId(),
      claimLocator: `/items/${index}/blNo`,
      eventType: 'BL_LINKED',
      factKey: 'identity.bl',
      valueText: blRow.id,
      context: { entityType: 'BL', entityId: blRow.id },
      payload: { ...payload, bl_type: 'UNKNOWN' },
    });
    if (line.isoSizeType) {
      await this.repo.insertEvent(tx, {
        ...common,
        eventId: this.ids.newId(),
        claimLocator: `/items/${index}/contnStndrd`,
        eventType: 'EQUIPMENT_REPORTED',
        factKey: 'identity.iso_size_type',
        valueCode: line.isoSizeType,
        payload: { ...payload, size_ft: line.sizeFt, cera_size_type: line.sizeType },
      });
    }
  }

  // ── 읽기 모양 ──

  private async vesselCallViews(ids: string[]): Promise<VesselCallView[]> {
    if (ids.length === 0) return [];
    const rows = await this.repo.vesselCalls({ ids, limit: ids.length });
    const observations = await this.repo.latestObservations('VESSEL_CALL', ids, ['declared_arrival', 'location']);
    const manifests = await this.repo.manifestNos(ids);
    const counts = new Map((await this.repo.containerCounts(ids)).map((c) => [c.vesselCallId, c.count]));
    const provenance = await this.provenanceMap([...rows.map((r) => r.firstRawInputId), ...observations.map((o) => o.rawInputId)]);
    const order = new Map(ids.map((id, i) => [id, i]));
    return rows
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((r) => {
        const obs = observations.filter((o) => o.entityId === r.id);
        const arrival = obs.find((o) => o.factKey === 'declared_arrival');
        const berth = obs.find((o) => o.factKey === 'location');
        return {
          vessel_call_id: r.id,
          port_authority_code: r.port,
          call_year: r.year,
          call_seq: String(r.seq).padStart(3, '0'),
          call_sign: r.callSign,
          vessel_name: r.vesselName,
          is_simulated: r.isSimulated,
          declared_arrival:
            arrival && arrival.valueTimestamp
              ? {
                  value: {
                    at: Instant.fromDb(arrival.valueTimestamp).toSeoulIso(),
                    request_kind: typeof arrival.payload?.['request_kind'] === 'string' ? (arrival.payload['request_kind'] as string) : null,
                    relative_to_received: arrival.payload?.['relative_to_received'] === 'FUTURE' ? ('FUTURE' as const) : ('PAST' as const),
                  },
                  event_id: arrival.eventId,
                  provenance: provenance.get(arrival.rawInputId)!,
                }
              : null,
          latest_berth: berth && (berth.valueCode || berth.valueText) ? { value: { code: berth.valueCode, name: berth.valueText }, event_id: berth.eventId, provenance: provenance.get(berth.rawInputId)! } : null,
          manifest_no: manifests.find((m) => m.ownerId === r.id)?.value ?? null,
          container_count: counts.get(r.id) ?? 0,
          registered_from: provenance.get(r.firstRawInputId)!,
        };
      });
  }

  private async containerViews(vesselCallId: string): Promise<ManifestContainerView[]> {
    const rows = await this.repo.containersOfVesselCall(vesselCallId);
    const iso = await this.repo.latestObservations('CONTAINER', rows.map((r) => r.id), ['identity.iso_size_type']);
    const msn = await this.repo.msnByBl(rows.map((r) => r.blId).filter((x): x is string => x !== null));
    const provenance = await this.provenanceMap(rows.map((r) => r.firstRawInputId));
    return rows.map((r) => ({
      container_id: r.id,
      container_no: r.containerNo,
      size_type: r.sizeType,
      iso_size_type: iso.find((o) => o.entityId === r.id)?.valueCode ?? null,
      bl_no: r.blNo,
      bl_type: (r.blType as ManifestContainerView['bl_type']) ?? null,
      msn: msn.find((m) => m.ownerId === r.blId)?.value.split('-').at(-1) ?? null,
      check_digit_valid: iso6346CheckDigitValid(r.containerNo),
      is_simulated: r.isSimulated,
      registered_from: provenance.get(r.firstRawInputId)!,
    }));
  }

  private async provenanceMap(rawInputIds: string[]): Promise<Map<string, Provenance>> {
    const rows = await this.repo.provenanceByRawInput([...new Set(rawInputIds)]);
    return new Map(
      rows.map((p) => [
        p.rawInputId,
        {
          source_type: 'PUBLIC_API' as const,
          provider: 'DATA_GO_KR' as const,
          dataset: p.dataset as PublicDataDataset,
          mode: p.mode as 'LIVE' | 'REPLAY',
          is_simulated: p.isSimulated,
          result_kind: p.isSimulated ? ('SCENARIO_RESULT' as const) : ('PUBLIC_DATA' as const),
          fetch_id: p.fetchId,
          raw_input_id: p.rawInputId,
          payload_hash: p.payloadHash,
          requested_at: Instant.fromDb(p.requestedAt).toSeoulIso(),
          received_at: Instant.fromDb(p.receivedAt!).toSeoulIso(),
        },
      ]),
    );
  }

  // ── 검사 · 기록 ──

  /** 조회를 일으키는 주체. 지금은 활성 HUMAN 만(개발 헤더 — T-089 기술 부채 ①). Agent(AI_AGENT)는 T-103 의 Tool 경로로 연다. */
  private async requireRequester(header: string | undefined): Promise<string> {
    const value = header?.trim();
    if (!value) throw new ValidationError('ACTOR_REQUIRED', 'The X-CERA-Actor-Id header is required to call a public API', [ACTOR_HEADER]);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new ValidationError('INVALID_ID', `${ACTOR_HEADER} must be a UUID`, [ACTOR_HEADER]);
    const found = await this.repo.findActor(value);
    if (!found || !found.isActive || found.actorType !== 'HUMAN') throw new BusinessRuleError('ACTOR_NOT_ALLOWED', 'Only an active human operator can trigger a public API call', 403);
    return value;
  }

  private requireAvailable(dataset: PublicDataDataset): void {
    if (this.env.CERA_PUBLIC_DATA_MODE === 'off') throw new BusinessRuleError('PUBLIC_DATA_DISABLED', 'Public data is off (CERA_PUBLIC_DATA_MODE=off)', 409);
    if (!this.transport.isAvailable(dataset)) {
      throw this.transport.mode === 'LIVE'
        ? new BusinessRuleError('PUBLIC_DATA_KEY_MISSING', 'DATA_GO_KR_SERVICE_KEY is not configured', 409)
        : new BusinessRuleError('PUBLIC_DATA_REPLAY_UNAVAILABLE', 'No replay fixtures for this dataset', 409);
    }
  }

  private auditFetch(tx: DbTransaction, actorId: string, fetchId: string, result: 'SUCCESS' | 'FAILURE', isSimulated: boolean) {
    return this.audit.record(tx, { actorId, action: AUDIT_ACTION.PUBLIC_DATA_FETCHED, targetType: 'PUBLIC_DATA_FETCH', targetId: fetchId, result, isSimulated });
  }

  private async recordFailure(spec: DatasetSpec, outcome: 'TRANSPORT_ERROR' | 'UPSTREAM_ERROR' | 'PARSE_ERROR', httpStatus: number | null, reason: string | null, fetchId: string) {
    const code =
      outcome === 'TRANSPORT_ERROR'
        ? SYSTEM_ERROR_CODE.PUBLIC_DATA_TRANSPORT_FAILED
        : outcome === 'UPSTREAM_ERROR'
          ? SYSTEM_ERROR_CODE.PUBLIC_DATA_UPSTREAM_ERROR
          : SYSTEM_ERROR_CODE.PUBLIC_DATA_PARSE_FAILED;
    await this.systemErrors.record({
      serviceName: 'cera-api',
      componentName: 'PublicDataService',
      operationName: spec.dataset,
      errorBoundary: 'INTEGRATION',
      errorCategory: SYSTEM_ERROR_CATEGORY.PUBLIC_DATA_INTEGRATION,
      errorCode: code,
      safeErrorMessage: `Public data ${spec.dataset} page failed: ${outcome}${reason ? ` (${reason})` : ''}`,
      targetSystem: 'DATA_GO_KR',
      httpStatus,
      retryable: outcome !== 'PARSE_ERROR',
      relatedEntity: { type: 'PUBLIC_DATA_FETCH', id: fetchId },
    });
  }
}
