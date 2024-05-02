import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import type {
  ExternalInputRequestSignal,
  ExternalInputResponseSignal,
} from "@local/hash-isomorphic-utils/flows/types";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { Context } from "@temporalio/activity";

import { getExternalInputResponseQuery } from "../../shared/queries";
import { externalInputRequestSignal } from "../../shared/signals";
import { logger } from "./activity-logger";

const temporalClient = await createTemporalClient();

export const requestExternalInput = async <
  Request extends ExternalInputRequestSignal,
>(
  request: Request,
): Promise<ExternalInputResponseSignal<Request["type"]>> => {
  const workflowId = Context.current().info.workflowExecution.workflowId;

  const handle = temporalClient.workflow.getHandle(workflowId);

  await handle.signal(externalInputRequestSignal, request);

  logger.info(
    `Sent external input request signal for ${request.type}, with id ${request.requestId}`,
  );

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
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
