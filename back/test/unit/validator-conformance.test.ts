import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFORMANCE_PATH, HAND_CASES, buildConformance, renderConformance } from '../../src/dev/validator-conformance.js';

// 정답 파일은 이 검증기의 출력이다. 검증기를 고치면 `npm run validator-conformance:emit` 으로 다시 만들고,
// 그러면 Python 포팅 시험(ai/tests/test_validator_conformance.py)이 깨져 포팅도 같이 고치게 된다.
describe('extraction validator conformance fixture (packages/contracts/conformance)', () => {
  it('is up to date with the real validator — run `npm run validator-conformance:emit`', () => {
    expect(readFileSync(CONFORMANCE_PATH, 'utf8')).toBe(renderConformance());
  });

  it('covers the expressions the T-099 review asked for', () => {
    const ids = buildConformance().entries.map((e) => e.id);
    for (const needle of ['4대', '네 대', '두 대', '15시', '오후 3시', '오후 세 시', '15:00', 'date', 'field outside', 'quote not in source', 'conflicting', 'unit mismatch']) {
      expect(ids.some((id) => id.includes(needle)), needle).toBe(true);
    }
    expect(HAND_CASES.length).toBeGreaterThanOrEqual(40);
  });

  it('exercises both outcomes (otherwise the suite proves nothing)', () => {
    const verdicts = buildConformance().entries.flatMap((e) => e.expected.map((x) => x.passed));
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});
