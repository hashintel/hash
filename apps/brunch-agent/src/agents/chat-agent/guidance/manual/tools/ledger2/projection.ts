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
  ReflectionRecord,
  Turn,
} from "./projection/records.ts";
export {
  projectLedger,
  type AddressEntry,
  type LedgerProjection,
  type ProjectedClaim,
  type ProjectedEntity,
  type ProjectedKindGroup,
  type ProjectedQuestion,
  type ProjectedSection,
} from "./projection/project-ledger.ts";
export {
  renderLedgerMarkdown,
  type Skin,
} from "./projection/render-ledger-markdown.ts";
export {
  opForAnswer,
  opForFeedback,
  resolveSelection,
  type LedgerOp,
  type ResolvedRecord,
} from "./projection/resolve-selection.ts";
export { supportDeskLedger } from "./projection/worked-example.ts";
