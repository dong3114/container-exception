/** npm run agent-tools:emit — Agent Tool 계약 파일을 쓴다(정본: registry.ts · schemas.ts). 단위 시험이 최신인지 검사한다. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { toolCatalog, TOOL_CONTRACT_PATH } from './tool-contracts.js';

export function renderToolContracts(): string {
  return `${JSON.stringify(toolCatalog(), null, 2)}\n`;
}

if (process.argv[1] && /emit-tool-contracts\.[tj]s$/.test(process.argv[1])) {
  mkdirSync(dirname(TOOL_CONTRACT_PATH), { recursive: true });
  writeFileSync(TOOL_CONTRACT_PATH, renderToolContracts());
  console.log(`Agent tool contracts written to ${TOOL_CONTRACT_PATH}`);
}
