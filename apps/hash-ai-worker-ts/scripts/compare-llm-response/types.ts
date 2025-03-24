import type { ActorId } from "@blockprotocol/type-system";

import type {
  AnthropicLlmParams,
  GoogleAiParams,
  LlmParams,
  OpenAiLlmParams,
} from "../../src/activities/shared/get-llm-response/types.js";

export type CompareLlmResponseConfig = {
  models: LlmParams["model"][];
  llmParams:
    | Omit<AnthropicLlmParams, "model">
    | Omit<OpenAiLlmParams, "model">
    | Omit<GoogleAiParams, "model">;
  accountId?: ActorId;
};
