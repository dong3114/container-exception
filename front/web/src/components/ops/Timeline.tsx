import { EmptyState } from "@/components/ui/primitives";
import type { TimelineEntry } from "./opsModel";

const WHO: Record<TimelineEntry["who"], { label: string; icon: string }> = {
  AGENT: { label: "Agent", icon: "◆" },
  HUMAN: { label: "사람", icon: "👤" },
  SYSTEM: { label: "시스템", icon: "⚙" },
  PARTNER: { label: "상대 업체", icon: "✉" },
};

/** 이 실행에서 일어난 일 — 이미 있는 기록(Agent 단계 · 메시지 · 승인 · 계획)을 시간 순서로. 누가 했는지를 늘 함께 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0)
    return (
      <EmptyState icon="◷" title="아직 기록이 없습니다.">
        Agent 시작 · 문의 · 승인 · 답장 · 계획이 생기면 시간 순서로 쌓입니다. 기록은 지워지지 않습니다.
      </EmptyState>
    );
  return (
    <ol className="v-timeline" data-testid="ops-timeline">
      {entries.map((e, i) => (
        <li key={`${e.at}:${i}`} className={`vt-who-${e.who.toLowerCase()}`}>
          <span className="vt-dot" aria-hidden>
            {WHO[e.who].icon}
          </span>
          <span className="vt-time mono">{e.at.slice(5, 16).replace("T", " ")}</span>
          <span className="vt-body">
            <span className="vt-who">{WHO[e.who].label}</span> {e.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
