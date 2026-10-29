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

const BASELINE = { kind: "containers" as const, label: "컨테이너(운영 기준 계획)", header: "container_no,size_type,carrier,pickup_ready,terminal,destination,planned_day,planned_depart_hour,status" };

/**
 * 실제 실행의 운영 기록 입력(T-123). `runId` 가 없으면 운영 기준 계획(T-132 · T-133 — 어느 실행에도 속하지 않은 원래 반입 계획, 저장되면 예외 탐지) — 최소 화면. 늘 **검증만** 먼저 하고, 오류 없는 같은 내용일 때만 저장 버튼이 켜진다.
 * 한 묶음은 전부 저장되거나 하나도 저장되지 않는다(Backend). 큰 기준정보 관리 화면이 아니다.
 */
export function OperationalInput({ runId }: { runId: string | null }) {
  const kinds = runId ? KINDS : [BASELINE, ...KINDS.slice(1)];
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
  const header = kinds.find((k) => k.kind === kind)!.header;
  const report = action.state.status === "SUCCESS" ? action.state.data : null;
  const canStore = allowed && checked?.csv === csv && checked.kind === kind;
  return (
    <div style={{ display: "grid", gap: 8 }} data-testid="operational-input">
      <ol className="input-steps" aria-label="입력 순서">
        <li className={csv.trim() ? "done" : "now"}>1. 파일 선택 · 붙여넣기</li>
        <li className={report ? "done" : csv.trim() ? "now" : ""}>2. 검증</li>
        <li className={report && report.invalid_rows > 0 ? "now" : report ? "done" : ""}>3. 오류 확인</li>
        <li className={report?.stored ? "done" : canStore ? "now" : ""}>4. 저장</li>
        <li className={report?.stored ? "done" : ""}>5. 결과</li>
      </ol>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b>운영 기록 입력(CSV)</b>
        <select value={kind} onChange={(e) => setKind(e.target.value as InputKind)} aria-label="입력 종류">
          {kinds.map((k) => (
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
      <details className="tech">
        <summary>CSV 첫 줄(열 이름) 보기</summary>
        <span className="mono">{header}</span>
      </details>
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
        <ul className="import-errors">
          {report.errors.slice(0, 50).map((e, i) => (
            <li key={i} data-testid="import-error">
              <b>{e.row === 0 ? "파일 전체" : `${e.row}번째 행`}</b>
              {e.column && <span className="mono"> {e.column}</span>}
              <span> — {e.message}</span>
              <details className="tech" style={{ display: "inline-block", marginLeft: 6 }}>
                <summary>코드</summary>
                <span className="mono">{e.code}</span>
              </details>
            </li>
          ))}
          {report.errors.length > 50 && <li className="muted">… 외 {report.errors.length - 50}건</li>}
        </ul>
      )}
      {report.stored && <span className="muted">저장되었습니다. CERA 가 이 기록으로 예외 · 계획 입력 준비도를 다시 판단합니다.</span>}
    </div>
  );
}
