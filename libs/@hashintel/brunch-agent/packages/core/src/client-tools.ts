/**
 * Browser-safe source contracts for Brunch tools rendered by a host UI.
 */

import * as v from "valibot";

import {
  AskInput,
  AskSubmission,
} from "./conversation/ask-tool-contract";
import { toolName } from "./conversation/naming";

export { AskInput, AskSubmission, toolName };
export type { ToolName } from "./conversation/naming";

export const ASK_TOOL_NAME = toolName("ask");
export const SWEEP_TOOL_NAME = toolName("sweep");

/** A Flue tool result that delegates execution to the connected client. */
export const AWAITING_CLIENT = "client" as const;

export type BrunchAskInput = v.InferOutput<typeof AskInput>;
export type BrunchAskOutput = v.InferOutput<typeof AskSubmission>;

export const parseBrunchAskInput = (input: unknown): BrunchAskInput =>
  v.parse(AskInput, input);

export const parseBrunchAskOutput = (output: unknown): BrunchAskOutput =>
  v.parse(AskSubmission, output);
