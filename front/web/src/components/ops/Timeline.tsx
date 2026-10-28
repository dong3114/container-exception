import type { TimelineEntry } from "./opsModel";

const WHO: Record<TimelineEntry["who"], string> = { AGENT: "🤖 Agent", HUMAN: "👤 사람", SYSTEM: "⚙ 시스템", PARTNER: "✉ 상대" };

/** 이 실행에서 일어난 일 — 이미 있는 기록(Agent 단계 · 메시지 · 승인 · 계획)을 시간 순서로 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <div className="muted">아직 기록이 없습니다.</div>;
  return (
    <ol className="ops-timeline" data-testid="ops-timeline">
      {entries.map((e, i) => (
        <li key={`${e.at}:${i}`}>
          <span className="mono muted">{e.at.slice(5, 19).replace("T", " ")}</span>
          <span className="badge b-outline">{WHO[e.who]}</span>
          <span>{e.text}</span>
        </li>
      ))}
    </ol>
  );
}
