import type { ReactNode } from "react";
import { ROLE_LABEL } from "@/api/auth";
import { useLogout, useMe } from "@/app/MeContext";
import { ModeBadge } from "./ModeBadge";

export type OpsView = "overview" | "exceptions" | "recovery" | "inputs" | "system";

export interface NavItem {
  view: OpsView;
  label: string;
  icon: string;
  /** 옆 숫자(있을 때만) — 사람 조치 수 · 진행 중 예외 수 등 Backend 기록에서 센 값 */
  count?: number | null;
  attention?: boolean;
}

/**
 * 운영 콘솔의 공통 틀(1차 제품 UI) — 왼쪽 메뉴 + 위 머리(배포 모드 · 시스템 상태 · 사용자 · 역할) + 본문.
 * 메뉴는 업무 흐름 순서다: 개요 → 예외 → 복구 실행 → 운영 입력 → 시스템. 연락 · 정보 · 계획은 복구 실행 안의 탭이다(한 실행의 일).
 */
export function AppShell({ items, view, onView, status, actions, children }: { items: NavItem[]; view: OpsView; onView: (v: OpsView) => void; status: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
  return (
    <div className="app-layout" data-testid="app-shell">
      <aside className="app-side" aria-label="주 메뉴">
        <a className="app-brand" href="/" aria-label="CERA 운영 콘솔 처음으로">
          <span className="app-brand-mark" aria-hidden>
            C
          </span>
          <span>
            <b>CERA</b>
            <small>Container Exception Recovery</small>
          </span>
        </a>
        <nav className="app-nav">
          {items.map((i) => (
            <button key={i.view} type="button" className="app-nav-item" aria-current={view === i.view ? "page" : undefined} onClick={() => onView(i.view)} data-testid={`nav-${i.view}`}>
              <span className="app-nav-icon" aria-hidden>
                {i.icon}
              </span>
              <span className="app-nav-label">{i.label}</span>
              {i.count ? (
                <span className={`app-nav-count${i.attention ? " attention" : ""}`} aria-label={`${i.count}건`}>
                  {i.count}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="app-side-foot">
          <a href="/demo" className="app-side-link">
            단계별 체험(시연) →
          </a>
          <span>숫자는 결정론 엔진, 외부 행동은 사람 승인이 정합니다.</span>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <ModeBadge mode={me?.deployment_mode} />
          {status}
          <span style={{ flex: 1 }} />
          {actions}
          {me && (
            <span className="app-user" data-testid="app-user">
              <span className="app-user-avatar" aria-hidden>
                {me.display_name.slice(0, 1)}
              </span>
              <span>
                <b>{me.display_name}</b>
                <small>
                  {ROLE_LABEL[me.role]}
                  {me.via === "DEV_HEADER" ? " · 개발 모드" : ""}
                </small>
              </span>
            </span>
          )}
          {logout && (
            <button type="button" className="act-btn" onClick={logout} data-testid="logout">
              {me?.role === "DEMO_VISITOR" ? "데모 종료" : "로그아웃"}
            </button>
          )}
        </header>
        <main className="app-content" data-testid="ops-console">
          {children}
        </main>
      </div>
    </div>
  );
}
