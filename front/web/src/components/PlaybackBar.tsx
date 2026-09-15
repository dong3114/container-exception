import type { ScenarioInfo } from "@/contracts/cera";
import { hms, md } from "./format";

interface Props {
  scenario: ScenarioInfo;
  stepIndex: number;
  asOf: string;
  playing: boolean;
  onGo: (i: number) => void;
  onReset: () => void;
  onTogglePlay: () => void;
}

export function PlaybackBar({ scenario, stepIndex, asOf, playing, onGo, onReset, onTogglePlay }: Props) {
  const last = scenario.steps.length - 1;
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="brand-title">CERA Operations Control Tower</span>
          <span className="brand-sub">부산항 Import FCL · 30대 시나리오 · Prototype</span>
        </div>
        <span className="sim-badge" title={scenario.disclaimers.join("\n")}>
          SIMULATED SCENARIO · {scenario.scenario_id}
        </span>
        <div className="clock" data-testid="clock">
          <span className="clock-time">{hms(asOf)}</span>
          <span className="clock-date">{md(asOf)} · 시나리오 시계 (Asia/Seoul)</span>
        </div>
        <nav className="playback" aria-label="시나리오 재생">
          <button className="pb-btn" onClick={onReset} data-testid="btn-reset" title="처음으로">
            ⟲ Reset
          </button>
          <button className="pb-btn" onClick={() => onGo(stepIndex - 1)} disabled={stepIndex === 0} data-testid="btn-prev" title="이전 이벤트 (←)">
            ◀ 이전
          </button>
          <button className="pb-btn primary" onClick={() => onGo(stepIndex + 1)} disabled={stepIndex === last} data-testid="btn-next" title="다음 이벤트 (→)">
            다음 이벤트 ▶
          </button>
          <button className="pb-btn" onClick={onTogglePlay} data-testid="btn-play">
            {playing ? "❚❚ 일시정지" : "▶ Play Scenario"}
          </button>
          <div className="steps" role="tablist">
            {scenario.steps.map((s) => (
              <button
                key={s.step_id}
                className={`step-dot ${s.index < stepIndex ? "done" : ""} ${s.index === stepIndex ? "current" : ""}`}
                onClick={() => onGo(s.index)}
                title={`${hms(s.as_of)} ${s.title}`}
                aria-current={s.index === stepIndex}
              >
                {s.index + 1}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
