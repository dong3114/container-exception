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
