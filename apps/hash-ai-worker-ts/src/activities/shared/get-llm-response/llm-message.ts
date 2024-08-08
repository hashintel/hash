import type {
  MessageParam as AnthropicMessage,
  ToolResultBlockParam as AnthropicToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import type { OpenAI } from "openai";

export type LlmMessageTextContent = {
  type: "text";
  text: string;
};

export type LlmMessageToolUseContent<ToolName = string> = {
  type: "tool_use";
  id: string;
  name: ToolName;
  input: object;
};

export type LlmAssistantMessage<ToolName = string> = {
  role: "assistant";
  content: (LlmMessageTextContent | LlmMessageToolUseContent<ToolName>)[];
};

export type LlmMessageToolResultContent = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: true;
};

export type LlmUserMessage = {
  role: "user";
  content: (LlmMessageTextContent | LlmMessageToolResultContent)[];
};

export type LlmMessage = LlmAssistantMessage | LlmUserMessage;

type LlmMessageContent = (
  | LlmMessageTextContent
  | LlmMessageToolUseContent
  | LlmMessageToolResultContent
)[];

export const mapLlmMessageToAnthropicMessage = (params: {
  message: LlmMessage;
}): AnthropicMessage => ({
  role: params.message.role,
  content: params.message.content.map((content) =>
    content.type === "tool_result"
      ? ({
          ...content,
          content: [{ type: "text", text: content.content }],
        } satisfies AnthropicToolResultBlockParam)
      : content,
  ),
});

export const mapAnthropicMessageToLlmMessage = (params: {
  anthropicMessage: AnthropicMessage;
}): LlmMessage => {
  const { anthropicMessage } = params;

  if (anthropicMessage.role === "assistant") {
    return {
      role: "assistant",
      content:
        typeof anthropicMessage.content === "string"
          ? [
              {
                type: "text" as const,
                text: anthropicMessage.content,
              },
            ]
          : anthropicMessage.content.map((content) => {
              if (content.type === "image") {
                throw new Error("Image content not supported");
              } else if (content.type === "tool_result") {
                throw new Error(
                  `Anthropic assistant message contains a tool result: ${JSON.stringify(
                    content,
                  )}`,
                );
              } else if (content.type === "tool_use") {
                return {
                  type: "tool_use" as const,
                  id: content.id,
                  name: content.name,
                  input: content.input as object,
                } satisfies LlmMessageToolUseContent;
              }

              return content;
            }),
    };
  }

  return {
    role: "user",
    content:
      typeof anthropicMessage.content === "string"
        ? [
            {
              type: "text" as const,
              text: anthropicMessage.content,
            },
          ]
        : anthropicMessage.content.map((block) => {
            if (block.type === "image") {
              throw new Error("Image content not supported");
            } else if (block.type === "tool_use") {
              throw new Error("Tool use content not supported");
            } else if (block.type === "tool_result") {
              /**
               * Currently images are not supported in LLM messages,
               * so we filter them out from the content.
               *
               * @todo: add support for images in LLM messages, including
               * the content in the tool result.
               */
              const textBlocks = block.content?.map((content) => {
                if (content.type === "text") {
                  return content;
                }

                throw new Error(
                  `Unexpected content type in tool result: ${content.type}`,
                );
              });

              return {
                type: "tool_result" as const,
                tool_use_id: block.tool_use_id,
                content: textBlocks?.join("\n") ?? "",
              } satisfies LlmMessageToolResultContent;
            }

            return block;
          }),
  };
};

export const getToolCallsFromLlmAssistantMessage = <
  ToolName extends string = string,
>(params: {
  message: LlmAssistantMessage<ToolName>;
}): LlmMessageToolUseContent<ToolName>[] =>
  params.message.content.filter(
    (content): content is LlmMessageToolUseContent<ToolName> =>
      content.type === "tool_use",
  );

export const getTextContentFromLlmMessage = (params: {
  message: LlmMessage;
}): string | undefined => {
  const { message } = params;

  const textContents = (message.content as LlmMessageContent).filter(
    (content): content is LlmMessageTextContent => content.type === "text",
  );

  if (textContents.length === 0) {
    return undefined;
  }

  return textContents.map(({ text }) => text).join("\n");
};

