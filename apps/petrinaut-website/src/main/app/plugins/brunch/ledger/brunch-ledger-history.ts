import {
  foldCommits,
  type LedgerHistoryMessage,
  type LedgerState,
} from "@hashintel/brunch-agent";

export type BrunchLedgerHistory = {
  /** Accepted commits, for the tab's activity badge: each is something new to read. */
  readonly activityIdentities: readonly string[];
  /** The folded Ledger; absent before the first commit. */
  readonly ledger: LedgerState | undefined;
};

/** Folds only accepted commits; refused, failed, pending and unbound calls never appear. */
export const foldBrunchLedgerHistory = (
  messages: readonly LedgerHistoryMessage[],
): BrunchLedgerHistory => {
  const { commits, state } = foldCommits({ messages });
  return {
    activityIdentities: commits.map(({ commitId }) => commitId),
    ledger: commits.length > 0 ? state : undefined,
  };
};
