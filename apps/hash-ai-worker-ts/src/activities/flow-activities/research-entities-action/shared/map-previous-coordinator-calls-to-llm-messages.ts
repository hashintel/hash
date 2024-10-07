import type {
  LlmAssistantMessage,
  LlmMessage,
  LlmUserMessage,
} from "../../../shared/get-llm-response/llm-message.js";
import type {
  CompletedCoordinatorToolCall,
  CoordinatorToolName,
  SubCoordinatingAgentToolName,
} from "./coordinator-tools.js";

export const mapPreviousCoordinatorCallsToLlmMessages = (params: {
  includeErrorsOnly: boolean;
  previousCalls: CompletedCoordinatorToolCall<
    CoordinatorToolName | SubCoordinatingAgentToolName
  >[];
}): LlmMessage[] => {
  const { includeErrorsOnly, previousCalls } = params;

  return previousCalls.flatMap<LlmMessage>((completedToolCall) => {
    if (includeErrorsOnly && !completedToolCall.isError) {
      return [];
    }

    const { id, name, input, output, isError } = completedToolCall;

    return [
      {
        role: "assistant",
        content:
          /** @todo: consider also omitting large arguments from prior tool calls */
          [
            {
              type: "tool_use",
              id,
              name,
              input,
            },
          ],
      } satisfies LlmAssistantMessage,
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: id,
            content: output,
            is_error: isError ? true : undefined,
          },
        ],
      } satisfies LlmUserMessage,
    ];
  });
};
