import type { ReactNode } from "react";

/**
 * 공개 포트폴리오 데모 안내(T-131 · ADR-039). 화면은 알리기만 한다 — 실제 메일 · 관리 기능 · 외부 호출을 막는 것은 Backend 설정과 권한이다.
 * 문구는 실제 검증 범위를 넘지 않는다: 합성 데이터 · Mock 메일 · 녹화 재생을 그대로 말한다.
 */

/** 로그인 화면 위 소개 + [데모 시작]. 관리자 로그인은 접어 둔다. 짧게: 문제 · 체험할 것 · 안전 장치 · 시작 */
export function PortfolioIntro({ onStart, busy, error, login }: { onStart: () => void; busy: boolean; error: string | null; login: ReactNode }) {
  return (
    <div className="intro" data-testid="portfolio-intro">
      <section className="intro-hero">
        <div className="intro-kicker">PORTFOLIO DEMO</div>
        <h1>CERA — Container Exception Recovery Agent</h1>
        <p>
          수입 컨테이너 물류에서 창고 수용량이 갑자기 줄면, 어느 컨테이너를 어디로 옮길지 · 누구에게 무엇을 물을지를 빠르게 정해야 합니다.
          CERA 는 예외를 스스로 찾고, 필요한 정보를 확인하고, 비용이 가장 적은 복구 계획을 계산합니다. 외부 연락과 계획 승인은 <b>사람</b>이 합니다.
        </p>
        <div className="intro-cta">
          <button type="button" className="act-btn primary intro-start" disabled={busy} onClick={onStart} data-testid="demo-start">
            {busy ? "데모 준비 중…" : "데모 시작 →"}
          </button>
          <span className="muted">로그인 없이 체험 세션이 열립니다</span>
        </div>
        {error && (
          <div style={{ color: "var(--red)", fontSize: 12 }} data-testid="demo-start-error">
            {error}
          </div>
        )}
      </section>
      <section className="intro-cols">
        <div className="intro-col">
          <b>이 데모에서 체험할 것</b>
          <ol>
            <li>창고 수용량 부족을 CERA 가 자동으로 탐지</li>
            <li>Agent 가 빈 정보를 찾아 업체 문의 초안 작성 → 사람이 승인</li>
            <li>업체 답장을 AI 가 읽어 값 후보 제안 → 결정론 검증 · 사람 확인</li>
            <li>Solver 가 최저 손실 복구 계획 계산 → 사실이 바뀌면 다시 계산</li>
            <li>계획 승인 뒤 후속 요청 · 정정 · 취소 초안</li>
          </ol>
        </div>
        <div className="intro-col" data-testid="portfolio-scope">
          <b>이 데모에서 무엇이 진짜인가</b>
          <ul>
            <li>
              외부 메일 → <b>Mock</b>(실제로 전송되지 않음)
            </li>
            <li>
              기업 내부 운영 데이터 · 업체 · 담당자 → <b>합성 데이터</b>
            </li>
            <li>
              AI 추출 → <b>녹화 재생</b>(상용 LLM 호출 없음)
            </li>
            <li>관리자 기능 · 실제 운영 입력 → 사용 불가</li>
          </ul>
          <span className="muted">
            별도 환경에서 검증한 것: Gmail API 실제 왕복 · 상용 LLM(Gemini) 추출 smoke · 역할 권한 · PostgreSQL 영속 · Redis 장애 시 대체 경로 · HiGHS Solver · 재계획 · 정정/취소 후속
          </span>
        </div>
      </section>
      <div className="muted intro-note">
        숫자는 결정론 엔진(Cost Engine · HiGHS MIP Solver)이, 외부 행동은 사람 승인이 정합니다 — NestJS · PostgreSQL · Redis · Python(FastAPI · LangGraph) · React. 여러 방문자가 같은 체험 환경을 함께 쓰며, 한동안 조작이 없으면 처음 상태로 돌아갑니다.
      </div>
      <details className="card intro-admin">
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
