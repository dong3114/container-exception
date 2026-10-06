import type { CeraDataProvider } from "./provider";
import { MockProvider } from "./mock/mock-provider";

/**
 * Provider switch. Only "mock" exists today; "api" (ApiProvider → Main Backend) replaces it later
 * without touching components. Set VITE_CERA_PROVIDER to choose.
 */
export function createProvider(): CeraDataProvider {
  const kind = import.meta.env.VITE_CERA_PROVIDER ?? "mock";
  if (kind !== "mock") throw new Error(`CERA provider "${kind}" is not implemented yet (only "mock")`);
  return new MockProvider();
}
