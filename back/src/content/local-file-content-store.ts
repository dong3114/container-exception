import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ContentCategory } from '../db/schema/_common.js';
import { assertOutsideTransaction } from '../db/transaction.js';
import { sha256Bytes } from '../shared/hash/hash.js';
import type { IdGenerator } from '../shared/id/uuid.js';
import type { Clock } from '../shared/time/clock.js';
import { ABSENT, type ContentRef, type ContentStore, formatContentRef, parseContentRef, type StoredContent } from './content-store.js';

/**
 * 로컬·시험 어댑터: 파일 시스템(docs/24 16.3).
 * 배치 `<뿌리>/<범주>/<uuid 앞 2자리>/<uuid>` + 옆에 `<uuid>.meta.json`(sha256 · size · media_type · stored_at).
 * 파일명·내용 요약은 메타데이터에 넣지 않는다. 뿌리 기본값은 gitignore 된 `data/raw/content/`.
 */
export class LocalFileContentStore implements ContentStore {
  private readonly root: string;

  constructor(
    root: string,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.root = resolve(root);
  }

  async put(category: ContentCategory, bytes: Uint8Array, mediaType: string): Promise<StoredContent> {
    assertOutsideTransaction('ContentStore.put');
    const ref = formatContentRef(category, this.ids.newId());
    const path = this.pathOf(ref);
    const sha256 = sha256Bytes(bytes);
    await mkdir(dirname(path), { recursive: true });
    // 쓰다 만 파일이 보이지 않게 임시 이름으로 쓰고 옮긴다. 같은 참조를 덮어쓰지 않는다(flag wx).
    const temp = `${path}.partial`;
    await writeFile(temp, bytes, { flag: 'wx' });
    await rename(temp, path);
    const meta = { sha256, size: bytes.byteLength, media_type: mediaType, stored_at: this.clock.now().toIsoUtc() };
    await writeFile(`${path}.meta.json`, JSON.stringify(meta), { flag: 'wx' });
    return { ref, sha256 };
  }

  async get(ref: ContentRef): Promise<Uint8Array | typeof ABSENT> {
    assertOutsideTransaction('ContentStore.get');
    try {
      return new Uint8Array(await readFile(this.pathOf(ref)));
    } catch (error) {
      if (isNotFound(error)) return ABSENT;
      throw error;
    }
  }

  async exists(ref: ContentRef): Promise<boolean> {
    assertOutsideTransaction('ContentStore.exists');
    try {
      return (await stat(this.pathOf(ref))).isFile();
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async purge(ref: ContentRef): Promise<'PURGED' | 'NOT_FOUND'> {
    assertOutsideTransaction('ContentStore.purge');
    const path = this.pathOf(ref);
    if (!(await this.exists(ref))) return 'NOT_FOUND';
    await rm(path, { force: true });
    await rm(`${path}.meta.json`, { force: true });
    if (await this.exists(ref)) throw new Error('content still present after purge');
    return 'PURGED';
  }

  private pathOf(ref: ContentRef): string {
    const { category, id } = parseContentRef(ref);
    return join(this.root, category, id.slice(0, 2), id);
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}
