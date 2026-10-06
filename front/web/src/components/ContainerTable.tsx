import { useState } from "react";
import type { ContainerView } from "@/contracts/cera";
import { RiskBadge, RouteBadge, UsabilityBadge } from "./badges";
import { PHASE_LABEL, PRIORITY_LABEL, carrierShort, krw, md } from "./format";

type Filter = "ALL" | "AFFECTED" | "RISK" | "CHANGED";

const FILTERS: { id: Filter; label: string; test: (c: ContainerView) => boolean }[] = [
  { id: "ALL", label: "전체", test: () => true },
  { id: "AFFECTED", label: "영향", test: (c) => c.impact === "AFFECTED" },
  { id: "RISK", label: "Critical · High", test: (c) => c.risk.grade === "CRITICAL" || c.risk.grade === "HIGH" },
  { id: "CHANGED", label: "이번 계획에서 변경", test: (c) => c.route_changed_in_current_plan },
];

export function ContainerTable({
  containers,
  onSelect,
  hoveredId,
  onHover,
}: {
  containers: ContainerView[];
  onSelect: (id: string) => void;
  hoveredId?: string | null;
  onHover?: (id: string | null) => void;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const f = FILTERS.find((x) => x.id === filter)!;
  const filteredByTab = containers.filter(f.test);
  const rows = filteredByTab.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      c.container_no.toLowerCase().includes(q) ||
      c.cargo.toLowerCase().includes(q) ||
      c.carrier.toLowerCase().includes(q)
    );
  });

  return (
    <section className="card" data-testid="container-table">
      <div className="card-head">
        <span className="card-title">컨테이너 관리 현황</span>
        <div className="filters">
          {FILTERS.map((x) => (
            <button key={x.id} className={`filter-btn ${filter === x.id ? "on" : ""}`} onClick={() => setFilter(x.id)}>
              {x.label} <span className="num" style={{ opacity: 0.8 }}>({containers.filter(x.test).length})</span>
            </button>
          ))}
        </div>
        <div className="table-search" style={{ marginLeft: "auto" }}>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>🔍</span>
          <input
            type="text"
            placeholder="컨테이너 / 화물 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 10, color: "var(--text-3)", padding: 0 }}
              title="검색어 초기화"
            >
              ✕
            </button>
          )}
        </div>
        <span className="card-meta" style={{ marginLeft: 0 }}>행 클릭 시 상세 명세</span>
      </div>
      <div className="tbl-wrap" style={{ maxHeight: 540 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ID</th>
              <th>컨테이너 번호</th>
              <th>규격</th>
              <th>선사</th>
              <th>화물 종류</th>
              <th>우선순위</th>
              <th>운영 단계</th>
              <th>LFD</th>
              <th>위험 등급</th>
              <th>위험 사유</th>
              <th>지정 경로</th>
              <th className="r">미조치 시 추가비용</th>
              <th>근거 품질</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const isHovered = hoveredId === c.id;
              return (
                <tr
                  key={c.id}
                  className={`clickable ${c.impact === "AFFECTED" ? "affected" : ""} ${c.route_changed_in_current_plan ? "changed" : ""} ${isHovered ? "is-hovered" : ""}`}
                  onClick={() => onSelect(c.id)}
                  onMouseEnter={() => onHover?.(c.id)}
                  onMouseLeave={() => onHover?.(null)}
                  data-testid={`row-${c.id}`}
                >
                <td>
                  <b style={{ color: "var(--text)" }}>{c.id}</b>
                </td>
                <td className="mono">{c.container_no}</td>
                <td>{c.size_label}</td>
                <td>{carrierShort(c.carrier)}</td>
                <td>{c.cargo}</td>
                <td>{PRIORITY_LABEL[c.business_priority]}</td>
                <td>{PHASE_LABEL[c.phase] ?? c.phase}</td>
                <td className="num">{md(c.lfd)}</td>
                <td>
                  <RiskBadge grade={c.risk.grade} />
                </td>
                <td className="sub wrap" style={{ minWidth: 260, maxWidth: 380, fontSize: 12 }}>
                  {c.risk.explanation}
                </td>
                <td>
                  <RouteBadge route={c.current_route} />
                </td>
                <td className="r num" style={{ fontWeight: 650 }}>{c.risk.exposure_krw ? krw(c.risk.exposure_krw) : "—"}</td>
                <td>
                  <UsabilityBadge usability={c.worst_usability} />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
