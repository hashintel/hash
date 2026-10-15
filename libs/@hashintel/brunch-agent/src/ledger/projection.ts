/**
 * The Ledger's projection: committed records folded into a sectioned
 * structure. `ledger_compile` renders it as Markdown for the model, with
 * record addresses and kind tokens inline; the website's Ledger tab renders
 * it as a document.
 */

export type {
  ClaimRecord,
  EntityRecord,
  LedgerState,
  ObligationRecord,
  ReflectionRecord,
  Turn,
} from "./projection/records";
export {
  owedObligations,
  projectLedger,
  type LedgerProjection,
  type ProjectedClaim,
  type ProjectedEntity,
  type ProjectedKindGroup,
  type ProjectedMetObligation,
  type ProjectedObligation,
  type ProjectedQuestion,
  type ProjectedSection,
} from "./projection/project-ledger";
export { renderLedgerMarkdown } from "./projection/render-ledger-markdown";
