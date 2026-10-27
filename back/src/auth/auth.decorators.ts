import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions.js';

export const PUBLIC_KEY = 'cera:public';
export const PERMISSION_KEY = 'cera:permission';

/** 로그인 없이 열리는 경로(상태 확인 · 로그인 · 계약 문서), 또는 자기 인증을 따로 하는 경로(Agent 서비스 토큰). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** 이 경로에 필요한 권한(back/src/auth/permissions.ts). 변경 요청(POST · PUT · PATCH · DELETE)은 선언이 없으면 거부된다. */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);
