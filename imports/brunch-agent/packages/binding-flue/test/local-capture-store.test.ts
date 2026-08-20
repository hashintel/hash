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

  test('a command refused by the conflict guard leaves the file byte-identical and readable', async () => {
    const path = await storePath();
    const store = createLocalCaptureStore(path);
    await store.execute({
      type: 'apply-sweep',
      proposals: [proposal('March', 1), proposal('June', 2)],
    });
    const captures = await store.read();
    const [marchId, juneId] = captures.captures.map((capture) => capture.id);
    const opened = await store.execute({
      type: 'open-issue',
      issueType: 'conflicting',
      origin: { type: 'harness' },
      references: [marchId!, juneId!],
      canDefault: false,
    });
    expect(opened.ok).toBe(true);

    const before = await readFile(path, 'utf8');
    for (const command of [
      {
        type: 'apply-sweep',
        proposals: [{ ...proposal('April', 3), supersedes: marchId! }],
      },
      { type: 'retract-capture', captureId: marchId!, evidence: [userEvidence('Forget it', 4)] },
    ] as const) {
      const refused = await store.execute(command);
      expect(refused).toMatchObject({
        ok: false,
        refusal: { code: 'blocked-by-open-conflict', captureId: marchId },
      });
    }

    // Byte-identical, not merely equivalent: a rewrite of the same content would
    // pass an equality check while still having put the file at risk.
    expect(await readFile(path, 'utf8')).toBe(before);
    // And still readable through the parser, which is what makes it a snapshot
    // rather than surviving bytes.
    expect((await createLocalCaptureStore(path).read()).captures.map((c) => c.content)).toEqual([
      { value: 'March' },
      { value: 'June' },
    ]);
    expect((await readdir(join(path, '..'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  test('what a command returns is what the file gives back, even after the caller edits its arrays', async () => {
    const path = await storePath();
    const store = createLocalCaptureStore(path);
    const created = await store.execute({
      type: 'apply-sweep',
      proposals: [proposal('June', 1)],
    });
    if (!created.ok) throw new Error('the sweep was refused');
    const captureId = created.snapshot.captures[0]!.id;

    const evidence = [userEvidence('Forget the June date', 2)];
    const retracted = await store.execute({ type: 'retract-capture', captureId, evidence });
    if (!retracted.ok) throw new Error('the retraction was refused');

    // The caller edits everything it still holds, after the store accepted and
    // wrote it. If the snapshot aliased any of it, the result the caller was
    // handed and the bytes on disk would now disagree.
    (evidence[0]!.pointer as { entryEnd: number }).entryEnd = 99;
    evidence.push(userEvidence('Injected after the write', 3));

    expect(await createLocalCaptureStore(path).read()).toEqual(retracted.snapshot);
  });
});
