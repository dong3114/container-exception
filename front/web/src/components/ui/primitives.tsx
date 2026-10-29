import type { ReactNode } from "react";

/**
 * 운영 화면의 반복 모양(1차 제품 UI). 모양만 맡는다 — 숫자 · 상태 · 문구는 부르는 쪽이 Backend 값에서 고른다(여기서 지어내지 않는다).
 * 상태는 색만으로 나타내지 않는다: 늘 아이콘 + 글자를 함께 쓴다.
 */

export type Tone = "neutral" | "info" | "ok" | "warn" | "danger" | "sim";

/** 빈 영역 — 빈 표 대신 "지금 무엇이 없고, 다음에 무엇이 생기는지"를 말한다 */
export function EmptyState({ icon = "○", title, children, testId }: { icon?: string; title: string; children?: ReactNode; testId?: string }) {
  return (
    <div className="empty" data-testid={testId} role="status">
      <span className="empty-icon" aria-hidden>
        {icon}
      </span>
      <b className="empty-title">{title}</b>
      {children && <span className="empty-desc">{children}</span>}
    </div>
  );
}

/** 지금 상태 숫자 하나 — 비교치 · 추세를 지어내지 않는다(값이 없으면 "—") */
export function MetricCard({ label, value, hint, tone = "neutral", testId, onClick }: { label: string; value: ReactNode; hint?: string; tone?: Tone; testId?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="metric-label">{label}</span>
      <b className="metric-value num">{value}</b>
      {hint && <span className="metric-hint">{hint}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={`metric tone-${tone}`} data-testid={testId} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={`metric tone-${tone}`} data-testid={testId}>
      {body}
    </div>
  );
}

/** 화면(페이지) 머리 — 제목 · 한 줄 설명 · 오른쪽 동작 */
export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </div>
  );
}

/** 카드 안 구역 머리 */
export function SectionHeader({ title, meta, children, id }: { title: string; meta?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div className="card-head">
      <span className="card-title" id={id}>
        {title}
      </span>
      {meta}
      {children && <span className="card-head-actions">{children}</span>}
    </div>
  );
}

/** 한 줄 안내(정보 · 경고 · 위험) — 아이콘 + 제목 + 설명 + 동작 */
export function Callout({ tone = "info", icon, title, children, actions, testId }: { tone?: Exclude<Tone, "neutral" | "sim">; icon?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode; testId?: string }) {
  const mark = icon ?? (tone === "danger" ? "✕" : tone === "warn" ? "!" : tone === "ok" ? "✓" : "i");
  return (
    <div className={`callout tone-${tone}`} data-testid={testId} role={tone === "danger" ? "alert" : "status"}>
      <span className="callout-icon" aria-hidden>
        {mark}
      </span>
      <div className="callout-body">
        <b>{title}</b>
        {children && <div>{children}</div>}
        {actions && <div className="callout-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** 다시 읽는 중 표시 — 화면을 지우지 않고 작게만 알린다 */
export function Updating({ busy, at }: { busy: boolean; at?: string | null }) {
  return (
    <span className={`updating${busy ? " busy" : ""}`} aria-live="polite" data-testid="updating">
      <span className="updating-dot" aria-hidden />
      {busy ? "업데이트 중…" : at ? `${new Date(at).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hourCycle: "h23" })} 기준` : "불러오는 중…"}
    </span>
  );
}

/** 처음 읽는 동안 — 빈 화면 대신 */
export function LoadingState({ text = "불러오는 중…" }: { text?: string }) {
  return (
    <div className="loading-state" role="status" data-testid="loading-state">
      <span className="updating-dot busy" aria-hidden /> {text}
    </div>
  );
}
