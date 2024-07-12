import type {
  LlmAssistantMessage,
  LlmMessage,
  LlmUserMessage,
} from "../../shared/get-llm-response/llm-message";
import type { CompletedCoordinatorToolCall, CompletedToolCall } from "./types";

export const mapPreviousCallsToLlmMessages = (params: {
  includeErrorsOnly?: boolean;
  previousCalls: {
    completedToolCalls: (
      | CompletedCoordinatorToolCall<string>
      | CompletedToolCall<string>
    )[];
  }[];
}): LlmMessage[] => {
  const { includeErrorsOnly, previousCalls } = params;

  return previousCalls.flatMap<LlmMessage>(({ completedToolCalls }) => {
    const toolCallsToInclude = includeErrorsOnly
      ? completedToolCalls.filter((call) => call.isError)
      : completedToolCalls;

    return toolCallsToInclude.length > 0
      ? [
          {
            role: "assistant",
            content: toolCallsToInclude.map(
              /** @todo: consider also omitting large arguments from prior tool calls */
              ({ id, name, input }) => ({
                type: "tool_use",
                id,
                name,
                input,
              }),
            ),
          } satisfies LlmAssistantMessage,
          {
            role: "user",
            content: toolCallsToInclude.map((completedToolCall) => ({
              type: "tool_result",
              tool_use_id: completedToolCall.id,
              content: completedToolCall.output,
              is_error: completedToolCall.isError ? true : undefined,
            })),
          } satisfies LlmUserMessage,
        ]
      : [];
  });
};
