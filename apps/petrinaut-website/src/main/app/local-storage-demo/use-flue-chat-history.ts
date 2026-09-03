import { useEffect, useState } from "react";

import {
  CLIENT_TOOL_RESULT_SIGNAL,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";
import { readPetrinautDocToolName } from "@hashintel/petrinaut-core";

import type { FlueClient } from "@flue/sdk";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const projectPetrinautMessages = (
  snapshot: Awaited<ReturnType<FlueClient["history"]>>,
): PetrinautAiMessage[] =>
  snapshotToUiMessages(snapshot, {
    clientToolNames: new Set([readPetrinautDocToolName]),
    clientToolResultSignal: CLIENT_TOOL_RESULT_SIGNAL,
  }) as PetrinautAiMessage[];

export const useFlueChatHistory = (
  clientPromise: Promise<FlueClient> | null,
  conversationId: string,
): {
  readonly messages: PetrinautAiMessage[] | undefined;
  readonly ready: boolean;
} => {
  const [loaded, setLoaded] = useState<{
    readonly conversationId: string;
    readonly messages: PetrinautAiMessage[];
  }>();

  useEffect(() => {
    if (clientPromise === null || conversationId.length === 0) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const client = await clientPromise;
        const snapshot = await client.history();
        if (!cancelled) {
          setLoaded({
            conversationId,
            messages: projectPetrinautMessages(snapshot),
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
  }, [clientPromise, conversationId]);

  const ready =
    conversationId.length > 0 && loaded?.conversationId === conversationId;
  return {
    messages: ready ? loaded.messages : undefined,
    ready,
  };
};
