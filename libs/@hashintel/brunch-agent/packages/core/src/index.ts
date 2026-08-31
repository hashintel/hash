/**
 * `@hashintel/brunch-agent` — the harness.
 *
 * Mechanism and orchestration: the conversation loop, the ask API, the capture
 * envelope, the issue queue, sweep bookkeeping. Its public export surface *is*
 * the plugin SDK (spec §12.2).
 *
 * The substrate-neutral SDK remains on this main export. The `./flue` subpath
 * owns the production agent-runtime contribution; plugins may likewise expose
 * Flue-native resources while depending inward on this package. That direction
 * is enforced mechanically in the architecture tests.
 */

export {
  AskInput,
  FreeTextAffordance,
  type FreeTextAffordance as FreeTextAffordanceValue,
} from "./conversation/affordance";
export {
  ASK_TOOL_DESCRIPTION,
  askAffordanceId,
  askProtocolInstructionFragments,
  AskSubmission,
  buildReplyBindingSignalPayload,
  decideAskReplyAdmission,
  decidePendingAffordance,
  mintAskAffordance,
  pendingAskAffordanceId,
  type AskReplyAdmission,
  type PendingAffordanceDecision,
  type ReplyBindingSignalPayload,
} from "./conversation/ask-protocol";
export {
  OPERATIONS,
  PRODUCT_NAME,
  toolName,
  toolPrefix,
  type Operation,
} from "./conversation/naming";
export {
  type HarnessReplyEvent,
  type ReplyPartKind,
  type ToolExecution,
} from "./conversation/reply-protocol";
export {
  definePlugin,
  PluginDescriptor,
  type Plugin,
  type PluginProposalType,
} from "./plugin/plugin";
export {
  GUIDANCE_KEY_DESCRIPTIONS,
  GUIDANCE_KEYS,
  JOB_TITLES,
  JOBS,
  MOVEMENTS,
  RUNBOOK_KEY_DESCRIPTIONS,
  RUNBOOK_KEYS,
  type GuidanceKey,
  type Job,
  type KeyDescription,
  type MechanismType,
  type Movement,
  type RunbookKey,
} from "./plugin/keys";
export {
  guidanceEntries,
  GuidanceCellsSchema,
  GuidanceItemSchema,
  mustKnowRowsFor,
  PluginDefinitionError,
  PluginDefinitionSchema,
  PRECISION_LADDER,
  PRECISION_WORDS,
  readPluginDefinition,
  readYamlAs,
  runbookEntries,
  RunbookCellsSchema,
  type Anchor,
  type AttributeNote,
  type FloorRow,
  type GuidanceCells,
  type GuidanceItem,
  type KindRow,
  type MovementCells,
  type MustKnowRow,
  type NamedText,
  type PatternRow,
  type PluginDefinition,
  type PluginDefinitionInput,
  type PrecisionDemand,
  type PrecisionWord,
  type ProposalDeclaration,
  type RunbookCells,
} from "./plugin/plugin-definition";
export {
  readRepertoire,
  RepertoireSchema,
  type Repertoire,
} from "./teaching/repertoire";
export {
  HARNESS_PREAMBLE,
  renderContract,
  renderGuidance,
  renderInstructions,
  renderRunbook,
} from "./teaching/instructions";
export {
  createSlotAssertionSchema,
  nodeId,
  slotAssertionExtractionGuidance,
  SlotAssertionSchema,
  SOURCE_REGIMES,
  type SlotAssertion,
  type SourceRegime,
} from "./plugin/slot-assertion";
export {
  findNode,
  foldElicitedModel,
  type ElicitedModel,
  type ElicitedNode,
  type SlotReading,
  type SlotState,
  type UnmappedCapture,
} from "./interpretation/elicited-model";
export {
  COMPLETION_DIAGNOSTICS,
  completionDemands,
  evaluateCompletion,
  precisionSatisfies,
  type CompletionAnchor,
  type CompletionDemands,
  type CompletionDiagnostic,
  type CompletionFailure,
  type CompletionReport,
  type OutsideSliceNode,
} from "./interpretation/completion";
export {
  buildCompletionCueSignal,
  buildSweepList,
  type CompletionCueSignal,
  type PatternCue,
  type SweepList,
} from "./interpretation/cue";
export {
  ABSENCE_STATES,
  CaptureInputProposalSchema,
  applyCaptureStoreCommand,
  captureDedupKey,
  createEmptyCaptureStoreSnapshot,
  deriveCaptureStatus,
  deriveIssueStatus,
  EPISTEMIC_STATUSES,
  ISSUE_TYPES,
  parseCaptureStoreSnapshot,
  type AbsenceState,
  type CaptureContent,
  type CaptureAdvisory,
  type CaptureEnvelope,
  type CaptureInputProposal,
  type CaptureIssue,
  type CaptureProposal,
  type CaptureStatus,
  type CaptureStore,
  type CaptureStoreCommand,
  type CaptureStoreCommandEvidenceContext,
  type CaptureStoreEvidenceContext,
  type CaptureStoreEvent,
  type CaptureStoreRefusal,
  type CaptureStoreResult,
  type CaptureStoreSnapshot,
  type EpistemicStatus,
  type EvidenceSpan,
  type IssueStatus,
  type IssueOrigin,
  type IssueType,
  type JsonValue,
} from "./evidence/capture-store";
export {
  EvidenceQuoteSchema,
  SESSION_ENTRY_KINDS,
  type ArchivedSessionEntry,
  type ArchivedSessionEntryVersion,
  type EvidenceQuote,
  type EvidenceResolutionRefusal,
  type EvidenceResolutionResult,
  type MultipleEvidenceMatchesAdvisory,
  type SessionEntryKind,
} from "./evidence/session-log";
export {
  SWEEP_RESULT_STATUSES,
  advanceSweepHighWater,
  buildSettlementCheckSignal,
  buildSweepExtractionPrompt,
  buildSweepRepairSignal,
  computeUnaccountedAskAdvisories,
  createSweepExtractionResultSchema,
  createInitialSweepState,
  decideSettlementTrigger,
  parseSweepState,
  pendingSweepRepair,
  reopenSweepAfterRefusal,
  settlementProtocolInstructionFragments,
  sweepableRange,
  unsweptTail,
  type SettlementCheckSignal,
  type SettlementTriggerDecision,
  type SweepAffordance,
  type SweepExtraction,
  type SweepRepairSignal,
  type SweepRefusalFact,
  type SweepResultFact,
  type SweepSessionEntry,
  type SweepState,
  type UnaccountedAskAdvisory,
} from "./conversation/sweep-protocol";
