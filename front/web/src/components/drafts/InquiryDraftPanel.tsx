import { useEffect, useMemo, useState } from "react";
import { type CreateDraftRequest, type Draft, type StructuredValueInput, createDraft, listApprovers, listDrafts, listFacilities, listRuns } from "@/api/drafts";
import { getCounterparties } from "@/api/registry";
import type { IsoDateTime, RecoveryPlanView } from "@/contracts/cera";
import { useAsyncAction } from "@/state/async";
import { AsyncStatus } from "../workflow/AsyncStatus";
import { DraftView } from "./DraftView";
import { InboundLog } from "./InboundViews";

type Intent = CreateDraftRequest["intent"];
interface Form {
  addressId: string;
  intent: Intent;
  facilityId: string;
  quantity: string;
  date: string;
  from: string;
  to: string;
  sizeType: string;
}
/** 계획에서 가져온 값의 출처(실행 · 경로). 운영자가 값을 고치면 그 값은 계획 출처를 잃는다. */
interface PlanSource {
  runId: string;
  triggerRef: string;
  paths: Partial<Record<"quantity" | "date" | "from" | "to", string>>;
}

/**
 * 문의 초안 — **실제 Backend**(PostgreSQL 에 저장). 나머지 Control Tower 는 시나리오 재생(Mock) 그대로다.
 * 화면은 값(계획 부족분 또는 운영자 입력)을 보내고, Contact Gate · 질문 대상 · 숫자 검사 · 승인 가능 여부는 Backend 가 정한다.
 * 승인 · 반려 · 승인 취소는 Backend API 를 부른다(T-089). 실제 발송은 아직 없다(다음 단계).
 * 승인자는 인증이 생기기 전까지 Backend 의 활성 운영자 목록에서 고른다 — Backend 가 다시 확인한다.
 */
