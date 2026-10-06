import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ABSENT, formatContentRef, judgeContentState, parseContentRef } from '../../src/content/content-store.js';
import { LocalFileContentStore } from '../../src/content/local-file-content-store.js';
import { CONTENT_REF_PATTERN } from '../../src/db/schema/_common.js';
import { sha256Bytes } from '../../src/shared/hash/hash.js';
import { UuidV7Generator } from '../../src/shared/id/uuid.js';
import { FakeClock } from '../../src/shared/time/clock.js';

const root = mkdtempSync(join(tmpdir(), 'cera-content-'));
const store = new LocalFileContentStore(root, new UuidV7Generator(), new FakeClock('2026-10-01T00:00:00.000Z'));

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('content judgement (docs/24 17절 · C-01~03)', () => {
  it('maps (content exists, purge audit exists) to the four states', () => {
    expect(judgeContentState(true, false)).toBe('RETAINED');
    expect(judgeContentState(false, true)).toBe('PURGED');
    expect(judgeContentState(false, false)).toBe('MISSING');
    expect(judgeContentState(true, true)).toBe('PURGE_MISMATCH');
  });
});

describe('content ref format cref:v1:<category>:<uuidv7>', () => {
  it('formats, parses and matches the DB CHECK pattern of its category only', () => {
    const ref = formatContentRef('RAW_INPUT_PAYLOAD', '01a0fb92-9b63-7544-b3af-72add1339753');
    expect(parseContentRef(ref)).toMatchObject({ category: 'RAW_INPUT_PAYLOAD', id: '01a0fb92-9b63-7544-b3af-72add1339753' });
    expect(new RegExp(CONTENT_REF_PATTERN('RAW_INPUT_PAYLOAD')).test(ref)).toBe(true);
    expect(new RegExp(CONTENT_REF_PATTERN('COMM_MESSAGE_CONTENT')).test(ref)).toBe(false);
  });

  it('rejects non-v7 ids, unknown categories and path tricks', () => {
    expect(() => formatContentRef('RAW_INPUT_PAYLOAD', '3d6f0a9e-1c2b-4c3d-8e4f-5a6b7c8d9e0f')).toThrow();
    expect(() => parseContentRef('cref:v1:SECRETS:01a0fb92-9b63-7544-b3af-72add1339753')).toThrow();
    expect(() => parseContentRef('cref:v1:RAW_INPUT_PAYLOAD:../../etc/passwd')).toThrow();
  });
});

describe('LocalFileContentStore', () => {
  it('put → exists → get returns the same bytes and SHA-256; purge → gone; second purge NOT_FOUND', async () => {
    const bytes = new TextEncoder().encode('{"subject":"s","body_text":"b"}');
    const stored = await store.put('COMM_MESSAGE_CONTENT', bytes, 'application/json');
    expect(stored.sha256).toBe(sha256Bytes(bytes));
    expect(await store.exists(stored.ref)).toBe(true);
    const back = await store.get(stored.ref);
    expect(back).not.toBe(ABSENT);
    expect(sha256Bytes(back as Uint8Array)).toBe(stored.sha256);

    expect(await store.purge(stored.ref)).toBe('PURGED');
    expect(await store.exists(stored.ref)).toBe(false);
    expect(await store.get(stored.ref)).toBe(ABSENT);
    expect(await store.purge(stored.ref)).toBe('NOT_FOUND');
  });

  it('every put gets a new ref even for identical bytes (not content-addressed)', async () => {
    const bytes = new TextEncoder().encode('same');
    const a = await store.put('EXTRACTION_SOURCE_QUOTE', bytes, 'text/plain');
    const b = await store.put('EXTRACTION_SOURCE_QUOTE', bytes, 'text/plain');
    expect(a.ref).not.toBe(b.ref);
    expect(a.sha256).toBe(b.sha256);
    await store.purge(a.ref);
    expect(await store.exists(b.ref)).toBe(true);
  });
});
