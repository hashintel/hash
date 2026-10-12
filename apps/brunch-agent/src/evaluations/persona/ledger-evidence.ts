import {
  foldCommits,
  projectLedger,
  renderLedgerMarkdown,
  type LedgerHistory,
} from "@hashintel/brunch-agent-plugin-sdcpn/ledger2";

/** `ledger.json` and `ledger.md`. */
export interface LedgerEvidence {
  readonly commits: readonly unknown[];
  readonly markdown: string;
}

/** A run's Ledger, read back from its history. */
export const ledgerEvidence = (history: LedgerHistory): LedgerEvidence => {
  const { state, commits } = foldCommits(history);
  return {
    commits,
    markdown: renderLedgerMarkdown(projectLedger(state), "agent"),
  };
};
