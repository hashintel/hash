import {
  parseClientToolResultMetadata,
  sdcpnLedgerProfile,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  foldCommits,
  projectLedger,
  renderLedgerMarkdown,
  type Skin,
} from "@hashintel/brunch-agent-plugin-sdcpn/ledger2";
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

/**
 * Folds only accepted commits; refused, failed, pending and unbound calls never
 * appear. A conversation keeps one Ledger: the Note Ledger, or the manual
 * arm's route-encoded ledger2, whose commits the Note reader never accepts.
 */
export const foldBrunchLedgerHistory = (
  messages: readonly BrunchLedgerHistoryMessage[],
  { skin = "user" }: { readonly skin?: Skin } = {},
): BrunchLedgerHistory => {
  const settled = settledDocumentChanges(messages);
  const commits = reconstructLedger({ messages });
  if (commits.length === 0) {
    const ledger2 = foldCommits({ messages });
    if (ledger2.commits.length > 0)
      return {
        activityIdentities: [
          ...ledger2.commits.map(({ commitId }) => commitId),
          ...settled,
        ],
        markdown: renderLedgerMarkdown(projectLedger(ledger2.state), skin),
      };
  }
  const compiled = compileLedger(commits, profile);
  return {
    activityIdentities: [
      ...commits.map(({ commitId }) => commitId),
      ...settled,
    ],
    markdown:
      commits.length > 0 && compiled.status === "compiled"
        ? compiled.markdown
        : undefined,
  };
};
