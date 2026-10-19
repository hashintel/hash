/**
 * The Ledger's projection: committed records folded into a sectioned
 * structure. `ledger_compile` renders it as Markdown for the model, with
 * record addresses and kind tokens inline; the website's Ledger tab renders
 * it as a document.
 */

export type {
  CommentRecord,
  LedgerState,
  ReflectionRecord,
} from "./projection/records";
export {
  projectLedger,
  type LedgerProjection,
  type ProjectedClaim,
  type ProjectedEntity,
  type ProjectedObligation,
} from "./projection/project-ledger";
export { renderLedgerMarkdown } from "./projection/render-ledger-markdown";
