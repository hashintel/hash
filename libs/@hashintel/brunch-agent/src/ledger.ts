/**
 * The route-encoded Ledger: entities, claims and reflections
 * appended through `ledger_commit` entries queues. Everything here derives
 * from conversation history and loads without Flue, so the browser renders the
 * same projection the server compiles.
 */

export {
  ledgerAppendSchemaWith,
  ledgerAppendSchema,
  type LedgerAppend,
} from "./ledger/append";
export {
  ledgerCommentsMessage,
  parseLedgerComments,
  type LedgerComment,
} from "./ledger/comments";
export {
  foldCommits,
  isRefusedLedgerCommit,
  latestLedgerTurnId,
  ledgerAppendOutputSchema,
  prepareAppend,
  type FoldedLedger,
  type LedgerHistory,
  type LedgerHistoryMessage,
} from "./ledger/commits";
export {
  latestTurnChanges,
  type LedgerChange,
} from "./ledger/latest-turn-changes";
export { claimSchema } from "./ledger/elicitation/claims";
export {
  entityKindStages,
  entitySchema,
  entityKindSchema,
} from "./ledger/elicitation/entities";
export {
  reflectionSchema,
  type NetElementAddress,
} from "./ledger/construction/reflections";
export {
  originSchemaWith,
  originSchema,
  statusSchema,
} from "./ledger/shared/epistemics";
export { traceLedger, type LedgerTrace } from "./ledger/trace";
export * from "./ledger/projection";
