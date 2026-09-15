import path from "node:path";
import type { NextConfig } from "next";

// The scenario data pack lives at the repo root (data/scenarios/), outside front/web/,
// so the future backend and engines read the same files. Let the bundler resolve files from the repo root.
const repoRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
