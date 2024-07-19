import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import type {
  ExternalInputRequestSignal,
  ExternalInputResponseSignal,
} from "@local/hash-isomorphic-utils/flows/types";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { Context } from "@temporalio/activity";
import type { Client as TemporalClient } from "@temporalio/client";

import { getExternalInputResponseQuery } from "../../shared/queries.js";
import { externalInputRequestSignal } from "../../shared/signals.js";

import { logger } from "./activity-logger.js";

let temporalClient: TemporalClient | undefined;

export const requestExternalInput = async <
  Request extends ExternalInputRequestSignal,
>(
  request: Request,
): Promise<ExternalInputResponseSignal<Request["type"]>> => {
  temporalClient = temporalClient ?? (await createTemporalClient());

  const { workflowId } = Context.current().info.workflowExecution;

  const handle = temporalClient.workflow.getHandle(workflowId);

  await handle.signal(externalInputRequestSignal, request);

  logger.info(
    `Sent external input request signal for ${request.type}, with id ${request.requestId}`,
  );

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    /**
     * This will continue until one of:
     * 1. A response is received
     * 2. The workflow is cancelled
     * 3. The workflow crashes
     * 4. The activity that called this crashes
     * 5. The activity that called this times out (@see https://docs.temporal.io/activities#schedule-to-start-timeout onwards)
     * 6. The workflow times out (workflow execution timeout, default: infinite).
     *
     * Note that if the workflow or activity crashes and retried, the history will be replayed.
     * If workflows/activities can save progress to date and resume from that point, we may hit this again
     * – it depends on how precisely progress can be checkpointed and resumed from.
     */
    const response = await handle.query(getExternalInputResponseQuery, {
      requestId: request.requestId,
    });

    if (response) {
      if (response.type === request.type) {
        return response as ExternalInputResponseSignal<Request["type"]>;
      }

      throw new Error(
        `External input request with id ${request.requestId} received response of type ${response.type}, expected ${request.type}`,
      );
    }

    await sleep(10_000);
  }
};
