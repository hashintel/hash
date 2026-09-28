import { useCallback, useEffect, useRef, useState } from "react";

import { canonicalBrunchFlueAdapter } from "../brunch-flue-adapter";

import type { BrunchFlueAdapter } from "../brunch-flue-adapter";
import type {
  AgentConversationObservation,
  AgentConversationObservationPhase,
  AgentConversationObservationSnapshot,
  FlueClient,
  FlueConversationSettlement,
  FlueConversationState,
} from "@flue/sdk";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const noSettlements: readonly FlueConversationSettlement[] = [];

/**
 * The observed canonical conversation together with the durable-stream offset
 * it was read at.
 */
export type FlueHistorySnapshot = FlueConversationState & {
  readonly offset: string;
};

const projectPetrinautMessages = (
  conversation: FlueConversationState,
  adapter: BrunchFlueAdapter,
): { readonly messages: PetrinautAiMessage[] } | { readonly error: Error } => {
  try {
    // The adapter validates metadata; its client-tool catalog is the one
    // Petrinaut's message type exposes, which narrows the tool parts.
    return { messages: adapter.reopen(conversation) as PetrinautAiMessage[] };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};

export const useFlueChatHistory = (
  clientPromise: Promise<FlueClient> | null,
  conversationId: string,
  adapter: BrunchFlueAdapter = canonicalBrunchFlueAdapter,
): {
  readonly error: Error | undefined;
  readonly latestSettlement: FlueConversationSettlement | undefined;
  readonly messages: PetrinautAiMessage[] | undefined;
  readonly phase: AgentConversationObservationPhase | undefined;
  readonly ready: boolean;
  readonly refresh: () => void;
  readonly settlements: readonly FlueConversationSettlement[];
  readonly snapshot: FlueHistorySnapshot | undefined;
} => {
  const observationRef = useRef<AgentConversationObservation | null>(null);
  const [observed, setObserved] = useState<{
    readonly conversationId: string;
    readonly snapshot: AgentConversationObservationSnapshot;
  }>();

  const refreshRequestedRef = useRef(false);
  const refresh = useCallback(() => {
    const observation = observationRef.current;
    if (observation === null) {
      refreshRequestedRef.current = true;
      return;
    }
    observation.refresh();
  }, []);

  useEffect(() => {
    if (clientPromise === null || conversationId.length === 0) {
      observationRef.current = null;
      refreshRequestedRef.current = false;
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let observation: AgentConversationObservation | undefined;
    const observe = async (): Promise<void> => {
      try {
        const client = await clientPromise;
        if (cancelled) return;
        observation = client.observe({ live: "sse" });
        observationRef.current = observation;
        if (refreshRequestedRef.current) {
          refreshRequestedRef.current = false;
          observation.refresh();
        }
        const publish = (): void => {
          if (!cancelled && observation !== undefined) {
            setObserved({
              conversationId,
              snapshot: observation.getSnapshot(),
            });
          }
        };
        publish();
        unsubscribe = observation.subscribe(publish);
      } catch (caught) {
        if (cancelled) return;
        setObserved({
          conversationId,
          snapshot: {
            conversation: undefined,
            offset: undefined,
            phase: "error",
            error: caught instanceof Error ? caught : new Error(String(caught)),
          },
        });
      }
    };
    void observe();
    return () => {
      cancelled = true;
      unsubscribe?.();
      observation?.close();
      if (observationRef.current === observation) {
        observationRef.current = null;
      }
    };
  }, [clientPromise, conversationId]);

  const observation =
    observed?.conversationId === conversationId ? observed.snapshot : undefined;
  const conversation = observation?.conversation;
  const absent = observation?.phase === "absent";
  const ready = absent || conversation !== undefined;
  const projected =
    conversation === undefined
      ? { messages: absent ? [] : undefined }
      : projectPetrinautMessages(conversation, adapter);
  return {
    error: "error" in projected ? projected.error : observation?.error,
    latestSettlement: conversation?.settlements.at(-1),
    messages: "messages" in projected ? projected.messages : undefined,
    phase: observation?.phase,
    ready,
    refresh,
    settlements: conversation?.settlements ?? noSettlements,
    snapshot:
      conversation === undefined || observation?.offset === undefined
        ? undefined
        : { ...conversation, offset: observation.offset },
  };
};
