import { useEffect, useState } from "react";
import { listFacilities } from "@/api/drafts";
import { approveAddress, createContact, createCounterparty, selectFollowUpContact, selectRunContact, setFacilityOperator } from "@/api/ops";
import { getCounterparties } from "@/api/registry";
import { useMe } from "@/app/MeContext";
import { useAsyncAction } from "@/state/async";
import { ErrorNotice } from "./ErrorNotice";
import { can } from "./opsLabels";
import { addressState, candidateCompanies, usable } from "./opsModel";

/**
 * 연락처 문제 풀기(T-127 · T-129 화면). CERA 는 담당자를 임의로 고르지 않는다 — 이 화면도 처음에 아무것도 골라 두지 않는다.
 * 고를 수 있는 것 = 그 회사의 지금 쓸 수 있는 주소(Contact Gate 통과 · 활성 담당자 · 실행의 Mock/Real 과 같은 종류). 중지 · 거절 · 미승인 주소는
 * 상태와 함께 보이지만 고를 수 없다. 고른 뒤에도 Backend 가 회사 · 역할 · Gate 를 다시 판정한다(WRONG_COUNTERPARTY · RECIPIENT_NOT_ELIGIBLE).
 * 등록(회사 · 담당자 · 승인)은 관리자만 — 큰 등록부 화면이 아니라 지금 일을 푸는 최소 흐름이다.
 */
export type ContactProblem =
  | { scope: "AGENT"; agentRunId: string; reason: "CONTACT_REGISTRATION_REQUIRED" | "CONTACT_SELECTION_REQUIRED"; subject: { type: string; id: string } }
  | { scope: "FOLLOW_UP"; planId: string; actionKey: string; reason: "NO_ELIGIBLE_CONTACT" | "CONTACT_SELECTION_REQUIRED"; counterpartyId: string | null; role: "ODCY" | "TRUCKING"; facilityId: string | null };

