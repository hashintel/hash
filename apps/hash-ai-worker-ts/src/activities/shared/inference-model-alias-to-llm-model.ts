import type { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";

import type { LlmParams } from "./get-llm-response/types.js";

/**
 * A map of the API consumer-facing model names to the specific model names used to call the LLM APIs.
 * Allows for using preview models before they take over the general alias.
 */
export const inferenceModelAliasToSpecificModel = {
  "gpt-3.5-turbo": "gpt-3.5-turbo-1106", // bigger context window, will be the resolved value for gpt-3.5-turbo from 11
  // Dec 2023
  "gpt-4-turbo": "gpt-4-0125-preview",
  // preview only
  "gpt-4": "gpt-4", // this points to the latest available anyway as of 6 Dec 2023
  "claude-3-haiku": "claude-3-haiku-20240307",
  "claude-3-sonnet": "claude-3-5-sonnet-20240620",
  "claude-3-opus": "claude-3-opus-20240229",
} as const satisfies Record<InferenceModelName, LlmParams["model"]>;
