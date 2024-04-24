import dedent from "dedent";
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources";

import type { CompletedToolCall } from "./types";

export const mapPreviousCallsToChatCompletionMessages = (params: {
  previousCalls: {
    completedToolCalls: CompletedToolCall<string>[];
  }[];
  omitToolCallOutputsPriorReverseIndex?: number;
}): ChatCompletionMessageParam[] => {
  const { previousCalls, omitToolCallOutputsPriorReverseIndex } = params;

  return previousCalls.flatMap<ChatCompletionMessageParam>(
    ({ completedToolCalls }, index, all) => {
      const isAfterOmitIndex =
        typeof omitToolCallOutputsPriorReverseIndex !== "undefined"
          ? index >= all.length - omitToolCallOutputsPriorReverseIndex
          : true;

      return completedToolCalls.length > 0
        ? [
            {
              role: "assistant",
              content: null,
              tool_calls: completedToolCalls.map(
                /** @todo: consider also omitting large arguments from prior tool calls */
                ({ id, name, input }) => ({
                  id,
                  type: "function",
                  function: {
                    name,
                    arguments: JSON.stringify(input),
                  },
                }),
              ),
            } satisfies ChatCompletionMessage,
            ...completedToolCalls.map<ChatCompletionToolMessageParam>(
              (completedToolCall) => ({
                role: "tool",
                tool_call_id: completedToolCall.id,
                content: isAfterOmitIndex
                  ? completedToolCall.redactedOutputMessage ??
                    dedent(`
                      The output fo the tool call is:
                      ${completedToolCall.output}
                    `)
                  : "This output has been omitted to reduce the length of the chat.",
              }),
            ),
          ]
        : [];
    },
  );
};
