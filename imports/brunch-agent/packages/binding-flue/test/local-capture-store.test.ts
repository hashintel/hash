import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CaptureProposal, EvidenceSpan } from '@brunch/core';
import { createLocalCaptureStore } from '../src/local-capture-store.ts';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

const userEvidence = (excerpt: string, entry: number): EvidenceSpan => ({
  excerpt,
  pointer: { sessionId: 'session-1', entryStart: entry, entryEnd: entry },
  source: 'user',
});

const proposal = (value: string, entry: number): CaptureProposal => ({
  evidence: [userEvidence(value, entry)],
  epistemicStatus: 'explicit',
  confidence: 'high',
  content: { value },
});

const storePath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'brunch-captures-'));
  directories.push(directory);
  return join(directory, 'captures.json');
};

describe('local capture store', () => {
  test('persists captures through JSON tmp-and-rename without stored statuses', async () => {
    const path = await storePath();
    const first = createLocalCaptureStore(path);
    const written = await first.execute({ type: 'apply-sweep', proposals: [proposal('alpha', 1)] });
    expect(written.ok).toBe(true);

    const reopened = createLocalCaptureStore(path);
    const snapshot = await reopened.read();
    expect(snapshot.captures).toHaveLength(1);
    expect(snapshot.captures[0]!.content).toEqual({ value: 'alpha' });

    const persisted = JSON.parse(await readFile(path, 'utf8')) as unknown;
    expect(JSON.stringify(persisted)).not.toContain('"status"');
    expect((await readdir(join(path, '..'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  test('serializes concurrent writes and never persists a refused partial sweep', async () => {
    const path = await storePath();
    const store = createLocalCaptureStore(path);

    const [first, second] = await Promise.all([
      store.execute({ type: 'apply-sweep', proposals: [proposal('alpha', 1)] }),
      store.execute({ type: 'apply-sweep', proposals: [proposal('beta', 2)] }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const refused = await store.execute({
      type: 'apply-sweep',
      proposals: [
        proposal('gamma', 3),
        {
          ...proposal('invalid', 4),
          content: { value: 'invalid', absence: 'deferred' },
        } as unknown as CaptureProposal,
      ],
    });
    expect(refused).toMatchObject({ ok: false, refusal: { code: 'invalid-envelope' } });

    const snapshot = await createLocalCaptureStore(path).read();
    expect(snapshot.captures.map((capture) => capture.content)).toEqual([
      { value: 'alpha' },
      { value: 'beta' },
    ]);
  });
});
