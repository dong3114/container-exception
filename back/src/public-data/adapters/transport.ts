import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertOutsideTransaction } from '../../db/transaction.js';
import type { Clock } from '../../shared/time/clock.js';
import type { Instant } from '../../shared/time/instant.js';
import type { PublicDataDataset, PublicDataMode } from '../contracts.js';
import type { DatasetSpec } from './datasets.js';

/**
 * 공공 API 전송 포트. 어댑터(데이터셋별 요청 · 페이지)는 이 포트만 부르고, 실제 HTTP 와 녹화 재생이 이 뒤에 숨는다.
 * 인증키는 **실제 전송 구현 안에서만** 요청에 붙고, 호출 결과 · 오류 · 로그 어디에도 남지 않는다.
 * 트랜잭션 안에서 부르지 않는다(외부 I/O — ADR-033 결정 8②).
 */
export const PUBLIC_DATA_TRANSPORT = Symbol('CERA_PUBLIC_DATA_TRANSPORT');

export type TransportResult =
  | { ok: true; requestedAt: Instant; receivedAt: Instant; httpStatus: number; bytes: Uint8Array; mediaType: string }
  | { ok: false; requestedAt: Instant; errorCode: 'TIMEOUT' | 'NETWORK' | 'REPLAY_FIXTURE_NOT_FOUND' };

export interface PublicDataTransport {
  readonly mode: PublicDataMode;
  /** 이 데이터셋을 지금 부를 수 있는가(키가 있는가 · fixture 가 있는가) */
  isAvailable(dataset: PublicDataDataset): boolean;
  /** `params` 는 안전한 조회 조건(인증키 없음) */
  get(spec: DatasetSpec, params: Readonly<Record<string, string>>): Promise<TransportResult>;
}

/** 실제 data.go.kr 호출. 키는 생성자에서만 받고 밖으로 내보내지 않는다. */
export class DataGoKrHttpTransport implements PublicDataTransport {
  readonly mode = 'LIVE' as const;

  constructor(
    private readonly serviceKey: string | undefined,
    private readonly timeoutMs: number,
    private readonly clock: Clock,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isAvailable(): boolean {
    return Boolean(this.serviceKey);
  }

  async get(spec: DatasetSpec, params: Readonly<Record<string, string>>): Promise<TransportResult> {
    assertOutsideTransaction('public data HTTP call');
    if (!this.serviceKey) throw new Error('DataGoKrHttpTransport.get called without a service key');
    if ('serviceKey' in params) throw new Error('safe params must not carry the service key');
    // 포털은 디코딩된 키를 URL 인코딩해 보내라고 한다(field-dictionary 3.2) — URLSearchParams 가 한 번 인코딩한다
    const query = new URLSearchParams({ serviceKey: this.serviceKey, ...params });
    const url = `${spec.baseUrl}/${spec.operation}?${query.toString()}`;
    const requestedAt = this.clock.now();
    try {
      const response = await this.fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: 'application/xml' } });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const receivedAt = this.clock.now();
      return {
        ok: true,
        requestedAt,
        receivedAt: receivedAt.isBefore(requestedAt) ? requestedAt : receivedAt,
        httpStatus: response.status,
        bytes,
        mediaType: (response.headers.get('content-type') ?? 'application/xml').split(';')[0]!.trim().slice(0, 100),
      };
    } catch (error) {
      // 오류 객체 · 메시지는 URL(=키)을 담을 수 있으므로 버리고 종류만 남긴다
      const name = error instanceof Error ? error.name : '';
      return { ok: false, requestedAt, errorCode: name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'NETWORK' };
    }
  }
}

interface ReplayEntry {
  dataset: PublicDataDataset;
  /** 이 조건이 모두 같으면 이 fixture 를 돌려준다 */
  match: Record<string, string>;
  file: string;
  media_type?: string;
}

/**
 * 녹화 재생 — `CERA_PUBLIC_DATA_REPLAY_DIR/index.json` 의 fixture(합성 · 마스킹)를 돌려준다. 네트워크 없음.
 * 결과는 시뮬레이션이다(`public_data_fetch.mode = REPLAY` ⇔ `is_simulated`).
 */
export class ReplayTransport implements PublicDataTransport {
  readonly mode = 'REPLAY' as const;
  private readonly entries: ReplayEntry[];
  private readonly root: string;

  constructor(dir: string, private readonly clock: Clock) {
    this.root = resolve(dir);
    const index = join(this.root, 'index.json');
    this.entries = existsSync(index) ? (JSON.parse(readFileSync(index, 'utf8')) as { entries: ReplayEntry[] }).entries : [];
  }

  isAvailable(dataset: PublicDataDataset): boolean {
    return this.entries.some((e) => e.dataset === dataset);
  }

  async get(spec: DatasetSpec, params: Readonly<Record<string, string>>): Promise<TransportResult> {
    assertOutsideTransaction('public data replay');
    const requestedAt = this.clock.now();
    const entry = this.entries.find((e) => e.dataset === spec.dataset && Object.entries(e.match).every(([k, v]) => params[k] === v));
    if (!entry) return { ok: false, requestedAt, errorCode: 'REPLAY_FIXTURE_NOT_FOUND' };
    const path = resolve(this.root, entry.file);
    if (!path.startsWith(this.root)) throw new Error('replay fixture path escapes the replay directory');
    const bytes = new Uint8Array(readFileSync(path));
    return { ok: true, requestedAt, receivedAt: this.clock.now(), httpStatus: 200, bytes, mediaType: entry.media_type ?? 'application/xml' };
  }
}

/** 꺼짐(`CERA_PUBLIC_DATA_MODE=off`). 서비스가 먼저 PUBLIC_DATA_DISABLED 로 거부한다. */
export class DisabledTransport implements PublicDataTransport {
  readonly mode = 'LIVE' as const;
  isAvailable(): boolean {
    return false;
  }
  get(): Promise<TransportResult> {
    throw new Error('public data is disabled');
  }
}
