import { type ReactNode, useEffect, useState } from "react";
import { type Me, ROLE_LABEL, getMe, login, logout } from "@/api/auth";
import { describeApiError } from "@/api/errors";
import { toApiError } from "@/state/async";

/**
 * 로그인 관문(T-119) — 최소 화면. 세션이 없으면 로그인 폼, 있으면 위쪽 한 줄(사용자 · 역할 · 로그아웃) + 원래 화면.
 * 버튼을 숨기는 것은 편의일 뿐 — 막는 것은 Backend 다(권한 없는 요청은 403).
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [form, setForm] = useState({ id: "", pw: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then((r) => setMe(r.data))
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return <div style={{ padding: 24 }} className="muted">로그인 상태 확인 중…</div>;
  if (me === null) {
    return (
      <form
        className="card"
        data-testid="login-form"
        style={{ maxWidth: 360, margin: "80px auto", display: "grid", gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          login(form.id.trim(), form.pw)
            .then((r) => setMe(r.data))
            .catch((err) => setError(describeApiError(toApiError(err))));
        }}
      >
        <div className="card-title">CERA 로그인</div>
        <input placeholder="아이디 (admin · operator · field)" autoComplete="username" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} data-testid="login-id" />
        <input placeholder="비밀번호" type="password" autoComplete="current-password" value={form.pw} onChange={(e) => setForm({ ...form, pw: e.target.value })} data-testid="login-password" />
        <button type="submit" className="act-btn" data-testid="login-submit">로그인</button>
        {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
      </form>
    );
  }
  return (
    <>
      <div data-testid="session-bar" style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center", padding: "4px 16px", fontSize: 12, borderBottom: "1px solid var(--line)" }}>
        <span>
          {me.display_name} · <b>{ROLE_LABEL[me.role]}</b>
          {me.via === "DEV_HEADER" ? " · 개발 모드" : ""}
        </span>
        {me.via === "SESSION" && (
          <button type="button" className="act-btn" onClick={() => logout().finally(() => setMe(null))} data-testid="logout">
            로그아웃
          </button>
        )}
      </div>
      {children}
    </>
  );
}
