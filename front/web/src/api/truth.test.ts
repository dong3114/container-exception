import { describe, expect, it } from "vitest";
import { confirmFact, correctFact, listFacts, rejectFact } from "./truth";

const capture = (status: number, body: unknown) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const impl = ((url: string, init: RequestInit) => {
    seen.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }) as unknown as typeof fetch;
  return { seen, impl };
};
const headersOf = (init: RequestInit) => init.headers as Record<string, string>;
const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, unknown>;
const EVENT = "01a11040-0000-7000-8000-0000000000e1";
const ACTOR = "01a11040-0000-7000-8000-0000000000aa";

describe("truth client", () => {
  it("lists facts of one recovery run", async () => {
    const { seen, impl } = capture(200, { facts: [] });
    await listFacts("run 1", undefined, impl);
    expect(seen[0].url).toContain("/truth/facts?recovery_run_id=run%201");
    expect(seen[0].init.method).toBe("GET");
  });

  it("confirm sends the acting operator header and a command id", async () => {
    const { seen, impl } = capture(200, {});
    await confirmFact(EVENT, "전화로 재확인", ACTOR, undefined, impl);
    expect(seen[0].url).toContain(`/truth/events/${EVENT}/confirm`);
    expect(seen[0].init.method).toBe("POST");
    expect(headersOf(seen[0].init)["X-CERA-Actor-Id"]).toBe(ACTOR);
    expect(bodyOf(seen[0].init).note).toBe("전화로 재확인");
    expect(typeof bodyOf(seen[0].init).command_id).toBe("string");
  });

  it("reject and correct send reason codes and the corrected number", async () => {
    const r = capture(200, {});
    await rejectFact(EVENT, "MODEL_MISREAD", undefined, ACTOR, undefined, r.impl);
    expect(r.seen[0].url).toContain("/reject");
    expect(bodyOf(r.seen[0].init)).toMatchObject({ reason_code: "MODEL_MISREAD" });
    expect(bodyOf(r.seen[0].init)).not.toHaveProperty("note");
    const c = capture(200, {});
    await correctFact(EVENT, 3, "OPERATOR_CORRECTION", "메모", ACTOR, undefined, c.impl);
    expect(c.seen[0].url).toContain("/correct");
    expect(bodyOf(c.seen[0].init)).toMatchObject({ value: 3, reason_code: "OPERATOR_CORRECTION", note: "메모" });
  });

  it("maps the common error body", async () => {
    const { impl } = capture(403, { code: "ACTOR_NOT_ALLOWED", message: "no", request_id: "req-9" });
    await expect(confirmFact(EVENT, undefined, ACTOR, undefined, impl)).rejects.toMatchObject({ status: 403, code: "ACTOR_NOT_ALLOWED", requestId: "req-9" });
  });
});
