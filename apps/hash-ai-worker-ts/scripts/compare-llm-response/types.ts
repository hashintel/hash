import type { AccountId } from "@local/hash-subgraph";

import type {
  AnthropicLlmParams,
  LlmParams,
  OpenAiLlmParams,
} from "../../src/activities/shared/get-llm-response/types";

export type CompareLlmResponseConfig = {
  models: LlmParams["model"][];
  llmParams: Omit<AnthropicLlmParams, "model"> & Omit<OpenAiLlmParams, "model">;
  accountId?: AccountId;
};
