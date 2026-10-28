import { messageStatus, truthShort } from "./opsLabels";
import type { GapRow } from "./opsModel";

/** 필요한 정보 — 무엇이 · 대상 · 상태 · 누구에게 물었나 · 답장 · 지금 값 · 확정 */
export function GapTable({ rows }: { rows: GapRow[] }) {
  if (rows.length === 0)
    return (
      <div className="muted" data-testid="gap-empty">
        이 실행이 물어본 정보가 아직 없습니다.
      </div>
    );
  return (
    <table className="ops-table" data-testid="gap-table">
      <thead>
        <tr>
          <th>필요한 정보</th>
          <th>대상</th>
          <th>상태</th>
          <th>문의</th>
          <th>답장</th>
          <th>지금 값</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const t = truthShort(r.state);
          return (
            <tr key={r.key} data-testid="gap-row" data-state={r.state}>
              <td>{r.what}</td>
              <td>{r.target}</td>
              <td>
                <span className={`badge ${t.badge}`}>{t.label}</span>
              </td>
              <td>{r.askedTo ? `${r.askedTo} (${messageStatus(r.askStatus).label})` : "묻지 않음"}</td>
              <td>{r.replied ? "✉ 왔음" : r.askedTo ? "아직" : "—"}</td>
              <td>
                {r.value ?? "없음"}
                {r.value && !r.confirmed ? " (확정 아님)" : ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
