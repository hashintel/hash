/**
 * Browser-safe source contracts for Brunch tools rendered by a host UI.
 */

import { toolName } from "./conversation/naming";

export { AskInput, AskSubmission } from "./conversation/ask-tool-contract";

export const SWEEP_TOOL_NAME = toolName("sweep");
