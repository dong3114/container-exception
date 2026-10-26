import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ScenarioPack } from './scenario-input.js';

/** 시나리오 데이터 팩 파일 읽기(합성 데이터). 계산은 하지 않는다 — `planningInputFromScenario` 가 한다. */
export function loadScenarioPack(dir: string): ScenarioPack {
  const read = (f: string) => JSON.parse(readFileSync(join(resolve(dir), f), 'utf8')) as unknown;
  return {
    scenario: read('scenario.json') as ScenarioPack['scenario'],
    containers: read('containers.json') as ScenarioPack['containers'],
    resources: read('resources.json') as ScenarioPack['resources'],
  };
}
