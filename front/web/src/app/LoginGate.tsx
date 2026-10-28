import { ModeBadge } from "@/components/ops/ModeBadge";
import { type ReactNode, useEffect, useState } from "react";
import { type Me, ROLE_LABEL, getDemoInfo, getMe, login, logout, startDemo } from "@/api/auth";
import { describeApiError } from "@/api/errors";
import { toApiError } from "@/state/async";
import { MeContext } from "./MeContext";
import { PortfolioBanner, PortfolioIntro } from "./PortfolioDemo";

/**
 * 로그인 관문(T-119) — 최소 화면. 세션이 없으면 로그인 폼, 있으면 위쪽 한 줄(사용자 · 역할 · 로그아웃) + 원래 화면.
 * 버튼을 숨기는 것은 편의일 뿐 — 막는 것은 Backend 다(권한 없는 요청은 403).
 * 공개 포트폴리오 데모 배포(T-131)면 로그인 폼 대신 소개 + [데모 시작](데모 방문자 세션)을 먼저 보이고, 로그인 뒤에는 위에 안내 띠를 단다.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [demo, setDemo] = useState(false);
  const [form, setForm] = useState({ id: "", pw: "" });
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getMe()
      .then((r) => setMe(r.data))
      .catch(async () => {
        // 로그인 전에만 묻는다: 공개 데모 배포인가(아니면 404 → 평소 로그인 폼)
        const enabled = await getDemoInfo().then((r) => r.data.enabled === true, () => false);
        setDemo(enabled);
        setMe(null);
      });
  }, []);

  if (me === undefined) return <div style={{ padding: 24 }} className="muted">로그인 상태 확인 중…</div>;
  if (me === null) {
    const loginForm = (
      <form
        className={demo ? undefined : "card"}
        data-testid="login-form"
        style={demo ? { display: "grid", gap: 10, maxWidth: 360 } : { maxWidth: 360, margin: "80px auto", display: "grid", gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          login(form.id.trim(), form.pw)
            .then((r) => setMe(r.data))
            .catch((err) => setError(describeApiError(toApiError(err))));
        }}
      >
        {!demo && <div className="card-title">CERA 로그인</div>}
        <input placeholder={demo ? "아이디" : "아이디 (admin · operator · field)"} autoComplete="username" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} data-testid="login-id" />
        <input placeholder="비밀번호" type="password" autoComplete="current-password" value={form.pw} onChange={(e) => setForm({ ...form, pw: e.target.value })} data-testid="login-password" />
        <button type="submit" className="act-btn" data-testid="login-submit">로그인</button>
        {error && !starting && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
      </form>
    );
    if (!demo) return loginForm;
    return (
      <PortfolioIntro
        busy={starting}
        error={starting ? null : error}
        login={loginForm}
        onStart={() => {
          setError(null);
          setStarting(true);
          startDemo()
            .then((r) => {
              // 처음 방문자는 단계별 체험부터(버튼마다 무엇이 일어나는지 적혀 있다). 운영 콘솔은 위 띠에서 언제든
              if (window.location.pathname.replace(/\/+$/, "") === "") window.history.replaceState(null, "", "/demo");
              window.location.reload();
              return r;
            })
            .catch((err) => {
              setError(describeApiError(toApiError(err)));
              setStarting(false);
            });
        }}
      />
    );
  }
  return (
    <>
      {me.portfolio_demo && <PortfolioBanner />}
      <div data-testid="session-bar" style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center", padding: "4px 16px", fontSize: 12, borderBottom: "1px solid var(--line)" }}>
        <ModeBadge mode={me.deployment_mode} />
        <span>
          {me.display_name} · <b>{ROLE_LABEL[me.role]}</b>
          {me.via === "DEV_HEADER" ? " · 개발 모드" : ""}
        </span>
        {me.via === "SESSION" && (
          <button
            type="button"
            className="act-btn"
            onClick={() => {
              // 공개 데모에서 나가면 다시 소개 + [데모 시작] 으로(로그인 폼이 아니라)
              const wasDemo = me.portfolio_demo === true;
              logout().finally(() => {
                setDemo(wasDemo);
                setMe(null);
              });
            }}
            data-testid="logout"
          >
            {me.role === "DEMO_VISITOR" ? "데모 종료" : "로그아웃"}
          </button>
        )}
      </div>
      <MeContext.Provider value={me}>{children}</MeContext.Provider>
    </>
  );
}
