import { v7, validate, version } from 'uuid';

/**
 * 내부 식별자 = UUIDv7(docs/24 4절 D-1). Main Backend 가 실행 중에 만든다(DB 기본값 아님).
 * 알고리즘은 직접 구현하지 않고 `uuid` 패키지를 쓴다.
 * 시드·fixture 는 고정된 유효 UUIDv7 값을 쓰고 `assertUuidV7` 로 검사한다.
 */
export interface IdGenerator {
  newId(): string;
}

export const ID_GENERATOR = Symbol('CERA_ID_GENERATOR');

export class UuidV7Generator implements IdGenerator {
  newId(): string {
    return v7();
  }
}

/** 시험용: 미리 정한 값을 차례로 돌려준다(모두 UUIDv7 이어야 한다). */
export class FixedIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly ids: readonly string[]) {
    ids.forEach(assertUuidV7);
  }

  newId(): string {
    const id = this.ids[this.index];
    if (id === undefined) throw new Error('FixedIdGenerator exhausted');
    this.index += 1;
    return id;
  }
}

export function isUuidV7(value: unknown): value is string {
  return typeof value === 'string' && validate(value) && version(value) === 7 && value === value.toLowerCase();
}

export function assertUuidV7(value: unknown): asserts value is string {
  if (!isUuidV7(value)) throw new TypeError(`Not a lowercase UUIDv7: ${String(value)}`);
}
