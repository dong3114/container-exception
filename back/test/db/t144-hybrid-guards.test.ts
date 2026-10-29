import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app/create-api.js';
import { itemsRelyingOnDisputedFacts } from '../../src/planning/recovery-plan.service.js';
import { iso6346CheckDigitValid } from '../../src/public-data/normalization/container-manifest.js';
import { actor, hashOf } from './fixtures.js';
import { appPool, testEnv } from './support.js';

/**
 * T-144 Hybrid Live 에서 드러난 차단 요인의 회귀 시험:
 *  1. 운영 기준 계획(실행 밖)의 컨테이너도 번호(유일 식별자)로 공공 적하목록 컨테이너와 이어진다 — 탐지기가 만든 실행이 입항 신고를 안다
 *  2. 사람이 판단하지 않은 공공 근거 충돌(CONFLICTED)에 기댄 계획 항목을 찾는다 — 승인 차단의 근거(ADR-042 결정 3)
 */
const contentDir = mkdtempSync(join(tmpdir(), 'cera-t144-content-'));
const ACTOR = 'X-CERA-Actor-Id';
let api: INestApplication;
let http: ReturnType<typeof request>;
let db: pg.Pool;
let humanId: string;

beforeAll(async () => {
  api = await createApiApp(testEnv({ CERA_CONTENT_DIR: contentDir }));
  await api.init();
  http = request(api.getHttpServer());
  db = appPool();
  humanId = await actor(db, 'HUMAN');
});

afterAll(async () => {
  await api.close();
  await db.end();
  rmSync(contentDir, { recursive: true, force: true });
});

/** 체크 숫자가 맞는 시험용 ISO 6346 번호 */
const containerNo = (owner: string, seed: number) => {
  const body = `${owner}${String(seed % 1_000_000).padStart(6, '0')}`;
  for (let d = 0; d <= 9; d++) if (iso6346CheckDigitValid(`${body}${d}`)) return `${body}${d}`;
  return containerNo(owner, seed + 1);
};

describe('T-144 1 — operational baseline containers link to public manifest containers by number', () => {
  it('a baseline row whose number is a registered (real) manifest container carries its container id; an unknown number stays unlinked', async () => {
    const facilityId = v7();
    const facilityName = `T144 창고 ${facilityId.slice(-6)}`;
    await db.query("INSERT INTO cera.facility (facility_id, facility_type, facility_name) VALUES ($1, 'WAREHOUSE', $2)", [facilityId, facilityName]);
    const rawId = v7();
    await db.query(
      `INSERT INTO cera.raw_input (raw_input_id, source_type, source_name, payload_ref, payload_hash, source_record_key, received_at, is_simulated) VALUES ($1, 'PUBLIC_API', 'DATA_GO_KR', $2, $3, $4, now(), false)`,
      [rawId, `cref:v1:RAW_INPUT_PAYLOAD:${v7()}`, hashOf(`t144-${rawId}`), rawId],
    );
    const vesselCallId = v7();
    await db.query("INSERT INTO cera.vessel_call (vessel_call_id, port_authority_code, call_year, call_seq, call_sign, vessel_name, first_raw_input_id, is_simulated, registered_at) VALUES ($1, '020', 2026, 997, 'T144VC', 'T144 VESSEL', $2, false, now())", [vesselCallId, rawId]);
    const linkedNo = containerNo('TFOU', Date.now());
    const unknownNo = containerNo('TGHU', Date.now() + 7);
    const containerId = v7();
    await db.query("INSERT INTO cera.container (container_id, container_no, size_type, vessel_call_id, first_raw_input_id, is_simulated, registered_at) VALUES ($1, $2, '40HC', $3, $4, false, now())", [containerId, linkedNo, vesselCallId, rawId]);

    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const csv = (status: string) =>
      [
        'container_no,size_type,carrier,pickup_ready,terminal,destination,planned_day,lfd,planned_depart_hour,status',
        `${linkedNo},40HC,LINE_T,true,T144_TML,${facilityName},${today},${today},16,${status}`,
        `${unknownNo},40HC,LINE_T,true,T144_TML,${facilityName},${today},${today},17,${status}`,
      ].join('\n');
    const stored = await http.post('/planning/inputs/containers').set(ACTOR, humanId).send({ command_id: v7(), csv: csv('ACTIVE') });
    expect(stored.status, JSON.stringify(stored.body.details ?? stored.body).slice(0, 600)).toBe(200);
    const records = (await http.get('/planning/inputs/containers').expect(200)).body.records as { container_no: string; container_id: string | null }[];
    expect(records.find((r) => r.container_no === linkedNo)?.container_id).toBe(containerId);
    expect(records.find((r) => r.container_no === unknownNo)?.container_id).toBeNull();
    // 다른 시험의 운영 기준 계획을 건드리지 않게 거둬들인다
    await http.post('/planning/inputs/containers').set(ACTOR, humanId).send({ command_id: v7(), csv: csv('WITHDRAWN') }).expect(200);
  });
});

describe('T-144 2 — plan items relying on an unresolved public-evidence conflict', () => {
  it('only items whose cost line carries the CONFLICTED warning count (approval is blocked while any exists)', () => {
    const items = [
      { id: 'a', detail: { warning_refs: [{ fact_ref: 'event:x', reason: 'CONFLICTED' }] } },
      { id: 'b', detail: { warning_refs: [{ fact_ref: 'event:y', reason: 'PROVISIONAL' }] } },
      { id: 'c', detail: {} },
      { id: 'd', detail: null },
    ];
    expect(itemsRelyingOnDisputedFacts(items).map((i) => i.id)).toEqual(['a']);
    expect(itemsRelyingOnDisputedFacts(items.slice(1))).toEqual([]);
  });
});
