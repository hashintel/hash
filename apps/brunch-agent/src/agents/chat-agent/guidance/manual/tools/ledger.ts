/**
 * This arm's own Ledger: what `ledger_commit` accepts, records and refuses,
 * how conversation history is read back, and what coverage and the map show.
 * Nothing here is shared with another arm, and it loads in plain Node, so the
 * persona harness reads this arm's runs with it.
 */

import { prepareIdentityLedgerCommit } from "./ledger/commit.ts";
import { reconstructLedger, type LedgerHistory } from "./ledger/history.ts";
import {
  compileLedgerMap,
  type LedgerCompilation,
  type LedgerMapOptions,
} from "./ledger/map.ts";
import { ledgerVocabulary } from "./ledger/terms.ts";
import {
  identityCommitInputSchema,
  renderVocabulary,
} from "./ledger/vocabulary.ts";

import type { LedgerChange, LedgerCommit } from "./ledger/notes.ts";

export { ledgerCommitOutputSchema, type LedgerCommit } from "./ledger/notes.ts";
export { reconstructLedger, type LedgerHistory };

export const commitInputSchema = identityCommitInputSchema(ledgerVocabulary);

/** The vocabulary as the commit tool's description shows it. */
export const vocabularyDescription = renderVocabulary(ledgerVocabulary);

export const prepareCommit = (call: {
  readonly history: LedgerHistory;
  readonly toolCallId: string;
  readonly changes: readonly LedgerChange[];
}) => prepareIdentityLedgerCommit({ ...call, vocabulary: ledgerVocabulary });

export const compileMap = (
  commits: readonly LedgerCommit[],
  options: Omit<LedgerMapOptions, "coverage"> = {},
): LedgerCompilation =>
  compileLedgerMap(commits, ledgerVocabulary.title, {
    ...options,
    coverage: ledgerVocabulary,
  });
