import { describe, expect, it } from "vitest";
import { approvePlan, getPlan, listPlans, recalculatePlan } from "./plans";

const capture = (status: number, body: unknown) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const impl = ((url: string, init: RequestInit) => {
    seen.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }) as unknown as typeof fetch;
  return { seen, impl };
};
const RUN = "01a11040-0000-7000-8000-0000000000r1";
const PLAN = "01a11040-0000-7000-8000-0000000000p1";
const ACTOR = "01a11040-0000-7000-8000-0000000000aa";
const HASH = `sha256:${"a".repeat(64)}`;

describe("plans client (T-114) — reads engine plans, asks for a recalculation, sends a person's approval with the plan fingerprint", () => {
  it("lists versions and reads one plan", async () => {
    const { seen, impl } = capture(200, { plans: [] });
    await listPlans(RUN, undefined, impl);
    await getPlan(PLAN, undefined, impl);
    expect(seen[0].url).toContain(`/planning/runs/${RUN}/plans`);
    expect(seen[1].url).toContain(`/planning/plans/${PLAN}`);
    expect(seen.every((s) => s.init.method === "GET")).toBe(true);
  });

  it("recalculation and approval carry the acting operator; approval quotes plan_hash only (no numbers from the screen)", async () => {
    const { seen, impl } = capture(200, {});
    await recalculatePlan(RUN, ACTOR, undefined, impl);
    await approvePlan(PLAN, HASH, ACTOR, undefined, impl);
    expect(seen[0]).toMatchObject({ init: { method: "POST" } });
    expect((seen[0].init.headers as Record<string, string>)["X-CERA-Actor-Id"]).toBe(ACTOR);
    expect(seen[1].url).toContain(`/planning/plans/${PLAN}/approve`);
    expect(JSON.parse(String(seen[1].init.body))).toEqual({ plan_hash: HASH });
  });
});
