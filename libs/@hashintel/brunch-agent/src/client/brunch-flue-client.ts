import { createFlueClient, type FlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent";

import type { FlueChatTransportOptions } from "@local/flue-aisdk-transport";

/** The `fetch` a host gives Brunch to carry its requests. */
export type BrunchFetch = typeof globalThis.fetch;

/** How the host reaches Brunch's server. */
export interface BrunchConnection {
  /**
   * With a conversation ID, names the conversation's Flue instance, and is
   * sent as its ownership header.
   */
  readonly ownerKey: string;
  /** The chat mount, resolved against the page's origin; instance paths extend it. */
  readonly chatEndpoint: string;
  /**
   * Carries every request Brunch makes: Flue's, the browser calls' and the
   * live-tool stream's. The global `fetch` when omitted. Pass a stable
   * function (module-level or memoized): a new identity recreates the
   * conversation's client and tracker.
   */
  readonly fetch?: BrunchFetch;
}

/** The Flue client for one conversation's instance. */
export const createBrunchFlueClient = async (
  connection: BrunchConnection,
  conversationId: string,
): Promise<FlueClient> => {
  const identity = { conversationId, ownerKey: connection.ownerKey };
  const instanceId = await flueConversationIdWeb(identity);
  const mountUrl = new URL(connection.chatEndpoint, window.location.origin);
  mountUrl.pathname = `${mountUrl.pathname.replace(/\/+$/u, "")}/${instanceId}`;
  return createFlueClient({
    url: mountUrl.href,
    headers: () => agentOwnershipHeaders(identity),
    fetch: connection.fetch,
  });
};

/** The transport's live-tool stream options for one conversation. */
export const brunchLiveToolStream = (
  connection: Pick<BrunchConnection, "ownerKey" | "fetch">,
  conversationId: string,
): NonNullable<FlueChatTransportOptions["liveToolStream"]> => ({
  headers: agentOwnershipHeaders({
    conversationId,
    ownerKey: connection.ownerKey,
  }),
  fetch: connection.fetch,
});
