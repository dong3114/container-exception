"use client";

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

export function ContainerTable({ containers, onSelect }: { containers: ContainerView[]; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const f = FILTERS.find((x) => x.id === filter)!;
  const rows = containers.filter(f.test);
  return (
    <section className="card" data-testid="container-table">
      <div className="card-head">
        <span className="card-title">Containers</span>
        <div className="filters">
          {FILTERS.map((x) => (
            <button key={x.id} className={`filter-btn ${filter === x.id ? "on" : ""}`} onClick={() => setFilter(x.id)}>
              {x.label} <span className="num">{containers.filter(x.test).length}</span>
            </button>
          ))}
        </div>
        <span className="card-meta">행을 누르면 근거·비용 상세</span>
      </div>
      <div className="tbl-wrap" style={{ maxHeight: 520 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ID</th>
              <th>컨테이너 번호 (합성)</th>
              <th>규격</th>
              <th>선사</th>
              <th>화물</th>
              <th>우선</th>
              <th>단계</th>
              <th>LFD</th>
              <th>위험</th>
              <th>위험 사유</th>
              <th>현재 경로</th>
              <th className="r">조치 없을 때 추가비용</th>
              <th>근거 품질</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={`clickable ${c.impact === "AFFECTED" ? "affected" : ""} ${c.route_changed_in_current_plan ? "changed" : ""}`} onClick={() => onSelect(c.id)} data-testid={`row-${c.id}`}>
                <td>
                  <b>{c.id}</b>
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
                <td className="sub wrap" style={{ minWidth: 280, maxWidth: 420, fontSize: 11.5 }}>
                  {c.risk.explanation}
                </td>
                <td>
                  <RouteBadge route={c.current_route} />
                </td>
                <td className="r num">{c.risk.exposure_krw ? krw(c.risk.exposure_krw) : "—"}</td>
                <td>
                  <UsabilityBadge usability={c.worst_usability} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
