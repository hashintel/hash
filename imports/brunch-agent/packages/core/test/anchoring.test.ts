import { describe, expect, test } from 'bun:test';
import {
  applyCaptureStoreCommand,
  createEmptyCaptureStoreSnapshot,
  type CaptureInputProposal,
  type EvidenceSpan,
} from '../src/capture-store.ts';
import { archiveSessionLogRead, createEmptySessionLogArchive } from '../src/session-log.ts';

type UserCaptureInput = Extract<
  CaptureInputProposal,
  { readonly evidence: readonly { readonly excerpt: string }[] }
>;

const archive = archiveSessionLogRead(createEmptySessionLogArchive(), {
  sessionId: 'session-1',
  offset: '3',
  entries: [
    {
      substrateEntryId: 'injected',
      kind: 'non-user',
      text: 'Begin the interview.',
      materialized: { id: 'injected', text: 'Begin the interview.' },
    },
    {
      substrateEntryId: 'first',
      kind: 'user',
      text: 'June works.',
      materialized: { id: 'first', text: 'June works.' },
    },
    {
      substrateEntryId: 'latest',
      kind: 'user',
      text: 'June works.',
      materialized: { id: 'latest', text: 'June works.' },
    },
  ],
  settlements: [],
});

const proposal = (excerpt: string): CaptureInputProposal => ({
  evidence: [{ excerpt }],
  epistemicStatus: 'explicit',
  confidence: 'high',
  content: { value: 'June' },
});

