import { ControlTower } from "@/components/ControlTower";
import DemoPage from "./app/demo/DemoPage";
import DevApiPage from "./app/dev/api/page";

/**
 * Minimal path switch. A router library is not chosen yet — add one when real screens need nested routes.
 * Unknown paths fall back to the Control Tower (SPA: every path serves index.html).
 */
export function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/dev/api") return <DevApiPage />;
  if (path === "/demo") return <DemoPage />;
  return <ControlTower />;
}
