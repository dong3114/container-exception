import type { Authority } from './reconcile-rules.js';

/**
 * 공공데이터의 사실 영역별 권한(T-136 · Public Observation).
 *
 * 공공데이터는 "정답"이 아니라 **외부 공개 시스템에서 관측된 것(PUBLIC OBSERVATION)** 이다. 출처마다 담당하는 사실 영역이 다르다 —
 * 그래서 출처 하나에 전역 권한을 주지 않고 **(출처 · 주체 종류 · 사실 키)** 로 정한다(docs/05 3.2 · truth-policy 의 계열별 권한과 같은 철학).
 *
 * | 사실(주체 · 키)                         | 공공데이터 권한 | 이유                                                                      |
 * | VESSEL_CALL · declared_arrival          | A              | 해양수산부 Port-MIS 입항 신고(DS-03) — 신고된 입항 일시의 공식 기록           |
 * | VESSEL_CALL · location                  | 없음(관측만)    | 계류 시설 코드 · 이름 — 숫자 사실이 아니라 Truth 판정에 쓰지 않는다           |
 * | CONTAINER · identity.*                  | 없음(관측만)    | 적하 목록(DS-02) 식별 정보 — 운영 입력 검증(CONFLICTS_WITH_PUBLIC_DATA)에 쓴다 |
 * | FACILITY · capacity.*                   | 없음            | 창고 · ODCY 내부 수용량은 공공 API 에 없다 — 공공데이터가 판단하지 않는다    |
 * | TRUCK_POOL · available.slot(*)          | 없음            | 협력 운송사 잔여 트럭은 공공 API 에 없다                                    |
 * | 요율 · 승인 상태                         | 없음            | 계약 · 내부 결정 — 공공데이터의 영역이 아니다                                 |
 *
 * 권한이 "없음"이면 그 사실에 대해 공공 사건의 강도는 0 이다(truth-policy `baseStrength` — NONE). A 여도 PUBLIC_API 강도는 2(OBSERVED)
 * 까지다 — "공개 시스템에서 관측됨"이지 사람이 확인한 CONFIRMED 가 아니다.
 *
 * 숫자가 아닌 값: Truth 판정은 숫자 값을 비교한다. 시각 사실(입항 일시)은 epoch 밀리초로 바꿔 같은 규칙(같은 값 · 다른 값 · 최신 · 강도)을
 * 쓴다(`TIMESTAMP_FACT_KEYS`). 코드 · 글 사실은 Truth 판정에 들어가지 않는다(관측 기록으로만 남는다).
 */
export interface PublicDomain {
  entityType: 'VESSEL_CALL' | 'CONTAINER';
  factKey: RegExp;
  authority: Authority;
  valueKind: 'TIMESTAMP';
  /** 같은 사실을 말하는 비공공 주장(업체 회신 · 사람이 전달한 업체 진술)과 비교할 수 있다(Cross-check) */
  comparable: true;
  family: string;
}

export const PUBLIC_DOMAINS: readonly PublicDomain[] = [{ entityType: 'VESSEL_CALL', factKey: /^declared_arrival$/, authority: 'A', valueKind: 'TIMESTAMP', comparable: true, family: 'vessel_arrival' }];

/** 이 공공 사실에 대한 공공데이터의 권한 — 영역 밖이면 null(=권한 없음, 강도 0) */
export function publicAuthorityFor(entityType: string, factKey: string): Authority | null {
  return PUBLIC_DOMAINS.find((d) => d.entityType === entityType && d.factKey.test(factKey))?.authority ?? null;
}

/** 공공데이터로 확인할 수 있는 사실인가(Gap · Cross-check 의 판정 — "창고 A 가 오늘 8대 받을 수 있나"는 아니다, "선박이 입항 신고됐나"는 그렇다) */
export function isPublicVerifiable(entityType: string, factKey: string): boolean {
  return publicAuthorityFor(entityType, factKey) !== null;
}

/** Truth 판정에서 시각 값을 숫자(epoch ms)로 비교하는 사실 키 */
export const TIMESTAMP_FACT_KEYS: readonly RegExp[] = PUBLIC_DOMAINS.filter((d) => d.valueKind === 'TIMESTAMP').map((d) => d.factKey);
export const isTimestampFact = (factKey: string | null | undefined) => Boolean(factKey && TIMESTAMP_FACT_KEYS.some((r) => r.test(factKey)));
