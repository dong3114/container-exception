import type { ActiveException, ContainerView, RecoveryPlanView, ResourceStatus, RouteCode } from "@/contracts/cera";
import { ROUTE_COLOR } from "./badges";
import { PLAN_STATUS_LABEL } from "./format";

interface Props {
  containers: ContainerView[];
  resources: ResourceStatus;
  plan: RecoveryPlanView | null;
  exception: ActiveException | null;
  onSelect: (id: string) => void;
}

// Abstract layout (not a real port layout). Coordinates are in the 1000×440 viewBox.
const TERMINAL = { x: 16, y: 34, w: 300, h: 330 };
const VESSEL = { x: 16, y: 374, w: 300, h: 58 };
const ODCY_A = { x: 468, y: 30, w: 176, h: 96 };
const ODCY_B = { x: 468, y: 262, w: 176, h: 96 };
const WH_A = { x: 790, y: 108, w: 194, h: 164 };
const WH_B = { x: 790, y: 318, w: 194, h: 68 };

export function OperationsMap({ containers, resources, plan, exception, onSelect }: Props) {
  const whA = resources.warehouses.find((w) => w.id === "WAREHOUSE_A")!;
  const whB = resources.warehouses.find((w) => w.id === "WAREHOUSE_B")!;
  const odcyA = resources.odcys.find((o) => o.id === "ODCY_A")!;
  const odcyB = resources.odcys.find((o) => o.id === "ODCY_B")!;

  const summary = plan?.route_summary_20;
  const proposed = plan?.status === "PROPOSED";
  const blocked = !plan && exception ? exception.affected_count : 0;
  const directCount = summary?.WAREHOUSE_DIRECT ?? (exception ? exception.capacity_after : whA.today.planned);
  const odcyACount = summary?.ODCY_A ?? 0;
  const odcyBCount = summary?.ODCY_B ?? 0;
  const waitCount = summary?.TERMINAL_WAIT ?? 0;
  const provisionalA = !!plan?.provisional_inputs.some((p) => p.resource_id === "ODCY_A");
  const provisionalTruck = !!plan?.provisional_inputs.some((p) => p.resource_id === "K_TRUCKING");
  const odcyAOver = odcyA.today.over_by > 0;
  const atTerminal = containers.filter((c) => c.phase !== "ARRIVING");
  const arriving = containers.filter((c) => c.phase === "ARRIVING");

  return (
    <section className="card" data-testid="operations-map">
      <div className="card-head">
        <span className="card-title">Operations Map</span>
        <span className="badge b-sim">시뮬레이션 · 실제 항만 배치 아님</span>
        {plan && (
          <span className={`badge ${proposed ? "b-amber" : "b-teal"}`}>
            {plan.label} · {PLAN_STATUS_LABEL[plan.status]}
          </span>
        )}
        <span className="card-meta">{resources.plan_basis}</span>
      </div>
      <div className="map-wrap">
        <svg className="map-svg" viewBox="0 0 1000 440" role="img" aria-label="터미널, ODCY, 창고 사이 컨테이너 흐름">
          <defs>
            {[...Object.entries(ROUTE_COLOR), ["IDLE", "#aab1bf"]].map(([code, color]) => (
              <marker key={code} id={`arrow-${code}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={color} />
              </marker>
            ))}
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#fbe4e4" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#e79a9a" strokeWidth="2" />
            </pattern>
          </defs>

          {/* ---------- routes ---------- */}
          <Route d={`M ${TERMINAL.x + TERMINAL.w} 118 C 390 118, 400 78, ${ODCY_A.x} 78`} color={ROUTE_COLOR.ODCY_A} active={odcyACount > 0} dashed={proposed} faded={provisionalA} label={odcyACount ? `${odcyACount}대 · 오늘 반출` : undefined} lx={372} ly={90} />
          <Route d={`M ${ODCY_A.x + ODCY_A.w} 78 C 720 78, 740 150, ${WH_A.x} 150`} color={ROUTE_COLOR.ODCY_A} active={odcyACount > 0} dashed faded={provisionalA} label={odcyACount ? "10/14 입고" : undefined} lx={700} ly={100} />
          <Route d={`M ${TERMINAL.x + TERMINAL.w} 300 C 390 300, 400 310, ${ODCY_B.x} 310`} color={ROUTE_COLOR.ODCY_B} active={odcyBCount > 0} dashed={proposed} faded={provisionalTruck} label={odcyBCount ? `${odcyBCount}대 · 오늘 반출` : undefined} lx={372} ly={296} />
          <Route d={`M ${ODCY_B.x + ODCY_B.w} 310 C 720 310, 740 240, ${WH_A.x} 240`} color={ROUTE_COLOR.ODCY_B} active={odcyBCount > 0} dashed label={odcyBCount ? "10/14~15 입고" : undefined} lx={700} ly={300} />
          <Route d={`M ${TERMINAL.x + TERMINAL.w} 196 L ${WH_A.x} 196`} color={ROUTE_COLOR.WAREHOUSE_DIRECT} active label={`직송 ${directCount}대 · 오늘`} lx={540} ly={188} strong />
          {blocked > 0 && (
            <g data-testid="blocked-route">
              <path d={`M ${TERMINAL.x + TERMINAL.w} 214 L ${WH_A.x - 16} 214`} stroke="#d62d2d" strokeWidth={4} strokeDasharray="7 6" fill="none" />
              <g transform={`translate(${WH_A.x - 34}, 214)`}>
                <circle r={13} fill="#d62d2d" />
                <path d="M -5 -5 L 5 5 M 5 -5 L -5 5" stroke="#fff" strokeWidth={2.6} />
              </g>
              <rect x={470} y={222} width={196} height={22} rx={5} fill="#fdeaea" stroke="#f0b3b3" />
              <text x={568} y={237} textAnchor="middle" fontSize={12} fontWeight={700} fill="#d62d2d">
                {blocked}대 수용 불가 — 막힌 경로
              </text>
            </g>
          )}
          <Route d={`M ${TERMINAL.x + TERMINAL.w} 350 L ${WH_B.x} 350`} color={ROUTE_COLOR.WAREHOUSE_B_DIRECT} active label="창고 B 3대 · 17:00" lx={540} ly={344} />

          {/* ---------- terminal ---------- */}
          <g>
            <rect x={TERMINAL.x} y={TERMINAL.y} width={TERMINAL.w} height={TERMINAL.h} rx={10} fill="#f7f8fb" stroke="#cfd4dc" />
            <text x={TERMINAL.x + 12} y={TERMINAL.y + 20} fontSize={13} fontWeight={700} fill="#121826">
              터미널 T1
            </text>
            <text x={TERMINAL.x + 76} y={TERMINAL.y + 20} fontSize={11} fill="#7a8294">
              부산신항 · 가상 배치
            </text>
            {waitCount > 0 && (
              <g>
                <rect x={TERMINAL.x + TERMINAL.w - 96} y={TERMINAL.y + 8} width={86} height={20} rx={10} fill="#fdf6dc" stroke="#e7cf7a" />
                <text x={TERMINAL.x + TERMINAL.w - 53} y={TERMINAL.y + 22} textAnchor="middle" fontSize={11} fontWeight={700} fill="#8a6408">
                  터미널 대기 {waitCount}
                </text>
              </g>
            )}
            {atTerminal.map((c, i) => (
              <ContainerCell key={c.id} c={c} x={TERMINAL.x + 14 + (i % 5) * 56} y={TERMINAL.y + 40 + Math.floor(i / 5) * 48} onSelect={onSelect} />
            ))}
            <text x={TERMINAL.x + 12} y={TERMINAL.y + TERMINAL.h - 10} fontSize={10.5} fill="#7a8294">
              모두 아직 터미널 (첫 배차 13:00) · 색 = 배정 경로
            </text>
          </g>
          <g>
            <rect x={VESSEL.x} y={VESSEL.y} width={VESSEL.w} height={VESSEL.h} rx={10} fill="#fff" stroke="#b8dfee" strokeDasharray="5 4" />
            <text x={VESSEL.x + 12} y={VESSEL.y + 20} fontSize={12} fontWeight={700} fill="#0e7fa8">
              선박 · 입항 전
            </text>
            <text x={VESSEL.x + 12} y={VESSEL.y + 38} fontSize={10.5} fill="#7a8294">
              ETA 10/14 06:00 (예상값)
            </text>
            {arriving.map((c, i) => (
              <ContainerCell key={c.id} c={c} x={VESSEL.x + 150 + i * 60} y={VESSEL.y + 18} onSelect={onSelect} />
            ))}
          </g>

          {/* ---------- ODCY ---------- */}
          <Facility box={ODCY_A} title="ODCY A" sub="40FT Dry 전용" capacity={odcyA.today.capacity} used={odcyA.today.used} overBy={odcyA.today.over_by} color={ROUTE_COLOR.ODCY_A} over={odcyAOver} provisional={provisionalA} />
          <Facility box={ODCY_B} title="ODCY B" sub="20·40FT Dry · Reefer 불가" capacity={odcyB.today.capacity} used={odcyB.today.used} overBy={odcyB.today.over_by} color={ROUTE_COLOR.ODCY_B} />

          {/* ---------- warehouses ---------- */}
          <WarehouseA box={WH_A} capacity={whA.today.capacity} normal={whA.normal_capacity_per_day} planned={whA.today.planned} used={whA.today.used} overflow={whA.today.overflow} hasPlan={!!plan} window={whA.receiving_window} />
          <g>
            <rect x={WH_B.x} y={WH_B.y} width={WH_B.w} height={WH_B.h} rx={10} fill="#fff" stroke="#cfd4dc" />
            <text x={WH_B.x + 12} y={WH_B.y + 22} fontSize={13} fontWeight={700}>
              창고 B
            </text>
            <text x={WH_B.x + 12} y={WH_B.y + 40} fontSize={11} fill="#7a8294">
              {whB.today.planned}대 / 수용 {whB.today.capacity} · 영향 없음
            </text>
          </g>
        </svg>
      </div>
      <div className="map-legend">
        <Legend color={ROUTE_COLOR.WAREHOUSE_DIRECT} label="정상 경로 (직송)" />
        <Legend color={ROUTE_COLOR.BLOCKED} label="막힌 경로" dashed />
        <Legend color={ROUTE_COLOR.ODCY_A} label="Recovery: ODCY A" />
        <Legend color={ROUTE_COLOR.ODCY_B} label="Recovery: ODCY B" />
        <span className="legend-item">
          <span className="legend-swatch" style={{ borderTopColor: "#7a8294", borderTopStyle: "dashed" }} /> 제안(승인 전)·다음 날 구간
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ borderTopColor: "#0f8a80", opacity: 0.45 }} /> 잠정 입력에 의존
        </span>
        <span className="legend-item">
          <span className="legend-box" style={{ border: "2px solid #d62d2d" }} /> 영향 컨테이너
        </span>
        <span className="legend-item">
          <span className="legend-box" style={{ border: "2px dashed #121826" }} /> 이번 계획에서 경로 변경
        </span>
      </div>
      <TruckLoad resources={resources} />
    </section>
  );
}

const routeCode = (color: string): string => Object.entries(ROUTE_COLOR).find(([, c]) => c === color)?.[0] ?? "IDLE";

function Route(props: { d: string; color: string; active: boolean; dashed?: boolean; faded?: boolean; label?: string; lx: number; ly: number; strong?: boolean }) {
  const { d, color, active, dashed, faded, label, lx, ly, strong } = props;
  return (
    <g opacity={active ? (faded ? 0.55 : 1) : 0.22}>
      <path d={d} stroke={active ? color : "#aab1bf"} strokeWidth={strong ? 5 : 3.5} fill="none" strokeDasharray={dashed ? "9 6" : undefined} markerEnd={`url(#arrow-${active ? routeCode(color) : "IDLE"})`} strokeLinecap="round" />
      {active && label && (
        <g>
          <rect x={lx - 64} y={ly - 13} width={128} height={19} rx={9} fill="#fff" stroke={color} />
          <text x={lx} y={ly + 1} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

function ContainerCell({ c, x, y, onSelect }: { c: ContainerView; x: number; y: number; onSelect: (id: string) => void }) {
  const w = c.size_type.startsWith("20") ? 34 : 50;
  const fill = ROUTE_COLOR[c.current_route as RouteCode];
  const affected = c.impact === "AFFECTED";
  const reefer = c.size_type.endsWith("RF");
  return (
    <g className="cell" onClick={() => onSelect(c.id)} style={{ cursor: "pointer" }} data-testid={`cell-${c.id}`} data-route={c.current_route}>
      <title>{`${c.id} ${c.size_label} · ${c.current_route_label} · 위험 ${c.risk.grade}`}</title>
      {c.route_changed_in_current_plan && <rect x={x - 4} y={y - 4} width={w + 8} height={30} rx={5} fill="none" stroke="#121826" strokeWidth={1.6} strokeDasharray="4 3" />}
      <rect x={x} y={y} width={w} height={22} rx={3} fill={fill} opacity={c.current_route === "PLANNED_LATER" ? 0.55 : 0.92} stroke={affected ? "#d62d2d" : "rgba(0,0,0,0.15)"} strokeWidth={affected ? 2.4 : 1} />
      <text x={x + w / 2} y={y + 15} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" style={{ pointerEvents: "none" }}>
        {c.id.slice(1)}
      </text>
      {reefer && (
        <text x={x + w - 2} y={y - 2} textAnchor="end" fontSize={9} fill="#0e7fa8" fontWeight={700}>
          ❄
        </text>
      )}
      {(c.risk.grade === "CRITICAL" || c.risk.grade === "HIGH") && <circle cx={x} cy={y} r={4.2} fill={c.risk.grade === "CRITICAL" ? "#d62d2d" : "#e06a12"} stroke="#fff" strokeWidth={1.2} />}
    </g>
  );
}

function Facility(props: { box: { x: number; y: number; w: number; h: number }; title: string; sub: string; capacity: number; used: number; overBy: number; color: string; over?: boolean; provisional?: boolean }) {
  const { box, title, sub, capacity, used, overBy, color, over, provisional } = props;
  const cells = Math.max(capacity, used, 1);
  const cw = Math.min(22, (box.w - 24) / cells - 3);
  return (
    <g data-testid={`facility-${title.replace(" ", "-")}`}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill="#fff" stroke={over ? "#d62d2d" : "#cfd4dc"} strokeWidth={over ? 2 : 1} />
      <text x={box.x + 12} y={box.y + 20} fontSize={13} fontWeight={700}>
        {title}
      </text>
      <text x={box.x + 12} y={box.y + 36} fontSize={10.5} fill="#7a8294">
        {sub}
      </text>
      {Array.from({ length: cells }, (_, i) => {
        const inCap = i < capacity;
        const isUsed = i < used;
        return (
          <rect
            key={i}
            x={box.x + 12 + i * (cw + 3)}
            y={box.y + 46}
            width={cw}
            height={16}
            rx={2}
            fill={!inCap ? "url(#hatch)" : isUsed ? color : "#eceef2"}
            stroke={!inCap ? "#d62d2d" : "rgba(0,0,0,0.12)"}
          />
        );
      })}
      <text x={box.x + 12} y={box.y + 80} fontSize={11} fill={over ? "#d62d2d" : "#4a5263"} fontWeight={over ? 700 : 500}>
        {over ? `배정 ${used} > 가용 ${capacity} · ${overBy}대 초과` : `사용 ${used} / 가용 ${capacity}`}
        {provisional ? " · 잠정" : ""}
      </text>
    </g>
  );
}

function WarehouseA(props: { box: { x: number; y: number; w: number; h: number }; capacity: number; normal: number; planned: number; used: number; overflow: number; hasPlan: boolean; window: { from: string; to: string } }) {
  const { box, capacity, normal, planned, used, overflow, hasPlan, window } = props;
  const cut = capacity < normal;
  return (
    <g data-testid="facility-WAREHOUSE_A">
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill={cut ? "#fff7f7" : "#fff"} stroke={cut ? "#d62d2d" : "#cfd4dc"} strokeWidth={cut ? 2 : 1} />
      <text x={box.x + 12} y={box.y + 22} fontSize={14} fontWeight={700}>
        창고 A
      </text>
      <text x={box.x + 64} y={box.y + 22} fontSize={10.5} fill="#7a8294">
        입고 {window.from}~{window.to}
      </text>
      {cut && (
        <g>
          <rect x={box.x + box.w - 72} y={box.y + 9} width={62} height={18} rx={9} fill="#d62d2d" />
          <text x={box.x + box.w - 41} y={box.y + 22} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff">
            설비 장애
          </text>
        </g>
      )}
      <text x={box.x + 12} y={box.y + 52} fontSize={26} fontWeight={800} fill={cut ? "#d62d2d" : "#121826"}>
        {capacity}
      </text>
      <text x={box.x + 46} y={box.y + 52} fontSize={12} fill="#7a8294">
        / 정상 {normal} · 오늘 수용
      </text>
      {Array.from({ length: planned }, (_, i) => {
        const r = Math.floor(i / 10);
        const k = i % 10;
        const inCap = i < capacity;
        return (
          <rect
            key={i}
            x={box.x + 12 + k * 17}
            y={box.y + 64 + r * 22}
            width={14}
            height={17}
            rx={2}
            fill={inCap ? "#2463eb" : hasPlan ? "#eceef2" : "url(#hatch)"}
            stroke={inCap ? "rgba(0,0,0,0.12)" : "#e79a9a"}
          />
        );
      })}
      <text x={box.x + 12} y={box.y + 128} fontSize={11} fill="#4a5263">
        입고 예정 {planned} · 오늘 {used}대 입고
      </text>
      {overflow > 0 && (
        <text x={box.x + 12} y={box.y + 146} fontSize={11} fontWeight={700} fill={hasPlan ? "#4a5263" : "#d62d2d"}>
          {hasPlan ? `이월 ${overflow}대 → 10/14 6 · 10/15 6` : `${overflow}대 들어갈 자리 없음`}
        </text>
      )}
    </g>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="legend-item">
      <span className="legend-swatch" style={{ borderTopColor: color, borderTopStyle: dashed ? "dashed" : "solid" }} />
      {label}
    </span>
  );
}

function TruckLoad({ resources }: { resources: ResourceStatus }) {
  const partnerAny = resources.truck_load_by_hour.some((h) => h.partner_available > 0);
  return (
    <div className="trucks" data-testid="truck-load">
      <div className="trucks-title">
        트럭 시간대별 사용 (출발 시각 기준)
        <span className="badge b-outline">자사 8대</span>
        {partnerAny && <span className="badge b-amber b-dashed">K운송 추가 (잠정)</span>}
        <span className="muted" style={{ fontWeight: 500, marginLeft: "auto", fontSize: 11 }}>
          ODCY B 왕복은 2시간 점유 · {resources.plan_basis}
        </span>
      </div>
      <div className="truck-grid">
        {resources.truck_load_by_hour.map((h) => (
          <div className="truck-col" key={h.hour}>
            <div className="truck-bars">
              {Array.from({ length: h.own_available }, (_, i) => (
                <span key={`o${i}`} className={`truck-cell ${i < h.own_used ? "used" : ""}`} />
              ))}
              {Array.from({ length: h.partner_available }, (_, i) => (
                <span key={`p${i}`} className={`truck-cell partner ${i < h.partner_used ? "used" : ""}`} />
              ))}
            </div>
            <div className="truck-hour">{h.hour}:00</div>
            <div className="truck-count">
              {h.own_used}/{h.own_available}
              {h.partner_available > 0 ? ` +${h.partner_used}/${h.partner_available}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
