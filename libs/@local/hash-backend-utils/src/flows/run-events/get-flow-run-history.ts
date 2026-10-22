import { temporalNamespace } from "../../temporal.js";

import type {
  Client as TemporalClient,
  WorkflowExecutionDescription,
} from "@temporalio/client";
import type proto from "@temporalio/proto";

/**
 * The current run of a flow's workflow, and its whole history. The history is read by run id, so a reset while it's
 * read can't mix the events of two runs.
 */
export const getFlowRunHistory = async ({
  temporalClient,
  workflowId,
}: {
  temporalClient: TemporalClient;
  workflowId: string;
}): Promise<{
  workflow: WorkflowExecutionDescription;
  history: proto.temporal.api.history.v1.IHistoryEvent[];
}> => {
  const workflow = await temporalClient.workflow
    .getHandle(workflowId)
    .describe();

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
        execution: {
          workflowId,
          runId: workflow.runId,
        },
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

  return { workflow, history };
};
