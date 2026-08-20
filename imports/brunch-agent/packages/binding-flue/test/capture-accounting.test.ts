import { describe, expect, test } from 'bun:test';
import type { CaptureStoreSnapshot, EvidenceSpan } from '@brunch/core';
import { capturedUserEntryIdsForSession } from '../src/capture-accounting.ts';

const evidence = (sessionId: string): EvidenceSpan => ({
  excerpt: 'A colliding quote.',
  pointer: { sessionId, entryStart: 1, entryEnd: 1 },
  source: 'user-affordance-payload',
});

describe('capture accounting', () => {
  test('keeps host-session identity when Flue entry ids collide', async () => {
    const pointersRead: string[] = [];
    const snapshot = {
      captures: [
        {
          id: 'capture-other-session',
          dedupKey: 'other',
          evidence: [evidence('session-other')],
          epistemicStatus: 'explicit',
          confidence: 'firm',
          content: { value: 'other' },
        },
        {
          id: 'capture-active-session',
          dedupKey: 'active',
          evidence: [evidence('session-active')],
          epistemicStatus: 'explicit',
          confidence: 'firm',
          content: { value: 'active' },
        },
      ],
      issues: [],
      events: [],
    } satisfies CaptureStoreSnapshot;

    const entryIds = await capturedUserEntryIdsForSession(
      {
        async readArchivedEntries(pointer) {
          pointersRead.push(pointer.sessionId);
          return [
            {
              ordinal: 1,
              substrateEntryId: 'colliding-flue-entry-id',
              versions: [],
            },
          ];
        },
      },
      snapshot,
      'session-active',
    );

    expect(entryIds).toEqual(new Set(['colliding-flue-entry-id']));
    expect(pointersRead).toEqual(['session-active']);
  });
});
