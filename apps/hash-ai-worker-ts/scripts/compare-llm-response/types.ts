import type { AccountId } from "@local/hash-graph-types/account";

import type {
  AnthropicLlmParams,
  LlmParams,
  OpenAiLlmParams,
} from "../../src/activities/shared/get-llm-response/types.js";

export type CompareLlmResponseConfig = {
  models: LlmParams["model"][];
  llmParams: Omit<AnthropicLlmParams, "model"> & Omit<OpenAiLlmParams, "model">;
  accountId?: AccountId;
};
