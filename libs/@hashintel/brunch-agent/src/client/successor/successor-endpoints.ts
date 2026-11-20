import {
  brunchHeaders,
  brunchRoutes,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent";

/** One conversation on the durable agents server, as the panel addresses it. */
export interface SuccessorConversation {
  /**
   * The durable agents server's base, resolved against the page's origin;
   * `/chat` extends it.
   */
  readonly endpoint: string;
  /** With the conversation ID, names the conversation's instance. */
  readonly actorKey: string;
  /**
   * The ID the panel keys its chat on. The binding and the conversation
   * header carry it; every path and the chat body's `id` carry the instance.
   */
  readonly conversationId: string;
  /** The conversation's web: the process's web, or a draft's `draftWeb`. */
  readonly web: string;
  /** Carries every request; the global `fetch` when omitted. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Where a conversation's routes are, under its instance ID. */
export interface SuccessorEndpoints {
  readonly instanceId: string;
  readonly chat: string;
  readonly stream: string;
  readonly abort: string;
  readonly messages: string;
  /** The browser-call routes' base: `/:callId/claim` and the rest extend it. */
  readonly browserCalls: string;
  readonly handEdits: string;
}

export const successorEndpoints = async (
  conversation: SuccessorConversation,
): Promise<SuccessorEndpoints> => {
  const instanceId = await flueConversationIdWeb(conversation);
  const base = new URL(
    conversation.endpoint,
    typeof location === "undefined" ? undefined : location.href,
  ).href.replace(/\/+$/u, "");
  const instance = `${base}/chat/${instanceId}`;
  const browserCalls = `${base}/conversations/${instanceId}/${brunchRoutes.browserCalls}`;
  return {
    instanceId,
    chat: `${base}/chat`,
    stream: `${instance}/stream`,
    abort: `${instance}/abort`,
    messages: `${instance}/messages`,
    browserCalls,
    handEdits: `${browserCalls}/${brunchRoutes.handEdits}`,
  };
};

/** The headers every request about the conversation carries. */
export const successorHeaders = ({
  conversationId,
  web,
}: Pick<SuccessorConversation, "conversationId" | "web">): Record<
  string,
  string
> => ({
  [brunchHeaders.conversation]: conversationId,
  [brunchHeaders.web]: web,
});
