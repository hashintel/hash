import {
  foldCommits,
  type LedgerHistoryMessage,
  parseClientToolResultMetadata,
  projectLedger,
  renderLedgerMarkdown,
} from "@hashintel/brunch-agent";

export type BrunchLedgerHistoryMessage = LedgerHistoryMessage;

export type BrunchLedgerHistory = {
  /** Accepted commits and settled document changes, for the tab's activity badge. */
  readonly activityIdentities: readonly string[];
  /** The compiled Ledger; absent before the first commit. */
  readonly markdown: string | undefined;
};

const settledDocumentChanges = (
  messages: readonly BrunchLedgerHistoryMessage[],
): string[] =>
  messages.flatMap((message) =>
    message.role === "assistant"
      ? message.parts.flatMap((part) => {
          if (typeof part !== "object" || part === null) return [];
          const candidate = part as Record<string, unknown>;
          const output = candidate.output as Record<string, unknown> | null;
          return candidate.type === "dynamic-tool" &&
            candidate.state === "output-available" &&
            typeof candidate.toolCallId === "string" &&
            typeof output === "object" &&
            output !== null &&
            output.brunchBrowserResult === true &&
            parseClientToolResultMetadata(output.metadata)?.documentRevision
              .after !== undefined
            ? [candidate.toolCallId]
            : [];
        })
      : [],
  );

/** Folds only accepted commits, rendered in the user skin; refused, failed, pending and unbound calls never appear. */
export const foldBrunchLedgerHistory = (
  messages: readonly BrunchLedgerHistoryMessage[],
): BrunchLedgerHistory => {
  const { commits, state } = foldCommits({ messages });
  return {
    activityIdentities: [
      ...commits.map(({ commitId }) => commitId),
      ...settledDocumentChanges(messages),
    ],
    markdown:
      commits.length > 0
        ? renderLedgerMarkdown(projectLedger(state), "user")
        : undefined,
  };
};
