import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The generated contract types must match the committed OpenAPI document (back → `npm run openapi:emit`,
 * then front → `npm run openapi:types`). If this fails, run `npm run openapi:types` and commit both files.
 */
describe("OpenAPI contract types", () => {
  it("packages/contracts/openapi.d.ts is regenerated from packages/contracts/openapi.json", () => {
    const generated = execFileSync(process.execPath, ["node_modules/openapi-typescript/bin/cli.js", "../../packages/contracts/openapi.json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    expect(readFileSync("../../packages/contracts/openapi.d.ts", "utf8")).toBe(generated);
  });

  it("carries the registry endpoints and the Contact Gate reason codes", () => {
    const types = readFileSync("../../packages/contracts/openapi.d.ts", "utf8");
    expect(types).toContain('"/registry/addresses/{addressId}/eligibility"');
    expect(types).toContain('"NOT_IN_TEST_ALLOWLIST"');
  });
});
