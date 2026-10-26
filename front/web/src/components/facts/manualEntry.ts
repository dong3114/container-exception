import type { FacilityList } from "@/api/drafts";
import type { FactCoordinate, ManualFactKind, ManualFactRequest } from "@/api/truth";

/**
 * Operator direct entry (T-111) — pure helpers for the small form in FactsPanel. The backend decides the fact key,
 * the guarantee level (CONFIRMED human input) and whether the target is allowed; the screen only checks the obvious
 * shape so the operator sees a problem before sending.
 */
export interface ManualForm {
  kind: ManualFactKind;
  targetId: string;
  date: string;
  windowFrom: string;
  windowTo: string;
  sizeType: string;
  value: string;
  sourceNote: string;
  /** `datetime-local` value (Asia/Seoul wall time) or empty */
  observedAt: string;
}

export interface ManualTarget {
  id: string;
  label: string;
  isOdcy: boolean;
}

const FACILITY_KIND: Record<string, string> = { WAREHOUSE: "창고", ODCY: "ODCY" };

/**
 * Truck pools have no list endpoint, so they come from the facts already judged for this run (entity_type TRUCK_POOL).
 * Facilities come from the registry list — only warehouses and ODCYs take a capacity entry.
 */
export function manualTargets(kind: ManualFactKind, facts: FactCoordinate[], facilities: FacilityList["facilities"]): ManualTarget[] {
  if (kind === "TRUCK_SLOT") {
    const seen = new Map<string, ManualTarget>();
    for (const f of facts) {
      if (f.entity_type === "TRUCK_POOL" && !seen.has(f.entity_id)) seen.set(f.entity_id, { id: f.entity_id, label: f.entity_name ?? f.entity_id.slice(0, 8), isOdcy: false });
    }
    return [...seen.values()];
  }
  return facilities
    .filter((f) => f.facility_type === "WAREHOUSE" || f.facility_type === "ODCY")
    .map((f) => ({ id: f.facility_id, label: `${f.facility_name} (${FACILITY_KIND[f.facility_type]})`, isOdcy: f.facility_type === "ODCY" }));
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Form → request body, or the first problem in plain Korean. A simulated run needs its scenario id (the backend
 * marks the entry as simulated by it); when the client does not know it, entry is refused rather than guessed.
 */
export function buildManualFact(
  form: ManualForm,
  run: { isSimulated: boolean; scenarioId: string | null },
): { body: Omit<ManualFactRequest, "command_id" | "intent"> } | { problem: string } {
  if (!form.targetId) return { problem: "대상을 고르세요" };
  if (!DATE.test(form.date)) return { problem: "날짜를 고르세요" };
  const value = Number(form.value);
  if (form.value.trim() === "" || !Number.isInteger(value) || value < 0 || value > 999999) return { problem: "값은 0 이상 999999 이하의 정수입니다" };
  const note = form.sourceNote.trim();
  if (!note) return { problem: "어디서 확인했는지(전화 · 방문 등) 적어 주세요" };
  if (note.length > 200) return { problem: "확인 출처는 200자까지입니다" };
  if (form.kind === "TRUCK_SLOT") {
    if (!HHMM.test(form.windowFrom) || !HHMM.test(form.windowTo)) return { problem: "시간창을 HH:MM 으로 적으세요" };
    if (form.windowFrom >= form.windowTo) return { problem: "시간창 시작이 끝보다 앞서야 합니다" };
  }
  if (run.isSimulated && !run.scenarioId) return { problem: "시뮬레이션 계획의 시나리오를 알 수 없어 입력할 수 없습니다" };
  return {
    body: {
      kind: form.kind,
      target_id: form.targetId,
      date: form.date,
      ...(form.kind === "TRUCK_SLOT" ? { window_from: form.windowFrom, window_to: form.windowTo } : {}),
      ...(form.kind === "FACILITY_CAPACITY" && form.sizeType.trim() ? { size_type: form.sizeType.trim() } : {}),
      value,
      source_note: note,
      ...(form.observedAt ? { observed_at: `${form.observedAt.slice(0, 16)}:00+09:00` } : {}),
      ...(run.isSimulated && run.scenarioId ? { scenario_id: run.scenarioId } : {}),
    },
  };
}
