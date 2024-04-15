import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { Context } from "@temporalio/activity";
import debounce from "lodash.debounce";

import { logProgressSignal } from "../../shared/signals";
import { StepProgressLog } from "@local/hash-isomorphic-utils/flows/types";

const temporalClient = await createTemporalClient();

const logQueueByRunId: Map<string, StepProgressLog[]> = new Map();

/**
 * Each signal is a history event in Temporal, and we have to be mindful of the 50k history event limit.
 * This function debounces sending a signal so we can batch more logs together in a single signal event.
 */
const sendLogSignal = debounce(
  async (workflowId: string) => {
    const handle = temporalClient.workflow.getHandle(workflowId);

    const logs = logQueueByRunId.get(workflowId);
    if (!logs) {
      throw new Error(
        `sendLogSignal was called for workflowId ${workflowId}, but no logs were found in the queue`,
      );
    }

    await handle.signal(logProgressSignal, {
      attempt: Context.current().info.attempt,
      logs,
    });

    logQueueByRunId.delete(workflowId);
  },
  1_000,
  { maxWait: 2_000 },
);

// eslint-disable-next-line @typescript-eslint/unbound-method
export const flushLogs = sendLogSignal.flush;

export const logProgress = (logs: StepProgressLog[]) => {
  if (logs.length === 0) {
    return;
  }

  const workflowId = Context.current().info.workflowExecution.workflowId;

  const existingLogs = logQueueByRunId.get(workflowId) ?? [];

  existingLogs.push(...logs);

  logQueueByRunId.set(workflowId, existingLogs);

  void sendLogSignal(workflowId);
};
