import { describe, expect, it } from "vitest";
import { confirmFact, correctFact, enterFact, listFacts, rejectFact, revokeFact } from "./truth";

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

  it("passes an optional as_of reference time", async () => {
    const { seen, impl } = capture(200, { facts: [] });
    await listFacts("r1", undefined, impl, "2026-12-01T10:00:00+09:00");
    expect(seen[0].url).toContain("/truth/facts?recovery_run_id=r1&as_of=2026-12-01T10%3A00%3A00%2B09%3A00");
    const plain = capture(200, { facts: [] });
    await listFacts("r1", undefined, plain.impl);
    expect(plain.seen[0].url).not.toContain("as_of");
  });

  it("revoke sends the reason, the operator header and a command id", async () => {
    const { seen, impl } = capture(200, {});
    await revokeFact(EVENT, ACTOR, { reason_code: "SOURCE_WITHDREW", note: "전화로 취소" }, undefined, impl);
    expect(seen[0].url).toContain(`/truth/events/${EVENT}/revoke`);
    expect(seen[0].init.method).toBe("POST");
    expect(headersOf(seen[0].init)["X-CERA-Actor-Id"]).toBe(ACTOR);
    expect(bodyOf(seen[0].init)).toMatchObject({ reason_code: "SOURCE_WITHDREW", note: "전화로 취소" });
    expect(typeof bodyOf(seen[0].init).command_id).toBe("string");
    const bare = capture(200, {});
    await revokeFact(EVENT, ACTOR, { reason_code: "OPERATOR_INVALIDATED" }, undefined, bare.impl);
    expect(bodyOf(bare.seen[0].init)).not.toHaveProperty("note");
  });

  it("manual entry posts the explicit operator intent with the operator header", async () => {
    const { seen, impl } = capture(200, {});
    await enterFact(
      ACTOR,
      { kind: "TRUCK_SLOT", target_id: EVENT, date: "2026-12-01", window_from: "15:00", window_to: "17:00", value: 3, source_note: "전화 확인", scenario_id: "s1" },
      undefined,
      impl,
    );
    expect(seen[0].url).toContain("/truth/facts/manual");
    expect(seen[0].init.method).toBe("POST");
    expect(headersOf(seen[0].init)["X-CERA-Actor-Id"]).toBe(ACTOR);
    expect(bodyOf(seen[0].init)).toMatchObject({ intent: "OPERATOR_DIRECT_ENTRY", kind: "TRUCK_SLOT", value: 3, source_note: "전화 확인", window_from: "15:00", scenario_id: "s1" });
    expect(typeof bodyOf(seen[0].init).command_id).toBe("string");
  });

  it("every action can be judged at the list's reference time (as_of)", async () => {
    const AS_OF = "2026-12-01T10:00:00+09:00";
    const encoded = "as_of=2026-12-01T10%3A00%3A00%2B09%3A00";
    const calls: [string, (impl: typeof fetch) => Promise<unknown>][] = [
      [`/truth/events/${EVENT}/confirm?${encoded}`, (impl) => confirmFact(EVENT, undefined, ACTOR, undefined, impl, AS_OF)],
      [`/truth/events/${EVENT}/reject?${encoded}`, (impl) => rejectFact(EVENT, "MODEL_MISREAD", undefined, ACTOR, undefined, impl, AS_OF)],
      [`/truth/events/${EVENT}/correct?${encoded}`, (impl) => correctFact(EVENT, 2, "OPERATOR_CORRECTION", undefined, ACTOR, undefined, impl, AS_OF)],
      [`/truth/events/${EVENT}/revoke?${encoded}`, (impl) => revokeFact(EVENT, ACTOR, { reason_code: "SOURCE_WITHDREW" }, undefined, impl, AS_OF)],
      [`/truth/facts/manual?${encoded}`, (impl) => enterFact(ACTOR, { kind: "FACILITY_CAPACITY", target_id: EVENT, date: "2026-12-01", value: 5, source_note: "방문" }, undefined, impl, AS_OF)],
    ];
    for (const [path, call] of calls) {
      const { seen, impl } = capture(200, {});
      await call(impl);
      expect(seen[0].url).toContain(path);
    }
    const plain = capture(200, {});
    await confirmFact(EVENT, undefined, ACTOR, undefined, plain.impl);
    expect(plain.seen[0].url).not.toContain("as_of");
  });

  it("maps the common error body", async () => {
    const { impl } = capture(403, { code: "ACTOR_NOT_ALLOWED", message: "no", request_id: "req-9" });
    await expect(confirmFact(EVENT, undefined, ACTOR, undefined, impl)).rejects.toMatchObject({ status: 403, code: "ACTOR_NOT_ALLOWED", requestId: "req-9" });
  });
});
