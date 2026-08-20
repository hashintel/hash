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
export { definePlugin, PluginDescriptor, type Plugin } from './plugin.ts';
export {
  ABSENCE_STATES,
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
  type CaptureIssue,
  type CaptureProposal,
  type CaptureStatus,
  type CaptureStore,
  type CaptureStoreCommand,
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
