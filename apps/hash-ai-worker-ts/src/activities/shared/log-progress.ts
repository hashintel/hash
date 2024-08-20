import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import type { StepProgressLog } from "@local/hash-isomorphic-utils/flows/types";
import { Context } from "@temporalio/activity";
import type { Client as TemporalClient } from "@temporalio/client";
import debounce from "lodash.debounce";

import { logProgressSignal } from "../../shared/signals.js";
import { logger } from "./activity-logger.js";

let temporalClient: TemporalClient | undefined;

const logQueueByRunId: Map<string, StepProgressLog[]> = new Map();

/**
 * Each signal is a history event in Temporal, and we have to be mindful of the 50k history event limit.
 * This function debounces sending a signal so we can batch more logs together in a single signal event.
 */
const sendLogSignal = debounce(
  async ({ workflowId, runId }: { workflowId: string; runId: string }) => {
    temporalClient = temporalClient ?? (await createTemporalClient());

    const handle = temporalClient.workflow.getHandle(workflowId, runId);

    const logs = logQueueByRunId.get(runId);

    if (!logs?.length) {
      return;
    }

    logQueueByRunId.set(runId, []);

    try {
      await handle.signal(logProgressSignal, {
        attempt: Context.current().info.attempt,
        logs,
      });
    } catch (err) {
      /**
       * Likely the workflow doesn't exist because it has been cancelled
       * @todo H-2545: Graceful workflow cancellation
       */
      logger.error(
        `Could not send logs for workflowId ${workflowId}: ${
          (err as Error).message
        }`,
      );
    }
  },
  1_000,
  { maxWait: 2_000 },
);

// eslint-disable-next-line @typescript-eslint/unbound-method -- TODO use this to ensure all logs send before workflow closes
export const flushLogs = sendLogSignal.flush;

export const logProgress = (logs: StepProgressLog[]) => {
  if (logs.length === 0) {
    return;
  }

  const { workflowId, runId } = Context.current().info.workflowExecution;

  const existingLogs = logQueueByRunId.get(runId) ?? [];

  existingLogs.push(...logs);

  logQueueByRunId.set(runId, existingLogs);

  void sendLogSignal({ workflowId, runId });
};
