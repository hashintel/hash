import type { UIMessage } from "ai";

/**
 * Whether a user turn is a batch of Ledger comments. The turn says so in its
 * metadata; text that happens to parse as comments is still the user's words.
 */
export const isLedgerCommentsMessage = (message: UIMessage): boolean =>
  message.role === "user" &&
  typeof message.metadata === "object" &&
  message.metadata !== null &&
  "ledgerComments" in message.metadata &&
  message.metadata.ledgerComments === true;
