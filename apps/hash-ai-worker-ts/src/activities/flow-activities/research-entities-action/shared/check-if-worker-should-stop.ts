import { parseHistoryItemPayload } from "@local/hash-backend-utils/temporal/parse-history-item-payload";
import type {
  FlowSignalType,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";
import { Context } from "@temporalio/activity";

import type { FlowSignal } from "../../../../shared/signals.js";
import {
  getTemporalClient,
  isActivityCancelled,
} from "../../../shared/get-flow-context.js";

/**
 * Check if a HASH worker should stop what it is doing and return early.
 *
 * This will be in one of two cases:
 * 1. The Temporal activity as a whole has been cancelled, which might be due to workflow termination, cancellation, or
 * reset.
 * 2. The HASH worker which created this worker has sent a signal to stop what it is doing, because no further work is
 * required. This is done triggered the 'stopTasks' tool call that agents may make.
 */
export const checkIfWorkerShouldStop = async (
  identifiers: WorkerIdentifiers,
): Promise<
  | { shouldStop: false }
  | {
      explanation: string;
      shouldStop: true;
      stopType: "activityCancelled" | "stopSignalReceived";
    }
> => {
  /**
   * The overall activity has been cancelled.
   */
  if (isActivityCancelled()) {
    return {
      explanation: "The activity was cancelled.",
      shouldStop: true,
      stopType: "activityCancelled",
    };
  }

  const { workflowId } = Context.current().info.workflowExecution;

  const temporalClient = await getTemporalClient();
  const handle = temporalClient.workflow.getHandle(workflowId);

  const { events } = await handle.fetchHistory();

  /**
   * Check the Temporal history for a 'stopWorker' signal matching this worker.
   */
  for (const event of events ?? []) {
    if (
      event.workflowExecutionSignaledEventAttributes?.signalName ===
      ("stopWorker" satisfies FlowSignalType)
    ) {
      const signalData = event.workflowExecutionSignaledEventAttributes.input;

      const inputData = parseHistoryItemPayload(signalData)?.[0] as
        | FlowSignal
        | undefined;

      if (
        inputData &&
        typeof inputData === "object" &&
        "toolCallId" in inputData &&
        "explanation" in inputData
      ) {
        if (identifiers.toolCallId === inputData.toolCallId) {
          /**
           * We have found a signal stopping this worker.
           */
          return {
            shouldStop: true,
            stopType: "stopSignalReceived",
            explanation: inputData.explanation,
          };
        }
      }
    }
  }

  return {
    shouldStop: false,
  };
};
