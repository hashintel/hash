/**
 * The verification gaps this codebase knows are open.
 *
 * Spec §14.5 names open verification items, and prose decays: an item nobody
 * runs into is an item nobody closes. The ones here are exactly that kind — a
 * substrate behaviour nobody has driven, a durability claim nobody has
 * restarted into.
 *
 * So the ledger is data, and an entry's *existence* is the claim that its gap
 * is still open. Closing a gap is an explicit repository action: the commit
 * that lands the behavioural proof deletes the entry, so a single diff carries
 * the proof and the closure together and a reviewer can check one against the
 * other.
 *
 * Nothing here infers closure from source text, and nothing may be added that
 * does. The mechanism this replaces searched the tree for a citation token
 * alongside a `test(`/`expect(` in the same file: it passed for a test that
 * cited a gap while proving something else, and it went red on any closure
 * written outside the shape it guessed. A banner that can be wrong in both
 * directions is a banner nobody reads.
 */

export interface OpenGap {
  /** Short stable handle, used in the run banner and on the ticket. */
  readonly id: string;
  /** Spec section that names the item. */
  readonly spec: string;
  /** The Linear issue that owns closing it. */
  readonly ticket: string;
  /** What is not yet known, in one sentence. */
  readonly gap: string;
  /** The behavioural proof whose landing commit deletes this entry. */
  readonly proof: string;
}

export const OPEN_GAPS: readonly OpenGap[] = [
  {
    id: 'restart-durability',
    spec: '§14.5',
    ticket: 'FE-1396',
    gap: 'The capture store survives restart (proven in the ticket-13 prototype), but conversation-store durability with a real db.ts has never been driven across a restart.',
    proof:
      'A test under apps/dev/test that boots the dev app, holds a conversation, restarts the process, and resumes the same conversation id.',
  },
  {
    id: 'compaction-vs-durable-history',
    spec: '§9.7, §14.5',
    ticket: 'FE-1386',
    gap: 'No session has been driven across a compaction boundary, so whether Flue compaction leaves the durable entry projection intact is unverified — and evidence pointers bind to that projection.',
    proof:
      'A test under packages/binding-flue/test driving a session past compaction and asserting every capture’s evidence pointer still resolves through the session-log archive.',
  },
  {
    id: 'history-projection-paging',
    spec: '§14.5',
    ticket: 'FE-1391',
    gap: 'The durable-history projection is read over self-HTTP; paging past ~1000 entries and binding base-URL discovery are both untested.',
    proof:
      'The binding’s history reader covering a paged projection, tested under packages/binding-flue/test.',
  },
  {
    id: 'wake-wart-write-paths',
    spec: '§7.4, §14.5',
    ticket: 'FE-1392',
    gap: 'FE-1389 proved the one existing instruction-state write path cannot re-trigger advisory wakes; §14.5 covers every future write path, and the settlement trigger will add the next ones unchecked.',
    proof:
      'The settlement trigger (and any further instruction-state write path) landing with its own no-advisory-wake assertion over a real runtime history.',
  },
  {
    id: 'interpretation-render-plugin-seam',
    spec: '§7.6, §14.5',
    ticket: 'FE-1394',
    gap: 'The plugin-supplied renderer seam for the interpretation render has never been exercised, because no real pack exists yet.',
    proof:
      'A plugin supplying a renderer definition typed against its own payload shapes, with a test driving the interpretation render through it — an exported symbol alone leaves the seam uncrossed.',
  },
];