describe('capture anchoring', () => {
  test('resolves quotes once at application time and carries latest-match advice', () => {
    const result = applyCaptureStoreCommand(
      createEmptyCaptureStoreSnapshot(),
      { type: 'apply-sweep', proposals: [proposal('June works.')] },
      { sessionId: 'session-1', archive },
    );

    expect(result.ok).toBe(true);
    if (!result.ok || !('appliedCaptureIds' in result.value)) throw new Error('sweep refused');
    const capture = result.snapshot.captures[0]!;
    if (!('evidence' in capture)) throw new Error('capture did not retain evidence');
    expect(capture.evidence).toEqual([
      {
        excerpt: 'June works.',
        pointer: { sessionId: 'session-1', entryStart: 3, entryEnd: 3 },
        source: 'user',
      },
    ]);
    expect(result.value.advisories).toContainEqual({
      type: 'multiple-evidence-matches',
      excerpt: 'June works.',
      matchCount: 2,
      message: 'The quote matched 2 user entries; the latest match was selected.',
    });
  });

  test('keeps a quote-only replay anchored to one archived entry', () => {
    const firstRead = archiveSessionLogRead(createEmptySessionLogArchive(), {
      sessionId: 'session-1',
      offset: '1',
      entries: [
        {
          substrateEntryId: 'reply',
          kind: 'user',
          text: 'June works.',
          materialized: { id: 'reply', text: 'June works.' },
        },
      ],
      settlements: [],
    });
    const first = applyCaptureStoreCommand(
      createEmptyCaptureStoreSnapshot(),
      { type: 'apply-sweep', proposals: [proposal('June works.')] },
      { sessionId: 'session-1', archive: firstRead },
    );
    if (!first.ok || !('appliedCaptureIds' in first.value)) throw new Error('first sweep refused');

    const replayedRead = archiveSessionLogRead(firstRead, {
      sessionId: 'session-1',
      offset: '2',
      entries: [
        {
          substrateEntryId: 'reply',
          kind: 'user',
          text: 'June works.',
          materialized: { id: 'reply', text: 'June works.' },
        },
      ],
      settlements: [],
    });
    const replay = applyCaptureStoreCommand(
      first.snapshot,
      { type: 'apply-sweep', proposals: [proposal('June works.')] },
      { sessionId: 'session-1', archive: replayedRead },
    );

    expect(replay.ok).toBe(true);
    if (!replay.ok || !('skippedDedupKeys' in replay.value)) throw new Error('replay refused');
    expect(replay.snapshot.captures).toHaveLength(1);
    expect(replay.value.skippedDedupKeys).toEqual([first.snapshot.captures[0]!.dedupKey]);
  });

  test('keeps a full-prefix replay bound to its first matching occurrence', () => {
    const firstRead = archiveSessionLogRead(createEmptySessionLogArchive(), {
      sessionId: 'session-1',
      offset: '1',
      entries: [
        {
          substrateEntryId: 'first',
          kind: 'user',
          text: 'June works.',
          materialized: { id: 'first', text: 'June works.' },
        },
      ],
      settlements: [],
    });
    const first = applyCaptureStoreCommand(
      createEmptyCaptureStoreSnapshot(),
      { type: 'apply-sweep', proposals: [proposal('June works.')] },
      { sessionId: 'session-1', archive: firstRead },
    );
    if (!first.ok) throw new Error('first sweep refused');

    const secondRead = archiveSessionLogRead(firstRead, {
      sessionId: 'session-1',
      offset: '2',
      entries: [
        {
          substrateEntryId: 'first',
          kind: 'user',
          text: 'June works.',
          materialized: { id: 'first', text: 'June works.' },
        },
        {
          substrateEntryId: 'second',
          kind: 'user',
          text: 'June works.',
          materialized: { id: 'second', text: 'June works.' },
        },
      ],
      settlements: [],
    });
    const replay = applyCaptureStoreCommand(
      first.snapshot,
      { type: 'apply-sweep', proposals: [proposal('June works.')] },
      { sessionId: 'session-1', archive: secondRead },
    );

    expect(replay.ok).toBe(true);
    if (!replay.ok || !('skippedDedupKeys' in replay.value)) throw new Error('replay refused');
    expect(replay.snapshot.captures).toHaveLength(1);
    expect(
      replay.snapshot.captures.flatMap((capture) =>
        'evidence' in capture ? capture.evidence.map((span) => span.pointer.entryStart) : [],
      ),
    ).toEqual([1]);

    // A full-prefix extraction has one proposal for A and a genuinely new
    // proposal for B. Their quotes and contents are intentionally identical;
    // their ordered occurrence slots are assigned by the harness.
    const bothOccurrences = applyCaptureStoreCommand(
      replay.snapshot,
      {
        type: 'apply-sweep',
        proposals: [proposal('June works.'), proposal('June works.')],
      },
      { sessionId: 'session-1', archive: secondRead },
    );
    expect(bothOccurrences.ok).toBe(true);
    if (!bothOccurrences.ok) throw new Error('full-prefix sweep refused');
    expect(bothOccurrences.snapshot.captures).toHaveLength(2);
    expect(
      bothOccurrences.snapshot.captures.flatMap((capture) =>
        'evidence' in capture ? capture.evidence.map((span) => span.pointer.entryStart) : [],
      ),
    ).toEqual([1, 2]);
  });

  test('does not duplicate a retry when its archived source is reclassified', () => {
    const firstRead = archiveSessionLogRead(createEmptySessionLogArchive(), {
      sessionId: 'session-1',
      offset: '1',
      entries: [
        {
          substrateEntryId: 'reply',
          kind: 'user',
          text: 'June works.',
          materialized: { id: 'reply', text: 'June works.' },
        },
      ],
      settlements: [],
    });
    const first = applyCaptureStoreCommand(
      createEmptyCaptureStoreSnapshot(),
      { type: 'apply-sweep', proposals: [proposal('June works.')] },
      { sessionId: 'session-1', archive: firstRead },
    );
    if (!first.ok) throw new Error('first sweep refused');

    const reclassifiedRead = archiveSessionLogRead(firstRead, {
      sessionId: 'session-1',
      offset: '2',
      entries: [
        {
          substrateEntryId: 'reply',
          kind: 'user-affordance-payload',
          text: 'June works.',
          materialized: { id: 'reply', text: 'June works.', affordanceId: 'when' },
        },
      ],
      settlements: [],
    });
    const retry = applyCaptureStoreCommand(
      first.snapshot,
      { type: 'apply-sweep', proposals: [proposal('June works.')] },
      { sessionId: 'session-1', archive: reclassifiedRead },
    );

    expect(retry.ok).toBe(true);
    if (!retry.ok) throw new Error('retry sweep refused');
    expect(retry.snapshot.captures).toHaveLength(1);
  });

  test('refuses an injected entry and a missing quote before writing a capture', () => {
    for (const [excerpt, code] of [
      ['Begin the interview.', 'non-user-evidence'],
      ['July works.', 'evidence-quote-not-found'],
    ] as const) {
      expect(
        applyCaptureStoreCommand(
          createEmptyCaptureStoreSnapshot(),
          { type: 'apply-sweep', proposals: [proposal(excerpt)] },
          { sessionId: 'session-1', archive },
        ),
      ).toMatchObject({ ok: false, refusal: { code } });
    }
  });

  test('caller-facing evidence accepts quotes, not ranges or source assertions', () => {
    const evidence: UserCaptureInput['evidence'] = [
      {
        excerpt: 'June works.',
        // @ts-expect-error Entry ranges are harness-owned and absent from caller input.
        pointer: { sessionId: 'session-1', entryStart: 1, entryEnd: 1 },
      },
    ];
    expect(evidence[0] as unknown).toEqual({
      excerpt: 'June works.',
      pointer: { sessionId: 'session-1', entryStart: 1, entryEnd: 1 },
    });

    const storedSpan: EvidenceSpan = {
      excerpt: 'June works.',
      pointer: { sessionId: 'session-1', entryStart: 1, entryEnd: 1 },
      source: 'user',
    };
    // @ts-expect-error A stored span is not assignable to caller quote input.
    const callerQuotes: readonly UserCaptureInput['evidence'][number][] = [storedSpan];
    expect(callerQuotes).toHaveLength(1);
  });
});
