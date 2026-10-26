import { useEffect, useState } from "react";
import { listFacilities } from "@/api/drafts";
import { type FactCoordinate, enterFact } from "@/api/truth";
import { useAsyncAction } from "@/state/async";
import { MANUAL_KIND_OPTIONS, factErrorText } from "./factLabels";
import { type ManualForm, buildManualFact, manualTargets } from "./manualEntry";

const EMPTY: ManualForm = { kind: "TRUCK_SLOT", targetId: "", date: "", windowFrom: "15:00", windowTo: "17:00", sizeType: "", value: "", sourceNote: "", observedAt: "" };

/**
 * 운영자 직접 입력(T-111) — 전화 · 방문으로 확인한 사실을 넣는다. Backend 가 사람 입력(바로 확인 완료)으로 기록한다.
 * 같은 담당자(actorId)로 보내고, 시뮬레이션 계획이면 그 시나리오로 표시한다.
 */
export function ManualFactForm({
  facts,
  actorId,
  isSimulated,
  scenarioId,
  asOf,
  onEntered,
}: {
  facts: FactCoordinate[];
  actorId: string | null;
  isSimulated: boolean;
  scenarioId: string | null;
  /** `evaluated_at` of the list on screen — the answer is judged at the same time */
  asOf?: string;
  onEntered: (f: FactCoordinate) => void;
}) {
  const [form, setForm] = useState<ManualForm>(EMPTY);
  const facilities = useAsyncAction((signal) => listFacilities(signal));
  const { run: loadFacilities } = facilities;
  useEffect(() => {
    loadFacilities();
  }, [loadFacilities]);

  const enter = useAsyncAction(async (signal, actor: string, body: Parameters<typeof enterFact>[1]) => {
    const res = await enterFact(actor, body, signal, undefined, asOf);
    setForm({ ...EMPTY, kind: form.kind });
    onEntered(res.data);
    return res;
  });

  const targets = manualTargets(form.kind, facts, facilities.state.status === "SUCCESS" ? facilities.state.data.facilities : []);
  const target = targets.find((t) => t.id === form.targetId);
  const built = buildManualFact(form, { isSimulated, scenarioId });
  const busy = enter.state.status === "LOADING";
  const set = (patch: Partial<ManualForm>) => setForm({ ...form, ...patch });

  return (
    <details data-testid="manual-fact">
      <summary style={{ fontSize: 12, cursor: "pointer" }}>직접 입력(전화 · 방문으로 확인한 사실)</summary>
      <form
        style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "end", fontSize: 12, marginTop: 4 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (actorId && "body" in built) enter.run(actorId, built.body);
        }}
      >
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">종류</span>
          <select value={form.kind} onChange={(e) => set({ kind: e.target.value as ManualForm["kind"], targetId: "", sizeType: "" })} data-testid="manual-kind">
            {MANUAL_KIND_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">대상</span>
          <select value={form.targetId} onChange={(e) => set({ targetId: e.target.value })} data-testid="manual-target">
            <option value="">고르세요</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">날짜</span>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        {form.kind === "TRUCK_SLOT" && (
          <label style={{ display: "grid", gap: 2 }}>
            <span className="muted">시간창</span>
            <span style={{ display: "flex", gap: 4 }}>
              <input value={form.windowFrom} onChange={(e) => set({ windowFrom: e.target.value })} style={{ width: 56 }} />
              <input value={form.windowTo} onChange={(e) => set({ windowTo: e.target.value })} style={{ width: 56 }} />
            </span>
          </label>
        )}
        {target?.isOdcy && (
          <label style={{ display: "grid", gap: 2 }}>
            <span className="muted">규격(선택, 예: 40DRY)</span>
            <input value={form.sizeType} maxLength={16} onChange={(e) => set({ sizeType: e.target.value })} style={{ width: 70 }} />
          </label>
        )}
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">{form.kind === "TRUCK_SLOT" ? "가용 차량(대)" : "수용량(개)"}</span>
          <input type="number" min={0} max={999999} step={1} value={form.value} onChange={(e) => set({ value: e.target.value })} style={{ width: 80 }} data-testid="manual-value" />
        </label>
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">어디서 확인했나(필수)</span>
          <input value={form.sourceNote} maxLength={200} placeholder="예: 배차 담당자와 통화" onChange={(e) => set({ sourceNote: e.target.value })} style={{ width: 180 }} data-testid="manual-note" />
        </label>
        <label style={{ display: "grid", gap: 2 }}>
          <span className="muted">상대가 말한 시각(선택)</span>
          <input type="datetime-local" value={form.observedAt} onChange={(e) => set({ observedAt: e.target.value })} />
        </label>
        <button type="submit" className="act-btn primary" disabled={!actorId || busy || !("body" in built)} data-testid="manual-submit">
          {busy ? "입력 중…" : "입력하기"}
        </button>
      </form>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }} data-testid="manual-hint">
        {!actorId ? "입력할 담당자를 불러오지 못해 누를 수 없습니다" : "problem" in built ? built.problem : "사람이 직접 확인한 값으로 바로 기록됩니다(사람 확인 완료)"}
        {form.kind === "TRUCK_SLOT" && targets.length === 0 ? " · 차량 풀 목록은 이 계획에서 이미 판단된 사실에서만 가져옵니다" : ""}
        {isSimulated ? " · 시뮬레이션 계획의 값으로 기록됩니다" : ""}
      </div>
      {enter.state.status === "FAILED" && (
        <div role="alert" className="badge b-red" style={{ whiteSpace: "normal", justifySelf: "start" }} data-testid="manual-error">
          {factErrorText(enter.state.error.code, enter.state.error.message)}
        </div>
      )}
    </details>
  );
}
