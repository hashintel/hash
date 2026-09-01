import { useEffect, useState } from "react";

import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

/**
 * Hydrates the panel from the Brunch agent's `GET <endpoint>?id=` door.
 *
 * `endpoint` is null whenever the preview runs against the generic OpenAI
 * route instead: that route keeps no conversation history and answers anything
 * but POST with 405, so asking it is pure noise.
 */
export const useFlueChatHistory = (
  endpoint: string | null,
  conversationId: string,
  principal: string,
): {
  readonly messages: PetrinautAiMessage[] | undefined;
  readonly ready: boolean;
} => {
  const [loaded, setLoaded] = useState<{
    readonly conversationId: string;
    readonly messages: PetrinautAiMessage[];
  }>();

  useEffect(() => {
    if (endpoint === null || conversationId.length === 0) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        // The endpoint is a full Brunch URL in every configured deployment,
        // but resolving it against the page keeps a relative one working.
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("id", conversationId);
        const response = await fetch(url, {
          headers: { [BRUNCH_PRINCIPAL_HEADER]: principal },
        });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as {
          messages?: PetrinautAiMessage[];
        };
        if (!cancelled) {
          setLoaded({
            conversationId,
            messages: body.messages ?? [],
          });
        }
      } catch {
        // Leave `loaded` stale so the panel keeps using its localStorage cache.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId, endpoint, principal]);

  const ready =
    conversationId.length > 0 && loaded?.conversationId === conversationId;
  return {
    messages: ready ? loaded.messages : undefined,
    ready,
  };
};
