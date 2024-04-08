import dedent from "dedent";
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  FunctionDefinition,
} from "openai/resources";

import type { CompletedToolCall, ToolDefinition } from "./types";

export const parseOpenAiFunctionArguments = <
  T extends Record<string, object>,
>(params: {
  stringifiedArguments: string;
}) => {
  const { stringifiedArguments } = params;

  return JSON.parse(stringifiedArguments) as T;
};

export const mapPreviousCallsToChatCompletionMessages = (params: {
  previousCalls: {
    completedToolCalls: CompletedToolCall<string>[];
  }[];
}): ChatCompletionMessageParam[] =>
  params.previousCalls.flatMap<ChatCompletionMessageParam>(
    ({ completedToolCalls }) =>
      completedToolCalls.length > 0
        ? [
            {
              role: "assistant",
              content: null,
              tool_calls: completedToolCalls.map(
                ({ openAiToolCall }) => openAiToolCall,
              ),
            } satisfies ChatCompletionMessage,
            ...completedToolCalls.map<ChatCompletionToolMessageParam>(
              (completedToolCall) => ({
                role: "tool",
                tool_call_id: completedToolCall.openAiToolCall.id,
                content: dedent(`
                  The output fo the tool call is:
                  ${completedToolCall.output}
                `),
              }),
            ),
          ]
        : [],
  );

export const mapToolDefinitionToOpenAiTool = ({
  toolId,
  description,
  inputSchema,
}: ToolDefinition<string>): ChatCompletionTool =>
  ({
    function: {
      name: toolId,
      description,
      parameters: inputSchema as FunctionDefinition["parameters"],
    },
    type: "function",
  }) as const;
