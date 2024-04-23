import dedent from "dedent";

import type {
  LlmAssistantMessage,
  LlmMessage,
  LlmUserMessage,
} from "../../shared/get-llm-response/llm-message";
import type { CompletedToolCall } from "./types";

export const mapPreviousCallsToLlmMessages = (params: {
  previousCalls: {
    completedToolCalls: CompletedToolCall<string>[];
  }[];
  omitToolCallOutputsPriorReverseIndex?: number;
}): LlmMessage[] => {
  const { previousCalls, omitToolCallOutputsPriorReverseIndex } = params;

  return previousCalls.flatMap<LlmMessage>(
    ({ completedToolCalls }, index, all) => {
      const isAfterOmitIndex =
        typeof omitToolCallOutputsPriorReverseIndex !== "undefined"
          ? index >= all.length - omitToolCallOutputsPriorReverseIndex
          : true;

      return completedToolCalls.length > 0
        ? [
            {
              role: "assistant",
              content: completedToolCalls.map(
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
              content: completedToolCalls.map((completedToolCall) => ({
                type: "tool_result",
                tool_use_id: completedToolCall.id,
                content: isAfterOmitIndex
                  ? completedToolCall.redactedOutputMessage ??
                    dedent(`
                        The output fo the tool call is:
                        ${completedToolCall.output}
                      `)
                  : "This output has been omitted to reduce the length of the chat.",
                is_error: completedToolCall.isError,
              })),
            } satisfies LlmUserMessage,
          ]
        : [];
    },
  );
};