export const mapLlmMessageToOpenAiMessages = (params: {
  message: LlmMessage;
}): OpenAI.ChatCompletionMessageParam[] => {
  const { message } = params;

  if (message.role === "assistant") {
    const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

    const assistantMessage: OpenAI.ChatCompletionAssistantMessageParam = {
      role: message.role,
      content: getTextContentFromLlmMessage({ message }) ?? null,
      tool_calls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.input),
        },
      })),
    };

    return [assistantMessage];
  }

  return message.content.map((content) => {
    if (content.type === "text") {
      return {
        role: "user",
        content: content.text,
      } satisfies OpenAI.ChatCompletionUserMessageParam;
    }

    return {
      role: "tool",
      tool_call_id: content.tool_use_id,
      content: content.content,
    } satisfies OpenAI.ChatCompletionToolMessageParam;
  });
};

const sanitizeToolCallName = (toolName: string): string => {
  const allowedPattern = /[a-zA-Z0-9_-]/g;

  const filteredString = toolName.match(allowedPattern)?.join("") ?? "";

  return filteredString;
};

export const mapOpenAiMessagesToLlmMessages = (params: {
  messages: OpenAI.ChatCompletionMessageParam[];
}): LlmMessage[] => {
  const { messages } = params;

  return messages.reduce<LlmMessage[]>(
    (previousLlmMessages, currentMessage) => {
      if (currentMessage.role === "assistant") {
        const toolCalls =
          currentMessage.tool_calls?.map<LlmMessageToolUseContent>(
            (toolCall) => {
              const rawInput = toolCall.function.arguments;
              let jsonInput: object;
              try {
                jsonInput = JSON.parse(rawInput) as object;
              } catch {
                // model's input could not be parsed, this is likely a retry of a failed tool call
                jsonInput = { unparseableInput: rawInput };
              }

              return {
                type: "tool_use" as const,
                id: toolCall.id,
                name: sanitizeToolCallName(toolCall.function.name),
                input: jsonInput,
              };
            },
          );

        return [
          ...previousLlmMessages,
          {
            role: "assistant",
            content: [
              ...(currentMessage.content &&
              typeof currentMessage.content === "string"
                ? [
                    {
                      type: "text" as const,
                      text: currentMessage.content,
                    },
                  ]
                : []),
              ...(toolCalls ?? []),
            ],
          } satisfies LlmAssistantMessage,
        ];
      } else if (currentMessage.role === "user") {
        return [
          ...previousLlmMessages,
          {
            role: "user",
            content: currentMessage.content
              ? typeof currentMessage.content === "string"
                ? [
                    {
                      type: "text" as const,
                      text: currentMessage.content,
                    },
                  ]
                : currentMessage.content.map<LlmUserMessage["content"][number]>(
                    (content) => {
                      if (content.type === "text") {
                        return {
                          type: "text" as const,
                          text: content.text,
                        };
                      }
                      throw new Error(
                        `Unexpected content type: ${content.type}`,
                      );
                    },
                  )
              : [],
          } satisfies LlmUserMessage,
        ];
      } else if (currentMessage.role === "tool") {
        const textualContent =
          typeof currentMessage.content === "string"
            ? currentMessage.content
            : currentMessage.content
                .map((contentPart) => contentPart.text)
                .join("\n");

        const toolResultContent: LlmMessageToolResultContent = {
          type: "tool_result",
          tool_use_id: currentMessage.tool_call_id,
          content: textualContent,
        };

        const previousLlmMessage = previousLlmMessages.slice(-1)[0];

        if (!previousLlmMessage || previousLlmMessage.role !== "user") {
          /**
           * If there is no previous message, or the previous message
           * is not a `user` message, then create a new `user` message
           * with the tool result content.
           */
          return [
            ...previousLlmMessages,
            {
              role: "user",
              content: [toolResultContent],
            } as LlmUserMessage,
          ];
        }

        /**
         * If the previous message is a `user` message, then append
         * the tool result content to the previous message to avoid
         * consecutive `user` messages.
         */
        previousLlmMessage.content.push(toolResultContent);

        return previousLlmMessages;
      }

      return previousLlmMessages;
    },
    [] as LlmMessage[],
  );
};
