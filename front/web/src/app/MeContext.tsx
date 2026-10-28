import { createContext, useContext } from "react";
import type { Me } from "@/api/auth";

/** 로그인한 사람(T-119 · T-120). 화면은 역할 · 권한으로 버튼을 숨기거나 끄기만 한다 — 막는 것은 Backend(401 · 403)다 */
export const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);
