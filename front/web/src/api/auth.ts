import { apiRequest } from "./client";

/** 사람 로그인(T-119). 세션은 HttpOnly 쿠키 — 화면은 토큰을 보지도 저장하지도 않는다. 권한 판정은 Backend 가 한다. */
export interface Me {
  user_id: string | null;
  actor_id: string;
  login_id: string | null;
  display_name: string;
  role: "ADMIN" | "OPERATOR" | "FIELD_OPERATOR" | "DEMO_VISITOR";
  permissions: string[];
  via: "SESSION" | "DEV_HEADER";
  auth_mode?: "session" | "dev-header";
  /** 공개 포트폴리오 데모 배포(T-131)인가 — 화면 위 안내 띠를 띄운다. 막는 것은 Backend 다 */
  portfolio_demo?: boolean;
}

export const ROLE_LABEL: Record<Me["role"], string> = { ADMIN: "관리자", OPERATOR: "운영자", FIELD_OPERATOR: "현장 담당자", DEMO_VISITOR: "데모 방문자" };

export function getMe(signal?: AbortSignal) {
  return apiRequest<Me>("/auth/me", { signal });
}

export function login(loginId: string, password: string) {
  return apiRequest<Me>("/auth/login", { method: "POST", body: { login_id: loginId, password } });
}

export function logout() {
  return apiRequest<{ logged_out: boolean }>("/auth/logout", { method: "POST", body: {} });
}

/** 공개 포트폴리오 데모(T-131). 이 배포가 데모가 아니면 경로가 없다(404) → 화면은 평소 로그인 폼만 보인다 */
export interface DemoInfo {
  enabled: boolean;
  role: "DEMO_VISITOR";
  session_minutes: number;
  external_mail: "MOCK_ONLY";
  data: "SYNTHETIC";
}

export function getDemoInfo(signal?: AbortSignal) {
  return apiRequest<DemoInfo>("/auth/demo-session", { signal });
}

/** 데모 방문자 세션을 연다 — 비밀번호 없음. 관리자 · 운영자 권한은 없다(Backend 가 정한다) */
export function startDemo() {
  return apiRequest<Me>("/auth/demo-session", { method: "POST", body: {} });
}
