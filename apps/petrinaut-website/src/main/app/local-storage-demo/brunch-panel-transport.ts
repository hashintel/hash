import type { PetrinautAiChatTransport } from "@hashintel/petrinaut/ui";

/**
 * Pin Petrinaut's stock transport to one stable conversation id so reload,
 * client-tool follow-up, and the voice dock share Flue's conversation.
 */
export const createBrunchPanelTransport = (
  transport: PetrinautAiChatTransport,
  conversationId: string,
): PetrinautAiChatTransport => ({
  reconnectToStream: (options) =>
    transport.reconnectToStream({ ...options, chatId: conversationId }),
  sendMessages: (options) =>
    transport.sendMessages({ ...options, chatId: conversationId }),
});
