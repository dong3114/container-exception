import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ROLE_LABEL } from "@/api/auth";
import { PortfolioBanner, PortfolioIntro } from "./PortfolioDemo";

/** T-131 공개 포트폴리오 데모 화면 — 안내만 한다(막는 것은 Backend). 문구가 실제 검증 범위를 넘지 않는지와 번들 비밀값 경계를 본다. */
describe("portfolio intro", () => {
  const html = renderToStaticMarkup(<PortfolioIntro onStart={() => undefined} busy={false} error={null} login={<form data-testid="login-form" />} />);

  it("offers one Demo Start button and keeps the admin login folded away", () => {
    expect(html).toContain('data-testid="demo-start"');
    expect(html).toContain("데모 시작");
    expect(html).toMatch(/<details[^>]*>(?:(?!open).)*<summary[^>]*>관리자 로그인/);
  });

  it("says plainly what is real and what is mock or synthetic", () => {
    expect(html).toContain("PORTFOLIO DEMO");
    for (const s of ["Mock", "합성 데이터", "녹화 재생", "상용 LLM 호출 없음", "Gmail API 실제 왕복"]) expect(html).toContain(s);
    // 과장 금지: 실제 기업 데이터 · 완전 자동 · 고객 시스템 연동을 말하지 않는다
    for (const s of ["실제 기업 데이터", "완전 자동", "TMS", "WMS"]) expect(html).not.toContain(s);
  });
});

describe("portfolio banner", () => {
  it("is on every signed-in screen and links the guided demo and the console", () => {
    const html = renderToStaticMarkup(<PortfolioBanner path="" />);
    expect(html).toContain("시연용 합성 데이터");
    expect(html).toContain("실제로 전송되지 않습니다");
    expect(html).toContain('href="/demo"');
    expect(renderToStaticMarkup(<PortfolioBanner path="/demo" />)).toContain('href="/"');
  });

  it("names the demo visitor role", () => {
    expect(ROLE_LABEL.DEMO_VISITOR).toBe("데모 방문자");
  });
});

describe("no secrets can reach the browser bundle", () => {
  // VITE_* 값은 번들에 그대로 들어간다 → 화면 코드가 읽는 환경변수는 비밀이 아닌 두 개뿐이어야 한다
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
    });

  it("source reads only VITE_CERA_API_BASE and VITE_CERA_PROVIDER", () => {
    const keys = new Set<string>();
    for (const f of files("src")) for (const m of readFileSync(f, "utf8").matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) keys.add(m[1]!);
    expect([...keys].sort()).toEqual(["VITE_CERA_API_BASE", "VITE_CERA_PROVIDER"]);
  });

  it("source names no server secret", () => {
    const text = files("src").map((f) => readFileSync(f, "utf8")).join("\n");
    for (const k of ["GEMINI_API_KEY", "OPENAI_API_KEY", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "CERA_AGENT_TOOL_TOKEN", "DATABASE_URL", "CERA_SEED_"]) expect(text).not.toContain(k);
  });
});
