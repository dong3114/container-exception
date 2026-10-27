import { apiRequest } from "./client";

/** 사람 로그인(T-119). 세션은 HttpOnly 쿠키 — 화면은 토큰을 보지도 저장하지도 않는다. 권한 판정은 Backend 가 한다. */
export interface Me {
  user_id: string | null;
  actor_id: string;
  login_id: string | null;
  display_name: string;
  role: "ADMIN" | "OPERATOR" | "FIELD_OPERATOR";
  permissions: string[];
  via: "SESSION" | "DEV_HEADER";
  auth_mode?: "session" | "dev-header";
}

export const ROLE_LABEL: Record<Me["role"], string> = { ADMIN: "관리자", OPERATOR: "운영자", FIELD_OPERATOR: "현장 담당자" };

export function getMe(signal?: AbortSignal) {
  return apiRequest<Me>("/auth/me", { signal });
}

export function login(loginId: string, password: string) {
  return apiRequest<Me>("/auth/login", { method: "POST", body: { login_id: loginId, password } });
}

export function logout() {
  return apiRequest<{ logged_out: boolean }>("/auth/logout", { method: "POST", body: {} });
}
