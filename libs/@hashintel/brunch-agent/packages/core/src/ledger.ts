/**
 * The append-only Ledger: immutable Notes filed at configured categories.
 * Canonical history is the sequence of accepted `ledger_commit` calls in the
 * conversation; everything here derives from that history and loads without
 * Flue, so the browser can render the same compilation.
 */

export {
  prepareIdentityLedgerCommit,
  prepareLedgerCommit,
} from "./ledger/commit";
export {
  compileLedger,
  type LedgerCompilation,
  type LedgerCompileOptions,
} from "./ledger/compile";
export {
  compileLedgerMap,
  coverageOf,
  defaultCoverageRenderer,
  isSubjectNote,
  summariseCoverage,
  type LedgerCoverage,
  type LedgerCoverageRenderer,
  type LedgerMapOptions,
  type LedgerStage,
  type LedgerUnmetNeeds,
} from "./ledger/map";
export {
  defaultIdentityLedgerText,
  identityCommitInputSchema,
  renderVocabulary,
  type IdentityLedgerText,
  type LedgerCoverageTerms,
  type LedgerDimension,
  type LedgerExpectation,
  type LedgerKind,
  type LedgerVocabulary,
  type LedgerVocabularyTerm,
} from "./ledger/vocabulary";
export {
  ledgerCalls,
  reconstructLedger,
  type LedgerHistory,
  type LedgerHistoryMessage,
} from "./ledger/history";
export {
  deriveNotes,
  findNote,
  isRefusedLedgerCommit,
  ledgerBases,
  ledgerCommitInputSchemas,
  ledgerCommitOutputSchema,
  ledgerPrecisions,
  ledgerSources,
  ledgerStandings,
  type LedgerChange,
  type LedgerCommit,
  type LedgerCommitOutput,
  type LedgerNote,
  type LedgerNoteShape,
  type LedgerRelation,
} from "./ledger/notes";
export {
  composeLedgerProfile,
  type LedgerCategory,
  type LedgerProfile,
} from "./ledger/profile";
