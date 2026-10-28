import type { Readiness } from "@/api/ops";
import { READINESS, missingLabel } from "./opsLabels";

/** 계획을 계산할 수 있나 — 없으면 필드 단위로 무엇이 없는지(값을 지어내지 않는다) */
export function ReadinessPanel({ readiness }: { readiness: Readiness }) {
  const r = READINESS[readiness.status] ?? { label: readiness.status, badge: "b-outline" };
  const blocking = readiness.missing_inputs.filter((m) => m.severity === "BLOCKING");
  const optional = readiness.missing_inputs.filter((m) => m.severity === "OPTIONAL");
  return (
    <div style={{ display: "grid", gap: 6 }} data-testid="readiness" data-status={readiness.status}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b>계획 입력 준비도</b>
        <span className={`badge ${r.badge}`}>{r.label}</span>
        <span className="muted">{readiness.mode === "SCENARIO" ? "시뮬레이션 실행 — 시나리오 입력" : `실제 실행 · 계획일 ${readiness.plan_day}`}</span>
      </div>
      {blocking.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          <span>계획을 계산할 수 없는 이유:</span>
          <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="readiness-missing">
            {blocking.map((m) => (
              <li key={`${m.code}:${m.group}`}>
                <b>{missingLabel(m.code)}</b> ({m.count}건) —{" "}
                <span className="mono">
                  {m.fields.slice(0, 8).join(", ")}
                  {m.fields.length > 8 ? " …" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {optional.length > 0 && (
        <details>
          <summary className="muted">선택 정보 {optional.length}종이 없습니다(없으면 그 대안은 계산하지 않음)</summary>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {optional.map((m) => (
              <li key={`${m.code}:${m.group}`} className="muted">
                {missingLabel(m.code)} — <span className="mono">{m.fields.slice(0, 6).join(", ")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
