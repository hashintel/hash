import { ledgerCalls, reconstructLedger, type LedgerHistory } from "./history";
import {
  deriveNotes,
  findNote,
  type LedgerChange,
  type LedgerCommitOutput,
  type LedgerNote,
} from "./notes";
import { isNoteId, type LedgerVocabulary } from "./vocabulary";

import type { LedgerProfile } from "./profile";

type Refusal = Extract<LedgerCommitOutput, { status: "refused" }>;
type RefusalReason = Pick<Refusal, "code" | "message">;

/**
 * Decide one `ledger_commit` call from the history that contains it. The
 * result depends only on that call's identity and the accepted commits before
 * it, so re-running an interrupted call yields the same Notes.
 */
const decideCommit = ({
  history,
  toolCallId,
  changes,
  check,
}: {
  readonly history: LedgerHistory;
  readonly toolCallId: string;
  readonly changes: readonly LedgerChange[];
  readonly check: (prior: readonly LedgerNote[]) => RefusalReason | undefined;
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
      applied: false,
      code: "concurrent-commit",
      message:
        "An earlier ledger_commit proposed alongside this one had not finished, so nothing was recorded. Resubmit these changes in a later call; one ledger_commit per proposal avoids this.",
      revision,
    };
  const prior = commits.flatMap((commit) => commit.notes);
  const refused = check(prior);
  if (refused)
    return { status: "refused", applied: false, ...refused, revision };
  const derived = deriveNotes(prior, changes);
  if ("missingTarget" in derived)
    return {
      status: "refused",
      applied: false,
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

/** A commit to a category-addressed Ledger. */
export const prepareLedgerCommit = ({
  profile,
  ...call
}: {
  readonly history: LedgerHistory;
  readonly toolCallId: string;
  readonly changes: readonly LedgerChange[];
  readonly profile: LedgerProfile;
}): LedgerCommitOutput =>
  decideCommit({
    ...call,
    check: () => {
      const categories = profile.categories.map(({ path }) => path);
      const unknown = call.changes.find(
        (change): change is Extract<LedgerChange, { op: "add" }> =>
          change.op === "add" && !categories.includes(change.address),
      );
      return unknown
        ? {
            code: "unknown-category",
            message: `No category ${unknown.address}; nothing was recorded. add takes a category path; supersede takes an existing Note. Categories: ${categories.join(", ")}.`,
          }
        : undefined;
    },
  });

/**
 * A commit to an identity-addressed Ledger. Every name a change refers to
 * must be fixed, identified earlier, or identified earlier in the same commit.
 */
export const prepareIdentityLedgerCommit = ({
  vocabulary,
  ...call
}: {
  readonly history: LedgerHistory;
  readonly toolCallId: string;
  readonly changes: readonly LedgerChange[];
  readonly vocabulary: LedgerVocabulary;
}): LedgerCommitOutput =>
  decideCommit({
    ...call,
    check: (prior) => identityRefusal(vocabulary, prior, call.changes),
  });

const identityRefusal = (
  vocabulary: LedgerVocabulary,
  prior: readonly LedgerNote[],
  changes: readonly LedgerChange[],
): RefusalReason | undefined => {
  const known = new Map<string, string>(
    vocabulary.fixed.map(({ name }) => [name, "a fixed identity"]),
  );
  for (const note of prior)
    if (note.identity !== undefined && !known.has(note.identity))
      known.set(note.identity, note.id);
  const unknown = (name: string): RefusalReason => ({
    code: "unknown-identity",
    message: `No identity ${name}; nothing was recorded. identify it first, earlier in this commit or before. Known identities: ${[...known.keys()].join(", ")}.`,
  });
  const invalid = (message: string): RefusalReason => ({
    code: "invalid-change",
    message: `${message} Nothing was recorded.`,
  });
  for (const change of changes)
    switch (change.op) {
      case "add":
        return invalid("add is not available; use identify, relate or note.");
      case "identify": {
        if (isNoteId(change.identity))
          return invalid(
            `${change.identity} has the form of a Note id; choose a descriptive identity name.`,
          );
        const existing = known.get(change.identity);
        if (existing !== undefined)
          return {
            code: "duplicate-identity",
            message: `${change.identity} already exists (${existing}); nothing was recorded. Supersede its identity Note to revise it.`,
          };
        known.set(change.identity, "this commit");
        break;
      }
      case "relate":
        for (const end of [change.from, change.to])
          if (!known.has(end)) return unknown(end);
        if (change.relation === "other" && change.label === undefined)
          return invalid("relate with relation other needs a label.");
        break;
      case "note":
        for (const reference of change.about) {
          if (!isNoteId(reference)) {
            if (!known.has(reference)) return unknown(reference);
            continue;
          }
          const subject = findNote(prior, reference);
          if (
            subject?.identity === undefined &&
            subject?.relation === undefined
          )
            return invalid(
              `${reference} is not a recorded identity or relationship Note; about takes identity names and the ids of identity or relationship Notes.`,
            );
        }
        break;
      case "supersede": {
        const predecessor = findNote(prior, change.address);
        if (
          change.kind !== undefined &&
          predecessor !== undefined &&
          predecessor.identity === undefined
        )
          return invalid(
            `kind applies only when superseding an identity Note; ${change.address} is not one.`,
          );
        break;
      }
    }
  return undefined;
};
