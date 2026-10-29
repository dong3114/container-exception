import { EmptyState } from "@/components/ui/primitives";
import { messageStatus, truthShort } from "./opsLabels";
import type { GapRow } from "./opsModel";

/**
 * 확인이 필요한 정보(정보 공백) — 무엇이 · 대상 · 상태 · 누구에게 물었나 · 답장 · 지금 값 · 확정 여부.
 * 상태는 아이콘 + 글자로(색만으로 나누지 않는다). 값은 사실 판정(Backend) 그대로다.
 */
export function GapTable({ rows }: { rows: GapRow[] }) {
  if (rows.length === 0)
    return (
      <EmptyState icon="○" title="이 실행이 확인 중인 정보가 아직 없습니다." testId="gap-empty">
        Agent 를 시작하면 계획에 필요한 정보(수용량 · 트럭 가용 등) 중 비어 있는 것을 찾아 여기에 보여 줍니다.
      </EmptyState>
    );
  const open = rows.filter((r) => !r.confirmed).length;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="sub-head">
        <b>확인이 필요한 정보</b>
        <span className="muted">정보 공백 {rows.length}건 · 확정 전 {open}건</span>
      </div>
      <div className="table-wrap">
        <table className="ops-table" data-testid="gap-table">
          <thead>
            <tr>
              <th>필요한 정보</th>
              <th>대상</th>
              <th>상태</th>
              <th>문의 대상</th>
              <th>회신</th>
              <th>현재 값</th>
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
                    <b className="num">{r.value ?? "없음"}</b>
                    {r.value && !r.confirmed ? <span className="muted"> (확정 아님)</span> : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
