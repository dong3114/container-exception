import type { CeraDataProvider } from "./provider";
import { MockProvider } from "./mock/mock-provider";

/**
 * Provider switch. Only "mock" exists today; "api" (ApiProvider → Main Backend) replaces it later
 * without touching components. Set VITE_CERA_PROVIDER to choose.
 */
export const PROVIDER_KIND: "mock" | "api" = import.meta.env.VITE_CERA_PROVIDER === "api" ? "api" : "mock";

export function createProvider(): CeraDataProvider {
  const kind = import.meta.env.VITE_CERA_PROVIDER ?? "mock";
  // "api" arrives screen by screen from T-087, once each backend endpoint and its OpenAPI contract exist.
  if (kind !== "mock") throw new Error(`CERA provider "${kind}" is not implemented yet (only "mock")`);
  return new MockProvider();
}
