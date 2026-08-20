/**
 * Keeps the known gaps visible, and refuses to let one close quietly.
 *
 * See `known-gaps.ts` for why this exists. In short: spec §14.5's open
 * verification items are the kind of thing that stays unverified precisely
 * because nothing ever trips over them, so they are encoded rather than
 * described.
 */

import { describe, expect, test } from 'bun:test';
import { KNOWN_GAPS } from './known-gaps.ts';

// Printed once per run, so the list is in front of whoever is working rather
// than filed somewhere they would have to think to look.
console.warn(
  [
    '',
    `⚠ ${KNOWN_GAPS.length} known gaps are still open (spec §14.5 and friends):`,
    ...KNOWN_GAPS.map((gap) => `   · ${gap.id} — ${gap.ticket} (spec ${gap.spec})`),
    '   Each is asserted below; closing one turns this suite red until its entry is deleted.',
    '',
  ].join('\n'),
);

describe('known gaps', () => {
  test('every gap names the ticket that owns closing it', () => {
    for (const gap of KNOWN_GAPS) {
      expect({ id: gap.id, ticket: gap.ticket }).toEqual({
        id: gap.id,
        ticket: expect.stringMatching(/^[A-Z]+-\d+$/) as unknown as string,
      });
    }
  });

  test('gap ids are unique', () => {
    const ids = KNOWN_GAPS.map((gap) => gap.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const gap of KNOWN_GAPS) {
    test(`still open: ${gap.id} (${gap.ticket})`, () => {
      // Inverted on purpose. This does not check that the gap exists — it
      // checks that it has not silently stopped existing. When the work that
      // closes it lands, this goes red, and the fix is to delete the entry
      // from known-gaps.ts and record the verification on its ticket.
      expect({
        gap: gap.id,
        stillOpen: !gap.closed(),
        whenThisFails: `${gap.id} looks closed. Confirm it, record the result on ${gap.ticket}, then delete its entry from test/known-gaps.ts.`,
      }).toEqual({
        gap: gap.id,
        stillOpen: true,
        whenThisFails: `${gap.id} looks closed. Confirm it, record the result on ${gap.ticket}, then delete its entry from test/known-gaps.ts.`,
      });
    });
  }
});
