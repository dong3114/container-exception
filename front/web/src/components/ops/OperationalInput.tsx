import { useState } from "react";
import { type ImportReport, type InputKind, importOperationalInput } from "@/api/ops";
import { useMe } from "@/app/MeContext";
import { useAsyncAction } from "@/state/async";
import { ErrorNotice } from "./ErrorNotice";
import { can } from "./opsLabels";

const KINDS: { kind: InputKind; label: string; header: string }[] = [
  { kind: "containers", label: "컨테이너(이 실행)", header: "container_no,size_type,carrier,pickup_ready,terminal,destination,planned_day,planned_depart_hour,lfd,priority" },
  { kind: "rates", label: "계약 요율", header: "rate_type,carrier,from,to,size_type,amount,effective_from,source_note" },
  { kind: "facility-profiles", label: "시설 계획 정보", header: "facility,accepts,open_from_hour,last_departure_hour,trip_hours,max_storage_days" },
];

/**
 * 실제 실행의 운영 기록 입력(T-123) — 최소 화면. 늘 **검증만** 먼저 하고, 오류 없는 같은 내용일 때만 저장 버튼이 켜진다.
 * 한 묶음은 전부 저장되거나 하나도 저장되지 않는다(Backend). 큰 기준정보 관리 화면이 아니다.
 */
export function OperationalInput({ runId }: { runId: string }) {
  const me = useMe();
  const [kind, setKind] = useState<InputKind>("containers");
  const [csv, setCsv] = useState("");
  const [checked, setChecked] = useState<{ csv: string; kind: InputKind } | null>(null);
  const action = useAsyncAction(async (signal, dryRun: boolean) => {
    const res = await importOperationalInput(kind, runId, csv, dryRun, me!.actor_id, signal);
    setChecked(dryRun && res.data.invalid_rows === 0 ? { csv, kind } : null);
    return res;
  });
  const allowed = can(me, "planning.input");
  const header = KINDS.find((k) => k.kind === kind)!.header;
  const report = action.state.status === "SUCCESS" ? action.state.data : null;
  const canStore = allowed && checked?.csv === csv && checked.kind === kind;
  return (
    <div style={{ display: "grid", gap: 8 }} data-testid="operational-input">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b>운영 기록 입력(CSV)</b>
        <select value={kind} onChange={(e) => setKind(e.target.value as InputKind)} aria-label="입력 종류">
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <label className="act-btn" style={{ cursor: "pointer" }}>
          파일 열기
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then(setCsv);
            }}
          />
        </label>
      </div>
      <span className="muted mono" style={{ fontSize: 11 }}>
        첫 줄: {header}
      </span>
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder={header} style={{ fontFamily: "var(--mono)", fontSize: 12 }} data-testid="input-csv" />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="act-btn" disabled={!allowed || !csv.trim() || action.state.status === "LOADING"} onClick={() => action.run(true)} data-testid="input-dry-run">
          검증만(저장 안 함)
        </button>
        <button type="button" className="act-btn primary" disabled={!canStore || action.state.status === "LOADING"} onClick={() => action.run(false)} data-testid="input-store">
          저장
        </button>
        {!allowed && <span className="muted">운영 기록 입력은 운영자 · 관리자만 할 수 있습니다.</span>}
        {allowed && !canStore && <span className="muted">먼저 검증해 오류가 없어야 저장할 수 있습니다.</span>}
      </div>
      <ErrorNotice error={action.state.status === "FAILED" ? action.state.error : null} />
      {report && <ImportResult report={report} />}
    </div>
  );
}

export function ImportResult({ report }: { report: ImportReport }) {
  const ok = report.invalid_rows === 0;
  return (
    <div className="ops-subcard" data-testid="import-result" data-stored={report.stored ? "true" : "false"}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className={`badge ${ok ? "b-green" : "b-red"}`}>{ok ? "✓ 오류 없음" : `✕ 오류 ${report.invalid_rows}행`}</span>
        <span>
          전체 {report.row_count}행 · 정상 {report.valid_rows}행
        </span>
        <span className={`badge ${report.stored ? "b-green" : "b-outline"}`}>{report.stored ? "✓ 저장됨" : report.dry_run ? "검증만 — 저장되지 않음" : "✕ 저장되지 않음(오류가 있으면 하나도 저장하지 않습니다)"}</span>
      </div>
      {report.errors.length > 0 && (
        <table className="ops-table">
          <thead>
            <tr>
              <th>행</th>
              <th>필드</th>
              <th>이유</th>
            </tr>
          </thead>
          <tbody>
            {report.errors.slice(0, 50).map((e, i) => (
              <tr key={i} data-testid="import-error">
                <td>{e.row === 0 ? "전체" : e.row}</td>
                <td className="mono">{e.column ?? "—"}</td>
                <td>
                  {e.message} <span className="muted mono">({e.code})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
