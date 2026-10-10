import {
  compileLedger,
  composeLedgerProfile,
  reconstructLedger,
  type LedgerHistory,
} from "@hashintel/brunch-agent";
import { sdcpnLedgerProfile } from "@hashintel/brunch-agent-plugin-sdcpn";
import * as manual from "@hashintel/brunch-agent-plugin-sdcpn/ledger2";

import * as receipt from "../../agents/chat-agent/guidance/receipt/ledger.ts";

import type { GuidanceVariant } from "../../agents/chat-agent/guidance-variant.ts";

const ledgerProfile = composeLedgerProfile(sdcpnLedgerProfile);

/** `ledger.json` and, when the Ledger compiles, `ledger.md`. */
export interface LedgerEvidence {
  readonly commits: readonly unknown[];
  readonly markdown?: string;
}

const evidence = (
  commits: readonly unknown[],
  compiled: { status: string; markdown?: string },
): LedgerEvidence =>
  compiled.status === "compiled" && compiled.markdown !== undefined
    ? { commits, markdown: compiled.markdown }
    : { commits };

const ownLedgerEvidence = (
  ledger: typeof receipt,
  history: LedgerHistory,
): LedgerEvidence => {
  const commits = ledger.reconstructLedger(history);
  return evidence(commits, ledger.compileMap(commits, { detail: "full" }));
};

const manualLedgerEvidence = (history: LedgerHistory): LedgerEvidence => {
  const { state, commits } = manual.foldCommits(history);
  return {
    commits,
    markdown: manual.renderLedgerMarkdown(manual.projectLedger(state), "agent"),
  };
};

/**
 * A run's Ledger, read back with the Ledger its arm keeps: a self-contained
 * arm's own, otherwise the package's.
 */
export const ledgerEvidence = (
  history: LedgerHistory,
  variant?: GuidanceVariant,
): LedgerEvidence => {
  if (variant === "manual") return manualLedgerEvidence(history);
  if (variant === "receipt") return ownLedgerEvidence(receipt, history);
  const commits = reconstructLedger(history);
  return evidence(commits, compileLedger(commits, ledgerProfile));
};
