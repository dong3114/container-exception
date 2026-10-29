import { createContext, useContext } from "react";
import type { Me } from "@/api/auth";

/** 로그인한 사람(T-119 · T-120). 화면은 역할 · 권한으로 버튼을 숨기거나 끄기만 한다 — 막는 것은 Backend(401 · 403)다 */
export const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);

/** 로그아웃(데모 종료) — 화면 머리(AppShell)가 자기 자리에 버튼을 둘 때 쓴다. 세션을 닫는 것은 LoginGate 다 */
export const LogoutContext = createContext<(() => void) | null>(null);
export const useLogout = () => useContext(LogoutContext);
