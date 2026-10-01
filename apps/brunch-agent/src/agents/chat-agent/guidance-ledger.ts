import * as manual from "./guidance/manual/ledger.ts";
import * as receipt from "./guidance/receipt/ledger.ts";

import type { GuidanceVariant } from "./guidance-variant.ts";
import type { LedgerHistory } from "@hashintel/brunch-agent";

/** An accepted commit, as much of it as readers outside the arm need. */
export interface OwnLedgerCommit {
  readonly revision: number;
  readonly afterMessageId?: string;
  readonly notes: readonly { readonly id: string }[];
}

/**
 * How a self-contained arm's runs read its Ledger back from conversation
 * history, so that `query_basis` and the persona evidence agree with the
 * arm's own tools rather than with the shared Ledger.
 */
export interface OwnLedger {
  readonly reconstruct: (
    history: LedgerHistory,
    before?: string,
  ) => readonly OwnLedgerCommit[];
  /** `ledger.json` and `ledger.md` for a run's evidence. */
  readonly evidence: (history: LedgerHistory) => {
    readonly commits: readonly OwnLedgerCommit[];
    readonly markdown?: string;
  };
}

const ownLedgerOf = (ledger: typeof manual | typeof receipt): OwnLedger => ({
  reconstruct: ledger.reconstructLedger,
  evidence: (history) => {
    const commits = ledger.reconstructLedger(history);
    const compiled = ledger.compileMap(commits, { detail: "full" });
    return compiled.status === "compiled"
      ? { commits, markdown: compiled.markdown }
      : { commits };
  },
});

/** A self-contained arm's own Ledger reader; the shared arms have none. */
export const ownLedger = (variant: GuidanceVariant): OwnLedger | undefined => {
  if (variant === "manual") return ownLedgerOf(manual);
  if (variant === "receipt") return ownLedgerOf(receipt);
  return undefined;
};
