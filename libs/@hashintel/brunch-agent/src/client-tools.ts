/**
 * Browser-safe source contracts for Brunch tools rendered by a host UI.
 */

import { toolName } from "./conversation/naming";

export {
  browserCallEndedWithoutResult,
  browserCallStaleRefusal,
  browserCallUnstartedRefusal,
  browserCallClaimBodySchema,
  browserCallFailureBodySchema,
  browserCallLeaseBodySchema,
  browserCallResultBodySchema,
  type BrowserCallClaim,
  type BrowserCallClaimBody,
  type BrowserCallFailureBody,
  type BrowserCallFailureDisposition,
  type BrowserCallLeaseBody,
  type BrowserCallResultBody,
} from "./client-tools/browser-calls";
export {
  browserToolEnvelopeOf,
  browserToolOutput,
  type BrowserToolEnvelope,
  type ClientToolResult,
} from "./client-tools/browser-tool-result";
export {
  clientToolHistoryFrom,
  type ClientToolHistoryResult,
} from "./client-tools/client-tool-history";
export {
  durableHistoryMessageMetadataSchema,
  durableHistoryPartTypes,
  parseDurableHistoryMessageMetadata,
  type DurableHistoryMessageMetadata,
} from "./client-tools/durable-history-metadata";
export {
  handEditReportBodySchema,
  type HandEditReportBody,
} from "./client-tools/hand-edit-reports";
export { projectBrunchMessageMetadata } from "./client-tools/message-metadata";

export const SWEEP_TOOL_NAME = toolName("sweep");