const STATUS_BADGE: Record<string, { label: string; badge: string }> = {
  ACTIVE: { label: "● 사용 중", badge: "b-green" },
  PAUSED: { label: "❚❚ 잠시 중지", badge: "b-orange" },
  INACTIVE: { label: "⊘ 사용 안 함", badge: "b-slate" },
  REJECTED: { label: "✕ 거절됨", badge: "b-red" },
  PENDING: { label: "⏳ 승인 전", badge: "b-amber" },
  UNVERIFIED: { label: "? 확인 전", badge: "b-amber" },
};
export function ContactResolver({ problem, simulated, onResolved }: { problem: ContactProblem; simulated: boolean; onResolved: () => void }) {
  const me = useMe();
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const parties = useAsyncAction((signal) => getCounterparties(signal));
  const facilities = useAsyncAction((signal) => listFacilities(signal));
  const { run: loadParties } = parties;
  const { run: loadFacilities } = facilities;
  useEffect(() => {
    loadParties();
    loadFacilities();
  }, [loadParties, loadFacilities]);

  const facilityId = problem.scope === "AGENT" ? (problem.subject.type === "FACILITY" ? problem.subject.id : null) : problem.facilityId;
  const facility = facilities.state.status === "SUCCESS" ? (facilities.state.data.facilities.find((f) => f.facility_id === facilityId) ?? null) : null;
  const ownerId = problem.scope === "FOLLOW_UP" && problem.counterpartyId ? problem.counterpartyId : (facility?.operator_counterparty_id ?? null);
  const role = problem.scope === "FOLLOW_UP" ? problem.role : problem.subject.type === "TRUCK_POOL" ? "TRUCKING" : (facility?.facility_type ?? null);
  const all = parties.state.status === "SUCCESS" ? parties.state.data.counterparties : [];
  const companies = candidateCompanies(all, ownerId, role);
  const ownerUnknown = !ownerId && problem.scope === "AGENT" && problem.subject.type === "TRUCK_POOL";

  const select = useAsyncAction(async (signal, addressId: string) => {
    const res =
      problem.scope === "AGENT"
        ? await selectRunContact(problem.agentRunId, addressId, note.trim() || undefined, me!.actor_id, signal)
        : await selectFollowUpContact(problem.planId, problem.actionKey, addressId, note.trim() || undefined, me!.actor_id, signal);
    onResolved();
    return res;
  });

  const needsChoice = problem.reason === "CONTACT_SELECTION_REQUIRED";
  return (
    <div className="ops-subcard" data-testid="contact-resolver" data-reason={problem.reason}>
      <b>{needsChoice ? "☎ 이번 건을 받을 담당자를 고르세요" : facilityId && !ownerId ? "☎ 이 시설의 운영 회사가 등록되어 있지 않습니다" : "☎ 이 시설에 연락 가능한 담당자가 없습니다"}</b>
      <span className="muted" style={{ fontSize: 12 }}>
        {facility ? `대상: ${facility.facility_name}` : problem.scope === "AGENT" ? `대상: ${problem.subject.type === "TRUCK_POOL" ? "트럭 풀" : "시설"} ${problem.subject.id.slice(-6)}` : ""}
        {" · "}선택은 이번 한 건에만 적용됩니다(기본 담당자를 바꾸지 않음).
      </span>
      {ownerUnknown && <span className="badge b-outline" style={{ whiteSpace: "normal" }}>트럭 풀의 소유 운송사는 화면에서 알 수 없어 운송사 목록을 보여 줍니다 — 다른 회사의 담당자를 고르면 CERA 가 거부합니다.</span>}

      {companies.map((c) => (
        <div key={c.counterparty_id} style={{ display: "grid", gap: 4 }} data-testid="contact-company">
          <span>
            <b>{c.display_name}</b> <span className="muted">({c.source_role})</span>
          </span>
          {c.contacts.length === 0 && <span className="muted">등록된 담당자가 없습니다.</span>}
          {c.contacts.flatMap((p) =>
            p.addresses.map((a) => {
              const st = STATUS_BADGE[p.is_active ? addressState(a) : "INACTIVE"]!;
              const ok = usable(a, p.is_active, simulated);
              return (
                <label key={a.address_id} className={`ops-contact${ok ? "" : " disabled"}`} data-testid="contact-option" data-usable={ok ? "true" : "false"}>
                  <input type="radio" name="contact" value={a.address_id} disabled={!ok || !needsChoice} checked={chosen === a.address_id} onChange={() => setChosen(a.address_id)} />
                  <span>{p.person_name ?? "담당자"}</span>
                  {p.team && <span className="muted">{p.team}</span>}
                  <span className="badge b-outline">{a.channel_type === "MOCK" ? "가상 메일" : a.channel_type}</span>
                  <span className="mono">{a.normalized_address}</span>
                  <span className={`badge ${st.badge}`}>{p.is_active ? st.label : "⊘ 담당자 비활성"}</span>
                  {!ok && a.eligible && a.is_simulated !== simulated && <span className="muted">(이 실행에 쓸 수 없는 종류)</span>}
                </label>
              );
            }),
          )}
        </div>
      ))}

      {needsChoice && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input placeholder="메모(선택) — 왜 이 사람인가" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} style={{ minWidth: 220 }} />
          <button
            type="button"
            className="act-btn primary"
            disabled={!chosen || !can(me, "contact.select") || select.state.status === "LOADING"}
            onClick={() => chosen && select.run(chosen)}
            data-testid="contact-select-submit"
            title={can(me, "contact.select") ? undefined : "운영자 · 관리자만 고를 수 있습니다"}
          >
            {select.state.status === "LOADING" ? "보내는 중…" : "이 담당자로 진행"}
          </button>
          {!can(me, "contact.select") && <span className="muted">운영자 · 관리자만 고를 수 있습니다.</span>}
        </div>
      )}
      <ErrorNotice error={select.state.status === "FAILED" ? select.state.error : null} />
      {select.state.status === "SUCCESS" && <span className="badge b-green">✓ 선택을 기록했습니다 — Agent · 초안이 이 담당자로 이어 갑니다</span>}

      {can(me, "registry.manage") ? (
        <Registration open={!needsChoice} facilityId={facilityId} facilityType={facility?.facility_type ?? null} ownerId={ownerId} simulated={simulated} onChanged={() => { loadParties(); loadFacilities(); onResolved(); }} />
      ) : (
        !needsChoice && <span className="muted">담당자 등록은 관리자가 합니다. 급하면 사실 탭에서 값을 직접 입력할 수 있습니다.</span>
      )}
    </div>
  );
}

