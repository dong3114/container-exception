import { useEffect } from "react";
import type { Draft } from "@/api/drafts";
import { type FollowUpList, type FollowUpView, draftFollowUps, getFollowUps } from "@/api/ops";
import { useMe } from "@/app/MeContext";
import { useAsyncAction } from "@/state/async";
import { ContactResolver } from "./ContactResolver";
import { ErrorNotice } from "./ErrorNotice";
import { DELTA_LABEL, FOLLOW_UP_BLOCKED, FOLLOW_UP_KIND, can, messageStatus } from "./opsLabels";
import { ownerFromInquiries } from "./opsModel";

/**
 * 승인된 계획의 후속 요청(T-116) · 정정 · 취소(T-128). 계획 승인 ≠ 발송 — 여기서는 초안만 만들고, 초안마다 사람이 승인 · 발송 요청한다.
 * 이미 보낸 요청과 새 판을 Backend 가 비교한 결과(새로 필요 · 수량 변경 · 더는 필요 없음 · 상대 변경)를 그대로 보인다.
 * 담당자가 없거나 여럿이면 초안 없이 이유를 보이고, 여기서 바로 풀 수 있게 한다(T-129).
 */
export function FollowUpsPanel({ planId, runId, simulated, drafts, onChanged, onLoaded }: { planId: string; runId: string; simulated: boolean; drafts: Draft[]; onChanged: () => void; onLoaded?: (f: FollowUpList) => void }) {
  const me = useMe();
  const list = useAsyncAction((signal) => getFollowUps(planId, signal));
  const make = useAsyncAction(async (signal) => {
    const res = await draftFollowUps(planId, me!.actor_id, signal);
    onChanged();
    return res;
  });
  const { run: load } = list;
  useEffect(() => {
    load();
  }, [load, planId, make.state.status]);
  // 만들기 응답에만 막힌 이유가 있다(목록 조회는 초안 여부만) — 최근 만들기 결과가 있으면 그것을 보인다
  const shown = make.state.status === "SUCCESS" ? make.state.data : list.state.status === "SUCCESS" ? list.state.data : null;
  useEffect(() => {
    if (shown) onLoaded?.(shown);
  }, [shown, onLoaded]);

  const companyOf = (f: FollowUpView) => (f.refers_to_message_id ? (drafts.find((d) => d.message.message_id === f.refers_to_message_id)?.thread.counterparty_id ?? null) : null);
  return (
    <div style={{ display: "grid", gap: 8 }} data-testid="follow-ups" data-run-id={runId}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>승인된 계획의 후속 요청 · 정정 · 취소</b>
        <button type="button" className="act-btn" disabled={!can(me, "communication.draft") || make.state.status === "LOADING"} onClick={() => make.run()} data-testid="follow-ups-create">
          {make.state.status === "LOADING" ? "만드는 중…" : "필요한 초안 만들기"}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>초안만 만듭니다 — 보내려면 연락 탭에서 건마다 승인 · 발송 요청하세요.</span>
      </div>
      <ErrorNotice error={make.state.status === "FAILED" ? make.state.error : list.state.status === "FAILED" ? list.state.error : null} />
      {shown && shown.actions.length === 0 && <div className="muted">이 계획에는 외부에 요청할 일이 없습니다(자사 자원만 씀).</div>}
      {shown?.actions.map((f) => {
        const k = FOLLOW_UP_KIND[f.follow_up_kind] ?? { label: f.follow_up_kind, badge: "b-outline" };
        const st = messageStatus(f.message_status);
        const blocked = !f.message_id && f.blocked_reason;
        return (
          <div key={f.action_key} className="ops-subcard" data-testid="follow-up" data-kind={f.follow_up_kind} data-blocked={f.blocked_reason ?? ""}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`badge ${k.badge}`}>{k.label}</span>
              <b>{f.kind === "ODCY_RECEIVE" ? `${f.target_name} 반입` : `${f.target_name} 트럭 배차`}</b>
              <span>
                {f.date}
                {f.window ? ` ${f.window.from}~${f.window.to}` : ""} · {f.follow_up_kind === "CANCELLATION" ? `${f.previous_quantity ?? f.quantity} → 취소` : f.previous_quantity !== null ? `${f.previous_quantity} → ${f.quantity}` : `${f.quantity}`}
                {f.kind === "ODCY_RECEIVE" ? "대" : "대(트럭)"}
              </span>
              <span className="muted">{DELTA_LABEL[f.delta] ?? f.delta}</span>
              {f.message_id ? <span className={`badge ${st.badge}`}>{st.label}</span> : blocked ? <span className="badge b-amber">! 초안 없음</span> : <span className="badge b-outline">초안 전</span>}
            </div>
            {f.refers_to_message_id && <span className="muted" style={{ fontSize: 12 }}>이미 보낸 요청을 고칩니다 — 보낸 메일은 그대로 남습니다.</span>}
            {blocked && <span style={{ fontSize: 12 }}>{FOLLOW_UP_BLOCKED[f.blocked_reason!] ?? f.blocked_reason}</span>}
            {blocked && (f.blocked_reason === "CONTACT_SELECTION_REQUIRED" || f.blocked_reason === "NO_ELIGIBLE_CONTACT") && (
              <ContactResolver
                problem={{
                  scope: "FOLLOW_UP",
                  planId,
                  actionKey: f.action_key,
                  reason: f.blocked_reason,
                  counterpartyId: companyOf(f),
                  role: f.kind === "PARTNER_TRUCKS" ? "TRUCKING" : "ODCY",
                  facilityId: f.kind === "ODCY_RECEIVE" ? f.target_id : null,
                }}
                simulated={simulated}
                ownerHint={f.kind === "PARTNER_TRUCKS" ? ownerFromInquiries(drafts, f.target_id) : null}
                onResolved={() => (can(me, "communication.draft") ? make.run() : load())}
              />
            )}
          </div>
        );
      })}
      {shown && shown.unchanged.length > 0 && <span className="muted">이미 보낸 그대로라 다시 보내지 않는 요청 {shown.unchanged.length}건</span>}
    </div>
  );
}
