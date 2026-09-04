import { useCallback, useEffect, useRef, useState } from "react";

import { snapshotToUiMessages } from "@hashintel/brunch-agent-transport-aisdk";
import { BRUNCH_QUESTION_TOOL_NAME } from "@hashintel/brunch-agent/question-marker";
import { readPetrinautDocToolName } from "@hashintel/petrinaut-core";

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

const projectPetrinautMessages = (
  conversation: FlueConversationState,
): PetrinautAiMessage[] =>
  // The host owns this narrowing: its configured client-tool catalog is the
  // same catalog Petrinaut's message type exposes.
  snapshotToUiMessages(conversation, {
    clientToolNames: new Set([readPetrinautDocToolName]),
    hiddenToolNames: new Set([BRUNCH_QUESTION_TOOL_NAME]),
  }) as PetrinautAiMessage[];

export const useFlueChatHistory = (
  clientPromise: Promise<FlueClient> | null,
  conversationId: string,
): {
  readonly error: Error | undefined;
  readonly latestSettlement: FlueConversationSettlement | undefined;
  readonly messages: PetrinautAiMessage[] | undefined;
  readonly phase: AgentConversationObservationPhase | undefined;
  readonly ready: boolean;
  readonly refresh: () => void;
  readonly settlements: readonly FlueConversationSettlement[];
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

  const snapshot =
    observed?.conversationId === conversationId ? observed.snapshot : undefined;
  const conversation = snapshot?.conversation;
  const absent = snapshot?.phase === "absent";
  const ready = absent || conversation !== undefined;
  return {
    error: snapshot?.error,
    latestSettlement: conversation?.settlements.at(-1),
    messages:
      conversation === undefined
        ? absent
          ? []
          : undefined
        : projectPetrinautMessages(conversation),
    phase: snapshot?.phase,
    ready,
    refresh,
    settlements: conversation?.settlements ?? noSettlements,
  };
};
