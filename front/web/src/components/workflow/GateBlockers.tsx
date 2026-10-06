/**
 * "Why can't this be sent?" — shows the reasons the backend Contact Gate returned (docs/19 FR-ELG-04, FR-CPY-11).
 * The screen never decides eligibility itself (FR-ELG-02: the server's deterministic logic decides). It only lists
 * what the backend said, keeping product rules apart from the development recipient limit (FR-ELG-05).
 *
 * Reason codes and their wording arrive with the T-087 Contact Gate endpoint; until then callers pass the
 * backend's own label.
 */
export interface GateReason {
  /** Backend reason code, e.g. an unverified address or an unapproved relationship. */
  code: string;
  /** Human-readable reason from the backend. */
  label: string;
  /** PRODUCT_RULE = FR-ELG-01 conditions · DEV_SAFETY = development / tech-validation recipient limit. */
  layer: "PRODUCT_RULE" | "DEV_SAFETY";
}

export function GateBlockers({ reasons, channel }: { reasons: GateReason[]; channel?: "MOCK" | "GMAIL" | "PORTAL" | null }) {
  if (reasons.length === 0) {
    return (
      <span className="badge b-green" data-testid="gate-open">
        발송 가능{channel === "MOCK" ? " · 가상 채널" : ""}
      </span>
    );
  }
  const product = reasons.filter((r) => r.layer === "PRODUCT_RULE");
  const safety = reasons.filter((r) => r.layer === "DEV_SAFETY");
  return (
    <div data-testid="gate-blocked" role="note" style={{ display: "grid", gap: 4 }}>
      <span className="badge b-red">발송 불가{channel === "MOCK" ? " · 가상 채널" : ""}</span>
      {product.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          {product.map((r) => (
            <li key={r.code}>{r.label}</li>
          ))}
        </ul>
      )}
      {safety.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5 }}>
          개발 환경 안전장치: {safety.map((r) => r.label).join(" · ")}
        </div>
      )}
    </div>
  );
}
