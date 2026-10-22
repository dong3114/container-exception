/**
 * npm run env:check — 로컬 .env 가 .env.example 보다 뒤처졌는지 본다(키 이름만 비교, 값은 읽어도 출력하지 않는다).
 * 빠진 키는 기본값으로 동작하지만, 파일만 보고 설정을 알 수 없게 되므로 알려 준다. 종료 코드: 0 = 같음, 1 = 차이 있음.
 */
import { existsSync, readFileSync } from 'node:fs';

export function envKeys(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((l) => /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(l)?.[1]).filter((k): k is string => !!k))];
}

function main(): void {
  const [examplePath, localPath] = ['.env.example', '.env'];
  if (!existsSync(localPath)) {
    console.log(`${localPath} 없음 — cp ${examplePath} ${localPath} 로 만든다`);
    process.exit(1);
  }
  const example = envKeys(readFileSync(examplePath, 'utf8'));
  const local = new Set(envKeys(readFileSync(localPath, 'utf8')));
  const missing = example.filter((k) => !local.has(k));
  const extra = [...local].filter((k) => !example.includes(k));
  if (missing.length) console.log(`.env 에 없는 키(기본값으로 동작): ${missing.join(', ')}`);
  if (extra.length) console.log(`.env.example 에 없는 키(오타 · 옛 키일 수 있음): ${extra.join(', ')}`);
  if (!missing.length && !extra.length) console.log('.env 키 목록이 .env.example 과 같다');
  process.exit(missing.length || extra.length ? 1 : 0);
}

if (process.argv[1] && /env-check\.[tj]s$/.test(process.argv[1])) main();
