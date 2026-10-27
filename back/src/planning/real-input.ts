import type { PlanningFact } from './engine/types.js';

/**
 * 실제(시뮬레이션 아닌) 계획 실행의 입력 준비도(T-115) — 순수 함수. 숫자를 만들지 않는다.
 *
 * 실제로 확보 가능한 것만 모은다: DB 등록부(시설 · 운영 시간 · 트럭 풀) · 공공데이터(컨테이너 번호 · 규격 — 적하목록) ·
 * Truth(사람 직접 입력 · 회신에서 확인/임시 사실: 수용량 · 차량 가용). 기업 내부 정보(컨테이너별 목적지 · 원래 배차 · LFD · 우선순위 ·
 * 확정 요율 · 자사 트럭 명부)는 지금 들어오는 길이 없다 — **지어내지 않고 `missing_inputs` 로 정확히 돌려준다.**
 * 시나리오 팩의 요율 · 값은 실제 실행에 쓰지 않는다(규칙 9 — 합성 값이 실제 결과처럼 보이면 안 된다).
 */
export type MissingCode =
  | 'CONTAINER_SCOPE_EMPTY'
  | 'CONTAINER_DESTINATION'
  | 'CONTAINER_ORIGINAL_PLAN'
  | 'CONTAINER_LFD'
  | 'CONTAINER_CARRIER'
  | 'RATE_TABLE'
  | 'OWN_TRUCK_ROSTER'
  | 'FACILITY_CAPACITY'
  | 'FACILITY_HOURS'
  | 'PARTNER_TRUCK_SLOTS';

export interface MissingInput {
  code: MissingCode;
  /** BLOCKING = 없으면 계산할 수 없다 · OPTIONAL = 없어도 계산은 되지만 그 자원은 쓰지 않는다 */
  severity: 'BLOCKING' | 'OPTIONAL';
  scope: 'RUN' | 'CONTAINER' | 'FACILITY' | 'TRUCK_POOL';
  count: number;
  /** 대상 예시(최대 5) — 컨테이너 번호 · 시설 이름 등 */
  examples: string[];
  /** 어디서 와야 하나(사람이 할 일) */
  provide_via: string;
}

export interface RealSources {
  planDay: string;
  facilities: { id: string; type: string; name: string; openTime: string | null; closeTime: string | null }[];
  pools: { id: string; name: string; ownership: string }[];
  /** 이 실행의 범위에 묶인 실제 컨테이너(공공데이터). 범위가 없으면 빈 배열 */
  containers: { id: string; containerNo: string; sizeType: string | null; carrier: string | null }[];
  scopedVesselCalls: number;
  truthFacts: PlanningFact[];
}

export interface Readiness {
  ready: boolean;
  source: 'REAL_SOURCES';
  plan_day: string;
  available: {
    facilities: number;
    facilities_with_capacity: number;
    partner_pools_with_slots: number;
    own_pools: number;
    vessel_calls_in_scope: number;
    containers_in_scope: number;
    truth_facts: number;
  };
  missing_inputs: MissingInput[];
  note: string;
}


