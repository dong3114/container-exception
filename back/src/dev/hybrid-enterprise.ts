/**
 * T-144 Hybrid Live — 가상 물류기업 데이터 팩을 **실제 CERA API 로만** 넣는 개발 도구(Adapter Input). 업무 로직이 아니다.
 *
 *   npx tsx src/dev/hybrid-enterprise.ts --pack ../data/enterprises/cera-logistics --vessel-call <vessel_call_id> [--out <json>]
 *
 * - 기업 이름 · 시설 · 운송사 · 요율 · 계획은 팩(JSON · CSV)에만 있다. 이 파일은 팩의 키를 해석할 뿐 특정 기업을 모른다
 * - 실제인 것: 입항 신고(Port-MIS)와 그 적하목록 컨테이너 번호 — 실행 때 API 로 읽어 고르고, 번호를 출력 · 저장소에 남기지 않는다(개수만)
 * - 연락처 주소는 팩이 가리키는 환경변수에서만 읽는다(저장소에 없음). 로그인 비밀번호도 환경변수(CERA_SEED_ADMIN_PASSWORD · CERA_SEED_OPERATOR_PASSWORD)
 * - 깨끗한 DB 를 전제로 한다: 같은 이름의 거래처 · 시설은 다시 쓰고, 같은 이름의 트럭 풀이 있으면 멈춘다
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Pack {
  enterprise: { key: string; name: string };
  counterparties: { key: string; role: string; name: string }[];
  contacts: { counterparty: string; person_name: string; team?: string; channel: 'GMAIL' | 'MOCK'; address_env: string }[];
  facilities: { key: string; type: 'WAREHOUSE' | 'ODCY' | 'TERMINAL'; name: string; area?: string; operator?: string }[];
  truck_pools: { key: string; name: string; ownership: 'OWN' | 'PARTNER'; owner?: string }[];
  profiles_csv: string;
  rates_csv: string;
  terminal_code: string;
  carrier_code: string;
  plan: { groups: { destination: string; count: number; sizes: Record<string, number>; depart_hours: number[]; lfd_offsets: number[]; high_priority: number }[] };
  initial_facts: { kind: 'FACILITY_CAPACITY' | 'TRUCK_SLOT'; target: string; value: number; day_offset?: number; window_from?: string; window_to?: string; size_type?: string; source_note: string }[];
}

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const BASE = process.env.CERA_HYBRID_API ?? 'http://127.0.0.1:3100';
const ORIGIN = 'http://localhost:3000';

class Session {
  private cookie = '';
  constructor(private readonly who: string) {}
  async login(password: string | undefined): Promise<void> {
    if (!password) throw new Error(`password for ${this.who} is not set (CERA_SEED_*_PASSWORD)`);
    const res = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login_id: this.who, password }) });
    if (res.status !== 200) throw new Error(`login ${this.who} failed: ${res.status}`);
    this.cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  }
  async call<T>(method: string, path: string, body?: unknown, ok: number[] = [200, 201]): Promise<{ status: number; body: T }> {
    const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie, Origin: ORIGIN }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const parsed = (text ? JSON.parse(text) : null) as T;
    if (!ok.includes(res.status)) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
    return { status: res.status, body: parsed };
  }
}

const seoulToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function main(): Promise<void> {
  const packDir = arg('--pack');
  const vesselCallId = arg('--vessel-call');
  if (!packDir || !vesselCallId) throw new Error('usage: --pack <dir> --vessel-call <vessel_call_id> [--out <file>] [--plan-day YYYY-MM-DD]');
  const pack = JSON.parse(readFileSync(join(packDir, 'enterprise.json'), 'utf8')) as Pack;
  const planDay = arg('--plan-day') ?? seoulToday();
  const admin = new Session('admin');
  const op = new Session('operator');
  await admin.login(process.env.CERA_SEED_ADMIN_PASSWORD);
  await op.login(process.env.CERA_SEED_OPERATOR_PASSWORD);
  const ids: Record<string, string> = {};

  // 1. 거래처 · 연락처(주소 = 환경변수) · 관리자 승인
  // 깨끗한 DB 전제: 등록부 목록은 연락처가 있는 거래처만 보여 주므로, 거래처를 만들고 곧바로 그 연락처를 붙인다
  type Party = { counterparty_id: string; contacts: { addresses: { address_id: string; normalized_address: string }[] }[] };
  for (const c of pack.counterparties) {
    ids[c.key] = (await admin.call<Party>('POST', '/registry/counterparties', { display_name: c.name, source_role: c.role })).body.counterparty_id;
    for (const k of pack.contacts.filter((x) => x.counterparty === c.key)) {
      const address = process.env[k.address_env];
      if (!address) {
        console.log(`contact ${k.counterparty}: ${k.address_env} not set — skipped`);
        continue;
      }
      const party = (await admin.call<Party>('POST', `/registry/counterparties/${ids[c.key]}/contacts`, { person_name: k.person_name, ...(k.team ? { team: k.team } : {}), channel_type: k.channel, address })).body;
      const row = party.contacts.flatMap((x) => x.addresses).find((a) => a.normalized_address === address.trim().toLowerCase());
      if (!row) throw new Error(`contact ${k.counterparty}: address not found in the registration answer`);
      ids[`address:${k.counterparty}`] = row.address_id;
      await admin.call('POST', `/registry/addresses/${row.address_id}/approve`);
    }
  }

  // 2. 시설 · 운영 거래처 · 트럭 풀
  const facilities = (await admin.call<{ facilities: { facility_id: string; facility_type: string; facility_name: string }[] }>('GET', '/registry/facilities')).body.facilities ?? [];
  for (const f of pack.facilities) {
    const found = facilities.find((x) => x.facility_type === f.type && x.facility_name.trim().toLowerCase() === f.name.trim().toLowerCase());
    ids[f.key] = found
      ? found.facility_id
      : (await admin.call<{ facility_id: string }>('POST', '/registry/facilities', { facility_type: f.type, facility_name: f.name, ...(f.area ? { area: f.area } : {}), ...(f.operator ? { operator_counterparty_id: ids[f.operator] } : {}) })).body.facility_id;
  }
  for (const p of pack.truck_pools) {
    ids[p.key] = (await admin.call<{ truck_pool_id: string }>('POST', '/registry/truck-pools', { pool_name: p.name, ownership: p.ownership, ...(p.owner ? { owner_counterparty_id: ids[p.owner] } : {}) })).body.truck_pool_id;
  }

  // 3. 시설 계획 정보 · 계약 요율(팩의 CSV 그대로)
  for (const [path, file] of [['/planning/inputs/facility-profiles', pack.profiles_csv], ['/planning/inputs/rates', pack.rates_csv]] as const) {
    const r = await op.call<{ stored: boolean; changes: unknown }>('POST', path, { command_id: randomUUID(), csv: readFileSync(join(packDir, file), 'utf8') });
    console.log(`${path}: stored=${r.body.stored} changes=${JSON.stringify(r.body.changes)}`);
  }

  // 4. 운영 기준 계획 — 실제 입항 건의 적하목록 컨테이너(번호만 공공데이터)에 팩의 합성 운영 계획을 붙인다
  const call = (await op.call<{ vessel_call: { call_sign: string; vessel_name: string | null }; containers: { container_no: string; size_type: string | null; check_digit_valid: boolean }[] }>('GET', `/public-data/vessel-calls/${vesselCallId}`)).body;
  const pool = call.containers.filter((c) => c.check_digit_valid && c.size_type).sort((a, b) => a.container_no.localeCompare(b.container_no));
  const used = new Set<string>();
  const rows: string[] = ['container_no,size_type,carrier,pickup_ready,terminal,destination,planned_day,priority,lfd,planned_depart_hour,alternate_destination_allowed'];
  for (const g of pack.plan.groups) {
    const dest = pack.facilities.find((f) => f.key === g.destination)!;
    const picked: { no: string; size: string }[] = [];
    for (const [size, n] of Object.entries(g.sizes)) {
      const take = pool.filter((c) => c.size_type === size && !used.has(c.container_no)).slice(0, n);
      if (take.length < n) throw new Error(`vessel call has only ${take.length} ${size} containers (need ${n})`);
      for (const c of take) {
        used.add(c.container_no);
        picked.push({ no: c.container_no, size });
      }
    }
    picked.forEach((c, i) => {
      rows.push([c.no, c.size, pack.carrier_code, 'true', pack.terminal_code, dest.name, planDay, i < g.high_priority ? 'HIGH' : 'NORMAL', addDays(planDay, g.lfd_offsets[i] ?? 3), String(g.depart_hours[i] ?? 17), 'true'].join(','));
    });
  }
  const baseline = await op.call<{ stored: boolean; changes: unknown }>('POST', '/planning/inputs/containers', { command_id: randomUUID(), csv: rows.join('\n') });
  console.log(`baseline containers: ${rows.length - 1} (vessel ${call.vessel_call.call_sign}) stored=${baseline.body.stored} changes=${JSON.stringify(baseline.body.changes)}`);

  // 5. 처음 사실(운영팀 일일 계획 — 사람 직접 입력)
  for (const f of pack.initial_facts) {
    await op.call('POST', '/truth/facts/manual', {
      command_id: randomUUID(),
      intent: 'OPERATOR_DIRECT_ENTRY',
      kind: f.kind,
      target_id: ids[f.target],
      date: addDays(planDay, f.day_offset ?? 0),
      value: f.value,
      source_note: f.source_note,
      ...(f.window_from ? { window_from: f.window_from, window_to: f.window_to } : {}),
      ...(f.size_type ? { size_type: f.size_type } : {}),
    });
  }
  console.log(`initial facts: ${pack.initial_facts.length} · plan day ${planDay} · enterprise ${pack.enterprise.key}`);
  const out = arg('--out');
  if (out) writeFileSync(out, JSON.stringify({ enterprise: pack.enterprise.key, plan_day: planDay, vessel_call_id: vesselCallId, ids }, null, 2));
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
