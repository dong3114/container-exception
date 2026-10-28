import { ControlTower } from "@/components/ControlTower";
import DemoPage from "./app/demo/DemoPage";
import { LoginGate } from "./app/LoginGate";
import DevApiPage from "./app/dev/api/page";
import { OpsConsole } from "./app/ops/OpsConsole";

/**
 * Minimal path switch. A router library is not chosen yet — add one when real screens need nested routes.
 * `/` = 운영 콘솔(T-120, Backend 데이터만) · `/demo` = 시연 콘솔(시드 시나리오) · `/prototype` = 옛 Mock 재생 화면.
 * 시연 · Mock 데이터는 운영 콘솔에 섞지 않는다. Unknown paths fall back to the operations console (SPA).
 */
export function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/dev/api") return <DevApiPage />;
  if (path === "/demo") return <LoginGate><DemoPage /></LoginGate>;
  if (path === "/prototype") return <LoginGate><ControlTower /></LoginGate>;
  return <LoginGate><OpsConsole /></LoginGate>;
}
