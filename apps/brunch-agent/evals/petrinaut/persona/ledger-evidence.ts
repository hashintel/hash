import {
  foldCommits,
  type FoldedLedger,
  type LedgerHistory,
  projectLedger,
  renderLedgerMarkdown,
} from "@hashintel/brunch-agent";

/** `ledger.json` and `ledger.md`. */
export interface LedgerEvidence {
  readonly commits: FoldedLedger["commits"];
  readonly markdown: string;
}

/** A run's Ledger, read back from its history. */
export const ledgerEvidence = (history: LedgerHistory): LedgerEvidence => {
  const { state, commits } = foldCommits(history);
  return {
    commits,
    markdown: renderLedgerMarkdown(projectLedger(state)),
  };
};
