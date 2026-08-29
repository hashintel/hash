/**
 * `@hashintel/brunch-agent` — the harness.
 *
 * Mechanism and orchestration: the conversation loop, the ask API, the capture
 * envelope, the issue queue, sweep bookkeeping. Its public export surface *is*
 * the plugin SDK (spec §12.2).
 *
 * **The harness imports no substrate.** A binding imports both this package and
 * its substrate; plugins resolve this package only. That direction is enforced
 * mechanically — see `test/boundaries.test.ts` at the repo root.
 */

export {
  AskInput,
  FreeTextAffordance,
  type FreeTextAffordance as FreeTextAffordanceValue,
} from "./affordance";
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
} from "./ask-protocol";
export {
  OPERATIONS,
  PRODUCT_NAME,
  toolName,
  toolPrefix,
  type Operation,
} from "./naming";
export {
  type HarnessReplyEvent,
  type ReplyPartKind,
  type ToolExecution,
} from "./reply-protocol";
export {
  definePlugin,
  PluginDescriptor,
  type Plugin,
  type PluginProposalType,
} from "./plugin";
export {
  mustKnowRowsFor,
  parsePluginFile,
  PLUGIN_FILE_HEADINGS,
  PluginFileError,
  pluginFileInstructions,
  PRECISION_WORDS,
  type FloorRow,
  type KindRow,
  type MustKnowRow,
  type PatternRow,
  type PluginFile,
  type PluginFileHeading,
  type PrecisionDemand,
  type PrecisionWord,
} from "./plugin-file";
export {
  createSlotAssertionSchema,
  nodeId,
  slotAssertionExtractionGuidance,
  SlotAssertionSchema,
  SOURCE_REGIMES,
  type SlotAssertion,
  type SourceRegime,
} from "./slot-assertion";
export {
  findNode,
  foldElicitedModel,
  type ElicitedModel,
  type ElicitedNode,
  type SlotReading,
  type SlotState,
  type UnmappedCapture,
} from "./elicited-model";
export {
  ANCHOR_KIND,
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
} from "./completion";
export {
  buildCompletionCueSignal,
  buildSweepList,
  completionProtocolInstructionFragments,
  type CompletionCueSignal,
  type PatternCue,
  type SweepList,
} from "./cue";
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
} from "./capture-store";
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
} from "./session-log";
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
} from "./sweep-protocol";
