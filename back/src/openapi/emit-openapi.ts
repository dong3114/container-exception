import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ApiModule } from '../app/api.module.js';
import { parseEnv } from '../config/env.js';
import { buildOpenApiDocument } from '../http/openapi.js';

/**
 * `npm run openapi:emit` — 생성된 OpenAPI 문서를 공유 계약 영역(packages/contracts/openapi.json)에 쓴다.
 * DB 에 접속하지 않는다(문서 생성은 컨트롤러 메타데이터만 읽는다 — 풀은 첫 질의 때 연결한다).
 */
export const OPENAPI_CONTRACT_PATH = '../packages/contracts/openapi.json';

export async function renderOpenApiJson(): Promise<string> {
  const env = parseEnv({ APP_ENV: 'test', DATABASE_URL: 'postgres://openapi-emit@127.0.0.1:1/none', LOG_LEVEL: 'error' });
  const app = await NestFactory.create(ApiModule.forRoot(env), { logger: false });
  try {
    return `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`;
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const json = await renderOpenApiJson();
  mkdirSync(dirname(OPENAPI_CONTRACT_PATH), { recursive: true });
  writeFileSync(OPENAPI_CONTRACT_PATH, json);
  console.log(`OpenAPI written to ${OPENAPI_CONTRACT_PATH}`);
}

if (process.argv[1]?.endsWith('emit-openapi.ts') || process.argv[1]?.endsWith('emit-openapi.js')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
