/**
 * Slice 1 시드의 고정 id(docs/24 4절 5 · 21절). 저장소에 고정된 **유효한 UUIDv7** 값이다 —
 * 두 번 넣어도 같은 행이 되고(ON CONFLICT DO NOTHING), 시험이 버전 7 · RFC 9562 variant 를 검사한다.
 * 실제 거래처·주소가 아니다. 모든 주소는 `*.invalid` 합성 값이고 채널은 MOCK 뿐이다.
 */
export const SEED_IDS = {
  scenario: '01a0fb92-9b63-7544-b3af-72add1339753',
  actorSystem: '01a0fb92-9b65-7540-b184-5cbee844d937',
  actorOperator: '01a0fb92-9b65-7540-b184-603086bde57f',
  // T-103: Agent Tool 의 행위자(AI_AGENT). 승인 · 발송 권한 없음 — DB 가 승인 결정을 HUMAN 으로 막는다
  actorAgent: '01a1a4c0-7e10-7a3b-9c21-5d0f00a0b103',
  counterpartyTrucking: '01a0fb92-9b65-7540-b184-67031c74f472',
  counterpartyOdcy: '01a0fb92-9b65-7540-b184-681786542a58',
  contactTrucking: '01a0fb92-9b65-7540-b184-6e6d97931077',
  contactOdcy: '01a0fb92-9b65-7540-b184-73fcad01818e',
  addressTrucking: '01a0fb92-9b65-7540-b184-75a5cb057e40',
  addressOdcy: '01a0fb92-9b66-7544-aeb3-1d484c43e86c',
  // T-087: 막힌 주소 2개(Contact Gate 시연 · 화면 확인). 아직 확인 전 창고 연락처 · 통신 일시 중지된 K운송 야간 배차
  counterpartyWarehouse: '01a11030-2d24-7584-bce2-7eb4662f8ff4',
  contactWarehouse: '01a11030-2d25-73fe-bbe8-d047c1ed2364',
  addressWarehouse: '01a11030-2d25-73fe-bbe8-d7841b6eb4af',
  contactTruckingNight: '01a11030-2d25-73fe-bbe8-d993b10a4a0d',
  addressTruckingNight: '01a11030-2d25-73fe-bbe8-dec99646ac08',
  facilityWarehouseA: '01a0fb92-9b66-7544-aeb3-216d6e00eef3',
  facilityWarehouseB: '01a0fb92-9b66-7544-aeb3-244fc160cb7f',
  facilityOdcyA: '01a0fb92-9b66-7544-aeb3-28ca5dc2afa8',
  facilityOdcyB: '01a0fb92-9b66-7544-aeb3-2d2df34c9ecf',
  truckPoolOwnFleet: '01a0fb92-9b66-7544-aeb3-33285ae8114d',
  truckPoolPartner: '01a0fb92-9b66-7544-aeb3-37f8cf3aa301',
  planningSnapshot: '01a0fb92-9b66-7544-aeb3-39a25c7ba86b',
  recoveryRunRoot: '01a0fb93-1c20-7d11-8a4e-0b6f5f2a9c01',
  capacityRawInput: '01a0fb93-1c20-7d11-8a4e-0b6f5f2a9c02',
  capacityEvent: '01a0fb93-1c20-7d11-8a4e-0b6f5f2a9c03',
} as const;

/** 데이터 팩 id → 시드 id. 팩은 읽기만 한다(docs/18 N.4). */
export const PACK_FACILITY_IDS: Record<string, string> = {
  WAREHOUSE_A: SEED_IDS.facilityWarehouseA,
  WAREHOUSE_B: SEED_IDS.facilityWarehouseB,
  ODCY_A: SEED_IDS.facilityOdcyA,
  ODCY_B: SEED_IDS.facilityOdcyB,
};

export const SEED_SOURCE_NAME = 'cera-seed';
export const DEFAULT_DATA_PACK = '../data/scenarios/busan-wh-capacity-01';
