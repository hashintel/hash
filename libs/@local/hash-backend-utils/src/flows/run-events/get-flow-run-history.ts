import { temporalNamespace } from "../../temporal.js";

import type { Client as TemporalClient } from "@temporalio/client";
import type proto from "@temporalio/proto";

/**
 * The whole history of one run of a flow's workflow. Read by run id, so a reset while it's read can't mix the events
 * of two runs.
 */
export const readFlowRunHistoryEvents = async ({
  temporalClient,
  workflowId,
  runId,
}: {
  temporalClient: TemporalClient;
  workflowId: string;
  runId: string;
}): Promise<proto.temporal.api.history.v1.IHistoryEvent[]> => {
  /**
   * we need to paginate manually because the event history size can be larger than the 4MB gRPC message limit,
   * which is not configurable in Temporal.
   * @see https://github.com/temporalio/sdk-typescript/issues/1469
   */
  let nextPageToken: Uint8Array | undefined;
  const history: proto.temporal.api.history.v1.IHistoryEvent[] = [];
  do {
    const response =
      await temporalClient.workflowService.getWorkflowExecutionHistory({
        execution: { workflowId, runId },
        maximumPageSize: 100,
        namespace: temporalNamespace,
        nextPageToken,
      });

    nextPageToken = response.nextPageToken;

    history.push(...(response.history?.events ?? []));

    /**
     * nextPageToken should be null if there are no more pages, but it's actually an empty Array
     */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } while (nextPageToken?.length);

  return history;
};
