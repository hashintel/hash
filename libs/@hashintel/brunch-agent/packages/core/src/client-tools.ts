/**
 * Browser-safe source contracts for Brunch tools rendered by a host UI.
 */

import { toolName } from "./conversation/naming";

export {
  browserToolOutput,
  CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH,
  type ClientToolResult,
} from "./client-tools/browser-tool-result";
export {
  clientToolHistoryFrom,
  type ClientToolHistory,
  type ClientToolHistoryCall,
  type ClientToolHistoryMessage,
  type ClientToolHistoryResult,
} from "./client-tools/client-tool-history";

export const SWEEP_TOOL_NAME = toolName("sweep");
