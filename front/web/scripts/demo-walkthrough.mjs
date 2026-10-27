// 시연 콘솔(/demo) 브라우저 따라가기 — 실제 스택(API · Worker · AI · DB)이 떠 있고 시드만 들어간 깨끗한 상태에서 실행한다.
// 단계마다 버튼을 누르고, 다음 단계가 '완료'가 될 때까지 기다리며, 화면 문구 · 스크린숏을 남긴다. 페이지 오류가 있으면 실패.
//   node scripts/demo-walkthrough.mjs            (DEMO_URL 기본 http://127.0.0.1:3000/demo · SMOKE_CHANNEL msedge | chrome)
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const url = process.env.DEMO_URL ?? "http://127.0.0.1:3000/demo";
const out = process.env.SMOKE_OUT ?? ".smoke/demo";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.SMOKE_CHANNEL ?? "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
// 로그인 전 /auth/me 확인의 401 은 정상(로그인 폼을 띄우는 신호)
page.on("console", (m) => m.type() === "error" && !m.text().includes("status of 401") && errors.push(`console: ${m.text()}`));

const step = (n) => page.getByTestId(`demo-step-${n}`);
async function waitDone(n, timeout = 60_000) {
  await step(n).getByText("완료", { exact: true }).first().waitFor({ timeout });
}
async function click(n, name) {
  const b = step(n).getByRole("button", { name });
  await b.waitFor();
  await page.waitForFunction((el) => !el.disabled, await b.elementHandle(), { timeout: 60_000 });
  await b.click();
}
async function shot(name) {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}
const text = async (n) => (await step(n).innerText()).replace(/\s+/g, " ").slice(0, 400);

// 로그인(T-119): 운영자. 비밀번호는 DEMO_PASSWORD 또는 back/.env 의 CERA_SEED_OPERATOR_PASSWORD(저장소에 없다)
const password = process.env.DEMO_PASSWORD ?? /^CERA_SEED_OPERATOR_PASSWORD=(.+)$/m.exec(readFileSync("../../back/.env", "utf8"))?.[1]?.trim();
await page.goto(url);
await page.waitForSelector('[data-testid="login-form"], [data-testid="session-bar"]', { timeout: 15_000 });
if (await page.getByTestId("login-form").isVisible()) {
  await page.getByTestId("login-id").fill(process.env.DEMO_LOGIN ?? "operator");
  await page.getByTestId("login-password").fill(password ?? "");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("session-bar").waitFor({ timeout: 10_000 });
}
await waitDone(1, 20_000);
console.log("1", await text(1));
await click(2, "5건 한 번에 입력");
await waitDone(2);
console.log("2", await text(2));
await click(3, "Agent 시작");
await waitDone(3, 120_000);
await step(4).getByText("PENDING_APPROVAL").waitFor({ timeout: 60_000 });
console.log("3", await text(3));
await shot("03-agent-started");
await click(4, "승인");
await waitDone(4);
await click(5, "발송 요청");
await waitDone(5, 90_000);
console.log("5", await text(5));
await click(6, "회신 넣기");
await waitDone(6, 90_000);
await waitDone(7, 90_000);
console.log("7", await text(7));
await waitDone(8, 90_000);
console.log("8", await text(8));
await shot("08-plan-v1");
await click(9, "K운송 4대 확인");
await waitDone(9, 90_000);
console.log("9", await text(8));
await click(10, "ODCY A 를 2 로 정정");
await waitDone(10, 90_000);
console.log("10", await text(8));
await click(11, "지금 판 승인");
await waitDone(11, 90_000);
console.log("11", await text(11));
await shot("11-done");
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("demo walkthrough OK — page errors 0");