export function assessRealPlanningInput(s: RealSources): Readiness {
  const missing: MissingInput[] = [];
  const add = (m: Omit<MissingInput, 'examples' | 'count'> & { subjects: string[] }) => {
    if (m.subjects.length === 0 && m.scope !== 'RUN') return;
    const { subjects, ...rest } = m;
    missing.push({ ...rest, count: m.scope === 'RUN' ? 1 : subjects.length, examples: subjects.slice(0, 5) });
  };
  const usable = (f: PlanningFact) => f.value !== null && f.fact_state !== 'REVOKED' && f.fact_state !== 'UNKNOWN' && f.freshness !== 'EXPIRED';
  const facts = s.truthFacts.filter(usable);
  const has = (subject: string, pred: (key: string) => boolean) => facts.some((f) => f.subject_id === subject && pred(f.fact_key));

  // 컨테이너(공공데이터) — 번호 · 규격은 있다. 목적지 · 원래 계획 · LFD 는 내부 정보
  if (s.containers.length === 0) {
    add({ code: 'CONTAINER_SCOPE_EMPTY', severity: 'BLOCKING', scope: 'RUN', subjects: [], provide_via: '공공데이터 적하목록을 조회하고 그 입항 건을 이 계획 실행의 범위에 묶는다(스냅숏 scope_ref.vessel_call_ids)' });
  } else {
    const nos = s.containers.map((c) => c.containerNo);
    add({ code: 'CONTAINER_DESTINATION', severity: 'BLOCKING', scope: 'CONTAINER', subjects: nos, provide_via: '화주 · 운송 계획(TMS) — 컨테이너별 목적지. 아직 연동 · 입력 경로 없음' });
    add({ code: 'CONTAINER_ORIGINAL_PLAN', severity: 'BLOCKING', scope: 'CONTAINER', subjects: nos, provide_via: '원래 배차 계획(날짜 · 출발 시각) — TMS/배차 담당. 아직 연동 · 입력 경로 없음' });
    add({ code: 'CONTAINER_LFD', severity: 'BLOCKING', scope: 'CONTAINER', subjects: nos, provide_via: '선사 D&D 무료기간 끝(LFD) — 선사 통지 · 계약. 아직 입력 경로 없음' });
    add({ code: 'CONTAINER_CARRIER', severity: 'BLOCKING', scope: 'CONTAINER', subjects: s.containers.filter((c) => !c.carrier).map((c) => c.containerNo), provide_via: 'B/L 의 선사(요율 · D&D 계산 기준) — 공공데이터 B/L 에 선사가 없으면 등록부 연결' });
  }

  // 요율 — 확정 Tariff 의 저장소가 없다
  add({ code: 'RATE_TABLE', severity: 'BLOCKING', scope: 'RUN', subjects: [], provide_via: '확정 요율(Demurrage · 보관 · 운송 · ODCY) — 계약 · 견적 등록 경로가 아직 없다. 시나리오 자리표시 요율은 실제 실행에 쓰지 않는다' });

  // 시설 — 운영 시간(DB) · 그날 수용량(Truth)
  const facs = s.facilities.filter((f) => f.type === 'WAREHOUSE' || f.type === 'ODCY');
  add({ code: 'FACILITY_HOURS', severity: 'BLOCKING', scope: 'FACILITY', subjects: facs.filter((f) => !f.openTime || !f.closeTime).filter((f) => f.type === 'WAREHOUSE').map((f) => f.name), provide_via: '등록부의 창고 입고 시간(default_open_time · default_close_time)' });
  const day = s.planDay;
  const capacityKey = (f: (typeof facs)[number]) => (k: string) => (f.type === 'WAREHOUSE' ? k === `capacity.day(${day})` : k.startsWith('capacity.') && k.endsWith(`day(${day})`));
  add({ code: 'FACILITY_CAPACITY', severity: 'BLOCKING', scope: 'FACILITY', subjects: facs.filter((f) => !has(f.id, capacityKey(f))).map((f) => f.name), provide_via: `그날(${day}) 수용량 — 운영자 직접 입력(POST /truth/facts/manual) 또는 Agent 문의 회신` });

  // 트럭 — 자사 명부는 없다(Truth 가용 사실이 있으면 그것으로), 협력은 회신 · 직접 입력
  const own = s.pools.filter((p) => p.ownership === 'OWN');
  const partners = s.pools.filter((p) => p.ownership === 'PARTNER');
  add({ code: 'OWN_TRUCK_ROSTER', severity: 'BLOCKING', scope: 'TRUCK_POOL', subjects: own.filter((p) => !has(p.id, (k) => k.startsWith(`available.slot(${day}`))).map((p) => p.name), provide_via: `자사 트럭 명부 · 그날 가용 시간창 — 운영자 직접 입력(TRUCK_SLOT, ${day}) 또는 배차 시스템 연동` });
  const partnerWithSlots = partners.filter((p) => has(p.id, (k) => k.startsWith(`available.slot(${day}`)));
  add({ code: 'PARTNER_TRUCK_SLOTS', severity: 'OPTIONAL', scope: 'TRUCK_POOL', subjects: partners.filter((p) => !partnerWithSlots.includes(p)).map((p) => p.name), provide_via: '협력 운송사 가용 차량 — Agent 문의 회신 또는 직접 입력(없으면 그 풀은 쓰지 않는다)' });

  const blocking = missing.filter((m) => m.severity === 'BLOCKING');
  return {
    ready: blocking.length === 0,
    source: 'REAL_SOURCES',
    plan_day: day,
    available: {
      facilities: facs.length,
      facilities_with_capacity: facs.filter((f) => has(f.id, capacityKey(f))).length,
      partner_pools_with_slots: partnerWithSlots.length,
      own_pools: own.length,
      vessel_calls_in_scope: s.scopedVesselCalls,
      containers_in_scope: s.containers.length,
      truth_facts: facts.length,
    },
    missing_inputs: missing,
    note: blocking.length === 0
      ? 'All blocking inputs are present.'
      : `Not computed: ${blocking.map((m) => m.code).join(', ')}. Values are never invented — provide them from the listed sources.`,
  };
}

export const missingSummary = (r: Readiness): string => r.missing_inputs.filter((m) => m.severity === 'BLOCKING').map((m) => (m.scope === 'RUN' ? m.code : `${m.code}(${m.count})`)).join(', ');
