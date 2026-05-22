import type {
  AnthropicLlmParams,
  GoogleAiParams,
  LlmParams,
  OpenAiLlmParams,
} from "../../src/activities/shared/get-llm-response/types.js";
import type { ActorEntityUuid } from "@blockprotocol/type-system";

export type CompareLlmResponseConfig = {
  models: LlmParams["model"][];
  llmParams:
    | Omit<AnthropicLlmParams, "model">
    | Omit<OpenAiLlmParams, "model">
    | Omit<GoogleAiParams, "model">;
  accountId?: ActorEntityUuid;
};
