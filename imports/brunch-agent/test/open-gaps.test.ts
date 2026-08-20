/**
 * Keeps the open gaps in front of whoever is working, and keeps each entry
 * well formed enough to act on.
 *
 * See `open-gaps.ts` for why the ledger exists and why closing a gap is
 * deleting its entry rather than satisfying a predicate.
 */

import { describe, expect, test } from 'bun:test';
import { OPEN_GAPS } from './open-gaps.ts';

// Printed once per run, so the list is in front of whoever is working rather
// than filed somewhere they would have to think to look. Silent when the ledger
// is empty, because that is the goal state and not a warning.
if (OPEN_GAPS.length > 0) {
  console.warn(
    [
      '',
      `⚠ ${OPEN_GAPS.length} verification gaps are open (spec §14.5 and friends):`,
      ...OPEN_GAPS.map((entry) => `   · ${entry.id} — ${entry.ticket} (spec ${entry.spec})`),
      '   Closing one means deleting its entry in the commit that lands its proof.',
      '',
    ].join('\n'),
  );
}

describe('open gaps', () => {
  test('every entry names its ticket, spec section, gap, and the proof that will delete it', () => {
    for (const entry of OPEN_GAPS) {
      // The entry id is pinned on both sides so a failure says which record is
      // malformed even when the malformed field is the id itself.
      expect({
        entry: entry.id,
        id: entry.id,
        ticket: entry.ticket,
        spec: entry.spec,
        statesGap: entry.gap.trim().length > 0,
        statesProof: entry.proof.trim().length > 0,
      }).toEqual({
        entry: entry.id,
        id: expect.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) as unknown as string,
        ticket: expect.stringMatching(/^[A-Z]+-\d+$/) as unknown as string,
        spec: expect.stringMatching(/^§\d+(?:\.\d+)*(?:, §\d+(?:\.\d+)*)*$/) as unknown as string,
        statesGap: true,
        statesProof: true,
      });
    }
  });

  test('gap ids are unique', () => {
    const ids = OPEN_GAPS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