/** 관리자의 최소 등록 흐름: (운영 회사가 없으면) 회사 등록 · 시설 연결 → 담당자 · 주소 등록 → CERA 밖에서 확인한 주소 승인 */
function Registration({ open, facilityId, facilityType, ownerId, simulated, onChanged }: { open: boolean; facilityId: string | null; facilityType: string | null; ownerId: string | null; simulated: boolean; onChanged: () => void }) {
  const me = useMe();
  const [company, setCompany] = useState("");
  const [person, setPerson] = useState("");
  const [address, setAddress] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const addCompany = useAsyncAction(async (signal) => {
    const cp = await createCounterparty({ display_name: company.trim(), source_role: facilityType as "ODCY" | "WAREHOUSE" }, me!.actor_id, signal);
    if (facilityId) await setFacilityOperator(facilityId, cp.data.counterparty_id, me!.actor_id, signal);
    onChanged();
    return cp;
  });
  const addContact = useAsyncAction(async (signal) => {
    const res = await createContact(ownerId!, { person_name: person.trim(), channel_type: simulated ? "MOCK" : "GMAIL", address: address.trim() }, me!.actor_id, signal);
    const wanted = address.trim().toLowerCase();
    const added = res.data.contacts.flatMap((p) => p.addresses).find((a) => a.normalized_address === wanted);
    if (added && confirmed) await approveAddress(added.address_id, me!.actor_id, signal);
    setPerson("");
    setAddress("");
    setConfirmed(false);
    onChanged();
    return res;
  });
  return (
    <details className="ops-subcard" data-testid="contact-registration" open={open || !ownerId}>
      <summary>
        <b>관리자: 담당자 등록</b>
      </summary>
      {!ownerId && facilityId && facilityType && (
        <form
          style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (company.trim()) addCompany.run();
          }}
        >
          <span>1. 운영 회사</span>
          <input placeholder="회사 이름" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={100} data-testid="reg-company" />
          <button type="submit" className="act-btn" disabled={!company.trim() || addCompany.state.status === "LOADING"} data-testid="reg-company-submit">
            회사 등록 · 이 시설에 연결
          </button>
          <ErrorNotice error={addCompany.state.status === "FAILED" ? addCompany.state.error : null} />
        </form>
      )}
      {ownerId && (
        <form
          style={{ display: "grid", gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (person.trim() && address.trim()) addContact.run();
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span>{facilityId && !ownerId ? "2." : ""} 담당자</span>
            <input placeholder="이름 · 팀" value={person} onChange={(e) => setPerson(e.target.value)} maxLength={60} data-testid="reg-person" />
            <input placeholder={simulated ? "가상 메일 주소" : "이메일 주소"} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} data-testid="reg-address" />
            <span className="badge b-outline">{simulated ? "가상 메일(MOCK)" : "Gmail"}</span>
          </div>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="reg-confirmed" /> 이 주소가 그 회사 담당자의 것임을 CERA 밖에서(전화 · 기존 거래) 확인했습니다 — 체크하면 바로 승인합니다. 체크하지 않으면 승인 전 상태로 남습니다.
          </label>
          <button type="submit" className="act-btn" disabled={!person.trim() || !address.trim() || addContact.state.status === "LOADING"} style={{ justifySelf: "start" }} data-testid="reg-contact-submit">
            담당자 등록{confirmed ? " · 승인" : ""}
          </button>
          <ErrorNotice error={addContact.state.status === "FAILED" ? addContact.state.error : null} />
          {addContact.state.status === "SUCCESS" && <span className="badge b-green">✓ 등록했습니다{confirmed ? " · 승인" : " (승인 전 — 아직 쓸 수 없음)"}</span>}
        </form>
      )}
    </details>
  );
}
