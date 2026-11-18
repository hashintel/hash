/**
 * Browser-safe source contracts for Brunch tools rendered by a host UI.
 */

import { toolName } from "./conversation/naming";

export {
  browserCallFailureBodySchema,
  browserCallLeaseBodySchema,
  browserCallResultBodySchema,
  type BrowserCallClaim,
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
export { projectBrunchMessageMetadata } from "./client-tools/message-metadata";

export const SWEEP_TOOL_NAME = toolName("sweep");
