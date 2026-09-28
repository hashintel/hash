import { ledgerCalls, reconstructLedger, type LedgerHistory } from "./history";
import {
  deriveNotes,
  type LedgerChange,
  type LedgerCommitOutput,
} from "./notes";

import type { LedgerProfile } from "./profile";

/**
 * Decide one `ledger_commit` call from the history that contains it. The
 * result depends only on that call's identity and the accepted commits before
 * it, so re-running an interrupted call yields the same Notes.
 */
export const prepareLedgerCommit = ({
  history,
  toolCallId,
  changes,
  profile,
}: {
  readonly history: LedgerHistory;
  readonly toolCallId: string;
  readonly changes: readonly LedgerChange[];
  readonly profile: LedgerProfile;
}): LedgerCommitOutput => {
  const own = ledgerCalls(history).find(
    (call) => call.part.toolCallId === toolCallId,
  );
  if (!own)
    throw new Error(
      `Conversation history does not contain ledger_commit call ${toolCallId}; the Ledger cannot be reconstructed.`,
    );
  const commits = reconstructLedger(history, toolCallId);
  const revision = commits.length;
  if (own.followsUnsettledCall)
    return {
      status: "refused",
      code: "concurrent-commit",
      message:
        "An earlier ledger_commit proposed alongside this one had not finished, so nothing was recorded. Resubmit these changes in a later call; one ledger_commit per proposal avoids this.",
      revision,
    };
  const categories = profile.categories.map(({ path }) => path);
  const unknown = changes.find(
    (change) => change.op === "add" && !categories.includes(change.address),
  );
  if (unknown)
    return {
      status: "refused",
      code: "unknown-category",
      message: `No category ${unknown.address}; nothing was recorded. add takes a category path; supersede takes an existing Note. Categories: ${categories.join(", ")}.`,
      revision,
    };
  const derived = deriveNotes(
    commits.flatMap((commit) => commit.notes),
    changes,
  );
  if ("missingTarget" in derived)
    return {
      status: "refused",
      code: "unknown-note",
      message: `No recorded Note ${derived.missingTarget}; nothing was recorded. Supersede a Note by the id or address from an earlier receipt or compilation.`,
      revision,
    };
  return {
    status: "recorded",
    commitId: toolCallId,
    revision: revision + 1,
    notes: derived.notes.map(({ address, supersedes }) =>
      supersedes === undefined ? { address } : { address, supersedes },
    ),
  };
};
