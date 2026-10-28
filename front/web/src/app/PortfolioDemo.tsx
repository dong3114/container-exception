import type { ReactNode } from "react";

/**
 * 공개 포트폴리오 데모 안내(T-131 · ADR-039). 화면은 알리기만 한다 — 실제 메일 · 관리 기능 · 외부 호출을 막는 것은 Backend 설정과 권한이다.
 * 문구는 실제 검증 범위를 넘지 않는다: 합성 데이터 · Mock 메일 · 녹화 재생을 그대로 말한다.
 */

/** 로그인 화면 위 소개 + [데모 시작]. 관리자 로그인은 접어 둔다. */
export function PortfolioIntro({ onStart, busy, error, login }: { onStart: () => void; busy: boolean; error: string | null; login: ReactNode }) {
  return (
    <div style={{ maxWidth: 760, margin: "48px auto", padding: "0 16px", display: "grid", gap: 14 }} data-testid="portfolio-intro">
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, fontWeight: 700, color: "var(--amber, #b7791f)" }}>PORTFOLIO DEMO</div>
        <div className="card-title" style={{ fontSize: 20 }}>CERA — Container Exception Recovery Agent</div>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          수입 컨테이너 물류에서 예외(창고 수용량 감소 등)가 생기면, CERA 는 필요한 정보를 확인하고 부족하면 담당 업체에 보낼 문의 초안을 만든다.
          사람이 승인하면 연락하고, 답장을 AI 가 읽어 <b>검증 가능한 사실</b>로 바꾼 뒤, 비용과 운영 제약을 계산해 Solver 로 복구 계획을 제안한다.
          사람이 계획을 승인하면 후속 요청을 만들고, 상황이 바뀌면 계획을 다시 계산하고 이미 보낸 요청의 정정 · 취소까지 이어 간다.
        </p>
        <div style={{ fontSize: 12, lineHeight: 1.7 }} className="muted">
          NestJS · PostgreSQL · Redis · Python(FastAPI · LangGraph) · HiGHS MIP Solver · React — 숫자는 결정론 엔진이, 외부 행동은 사람 승인이 정한다.
        </div>
        <button type="button" className="act-btn" style={{ fontSize: 15, padding: "10px 16px", justifySelf: "start" }} disabled={busy} onClick={onStart} data-testid="demo-start">
          {busy ? "데모 준비 중…" : "데모 시작 →"}
        </button>
        {error && <div style={{ color: "var(--red)", fontSize: 12 }} data-testid="demo-start-error">{error}</div>}
      </div>
      <div className="card" style={{ display: "grid", gap: 6, fontSize: 12, lineHeight: 1.6 }} data-testid="portfolio-scope">
        <div className="card-title">이 데모에서 무엇이 진짜인가</div>
        <div>
          <b>실제 구현 · 검증 완료(별도 환경)</b>: Gmail API 실제 왕복 · 상용 LLM(Gemini) 추출 smoke · 로그인 · 역할 권한 · PostgreSQL 영속 · Redis 장애 복구 ·
          HiGHS Solver · 재계획 · 정정/취소 후속
        </div>
        <div>
          <b>이 데모에서는 안전을 위해</b>: 외부 메일 → <b>Mock</b>(실제로 전송되지 않음) · 기업 내부 운영 데이터 · 업체 · 담당자 → <b>합성 데이터</b> ·
          AI 추출 → <b>녹화 재생</b>(상용 LLM 호출 없음) · 관리자 기능 · 실제 운영 입력 → 사용 불가
        </div>
        <div className="muted">여러 방문자가 같은 체험 환경을 함께 쓴다. 한동안 아무 조작이 없으면 처음 상태로 돌아간다.</div>
      </div>
      <details className="card" style={{ fontSize: 12 }}>
        <summary style={{ cursor: "pointer" }}>관리자 로그인</summary>
        <div style={{ marginTop: 10 }}>{login}</div>
      </details>
    </div>
  );
}

/** 로그인 뒤 모든 화면 위 띠. */
export function PortfolioBanner({ path = typeof window === "undefined" ? "" : window.location.pathname.replace(/\/+$/, "") }: { path?: string }) {
  return (
    <div
      data-testid="portfolio-banner"
      style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "center", padding: "6px 16px", fontSize: 12, background: "var(--amber-bg, #fff7e6)", color: "var(--ink, #222)", borderBottom: "1px solid var(--line)" }}
    >
      <b style={{ letterSpacing: 1 }}>PORTFOLIO DEMO</b>
      <span>이 환경의 기업 내부 운영 데이터와 업체 정보는 모두 시연용 합성 데이터입니다.</span>
      <span>외부 메일은 실제로 전송되지 않습니다(Mock) · AI 추출은 녹화 재생입니다.</span>
      <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
        {path !== "/demo" && <a href="/demo" data-testid="banner-guided">단계별 체험</a>}
        {path !== "" && <a href="/" data-testid="banner-console">운영 콘솔</a>}
      </span>
    </div>
  );
}
