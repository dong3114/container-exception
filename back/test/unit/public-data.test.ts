import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DS02_CONTAINER_MANIFEST, DS03_VESSEL_CALL, requestRef, vesselCallParams } from '../../src/public-data/adapters/datasets.js';
import { DataGoKrHttpTransport } from '../../src/public-data/adapters/transport.js';
import { ceraSizeType, iso6346CheckDigitValid, normalizeManifestLine } from '../../src/public-data/normalization/container-manifest.js';
import { parsePublicTime } from '../../src/public-data/normalization/public-time.js';
import { normalizeVesselCall } from '../../src/public-data/normalization/vessel-call.js';
import { classifyFetch } from '../../src/public-data/parsing/outcome.js';
import { parseEnvelope } from '../../src/public-data/parsing/xml-envelope.js';
import { FakeClock } from '../../src/shared/time/clock.js';
import { Instant } from '../../src/shared/time/instant.js';

const FIXTURES = '../data/fixtures/public-data';
const bytes = (path: string) => new Uint8Array(readFileSync(`${FIXTURES}/${path}`));
const utf8 = (s: string) => new TextEncoder().encode(s);
const ok = (b: Uint8Array, httpStatus = 200) => ({
  ok: true as const,
  requestedAt: Instant.parseIso('2026-10-22T10:00:00+09:00'),
  receivedAt: Instant.parseIso('2026-10-22T10:00:01+09:00'),
  httpStatus,
  bytes: b,
  mediaType: 'application/xml',
});
const RECEIVED = Instant.parseIso('2026-10-22T10:00:01+09:00');

describe('envelope and outcome', () => {
  it('reads a normal DS-03 page as strings (keeps the zero-padded call sequence) with nested details', () => {
    const env = parseEnvelope(bytes('ds03/busan-20261020-20261021-p1.xml'));
    expect(env.kind).toBe('NORMAL');
    if (env.kind !== 'NORMAL') return;
    expect(env.totalCount).toBe(5);
    expect(env.items).toHaveLength(5);
    expect(env.items[0]?.['etryptCo']).toBe('041');
  });

  it('classifies NO_DATA, gateway errors (even on HTTP 200), non-XML bodies and unknown result codes', () => {
    expect(classifyFetch(ok(bytes('ds02/D7CR02-2026-017-p1.xml'))).outcome).toBe('NO_DATA'); // 00 + 0건(실제 모양)
    // 03 은 관측되지 않아 데이터 없음으로 보지 않는다 — 알 수 없는 결과 코드로 남긴다
    expect(classifyFetch(ok(utf8('<response><header><resultCode>03</resultCode><resultMsg>NODATA_ERROR</resultMsg></header><body><items/><totalCount>0</totalCount></body></response>')))).toMatchObject({ outcome: 'UPSTREAM_ERROR', resultCode: '03' });
    const gw = classifyFetch(
      ok(utf8('<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>')),
    );
    expect(gw).toMatchObject({ outcome: 'UPSTREAM_ERROR', resultCode: 'GW_30' });
    expect(classifyFetch(ok(utf8('Unauthorized'), 401)).outcome).toBe('UPSTREAM_ERROR');
    expect(classifyFetch(ok(utf8('Unexpected text'), 200)).outcome).toBe('PARSE_ERROR');
    expect(classifyFetch(ok(utf8('<response><header><resultCode>22</resultCode><resultMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</resultMsg></header></response>')))).toMatchObject({
      outcome: 'UPSTREAM_ERROR',
      resultCode: '22',
    });
  });
});

describe('DS-03 vessel call normalization', () => {
  const env = parseEnvelope(bytes('ds03/busan-20261020-20261021-p1.xml'));
  const items = env.kind === 'NORMAL' ? env.items : [];

  it('declared arrival time (not a berthing milestone) with request kind and past/future; berth and import manifest number from the arrival detail', () => {
    const first = normalizeVesselCall(items[0]!, 0, RECEIVED).value!;
    expect(first).toMatchObject({ portAuthorityCode: '020', callYear: 2026, callSeq: '041', callSign: 'D7CR01', importManifestNo: '26SYNT0041I' });
    expect(first.arrival).toMatchObject({ relativeToReceived: 'PAST', tzAssumed: false, requestKind: '최종' });
    expect(first.arrival?.at.toSeoulIso()).toBe('2026-10-20T06:30:00.000+09:00');
    expect(first.berth).toEqual({ code: 'SYA_02', rawCode: 'SYA_02', name: '합성 터미널 A 2선석', detailIndex: 0 });
    // 실제 응답에서 본 모양(2026-10-22 live): 신청구분 최초 · `*` 비표준 시설 코드 — 코드를 지어내지 않고 이름만
    expect(normalizeVesselCall(items[1]!, 1, RECEIVED).value?.arrival?.requestKind).toBe('최초');
    const bulk = normalizeVesselCall(items[3]!, 3, RECEIVED);
    expect(bulk.value?.berth).toEqual({ code: null, rawCode: '*SC_03', name: '합성 묘박지 3', detailIndex: 0 });
    expect(bulk.issues).toEqual([{ item_index: 3, code: 'BERTH_CODE_NONSTANDARD' }]);
    expect(first.departureAt?.toSeoulIso()).toBe('2026-10-21T22:00:00.000+09:00');
    expect(normalizeVesselCall(items[2]!, 2, RECEIVED).value?.arrival?.relativeToReceived).toBe('FUTURE');
  });

  it('assumes Asia/Seoul for an offset-less time and flags it; rejects rows without the call key', () => {
    expect(normalizeVesselCall(items[3]!, 3, RECEIVED).value?.arrival).toMatchObject({ tzAssumed: true, relativeToReceived: 'PAST' });
    expect(normalizeVesselCall(items[4]!, 4, RECEIVED)).toEqual({ value: null, issues: [{ item_index: 4, code: 'VESSEL_CALL_KEY_INVALID' }] });
  });

  it('parsePublicTime: ISO with offset, local Seoul form, nothing else', () => {
    expect(parsePublicTime('2018-01-05 23:00:00')).toMatchObject({ tzAssumed: true });
    expect(parsePublicTime('2018-01-05 23:00:00')?.instant.toIsoUtc()).toBe('2018-01-05T14:00:00.000Z');
    expect(parsePublicTime('20180105')).toBeNull();
    expect(parsePublicTime(null)).toBeNull();
  });
});

