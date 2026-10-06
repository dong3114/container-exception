import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Client-side rendering only (SPA). No server rendering: `vite build` emits static files to dist/.
// The scenario data pack lives at the repo root (data/scenarios/), outside front/web/,
// so the backend and engines read the same files. Allow the dev server to read from the repo root.
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Main Backend (back/, NestJS). The browser calls /backend/* on this origin and Vite proxies it,
  // so the backend needs no CORS setup. Override with CERA_API_URL.
  const backendUrl = env.CERA_API_URL ?? "http://127.0.0.1:3100";
  const proxy = {
    "/backend": { target: backendUrl, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/backend/, "") },
  };

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@scenario": path.resolve(repoRoot, "data", "scenarios"),
      },
    },
    server: { port: 3000, strictPort: true, fs: { allow: [repoRoot] }, proxy },
    preview: { port: 3000, strictPort: true, proxy },
  };
});
