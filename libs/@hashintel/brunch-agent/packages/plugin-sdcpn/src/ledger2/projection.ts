/**
 * The Ledger's user-facing projection: committed records folded into a
 * sectioned structure and rendered to markdown in two skins over one shape.
 * `ledger_compile` renders the agent skin; the commenting flow
 * (resolve-selection) is design-only. Prototype harness: `_scratch/ledger-view`.
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
  type AddressEntry,
  type LedgerProjection,
  type ProjectedClaim,
  type ProjectedEntity,
  type ProjectedKindGroup,
  type ProjectedMetObligation,
  type ProjectedObligation,
  type ProjectedQuestion,
  type ProjectedSection,
} from "./projection/project-ledger";
export {
  renderLedgerMarkdown,
  type Skin,
} from "./projection/render-ledger-markdown";
export {
  opForAnswer,
  opForFeedback,
  resolveSelection,
  type LedgerOp,
  type ResolvedRecord,
} from "./projection/resolve-selection";
export { supportDeskLedger } from "./projection/worked-example";
