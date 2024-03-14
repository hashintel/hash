import type { OpenAICompleteChatData } from "@blockprotocol/service";

type OpenAiChatRole = "system" | "assistant" | "user";

export type OpenAIChatMessage<R extends OpenAiChatRole = OpenAiChatRole> =
  OpenAICompleteChatData["messages"][number] & { role: R };

export type IncompleteOpenAiAssistantMessage = Omit<
  OpenAIChatMessage<"assistant">,
  "content"
>;
