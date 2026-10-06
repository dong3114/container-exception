
// Backend exchange viewer: shows each request to the Main Backend and the raw response (status, headers, body).
// Development aid only — not part of the Control Tower prototype. Uses the same API base as the app (src/api/config.ts):
// raw fetch on purpose, so error statuses and headers are shown as received instead of being turned into ApiError.

import { useState } from "react";
import { API_BASE, apiUrl } from "@/api/config";

type Exchange = {
  id: number;
  method: string;
  path: string;
  sentAt: string;
  status: number | null;
  ms: number;
  headers: [string, string][];
  body: string;
  error?: string;
};

const PRESETS = ["/health", "/health/live", "/openapi.json", "/does-not-exist"];

function prettyBody(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export default function ApiExchangePage() {
  const [path, setPath] = useState("/health");
  const [log, setLog] = useState<Exchange[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  async function send(target: string) {
    const clean = target.startsWith("/") ? target : `/${target}`;
    const started = performance.now();
    const sentAt = new Date().toLocaleTimeString("ko-KR", { hour12: false });
    const base = { id: Date.now(), method: "GET", path: clean, sentAt };
    let entry: Exchange;
    try {
      const res = await fetch(apiUrl(clean), { cache: "no-store" });
      const body = await res.text();
      entry = {
        ...base,
        status: res.status,
        ms: Math.round(performance.now() - started),
        headers: [...res.headers.entries()],
        body: prettyBody(body),
      };
    } catch (e) {
      entry = {
        ...base,
        status: null,
        ms: Math.round(performance.now() - started),
        headers: [],
        body: "",
        error: e instanceof Error ? e.message : String(e),
      };
    }
    setLog((prev) => [entry, ...prev]);
    setSelected(entry.id);
  }

  const current = log.find((x) => x.id === selected) ?? null;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "var(--text)" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Backend 응답 확인</h1>
      <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>
        브라우저 → <code>{API_BASE}/*</code> → Main Backend (개발: Vite 프록시 → <code>CERA_API_URL</code>). 받은 값을 가공하지 않고 그대로 보여준다.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(path);
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
      >
        <span style={{ alignSelf: "center", fontWeight: 600 }}>GET</span>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          style={{ flex: "1 1 240px", padding: "6px 10px", border: "1px solid var(--line-strong)", borderRadius: 6, fontFamily: "monospace" }}
        />
        <button type="submit" style={btn(true)}>보내기</button>
        {PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => { setPath(p); void send(p); }} style={btn(false)}>
            {p}
          </button>
        ))}
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) 1fr", gap: 16 }}>
        <section style={panel}>
          <h2 style={h2}>주고받은 기록 ({log.length})</h2>
          {log.length === 0 && <p style={{ color: "#64748b", fontSize: 13 }}>아직 보낸 요청이 없다.</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {log.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setSelected(x.id)}
                  style={{
                    width: "100%", textAlign: "left", padding: "6px 8px", marginBottom: 4, borderRadius: 6, cursor: "pointer",
                    border: "1px solid " + (x.id === selected ? "var(--blue-border)" : "var(--line)"),
                    background: x.id === selected ? "var(--blue-soft)" : "var(--panel)",
                    fontFamily: "monospace", fontSize: 12,
                  }}
                >
                  <span style={{ color: statusColor(x.status), fontWeight: 700 }}>{x.status ?? "ERR"}</span> {x.method} {x.path}
                  <div style={{ color: "#64748b" }}>{x.sentAt} · {x.ms}ms</div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section style={panel}>
          {!current && <p style={{ color: "#64748b", fontSize: 13 }}>왼쪽에서 요청을 고르거나 새로 보낸다.</p>}
          {current && (
            <>
              <h2 style={h2}>
                {current.method} {current.path} →{" "}
                <span style={{ color: statusColor(current.status) }}>{current.status ?? "연결 실패"}</span>{" "}
                <span style={{ color: "#64748b", fontWeight: 400 }}>({current.ms}ms)</span>
              </h2>
              {current.error && (
                <p style={{ color: "var(--red)", fontSize: 13 }}>
                  {current.error} — Backend 가 켜져 있는지 확인(<code>back</code> 에서 <code>npm run dev:api</code>).
                </p>
              )}
              <h3 style={h3}>응답 헤더</h3>
              <table style={{ borderCollapse: "collapse", fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}>
                <tbody>
                  {current.headers.map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: "2px 12px 2px 0", color: "#64748b", verticalAlign: "top" }}>{k}</td>
                      <td style={{ padding: "2px 0", wordBreak: "break-all" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 style={h3}>응답 본문</h3>
              <pre style={{ background: "var(--panel-muted)", border: "1px solid var(--line)", borderRadius: 6, padding: 12, fontSize: 12, overflow: "auto", maxHeight: 520, margin: 0 }}>
                {current.body || "(비어 있음)"}
              </pre>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function statusColor(status: number | null): string {
  if (status === null || status >= 500) return "var(--red)";
  if (status >= 400) return "var(--orange)";
  return "var(--green)";
}

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13,
    border: "1px solid " + (primary ? "var(--blue)" : "var(--line-strong)"),
    background: primary ? "var(--blue)" : "var(--panel)",
    color: primary ? "#fff" : "var(--text)",
    fontFamily: primary ? "inherit" : "monospace",
  };
}

const panel: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "var(--panel)", minWidth: 0 };
const h2: React.CSSProperties = { fontSize: 15, margin: "0 0 10px", fontFamily: "monospace" };
const h3: React.CSSProperties = { fontSize: 13, margin: "0 0 6px", color: "#475569" };
