import type { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import OpenAI from "openai";

export type PermittedOpenAiModel =
  | "gpt-3.5-turbo-1106"
  | "gpt-4-1106-preview"
  | "gpt-4-0125-preview"
  | "gpt-4-turbo"
  | "gpt-4";

export const modelToContextWindow: Record<PermittedOpenAiModel, number> = {
  "gpt-3.5-turbo-1106": 16_385,
  "gpt-4-1106-preview": 128_000,
  "gpt-4-0125-preview": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
};

/**
 * A map of the API consumer-facing model names to the values provided to OpenAI.
 * Allows for using preview models before they take over the general alias.
 */
export const modelAliasToSpecificModel = {
  "gpt-3.5-turbo": "gpt-3.5-turbo-1106", // bigger context window, will be the resolved value for gpt-3.5-turbo from 11
  // Dec 2023
  "gpt-4-turbo": "gpt-4-0125-preview",
  // preview only
  "gpt-4": "gpt-4", // this points to the latest available anyway as of 6 Dec 2023
} as const satisfies Record<InferenceModelName, PermittedOpenAiModel>;

export const isPermittedModel = (
  model: OpenAI.ChatCompletionCreateParams["model"],
): model is PermittedOpenAiModel =>
  Object.keys(modelToContextWindow).includes(model);

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable not set.");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
