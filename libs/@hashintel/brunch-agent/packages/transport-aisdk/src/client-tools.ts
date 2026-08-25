/**
 * Browser-safe wire contract for the Brunch tools a host UI executes.
 */

import * as v from "valibot";

import {
  AskInput,
  AskSubmission,
  toolName,
} from "@hashintel/brunch-agent/client-tools";

export const ASK_TOOL_NAME = toolName("ask");

export type BrunchAskInput = v.InferOutput<typeof AskInput>;
export type BrunchAskOutput = v.InferOutput<typeof AskSubmission>;

export const parseBrunchAskInput = (input: unknown): BrunchAskInput =>
  v.parse(AskInput, input);

export const parseBrunchAskOutput = (output: unknown): BrunchAskOutput =>
  v.parse(AskSubmission, output);
