import { useCallback, useEffect, useRef, useState } from "react";

import { snapshotToUiMessages } from "@hashintel/brunch-agent-transport-aisdk";

import { brunchClientToolNames } from "./brunch-client-tools";

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
 * it was read at. Fixture consumers use the offset to tell a settled bundle
 * from a stale one; they never interpret it.
 */
export type FlueHistorySnapshot = FlueConversationState & {
  readonly offset: string;
};

const projectPetrinautMessages = (
  conversation: FlueConversationState,
  clientToolNames: ReadonlySet<string>,
): PetrinautAiMessage[] =>
  // The host owns this narrowing: its configured client-tool catalog is the
  // same catalog Petrinaut's message type exposes.
  snapshotToUiMessages(conversation, {
    clientToolNames,
  }) as PetrinautAiMessage[];

export const useFlueChatHistory = (
  clientPromise: Promise<FlueClient> | null,
  conversationId: string,
  clientToolNames: ReadonlySet<string> = brunchClientToolNames,
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

  const refresh = useCallback(() => observationRef.current?.refresh(), []);

  useEffect(() => {
    if (clientPromise === null || conversationId.length === 0) {
      observationRef.current = null;
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
  return {
    error: observation?.error,
    latestSettlement: conversation?.settlements.at(-1),
    messages:
      conversation === undefined
        ? absent
          ? []
          : undefined
        : projectPetrinautMessages(conversation, clientToolNames),
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
