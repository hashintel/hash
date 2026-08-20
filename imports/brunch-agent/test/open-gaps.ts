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
    gap: 'Flue 2.0.3 source shows compaction appends to the canonical stream and rewrites model context only, but no session has behaviorally pinned that the public message projection and persistent state survive a real compaction boundary.',
    proof:
      'A test under packages/binding-flue/test driving one genuine compaction, deep-comparing complete public messages and settlements aside from offset/incarnation, verifying persistent state, and asserting an FE-1391 archive pointer still resolves.',
  },
  {
    id: 'history-refresh-before-sweep',
    spec: '§8.2, §14.5',
    ticket: 'FE-1392',
    gap: 'FE-1391 proves the public reader and archive against the real mounted router, but no settlement caller yet refreshes that archive immediately before applying quote-bearing sweep output.',
    proof:
      'FE-1392’s real lifecycle test must read history through the binding immediately before store application and prove that a quote absent from the prior archive resolves from the refreshed projection without in-hook transport or reentrancy failure.',
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
