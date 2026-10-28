import { ApiError } from "@/api/errors";
import { errorText } from "./opsLabels";

/** 오류를 운영자 말로 — 코드 · 요청 id 는 펼쳐 보기에만(비밀값 · 토큰은 Backend 응답에 없다) */
export function ErrorNotice({ error }: { error: ApiError | null | undefined }) {
  if (!error || error.kind === "ABORTED") return null;
  return (
    <div role="alert" className="badge b-red" style={{ whiteSpace: "normal", justifySelf: "start", display: "grid", gap: 2, textAlign: "left" }} data-testid="ops-error" data-code={error.code}>
      <span>✕ {errorText(error)}</span>
      <details style={{ fontSize: 11 }}>
        <summary>기술 상세</summary>
        <span className="mono">
          code {error.code}
          {error.status ? ` · HTTP ${error.status}` : ""}
          {error.requestId ? ` · request ${error.requestId}` : ""}
        </span>
        {error.message && <div className="mono">{error.message}</div>}
      </details>
    </div>
  );
}
