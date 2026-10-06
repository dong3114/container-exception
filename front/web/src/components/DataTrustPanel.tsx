import type { DataTrustSummary } from "@/contracts/cera";
import { TRUST_COLOR, TrustBadge } from "./badges";

export function DataTrustPanel({ trust }: { trust: DataTrustSummary }) {
  return (
    <section className="card" data-testid="data-trust">
      <div className="card-head">
        <span className="card-title">데이터 신뢰도 (Data Trust)</span>
        <span className="card-meta">원천 및 신선도 상태</span>
      </div>
      <div className="card-body">
        <div className="trust-cats">
          {trust.categories.map((c) => (
            <div className="trust-cat" key={c.category} style={{ borderTop: `3px solid ${TRUST_COLOR[c.category]}` }}>
              <TrustBadge category={c.category} />
              <div className="trust-cat-count">{c.count}</div>
              <div className="trust-cat-desc">{c.description}</div>
            </div>
          ))}
        </div>
        <div className="fresh-row" data-testid="freshness">
          <span className="badge b-green">신선 {trust.freshness.FRESH}</span>
          <span className="badge b-amber">노화 {trust.freshness.AGING}</span>
          <span className="badge b-red">오래됨 STALE {trust.freshness.STALE}</span>
          <span className="badge b-outline b-dashed">시각 모름 UNKNOWN {trust.freshness.UNKNOWN}</span>
        </div>
        <div className="section-title" style={{ marginTop: 14, marginBottom: 8 }}>
          확인 대기 {trust.verification_queue.length}건
        </div>
        <ul className="vq">
          {trust.verification_queue.map((v) => (
            <li key={v.request_id}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                <span className="badge b-outline">{v.reason}</span>
                <b style={{ color: "var(--text)" }}>{v.subject}</b>
              </div>
              <div className="q">{v.question}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                차단 조건: {v.blocking}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
