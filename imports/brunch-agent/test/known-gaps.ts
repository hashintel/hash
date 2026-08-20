/**
 * The gaps this codebase knows it has.
 *
 * Spec §14.5 names five open verification items. Prose decays: an item nobody
 * runs into is an item nobody closes, and the ones here are exactly the kind
 * that stay invisible — a substrate behaviour nobody has driven, a durability
 * claim nobody has restarted into.
 *
 * So each gap is a record with a `closed` predicate that runs on every `bun
 * test`. Two things follow, and the second is the point:
 *
 * - while a gap is open, it is listed in the run output rather than forgotten;
 * - **when a gap's condition becomes true, the suite goes red** and stays red
 *   until someone deletes the entry. Closing a gap by accident is not allowed
 *   to pass silently — somebody has to look at it, confirm it, and record it
 *   on the ticket that owns it.
 *
 * The failure message is therefore an instruction, not a complaint.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './workspace.ts';

export interface KnownGap {
  /** Short stable handle, used in test names. */
  readonly id: string;
  /** Spec section that names the item. */
  readonly spec: string;
  /** The Linear issue that owns closing it. */
  readonly ticket: string;
  /** What is not yet known, in one sentence. */
  readonly gap: string;
  /** What closing it requires — the thing a follow-up slice actually does. */
  readonly closes: string;
  /**
   * True once the gap is demonstrably closed. Kept cheap and structural: this
   * runs on every test invocation, so it may look at the tree but never at a
   * model, a network, or a substrate.
   */
  readonly closed: () => boolean;
}

const exists = (...parts: string[]): boolean => existsSync(join(REPO_ROOT, ...parts));

export const KNOWN_GAPS: readonly KnownGap[] = [
  {
    id: 'restart-durability',
    spec: '§14.5',
    ticket: 'FE-1396',
    gap: 'The capture store survives restart (proven in the ticket-13 prototype), but conversation-store durability with a real db.ts has never been driven across a restart.',
    closes:
      'A test that boots the dev app, holds a conversation, restarts the process, and resumes the same conversation id.',
    closed: () => exists('apps/dev/test/restart-durability.test.ts'),
  },
  {
    id: 'compaction-vs-durable-history',
    spec: '§9.7, §14.5',
    ticket: 'FE-1386',
    gap: 'No session has been driven across a compaction boundary, so whether Flue compaction leaves the durable entry projection intact is unverified — and evidence pointers bind to that projection.',
    closes:
      'A test driving a session past compaction and asserting every capture’s evidence pointer still resolves through the session-log archive.',
    closed: () => exists('packages/binding-flue/test/compaction.test.ts'),
  },
  {
    id: 'wake-wart-residue',
    spec: '§7.4, §14.5',
    ticket: 'FE-1389',
    gap: 'The no-interpolation ruling removes the cause of the wake wart observed in ticket 10, but no other instruction-state write path has been checked for re-triggering advisory wakes.',
    closes:
      'The walking skeleton asserting no "instructions updated" advisory wake occurs per ask.',
    closed: () => exists('apps/dev/test/wake-wart.test.ts'),
  },
  {
    id: 'history-projection-paging',
    spec: '§14.5',
    ticket: 'FE-1391',
    gap: 'The durable-history projection is read over self-HTTP; paging past ~1000 entries and binding base-URL discovery are both untested.',
    closes: 'The binding’s history reader covering a paged projection.',
    closed: () => exists('packages/binding-flue/test/history-paging.test.ts'),
  },
  {
    id: 'interpretation-render-plugin-seam',
    spec: '§7.6, §14.5',
    ticket: 'FE-1394',
    gap: 'The plugin-supplied renderer seam for the interpretation render has never been exercised, because no real pack exists yet.',
    closes: 'A plugin supplying a renderer definition typed against its own payload shapes.',
    closed: () => exists('packages/plugin-gherkin/src/renderer.ts'),
  },
];
