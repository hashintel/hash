/**
 * `@brunch/core` — the harness.
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
} from './affordance.ts';
export {
  ASK_TOOL_DESCRIPTION,
  askProtocolInstructionFragments,
  buildReplyBindingSignalPayload,
  decidePendingAffordance,
  mintAskAffordance,
  type PendingAffordanceDecision,
  type ReplyBindingSignalPayload,
} from './ask-protocol.ts';
export { OPERATIONS, PRODUCT_NAME, toolName, toolPrefix, type Operation } from './naming.ts';
export { type HarnessReplyEvent } from './reply-protocol.ts';
export { definePlugin, PluginDescriptor, type Plugin, type PluginProposalType } from './plugin.ts';
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
} from './capture-store.ts';
export {
  type ArchivedSessionEntry,
  type ArchivedSessionEntryVersion,
  type EvidenceQuote,
  type EvidenceResolutionRefusal,
  type EvidenceResolutionResult,
  type MultipleEvidenceMatchesAdvisory,
  type SessionEntryKind,
} from './session-log.ts';
export {
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
} from './sweep-protocol.ts';
