import { useEffect, useRef, useState } from "react";

import type { AssistantChatApi } from "./chat-api";
import type { AiExperimentState } from "./chat-view/experiment-card";
import type { PetrinautExperimentRequest } from "@hashintel/petrinaut-core";

/**
 * The experiments the chat runs for its `createExperiment` calls: each run's
 * state for its card, keyed by tool call, and ways to cancel them. Unmounting
 * cancels the runs still going.
 */
export const useExperimentRuns = (
  experiments: AssistantChatApi["experiments"],
) => {
  const [states, setStates] = useState<Record<string, AiExperimentState>>({});
  const controllersRef = useRef(new Map<string, AbortController>());

  const update = (toolCallId: string, change: Partial<AiExperimentState>) =>
    setStates((current) => ({
      ...current,
      [toolCallId]: { active: false, ...current[toolCallId], ...change },
    }));

  const cancelAll = () => {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
  };

  useEffect(() => {
    const controllers = controllersRef.current;

    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
    };
  }, []);

  return {
    states,
    run: (toolCallId: string, request: PetrinautExperimentRequest) => {
      const controller = new AbortController();
      controllersRef.current.set(toolCallId, controller);
      update(toolCallId, { active: true });

      return experiments
        .run(request, {
          signal: controller.signal,
          onProgress: (progress) => update(toolCallId, { progress }),
        })
        .then(
          (result) => {
            update(toolCallId, { active: false, result });
            return result;
          },
          (error: unknown) => {
            update(toolCallId, { active: false });
            throw error;
          },
        )
        .finally(() => controllersRef.current.delete(toolCallId));
    },
    cancel: (toolCallId: string) =>
      controllersRef.current.get(toolCallId)?.abort(),
    cancelAll,
    /** Cancels every run and forgets their states, for a cleared conversation. */
    clear: () => {
      cancelAll();
      setStates({});
    },
  };
};
