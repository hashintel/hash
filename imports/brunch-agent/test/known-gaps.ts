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

import { join } from 'node:path';
import { filesIn, REPO_ROOT, sourceFiles, workspacePackages } from './workspace.ts';

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

/**
 * A gap that a follow-up test closes is closed only when a test carrying the
 * citation `closes-gap: <id>` actually runs somewhere under `dir`:
 * registering a test and asserting something. Content rather than a filename,
 * because a filename check fails in both directions — `touch`ing the guessed
 * path "closed" a gap with nothing verified, while a real closure under any
 * other name stayed "open" forever and rotted the banner.
 *
 * The citation is a deliberate token, not any prose mention of the id: a test
 * that merely *talks about* the gap must not close it (the same cry-wolf
 * failure the directive check had with comments that mention `'use agent'`).
 */
const closedByTest = (dir: string, gapId: string): boolean =>
  filesIn(join(REPO_ROOT, dir)).some(
    (file) =>
      file.text.includes(`closes-gap: ${gapId}`) &&
      /\b(?:test|it)\s*\(/.test(file.text) &&
      file.text.includes('expect('),
  );

export const KNOWN_GAPS: readonly KnownGap[] = [
  {
    id: 'restart-durability',
    spec: '§14.5',
    ticket: 'FE-1396',
    gap: 'The capture store survives restart (proven in the ticket-13 prototype), but conversation-store durability with a real db.ts has never been driven across a restart.',
    closes:
      'A test under apps/dev/test that boots the dev app, holds a conversation, restarts the process, and resumes the same conversation id — citing `closes-gap: <this id>`.',
    closed: () => closedByTest('apps/dev/test', 'restart-durability'),
  },
  {
    id: 'compaction-vs-durable-history',
    spec: '§9.7, §14.5',
    ticket: 'FE-1386',
    gap: 'No session has been driven across a compaction boundary, so whether Flue compaction leaves the durable entry projection intact is unverified — and evidence pointers bind to that projection.',
    closes:
      'A test under packages/binding-flue/test driving a session past compaction and asserting every capture’s evidence pointer still resolves through the session-log archive — citing `closes-gap: <this id>`.',
    closed: () => closedByTest('packages/binding-flue/test', 'compaction-vs-durable-history'),
  },
  {
    id: 'history-projection-paging',
    spec: '§14.5',
    ticket: 'FE-1391',
    gap: 'The durable-history projection is read over self-HTTP; paging past ~1000 entries and binding base-URL discovery are both untested.',
    closes:
      'The binding’s history reader covering a paged projection, tested under packages/binding-flue/test — citing `closes-gap: <this id>`.',
    closed: () => closedByTest('packages/binding-flue/test', 'history-projection-paging'),
  },
  {
    id: 'interpretation-render-plugin-seam',
    spec: '§7.6, §14.5',
    ticket: 'FE-1394',
    gap: 'The plugin-supplied renderer seam for the interpretation render has never been exercised, because no real pack exists yet.',
    closes: 'A plugin supplying a renderer definition typed against its own payload shapes.',
    closed: () => {
      // Not a filename check: the seam is exercised once the plugin's source
      // exports a renderer, wherever that export lives — and an empty file at
      // a guessed path exports nothing.
      const plugin = workspacePackages().find((pkg) => pkg.name === '@brunch/plugin-gherkin');
      return (
        plugin !== undefined &&
        sourceFiles(plugin).some((file) =>
          /export\s+(?:const|function|class)\s+\w*[Rr]enderer/.test(file.text),
        )
      );
    },
  },
];