describe('DS-02 manifest normalization', () => {
  const p1 = parseEnvelope(bytes('ds02/D7CR01-2026-041-p1.xml'));
  const p2 = parseEnvelope(bytes('ds02/D7CR01-2026-041-p2.xml'));
  const items = [...(p1.kind === 'NORMAL' ? p1.items : []), ...(p2.kind === 'NORMAL' ? p2.items : [])];

  it('keeps import lines, maps ISO size types, flags check digit mismatches and skips bad lines', () => {
    const results = items.map((item, i) => normalizeManifestLine(item, i));
    const lines = results.map((r) => r.value).filter((v) => v !== null);
    const codes = results.flatMap((r) => r.issues.map((x) => x.code));
    expect(items).toHaveLength(53);
    expect(lines).toHaveLength(51);
    expect(codes.filter((c) => c === 'CONTAINER_CHECK_DIGIT_MISMATCH')).toHaveLength(1);
    expect(codes).toContain('NOT_IMPORT_LINE');
    expect(codes).toContain('CONTAINER_NO_INVALID');
    expect(lines[0]).toMatchObject({ blNo: 'SYNBL26000001', msn: '0001', isoSizeType: '22G1', sizeType: '20DRY', callSeq: '041', checkDigitValid: true });
  });

  it('ISO 6346 check digit and size-type mapping', () => {
    expect(iso6346CheckDigitValid('CSQU3054383')).toBe(true); // ISO 6346 표준 예시
    expect(iso6346CheckDigitValid('CSQU3054384')).toBe(false);
    expect(['22G1', '45G1', '42G1', '45R1', '22R1', '22GP', 'L5G1', '22U1'].map(ceraSizeType)).toEqual(['20DRY', '40HC', '40DRY', '40RF', '20RF', '20DRY', 'OTHER', 'OTHER']);
    expect(ceraSizeType(null)).toBeNull();
  });
});

describe('request safety', () => {
  it('safe params and request_ref never carry the service key', () => {
    const params = vesselCallParams({ portAuthorityCode: '020', sde: '20261020', ede: '20261021', callSign: null, pageNo: 1 });
    expect(Object.keys(params)).not.toContain('serviceKey');
    expect(requestRef(DS03_VESSEL_CALL, params)).toBe('1192000/VsslEtrynd5/Info5?deGb=I&ede=20261021&numOfRows=50&pageNo=1&prtAgCd=020&sde=20261020');
  });

  it('the live transport sends the key once (URL encoded) and leaves it out of results and errors', async () => {
    const key = 'abc+def/ghi==SECRET';
    const seen: string[] = [];
    const clock = new FakeClock('2026-10-22T10:00:00+09:00');
    const okFetch = (async (url: string) => {
      seen.push(url);
      return new Response('<response/>', { status: 200, headers: { 'content-type': 'text/xml;charset=UTF-8' } });
    }) as unknown as typeof fetch;
    const live = new DataGoKrHttpTransport(key, 1000, clock, okFetch);
    const result = await live.get(DS02_CONTAINER_MANIFEST, { prtAgCd: '020', pageNo: '1' });
    expect(seen[0]).toContain(`serviceKey=${encodeURIComponent(key).replaceAll('%20', '+')}`);
    expect(seen[0]).toMatch(/^https:\/\/apis\.data\.go\.kr\/1192000\/CargFrghtContnOut\/ContnInfo\?/);
    expect(JSON.stringify({ ...result, bytes: undefined })).not.toContain('SECRET');
    expect(result).toMatchObject({ ok: true, mediaType: 'text/xml' });

    const failing = new DataGoKrHttpTransport(key, 1000, clock, (async () => {
      throw new TypeError(`fetch failed for https://x/?serviceKey=${key}`);
    }) as unknown as typeof fetch);
    const failed = await failing.get(DS02_CONTAINER_MANIFEST, {});
    expect(failed).toMatchObject({ ok: false, errorCode: 'NETWORK' });
    expect(JSON.stringify(failed)).not.toContain('SECRET');
    await expect(live.get(DS02_CONTAINER_MANIFEST, { serviceKey: 'x' })).rejects.toThrow(/must not carry/);
  });
});
