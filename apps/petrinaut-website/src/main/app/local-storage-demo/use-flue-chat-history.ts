import { useEffect, useState } from "react";

import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

export const useFlueChatHistory = (
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
    if (conversationId.length === 0) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/chat?id=${encodeURIComponent(conversationId)}`,
          { headers: { [BRUNCH_PRINCIPAL_HEADER]: principal } },
        );
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
  }, [conversationId, principal]);

  const ready =
    conversationId.length > 0 && loaded?.conversationId === conversationId;
  return {
    messages: ready ? loaded.messages : undefined,
    ready,
  };
};
