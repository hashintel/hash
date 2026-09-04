/**
 * `@hashintel/brunch-agent` — the harness.
 *
 * Active authority: tool naming, the harness reply-event contract, and the
 * evidence layer (capture store and archived session log) that the mechanical
 * capture sweep writes through the binding. The ask/affordance and settlement
 * protocols are compiled but suspended under `src/_suspended/`; they are
 * re-exported here only for the contracts other packages still type against.
 * The retired YAML plugin definition, repertoire, and typed interpretation
 * machinery were removed on 2026-09-02.
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
} from "./_suspended/conversation/affordance";
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
} from "./_suspended/conversation/ask-protocol";
export {
  OPERATIONS,
  PRODUCT_NAME,
  toolName,
  toolPrefix,
  type Operation,
} from "./conversation/naming";
export {
  BRUNCH_QUESTION_DATA_NAME,
  BRUNCH_QUESTION_TOOL_NAME,
  BrunchQuestionDataSchema,
  BrunchQuestionInputSchema,
  parseBrunchQuestionData,
  type BrunchQuestionData,
} from "./question-marker";
export {
  type HarnessReplyEvent,
  type ReplyPartKind,
  type ToolExecution,
} from "./conversation/reply-protocol";
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
  type SweepRepairSignal,
  type SweepRefusalFact,
  type SweepResultFact,
  type SweepSessionEntry,
  type SweepState,
  type UnaccountedAskAdvisory,
} from "./_suspended/conversation/sweep-protocol";
