import type { ActivityItem, ActivityKind } from "@/contracts/cera";
import { hms } from "./format";

const KIND: Record<ActivityKind, [string, string, string]> = {
  FACT: ["#2463eb", "b-blue", "현실 입력"],
  STATE: ["#5b6475", "b-slate", "상태"],
  RESULT: ["#6d3fd6", "b-sim", "시뮬레이션 결과"],
  HUMAN: ["#16834a", "b-green", "사람 결정"],
  COMMS: ["#b7860b", "b-amber", "연락(가상)"],
};

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const ordered = [...items].reverse();
  return (
    <section className="card" data-testid="activity-timeline">
      <div className="card-head">
        <span className="card-title">Activity Timeline</span>
        <span className="card-meta">최신이 위 · {items.length}건</span>
      </div>
      <ol className="timeline">
        {ordered.map((i) => {
          const [dot, tone, label] = KIND[i.kind];
          return (
            <li key={`${i.at}-${i.text}`} className={`tl-item ${i.is_new_in_step ? "new" : ""}`} data-testid="activity-item">
              <span className="tl-time">{hms(i.at)}</span>
              <span className="tl-dot" style={{ background: dot }} />
              <span>
                <span className="tl-actor">{i.actor}</span>
                {i.text}
                <span className={`badge ${tone} tl-kind`}>{label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