export function InquiryDraftPanel({ plan, asOf }: { plan: RecoveryPlanView | null; asOf: IsoDateTime }) {
  const registry = useAsyncAction((signal) => getCounterparties(signal));
  const runs = useAsyncAction((signal) => listRuns(signal));
  const facilities = useAsyncAction((signal) => listFacilities(signal));
  const drafts = useAsyncAction((signal) => listDrafts(signal));
  const approvers = useAsyncAction((signal) => listApprovers(signal));
  const [current, setCurrent] = useState<Draft | null>(null);
  const [approverChoice, setApproverChoice] = useState<string | null>(null);
  const { run: loadRegistry } = registry;
  const { run: loadRuns } = runs;
  const { run: loadFacilities } = facilities;
  const { run: loadDrafts } = drafts;
  const { run: loadApprovers } = approvers;
  // 만든 초안을 바로 보여주고 목록을 새로 읽는다(요청이 끝난 그 자리에서 — effect 로 상태를 옮기지 않는다)
  const create = useAsyncAction(async (signal, body: CreateDraftRequest) => {
    const res = await createDraft(body, signal);
    setCurrent(res.data);
    loadDrafts();
    return res;
  });
  const [source, setSource] = useState<PlanSource | null>(null);
  const [form, setForm] = useState<Form>({ addressId: "", intent: "TRUCK_SLOT", facilityId: "", quantity: "", date: asOf.slice(0, 10), from: "", to: "", sizeType: "" });

  useEffect(() => {
    loadRegistry();
    loadRuns();
    loadFacilities();
    loadDrafts();
    loadApprovers();
  }, [loadRegistry, loadRuns, loadFacilities, loadDrafts, loadApprovers]);
  const approverList = approvers.state.status === "SUCCESS" ? approvers.state.data.approvers : [];
  const approverId = approverChoice ?? approverList[0]?.actor_id ?? null;

  const addresses = useMemo(
    () =>
      registry.state.status === "SUCCESS"
        ? registry.state.data.counterparties.flatMap((cp) =>
            cp.contacts.flatMap((c) => c.addresses.map((a) => ({ ...a, label: `${cp.display_name} · ${c.person_name}`, role: cp.source_role }))),
          )
        : [],
    [registry.state],
  );
  const selected = addresses.find((a) => a.address_id === form.addressId) ?? null;

  // 계획 부족분 중 숫자가 있는 트럭 부족분(예: "15:00–17:00 트럭 2대")을 구조화 값으로 불러온다.
  const truckGapIndex = plan?.resource_gaps.findIndex((g) => g.type === "TRUCK" && g.needed && g.window) ?? -1;
  const truckGap = plan && truckGapIndex >= 0 ? plan.resource_gaps[truckGapIndex] : null;
  const planRun = runs.state.status === "SUCCESS" && plan ? runs.state.data.runs.find((r) => r.trigger_ref === plan.plan_id) ?? null : null;

  const loadTruckGap = () => {
    if (!truckGap?.window || !truckGap.needed) return;
    const [from, to] = truckGap.window.split(/[–~-]/).map((t) => t.trim());
    const trucker = addresses.find((a) => a.role === "TRUCKING" && a.eligible);
    setForm((f) => ({ ...f, intent: "TRUCK_SLOT", addressId: trucker?.address_id ?? f.addressId, quantity: String(truckGap.needed), from: from ?? "", to: to ?? "", date: asOf.slice(0, 10) }));
    setSource(
      planRun
        ? {
            runId: planRun.run_id,
            triggerRef: planRun.trigger_ref ?? plan?.plan_id ?? "",
            paths: { quantity: `resource_gaps[${truckGapIndex}].needed`, from: `resource_gaps[${truckGapIndex}].window`, to: `resource_gaps[${truckGapIndex}].window` },
          }
        : null,
    );
  };

  const edit = (key: keyof Form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    // 손으로 바꾼 값은 더 이상 계획 값이 아니다
    setSource((s) => (s && key in s.paths ? { ...s, paths: { ...s.paths, [key]: undefined } } : s));
  };

  const submit = () => {
    const path = (k: keyof PlanSource["paths"]) => source?.paths[k] ?? null;
    const values: StructuredValueInput[] = [
      { key: "quantity", value_number: Number(form.quantity), unit: form.intent === "TRUCK_SLOT" ? "TRUCK" : "CONTAINER", source_path: path("quantity") },
      { key: "date", value_text: form.date, source_path: path("date") },
    ];
    if (form.intent === "TRUCK_SLOT") {
      values.push({ key: "window_from", value_text: form.from, source_path: path("from") }, { key: "window_to", value_text: form.to, source_path: path("to") });
    } else if (form.sizeType) {
      values.push({ key: "size_type", value_text: form.sizeType });
    }
    const usesRun = values.some((v) => v.source_path);
    const scenarioId = runs.state.status === "SUCCESS" ? runs.state.data.runs.find((r) => r.scenario_id)?.scenario_id ?? null : null;
    create.run({
      address_id: form.addressId,
      intent: form.intent,
      target_id: form.intent === "FACILITY_CAPACITY" ? form.facilityId : null,
      source_run_id: usesRun ? source?.runId ?? null : null,
      scenario_id: usesRun ? null : scenarioId,
      values,
    });
  };

  const recent = drafts.state.status === "SUCCESS" ? drafts.state.data.drafts.filter((d) => d.message.status !== "CLOSED").slice(0, 5) : [];

  return (
    <section className="card" data-testid="inquiry-drafts">
      <div className="card-head">
        <span className="card-title">문의 초안</span>
        <span className="badge b-blue">Backend · 실제 저장</span>
        <span className="badge b-sim">MOCK 채널 · 실제 발송 없음</span>
        <span className="card-meta">
          <AsyncStatus state={registry.state} onRetry={registry.run} loadingLabel="등록부 불러오는 중…" />
        </span>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 12 }}>
        <form
          style={{ display: "grid", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div style={row}>
            {truckGap && (
              <button type="button" className="act-btn" onClick={loadTruckGap} data-testid="btn-load-gap">
                계획 {plan?.plan_id} 부족분 불러오기 — {truckGap.window} 트럭 {truckGap.needed}대
              </button>
            )}
            {source && <span className="badge b-teal">계획 {source.triggerRef} 값 사용 중</span>}
            {truckGap && !planRun && runs.state.status === "SUCCESS" && <span className="muted" style={{ fontSize: 11 }}>Backend 에 이 계획의 실행이 없어 계획 무관 값으로 보낸다</span>}
          </div>
          <div style={row}>
            <label style={label}>
              받는 곳
              <select value={form.addressId} onChange={(e) => setForm((f) => ({ ...f, addressId: e.target.value }))} style={input} data-testid="select-address">
                <option value="">선택</option>
                {addresses.map((a) => (
                  <option key={a.address_id} value={a.address_id}>
                    {a.label} {a.eligible ? "" : `— 발송 불가(${a.reasons.map((r) => r.code).join(", ")})`}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              문의 종류
              <select value={form.intent} onChange={(e) => setForm((f) => ({ ...f, intent: e.target.value as Intent }))} style={input} data-testid="select-intent">
                <option value="TRUCK_SLOT">트럭 추가 배차 가능 여부</option>
                <option value="FACILITY_CAPACITY">시설 수용 가능 수량</option>
              </select>
            </label>
            {form.intent === "FACILITY_CAPACITY" && (
              <label style={label}>
                시설
                <select value={form.facilityId} onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))} style={input} data-testid="select-facility">
                  <option value="">선택</option>
                  {facilities.state.status === "SUCCESS" &&
                    facilities.state.data.facilities
                      .filter((f) => f.facility_type !== "TERMINAL")
                      .map((f) => (
                        <option key={f.facility_id} value={f.facility_id}>
                          {f.facility_name}
                        </option>
                      ))}
                </select>
              </label>
            )}
          </div>
          <div style={row}>
            <label style={label}>
              수량
              <input type="number" min={1} value={form.quantity} onChange={(e) => edit("quantity", e.target.value)} style={{ ...input, width: 80 }} data-testid="input-quantity" />
            </label>
            <label style={label}>
              날짜
              <input type="date" value={form.date} onChange={(e) => edit("date", e.target.value)} style={input} />
            </label>
            {form.intent === "TRUCK_SLOT" ? (
              <>
                <label style={label}>
                  시작
                  <input type="time" value={form.from} onChange={(e) => edit("from", e.target.value)} style={input} />
                </label>
                <label style={label}>
                  종료
                  <input type="time" value={form.to} onChange={(e) => edit("to", e.target.value)} style={input} />
                </label>
              </>
            ) : (
              <label style={label}>
                규격(선택)
                <input value={form.sizeType} placeholder="40DRY" onChange={(e) => setForm((f) => ({ ...f, sizeType: e.target.value.toUpperCase() }))} style={{ ...input, width: 90 }} />
              </label>
            )}
            <button type="submit" className="act-btn primary" disabled={!form.addressId || create.state.status === "LOADING"} data-testid="btn-create-draft">
              초안 만들기
            </button>
          </div>
          {selected && !selected.eligible && (
            <span className="badge b-red" style={{ justifySelf: "start" }}>
              이 주소는 지금 발송 자격이 없습니다 — 초안을 만들 수 없습니다
            </span>
          )}
          <div style={row}>
            <AsyncStatus state={create.state} onRetry={submit} loadingLabel="초안 만드는 중…" />
            {create.state.status === "FAILED" && <span style={{ fontSize: 12 }} data-testid="create-error">{create.state.error.message}</span>}
          </div>
        </form>

        <div style={row}>
          <label style={label}>
            승인자 (개발용 — 인증 전)
            <select value={approverId ?? ""} onChange={(e) => setApproverChoice(e.target.value || null)} style={input} data-testid="select-approver">
              {approverList.length === 0 && <option value="">등록된 운영자 없음</option>}
              {approverList.map((a) => (
                <option key={a.actor_id} value={a.actor_id}>
                  {a.display_name}
                </option>
              ))}
            </select>
          </label>
          <AsyncStatus state={approvers.state} onRetry={approvers.run} loadingLabel="운영자 불러오는 중…" />
        </div>

        {current && (
          <DraftView
            key={`${current.message.message_id}:${current.approval.history.length}`}
            draft={current}
            approverId={approverId}
            onChanged={(d) => {
              setCurrent(d);
              loadDrafts();
            }}
          />
        )}

        <InboundLog />

        <div>
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>최근 초안 (Backend)</div>
          {drafts.state.status === "SUCCESS" && recent.length === 0 && <div className="empty">아직 만든 초안이 없습니다.</div>}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }} data-testid="recent-drafts">
            {recent.map((d) => (
              <li key={d.message.message_id}>
                <button type="button" className="act-btn row" onClick={() => setCurrent(d)}>
                  <span className={`badge ${d.approval.state === "ACTIVE" ? "b-teal" : d.approval_ready ? "b-green" : "b-red"}`}>
                    {d.approval.state === "ACTIVE" ? "승인됨" : d.approval_ready ? "승인 가능" : "승인 불가"}
                  </span>{" "}
                  {d.thread.counterparty_name} · {d.question?.question_text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" };
const label: React.CSSProperties = { display: "grid", gap: 2, fontSize: 11.5, color: "var(--text-3)" };
const input: React.CSSProperties = { padding: "5px 8px", border: "1px solid var(--line-strong)", borderRadius: 6, font: "inherit", fontSize: 12.5, color: "var(--text)" };
