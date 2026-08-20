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
