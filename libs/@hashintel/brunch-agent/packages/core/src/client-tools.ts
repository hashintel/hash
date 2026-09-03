/**
 * Browser-safe source contracts for Brunch tools rendered by a host UI.
 */

import * as v from "valibot";

import { AskInput, AskSubmission } from "./ask-tool-contract";
import { toolName } from "./naming";

export { AskInput, AskSubmission, toolName };
export type { ToolName } from "./naming";

export const ASK_TOOL_NAME = toolName("ask");
export const SWEEP_TOOL_NAME = toolName("sweep");

export type BrunchAskInput = v.InferOutput<typeof AskInput>;
export type BrunchAskOutput = v.InferOutput<typeof AskSubmission>;

export const parseBrunchAskInput = (input: unknown): BrunchAskInput =>
  v.parse(AskInput, input);

export const parseBrunchAskOutput = (output: unknown): BrunchAskOutput =>
  v.parse(AskSubmission, output);
