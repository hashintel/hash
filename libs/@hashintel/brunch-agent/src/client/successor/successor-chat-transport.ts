import { type ChatTransport, DefaultChatTransport, type UIMessage } from "ai";

import { successorFetch } from "./successor-chat-transport/successor-fetch";
import {
  type SuccessorConversation,
  type SuccessorEndpoints,
  successorEndpoints,
  successorHeaders,
} from "./successor-endpoints";

import type { BrowserContext } from "@hashintel/brunch-agent";

export { SuccessorChatRefusal } from "./successor-chat-transport/successor-chat-refusal";

/**
 * AI SDK's stock transport, speaking to one conversation on the durable
 * agents server. Each chat request carries only the last message, which must
 * be the user's, and the document binding; every path and the body's `id`
 * name the conversation's instance, which AI SDK's chat ID does not.
 *
 * A refusal rejects with `SuccessorChatRefusal`, and a message whose
 * admission could not be confirmed with an `ambiguous`
 * `FlueChatAdmissionError`; a 503 is retried after its `Retry-After`.
 * Reconnecting answers `null` when nothing is running.
 */
export const createSuccessorChatTransport = <Message extends UIMessage>({
  conversation,
  binding,
}: {
  readonly conversation: SuccessorConversation;
  /**
   * The panel's document binding, sent as it is with every message: the
   * server binds a new conversation to it, and the panel's browser calls
   * and hand-edit reports must name the same one.
   */
  readonly binding: BrowserContext["binding"];
}): ChatTransport<Message> => {
  let endpoints: Promise<SuccessorEndpoints> | undefined;
  const resolveEndpoints = () => {
    endpoints ??= successorEndpoints(conversation);
    return endpoints;
  };
  const withConversationHeaders = (headers: HeadersInit | undefined) => {
    const merged = new Headers(headers);
    for (const [name, value] of Object.entries(
      successorHeaders(conversation),
    )) {
      merged.set(name, value);
    }
    return merged;
  };
  return new DefaultChatTransport<Message>({
    credentials: "include",
    fetch: successorFetch(conversation.fetch),
    prepareSendMessagesRequest: async ({
      messages,
      trigger,
      messageId,
      headers,
    }) => {
      const { chat, instanceId } = await resolveEndpoints();
      return {
        api: chat,
        headers: withConversationHeaders(headers),
        credentials: "include",
        body: {
          id: instanceId,
          messages: messages.slice(-1),
          trigger,
          ...(messageId === undefined ? {} : { messageId }),
          binding,
        },
      };
    },
    prepareReconnectToStreamRequest: async ({ headers }) => ({
      api: (await resolveEndpoints()).stream,
      headers: withConversationHeaders(headers),
      credentials: "include",
    }),
  });
};
