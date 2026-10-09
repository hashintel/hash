/**
 * The route-encoded Ledger (ledger2): entities, claims and reflections
 * appended through `ledger_commit` entries queues. Everything here derives
 * from conversation history and loads without Flue, so the browser renders the
 * same projection the server compiles.
 */

export { vLedgerAppend, type LedgerAppend } from "./ledger2/append";
export {
  foldCommits,
  ledgerAppendOutputSchema,
  prepareAppend,
  type AcceptedCommit,
  type FoldedLedger,
  type LedgerAppendOutput,
  type LedgerHistory,
  type LedgerHistoryMessage,
} from "./ledger2/commits";
export { vReflection } from "./ledger2/construction/reflections";
export { vClaim } from "./ledger2/elicitation/claims";
export {
  entityKindStages,
  vEntity,
  vEntityKind,
} from "./ledger2/elicitation/entities";
export { vOrigin, vStatus } from "./ledger2/shared/epistemics";
export * from "./ledger2/projection";
