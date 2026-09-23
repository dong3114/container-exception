import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, type DbTransaction } from './database.js';
import { SystemError } from '../shared/errors/cera-error.js';

/**
 * 트랜잭션 경계(docs/24 15절 · T-069 12절).
 *
 *   DB 트랜잭션 → 커밋 → 외부 I/O(채널 · AI Server · 내용 저장소) → 새 DB 트랜잭션
 *
 * 규칙
 * 1. 트랜잭션은 `TransactionRunner.run()` 으로만 연다. 격리 수준은 기본 READ COMMITTED 를 명시한다.
 * 2. 콜백은 `tx` 만 받는다. 외부 포트를 콜백 안에서 부르면 **실행 시 거부**된다:
 *    외부 I/O 를 하는 어댑터는 호출 첫 줄에서 `assertOutsideTransaction()` 을 부른다.
 * 3. 중첩 트랜잭션(savepoint)을 열지 않는다 — 경계가 흐려진다.
 */
interface TxState {
  readonly inTransaction: true;
}

const txStorage = new AsyncLocalStorage<TxState>();

export type IsolationLevel = 'read committed' | 'repeatable read' | 'serializable';

export class ExternalCallInTransactionError extends SystemError {
  constructor(operation: string) {
    super('EXTERNAL_CALL_IN_TRANSACTION', `External call "${operation}" attempted inside a DB transaction`);
  }
}

export function isInTransaction(): boolean {
  return txStorage.getStore()?.inTransaction === true;
}

/** 외부 I/O 어댑터(채널 · AI Server · 내용 저장소)의 첫 줄에서 부른다. */
export function assertOutsideTransaction(operation: string): void {
  if (isInTransaction()) throw new ExternalCallInTransactionError(operation);
}

@Injectable()
export class TransactionRunner {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async run<T>(work: (tx: DbTransaction) => Promise<T>, options: { isolationLevel?: IsolationLevel } = {}): Promise<T> {
    if (isInTransaction()) {
      throw new SystemError('NESTED_TRANSACTION', 'Nested transactions are not allowed — keep one boundary per use case step');
    }
    return txStorage.run({ inTransaction: true }, () =>
      this.db.transaction((tx) => work(tx), { isolationLevel: options.isolationLevel ?? 'read committed' }),
    );
  }
}
