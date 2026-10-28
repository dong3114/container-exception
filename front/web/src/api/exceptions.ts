import { apiRequest } from "./client";

/**
 * 운영 예외(T-132) — 결정론 탐지기가 찾은 문제. 응답 모양은 Backend `ExceptionDetectorService` 의 보기(OpenAPI 에는 응답 스키마가 없어 여기서 적는다).
 * 화면은 보여 주기만 한다 — 탐지 · 복구 실행 생성은 Backend 가 한다.
 */
export interface OperationalException {
  exception_id: string;
  exception_type: "WAREHOUSE_CAPACITY_SHORTAGE";
  scope: "LIVE" | "SCENARIO";
  is_simulated: boolean;
  facility_id: string;
  facility_name: string;
  window_day: string;
  status: "ACTIVE" | "RESOLVED";
  basis: "CONFIRMED" | "PROVISIONAL";
  scheduled_demand: number;
  capacity: number | null;
  shortage: number;
  recovery_run_id: string | null;
  detected_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ExceptionList {
  exceptions: OperationalException[];
  summary: { active: number; detected_today: number };
}

export function listExceptions(signal?: AbortSignal) {
  return apiRequest<ExceptionList>("/exceptions", { signal });
}

/** 관측 기록 = 왜 그렇게 판단했나(append-only). 처음 발견 · 근거 변화 · 해소 · 판단 불가 */
export interface ExceptionObservation {
  observation_id: string;
  kind: "DETECTED" | "CHANGED" | "RESOLVED" | "INDETERMINATE";
  as_of: string;
  observed_at: string;
  scheduled_demand: number;
  capacity: number | null;
  capacity_state: string;
  shortage: number;
}

export function getException(exceptionId: string, signal?: AbortSignal) {
  return apiRequest<OperationalException & { observations: ExceptionObservation[] }>(`/exceptions/${encodeURIComponent(exceptionId)}`, { signal });
}
