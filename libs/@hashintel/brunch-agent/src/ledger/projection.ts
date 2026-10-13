/**
 * The Ledger's projection: committed records folded into a sectioned
 * structure and rendered to markdown in two skins over one shape. The agent
 * skin carries record addresses and kind tokens inline; the user skin is clean
 * prose. `ledger_compile` renders the agent skin, the website's Ledger tab the
 * user skin.
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
export {
  renderLedgerMarkdown,
  type Skin,
} from "./projection/render-ledger-markdown";
