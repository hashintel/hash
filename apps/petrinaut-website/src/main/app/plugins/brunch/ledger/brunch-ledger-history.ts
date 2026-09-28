import {
  parseClientToolResultMetadata,
  sdcpnLedgerProfile,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  compileLedger,
  composeLedgerProfile,
  reconstructLedger,
  type LedgerHistoryMessage,
} from "@hashintel/brunch-agent/ledger";

const profile = composeLedgerProfile(sdcpnLedgerProfile);

export type BrunchLedgerHistoryMessage = LedgerHistoryMessage;

export type BrunchLedgerHistory = {
  /** Accepted commits and settled document changes, for the tab's activity badge. */
  readonly activityIdentities: readonly string[];
  /** The compiled Ledger exactly as the model reads it; absent before the first commit. */
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

/** Folds only accepted commits; refused, failed, pending and unbound calls never appear. */
export const foldBrunchLedgerHistory = (
  messages: readonly BrunchLedgerHistoryMessage[],
): BrunchLedgerHistory => {
  const commits = reconstructLedger({ messages });
  const compiled = compileLedger(commits, profile);
  return {
    activityIdentities: [
      ...commits.map(({ commitId }) => commitId),
      ...settledDocumentChanges(messages),
    ],
    markdown:
      commits.length > 0 && compiled.status === "compiled"
        ? compiled.markdown
        : undefined,
  };
};
