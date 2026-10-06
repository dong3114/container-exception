/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Data provider: "mock" (default). "api" is not implemented yet. */
  readonly VITE_CERA_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
