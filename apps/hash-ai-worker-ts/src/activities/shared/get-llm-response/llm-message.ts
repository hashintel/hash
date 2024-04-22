import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam as OpenAiMessage,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
} from "openai/resources";

import type { AnthropicMessage } from "./anthropic-client";

type MessageTextContent = {
  type: "text";
  text: string;
};

type MessageToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: object;
};

type LlmAssistantMessage = {
  role: "assistant";
  content: (MessageTextContent | MessageToolUseContent)[];
};

type MessageToolResultContent = {
  type: "tool_result";
  tool_use_id: string;
  content?: string;
  is_error?: true;
};

type LlmUserMessage = {
  role: "user";
  content: (MessageTextContent | MessageToolResultContent)[];
};

type LlmMessage = LlmAssistantMessage | LlmUserMessage;

export const mapLlmMessageToAnthropicMessage = (params: {
  message: LlmMessage;
}): AnthropicMessage => ({
  role: params.message.role,
  content: params.message.content,
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
                  `Anthropic assistant message contains a tool result: ${JSON.stringify(content)}`,
                );
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
        : anthropicMessage.content.map((content) => {
            if (content.type === "image") {
              throw new Error("Image content not supported");
            } else if (content.type === "tool_use") {
              throw new Error("Tool use content not supported");
            }

            return content;
          }),
  };
};

export const mapLlmMessageToOpenAiMessages = (params: {
  message: LlmMessage;
}): OpenAiMessage[] => {
  const { message } = params;

  if (message.role === "assistant") {
    const textContents = message.content.filter(
      (content): content is MessageTextContent => content.type === "text",
    );

    const toolCalls = message.content.filter(
      (content): content is MessageToolUseContent =>
        content.type === "tool_use",
    );

    const assistantMessage: ChatCompletionAssistantMessageParam = {
      role: message.role,
      content: textContents.map(({ text }) => text).join("\n"),
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
      } satisfies ChatCompletionUserMessageParam;
    }

    return {
      role: "tool",
      tool_call_id: content.tool_use_id,
      content: content.content ?? null,
    } satisfies ChatCompletionToolMessageParam;
  });
};

export const mapOpenAiMessagesToLlmMessages = (params: {
  messages: OpenAiMessage[];
}): LlmMessage[] => {
  const { messages } = params;

  return messages.reduce<LlmMessage[]>(
    (previousLlmMessages, currentMessage) => {
      if (currentMessage.role === "assistant") {
        const toolCalls = currentMessage.tool_calls?.map<MessageToolUseContent>(
          (toolCall) => ({
            type: "tool_use" as const,
            id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments) as object,
          }),
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
        const latestUserMessageIndex = previousLlmMessages.reduceRight(
          (resultIndex, previousLlmMessage, currentIndex) =>
            resultIndex < 0 && previousLlmMessage.role === "user"
              ? currentIndex
              : resultIndex,
          -1,
        );

        if (latestUserMessageIndex < 0) {
          throw new Error("No user message found before tool message");
        }

        const latestUserMessage = previousLlmMessages[
          latestUserMessageIndex
        ] as LlmUserMessage;

        latestUserMessage.content.push({
          type: "tool_result" as const,
          tool_use_id: currentMessage.tool_call_id,
          content: currentMessage.content ?? undefined,
        });

        return previousLlmMessages;
      }

      return previousLlmMessages;
    },
    [] as LlmMessage[],
  );
};
